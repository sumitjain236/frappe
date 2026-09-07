<template>
	<div class="shelf-acard shelf-card" @click="$emit('open')">
		<div v-if="artifact.state === 'update'" class="shelf-acard-dot" title="Update available"></div>
		<div class="shelf-acard-head">
			<div class="shelf-type-icon" :style="{ background: color.bg, color: color.fg }"><Icon :name="icon" :size="16" :stroke-width="1.7" /></div>
			<div>
				<div class="shelf-acard-type" :style="{ color: color.text }">{{ artifact.category || "Other" }}</div>
				<div class="shelf-muted" style="font-size: 11px">{{ artifact.app }} · <span class="shelf-mono" style="font-size: 11px">v{{ artifact.version }}</span></div>
			</div>
		</div>
		<div>
			<div class="shelf-acard-title">{{ artifact.title }}</div>
			<div class="shelf-acard-desc">{{ artifact.description }}</div>
		</div>
		<div class="shelf-acard-stats">
			<span v-if="artifact.installs != null"><Icon name="download" :size="13" />{{ artifact.installs }}</span>
			<span v-if="artifact.updated"><Icon name="clock" :size="13" />{{ shortDate(artifact.updated) }}</span>
			<span><Icon name="docs" :size="13" />{{ artifact.documents_count }} doc{{ artifact.documents_count === 1 ? "" : "s" }}</span>
			<span v-if="artifact.files_count"><Icon name="file" :size="13" />{{ artifact.files_count }} file{{ artifact.files_count === 1 ? "" : "s" }}</span>
			<span><Icon name="input" :size="13" />{{ artifact.inputs_count }} input{{ artifact.inputs_count === 1 ? "" : "s" }}</span>
		</div>
		<div class="shelf-acard-foot">
			<StateLine :artifact="artifact" />
			<StateAction :artifact="artifact" @install="$emit('install')" />
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
	name: "ArtifactCard",
	components: { Icon, StateLine, StateAction },
	props: { artifact: { type: Object, required: true } },
	emits: ["open", "install"],
	computed: {
		icon() {
			return categoryIcon(this.artifact.category);
		},
		color() {
			return categoryStyle(this.artifact.category);
		},
	},
	methods: { shortDate },
};
</script>

<style>
.shelf-acard { position: relative; display: flex; flex-direction: column; gap: 10px; padding: 16px; cursor: pointer; transition: border-color .12s, box-shadow .12s; }
.shelf-acard:hover { border-color: var(--g300); box-shadow: 0 1px 2px rgba(0,0,0,.06); }
.shelf-acard-dot { position: absolute; top: 14px; right: 14px; width: 8px; height: 8px; border-radius: 999px; background: var(--blue500); }
.shelf-acard-head { display: flex; align-items: center; gap: 10px; }
.shelf-type-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.shelf-acard-type { font-size: 12px; font-weight: 500; }
.shelf-acard-title { font-size: 15px; font-weight: 600; color: var(--g900); line-height: 1.3; margin-bottom: 4px; }
.shelf-acard-desc { font-size: 13px; color: var(--g600); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 38px; }
.shelf-acard-stats { display: flex; align-items: center; gap: 14px; padding: 10px 0; border-top: 1px solid var(--g200); border-bottom: 1px solid var(--g200); font-size: 12px; color: var(--g600); flex-wrap: wrap; }
.shelf-acard-stats span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.shelf-acard-stats svg { color: var(--g500); }
.shelf-acard-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
</style>
