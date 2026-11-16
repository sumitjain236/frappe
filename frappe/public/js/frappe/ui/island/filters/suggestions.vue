<script setup>
import { nextTick, onMounted, ref, watch } from "vue";
import { onClickOutside, useResizeObserver } from "@vueuse/core";

import FieldIcon from "./field_icon.vue";
import { PILL_OFF, PILL_ON } from "./pills.js";
import { has_rows } from "./wire.js";

// The filters a list's settings suggest, as one line of pills. A pill sets its one field and
// keeps the rest; on again, it clears that field. Pills that don't fit go under a "+N" menu.
const props = defineProps({
	// [{ name, label, icon, row, field }]
	suggestions: { type: Array, required: true },
	filters: { type: Array, required: true },
});
const emit = defineEmits(["apply"]);

const __ = window.__;

const applied = (s) => has_rows(props.filters, [s.row]);

function toggle(s) {
	const on = applied(s);
	emit("apply", [[s.row[0], s.row[1], on ? [] : [s.row]]]);
}

// as many pills as fit on the line, measured from an unseen copy of all of them
const GAP_PX = 8;
const line = ref(null);
const sizes = ref(null);
const shown = ref(props.suggestions.length);
function fit() {
	if (!line.value || !sizes.value) return;
	const [label, more, ...pills] = [...sizes.value.children].map((el) => el.offsetWidth);
	const style = getComputedStyle(line.value);
	const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
	const room = line.value.clientWidth - padding - label - GAP_PX;
	const width = (n) => pills.slice(0, n).reduce((sum, w) => sum + w + GAP_PX, 0);
	if (width(pills.length) <= room) return (shown.value = pills.length);
	let n = pills.length;
	while (n > 0 && width(n) + more > room) n--;
	shown.value = n;
}
onMounted(fit);
useResizeObserver(line, fit);
watch(
	() => props.suggestions,
	() => nextTick(fit)
);

const menu_open = ref(false);
const menu = ref(null);
const more_button = ref(null);
const items = ref([]);
onClickOutside(menu, () => (menu_open.value = false));
async function open_menu() {
	menu_open.value = !menu_open.value;
	if (!menu_open.value) return;
	await nextTick();
	items.value[0]?.focus();
}
function close_menu() {
	menu_open.value = false;
	more_button.value?.focus();
}
function pick(s) {
	toggle(s);
	close_menu();
}
// a menu's keys: arrows, Home and End move between its items; Tab leaves it
function on_menu_key(e) {
	const list = items.value;
	const at = list.indexOf(e.target);
	const to = {
		ArrowDown: (at + 1) % list.length,
		ArrowUp: (at - 1 + list.length) % list.length,
		Home: 0,
		End: list.length - 1,
	}[e.key];
	if (e.key === "Tab") menu_open.value = false;
	if (to === undefined) return;
	e.preventDefault();
	list[to]?.focus();
}

const PILL =
	"inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-3";
const pill_class = (on) => (on ? `${PILL_ON} font-medium` : PILL_OFF);
</script>

<template>
	<div
		ref="line"
		class="relative flex items-center gap-2 border-b border-outline-gray-1 px-4 py-2"
		role="group"
		:aria-label="__('Suggested')"
	>
		<span class="shrink-0 text-sm text-ink-gray-5">{{ __("Suggested") }}</span>
		<button
			v-for="s in suggestions.slice(0, shown)"
			:key="s.name"
			type="button"
			:class="[PILL, pill_class(applied(s))]"
			:aria-pressed="applied(s)"
			@click="toggle(s)"
		>
			<span v-if="applied(s)" class="lucide-check size-3.5" aria-hidden="true" />
			<FieldIcon v-else class="size-3.5 text-ink-gray-6" :field="s.field" :icon="s.icon" />
			{{ s.label }}
		</button>

		<div v-if="shown < suggestions.length" ref="menu" @keydown.esc.stop="close_menu">
			<button
				ref="more_button"
				type="button"
				:class="[PILL, pill_class(suggestions.slice(shown).some(applied))]"
				:aria-expanded="menu_open"
				aria-haspopup="menu"
				:aria-label="
					suggestions.length - shown === 1
						? __('1 more suggestion')
						: __('{0} more suggestions', [suggestions.length - shown])
				"
				@click="open_menu"
			>
				+{{ suggestions.length - shown }}
			</button>
			<div
				v-if="menu_open"
				class="absolute end-4 top-full z-10 mt-1 w-60 rounded-6 bg-surface-elevation-2 p-1.5 shadow-2xl ring-1 ring-black ring-opacity-5"
				role="menu"
				:aria-label="__('More suggestions')"
				@keydown="on_menu_key"
			>
				<button
					v-for="s in suggestions.slice(shown)"
					:key="s.name"
					ref="items"
					type="button"
					tabindex="-1"
					class="flex min-h-7 w-full items-center gap-2 rounded-4 px-2 text-start text-base text-ink-gray-8 hover:bg-surface-gray-3 focus:bg-surface-gray-3 focus:outline-none"
					role="menuitemcheckbox"
					:aria-checked="applied(s)"
					@click="pick(s)"
				>
					<span
						v-if="applied(s)"
						class="lucide-check size-4 shrink-0"
						aria-hidden="true"
					/>
					<FieldIcon
						v-else
						class="size-4 shrink-0 text-ink-gray-6"
						:field="s.field"
						:icon="s.icon"
					/>
					<span class="truncate">{{ s.label }}</span>
				</button>
			</div>
		</div>

		<!-- unseen, to measure what fits -->
		<div
			ref="sizes"
			class="invisible absolute left-0 top-0 flex gap-2 whitespace-nowrap"
			aria-hidden="true"
		>
			<span class="text-sm">{{ __("Suggested") }}</span>
			<span :class="PILL">+{{ suggestions.length }}</span>
			<span v-for="s in suggestions" :key="s.name" :class="[PILL, 'font-medium']">
				<span class="lucide-check size-3.5" />
				{{ s.label }}
			</span>
		</div>
	</div>
</template>
