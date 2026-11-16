<script setup>
import { computed, nextTick, provide, ref, watch } from "vue";
import { Button } from "frappe-ui";
import { useHost } from "@framework/ui/island";

import FieldPicker from "./field_picker.vue";
import FieldRail from "./field_rail.vue";
import Suggestions from "./suggestions.vue";
import {
	VALUE_KINDS,
	contact_kind,
	lists_names,
	picker_kind,
	reads_as_time,
	value_text,
} from "./kinds.js";
import {
	contact_read,
	contact_words,
	describe_rows,
	field_key,
	rows_by_field,
	with_period_labels,
} from "./wire.js";

// The Simple tab of a list's filter panel. Desk owns the filters: it passes them in on every
// change, and this asks it to replace one field's rows. See frappe.ui.FilterPanel.
const props = defineProps({
	// [{ label, table, fields: [{ doctype, fieldname, label, fieldtype, options, conditions }] }]
	groups: { type: Array, required: true },
	// [[doctype, fieldname, condition, value], ...]
	filters: { type: Array, required: true },
	// what the list itself counted for these filters, { value, capped, stale }, or null when it
	// doesn't count
	count: { type: Object, default: null },
	// desk's periods, grouped: [{ label, options: [{ label, value }] }]
	timespans: { type: Array, required: true },
	// desk's search_link, made by desk with its session
	search: { type: Function, required: true },
	// how desk's Link field loads and shows each DocType's records, from desk's boot
	link_settings: { type: Object, required: true },
	// a record's title, for a Link that shows titles, once desk has it
	link_title: { type: Function, required: true },
	// a field's label as desk shows it, for a filter on a field this list doesn't offer
	field_label: { type: Function, required: true },
	// a Link record desk has already fetched for a title, as search_link returns it
	link_row: { type: Function, required: true },
	// the user's date format, as dayjs spells it
	date_format: { type: String, required: true },
	// a datetime moved between the user's time zone and the one the database keeps
	to_system_tz: { type: Function, required: true },
	to_user_tz: { type: Function, required: true },
	// the dialling codes a Phone filter offers, as [{ value, label }]
	phone_codes: { type: Function, required: true },
	// the colour desk gives a tag
	tag_theme: { type: Function, required: true },
	// periods an app adds to date filters, such as Fiscal Year, and a call that lists one's values
	app_periods: { type: Array, required: true },
	app_period_values: { type: Function, required: true },
	// the filters the list's settings suggest, one filter each: [{ name, label, icon, row }]
	suggestions: { type: Array, default: () => [] },
	// the field this user filtered last on this list, as a field key
	last_field: { type: String, default: "" },
});
const emit = defineEmits(["set", "apply", "focus", "advanced", "clear"]);

const __ = window.__;
const host = useHost();
provide("timespans", props.timespans);
provide("search", props.search);
provide("link_settings", props.link_settings);
provide("link_row", props.link_row);
provide("date_format", props.date_format);
provide("time_zone", { to_system: props.to_system_tz, to_user: props.to_user_tz });
provide("phone_codes", props.phone_codes);
provide("tag_theme", props.tag_theme);
provide("app_periods", props.app_periods);
provide("app_period_values", props.app_period_values);

const fields = computed(() => props.groups.flatMap((g) => g.fields));
const field_of = (doctype, fieldname) =>
	fields.value.find((f) => f.doctype === doctype && f.fieldname === fieldname);
const field_at = (key) => fields.value.find((f) => field_key(f.doctype, f.fieldname) === key);

// one value, the way the field prints it in desk; one printer per field, kept
const periods = props.timespans.flatMap((g) => g.options);
const printers = new Map();
function show_for(field) {
	if (!printers.has(field)) {
		printers.set(
			field,
			(value) =>
				(field?.fieldtype === "Link" && props.link_title(field.options, value)) ||
				(!!field &&
					picker_kind(field) === "user_like" &&
					props.link_title("User", value)) ||
				value_text(field, value, {
					__,
					format: host.format,
					timespans: periods,
					to_user_tz: props.to_user_tz,
				})
		);
	}
	return printers.get(field);
}

// a field whose values are picked from a list, as the likeliest first filter; never ID
const picks_values = (f) =>
	!f.table && f.fieldname !== "name" && VALUE_KINDS.includes(picker_kind(f));
// a filtered field, else the last one used here, the status, then a field to pick values from
const start =
	(props.filters.length && field_of(props.filters[0][0], props.filters[0][1])) ||
	field_at(props.last_field) ||
	fields.value.find((f) => !f.table && f.fieldname === "status" && picks_values(f)) ||
	fields.value.find((f) => f.standard && picks_values(f)) ||
	fields.value.find(picks_values) ||
	fields.value[0];
const focus = ref(start && field_key(start.doctype, start.fieldname));
const focused = computed(() => field_at(focus.value));
// a field Simple doesn't list, such as Amended From, is edited in Advanced; one picked here
// takes typing at once in its search or text box
function select(key) {
	if (!field_at(key)) return emit("advanced");
	focus.value = key;
	emit("focus", key);
	nextTick(() => root.value?.querySelector("section [data-autofocus]")?.focus());
}

// each filtered field with its rows, in the field list's order so chips don't jump; an app's
// period, such as Fiscal Year, reads by its own label
const place = (key) => {
	const i = fields.value.findIndex((f) => field_key(f.doctype, f.fieldname) === key);
	return i < 0 ? Infinity : i;
};
const filtered = computed(() =>
	[...rows_by_field(props.filters)]
		.sort(([a], [b]) => place(a) - place(b))
		.map(([key, rows]) => ({
			key,
			field: field_at(key),
			rows: with_period_labels(rows, props.app_periods),
		}))
);
const describe_field = ({ field, rows }, values) => {
	const contact = field && picker_kind(field) === "contact";
	const read = contact && contact_read(contact_kind(field), rows);
	if (read) return { text: contact_words(read, __), more: 0 };
	return describe_rows(
		rows,
		show_for(field),
		__,
		!!field && lists_names(field),
		values,
		reads_as_time(field)
	);
};

// one chip a field, which clears that field
const CHIP_VALUES = 3;
const chips = computed(() =>
	filtered.value.map((f) => {
		const [doctype, fieldname] = f.rows[0];
		return {
			key: f.key,
			doctype,
			fieldname,
			label: f.field?.table
				? `${f.field.label} (${f.field.table})`
				: f.field?.label || props.field_label(doctype, fieldname),
			...describe_field(f, CHIP_VALUES),
		};
	})
);
const summaries = computed(
	() => new Map(filtered.value.map((f) => [f.key, describe_field(f, 1)]))
);

// focus stays here when the chip or Clear all that had it goes: on the next chip, else the field
// search
const root = ref(null);
let refocus = null;
function remove(chip, i) {
	refocus = i;
	emit("set", chip.doctype, chip.fieldname, []);
}
function clear() {
	refocus = 0;
	emit("clear");
}
watch(chips, async (list, old) => {
	if (refocus === null || list.length >= old.length) return;
	const at = Math.min(refocus, list.length - 1);
	refocus = null;
	await nextTick();
	const removes = root.value.querySelectorAll("[data-remove]");
	(removes[at] || root.value.querySelector("input"))?.focus();
});

// each suggestion with its field, whose icon it falls back to
const suggested = computed(() =>
	props.suggestions.map((s) => ({ ...s, field: field_of(s.row[0], s.row[1]) }))
);

const filters_text = computed(() => {
	const n = chips.value.length;
	if (!n) return "";
	return n === 1 ? __("1 filter") : __("{0} filters", [n]);
});
const lead = computed(() => {
	const c = props.count;
	if (!c) return filters_text.value || __("No filters applied");
	const n = `${host.format(c.value, { fieldtype: "Float" })}${c.capped ? "+" : ""}`;
	return c.value === 1 && !c.capped ? __("1 result") : __("{0} results", [n]);
});
const trail = computed(() => {
	if (!props.count) return "";
	return filters_text.value || __("No filters applied");
});
</script>

<template>
	<div ref="root" class="flex h-full flex-col bg-surface-base text-ink-gray-9">
		<Suggestions
			v-if="suggestions.length"
			:suggestions="suggested"
			:filters="filters"
			@apply="(changes) => emit('apply', changes)"
		/>

		<!-- what the filters found and every filter on, always shown, so nothing hides here -->
		<div class="shrink-0 border-b border-outline-gray-1 px-4 py-2">
			<div class="flex h-7 items-center gap-1.5 text-base text-ink-gray-5">
				<p class="flex min-w-0 flex-1 items-center gap-1.5" aria-live="polite">
					<span
						class="truncate font-medium tabular-nums"
						:class="!count?.stale && (count || chips.length) && 'text-ink-gray-9'"
					>
						{{ lead }}
					</span>
					<template v-if="trail">
						<span aria-hidden="true">·</span>
						<span class="truncate">{{ trail }}</span>
					</template>
				</p>
				<Button
					v-if="chips.length"
					class="shrink-0"
					size="sm"
					variant="ghost"
					:label="__('Clear all')"
					@click="clear"
				/>
			</div>
			<div
				v-if="chips.length"
				class="my-1 flex flex-wrap items-center gap-1.5"
				role="group"
				:aria-label="__('Applied filters')"
			>
				<div
					v-for="(chip, i) in chips"
					:key="chip.key"
					class="inline-flex h-7 min-w-0 max-w-full items-stretch rounded-4 border border-outline-gray-2 bg-surface-base text-sm"
				>
					<button
						type="button"
						class="flex min-w-0 items-center gap-1 rounded-s-4 ps-2 pe-0.5 hover:bg-surface-gray-2"
						:title="`${chip.label} ${chip.text}${chip.more ? ` +${chip.more}` : ''}`"
						@click="select(chip.key)"
					>
						<span class="min-w-0 max-w-40 shrink-0 truncate text-ink-gray-6">{{
							chip.label
						}}</span>
						<span class="min-w-0 max-w-60 truncate font-medium text-ink-gray-9">
							{{ chip.text }}
						</span>
						<span v-if="chip.more" class="shrink-0 font-medium text-ink-gray-5">
							+{{ chip.more }}
						</span>
					</button>
					<button
						type="button"
						class="flex w-6 shrink-0 items-center justify-center rounded-e-4 text-ink-gray-5 hover:bg-surface-gray-2 hover:text-ink-gray-9"
						data-remove
						:aria-label="__('Remove {0} filter', [chip.label])"
						@click="remove(chip, i)"
					>
						<span class="lucide-x size-3.5" aria-hidden="true" />
					</button>
				</div>
			</div>
		</div>

		<div class="flex min-h-0 flex-1">
			<FieldRail
				class="w-56 shrink-0 border-e border-outline-gray-1"
				:groups="groups"
				:active="focus"
				:summaries="summaries"
				@select="select"
			/>
			<!-- the picker's own parts scroll; --pane-x lets them reach the pane's edges -->
			<section
				class="flex min-h-0 min-w-0 flex-1 flex-col px-[var(--pane-x)] pt-5 [--pane-x:theme(spacing.5)]"
			>
				<FieldPicker
					v-if="focused"
					:key="focus"
					class="min-h-0 flex-1"
					:field="focused"
					:fields="fields"
					:filters="filters"
					:show="show_for(focused)"
					@set="(...args) => emit('set', ...args)"
					@advanced="emit('advanced')"
					@select="select"
				/>
			</section>
		</div>
	</div>
</template>
