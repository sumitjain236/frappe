# Copyright (c) 2026, Frappe Technologies and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.integrations.store.catalog import (
	fetch_catalog_item,
	fetch_catalog_list,
	filter_catalog_items,
	get_catalog_categories,
	get_catalog_tags,
)


@frappe.whitelist()
def get_store_connections() -> list[dict]:
	"""List enabled Store Connections for the browse UI."""
	frappe.only_for("System Manager")
	settings = frappe.get_single("Store Connection")
	settings.check_permission("read")

	connections = []
	for row in settings.connections:
		if not row.enabled:
			continue

		connections.append(
			{
				"name": row.name,
				"label": row.label,
				"base_url": row.get_normalized_base_url(),
				"is_default": row.is_default,
			}
		)

	return sorted(connections, key=lambda row: (not row["is_default"], row["label"]))


def resolve_store_connection(connections: list[dict], route_connection: str | None = None) -> str | None:
	"""Pick the Store Connection to open in the browse UI."""
	if not connections:
		return None

	if route_connection:
		for connection in connections:
			if connection.get("name") == route_connection:
				return connection.get("name")

	for connection in connections:
		if connection.get("is_default"):
			return connection.get("name")

	return connections[0].get("name")


@frappe.whitelist()
def get_catalog_filters(store_connection: str) -> dict:
	"""Return filter options for a host catalog and this site's installed apps."""
	connection = _get_store_connection(store_connection)
	installed_apps = sorted(frappe.get_installed_apps())
	items = filter_catalog_items(
		fetch_catalog_list(connection),
		installed_apps=installed_apps,
	)
	return {
		"apps": installed_apps,
		"categories": get_catalog_categories(items),
		"tags": get_catalog_tags(items),
	}


@frappe.whitelist()
def get_catalog_list(
	store_connection: str,
	search: str | None = None,
	app: str | None = None,
	category: str | None = None,
	tag: str | None = None,
) -> list[dict]:
	"""Fetch published items from a host catalog with server-side filters."""
	connection = _get_store_connection(store_connection)
	installed_apps = sorted(frappe.get_installed_apps())
	items = fetch_catalog_list(connection)
	return filter_catalog_items(
		items,
		search=search,
		app=app,
		category=category,
		tag=tag,
		installed_apps=installed_apps,
	)


@frappe.whitelist()
def get_catalog_item(store_connection: str, item: str) -> dict:
	"""Fetch preview metadata for one Store Item from the host."""
	connection = _get_store_connection(store_connection)
	return fetch_catalog_item(connection, item)


def _get_store_connection(store_connection: str):
	settings = frappe.get_single("Store Connection")
	settings.check_permission("read")
	return settings.get_connection_row(store_connection)
