<script setup>
import { computed } from "vue";
import { TabButtons } from "frappe-ui";

// Is or Is not: whether picked values are kept or left out
const positive = defineModel({ type: Boolean, default: true });

const __ = window.__;
const mode = computed({
	get: () => (positive.value ? "is" : "is not"),
	set: (value) => (positive.value = value === "is"),
});
</script>

<template>
	<TabButtons
		v-model="mode"
		:aria-label="__('Match')"
		:options="[
			{ label: __('Is'), value: 'is' },
			{ label: __('Is not'), value: 'is not' },
		]"
	/>
</template>
