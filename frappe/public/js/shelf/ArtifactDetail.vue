<template>
	<div class="shelf-page shelf-detail">
		<div class="shelf-detail-bar">
			<button class="shelf-btn shelf-btn-ghost" @click="$emit('back')"><Icon name="arrow-left" :size="14" />{{ source.title }}</button>
			<div v-if="data" class="shelf-detail-actions">
				<a class="shelf-btn shelf-btn-ghost" :href="data.folder_url" target="_blank" rel="noopener"><Icon name="external" :size="14" />View in repo</a>
				<button v-if="artifact.state === 'installed'" class="shelf-btn shelf-btn-ghost shelf-btn-danger" :disabled="removing" @click="uninstall"><Icon name="trash" :size="14" />Uninstall</button>
				<StateAction v-if="artifact.state !== 'installed'" :artifact="artifact" @install="$emit('install', source, artifact)" />
				<button v-else class="shelf-btn shelf-btn-outline" @click="$emit('install', source, artifact)"><Icon name="refresh" :size="14" />Reinstall</button>
			</div>
		</div>

		<div v-if="error" class="shelf-notice is-red"><Icon name="alert" :size="16" /><span>{{ error }}</span></div>
		<div v-else-if="!data" class="shelf-empty"><Icon name="loader" :size="20" class="shelf-spin" /></div>

		<div v-else class="shelf-detail-body">
			<div class="shelf-detail-main">
				<div class="shelf-detail-head">
					<div class="shelf-type-icon shelf-type-icon-lg" :style="{ background: color.bg, color: color.fg }"><Icon :name="icon" :size="26" /></div>
					<div class="shelf-detail-headtext">
						<h1>{{ artifact.title }}</h1>
						<div class="shelf-detail-meta">
							<span class="shelf-badge">{{ artifact.category || "Other" }}</span>
							<span class="shelf-badge">{{ artifact.app }}</span>
							<span class="shelf-badge shelf-mono">v{{ artifact.version }}</span>
							<span v-if="artifact.updated" class="shelf-muted">Updated {{ longDate(artifact.updated) }}</span>
							<span v-if="artifact.license" class="shelf-muted">· {{ artifact.license }}</span>
						</div>
						<div class="shelf-detail-pub">
							<span class="shelf-avatar-sm">{{ (data.source.publisher_name || source.title || "?")[0] }}</span>
							<span>{{ data.source.publisher_name || source.title }}</span>
							<span v-if="data.source.access === 'Public'" class="shelf-badge"><Icon name="globe" :size="12" />Public</span>
							<span v-else class="shelf-badge is-orange"><Icon name="lock" :size="12" />Private</span>
						</div>
					</div>
				</div>

				<div class="shelf-tabs-row">
					<button v-for="t in tabs" :key="t.id" class="shelf-tabbtn" :class="{ 'is-active': tab === t.id }" @click="tab = t.id">{{ t.label }}</button>
				</div>

				<div v-if="tab === 'overview'" class="shelf-detail-section">
					<div v-if="data.readme_html" class="shelf-readme" v-html="data.readme_html"></div>
					<p v-else class="shelf-detail-desc">{{ artifact.description }}</p>
					<div v-if="artifact.tags && artifact.tags.length" class="shelf-tags">
						<span v-for="tag in artifact.tags" :key="tag" class="shelf-badge">{{ tag }}</span>
					</div>
				</div>

				<div v-if="tab === 'installs'" class="shelf-detail-section">
					<div class="shelf-card">
						<div class="shelf-list-head"><span>What gets installed on this site</span><span class="shelf-muted">{{ planSummary }}</span></div>
						<div v-if="!plan && !planError" class="shelf-list-row shelf-muted"><Icon name="loader" :size="14" class="shelf-spin" /> Reading the package…</div>
						<div v-else-if="planError" class="shelf-list-row"><Icon name="alert" :size="16" style="color: var(--red600)" /><span>{{ planError }}</span></div>
						<div v-for="step in plan ? plan.steps : []" :key="step.sequence" class="shelf-list-row">
							<div class="shelf-type-icon shelf-type-icon-sm" style="background: var(--g100); color: var(--g700)"><Icon :name="step.type === 'file' ? 'file' : docIcon(step.doctype)" :size="15" /></div>
							<div class="shelf-list-text">
								<div class="shelf-list-title">{{ step.type === 'file' ? step.file_name : step.name }}</div>
								<div class="shelf-muted">{{ step.type === 'file' ? (step.is_private ? 'Private file' : 'Public file') : step.doctype }}</div>
							</div>
							<span class="shelf-list-right" :class="stepClass(step)">{{ stepLabel(step) }}</span>
						</div>
					</div>
				</div>

				<div v-if="tab === 'history'" class="shelf-detail-section">
					<div class="shelf-card">
						<div class="shelf-list-head"><span>History on this site</span></div>
						<div v-if="!data.history.length" class="shelf-list-row shelf-muted">Never installed here.</div>
						<div v-for="log in data.history" :key="log.name" class="shelf-list-row">
							<Icon :name="log.status === 'Installed' ? 'check-circle' : log.status === 'Uninstalled' ? 'trash' : 'alert'" :size="16" :style="{ color: log.status === 'Installed' ? 'var(--green600)' : log.status === 'Uninstalled' ? 'var(--g500)' : 'var(--amber600)' }" />
							<div class="shelf-list-text">
								<div class="shelf-list-title"><span class="shelf-mono">{{ log.version }}</span> · {{ log.status }}<span v-if="log.is_current" class="shelf-badge is-green" style="margin-left: 8px">Current</span></div>
								<div class="shelf-muted">{{ longDate(log.installed_on || log.creation) }} · {{ log.installed_by }}<template v-if="log.error"> · {{ log.error }}</template></div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div class="shelf-detail-rail">
				<div class="shelf-card shelf-rail-card">
					<div class="shelf-rail-title">Requirements</div>
					<div v-if="!plan" class="shelf-muted">{{ requirementFallback }}</div>
					<div v-for="req in plan ? plan.requirements : []" :key="req.app" class="shelf-req" :class="{ 'is-bad': !req.ok }">
						<Icon :name="req.ok ? 'check-circle' : 'alert'" :size="16" />
						<span>{{ req.app }}<template v-if="req.min_version"> ≥ {{ req.min_version }}</template></span>
						<span class="shelf-muted">{{ req.installed_version || "not installed" }}</span>
					</div>
					<div v-if="plan && !plan.requirements.length" class="shelf-muted">None beyond Frappe.</div>
				</div>

				<div v-if="!plan || plan.inputs.length" class="shelf-card shelf-rail-card">
					<div class="shelf-rail-title">You will be asked for</div>
					<div v-if="!plan" class="shelf-muted">{{ artifact.inputs_count }} input{{ artifact.inputs_count === 1 ? "" : "s" }}</div>
					<div v-for="input in plan ? plan.inputs : []" :key="input.key" class="shelf-kv">
						<span>{{ input.label }}</span><span>{{ input.fieldtype }}<template v-if="input.options"> · {{ input.options }}</template> · {{ input.mandatory ? "required" : "optional" }}</span>
					</div>
					<div class="shelf-muted">Answers only stay on this site.</div>
				</div>

				<div class="shelf-card shelf-rail-card">
					<div class="shelf-rail-title">Source</div>
					<div class="shelf-kv"><span>Repository</span><span class="shelf-mono">{{ data.source.repo }}</span></div>
					<div class="shelf-kv"><span>Branch</span><span class="shelf-mono">{{ data.source.branch }}</span></div>
					<div class="shelf-kv"><span>Package</span><span class="shelf-mono" :title="artifact.package_hash">sha256 · {{ artifact.package_hash.slice(0, 7) }}…{{ artifact.package_hash.slice(-4) }}</span></div>
					<div class="shelf-kv"><span>Contains</span><span>{{ artifact.documents_count }} doc{{ artifact.documents_count === 1 ? "" : "s" }}<template v-if="artifact.files_count">, {{ artifact.files_count }} file{{ artifact.files_count === 1 ? "" : "s" }}</template></span></div>
					<div v-if="links.length" class="shelf-links"><a v-for="l in links" :key="l.label" :href="l.url" target="_blank" rel="noopener">{{ l.label }}</a></div>
				</div>

				<div class="shelf-card shelf-rail-card">
					<div class="shelf-rail-title">On this site</div>
					<template v-if="artifact.installed_version">
						<div class="shelf-kv"><span>Installed</span><span><span class="shelf-mono">{{ artifact.installed_version }}</span> on {{ longDate(artifact.installed_on) }}</span></div>
						<div class="shelf-kv"><span>Status</span><span>{{ stateLabel }}</span></div>
						<button v-if="artifact.state === 'update'" class="shelf-btn shelf-btn-outline shelf-btn-md" style="width: 100%; margin-top: 6px" @click="$emit('install', source, artifact)"><Icon name="refresh" :size="14" />Update to {{ artifact.version }}</button>
					</template>
					<template v-else>
						<div class="shelf-muted">Not installed.</div>
						<button class="shelf-btn shelf-btn-solid shelf-btn-md" style="width: 100%; margin-top: 6px" @click="$emit('install', source, artifact)"><Icon name="download" :size="14" />Install {{ artifact.version }}</button>
					</template>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import Icon from "./Icon.vue";
import StateAction from "./StateAction.vue";
import { shelf } from "./api.js";
import { categoryIcon, categoryStyle } from "./icons.js";
import { longDate } from "./format.js";

const DOC_ICON = { Report: "report", "Dashboard Chart": "dashboard", Dashboard: "dashboard", "Number Card": "workspace", "Print Format": "print", "Server Script": "script", Workspace: "workspace", "Letter Head": "print" };

export default {
	name: "ArtifactDetail",
	components: { Icon, StateAction },
	props: {
		source: { type: Object, required: true },
		artifactId: { type: String, required: true },
		version: { type: Number, default: 0 },
	},
	emits: ["back", "install", "uninstalled"],
	watch: {
		version() {
			this.load();
		},
	},
	data() {
		return { data: null, plan: null, planError: "", error: "", tab: "overview", removing: false };
	},
	computed: {
		artifact() {
			return this.data ? this.data.artifact : {};
		},
		icon() {
			return categoryIcon(this.artifact.category);
		},
		color() {
			return categoryStyle(this.artifact.category);
		},
		tabs() {
			return [
				{ id: "overview", label: "Overview" },
				{ id: "installs", label: "What gets installed" },
				{ id: "history", label: "History" },
			];
		},
		links() {
			const l = this.artifact.links || {};
			return [["Documentation", l.documentation], ["Support", l.support], ["Website", l.website]].filter(([, url]) => url).map(([label, url]) => ({ label, url }));
		},
		requirementFallback() {
			const req = this.artifact.requires || [];
			return req.length ? req.map((r) => `${r.app}${r.min_version ? " ≥ " + r.min_version : ""}`).join(", ") : "None beyond Frappe.";
		},
		planSummary() {
			if (!this.plan) return "";
			const docs = this.plan.steps.filter((s) => s.type === "document").length;
			const files = this.plan.steps.length - docs;
			return `${docs} document${docs === 1 ? "" : "s"}${files ? `, ${files} file${files === 1 ? "" : "s"}` : ""}`;
		},
		stateLabel() {
			return { installed: "Up to date", update: `${this.artifact.version} available`, attention: "Needs attention" }[this.artifact.state] || "";
		},
	},
	created() {
		this.load();
	},
	methods: {
		longDate,
		async load() {
			try {
				this.data = await shelf.artifact(this.source.name, this.artifactId);
				this.error = "";
			} catch (e) {
				this.error = e.message;
				return;
			}
			try {
				this.plan = await shelf.plan(this.source.name, this.artifactId);
				this.planError = "";
			} catch (e) {
				this.plan = null;
				this.planError = e.message;
			}
		},
		docIcon(doctype) {
			return DOC_ICON[doctype] || "docs";
		},
		stepLabel(step) {
			if (step.type === "file") return "Upload";
			if (step.needs_decision) return "Already exists here";
			return { created: "New", replaced: step.owned ? "Update ours" : "Replace", skipped: "Keep existing", copied: `Copy as ${step.copy_name}` }[step.action] || step.action;
		},
		stepClass(step) {
			return step.needs_decision ? "is-warn" : step.action === "created" ? "" : "is-info";
		},
		async uninstall() {
			if (!window.confirm(`Uninstall ${this.artifact.title}? Documents and files it created on this site will be deleted.`)) return;
			this.removing = true;
			try {
				await shelf.uninstall(this.source.name, this.artifactId);
				this.$emit("uninstalled");
				await this.load();
			} catch (e) {
				this.error = e.message;
			} finally {
				this.removing = false;
			}
		},
	},
};
</script>

<style>
.shelf-detail-bar { display: flex; align-items: center; justify-content: space-between; }
.shelf-detail-actions { display: flex; gap: 8px; }
.shelf-detail-body { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 24px; align-items: start; }
.shelf-detail-main { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.shelf-detail-head { display: flex; gap: 16px; align-items: flex-start; }
.shelf-type-icon-lg { width: 56px; height: 56px; border-radius: 12px; }
.shelf-detail-headtext { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.shelf-detail-headtext h1 { margin: 0; font-size: 20px; font-weight: 600; color: var(--g900); line-height: 1.3; }
.shelf-detail-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.shelf-detail-pub { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--g800); }
.shelf-avatar-sm { width: 20px; height: 20px; border-radius: 999px; background: var(--g900); color: #fff; font-size: 10px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; }
.shelf-tabs-row { display: flex; gap: 20px; border-bottom: 1px solid var(--g200); }
.shelf-tabbtn { padding: 0 2px 10px; border: 0; background: none; font-size: 14px; color: var(--g600); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.shelf-tabbtn.is-active { color: var(--g900); font-weight: 500; border-bottom-color: var(--g900); }
.shelf-detail-section { display: flex; flex-direction: column; gap: 12px; max-width: 760px; }
.shelf-detail-desc { margin: 0; color: var(--g800); line-height: 1.6; }
.shelf-readme { color: var(--g800); line-height: 1.6; }
.shelf-readme h1, .shelf-readme h2, .shelf-readme h3 { color: var(--g900); font-weight: 600; margin: 16px 0 8px; }
.shelf-readme h1 { font-size: 18px; } .shelf-readme h2 { font-size: 16px; } .shelf-readme h3 { font-size: 14px; }
.shelf-readme p { margin: 0 0 10px; } .shelf-readme code { font-family: var(--mono); font-size: 12px; background: var(--g100); padding: 1px 4px; border-radius: 4px; }
.shelf-readme pre { background: var(--g100); padding: 10px 12px; border-radius: 8px; overflow: auto; }
.shelf-readme img { max-width: 100%; }
.shelf-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.shelf-list-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: var(--g50); border-bottom: 1px solid var(--g200); border-radius: 12px 12px 0 0; font-size: 13px; font-weight: 500; color: var(--g800); }
.shelf-list-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-bottom: 1px solid var(--g200); }
.shelf-list-row:last-child { border-bottom: 0; }
.shelf-list-text { flex: 1; min-width: 0; }
.shelf-list-title { font-size: 14px; font-weight: 500; color: var(--g900); }
.shelf-list-right { font-size: 12px; color: var(--g500); white-space: nowrap; }
.shelf-list-right.is-warn { color: var(--amber600); }
.shelf-list-right.is-info { color: var(--g700); }
.shelf-detail-rail { display: flex; flex-direction: column; gap: 16px; }
.shelf-rail-card { display: flex; flex-direction: column; gap: 8px; padding: 16px; }
.shelf-rail-title { font-size: 13px; font-weight: 600; color: var(--g900); margin-bottom: 2px; }
.shelf-req { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--g800); }
.shelf-req svg { color: var(--green600); }
.shelf-req.is-bad svg { color: var(--red600); }
.shelf-req .shelf-muted { margin-left: auto; }
.shelf-links { display: flex; gap: 12px; font-size: 13px; margin-top: 4px; }
@media (max-width: 960px) { .shelf-detail-body { grid-template-columns: 1fr; } }
</style>
