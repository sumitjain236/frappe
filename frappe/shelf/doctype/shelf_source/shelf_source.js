// Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
// See license.txt

frappe.ui.form.on("Shelf Source", {
	refresh(frm) {
		frm.trigger("show_status");

		frm.add_custom_button(__("Check Connection"), () => frm.trigger("check_connection"));

		if (!frm.is_new() && frm.doc.connection_status === "Connected") {
			frm.add_custom_button(__("Sync Now"), () => frm.trigger("sync_now"));
			frm.add_custom_button(__("Open Repository"), () => window.open(frm.doc.repo_url, "_blank"));
		}
	},

	show_status(frm) {
		if (frm.is_new()) return;
		const colors = { Connected: "green", Error: "red", "Not Checked": "gray" };
		const label = frm.doc.connection_status || "Not Checked";
		const access = frm.doc.access && frm.doc.access !== "Unknown" ? ` · ${__(frm.doc.access)}` : "";
		frm.page.set_indicator(`${__(label)}${access}`, colors[label] || "gray");
	},

	check_connection(frm) {
		// Unsaved forms are checked with the values on screen; saved forms use the stored token.
		frappe.call({
			method: "frappe.shelf.api.check_repo",
			args: {
				repo_url: frm.doc.repo_url,
				branch: frm.doc.branch,
				token: frm.doc.token,
				source: frm.is_new() ? null : frm.doc.name,
			},
			freeze: true,
			freeze_message: __("Checking repository…"),
			callback(r) {
				const result = r.message || {};
				frm.set_value("connection_status", result.ok ? "Connected" : "Error");
				frm.set_value("access", result.access || "Unknown");
				frm.set_value("connection_message", result.message || "");
				if (result.shelf) {
					frm.set_value("shelf_id", result.shelf.id);
					frm.set_value("shelf_name", result.shelf.name);
					frm.set_value("shelf_domain", result.shelf.domain);
					frm.set_value("publisher_name", (result.shelf.publisher || {}).name || "");
					if (!frm.doc.title) frm.set_value("title", result.shelf.name);
				}
				if (result.default_branch && result.code === "branch_not_found") {
					frm.set_value("branch", result.default_branch);
				}
				frappe.msgprint({
					title: result.ok ? __("Connected") : __("Not connected"),
					indicator: result.ok ? "green" : "red",
					message: frappe.utils.escape_html(result.message || ""),
				});
			},
		});
	},

	sync_now(frm) {
		frappe.call({
			method: "frappe.shelf.api.sync_source",
			args: { name: frm.doc.name },
			freeze: true,
			freeze_message: __("Syncing catalog…"),
			callback(r) {
				const result = r.message || {};
				frappe.show_alert({
					message: result.changed
						? __("Synced {0} artifacts", [result.artifact_count])
						: __("Already up to date ({0} artifacts)", [result.artifact_count]),
					indicator: "green",
				});
				frm.reload_doc();
			},
		});
	},
});
