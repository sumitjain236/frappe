# Shelf repository format (v1)

A **shelf** is a git repository. Each folder under `artifacts/` is one installable artifact:
a Report, Print Format, Dashboard, Workspace, Server Script, or anything else that can be
expressed as Frappe documents plus files. Consumers pull; nothing is ever pushed to a site.

```
<repo>/
├── shelf.json                    repo manifest (who, what domain)
├── index.json                    GENERATED summary of every artifact; what consumers read first
├── README.md                     optional
├── scripts/build_index.py        validator + index builder (copy of frappe/shelf/repo/spec.py)
├── .github/workflows/shelf-index.yml
└── artifacts/
    └── <artifact-id>/
        ├── artifact.json         manifest: metadata, requirements, inputs, steps
        ├── README.md             optional long description (Markdown)
        ├── preview.png           optional screenshot
        ├── documents/*.json      Frappe documents, one per file, each with doctype + name
        └── files/*               any other files: images, fonts, CSV, PDF, Markdown…
```

## shelf.json

```json
{
  "format": 1,
  "id": "frappe-gst",
  "name": "GST & Compliance",
  "domain": "GST & Compliance",
  "description": "…",
  "license": "GPL-3.0",
  "publisher": { "name": "Frappe", "url": "https://frappe.io" }
}
```

`id` is a lowercase slug. `domain` defaults to `name`. In the consumer UI one source is one
domain tab, so a repo should hold one domain; split by repo, not by folder.

## artifact.json

```json
{
  "format": 1,
  "id": "gstr-3b-summary",            // must equal the folder name
  "title": "GSTR-3B Summary Report",
  "category": "Report",               // Report | Dashboard | Workspace | Print Format | Server Script | Other
  "app": "erpnext",                   // the app this artifact is for
  "version": "1.3.0",                 // semver
  "description": "one or two lines",
  "tags": ["gst", "returns"],
  "license": "GPL-3.0",
  "links": { "documentation": "…", "support": "…", "website": "…" },
  "requires": [ { "app": "erpnext", "min_version": "15.0.0" } ],
  "inputs": [ … ],
  "steps": [ … ],
  "install": { "mode": "generic" },   // or { "mode": "app", "handler_app": "erpnext" }
  "updated": "2026-08-12"             // optional; CI fills it from git when absent
}
```

### inputs

Values only the installing site knows (Company, Warehouse, GSTIN…). Collected once, before any
step runs, and kept on the site's install log so updates never ask again.

```json
{ "key": "company", "label": "Company", "fieldtype": "Link", "options": "Company",
  "mandatory": true, "description": "…", "default": null }
```

`fieldtype` is one of Link, Data, Select, Check, Int, Date. Link needs `options` (a DocType).

### steps

Run in ascending `sequence`. Two types.

**document** — insert a Frappe document from `documents/<file>.json`. The JSON is the document
dict and must carry `doctype` and `name`.

```json
{ "sequence": 2, "type": "document", "path": "documents/02-dashboard-chart.json",
  "on_conflict": "ask",
  "link_rules": {
    "company":     { "resolver": "prompt", "prompt_key": "company" },
    "report_name": { "resolver": "step",   "sequence": 1, "field": "name" },
    "image":       { "resolver": "file",   "sequence": 1 }
  } }
```

`link_rules` overwrite fields on the document before insert:

| resolver | value comes from |
|----------|------------------|
| `prompt` | the input answered by the installer (`prompt_key`) |
| `step`   | `field` of the document inserted at an earlier `sequence` (usually `name`, so renames on conflict propagate) |
| `file`   | the `file_url` of the file uploaded at an earlier `sequence` |

`on_conflict` decides what happens when a document with that name already exists on the site:
`ask` (default, the installer chooses), `skip` (keep theirs, later steps link to it), `replace`
(overwrite), `copy` (insert under `<name> (Shelf)` and use that name downstream).

**file** — upload any file from `files/` into the site as a File document.

```json
{ "sequence": 4, "type": "file", "path": "files/print-notes.md",
  "file_name": "print-notes.md", "is_private": true,
  "attach_to": { "resolver": "step", "sequence": 3 } }
```

Without `attach_to` the file is a standalone (public or private) File. With `attach_to` it is
attached to the document inserted at that step (`resolver: step`) or to the document the installer
picked in an input (`resolver: prompt`, `prompt_key` of a Link input). A document that needs a
file's URL in one of its fields (Letter Head image, a font in a Print Format) uploads the file in
an earlier step and points at it with a `file` link rule.

Rules enforced by the validator: sequences are unique positive integers; every referenced
sequence is earlier and of the right type; paths are relative and stay inside the artifact folder;
document JSON parses and has doctype + name; no file above 10 MB.

## Package hash

`sha256` over the canonical manifest (sorted keys, no whitespace, derived keys removed) chained
with the sha256 of every step file in sequence order. Consumers compare the hash in their install
log with the hash in the index: different hash means an update is available, regardless of whether
the version string was bumped.

## index.json (generated)

Built by `scripts/build_index.py` (identical to `frappe/shelf/repo/spec.py`) and committed by the
`shelf-index` workflow on every push to `main`. It carries catalog metadata and counts only, never
document contents:

```json
{ "format": 1, "generated_at": "2026-09-06T10:00:00+00:00",
  "shelf": { …shelf.json… },
  "artifacts": [ { "id", "path", "title", "category", "app", "version", "description", "tags",
                   "license", "requires", "install_mode", "inputs_count", "documents_count",
                   "files_count", "has_readme", "has_preview", "hash", "updated" } ] }
```

A pull request that breaks the format fails CI before it can merge.

## How a consumer reads a repo

1. **Connect** — a Shelf Source holds the repo URL, branch (default `main`) and, for private
   repos, a token (Password field). Saving runs the connection check:
   - probe `shelf.json` on `raw.githubusercontent.com` **without** the token → 200 means public
     (a pasted token is reported as unnecessary);
   - on 404, retry with the token → 200 means private and the token works; 401/403 means bad token;
   - still nothing → ask `api.github.com/repos/{owner}/{repo}` to tell apart *wrong branch*
     (reports the default branch), *not a shelf yet*, *private or missing* (asks for a token), and
     *token cannot see it*.
   Outcome codes: `public_ok`, `private_ok`, `needs_token`, `invalid_token`, `not_found`,
   `branch_not_found`, `not_a_shelf`, `network_error`.
2. **Sync** — fetch `index.json`, validate it, mirror rows into Shelf Catalog Entry (upsert,
   delete stale). Skipped when the index hash is unchanged. Runs on demand and daily.
3. **Install** — fetch `artifact.json` and every step file from the same ref, verify the package
   hash matches the index, collect inputs, run steps, write a Shelf Install Log with
   `is_current = 1` and the source→target name map.
4. **Update** — catalog hash ≠ installed hash. Re-run with the stored inputs; the step log tells
   the installer which documents it owns (replace) and which were the site's own (keep). Files it
   uploaded are removed and uploaded again.
5. **Resume** — every step runs in its own savepoint. A failing step is rolled back alone, the log
   is marked Partially Installed with the step and error, and the next install call continues from
   that step (with any corrected inputs merged in).
6. **Uninstall** — removes documents the installer created or copied and files it uploaded.
   Documents it replaced or skipped belonged to the site first and are left in place.

Code: `frappe/shelf/installer.py` (`plan_install`, `install_artifact`, `uninstall_artifact`);
endpoints `frappe.shelf.api.get_install_plan`, `install`, `uninstall`.

Private repos are read the same way as public ones; only the `Authorization: token …` header
differs. Tokens live on the consumer site only. Publishers never learn who installed what.

## Reference implementation

- `frappe/shelf/repo/spec.py` — validation, hashing, index (no Frappe imports; runs in CI)
- `frappe/shelf/repo/github.py` — URL parsing, raw fetch, access check
- `frappe/shelf/sync.py`, `frappe/shelf/api.py` — consumer sync and UI endpoints
- `frappe/shelf/sample_repo/` — a complete sample repository with three artifacts
