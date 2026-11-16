<script setup>
import { computed, inject, ref } from "vue";
import { Badge, Button, Radio, RadioGroup } from "frappe-ui";

import CompareFilter from "./compare_filter.vue";
import DateFilter from "./date_filter.vue";
import Notice from "./notice.vue";
import TextFilter from "./text_filter.vue";
import ContactFilter from "./contact_filter.vue";
import ValuesPicker from "./values_picker.vue";
import FieldIcon from "./field_icon.vue";
import {
	TREE,
	VALUE_KINDS,
	contact_kind,
	picker_conditions,
	picker_kind,
	reads_as_time,
	shows_pills,
} from "./kinds.js";
import {
	check_value,
	contact_read,
	describe,
	field_key,
	like_values,
	picked,
	range,
	rows_of,
	same_condition,
	single,
	with_period_labels,
} from "./wire.js";

const props = defineProps({
	field: { type: Object, required: true },
	fields: { type: Array, required: true },
	filters: { type: Array, required: true },
	show: { type: Function, required: true },
});
const emit = defineEmits(["set", "advanced", "select"]);

const __ = window.__;

const rows = computed(() => rows_of(props.filters, props.field.doctype, props.field.fieldname));
const kind = computed(() => picker_kind(props.field));
const app_periods = inject("app_periods");
const conditions = computed(() =>
	picker_conditions(
		props.field,
		kind.value,
		app_periods.map((p) => p.condition)
	)
);
const tree = computed(() => conditions.value.includes(TREE));

// a Dynamic Link names its DocType in another field of the same table
const type_field = computed(() =>
	kind.value === "dynamic"
		? props.fields.find(
				(f) => f.doctype === props.field.doctype && f.fieldname === props.field.options
		  )
		: null
);
const type_picked = computed(() => {
	if (!type_field.value) return null;
	const p = picked(rows_of(props.filters, props.field.doctype, type_field.value.fieldname));
	return p?.positive && p.values.length === 1 ? p.values[0] : null;
});
// made once a type, so the picker doesn't search again on every filter change
const dynamic_field = computed(
	() => type_picked.value && { ...props.field, fieldtype: "Link", options: type_picked.value }
);

// rows the picker can't show, such as two on one field or "is set", stay as they are
const fits = computed(() => {
	if (!conditions.value.length) return false;
	if (!rows.value.length) return true;
	const allowed = (row) => conditions.value.some((c) => same_condition(c, row[2]));
	switch (kind.value) {
		case "user_like":
		case "tag_like":
			return like_values(rows.value) !== null;
		case "check":
			return check_value(rows.value) !== null;
		case "contact":
			return contact_read(contact_kind(props.field), rows.value) !== null;
		case "options":
		case "link":
		case "dynamic":
			if (picked(rows.value) === null || !allowed(rows.value[0])) return false;
			// a tree's record is picked alone, with its descendants: a list or "not" stays in
			// Advanced
			return (
				!tree.value ||
				(rows.value.length === 1 &&
					["=", TREE].some((c) => same_condition(c, rows.value[0][2])))
			);
		case "number":
		case "duration":
			return !!(single(rows.value, conditions.value) || range(rows.value));
		default:
			return !!single(rows.value, conditions.value);
	}
});

const hint = computed(() => {
	const f = props.field;
	if (f.description) return f.description;
	// stored as text, but each holds a list of names
	if (f.fieldname === "_assign") return __("People it is assigned to");
	if (f.fieldname === "_liked_by") return __("People who liked it");
	if (f.fieldname === "_user_tags") return __("Tags added to it");
	if (f.table) return __("{0} table, matches when any row fits", [f.table]);
	if (f.fieldtype === "Link" && f.fieldname !== "name")
		return __("Link to {0}", [__(f.options)]);
	if (type_field.value) return __("Its type is set in {0}", [type_field.value.label]);
	// a field's type ("Small Text", "Select") means nothing to the people filtering
	return "";
});

const set = (next) => emit("set", props.field.doctype, props.field.fieldname, next);

// the header's Clear goes once nothing is set, so keyboard focus moves on to the picker below
const picker_el = ref(null);
function clear(e) {
	const had_focus = e.currentTarget === e.currentTarget.getRootNode().activeElement;
	set([]);
	if (!had_focus) return;
	picker_el.value
		?.querySelector(":scope > :not(:first-child) :is(button, input):not(:disabled)")
		?.focus({ preventScroll: true });
}

// a list of values to tick has its own Clear, over its picks; a tree's radios have none
const list_clears = computed(
	() =>
		fits.value &&
		((["link", "user_like", "tag_like"].includes(kind.value) && !tree.value) ||
			(kind.value === "options" && !shows_pills(props.field, __)) ||
			(kind.value === "dynamic" && !!type_picked.value))
);

const check = computed(() => {
	const value = check_value(rows.value);
	return value === undefined ? "any" : value ? "yes" : "no";
});
function pick_check(value) {
	if (value === "any") return set([]);
	set([[props.field.doctype, props.field.fieldname, "=", value === "yes" ? 1 : 0]]);
}
</script>

<template>
	<div ref="picker_el" class="flex min-h-0 flex-col gap-4">
		<div class="flex shrink-0 items-start gap-3">
			<div
				class="flex size-9 shrink-0 items-center justify-center rounded-4 bg-surface-gray-2 text-ink-gray-6"
			>
				<FieldIcon class="size-4" :field="field" />
			</div>
			<div class="min-w-0 flex-1">
				<h3 class="truncate text-lg font-semibold text-ink-gray-9" :title="field.label">
					{{ field.label }}
				</h3>
				<p v-if="hint" class="line-clamp-2 text-sm text-ink-gray-5" :title="hint">
					{{ hint }}
				</p>
				<p
					v-if="field.slow"
					class="mt-1 flex items-center gap-1.5 text-sm text-ink-gray-5"
				>
					<span class="lucide-hourglass size-3.5 shrink-0" aria-hidden="true" />
					{{ __("This list is large, so filtering on this field can be slow") }}
				</p>
			</div>
			<Button
				v-if="rows.length && !list_clears"
				variant="ghost"
				:label="__('Clear')"
				@click="clear"
			/>
		</div>

		<Notice
			v-if="!fits"
			class="shrink-0"
			:text="
				rows.length
					? __('Set in Advanced. It still filters the list.')
					: __('Filter this field in Advanced.')
			"
			:action="__('Edit in Advanced')"
			@action="emit('advanced')"
		>
			<div v-if="rows.length" class="flex flex-col items-start gap-1.5">
				<Badge
					v-for="(row, i) in with_period_labels(rows, app_periods)"
					:key="i"
					:label="`${field.label} ${describe(row, show, __, reads_as_time(field))}`"
					theme="gray"
					variant="subtle"
					size="lg"
				/>
			</div>
		</Notice>

		<template v-else-if="kind === 'dynamic'">
			<ValuesPicker
				v-if="type_picked"
				:key="type_picked"
				class="min-h-0 flex-1"
				:field="dynamic_field"
				:rows="rows"
				:conditions="conditions"
				@set="set"
			/>
			<Notice
				v-else
				class="shrink-0"
				:text="
					__('Pick one {0} first, then the records of that type.', [type_field?.label])
				"
				:action="__('Pick {0}', [type_field?.label])"
				@action="emit('select', field_key(field.doctype, field.options))"
			/>
		</template>

		<!-- a list of values scrolls under its own search; anything else scrolls as a whole -->
		<ValuesPicker
			v-else-if="VALUE_KINDS.includes(kind)"
			class="min-h-0 flex-1"
			:field="field"
			:rows="rows"
			:conditions="conditions"
			@set="set"
		/>
		<div
			v-else
			class="-mx-[var(--pane-x)] min-h-0 flex-1 overflow-y-auto px-[var(--pane-x)] pb-10"
		>
			<RadioGroup
				v-if="kind === 'check'"
				class="-mx-1.5"
				padded
				:aria-label="field.label"
				:model-value="check"
				@update:model-value="pick_check"
			>
				<Radio value="any" :label="__('Any')" />
				<Radio value="yes" :label="__('Yes')" />
				<Radio value="no" :label="__('No')" />
			</RadioGroup>
			<ContactFilter v-else-if="kind === 'contact'" :field="field" :rows="rows" @set="set" />
			<TextFilter
				v-else-if="kind === 'text'"
				:field="field"
				:rows="rows"
				:conditions="conditions"
				@set="set"
			/>
			<DateFilter
				v-else-if="kind === 'date'"
				:field="field"
				:rows="rows"
				:conditions="conditions"
				@set="set"
			/>
			<CompareFilter
				v-else
				:field="field"
				:kind="kind"
				:rows="rows"
				:conditions="conditions"
				@set="set"
			/>
		</div>
	</div>
</template>
