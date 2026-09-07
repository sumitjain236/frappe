<template>
	<div class="shelf-card shelf-table">
		<div class="shelf-tr shelf-th">
			<div class="shelf-td-main">Artifact</div><div class="shelf-td-type">Type</div><div class="shelf-td-ver">Version</div>
			<div class="shelf-td-upd">Updated</div><div class="shelf-td-has">Contains</div><div class="shelf-td-req">Requires</div><div class="shelf-td-act"></div>
		</div>
		<div v-for="row in rows" :key="row.name" class="shelf-tr" @click="$emit('open', row)">
			<div class="shelf-td-main">
				<div class="shelf-type-icon shelf-type-icon-sm" :style="{ background: color(row).bg, color: color(row).fg }"><Icon :name="icon(row)" :size="15" :stroke-width="1.7" /></div>
				<div class="shelf-td-text"><div class="shelf-td-title">{{ row.title }}</div><div class="shelf-td-desc">{{ row.description }}</div></div>
			</div>
			<div class="shelf-td-type">{{ row.category || "Other" }}</div>
			<div class="shelf-td-ver">
				<template v-if="row.state === 'update'"><span class="shelf-mono">{{ row.installed_version }}</span><span class="shelf-muted"> → </span><span class="shelf-mono is-new">{{ row.version }}</span></template>
				<template v-else><span class="shelf-mono">{{ row.installed_version || row.version }}</span><Icon v-if="row.state === 'installed'" name="check" :size="12" class="is-ok" /></template>
			</div>
			<div class="shelf-td-upd">{{ shortDate(row.updated) }}</div>
			<div class="shelf-td-has">{{ row.documents_count }} doc{{ row.documents_count === 1 ? "" : "s" }} · {{ row.inputs_count }} input{{ row.inputs_count === 1 ? "" : "s" }}</div>
			<div class="shelf-td-req"><StateLine :artifact="{ ...row, state: 'available' }" /></div>
			<div class="shelf-td-act"><StateAction :artifact="row" @install="$emit('install', row)" /></div>
		</div>
	</div>
</template>

<script>
import Icon from "./Icon.vue";
import StateLine from "./StateLine.vue";
import StateAction from "./StateAction.vue";
import { categoryIcon, categoryStyle } from "./icons.js";
import { shortDate } from "./format.js";

export default {
	name: "ArtifactTable",
	components: { Icon, StateLine, StateAction },
	props: { rows: { type: Array, default: () => [] } },
	emits: ["open", "install"],
	methods: {
		icon: (row) => categoryIcon(row.category),
		color: (row) => categoryStyle(row.category),
		shortDate,
	},
};
</script>

<style>
.shelf-table { overflow: hidden; }
.shelf-tr { display: flex; align-items: center; gap: 12px; padding: 0 16px; min-height: 56px; border-bottom: 1px solid var(--g200); font-size: 13px; color: var(--g700); cursor: pointer; }
.shelf-tr:last-child { border-bottom: 0; }
.shelf-tr:not(.shelf-th):hover { background: var(--g50); }
.shelf-th { min-height: 34px; background: var(--g50); font-size: 11px; font-weight: 500; color: var(--g500); text-transform: uppercase; letter-spacing: .05em; cursor: default; }
.shelf-td-main { flex: 1 1 320px; min-width: 0; display: flex; align-items: center; gap: 10px; }
.shelf-type-icon-sm { width: 30px; height: 30px; }
.shelf-td-text { min-width: 0; }
.shelf-td-title { font-size: 14px; font-weight: 500; color: var(--g900); }
.shelf-td-desc { font-size: 12px; color: var(--g600); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.shelf-td-type { width: 100px; }
.shelf-td-ver { width: 130px; display: flex; align-items: center; gap: 4px; }
.shelf-td-ver .is-new { color: var(--blue600); font-weight: 600; }
.shelf-td-ver .is-ok { color: var(--green600); }
.shelf-td-upd { width: 80px; color: var(--g600); }
.shelf-td-has { width: 130px; font-size: 12px; color: var(--g600); }
.shelf-td-req { width: 150px; }
.shelf-td-act { width: 110px; display: flex; justify-content: flex-end; }
</style>
