<template>
	<div class="shelf-head">
		<div class="shelf-brand"><span class="shelf-brand-mark"><Icon name="shelf" :size="14" :stroke-width="1.8" /></span>Shelf</div>
		<div class="shelf-head-sep"></div>
		<div class="shelf-tabs">
			<button
				v-for="source in visible"
				:key="source.name"
				class="shelf-tab"
				:class="{ 'is-active': active && source.name === active.name, 'is-error': source.connection_status !== 'Connected' }"
				:title="source.repo_url"
				@click="$emit('select', source.name)"
			>
				<Icon v-if="source.access === 'Private'" name="lock" :size="12" />
				<span>{{ source.title }}</span>
				<span class="shelf-tab-count">{{ source.artifact_count || 0 }}</span>
			</button>
			<div v-if="overflow.length" class="shelf-more">
				<button class="shelf-tab" @click="moreOpen = !moreOpen">
					More <span class="shelf-tab-count">{{ overflow.length }}</span><Icon name="chevron-down" :size="14" />
				</button>
				<div v-if="moreOpen" class="shelf-menu">
					<button v-for="source in overflow" :key="source.name" class="shelf-menu-item" @click="moreOpen = false; $emit('select', source.name)">
						<Icon v-if="source.access === 'Private'" name="lock" :size="12" />{{ source.title }}
						<span class="shelf-tab-count">{{ source.artifact_count || 0 }}</span>
					</button>
				</div>
			</div>
			<button class="shelf-tab shelf-tab-add" title="Connect a repository" @click="addSource"><Icon name="plus" :size="14" />Add</button>
		</div>
	</div>
</template>

<script>
import Icon from "./Icon.vue";
import { shelf } from "./api.js";

const MAX_TABS = 6;

export default {
	name: "TopBar",
	components: { Icon },
	props: {
		sources: { type: Array, default: () => [] },
		active: { type: Object, default: null },
	},
	emits: ["select"],
	data() {
		return { moreOpen: false };
	},
	mounted() {
		this._outside = (event) => {
			if (this.moreOpen && !this.$el.contains(event.target)) this.moreOpen = false;
		};
		document.addEventListener("mousedown", this._outside);
	},
	beforeUnmount() {
		document.removeEventListener("mousedown", this._outside);
	},
	computed: {
		ordered() {
			// Beyond six domains, keep the active one in the visible set.
			if (this.sources.length <= MAX_TABS) return this.sources;
			const first = this.sources.slice(0, 4);
			if (this.active && !first.includes(this.active)) first[3] = this.active;
			return [...first, ...this.sources.filter((s) => !first.includes(s))];
		},
		visible() {
			return this.sources.length <= MAX_TABS ? this.ordered : this.ordered.slice(0, 4);
		},
		overflow() {
			return this.sources.length <= MAX_TABS ? [] : this.ordered.slice(4);
		},
	},
	methods: {
		addSource() {
			shelf.newSource();
		},
	},
};
</script>

<style>
.shelf-head { height: 56px; display: flex; align-items: center; gap: 20px; padding: 0 24px; background: #fff; border-bottom: 1px solid var(--g200); }
.shelf-brand { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 600; color: var(--g900); white-space: nowrap; }
.shelf-brand-mark { width: 28px; height: 28px; border-radius: 7px; background: var(--g900); color: #fff; display: flex; align-items: center; justify-content: center; }
.shelf-head-sep { width: 1px; height: 24px; background: var(--g200); }
.shelf-tabs { display: flex; align-items: center; gap: 18px; height: 56px; min-width: 0; overflow: hidden; }
.shelf-tab { display: flex; align-items: center; gap: 6px; height: 56px; padding: 0 2px; border: 0; background: none; color: var(--g600); font-size: 14px; font-weight: 450; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
.shelf-tab:hover { color: var(--g900); }
.shelf-tab.is-active { color: var(--g900); font-weight: 500; border-bottom-color: var(--g900); }
.shelf-tab.is-error { color: var(--red600); }
.shelf-tab-count { font-size: 11px; color: var(--g500); background: var(--g100); padding: 1px 6px; border-radius: 999px; }
.shelf-tab-add { color: var(--g600); font-size: 13px; }
.shelf-more { position: relative; }
.shelf-menu { position: absolute; top: 44px; left: 0; min-width: 220px; background: #fff; border: 1px solid var(--g200); border-radius: 10px; box-shadow: 0 0 1px rgba(0,0,0,.2), 0 6px 15px -5px rgba(0,0,0,.11); padding: 6px; z-index: 50; }
.shelf-menu-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: 0; background: none; border-radius: 6px; color: var(--g800); text-align: left; }
.shelf-menu-item:hover { background: var(--g100); }
</style>
