// Link field rendered with frappe.ui.Combobox (button trigger, search inside
// the panel, avatars, paging). Picked by make_control for Link fields when
// System Settings > "Enable Combobox Link Field" is on, or when a developer
// sets localStorage.combobox_link_field = "1" for their own browser.
//
// The classic ControlLink stays untouched so customizations that reach into
// it (`field.awesomplete`, `$input.cache`, ...) keep working while the flag
// is off.
//
// Step 1 of the rollout: this class only inherits the classic control so the
// switch itself ships with no visible change. The Combobox-backed
// implementation replaces the body in later steps.

frappe.ui.form.is_combobox_link_enabled = function () {
	try {
		const override = window.localStorage?.getItem("combobox_link_field");
		if (override === "1") return true;
		if (override === "0") return false;
	} catch (e) {
		// storage blocked: fall through to the site setting
	}
	return frappe.defaults.is_enabled("enable_combobox_link_field");
};

frappe.ui.form.ControlLinkCombobox = class ControlLinkCombobox extends (
	frappe.ui.form.ControlLink
) {};
