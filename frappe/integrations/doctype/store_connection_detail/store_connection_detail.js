// Copyright (c) 2026, Frappe Technologies and contributors
// For license information, please see license.txt

frappe.ui.form.on("Store Connection Detail", {
	verify_host(frm, cdt, cdn) {
		const row = frappe.get_doc(cdt, cdn);
		if (!row?.name) {
			frappe.msgprint(__("Please save this row before verifying the host."));
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
	},
});
