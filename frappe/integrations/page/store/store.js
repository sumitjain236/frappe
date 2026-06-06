// Copyright (c) 2026, Frappe Technologies and contributors
// For license information, please see license.txt

frappe.pages["store"].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Store"),
		single_column: true,
	});

	if (!frappe.store_page_nav_listener) {
		frappe.router.on("change", update_store_nav);
		frappe.store_page_nav_listener = true;
	}

	if (frappe.boot.developer_mode) {
		frappe.hot_update = frappe.hot_update || [];
		frappe.hot_update.push(() => load_store_page(wrapper));
	}
};

frappe.pages["store"].on_page_show = function (wrapper) {
	load_store_page(wrapper);
};

/** Keep navbar breadcrumbs and title on all store sub-routes (list + item detail). */
function update_store_nav() {
	const route = frappe.get_route();
	if (route[0] !== "store") {
		return;
	}

	const page = frappe.pages.store?.page;
	if (!page) {
		return;
	}

	page.set_title(__("Store"));

	const list_route = route[1] ? ["store", route[1]] : ["store"];
	frappe.breadcrumbs.add({
		type: "Custom",
		label: __("Store"),
		route: frappe.router.make_url(list_route),
	});
}

function load_store_page(wrapper) {
	const $parent = $(wrapper).find(".layout-main-section");
	$parent.find(".store-view").remove();

	frappe.require("store.bundle.js").then(() => {
		frappe.ui.store = new frappe.ui.Store({
			wrapper: $parent,
			page: wrapper.page,
		});
		update_store_nav();
	});
}
