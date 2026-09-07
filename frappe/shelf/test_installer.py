# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

"""Installer tests against a local artifact built from Frappe core DocTypes."""

from __future__ import annotations

import json
import shutil
import struct
import tempfile
import zlib
from pathlib import Path
from unittest.mock import patch

import frappe
from frappe.shelf import api, installer
from frappe.shelf.repo import spec
from frappe.shelf.repo.github import CODE_PUBLIC_OK, AccessResult
from frappe.shelf.test_shelf import SHELF_JSON
from frappe.tests import IntegrationTestCase

SOURCE = "Shelf Installer Test"
ARTIFACT = "shelf-test-kit"
LETTER_HEAD = "Shelf Test Letter Head"
REPORT = "Shelf Test Report"
TODO = "shelf-test-todo"


def _png() -> bytes:
	rows = b"".join(b"\x00" + bytes([200] * 8) for _ in range(4))
	chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)  # noqa: E731
	return (
		b"\x89PNG\r\n\x1a\n"
		+ chunk(b"IHDR", struct.pack(">IIBBBBB", 8, 4, 8, 0, 0, 0, 0))
		+ chunk(b"IDAT", zlib.compress(rows))
		+ chunk(b"IEND", b"")
	)


def write_repo(
	root: Path, todo_description: str = "Hello from Shelf", todo_priority_rule: bool = False
) -> None:
	"""A shelf with one artifact: file → Letter Head → Report → attached notes → ToDo."""
	root.mkdir(parents=True, exist_ok=True)
	(root / "shelf.json").write_bytes(SHELF_JSON)
	a = root / "artifacts" / ARTIFACT
	(a / "documents").mkdir(parents=True, exist_ok=True)
	(a / "files").mkdir(exist_ok=True)
	(a / "files" / "logo.png").write_bytes(_png())
	(a / "files" / "notes.md").write_text("# Notes\nInstalled by a test.\n")

	todo_rules = {
		"reference_name": {"resolver": "step", "sequence": 3, "field": "name"},
		"description": {"resolver": "prompt", "prompt_key": "note_text"},
	}
	if todo_priority_rule:
		todo_rules["priority"] = {"resolver": "prompt", "prompt_key": "priority"}

	manifest = {
		"format": 1,
		"id": ARTIFACT,
		"title": "Shelf Test Kit",
		"category": "Other",
		"app": "frappe",
		"version": "1.0.0",
		"description": "Exercises every step type and resolver.",
		"requires": [{"app": "frappe", "min_version": "14.0.0"}],
		"inputs": [
			{"key": "note_text", "label": "Note text", "fieldtype": "Data", "mandatory": True},
			{"key": "priority", "label": "Priority", "fieldtype": "Data"},
			{"key": "assign_to", "label": "Assign to", "fieldtype": "Link", "options": "User"},
		],
		"steps": [
			{"sequence": 1, "type": "file", "path": "files/logo.png", "is_private": False},
			{
				"sequence": 2,
				"type": "document",
				"path": "documents/letter-head.json",
				"link_rules": {"image": {"resolver": "file", "sequence": 1}},
			},
			{"sequence": 3, "type": "document", "path": "documents/report.json", "on_conflict": "copy"},
			{
				"sequence": 4,
				"type": "file",
				"path": "files/notes.md",
				"is_private": True,
				"attach_to": {"resolver": "step", "sequence": 3},
			},
			{
				"sequence": 5,
				"type": "document",
				"path": "documents/todo.json",
				"on_conflict": "replace",
				"link_rules": todo_rules,
			},
		],
	}
	(a / "artifact.json").write_text(json.dumps(manifest, indent=1))
	(a / "documents" / "letter-head.json").write_text(
		json.dumps(
			{
				"doctype": "Letter Head",
				"name": LETTER_HEAD,
				"letter_head_name": LETTER_HEAD,
				"source": "Image",
				"image": None,
				"is_default": 0,
				"disabled": 0,
			}
		)
	)
	(a / "documents" / "report.json").write_text(
		json.dumps(
			{
				"doctype": "Report",
				"name": REPORT,
				"report_name": REPORT,
				"ref_doctype": "ToDo",
				"report_type": "Query Report",
				"is_standard": "No",
				"query": "select name from `tabToDo`",
				"roles": [{"role": "System Manager"}],
			}
		)
	)
	(a / "documents" / "todo.json").write_text(
		json.dumps(
			{
				"doctype": "ToDo",
				"name": TODO,
				"description": todo_description,
				"status": "Open",
				"reference_type": "Report",
				"reference_name": None,
				"priority": "Medium",
			}
		)
	)


class LocalClient:
	def __init__(self, root: Path) -> None:
		self.root = root

	def get_file(self, path: str) -> bytes:
		return (self.root / path).read_bytes()


def _fake_ok(ref, token=None, session=None) -> AccessResult:
	return AccessResult(
		True, CODE_PUBLIC_OK, "Public", "ok", "main", spec.validate_shelf_manifest(json.loads(SHELF_JSON))
	)


class TestInstaller(IntegrationTestCase):
	def setUp(self) -> None:
		super().setUp()
		self.tmp = Path(tempfile.mkdtemp(prefix="shelf-repo-"))
		write_repo(self.tmp)
		self._cleanup_site()
		with patch("frappe.shelf.doctype.shelf_source.shelf_source.check_access", side_effect=_fake_ok):
			self.source = frappe.get_doc(
				{"doctype": "Shelf Source", "title": SOURCE, "repo_url": "test/kit"}
			).insert()
		self._sync()
		self._patch = patch("frappe.shelf.installer.get_client", return_value=LocalClient(self.tmp))
		self._patch.start()

	def tearDown(self) -> None:
		self._patch.stop()
		frappe.db.rollback()
		self._cleanup_site()
		frappe.db.commit()
		shutil.rmtree(self.tmp, ignore_errors=True)
		super().tearDown()

	def _cleanup_site(self) -> None:
		for doctype, names in (
			("ToDo", [TODO]),
			(
				"File",
				frappe.get_all("File", filters={"file_name": ["in", ["logo.png", "notes.md"]]}, pluck="name"),
			),
			("Report", [REPORT, f"{REPORT} (Shelf)", f"{REPORT} (Shelf 2)"]),
			("Letter Head", [LETTER_HEAD, f"{LETTER_HEAD} (Shelf)", f"{LETTER_HEAD} (Shelf 2)"]),
		):
			for name in names:
				frappe.delete_doc(doctype, name, force=True, ignore_missing=True, ignore_permissions=True)
		frappe.db.delete("Shelf Install Log", {"source": SOURCE})
		frappe.db.delete("Shelf Catalog Entry", {"source": SOURCE})
		frappe.delete_doc("Shelf Source", SOURCE, force=True, ignore_missing=True)

	def _sync(self) -> None:
		index = spec.build_index(self.tmp, use_git_dates=False)
		with patch("frappe.shelf.sync.fetch_index", return_value=index):
			self.source.reload()
			self.source.sync(force=True)

	def _install(self, **kwargs):
		return installer.install_artifact(
			self.source, ARTIFACT, kwargs.pop("inputs", {"note_text": "hello"}), **kwargs
		)

	# --- plan -------------------------------------------------------------

	def test_plan_describes_steps_and_requirements(self) -> None:
		plan = installer.plan_install(self.source, ARTIFACT)
		self.assertEqual(plan["mode"], "install")
		self.assertTrue(plan["requirements"][0]["ok"])
		self.assertEqual(plan["requirements"][0]["app"], "frappe")
		self.assertEqual(
			[s["type"] for s in plan["steps"]], ["file", "document", "document", "file", "document"]
		)
		self.assertEqual(
			[s.get("action") for s in plan["steps"]],
			["uploaded", "created", "created", "uploaded", "created"],
		)
		self.assertEqual(plan["conflicts"], [])
		self.assertEqual(len(plan["inputs"]), 3)

	def test_plan_flags_existing_documents(self) -> None:
		frappe.get_doc(
			{"doctype": "Letter Head", "letter_head_name": LETTER_HEAD, "source": "HTML", "content": "x"}
		).insert()
		plan = installer.plan_install(self.source, ARTIFACT)
		conflict = plan["conflicts"][0]
		self.assertEqual(
			(conflict["sequence"], conflict["doctype"], conflict["copy_name"]),
			(2, "Letter Head", f"{LETTER_HEAD} (Shelf)"),
		)

	# --- install ----------------------------------------------------------

	def test_clean_install_runs_every_step(self) -> None:
		result = self._install()
		self.assertEqual(result["status"], "Installed", result)
		self.assertEqual(result["mode"], "install")
		self.assertEqual(
			[s["action"] for s in result["steps"]], ["uploaded", "created", "created", "uploaded", "created"]
		)

		logo_url = result["steps"][0]["file_url"]
		self.assertEqual(frappe.db.get_value("Letter Head", LETTER_HEAD, "image"), logo_url)
		self.assertTrue(frappe.db.exists("Report", REPORT))
		notes = frappe.get_doc("File", result["steps"][3]["file_doc"])
		self.assertEqual(
			(notes.attached_to_doctype, notes.attached_to_name, notes.is_private), ("Report", REPORT, 1)
		)
		todo = frappe.get_doc("ToDo", TODO)
		self.assertEqual(
			(todo.description, todo.reference_type, todo.reference_name), ("hello", "Report", REPORT)
		)

		log = frappe.get_doc("Shelf Install Log", result["log"])
		self.assertEqual((log.status, log.is_current, log.version), ("Installed", 1, "1.0.0"))
		self.assertEqual(json.loads(log.inputs)["note_text"], "hello")

		self.assertTrue(self._install()["unchanged"])
		self.assertEqual(api.get_catalog(self.source.name)["stats"]["installed"], 1)

	def test_missing_mandatory_input(self) -> None:
		with self.assertRaises(installer.InstallError):
			self._install(inputs={})

	def test_link_input_must_exist(self) -> None:
		with self.assertRaises(installer.InstallError):
			self._install(inputs={"note_text": "x", "assign_to": "nobody@example.invalid"})

	def test_conflict_needs_decision_then_copy(self) -> None:
		frappe.get_doc(
			{"doctype": "Letter Head", "letter_head_name": LETTER_HEAD, "source": "HTML", "content": "theirs"}
		).insert()
		with self.assertRaises(installer.NeedsDecisionError) as ctx:
			self._install()
		self.assertEqual([c["sequence"] for c in ctx.exception.conflicts], [2])
		self.assertFalse(
			frappe.db.exists("Shelf Install Log", {"source": SOURCE}), "nothing is written before a decision"
		)

		result = self._install(conflicts={"2": "copy"})
		self.assertEqual(result["status"], "Installed", result)
		self.assertEqual(result["steps"][1]["action"], "copied")
		copy_name = f"{LETTER_HEAD} (Shelf)"
		self.assertEqual(result["steps"][1]["target_name"], copy_name)
		self.assertEqual(frappe.db.get_value("Letter Head", copy_name, "letter_head_name"), copy_name)
		self.assertEqual(
			frappe.db.get_value("Letter Head", LETTER_HEAD, "content"),
			"theirs",
			"their document is untouched",
		)

	def test_copy_policy_renames_and_downstream_links_follow(self) -> None:
		frappe.get_doc(
			{
				"doctype": "Report",
				"report_name": REPORT,
				"ref_doctype": "ToDo",
				"report_type": "Report Builder",
				"is_standard": "No",
			}
		).insert()
		result = self._install()
		self.assertEqual(result["status"], "Installed", result)
		self.assertEqual(result["steps"][2]["action"], "copied")
		copied = f"{REPORT} (Shelf)"
		self.assertEqual(frappe.db.get_value("ToDo", TODO, "reference_name"), copied)
		self.assertEqual(
			frappe.db.get_value("File", result["steps"][3]["file_doc"], "attached_to_name"), copied
		)

	def test_skip_policy_keeps_theirs_and_links_to_it(self) -> None:
		frappe.get_doc(
			{
				"doctype": "Report",
				"report_name": REPORT,
				"ref_doctype": "ToDo",
				"report_type": "Report Builder",
				"is_standard": "No",
			}
		).insert()
		result = self._install(conflicts={3: "skip"})
		self.assertEqual(result["steps"][2]["action"], "skipped")
		self.assertEqual(frappe.db.get_value("Report", REPORT, "report_type"), "Report Builder")
		self.assertEqual(frappe.db.get_value("ToDo", TODO, "reference_name"), REPORT)

	# --- failure and resume -----------------------------------------------

	def test_failed_step_is_rolled_back_and_resumable(self) -> None:
		write_repo(self.tmp, todo_priority_rule=True)
		self._sync()
		result = self._install(inputs={"note_text": "hello", "priority": "Bogus"})
		self.assertEqual(result["status"], "Partially Installed", result)
		self.assertIn("Step 5", result["error"])
		self.assertEqual(len(result["steps"]), 4)
		self.assertTrue(frappe.db.exists("Report", REPORT))
		self.assertFalse(frappe.db.exists("ToDo", TODO))
		self.assertEqual(api.get_catalog(self.source.name)["stats"]["attention"], 1)

		resumed = self._install(inputs={"priority": "High"})
		self.assertEqual(resumed["status"], "Installed", resumed)
		self.assertEqual(resumed["mode"], "resume")
		self.assertEqual(resumed["log"], result["log"], "resume continues the same log")
		self.assertEqual(frappe.db.get_value("ToDo", TODO, "priority"), "High")
		self.assertEqual(
			json.loads(frappe.db.get_value("Shelf Install Log", resumed["log"], "inputs"))["note_text"],
			"hello",
		)

	def test_partial_install_then_changed_package_updates_owned_documents(self) -> None:
		write_repo(self.tmp, todo_priority_rule=True)
		self._sync()
		partial = self._install(inputs={"note_text": "hello", "priority": "Bogus"})
		self.assertEqual(partial["status"], "Partially Installed")

		write_repo(self.tmp, todo_description="fixed")  # package changes, so the hash changes
		self._sync()
		self.assertEqual(installer.plan_install(self.source, ARTIFACT)["mode"], "update")
		result = self._install(inputs={"priority": "High"})
		self.assertEqual(result["status"], "Installed", result)
		self.assertEqual(result["mode"], "update")
		self.assertEqual(
			[s["action"] for s in result["steps"]],
			["uploaded", "replaced", "replaced", "uploaded", "created"],
		)
		self.assertEqual(frappe.db.get_value("Shelf Install Log", partial["log"], "is_current"), 0)

	# --- update -----------------------------------------------------------

	def test_update_replaces_owned_documents_and_reuploads_files(self) -> None:
		first = self._install()
		old_notes = first["steps"][3]["file_doc"]

		write_repo(self.tmp, todo_description="Updated text")
		self._sync()
		self.assertEqual(api.get_catalog(self.source.name)["stats"]["updates"], 1)

		second = self._install(inputs={})
		self.assertEqual(second["status"], "Installed", second)
		self.assertEqual(second["mode"], "update")
		self.assertEqual(
			[s["action"] for s in second["steps"]],
			["uploaded", "replaced", "replaced", "uploaded", "replaced"],
		)
		self.assertEqual(
			frappe.db.get_value("ToDo", TODO, "description"),
			"hello",
			"inputs from the first install still win",
		)
		self.assertFalse(frappe.db.exists("File", old_notes), "old attachment removed")
		self.assertNotEqual(second["steps"][3]["file_doc"], old_notes)
		self.assertEqual(frappe.db.get_value("Shelf Install Log", first["log"], "is_current"), 0)
		self.assertEqual(frappe.db.get_value("Shelf Install Log", second["log"], "is_current"), 1)
		self.assertEqual(
			api.get_catalog(self.source.name)["stats"],
			{"total": 1, "installed": 1, "updates": 0, "attention": 0},
		)

	def test_update_after_copy_keeps_replacing_the_copy(self) -> None:
		frappe.get_doc(
			{"doctype": "Letter Head", "letter_head_name": LETTER_HEAD, "source": "HTML", "content": "theirs"}
		).insert()
		self._install(conflicts={2: "copy"})
		write_repo(self.tmp, todo_description="v2")
		self._sync()
		second = self._install(inputs={})
		self.assertEqual(second["steps"][1]["action"], "replaced")
		self.assertEqual(second["steps"][1]["target_name"], f"{LETTER_HEAD} (Shelf)")
		self.assertEqual(frappe.db.get_value("Letter Head", LETTER_HEAD, "content"), "theirs")

	# --- guards -----------------------------------------------------------

	def test_hash_mismatch_refuses_install(self) -> None:
		frappe.db.set_value(
			"Shelf Catalog Entry", {"source": SOURCE, "artifact_id": ARTIFACT}, "package_hash", "0" * 64
		)
		with self.assertRaisesRegex(installer.InstallError, "changed in the repository"):
			self._install()

	def test_missing_requirement_refuses_install(self) -> None:
		manifest_path = self.tmp / "artifacts" / ARTIFACT / "artifact.json"
		manifest = json.loads(manifest_path.read_text())
		manifest["requires"].append({"app": "no_such_app", "min_version": "1.0.0"})
		manifest_path.write_text(json.dumps(manifest))
		self._sync()
		with self.assertRaisesRegex(installer.InstallError, "no_such_app"):
			self._install()

	# --- uninstall --------------------------------------------------------

	def test_uninstall_removes_only_what_we_created(self) -> None:
		frappe.get_doc(
			{
				"doctype": "Report",
				"report_name": REPORT,
				"ref_doctype": "ToDo",
				"report_type": "Report Builder",
				"is_standard": "No",
			}
		).insert()
		result = self._install(conflicts={3: "skip"})
		gone = installer.uninstall_artifact(self.source, ARTIFACT)
		self.assertEqual(gone["status"], "Uninstalled")
		self.assertFalse(frappe.db.exists("Letter Head", LETTER_HEAD))
		self.assertFalse(frappe.db.exists("ToDo", TODO))
		self.assertFalse(frappe.db.exists("File", result["steps"][0]["file_doc"]))
		self.assertTrue(frappe.db.exists("Report", REPORT), "their skipped report stays")
		self.assertEqual(frappe.db.get_value("Shelf Install Log", result["log"], "is_current"), 0)
		self.assertEqual(api.get_catalog(self.source.name)["artifacts"][0]["state"], "available")
