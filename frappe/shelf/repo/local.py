"""Local Folder provider: a Shelf repository checked out (or authored) on this machine.

Used for development and for publishers testing an artifact before pushing it. Same file
interface as the GitHub client, so sync and the installer do not care where bytes come from.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from frappe.shelf.repo.github import (
	ACCESS_PUBLIC,
	ACCESS_UNKNOWN,
	CODE_NETWORK_ERROR,
	CODE_NOT_A_SHELF,
	CODE_NOT_FOUND,
	CODE_PUBLIC_OK,
	MAX_FILE_BYTES,
	AccessResult,
	GitHubError,
)
from frappe.shelf.repo.spec import SHELF_MANIFEST, ShelfFormatError, validate_shelf_manifest


@dataclass
class LocalClient:
	root: Path

	def get_file(self, path: str) -> bytes:
		target = (self.root / path.lstrip("/")).resolve()
		if self.root.resolve() not in target.parents and target != self.root.resolve():
			raise GitHubError(f"{path} is outside the shelf folder.", 403)
		if not target.is_file():
			raise GitHubError(f"{path} was not found in {self.root}.", 404)
		if target.stat().st_size > MAX_FILE_BYTES:
			raise GitHubError(f"{path} is larger than the {MAX_FILE_BYTES // (1024 * 1024)} MB limit.")
		return target.read_bytes()

	def get_json(self, path: str) -> Any:
		try:
			return json.loads(self.get_file(path))
		except ValueError as exc:
			raise GitHubError(f"{path} is not valid JSON.") from exc


def check_local(path: str) -> AccessResult:
	"""Does the folder exist and hold a valid shelf.json?"""
	root = Path(path or "").expanduser()
	if not root.is_dir():
		return AccessResult(False, CODE_NOT_FOUND, ACCESS_UNKNOWN, f"{root} is not a folder on this server.")
	manifest = root / SHELF_MANIFEST
	if not manifest.is_file():
		return AccessResult(
			False,
			CODE_NOT_A_SHELF,
			ACCESS_PUBLIC,
			f"{root} has no {SHELF_MANIFEST}. It is not a Shelf repository yet.",
		)
	try:
		shelf = validate_shelf_manifest(json.loads(manifest.read_text(encoding="utf-8")))
	except (OSError, ValueError, ShelfFormatError) as exc:
		return AccessResult(False, CODE_NOT_A_SHELF, ACCESS_PUBLIC, f"{SHELF_MANIFEST} is not valid: {exc}")
	except Exception as exc:  # pragma: no cover
		return AccessResult(False, CODE_NETWORK_ERROR, ACCESS_UNKNOWN, str(exc))
	return AccessResult(
		True, CODE_PUBLIC_OK, ACCESS_PUBLIC, f"Connected to {shelf['name']} (local folder).", "local", shelf
	)
