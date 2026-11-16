<script setup>
import { computed, inject, ref, watch } from "vue";
import { useEventListener } from "@vueuse/core";
import { Combobox, DatePicker, DateRangePicker, Select } from "frappe-ui";

import TogglePill from "./toggle_pill.vue";
import { condition_options } from "./kinds.js";
import { as_list, single, single_row } from "./wire.js";

// A date or datetime: a period such as This Month, or a date with a condition, or a range
const props = defineProps({
	field: { type: Object, required: true },
	rows: { type: Array, required: true },
	conditions: { type: Array, required: true },
});
const emit = defineEmits(["set"]);

const __ = window.__;
const periods = inject("timespans");
// a field that holds only past dates offers no future periods or days; "only future" limits
// the form alone, since a stored date passes and old records are what a filter looks back at
const past_only = props.field.allowed_dates === "Past";
const shown_periods = computed(() =>
	past_only
		? periods
				.map((g) => ({
					...g,
					options: g.options.filter((o) => !/^(next|tomorrow)/.test(o.value)),
				}))
				.filter((g) => g.options.length)
		: periods
);
const unavailable = (date) => past_only && date.isAfter(new Date(), "day");

// a calendar's own outside click doesn't see clicks inside the island's shadow root, so a
// press anywhere off the date box and its calendar closes it here
const calendar_open = ref(false);
const date_box = ref(null);
useEventListener(
	() => date_box.value?.getRootNode(),
	"pointerdown",
	(e) => {
		if (!calendar_open.value) return;
		const inside = e
			.composedPath()
			.some(
				(el) =>
					el === date_box.value || el?.hasAttribute?.("data-reka-popper-content-wrapper")
			);
		if (!inside) calendar_open.value = false;
	},
	{ capture: true }
);

// dates show and are typed as the user's settings write them
const date_format = inject("date_format");
const time_zone = inject("time_zone");
const app_periods = inject("app_periods");
const app_period_of = (c) => app_periods.find((p) => p.condition === c);
const options = computed(() =>
	condition_options("date", props.conditions, __).map((o) => ({
		...o,
		label: app_period_of(o.value)?.label ?? o.label,
	}))
);

const current = computed(() => single(props.rows, props.conditions));
const condition = ref(props.conditions[0]);
watch(current, (c) => c && (condition.value = c.condition), { immediate: true });

const value = computed(() =>
	current.value?.condition === condition.value ? current.value.value : null
);

// a Datetime compares to the user's day: from its first second, or to its last for "on or
// before" and "after", so the day falls on the side the words put it; the database keeps
// datetimes in the system's time zone, as desk's Datetime field writes them
const COMPARE = [">", "<", ">=", "<="];
const END_OF_DAY = ["<=", ">"];
const datetime_compare = () =>
	props.field.fieldtype === "Datetime" && COMPARE.includes(condition.value);
function set(v) {
	const time = END_OF_DAY.includes(condition.value) ? "23:59:59" : "00:00:00";
	const stored = v && datetime_compare() ? time_zone.to_system(`${v} ${time}`) : v;
	emit("set", single_row(props.field.doctype, props.field.fieldname, condition.value, stored));
}
const shown = computed(() =>
	value.value && datetime_compare() ? time_zone.to_user(value.value) : value.value
);

function set_condition(c) {
	condition.value = c;
	if (props.rows.length) emit("set", []);
}

const pick_period = (v) => set(value.value === v ? null : v);

// typed text the picker can't read comes back as no range: the range stays, shown again; the
// field's Clear removes it
const range_key = ref(0);
function pick_range(v) {
	if (v?.length) set(v);
	else range_key.value++;
}

// an app's period, such as Fiscal Year, lists its own values
const load_app_period = inject("app_period_values");
const app_period_values = ref([]);
watch(
	condition,
	async (c) => {
		const values = app_period_of(c) ? await load_app_period(c) : [];
		if (condition.value === c) app_period_values.value = values;
	},
	{ immediate: true }
);
const date_of = (v) => (v ? String(v).slice(0, 10) : "");
</script>

<template>
	<div class="space-y-4">
		<Select
			:model-value="condition"
			:options="options"
			:label="__('Condition')"
			@update:model-value="set_condition"
		/>

		<div v-if="condition === 'Timespan'" class="space-y-3">
			<div v-for="group in shown_periods" :key="group.label">
				<p class="mb-2 text-sm text-ink-gray-5">{{ group.label }}</p>
				<div class="flex flex-wrap gap-2" role="group" :aria-label="group.label">
					<TogglePill
						v-for="period in group.options"
						:key="period.value"
						:label="period.label"
						:dot="false"
						:on="value === period.value"
						@click="pick_period(period.value)"
					/>
				</div>
			</div>
		</div>
		<Combobox
			v-else-if="app_period_of(condition)"
			trigger="button"
			:model-value="value"
			:options="app_period_values"
			:label="app_period_of(condition).label"
			:placeholder="__('Pick one')"
			@update:model-value="(v) => set(v || null)"
		/>
		<div v-else ref="date_box">
			<DateRangePicker
				v-if="condition === 'Between'"
				:key="range_key"
				v-model:open="calendar_open"
				:format="date_format"
				:clearable="false"
				:is-date-unavailable="unavailable"
				:model-value="value ? as_list(value) : []"
				:label="__('Dates')"
				:placeholder="__('{0} to {0}', [date_format])"
				@update:model-value="pick_range"
			/>
			<DatePicker
				v-else
				v-model:open="calendar_open"
				:format="date_format"
				:is-date-unavailable="unavailable"
				:model-value="date_of(shown)"
				:label="__('Date')"
				:placeholder="__('Pick a date')"
				@update:model-value="(v) => set(v || null)"
			/>
		</div>
	</div>
</template>
