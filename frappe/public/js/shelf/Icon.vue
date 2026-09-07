<template>
	<svg
		:width="size"
		:height="size"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		:stroke-width="strokeWidth"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="shelf-icon"
		v-html="path"
	></svg>
</template>

<script>
import { ICONS } from "./icons.js";

export default {
	name: "Icon",
	props: {
		name: { type: String, required: true },
		size: { type: [Number, String], default: 16 },
		strokeWidth: { type: [Number, String], default: 1.5 },
	},
	computed: {
		path() {
			return ICONS[this.name] || ICONS.circle;
		},
	},
};
</script>
