"""Sync a Shelf Source: fetch index.json and mirror it into Shelf Catalog Entry rows."""

from __future__ import annotations

import hashlib
import json
from typing import Any

import frappe
from frappe.shelf.repo.github import GitHubError
from frappe.shelf.repo.spec import INDEX_FILE, ShelfFormatError, canonical_json, validate_index
from frappe.utils import now_datetime


def sync_source(source: Any, force: bool = False) -> dict[str, Any]:
	"""Refresh one source. Returns a summary; raises on fetch or format errors after recording them."""
	# 1. Fetch and validate the index
	# 2. Skip when nothing changed
	# 3. Upsert entries, delete stale ones, record the sync

	# 1. Fetch and validate the index
	try:
		raw = fetch_index(source)
		index = validate_index(raw)
	except (GitHubError, ShelfFormatError) as exc:
		_record_sync_error(source, str(exc))
		raise

	# 2. Skip when nothing changed
	index_hash = _index_hash(index)
	if not force and index_hash == (source.index_hash or ""):
		frappe.db.set_value(
			"Shelf Source",
			source.name,
			{"last_synced": now_datetime(), "last_sync_error": ""},
			update_modified=False,
		)
		return {"changed": False, "artifact_count": source.artifact_count or 0, "index_hash": index_hash}

	# 3. Upsert entries, delete stale ones, record the sync
	seen = set()
	for row in index["artifacts"]:
		_upsert_entry(source.name, row)
		seen.add(row["id"])

	stale = frappe.get_all(
		"Shelf Catalog Entry",
		filters={"source": source.name, "artifact_id": ["not in", sorted(seen)] if seen else ["is", "set"]},
		pluck="name",
	)
	for name in stale:
		frappe.delete_doc("Shelf Catalog Entry", name, ignore_permissions=True, force=True)

	shelf = index["shelf"]
	frappe.db.set_value(
		"Shelf Source",
		source.name,
		{
			"last_synced": now_datetime(),
			"last_sync_error": "",
			"artifact_count": len(seen),
			"index_hash": index_hash,
			"shelf_id": shelf["id"],
			"shelf_name": shelf["name"],
			"shelf_domain": shelf["domain"],
			"publisher_name": shelf["publisher"]["name"],
		},
		update_modified=False,
	)
	return {"changed": True, "artifact_count": len(seen), "index_hash": index_hash}


def fetch_index(source: Any) -> Any:
	"""index.json through whichever provider the source uses (patched in tests)."""
	return source.get_client().get_json(INDEX_FILE)


def sync_all_sources() -> None:
	"""Scheduler entry point: refresh every enabled, connected source; errors are logged, not raised."""
	names = frappe.get_all(
		"Shelf Source", filters={"enabled": 1, "connection_status": "Connected"}, pluck="name"
	)
	for name in names:
		source = frappe.get_doc("Shelf Source", name)
		try:
			sync_source(source)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title=f"Shelf sync failed: {name}")


def _upsert_entry(source_name: str, row: dict[str, Any]) -> None:
	values = {
		"source": source_name,
		"artifact_id": row["id"],
		"title": row["title"],
		"category": row.get("category") or "",
		"app": row.get("app") or "",
		"version": row["version"],
		"install_mode": row.get("install_mode") or "generic",
		"license": row.get("license") or "",
		"description": row.get("description") or "",
		"tags": json.dumps(row.get("tags") or []),
		"requires": json.dumps(row.get("requires") or []),
		"inputs_count": int(row.get("inputs_count") or 0),
		"documents_count": int(row.get("documents_count") or 0),
		"files_count": int(row.get("files_count") or 0),
		"has_readme": 1 if row.get("has_readme") else 0,
		"has_preview": 1 if row.get("has_preview") else 0,
		"package_hash": row["hash"],
		"path": row["path"],
		"updated": row.get("updated") or None,
	}
	existing = frappe.db.get_value(
		"Shelf Catalog Entry", {"source": source_name, "artifact_id": row["id"]}, "name"
	)
	if existing:
		doc = frappe.get_doc("Shelf Catalog Entry", existing)
		doc.update(values)
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc({"doctype": "Shelf Catalog Entry", **values})
		doc.insert(ignore_permissions=True)


def _index_hash(index: dict[str, Any]) -> str:
	stable = {k: v for k, v in index.items() if k != "generated_at"}
	return hashlib.sha256(canonical_json(stable).encode()).hexdigest()


def _record_sync_error(source: Any, message: str) -> None:
	frappe.db.set_value(
		"Shelf Source", source.name, {"last_sync_error": message[:500]}, update_modified=False
	)
