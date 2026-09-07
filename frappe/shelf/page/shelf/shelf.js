// Shelf: browse, install and update artifacts from connected git repositories.
// The page is a Vue app (frappe/public/js/shelf) mounted inside a normal Desk page,
// so the rail, navbar search and keyboard shortcuts all keep working.

frappe.pages["shelf"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Shelf"),
		single_column: true,
	});

	// The app draws its own header (Shelf mark, search, updates, domain tabs).
	page.wrapper.find(".page-head").hide();

	frappe.require("shelf.bundle.js").then(() => {
		const el = document.createElement("div");
		page.body.append(el);
		wrapper.shelf_app = frappe.shelf.mount(el);
	});
};

frappe.pages["shelf"].on_page_show = function (wrapper) {
	// Query params (?s=<source>&a=<artifact>) are the app's route; re-read on every show.
	wrapper.shelf_app && wrapper.shelf_app.readRoute();
};
