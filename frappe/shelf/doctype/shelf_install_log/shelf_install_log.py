# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

"""Shelf Install Log: what this site installed, from where, and what happened."""

from __future__ import annotations

from frappe.model.document import Document


class ShelfInstallLog(Document):
	"""Audit row per install attempt. The orchestrator marks the successful one is_current."""
