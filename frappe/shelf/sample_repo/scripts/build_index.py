"""Shelf repository format: manifest validation, package hashing, and index building.

This module is deliberately free of Frappe imports so the same code runs inside a site
(consumer sync, publisher export) and standalone in CI (``scripts/build_index.py``).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

FORMAT_VERSION = 1

SHELF_MANIFEST = "shelf.json"
INDEX_FILE = "index.json"
ARTIFACTS_DIR = "artifacts"
ARTIFACT_MANIFEST = "artifact.json"
README_FILE = "README.md"
PREVIEW_FILE = "preview.png"

STEP_DOCUMENT = "document"
STEP_FILE = "file"
STEP_TYPES = (STEP_DOCUMENT, STEP_FILE)

RESOLVER_PROMPT = "prompt"
RESOLVER_STEP = "step"
RESOLVER_FILE = "file"
LINK_RESOLVERS = (RESOLVER_PROMPT, RESOLVER_STEP, RESOLVER_FILE)
ATTACH_RESOLVERS = (RESOLVER_PROMPT, RESOLVER_STEP)

CONFLICT_ASK = "ask"
CONFLICT_SKIP = "skip"
CONFLICT_REPLACE = "replace"
CONFLICT_COPY = "copy"
CONFLICT_POLICIES = (CONFLICT_ASK, CONFLICT_SKIP, CONFLICT_REPLACE, CONFLICT_COPY)

INSTALL_GENERIC = "generic"
INSTALL_APP = "app"
INSTALL_MODES = (INSTALL_GENERIC, INSTALL_APP)

KNOWN_CATEGORIES = ("Report", "Dashboard", "Workspace", "Print Format", "Server Script", "Other")
INPUT_FIELDTYPES = ("Link", "Data", "Select", "Check", "Int", "Date")

ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
VERSION_PATTERN = re.compile(r"^\d+\.\d+\.\d+$")
KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")


class ShelfFormatError(ValueError):
	"""Raised when a repo, manifest, or index does not follow the Shelf format."""


# ---------------------------------------------------------------------------
# Repo manifest (shelf.json)
# ---------------------------------------------------------------------------


def validate_shelf_manifest(data: Any) -> dict[str, Any]:
	"""Validate ``shelf.json`` and return it with defaults applied."""
	# 1. Shape and format version
	# 2. Required identity fields
	# 3. Optional publisher block

	# 1. Shape and format version
	if not isinstance(data, dict):
		raise ShelfFormatError("shelf.json must be a JSON object.")
	_require_format(data, "shelf.json")

	# 2. Required identity fields
	shelf_id = _require_str(data, "id", "shelf.json")
	if not ID_PATTERN.match(shelf_id):
		raise ShelfFormatError("shelf.json id must be a lowercase slug (letters, digits, hyphens).")
	name = _require_str(data, "name", "shelf.json")

	# 3. Optional publisher block
	publisher = data.get("publisher") or {}
	if not isinstance(publisher, dict):
		raise ShelfFormatError("shelf.json publisher must be an object.")

	return {
		"format": FORMAT_VERSION,
		"id": shelf_id,
		"name": name,
		"domain": (data.get("domain") or name).strip(),
		"description": (data.get("description") or "").strip(),
		"license": (data.get("license") or "").strip(),
		"publisher": {
			"name": (publisher.get("name") or "").strip(),
			"url": (publisher.get("url") or "").strip(),
		},
	}


# ---------------------------------------------------------------------------
# Artifact manifest (artifact.json)
# ---------------------------------------------------------------------------


def validate_artifact_manifest(data: Any, artifact_id: str | None = None) -> dict[str, Any]:
	"""Validate ``artifact.json`` and return a normalised copy.

	Only the manifest is checked here; referenced files are checked by :func:`load_artifact`.
	"""
	# 1. Shape, format, identity
	# 2. Requirements and inputs
	# 3. Steps: types, sequences, paths, resolvers
	# 4. Install mode

	# 1. Shape, format, identity
	if not isinstance(data, dict):
		raise ShelfFormatError("artifact.json must be a JSON object.")
	_require_format(data, "artifact.json")

	aid = _require_str(data, "id", "artifact.json")
	if not ID_PATTERN.match(aid):
		raise ShelfFormatError(f"artifact id {aid!r} must be a lowercase slug.")
	if artifact_id and aid != artifact_id:
		raise ShelfFormatError(f"artifact id {aid!r} must match its folder name {artifact_id!r}.")

	title = _require_str(data, "title", f"artifact {aid}")
	category = _require_str(data, "category", f"artifact {aid}")
	app = _require_str(data, "app", f"artifact {aid}")
	version = _require_str(data, "version", f"artifact {aid}")
	if not VERSION_PATTERN.match(version):
		raise ShelfFormatError(f"artifact {aid}: version {version!r} must be MAJOR.MINOR.PATCH.")

	# 2. Requirements and inputs
	requires = _normalise_requires(data.get("requires"), aid)
	inputs = _normalise_inputs(data.get("inputs"), aid)
	input_keys = {row["key"] for row in inputs}

	# 3. Steps: types, sequences, paths, resolvers
	steps = _normalise_steps(data.get("steps"), aid, input_keys)

	# 4. Install mode
	install = data.get("install") or {}
	if not isinstance(install, dict):
		raise ShelfFormatError(f"artifact {aid}: install must be an object.")
	mode = install.get("mode") or INSTALL_GENERIC
	if mode not in INSTALL_MODES:
		raise ShelfFormatError(f"artifact {aid}: install.mode must be one of {', '.join(INSTALL_MODES)}.")
	if mode == INSTALL_APP and not install.get("handler_app"):
		raise ShelfFormatError(f"artifact {aid}: install.handler_app is required when install.mode is app.")

	links = data.get("links") or {}
	if not isinstance(links, dict):
		raise ShelfFormatError(f"artifact {aid}: links must be an object.")

	tags = data.get("tags") or []
	if not isinstance(tags, list) or any(not isinstance(t, str) for t in tags):
		raise ShelfFormatError(f"artifact {aid}: tags must be a list of strings.")

	updated = data.get("updated")
	if updated is not None:
		updated = _parse_date(updated, f"artifact {aid}: updated")

	return {
		"format": FORMAT_VERSION,
		"id": aid,
		"title": title,
		"category": category,
		"app": app,
		"version": version,
		"description": (data.get("description") or "").strip(),
		"tags": sorted({t.strip() for t in tags if t.strip()}),
		"license": (data.get("license") or "").strip(),
		"links": {
			"documentation": (links.get("documentation") or "").strip(),
			"support": (links.get("support") or "").strip(),
			"website": (links.get("website") or "").strip(),
		},
		"requires": requires,
		"inputs": inputs,
		"steps": steps,
		"install": {"mode": mode, "handler_app": (install.get("handler_app") or "").strip()},
		"updated": updated,
	}


def _normalise_requires(value: Any, aid: str) -> list[dict[str, str]]:
	if value is None:
		return []
	if not isinstance(value, list):
		raise ShelfFormatError(f"artifact {aid}: requires must be a list.")
	out = []
	for row in value:
		if not isinstance(row, dict) or not row.get("app"):
			raise ShelfFormatError(f"artifact {aid}: each requires entry needs an app.")
		out.append({"app": str(row["app"]).strip(), "min_version": str(row.get("min_version") or "").strip()})
	return out


def _normalise_inputs(value: Any, aid: str) -> list[dict[str, Any]]:
	if value is None:
		return []
	if not isinstance(value, list):
		raise ShelfFormatError(f"artifact {aid}: inputs must be a list.")
	out = []
	seen: set[str] = set()
	for row in value:
		if not isinstance(row, dict):
			raise ShelfFormatError(f"artifact {aid}: each input must be an object.")
		key = _require_str(row, "key", f"artifact {aid} input")
		if not KEY_PATTERN.match(key):
			raise ShelfFormatError(f"artifact {aid}: input key {key!r} must be snake_case.")
		if key in seen:
			raise ShelfFormatError(f"artifact {aid}: duplicate input key {key!r}.")
		seen.add(key)
		fieldtype = row.get("fieldtype") or "Data"
		if fieldtype not in INPUT_FIELDTYPES:
			raise ShelfFormatError(
				f"artifact {aid}: input {key} fieldtype must be one of {', '.join(INPUT_FIELDTYPES)}."
			)
		if fieldtype == "Link" and not row.get("options"):
			raise ShelfFormatError(f"artifact {aid}: input {key} is a Link and needs options (a DocType).")
		out.append(
			{
				"key": key,
				"label": (row.get("label") or key.replace("_", " ").title()).strip(),
				"fieldtype": fieldtype,
				"options": (row.get("options") or "").strip(),
				"mandatory": bool(row.get("mandatory", False)),
				"description": (row.get("description") or "").strip(),
				"default": row.get("default"),
			}
		)
	return out


def _normalise_steps(value: Any, aid: str, input_keys: set[str]) -> list[dict[str, Any]]:
	# 1. At least one step, unique integer sequences
	# 2. Per-step checks by type
	# 3. Resolver references must point backwards

	# 1. At least one step, unique integer sequences
	if not isinstance(value, list) or not value:
		raise ShelfFormatError(f"artifact {aid}: steps must be a non-empty list.")
	rows = []
	for row in value:
		if not isinstance(row, dict):
			raise ShelfFormatError(f"artifact {aid}: each step must be an object.")
		seq = row.get("sequence")
		if not isinstance(seq, int) or isinstance(seq, bool) or seq < 1:
			raise ShelfFormatError(f"artifact {aid}: step sequence must be a positive integer.")
		rows.append((seq, row))
	sequences = [s for s, _ in rows]
	if len(set(sequences)) != len(sequences):
		raise ShelfFormatError(f"artifact {aid}: step sequences must be unique.")
	rows.sort(key=lambda r: r[0])

	# 2. Per-step checks by type
	out: list[dict[str, Any]] = []
	types_by_seq: dict[int, str] = {}
	for seq, row in rows:
		stype = row.get("type")
		if stype not in STEP_TYPES:
			raise ShelfFormatError(f"artifact {aid}: step {seq} type must be one of {', '.join(STEP_TYPES)}.")
		path = _require_str(row, "path", f"artifact {aid} step {seq}")
		_check_relative_path(path, aid, seq)
		types_by_seq[seq] = stype

		if stype == STEP_DOCUMENT:
			if not path.endswith(".json"):
				raise ShelfFormatError(f"artifact {aid}: step {seq} document path must be a .json file.")
			on_conflict = row.get("on_conflict") or CONFLICT_ASK
			if on_conflict not in CONFLICT_POLICIES:
				raise ShelfFormatError(
					f"artifact {aid}: step {seq} on_conflict must be one of {', '.join(CONFLICT_POLICIES)}."
				)
			link_rules = row.get("link_rules") or {}
			if not isinstance(link_rules, dict):
				raise ShelfFormatError(f"artifact {aid}: step {seq} link_rules must be an object.")
			out.append(
				{
					"sequence": seq,
					"type": STEP_DOCUMENT,
					"path": path,
					"on_conflict": on_conflict,
					"link_rules": link_rules,
				}
			)
		else:
			attach_to = row.get("attach_to")
			if attach_to is not None and not isinstance(attach_to, dict):
				raise ShelfFormatError(f"artifact {aid}: step {seq} attach_to must be an object.")
			out.append(
				{
					"sequence": seq,
					"type": STEP_FILE,
					"path": path,
					"file_name": (row.get("file_name") or os.path.basename(path)).strip(),
					"is_private": bool(row.get("is_private", False)),
					"attach_to": attach_to,
				}
			)

	# 3. Resolver references must point backwards
	for step in out:
		seq = step["sequence"]
		if step["type"] == STEP_DOCUMENT:
			for fieldname, rule in step["link_rules"].items():
				_check_link_rule(rule, fieldname, seq, aid, input_keys, types_by_seq)
		elif step["attach_to"]:
			_check_attach_rule(step["attach_to"], seq, aid, input_keys, types_by_seq)
	return out


def _check_link_rule(
	rule: Any,
	fieldname: str,
	seq: int,
	aid: str,
	input_keys: set[str],
	types_by_seq: dict[int, str],
) -> None:
	where = f"artifact {aid}: step {seq} link_rules.{fieldname}"
	if not isinstance(rule, dict):
		raise ShelfFormatError(f"{where} must be an object.")
	resolver = rule.get("resolver")
	if resolver == RESOLVER_PROMPT:
		if rule.get("prompt_key") not in input_keys:
			raise ShelfFormatError(f"{where} references unknown input {rule.get('prompt_key')!r}.")
	elif resolver == RESOLVER_STEP:
		_check_backref(rule, where, seq, types_by_seq, STEP_DOCUMENT)
		if not rule.get("field"):
			raise ShelfFormatError(f"{where} needs a field to read from the earlier document (usually name).")
	elif resolver == RESOLVER_FILE:
		_check_backref(rule, where, seq, types_by_seq, STEP_FILE)
	else:
		raise ShelfFormatError(f"{where} resolver must be one of {', '.join(LINK_RESOLVERS)}.")


def _check_attach_rule(
	rule: dict[str, Any], seq: int, aid: str, input_keys: set[str], types_by_seq: dict[int, str]
) -> None:
	where = f"artifact {aid}: step {seq} attach_to"
	resolver = rule.get("resolver")
	if resolver == RESOLVER_PROMPT:
		if rule.get("prompt_key") not in input_keys:
			raise ShelfFormatError(f"{where} references unknown input {rule.get('prompt_key')!r}.")
	elif resolver == RESOLVER_STEP:
		_check_backref(rule, where, seq, types_by_seq, STEP_DOCUMENT)
	else:
		raise ShelfFormatError(f"{where} resolver must be one of {', '.join(ATTACH_RESOLVERS)}.")


def _check_backref(
	rule: dict[str, Any], where: str, seq: int, types_by_seq: dict[int, str], want: str
) -> None:
	target = rule.get("sequence")
	if not isinstance(target, int) or isinstance(target, bool):
		raise ShelfFormatError(f"{where} needs an integer sequence.")
	if target >= seq:
		raise ShelfFormatError(f"{where} must reference an earlier step (got {target}).")
	if types_by_seq.get(target) != want:
		raise ShelfFormatError(f"{where} must reference a {want} step, but step {target} is not one.")


def _check_relative_path(path: str, aid: str, seq: int) -> None:
	if path.startswith("/") or ".." in Path(path).parts or "\\" in path:
		raise ShelfFormatError(
			f"artifact {aid}: step {seq} path must be relative and inside the artifact folder."
		)


# ---------------------------------------------------------------------------
# Loading an artifact folder and hashing it
# ---------------------------------------------------------------------------


def load_artifact(artifact_dir: str | Path) -> dict[str, Any]:
	"""Read and validate one artifact folder; returns manifest plus ``files`` (path -> bytes) and ``hash``."""
	# 1. Manifest
	# 2. Every step path must exist; document steps must be JSON with doctype + name
	# 3. Optional README and preview
	# 4. Deterministic package hash

	artifact_dir = Path(artifact_dir)
	manifest_path = artifact_dir / ARTIFACT_MANIFEST
	if not manifest_path.is_file():
		raise ShelfFormatError(f"{artifact_dir.name}: missing {ARTIFACT_MANIFEST}.")

	# 1. Manifest
	manifest = validate_artifact_manifest(_read_json(manifest_path), artifact_dir.name)

	# 2. Every step path must exist; document steps must be JSON with doctype + name
	files: dict[str, bytes] = {}
	for step in manifest["steps"]:
		fpath = artifact_dir / step["path"]
		if not fpath.is_file():
			raise ShelfFormatError(
				f"{manifest['id']}: step {step['sequence']} file {step['path']} not found."
			)
		content = fpath.read_bytes()
		if step["type"] == STEP_DOCUMENT:
			validate_document_json(content, manifest["id"], step["sequence"])
		files[step["path"]] = content

	# 3. Optional README and preview
	readme = artifact_dir / README_FILE
	preview = artifact_dir / PREVIEW_FILE
	manifest["has_readme"] = readme.is_file()
	manifest["has_preview"] = preview.is_file()

	# 4. Deterministic package hash
	manifest["hash"] = compute_package_hash(manifest, files)
	manifest["files"] = files
	return manifest


def validate_document_json(content: bytes | str, aid: str, seq: int) -> dict[str, Any]:
	"""A document step file must be an object carrying doctype and name."""
	try:
		doc = json.loads(content)
	except ValueError as exc:
		raise ShelfFormatError(f"{aid}: step {seq} document is not valid JSON ({exc}).") from exc
	if not isinstance(doc, dict) or not doc.get("doctype") or not doc.get("name"):
		raise ShelfFormatError(f"{aid}: step {seq} document JSON must include doctype and name.")
	return doc


def compute_package_hash(manifest: dict[str, Any], files: dict[str, bytes]) -> str:
	"""SHA-256 over the canonical manifest and every step file, in sequence order."""
	# 1. Canonical manifest without derived keys
	# 2. Chain in file digests by step order

	# 1. Canonical manifest without derived keys
	clean = {k: v for k, v in manifest.items() if k not in ("hash", "files", "has_readme", "has_preview")}
	parts = [hashlib.sha256(canonical_json(clean).encode()).hexdigest()]

	# 2. Chain in file digests by step order
	for step in sorted(manifest["steps"], key=lambda s: s["sequence"]):
		parts.append(hashlib.sha256(files[step["path"]]).hexdigest())
	return hashlib.sha256("\n".join(parts).encode()).hexdigest()


def canonical_json(value: Any) -> str:
	"""Stable JSON: sorted keys, no whitespace, dates as ISO strings."""
	return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


# ---------------------------------------------------------------------------
# Index (index.json)
# ---------------------------------------------------------------------------


def build_index(root: str | Path, use_git_dates: bool = True) -> dict[str, Any]:
	"""Walk a repo checkout and build the index consumers read."""
	# 1. Repo manifest
	# 2. Every folder under artifacts/ is one artifact
	# 3. Summaries only (never document contents)

	root = Path(root)
	shelf_path = root / SHELF_MANIFEST
	if not shelf_path.is_file():
		raise ShelfFormatError(f"missing {SHELF_MANIFEST} at repo root.")

	# 1. Repo manifest
	shelf = validate_shelf_manifest(_read_json(shelf_path))

	# 2. Every folder under artifacts/ is one artifact
	artifacts_dir = root / ARTIFACTS_DIR
	entries = []
	if artifacts_dir.is_dir():
		for folder in sorted(p for p in artifacts_dir.iterdir() if p.is_dir()):
			artifact = load_artifact(folder)
			updated = artifact.get("updated")
			if updated is None and use_git_dates:
				updated = _git_last_commit_date(root, folder)
			entries.append(index_entry(artifact, folder.relative_to(root).as_posix(), updated))

	# 3. Summaries only (never document contents)
	return {
		"format": FORMAT_VERSION,
		"generated_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
		"shelf": shelf,
		"artifacts": entries,
	}


def index_entry(artifact: dict[str, Any], path: str, updated: str | None) -> dict[str, Any]:
	"""One index row: catalog metadata and counts, no install payload."""
	steps = artifact["steps"]
	return {
		"id": artifact["id"],
		"path": path,
		"title": artifact["title"],
		"category": artifact["category"],
		"app": artifact["app"],
		"version": artifact["version"],
		"description": artifact["description"],
		"tags": artifact["tags"],
		"license": artifact["license"],
		"requires": artifact["requires"],
		"install_mode": artifact["install"]["mode"],
		"inputs_count": len(artifact["inputs"]),
		"documents_count": sum(1 for s in steps if s["type"] == STEP_DOCUMENT),
		"files_count": sum(1 for s in steps if s["type"] == STEP_FILE),
		"has_readme": bool(artifact.get("has_readme")),
		"has_preview": bool(artifact.get("has_preview")),
		"hash": artifact["hash"],
		"updated": updated,
	}


def validate_index(data: Any) -> dict[str, Any]:
	"""Check an index fetched from a remote before trusting it."""
	if not isinstance(data, dict):
		raise ShelfFormatError("index.json must be a JSON object.")
	_require_format(data, "index.json")
	shelf = validate_shelf_manifest(data.get("shelf"))
	rows = data.get("artifacts")
	if not isinstance(rows, list):
		raise ShelfFormatError("index.json artifacts must be a list.")
	seen: set[str] = set()
	entries = []
	for row in rows:
		if not isinstance(row, dict):
			raise ShelfFormatError("index.json artifact rows must be objects.")
		aid = _require_str(row, "id", "index.json artifact")
		if aid in seen:
			raise ShelfFormatError(f"index.json lists artifact {aid!r} twice.")
		seen.add(aid)
		for key in ("title", "category", "app", "version", "hash", "path"):
			_require_str(row, key, f"index.json artifact {aid}")
		entries.append(row)
	return {
		"format": FORMAT_VERSION,
		"generated_at": data.get("generated_at"),
		"shelf": shelf,
		"artifacts": entries,
	}


def write_index(root: str | Path, index: dict[str, Any]) -> Path:
	"""Write index.json with stable formatting so diffs stay readable."""
	out = Path(root) / INDEX_FILE
	out.write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
	return out


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_format(data: dict[str, Any], where: str) -> None:
	fmt = data.get("format")
	if fmt != FORMAT_VERSION:
		raise ShelfFormatError(f"{where}: format must be {FORMAT_VERSION} (got {fmt!r}).")


def _require_str(data: dict[str, Any], key: str, where: str) -> str:
	value = data.get(key)
	if not isinstance(value, str) or not value.strip():
		raise ShelfFormatError(f"{where}: {key} is required.")
	return value.strip()


def _parse_date(value: Any, where: str) -> str:
	if not isinstance(value, str):
		raise ShelfFormatError(f"{where} must be an ISO date string.")
	try:
		return datetime.fromisoformat(value.replace("Z", "+00:00")).date().isoformat()
	except ValueError as exc:
		raise ShelfFormatError(f"{where} must be an ISO date string.") from exc


def _read_json(path: Path) -> Any:
	try:
		return json.loads(path.read_text(encoding="utf-8"))
	except ValueError as exc:
		raise ShelfFormatError(f"{path.name}: invalid JSON ({exc}).") from exc


def _git_last_commit_date(root: Path, folder: Path) -> str | None:
	try:
		out = subprocess.run(
			["git", "log", "-1", "--format=%cI", "--", folder.relative_to(root).as_posix()],
			cwd=root,
			capture_output=True,
			text=True,
			check=False,
			timeout=10,
		)
	except (OSError, subprocess.SubprocessError):
		return None
	stamp = out.stdout.strip()
	if out.returncode != 0 or not stamp:
		return None
	return stamp[:10]


def main(argv: list[str] | None = None) -> int:
	"""CLI: ``python spec.py [repo_root]`` builds and writes index.json."""
	import sys

	args = argv if argv is not None else sys.argv[1:]
	root = Path(args[0]) if args else Path.cwd()
	try:
		index = build_index(root)
	except ShelfFormatError as exc:
		print(f"error: {exc}", file=sys.stderr)
		return 1
	path = write_index(root, index)
	print(f"wrote {path} with {len(index['artifacts'])} artifact(s)")
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
