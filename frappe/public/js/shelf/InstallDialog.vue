<template>
	<div class="shelf-overlay" @mousedown.self="close">
		<div class="shelf-dialog">
			<div class="shelf-dialog-head">
				<span>{{ title }}</span>
				<button class="shelf-btn shelf-btn-ghost" style="padding: 0 6px" @click="close"><Icon name="x" :size="16" /></button>
			</div>

			<div class="shelf-dialog-body">
				<div class="shelf-steps">
					<template v-for="(s, i) in stepper" :key="s">
						<div class="shelf-step" :class="{ 'is-active': stage === s, 'is-done': stepIndex > i }">
							<span class="shelf-step-dot"><Icon v-if="stepIndex > i" name="check" :size="12" :stroke-width="2.5" /><template v-else>{{ i + 1 }}</template></span>{{ stepLabel(s) }}
						</div>
						<div v-if="i < stepper.length - 1" class="shelf-step-line"></div>
					</template>
				</div>

				<div class="shelf-dialog-artifact">
					<Icon :name="icon" :size="20" />
					<div>
						<div class="shelf-list-title">{{ artifact.title }} · <span class="shelf-mono">v{{ artifact.version }}</span></div>
						<div class="shelf-muted">{{ source.title }} · {{ artifact.documents_count }} document{{ artifact.documents_count === 1 ? "" : "s" }}<template v-if="artifact.files_count"> · {{ artifact.files_count }} file{{ artifact.files_count === 1 ? "" : "s" }}</template></div>
					</div>
				</div>

				<div v-if="loading" class="shelf-dialog-loading"><Icon name="loader" :size="18" class="shelf-spin" /> Reading the package from the repository…</div>
				<div v-else-if="fatal" class="shelf-notice is-red"><Icon name="alert" :size="16" /><span>{{ fatal }}</span></div>

				<template v-else-if="stage === 'inputs'">
					<p class="shelf-dialog-hint">The publisher marked these values as site-specific. They are filled into the documents before install and never leave this site.</p>
					<div v-for="input in plan.inputs" :key="input.key" class="shelf-field">
						<label>{{ input.label }}<span v-if="input.mandatory" class="is-req"> *</span></label>
						<LinkInput v-if="input.fieldtype === 'Link'" v-model="values[input.key]" :doctype="input.options" :placeholder="'Select ' + input.options" />
						<label v-else-if="input.fieldtype === 'Select'" class="shelf-input"><select v-model="values[input.key]"><option value="">Select…</option><option v-for="opt in selectOptions(input)" :key="opt" :value="opt">{{ opt }}</option></select></label>
						<label v-else-if="input.fieldtype === 'Check'" class="shelf-check"><input type="checkbox" :checked="!!values[input.key]" @change="values[input.key] = $event.target.checked ? 1 : 0" /> Yes</label>
						<label v-else class="shelf-input"><input v-model="values[input.key]" :type="input.fieldtype === 'Int' ? 'number' : input.fieldtype === 'Date' ? 'date' : 'text'" /></label>
						<div v-if="input.description" class="shelf-muted">{{ input.description }}</div>
					</div>
				</template>

				<template v-else-if="stage === 'review'">
					<div v-if="badRequirements.length" class="shelf-notice is-red">
						<Icon name="alert" :size="16" />
						<span><b>Missing on this site:</b> {{ badRequirements.map((r) => r.min_version ? `${r.app} ≥ ${r.min_version}` : r.app).join(", ") }}. Install them first.</span>
					</div>
					<div class="shelf-card">
						<div class="shelf-list-head"><span>{{ plan.mode === 'update' ? 'What changes on this site' : plan.mode === 'resume' ? 'Continuing where it stopped' : 'What gets installed on this site' }}</span><span class="shelf-muted">{{ plan.steps.length }} steps</span></div>
						<div v-for="step in plan.steps" :key="step.sequence" class="shelf-review-step">
							<div class="shelf-list-row" style="border-bottom: 0">
								<Icon :name="step.needs_decision ? 'alert' : step.type === 'file' ? 'file' : 'docs'" :size="16" :style="{ color: step.needs_decision ? 'var(--amber600)' : 'var(--g600)' }" />
								<div class="shelf-list-text">
									<div class="shelf-list-title">{{ step.type === 'file' ? step.file_name : step.name }}<span class="shelf-muted" style="font-weight: 420"> · {{ step.type === 'file' ? (step.is_private ? 'private file' : 'public file') : step.doctype }}</span></div>
									<div class="shelf-muted">{{ reviewNote(step) }}</div>
								</div>
							</div>
							<div v-if="step.needs_decision" class="shelf-choices">
								<label v-for="c in choices(step)" :key="c.value" class="shelf-choice" :class="{ 'is-on': conflicts[step.sequence] === c.value }">
									<input type="radio" :name="'c' + step.sequence" :value="c.value" v-model="conflicts[step.sequence]" />
									<span><b>{{ c.label }}</b><small>{{ c.help }}</small></span>
								</label>
							</div>
						</div>
					</div>
				</template>

				<template v-else-if="stage === 'running'">
					<div class="shelf-dialog-loading"><Icon name="loader" :size="18" class="shelf-spin" /> Installing… documents are created one by one.</div>
				</template>

				<template v-else-if="stage === 'done'">
					<div class="shelf-notice" :class="result.status === 'Installed' ? 'is-green' : 'is-red'">
						<Icon :name="result.status === 'Installed' ? 'check-circle' : 'alert'" :size="16" />
						<span v-if="result.status === 'Installed'"><b>{{ plan.mode === 'update' ? 'Updated' : 'Installed' }} {{ artifact.title }} {{ artifact.version }}.</b> Logged in History.</span>
						<span v-else><b>{{ result.status }}.</b> {{ result.error }}</span>
					</div>
					<div class="shelf-card">
						<div v-for="s in result.steps" :key="s.sequence" class="shelf-list-row">
							<Icon name="check-circle" :size="16" style="color: var(--green600)" />
							<div class="shelf-list-text"><div class="shelf-list-title">{{ s.type === 'file' ? s.source_name : (s.target_name || s.source_name) }}<span class="shelf-muted" style="font-weight: 420"> · {{ s.type === 'file' ? (s.target_name ? 'file, attached to ' + s.target_name : 'file') : s.doctype }}</span></div></div>
							<span class="shelf-list-right is-info">{{ actionLabel(s.action) }}</span>
						</div>
						<div v-if="!result.steps || !result.steps.length" class="shelf-list-row shelf-muted">No step completed.</div>
					</div>
				</template>
			</div>

			<div class="shelf-dialog-foot">
				<button class="shelf-btn shelf-btn-ghost" @click="close">{{ stage === 'done' ? 'Close' : 'Cancel' }}</button>
				<template v-if="stage === 'inputs'"><button class="shelf-btn shelf-btn-solid" :disabled="!!fatal || loading" @click="toReview">Review install<Icon name="arrow-right" :size="14" /></button></template>
				<template v-else-if="stage === 'review'">
					<button v-if="plan.inputs.length" class="shelf-btn shelf-btn-ghost" @click="stage = 'inputs'">Back</button>
					<button class="shelf-btn shelf-btn-solid" :disabled="!canRun" @click="run"><Icon :name="plan.mode === 'update' ? 'refresh' : 'download'" :size="14" />{{ runLabel }}</button>
				</template>
				<template v-else-if="stage === 'done' && result.status !== 'Installed'"><button class="shelf-btn shelf-btn-solid" @click="retry"><Icon name="refresh" :size="14" />Retry from step {{ nextStep }}</button></template>
			</div>
		</div>
	</div>
</template>

<script>
import Icon from "./Icon.vue";
import LinkInput from "./LinkInput.vue";
import { shelf } from "./api.js";
import { categoryIcon } from "./icons.js";

export default {
	name: "InstallDialog",
	components: { Icon, LinkInput },
	props: { source: { type: Object, required: true }, artifact: { type: Object, required: true } },
	emits: ["close", "done"],
	data() {
		return { plan: null, loading: true, fatal: "", stage: "inputs", values: {}, conflicts: {}, result: null };
	},
	computed: {
		icon() {
			return categoryIcon(this.artifact.category);
		},
		title() {
			const verb = { update: "Update", resume: "Resume installing", install: "Install" }[this.plan ? this.plan.mode : "install"];
			return `${verb} ${this.artifact.title}`;
		},
		stepper() {
			return this.plan && !this.plan.inputs.length ? ["review", "run"] : ["inputs", "review", "run"];
		},
		stepIndex() {
			const s = this.stage === "running" || this.stage === "done" ? "run" : this.stage;
			return this.stepper.indexOf(s);
		},
		badRequirements() {
			return this.plan ? this.plan.requirements.filter((r) => !r.ok) : [];
		},
		canRun() {
			if (!this.plan || this.badRequirements.length) return false;
			return this.plan.conflicts.every((c) => this.conflicts[c.sequence]);
		},
		runLabel() {
			return { update: `Update to ${this.artifact.version}`, resume: "Continue", install: "Install" }[this.plan.mode];
		},
		nextStep() {
			return this.result && this.result.steps ? this.result.steps.length + 1 : 1;
		},
	},
	async created() {
		try {
			this.plan = await shelf.plan(this.source.name, this.artifact.artifact_id);
			const previous = this.plan.previous_inputs || {};
			this.plan.inputs.forEach((i) => {
				this.values[i.key] = previous[i.key] != null ? previous[i.key] : i.default != null ? i.default : "";
			});
			this.plan.conflicts.forEach((c) => (this.conflicts[c.sequence] = "copy"));
			this.stage = this.plan.inputs.length ? "inputs" : "review";
		} catch (e) {
			this.fatal = e.message;
		} finally {
			this.loading = false;
		}
	},
	methods: {
		stepLabel(s) {
			return { inputs: "Inputs", review: "Review", run: this.plan && this.plan.mode === "update" ? "Update" : "Install" }[s];
		},
		selectOptions(input) {
			return (input.options || "").split("\n").map((o) => o.trim()).filter(Boolean);
		},
		toReview() {
			const missing = this.plan.inputs.filter((i) => i.mandatory && (this.values[i.key] === "" || this.values[i.key] == null));
			if (missing.length) {
				this.fatal = "";
				window.alert(`Please provide: ${missing.map((i) => i.label).join(", ")}`);
				return;
			}
			this.stage = "review";
		},
		reviewNote(step) {
			if (step.type === "file") return step.attach_to ? "Uploaded and attached" : "Uploaded";
			if (step.needs_decision) return "A document with this name already exists on this site";
			return { created: "New", replaced: step.owned ? "Updated in place, you own it" : "Replaces the existing document", skipped: "Kept as it is on this site", copied: `Installed as a copy named ${step.copy_name}` }[step.action] || step.action;
		},
		choices(step) {
			return [
				{ value: "copy", label: "Install as a copy", help: `Creates “${step.copy_name}”; later steps link to it` },
				{ value: "replace", label: "Replace existing", help: "Overwrites the document on this site" },
				{ value: "skip", label: "Keep mine, skip this step", help: "Later steps link to your existing document" },
			];
		},
		async run() {
			this.stage = "running";
			try {
				const result = await shelf.install(this.source.name, this.artifact.artifact_id, this.values, this.conflicts);
				if (result.status === "needs_decision") {
					this.plan.conflicts = result.conflicts;
					result.conflicts.forEach((c) => (this.conflicts[c.sequence] = this.conflicts[c.sequence] || "copy"));
					this.stage = "review";
					return;
				}
				this.result = result;
				this.stage = "done";
				this.$emit("done", result);
			} catch (e) {
				this.result = { status: "Failed", error: e.message, steps: [] };
				this.stage = "done";
			}
		},
		async retry() {
			try {
				this.plan = await shelf.plan(this.source.name, this.artifact.artifact_id);
			} catch (e) {
				this.fatal = e.message;
				return;
			}
			this.stage = this.plan.inputs.length ? "inputs" : "review";
		},
		actionLabel(action) {
			return { created: "Created", replaced: "Updated", skipped: "Kept yours", copied: "Copied", uploaded: "Uploaded", handler: "Installed by app" }[action] || action;
		},
		close() {
			this.$emit("close");
		},
	},
};
</script>

<style>
.shelf-overlay { position: fixed; inset: 0; background: rgba(23,23,23,.45); display: flex; align-items: flex-start; justify-content: center; padding: 48px 16px; z-index: 55; overflow: auto; }
.shelf-dialog { width: 600px; max-width: 100%; background: #fff; border-radius: 12px; box-shadow: 0 0 1px rgba(0,0,0,.2), 0 10px 24px -3px rgba(0,0,0,.1); display: flex; flex-direction: column; overflow: hidden; }
.shelf-dialog-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px 0; font-size: 16px; font-weight: 600; color: var(--g900); }
.shelf-dialog-body { display: flex; flex-direction: column; gap: 16px; padding: 16px 20px; }
.shelf-dialog-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 20px; background: var(--g50); border-top: 1px solid var(--g200); }
.shelf-steps { display: flex; align-items: center; gap: 12px; }
.shelf-step { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--g600); }
.shelf-step.is-active { color: var(--g900); font-weight: 500; }
.shelf-step-dot { width: 20px; height: 20px; border-radius: 999px; background: var(--g100); color: var(--g600); font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; }
.shelf-step.is-active .shelf-step-dot, .shelf-step.is-done .shelf-step-dot { background: var(--g900); color: #fff; }
.shelf-step-line { flex: 1; height: 1px; background: var(--g300); }
.shelf-dialog-artifact { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 10px; background: var(--g50); border: 1px solid var(--g200); color: var(--g800); }
.shelf-dialog-loading { display: flex; align-items: center; gap: 10px; padding: 20px 0; color: var(--g600); font-size: 13px; }
.shelf-dialog-hint { margin: 0; font-size: 13px; color: var(--g700); }
.shelf-field { display: flex; flex-direction: column; gap: 6px; }
.shelf-field > label { font-size: 12px; color: var(--g600); }
.shelf-field .is-req { color: var(--red600); }
.shelf-check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--g900); }
.shelf-notice.is-green { background: var(--green100); border: 1px solid #c3f9d3; color: var(--g800); }
.shelf-review-step { border-bottom: 1px solid var(--g200); }
.shelf-review-step:last-child { border-bottom: 0; }
.shelf-choices { display: flex; flex-direction: column; gap: 8px; padding: 0 12px 12px 40px; }
.shelf-choice { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--g300); cursor: pointer; }
.shelf-choice.is-on { border-color: var(--g900); background: var(--g50); }
.shelf-choice input { margin-top: 3px; accent-color: var(--g900); }
.shelf-choice span { display: flex; flex-direction: column; }
.shelf-choice b { font-size: 13px; font-weight: 500; color: var(--g900); }
.shelf-choice small { font-size: 12px; color: var(--g600); }
</style>
