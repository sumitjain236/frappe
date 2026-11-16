<script setup>
import { computed, ref } from "vue";

import SearchInput from "./search_input.vue";
import FieldIcon from "./field_icon.vue";
import { field_key } from "./wire.js";

const props = defineProps({
	groups: { type: Array, required: true },
	active: { type: String, default: "" },
	// field key => { text, more }: each filtered field's line under its label
	summaries: { type: Map, required: true },
});
const emit = defineEmits(["select"]);

const __ = window.__;

const query = ref("");
const collapsed = ref({});

// by label, fieldname, group or kind ("date" finds Created On); the document's own fields come
// before its tables'. A group is known by its place, since two can share a label.
const shown = computed(() => {
	const q = query.value.trim().toLowerCase();
	const groups = props.groups.map((g, id) => ({ ...g, id }));
	if (!q) return groups;
	const hit = (text) =>
		String(text || "")
			.toLowerCase()
			.includes(q);
	const found = groups
		.map((g) => ({
			...g,
			fields: g.fields.filter(
				(f) => hit(f.label) || hit(f.fieldname) || hit(g.label) || hit(f.fieldtype)
			),
		}))
		.filter((g) => g.fields.length);
	return [...found.filter((g) => !g.table), ...found.filter((g) => g.table)];
});

const is_open = (group) => !collapsed.value[group.id] || !!query.value.trim();

// one Tab stop for the list, the field shown or the first one; arrows move through groups and fields
const keys = (group) => group.fields.map((f) => field_key(f.doctype, f.fieldname));
const tab_stop = computed(() => {
	const open = shown.value.filter(is_open).flatMap(keys);
	return open.includes(props.active) ? props.active : open[0];
});
function on_field_key(e) {
	const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
	if (!step) return;
	e.preventDefault();
	const list = [...e.currentTarget.querySelectorAll("[data-field], [data-group]")];
	list[list.indexOf(e.target) + step]?.focus();
}

const summary = (field) => props.summaries.get(field_key(field.doctype, field.fieldname));
const active_in = (group) => group.fields.filter(summary).length;

const list_el = ref(null);
const focus_list = () => list_el.value?.querySelector("[data-field], [data-group]")?.focus();

const pick = (field) => emit("select", field_key(field.doctype, field.fieldname));
const pick_first = () => shown.value[0] && pick(shown.value[0].fields[0]);
</script>

<template>
	<div class="flex h-full flex-col">
		<SearchInput
			v-model="query"
			bare
			class="shrink-0"
			:label="__('Search fields')"
			@keydown.enter.prevent="query.trim() && pick_first()"
			@keydown.down.prevent="focus_list"
		/>

		<div
			ref="list_el"
			class="min-h-0 flex-1 overflow-y-auto px-2 pb-8 pt-2"
			@keydown="on_field_key"
		>
			<div v-for="(group, i) in shown" :key="group.id" :class="i && 'mt-2'">
				<button
					type="button"
					class="flex h-7 w-full items-center gap-1.5 rounded-4 px-2 text-sm text-ink-gray-5 hover:text-ink-gray-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-outline-gray-3"
					data-group
					:tabindex="!tab_stop && !i ? 0 : -1"
					:aria-expanded="is_open(group)"
					@click="query.trim() || (collapsed[group.id] = !collapsed[group.id])"
				>
					<span
						class="lucide-chevron-down size-3.5 transition-transform motion-reduce:transition-none"
						:class="!is_open(group) && '-rotate-90 [&:dir(rtl)]:rotate-90'"
						aria-hidden="true"
					/>
					<span class="truncate">{{ group.label }}</span>
					<span
						v-if="group.table"
						class="lucide-table-2 size-3.5 shrink-0"
						aria-hidden="true"
					/>
					<span v-if="active_in(group)" class="ms-auto tabular-nums text-ink-gray-7">
						{{ active_in(group) }}
					</span>
				</button>

				<div v-if="is_open(group)" class="space-y-0.5">
					<button
						v-for="field in group.fields"
						:key="field_key(field.doctype, field.fieldname)"
						type="button"
						data-field
						:tabindex="tab_stop === field_key(field.doctype, field.fieldname) ? 0 : -1"
						class="flex w-full items-center gap-2.5 rounded-4 px-2 py-1.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-outline-gray-3"
						:class="
							active === field_key(field.doctype, field.fieldname)
								? 'bg-surface-gray-3'
								: 'hover:bg-surface-gray-2'
						"
						:aria-current="
							active === field_key(field.doctype, field.fieldname)
								? 'true'
								: undefined
						"
						@click="pick(field)"
					>
						<FieldIcon class="size-4 text-ink-gray-6" :field="field" />
						<span class="min-w-0 flex-1">
							<span
								class="block truncate text-base"
								:class="
									summary(field)
										? 'font-medium text-ink-gray-9'
										: 'text-ink-gray-8'
								"
							>
								{{ field.label }}
							</span>
							<span
								v-if="summary(field)"
								class="flex min-w-0 text-sm"
								:class="
									active === field_key(field.doctype, field.fieldname)
										? 'text-ink-gray-7'
										: 'text-ink-gray-6'
								"
							>
								<span class="truncate">{{ summary(field).text }}</span>
								<span v-if="summary(field).more" class="shrink-0 ps-1">
									+{{ summary(field).more }}
								</span>
							</span>
						</span>
					</button>
				</div>
			</div>

			<p v-if="!shown.length" class="px-2 py-8 text-center text-sm text-ink-gray-5">
				{{ __("No field matches {0}", [query.trim()]) }}
			</p>
		</div>
	</div>
</template>
