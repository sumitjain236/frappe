<script setup>
import { computed, ref, useAttrs } from "vue";
import { Button, TextInput } from "frappe-ui";

// A search box with a button inside it that empties it. `bare`, at the top of a list, is a row
// with a line under it, as frappe-ui's Combobox searches its options.
defineProps({
	label: { type: String, required: true },
	bare: { type: Boolean, default: false },
});
const query = defineModel({ type: String, default: "" });

// keys and listeners belong to the input, so a key on the clear button isn't the box's too
defineOptions({ inheritAttrs: false });
const attrs = useAttrs();
const input_attrs = computed(() => {
	const { class: _, ...rest } = attrs;
	return rest;
});

const __ = window.__;
const input = ref(null);
const box = ref(null);
function clear() {
	query.value = "";
	(input.value ?? box.value)?.focus();
}
</script>

<template>
	<label
		v-if="bare"
		class="flex items-center gap-2 border-b border-outline-gray-1 px-4"
		:class="attrs.class"
	>
		<span class="lucide-search size-4 shrink-0 text-ink-gray-5" aria-hidden="true" />
		<input
			ref="input"
			v-model="query"
			v-bind="input_attrs"
			type="text"
			:placeholder="label"
			:aria-label="label"
			class="min-w-0 flex-1 border-0 bg-transparent px-0 py-2.5 text-base text-ink-gray-8 outline-none placeholder:text-ink-gray-4 focus:ring-0"
		/>
		<Button
			v-if="query"
			size="xs"
			variant="ghost"
			icon="lucide-x"
			:aria-label="__('Clear search')"
			@click="clear"
		/>
	</label>
	<TextInput
		v-else
		ref="box"
		v-model="query"
		v-bind="attrs"
		:placeholder="label"
		:aria-label="label"
	>
		<template #prefix>
			<span class="lucide-search size-4 text-ink-gray-5" aria-hidden="true" />
		</template>
		<template v-if="query" #suffix>
			<Button
				size="xs"
				variant="ghost"
				icon="lucide-x"
				:aria-label="__('Clear search')"
				@click="clear"
			/>
		</template>
	</TextInput>
</template>
