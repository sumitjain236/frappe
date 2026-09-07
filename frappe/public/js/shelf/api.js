// API client for the Shelf page: thin wrappers over frappe.call so CSRF, sessions and
// server error dialogs behave like every other Desk page.

export class ApiError extends Error {}

function request(method, args, type) {
	return new Promise((resolve, reject) => {
		frappe.call({
			method,
			args,
			type,
			callback: (r) => resolve(r.message),
			error: (r) => reject(new ApiError(extractMessage(r) || __("Request failed"))),
		});
	});
}

function extractMessage(r) {
	if (!r) return "";
	if (r._server_messages) {
		try {
			return JSON.parse(r._server_messages)
				.map((m) => {
					try {
						return JSON.parse(m).message;
					} catch (e) {
						return m;
					}
				})
				.filter(Boolean)
				.map((m) => frappe.utils.strip_html(String(m)))
				.join(" ");
		} catch (e) {
			/* fall through */
		}
	}
	if (r.exception) return frappe.utils.strip_html(String(r.exception).split(":").slice(-1)[0].trim());
	return "";
}

export const call = (method, args = {}) => request(method, args, "POST");
export const get = (method, args = {}) => request(method, args, "GET");

export const shelf = {
	sources: () => get("frappe.shelf.api.get_sources"),
	catalog: (source, category, search) => get("frappe.shelf.api.get_catalog", { source, category, search }),
	artifact: (source, artifact_id) => get("frappe.shelf.api.get_artifact", { source, artifact_id }),
	plan: (source, artifact_id) => get("frappe.shelf.api.get_install_plan", { source, artifact_id }),
	install: (source, artifact_id, inputs, conflicts) =>
		call("frappe.shelf.api.install", { source, artifact_id, inputs, conflicts }),
	uninstall: (source, artifact_id) => call("frappe.shelf.api.uninstall", { source, artifact_id }),
	sync: (name, force = false) => call("frappe.shelf.api.sync_source", { name, force }),
	searchLink: (doctype, txt) => get("frappe.desk.search.search_link", { doctype, txt, page_length: 8 }),
	newSource: () => frappe.new_doc("Shelf Source"),
	openSource: (name) => frappe.set_route("Form", "Shelf Source", name),
};
