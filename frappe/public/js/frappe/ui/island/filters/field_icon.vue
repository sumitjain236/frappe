<script setup>
import { field_icon } from "./kinds.js";

// A field's icon: `icon` when given, else the field's own from its settings, both drawn by
// desk; else one for its kind
defineProps({
	field: { type: Object, default: null },
	icon: { type: String, default: "" },
});
</script>

<template>
	<!-- desk's own sprite SVG -->
	<!-- eslint-disable-next-line vue/no-v-html -->
	<span
		v-if="icon || field?.icon"
		class="flex shrink-0 [&>svg]:size-full"
		aria-hidden="true"
		v-html="icon || field.icon"
	/>
	<span v-else-if="field" class="shrink-0" :class="field_icon(field)" aria-hidden="true" />
</template>
