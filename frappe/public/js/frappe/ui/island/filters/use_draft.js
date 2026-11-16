import { onBeforeUnmount, ref, watch } from "vue";

// What a picker with text boxes shows: the rows from desk, except while the user is typing
// in it. A typed value saves after a pause, on blur, and before the picker goes away.
export function use_draft(rows, read, save, delay = 300) {
	const typing = ref(false);
	let timer = null;

	watch(rows, (r) => typing.value || read(r), { immediate: true });

	function flush() {
		if (!timer) return;
		clearTimeout(timer);
		timer = null;
		save();
	}
	onBeforeUnmount(flush);

	return {
		queue() {
			clearTimeout(timer);
			timer = setTimeout(flush, delay);
		},
		focus: () => (typing.value = true),
		blur() {
			typing.value = false;
			flush();
		},
	};
}
