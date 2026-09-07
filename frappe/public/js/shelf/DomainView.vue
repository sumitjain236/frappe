<template>
	<div class="shelf-page">
		<div class="shelf-card shelf-strip">
			<div class="shelf-stat"><b>{{ stats.total }}</b><span>artifacts</span></div>
			<div class="shelf-stat"><b>{{ stats.installed }}</b><span>installed here</span></div>
			<div class="shelf-stat"><b :class="{ 'is-blue': stats.updates }">{{ stats.updates }}</b><span>updates</span></div>
			<div class="shelf-stat"><b :class="{ 'is-red': stats.attention }">{{ stats.attention }}</b><span>need attention</span></div>
			<div class="shelf-strip-right">
				<div class="shelf-repo">
					<Icon name="git-commit" :size="13" />
					<a class="shelf-mono" :href="source.repo_url" target="_blank" rel="noopener">{{ repoSlug }}</a>
					<span>· {{ source.branch }} · {{ synced }}</span>
				</div>
				<span v-if="source.access === 'Private'" class="shelf-badge is-orange"><Icon name="lock" :size="12" />Private</span>
				<span v-else class="shelf-badge"><Icon name="globe" :size="12" />Public</span>
				<UpdatesMenu :updates="updates" :busy="busy" @check-all="$emit('check-all')" @open-update="(row) => $emit('open-update', row)" @update-all="$emit('update-all')" />
				<button class="shelf-btn shelf-btn-outline" :disabled="syncing" @click="sync"><Icon name="refresh" :size="14" :class="{ 'shelf-spin': syncing }" />Sync</button>
			</div>
		</div>

		<div v-if="source.connection_status !== 'Connected'" class="shelf-notice is-red">
			<Icon name="alert" :size="16" />
			<span><b>Not connected.</b> {{ source.connection_message || "Check the connection on the Shelf Source." }}</span>
			<button class="shelf-btn shelf-btn-outline" @click="openSource">Open source</button>
		</div>
		<div v-else-if="source.last_sync_error" class="shelf-notice is-red">
			<Icon name="alert" :size="16" />
			<span><b>Last sync failed.</b> {{ source.last_sync_error }}</span>
		</div>

		<div class="shelf-filters">
			<label class="shelf-input shelf-search">
				<Icon name="search" :size="16" />
				<input v-model="query" type="search" placeholder="Search this domain…" />
			</label>
			<button class="shelf-chip" :class="{ 'is-active': state === 'installed' }" @click="toggleState('installed')">Installed <span>{{ stats.installed }}</span></button>
			<button class="shelf-chip" :class="{ 'is-active': state === 'update' }" @click="toggleState('update')">Updates <span>{{ stats.updates }}</span></button>
			<button v-if="stats.attention" class="shelf-chip" :class="{ 'is-active': state === 'attention' }" @click="toggleState('attention')">Attention <span>{{ stats.attention }}</span></button>
			<div class="shelf-filters-right">
				<select v-model="category" class="shelf-select">
					<option value="">All types ({{ counts.all }})</option>
					<option v-for="cat in categories" :key="cat" :value="cat">{{ cat }} ({{ counts.byCategory[cat] }})</option>
				</select>
				<select v-model="sort" class="shelf-select">
					<option value="installs">Most installed</option>
					<option value="updated">Recently updated</option>
					<option value="title">Name</option>
				</select>
				<div class="shelf-viewtoggle">
					<button :class="{ 'is-active': view === 'cards' }" title="Cards" @click="setView('cards')"><Icon name="grid" :size="15" /></button>
					<button :class="{ 'is-active': view === 'table' }" title="Table" @click="setView('table')"><Icon name="list" :size="15" /></button>
				</div>
			</div>
		</div>

		<div v-if="loading && !catalog" class="shelf-empty"><Icon name="loader" :size="20" class="shelf-spin" /></div>

		<div v-else-if="!rows.length" class="shelf-empty">
			<div class="shelf-empty-title">{{ stats.total ? "Nothing matches these filters." : "This shelf has no artifacts yet." }}</div>
			<div class="shelf-empty-text">{{ stats.total ? "Clear the search or pick another type." : "Sync the source, or check that the repository has an index.json." }}</div>
		</div>

		<div v-else-if="view === 'cards'" class="shelf-grid">
			<ArtifactCard v-for="row in rows" :key="row.name" :artifact="row" @open="$emit('open', source, row.artifact_id)" @install="$emit('install', source, row)" />
		</div>

		<ArtifactTable v-else :rows="rows" @open="(row) => $emit('open', source, row.artifact_id)" @install="(row) => $emit('install', source, row)" />
	</div>
</template>

<script>
import Icon from "./Icon.vue";
import ArtifactCard from "./ArtifactCard.vue";
import ArtifactTable from "./ArtifactTable.vue";
import UpdatesMenu from "./UpdatesMenu.vue";
import { shelf } from "./api.js";

export default {
	name: "DomainView",
	components: { Icon, ArtifactCard, ArtifactTable, UpdatesMenu },
	props: {
		source: { type: Object, required: true },
		catalog: { type: Object, default: null },
		loading: { type: Boolean, default: false },
		updates: { type: Object, default: () => ({ rows: [], count: 0 }) },
		busy: { type: Boolean, default: false },
	},
	emits: ["open", "install", "sync", "check-all", "open-update", "update-all"],
	data() {
		let view = "cards";
		try {
			view = localStorage.getItem("shelf:view") || "cards";
		} catch (e) {
			/* private mode */
		}
		return { query: "", category: "", state: "", sort: "installs", view, syncing: false };
	},
	computed: {
		artifacts() {
			return (this.catalog && this.catalog.artifacts) || [];
		},
		stats() {
			return (this.catalog && this.catalog.stats) || { total: 0, installed: 0, updates: 0, attention: 0 };
		},
		categories() {
			// Whatever categories this domain's index declares; nothing is assumed.
			return [...new Set(this.artifacts.map((a) => a.category || "Other"))].sort();
		},
		counts() {
			const byCategory = {};
			this.artifacts.forEach((a) => {
				const key = a.category || "Other";
				byCategory[key] = (byCategory[key] || 0) + 1;
			});
			return { all: this.artifacts.length, byCategory };
		},
		rows() {
			const q = this.query.trim().toLowerCase();
			let rows = this.artifacts.filter((a) => {
				if (this.category && (a.category || "Other") !== this.category) return false;
				if (this.state === "installed" && !["installed", "update"].includes(a.state)) return false;
				if (this.state === "update" && a.state !== "update") return false;
				if (this.state === "attention" && a.state !== "attention") return false;
				if (q) {
					const hay = `${a.title} ${a.description || ""} ${(a.tags || []).join(" ")} ${a.app || ""}`.toLowerCase();
					if (!hay.includes(q)) return false;
				}
				return true;
			});
			const by = {
				installs: (a, b) => (b.installs || 0) - (a.installs || 0) || a.title.localeCompare(b.title),
				updated: (a, b) => String(b.updated || "").localeCompare(String(a.updated || "")) || a.title.localeCompare(b.title),
				title: (a, b) => a.title.localeCompare(b.title),
			};
			return rows.sort(by[this.sort]);
		},
		repoSlug() {
			return (this.source.repo_url || "").replace(/^https?:\/\/(www\.)?github\.com\//, "");
		},
		synced() {
			if (!this.source.last_synced) return "never synced";
			const then = new Date(this.source.last_synced.replace(" ", "T"));
			const mins = Math.max(0, Math.round((Date.now() - then.getTime()) / 60000));
			if (mins < 1) return "synced just now";
			if (mins < 60) return `synced ${mins} min ago`;
			const hours = Math.round(mins / 60);
			if (hours < 24) return `synced ${hours} hr ago`;
			return `synced ${Math.round(hours / 24)} d ago`;
		},
	},
	methods: {
		openSource() {
			shelf.openSource(this.source.name);
		},
		toggleState(value) {
			this.state = this.state === value ? "" : value;
		},
		setView(value) {
			this.view = value;
			try {
				localStorage.setItem("shelf:view", value);
			} catch (e) {
				/* ignore */
			}
		},
		async sync() {
			this.syncing = true;
			try {
				await this.$emit("sync", this.source);
			} finally {
				this.syncing = false;
			}
		},
	},
};
</script>

<style>
.shelf-strip { display: flex; align-items: center; gap: 24px; padding: 14px 20px; background: var(--g50); }
.shelf-stat { display: flex; align-items: baseline; gap: 6px; white-space: nowrap; }
.shelf-stat b { font-size: 20px; font-weight: 600; color: var(--g900); letter-spacing: -0.02em; }
.shelf-stat b.is-blue { color: var(--blue600); }
.shelf-stat b.is-red { color: var(--red600); }
.shelf-stat span { font-size: 12px; color: var(--g600); }
.shelf-strip-right { margin-left: auto; display: flex; align-items: center; gap: 12px; min-width: 0; }
.shelf-repo { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--g600); min-width: 0; white-space: nowrap; }
.shelf-repo a { color: var(--g800); max-width: 320px; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; }
.shelf-notice { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; font-size: 13px; }
.shelf-notice.is-red { background: var(--red50); border: 1px solid var(--red100); color: var(--g800); }
.shelf-notice .shelf-btn { margin-left: auto; }
.shelf-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.shelf-search { width: 260px; height: 28px; }
.shelf-search input { height: 100%; padding: 0; margin: 0; -webkit-appearance: none; appearance: none; }
.shelf-search input::-webkit-search-decoration, .shelf-search input::-webkit-search-cancel-button { -webkit-appearance: none; }
.shelf-filters-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.shelf-viewtoggle { display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--g100); }
.shelf-viewtoggle button { width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: var(--g500); display: flex; align-items: center; justify-content: center; }
.shelf-viewtoggle button.is-active { background: #fff; color: var(--g800); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.shelf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
</style>
