<script setup>
import { Avatar } from "frappe-ui";

// One option's label; with a picture, as the desk Link field shows it: the picture, then the
// name with its line under it
defineProps({ option: { type: Object, required: true } });
</script>

<template>
	<span v-if="option.avatar" class="flex min-w-0 items-center gap-2">
		<Avatar
			aria-hidden="true"
			size="md"
			shape="circle"
			:image="option.image"
			:label="option.label"
		/>
		<span class="flex min-w-0 flex-col">
			<span class="truncate">{{ option.label }}</span>
			<span v-if="option.description" class="truncate text-p-sm text-ink-gray-5">
				{{ option.description }}
			</span>
		</span>
	</span>
	<span v-else class="[overflow-wrap:anywhere]">{{ option.label }}</span>
</template>
