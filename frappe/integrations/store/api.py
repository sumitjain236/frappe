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
				"route_label": frappe.scrub(row.label or row.name),
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
			if route_connection in {
				connection.get("route_label"),
				frappe.scrub(connection.get("label") or ""),
				connection.get("label"),
				connection.get("name"),
			}:
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
	filtered_items = filter_catalog_items(
		items,
		search=search,
		app=app,
		category=category,
		tag=tag,
		installed_apps=installed_apps,
	)
	return _annotate_items_with_install_status(filtered_items, connection.get_normalized_base_url())


@frappe.whitelist()
def get_catalog_item(store_connection: str, item: str) -> dict:
	"""Fetch preview metadata for one Store Item from the host."""
	connection = _get_store_connection(store_connection)
	catalog_item = fetch_catalog_item(connection, item)
	item_name = catalog_item.get("name")
	status = _get_install_status_map(
		connection.get_normalized_base_url(),
		[item_name] if item_name else [],
	)
	annotated_item = dict(catalog_item)
	install_log = status.get(item_name)
	annotated_item["installed"] = _is_item_installed(catalog_item, install_log)
	return annotated_item


def _annotate_items_with_install_status(items: list[dict], base_url: str) -> list[dict]:
	item_names = [item.get("name") for item in items if item.get("name")]
	status = _get_install_status_map(base_url, item_names)
	annotated_items: list[dict] = []

	for item in items:
		annotated_item = dict(item)
		install_log = status.get(item.get("name"))
		annotated_item["installed"] = _is_item_installed(item, install_log)
		annotated_items.append(annotated_item)

	return annotated_items


def _get_install_status_map(base_url: str, item_names: list[str]) -> dict[str, dict]:
	if not item_names:
		return {}

	install_logs = frappe.get_all(
		"Store Install Log",
		filters={
			"base_url": base_url,
			"status": "Installed",
			"store_item": ["in", item_names],
		},
		fields=["store_item", "package_hash"],
		order_by="creation desc",
	)

	latest_logs: dict[str, dict] = {}
	for install_log in install_logs:
		if install_log.get("store_item") not in latest_logs:
			latest_logs[install_log["store_item"]] = install_log

	return latest_logs


def _is_item_installed(item: dict, install_log: dict | None) -> bool:
	if not install_log:
		return False

	item_hash = item.get("package_hash")
	log_hash = install_log.get("package_hash")

	if item_hash and log_hash:
		return item_hash == log_hash

	return True


def _get_store_connection(store_connection: str):
	settings = frappe.get_single("Store Connection")
	settings.check_permission("read")
	return settings.get_connection_row(store_connection)
