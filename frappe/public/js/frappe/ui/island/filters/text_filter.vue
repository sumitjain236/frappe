<script setup>
import { computed, ref } from "vue";
import { Select, TextInput } from "frappe-ui";

import { condition_options } from "./kinds.js";
import { use_draft } from "./use_draft.js";
import { single, single_row } from "./wire.js";

// Text a field contains, or is
const props = defineProps({
	field: { type: Object, required: true },
	rows: { type: Array, required: true },
	conditions: { type: Array, required: true },
});
const emit = defineEmits(["set"]);

const __ = window.__;
const options = computed(() => condition_options("text", props.conditions, __));

const condition = ref(props.conditions[0]);
const text = ref("");

function save() {
	const { doctype, fieldname } = props.field;
	const next = single_row(doctype, fieldname, condition.value, text.value.trim());
	if (JSON.stringify(next) !== JSON.stringify(props.rows)) emit("set", next);
}

const draft = use_draft(
	() => props.rows,
	(rows) => {
		const current = single(rows, props.conditions);
		if (current) condition.value = current.condition;
		text.value = current ? String(current.value) : "";
	},
	save
);

function set_condition(value) {
	condition.value = value;
	save();
}

function set_text(value) {
	text.value = value;
	draft.queue();
}
</script>

<template>
	<div class="space-y-4">
		<Select
			:model-value="condition"
			:options="options"
			:label="__('Condition')"
			@update:model-value="set_condition"
		/>
		<TextInput
			:model-value="text"
			data-autofocus
			:label="__('Text')"
			:placeholder="__('Type to filter')"
			@update:model-value="set_text"
			@focus="draft.focus"
			@blur="draft.blur"
		/>
	</div>
</template>
