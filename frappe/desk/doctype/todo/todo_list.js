frappe.listview_settings["ToDo"] = {
	hide_name_column: true,
	add_fields: ["reference_type", "reference_name"],
	filter_suggestions: [
		{ name: "open", label: __("Open"), icon: "circle", filter: ["status", "=", "Open"] },
		{
			name: "mine",
			label: __("Assigned to me"),
			icon: "user",
			filter: () => ["allocated_to", "=", frappe.session.user],
		},
		{
			name: "due_this_week",
			label: __("Due this week"),
			icon: "calendar",
			filter: ["date", "Timespan", "this week"],
		},
		{
			name: "high_priority",
			label: __("High priority"),
			icon: "flag",
			filter: ["priority", "=", "High"],
		},
	],

	onload: function (me) {
		me.page.set_title(__("To Do"));
	},

	button: {
		show: function (doc) {
			return doc.reference_name;
		},
		get_label: function () {
			return __("Open", null, "Access");
		},
		get_description: function (doc) {
			return __("Open {0}", [`${__(doc.reference_type)}: ${doc.reference_name}`]);
		},
		action: function (doc) {
			frappe.set_route("Form", doc.reference_type, doc.reference_name);
		},
	},
};
