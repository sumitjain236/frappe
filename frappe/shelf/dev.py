"""Developer helpers. Run with: bench --site <site> execute frappe.shelf.dev.seed_sample_source"""

from __future__ import annotations

from pathlib import Path

import frappe

SAMPLE_REPO = Path(__file__).resolve().parent / "sample_repo"


def seed_sample_source(title: str = "Sample GST Shelf") -> str:
	"""Connect the bundled sample repository as a Local Folder source and sync it."""
	if frappe.db.exists("Shelf Source", title):
		source = frappe.get_doc("Shelf Source", title)
	else:
		source = frappe.get_doc(
			{
				"doctype": "Shelf Source",
				"title": title,
				"provider": "Local Folder",
				"repo_url": str(SAMPLE_REPO),
			}
		).insert()
	source.sync(force=True)
	frappe.db.commit()
	print(f"{title}: {source.artifact_count} artifacts from {SAMPLE_REPO}")
	return source.name
