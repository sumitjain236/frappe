import { createApp } from "vue";
import StoreComponent from "./Store.vue";

class Store {
	constructor({ wrapper, page }) {
		this.$wrapper = $("<div class='store-view'></div>").appendTo(wrapper);
		this.page = page;

		this.page.clear_actions();
		this.page.add_inner_button(__("Refresh"), () => {
			this.$component?.refresh_catalog?.();
		});
		this.page.add_inner_button(__("Manage Connections"), () => {
			frappe.set_route("Form", "Store Connection");
		});

		const app = createApp(StoreComponent);
		SetVueGlobals(app);
		this.$component = app.mount(this.$wrapper.get(0));
	}
}

frappe.provide("frappe.ui");
frappe.ui.Store = Store;
export default Store;
