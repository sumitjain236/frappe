<template>
	<div class="store-page" :class="{ 'store-page--detail': detail_view }">
		<template v-if="!detail_view">
			<div class="store-header">
				<div>
					<h4 class="store-title">{{ __("Store") }}</h4>
					<p class="text-muted store-subtitle">
						{{ __("Browse and install shareable artifacts from connected Store hosts.") }}
					</p>
				</div>
				<div
					v-if="connections.length"
					class="form-group frappe-control store-connection-switcher"
					data-fieldtype="Select"
				>
					<select
						id="store-connection"
						name="store_connection"
						v-model="selected_connection_name"
						class="form-control input-xs ellipsis"
						:title="connection_title"
						@change="on_connection_change"
					>
						<option v-for="connection in connections" :key="connection.name" :value="connection.name">
							{{ connection.label }}
						</option>
					</select>
					<div class="select-icon xs" v-html="frappe.utils.icon('select', 'xs')"></div>
				</div>
			</div>

			<div v-if="connections.length" class="store-toolbar">
				<div class="page-form row">
					<div class="form-group frappe-control store-search-field">
						<input
							id="store-search"
							name="store_search"
							v-model="search_query"
							type="search"
							class="form-control input-xs"
							autocomplete="off"
							:placeholder="__('Search')"
							@input="debounced_load_items"
						/>
					</div>
					<div class="form-group frappe-control store-filter-field" data-fieldtype="Select">
						<select
							id="store-app-filter"
							name="store_app"
							v-model="selected_app"
							class="form-control input-xs ellipsis"
							@change="load_items"
						>
							<option value="">{{ __("All Apps") }}</option>
							<option v-for="app in filter_options.apps" :key="app" :value="app">
								{{ app }}
							</option>
						</select>
						<div class="select-icon xs" v-html="frappe.utils.icon('select', 'xs')"></div>
					</div>
					<div class="form-group frappe-control store-filter-field" data-fieldtype="Select">
						<select
							id="store-category-filter"
							name="store_category"
							v-model="selected_category"
							class="form-control input-xs ellipsis"
							@change="load_items"
						>
							<option value="">{{ __("Category") }}</option>
							<option v-for="category in filter_options.categories" :key="category" :value="category">
								{{ category }}
							</option>
						</select>
						<div class="select-icon xs" v-html="frappe.utils.icon('select', 'xs')"></div>
					</div>
				</div>
			</div>

			<div v-if="loading" class="store-state">{{ __("Loading catalog...") }}</div>
			<div v-else-if="error_message" class="store-state store-state-error">{{ error_message }}</div>
			<div v-else-if="!connections.length" class="store-state">
				<p class="text-muted">{{ __("No Store Connections configured yet.") }}</p>
				<button class="btn btn-primary btn-sm" type="button" @click="open_connections">
					{{ __("Add Store Connection") }}
				</button>
			</div>
			<div v-else-if="!items.length" class="store-state">
				<p class="text-muted">{{ __("No items match your filters.") }}</p>
			</div>
			<section v-else class="store-catalog">
				<div class="store-catalog-head">
					<span class="store-catalog-count">{{ __("{0} items", [items.length]) }}</span>
				</div>
				<div class="store-grid">
					<article
						v-for="item in items"
						:key="item.name"
						class="store-card"
						@click="open_item(item)"
					>
						<div class="store-card-media">
							<img
								v-if="item_image(item)"
								class="store-card-media-image"
								:src="item_image(item)"
								:alt="item.title"
							/>
							<span
								v-else
								class="store-card-media-fallback"
								v-html="frappe.utils.icon('box', 'md')"
							></span>
						</div>
						<div class="store-card-body">
							<div class="store-card-head">
								<h5 class="store-card-title">{{ item.title }}</h5>
								<span v-if="item.version" class="store-card-version">v{{ item.version }}</span>
							</div>
							<div v-if="item.app || item.category || item.installed" class="store-card-tags">
								<span v-if="item.app" class="store-card-tag store-card-tag-app">
									{{ item.app }}
								</span>
								<span v-if="item.category" class="store-card-tag store-card-tag-category">
									{{ item.category }}
								</span>
								<span v-if="item.installed" class="store-card-tag store-card-tag-installed">
									<span v-html="frappe.utils.icon('check', 'xs')"></span>
									{{ __('Installed') }}
								</span>
							</div>
							<p v-if="item.description" class="store-card-description text-muted">
								{{ item.description }}
							</p>
						</div>
					</article>
				</div>
			</section>
		</template>

		<template v-else>
			<div v-if="detail_loading" class="store-state">{{ __("Loading item...") }}</div>
			<div v-else-if="detail_error" class="store-state store-state-error">{{ detail_error }}</div>
			<article v-else-if="detail_item" class="store-product">
				<button class="btn btn-default btn-sm store-back-btn" type="button" @click="close_detail">
					<span v-html="frappe.utils.icon('left', 'xs')"></span>
					{{ __("Back to Store") }}
				</button>

				<header class="store-surface store-hero-card">
					<div class="store-hero-card-body">
						<div class="store-hero-main">
							<div class="store-product-media">
								<img
									v-if="item_image(detail_item)"
									:src="item_image(detail_item)"
									:alt="detail_item.title"
								/>
								<span
									v-else
									class="store-product-media-fallback"
									v-html="frappe.utils.icon('box', 'lg')"
								></span>
							</div>
							<div class="store-product-intro">
								<h2 class="store-product-title">{{ detail_item.title }}</h2>
								<p v-if="detail_item.description" class="store-product-tagline text-muted">
									{{ detail_item.description }}
								</p>
								<div v-if="detail_item.app || detail_item.category" class="store-hero-badges">
									<span v-if="detail_item.app" class="store-badge store-badge--app">
										{{ detail_item.app }}
									</span>
									<span v-if="detail_item.category" class="store-badge store-badge--category">
										{{ detail_item.category }}
									</span>
								</div>
								<div v-if="item_tags(detail_item).length" class="store-hero-tags">
									<span
										v-for="tag in item_tags(detail_item)"
										:key="tag"
										class="store-badge store-badge--tag"
									>
										{{ tag }}
									</span>
								</div>
							</div>
						</div>
						<div class="store-hero-action">
							<button
								class="btn btn-primary store-install-btn"
								type="button"
								disabled
								:title="__('Coming soon')"
							>
								<span v-html="frappe.utils.icon('download', 'xs')"></span>
								{{ __("Install") }}
							</button>
							<div v-if="detail_item.installed" class="store-install-status text-success">
								<span v-html="frappe.utils.icon('check', 'xs')"></span>
								{{ __('Installed') }}
							</div>
						</div>
					</div>
				</header>

				<div class="store-product-layout">
					<div class="store-product-main">
						<div class="store-tabs" role="tablist">
							<button
								v-for="tab in detail_tabs"
								:key="tab.id"
								class="store-tab"
								:class="{ 'store-tab--active': detail_tab === tab.id }"
								type="button"
								role="tab"
								:aria-selected="detail_tab === tab.id"
								@click="detail_tab = tab.id"
							>
								{{ tab.label }}
							</button>
						</div>

						<section class="store-surface store-tab-panel">
							<template v-if="detail_tab === 'overview'">
								<div v-if="preview_images.length" class="store-preview-gallery">
									<button
										v-if="preview_images.length > 1"
										class="btn btn-default btn-sm store-gallery-nav store-gallery-nav--prev"
										type="button"
										@click="shift_preview(-1)"
									>
										<span v-html="frappe.utils.icon('left', 'xs')"></span>
									</button>
									<div class="store-preview-frame">
										<img
											:src="preview_images[preview_index].src"
											:alt="preview_images[preview_index].alt || detail_item.title"
										/>
									</div>
									<button
										v-if="preview_images.length > 1"
										class="btn btn-default btn-sm store-gallery-nav store-gallery-nav--next"
										type="button"
										@click="shift_preview(1)"
									>
										<span v-html="frappe.utils.icon('right', 'xs')"></span>
									</button>
									<div v-if="preview_images.length > 1" class="store-gallery-dots">
										<button
											v-for="(image, index) in preview_images"
											:key="image.src"
											class="store-gallery-dot"
											:class="{ 'store-gallery-dot--active': preview_index === index }"
											type="button"
											:aria-label="__('Preview image {0}', [index + 1])"
											@click="preview_index = index"
										></button>
									</div>
								</div>
								<div
									v-if="detail_content.html"
									class="store-prose"
									:class="{ 'store-prose--quill': detail_content.mode === 'quill' }"
									v-html="detail_content.html"
								></div>
								<p v-else class="store-product-fallback-text text-muted">
									{{ __("No extended description available.") }}
								</p>
							</template>

							<template v-else-if="detail_tab === 'dependencies'">
								<ul v-if="detail_item.dependencies?.length" class="store-dep-panel-list">
									<li v-for="dependency in detail_item.dependencies" :key="dependency.app_name">
										<span class="store-dep-panel-name">{{ dependency.app_name }}</span>
										<span v-if="dependency.min_version" class="text-muted">
											≥ {{ dependency.min_version }}
										</span>
									</li>
								</ul>
								<p v-else class="store-product-fallback-text text-muted">
									{{ __("No dependencies required.") }}
								</p>
							</template>
						</section>
					</div>

					<aside class="store-product-sidebar">
						<section class="store-surface store-side-card">
							<h5 class="store-side-card-title">{{ __("Details") }}</h5>
							<dl class="store-meta-list">
								<div v-if="detail_item.category" class="store-meta-row">
									<dt>{{ __("Type") }}</dt>
									<dd>{{ detail_item.category }}</dd>
								</div>
								<div v-if="detail_item.app" class="store-meta-row">
									<dt>{{ __("App") }}</dt>
									<dd>{{ detail_item.app }}</dd>
								</div>
								<div v-if="selected_connection" class="store-meta-row">
									<dt>{{ __("Publisher") }}</dt>
									<dd>{{ selected_connection.label }}</dd>
								</div>
								<div v-if="detail_item.version" class="store-meta-row">
									<dt>{{ __("Version") }}</dt>
									<dd>v{{ detail_item.version }}</dd>
								</div>
								<div v-if="detail_item.published_on" class="store-meta-row">
									<dt>{{ __("Published") }}</dt>
									<dd :title="format_published_on(detail_item.published_on)">
										{{ format_published_relative(detail_item.published_on) }}
									</dd>
								</div>
							</dl>
						</section>

						<section
							v-if="detail_item.dependencies?.length"
							class="store-surface store-side-card"
						>
							<h5 class="store-side-card-title">{{ __("Dependencies") }}</h5>
							<ul class="store-side-list">
								<li v-for="dependency in detail_item.dependencies" :key="dependency.app_name">
									<span v-html="frappe.utils.icon('file', 'xs')"></span>
									<span>
										{{ dependency.app_name }}
										<span v-if="dependency.min_version" class="text-muted">
											≥ {{ dependency.min_version }}
										</span>
									</span>
								</li>
							</ul>
						</section>

						<section v-if="has_resource_links" class="store-surface store-side-card">
							<h5 class="store-side-card-title">{{ __("Links") }}</h5>
							<div class="store-side-links">
								<a
									v-if="detail_item.website"
									class="store-side-link"
									:href="detail_item.website"
									target="_blank"
									rel="noopener"
								>
									<span v-html="frappe.utils.icon('link-url', 'xs')"></span>
									{{ __("Website") }}
								</a>
								<a
									v-if="detail_item.documentation"
									class="store-side-link"
									:href="detail_item.documentation"
									target="_blank"
									rel="noopener"
								>
									<span v-html="frappe.utils.icon('file', 'xs')"></span>
									{{ __("Documentation") }}
								</a>
								<a
									v-if="detail_item.support"
									class="store-side-link"
									:href="detail_item.support"
									target="_blank"
									rel="noopener"
								>
									<span v-html="frappe.utils.icon('support', 'xs')"></span>
									{{ __("Support") }}
								</a>
							</div>
						</section>
					</aside>
				</div>
			</article>
		</template>
	</div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

const __ = window.__;
const frappe = window.frappe;

const connections = ref([]);
const selected_connection_name = ref("");
const filter_options = ref({ apps: [], categories: [], tags: [] });
const items = ref([]);
const loading = ref(false);
const error_message = ref("");
const search_query = ref("");
const selected_app = ref("");
const selected_category = ref("");
const selected_tag = ref("");

const detail_view = ref(false);
const detail_item = ref(null);
const detail_loading = ref(false);
const detail_error = ref("");
const detail_tab = ref("overview");
const preview_index = ref(0);

let search_debounce_timer = null;

const selected_connection = computed(() =>
	connections.value.find((connection) => connection.name === selected_connection_name.value)
);

const connection_title = computed(() => {
	if (!selected_connection.value) {
		return "";
	}
	return `${selected_connection.value.base_url} · ${selected_connection.value.label}`;
});

const detail_content = computed(() =>
	prepare_item_content(detail_item.value?.long_description, selected_connection.value?.base_url)
);

const has_resource_links = computed(() =>
	Boolean(
		detail_item.value?.website || detail_item.value?.documentation || detail_item.value?.support
	)
);

const detail_tabs = computed(() => {
	const tabs = [{ id: "overview", label: __("Overview") }];
	if (detail_item.value?.dependencies?.length) {
		tabs.push({ id: "dependencies", label: __("Dependencies") });
	}
	return tabs;
});

const preview_images = computed(() =>
	extract_preview_images(detail_item.value, selected_connection.value?.base_url)
);

onMounted(() => {
	frappe.router.on("change", handle_route_change);
	load_connections();
});

onUnmounted(() => {
	frappe.router.off("change", handle_route_change);
});

function handle_route_change() {
	const route = frappe.get_route();
	if (route[0] !== "store") {
		return;
	}

	const route_connection = route[1];
	const route_item = route[2];
	const selected_route_value = selected_connection.value
		? get_connection_route_value(selected_connection.value)
		: "";

	if (route_connection && route_connection !== selected_route_value) {
		const match = find_connection_by_route(route_connection);
		if (match) {
			selected_connection_name.value = match.name;
			on_connection_change({ preserve_item: route_item });
		}
		return;
	}

	if (route_item) {
		detail_view.value = true;
		if (detail_item.value?.name === route_item || detail_loading.value) {
			return;
		}
		open_item({ name: route_item }, { update_route: false });
		return;
	}

	if (detail_view.value) {
		close_detail({ update_route: false });
	}
}

async function load_connections() {
	loading.value = true;
	error_message.value = "";
	try {
		const { message } = await frappe.call({
			method: "frappe.integrations.store.api.get_store_connections",
		});
		connections.value = message || [];
		if (connections.value.length) {
			const route = frappe.get_route();
			selected_connection_name.value = get_initial_connection(connections.value, route[1]);
			await load_filters();
			if (route[2]) {
				await open_item({ name: route[2] }, { update_route: false });
			} else {
				await load_items();
			}
		}
	} catch (error) {
		error_message.value = extract_error(error);
	} finally {
		loading.value = false;
	}
}

async function on_connection_change(options = {}) {
	search_query.value = "";
	selected_app.value = "";
	selected_category.value = "";
	selected_tag.value = "";
	if (!options.preserve_item) {
		close_detail({ update_route: false });
	}
	await load_filters();
	if (options.preserve_item) {
		await open_item({ name: options.preserve_item }, { update_route: false });
	} else {
		await load_items();
	}
}

async function load_filters() {
	if (!selected_connection_name.value) {
		filter_options.value = { apps: [], categories: [], tags: [] };
		return;
	}

	try {
		const { message } = await frappe.call({
			method: "frappe.integrations.store.api.get_catalog_filters",
			args: { store_connection: selected_connection_name.value },
		});
		filter_options.value = message || { apps: [], categories: [], tags: [] };
	} catch (error) {
		filter_options.value = { apps: [], categories: [], tags: [] };
		error_message.value = extract_error(error);
	}
}

async function load_items() {
	if (!selected_connection_name.value) {
		items.value = [];
		return;
	}

	loading.value = true;
	error_message.value = "";
	close_detail({ update_route: false });

	try {
		const { message } = await frappe.call({
			method: "frappe.integrations.store.api.get_catalog_list",
			args: {
				store_connection: selected_connection_name.value,
				search: search_query.value,
				app: selected_app.value,
				category: selected_category.value,
				tag: selected_tag.value,
			},
		});
		items.value = message || [];
		frappe.set_route("store", get_connection_route_value(selected_connection.value));
	} catch (error) {
		items.value = [];
		error_message.value = extract_error(error);
	} finally {
		loading.value = false;
	}
}

function debounced_load_items() {
	clearTimeout(search_debounce_timer);
	search_debounce_timer = setTimeout(load_items, 300);
}

async function open_item(item, options = {}) {
	detail_view.value = true;
	detail_item.value = null;
	detail_loading.value = true;
	detail_error.value = "";
	detail_tab.value = "overview";
	preview_index.value = 0;

	if (options.update_route !== false) {
		frappe.set_route("store", get_connection_route_value(selected_connection.value), item.name);
	}

	try {
		const { message } = await frappe.call({
			method: "frappe.integrations.store.api.get_catalog_item",
			args: {
				store_connection: selected_connection_name.value,
				item: item.name,
			},
		});
		detail_item.value = message;
	} catch (error) {
		detail_error.value = extract_error(error);
	} finally {
		detail_loading.value = false;
	}
}

function close_detail(options = {}) {
	detail_view.value = false;
	detail_item.value = null;
	detail_error.value = "";
	detail_tab.value = "overview";
	preview_index.value = 0;
	if (options.update_route !== false && selected_connection_name.value) {
		frappe.set_route("store", get_connection_route_value(selected_connection.value));
	}
}

function open_connections() {
	frappe.set_route("Form", "Store Connection");
}

/** Normalize catalog tags from host API rows or plain strings. */
function item_tags(item) {
	const tags = item?.tags;
	if (!Array.isArray(tags)) {
		return [];
	}

	return tags
		.map((tag) => {
			if (typeof tag === "string") {
				return tag.trim();
			}
			return String(tag?.tag || tag?.name || "").trim();
		})
		.filter(Boolean);
}

/** User-facing published date from catalog metadata. */
function format_published_on(value) {
	if (!value) {
		return "";
	}
	return frappe.datetime.str_to_user(value);
}

/** Relative published time for the action card (e.g. "4 days ago"). */
function format_published_relative(value) {
	if (!value) {
		return "";
	}
	return frappe.datetime.prettyDate(value, false) || format_published_on(value);
}

/** Collect catalog image and screenshots from long_description for the preview gallery. */
function extract_preview_images(item, base_url) {
	if (!item) {
		return [];
	}

	const images = [];
	const seen = new Set();

	function add_image(src, alt = "") {
		const resolved = resolve_store_asset_url(src, base_url);
		if (!resolved || seen.has(resolved)) {
			return;
		}
		seen.add(resolved);
		images.push({ src: resolved, alt });
	}

	add_image(item.image, item.title);

	const html = String(item.long_description || "");
	const pattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
	let match = pattern.exec(html);
	while (match) {
		add_image(match[1]);
		match = pattern.exec(html);
	}

	return images;
}

function shift_preview(step) {
	const total = preview_images.value.length;
	if (total < 2) {
		return;
	}
	preview_index.value = (preview_index.value + step + total) % total;
}

/** Resolve a single catalog asset URL against the connected Store host. */
function resolve_store_asset_url(url, base_url) {
	if (!url) {
		return null;
	}
	if (
		url.startsWith("http") ||
		url.startsWith("data:") ||
		url.startsWith("mailto:") ||
		url.startsWith("#")
	) {
		return url;
	}
	if (!base_url) {
		return url;
	}
	const host = base_url.replace(/\/$/, "");
	return url.startsWith("/") ? `${host}${url}` : `${host}/${url}`;
}

/** Resolve catalog item image URL against the connected Store host. */
function item_image(item) {
	if (!item?.image) {
		return null;
	}
	return resolve_store_asset_url(item.image, selected_connection.value?.base_url);
}

/** Prepare long_description for display; Quill HTML and publisher HTML use different wrappers. */
function prepare_item_content(content, base_url) {
	if (!content) {
		return { html: "", mode: "prose" };
	}

	let html = String(content).trim();
	const looks_like_html = /<[a-z][\s\S]*>/i.test(html);

	if (!looks_like_html) {
		html = frappe.markdown(html);
		html = rewrite_store_asset_urls(html, base_url);
		return { html: remove_empty_paragraphs(html), mode: "prose" };
	}

	html = frappe.dom.remove_script_and_style(html);
	html = rewrite_store_asset_urls(html, base_url);
	html = remove_empty_paragraphs(html);

	if (is_quill_html(html)) {
		html = patch_unordered_list(html);
		html = frappe.form.formatters.TextEditor(html) || html;
		return { html, mode: "quill" };
	}

	return { html, mode: "prose" };
}

function is_quill_html(html) {
	return /\bdata-list=["']|\bql-indent-|\bclass="[^"]*\bql-/.test(html);
}

/** Same list cleanup used by ControlTextEditor before saving/displaying Quill HTML. */
function patch_unordered_list(value) {
	const value_element = document.createElement("div");
	value_element.innerHTML = value;

	value_element.querySelectorAll("ol li[data-list=bullet]:first-child").forEach((li) => {
		const parent = li.parentNode;
		const children = Array.from(parent.children);
		const ul = document.createElement("ul");
		children.forEach((child) => ul.appendChild(child));
		parent.parentNode.replaceChild(ul, parent);
	});

	return value_element.innerHTML;
}

/** Drop blank Quill paragraphs that only add vertical gaps in read mode. */
function remove_empty_paragraphs(html) {
	const wrapper = document.createElement("div");
	wrapper.innerHTML = html;

	wrapper.querySelectorAll("p").forEach((paragraph) => {
		const text = (paragraph.textContent || "").replace(/\u00a0|\u200b/g, "").trim();
		if (!text && !paragraph.querySelector("img, table, video, iframe, hr, pre, blockquote")) {
			paragraph.remove();
		}
	});

	return wrapper.innerHTML;
}

function rewrite_store_asset_urls(html, base_url) {
	if (!base_url) {
		return html;
	}

	const host = base_url.replace(/\/$/, "");
	const wrapper = document.createElement("div");
	wrapper.innerHTML = html;

	wrapper.querySelectorAll("[src], [href]").forEach((element) => {
		const attribute = element.hasAttribute("src") ? "src" : "href";
		const value = element.getAttribute(attribute);
		if (
			!value ||
			value.startsWith("http") ||
			value.startsWith("data:") ||
			value.startsWith("mailto:") ||
			value.startsWith("#")
		) {
			return;
		}

		const resolved = value.startsWith("/") ? `${host}${value}` : `${host}/${value}`;
		element.setAttribute(attribute, resolved);
	});

	return wrapper.innerHTML;
}

function extract_error(error) {
	return error?.message || error?.exc || __("Something went wrong");
}

function get_initial_connection(connection_list, route_connection) {
	if (route_connection) {
		const match = find_connection_by_route(route_connection, connection_list);
		if (match) {
			return match.name;
		}
	}

	const default_connection = connection_list.find((row) => row.is_default);
	return (default_connection || connection_list[0]).name;
}

function get_connection_route_value(connection) {
	if (!connection) {
		return "";
	}

	return connection.route_label || frappe.router.slug(connection.label || connection.name);
}

function find_connection_by_route(route_connection, connection_list = connections.value) {
	if (!route_connection) {
		return null;
	}

	return (
		connection_list.find((row) => route_connection === get_connection_route_value(row)) ||
		connection_list.find((row) => route_connection === row.label) ||
		connection_list.find((row) => route_connection === row.name) ||
		null
	);
}

async function refresh_catalog() {
	if (detail_view.value && detail_item.value) {
		await open_item({ name: detail_item.value.name }, { update_route: false });
		return;
	}

	if (selected_connection_name.value) {
		await load_filters();
		await load_items();
	} else {
		await load_connections();
	}
}

defineExpose({
	load_connections,
	refresh_catalog,
});
</script>

<style lang="scss" scoped>
.store-page {
	padding: var(--padding-md);
	min-height: calc(100vh - var(--navbar-height) - 3rem);
}

.store-page--detail {
	max-width: 1180px;
	margin: 0 auto;
	padding: var(--padding-lg) var(--padding-md) var(--padding-2xl);
}

.store-surface {
	border: 1px solid var(--border-color);
	border-radius: calc(var(--border-radius-lg) + 2px);
	background: var(--card-bg);
	box-shadow: var(--card-shadow);
}

.store-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--margin-md);
	margin-bottom: 0;
	flex-wrap: wrap;
}

.store-title {
	margin: 0 0 0.2rem;
	font-weight: 600;
}

.store-subtitle {
	margin: 0;
	font-size: var(--text-sm);
}

.store-connection-switcher {
	position: relative;
	margin: 0;
	padding: 0;
	flex: 0 0 auto;

	select {
		width: 280px;
	}
}

.store-catalog-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 0.9rem;
}

.store-catalog-count {
	font-size: var(--text-sm);
	font-weight: 500;
	color: var(--text-muted);
}

.store-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
	gap: 0.85rem;
}

.store-card {
	@extend .store-surface;
	cursor: pointer;
	display: flex;
	flex-direction: row;
	align-items: stretch;
	gap: 0.85rem;
	padding: 0.9rem;
	min-height: 128px;
	transition:
		border-color 0.15s ease,
		box-shadow 0.15s ease,
		transform 0.15s ease;

	&:hover {
		border-color: var(--gray-400);
		box-shadow: var(--shadow-sm);
		transform: translateY(-1px);
	}
}

.store-card-media {
	flex: 0 0 76px;
	width: 76px;
	height: 76px;
	border-radius: var(--border-radius-lg);
	background: var(--control-bg);
	border: 1px solid var(--border-color);
	overflow: hidden;
	display: flex;
	align-items: center;
	justify-content: center;
}

.store-card-media-image {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.store-card-media-fallback {
	color: var(--text-muted);

	.icon {
		width: 30px;
		height: 30px;
	}
}

.store-card-body {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 0.3rem;
}

.store-card-head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 0.5rem;
}

.store-card-title {
	margin: 0;
	font-size: var(--text-md);
	font-weight: 600;
	color: var(--heading-color);
	line-height: 1.35;
}

.store-card-version {
	flex: 0 0 auto;
	font-size: var(--text-xs);
	font-weight: 500;
	color: var(--text-muted);
	white-space: nowrap;
	padding-top: 0.15rem;
}

.store-card-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 0.35rem;
}

.store-card-tag {
	font-size: var(--text-xs);
	font-weight: 500;
	line-height: 1.4;
	padding: 0.12rem 0.5rem;
	border-radius: var(--border-radius-full);
}

.store-card-tag-app {
	background: var(--blue-100, #dbeafe);
	color: var(--blue-700, #1d4ed8);
}

.store-card-tag-category {
	background: var(--purple-100, #f3e8ff);
	color: var(--purple-700, #7e22ce);
}

.store-card-tag-installed {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	background: var(--green-100, #dcfce7);
	color: var(--green-700, #15803d);
}

.store-card-description {
	margin: 0;
	font-size: var(--text-sm);
	line-height: 1.45;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.store-product {
	display: flex;
	flex-direction: column;
	gap: 0.65rem;
}

.store-back-btn {
	display: inline-flex;
	align-items: center;
	align-self: flex-start;
	gap: 0.3rem;
	margin: 0;
}

.store-hero-card {
	padding: 1.2rem 1.35rem;
}

.store-hero-card-body {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1.25rem;
}

.store-hero-main {
	display: flex;
	gap: 1.1rem;
	min-width: 0;
	flex: 1;
}

.store-hero-action {
	flex: 0 0 auto;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.4rem;
}

.store-hero-badges,
.store-hero-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
}

.store-hero-badges {
	margin-top: 0.65rem;
}

.store-hero-tags {
	margin-top: 0.45rem;
}

.store-badge {
	font-size: var(--text-xs);
	font-weight: 500;
	line-height: 1.35;
	padding: 0.2rem 0.6rem;
	border-radius: var(--border-radius-full);
}

.store-badge--app {
	background: var(--bg-blue);
	color: var(--text-on-blue);
}

.store-badge--category {
	background: var(--bg-purple);
	color: var(--text-on-purple);
}

.store-badge--tag {
	background: var(--bg-gray);
	color: var(--text-on-gray);
}

.store-product-media {
	flex: 0 0 80px;
	width: 80px;
	height: 80px;
	border-radius: calc(var(--border-radius-lg) + 2px);
	border: 1px solid var(--border-color);
	background: var(--subtle-fg);
	overflow: hidden;
	display: flex;
	align-items: center;
	justify-content: center;

	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
}

.store-product-media-fallback {
	color: var(--text-muted);

	.icon {
		width: 34px;
		height: 34px;
	}
}

.store-product-intro {
	min-width: 0;
	flex: 1;
}

.store-product-title {
	margin: 0 0 0.35rem;
	font-size: var(--text-2xl);
	font-weight: 600;
	line-height: 1.2;
	color: var(--heading-color);
}

.store-product-tagline {
	margin: 0;
	font-size: var(--text-sm);
	line-height: 1.55;
	max-width: 640px;
}

.store-install-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.45rem;
	min-width: 128px;
	white-space: nowrap;
}

.store-install-status {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	font-size: var(--text-sm);
	font-weight: 600;
}

.store-product-layout {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 300px;
	gap: 1.25rem;
	align-items: start;
	margin-top: 0.15rem;
}

.store-tabs {
	display: flex;
	align-items: center;
	gap: 0.15rem;
	margin-bottom: 0.5rem;
	border-bottom: 1px solid var(--border-color);
}

.store-tab {
	padding: 0.55rem 0.85rem;
	border: 0;
	border-bottom: 2px solid transparent;
	margin-bottom: -1px;
	background: none;
	font-size: var(--text-sm);
	font-weight: 500;
	color: var(--text-muted);
	cursor: pointer;
	transition:
		color 0.15s ease,
		border-color 0.15s ease;

	&:hover {
		color: var(--text-color);
	}

	&--active {
		color: var(--heading-color);
		border-bottom-color: var(--primary);
	}
}

.store-tab-panel {
	padding: 1.25rem 1.35rem 1.5rem;
	min-width: 0;
}

.store-preview-gallery {
	position: relative;
	margin-bottom: 1.25rem;
}

.store-preview-frame {
	border: 1px solid var(--border-color);
	border-radius: var(--border-radius-lg);
	background: var(--subtle-fg);
	overflow: hidden;

	img {
		display: block;
		width: 100%;
		height: auto;
		max-height: 420px;
		object-fit: contain;
	}
}

.store-gallery-nav {
	position: absolute;
	top: 50%;
	transform: translateY(-50%);
	z-index: 1;

	&--prev {
		left: 0.65rem;
	}

	&--next {
		right: 0.65rem;
	}
}

.store-gallery-dots {
	display: flex;
	justify-content: center;
	gap: 0.35rem;
	margin-top: 0.65rem;
}

.store-gallery-dot {
	width: 7px;
	height: 7px;
	padding: 0;
	border: 0;
	border-radius: var(--border-radius-full);
	background: var(--gray-300);
	cursor: pointer;

	&--active {
		background: var(--primary);
	}
}

.store-dep-panel-list {
	margin: 0;
	padding: 0;
	list-style: none;

	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.65rem 0;
		border-bottom: 1px solid var(--border-color);
		font-size: var(--text-sm);

		&:last-child {
			border-bottom: 0;
		}
	}
}

.store-dep-panel-name {
	font-weight: 500;
}

.store-product-sidebar {
	display: flex;
	flex-direction: column;
	gap: 0.85rem;
	position: sticky;
	top: calc(var(--navbar-height) + 1rem);
}

.store-side-card {
	padding: 0.95rem 1rem;
}

.store-side-card-title {
	margin: 0 0 0.75rem;
	font-size: var(--text-sm);
	font-weight: 600;
	color: var(--heading-color);
}

.store-meta-list {
	margin: 0;
}

.store-meta-row {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 0.75rem;
	padding: 0.4rem 0;
	font-size: var(--text-sm);
	border-bottom: 1px solid var(--border-color);

	&:last-child {
		border-bottom: 0;
	}

	dt {
		color: var(--text-muted);
		font-weight: 500;
	}

	dd {
		margin: 0;
		text-align: right;
		color: var(--text-color);
		font-weight: 500;
	}
}

.store-side-list {
	margin: 0;
	padding: 0;
	list-style: none;

	li {
		display: flex;
		align-items: flex-start;
		gap: 0.45rem;
		padding: 0.4rem 0;
		font-size: var(--text-sm);
		line-height: 1.45;
		border-bottom: 1px solid var(--border-color);

		&:last-child {
			border-bottom: 0;
		}

		.icon {
			flex: 0 0 auto;
			margin-top: 2px;
			color: var(--text-muted);
		}
	}
}

.store-side-links {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
}

.store-side-link {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	padding: 0.45rem 0.55rem;
	border-radius: var(--border-radius);
	font-size: var(--text-sm);
	color: var(--text-color);
	text-decoration: none;
	border: 1px solid var(--border-color);
	background: var(--control-bg);

	&:hover {
		border-color: var(--gray-400);
		text-decoration: none;
		color: var(--text-color);
	}
}

.store-product-fallback-text {
	margin: 0;
	font-size: var(--text-sm);
	line-height: 1.6;
}

.store-state {
	border: 1px dashed var(--border-color);
	border-radius: calc(var(--border-radius-lg) + 2px);
	padding: 3rem 1.75rem;
	text-align: center;
	background: var(--card-bg);
	color: var(--text-muted);
}

.store-state-error {
	border-color: var(--red-300);
	color: var(--red-600);
}

@media (max-width: 768px) {
	.store-header .store-connection-switcher {
		flex: 1 1 100%;

		select {
			width: 100%;
		}
	}

	.store-hero-card-body {
		flex-direction: column;
	}

	.store-hero-action {
		align-items: stretch;
		width: 100%;
	}

	.store-install-btn {
		width: 100%;
	}

	.store-product-layout {
		grid-template-columns: 1fr;
	}

	.store-product-sidebar {
		position: static;
	}

	.store-grid {
		grid-template-columns: 1fr;
	}
}
</style>

<style lang="scss">
/* Publisher HTML / markdown — not Quill; pattern follows website .from-markdown */
.store-page .store-prose:not(.store-prose--quill) {
	line-height: 1.6;
	color: var(--text-color);

	> :first-child {
		margin-top: 0;
	}

	> :last-child {
		margin-bottom: 0;
	}

	h1,
	h2,
	h3,
	h4 {
		margin: 1.25rem 0 0.5rem;
		font-weight: 600;
		color: var(--heading-color);
		line-height: 1.35;
	}

	h2,
	h3 {
		margin-top: 1.5rem;
	}

	h3 {
		font-size: var(--text-lg);
		padding-bottom: 0.45rem;
		border-bottom: 1px solid var(--border-color);
	}

	h4 {
		font-size: var(--text-md);
	}

	p {
		margin: 0.45rem 0;
	}

	p.lead {
		font-size: var(--text-lg);
		line-height: 1.55;
		color: var(--text-muted);
		margin-bottom: 1rem;
	}

	ul,
	ol {
		margin: 0.35rem 0 0.65rem;
		padding-left: 1.25rem;
	}

	ul {
		list-style: disc;
	}

	ol {
		list-style: decimal;
	}

	li {
		margin: 0.15rem 0;
	}

	table {
		width: 100%;
		margin: 0.5rem 0 0.85rem;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	th,
	td {
		border: 1px solid var(--border-color);
		padding: 0.4rem 0.6rem;
		text-align: left;
		vertical-align: top;
	}

	thead th {
		background: var(--control-bg);
		font-weight: 600;
	}

	img {
		display: block;
		width: 100%;
		max-width: 100%;
		height: auto;
		margin: 1rem 0 1.25rem;
		border-radius: calc(var(--border-radius-lg) + 2px);
		border: 1px solid var(--border-color);
		box-shadow: var(--shadow-sm);
	}

	figure {
		margin: 0.85rem 0;
	}

	figcaption {
		margin-top: 0.35rem;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	code {
		padding: 0.1rem 0.3rem;
		border-radius: var(--border-radius-sm);
		background: var(--control-bg);
		font-size: 0.92em;
	}

	.store-listing > :first-child {
		margin-top: 0;
	}
}

.store-tab-panel .store-prose:not(.store-prose--quill) {
	max-width: none;
}

.store-toolbar {
	margin: 0 calc(-1 * var(--padding-md)) 0;

	.page-form {
		flex-wrap: wrap;
		align-items: center;
	}

	.form-group {
		position: relative;
		margin-top: var(--margin-sm);
		margin-bottom: var(--margin-sm);
	}

	.store-search-field {
		flex: 0 1 360px;
		min-width: 280px;
		max-width: 420px;

		input {
			width: 100%;
		}
	}

	.store-filter-field {
		flex: 0 0 auto;

		select {
			width: 200px;
		}
	}
}

@media (max-width: 768px) {
	.store-toolbar .store-search-field {
		flex: 1 1 100%;
		max-width: none;
	}
}
</style>
