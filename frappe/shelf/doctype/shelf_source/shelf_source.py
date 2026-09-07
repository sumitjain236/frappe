# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

"""Shelf Source: a git repository this site reads artifacts from."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.shelf.repo.github import (
	ACCESS_UNKNOWN,
	AccessResult,
	GitHubClient,
	RepoRef,
	check_access,
	parse_repo_url,
)
from frappe.shelf.repo.local import LocalClient, check_local
from frappe.utils import now_datetime

CONNECTION_FIELDS = ("repo_url", "branch", "token", "provider")
PROVIDER_GITHUB = "GitHub"
PROVIDER_LOCAL = "Local Folder"


class ShelfSource(Document):
	"""One connected repository. Connection fields are verified against GitHub on save."""

	def validate(self) -> None:
		# 1. Normalise the repository reference
		# 2. Re-check the connection when anything that affects it changed

		# 1. Normalise the repository reference
		if self.is_local():
			self.repo_url = (self.repo_url or "").strip()
			self.branch = "local"
			self.token = None
		else:
			ref = self.repo_ref()
			self.repo_url = ref.html_url
			self.branch = ref.branch

		# 2. Re-check the connection when anything that affects it changed
		if self.flags.skip_connection_check:
			return
		if self.is_new() or self._connection_fields_changed():
			result = self.run_connection_check(save=False)
			if not result.ok and not self.flags.allow_unverified:
				frappe.throw(result.message, title=_("Could not connect to repository"))

	def is_local(self) -> bool:
		return (self.provider or PROVIDER_GITHUB) == PROVIDER_LOCAL

	def repo_ref(self) -> RepoRef:
		"""Parsed owner/repo/branch. Raises a user-facing error for bad URLs. GitHub sources only."""
		if self.is_local():
			frappe.throw(_("A local folder source has no GitHub reference."))
		try:
			return parse_repo_url(self.repo_url, self.branch)
		except ValueError as exc:
			frappe.throw(str(exc), title=_("Invalid repository URL"))

	def get_client(self) -> Any:
		"""Something with get_file(path) and get_json(path) for this source."""
		if self.is_local():
			return LocalClient(root=Path(self.repo_url).expanduser())
		return GitHubClient(ref=self.repo_ref(), token=self.get_token())

	def links(self) -> dict[str, str]:
		"""Where to send the user to look at the repository (and one artifact folder)."""
		if self.is_local():
			return {
				"repo_url": self.repo_url,
				"slug": Path(self.repo_url).name,
				"branch": "local",
				"folder_url": self.repo_url.rstrip("/") + "/{path}",
			}
		ref = self.repo_ref()
		return {
			"repo_url": ref.html_url,
			"slug": ref.slug,
			"branch": ref.branch,
			"folder_url": f"{ref.html_url}/tree/{ref.branch}/{{path}}",
		}

	def get_token(self) -> str | None:
		"""Decrypted token, or None when the field is empty."""
		if not self.token:
			return None
		return self.get_password("token", raise_exception=False) or None

	def _connection_fields_changed(self) -> bool:
		before = self.get_doc_before_save()
		if not before:
			return True
		return any(self.get(field) != before.get(field) for field in CONNECTION_FIELDS)

	def run_connection_check(self, save: bool = True) -> AccessResult:
		"""Probe the repository and record the outcome on this document."""
		# 1. Ask GitHub (token only used after the public probe fails)
		# 2. Record status, access, and shelf identity
		# 3. Persist when asked to

		# 1. Ask GitHub (token only used after the public probe fails), or look at the folder
		if self.is_local():
			result = check_local(self.repo_url)
		else:
			result = check_access(self.repo_ref(), self.get_token())

		# 2. Record status, access, and shelf identity
		self.connection_status = "Connected" if result.ok else "Error"
		self.access = result.access or ACCESS_UNKNOWN
		self.connection_message = result.message
		self.last_checked = now_datetime()
		if result.shelf:
			self.shelf_id = result.shelf["id"]
			self.shelf_name = result.shelf["name"]
			self.shelf_domain = result.shelf["domain"]
			self.publisher_name = result.shelf["publisher"]["name"]
			if self.is_new() and not (self.title or "").strip():
				self.title = result.shelf["name"]

		# 3. Persist when asked to
		if save:
			self.flags.skip_connection_check = True
			self.save(ignore_permissions=True)
		return result

	def sync(self, force: bool = False) -> dict[str, Any]:
		"""Pull index.json and refresh this source's catalog entries."""
		from frappe.shelf.sync import sync_source

		return sync_source(self, force=force)

	def on_trash(self) -> None:
		"""Drop cached catalog rows; install logs are kept as history."""
		frappe.db.delete("Shelf Catalog Entry", {"source": self.name})
