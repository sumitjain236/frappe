<template>
	<div class="shelf-link" @focusout="onBlur">
		<label class="shelf-input">
			<input :value="text" type="text" :placeholder="placeholder" autocomplete="off" @input="onInput($event.target.value)" @focus="open = true; search(text)" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="pick(results[cursor])" @keydown.esc="open = false" />
			<Icon name="chevron-down" :size="14" style="color: var(--g600)" />
		</label>
		<div v-if="open && results.length" class="shelf-link-menu">
			<button v-for="(r, i) in results" :key="r.value" type="button" class="shelf-link-item" :class="{ 'is-cursor': i === cursor }" @mousedown.prevent="pick(r)">
				<span>{{ r.value }}</span><span v-if="r.description" class="shelf-muted">{{ r.description }}</span>
			</button>
		</div>
	</div>
</template>

<script>
import Icon from "./Icon.vue";
import { shelf } from "./api.js";

export default {
	name: "LinkInput",
	components: { Icon },
	props: { modelValue: { type: String, default: "" }, doctype: { type: String, required: true }, placeholder: { type: String, default: "" } },
	emits: ["update:modelValue"],
	data() {
		return { text: this.modelValue || "", results: [], open: false, cursor: 0 };
	},
	watch: {
		modelValue(v) {
			this.text = v || "";
		},
	},
	methods: {
		onInput(value) {
			this.text = value;
			this.$emit("update:modelValue", value);
			this.open = true;
			this.search(value);
		},
		async search(txt) {
			clearTimeout(this._t);
			this._t = setTimeout(async () => {
				try {
					const rows = await shelf.searchLink(this.doctype, txt || "");
					this.results = (rows || []).map((r) => ({ value: r.value, description: r.description || (r.label && r.label !== r.value ? r.label : "") }));
					this.cursor = 0;
				} catch (e) {
					this.results = [];
				}
			}, 150);
		},
		move(delta) {
			if (!this.results.length) return;
			this.cursor = (this.cursor + delta + this.results.length) % this.results.length;
		},
		pick(row) {
			if (!row) return;
			this.text = row.value;
			this.$emit("update:modelValue", row.value);
			this.open = false;
		},
		onBlur(event) {
			if (!this.$el.contains(event.relatedTarget)) this.open = false;
		},
	},
};
</script>

<style>
.shelf-link { position: relative; }
.shelf-link-menu { position: absolute; top: 36px; left: 0; right: 0; background: #fff; border: 1px solid var(--g200); border-radius: 8px; box-shadow: 0 6px 15px -5px rgba(0,0,0,.11); padding: 4px; z-index: 70; max-height: 240px; overflow: auto; }
.shelf-link-item { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; width: 100%; padding: 6px 8px; border: 0; background: none; border-radius: 6px; text-align: left; color: var(--g900); font-size: 13px; }
.shelf-link-item:hover, .shelf-link-item.is-cursor { background: var(--g100); }
</style>
