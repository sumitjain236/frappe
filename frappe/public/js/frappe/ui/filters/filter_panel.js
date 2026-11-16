// A list's filters in a side panel, while System Settings' Use Smart Filters is on. Advanced
// is the list's FilterGroup rows; Simple, the "frappe.filters" island, edits the same rows.

import localforage from "localforage";
import { field_popup_open, TABBABLE } from "../components/utils.js";

frappe.provide("frappe.ui");

// a row's pickers open in <body>; focus may go there while the panel is open
const LAYERS =
	".es-popover, .es-menu, .es-combobox__panel, .awesomplete, .air-datepicker-global-container, .modal, .es-toast-container";
const SLIDE_MS = 200; // keep in sync with .filter-panel's transition

// the same filters in any order
const filters_key = (filters) =>
	(filters || [])
		.map((f) => JSON.stringify(f))
		.sort()
		.join("\n");

// one route listener for every panel: the router can't drop a listener once added
const open_panels = new Set();
frappe.router.on("change", () => open_panels.forEach((panel) => panel.close()));

frappe.ui.FilterPanel = class FilterPanel {
	/** @param {frappe.ui.FilterGroup} group the list's filter rows */
	constructor(group) {
		this.group = group;
		this.mode = "simple";
		this.app_period_fields = {};
		this.asked_titles = new Set();
		// the records fetched for those titles, which the island shows as picked rows too
		this.link_rows = new Map();
		// people's names, which chips show for a user's email
		this.user_names = new Map();
		this.keep_focus = this.keep_focus.bind(this);
		this.on_page_keydown = this.on_page_keydown.bind(this);
		this.save_last_field = frappe.utils.debounce(
			// only this key goes, which the server merges, so a list's own save in flight isn't undone
			(field) => {
				const settings = (frappe.model.user_settings[group.doctype] ||= {});
				settings["Smart Filters"] = { field };
				frappe.xcall(
					"frappe.model.utils.user_settings.save",
					{ doctype: group.doctype, user_settings: { "Smart Filters": { field } } },
					"POST",
					{ no_spinner: true }
				);
			},
			1000
		);
		this.make();
	}

	make() {
		this.$scrim = $('<div class="filter-panel-scrim"></div>').on("click", () => this.close());
		this.$panel = $(
			'<aside class="filter-panel" role="dialog" aria-modal="true" tabindex="-1">'
		).attr({ "aria-label": __("Filters"), id: `filter-panel-${frappe.utils.get_random(8)}` });
		// before an open list or picker in the panel takes Escape for itself
		this.$panel[0].addEventListener("keydown", (e) => this.on_keydown(e), true);
		this.$panel[0].inert = true;

		const $header = $('<header class="filter-panel-header"></header>');
		$('<h2 class="filter-panel-title"></h2>').text(__("Filters")).appendTo($header);
		this.tabs = new frappe.ui.TabButtons({
			label: __("Filter mode"),
			options: [
				{ label: __("Simple"), value: "simple" },
				{ label: __("Advanced"), value: "advanced" },
			],
			value: this.mode,
			css_class: "ms-auto",
			on_change: (mode) => this.set_mode(mode),
		});
		$header.append(this.tabs.el);
		frappe.ui
			.button({
				icon: "x",
				variant: "ghost",
				tooltip: __("Close"),
				onclick: () => this.close(),
			})
			.appendTo($header);

		this.$simple = $('<div class="filter-panel-pane filter-panel-simple"></div>');
		this.$advanced = $('<div class="filter-panel-pane filter-panel-advanced"></div>');

		this.$panel.append($header, this.$simple, this.$advanced);
		$(document.body).append(this.$scrim, this.$panel);
		// lay out the closed panel now, so the first open slides in from it
		this.$panel[0].getBoundingClientRect();
	}

	toggle() {
		this.is_open ? this.close() : this.open();
	}

	open() {
		if (this.is_open) return;
		this.is_open = true;
		open_panels.add(this);
		this.group.filter_button?.attr({
			"aria-expanded": "true",
			"aria-controls": this.$panel.attr("id"),
		});
		this.$panel[0].inert = false;
		this.$scrim.addClass("is-open");
		this.$panel.addClass("is-open");
		this.show_mode();
		this.refresh();
		this.$panel[0].focus({ preventScroll: true });
		this.focus_field_search();
		document.addEventListener("focusin", this.keep_focus);
		document.addEventListener("keydown", this.on_page_keydown, true);
		// a row's picker lines up with its field once the panel has slid in
		setTimeout(() => this.is_open && this.mode === "advanced" && this.open_picker(), SLIDE_MS);
	}

	close() {
		if (!this.is_open) return;
		this.is_open = false;
		open_panels.delete(this);
		this.group.filter_button?.attr("aria-expanded", "false");
		this.leave_advanced();
		this.$panel[0].inert = true;
		this.$scrim.removeClass("is-open");
		this.$panel.removeClass("is-open");
		document.removeEventListener("focusin", this.keep_focus);
		document.removeEventListener("keydown", this.on_page_keydown, true);
		this.group.filter_button?.[0].focus({ preventScroll: true });
	}

	set_mode(mode) {
		if (mode === this.mode) return;
		this.leave_advanced();
		this.mode = mode;
		this.show_mode();
		if (mode === "advanced") this.open_picker();
	}

	show_mode() {
		this.$simple.toggleClass("hidden", this.mode !== "simple");
		this.$advanced.toggleClass("hidden", this.mode !== "advanced");
		if (this.mode === "advanced") this.show_rows();
		else this.show_simple();
	}

	show_advanced() {
		this.tabs.set_value("advanced", { silent: true });
		this.set_mode("advanced");
		// the Simple control that asked for Advanced is hidden now; focus goes to the rows
		if (this.island_root()?.activeElement)
			this.$advanced[0].querySelector(TABBABLE)?.focus({ preventScroll: true });
	}

	show_rows() {
		this.$advanced.append(this.group.get_popover_content());
		this.group.applied_filters = JSON.stringify(this.group.get_filters());
	}

	// the list takes visible rows for an edit in progress and holds its live updates
	leave_advanced() {
		if (this.mode !== "advanced") return;
		this.group.close_rows();
		this.group.wrapper.detach();
	}

	open_picker() {
		const filters = this.group.filters;
		if (filters.length === 1 && filters[0].is_empty()) filters[0].fieldselect.open();
	}

	show_simple() {
		if (this.island) return;
		const doctype = this.group.doctype;
		const filters = this.get_filters();
		// the list counted these filters before the panel opened
		if (this.list_view?.total_count != null) this.counted_for = filters_key(filters);
		this.island = frappe.ui.mount_island("frappe.filters", this.$simple[0], {
			groups: get_filter_groups(doctype),
			filters,
			count: this.get_count(filters),
			timespans: get_timespan_groups(),
			// desk makes the request, with its session and CSRF token
			// the island says when a list can't load, so the server's message isn't shown too
			search: (args) =>
				frappe.xcall("frappe.desk.search.search_link", args, "POST", {
					silent: true,
					no_spinner: true,
				}),
			link_settings: frappe.boot.link_settings,
			link_title: (link_doctype, name) =>
				frappe.utils.get_link_title(link_doctype, name) ||
				(link_doctype === "User" ? this.user_names.get(name) : undefined),
			field_label: (dt, fieldname) => frappe.meta.get_translated_label(dt, fieldname),
			link_row: (link_doctype, name) => this.link_rows.get(`${link_doctype}::${name}`),
			date_format: frappe.datetime.get_user_date_fmt().toUpperCase(),
			to_system_tz: (datetime) => frappe.datetime.convert_to_system_tz(datetime),
			to_user_tz: (datetime) => frappe.datetime.convert_to_user_tz(datetime),
			// from the cache desk's Phone field keeps, so no query
			phone_codes: () =>
				localforage.getItem("country_code_info").then(
					(info) => {
						const country = frappe.sys_defaults.country;
						const isd = info?.[country]?.isd;
						return isd ? [{ value: isd, label: `${isd} ${__(country)}` }] : [];
					},
					() => []
				),
			tag_theme: (tag) => frappe.ui.Tags.prototype.get_tag_theme(tag),
			app_periods: get_app_periods(),
			app_period_values: (condition) => this.get_app_period_values(condition),
			suggestions: get_suggestions(doctype),
			last_field: frappe.model.user_settings[doctype]?.["Smart Filters"]?.field || "",
			onSet: (doctype, fieldname, rows) => this.set_fields([[doctype, fieldname, rows]]),
			onApply: (changes) => this.set_fields(changes),
			onFocus: (field) => this.save_last_field(field),
			onAdvanced: () => this.show_advanced(),
			onClear: () => this.group.clear_all(),
		});
		this.fetch_link_titles(filters);
		this.island.ready.catch((error) => {
			console.error('could not show the "frappe.filters" island', error);
			this.$simple.append(
				frappe.ui.empty_state({
					icon: "list-filter",
					title: __("Simple filters could not load"),
					description: __("Use Advanced to filter this list."),
				})
			);
		});
	}

	// loaded as Advanced does it, and kept for each company the list is filtered on
	async get_app_period_values(condition) {
		const config = frappe.boot.additional_filters_config[condition];
		const args = {};
		if (config.depends_on) {
			const on = this.get_filters().find((f) => f[1] === config.depends_on && f[2] === "=");
			args[config.depends_on] = on?.[3];
		}
		const key = JSON.stringify([condition, args]);
		this.app_period_fields[key] ??= frappe.xcall(config.get_field, args).then(
			// an Advanced row this writes takes its values from config.data
			(field) => (config.data = field),
			(error) => {
				delete this.app_period_fields[key];
				throw error;
			}
		);
		return (await this.app_period_fields[key]).options;
	}

	get_filters() {
		const rows = [
			...this.group.get_filters(),
			...(this.group.toolbar?.get_standard_filters() || []),
		];
		return rows.uniqBy(JSON.stringify);
	}

	// the list view, report view or board behind the panel; a board has no list count
	get list_view() {
		return this.group.toolbar?.list_view;
	}

	// the list's own count, never one of ours; stale while the list counts newer filters
	get_count(filters) {
		const list = this.list_view;
		if (!list || list.list_view_settings?.disable_count || list.total_count == null)
			return null;
		// as the list reads it: a count that reached its limit is that many and more
		const capped = !!list.count_upper_bound && list.total_count === list.count_upper_bound;
		return {
			value: capped ? list.count_upper_bound - 1 : list.total_count,
			capped,
			stale: this.counted_for !== filters_key(filters),
		};
	}

	// `filters` are what the list asked the count for, which may be older than its filters now
	count_ready(filters) {
		this.counted_for = filters_key(filters);
		this.refresh();
	}

	// each [doctype, fieldname, rows] replaces that field's rows, as Advanced writes them; the
	// list reloads once
	async set_fields(changes) {
		const group = this.group;
		// the island hears of the write once, when it has settled
		this.writing = true;
		try {
			for (const [doctype, fieldname, rows] of changes) {
				const same = (f) =>
					f.field?.df.fieldname === fieldname &&
					f.fieldselect.selected_doctype === doctype;
				// picked out before remove(), which clears the row's field
				const gone = group.filters.filter(same);
				group.filters = group.filters.filter((f) => !gone.includes(f));
				gone.forEach((f) => f.remove());

				const box =
					doctype === group.doctype && group.toolbar?.get_standard_field(fieldname);
				if (box && box.get_value()) await box.set_value("");
				for (const row of rows) await group.add_filter(...row);
			}
			group.close_rows();
			// a row moved to its toolbar box is set there after this task
			await new Promise((resolve) => setTimeout(resolve));
		} finally {
			this.writing = false;
			this.refresh();
		}
	}

	refresh() {
		if (this.writing || !this.island || !this.is_open) return;
		const filters = this.get_filters();
		this.island.update({ filters, count: this.get_count(filters) });
		this.fetch_link_titles(filters);
	}

	// a Link that shows its record's title, as the list's own Link boxes do: one search a
	// DocType for the names not seen yet
	fetch_link_titles(filters) {
		const titled = frappe.boot.link_title_doctypes || [];
		const missing = {};
		for (const [doctype, fieldname, , value] of filters) {
			const df =
				frappe.meta.get_docfield(doctype, fieldname) ||
				frappe.model.std_fields.find((d) => d.fieldname === fieldname);
			const people = USER_LISTS.includes(fieldname);
			const link = people ? "User" : df?.fieldtype === "Link" && df.options;
			if (!link || (link !== "User" && !titled.includes(link))) continue;
			const names = [value]
				.flat()
				.map((v) => (people ? String(v).replace(/^%|%$/g, "") : String(v)));
			for (const name of names) {
				const key = `${link}::${name}`;
				if (this.asked_titles.has(key) || this.user_names.has(name)) continue;
				if (frappe.utils.get_link_title(link, name)) continue;
				this.asked_titles.add(key);
				(missing[link] ||= []).push(name);
			}
		}
		const asks = Object.entries(missing).map(([link_doctype, names]) =>
			frappe
				.xcall(
					"frappe.desk.search.search_link",
					{
						doctype: link_doctype,
						txt: "",
						filters: by_name(link_doctype, names),
						page_length: names.length,
						include_image: frappe.boot.link_settings?.[link_doctype]?.image_field
							? 1
							: 0,
					},
					"POST",
					{ silent: true, no_spinner: true }
				)
				.then((rows) =>
					rows.forEach((r) => {
						if (link_doctype === "User")
							this.user_names.set(r.value, r.description || r.value);
						else
							frappe.utils.add_link_title(link_doctype, r.value, r.label || r.value);
						this.link_rows.set(`${link_doctype}::${r.value}`, r);
					})
				)
		);
		if (asks.length) Promise.allSettled(asks).then(() => this.refresh());
	}

	// focus falls to the page when the button that had it goes away, such as Clear all
	on_page_keydown(e) {
		if (e.target === document.body) this.on_keydown(e);
	}

	on_keydown(e) {
		// Shift+Tab from the panel itself goes round to its last control
		if (e.key === "Tab" && e.shiftKey && e.target === this.$panel[0]) {
			const last = this.last_control();
			if (last) {
				e.preventDefault();
				last.focus();
			}
			return;
		}
		if (e.key !== "Escape" || e.defaultPrevented) return;
		if (field_popup_open(e.target) || this.island_overlay_open(e)) return;
		e.stopPropagation();
		this.close();
	}

	// an island dropdown, popover or calendar, open with focus in it or on its trigger
	island_overlay_open(e) {
		const target = e.composedPath()[0];
		const layer = target.closest?.("[role='listbox'], [role='menu'], [role='dialog']");
		const opened = target.getAttribute?.("aria-expanded") === "true";
		const pops = target.hasAttribute?.("aria-haspopup") || target.role === "combobox";
		return (!!layer && layer !== this.$panel[0]) || (opened && pops);
	}

	island_root() {
		return [...this.$simple[0].querySelectorAll("*")].find((el) => el.shadowRoot)?.shadowRoot;
	}

	// a person opening Simple looks for a field first
	focus_field_search() {
		this.island?.ready.then(() => {
			if (!this.is_open || this.mode !== "simple") return;
			this.island_root()?.querySelector("input")?.focus({ preventScroll: true });
		});
	}

	// the shown tab's last control, inside the island's shadow root for Simple
	last_control() {
		const pane = this.mode === "simple" ? this.$simple[0] : this.$advanced[0];
		const root = this.mode === "simple" ? this.island_root() : null;
		const all = [...(root || pane).querySelectorAll(TABBABLE)];
		return all.filter((el) => el.offsetParent !== null).pop();
	}

	// the panel is modal: focus stays in it, or in a picker one of its rows opened
	keep_focus(e) {
		if (this.$panel[0].contains(e.target) || e.target.closest?.(LAYERS)) return;
		this.$panel[0].focus({ preventScroll: true });
	}
};

const STANDARD_FIRST = ["name", "docstatus"];
// a tree's bookkeeping, the row order and an amendment's source, which nobody filters by
const TECHNICAL = ["idx", "lft", "rgt", "old_parent", "amended_from"];
// standard fields that hold users' emails as text
const USER_LISTS = ["_assign", "_liked_by"];
// records by name; the user search leaves out website users unless asked, as a picker shows them
const by_name = (doctype, names) => ({
	name: ["in", names],
	...(doctype === "User" && { ignore_user_type: 1 }),
});
// standard columns with an index of their own
const INDEXED = ["name", "creation", "modified"];

// list view indicator colours, in the colours a filter pill has
const BADGE_THEMES = {
	red: "red",
	green: "green",
	blue: "blue",
	"light-blue": "blue",
	cyan: "blue",
	orange: "orange",
	yellow: "amber",
	amber: "amber",
	purple: "violet",
	pink: "violet",
	violet: "violet",
};
// as the list shows them, but Draft orange so it isn't read as Cancelled
const DOCSTATUS_THEMES = { 0: "orange", 1: "blue", 2: "red" };
const badge_theme = (colour) => BADGE_THEMES[frappe.scrub(colour || "", "-")] || "gray";

// The fields Advanced's field picker lists, grouped by the DocType's sections. A child table
// is a group of its own; ID and Document Status lead, and the other standard fields come last.
function get_filter_groups(doctype) {
	const { options, fields_by_name } = frappe.ui.FieldSelect.get_options(doctype);
	const meta = frappe.get_meta(doctype);
	const labels = new Map(options.map((o) => [`${o.doctype}.${o.fieldname}`, o.label]));
	const to_field = (df, table) => ({
		doctype: df.parent || doctype,
		fieldname: df.fieldname,
		label: labels.get(`${df.parent || doctype}.${df.fieldname}`),
		fieldtype: df.fieldtype,
		options: field_options(df),
		// the hint is shown as text, and some descriptions are HTML
		description: df.description ? frappe.utils.html2text(__(df.description)) : "",
		table,
		conditions: frappe.ui.Filter.get_conditions(df),
		non_negative: df.non_negative,
		// as the server reads them, 0 is no limit
		min_value: df.min_value || undefined,
		max_value: df.max_value || undefined,
		hide_days: df.hide_days,
		hide_seconds: df.hide_seconds,
		sort_options: df.sort_options,
		icon: sprite_icon(df.icon),
		allowed_dates: df.allowed_dates || "",
		// shown as a box on the list's toolbar
		standard: !table && !!df.in_standard_filter,
		colors: table ? null : list_colors(doctype, df),
		// a large list filtered on a column with no index is slow
		slow:
			!!meta.is_large_table &&
			!table &&
			!df.search_index &&
			!df.unique &&
			!INDEXED.includes(df.fieldname),
	});

	const own = Object.fromEntries(
		Object.entries(fields_by_name[doctype] || {}).filter(([name]) => !TECHNICAL.includes(name))
	);
	const in_layout = new Set();
	const tables = new Set();
	const groups = [];
	let label = __("Details");
	let group = null;
	// where the section's groups begin: its own fields come before its tables
	let start = 0;
	for (const df of frappe.get_meta(doctype).fields) {
		in_layout.add(df.fieldname);
		if (["Tab Break", "Section Break"].includes(df.fieldtype)) {
			if (df.label)
				[label, group, start] = [__(df.label, null, doctype), null, groups.length];
			continue;
		}
		if (frappe.model.table_fields.includes(df.fieldtype)) {
			// the picker lists a child table's fields once, under its first table
			if (tables.has(df.options)) continue;
			tables.add(df.options);
			const table = __(df.label, null, doctype);
			const fields = Object.values(fields_by_name[df.options] || {}).filter(
				(d) => !TECHNICAL.includes(d.fieldname)
			);
			if (fields.length) {
				groups.push({
					label: table,
					table: true,
					fields: fields.map((d) => to_field(d, table)),
				});
			}
			continue;
		}
		// the document's own status leads, with ID and Document Status, wherever the form has it
		if (df.fieldname === "status" || !own[df.fieldname]) continue;
		if (!group) groups.splice(start, 0, (group = { label, fields: [] }));
		group.fields.push(to_field(own[df.fieldname]));
	}

	const standard = Object.values(own).filter((df) => !in_layout.has(df.fieldname));
	const first = [
		...standard.filter((df) => STANDARD_FIRST.includes(df.fieldname)),
		...(own.status ? [own.status] : []),
	];
	const rest = standard.filter((df) => !STANDARD_FIRST.includes(df.fieldname));
	if (first.length) {
		if (!groups.length || groups[0].table)
			groups.unshift({ label: __("Details"), fields: [] });
		groups[0].fields.unshift(...first.map((df) => to_field(df)));
	}
	if (rest.length)
		groups.push({ label: __("Activity"), fields: rest.map((df) => to_field(df)) });
	return groups;
}

// the colours the list view gives Document Status and the status field
function list_colors(doctype, df) {
	if (df.fieldname === "docstatus") return DOCSTATUS_THEMES;
	if (df.fieldname !== "status" || df.fieldtype !== "Select") return null;
	const statuses = (df.options || "").split("\n").filter(Boolean);
	return Object.fromEntries(statuses.map((s) => [s, badge_theme(status_colour(doctype, s))]));
}

// frappe.get_indicator asked about a row that has only this status and the Document Status such
// a row usually has; it often reads other fields too, so its answer counts only when it is about
// this status, else the word decides
function status_colour(doctype, status) {
	const submittable = frappe.model.is_submittable(doctype);
	const settings = frappe.listview_settings[doctype] || {};
	// a submittable document's Draft and Cancelled come from its Document Status
	if (submittable && status === "Draft" && !settings.has_indicator_for_draft) return "orange";
	if (submittable && status === "Cancelled" && !settings.has_indicator_for_cancelled)
		return "red";
	const docstatus = !submittable ? 0 : { Draft: 0, Cancelled: 2 }[status] ?? 1;
	try {
		const [, colour, filter] =
			frappe.get_indicator({ doctype, status, docstatus }, doctype) || [];
		if (colour && filter === `status,=,${status}`) return colour;
	} catch (error) {
		// a list's indicator may read a field this row doesn't have
		if (!(error instanceof TypeError)) throw error;
	}
	return frappe.utils.guess_colour(status);
}

// Document Status lists its states as desk's own row does
function field_options(df) {
	if (df.fieldname !== "docstatus") return df.options;
	const scrubbed = { ...df };
	frappe.ui.filter_utils.set_fieldtype(scrubbed, null, "=");
	return scrubbed.options;
}

// the filters a list's settings suggest, one filter each; apps add or remove them by name
function get_suggestions(doctype) {
	return (frappe.listview_settings[doctype]?.filter_suggestions || []).map((s) => {
		const row = typeof s.filter === "function" ? s.filter() : s.filter;
		return {
			name: s.name,
			label: s.label,
			icon: sprite_icon(s.icon),
			row: row.length === 3 ? [doctype, ...row] : row,
		};
	});
}

// one of desk's sprite icons as its own SVG, since the island's shadow root can't reach the
// sprite; "" when there's none. Looked up in the sprite alone, as the Icon control does, and
// built node by node, so nothing else on the page can stand in for it.
const SPRITE_STROKE = {
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "1.5",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
};
function sprite_icon(name) {
	if (!name) return "";
	const symbol = document.querySelector(
		`#all-symbols > svg > symbol[id="icon-${CSS.escape(name)}"]`
	);
	if (!symbol) return "";
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", symbol.getAttribute("viewBox") || "0 0 24 24");
	for (const [attribute, value] of Object.entries(SPRITE_STROKE))
		svg.setAttribute(attribute, value);
	svg.append(...[...symbol.childNodes].map((node) => node.cloneNode(true)));
	return svg.outerHTML;
}

// periods an app adds to date filters through the filters_config hook, such as ERPNext's
// Fiscal Year
function get_app_periods() {
	return Object.entries(frappe.boot.additional_filters_config || {}).map(([condition, c]) => ({
		condition,
		label: __(c.label),
	}));
}

function get_timespan_groups() {
	const periods = (names) => frappe.ui.filter_utils.get_timespan_options(names);
	return [
		{ label: __("Days"), options: periods(["Yesterday", "Today", "Tomorrow"]) },
		{ label: __("Last"), options: periods(["Last"]) },
		{ label: __("This"), options: periods(["This"]) },
		{ label: __("Next"), options: periods(["Next"]) },
	];
}
