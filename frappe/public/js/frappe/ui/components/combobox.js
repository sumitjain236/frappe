import { place, SIDES, ALIGNS } from "./position.js";
import { validated } from "./utils.js";

frappe.provide("frappe.ui");

/**
 * @typedef {Object} ComboboxOption
 * @property {string} label Row text. Rendered as text, never HTML.
 * @property {string} value What get_value() returns when this row is picked.
 * @property {string} [description] Smaller muted second line under the label (the docname, search fields).
 * @property {string} [icon] Lucide icon name shown before the label.
 * @property {string} [image] Avatar image URL shown before the label (falls back to the label's initial).
 * @property {{label: string, theme?: string}} [badge] Small badge at the end of the row.
 * @property {boolean} [disabled] Inert row, skipped by keyboard navigation.
 */

/**
 * @typedef {Object} ComboboxGroup
 * @property {string} group Heading text for the section.
 * @property {boolean} [hide_label] Keep the section border but hide the heading.
 * @property {ComboboxOption[]} options Rows in this section.
 */

/**
 * @typedef {Object} ComboboxCustomOption
 * @property {"custom"} type
 * @property {string} label Row text.
 * @property {string} [icon] Lucide icon name.
 * @property {function} onclick Called with { query, close, combobox }. The panel closes after unless keep_open is set.
 * @property {boolean} [keep_open]
 * @property {function} [condition] Called with { query }; return false to hide the row. Runs on every render, even when the query filtered everything else out.
 */

/**
 * @typedef {Object} ComboboxOpts
 * @property {Element|JQuery} [trigger] An existing element to use as the trigger. Omit to have one made.
 * @property {Array|function} options Rows: strings, ComboboxOption, ComboboxGroup or ComboboxCustomOption entries. A function is called with (query, { start }) on open and on every query change and may return the rows or a Promise of them — the panel shows a loading state until it settles.
 * @property {string} [value] Initial value.
 * @property {string} [placeholder="Select"] Trigger text when nothing is selected.
 * @property {string} [search_placeholder="Search..."] Placeholder of the search row.
 * @property {boolean} [escape_hint=false] Show a small "esc" hint at the end of the search row.
 * @property {boolean} [filterable=true] Filter rows on the client as the user types. Turn off when `options` does the filtering (server search).
 * @property {boolean} [hide_search=false] No search row — for short lists that read like a plain select.
 * @property {boolean} [clearable=true] Show a clear (×) button on the trigger when a value is set.
 * @property {boolean} [disabled=false]
 * @property {string} [empty_text="No results"] Shown when nothing matches.
 * @property {string[]|string} [filters] Filters the list is restricted by, shown as chips under the list ("Customer Group: Commercial"). A plain string is shown as one line of text. Rendered as text, never HTML.
 * @property {ComboboxCustomOption[]} [footer] Custom rows pinned under the list (Create new, Advanced search).
 * @property {boolean} [match_trigger_width=true] Panel is at least as wide as the trigger.
 * @property {"top"|"bottom"} [side="bottom"]
 * @property {"start"|"center"|"end"} [align="start"]
 * @property {number} [offset=4]
 * @property {string} [css_class] Extra classes on the trigger.
 * @property {function} [on_change] Called with (value, option) after a pick or a clear.
 * @property {function} [on_open]
 * @property {function} [on_close] Called with the reason: "select" | "escape" | "outside" | "tab" | "owner".
 */

const EXIT_MS = 140; // keep in sync with es-menu-out in menu.css
const DEBOUNCE_MS = 300;
// the panel follows the trigger's width, but never narrower than this (a
// grid cell can be 80px wide) and never wider than the viewport
const MIN_PANEL_WIDTH = 240;
const VIEWPORT_PAD = 8;
// filter chips shown before the "+N more" chip
const MAX_FILTER_CHIPS = 4;
const BADGE_THEMES = ["gray", "blue", "green", "amber", "red", "violet", "orange"];

let id_counter = 0;

function is_thenable(value) {
	return !!value && typeof value.then === "function";
}

function is_group(entry) {
	return entry && typeof entry === "object" && "group" in entry && Array.isArray(entry.options);
}

function is_custom(entry) {
	return entry && typeof entry === "object" && entry.type === "custom";
}

// icon names end up inside svg use hrefs, so only plain names pass
function icon_html(name, svg_class) {
	if (typeof name !== "string" || !/^[a-z0-9-]+$/i.test(name)) {
		console.warn(`frappe.ui.Combobox: icons take a lucide icon name, got "${name}"`);
		return "";
	}
	return frappe.utils.icon(name, "sm", "", "", svg_class, true);
}

// one row's canonical shape: strings become { label, value }
function normalize_option(entry) {
	if (entry == null) return null;
	if (typeof entry !== "object") {
		const text = String(entry);
		return { label: text, value: text };
	}
	const value = entry.value == null ? entry.label : entry.value;
	return { ...entry, label: entry.label == null ? String(value) : String(entry.label), value };
}

// flatten the mixed list into explicit groups (loose rows become unlabeled
// groups in source order); custom rows are collected separately since they
// never take part in filtering
export function normalize_options(options) {
	const groups = [];
	const custom = [];
	let current = null;
	const flush = () => {
		if (current && current.options.length) groups.push(current);
		current = null;
	};
	for (const entry of options || []) {
		if (entry == null) continue;
		if (is_custom(entry)) {
			custom.push(entry);
			continue;
		}
		if (is_group(entry)) {
			flush();
			const items = entry.options.map(normalize_option).filter(Boolean);
			if (items.length) {
				groups.push({
					group: entry.group || "",
					hide_label: !!entry.hide_label,
					options: items,
				});
			}
			continue;
		}
		if (!current) current = { group: "", hide_label: true, options: [] };
		current.options.push(normalize_option(entry));
	}
	flush();
	return { groups, custom };
}

function matches(option, query) {
	if (!query) return true;
	const q = query.toLowerCase();
	return [option.label, option.description, option.value].some(
		(text) => text != null && String(text).toLowerCase().includes(q)
	);
}

// label with the matched part wrapped in .es-combobox__match — text nodes
// and one span, never innerHTML
function fill_label(el, text, query) {
	const index = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
	if (index === -1) {
		el.textContent = text;
		return;
	}
	const mark = document.createElement("span");
	mark.className = "es-combobox__match";
	mark.textContent = text.slice(index, index + query.length);
	el.append(
		document.createTextNode(text.slice(0, index)),
		mark,
		document.createTextNode(text.slice(index + query.length))
	);
}

// the avatar / icon shown before a label, in rows and on the trigger
function prefix_html(option, size) {
	if (option.image || option.avatar) {
		return frappe.ui.avatar.html({
			image: option.image,
			label: option.label,
			size,
			shape: option.avatar_shape,
			theme: option.avatar_theme,
		});
	}
	if (option.icon) return icon_html(option.icon, "");
	return "";
}

/**
 * Pick one value from a searchable list: a trigger styled like a form
 * control, and a panel (an .es-menu with role=listbox) holding a search row,
 * the rows, and optional custom rows. Rows can carry an avatar or icon, a
 * muted description, and a badge. Enter / Space / ArrowDown open it; typing
 * on the focused trigger opens it with that text as the query.
 * @example
 * new frappe.ui.Combobox({
 *     trigger: this.$wrapper.find(".status-picker"),
 *     options: ["Open", "Working", "Closed"],
 *     on_change: (value) => this.set_status(value),
 * });
 */
frappe.ui.Combobox = class Combobox {
	/** @param {ComboboxOpts} opts */
	constructor(opts = {}) {
		this.opts = opts;
		this.side = validated(opts.side, SIDES, "side", "Combobox") || "bottom";
		this.align = validated(opts.align, ALIGNS, "align", "Combobox") || "start";
		this.offset = opts.offset == null ? 4 : opts.offset;
		this.filterable = opts.filterable !== false;
		this.clearable = opts.clearable !== false;
		this.match_trigger_width = opts.match_trigger_width !== false;
		this.options = opts.options || [];
		this.value = opts.value == null ? null : opts.value;
		this.selected = null; // the option object behind this.value, when known
		this.query = "";
		this.panel = null;
		this.rows = [];
		this.request_id = 0;
		this.id = `es-combobox-${++id_counter}`;

		this.make_trigger();
		this.set_display();
	}

	// ---- trigger ----

	make_trigger() {
		if (this.opts.trigger) {
			this.$trigger = $(this.opts.trigger);
			this.trigger_el = this.$trigger[0];
			this.trigger_el.classList.add("es-combobox");
		} else {
			this.trigger_el = document.createElement("div");
			this.trigger_el.className = "es-combobox";
			this.$trigger = $(this.trigger_el);
		}
		if (this.opts.css_class) this.trigger_el.classList.add(...this.opts.css_class.split(" "));
		const t = this.trigger_el;
		t.setAttribute("role", "combobox");
		t.setAttribute("aria-haspopup", "listbox");
		t.setAttribute("aria-expanded", "false");
		t.setAttribute("tabindex", "0");

		this.prefix_el = document.createElement("span");
		this.prefix_el.className = "es-combobox__prefix";
		this.prefix_el.hidden = true;

		this.value_el = document.createElement("span");
		this.value_el.className = "es-combobox__value";

		this.actions_el = document.createElement("span");
		this.actions_el.className = "es-combobox__actions";
		if (this.clearable) {
			this.clear_btn = frappe.ui.button({
				icon: "x",
				variant: "ghost",
				size: "xs",
				title: __("Clear"),
				attrs: { "data-role": "clear", tabindex: "-1" },
				onclick: (e) => {
					e.stopPropagation();
					this.clear();
					this.trigger_el.focus();
				},
			})[0];
			// pointerdown would otherwise count as a trigger press
			this.clear_btn.addEventListener("pointerdown", (e) => e.stopPropagation());
			this.actions_el.appendChild(this.clear_btn);
		}

		t.append(this.prefix_el, this.value_el, this.actions_el);
		t.insertAdjacentHTML("beforeend", icon_html("chevron-down", "es-combobox__chevron"));

		this.set_disabled(!!this.opts.disabled);

		// a click right after a pointerdown is a mouse/touch open (animated);
		// anything else (Enter/Space) is a keyboard open (instant)
		this.last_pointerdown = 0;
		this.onpointerdown = () => (this.last_pointerdown = Date.now());
		this.onclick = (e) => {
			e.preventDefault();
			if (this.disabled) return;
			if (this.is_open) this.close("owner");
			else
				this.open({
					motion: Date.now() - this.last_pointerdown < 300 ? "animated" : "instant",
				});
		};
		this.onkeydown = (e) => {
			if (this.disabled || this.is_open) return;
			if (
				e.key === "Enter" ||
				e.key === " " ||
				e.key === "ArrowDown" ||
				e.key === "ArrowUp"
			) {
				e.preventDefault();
				this.open({ motion: "instant" });
			} else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
				// type on the closed trigger: open and start the search with
				// that character, so tab-and-type data entry still works
				if (this.opts.hide_search) return;
				e.preventDefault();
				this.open({ motion: "instant", query: e.key });
			}
		};
		t.addEventListener("pointerdown", this.onpointerdown);
		t.addEventListener("click", this.onclick);
		t.addEventListener("keydown", this.onkeydown);
	}

	set_disabled(disabled) {
		this.disabled = !!disabled;
		const t = this.trigger_el;
		if (this.disabled) {
			t.setAttribute("aria-disabled", "true");
			t.setAttribute("data-disabled", "");
			t.setAttribute("tabindex", "-1");
			this.close("owner");
		} else {
			t.removeAttribute("aria-disabled");
			t.removeAttribute("data-disabled");
			t.setAttribute("tabindex", "0");
		}
	}

	// what the trigger shows: the selected option's label (and avatar/icon),
	// or the placeholder
	set_display() {
		const option = this.selected;
		if (option) {
			this.value_el.textContent = option.label;
			this.value_el.removeAttribute("data-placeholder");
			const html = prefix_html(option, "xs");
			this.prefix_el.innerHTML = html;
			this.prefix_el.hidden = !html;
		} else if (this.value != null && this.value !== "") {
			// value known, option not (yet): show the raw value
			this.value_el.textContent = String(this.value);
			this.value_el.removeAttribute("data-placeholder");
			this.prefix_el.hidden = true;
		} else {
			this.value_el.textContent = this.opts.placeholder || __("Select");
			this.value_el.setAttribute("data-placeholder", "");
			this.prefix_el.hidden = true;
		}
		if (this.clear_btn) {
			this.clear_btn.hidden = this.value == null || this.value === "" || this.disabled;
		}
	}

	// ---- value ----

	get_value() {
		return this.value;
	}

	/**
	 * Set the value from code. Pass `label` when the option isn't in the
	 * current rows (a server-searched record), so the trigger can show it.
	 * Silent: no on_change.
	 */
	set_value(value, { label, silent = true } = {}) {
		const next = value == null || value === "" ? null : value;
		const changed = next !== this.value;
		this.value = next;
		this.selected =
			next == null
				? null
				: this.find_option(next) || (label ? { label, value: next } : null);
		this.set_display();
		if (changed && !silent)
			this.opts.on_change && this.opts.on_change(this.value, this.selected);
		return this;
	}

	clear() {
		if (this.value == null) return;
		this.set_value(null, { silent: false });
	}

	find_option(value) {
		if (!Array.isArray(this.options))
			return this.last_groups ? find_in(this.last_groups, value) : null;
		return find_in(normalize_options(this.options).groups, value);
	}

	// replace the rows (static lists); re-renders if open
	set_options(options) {
		this.options = options || [];
		if (this.selected == null && this.value != null)
			this.selected = this.find_option(this.value);
		this.set_display();
		if (this.is_open) this.load();
	}

	// ---- panel ----

	get is_open() {
		return !!this.panel;
	}

	focus() {
		this.trigger_el.focus();
	}

	open({ motion = "animated", query = "" } = {}) {
		if (this.panel || this.disabled) return;

		const panel = document.createElement("div");
		panel.className = "es-menu es-combobox__panel";
		panel.id = this.id;
		panel.setAttribute("role", "listbox");
		panel.setAttribute("tabindex", "-1");
		panel.setAttribute("data-motion", motion);
		panel.setAttribute("aria-labelledby", this.trigger_el.id || "");

		if (!this.opts.hide_search) {
			const search = document.createElement("div");
			search.className = "es-combobox__search";
			search.insertAdjacentHTML("beforeend", icon_html("search", ""));
			this.input = document.createElement("input");
			this.input.className = "es-combobox__input";
			this.input.type = "text";
			this.input.setAttribute("role", "searchbox");
			this.input.setAttribute("aria-autocomplete", "list");
			this.input.setAttribute("aria-controls", this.id);
			this.input.setAttribute("autocomplete", "off");
			this.input.setAttribute("spellcheck", "false");
			this.input.placeholder = this.opts.search_placeholder || __("Search...");
			this.input.value = query;
			this.spinner = document.createElement("span");
			this.spinner.className = "es-spinner";
			this.spinner.setAttribute("aria-hidden", "true");
			this.spinner.hidden = true;
			search.append(this.input, this.spinner);
			if (this.opts.escape_hint) {
				const hint = document.createElement("kbd");
				hint.className = "es-combobox__hint";
				hint.textContent = "esc";
				search.appendChild(hint);
			}
			panel.appendChild(search);
			this.input.addEventListener("input", () => this.on_query(this.input.value));
		} else {
			this.input = null;
		}

		this.list_el = document.createElement("div");
		this.list_el.className = "es-combobox__list";
		panel.appendChild(this.list_el);

		// the filters the list is restricted by sit under the list, above
		// the custom rows, like the classic Link field's filter note
		this.filters_expanded = false;
		this.filters_el = document.createElement("div");
		this.filters_el.className = "es-combobox__filters";
		this.filters_el.hidden = true;
		panel.appendChild(this.filters_el);
		this.render_filters();

		this.footer_el = document.createElement("div");
		this.footer_el.className = "es-combobox__footer";
		this.footer_el.hidden = true;
		panel.appendChild(this.footer_el);

		document.body.appendChild(panel);
		this.panel = panel;
		this.query = query;
		this.trigger_el.setAttribute("aria-expanded", "true");
		this.trigger_el.setAttribute("aria-controls", panel.id);
		this.trigger_el.setAttribute("data-state", "open");

		this.onpanelkeydown = (e) => this.handle_keydown(e);
		this.onoutside = (e) => {
			if (panel.contains(e.target) || this.trigger_el.contains(e.target)) return;
			this.close("outside");
		};
		this.onreposition = () => this.reposition();
		panel.addEventListener("keydown", this.onpanelkeydown);
		document.addEventListener("pointerdown", this.onoutside, { capture: true });
		window.addEventListener("resize", this.onreposition);
		document.addEventListener("scroll", this.onreposition, { capture: true, passive: true });

		this.load();
		this.reposition();
		panel.setAttribute("data-state", "open");

		if (this.input) {
			this.input.focus({ preventScroll: true });
			// caret at the end so the seeded character isn't overwritten
			this.input.setSelectionRange(this.input.value.length, this.input.value.length);
		} else {
			panel.focus({ preventScroll: true });
		}
		this.opts.on_open && this.opts.on_open(this);
	}

	reposition() {
		if (!this.panel) return;
		const rect = this.trigger_el.getBoundingClientRect();
		// a fixed width (not min-width): long labels and filter chips must
		// truncate or wrap inside it, never widen the panel past the field
		const max_width = window.innerWidth - 2 * VIEWPORT_PAD;
		const width = this.match_trigger_width
			? Math.min(Math.max(Math.round(rect.width), MIN_PANEL_WIDTH), max_width)
			: null;
		this.panel.style.width = width ? `${width}px` : "";
		this.panel.style.minWidth = width ? "" : `${MIN_PANEL_WIDTH}px`;
		this.panel.style.maxWidth = `${max_width}px`;
		place(this.panel, rect, this.side, this.align, this.offset);
	}

	close(reason = "owner") {
		if (!this.panel) return;
		const panel = this.panel;
		this.panel = null;
		this.rows = [];
		clearTimeout(this.debounce_timer);

		panel.removeEventListener("keydown", this.onpanelkeydown);
		document.removeEventListener("pointerdown", this.onoutside, { capture: true });
		window.removeEventListener("resize", this.onreposition);
		document.removeEventListener("scroll", this.onreposition, { capture: true });

		this.trigger_el.setAttribute("aria-expanded", "false");
		this.trigger_el.removeAttribute("aria-controls");
		this.trigger_el.removeAttribute("data-state");

		// keyboard closes return focus to the trigger; a click elsewhere
		// already moved focus and shouldn't have it stolen back
		if (reason === "escape" || reason === "tab" || reason === "select") {
			this.trigger_el.focus({ preventScroll: true });
		}

		panel.setAttribute("data-state", "closed");
		setTimeout(() => panel.remove(), EXIT_MS + 50);
		this.opts.on_close && this.opts.on_close(reason);
	}

	toggle() {
		this.is_open ? this.close("owner") : this.open();
	}

	destroy() {
		this.close("owner");
		const t = this.trigger_el;
		if (!t) return;
		t.removeEventListener("pointerdown", this.onpointerdown);
		t.removeEventListener("click", this.onclick);
		t.removeEventListener("keydown", this.onkeydown);
	}

	// ---- rows ----

	on_query(query) {
		this.query = query;
		if (typeof this.options === "function") {
			// server-backed: debounce, then refetch for the new query
			clearTimeout(this.debounce_timer);
			this.debounce_timer = setTimeout(() => this.load(), DEBOUNCE_MS);
		} else {
			this.render();
		}
	}

	// resolve the rows for the current query; async sources show a loading
	// state, and a response that isn't for the latest request is dropped
	load() {
		if (!this.panel) return;
		const request_id = ++this.request_id;
		let value = this.options;
		if (typeof value === "function") {
			try {
				value = value(this.query, { start: 0 });
			} catch (error) {
				console.error(error);
				value = [];
			}
		}
		if (is_thenable(value)) {
			this.set_loading(true);
			value.then(
				(rows) => {
					if (request_id !== this.request_id || !this.panel) return;
					this.set_loading(false);
					this.render(normalize_options(rows));
				},
				(error) => {
					if (request_id !== this.request_id || !this.panel) return;
					console.error(error);
					this.set_loading(false);
					this.render(normalize_options([]), __("Could not load options"));
				}
			);
			return;
		}
		this.render(normalize_options(value));
	}

	set_loading(loading) {
		if (!this.panel) return;
		this.panel.setAttribute("aria-busy", loading ? "true" : "false");
		if (this.spinner) this.spinner.hidden = !loading;
		if (loading && !this.rows.length) {
			// first load: skeleton rows instead of an empty panel
			this.list_el.replaceChildren();
			const group = document.createElement("div");
			group.className = "es-menu__group";
			for (const width of ["55%", "70%", "45%"]) {
				const row = document.createElement("div");
				row.className = "es-combobox__skeleton";
				const dot = document.createElement("span");
				dot.className = "es-skeleton size-6 rounded-full";
				const bar = document.createElement("span");
				bar.className = "es-skeleton";
				bar.style.height = "12px";
				bar.style.width = width;
				row.append(dot, bar);
				group.appendChild(row);
			}
			this.list_el.appendChild(group);
		}
	}

	// the filters the list is restricted by: a row of chips (or one line of
	// text) under the list, so it's clear why a record isn't showing up
	render_filters() {
		if (!this.filters_el) return;
		const filters = this.opts.filters;
		const items = Array.isArray(filters) ? filters.filter(Boolean) : filters ? [filters] : [];
		this.filters_el.replaceChildren();
		this.filters_el.hidden = !items.length;
		if (!items.length) return;
		this.filters_el.insertAdjacentHTML("beforeend", icon_html("list-filter", ""));
		const label = document.createElement("span");
		label.className = "es-combobox__filters-label";
		label.textContent = __("Filtered by");
		this.filters_el.appendChild(label);
		if (!Array.isArray(filters)) {
			const text = document.createElement("span");
			text.className = "es-combobox__filters-text";
			text.textContent = filters;
			text.title = filters;
			this.filters_el.appendChild(text);
			return;
		}
		// past a handful, the rest hide behind "+N more" so the band stays
		// short; a click reveals them for this open
		const shown = this.filters_expanded ? items : items.slice(0, MAX_FILTER_CHIPS);
		for (const item of shown) {
			const chip = frappe.ui.badge({ label: String(item), size: "sm", title: String(item) });
			this.filters_el.appendChild(chip[0]);
		}
		const hidden = items.length - shown.length;
		if (hidden > 0) {
			const more = frappe.ui.badge({
				label: __("+{0} more", [hidden]),
				size: "sm",
				variant: "outline",
				title: items.slice(MAX_FILTER_CHIPS).join("\n"),
				css_class: "es-combobox__filters-more",
				attrs: { role: "button", tabindex: "-1" },
			});
			more.on("click", (e) => {
				e.stopPropagation();
				this.filters_expanded = true;
				this.render_filters();
				this.reposition();
			});
			// keep focus in the search input
			more.on("pointerdown", (e) => e.preventDefault());
			this.filters_el.appendChild(more[0]);
		}
	}

	/** Replace the filter chips (e.g. after a dependent field changed). */
	set_filters(filters) {
		this.opts.filters = filters;
		this.render_filters();
		if (this.is_open) this.reposition();
	}

	// (re)draw the list and footer from the normalized rows, applying the
	// client filter when enabled
	render(normalized, empty_text) {
		if (!this.panel) return;
		if (normalized) this.last_groups = normalized.groups;
		const groups = this.last_groups || [];
		const custom = [
			...(normalized ? normalized.custom : this.last_custom || []),
			...(this.opts.footer || []),
		];
		if (normalized) this.last_custom = normalized.custom;
		const query = this.query;
		const filter = this.filterable ? (option) => matches(option, query) : () => true;

		this.rows = [];
		this.list_el.replaceChildren();
		let visible = 0;
		for (const group of groups) {
			const options = group.options.filter(filter);
			if (!options.length) continue;
			const group_el = document.createElement("div");
			group_el.className = "es-menu__group";
			group_el.setAttribute("role", "group");
			if (group.group && !group.hide_label) {
				const label = document.createElement("div");
				label.className = "es-menu__group-label";
				label.id = `${this.id}-g${visible}`;
				label.textContent = group.group;
				group_el.setAttribute("aria-labelledby", label.id);
				group_el.appendChild(label);
			}
			const reserve = options.some((o) => o.icon || o.image || o.avatar);
			for (const option of options) {
				const el = this.build_row(option, { reserve, query });
				this.rows.push({ el, option });
				group_el.appendChild(el);
			}
			this.list_el.appendChild(group_el);
			visible += options.length;
		}
		if (!visible) {
			const empty = document.createElement("div");
			empty.className = "es-menu__empty";
			const has_filters = Array.isArray(this.opts.filters)
				? this.opts.filters.length > 0
				: !!this.opts.filters;
			empty.textContent =
				empty_text ||
				(query && has_filters
					? __("No results for {0} within the current filters", [query])
					: query
					? __("No results for {0}", [query])
					: this.opts.empty_text || __("No results"));
			this.list_el.appendChild(empty);
		}

		// custom rows: shown when their condition allows (default: always)
		this.footer_el.replaceChildren();
		const shown = custom.filter((row) => (row.condition ? row.condition({ query }) : true));
		for (const row of shown) {
			const el = this.build_row({ label: row.label, icon: row.icon }, { custom: row });
			this.rows.push({ el, option: null, custom: row });
			this.footer_el.appendChild(el);
		}
		this.footer_el.hidden = !shown.length;

		// keep the highlight on the current value if it's visible, else the
		// first row; with nothing matching, the first custom row (so Enter
		// creates)
		const current = this.rows.find((r) => r.option && r.option.value === this.value);
		this.highlight(current || this.rows.find((r) => !(r.option && r.option.disabled)) || null);
		this.reposition();
	}

	build_row(option, { reserve, query, custom } = {}) {
		const el = document.createElement("button");
		el.type = "button";
		el.className = "es-menu__item";
		el.setAttribute("role", "option");
		el.setAttribute("tabindex", "-1");
		el.id = `${this.id}-r${this.rows.length}`;
		if (option.disabled) {
			el.setAttribute("data-disabled", "");
			el.setAttribute("aria-disabled", "true");
			el.disabled = true;
		}
		const selected = !custom && option.value === this.value;
		el.setAttribute("aria-selected", selected ? "true" : "false");

		const prefix = prefix_html(option, "sm");
		if (prefix) {
			el.insertAdjacentHTML("beforeend", prefix);
		} else if (reserve) {
			const space = document.createElement("span");
			space.className = "es-menu__icon-space";
			space.setAttribute("aria-hidden", "true");
			el.appendChild(space);
		}

		// title on top, name / search fields underneath — the same two lines
		// the classic Link dropdown shows, since a docname can be long
		const label = document.createElement("span");
		label.className = "es-menu__label";
		fill_label(label, option.label || "", custom ? "" : query);
		if (option.description) {
			const description = document.createElement("span");
			description.className = "es-menu__description";
			description.textContent = option.description;
			label.appendChild(description);
		}
		el.appendChild(label);
		if (option.badge && option.badge.label) {
			const theme = validated(option.badge.theme, BADGE_THEMES, "badge.theme", "Combobox");
			el.insertAdjacentHTML(
				"beforeend",
				frappe.ui.badge.html({
					label: option.badge.label,
					theme: theme || "gray",
					size: "sm",
				})
			);
		}
		if (selected) el.insertAdjacentHTML("beforeend", icon_html("check", "es-combobox__check"));

		// pointer: hovering highlights, clicking picks. mousedown would blur
		// the search input before click fires, so keep focus where it is
		el.addEventListener("pointerdown", (e) => e.preventDefault());
		el.addEventListener("pointermove", () =>
			this.highlight(this.rows.find((r) => r.el === el))
		);
		el.addEventListener("click", () => this.activate(this.rows.find((r) => r.el === el)));
		return el;
	}

	highlight(row) {
		for (const r of this.rows) r.el.removeAttribute("data-highlighted");
		this.highlighted = row || null;
		const owner = this.input || this.panel;
		if (!row) {
			owner && owner.removeAttribute("aria-activedescendant");
			return;
		}
		row.el.setAttribute("data-highlighted", "");
		owner && owner.setAttribute("aria-activedescendant", row.el.id);
		row.el.scrollIntoView({ block: "nearest" });
	}

	step(direction, edge) {
		const rows = this.rows.filter((r) => !(r.option && r.option.disabled));
		if (!rows.length) return;
		let index;
		if (edge) {
			index = direction > 0 ? 0 : rows.length - 1;
		} else {
			const current = rows.indexOf(this.highlighted);
			index =
				current >= 0
					? (current + direction + rows.length) % rows.length
					: direction > 0
					? 0
					: rows.length - 1;
		}
		this.highlight(rows[index]);
	}

	activate(row) {
		if (!row) return;
		if (row.custom) {
			const custom = row.custom;
			const close = () => this.close("select");
			custom.onclick && custom.onclick({ query: this.query, close, combobox: this });
			if (!custom.keep_open) close();
			return;
		}
		if (row.option.disabled) return;
		this.select(row.option);
	}

	select(option) {
		const changed = option.value !== this.value;
		this.value = option.value;
		this.selected = option;
		this.set_display();
		this.close("select");
		if (changed) this.opts.on_change && this.opts.on_change(this.value, option);
	}

	handle_keydown(e) {
		const handled = () => {
			e.preventDefault();
			e.stopPropagation();
		};
		switch (e.key) {
			case "ArrowDown":
				handled();
				this.step(1);
				break;
			case "ArrowUp":
				handled();
				this.step(-1);
				break;
			case "Home":
				if (this.input && this.input.value) break; // let the caret move
				handled();
				this.step(1, true);
				break;
			case "End":
				if (this.input && this.input.value) break;
				handled();
				this.step(-1, true);
				break;
			case "PageDown":
				handled();
				this.step(1, true);
				break;
			case "PageUp":
				handled();
				this.step(-1, true);
				break;
			case "Enter":
				handled();
				this.activate(this.highlighted);
				break;
			case "Escape":
				handled();
				this.close("escape");
				break;
			case "Tab":
				// don't trap focus: close, put focus back on the trigger and
				// let the browser's own Tab continue from there
				this.close("tab");
				break;
			default:
				if (!this.input && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
					// no search row: type-to-jump on the rows
					handled();
					this.typeahead(e.key);
				} else if (e.ctrlKey || e.metaKey || e.altKey) {
					// keep Ctrl+S etc. from reaching frappe's global handler
					// behind the open panel; leave the browser default alone
					e.stopPropagation();
				}
		}
	}

	typeahead(char) {
		clearTimeout(this.typeahead_timer);
		this.typeahead_timer = setTimeout(() => (this.typeahead_buffer = ""), 1000);
		this.typeahead_buffer = (this.typeahead_buffer || "") + char.toLowerCase();
		const rows = this.rows.filter((r) => r.option && !r.option.disabled);
		const current = rows.indexOf(this.highlighted);
		const start = current === -1 ? 0 : current + (this.typeahead_buffer.length === 1 ? 1 : 0);
		for (let i = 0; i < rows.length; i++) {
			const row = rows[(start + i) % rows.length];
			if (row.option.label.toLowerCase().startsWith(this.typeahead_buffer)) {
				this.highlight(row);
				return;
			}
		}
	}
};

function find_in(groups, value) {
	for (const group of groups) {
		const hit = group.options.find((o) => o.value === value);
		if (hit) return hit;
	}
	return null;
}

/**
 * Convenience form: makes the trigger and wires the combobox in one call.
 * Returns the trigger element (append it wherever); the instance is on
 * `.data("es-combobox")` for get_value / set_value / open / close.
 * @param {ComboboxOpts} opts
 * @returns {JQuery}
 * @example toolbar.append(frappe.ui.combobox({
 *     placeholder: __("Status"),
 *     options: ["Open", "Closed"],
 *     on_change: (value) => this.filter(value),
 * }));
 */
frappe.ui.combobox = function (opts = {}) {
	const combobox = new frappe.ui.Combobox(opts);
	combobox.$trigger.data("es-combobox", combobox);
	return combobox.$trigger;
};

export default frappe.ui.combobox;
