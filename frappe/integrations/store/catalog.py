# Copyright (c) 2026, Frappe Technologies and contributors
# For license information, please see license.txt

from __future__ import annotations

from typing import TYPE_CHECKING

import requests

import frappe
from frappe import _
from frappe.frappeclient import AuthError, FrappeException, SiteUnreachableError

if TYPE_CHECKING:
	from frappe.integrations.doctype.store_connection_detail.store_connection_detail import (
		StoreConnectionDetail,
	)

CATALOG_PING = "store.api.catalog.ping"
CATALOG_LIST_ITEMS = "store.api.catalog.list_items"
CATALOG_GET_ITEM = "store.api.catalog.get_item"
CATALOG_DOWNLOAD_ITEM = "store.api.catalog.download_item"


def ping_catalog(connection: StoreConnectionDetail) -> dict:
	"""Call the host Store catalog ping API to verify URL and access."""
	return request_catalog(connection, CATALOG_PING)


def fetch_catalog_list(connection: StoreConnectionDetail) -> list[dict]:
	"""Return published Store Item metadata from the host catalog."""
	message = request_catalog(connection, CATALOG_LIST_ITEMS)
	if isinstance(message, list):
		return message
	if isinstance(message, dict):
		return message.get("items") or []
	return []


def fetch_catalog_item(connection: StoreConnectionDetail, item: str) -> dict:
	"""Return preview metadata for one published Store Item on the host."""
	if not item:
		frappe.throw(_("Store Item is required"), title=_("Missing Item"))
	return request_catalog(connection, CATALOG_GET_ITEM, {"item": item})


def get_item_tags(item: dict) -> list[str]:
	"""Normalize Store Item tags from host catalog rows or plain strings."""
	tags = []
	for tag in item.get("tags") or []:
		if isinstance(tag, str):
			value = tag.strip()
		elif isinstance(tag, dict):
			value = str(tag.get("tag") or tag.get("name") or "").strip()
		else:
			value = ""
		if value:
			tags.append(value)
	return tags


def filter_catalog_items(
	items: list[dict],
	search: str | None = None,
	app: str | None = None,
	category: str | None = None,
	tag: str | None = None,
	installed_apps: list[str] | None = None,
) -> list[dict]:
	"""Apply browse filters to catalog metadata on the consumer site."""
	filtered = items

	if app:
		filtered = [item for item in filtered if item.get("app") == app]
	elif installed_apps:
		installed = set(installed_apps)
		filtered = [item for item in filtered if item.get("app") in installed]

	if category:
		filtered = [item for item in filtered if item.get("category") == category]

	if tag:
		filtered = [item for item in filtered if tag in get_item_tags(item)]

	query = (search or "").strip().lower()
	if query:
		filtered = [
			item
			for item in filtered
			if any(
				query in str(item.get(field, "")).lower()
				for field in ("title", "description", "app", "category", "name")
			)
			or any(query in catalog_tag.lower() for catalog_tag in get_item_tags(item))
		]

	return filtered


def get_catalog_categories(items: list[dict]) -> list[str]:
	"""Return sorted distinct categories present in a catalog listing."""
	return sorted({item.get("category") for item in items if item.get("category")})


def get_catalog_tags(items: list[dict]) -> list[str]:
	"""Return sorted distinct tags present in a catalog listing."""
	tags: set[str] = set()
	for item in items:
		tags.update(get_item_tags(item))
	return sorted(tags)


def request_catalog(connection: StoreConnectionDetail, method: str, params: dict | None = None) -> dict:
	"""Call a Store catalog API on the host and return the Frappe `message` payload."""
	client = connection.get_frappe_client()

	try:
		message = client.get_api(method, params or {})
	except AuthError as exc:
		frappe.throw(
			_("Invalid API credentials for Store host."),
			title=_("Authentication Failed"),
			exc=exc,
		)
	except SiteUnreachableError as exc:
		frappe.throw(
			_("Could not reach Store host {0}. Check the URL and network connectivity.").format(
				frappe.bold(connection.base_url)
			),
			title=_("Invalid Store Host"),
			exc=exc,
		)
	except requests.exceptions.SSLError as exc:
		frappe.throw(
			_("Could not verify SSL certificate for Store host {0}").format(
				frappe.bold(connection.base_url)
			),
			title=_("Invalid Store Host"),
			exc=exc,
		)
	except requests.exceptions.RequestException as exc:
		frappe.throw(
			_("Could not reach Store host {0}. Check the URL and network connectivity.").format(
				frappe.bold(connection.base_url)
			),
			title=_("Invalid Store Host"),
			exc=exc,
		)
	except FrappeException as exc:
		raise_catalog_client_error(str(exc))

	if message is None:
		frappe.throw(
			_("Store host {0} did not return a valid catalog response.").format(
				frappe.bold(connection.base_url)
			),
			title=_("Invalid Store Host"),
		)

	if isinstance(message, list):
		return message

	return message if isinstance(message, dict) else {"message": message}


def raise_catalog_client_error(exc_message: str):
	"""Map FrappeClient errors from the Store host to validation errors."""
	if "PermissionError" in exc_message:
		frappe.throw(
			_extract_exception_message(exc_message)
			or _("Store catalog API is disabled on the host."),
			title=_("Store Catalog Unavailable"),
		)

	if any(
		error in exc_message
		for error in ("AuthenticationError", "InvalidAuthorizationHeader", "InvalidAuthorizationToken")
	):
		frappe.throw(
			_extract_exception_message(exc_message) or _("Invalid API credentials for Store host."),
			title=_("Authentication Failed"),
		)

	if "DoesNotExistError" in exc_message or "404" in exc_message:
		frappe.throw(
			_("Store catalog API not found. Ensure the Store app is installed on the host."),
			title=_("Invalid Store Host"),
		)

	frappe.throw(
		_extract_exception_message(exc_message) or _("Store host rejected the catalog request."),
		title=_("Invalid Store Host"),
	)


def _extract_exception_message(exc_message: str) -> str | None:
	for line in reversed(exc_message.strip().splitlines()):
		line = line.strip()
		if not line or line.startswith("Traceback") or line.startswith("File "):
			continue
		if ":" in line:
			return line.split(":", 1)[1].strip()
		return line

	return None
