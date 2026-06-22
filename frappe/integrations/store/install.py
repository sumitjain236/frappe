# Copyright (c) 2026, Frappe Technologies and contributors
# For license information, please see license.txt

from __future__ import annotations

import copy
from typing import TYPE_CHECKING

import frappe
from frappe import _
from frappe.exceptions import DuplicateEntryError, ValidationError
from frappe.utils import get_app_version, now_datetime
from packaging.version import InvalidVersion, Version

if TYPE_CHECKING:
	from frappe.integrations.doctype.store_connection_detail.store_connection_detail import (
		StoreConnectionDetail,
	)


def get_app_store_handlers(app: str) -> dict | None:
	"""Resolve an installed app's store install handler configuration."""
	for handler in frappe.get_hooks("store_install_handlers") or []:
		if not isinstance(handler, dict):
			continue
		if handler.get("app") == app:
			return handler
	return None


def install_store_item(
	connection: "StoreConnectionDetail",
	package: dict,
	prompt_answers: dict | None = None,
	target_names: dict | None = None,
) -> dict:
	"""Install a Store Item package from a remote host into this site."""
	prompt_answers = prompt_answers or {}
	target_names = target_names or {}

	log = _create_install_log(connection, package, prompt_answers)
	try:
		_validate_package(package)
		_check_package_dependencies(package)

		if package.get("use_app_install"):
			result = _install_via_app_handler(package, prompt_answers)
			log.step_log = frappe.as_json({"use_app_install": True, "result": result})
		else:
			step_log = _generic_install(package, prompt_answers, target_names)
			log.step_log = frappe.as_json(step_log)

		log.status = "Installed"
		log.error_message = ""
		log.save()
		return {"status": log.status, "log_name": log.name}
	except Exception as exc:
		log.status = "Failed"
		log.error_message = str(exc)
		log.save()
		raise


def _create_install_log(
	connection: "StoreConnectionDetail", package: dict, prompt_answers: dict | None = None
) -> frappe.Document:
	log = frappe.new_doc("Store Install Log")
	log.store_connection = connection.name
	log.host = connection.label or connection.base_url
	log.base_url = connection.base_url
	log.store_item = package.get("name")
	log.store_item_title = package.get("title")
	log.version = package.get("version")
	log.package_hash = package.get("package_hash")
	log.prompt_answers = frappe.as_json(prompt_answers or {})
	log.status = "Pending"
	log.installed_on = now_datetime()
	log.insert()
	return log


def _validate_package(package: dict):
	if not isinstance(package, dict):
		raise ValidationError(_("Invalid Store package received from host."))
	if not package.get("name"):
		raise ValidationError(_("Store package is missing item name."))
	if not package.get("app"):
		raise ValidationError(_("Store package is missing app metadata."))
	if not package.get("package_hash"):
		raise ValidationError(_("Store package is missing package hash."))
	if not package.get("use_app_install") and not package.get("steps"):
		raise ValidationError(_("Store package contains no install steps."))


def _check_package_dependencies(package: dict):
	installed_apps = {app_name for app_name in frappe.get_installed_apps()}

	for dependency in package.get("dependencies") or []:
		app_name = dependency.get("app_name")
		if not app_name:
			continue
		if app_name not in installed_apps:
			raise ValidationError(
				_(
					"Store Item requires the {0} app. Install the app before installing this artifact."
				).format(app_name))
		min_version = dependency.get("min_version")
		if min_version:
			installed_version = get_app_version(app_name)
			try:
				if Version(installed_version) < Version(min_version):
					raise ValidationError(
						_(
							"Store Item requires {0} {1} or higher. Installed version is {2}."
						).format(app_name, min_version, installed_version))
			except InvalidVersion:
				pass


def _install_via_app_handler(package: dict, prompt_answers: dict) -> dict | None:
	handlers = get_app_store_handlers(package["app"])
	if not handlers:
		raise ValidationError(
			_(
				"No app store install handlers are registered for app {0}."
			).format(package["app"]))
	install_handler = handlers.get("install")
	if not install_handler:
		raise ValidationError(
			_(
				"App store install handlers for {0} do not include an install entry."
			).format(package["app"]))

	return frappe.get_attr(install_handler)(package, prompt_answers)


def _generic_install(package: dict, prompt_answers: dict, target_names: dict) -> list[dict]:
	if package.get("has_prompts") and package.get("use_app_install") is False:
		for prompt in package.get("prompts") or []:
			if prompt.get("mandatory") and not prompt_answers.get(prompt.get("prompt_key")):
				raise ValidationError(
					_("The prompt {0} is required to install this Store Item.").format(
						prompt.get("label") or prompt.get("prompt_key")
				))

	installed_steps: dict[int, dict] = {}
	step_log: list[dict] = []

	for step in sorted(package.get("steps") or [], key=lambda value: value.get("sequence", 0)):
		document = copy.deepcopy(step.get("document") or {})
		if not document.get("doctype"):
			raise ValidationError(
				_("Store install step is missing a target doctype.")
			)

		document = _apply_link_rules(document, step.get("link_rules") or {}, prompt_answers, installed_steps)

		source_name = document.get("name")
		if source_name and source_name in target_names:
			document["name"] = target_names[source_name]

		try:
			doc = frappe.get_doc(document)
			doc.insert(ignore_permissions=True)
		except DuplicateEntryError:
			message = (
				_(
					"A document named {0} already exists. Provide a different target name to continue."
				).format(source_name or document.get("doctype")))
			raise ValidationError(message)

		installed_steps[step["sequence"]] = doc.as_dict()
		step_log.append(
			{
				"sequence": step.get("sequence"),
				"doctype": doc.doctype,
				"source_name": source_name,
				"target_name": doc.name,
			}
		)

	return step_log


def _apply_link_rules(document: dict, link_rules: dict, prompt_answers: dict, installed_steps: dict) -> dict:
	for fieldname, rule in (link_rules or {}).items():
		if not isinstance(rule, dict):
			raise ValidationError(
				_("Invalid link rule for field {0}.").format(fieldname)
		)

		resolver = rule.get("resolver")
		if resolver == "prompt":
			prompt_key = rule.get("prompt_key")
			if prompt_key not in prompt_answers:
				raise ValidationError(
					_("Prompt answer {0} is required by the link rules.").format(prompt_key))
			document[fieldname] = prompt_answers[prompt_key]
		elif resolver == "step":
			sequence = rule.get("sequence")
			field = rule.get("field")
			if sequence not in installed_steps:
				raise ValidationError(
					_("Link rule references unknown step sequence {0}.").format(sequence))
			step_result = installed_steps.get(sequence) or {}
			if field not in step_result:
				raise ValidationError(
					_("Link rule could not resolve field {0} from step {1}.").format(field, sequence))
			document[fieldname] = step_result[field]
		else:
			raise ValidationError(
				_("Unknown link rule resolver {0} for field {1}.").format(resolver, fieldname))

	return document
