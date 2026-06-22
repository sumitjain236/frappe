# Copyright (c) 2026, Frappe Technologies and contributors
# For license information, please see license.txt

from unittest.mock import MagicMock, patch

import frappe
from frappe.frappeclient import FrappeException
from frappe.integrations.doctype.store_connection.test_store_connection import make_store_connection
from frappe.integrations.store.catalog import CATALOG_PING, ping_catalog, request_catalog
from frappe.tests import IntegrationTestCase


class TestStoreCatalog(IntegrationTestCase):
	def mock_frappe_client(self, message=None, side_effect=None):
		mock_client = MagicMock()
		if side_effect is not None:
			mock_client.get_api.side_effect = side_effect
		else:
			mock_client.get_api.return_value = message or {"ok": True, "catalog_enabled": True}
		return mock_client

	@patch("frappe.integrations.doctype.store_connection_detail.store_connection_detail.FrappeClient")
	def test_ping_catalog_returns_message(self, mock_frappe_client):
		mock_frappe_client.return_value = self.mock_frappe_client()

		connection = make_store_connection(label="Ping Test", save=False)

		result = ping_catalog(connection)
		self.assertEqual(result, {"ok": True, "catalog_enabled": True})
		mock_frappe_client.return_value.get_api.assert_called_once_with(CATALOG_PING, {})

	@patch("frappe.integrations.doctype.store_connection_detail.store_connection_detail.FrappeClient")
	def test_ping_catalog_uses_api_credentials(self, mock_frappe_client):
		mock_frappe_client.return_value = self.mock_frappe_client()

		connection = make_store_connection(
			label="Auth Ping Test",
			api_key="test-key",
			api_secret="test-secret",
			save=False,
		)

		ping_catalog(connection)
		mock_frappe_client.assert_called_once_with(
			url="https://publisher.example.com",
			api_key="test-key",
			api_secret="test-secret",
		)

	@patch("frappe.integrations.doctype.store_connection_detail.store_connection_detail.FrappeClient")
	def test_ping_catalog_maps_permission_error(self, mock_frappe_client):
		mock_frappe_client.return_value = self.mock_frappe_client(
			side_effect=FrappeException("FrappeClient Request Failed\n\nPermissionError: Catalog API is disabled")
		)

		connection = make_store_connection(label="Failed Ping Test", save=False)

		self.assertRaises(frappe.ValidationError, ping_catalog, connection)

	@patch("frappe.integrations.doctype.store_connection_detail.store_connection_detail.FrappeClient")
	def test_fetch_catalog_list(self, mock_frappe_client):
		mock_frappe_client.return_value = self.mock_frappe_client(
			message=[{"name": "SI-00001", "title": "Sales Report"}]
		)

		connection = make_store_connection(label="List Test", save=False)

		from frappe.integrations.store.catalog import fetch_catalog_list

		items = fetch_catalog_list(connection)
		self.assertEqual(len(items), 1)
		self.assertEqual(items[0]["name"], "SI-00001")

	@patch("frappe.integrations.doctype.store_connection_detail.store_connection_detail.FrappeClient")
	def test_fetch_catalog_item(self, mock_frappe_client):
		mock_frappe_client.return_value = self.mock_frappe_client(
			message={"name": "SI-00001", "title": "Sales Report", "dependencies": []}
		)

		connection = make_store_connection(label="Item Test", save=False)

		from frappe.integrations.store.catalog import fetch_catalog_item

		item = fetch_catalog_item(connection, "SI-00001")
		self.assertEqual(item["title"], "Sales Report")
		mock_frappe_client.return_value.get_api.assert_called_once_with(
			"store.api.catalog.get_item",
			{"item": "SI-00001"},
		)
