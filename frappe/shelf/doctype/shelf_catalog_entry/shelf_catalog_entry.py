# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

"""Shelf Catalog Entry: one artifact row cached from a source's index.json."""

from __future__ import annotations

from frappe.model.document import Document


class ShelfCatalogEntry(Document):
	"""Read-only cache; rows are written by frappe.shelf.sync only."""
