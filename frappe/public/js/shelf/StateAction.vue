<template>
	<button v-if="artifact.state === 'update'" class="shelf-btn shelf-btn-solid" @click.stop="$emit('install')"><Icon name="refresh" :size="14" />Update</button>
	<span v-else-if="artifact.state === 'installed'" class="shelf-installed"><Icon name="check" :size="14" :stroke-width="2" />Installed</span>
	<button v-else-if="artifact.state === 'attention'" class="shelf-btn shelf-btn-outline" @click.stop="$emit('install')"><Icon name="refresh" :size="14" />Retry</button>
	<button v-else class="shelf-btn shelf-btn-subtle" @click.stop="$emit('install')"><Icon name="download" :size="14" />Install</button>
</template>

<script>
import Icon from "./Icon.vue";

export default {
	name: "StateAction",
	components: { Icon },
	props: { artifact: { type: Object, required: true } },
	emits: ["install"],
};
</script>

<style>
.shelf-installed { display: inline-flex; align-items: center; gap: 6px; height: 28px; font-size: 13px; color: var(--green600); }
</style>
