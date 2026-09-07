"""The installer: download one artifact from a Shelf Source and install, update, resume, or remove it.

Everything a site does with an artifact goes through here so the Shelf Install Log is the single
record of what happened. Each step runs inside a savepoint: a failing step is rolled back on its
own, earlier steps stay, and the log says exactly where it stopped so the install can be resumed.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

import frappe
from frappe import _
from frappe.shelf.registry import get_app_shelf_handlers
from frappe.shelf.repo.github import GitHubError
from frappe.shelf.repo.spec import (
	ARTIFACT_MANIFEST,
	CONFLICT_ASK,
	CONFLICT_COPY,
	CONFLICT_REPLACE,
	CONFLICT_SKIP,
	INSTALL_APP,
	RESOLVER_FILE,
	RESOLVER_PROMPT,
	RESOLVER_STEP,
	STEP_DOCUMENT,
	STEP_FILE,
	ShelfFormatError,
	compute_package_hash,
	validate_artifact_manifest,
	validate_document_json,
)
from frappe.utils import now_datetime

STATUS_PENDING = "Pending"
STATUS_INSTALLED = "Installed"
STATUS_FAILED = "Failed"
STATUS_PARTIAL = "Partially Installed"
STATUS_UNINSTALLED = "Uninstalled"

ACTION_CREATED = "created"
ACTION_REPLACED = "replaced"
ACTION_SKIPPED = "skipped"
ACTION_COPIED = "copied"
ACTION_UPLOADED = "uploaded"
ACTION_HANDLER = "handler"
OWNED_ACTIONS = (ACTION_CREATED, ACTION_COPIED, ACTION_REPLACED)

COPY_SUFFIX = "(Shelf)"
PROTECTED_FIELDS = ("doctype", "name", "owner", "creation", "modified", "modified_by", "docstatus", "idx")


class InstallError(frappe.ValidationError):
	"""A problem the installer can explain to the user."""


class NeedsDecisionError(InstallError):
	"""Documents already exist and the manifest says ask; the UI must collect choices first."""

	def __init__(self, conflicts: list[dict[str, Any]]) -> None:
		super().__init__(_("Some documents already exist on this site. Choose what to do with them."))
		self.conflicts = conflicts


@dataclass
class Package:
	"""A downloaded, hash-verified artifact."""

	manifest: dict[str, Any]
	files: dict[str, bytes]
	catalog: dict[str, Any]

	@property
	def hash(self) -> str:
		return self.manifest["hash"]

	def document(self, step: dict[str, Any]) -> dict[str, Any]:
		return validate_document_json(self.files[step["path"]], self.manifest["id"], step["sequence"])


@dataclass
class StepResult:
	sequence: int
	type: str
	action: str
	doctype: str | None = None
	source_name: str | None = None
	target_name: str | None = None
	file_url: str | None = None
	file_doc: str | None = None

	def as_dict(self) -> dict[str, Any]:
		return {k: v for k, v in self.__dict__.items() if v is not None}


@dataclass
class Run:
	"""Everything one install/update/resume needs while it executes."""

	source: Any
	package: Package
	inputs: dict[str, Any]
	conflicts: dict[int, str]
	previous: Any | None = None
	log: Any | None = None
	results: dict[int, StepResult] = field(default_factory=dict)

	def previous_result(self, sequence: int) -> dict[str, Any] | None:
		if not self.previous:
			return None
		for row in _loads(self.previous.step_log, []):
			if row.get("sequence") == sequence:
				return row
		return None


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------


def get_client(source: Any) -> Any:
	"""Anything with ``get_file(path) -> bytes``; tests swap this for a local folder."""
	return source.get_client()


def download_package(source: Any, artifact_id: str) -> Package:
	"""Fetch manifest and step files for one catalog entry and verify the package hash."""
	# 1. The catalog entry tells us where the folder is and what hash to expect
	# 2. Manifest, then every step file
	# 3. The hash must match the index, otherwise the repo changed under us

	# 1. The catalog entry tells us where the folder is and what hash to expect
	catalog = frappe.db.get_value(
		"Shelf Catalog Entry",
		{"source": source.name, "artifact_id": artifact_id},
		["name", "path", "package_hash", "title", "version"],
		as_dict=True,
	)
	if not catalog:
		raise InstallError(
			_("{0} is not in the catalog of {1}. Sync the source first.").format(artifact_id, source.name)
		)

	client = get_client(source)
	base = catalog.path.rstrip("/")

	# 2. Manifest, then every step file
	try:
		raw = json.loads(client.get_file(f"{base}/{ARTIFACT_MANIFEST}"))
		manifest = validate_artifact_manifest(raw, artifact_id)
		files = {step["path"]: client.get_file(f"{base}/{step['path']}") for step in manifest["steps"]}
	except (GitHubError, ShelfFormatError, ValueError) as exc:
		raise InstallError(_("Could not download {0}: {1}").format(artifact_id, exc)) from exc

	for step in manifest["steps"]:
		if step["type"] == STEP_DOCUMENT:
			validate_document_json(files[step["path"]], artifact_id, step["sequence"])

	# 3. The hash must match the index, otherwise the repo changed under us
	manifest["hash"] = compute_package_hash(manifest, files)
	if manifest["hash"] != catalog.package_hash:
		raise InstallError(
			_("{0} changed in the repository since the last sync. Sync the source and try again.").format(
				catalog.title
			)
		)
	return Package(manifest=manifest, files=files, catalog=catalog)


# ---------------------------------------------------------------------------
# Plan (what the UI shows before the user commits)
# ---------------------------------------------------------------------------


def plan_install(source: Any, artifact_id: str) -> dict[str, Any]:
	"""Download, check requirements, and describe every step and every conflict without changing anything."""
	package = download_package(source, artifact_id)
	previous = get_current_log(source.name, artifact_id)
	manifest = package.manifest

	mode = "install"
	if previous and previous.status == STATUS_INSTALLED:
		mode = "update"
	elif previous and previous.status == STATUS_PARTIAL:
		mode = "resume" if previous.package_hash == package.catalog.package_hash else "update"

	steps = []
	for step in manifest["steps"]:
		steps.append(describe_step(package, step, previous, mode))

	return {
		"mode": mode,
		"artifact": {k: v for k, v in manifest.items() if k not in ("files",)},
		"requirements": check_requirements(manifest["requires"]),
		"inputs": manifest["inputs"],
		"previous_inputs": _loads(previous.inputs, {}) if previous else {},
		"previous_version": previous.version if previous else None,
		"steps": steps,
		"conflicts": [s for s in steps if s.get("needs_decision")],
	}


def describe_step(package: Package, step: dict[str, Any], previous: Any, mode: str) -> dict[str, Any]:
	if step["type"] == STEP_FILE:
		return {
			"sequence": step["sequence"],
			"type": STEP_FILE,
			"file_name": step["file_name"],
			"is_private": step["is_private"],
			"attach_to": step.get("attach_to"),
			"action": ACTION_UPLOADED,
		}

	doc = package.document(step)
	doctype, name = doc["doctype"], doc["name"]
	prior = _find_prior(previous, step["sequence"]) if mode in ("update", "resume") else None
	exists = bool(frappe.db.exists(doctype, name))
	policy = step["on_conflict"]
	info = {
		"sequence": step["sequence"],
		"type": STEP_DOCUMENT,
		"doctype": doctype,
		"name": name,
		"exists": exists,
		"policy": policy,
		"needs_decision": False,
	}
	if prior and prior.get("action") in OWNED_ACTIONS:
		info["action"] = ACTION_REPLACED
		info["target_name"] = prior.get("target_name")
		info["owned"] = True
	elif prior and prior.get("action") == ACTION_SKIPPED:
		info["action"] = ACTION_SKIPPED
		info["target_name"] = prior.get("target_name")
	elif not exists:
		info["action"] = ACTION_CREATED
	elif policy == CONFLICT_ASK:
		info["needs_decision"] = True
		info["copy_name"] = next_copy_name(doctype, name)
	else:
		info["action"] = {
			CONFLICT_SKIP: ACTION_SKIPPED,
			CONFLICT_REPLACE: ACTION_REPLACED,
			CONFLICT_COPY: ACTION_COPIED,
		}[policy]
		if policy == CONFLICT_COPY:
			info["copy_name"] = next_copy_name(doctype, name)
	return info


def check_requirements(requires: list[dict[str, str]]) -> list[dict[str, Any]]:
	"""Compare each required app and version with what this site has installed."""
	installed = set(frappe.get_installed_apps())
	out = []
	for row in requires:
		app = row["app"]
		have = _app_version(app) if app in installed else None
		ok = app in installed and _version_satisfies(have, row.get("min_version"))
		out.append(
			{"app": app, "min_version": row.get("min_version") or "", "installed_version": have, "ok": ok}
		)
	return out


# ---------------------------------------------------------------------------
# Install / update / resume
# ---------------------------------------------------------------------------


def install_artifact(
	source: Any,
	artifact_id: str,
	inputs: dict[str, Any] | None = None,
	conflicts: dict[int, str] | None = None,
) -> dict[str, Any]:
	"""Install, or update / resume when this site already has the artifact. Returns the log summary."""
	# 1. Download and verify
	# 2. Decide the mode from the current log
	# 3. Requirements, inputs, conflicts
	# 4. Execute
	# 5. Record

	# 1. Download and verify
	package = download_package(source, artifact_id)
	manifest = package.manifest

	# 2. Decide the mode from the current log
	previous = get_current_log(source.name, artifact_id)
	mode = "install"
	if previous and previous.status == STATUS_INSTALLED:
		if previous.package_hash == package.hash:
			return {"status": STATUS_INSTALLED, "log": previous.name, "unchanged": True, "mode": "update"}
		mode = "update"
	elif previous and previous.status == STATUS_PARTIAL:
		# Same package: carry on where it stopped. New package: treat what was created as ours to update.
		mode = "resume" if previous.package_hash == package.hash else "update"

	# 3. Requirements, inputs, conflicts
	missing = [r for r in check_requirements(manifest["requires"]) if not r["ok"]]
	if missing:
		names = ", ".join(
			f"{r['app']} ≥ {r['min_version']}" if r["min_version"] else r["app"] for r in missing
		)
		raise InstallError(_("This site is missing required apps: {0}").format(names))

	merged_inputs = dict(_loads(previous.inputs, {}) if previous else {})
	merged_inputs.update(inputs or {})
	validate_inputs(manifest["inputs"], merged_inputs)

	run = Run(
		source=source,
		package=package,
		inputs=merged_inputs,
		conflicts=_int_keys(conflicts or {}),
		previous=previous,
	)
	undecided = [
		s
		for s in (describe_step(package, step, previous, mode) for step in manifest["steps"])
		if s.get("needs_decision") and s["sequence"] not in run.conflicts
	]
	if undecided:
		raise NeedsDecisionError(undecided)

	# 4. Execute
	if mode == "resume":
		run.log = previous
		for row in _loads(previous.step_log, []):
			run.results[row["sequence"]] = StepResult(**row)
	else:
		run.log = _new_log(source, package, merged_inputs)

	if manifest["install"]["mode"] == INSTALL_APP:
		error = _run_handler(run, mode)
	else:
		error = _run_steps(run, mode)

	# 5. Record
	return _finish(run, mode, error)


def uninstall_artifact(source: Any, artifact_id: str) -> dict[str, Any]:
	"""Remove what this site created for the artifact. Documents we only replaced or skipped are left alone."""
	log = get_current_log(source.name, artifact_id)
	if not log:
		raise InstallError(_("{0} is not installed from {1}.").format(artifact_id, source.name))

	rows = _loads(log.step_log, [])
	removed: list[dict[str, Any]] = []
	kept: list[dict[str, Any]] = []

	if rows and rows[0].get("action") == ACTION_HANDLER:
		handlers = get_app_shelf_handlers(rows[0].get("handler_app") or "")
		if handlers and handlers.get("uninstall"):
			frappe.get_attr(handlers["uninstall"])(log=log)
	else:
		for row in reversed(rows):
			if row.get("type") == STEP_FILE and row.get("file_doc"):
				frappe.delete_doc(
					"File", row["file_doc"], ignore_permissions=True, ignore_missing=True, force=True
				)
				removed.append(row)
			elif row.get("type") == STEP_DOCUMENT and row.get("action") in (ACTION_CREATED, ACTION_COPIED):
				frappe.delete_doc(
					row["doctype"],
					row["target_name"],
					ignore_permissions=True,
					ignore_missing=True,
					force=True,
				)
				removed.append(row)
			else:
				kept.append(row)

	log.status = STATUS_UNINSTALLED
	log.is_current = 0
	log.flags.ignore_permissions = True
	log.save()
	return {"status": STATUS_UNINSTALLED, "log": log.name, "removed": len(removed), "kept": len(kept)}


def get_current_log(source_name: str, artifact_id: str) -> Any | None:
	name = frappe.db.get_value(
		"Shelf Install Log", {"source": source_name, "artifact_id": artifact_id, "is_current": 1}
	)
	return frappe.get_doc("Shelf Install Log", name) if name else None


# ---------------------------------------------------------------------------
# Steps
# ---------------------------------------------------------------------------


def _run_steps(run: Run, mode: str) -> str | None:
	"""Execute every step not already done, each inside its own savepoint. Returns the error text, if any."""
	for step in run.package.manifest["steps"]:
		seq = step["sequence"]
		if seq in run.results and mode == "resume":
			continue
		frappe.db.savepoint("shelf_step")
		try:
			if step["type"] == STEP_DOCUMENT:
				result = _run_document_step(run, step, mode)
			else:
				result = _run_file_step(run, step, mode)
		except Exception as exc:
			frappe.db.rollback(save_point="shelf_step")
			frappe.clear_messages()
			return f"Step {seq}: {_error_text(exc)}"
		run.results[seq] = result
	return None


def _run_document_step(run: Run, step: dict[str, Any], mode: str) -> StepResult:
	# 1. Document data with link rules applied
	# 2. Decide the action for this site
	# 3. Perform it

	# 1. Document data with link rules applied
	data = run.package.document(step)
	doctype, source_name = data["doctype"], data["name"]
	for fieldname, rule in step["link_rules"].items():
		data[fieldname] = _resolve_link(run, rule)

	# 2. Decide the action for this site
	prior = run.previous_result(step["sequence"]) if mode == "update" else None
	if prior and prior.get("action") in OWNED_ACTIONS and frappe.db.exists(doctype, prior.get("target_name")):
		action, target = ACTION_REPLACED, prior["target_name"]
	elif prior and prior.get("action") == ACTION_SKIPPED:
		action, target = ACTION_SKIPPED, prior["target_name"]
	elif not frappe.db.exists(doctype, source_name):
		action, target = ACTION_CREATED, source_name
	else:
		policy = run.conflicts.get(step["sequence"]) or step["on_conflict"]
		if policy == CONFLICT_ASK:
			raise InstallError(
				_("{0} {1} already exists and no choice was made.").format(doctype, source_name)
			)
		if policy == CONFLICT_SKIP:
			action, target = ACTION_SKIPPED, source_name
		elif policy == CONFLICT_REPLACE:
			action, target = ACTION_REPLACED, source_name
		else:
			action, target = ACTION_COPIED, next_copy_name(doctype, source_name)

	# 3. Perform it
	if action == ACTION_SKIPPED:
		pass
	elif action == ACTION_REPLACED:
		existing = frappe.get_doc(doctype, target)
		values = {k: v for k, v in data.items() if k not in PROTECTED_FIELDS}
		autoname = frappe.get_meta(doctype).autoname or ""
		if autoname.startswith("field:"):
			values[autoname.split(":", 1)[1]] = target
		existing.update(values)
		existing.flags.ignore_permissions = True
		existing.save()
	else:
		_insert_named(data, target)

	return StepResult(step["sequence"], STEP_DOCUMENT, action, doctype, source_name, target)


def _run_file_step(run: Run, step: dict[str, Any], mode: str) -> StepResult:
	# 1. Where does it attach
	# 2. On update, drop the file we uploaded last time
	# 3. Upload

	# 1. Where does it attach
	attached_to_doctype = attached_to_name = None
	attach = step.get("attach_to")
	if attach:
		if attach["resolver"] == RESOLVER_STEP:
			target = run.results.get(attach["sequence"])
			if not target or not target.target_name:
				raise InstallError(_("Step {0} has nothing to attach to.").format(step["sequence"]))
			attached_to_doctype, attached_to_name = target.doctype, target.target_name
		else:
			spec_input = next(i for i in run.package.manifest["inputs"] if i["key"] == attach["prompt_key"])
			attached_to_doctype, attached_to_name = (
				spec_input["options"],
				run.inputs.get(attach["prompt_key"]),
			)

	# 2. On update, drop the file we uploaded last time
	prior = run.previous_result(step["sequence"]) if mode == "update" else None
	if prior and prior.get("file_doc"):
		frappe.delete_doc("File", prior["file_doc"], ignore_permissions=True, ignore_missing=True, force=True)

	# 3. Upload
	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": step["file_name"],
			"content": run.package.files[step["path"]],
			"is_private": 1 if step["is_private"] else 0,
			"attached_to_doctype": attached_to_doctype,
			"attached_to_name": attached_to_name,
			"folder": "Home",
		}
	)
	file_doc.flags.ignore_permissions = True
	file_doc.insert()
	return StepResult(
		step["sequence"],
		STEP_FILE,
		ACTION_UPLOADED,
		attached_to_doctype,
		step["file_name"],
		attached_to_name,
		file_url=file_doc.file_url,
		file_doc=file_doc.name,
	)


def _run_handler(run: Run, mode: str) -> str | None:
	"""App-mode install: hand the package to the app's registered shelf_install_handlers."""
	app = run.package.manifest["install"]["handler_app"]
	handlers = get_app_shelf_handlers(app)
	action = "update" if mode == "update" else "install"
	if not handlers or not handlers.get(action):
		return f"App {app} has no {action} handler registered in shelf_install_handlers."
	try:
		frappe.get_attr(handlers[action])(
			package={"manifest": run.package.manifest, "files": run.package.files},
			inputs=run.inputs,
			previous_log=run.previous,
		)
	except Exception as exc:
		frappe.clear_messages()
		return _error_text(exc)
	run.results[0] = StepResult(0, "handler", ACTION_HANDLER)
	run.results[0].__dict__["handler_app"] = app
	return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_link(run: Run, rule: dict[str, Any]) -> Any:
	resolver = rule["resolver"]
	if resolver == RESOLVER_PROMPT:
		return run.inputs.get(rule["prompt_key"])
	if resolver == RESOLVER_FILE:
		result = run.results.get(rule["sequence"])
		return result.file_url if result else None
	if resolver == RESOLVER_STEP:
		result = run.results.get(rule["sequence"])
		if not result or not result.target_name:
			return None
		if rule.get("field", "name") == "name":
			return result.target_name
		return frappe.db.get_value(result.doctype, result.target_name, rule["field"])
	return None


def _insert_named(data: dict[str, Any], name: str) -> None:
	"""Insert a document keeping the name from the package (or the copy name we chose)."""
	meta = frappe.get_meta(data["doctype"])
	data = dict(data)
	data["name"] = name
	if (meta.autoname or "").startswith("field:"):
		data[meta.autoname.split(":", 1)[1]] = name
	doc = frappe.get_doc(data)
	doc.flags.name_set = True
	doc.flags.ignore_permissions = True
	doc.insert()


def next_copy_name(doctype: str, name: str) -> str:
	candidate = f"{name} {COPY_SUFFIX}"
	counter = 2
	while frappe.db.exists(doctype, candidate):
		candidate = f"{name} (Shelf {counter})"
		counter += 1
	return candidate


def validate_inputs(spec_inputs: list[dict[str, Any]], values: dict[str, Any]) -> None:
	missing = [i["label"] for i in spec_inputs if i["mandatory"] and values.get(i["key"]) in (None, "")]
	if missing:
		raise InstallError(_("Please provide: {0}").format(", ".join(missing)))
	for spec_input in spec_inputs:
		value = values.get(spec_input["key"])
		if spec_input["fieldtype"] == "Link" and value and not frappe.db.exists(spec_input["options"], value):
			raise InstallError(_("{0} {1} does not exist on this site.").format(spec_input["options"], value))


def _new_log(source: Any, package: Package, inputs: dict[str, Any]) -> Any:
	log = frappe.get_doc(
		{
			"doctype": "Shelf Install Log",
			"source": source.name,
			"artifact_id": package.manifest["id"],
			"title": package.manifest["title"],
			"version": package.manifest["version"],
			"package_hash": package.hash,
			"status": STATUS_PENDING,
			"inputs": json.dumps(inputs, default=str),
			"installed_by": frappe.session.user,
		}
	)
	log.flags.ignore_permissions = True
	log.insert()
	return log


def _finish(run: Run, mode: str, error: str | None) -> dict[str, Any]:
	log = run.log
	done = [run.results[k].as_dict() for k in sorted(run.results)]
	log.step_log = json.dumps(done, default=str)
	log.inputs = json.dumps(run.inputs, default=str)
	log.error = error or ""
	if error:
		log.status = STATUS_PARTIAL if done else STATUS_FAILED
	else:
		log.status = STATUS_INSTALLED
		log.installed_on = now_datetime()

	# The newest attempt is the current state of this artifact on the site, success or not,
	# unless nothing at all happened (then the previous install still stands).
	if log.status == STATUS_FAILED and run.previous and run.previous.name != log.name:
		log.is_current = 0
	else:
		log.is_current = 1
		if run.previous and run.previous.name != log.name:
			frappe.db.set_value(
				"Shelf Install Log", run.previous.name, "is_current", 0, update_modified=False
			)
	log.flags.ignore_permissions = True
	log.save()
	return {"status": log.status, "log": log.name, "mode": mode, "error": error, "steps": done}


def _find_prior(previous: Any, sequence: int) -> dict[str, Any] | None:
	if not previous:
		return None
	return next((r for r in _loads(previous.step_log, []) if r.get("sequence") == sequence), None)


def _app_version(app: str) -> str | None:
	try:
		return frappe.get_attr(f"{app}.__version__")
	except Exception:
		return None


def _version_satisfies(have: str | None, need: str | None) -> bool:
	if not need:
		return True
	if not have:
		return False
	try:
		from packaging.version import Version

		return Version(have.split("+")[0]) >= Version(need)
	except Exception:
		return True


def _int_keys(value: dict[Any, str]) -> dict[int, str]:
	return {int(k): v for k, v in value.items()}


def _loads(value: Any, default: Any) -> Any:
	if not value:
		return default
	if isinstance(value, (dict, list)):
		return value
	try:
		return json.loads(value)
	except ValueError:
		return default


def _error_text(exc: Exception) -> str:
	text = str(exc) or exc.__class__.__name__
	return frappe.utils.strip_html(text)[:500]
