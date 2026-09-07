import { createApp } from "vue";
import ShelfApp from "./shelf/ShelfApp.vue";

frappe.provide("frappe.shelf");

// Mount the Shelf app into a Desk page container; returns the root component (exposes readRoute).
frappe.shelf.mount = function (el) {
	return createApp(ShelfApp).mount(el);
};
