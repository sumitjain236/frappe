<script setup>
import { TransitionGroup, computed, inject, nextTick, ref, watch } from "vue";
import { Button, Checkbox, Radio, RadioGroup } from "frappe-ui";

import LoadMore from "./load_more.vue";
import NegateTabs from "./negate_tabs.vue";
import OptionLabel from "./option_label.vue";
import SearchInput from "./search_input.vue";
import TogglePill from "./toggle_pill.vue";
import { TREE, lists_names, option_list, picker_kind, shows_pills } from "./kinds.js";
import { use_link_search } from "./use_link_search.js";
import { like_rows, like_values, picked, status_rows, status_values, value_rows } from "./wire.js";

// Values to tick for a Select, Document Status or Link field, and the names in Assigned To,
// Liked By or Tags. A Select lists its options; the others open on the first page of their link
// search, as a Link field does on a form, and load the next as the list scrolls.
const props = defineProps({
	field: { type: Object, required: true },
	rows: { type: Array, required: true },
	conditions: { type: Array, required: true },
});
const emit = defineEmits(["set"]);

const __ = window.__;

// Assigned To, Liked By and Tags hold lists of names, so each picked name is a row of its own
const like = lists_names(props.field);
const tags = picker_kind(props.field) === "tag_like";
// a tree's record takes its descendants, as the list's own box does, so it is picked alone:
// a list of records or "not" would leave the descendants out
const tree = props.conditions.includes(TREE);
const one = tree ? TREE : "=";
const status = props.field.fieldname === "docstatus";
const statuses = status ? option_list(props.field, __).map((o) => String(o.value)) : [];
const decode = like ? like_values : status ? (rows) => status_values(rows, statuses) : picked;
const encode = like
	? like_rows
	: status
	? (doctype, fieldname, positive, values) => status_rows(doctype, fieldname, values, statuses)
	: (...args) => value_rows(...args, one);

const current = computed(() => decode(props.rows) || { positive: true, values: [] });
// kept here as well, so a second tick before desk shows the first adds to it
const selected = ref([]);
const positive = ref(true);
// a pick desk hasn't shown yet; given up after a while in case desk changed it
const PENDING_MS = 2000;
let pending = null;
watch(
	current,
	(c) => {
		const values = c.values.map(String);
		const same = JSON.stringify(values) === JSON.stringify(pending?.values);
		if (pending && !same && Date.now() - pending.at < PENDING_MS) return;
		pending = null;
		selected.value = values;
		if (values.length) positive.value = c.positive;
	},
	{ immediate: true }
);

// Document Status ticks any of its three, so it needs no Is / Is not
const can_negate = like || (!tree && !status && props.conditions.includes("!="));
const many = like || status || (!tree && props.conditions.includes("in"));
// the whole list is one group of radios when it picks one value
const radios = !many && !tags;

function save(values) {
	selected.value = values;
	pending = { values, at: Date.now() };
	emit("set", encode(props.field.doctype, props.field.fieldname, positive.value, values));
}

function set_positive(value) {
	positive.value = value;
	if (selected.value.length) save(selected.value);
}

function toggle(value) {
	const on = selected.value.includes(value);
	const focused = list_has_focus();
	if (!many) save(on ? [] : [value]);
	else save(on ? selected.value.filter((v) => v !== value) : [...selected.value, value]);
	if (focused) refocus(value);
}

function clear() {
	const focused = list_has_focus();
	save([]);
	if (focused) refocus(null);
}

// a pick moves its row between Selected and All: keyboard focus goes with it, or to the search
// box when the row is no longer shown
const list_el = ref(null);
const tools_el = ref(null);
const list_has_focus = () => !!list_el.value?.contains(list_el.value.getRootNode().activeElement);
const control_of = (row) => row.querySelector("input, [role='radio'], button") ?? row;
const rows_shown = () =>
	[...(list_el.value?.querySelectorAll("[data-value]") || [])].filter(
		(row) => !row.classList.contains("v-leave-active")
	);
function focus_first() {
	const row = rows_shown()[0];
	row && control_of(row).focus({ preventScroll: true });
}
// ↑ and ↓ move between rows, and ↑ from the first goes back to the search; a radio group moves
// on its own
function on_list_key(e) {
	const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
	if (!step || radios) return;
	const rows = rows_shown();
	const at = rows.findIndex((row) => row.contains(e.target));
	if (at < 0) return;
	e.preventDefault();
	const next = rows[at + step];
	if (next) control_of(next).focus();
	else if (step < 0) tools_el.value?.querySelector("input")?.focus();
}
function pick_first() {
	const first = options.value[0];
	if (!query.value.trim() || !first || (search && !search.answered.value)) return;
	if (radios) save([String(first.value)]);
	else if (!selected.value.includes(String(first.value))) toggle(String(first.value));
}
async function refocus(value) {
	await nextTick();
	const row = rows_shown().find((el) => el.dataset.value === String(value));
	const target = row ? control_of(row) : tools_el.value?.querySelector("input");
	target?.focus({ preventScroll: true });
}

const searched = like || props.field.fieldtype === "Link";
const search = searched
	? use_link_search(() =>
			like
				? { doctype: tags ? "Tag" : "User" }
				: {
						doctype: props.field.options,
						reference_doctype: props.field.doctype,
						link_fieldname: props.field.fieldname,
				  }
	  )
	: null;
const query = search ? search.query : ref("");
const tag_theme = inject("tag_theme");
const records = tags ? "Tag" : like ? "User" : props.field.options;

if (search) {
	watch(
		[selected, search.loading],
		() => search.loading.value || search.load_titles(selected.value),
		{ immediate: true }
	);
}

const all_options = computed(() => option_list(props.field, __));
const all_values = computed(() => all_options.value.map((o) => o.value));
const short = computed(() => !search && shows_pills(props.field, __));
// with two options, not one is the other, unless a "not" comes from Advanced or a link
const negates = computed(
	() => can_negate && (!short.value || all_values.value.length > 2 || !positive.value)
);

// a radio list keeps its rows in place: arrow keys pick as they move, so a row must not jump
const show_selected = computed(
	() => !short.value && !radios && selected.value.length > 0 && !query.value.trim()
);

const options = computed(() => {
	const q = query.value.trim().toLowerCase();
	const listed = search
		? search.options.value
		: all_options.value.filter((o) => !q || o.label.toLowerCase().includes(q));
	return show_selected.value
		? listed.filter((o) => !selected.value.includes(String(o.value)))
		: listed;
});

const option_of = (value) =>
	search
		? search.option_of(value)
		: all_options.value.find((o) => String(o.value) === value) ?? { value, label: value };

// a radio list keeps its rows in place, so a pick no loaded page shows sits on its own at the top
const unlisted_pick = computed(() =>
	radios &&
	selected.value.length &&
	!query.value.trim() &&
	!options.value.some((o) => String(o.value) === selected.value[0])
		? [{ key: "pick", title: "", options: [option_of(selected.value[0])] }]
		: []
);

const sections = computed(() => [
	...unlisted_pick.value,
	...(show_selected.value
		? [
				{
					key: "selected",
					title: positive.value
						? __("Selected · {0}", [selected.value.length])
						: __("Excluded · {0}", [selected.value.length]),
					options: selected.value.map(option_of),
				},
		  ]
		: []),
	{ key: "all", title: show_selected.value ? __("All") : "", options: options.value },
]);

// one keyed list over both groups, so a ticked row glides between them instead of jumping
const entries = computed(() =>
	sections.value.flatMap((section) => [
		...(section.title ? [{ key: `h:${section.key}`, header: section }] : []),
		...(section.key === "selected" && has_all.value ? [{ key: "h:all-of", hint: true }] : []),
		...section.options.map((option) => ({ key: `o:${option.value}`, option })),
	])
);

const empty = computed(
	() =>
		!!search &&
		!search.loading.value &&
		!options.value.length &&
		!selected.value.length &&
		!query.value.trim()
);

// list filters all have to match, so several names mean a record has each of them
const has_all = computed(() => like && positive.value && selected.value.length > 1);

// a pick fades in where it lands, and the rows around slide into place rather than jump
const SLIDE = {
	enterActiveClass: "transition duration-200 ease-out motion-reduce:transition-none",
	enterFromClass: "-translate-y-1 opacity-0",
	moveClass: "transition-transform duration-200 ease-out motion-reduce:transition-none",
	leaveActiveClass:
		"absolute inset-x-0 transition-opacity duration-150 ease-in motion-reduce:transition-none",
	leaveToClass: "opacity-0",
};

// a description line on one line, and a label that can shrink to the row
const ROW =
	"[&>div+div>p]:truncate [&>div:first-child]:flex [&>div:first-child]:w-full [&>div:first-child>label]:min-w-0 [&>div:first-child>label]:flex-1";
// with a picture the line under the name sits beside it, so the Checkbox's own copy is hidden;
// passing it still sizes the row for two lines and describes the box
const AVATAR_ROW = "[&>div+div]:hidden";
// a pick-one row, its line under the name on one line as in ROW
const RADIO_ROW =
	"w-full [&>span+span]:min-w-0 [&>span+span]:flex-1 [&_[data-slot=description]]:max-w-full [&_[data-slot=description]]:truncate";
const list_props = computed(() =>
	radios
		? {
				padded: true,
				"aria-label": props.field.label,
				modelValue: selected.value[0],
				"onUpdate:modelValue": (value) => save([value]),
		  }
		: {}
);
</script>

<template>
	<div class="flex min-h-0 flex-col">
		<div ref="tools_el" class="flex shrink-0 flex-wrap items-center gap-2">
			<NegateTabs
				v-if="negates"
				:model-value="positive"
				@update:model-value="set_positive"
			/>
			<!-- ↓ stops here: a radio group reads a held arrow key as a pick -->
			<SearchInput
				v-if="!short"
				v-model="query"
				data-autofocus
				@keydown.down.prevent.stop="focus_first"
				@keydown.enter.prevent="pick_first"
				class="min-w-40 flex-1"
				:label="__('Search {0}', [field.label])"
			/>
		</div>

		<div
			v-if="short"
			class="flex flex-wrap gap-2"
			:class="negates && 'mt-3'"
			role="group"
			:aria-label="field.label"
		>
			<TogglePill
				v-for="option in options"
				:key="option.value"
				:label="option.label"
				:theme="option.theme"
				:on="selected.includes(option.value)"
				@click="toggle(option.value)"
			/>
		</div>

		<div
			v-else
			ref="list_el"
			class="-mx-[var(--pane-x)] mt-2 min-h-0 flex-1 overflow-y-auto px-[calc(var(--pane-x)-theme(spacing[1.5]))] pb-2 pt-1"
			@keydown="on_list_key"
		>
			<component :is="radios ? RadioGroup : 'div'" v-bind="list_props">
				<TransitionGroup
					v-bind="SLIDE"
					tag="div"
					class="relative"
					:class="tags ? 'flex flex-wrap gap-2 px-1.5' : 'space-y-0.5'"
					:role="radios ? undefined : 'group'"
					:aria-label="radios ? undefined : field.label"
				>
					<div
						v-for="entry in entries"
						:key="entry.key"
						:data-value="entry.option?.value"
						:class="tags && !entry.option && 'w-full'"
					>
						<div
							v-if="entry.header"
							class="flex h-7 items-center justify-between gap-2 ps-1.5"
							:class="entry.header.key === 'all' && 'mt-2'"
						>
							<p class="truncate text-sm text-ink-gray-5">
								{{ entry.header.title }}
							</p>
							<Button
								v-if="entry.header.key === 'selected'"
								size="sm"
								variant="ghost"
								:label="__('Clear')"
								@click="clear"
							/>
						</div>
						<p v-else-if="entry.hint" class="px-1.5 pb-1 text-sm text-ink-gray-5">
							{{ __("A record has to have all of them") }}
						</p>
						<TogglePill
							v-else-if="tags"
							:label="entry.option.label"
							:theme="tag_theme(entry.option.value)"
							picked-theme="gray"
							:on="selected.includes(entry.option.value)"
							@click="toggle(entry.option.value)"
						/>
						<Radio
							v-else-if="radios"
							:class="RADIO_ROW"
							:value="entry.option.value"
							:description="
								entry.option.avatar ? undefined : entry.option.description
							"
						>
							<template #label>
								<OptionLabel :option="entry.option" />
							</template>
						</Radio>
						<Checkbox
							v-else
							padded
							:class="[ROW, entry.option.avatar && AVATAR_ROW]"
							:model-value="selected.includes(entry.option.value)"
							:label="entry.option.label"
							:description="entry.option.description"
							@update:model-value="toggle(entry.option.value)"
						>
							<template #label>
								<OptionLabel :option="entry.option" />
							</template>
						</Checkbox>
					</div>
				</TransitionGroup>
			</component>

			<LoadMore
				v-if="search"
				:loading="search.loading.value"
				:more="search.more.value"
				:avatar="!!options[0]?.avatar"
				@more="search.load_more"
			/>

			<div
				v-if="search?.failed.value"
				class="flex flex-col items-center gap-2 px-2 py-6 text-center"
			>
				<p class="text-sm text-ink-gray-5">
					{{ __("Could not load {0} records", [__(records)]) }}
				</p>
				<Button :label="__('Try again')" @click="search.retry" />
			</div>
			<div v-else-if="empty" class="flex flex-col items-center gap-2 px-2 py-12 text-center">
				<div class="rounded-full bg-surface-gray-2 p-3 text-ink-gray-5">
					<span class="lucide-inbox size-5" aria-hidden="true" />
				</div>
				<p class="text-base text-ink-gray-7">{{ __("Nothing to pick yet") }}</p>
				<p class="text-p-sm text-ink-gray-5">
					{{ __("There are no {0} records yet", [__(records)]) }}
				</p>
			</div>
			<p
				v-else-if="!options.length && !search?.loading.value && query.trim()"
				class="px-2 py-6 text-center text-sm text-ink-gray-5"
			>
				{{ __("Nothing matches {0}", [query.trim()]) }}
			</p>
		</div>
	</div>
</template>
