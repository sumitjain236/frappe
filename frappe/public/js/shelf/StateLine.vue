<template>
	<span class="shelf-muted shelf-stateline">
		<template v-if="artifact.state === 'update'">
			You have <span class="shelf-mono">{{ artifact.installed_version }}</span> · <span class="is-new">{{ artifact.version }} available</span>
		</template>
		<template v-else-if="artifact.state === 'installed'">Up to date · <span class="shelf-mono">{{ artifact.installed_version }}</span></template>
		<template v-else-if="artifact.state === 'attention'"><span class="is-red">Needs attention</span> · <span class="shelf-mono">{{ artifact.installed_version }}</span></template>
		<template v-else-if="requirement">Requires {{ requirement }}</template>
		<template v-else>No requirements</template>
	</span>
</template>

<script>
export default {
	name: "StateLine",
	props: { artifact: { type: Object, required: true } },
	computed: {
		requirement() {
			const req = this.artifact.requires || [];
			if (!req.length) return "";
			return req.map((r) => (r.min_version ? `${r.app} ≥ ${r.min_version.split(".")[0]}` : r.app)).join(", ");
		},
	},
};
</script>

<style>
.shelf-stateline .is-new { color: var(--blue600); font-weight: 500; }
.shelf-stateline .is-red { color: var(--red600); font-weight: 500; }
</style>
