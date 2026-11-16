import { computed, inject, ref, shallowReactive, watch } from "vue";
import { watchDebounced } from "@vueuse/core";
import { toLinkOption } from "@framework/ui/components/Link/linkOption";

const PAGE = 20;
// as the desk Link field: a Select list loads up to this many, and a longer one is searched
const SELECT_LIMIT = 1000;

// an address in a search field comes as HTML lines
const one_line = (text) => text?.replace(/(\s*<br\s*\/?>\s*)+/gi, ", ").replace(/^, |, $/g, "");

// A Link's records, loaded and shown as the desk Link field does it, by the DocType's link
// settings. Search fetches a page per query, first page with nothing typed, with the next as the
// list scrolls; Select loads the whole list once and narrows it as the user types. `args` says what
// to search and for which field, so the field's own Link filters apply.
export function use_link_search(args) {
	const search = inject("search");
	const link_settings = inject("link_settings");
	const link_row = inject("link_row");
	const settings = () => link_settings[args().doctype] || {};

	// a person reads by name, with the email under it
	const is_person = (row) =>
		args().doctype === "User" && row.description && row.description !== row.value;
	const to_option = (row) => ({
		...toLinkOption({ ...row, description: one_line(row.description) }),
		...(is_person(row) && { label: row.description, description: row.value }),
		image: row.image,
		avatar: !!settings().image_field,
	});

	const query = ref("");
	const found = ref([]);
	const more = ref(false);
	const loading = ref(false);
	const whole_list = ref(false);
	const failed = ref(false);
	// options seen, so a picked record keeps its title after it leaves the page
	const seen = shallowReactive(new Map());
	const asked = new Set();
	let latest = 0;
	const loaded_for = ref(null);

	const request_args = (more) => ({
		...args(),
		include_image: settings().image_field ? 1 : 0,
		...more,
	});

	async function load(start = 0) {
		const request = ++latest;
		loading.value = true;
		failed.value = false;
		const txt = whole_list.value ? "" : query.value.trim();
		try {
			const limit = whole_list.value ? SELECT_LIMIT : PAGE;
			const rows = await search(
				request_args({
					txt,
					start,
					page_length: limit + 1,
					keep_order: start > 0,
				})
			);
			// a slower reply for an older query
			if (request !== latest) return;
			if (whole_list.value && rows.length > limit) {
				whole_list.value = false;
				return load();
			}
			const page = rows.slice(0, limit).map(to_option);
			page.forEach((o) => seen.set(o.value, o));
			if (!start) loaded_for.value = whole_list.value ? null : txt;
			found.value = start ? [...found.value, ...page] : page;
			more.value = !whole_list.value && rows.length > limit;
		} catch {
			// the list says it couldn't load and offers to try again
			if (request !== latest) return;
			if (!start) found.value = [];
			more.value = false;
			failed.value = true;
		} finally {
			if (request === latest) loading.value = false;
		}
	}

	// picks that came from a link or from Advanced, which no page has shown yet
	async function load_titles(values) {
		for (const v of values) {
			const row = !seen.has(v) && link_row(args().doctype, v);
			if (row) seen.set(v, to_option(row));
		}
		const missing = values.filter((v) => !seen.has(v) && !asked.has(v));
		if (!missing.length) return;
		missing.forEach((v) => asked.add(v));
		const rows = await search(
			request_args({
				txt: "",
				// the user search leaves out website users unless asked, as the list above shows them
				filters: {
					name: ["in", missing],
					...(args().doctype === "User" && { ignore_user_type: 1 }),
				},
				page_length: missing.length,
			})
		);
		rows.map(to_option).forEach((o) => seen.set(o.value, o));
	}

	watch(
		args,
		() => {
			whole_list.value = settings().display_mode === "Select";
			load();
		},
		{ immediate: true, deep: true }
	);
	watchDebounced(query, () => whole_list.value || load(), { debounce: 200 });

	const options = computed(() => {
		const q = query.value.trim().toLowerCase();
		if (!whole_list.value || !q) return found.value;
		return found.value.filter((o) =>
			[o.label, o.value, o.description].some((t) => t?.toLowerCase().includes(q))
		);
	});

	return {
		query,
		options,
		more,
		loading,
		failed,
		answered: computed(
			() => !loading.value && (whole_list.value || loaded_for.value === query.value.trim())
		),
		load_more: () => loading.value || !more.value || load(found.value.length),
		retry: () => load(found.value.length),
		load_titles,
		option_of: (value) => seen.get(value) ?? to_option({ value }),
	};
}
