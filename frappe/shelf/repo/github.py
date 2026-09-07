"""GitHub access for Shelf repositories: URL parsing, raw file fetch, and the connection check.

Public repositories are read without credentials. Private repositories need a personal
access token (classic ``repo`` scope, or a fine-grained token with Contents: read).
The token is never sent on the first probe, so a public repo is reported as public even
when a token was pasted, and the user can be told it is not needed.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

import requests

from frappe.shelf.repo.spec import INDEX_FILE, SHELF_MANIFEST, ShelfFormatError, validate_shelf_manifest

RAW_HOST = "https://raw.githubusercontent.com"
API_HOST = "https://api.github.com"
DEFAULT_BRANCH = "main"
TIMEOUT = (5, 20)
MAX_FILE_BYTES = 10 * 1024 * 1024

ACCESS_PUBLIC = "Public"
ACCESS_PRIVATE = "Private"
ACCESS_UNKNOWN = "Unknown"

# Outcome codes returned by check_access; the UI maps these to messages and actions.
CODE_PUBLIC_OK = "public_ok"
CODE_PRIVATE_OK = "private_ok"
CODE_NEEDS_TOKEN = "needs_token"
CODE_INVALID_TOKEN = "invalid_token"
CODE_NOT_FOUND = "not_found"
CODE_BRANCH_NOT_FOUND = "branch_not_found"
CODE_NOT_A_SHELF = "not_a_shelf"
CODE_NETWORK_ERROR = "network_error"

_URL_PATTERN = re.compile(
	r"^(?:https?://)?(?:www\.)?github\.com/(?P<owner>[A-Za-z0-9_.-]+)/(?P<repo>[A-Za-z0-9_.-]+?)"
	r"(?:\.git)?(?:/tree/(?P<branch>[^/\s]+))?/?$"
)
_SHORT_PATTERN = re.compile(r"^(?P<owner>[A-Za-z0-9_.-]+)/(?P<repo>[A-Za-z0-9_.-]+?)(?:\.git)?$")


class GitHubError(Exception):
	"""Raised when a file cannot be fetched from GitHub."""

	def __init__(self, message: str, status: int | None = None) -> None:
		super().__init__(message)
		self.status = status


@dataclass(frozen=True)
class RepoRef:
	"""A GitHub repository plus the branch (or tag / commit) to read from."""

	owner: str
	repo: str
	branch: str = DEFAULT_BRANCH

	@property
	def slug(self) -> str:
		return f"{self.owner}/{self.repo}"

	@property
	def html_url(self) -> str:
		return f"https://github.com/{self.owner}/{self.repo}"

	def raw_url(self, path: str) -> str:
		return f"{RAW_HOST}/{self.owner}/{self.repo}/{self.branch}/{path.lstrip('/')}"

	def file_html_url(self, path: str) -> str:
		return f"{self.html_url}/blob/{self.branch}/{path.lstrip('/')}"


@dataclass
class AccessResult:
	"""What the connection check found out."""

	ok: bool
	code: str
	access: str
	message: str
	default_branch: str | None = None
	shelf: dict[str, Any] | None = None
	token_required: bool = False
	token_used: bool = False

	def as_dict(self) -> dict[str, Any]:
		return {
			"ok": self.ok,
			"code": self.code,
			"access": self.access,
			"message": self.message,
			"default_branch": self.default_branch,
			"shelf": self.shelf,
			"token_required": self.token_required,
			"token_used": self.token_used,
		}


@dataclass
class GitHubClient:
	"""Minimal HTTP client for one repository ref."""

	ref: RepoRef
	token: str | None = None
	session: requests.Session = field(default_factory=requests.Session)

	def _headers(self, with_token: bool) -> dict[str, str]:
		headers = {"User-Agent": "frappe-shelf", "Accept": "application/vnd.github.raw"}
		if with_token and self.token:
			headers["Authorization"] = f"token {self.token}"
		return headers

	def get_raw(self, path: str, with_token: bool = True) -> requests.Response:
		"""GET a file through raw.githubusercontent.com (works for public and, with a token, private repos)."""
		try:
			return self.session.get(
				self.ref.raw_url(path), headers=self._headers(with_token), timeout=TIMEOUT
			)
		except requests.RequestException as exc:
			raise GitHubError(f"Could not reach GitHub: {exc}") from exc

	def get_file(self, path: str) -> bytes:
		"""Fetch one file's bytes or raise :class:`GitHubError` with the HTTP status."""
		response = self.get_raw(path)
		if response.status_code == 200:
			if len(response.content) > MAX_FILE_BYTES:
				raise GitHubError(f"{path} is larger than the {MAX_FILE_BYTES // (1024 * 1024)} MB limit.")
			return response.content
		if response.status_code == 404:
			raise GitHubError(f"{path} was not found on {self.ref.slug}@{self.ref.branch}.", 404)
		if response.status_code in (401, 403):
			raise GitHubError("GitHub rejected the credentials for this repository.", response.status_code)
		raise GitHubError(f"GitHub returned HTTP {response.status_code} for {path}.", response.status_code)

	def get_json(self, path: str) -> Any:
		content = self.get_file(path)
		try:
			return json.loads(content)
		except ValueError as exc:
			raise GitHubError(f"{path} is not valid JSON.") from exc

	def get_repo_meta(self, with_token: bool = True) -> tuple[int, dict[str, Any]]:
		"""GET /repos/{owner}/{repo}; returns (status, body). Used only by the connection check."""
		headers = self._headers(with_token)
		headers["Accept"] = "application/vnd.github+json"
		try:
			response = self.session.get(f"{API_HOST}/repos/{self.ref.slug}", headers=headers, timeout=TIMEOUT)
		except requests.RequestException as exc:
			raise GitHubError(f"Could not reach GitHub: {exc}") from exc
		try:
			body = response.json() if response.content else {}
		except ValueError:
			body = {}
		return response.status_code, body if isinstance(body, dict) else {}


def parse_repo_url(value: str, branch: str | None = None) -> RepoRef:
	"""Accept ``https://github.com/owner/repo``, ``github.com/owner/repo``, ``owner/repo``, with optional ``/tree/branch``."""
	# 1. Full URL, possibly with /tree/<branch>
	# 2. Short owner/repo form
	# 3. Explicit branch argument wins over the URL

	text = (value or "").strip()
	if not text:
		raise ValueError("Repository URL is required.")

	# 1. Full URL, possibly with /tree/<branch>
	match = _URL_PATTERN.match(text)
	url_branch = None
	if match:
		owner, repo = match.group("owner"), match.group("repo")
		url_branch = match.group("branch")
	else:
		# 2. Short owner/repo form
		match = _SHORT_PATTERN.match(text)
		if not match:
			raise ValueError("Enter a GitHub repository as https://github.com/owner/repo or owner/repo.")
		owner, repo = match.group("owner"), match.group("repo")

	# 3. Explicit branch argument wins over the URL
	chosen = (branch or "").strip() or url_branch or DEFAULT_BRANCH
	return RepoRef(owner=owner, repo=repo, branch=chosen)


def check_access(
	ref: RepoRef, token: str | None = None, session: requests.Session | None = None
) -> AccessResult:
	"""Work out whether the repo is reachable, whether it needs a token, and whether it is a Shelf repo.

	Sequence:
	1. Probe shelf.json without credentials. 200 means public.
	2. On 404, retry with the token if one was given. 200 means private and the token works.
	3. Still nothing: ask the repos API to tell "exists but wrong branch / not a shelf" apart from
	   "private or missing", so the message tells the user exactly what to do.
	"""
	client = GitHubClient(ref=ref, token=token or None, session=session or requests.Session())

	# 1. Probe shelf.json without credentials. 200 means public.
	try:
		probe = client.get_raw(SHELF_MANIFEST, with_token=False)
	except GitHubError as exc:
		return AccessResult(False, CODE_NETWORK_ERROR, ACCESS_UNKNOWN, str(exc))

	if probe.status_code == 200:
		return _finish_ok(probe.content, ref, ACCESS_PUBLIC, token_used=False, token_given=bool(token))

	if probe.status_code not in (404, 401, 403):
		return AccessResult(
			False,
			CODE_NETWORK_ERROR,
			ACCESS_UNKNOWN,
			f"GitHub returned HTTP {probe.status_code} for {SHELF_MANIFEST}.",
		)

	# 2. On 404, retry with the token if one was given. 200 means private and the token works.
	if token:
		try:
			with_token = client.get_raw(SHELF_MANIFEST, with_token=True)
		except GitHubError as exc:
			return AccessResult(False, CODE_NETWORK_ERROR, ACCESS_UNKNOWN, str(exc))
		if with_token.status_code == 200:
			return _finish_ok(with_token.content, ref, ACCESS_PRIVATE, token_used=True, token_given=True)
		if with_token.status_code in (401, 403):
			return AccessResult(
				False,
				CODE_INVALID_TOKEN,
				ACCESS_UNKNOWN,
				"GitHub rejected the token. Check it has read access to this repository's contents.",
				token_required=True,
				token_used=True,
			)

	# 3. Still nothing: ask the repos API what exists.
	try:
		status, meta = client.get_repo_meta(with_token=bool(token))
	except GitHubError as exc:
		return AccessResult(False, CODE_NETWORK_ERROR, ACCESS_UNKNOWN, str(exc))

	if status == 200:
		default_branch = meta.get("default_branch") or DEFAULT_BRANCH
		access = ACCESS_PRIVATE if meta.get("private") else ACCESS_PUBLIC
		if default_branch != ref.branch:
			return AccessResult(
				False,
				CODE_BRANCH_NOT_FOUND,
				access,
				f"No {SHELF_MANIFEST} on branch {ref.branch!r}. The repository's default branch is {default_branch!r}.",
				default_branch=default_branch,
				token_required=access == ACCESS_PRIVATE,
				token_used=bool(token),
			)
		return AccessResult(
			False,
			CODE_NOT_A_SHELF,
			access,
			f"{ref.slug} is reachable but has no {SHELF_MANIFEST} on {ref.branch}. It is not a Shelf repository yet.",
			default_branch=default_branch,
			token_required=access == ACCESS_PRIVATE,
			token_used=bool(token),
		)

	if status == 401:
		return AccessResult(
			False,
			CODE_INVALID_TOKEN,
			ACCESS_UNKNOWN,
			"GitHub rejected the token.",
			token_required=True,
			token_used=True,
		)

	if status in (403, 404):
		if token:
			return AccessResult(
				False,
				CODE_NOT_FOUND,
				ACCESS_UNKNOWN,
				f"{ref.slug} was not found, or the token cannot see it. Check the URL and the token's repository access.",
				token_required=True,
				token_used=True,
			)
		return AccessResult(
			False,
			CODE_NEEDS_TOKEN,
			ACCESS_UNKNOWN,
			f"{ref.slug} is private or does not exist. Add a token with read access to check a private repository.",
			token_required=True,
		)

	return AccessResult(False, CODE_NETWORK_ERROR, ACCESS_UNKNOWN, f"GitHub returned HTTP {status}.")


def _finish_ok(
	content: bytes, ref: RepoRef, access: str, token_used: bool, token_given: bool
) -> AccessResult:
	"""shelf.json was fetched; make sure it is one of ours."""
	try:
		shelf = validate_shelf_manifest(json.loads(content))
	except (ValueError, ShelfFormatError) as exc:
		return AccessResult(
			False,
			CODE_NOT_A_SHELF,
			access,
			f"{ref.slug} has a {SHELF_MANIFEST} but it is not valid: {exc}",
			token_used=token_used,
		)

	if access == ACCESS_PUBLIC:
		note = " The repository is public, so the token is not needed." if token_given else ""
		message = f"Connected to {shelf['name']} ({ref.slug}@{ref.branch}). Public repository.{note}"
	else:
		message = f"Connected to {shelf['name']} ({ref.slug}@{ref.branch}). Private repository, token works."

	return AccessResult(
		True,
		CODE_PUBLIC_OK if access == ACCESS_PUBLIC else CODE_PRIVATE_OK,
		access,
		message,
		default_branch=ref.branch,
		shelf=shelf,
		token_required=access == ACCESS_PRIVATE,
		token_used=token_used,
	)


def fetch_index(ref: RepoRef, token: str | None = None, session: requests.Session | None = None) -> Any:
	"""Fetch and parse index.json (validation is the caller's job)."""
	return GitHubClient(ref=ref, token=token or None, session=session or requests.Session()).get_json(
		INDEX_FILE
	)
