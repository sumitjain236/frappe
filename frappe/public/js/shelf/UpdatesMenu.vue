<template>
	<div class="shelf-updates">
		<button class="shelf-btn shelf-btn-outline" @click="open = !open">
			<Icon name="refresh" :size="14" :class="{ 'shelf-spin': busy }" />Updates
			<span v-if="updates.count" class="shelf-count">{{ updates.count }}</span>
		</button>
		<div v-if="open" class="shelf-menu shelf-updates-menu">
			<div class="shelf-updates-head">
				<span>Updates across your domains · {{ updates.count }}</span>
				<button v-if="updates.rows.length" class="shelf-btn shelf-btn-solid" @click="open = false; $emit('update-all')">Update all</button>
			</div>
			<div v-if="!updates.rows.length" class="shelf-updates-empty">
				{{ updates.count ? "Loading…" : "Everything is up to date." }}
			</div>
			<div v-for="row in updates.rows" :key="row.source.name + row.artifact.artifact_id" class="shelf-updates-row">
				<Icon :name="iconFor(row.artifact.category)" :size="16" />
				<div class="shelf-updates-body">
					<div class="shelf-updates-title">
						{{ row.artifact.title }}
						<span class="shelf-mono">{{ row.artifact.installed_version }}→</span>
						<span class="shelf-mono is-new">{{ row.artifact.version }}</span>
					</div>
					<div class="shelf-muted">{{ row.source.title }}</div>
				</div>
				<button class="shelf-btn shelf-btn-outline" @click="open = false; $emit('open-update', row)">Update</button>
			</div>
			<div class="shelf-updates-foot">
				<span>Your inputs are kept on update</span>
				<button class="shelf-btn shelf-btn-ghost" :disabled="busy" @click="$emit('check-all')">Check now</button>
			</div>
		</div>
	</div>
</template>

<script>
import Icon from "./Icon.vue";
import { categoryIcon } from "./icons.js";

export default {
	name: "UpdatesMenu",
	components: { Icon },
	props: {
		updates: { type: Object, default: () => ({ rows: [], count: 0 }) },
		busy: { type: Boolean, default: false },
	},
	emits: ["check-all", "open-update", "update-all"],
	data() {
		return { open: false };
	},
	mounted() {
		// Close on a click anywhere outside the button or the popover.
		this._outside = (event) => {
			if (this.open && !this.$el.contains(event.target)) this.open = false;
		};
		document.addEventListener("mousedown", this._outside);
	},
	beforeUnmount() {
		document.removeEventListener("mousedown", this._outside);
	},
	methods: { iconFor: categoryIcon },
};
</script>

<style>
.shelf-updates { position: relative; }
.shelf-count { font-size: 11px; color: #fff; background: var(--blue500); padding: 1px 6px; border-radius: 999px; }
.shelf-updates-menu { top: calc(100% + 4px); left: auto; right: 0; width: 460px; padding: 0; overflow: hidden; }
.shelf-updates-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--g200); font-size: 13px; font-weight: 600; color: var(--g900); }
.shelf-updates-empty { padding: 20px 14px; color: var(--g600); font-size: 13px; }
.shelf-updates-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--g200); color: var(--g700); }
.shelf-updates-body { flex: 1; min-width: 0; }
.shelf-updates-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: var(--g900); }
.shelf-updates-title .shelf-mono { font-size: 11px; color: var(--g500); }
.shelf-updates-title .is-new { color: var(--blue600); font-weight: 600; }
.shelf-updates-foot { display: flex; align-items: center; justify-content: space-between; padding: 8px 8px 8px 14px; background: var(--g50); font-size: 12px; color: var(--g600); }
</style>
