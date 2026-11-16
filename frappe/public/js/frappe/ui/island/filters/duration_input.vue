<script setup>
import { computed } from "vue";
import { FormLabel, TextInput } from "frappe-ui";

import { split_duration } from "./kinds.js";

// Seconds, entered as days, hours, minutes and seconds like desk's Duration control; the
// field's Hide Days and Hide Seconds leave those boxes out. frappe-ui's Duration is one text
// box and has neither setting.
const props = defineProps({
	modelValue: { type: [Number, String], default: null },
	field: { type: Object, required: true },
	label: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue", "focus", "blur"]);

const __ = window.__;

const UNITS = [
	{ key: "days", label: __("Days"), seconds: 86400, hidden: (f) => f.hide_days },
	{ key: "hours", label: __("Hours"), seconds: 3600 },
	{ key: "minutes", label: __("Minutes"), seconds: 60 },
	{ key: "seconds", label: __("Seconds"), seconds: 1, hidden: (f) => f.hide_seconds },
];
const units = computed(() => UNITS.filter((u) => !u.hidden?.(props.field)));
const parts = computed(() =>
	props.modelValue == null || props.modelValue === ""
		? {}
		: split_duration(props.modelValue, props.field)
);

function set_part(key, value) {
	const next = { ...parts.value, [key]: Number(value) || 0 };
	const total = units.value.reduce((sum, u) => sum + (next[u.key] || 0) * u.seconds, 0);
	const empty = units.value.every((u) => !next[u.key]);
	emit("update:modelValue", empty ? null : total);
}
</script>

<template>
	<div>
		<FormLabel v-if="label" class="mb-1.5" :label="label" />
		<div class="flex gap-2" role="group" :aria-label="label || undefined">
			<div v-for="unit in units" :key="unit.key" class="w-16 space-y-1 text-center">
				<TextInput
					type="number"
					min="0"
					:model-value="parts[unit.key] ?? ''"
					:aria-label="unit.label"
					@update:model-value="(v) => set_part(unit.key, v)"
					@focus="emit('focus')"
					@blur="emit('blur')"
				/>
				<p class="text-xs text-ink-gray-5">{{ unit.label }}</p>
			</div>
		</div>
	</div>
</template>
