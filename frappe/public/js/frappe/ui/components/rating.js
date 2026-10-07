import { validated, safe_attrs } from "./utils.js";

frappe.provide("frappe.ui");

/**
 * @typedef {Object} RatingOption
 * @property {number} [value] Its position (1, 2, 3…). Optional, for readability.
 * @property {string} [icon] A frappe icon name, an emoji, or short text. Defaults to "star".
 * @property {string} [label] Tooltip and accessible name ("Good"). Shown next to the row with show_label.
 */

/**
 * @typedef {Object} RatingOpts
 * @property {number} [value=0] 0 to max.
 * @property {number} [max=5] Number of stars. Ignored when options has more than one entry.
 * @property {1|0.5} [step=1] 0.5 allows half stars (one shared icon only).
 * @property {RatingOption[]} [options] One entry repeats for every position; one per position gives each its own icon.
 * @property {"auto"|"range"|"single"} [highlight="auto"] range fills up to the value, single marks only the chosen one. auto: range when all icons are the same.
 * @property {boolean} [fill=true] false colours only the outline, for line icons with inner detail.
 * @property {boolean} [show_label] Shows the current or hovered option's label next to the row.
 * @property {"yellow"|"gray"|"blue"|"green"|"amber"|"red"|"violet"|"orange"|"pink"|"teal"|"cyan"|"purple"} [theme="yellow"] Colour of the icons ("red" for hearts). Emoji and text keep their own look.
 * @property {"sm"|"md"|"lg"|"xl"} [size="md"]
 * @property {boolean} [readonly] Shows the value only: no hover, not focusable.
 * @property {boolean} [disabled] Editable control that is turned off (dimmed).
 * @property {boolean} [required] Clicking the current star doesn't clear it.
 * @property {string} [label] Accessible name of the group. Defaults to "Rating".
 * @property {function} [on_change] Called with (value) when the user changes it.
 * @property {function} [on_hover] Called with (value) while hovering, null when the pointer leaves.
 * @property {string} [css_class] Extra CSS classes.
 * @property {Object<string, string|true>} [attrs] Extra attributes.
 */

const SIZES = ["sm", "md", "lg", "xl"];
const STEPS = [1, 0.5];
const HIGHLIGHTS = ["auto", "range", "single"];
const THEMES = [
	"yellow",
	"gray",
	"blue",
	"green",
	"amber",
	"red",
	"violet",
	"orange",
	"pink",
	"teal",
	"cyan",
	"purple",
];

function clamp_value(value, max, step) {
	value = Math.round((parseFloat(value) || 0) / step) * step;
	return Math.min(Math.max(value, 0), max);
}

// "icon" draws from the sprite and can be split in halves; emoji and text can't
function icon_kind(icon) {
	if (frappe.utils.is_emoji(icon)) return "emoji";
	if (/^[a-z0-9-]+$/.test(icon) && document.getElementById(`icon-${icon}`)) return "icon";
	return "text";
}

// options → what each position shows, and the rules that follow from it
function resolve(opts) {
	let options = Array.isArray(opts.options) && opts.options.length ? opts.options : null;
	let max = Math.max(parseInt(opts.max) || 5, 1);
	if (options && options.length > 1) {
		max = options.length;
		options.forEach((option, i) => {
			if (option.value != null && option.value !== i + 1) {
				console.warn(
					`frappe.ui.rating: option "${option.label || option.icon}" has value ${
						option.value
					}, expected its position ${i + 1}`
				);
			}
		});
	}
	const items = Array.from({ length: max }, (_, i) => {
		const option = (options && (options[i] || options[0])) || {};
		const icon = option.icon || "star";
		return { icon, kind: icon_kind(icon), label: option.label || "" };
	});
	const highlight = validated(opts.highlight, HIGHLIGHTS, "highlight", "rating") || "auto";
	const single =
		highlight === "single" ||
		(highlight === "auto" && new Set(items.map((item) => item.icon)).size > 1);
	const halves = !single && items.every((item) => item.kind === "icon");
	const step = (halves && validated(opts.step, STEPS, "step", "rating")) || 1;
	return { max, items, single, step, stars: !options, fill: opts.fill !== false };
}

function value_text(value, spec) {
	return spec.stars
		? __("{0} of {1} stars", [value, spec.max])
		: __("{0} of {1}", [value, spec.max]);
}

function label_of(value, spec) {
	return (value && spec.items[Math.ceil(value) - 1]?.label) || "";
}

function item_text(value, spec) {
	const label = label_of(value, spec);
	return label ? `${label}, ${value_text(value, spec)}` : value_text(value, spec);
}

// filled | preview | removing | empty for the part of a star ending at `unit`
function unit_state(unit, value, hover, single) {
	if (single) {
		if (hover != null) return unit === hover ? "preview" : "empty";
		return unit === value ? "filled" : "empty";
	}
	if (hover == null) return unit <= value ? "filled" : "empty";
	if (hover >= value) {
		if (unit <= value) return "filled";
		return unit <= hover ? "preview" : "empty";
	}
	if (unit <= hover) return "filled";
	return unit <= value ? "removing" : "empty";
}

// legacy hooks: client scripts and app CSS select these on .rating
function legacy_class(state) {
	if (state === "filled") return "star-click";
	if (state === "preview") return "star-hover";
	return "";
}

function half_states(i, value, hover, spec) {
	if (spec.single) {
		const state = unit_state(i, value, hover, true);
		return [state, state];
	}
	return [unit_state(i - 0.5, value, hover), unit_state(i, value, hover)];
}

function half_html(side, state, icon) {
	const x = side === "left" ? 0 : 12;
	return `<svg class="${side}-half ${legacy_class(
		state
	)}" data-state="${state}" x="${x}" width="12" height="24" viewBox="${x} 0 12 24"><use href="#icon-${icon}" width="24" height="24"></use></svg>`;
}

// the visual is the item itself, so stars stay `div.rating > svg[data-rating]` as before
function item_html(i, value, hover, spec, attrs = 'aria-hidden="true"') {
	const item = spec.items[i - 1];
	if (item.kind !== "icon") {
		const state = unit_state(i, value, hover, spec.single);
		return `<span class="es-rating__item es-rating__glyph" data-rating="${i}" data-kind="${
			item.kind
		}" data-state="${state}" ${attrs}>${frappe.utils.escape_html(item.icon)}</span>`;
	}
	const [left, right] = half_states(i, value, hover, spec);
	return `<svg class="es-rating__item es-rating__icon" data-rating="${i}" viewBox="0 0 24 24" ${attrs}>${half_html(
		"left",
		left,
		item.icon
	)}${half_html("right", right, item.icon)}</svg>`;
}

function root_attrs(opts, spec, extra = []) {
	const size = validated(opts.size, SIZES, "size", "rating");
	const attrs = [...extra];
	if (size && size !== "md") attrs.push(`data-size="${size}"`);
	const theme = validated(opts.theme, THEMES, "theme", "rating");
	if (theme && theme !== "yellow") attrs.push(`data-theme="${theme}"`);
	if (spec.single) attrs.push('data-highlight="single"');
	if (!spec.fill) attrs.push('data-fill="false"');
	attrs.push(...safe_attrs(opts.attrs, "rating"));
	const classes = frappe.utils.escape_html(
		["rating", "es-rating", opts.css_class].filter(Boolean).join(" ")
	);
	return `class="${classes}" ${attrs.join(" ")}`;
}

function label_html(value, spec) {
	return `<span class="es-rating__label" aria-hidden="true">${frappe.utils.escape_html(
		label_of(value, spec)
	)}</span>`;
}

/**
 * Read-only rating as a markup string, for list, grid and report cells.
 * With a single highlight only the chosen option is shown.
 * @param {RatingOpts} [opts]
 * @returns {string}
 * @example frappe.ui.rating.html({ value: 3.5, max: 5, size: "sm" })
 */
function rating_html(opts = {}) {
	const spec = resolve({ ...opts, step: 0.5 });
	const value = clamp_value(opts.value, spec.max, spec.step);
	const text = value ? item_text(value, spec) : __("No rating");
	let items = "";
	for (let i = 1; i <= spec.max; i++) {
		if (spec.single && i !== value) continue;
		items += item_html(i, value, null, spec);
	}
	if (opts.show_label) items += label_html(value, spec);
	return `<div ${root_attrs(opts, spec, [
		'role="img"',
		`aria-label="${frappe.utils.escape_html(text)}"`,
		`title="${frappe.utils.escape_html(text)}"`,
	])}>${items}</div>`;
}

/**
 * Star rating (frappe-ui's Rating). Hover previews, click sets, clicking
 * the current star clears it. Whole steps work as a radio group, half
 * steps as a slider; both take arrows, Home/End and digit keys.
 * `options` swaps the star for icons, emoji or text with labels.
 * @example
 * const rating = new frappe.ui.Rating({ value: 3, on_change: (v) => save(v) });
 * wrapper.append(rating.$el);
 * @example
 * new frappe.ui.Rating({
 *     options: [
 *         { icon: "😞", label: __("Not satisfied") },
 *         { icon: "😐", label: __("Okay") },
 *         { icon: "😍", label: __("Loved it") },
 *     ],
 *     show_label: true,
 * });
 */
frappe.ui.Rating = class Rating {
	/** @param {RatingOpts} opts */
	constructor(opts = {}) {
		this.opts = opts;
		this.spec = resolve(opts);
		this.value = clamp_value(opts.value, this.spec.max, this.spec.step);
		this.hover = null;
		this.readonly = !!opts.readonly;
		this.disabled = !!opts.disabled;
		this.required = !!opts.required;

		this.$el = $(`<div class="rating es-rating"></div>`);
		this.el = this.$el[0];
		this.render();
		this.bind();
	}

	get max() {
		return this.spec.max;
	}

	get step() {
		return this.spec.step;
	}

	editable() {
		return !this.readonly && !this.disabled;
	}

	render() {
		const spec = this.spec;
		const label = this.opts.label || __("Rating");
		const slider = this.step !== 1;
		const el = this.el;
		// options can change the highlight and fill, so the root attributes start over
		const fresh = $(`<div ${root_attrs(this.opts, spec)}></div>`)[0];
		[...el.attributes].forEach((attr) => el.removeAttribute(attr.name));
		[...fresh.attributes].forEach((attr) => el.setAttribute(attr.name, attr.value));
		el.toggleAttribute("data-interactive", !this.readonly);
		el.toggleAttribute("data-disabled", this.disabled);

		let items = "";
		if (this.readonly) {
			const text = this.value
				? __("Rated {0}", [item_text(this.value, spec)])
				: __("No rating");
			el.setAttribute("role", "img");
			el.setAttribute("aria-label", `${label}: ${text}`);
			el.title = text;
			for (let i = 1; i <= this.max; i++) {
				items += item_html(i, this.value, null, spec);
			}
		} else {
			el.setAttribute("role", slider ? "slider" : "radiogroup");
			el.setAttribute("aria-label", label);
			if (this.disabled) el.setAttribute("aria-disabled", "true");
			if (slider && !this.disabled) el.tabIndex = 0;
			for (let i = 1; i <= this.max; i++) {
				const title = spec.items[i - 1].label;
				let attrs = slider
					? 'aria-hidden="true"'
					: `role="radio" aria-label="${frappe.utils.escape_html(item_text(i, spec))}"`;
				if (title) attrs += ` title="${frappe.utils.escape_html(title)}"`;
				if (this.disabled && !slider) attrs += ' aria-disabled="true"';
				items += item_html(i, this.value, this.hover, spec, attrs);
			}
		}
		if (this.opts.show_label) items += label_html(this.value, spec);
		el.innerHTML = items;
		this.paint();
	}

	// repaint for value/hover without rebuilding the items (keeps focus)
	paint() {
		const spec = this.spec;
		this.el.querySelectorAll("[data-rating]").forEach((visual) => {
			const i = Number(visual.dataset.rating);
			if (visual.classList.contains("es-rating__glyph")) {
				visual.setAttribute(
					"data-state",
					unit_state(i, this.value, this.hover, spec.single)
				);
				return;
			}
			const states = half_states(i, this.value, this.hover, spec);
			[".left-half", ".right-half"].forEach((selector, n) => {
				const half = visual.querySelector(selector);
				half.setAttribute("data-state", states[n]);
				half.classList.toggle("star-click", states[n] === "filled");
				half.classList.toggle("star-hover", states[n] === "preview");
			});
		});
		this.el.toggleAttribute("data-active", !!this.value || this.hover != null);
		this.el.toggleAttribute("data-hovering", this.hover != null);
		const label = this.el.querySelector(".es-rating__label");
		if (label) label.textContent = label_of(this.hover ?? this.value, spec);

		if (this.readonly) return;
		if (this.step !== 1) {
			this.el.setAttribute("aria-valuemin", "0");
			this.el.setAttribute("aria-valuemax", String(this.max));
			this.el.setAttribute("aria-valuenow", String(this.value));
			this.el.setAttribute(
				"aria-valuetext",
				this.value ? item_text(this.value, spec) : __("No rating")
			);
		} else {
			const current = Math.ceil(this.value) || 1;
			this.el.querySelectorAll(".es-rating__item").forEach((item) => {
				const i = Number(item.dataset.rating);
				item.setAttribute("aria-checked", String(Math.ceil(this.value) === i));
				item.setAttribute("tabindex", i === current && !this.disabled ? "0" : "-1");
			});
		}
	}

	// value under a pointer x, measured on the stars (pads overlap)
	value_at(client_x) {
		const rtl = frappe.utils.is_rtl();
		let value = 0;
		this.el.querySelectorAll("[data-rating]").forEach((visual) => {
			// the tap pad isn't part of the star
			const pad = parseFloat(getComputedStyle(visual).paddingLeft) || 0;
			const rect = visual.getBoundingClientRect();
			const width = rect.width - pad * 2;
			const i = Number(visual.dataset.rating);
			const from_start = (rtl ? rect.right - client_x : client_x - rect.left) - pad;
			if (from_start >= width / 2 || (this.step === 1 && from_start >= 0)) {
				value = Math.max(value, i);
			} else if (from_start >= 0) {
				value = Math.max(value, i - 0.5);
			}
		});
		return Math.max(value, this.step);
	}

	bind() {
		const el = this.el;

		el.addEventListener("pointermove", (e) => {
			if (!this.editable()) return;
			if (e.pointerType === "mouse") {
				// single highlight: only the item under the pointer, not the gaps
				const item = e.target.closest(".es-rating__item");
				if (this.spec.single) this.set_hover(item ? Number(item.dataset.rating) : null);
				else this.set_hover(this.value_at(e.clientX));
			} else if (this.drag) {
				if (Math.abs(e.clientX - this.drag.x) > 6) this.drag.moved = true;
				if (this.drag.moved) this.set_hover(this.value_at(e.clientX));
			}
		});
		el.addEventListener("pointerleave", (e) => {
			if (e.pointerType === "mouse") this.set_hover(null);
		});
		el.addEventListener("pointerdown", (e) => {
			this.pointer_type = e.pointerType;
			if (!this.editable() || e.pointerType === "mouse") return;
			this.drag = { x: e.clientX, moved: false };
			el.setPointerCapture(e.pointerId);
		});
		el.addEventListener("pointerup", () => {
			const drag = this.drag;
			this.drag = null;
			if (!drag || !drag.moved) return;
			const value = this.hover;
			this.set_hover(null);
			this.skip_click = true;
			value != null && this.pick(value);
		});
		el.addEventListener("pointercancel", () => {
			this.drag = null;
			this.set_hover(null);
		});

		el.addEventListener("click", (e) => {
			const item = e.target.closest(".es-rating__item");
			if (this.skip_click) {
				this.skip_click = false;
				return;
			}
			if (!item || !this.editable()) return;
			// scripted clicks (detail 0) and touch taps set whole stars; mouse can pick halves
			if (e.detail === 0 || this.pointer_type !== "mouse" || this.step === 1) {
				this.pick(Number(item.dataset.rating), { toggle: e.detail !== 0 });
			} else {
				this.pick(this.value_at(e.clientX));
			}
		});

		el.addEventListener("keydown", (e) => this.on_key(e));
	}

	on_key(e) {
		if (!this.editable()) return;
		const rtl = frappe.utils.is_rtl();
		const up = ["ArrowUp", rtl ? "ArrowLeft" : "ArrowRight"];
		const down = ["ArrowDown", rtl ? "ArrowRight" : "ArrowLeft"];
		const min = this.required ? this.step : 0;
		let value;
		const item = e.target.closest?.(".es-rating__item");
		if ([" ", "Enter"].includes(e.key) && item) value = Number(item.dataset.rating);
		else if (up.includes(e.key)) value = this.value + this.step;
		else if (down.includes(e.key)) value = this.value - this.step;
		else if (e.key === "Home") value = min;
		else if (e.key === "End") value = this.max;
		else if (/^[0-9]$/.test(e.key)) value = Number(e.key);
		else return;
		e.preventDefault();
		value = Math.min(Math.max(value, min), this.max);
		this.pick(value, { toggle: false });
		if (this.step === 1) {
			this.el
				.querySelector(`.es-rating__item[data-rating="${Math.ceil(value) || 1}"]`)
				?.focus();
		}
	}

	set_hover(value) {
		if (value === this.hover) return;
		this.hover = value;
		this.paint();
		this.opts.on_hover && this.opts.on_hover(value);
	}

	pick(value, { toggle = true } = {}) {
		value = clamp_value(value, this.max, this.step);
		if (toggle && value === this.value) value = 0;
		if (value === 0 && this.required) return;
		this.hover = null;
		if (value === this.value) return this.paint();
		this.value = value;
		this.paint();
		this.opts.on_change && this.opts.on_change(value);
	}

	get_value() {
		return this.value;
	}

	/** Change the value from code. Fires on_change unless silent. */
	set_value(value, { silent = false } = {}) {
		value = clamp_value(value, this.max, this.step);
		const changed = value !== this.value;
		this.value = value;
		this.paint();
		if (changed && !silent) this.opts.on_change && this.opts.on_change(value);
	}

	/** Swap the icons, emoji or text. The value is kept, clamped to the new max. */
	set_options(options) {
		this.opts = { ...this.opts, options };
		this.spec = resolve(this.opts);
		this.value = clamp_value(this.value, this.max, this.step);
		this.hover = null;
		this.render();
	}

	set_readonly(readonly) {
		this.readonly = !!readonly;
		this.hover = null;
		this.render();
	}

	set_disabled(disabled) {
		this.disabled = !!disabled;
		this.hover = null;
		this.render();
	}

	set_required(required) {
		this.required = !!required;
	}

	destroy() {
		this.$el.remove();
	}
};

/**
 * Convenience form: build the rating and get its element back. The
 * instance is on `.data("es-rating")` for get_value/set_value.
 * @param {RatingOpts} opts
 * @returns {JQuery}
 * @example form_body.append(frappe.ui.rating({ value: 4, on_change: (v) => save(v) }));
 */
frappe.ui.rating = function (opts = {}) {
	const rating = new frappe.ui.Rating(opts);
	rating.$el.data("es-rating", rating);
	return rating.$el;
};

frappe.ui.rating.html = rating_html;

export default frappe.ui.rating;
