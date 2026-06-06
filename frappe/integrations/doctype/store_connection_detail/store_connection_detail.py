# Copyright (c) 2026, Frappe Technologies and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.frappeclient import FrappeClient
from frappe.model.document import Document
from frappe.utils import validate_url


class StoreConnectionDetail(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		api_key: DF.Data | None
		api_secret: DF.Password | None
		base_url: DF.Data
		enabled: DF.Check
		is_default: DF.Check
		label: DF.Data
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
	# end: auto-generated types

	def validate(self):
		self.base_url = self.get_normalized_base_url()
		self.validate_base_url()
		self.validate_api_credentials()

	def validate_base_url(self):
		validate_url(self.base_url, throw=True, valid_schemes=("http", "https"))

	def validate_api_credentials(self):
		has_key = bool(self.api_key)
		has_secret = bool(self.get_password("api_secret", raise_exception=False))

		if has_key != has_secret:
			frappe.throw(
				_("Both API Key and API Secret are required for authenticated catalog access"),
				title=_("Incomplete Credentials"),
			)

	def get_normalized_base_url(self) -> str:
		"""Return base URL without trailing slashes."""
		return (self.base_url or "").strip().rstrip("/")

	def get_frappe_client(self) -> FrappeClient:
		"""Return a FrappeClient for calling the host Store catalog APIs."""
		kwargs = {"url": self.get_normalized_base_url()}
		if self.api_key:
			kwargs["api_key"] = self.api_key
			kwargs["api_secret"] = self.get_password("api_secret")
		return FrappeClient(**kwargs)
