<script setup>
import { nextTick, ref, watch } from "vue";
import { useEventListener, useResizeObserver } from "@vueuse/core";
import { Skeleton } from "frappe-ui";

// The end of a list that loads more as it scrolls: placeholder rows while a page loads, and the
// next page asked for when the end scrolls near, as the desk combobox does. The list that holds
// this is the one that scrolls.
const props = defineProps({
	loading: { type: Boolean, required: true },
	more: { type: Boolean, required: true },
	avatar: { type: Boolean, default: false },
});
const emit = defineEmits(["more"]);

const __ = window.__;
const NEAR_PX = 48;
// three placeholder rows of differing length, as names are
const WIDTHS = ["w-2/5", "w-1/2", "w-3/5"];

const end = ref(null);
const list = () => end.value?.parentElement;

function check() {
	// a list that isn't shown, such as on the other tab, has nothing near its end
	if (props.loading || !props.more || !list()?.getClientRects().length) return;
	const near =
		end.value.getBoundingClientRect().top <= list().getBoundingClientRect().bottom + NEAR_PX;
	if (near) emit("more");
}

useEventListener(list, "scroll", check, { passive: true });
useResizeObserver(list, check);
// a page that doesn't fill the list asks for the next one
watch(
	() => [props.loading, props.more],
	() => nextTick(check)
);
</script>

<template>
	<div v-if="loading" aria-hidden="true">
		<div v-for="width in WIDTHS" :key="width" class="flex h-12 items-center gap-2 px-1.5">
			<Skeleton class="size-3.5 shrink-0 rounded-2" />
			<Skeleton v-if="avatar" class="size-5 shrink-0 rounded-full" />
			<span class="flex flex-1 flex-col gap-1.5">
				<Skeleton class="h-2.5 rounded-2" :class="width" />
				<Skeleton class="h-2 w-3/5 rounded-2" />
			</span>
		</div>
	</div>
	<span class="sr-only" role="status">{{ loading ? __("Loading more") : "" }}</span>
	<div ref="end" class="h-px" />
</template>
