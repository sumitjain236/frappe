# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

"""Tests for the Shelf repo format, GitHub access check, and consumer sync."""

from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path
from unittest.mock import patch

import frappe
from frappe.shelf import api
from frappe.shelf.repo import spec
from frappe.shelf.repo.github import (
	CODE_BRANCH_NOT_FOUND,
	CODE_INVALID_TOKEN,
	CODE_NEEDS_TOKEN,
	CODE_NETWORK_ERROR,
	CODE_NOT_A_SHELF,
	CODE_NOT_FOUND,
	CODE_PRIVATE_OK,
	CODE_PUBLIC_OK,
	AccessResult,
	RepoRef,
	check_access,
	parse_repo_url,
)
from frappe.tests import IntegrationTestCase

SAMPLE_REPO = Path(__file__).resolve().parent / "sample_repo"
SHELF_JSON = (SAMPLE_REPO / "shelf.json").read_bytes()


class FakeResponse:
	def __init__(self, status: int, content: bytes = b"") -> None:
		self.status_code = status
		self.content = content

	def json(self):
		return json.loads(self.content)


class FakeSession:
	"""Routes raw and API requests to canned responses keyed by (url_kind, has_token)."""

	def __init__(
		self,
		raw: dict[bool, FakeResponse] | None = None,
		api: dict[bool, FakeResponse] | None = None,
		fail=False,
	):
		self.raw = raw or {}
		self.api = api or {}
		self.fail = fail
		self.calls: list[tuple[str, bool]] = []

	def get(self, url: str, headers: dict, timeout=None):
		import requests

		has_token = "Authorization" in headers
		self.calls.append((url, has_token))
		if self.fail:
			raise requests.ConnectionError("offline")
		table = self.api if url.startswith("https://api.github.com") else self.raw
		return table.get(has_token, table.get(False, FakeResponse(500)))


class TestRepoUrlParsing(unittest.TestCase):
	def test_accepts_common_forms(self) -> None:
		for value, expected in [
			("https://github.com/frappe/shelf-gst", RepoRef("frappe", "shelf-gst", "main")),
			("https://github.com/frappe/shelf-gst.git", RepoRef("frappe", "shelf-gst", "main")),
			("https://github.com/frappe/shelf-gst/tree/develop", RepoRef("frappe", "shelf-gst", "develop")),
			("github.com/frappe/shelf-gst/", RepoRef("frappe", "shelf-gst", "main")),
			("frappe/shelf-gst", RepoRef("frappe", "shelf-gst", "main")),
		]:
			self.assertEqual(parse_repo_url(value), expected, value)

	def test_explicit_branch_wins(self) -> None:
		self.assertEqual(parse_repo_url("https://github.com/a/b/tree/x", "y").branch, "y")

	def test_rejects_other_hosts_and_garbage(self) -> None:
		for value in ("https://gitlab.com/a/b", "not a url", "", "a/b/c/d"):
			with self.assertRaises(ValueError):
				parse_repo_url(value)


class TestAccessCheck(unittest.TestCase):
	ref = RepoRef("frappe", "shelf-gst", "main")

	def test_public_repo_without_token(self) -> None:
		session = FakeSession(raw={False: FakeResponse(200, SHELF_JSON)})
		result = check_access(self.ref, None, session)
		self.assertTrue(result.ok)
		self.assertEqual(result.code, CODE_PUBLIC_OK)
		self.assertEqual(result.access, "Public")
		self.assertEqual(result.shelf["id"], "frappe-gst")
		self.assertFalse(result.token_required)

	def test_public_repo_reports_pasted_token_as_unneeded(self) -> None:
		session = FakeSession(raw={False: FakeResponse(200, SHELF_JSON)})
		result = check_access(self.ref, "ghp_x", session)
		self.assertTrue(result.ok)
		self.assertIn("not needed", result.message)
		self.assertTrue(
			all(not has_token for _, has_token in session.calls), "token must not be sent to a public repo"
		)

	def test_private_repo_with_working_token(self) -> None:
		session = FakeSession(raw={False: FakeResponse(404), True: FakeResponse(200, SHELF_JSON)})
		result = check_access(self.ref, "ghp_x", session)
		self.assertTrue(result.ok)
		self.assertEqual(result.code, CODE_PRIVATE_OK)
		self.assertEqual(result.access, "Private")
		self.assertTrue(result.token_required)
		self.assertTrue(result.token_used)

	def test_private_repo_without_token_asks_for_one(self) -> None:
		session = FakeSession(raw={False: FakeResponse(404)}, api={False: FakeResponse(404, b"{}")})
		result = check_access(self.ref, None, session)
		self.assertFalse(result.ok)
		self.assertEqual(result.code, CODE_NEEDS_TOKEN)
		self.assertTrue(result.token_required)

	def test_bad_token(self) -> None:
		session = FakeSession(raw={False: FakeResponse(404), True: FakeResponse(401)})
		result = check_access(self.ref, "bad", session)
		self.assertEqual(result.code, CODE_INVALID_TOKEN)

	def test_token_that_cannot_see_repo(self) -> None:
		session = FakeSession(
			raw={False: FakeResponse(404), True: FakeResponse(404)}, api={True: FakeResponse(404, b"{}")}
		)
		result = check_access(self.ref, "ghp_x", session)
		self.assertEqual(result.code, CODE_NOT_FOUND)

	def test_wrong_branch_reports_default_branch(self) -> None:
		meta = json.dumps({"default_branch": "develop", "private": False}).encode()
		session = FakeSession(raw={False: FakeResponse(404)}, api={False: FakeResponse(200, meta)})
		result = check_access(self.ref, None, session)
		self.assertEqual(result.code, CODE_BRANCH_NOT_FOUND)
		self.assertEqual(result.default_branch, "develop")
		self.assertEqual(result.access, "Public")

	def test_reachable_repo_that_is_not_a_shelf(self) -> None:
		meta = json.dumps({"default_branch": "main", "private": True}).encode()
		session = FakeSession(
			raw={False: FakeResponse(404), True: FakeResponse(404)}, api={True: FakeResponse(200, meta)}
		)
		result = check_access(self.ref, "ghp_x", session)
		self.assertEqual(result.code, CODE_NOT_A_SHELF)
		self.assertEqual(result.access, "Private")

	def test_invalid_shelf_json_is_not_a_shelf(self) -> None:
		session = FakeSession(raw={False: FakeResponse(200, b'{"format": 1}')})
		result = check_access(self.ref, None, session)
		self.assertEqual(result.code, CODE_NOT_A_SHELF)

	def test_network_error(self) -> None:
		result = check_access(self.ref, None, FakeSession(fail=True))
		self.assertEqual(result.code, CODE_NETWORK_ERROR)


class TestRepoFormat(unittest.TestCase):
	def test_sample_repo_builds_index(self) -> None:
		index = spec.build_index(SAMPLE_REPO, use_git_dates=False)
		by_id = {row["id"]: row for row in index["artifacts"]}
		self.assertEqual(set(by_id), {"gstr-3b-summary", "gst-tax-invoice-a4", "e-invoice-auto-submit"})
		self.assertEqual(by_id["gstr-3b-summary"]["documents_count"], 3)
		self.assertEqual(by_id["gstr-3b-summary"]["inputs_count"], 1)
		self.assertEqual(by_id["gst-tax-invoice-a4"]["files_count"], 2)
		self.assertEqual(by_id["gst-tax-invoice-a4"]["documents_count"], 2)
		self.assertTrue(by_id["gstr-3b-summary"]["has_readme"])
		self.assertEqual(len(by_id["gstr-3b-summary"]["hash"]), 64)

	def test_committed_index_is_fresh(self) -> None:
		committed = json.loads((SAMPLE_REPO / "index.json").read_text())
		rebuilt = spec.build_index(SAMPLE_REPO, use_git_dates=False)

		def strip(idx):
			return [{k: v for k, v in row.items() if k != "updated"} for row in idx["artifacts"]]

		self.assertEqual(strip(committed), strip(rebuilt))
		self.assertEqual(committed["shelf"], rebuilt["shelf"])

	def test_ci_script_matches_module(self) -> None:
		module = Path(spec.__file__).read_text()
		self.assertEqual((SAMPLE_REPO / "scripts" / "build_index.py").read_text(), module)

	def test_hash_changes_with_file_content(self) -> None:
		artifact = spec.load_artifact(SAMPLE_REPO / "artifacts" / "e-invoice-auto-submit")
		files = dict(artifact["files"])
		path = artifact["steps"][0]["path"]
		files[path] = files[path] + b"\n# changed"
		self.assertNotEqual(spec.compute_package_hash(artifact, files), artifact["hash"])

	def test_validate_index_round_trip(self) -> None:
		index = spec.build_index(SAMPLE_REPO, use_git_dates=False)
		self.assertEqual(len(spec.validate_index(json.loads(json.dumps(index)))["artifacts"]), 3)

	def test_manifest_rejections(self) -> None:
		base = json.loads((SAMPLE_REPO / "artifacts" / "gstr-3b-summary" / "artifact.json").read_text())

		def broken(mutate):
			data = copy.deepcopy(base)
			mutate(data)
			with self.assertRaises(spec.ShelfFormatError):
				spec.validate_artifact_manifest(data, "gstr-3b-summary")

		broken(lambda d: d.update(id="Other"))
		broken(lambda d: d.update(version="1.3"))
		broken(lambda d: d["steps"][1]["link_rules"]["company"].update(prompt_key="nope"))
		broken(lambda d: d["steps"][1]["link_rules"]["report_name"].update(sequence=2))
		broken(lambda d: d["steps"][1]["link_rules"]["report_name"].pop("field"))
		broken(lambda d: d["steps"].append({"sequence": 3, "type": "document", "path": "documents/x.json"}))
		broken(lambda d: d["steps"].append({"sequence": 9, "type": "file", "path": "../secret.txt"}))
		broken(
			lambda d: d["steps"].append(
				{"sequence": 9, "type": "document", "path": "documents/x.json", "on_conflict": "yolo"}
			)
		)
		broken(lambda d: d.update(install={"mode": "app"}))
		broken(lambda d: d["inputs"].append({"key": "company", "fieldtype": "Data"}))


def _fake_ok(ref: RepoRef, token=None, session=None) -> AccessResult:
	shelf = spec.validate_shelf_manifest(json.loads(SHELF_JSON))
	return AccessResult(True, CODE_PUBLIC_OK, "Public", "Connected (fake).", "main", shelf)


class TestShelfSourceAndSync(IntegrationTestCase):
	"""Shelf Source save runs the check; sync mirrors index.json into catalog entries."""

	def setUp(self) -> None:
		super().setUp()
		frappe.db.delete("Shelf Install Log", {"source": "Shelf Test GST"})
		frappe.db.delete("Shelf Catalog Entry", {"source": "Shelf Test GST"})
		frappe.delete_doc("Shelf Source", "Shelf Test GST", force=True, ignore_missing=True)
		self.index = spec.build_index(SAMPLE_REPO, use_git_dates=False)

	def _make_source(self):
		with patch("frappe.shelf.doctype.shelf_source.shelf_source.check_access", side_effect=_fake_ok):
			return frappe.get_doc(
				{"doctype": "Shelf Source", "title": "Shelf Test GST", "repo_url": "frappe/shelf-gst"}
			).insert()

	def test_save_normalises_url_and_records_check(self) -> None:
		source = self._make_source()
		self.assertEqual(source.repo_url, "https://github.com/frappe/shelf-gst")
		self.assertEqual(source.branch, "main")
		self.assertEqual(source.connection_status, "Connected")
		self.assertEqual(source.access, "Public")
		self.assertEqual(source.shelf_domain, "GST & Compliance")
		self.assertEqual(source.publisher_name, "Frappe")

	def test_failed_check_blocks_save(self) -> None:
		def fail(ref, token=None, session=None):
			return AccessResult(False, CODE_NEEDS_TOKEN, "Unknown", "private, add a token")

		with patch("frappe.shelf.doctype.shelf_source.shelf_source.check_access", side_effect=fail):
			with self.assertRaises(frappe.ValidationError):
				frappe.get_doc(
					{"doctype": "Shelf Source", "title": "Shelf Test GST", "repo_url": "x/y"}
				).insert()

	def test_sync_creates_updates_and_prunes_entries(self) -> None:
		source = self._make_source()

		with patch("frappe.shelf.sync.fetch_index", return_value=self.index):
			first = source.sync()
			self.assertTrue(first["changed"])
			self.assertEqual(first["artifact_count"], 3)
			self.assertTrue(
				frappe.db.exists(
					"Shelf Catalog Entry", {"source": source.name, "artifact_id": "gstr-3b-summary"}
				)
			)

			source.reload()
			self.assertEqual(source.artifact_count, 3)
			self.assertEqual(source.sync()["changed"], False)

		# Bump one artifact, drop another: entry updated, stale entry removed
		smaller = copy.deepcopy(self.index)
		smaller["artifacts"] = [row for row in smaller["artifacts"] if row["id"] != "e-invoice-auto-submit"]
		smaller["artifacts"][0]["version"] = "9.9.9"
		smaller["artifacts"][0]["hash"] = "f" * 64
		with patch("frappe.shelf.sync.fetch_index", return_value=smaller):
			source.reload()
			self.assertTrue(source.sync()["changed"])
		self.assertFalse(
			frappe.db.exists(
				"Shelf Catalog Entry", {"source": source.name, "artifact_id": "e-invoice-auto-submit"}
			)
		)
		self.assertEqual(
			frappe.db.get_value(
				"Shelf Catalog Entry",
				{"source": source.name, "artifact_id": smaller["artifacts"][0]["id"]},
				"version",
			),
			"9.9.9",
		)

	def test_get_catalog_merges_install_state(self) -> None:
		source = self._make_source()
		with patch("frappe.shelf.sync.fetch_index", return_value=self.index):
			source.sync()
		rows = {row["id"]: row for row in self.index["artifacts"]}
		frappe.get_doc(
			{
				"doctype": "Shelf Install Log",
				"source": source.name,
				"artifact_id": "gstr-3b-summary",
				"title": "GSTR-3B",
				"version": "1.2.0",
				"package_hash": "0" * 64,
				"status": "Installed",
				"is_current": 1,
			}
		).insert()
		frappe.get_doc(
			{
				"doctype": "Shelf Install Log",
				"source": source.name,
				"artifact_id": "gst-tax-invoice-a4",
				"title": "Invoice",
				"version": rows["gst-tax-invoice-a4"]["version"],
				"package_hash": rows["gst-tax-invoice-a4"]["hash"],
				"status": "Installed",
				"is_current": 1,
			}
		).insert()

		catalog = api.get_catalog(source.name)
		by_id = {row["artifact_id"]: row for row in catalog["artifacts"]}
		self.assertEqual(by_id["gstr-3b-summary"]["state"], "update")
		self.assertEqual(by_id["gst-tax-invoice-a4"]["state"], "installed")
		self.assertEqual(by_id["e-invoice-auto-submit"]["state"], "available")
		self.assertEqual(catalog["stats"], {"total": 3, "installed": 2, "updates": 1, "attention": 0})
		self.assertEqual(by_id["gstr-3b-summary"]["tags"], ["gst", "gstr-3b", "returns"])

		tabs = {row["name"]: row for row in api.get_sources()}
		self.assertEqual(tabs[source.name]["updates_count"], 1)
		self.assertEqual(tabs[source.name]["installed_count"], 2)

	def tearDown(self) -> None:
		frappe.db.rollback()
		super().tearDown()
