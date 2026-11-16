<script setup>
import { computed } from "vue";

import { PILL_OFF, PILL_ON } from "./pills.js";

// One option to tap on and off, sized as frappe-ui's small outline button with its list colour
// as a dot; when on, it takes that colour and a tick
const props = defineProps({
	label: { type: String, required: true },
	theme: { type: String, default: "gray" },
	on: { type: Boolean, default: false },
	// the colour it takes when on, where its own colour means nothing, as a tag's
	pickedTheme: { type: String, default: "" },
	// an option with no colour of its own, such as a period, has no dot, and one of a kind takes
	// only the colour when on
	dot: { type: Boolean, default: true },
});

// Tailwind needs whole class names, so each colour spells its own
const THEMES = {
	gray: {
		dot: "bg-surface-gray-6",
		on: PILL_ON,
	},
	blue: {
		dot: "bg-surface-blue-7",
		on: "bg-surface-blue-2 border-outline-blue-3 text-ink-blue-7",
	},
	green: {
		dot: "bg-surface-green-7",
		on: "bg-surface-green-2 border-outline-green-3 text-ink-green-7",
	},
	amber: {
		dot: "bg-surface-amber-7",
		on: "bg-surface-amber-2 border-outline-amber-3 text-ink-amber-7",
	},
	orange: {
		dot: "bg-surface-orange-7",
		on: "bg-surface-orange-2 border-outline-orange-3 text-ink-orange-7",
	},
	red: { dot: "bg-surface-red-7", on: "bg-surface-red-2 border-outline-red-3 text-ink-red-7" },
	violet: {
		dot: "bg-surface-violet-7",
		on: "bg-surface-violet-2 border-outline-violet-3 text-ink-violet-7",
	},
};
const colour = computed(() => THEMES[props.theme] || THEMES.gray);
const picked = computed(() => THEMES[props.pickedTheme] || colour.value);
</script>

<template>
	<button
		type="button"
		:aria-pressed="on"
		class="inline-flex h-7 min-w-0 max-w-full shrink-0 items-center justify-center gap-1.5 rounded-4 border text-base transition-colors"
		:title="label"
		:class="[dot ? 'ps-1.5 pe-2' : 'px-2', on ? picked.on : PILL_OFF]"
	>
		<!-- the tick takes the dot's place, so the pill keeps its width -->
		<span
			v-if="dot"
			class="flex size-3.5 shrink-0 items-center justify-center"
			aria-hidden="true"
		>
			<span v-if="on" class="lucide-check size-3.5" />
			<span v-else class="size-2 rounded-full" :class="colour.dot" />
		</span>
		<span class="truncate">{{ label }}</span>
	</button>
</template>
