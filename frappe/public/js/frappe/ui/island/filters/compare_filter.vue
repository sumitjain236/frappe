<script setup>
import { computed, ref } from "vue";
import { Rating, Select, Slider, TabButtons, TextInput, TimePicker } from "frappe-ui";

import DurationInput from "./duration_input.vue";
import { RANGE, condition_options, from_stars, out_of, to_stars } from "./kinds.js";
import { use_draft } from "./use_draft.js";
import { range, range_rows, single, single_row } from "./wire.js";

// A number, duration, rating or time compared to a value. Numbers and durations also take a
// range, written as two rows (at least, at most) so Advanced shows it as it is.
const props = defineProps({
	field: { type: Object, required: true },
	kind: { type: String, required: true },
	rows: { type: Array, required: true },
	conditions: { type: Array, required: true },
});
const emit = defineEmits(["set"]);

const __ = window.__;

const has_range = computed(
	() =>
		["number", "duration"].includes(props.kind) &&
		props.conditions.includes(">=") &&
		props.conditions.includes("<=")
);
const options = computed(() =>
	condition_options(props.kind, [...(has_range.value ? [RANGE] : []), ...props.conditions], __)
);

const condition = ref(null);
const one = ref(null);
const from = ref(null);
const to = ref(null);

const blank = (v) => v === null || v === undefined || v === "";
const value_of = (v) => (blank(v) ? null : props.kind === "time" ? v : Number(v));

function save() {
	const { doctype, fieldname } = props.field;
	const next =
		condition.value === RANGE
			? range_rows(doctype, fieldname, value_of(from.value), value_of(to.value))
			: single_row(doctype, fieldname, condition.value, value_of(one.value));
	if (JSON.stringify(next) !== JSON.stringify(props.rows)) emit("set", next);
}

const draft = use_draft(
	() => props.rows,
	(rows) => {
		const r = range(rows);
		const s = single(rows, props.conditions);
		// a range open at one end is a single at least or at most; it stays a range while it is one
		const open_end = condition.value === RANGE && [">=", "<="].includes(s?.condition);
		if (r) [condition.value, from.value, to.value] = [RANGE, r.from, r.to];
		else if (open_end)
			[from.value, to.value] = s.condition === ">=" ? [s.value, null] : [null, s.value];
		else if (s) [condition.value, one.value] = [s.condition, s.value];
		else [one.value, from.value, to.value] = [null, null, null];
		condition.value ??= options.value[0]?.value;
	},
	save
);

function set_condition(value) {
	condition.value = value;
	save();
}

// typed values save after a pause; a picked time or star saves at once
const boxes = { one, from, to };
function typed(box, value) {
	boxes[box].value = value;
	draft.queue();
}
function picked(value) {
	one.value = value;
	save();
}

const limits = computed(() => ({
	min: props.field.min_value ?? (props.field.non_negative ? 0 : undefined),
	max: props.field.max_value ?? undefined,
}));

// a percent, or a number whose field sets both ends, also slides between its ends; an end that
// is reached means no limit on that side
const bounds = computed(() => {
	const f = props.field;
	if (props.kind !== "number") return null;
	if (f.fieldtype === "Percent") return [f.min_value ?? 0, f.max_value ?? 100];
	const low = f.min_value ?? (f.non_negative ? 0 : null);
	return low != null && f.max_value != null ? [low, f.max_value] : null;
});
const step = computed(() =>
	props.field.fieldtype === "Int" || props.field.fieldtype === "Percent"
		? 1
		: (bounds.value[1] - bounds.value[0]) / 100
);
const at = (v, end) =>
	blank(v) ? end : Math.min(Math.max(Number(v), bounds.value[0]), bounds.value[1]);
const slid = computed(() =>
	condition.value === RANGE
		? [at(from.value, bounds.value[0]), at(to.value, bounds.value[1])]
		: [at(one.value, bounds.value[0])]
);
function slide(values) {
	const [lo, hi] = bounds.value;
	if (condition.value === RANGE) {
		from.value = values[0] === lo ? null : values[0];
		to.value = values[1] === hi ? null : values[1];
	} else one.value = values[0];
}

const stars = computed(() => (blank(one.value) ? 0 : to_stars(one.value, props.field)));

// the picker gives "10:30"; a Time filter is read as "10:30:00"
const with_seconds = (time) => (/^\d{1,2}:\d{2}$/.test(time) ? `${time}:00` : time);
</script>

<template>
	<div class="space-y-4">
		<template v-if="kind === 'rating'">
			<TabButtons
				:model-value="condition"
				:options="options"
				:aria-label="__('Condition')"
				@update:model-value="set_condition"
			/>
			<Rating
				:model-value="stars"
				:max="out_of(field)"
				size="lg"
				:aria-label="field.label"
				@update:model-value="(v) => picked(v ? from_stars(v, field) : null)"
			/>
		</template>

		<template v-else>
			<Select
				:model-value="condition"
				:options="options"
				:label="__('Condition')"
				@update:model-value="set_condition"
			/>

			<TimePicker
				v-if="kind === 'time'"
				:model-value="one || ''"
				:label="__('Time')"
				:placeholder="__('Pick a time')"
				@update:model-value="(v) => picked(v ? with_seconds(v) : null)"
			/>

			<div
				v-else-if="condition === RANGE"
				:class="kind === 'duration' ? 'space-y-3' : 'grid grid-cols-2 gap-3'"
			>
				<template v-if="kind === 'duration'">
					<DurationInput
						:model-value="from"
						:field="field"
						:label="__('From')"
						@update:model-value="(v) => typed('from', v)"
						@focus="draft.focus"
						@blur="draft.blur"
					/>
					<DurationInput
						:model-value="to"
						:field="field"
						:label="__('To')"
						@update:model-value="(v) => typed('to', v)"
						@focus="draft.focus"
						@blur="draft.blur"
					/>
				</template>
				<template v-else>
					<TextInput
						:model-value="from"
						type="number"
						:min="limits.min"
						:max="limits.max"
						:label="__('From')"
						:placeholder="__('Any')"
						@update:model-value="(v) => typed('from', v)"
						@focus="draft.focus"
						@blur="draft.blur"
					/>
					<TextInput
						:model-value="to"
						type="number"
						:min="limits.min"
						:max="limits.max"
						:label="__('To')"
						:placeholder="__('Any')"
						@update:model-value="(v) => typed('to', v)"
						@focus="draft.focus"
						@blur="draft.blur"
					/>
				</template>
			</div>

			<DurationInput
				v-else-if="kind === 'duration'"
				:model-value="one"
				:field="field"
				:label="__('Value')"
				@update:model-value="(v) => typed('one', v)"
				@focus="draft.focus"
				@blur="draft.blur"
			/>
			<TextInput
				v-else
				:model-value="one"
				type="number"
				:min="limits.min"
				:max="limits.max"
				:label="__('Value')"
				@update:model-value="(v) => typed('one', v)"
				@focus="draft.focus"
				@blur="draft.blur"
			/>

			<Slider
				v-if="bounds"
				:model-value="slid"
				:min="bounds[0]"
				:max="bounds[1]"
				:step="step"
				:aria-label="field.label"
				@update:model-value="slide"
				@value-commit="save"
			/>
		</template>
	</div>
</template>
