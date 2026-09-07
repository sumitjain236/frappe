"""Whitelisted endpoints for the Shelf consumer UI and the Shelf Source form."""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _
from frappe.shelf import installer
from frappe.shelf.repo.github import check_access, parse_repo_url


@frappe.whitelist(methods=["POST"])
def check_repo(
	repo_url: str, branch: str | None = None, token: str | None = None, source: str | None = None
) -> dict[str, Any]:
	"""Probe a repository with the values on screen; falls back to the saved token of ``source``."""
	_require("Shelf Source", "write")
	try:
		ref = parse_repo_url(repo_url, branch)
	except ValueError as exc:
		frappe.throw(str(exc), title=_("Invalid repository URL"))

	effective_token = (token or "").strip() or None
	if not effective_token and source:
		saved = frappe.get_doc("Shelf Source", source)
		effective_token = saved.get_token()

	return check_access(ref, effective_token).as_dict()


@frappe.whitelist(methods=["POST"])
def check_source(name: str) -> dict[str, Any]:
	"""Re-run the connection check on a saved source and persist the outcome."""
	_require("Shelf Source", "write")
	source = frappe.get_doc("Shelf Source", name)
	return source.run_connection_check(save=True).as_dict()


@frappe.whitelist(methods=["POST"])
def sync_source(name: str, force: bool = False) -> dict[str, Any]:
	"""Fetch index.json for one source and refresh its catalog entries."""
	_require("Shelf Source", "write")
	source = frappe.get_doc("Shelf Source", name)
	if source.connection_status != "Connected":
		frappe.throw(_("Check the connection before syncing."), title=_("Not connected"))
	return source.sync(force=bool(int(force)) if isinstance(force, str) else bool(force))


@frappe.whitelist(methods=["GET"])
def get_sources() -> list[dict[str, Any]]:
	"""Domain tabs: every enabled source with counts the header needs."""
	_require("Shelf Source", "read")
	sources = frappe.get_all(
		"Shelf Source",
		filters={"enabled": 1},
		fields=[
			"name",
			"title",
			"repo_url",
			"branch",
			"access",
			"connection_status",
			"shelf_domain",
			"publisher_name",
			"artifact_count",
			"last_synced",
			"last_sync_error",
		],
		order_by="creation asc",
	)
	installed = _installed_by_source()
	for row in sources:
		stats = installed.get(row.name, {})
		row["installed_count"] = stats.get("installed", 0)
		row["updates_count"] = stats.get("updates", 0)
		row["attention_count"] = stats.get("attention", 0)
	return sources


@frappe.whitelist(methods=["GET"])
def get_catalog(source: str, category: str | None = None, search: str | None = None) -> dict[str, Any]:
	"""Artifacts of one source with this site's install state merged in."""
	# 1. Catalog rows
	# 2. Current install per artifact
	# 3. Merge and count

	_require("Shelf Source", "read")

	# 1. Catalog rows
	filters: dict[str, Any] = {"source": source}
	if category:
		filters["category"] = category
	or_filters = None
	if search:
		like = f"%{search}%"
		or_filters = {"title": ["like", like], "description": ["like", like], "tags": ["like", like]}
	rows = frappe.get_all(
		"Shelf Catalog Entry",
		filters=filters,
		or_filters=or_filters,
		fields=[
			"name",
			"artifact_id",
			"title",
			"category",
			"app",
			"version",
			"description",
			"tags",
			"requires",
			"license",
			"install_mode",
			"inputs_count",
			"documents_count",
			"files_count",
			"has_readme",
			"has_preview",
			"package_hash",
			"path",
			"updated",
		],
		order_by="title asc",
	)

	# 2. Current install per artifact
	current = {
		row.artifact_id: row
		for row in frappe.get_all(
			"Shelf Install Log",
			filters={"source": source, "is_current": 1},
			fields=[
				"artifact_id",
				"version",
				"package_hash",
				"status",
				"installed_on",
				"installed_by",
				"name",
			],
		)
	}

	# 3. Merge and count
	stats = {"total": len(rows), "installed": 0, "updates": 0, "attention": 0}
	for row in rows:
		row["tags"] = _loads(row.get("tags"), [])
		row["requires"] = _loads(row.get("requires"), [])
		inst = current.get(row.artifact_id)
		if not inst:
			row["state"] = "available"
			continue
		row["installed_version"] = inst.version
		row["installed_on"] = inst.installed_on
		row["install_log"] = inst.name
		if inst.status != "Installed":
			row["state"] = "attention"
			stats["attention"] += 1
		elif inst.package_hash != row.package_hash:
			row["state"] = "update"
			stats["installed"] += 1
			stats["updates"] += 1
		else:
			row["state"] = "installed"
			stats["installed"] += 1
	return {"artifacts": rows, "stats": stats}


def _installed_by_source() -> dict[str, dict[str, int]]:
	"""Installed / update / attention counts per source, from current install logs."""
	logs = frappe.get_all(
		"Shelf Install Log",
		filters={"is_current": 1},
		fields=["source", "artifact_id", "package_hash", "status"],
	)
	if not logs:
		return {}
	hashes = {
		(row.source, row.artifact_id): row.package_hash
		for row in frappe.get_all(
			"Shelf Catalog Entry",
			filters={"source": ["in", sorted({row.source for row in logs})]},
			fields=["source", "artifact_id", "package_hash"],
		)
	}
	out: dict[str, dict[str, int]] = {}
	for row in logs:
		stats = out.setdefault(row.source, {"installed": 0, "updates": 0, "attention": 0})
		if row.status != "Installed":
			stats["attention"] += 1
			continue
		stats["installed"] += 1
		latest = hashes.get((row.source, row.artifact_id))
		if latest and latest != row.package_hash:
			stats["updates"] += 1
	return out


def _require(doctype: str, ptype: str) -> None:
	if not frappe.has_permission(doctype, ptype):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def _loads(value: Any, default: Any) -> Any:
	if not value:
		return default
	try:
		return json.loads(value)
	except ValueError:
		return default


# ---------------------------------------------------------------------------
# Install / update / uninstall
# ---------------------------------------------------------------------------


@frappe.whitelist(methods=["GET"])
def get_install_plan(source: str, artifact_id: str) -> dict[str, Any]:
	"""Everything the install dialog needs: requirements, inputs, steps, and conflicts to decide."""
	_require_installer()
	return installer.plan_install(frappe.get_doc("Shelf Source", source), artifact_id)


@frappe.whitelist(methods=["POST"])
def install(
	source: str,
	artifact_id: str,
	inputs: dict[str, Any] | str | None = None,
	conflicts: dict[str, str] | str | None = None,
) -> dict[str, Any]:
	"""Install, update, or resume. Returns needs_decision with the conflicts when the user must choose."""
	_require_installer()
	doc = frappe.get_doc("Shelf Source", source)
	try:
		return installer.install_artifact(doc, artifact_id, _loads(inputs, {}), _loads(conflicts, {}))
	except installer.NeedsDecisionError as exc:
		return {"status": "needs_decision", "conflicts": exc.conflicts}


@frappe.whitelist(methods=["POST"])
def uninstall(source: str, artifact_id: str) -> dict[str, Any]:
	"""Remove the documents and files this site created for the artifact."""
	_require_installer()
	return installer.uninstall_artifact(frappe.get_doc("Shelf Source", source), artifact_id)


def has_app_permission() -> bool:
	"""Who sees Shelf on the apps screen: the same people who can install from it."""
	return "System Manager" in frappe.get_roles()


def _require_installer() -> None:
	if "System Manager" not in frappe.get_roles():
		frappe.throw(_("Only System Managers can install from Shelf."), frappe.PermissionError)


@frappe.whitelist(methods=["GET"])
def get_artifact(source: str, artifact_id: str) -> dict[str, Any]:
	"""Detail page: the catalog entry, its README rendered, repo links, and this site's install history."""
	# 1. Entry with install state (same rules as the catalog)
	# 2. README from the repo when the index says there is one
	# 3. Links into the repository and the history on this site

	_require("Shelf Source", "read")
	doc = frappe.get_doc("Shelf Source", source)

	# 1. Entry with install state (same rules as the catalog)
	catalog = get_catalog(source)
	entry = next((row for row in catalog["artifacts"] if row["artifact_id"] == artifact_id), None)
	if not entry:
		frappe.throw(
			_("{0} is not in the catalog of {1}.").format(artifact_id, source), frappe.DoesNotExistError
		)

	# 2. README from the repo when the index says there is one
	readme_html = ""
	if entry.get("has_readme"):
		try:
			text = installer.get_client(doc).get_file(f"{entry['path']}/README.md").decode("utf-8", "replace")
			readme_html = frappe.utils.md_to_html(text)
		except Exception:
			readme_html = ""

	# 3. Links into the repository and the history on this site
	links = doc.links()
	history = frappe.get_all(
		"Shelf Install Log",
		filters={"source": source, "artifact_id": artifact_id},
		fields=[
			"name",
			"version",
			"status",
			"is_current",
			"installed_on",
			"installed_by",
			"error",
			"creation",
		],
		order_by="creation desc",
		limit=20,
	)
	return {
		"artifact": entry,
		"readme_html": readme_html,
		"repo_url": links["repo_url"],
		"folder_url": links["folder_url"].format(path=entry["path"]),
		"source": {
			"name": doc.name,
			"title": doc.title,
			"access": doc.access,
			"publisher_name": doc.publisher_name,
			"shelf_domain": doc.shelf_domain,
			"repo": links["slug"],
			"branch": links["branch"],
		},
		"history": history,
	}
