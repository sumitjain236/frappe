// Which picker a field gets, the conditions that picker writes, its icon, and how a value prints.

import { is_yes, same_condition } from "./wire.js";

const ICONS = {
	Select: "lucide-circle-dot",
	Link: "lucide-link-2",
	"Dynamic Link": "lucide-link",
	Date: "lucide-calendar",
	Datetime: "lucide-calendar-clock",
	Time: "lucide-clock",
	Currency: "lucide-banknote",
	Float: "lucide-hash",
	Int: "lucide-hash",
	Percent: "lucide-percent",
	Check: "lucide-square-check",
	Rating: "lucide-star",
	Duration: "lucide-timer",
	Color: "lucide-palette",
	Phone: "lucide-phone",
	Autocomplete: "lucide-text-search",
	"Small Text": "lucide-text",
	Text: "lucide-text",
	"Long Text": "lucide-text",
	"Text Editor": "lucide-file-text",
	Attach: "lucide-paperclip",
	"Attach Image": "lucide-image",
};

const STANDARD_ICONS = {
	_assign: "lucide-user-check",
	_user_tags: "lucide-tag",
	_liked_by: "lucide-heart",
	docstatus: "lucide-file-check",
};

export function field_icon(field) {
	if (STANDARD_ICONS[field.fieldname]) return STANDARD_ICONS[field.fieldname];
	if (field.fieldtype === "Link" && field.options === "User") return "lucide-user";
	return ICONS[field.fieldtype] || "lucide-type";
}

const TEXT_TYPES = [
	"Data",
	"Small Text",
	"Text",
	"Long Text",
	"Text Editor",
	"Code",
	"HTML Editor",
	"Markdown Editor",
	"JSON",
	"Phone",
	"Read Only",
	"Attach",
	"Attach Image",
	"Barcode",
	"Color",
];

// the picker a field gets; null leaves it to Advanced
// an email, phone or web address, filtered by a domain, a start or a part of it
export function contact_kind(field) {
	if (field.fieldtype === "Phone" || (field.fieldtype === "Data" && field.options === "Phone"))
		return "phone";
	if (field.fieldtype !== "Data") return null;
	if (field.options === "Email") return "email";
	if (field.options === "URL") return "url";
	return null;
}

export function picker_kind(field) {
	// stored as JSON lists of names, so desk filters them with like
	if (["_assign", "_liked_by"].includes(field.fieldname)) return "user_like";
	if (field.fieldname === "_user_tags") return "tag_like";
	// searched by its text, as the list's own ID box does it
	if (field.fieldname === "name") return "text";
	if (field.fieldname === "docstatus") return "options";
	if (field.fieldtype === "Check") return "check";
	if (field.fieldtype === "Select") return "options";
	if (field.fieldtype === "Autocomplete" && field.options) return "options";
	if (field.fieldtype === "Link") return "link";
	if (field.fieldtype === "Dynamic Link") return "dynamic";
	if (["Date", "Datetime"].includes(field.fieldtype)) return "date";
	if (field.fieldtype === "Time") return "time";
	if (field.fieldtype === "Rating") return "rating";
	if (field.fieldtype === "Duration") return "duration";
	if (["Int", "Float", "Currency", "Percent"].includes(field.fieldtype)) return "number";
	if (contact_kind(field)) return "contact";
	if (TEXT_TYPES.includes(field.fieldtype) || field.fieldtype === "Autocomplete") return "text";
	return null;
}

// Assigned To, Liked By and Tags: lists of names
export const lists_names = (field) => ["user_like", "tag_like"].includes(picker_kind(field));

// the kinds whose values are picked from a list
export const VALUE_KINDS = ["options", "link", "user_like", "tag_like"];

// a date or time, whose filters read as before and after
export const reads_as_time = (field) => ["Date", "Datetime", "Time"].includes(field?.fieldtype);

// a tree's record with its descendants, as the list's own box filters a tree Link
export const TREE = "descendants of (inclusive)";

// what each picker writes, in desk's own spelling; the field's allowed conditions narrow it
const PICKER_CONDITIONS = {
	options: ["=", "!=", "in", "not in"],
	link: ["=", "!=", "in", "not in", TREE],
	dynamic: ["=", "in"],
	check: ["="],
	contact: ["like", "=", "is"],
	user_like: ["like", "not like"],
	tag_like: ["like", "not like"],
	text: ["like", "not like", "=", "!="],
	date: ["Timespan", "=", "!=", "<", ">", "<=", ">=", "Between"],
	time: ["<", ">", "<=", ">=", "=", "!="],
	number: ["=", "!=", ">", "<", ">=", "<="],
	duration: ["=", "!=", ">", "<", ">=", "<="],
	rating: [">=", "=", "<="],
};

// `app_periods` are conditions apps add to dates, such as "fiscal year"
export function picker_conditions(field, kind = picker_kind(field), app_periods = []) {
	const allowed = field.conditions || [];
	const own = PICKER_CONDITIONS[kind] || [];
	return (kind === "date" ? [...own, ...app_periods] : own).filter((c) =>
		allowed.some((a) => same_condition(a, c))
	);
}

// a number range: two rows, at least and at most
export const RANGE = "range";

// the condition menu's words; dates keep desk's own ("On or Before")
export function condition_options(kind, conditions, __) {
	const labels = {
		text: {
			like: __("Contains"),
			"not like": __("Doesn't contain"),
			"=": __("Is"),
			"!=": __("Is not"),
		},
		date: {
			Timespan: __("In a period"),
			"=": __("On"),
			"!=": __("Not on"),
			"<": __("Before"),
			">": __("After"),
			"<=": __("On or Before"),
			">=": __("On or After"),
			Between: __("Between"),
		},
		time: {
			"<": __("Before"),
			">": __("After"),
			"<=": __("At or before"),
			">=": __("At or after"),
			"=": __("At"),
			"!=": __("Not at"),
		},
		rating: { ">=": __("At least"), "=": __("Exactly"), "<=": __("At most") },
		number: {
			[RANGE]: __("Between"),
			"=": __("Equals"),
			"!=": __("Not equals"),
			">": __("More than"),
			"<": __("Less than"),
			">=": __("At least"),
			"<=": __("At most"),
		},
	};
	const words = labels[kind] || labels.number;
	return conditions.map((c) => ({ label: words[c], value: c }));
}

// a few options, or a status the list colours, show all at once as pills to tap
const SHORT_LIST = 12;
export const shows_pills = (field, __) =>
	option_list(field, __).length <= SHORT_LIST || !!field.colors;

// the options a Select, Autocomplete or Document Status lists in full; values are strings,
// as desk's own row reads them. Sort Options orders them; DocType States colour them.
export function option_list(field, __) {
	const options = Array.isArray(field.options)
		? field.options
		: (typeof field.options === "string" ? field.options : "")
				.split("\n")
				.filter(Boolean)
				.map((o) => ({ value: o, label: __(o) }));
	const list = options.map((o) => ({
		value: String(o.value),
		label: o.label,
		theme: field.colors?.[o.value],
	}));
	return field.sort_options ? list.sort((a, b) => a.label.localeCompare(b.label)) : list;
}

// as frappe.utils.seconds_to_duration splits it, hidden seconds rounding into minutes
export function split_duration(total, field = {}) {
	const s = Math.max(0, Number(total) || 0);
	const parts = {
		days: Math.floor(s / 86400),
		hours: Math.floor((s % 86400) / 3600),
		minutes: Math.floor((s % 3600) / 60),
		seconds: Math.floor(s % 60),
	};
	if (field.hide_days) [parts.hours, parts.days] = [Math.floor(s / 3600), 0];
	if (field.hide_seconds)
		[parts.minutes, parts.seconds] = [parts.minutes + Math.round(parts.seconds / 60), 0];
	return parts;
}

export const out_of = (field) => Number(field.options) || 5;

// a Rating is stored as a share of its stars, to two places: 2 of 3 is 0.67
export const from_stars = (stars, field) => Math.round((stars / out_of(field)) * 100) / 100;
export const to_stars = (value, field) => Math.round(value * out_of(field) * 2) / 2;

// one value, as the field prints it; `format` is desk's formatter from the island host
export function value_text(field, value, { __, format, timespans = [], to_user_tz }) {
	const span = timespans.find((t) => t.value === String(value).toLowerCase());
	if (span) return span.label;
	if (!field) return String(value);
	if (Array.isArray(field.options)) {
		return (
			field.options.find((o) => String(o.value) === String(value))?.label ?? String(value)
		);
	}
	if (field.fieldtype === "Check") return is_yes(value) ? __("Yes") : __("No");
	if (field.fieldtype === "Rating") return `${to_stars(value, field)} ★`;
	// a day picked for a Datetime prints as a day, also when it is stored as the day's first or
	// last second, which the database keeps in the system's time zone
	const local =
		to_user_tz && /\s\d{2}:\d{2}:\d{2}$/.test(value) ? to_user_tz(value) : String(value);
	const day =
		field.fieldtype === "Datetime" &&
		local.match(/^(\d{4}-\d{2}-\d{2})(?: (?:00:00:00|23:59:59))?$/);
	if (format && day) return format(day[1], { ...field, fieldtype: "Date" });
	// a filter has no row to take a Currency field's currency from, so the amount shows bare
	if (format && field.fieldtype === "Currency") {
		return format(value, { ...field, fieldtype: "Float", options: "" });
	}
	const formatted = [
		"Date",
		"Datetime",
		"Time",
		"Float",
		"Int",
		"Percent",
		"Duration",
		"Select",
	];
	if (format && formatted.includes(field.fieldtype)) return format(value, field);
	return String(value);
}
