<template>
	<div class="shelf">
		<TopBar :sources="sources" :active="activeSource" @select="goToSource" />

		<div v-if="loadingSources" class="shelf-empty">
			<Icon name="loader" :size="20" class="shelf-spin" />
		</div>

		<div v-else-if="!sources.length" class="shelf-empty">
			<div class="shelf-empty-icon"><Icon name="shelf" :size="24" /></div>
			<div class="shelf-empty-title">No shelves connected yet</div>
			<div class="shelf-empty-text">
				Connect a git repository that holds Shelf artifacts. Public repositories need no credentials;
				private ones take an access token.
			</div>
			<button class="shelf-btn shelf-btn-solid shelf-btn-md" @click="addSource">Connect a repository</button>
		</div>

		<ArtifactDetail
			v-else-if="route.artifact && activeSource"
			:key="route.source + '/' + route.artifact"
			:source="activeSource"
			:artifact-id="route.artifact"
			:version="refreshTick"
			@back="goToSource(activeSource.name)"
			@install="openDialog"
			@uninstalled="refreshAll"
		/>

		<DomainView
			v-else-if="activeSource"
			:key="activeSource.name"
			:source="activeSource"
			:catalog="catalogs[activeSource.name]"
			:loading="loadingCatalog"
			:updates="updates"
			:busy="checking"
			@open="goToArtifact"
			@install="openDialog"
			@sync="syncSource"
			@check-all="checkAll"
			@open-update="openFromUpdate"
			@update-all="updateAll"
		/>

		<InstallDialog
			v-if="dialog"
			:source="dialog.source"
			:artifact="dialog.artifact"
			@close="closeDialog"
			@done="onInstalled"
		/>

		<div v-if="toast" class="shelf-toast" :class="'is-' + toast.kind">{{ toast.text }}</div>
	</div>
</template>

<script>
import Icon from "./Icon.vue";
import TopBar from "./TopBar.vue";
import DomainView from "./DomainView.vue";
import ArtifactDetail from "./ArtifactDetail.vue";
import InstallDialog from "./InstallDialog.vue";
import { shelf } from "./api.js";

export default {
	name: "ShelfApp",
	components: { Icon, TopBar, DomainView, ArtifactDetail, InstallDialog },
	data() {
		return {
			sources: [],
			catalogs: {},
			route: { source: null, artifact: null },
			loadingSources: true,
			loadingCatalog: false,
			checking: false,
			dialog: null,
			toast: null,
			refreshTick: 0,
		};
	},
	computed: {
		activeSource() {
			return this.sources.find((s) => s.name === this.route.source) || this.sources[0] || null;
		},
		updates() {
			const rows = [];
			for (const source of this.sources) {
				const catalog = this.catalogs[source.name];
				if (!catalog) continue;
				for (const artifact of catalog.artifacts) {
					if (artifact.state === "update") rows.push({ source, artifact });
				}
			}
			const known = rows.length;
			const counted = this.sources.reduce((n, s) => n + (s.updates_count || 0), 0);
			return { rows, count: Math.max(known, counted) };
		},
	},
	async created() {
		this.readRoute();
		await this.loadSources();
		this.loadingSources = false;
		if (!this.route.source && this.sources.length) this.route = { source: this.sources[0].name, artifact: null };
		this.loadCatalog(this.activeSource);
		// Warm the catalogs that have pending updates so the Updates popover is complete.
		this.sources.filter((s) => s.updates_count && s !== this.activeSource).forEach((s) => this.loadCatalog(s));
	},
	watch: {
		activeSource(source) {
			if (source) this.loadCatalog(source);
		},
	},
	methods: {
		readRoute() {
			// The Desk route stays /desk/shelf; the app's own position lives in the query string.
			const q = frappe.utils.get_query_params() || {};
			this.route = { source: q.s || null, artifact: q.a || null };
		},
		goToSource(name) {
			frappe.set_route("shelf", { s: name });
			this.route = { source: name, artifact: null };
		},
		goToArtifact(source, artifactId) {
			frappe.set_route("shelf", { s: source.name, a: artifactId });
			this.route = { source: source.name, artifact: artifactId };
		},
		addSource() {
			shelf.newSource();
		},
		async loadSources() {
			try {
				this.sources = await shelf.sources();
			} catch (e) {
				this.showToast(e.message, "error");
			}
		},
		async loadCatalog(source, force = false) {
			if (!source) return;
			if (this.catalogs[source.name] && !force) return;
			this.loadingCatalog = true;
			try {
				this.catalogs[source.name] = await shelf.catalog(source.name);
			} catch (e) {
				this.showToast(e.message, "error");
			} finally {
				this.loadingCatalog = false;
			}
		},
		async refreshAll() {
			this.refreshTick += 1;
			await this.loadSources();
			for (const name of Object.keys(this.catalogs)) {
				const source = this.sources.find((s) => s.name === name);
				if (source) await this.loadCatalog(source, true);
			}
		},
		async syncSource(source) {
			try {
				const result = await shelf.sync(source.name, true);
				this.showToast(result.changed ? `Synced ${result.artifact_count} artifacts` : "Already up to date");
				await this.refreshAll();
			} catch (e) {
				this.showToast(e.message, "error");
			}
		},
		async checkAll() {
			this.checking = true;
			let failures = 0;
			for (const source of this.sources) {
				if (source.connection_status !== "Connected") continue;
				try {
					await shelf.sync(source.name, false);
				} catch (e) {
					failures += 1;
				}
			}
			await this.refreshAll();
			this.checking = false;
			this.showToast(failures ? `${failures} source(s) could not be checked` : "All sources checked", failures ? "error" : "ok");
		},
		openDialog(source, artifact) {
			this.dialog = { source, artifact };
		},
		closeDialog() {
			this.dialog = null;
		},
		async onInstalled() {
			await this.refreshAll();
		},
		openFromUpdate(row) {
			this.openDialog(row.source, row.artifact);
		},
		async updateAll() {
			// Updates reuse stored inputs and replace documents we own, so most run without a dialog.
			const pending = [...this.updates.rows];
			let done = 0;
			for (const row of pending) {
				try {
					const result = await shelf.install(row.source.name, row.artifact.artifact_id, {}, {});
					if (result.status === "needs_decision" || result.status !== "Installed") {
						this.openDialog(row.source, row.artifact);
						break;
					}
					done += 1;
				} catch (e) {
					this.showToast(`${row.artifact.title}: ${e.message}`, "error");
					break;
				}
			}
			await this.refreshAll();
			if (done) this.showToast(`Updated ${done} artifact${done === 1 ? "" : "s"}`);
		},
		showToast(text, kind = "ok") {
			this.toast = { text, kind };
			clearTimeout(this._toastTimer);
			this._toastTimer = setTimeout(() => (this.toast = null), 3500);
		},
	},
};
</script>

<style>
/* frappe-ui light tokens */
.shelf {
	--g50: #f8f8f8; --g100: #f3f3f3; --g200: #ededed; --g300: #e2e2e2; --g400: #c7c7c7;
	--g500: #999999; --g600: #7c7c7c; --g700: #525252; --g800: #383838; --g900: #171717;
	--blue50: #f2f9ff; --blue100: #e6f4ff; --blue500: #0289f7; --blue600: #007be0;
	--green100: #e4faeb; --green600: #278f5e; --red50: #fff7f7; --red100: #ffe7e7; --red600: #cc2929;
	--amber50: #fdfaed; --amber100: #fff7d3; --amber600: #db7706;
	--mono: ui-monospace, SFMono-Regular, Menlo, monospace;
	font-family: Inter, InterVariable, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
	font-size: 14px; line-height: 1.5; letter-spacing: 0.01em; color: var(--g800);
	background: #fff; min-height: calc(100vh - var(--navbar-height, 60px)); -webkit-font-smoothing: antialiased;
	margin: 0 calc(-1 * var(--padding-md, 15px)); /* full-bleed inside the Desk page body */
}
/* Desk stylesheet resets that would otherwise leak into the app */
.shelf label { margin: 0; font-weight: inherit; }
.shelf input, .shelf select, .shelf button { box-shadow: none; }
.shelf input:focus, .shelf select:focus { outline: none; box-shadow: none; }
.shelf h1, .shelf p, .shelf ul { margin-top: 0; }
.shelf svg { vertical-align: middle; }
.shelf *, .shelf *::before, .shelf *::after { box-sizing: border-box; }
.shelf a { color: var(--blue600); text-decoration: none; }
.shelf a:hover { color: var(--blue500); }
.shelf button { font: inherit; letter-spacing: inherit; cursor: pointer; }
.shelf input, .shelf select { font: inherit; letter-spacing: inherit; }
.shelf-mono { font-family: var(--mono); font-size: 12px; letter-spacing: 0; }

/* buttons */
.shelf-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 8px; font-size: 13px; font-weight: 500; line-height: 1; white-space: nowrap; border: 1px solid transparent; background: transparent; color: var(--g800); text-decoration: none; }
.shelf-btn:disabled { opacity: 0.5; cursor: default; }
.shelf-btn-md { height: 32px; font-size: 14px; }
.shelf-btn-solid { background: var(--g900); border-color: var(--g900); color: #fff; }
.shelf-btn-solid:hover:not(:disabled) { background: var(--g800); }
.shelf-btn-subtle { background: var(--g100); border-color: var(--g100); color: var(--g800); }
.shelf-btn-subtle:hover:not(:disabled) { background: var(--g200); }
.shelf-btn-outline { background: #fff; border-color: var(--g300); }
.shelf-btn-outline:hover:not(:disabled) { border-color: var(--g400); }
.shelf-btn-ghost:hover:not(:disabled) { background: var(--g200); }
.shelf-btn-danger { color: var(--red600); }
.shelf-btn-danger:hover:not(:disabled) { background: var(--red100); }

/* badges, chips, inputs */
.shelf-badge { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 8px; border-radius: 999px; font-size: 12px; font-weight: 450; line-height: 1; white-space: nowrap; background: var(--g100); color: var(--g700); }
.shelf-badge.is-blue { background: var(--blue50); color: var(--blue600); }
.shelf-badge.is-green { background: var(--green100); color: var(--green600); }
.shelf-badge.is-orange { background: var(--amber50); color: var(--amber600); }
.shelf-badge.is-red { background: var(--red100); color: var(--red600); }
.shelf-chip { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--g300); background: #fff; color: var(--g700); font-size: 13px; }
.shelf-chip span { color: var(--g500); }
.shelf-chip.is-active { background: var(--g900); border-color: var(--g900); color: #fff; }
.shelf-chip.is-active span { color: var(--g300); }
.shelf-input { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px; border-radius: 8px; background: var(--g100); border: 1px solid var(--g200); color: var(--g900); }
.shelf-input:hover { border-color: var(--g300); }
.shelf-input:focus-within { border-color: var(--g400); background: #fff; }
.shelf-input input, .shelf-input select { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--g900); height: 100%; }
.shelf-input input::placeholder { color: var(--g500); }
.shelf-select { height: 28px; padding: 0 28px 0 10px; border-radius: 8px; border: 1px solid var(--g200); background: var(--g100) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%237c7c7c' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>") no-repeat right 8px center; color: var(--g900); font-size: 13px; appearance: none; }

/* layout */
.shelf-page { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
.shelf-card { background: #fff; border: 1px solid var(--g200); border-radius: 12px; }
.shelf-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 96px 24px; text-align: center; max-width: 520px; margin: 0 auto; }
.shelf-viewtoggle { border: 1px solid var(--g200); }
.shelf-empty-icon { width: 44px; height: 44px; border-radius: 12px; background: var(--g100); display: flex; align-items: center; justify-content: center; color: var(--g800); }
.shelf-empty-title { font-size: 16px; font-weight: 600; color: var(--g900); }
.shelf-empty-text { color: var(--g600); margin-bottom: 8px; }
.shelf-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); padding: 10px 14px; border-radius: 10px; background: var(--g900); color: #fff; font-size: 13px; box-shadow: 0 6px 15px -5px rgba(0,0,0,.2); z-index: 60; }
.shelf-toast.is-error { background: var(--red600); }
.shelf-spin { animation: shelf-spin 1s linear infinite; }
@keyframes shelf-spin { to { transform: rotate(360deg); } }
.shelf-muted { color: var(--g600); font-size: 12px; }
.shelf-kv { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
.shelf-kv span:first-child { color: var(--g600); }
.shelf-kv span:last-child { color: var(--g900); text-align: right; }
</style>
