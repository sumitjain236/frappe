<script setup>
import { Button } from "frappe-ui";

// A note that this field is filtered somewhere else, with the button that goes there
defineProps({
	text: { type: String, required: true },
	action: { type: String, required: true },
});
const emit = defineEmits(["action"]);
</script>

<template>
	<div class="space-y-3 rounded-5 border border-outline-gray-2 p-4">
		<slot />
		<p class="text-p-sm text-ink-gray-6">{{ text }}</p>
		<Button
			class="[&:dir(rtl)_.lucide-arrow-right]:-scale-x-100"
			:label="action"
			icon-right="lucide-arrow-right"
			@click="emit('action')"
		/>
	</div>
</template>
