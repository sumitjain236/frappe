# Copyright (c) 2026, Frappe Technologies and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.integrations.store.catalog import ping_catalog
from frappe.model.document import Document


class StoreConnection(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.integrations.doctype.store_connection_detail.store_connection_detail import (
			StoreConnectionDetail,
		)
		from frappe.types import DF

		connections: DF.Table[StoreConnectionDetail]
	# end: auto-generated types

	def validate(self):
		for row in self.connections:
			row.validate()

		self.validate_unique_connections()
		self.validate_default_connections()

	def validate_unique_connections(self):
		"""Ensure labels and base URLs are unique across connection rows."""
		labels: set[str] = set()
		base_urls: set[str] = set()

		for row in self.connections:
			label = (row.label or "").strip()
			label_key = label.casefold()
			base_url = row.get_normalized_base_url()

			if label_key in labels:
				frappe.throw(
					_("Connection label {0} already exists").format(frappe.bold(label)),
					title=_("Duplicate Connection"),
				)
			if base_url in base_urls:
				frappe.throw(
					_("Connection base URL {0} already exists").format(frappe.bold(base_url)),
					title=_("Duplicate Connection"),
				)

			labels.add(label_key)
			base_urls.add(base_url)

	def validate_default_connections(self):
		"""Keep a single default among enabled connections; lone connection is always default."""
		enabled_rows = [row for row in self.connections if row.enabled]

		for row in self.connections:
			if not row.enabled:
				row.is_default = 0

		if not enabled_rows:
			return

		if len(enabled_rows) == 1:
			enabled_rows[0].is_default = 1
			return

		default_rows = [row for row in enabled_rows if row.is_default]
		if len(default_rows) > 1:
			keep_default = default_rows[-1].name
			for row in enabled_rows:
				row.is_default = 1 if row.name == keep_default else 0
			return

		if not default_rows:
			enabled_rows[0].is_default = 1

	@frappe.whitelist()
	def verify_store_host(self, connection: str):
		"""Ping the host Store catalog to confirm URL, app, and credentials."""
		row = self.get_connection_row(connection)
		return ping_catalog(row)

	def get_connection_row(self, connection: str):
		"""Return one configured connection row by child row name."""
		for row in self.connections:
			if row.name == connection:
				return row

		frappe.throw(
			_("Store Connection {0} not found").format(frappe.bold(connection)),
			title=_("Missing Connection"),
		)
