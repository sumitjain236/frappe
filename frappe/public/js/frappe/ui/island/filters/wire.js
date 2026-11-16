// Filters as desk keeps them, [doctype, fieldname, condition, value], read and written for
// the Simple tab. Pure, so it runs under node --test as well as in the island.
//
// Conditions are written the way desk's own rows write them ("Between", "Timespan"), so
// Advanced shows a row Simple wrote. Read, they may come in either case.

export const field_key = (doctype, fieldname) => `${doctype}.${fieldname}`;

export const rows_of = (filters, doctype, fieldname) =>
	filters.filter((f) => f[0] === doctype && f[1] === fieldname);

const condition_of = (row) => String(row[2] || "").toLowerCase();

// conditions match whatever their case: desk writes "Between", a URL may say "between"
export const same_condition = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

// an "in" value as desk may hold it: a list, "a,b" or JSON text
export function as_list(value) {
	if (Array.isArray(value)) return value;
	if (value == null || value === "") return [];
	if (typeof value !== "string") return [value];
	const text = value.trim();
	if (text.startsWith("[")) {
		try {
			return JSON.parse(text);
		} catch (e) {
			// not JSON after all: read it as a comma list
		}
	}
	return text
		.split(",")
		.map((v) => v.trim())
		.filter(Boolean);
}

// the values a value picker shows as picked, or null when the rows are not a plain pick
export function picked(rows) {
	if (!rows.length) return { positive: true, values: [] };
	if (rows.length > 1) return null;
	const value = rows[0][3];
	switch (condition_of(rows[0])) {
		case "=":
		case "descendants of (inclusive)":
			return { positive: true, values: [value] };
		case "!=":
			return { positive: false, values: [value] };
		case "in":
			return { positive: true, values: as_list(value) };
		case "not in":
			return { positive: false, values: as_list(value) };
	}
	return null;
}

// one value is a plain = or != (cheap), or `one` for a picked value, such as "descendants of
// (inclusive)" for a tree; only several values need IN
export function value_rows(doctype, fieldname, positive, values, one = "=") {
	if (!values.length) return [];
	if (values.length === 1) return [[doctype, fieldname, positive ? one : "!=", values[0]]];
	return [[doctype, fieldname, positive ? "in" : "not in", values]];
}

// Document Status has no "in": one tick is "=" it, two are "!=" the one left out, all are no
// filter
export function status_rows(doctype, fieldname, values, all) {
	const ticked = all.filter((v) => values.includes(v));
	if (!ticked.length || ticked.length === all.length) return [];
	if (ticked.length === 1) return [[doctype, fieldname, "=", ticked[0]]];
	return [[doctype, fieldname, "!=", all.find((v) => !ticked.includes(v))]];
}

export function status_values(rows, all) {
	const p = picked(rows);
	if (!p) return null;
	const values = p.values.map(String);
	return {
		positive: true,
		values: p.positive ? values : all.filter((v) => !values.includes(v)),
	};
}

// Email, Phone and Website filters: whether a record has one ("set" / "not set"), or how its
// value matches: a domain, a start or a part, or (an email) the whole address
const bare_domain = (text) =>
	text
		.trim()
		.replace(/^@/, "")
		.replace(/^[a-z]+:\/\//i, "")
		.replace(/^www\./i, "")
		.split("/")[0];

export function contact_rows(doctype, fieldname, kind, { presence, mode, text }) {
	if (presence !== "match") return [[doctype, fieldname, "is", presence]];
	const value = text.trim();
	if (!value) return [];
	const like = (pattern) => [[doctype, fieldname, "like", pattern]];
	if (mode === "is") return [[doctype, fieldname, "=", value]];
	if (mode === "starts") return like(`${value}%`);
	if (mode === "domain")
		return like(kind === "email" ? `%@${bare_domain(value)}` : `%${bare_domain(value)}%`);
	return like(`%${value}%`);
}

export function contact_read(kind, rows) {
	if (!rows.length) return { presence: "match", mode: null, text: "" };
	if (rows.length !== 1) return null;
	const condition = condition_of(rows[0]);
	const value = String(rows[0][3] ?? "");
	if (condition === "is") return { presence: value, mode: null, text: "" };
	if (condition === "=" && kind === "email")
		return { presence: "match", mode: "is", text: value };
	if (condition !== "like") return null;
	const domain = kind === "email" && value.match(/^%@([^%]+)$/);
	if (domain) return { presence: "match", mode: "domain", text: domain[1] };
	const start = kind === "phone" && value.match(/^([^%]+)%$/);
	if (start) return { presence: "match", mode: "starts", text: start[1] };
	const part = value.match(/^%([^%]+)%$/);
	if (!part) return null;
	const site = kind === "url" && /^[^\s/]+\.[^\s/]+$/.test(part[1]);
	return { presence: "match", mode: site ? "domain" : "contains", text: part[1] };
}

export function contact_words(read, __) {
	if (read.presence === "set") return __("present");
	if (read.presence === "not set") return __("missing");
	if (read.mode === "domain") return __("domain {0}", [read.text]);
	if (read.mode === "starts") return __("starts with {0}", [read.text]);
	if (read.mode === "contains") return __("contains {0}", [read.text]);
	return read.text;
}

export const is_yes = (value) => [1, "1", true, "Yes"].includes(value);

// a Check row: = 1 or = 0, as Advanced writes it
export function check_value(rows) {
	if (rows.length !== 1 || rows[0][2] !== "=") return rows.length ? null : undefined;
	return is_yes(rows[0][3]);
}

const unwrap = (value) => String(value ?? "").replace(/^%|%$/g, "");

// a "contains" value: %text% with no other wildcard; "INV-%" (starts with) is not one
const is_contains = (value) => /^%[^%]*%$/.test(String(value ?? ""));

// one row in one of `conditions`, as { condition, value }; a like value loses its wildcards
export function single(rows, conditions) {
	if (rows.length !== 1) return null;
	const condition = conditions.find((c) => same_condition(c, rows[0][2]));
	if (!condition) return null;
	if (!condition.endsWith("like")) return { condition, value: rows[0][3] };
	return is_contains(rows[0][3]) ? { condition, value: unwrap(rows[0][3]) } : null;
}

// Assigned To, Liked By and Tags: one "contains" row per name, all like or all not like
export function like_values(rows) {
	if (!rows.length) return null;
	const condition = condition_of(rows[0]);
	const fits =
		["like", "not like"].includes(condition) &&
		rows.every((r) => condition_of(r) === condition && is_contains(r[3]));
	return fits ? { positive: condition === "like", values: rows.map((r) => unwrap(r[3])) } : null;
}

export const like_rows = (doctype, fieldname, positive, values) =>
	values.map((v) => [doctype, fieldname, positive ? "like" : "not like", `%${v}%`]);

export function single_row(doctype, fieldname, condition, value) {
	if (value == null || value === "" || (Array.isArray(value) && !value.some(Boolean))) {
		return [];
	}
	const wrapped = condition.endsWith("like") ? `%${unwrap(value)}%` : value;
	return [[doctype, fieldname, condition, wrapped]];
}

// a number range is two rows, at least and at most, so Advanced shows it as they are
export function range(rows) {
	if (rows.length !== 2) return null;
	const from = rows.find((r) => r[2] === ">=");
	const to = rows.find((r) => r[2] === "<=");
	return from && to ? { from: from[3], to: to[3] } : null;
}

export function range_rows(doctype, fieldname, from, to) {
	const rows = [];
	if (from !== "" && from != null) rows.push([doctype, fieldname, ">=", from]);
	if (to !== "" && to != null) rows.push([doctype, fieldname, "<=", to]);
	return rows;
}

export function rows_by_field(rows) {
	const by_field = new Map();
	for (const row of rows) {
		const key = field_key(row[0], row[1]);
		by_field.set(key, [...(by_field.get(key) || []), row]);
	}
	return by_field;
}

// the first `max` values in words, and how many more are left out; values left out of a "not"
// read as one or another of them
function some_values(values, show, max, __ = null) {
	const shown = values.slice(0, max).map(show);
	const more = Math.max(values.length - max, 0);
	const either = __ && !more && shown.length > 1;
	return {
		text: either
			? __("{0} or {1}", [shown.slice(0, -1).join(", "), shown.at(-1)])
			: shown.join(", "),
		more,
	};
}

// how one field's rows read as one chip: its names (for Assigned To, Liked By and Tags, with
// `names`), a range, or its one row; any other set of rows reads as a count. Up to `max`
// values are named. `when` says the values are dates or times, which read as before and after.
export function describe_rows(rows, show, __, names, max, when) {
	const listed = names && like_values(rows);
	if (listed) {
		if (listed.positive) return some_values(listed.values, show, max);
		const some = some_values(listed.values, show, max, __);
		return { ...some, text: __("not {0}", [some.text]) };
	}
	if (rows.length === 1) return describe_parts(rows[0], show, __, max, when);
	const r = range(rows);
	if (r) return { text: `${show(r.from)} – ${show(r.to)}`, more: 0 };
	return { text: __("{0} conditions", [rows.length]), more: 0 };
}

// how a chip reads a row, as words and how many more values they leave out, so the count can
// show even when the words are cut short; `show` prints one value the way the field does
function describe_parts(row, show, __, max, when) {
	switch (condition_of(row)) {
		case "in":
			return some_values(as_list(row[3]), show, max);
		case "not in": {
			const some = some_values(as_list(row[3]), show, max, __);
			return { ...some, text: __("not {0}", [some.text]) };
		}
	}
	return { text: describe(row, show, __, when), more: 0 };
}

// the same row, whatever the case of its condition or the order of an "in" list
function same_row(a, b) {
	const value = (row) => {
		const list = ["in", "not in"].includes(condition_of(row));
		return JSON.stringify(list ? as_list(row[3]).map(String).sort() : String(row[3] ?? ""));
	};
	return a[0] === b[0] && a[1] === b[1] && same_condition(a[2], b[2]) && value(a) === value(b);
}

export const has_rows = (filters, rows) => rows.every((r) => filters.some((f) => same_row(f, r)));

export function describe(row, show, __, when) {
	const value = row[3];
	const short = (list) =>
		list.length > 1 ? `${show(list[0])} +${list.length - 1}` : list.map(show).join(", ");

	switch (condition_of(row)) {
		case "=":
			return show(value);
		case "descendants of (inclusive)":
			return __("{0} and below", [show(value)]);
		case "descendants of":
			return __("descendants of {0}", [show(value)]);
		case "not descendants of":
			return __("not descendants of {0}", [show(value)]);
		case "ancestors of":
			return __("ancestors of {0}", [show(value)]);
		case "not ancestors of":
			return __("not ancestors of {0}", [show(value)]);
		case "!=":
			return __("not {0}", [show(value)]);
		case "in":
			return short(as_list(value));
		case "not in":
			return __("not {0}", [short(as_list(value))]);
		case "like":
			if (is_contains(value)) return __("contains {0}", [unwrap(value)]);
			if (/^[^%]+%$/.test(value)) return __("starts with {0}", [unwrap(value)]);
			if (/^%[^%]+$/.test(value)) return __("ends with {0}", [unwrap(value)]);
			return __("like {0}", [value]);
		case "not like":
			return is_contains(value)
				? __("doesn't contain {0}", [unwrap(value)])
				: __("not like {0}", [value]);
		case "is":
			return value === "set" ? __("is set") : __("is not set");
		case ">":
			return when ? __("after {0}", [show(value)]) : __("more than {0}", [show(value)]);
		case "<":
			return when ? __("before {0}", [show(value)]) : __("less than {0}", [show(value)]);
		case ">=":
			return when ? __("on or after {0}", [show(value)]) : __("at least {0}", [show(value)]);
		case "<=":
			return when ? __("on or before {0}", [show(value)]) : __("at most {0}", [show(value)]);
		case "between":
			return as_list(value).map(show).join(" – ");
		case "timespan":
			return show(value);
		// a condition an app adds, such as "fiscal year": the caller passes its label as the condition
		default:
			return `${row[2]} ${as_list(value).join(", ")}`;
	}
}

// rows with an app's period condition, such as "fiscal year", renamed to its label
export const with_period_labels = (rows, app_periods) =>
	rows.map((r) => {
		const label = app_periods.find((p) => p.condition === r[2])?.label;
		return label ? [r[0], r[1], label, r[3]] : r;
	});
