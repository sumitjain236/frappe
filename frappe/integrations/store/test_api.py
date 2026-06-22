# Copyright (c) 2026, Frappe Technologies and contributors
# For license information, please see license.txt

from unittest.mock import patch

import frappe
from frappe.integrations.doctype.store_connection.test_store_connection import (
	clear_store_connections,
	make_store_connection,
)
from frappe.integrations.store import api
from frappe.integrations.store.catalog import filter_catalog_items, get_catalog_categories, get_catalog_tags
from frappe.tests import IntegrationTestCase


SAMPLE_ITEMS = [
	{
		"name": "SI-00001",
		"title": "Sales Report",
		"app": "erpnext",
		"category": "Report",
		"description": "Monthly sales",
	},
	{
		"name": "SI-00002",
		"title": "Dashboard",
		"app": "frappe",
		"category": "Dashboard",
		"description": "Executive overview",
	},
	{
		"name": "SI-00003",
		"title": "Builder Theme",
		"app": "builder",
		"category": "Theme",
		"description": "Requires builder app",
	},
	{
		"name": "SI-00004",
		"title": "Hello API",
		"app": "erpnext",
		"category": "Server Script",
		"description": "API sample",
		"tags": ["api", "demo"],
	},
]

INSTALLED_APPS = ["frappe", "erpnext"]


class TestStoreCatalogFilters(IntegrationTestCase):
	def test_filter_catalog_items_by_app(self):
		items = filter_catalog_items(SAMPLE_ITEMS, app="erpnext")
		self.assertEqual({item["name"] for item in items}, {"SI-00001", "SI-00004"})

	def test_filter_catalog_items_by_category(self):
		items = filter_catalog_items(SAMPLE_ITEMS, category="Dashboard")
		self.assertEqual(len(items), 1)
		self.assertEqual(items[0]["name"], "SI-00002")

	def test_filter_catalog_items_by_search(self):
		items = filter_catalog_items(SAMPLE_ITEMS, search="sales")
		self.assertEqual(len(items), 1)
		self.assertEqual(items[0]["name"], "SI-00001")

	def test_filter_catalog_items_by_installed_apps(self):
		items = filter_catalog_items(SAMPLE_ITEMS, installed_apps=INSTALLED_APPS)
		self.assertEqual({item["name"] for item in items}, {"SI-00001", "SI-00002", "SI-00004"})

	def test_filter_catalog_items_by_tag(self):
		items = filter_catalog_items(SAMPLE_ITEMS, tag="api")
		self.assertEqual(len(items), 1)
		self.assertEqual(items[0]["name"], "SI-00004")

	def test_filter_catalog_items_search_matches_tags(self):
		items = filter_catalog_items(SAMPLE_ITEMS, search="demo")
		self.assertEqual(len(items), 1)
		self.assertEqual(items[0]["name"], "SI-00004")

	def test_get_catalog_tags(self):
		self.assertEqual(get_catalog_tags(SAMPLE_ITEMS), ["api", "demo"])

	def test_get_catalog_categories(self):
		items = filter_catalog_items(SAMPLE_ITEMS, installed_apps=INSTALLED_APPS)
		self.assertEqual(get_catalog_categories(items), ["Dashboard", "Report", "Server Script"])


class TestStoreAPI(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		clear_store_connections()

	def test_get_store_connections(self):
		make_store_connection(label="Publisher", base_url="https://publisher.example.com", enabled=1)
		make_store_connection(label="Disabled Host", base_url="https://disabled.example.com", enabled=0)

		connections = api.get_store_connections()
		self.assertEqual(len(connections), 1)
		self.assertEqual(connections[0]["label"], "Publisher")
		self.assertEqual(connections[0]["route_label"], "publisher")

	def test_resolve_store_connection_prefers_default(self):
		connections = [
			{"name": "Alpha", "label": "Alpha", "is_default": 0},
			{"name": "Beta", "label": "Beta", "is_default": 1},
		]
		self.assertEqual(api.resolve_store_connection(connections), "Beta")

	def test_resolve_store_connection_falls_back_to_first(self):
		connections = [
			{"name": "Alpha", "label": "Alpha", "is_default": 0},
			{"name": "Beta", "label": "Beta", "is_default": 0},
		]
		self.assertEqual(api.resolve_store_connection(connections), "Alpha")

	def test_resolve_store_connection_uses_route(self):
		connections = [
			{"name": "Alpha", "label": "Alpha One",
				"route_label": "alpha-one", "is_default": 1},
			{"name": "Beta", "label": "Beta Two", "route_label": "beta-two", "is_default": 0},
		]
		self.assertEqual(api.resolve_store_connection(
			connections, route_connection="beta-two"), "Beta")

	def test_resolve_store_connection_uses_label(self):
		connections = [
			{"name": "Alpha", "label": "Alpha One",
				"route_label": "alpha-one", "is_default": 1},
			{"name": "Beta", "label": "Beta Two", "route_label": "beta-two", "is_default": 0},
		]
		self.assertEqual(api.resolve_store_connection(
			connections, route_connection="Beta Two"), "Beta")

	@patch("frappe.integrations.store.api.fetch_catalog_list")
	@patch("frappe.integrations.store.api.frappe.get_installed_apps")
	def test_get_catalog_list_filters_on_server(self, mock_get_installed_apps, mock_fetch_catalog_list):
		mock_get_installed_apps.return_value = INSTALLED_APPS
		connection = make_store_connection(label="Publisher", base_url="https://publisher.example.com")
		mock_fetch_catalog_list.return_value = SAMPLE_ITEMS

		items = api.get_catalog_list(connection.name, app="frappe")
		self.assertEqual(len(items), 1)
		self.assertEqual(items[0]["name"], "SI-00002")

	@patch("frappe.integrations.store.api.fetch_catalog_list")
	@patch("frappe.integrations.store.api.frappe.get_installed_apps")
	def test_get_catalog_list_defaults_to_installed_apps(self, mock_get_installed_apps, mock_fetch_catalog_list):
		mock_get_installed_apps.return_value = INSTALLED_APPS
		connection = make_store_connection(label="Publisher", base_url="https://publisher.example.com")
		mock_fetch_catalog_list.return_value = SAMPLE_ITEMS

		items = api.get_catalog_list(connection.name)
		self.assertEqual(len(items), 3)
		self.assertNotIn("SI-00003", {item["name"] for item in items})

	@patch("frappe.integrations.store.api.fetch_catalog_list")
	@patch("frappe.integrations.store.api.frappe.get_installed_apps")
	def test_get_catalog_filters(self, mock_get_installed_apps, mock_fetch_catalog_list):
		mock_get_installed_apps.return_value = INSTALLED_APPS
		connection = make_store_connection(label="Publisher", base_url="https://publisher.example.com")
		mock_fetch_catalog_list.return_value = SAMPLE_ITEMS

		filters = api.get_catalog_filters(connection.name)
		self.assertIn("frappe", filters["apps"])
		self.assertEqual(filters["categories"], ["Dashboard", "Report", "Server Script"])
		self.assertEqual(filters["tags"], ["api", "demo"])

	@patch("frappe.integrations.store.api.fetch_catalog_item")
	def test_get_catalog_item(self, mock_fetch_catalog_item):
		connection = make_store_connection(label="Publisher", base_url="https://publisher.example.com")
		mock_fetch_catalog_item.return_value = {"name": "SI-00001", "title": "Sales Report"}

		item = api.get_catalog_item(connection.name, "SI-00001")
		self.assertEqual(item["title"], "Sales Report")
		mock_fetch_catalog_item.assert_called_once()

	@patch("frappe.integrations.store.api.fetch_catalog_list")
	@patch("frappe.integrations.store.api.frappe.get_installed_apps")
	def test_get_catalog_list_marks_installed_items(self, mock_get_installed_apps, mock_fetch_catalog_list):
		mock_get_installed_apps.return_value = INSTALLED_APPS
		connection = make_store_connection(
			label="Publisher", base_url="https://publisher.example.com")
		mock_fetch_catalog_list.return_value = [
			{"name": "SI-00001", "title": "Sales Report",
				"app": "erpnext", "package_hash": "hash-1"},
			{"name": "SI-00002", "title": "Dashboard",
				"app": "frappe", "package_hash": "hash-2"},
		]

		frappe.get_doc(
			{
				"doctype": "Store Install Log",
				"store_connection": connection.name,
				"host": connection.label,
				"base_url": connection.base_url,
				"store_item": "SI-00001",
				"package_hash": "hash-1",
				"status": "Installed",
			}
		).insert(ignore_permissions=True)

		items = api.get_catalog_list(connection.name)
		status_by_item = {row["name"]: row["installed"] for row in items}
		self.assertTrue(status_by_item["SI-00001"])
		self.assertFalse(status_by_item["SI-00002"])

	@patch("frappe.integrations.store.api.fetch_catalog_item")
	def test_get_catalog_item_marks_installed(self, mock_fetch_catalog_item):
		connection = make_store_connection(
			label="Publisher", base_url="https://publisher.example.com")
		mock_fetch_catalog_item.return_value = {
			"name": "SI-00001",
			"title": "Sales Report",
			"package_hash": "hash-1",
		}

		frappe.get_doc(
			{
				"doctype": "Store Install Log",
				"store_connection": connection.name,
				"host": connection.label,
				"base_url": connection.base_url,
				"store_item": "SI-00001",
				"package_hash": "hash-1",
				"status": "Installed",
			}
		).insert(ignore_permissions=True)

		item = api.get_catalog_item(connection.name, "SI-00001")
		self.assertTrue(item["installed"])
