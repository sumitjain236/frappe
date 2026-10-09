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
 * @property {boolean} [drag=true] false rates by tap only, so a swipe over the stars scrolls the page (boards, carousels).
 * @property {string} [label] Accessible name of the group. Defaults to "Rating"; .html() puts it before the value text.
 * @property {function} [on_change] Called with (value) when the user changes it.
 * @property {function} [on_hover] Called with (value) while hovering, null when the pointer leaves.
 * @property {string} [css_class] Extra CSS classes.
 * @property {Object<string, string|true>} [attrs] Extra attributes. A title replaces the default tooltip; an aria-label names the stars like `label` (read-only stars still add the value).
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
	// the default star draws its own paths, so it doesn't need the sprite
	if (icon === "star") return "icon";
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

// 3.5 reads "3,5" where the user's number format says so
function format_value(value) {
	return format_number(value, null, value % 1 ? 1 : 0);
}

// the last option fully reached: 3.5 filled stars still read as the third option
function label_of(value, spec) {
	const position = spec.single ? value : Math.floor(value);
	return (position && spec.items[position - 1]?.label) || "";
}

// each case is one whole sentence for translators: "Good, 4 of 5", "4 of 5 stars"
function item_text(value, spec) {
	if (!value) return __("No rating");
	const shown = format_value(value);
	const label = label_of(value, spec);
	if (label) return __("{0}, {1} of {2}", [label, shown, spec.max]);
	return spec.stars
		? __("{0} of {1} stars", [shown, spec.max])
		: __("{0} of {1}", [shown, spec.max]);
}

// read-only wording, named when there is a name: "Lead quality: rated 4 of 5 stars"
function rated_text(value, spec, name) {
	const shown = format_value(value);
	const label = label_of(value, spec);
	const max = spec.max;
	if (name) {
		if (!value) return __("{0}: no rating", [name]);
		if (label) return __("{0}: {1}, rated {2} of {3}", [name, label, shown, max]);
		return spec.stars
			? __("{0}: rated {1} of {2} stars", [name, shown, max])
			: __("{0}: rated {1} of {2}", [name, shown, max]);
	}
	if (!value) return __("No rating");
	if (label) return __("{0}, rated {1} of {2}", [label, shown, max]);
	return spec.stars
		? __("Rated {0} of {1} stars", [shown, max])
		: __("Rated {0} of {1}", [shown, max]);
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

// the old control's half-star paths: scripts click or select `path.left-half` on the default star
const STAR_HALVES = {
	left: "M11.9987 3.00011C11.8207 3.00011 11.6428 3.09261 11.5509 3.27762L9.15562 8.09836C9.08253 8.24546 8.94185 8.34728 8.77927 8.37075L3.42887 9.14298C3.01771 9.20233 2.85405 9.70811 3.1525 9.99707L7.01978 13.7414C7.13858 13.8564 7.19283 14.0228 7.16469 14.1857L6.25116 19.4762C6.18071 19.8842 6.6083 20.1961 6.97531 20.0045L11.7672 17.5022C11.8397 17.4643 11.9192 17.4454 11.9987 17.4454V3.00011Z",
	right: "M11.9987 3.00011C12.177 3.00011 12.3554 3.09303 12.4471 3.27888L14.8213 8.09112C14.8941 8.23872 15.0349 8.34102 15.1978 8.3647L20.5069 9.13641C20.917 9.19602 21.0807 9.69992 20.7841 9.9892L16.9421 13.7354C16.8243 13.8503 16.7706 14.0157 16.7984 14.1779L17.7053 19.4674C17.7753 19.8759 17.3466 20.1874 16.9798 19.9945L12.2314 17.4973C12.1586 17.459 12.0786 17.4398 11.9987 17.4398V3.00011Z",
};
let clip_count = 0;

// other icons are clipped <use>, not nested <svg>: apps select `.rating svg` and expect one per star
function half_html(side, state, icon, clip_id) {
	const attrs = `class="${side}-half ${legacy_class(state)}" data-state="${state}"`;
	if (icon === "star") return `<path ${attrs} d="${STAR_HALVES[side]}"></path>`;
	return `<use ${attrs} href="#icon-${icon}" clip-path="url(#${clip_id}-${side})"></use>`;
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
	const clip_id = item.icon === "star" ? null : `es-rating-clip-${++clip_count}`;
	const clips = clip_id
		? `<clipPath id="${clip_id}-left"><rect width="12" height="24"></rect></clipPath><clipPath id="${clip_id}-right"><rect x="12" width="12" height="24"></rect></clipPath>`
		: "";
	return `<svg class="es-rating__item es-rating__icon" data-rating="${i}" viewBox="0 0 24 24" ${attrs}>${clips}${half_html(
		"left",
		left,
		item.icon,
		clip_id
	)}${half_html("right", right, item.icon, clip_id)}</svg>`;
}

// a caller's title or aria-label (from attrs) names the stars; read-only stars still add the value
function own_attr(opts, name) {
	const value = opts.attrs?.[name];
	return value == null || value === true ? "" : String(value);
}

function root_attrs(opts, spec, extra = []) {
	const size = validated(opts.size, SIZES, "size", "rating");
	const attrs = [...extra];
	if (size && size !== "md") attrs.push(`data-size="${size}"`);
	const theme = validated(opts.theme, THEMES, "theme", "rating");
	if (theme && theme !== "yellow") attrs.push(`data-theme="${theme}"`);
	if (spec.single) attrs.push('data-highlight="single"');
	if (!spec.fill) attrs.push('data-fill="false"');
	// title and aria-label are composed with the value text (see own_attr)
	const { title, "aria-label": aria_label, ...rest } = opts.attrs || {};
	attrs.push(...safe_attrs(rest, "rating"));
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
 * @example frappe.ui.rating.html({ value: 3.5, max: 5 })
 */
function rating_html(opts = {}) {
	const spec = resolve({ ...opts, step: 0.5 });
	const value = clamp_value(opts.value, spec.max, spec.step);
	let items = "";
	for (let i = 1; i <= spec.max; i++) {
		if (spec.single && i !== value) continue;
		items += item_html(i, value, null, spec);
	}
	if (opts.show_label) items += label_html(value, spec);
	const name = own_attr(opts, "aria-label") || opts.label;
	const escape = frappe.utils.escape_html;
	return `<div ${root_attrs(opts, spec, [
		'role="img"',
		`aria-label="${escape(rated_text(value, spec, name))}"`,
		`title="${escape(own_attr(opts, "title") || rated_text(value, spec))}"`,
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

		this.$el = $(`<div ${root_attrs(opts, this.spec)}></div>`);
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

	group_label() {
		return own_attr(this.opts, "aria-label") || this.opts.label || __("Rating");
	}

	editable() {
		return !this.readonly && !this.disabled;
	}

	render() {
		const spec = this.spec;
		const label = this.group_label();
		const slider = this.step !== 1;
		const el = this.el;
		// only the attributes this method sets: callers' classes and ids stay
		[
			"role",
			"tabindex",
			"title",
			"aria-label",
			"aria-disabled",
			"aria-required",
			"aria-valuemin",
			"aria-valuemax",
			"aria-valuenow",
			"aria-valuetext",
		].forEach((name) => el.removeAttribute(name));
		if (spec.single) el.setAttribute("data-highlight", "single");
		else el.removeAttribute("data-highlight");
		if (spec.fill) el.removeAttribute("data-fill");
		else el.setAttribute("data-fill", "false");
		el.toggleAttribute("data-interactive", !this.readonly);
		if (this.opts.drag === false) el.setAttribute("data-drag", "false");
		el.toggleAttribute("data-disabled", this.disabled);

		let items = "";
		if (this.readonly) {
			// its aria-label and title carry the value, so paint() writes them
			el.setAttribute("role", "img");
			for (let i = 1; i <= this.max; i++) {
				items += item_html(i, this.value, null, spec);
			}
		} else {
			el.setAttribute("role", slider ? "slider" : "radiogroup");
			el.setAttribute("aria-label", label);
			if (own_attr(this.opts, "title")) el.title = own_attr(this.opts, "title");
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

		if (this.readonly) {
			this.el.setAttribute("aria-label", rated_text(this.value, spec, this.group_label()));
			this.el.title = own_attr(this.opts, "title") || rated_text(this.value, spec);
			return;
		}
		if (this.step !== 1) {
			// required ratings stop at one step, as Home and the 0 key do
			this.el.setAttribute("aria-valuemin", String(this.required ? this.step : 0));
			this.el.setAttribute("aria-valuemax", String(this.max));
			this.el.setAttribute("aria-valuenow", String(this.value));
			this.el.setAttribute("aria-valuetext", item_text(this.value, spec));
		} else {
			// a slider can't carry aria-required; a radio group can
			if (this.required) this.el.setAttribute("aria-required", "true");
			else this.el.removeAttribute("aria-required");
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
		// the tap pad isn't part of the star; every icon has the same one and glyphs have none
		const icon = this.el.querySelector(".es-rating__icon");
		const icon_pad = (icon && parseFloat(getComputedStyle(icon).paddingLeft)) || 0;
		this.el.querySelectorAll("[data-rating]").forEach((visual) => {
			const pad = visual.classList.contains("es-rating__icon") ? icon_pad : 0;
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
			// a hovering pen previews like the mouse; a pressed pen drags like touch
			if (e.pointerType === "mouse" || (e.pointerType === "pen" && !this.drag)) {
				// single highlight: only the item under the pointer, not the gaps
				const item = e.target.closest(".es-rating__item");
				if (this.spec.single) this.set_hover(item ? Number(item.dataset.rating) : null);
				else this.set_hover(this.value_at(e.clientX));
			} else if (this.drag) {
				if (Math.abs(e.clientX - this.drag.x) > 6) this.drag.moved = true;
				if (this.drag.moved && this.opts.drag !== false) {
					this.set_hover(this.value_at(e.clientX));
				}
			}
		});
		el.addEventListener("pointerleave", (e) => {
			if (e.pointerType !== "touch" && !this.drag) this.set_hover(null);
		});
		el.addEventListener("pointerdown", (e) => {
			this.pointer_type = e.pointerType;
			this.ignore_click_until = 0;
			if (!this.editable() || e.pointerType === "mouse") return;
			const item = e.target.closest(".es-rating__item");
			this.drag = { x: e.clientX, moved: false, item, at: e.timeStamp };
			el.setPointerCapture(e.pointerId);
		});
		// touch is settled here, not in click: a tap picks the star by shape (tap pads overlap)
		// and a long press doesn't rate
		el.addEventListener("pointerup", (e) => {
			const drag = this.drag;
			this.drag = null;
			if (!drag) return;
			// skip the browser's own click for this touch; scripted clicks still count
			this.ignore_click_until = e.timeStamp + 600;
			if (drag.moved) {
				const value = this.hover;
				this.set_hover(null);
				// a drag places the value and never clears it; tap-only ratings ignore moves,
				// whatever a hovering pen previewed before the press
				if (value != null && this.opts.drag !== false) this.pick(value, { toggle: false });
			} else if (drag.item && e.timeStamp - drag.at < 500) {
				// a long press (to read a tooltip, say) shouldn't rate; a tap picks the star
				// whose shape is under the finger, not the neighbour whose tap pad overlaps it
				this.pick(
					this.spec.single
						? Number(drag.item.dataset.rating)
						: Math.ceil(this.value_at(e.clientX))
				);
			} else {
				// nothing picked: drop the preview a hovering pen left behind
				this.set_hover(null);
			}
		});
		el.addEventListener("pointercancel", () => {
			this.drag = null;
			this.set_hover(null);
		});

		el.addEventListener("click", (e) => {
			const item = e.target.closest(".es-rating__item");
			if (e.isTrusted && e.timeStamp < this.ignore_click_until) {
				this.ignore_click_until = 0;
				return;
			}
			// the second click of a double-click would clear what the first one set
			if (!item || !this.editable() || e.detail > 1) return;
			// scripted clicks (detail 0, or no pointer before them) set whole stars
			if (e.detail === 0 || this.pointer_type !== "mouse") {
				this.pick(Number(item.dataset.rating), { toggle: e.detail !== 0 });
			} else {
				// measured on the star shapes, as the tap pads overlap neighbours
				this.pick(
					this.spec.single ? Number(item.dataset.rating) : this.value_at(e.clientX)
				);
			}
		});

		el.addEventListener("keydown", (e) => this.on_key(e));
	}

	on_key(e) {
		// leave browser and app shortcuts (Alt+← back, Ctrl+1 tab…) alone
		if (!this.editable() || e.ctrlKey || e.metaKey || e.altKey) return;
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
		this.paint();
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

/**
 * Number of stars of a Rating field: its options, 5 when unset.
 * @param {Object} df The Rating DocField.
 * @returns {number}
 */
frappe.ui.rating.max_of = (df) => Math.max(parseInt(df?.options) || 5, 1);

export default frappe.ui.rating;
