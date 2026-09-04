// Dynamic Link on top of ControlLinkCombobox: same target-doctype resolution
// as ControlDynamicLink, applied to the combobox-backed control.

frappe.ui.form.ControlDynamicLinkCombobox = class ControlDynamicLinkCombobox extends (
	frappe.ui.form.ControlLinkCombobox
) {
	get_options() {
		return frappe.ui.form.ControlDynamicLink.prototype.get_options.call(this);
	}
};
