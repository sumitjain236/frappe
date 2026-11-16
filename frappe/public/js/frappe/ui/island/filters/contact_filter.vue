<script setup>
import { computed, inject, ref } from "vue";
import { TabButtons, TextInput } from "frappe-ui";

import TogglePill from "./toggle_pill.vue";
import { contact_kind } from "./kinds.js";
import { use_draft } from "./use_draft.js";
import { contact_read, contact_rows } from "./wire.js";

// An email, phone or web address: whether a record has one, then how its value matches
const props = defineProps({
	field: { type: Object, required: true },
	rows: { type: Array, required: true },
});
const emit = defineEmits(["set"]);

const __ = window.__;
const kind = contact_kind(props.field);

const PRESENCE = {
	email: [__("An email like"), __("Any email"), __("No email")],
	phone: [__("A number like"), __("Any number"), __("No number")],
	url: [__("A site like"), __("Any site"), __("No site")],
}[kind];
const presences = ["match", "set", "not set"].map((value, i) => ({
	value,
	label: PRESENCE[i],
}));

const MODES = {
	email: [
		{ value: "domain", label: __("Domain") },
		{ value: "contains", label: __("Contains") },
		{ value: "is", label: __("Is exactly") },
	],
	phone: [
		{ value: "starts", label: __("Starts with") },
		{ value: "contains", label: __("Contains") },
	],
	url: [
		{ value: "domain", label: __("Domain") },
		{ value: "contains", label: __("Contains") },
	],
}[kind];

// what the box takes in each mode, shown beside it so the match reads as it works
const INPUTS = {
	email: {
		domain: {
			label: __("Domain"),
			prefix: "@",
			placeholder: "acme.com",
			hint: __("Any address at this domain"),
		},
		contains: { label: __("Text"), hint: __("Any part of the address") },
		is: { label: __("Email"), placeholder: "name@acme.com", hint: __("The whole address") },
	},
	phone: {
		starts: {
			label: __("Number starts with"),
			placeholder: "+91",
			hint: __("A country code, or the first digits of a number"),
		},
		contains: { label: __("Digits"), hint: __("Any part of the number") },
	},
	url: {
		domain: {
			label: __("Domain"),
			placeholder: "acme.com",
			hint: __("The site and any page on it; a pasted link is cut down to its domain"),
		},
		contains: { label: __("Text"), hint: __("Any part of the address") },
	},
}[kind];

const presence = ref("match");
const mode = ref(MODES[0].value);
const text = ref("");
const input = computed(() => INPUTS[mode.value]);

function save() {
	const { doctype, fieldname } = props.field;
	const next = contact_rows(doctype, fieldname, kind, {
		presence: presence.value,
		mode: mode.value,
		text: text.value,
	});
	if (JSON.stringify(next) !== JSON.stringify(props.rows)) emit("set", next);
}

const draft = use_draft(
	() => props.rows,
	(rows) => {
		const read = contact_read(kind, rows);
		if (!read) return;
		presence.value = read.presence;
		if (read.mode) mode.value = read.mode;
		text.value = read.text;
	},
	save
);

function set_presence(value) {
	presence.value = value;
	save();
}

function set_mode(value) {
	mode.value = value;
	if (text.value.trim()) save();
}

function set_text(value) {
	text.value = value;
	draft.queue();
}

// the system country's dialling code, from the cache desk's Phone field keeps
const load_codes = inject("phone_codes");
const codes = ref([]);
if (kind === "phone") load_codes().then((list) => (codes.value = list));

function pick_code(code) {
	mode.value = "starts";
	text.value = code;
	save();
}
</script>

<template>
	<div class="space-y-4">
		<div class="space-y-2">
			<p class="text-sm text-ink-gray-5">{{ __("Show records with") }}</p>
			<div class="flex flex-wrap gap-2" role="group" :aria-label="field.label">
				<TogglePill
					v-for="p in presences"
					:key="p.value"
					:label="p.label"
					:dot="false"
					:on="presence === p.value"
					@click="set_presence(p.value)"
				/>
			</div>
		</div>

		<div v-if="presence === 'match'" class="space-y-3">
			<TabButtons
				:model-value="mode"
				:aria-label="__('Match by')"
				:options="MODES"
				@update:model-value="set_mode"
			/>
			<TextInput
				:model-value="text"
				data-autofocus
				:type="kind === 'phone' ? 'tel' : 'text'"
				:label="input.label"
				:placeholder="input.placeholder || __('Type to filter')"
				@update:model-value="set_text"
				@focus="draft.focus"
				@blur="draft.blur"
			>
				<template v-if="input.prefix" #prefix>
					<span class="text-base text-ink-gray-5" aria-hidden="true">
						{{ input.prefix }}
					</span>
				</template>
			</TextInput>
			<p class="text-sm text-ink-gray-5">{{ input.hint }}</p>
			<div
				v-if="mode === 'starts' && codes.length"
				class="flex flex-wrap gap-2"
				role="group"
				:aria-label="__('Country codes')"
			>
				<TogglePill
					v-for="code in codes"
					:key="code.value"
					:label="code.label"
					:dot="false"
					:on="text.trim() === code.value"
					@click="pick_code(code.value)"
				/>
			</div>
		</div>
	</div>
</template>
