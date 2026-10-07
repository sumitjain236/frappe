// Stores a fraction (0 to 1) of df.options stars (default 5); frappe.ui.rating draws them.
frappe.ui.form.ControlRating = class ControlRating extends frappe.ui.form.ControlFloat {
	make_input() {
		super.make_input();
		this.rating = new frappe.ui.Rating({
			max: this.get_star_count(),
			step: 0.5,
			label: __(this.df.label || "Rating"),
			required: !!this.df.reqd,
			readonly: !this.is_rating_editable(),
			on_change: (stars) => this.update_rating(stars),
		});
		$(this.input_area).empty().append(this.rating.$el);
		this.$input = this.rating.$el;
	}

	get_star_count() {
		return cint(this.df.options) || 5;
	}

	// the form builder previews with `disabled`; grids and only_input controls render while read-only
	is_rating_editable() {
		return !this.disabled && this.can_write();
	}

	update_rating(stars) {
		if (!this.is_rating_editable()) return;
		this.validate_and_set_in_model(stars / this.get_star_count());
	}

	get_value() {
		return this.value;
	}

	set_formatted_input(value) {
		if (!this.rating) return;
		const readonly = !this.is_rating_editable();
		if (this.rating.readonly !== readonly) this.rating.set_readonly(readonly);
		this.rating.set_required(!!this.df.reqd);
		this.rating.set_value(flt(value) * this.get_star_count(), { silent: true });
	}

	validate(fraction) {
		return parseFloat(fraction);
	}
};
