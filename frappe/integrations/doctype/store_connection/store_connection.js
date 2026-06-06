// Copyright (c) 2026, Frappe Technologies and contributors
// For license information, please see license.txt

frappe.ui.form.on("Store Connection", {
	refresh(frm) {
		if (!frm.doc.connections?.length) {
			return;
		}

		frm.add_custom_button(__("Verify Store Host"), () => verify_store_host(frm));
	},
});

function verify_store_host(frm) {
	const selected_rows = frm.fields_dict.connections.grid.get_selected_children();
	const row = selected_rows[0] || frm.doc.connections.find((connection) => connection.base_url);

	if (!row?.name) {
		frappe.msgprint(__("Select a connection row to verify."));
		return;
	}

	frappe.call({
		method: "verify_store_host",
		doc: frm.doc,
		args: { connection: row.name },
		freeze: true,
		freeze_message: __("Checking Store host..."),
		callback({ message }) {
			if (message?.ok === false) {
				frappe.show_alert({
					message: __("Store host responded but the catalog is not available"),
					indicator: "orange",
				});
				return;
			}

			frappe.show_alert({
				message: __("Store host verified successfully"),
				indicator: "green",
			});
		},
	});
}
