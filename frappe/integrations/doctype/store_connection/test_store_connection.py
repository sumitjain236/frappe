# Copyright (c) 2026, Frappe Technologies and contributors
# For license information, please see license.txt

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase


class TestStoreConnection(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		clear_store_connections()

	def test_create_connection(self):
		connection = make_store_connection()
		self.assertEqual(connection.base_url, "https://publisher.example.com")
		self.assertTrue(connection.enabled)

	def test_strips_trailing_slash_from_base_url(self):
		connection = make_store_connection(base_url="https://publisher.example.com/")
		self.assertEqual(connection.base_url, "https://publisher.example.com")

	def test_invalid_base_url_raises(self):
		settings = append_store_connection(base_url="not-a-url")
		self.assertRaises(frappe.ValidationError, settings.save)

	def test_api_credentials_must_be_paired(self):
		settings = append_store_connection(api_key="test-key")
		self.assertRaises(frappe.ValidationError, settings.save)

		clear_store_connections()
		settings = append_store_connection(api_secret="test-secret")
		self.assertRaises(frappe.ValidationError, settings.save)

	def test_connection_labels_must_be_unique_case_insensitive(self):
		make_store_connection(label="Publisher")
		settings = append_store_connection(
			label="publisher", base_url="https://publisher2.example.com")
		self.assertRaises(frappe.ValidationError, settings.save)

	@patch("frappe.integrations.doctype.store_connection_detail.store_connection_detail.FrappeClient")
	def test_frappe_client_uses_credentials(self, mock_frappe_client):
		connection = make_store_connection(
			api_key="test-key",
			api_secret="test-secret",
			save=False,
		)
		connection.get_frappe_client()
		mock_frappe_client.assert_called_once_with(
			url="https://publisher.example.com",
			api_key="test-key",
			api_secret="test-secret",
		)

	@patch("frappe.integrations.doctype.store_connection_detail.store_connection_detail.FrappeClient")
	def test_frappe_client_without_credentials(self, mock_frappe_client):
		connection = make_store_connection(save=False)
		connection.get_frappe_client()
		mock_frappe_client.assert_called_once_with(url="https://publisher.example.com")

	@patch("frappe.integrations.doctype.store_connection.store_connection.ping_catalog")
	def test_verify_store_host(self, mock_ping_catalog):
		mock_ping_catalog.return_value = {"ok": True}
		connection = make_store_connection()
		settings = frappe.get_single("Store Connection")
		result = settings.verify_store_host(connection.name)
		self.assertEqual(result, {"ok": True})
		mock_ping_catalog.assert_called_once()
		self.assertEqual(mock_ping_catalog.call_args.args[0].name, connection.name)

	@patch("frappe.integrations.doctype.store_connection.store_connection.ping_catalog")
	def test_verify_store_host_failure(self, mock_ping_catalog):
		mock_ping_catalog.side_effect = frappe.ValidationError("Store catalog API is disabled on the host.")
		connection = make_store_connection()
		settings = frappe.get_single("Store Connection")
		self.assertRaises(frappe.ValidationError, settings.verify_store_host, connection.name)

	def test_save_does_not_ping_host(self):
		with patch("frappe.integrations.doctype.store_connection.store_connection.ping_catalog") as mock_ping_catalog:
			make_store_connection()
			mock_ping_catalog.assert_not_called()

	def test_only_connection_is_auto_default(self):
		connection = make_store_connection()
		self.assertTrue(connection.is_default)

	def test_setting_default_unsets_other_defaults(self):
		first = make_store_connection(label="First Store", base_url="https://first.example.com")
		second = make_store_connection(label="Second Store", base_url="https://second.example.com")
		settings = frappe.get_single("Store Connection")
		for row in settings.connections:
			if row.name == second.name:
				row.is_default = 1
		settings.save()
		settings.reload()

		first_row = settings.get_connection_row(first.name)
		second_row = settings.get_connection_row(second.name)
		self.assertFalse(first_row.is_default)
		self.assertTrue(second_row.is_default)

	def test_disabled_connection_cannot_remain_default(self):
		connection = make_store_connection()
		settings = frappe.get_single("Store Connection")
		for row in settings.connections:
			if row.name == connection.name:
				row.enabled = 0
		settings.save()
		connection.reload()
		self.assertFalse(connection.is_default)


def clear_store_connections():
	settings = frappe.get_single("Store Connection")
	settings.connections = []
	settings.save()


def append_store_connection(
	label="Test Store",
	base_url="https://publisher.example.com",
	enabled=1,
	api_key=None,
	api_secret=None,
	is_default=0,
):
	settings = frappe.get_single("Store Connection")
	settings.append(
		"connections",
		{
			"label": label,
			"base_url": base_url,
			"enabled": enabled,
			"is_default": is_default,
			"api_key": api_key,
			"api_secret": api_secret,
		},
	)
	return settings


def make_store_connection(
	label="Test Store",
	base_url="https://publisher.example.com",
	enabled=1,
	api_key=None,
	api_secret=None,
	save=True,
):
	settings = append_store_connection(
		label=label,
		base_url=base_url,
		enabled=enabled,
		api_key=api_key,
		api_secret=api_secret,
	)
	row = settings.connections[-1]
	if save:
		settings.save()
		row.reload()
	return row
