"""Resolve per-app install handlers from the shelf_install_handlers hook (consumer site)."""

from __future__ import annotations

from typing import Literal, TypedDict

import frappe

ShelfHandlerAction = Literal["install", "update", "uninstall"]
SHELF_HANDLER_ACTIONS: tuple[ShelfHandlerAction, ...] = ("install", "update", "uninstall")


class ShelfAppHandlers(TypedDict, total=False):
	"""Method paths registered by an app in hooks.py."""

	install: str
	update: str
	uninstall: str


def get_app_shelf_handlers(app: str) -> ShelfAppHandlers | None:
	"""Collect install, update, and uninstall handlers for a bench app name."""
	# 1. Normalize app name
	# 2. Merge matching hook entries into one handlers dict

	# 1. Normalize app name
	app = (app or "").strip().lower()
	if not app:
		return None

	handlers: ShelfAppHandlers = {}

	# 2. Merge matching hook entries into one handlers dict
	for entry in frappe.get_hooks("shelf_install_handlers") or []:
		if not isinstance(entry, dict):
			continue
		if (entry.get("app") or "").strip().lower() != app:
			continue
		for action in SHELF_HANDLER_ACTIONS:
			method = entry.get(action)
			if method:
				handlers[action] = method

	return handlers or None


def get_shelf_handler_method(app: str, action: ShelfHandlerAction) -> str | None:
	"""Return dotted path for one action on the consumer site."""
	# 1. Resolve handlers for app
	# 2. Return method for the requested action

	# 1. Resolve handlers for app
	handlers = get_app_shelf_handlers(app)
	if not handlers:
		return None

	# 2. Return method for the requested action
	return handlers.get(action)


def has_app_shelf_handlers(app: str, *, require_all: bool = True) -> bool:
	"""Whether the app registered store handlers (default: all three actions required)."""
	# 1. Load handlers for app
	# 2. Require install
	# 3. Optionally require update and uninstall

	# 1. Load handlers for app
	handlers = get_app_shelf_handlers(app)
	if not handlers:
		return False

	# 2. Require install
	if not handlers.get("install"):
		return False

	# 3. Optionally require update and uninstall
	if not require_all:
		return True
	return bool(handlers.get("update") and handlers.get("uninstall"))
