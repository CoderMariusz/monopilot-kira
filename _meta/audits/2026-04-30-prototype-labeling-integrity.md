# Prototype Labeling Integrity Audit — 2026-04-30

Scope: `_meta/prototype-labels/` (1 master + 17 per-module indexes + 16 translation-notes) cross-checked against `design/Monopilot Design System/` JSX and the canonical taxonomy in `.claude/skills/prototype-labeling/SKILL.md`.

---

## 1. Executive summary

- **Master index is structurally sound:** 514 entries, all 13 schema fields present on every entry, all `file` paths resolve on disk, zero label duplicates, all module-folder mismatches are zero.
- **Worst issue: warehouse double-labeling never reconciled.** `prototype-index-warehouse-haiku.json` (32 entries, different decomposition) and `prototype-index-warehouse-sonnet.json` (31 entries, identical to master) coexist; haiku is dead data that contradicts master. Two translation-notes files mirror the split.
- **Per-module indexes drift from master:** 11 bare-label collisions across modules (e.g. `delete_confirm_modal` in 3 indexes; `nutrition_screen` in 2) which master disambiguates by prefixing. Per-module files do not carry a `module` field, so dedupe was done at master-build time only.
- **34% of entries violate the skill's `estimated_translation_time_min` 15-90 bound** (175/514 are >90; max 480). Either the bound is stale or estimates need normalization.
- **Translation-notes coverage gap:** reporting (10 missing), npd (4 missing), finance (1 missing); plus warehouse has no `translation-notes-warehouse.md` (only the haiku/sonnet split).
- **Cross-module dependency strings are unresolvable as-is:** 440/784 deps don't match a label or a JSX file path; 277 are bare `_shared/` primitive names (Modal, Field, Btn, Topbar, …) that should be normalized to a canonical syntax.

---

## 2. Per-audit-area findings

### 2.1 Master vs per-module indexes (Q1)

- Master: 514 entries, 514 unique labels, **0 duplicates**.
- Per-module sum: **542 entries** (28 more than master). All 28 extras are warehouse-haiku entries; master uses warehouse-sonnet exclusively (`master ∩ warehouse-haiku` = 2 labels: `force_unlock_scanner_modal`, `state_transition_confirm_modal`).
- **11 bare labels collide across per-module indexes** (master disambiguated by prefixing):
  | Bare label | Per-module files | Master form |
  |---|---|---|
  | `export_report_modal` | finance, reporting | `finance_export_report_modal`, `reporting_export_report_modal` |
  | `delete_confirm_modal` | maintenance, planning, reporting | 3× module-prefixed |
  | `allergen_override_modal` | npd, shipping | `npd_…`, `shipping_…` |
  | `nutrition_screen` | npd, technical | `npd_…`, `technical_…` |
  | `costing_screen` | npd, technical | `npd_…`, `technical_…` |
  | `shifts_screen` | production, settings | `production_…`, `settings_…` |
  | `settings_screen` | production, scanner | `production_settings_screen`, `scanner_settings_screen` |
  | `hold_release_modal` | quality, shipping | `quality_…`, `shipping_…` |
  | `d365_mapping_screen` | settings, technical | `settings_…`, `technical_…` |
  | `state_transition_confirm_modal` | warehouse-haiku, warehouse-sonnet | (sonnet wins) |
  | `force_unlock_scanner_modal` | warehouse-haiku, warehouse-sonnet | (sonnet wins) |
- **Labels in master but in zero per-module index: 23** — all of them are the prefixed form (e.g. `finance_export_report_modal` exists in master, only `export_report_modal` in `prototype-index-finance.json`). Master invented the prefixed form at build time.
- **Labels in per-module but not in master: 39** — 28 from warehouse-haiku, 11 are bare-label sides of the prefix-disambiguated pairs.
- Per-module indexes are **list of entries** (no wrapper, no `module` field, no `generated_at`, no `generator`) — they do not match the SKILL.md output contract which mandates a wrapper dict with `module`, `generated_at`, `generator`, `mode`, `entries`.

### 2.2 Index entries vs filesystem (Q2)

- Master `file` paths: **0 broken** (all 514 resolve).
- Per-module `file` paths: **0 broken** across 17 indexes.
- Total `.jsx` under `design/Monopilot Design System/`: **160 files**.
- Files referenced by master: **106 distinct files**. **54 jsx files are orphan** (no entry references them):
  - **49 are infrastructure**: `app.jsx`, `data.jsx`, `shell.jsx` per module, plus `chrome.jsx`, `tweaks.jsx`, `editor-tweaks.jsx`, `rules-data.jsx`, `_shared/placeholders.jsx`, `_shared/primitives.jsx`. Expected — these are Vite/preview shells.
  - **5 content orphans (real gaps):**
    - `design/Monopilot Design System/_shared/modals.jsx` — referenced by 14+ entries via `depends_on_prototypes` but never indexed itself
    - `design/Monopilot Design System/maintenance/sanitation.jsx`
    - `design/Monopilot Design System/npd/d365-screens.jsx`
    - `design/Monopilot Design System/planning/suppliers.jsx`
    - `design/Monopilot Design System/settings/onboarding-screens.jsx`

### 2.3 Schema drift (Q3)

- All 514 master entries carry the full 13-field schema **plus** the synthetic `module` field added at master-build time (14 fields total).
- Zero null / empty / `TBD` / `TODO` values across all fields.
- Per-module entries lack the `module` field (correct — that's a master-only synthetic) but otherwise have all 13 fields populated.
- `translation_notes` minimum length (skill says ≥4 bullets): **0 entries violate** the ≥4 minimum.
- `estimated_translation_time_min` skill-bound 15-90: **175 entries violate** (range 100-480).

### 2.4 Taxonomy consistency (Q4)

- `component_type` (8 unique values, all canonical): modal=199, page-layout=175, table=51, wizard=27, tabs=23, form=22, dashboard-tile=9, sidebar=8. `stepper` from skill is unused (always rolled into `wizard`).
- `ui_pattern` (10 unique, **1 off-canon**): crud-form-with-validation=172, detail-view=115, list-with-actions=80, search-filter-list=59, dashboard-tile=26, multi-step-wizard=24, bulk-action=16, wizard-step=12, import-export=9, **`dashboard`=1 (OFF-CANON, should be `dashboard-tile`)** — at `gate_checklist_panel` (`design/Monopilot Design System/npd/gate-screens.jsx:106-258`).
- `data_domain` (54 unique values, free-text by skill): no canonicalization issues spotted (all PascalCase entity names like `WO`, `LP`, `FA`, `BOM`, `OEE`, `Recipe`, `Allergen`, `StandardCost`, …). No casing variants ("modal" vs "Modal") in this dimension.
- `interaction` (10 unique, **1 off-canon**): read-only=207, edit=110, create=75, approve=61, delete=22, sign-off=13, bulk=12, export=7, import=6, **`view`=1 (OFF-CANON, should be `read-only`)** — at `approval_history_timeline` (`design/Monopilot Design System/npd/gate-screens.jsx:525-616`).
- `complexity` (3 unique, all canonical): page-level=241, composite=199, primitive=74.

### 2.5 Mis-tagged prototypes (Q5)

- **Path-based mis-tagging: zero.** Every master entry's declared `module` matches the second path segment of its `file` (`design/Monopilot Design System/<module>/...`).
- **Domain-based mis-tagging in `prototype-index-settings.json` (gap-backlog §D8 finding still stands):** these 6 prototypes physically live in settings JSX (`org-screens.jsx`, `ops-screens.jsx`, `data-screens.jsx`) but functionally belong to other modules:
  | Label | File | Functional module |
  |---|---|---|
  | `sites_screen` | `settings/org-screens.jsx:103-189` | multi-site |
  | `settings_shifts_screen` (was `shifts_screen`) | `settings/org-screens.jsx:255-306` | oee |
  | `devices_screen` | `settings/ops-screens.jsx:4-95` | scanner |
  | `products_screen` | `settings/data-screens.jsx:4-52` | technical |
  | `boms_screen` | `settings/data-screens.jsx:55-103` | technical |
  | `partners_screen` | `settings/data-screens.jsx:106-148` | technical |

  Note: the gap-backlog called the per-module label `shifts_screen`; in master it was already prefixed to `settings_shifts_screen` — but master `module` is still `settings`, so the issue persists at the master level.
- Spot-check across other modules for the same pattern: no further domain-mistags surfaced from a label-vs-folder substring scan.

### 2.6 Warehouse haiku vs sonnet (Q6)

- `prototype-index-warehouse-haiku.json`: 32 entries, generated by Haiku.
- `prototype-index-warehouse-sonnet.json`: 31 entries, generated by Sonnet.
- **Master uses sonnet exclusively**: `set(master.warehouse.labels) == set(sonnet.labels)` (31 == 31), `master ∩ haiku.only` = ∅.
- Label intersection haiku ∩ sonnet: only **2 labels** (`force_unlock_scanner_modal`, `state_transition_confirm_modal`). The two indexes describe almost the same JSX with different decomposition philosophies:
  - Haiku splits warehouse dashboard into 4 entries (`warehouse_dashboard_activity_feed`, `…_alerts_panel`, `…_expiry_summary`, `…_kpi_strip`); sonnet keeps it as a single `warehouse_dashboard`.
  - Haiku names by behaviour (`grn_from_po_wizard_3step`, `lp_split_multi_row_validator`); sonnet names by container (`grn_from_po_wizard`, `lp_split_modal`).
  - Same JSX file:lines, different label name (2 cases): `grn_from_po_wizard_3step` vs `grn_from_po_wizard` (`warehouse/modals.jsx:24-280`); `locations_hierarchy_browser` vs `locations_hierarchy_page` (`warehouse/other-screens.jsx:156-264`).
- Haiku also has **lower estimated translation times** (e.g. grn-from-po: 120 min haiku vs 240 min sonnet) — likely Haiku underestimating composite work.
- **Resolution: sonnet is canonical** (master agrees). Haiku index + notes file are vestigial and should be archived/deleted.

### 2.7 Translation notes coverage (Q7)

- 16 notes files exist; all 15 master modules have a notes file **except `warehouse`** (which has `translation-notes-warehouse-haiku.md` 22 KB and `translation-notes-warehouse-sonnet.md` 10 KB but no plain `translation-notes-warehouse.md`).
- Per-module label → notes coverage (substring match for both prefixed and bare label form):
  | Module | Entries | Missing in notes |
  |---|---|---|
  | finance | 25 | 1 (`cost_center_gl_mapping_modal`) |
  | npd | 51 | 4 (`gate_checklist_panel`, `advance_gate_modal`, `gate_approval_modal`, `approval_history_timeline`) |
  | reporting | 28 | 10 (`error_log_modal`, `refresh_confirm_modal`, `run_now_confirm_modal`, `p2_toast_modal`, `access_denied_modal`, …) |
  | all other modules | — | 0 |
  | warehouse | 31 | not checked (no canonical notes file) |

### 2.8 Cross-module dependencies (Q8)

- 321/514 entries (62%) have a non-empty `depends_on_prototypes` list; **784 total dep references**.
- Resolution buckets:
  | Bucket | Count |
  |---|---|
  | Resolved (matches a master label or master file path, or `<file>#<comp>` where file exists) | 344 |
  | Unresolved file-references (file path doesn't exist) | 0 |
  | Unresolved bare component names (Modal, Field, Btn, Topbar, …) — likely shadow refs to `_shared/modals.jsx` exports | 277 |
  | Other unresolved label-like strings (e.g. `other-screens.jsx → PageHeader`, `_shared/modals.jsx (Modal, Field)`) | 163 |
- Top "primitive" deps (un-normalized): `Btn` (31), `Topbar` (30), `Content` (30), `Modal` (23), `Field` (18), `Banner` (18), `BottomActions` (18), `SiteCrumb` (14), `ScanInputArea` (13).
- Top freeform unresolved: `other-screens.jsx → PageHeader` (20), `export_report_modal` (16, references the bare label that master prefixed away), `_shared/modals.jsx → Modal` (14).
- **Root cause:** the canonical syntax in SKILL.md is `<file>#<componentExport>` (e.g. `_shared/modals.jsx#Modal`), but the existing data uses at least four ad-hoc syntaxes: `Modal`, `_shared/modals.jsx → Modal`, `_shared/modals.jsx (Modal, Field)`, `_shared/modals.jsx#Modal` (only 99 of 784, all in warehouse). Plus the 16 references to `export_report_modal` etc. break because master renamed those labels.

---

## 3. Severity-ranked issue list

### BLOCKER

1. **Warehouse haiku/sonnet split unresolved** — `prototype-index-warehouse-haiku.json` and `translation-notes-warehouse-haiku.md` contradict master (which uses sonnet). Any tooling that walks `prototype-index-*.json` will read both. **Fix:** delete or move to `_archive/` the haiku files; rename `prototype-index-warehouse-sonnet.json` → `prototype-index-warehouse.json` and `translation-notes-warehouse-sonnet.md` → `translation-notes-warehouse.md`.

2. **Cross-module label collisions in per-module indexes** — 11 bare labels collide across per-module files (e.g. `delete_confirm_modal` in 3 files); only master disambiguates. Tools that only see `prototype-index-<module>.json` will silently merge or mismatch. **Fix:** apply the same module-prefix convention to per-module indexes (or have them carry a wrapper with `module` field so the (module, label) pair is unique).

3. **Per-module indexes don't follow SKILL.md output contract** — they are bare arrays, missing the `module`, `generated_at`, `generator`, `mode` wrapper fields. **Fix:** rewrite each per-module index as `{module, generated_at, generator, mode, entries}` (mechanical migration; data unchanged).

### HIGH

4. **`gate_checklist_panel` has off-canon `ui_pattern: "dashboard"`** at `design/Monopilot Design System/npd/gate-screens.jsx:106-258`. **Fix:** change to `dashboard-tile` (closest match) or revisit classification (likely should be `detail-view`).

5. **`approval_history_timeline` has off-canon `interaction: "view"`** at `design/Monopilot Design System/npd/gate-screens.jsx:525-616`. **Fix:** change to `read-only`.

6. **6 settings entries are domain-mistagged** (gap backlog §D8 confirmed): `sites_screen`, `settings_shifts_screen`, `devices_screen`, `products_screen`, `boms_screen`, `partners_screen` are physically in `settings/*.jsx` but functionally belong to multi-site / oee / scanner / technical. **Fix:** either move JSX into the right module folder (preferred — files become navigable), or add a `functional_module` field that diverges from `module`.

7. **`translation-notes-warehouse.md` does not exist** — only haiku/sonnet variants. Anyone consuming notes-by-module will miss the warehouse module entirely. **Fix:** rename sonnet variant to canonical `translation-notes-warehouse.md`.

8. **Translation-notes have 15 missing entries across 3 modules**: reporting (10), npd (4), finance (1). **Fix:** add the missing per-component sections.

9. **`depends_on_prototypes` syntax is fragmented** — 4+ ad-hoc syntaxes in 514 entries, only ~99 use the SKILL.md `<file>#<component>` form. **Fix:** normalize to `<file>#<componentExport>` everywhere; for label-to-label dependencies, use the bare master label.

### MED

10. **`depends_on_prototypes` references unprefixed labels that master renamed** — 16 entries depend on `export_report_modal` (which doesn't exist anymore — master has `finance_export_report_modal` and `reporting_export_report_modal`). Similar for `delete_confirm_modal`, `hold_release_modal`, `allergen_override_modal`. **Fix:** rewrite deps to use master's prefixed labels, or pick one (the `_shared` primitive) and reference its file.

11. **`_shared/modals.jsx` is referenced by 14+ entries but never indexed itself.** It should appear in master as primitive entries (one per exported component). **Fix:** add a `_shared` pseudo-module index OR add primitive entries inline to the closest module.

12. **5 content JSX files unindexed**: `_shared/modals.jsx`, `maintenance/sanitation.jsx`, `npd/d365-screens.jsx`, `planning/suppliers.jsx`, `settings/onboarding-screens.jsx`. **Fix:** decide per file whether to index or annotate as deliberately skipped (e.g. in pilot summary).

13. **`estimated_translation_time_min` exceeds skill-documented 15-90 bound on 175 entries (34%)**, max 480 min. Either the bound is stale (page-level work genuinely takes >90 min) or estimates are inflated. **Fix:** update SKILL.md to bound page-level differently (e.g. 15-90 for primitive/composite, 60-480 for page-level), then re-validate.

### LOW

14. **`stepper` component_type is defined in skill but unused** in master (always rolled into `wizard`). **Fix:** drop `stepper` from skill enum or document the convention "use `wizard` for stepper-with-final-action."

15. **Per-module indexes are missing `generated_at`/`generator` provenance** which the skill mandates. Useful for re-run detection but not load-bearing today.

---

## 4. Recommended remediation plan

Group by single-pass operations:

### Pass A — Warehouse canonicalization (BLOCKER 1, HIGH 7)
1. Move `prototype-index-warehouse-haiku.json` and `translation-notes-warehouse-haiku.md` to `_meta/prototype-labels/_archive/`.
2. Rename `prototype-index-warehouse-sonnet.json` → `prototype-index-warehouse.json`.
3. Rename `translation-notes-warehouse-sonnet.md` → `translation-notes-warehouse.md`.
4. Verify master unchanged (it was already aligned to sonnet).

### Pass B — Per-module schema migration (BLOCKER 3, also fixes BLOCKER 2 partially)
For each `prototype-index-<module>.json`, wrap as:
```json
{ "module": "<m>", "generated_at": "<ISO>", "generator": "<…>", "mode": "full",
  "entries": [...] }
```
Mechanical; entries unchanged.

### Pass C — Label disambiguation (BLOCKER 2 finished)
Either:
- **Option C1 (preferred):** apply master's prefixed labels to per-module indexes — replace `export_report_modal` in `prototype-index-finance.json` with `finance_export_report_modal`, etc. (11 collisions × ~2 sites each ≈ 25 edits.)
- **Option C2:** keep bare labels in per-module but rely on the wrapper's `module` field for uniqueness; document the (module, label) compound key convention in SKILL.md.

### Pass D — Off-canon taxonomy fix (HIGH 4, 5)
- `gate_checklist_panel`: `ui_pattern: "dashboard"` → `"dashboard-tile"` (or re-classify).
- `approval_history_timeline`: `interaction: "view"` → `"read-only"`.

### Pass E — Domain-mistag settings → real module (HIGH 6)
For each of the 6 prototypes (`sites_screen`, `settings_shifts_screen`, `devices_screen`, `products_screen`, `boms_screen`, `partners_screen`):
- Decide: physical move (rename JSX into the target module folder) or virtual move (add `functional_module` field that diverges from `module`). Physical move is cleaner but cascades into BACKLOG.md / MODAL-SCHEMA.md cross-refs.

### Pass F — Translation-notes backfill (HIGH 8)
Add 15 missing per-component sections: 10 in `translation-notes-reporting.md`, 4 in `translation-notes-npd.md`, 1 in `translation-notes-finance.md`.

### Pass G — Dependencies normalization (HIGH 9, MED 10, MED 11)
Bigger pass:
- Index `_shared/modals.jsx` exports as primitive entries (in a new `_shared` module or distributed back to first-user modules).
- Rewrite all 784 dep strings to either `<file-path>#<componentExport>` or a master label.
- Update the 16 deps that reference now-renamed labels (`export_report_modal` → `finance_export_report_modal` etc.).

### Pass H — Estimated time bound clarification (MED 13)
Update SKILL.md: bound primitive/composite at 15-90, page-level at 60-480 (or whatever the data shows is realistic). Then no migration needed — current data already in valid range under the new bound.

### Pass I — Content orphan triage (MED 12)
Decide per file (sanitation, d365-screens, suppliers, onboarding-screens, _shared/modals): index or explicitly skip.

---

## 5. Stats appendix

### 5.1 Master coverage by module

| Module | Entries | Primitive | Composite | Page-level | Est min | Est h |
|---|---:|---:|---:|---:|---:|---:|
| finance | 25 | 8 | 5 | 12 | 2,550 | 42.5 |
| maintenance | 36 | 7 | 13 | 16 | 4,560 | 76.0 |
| multi-site | 27 | 1 | 10 | 16 | 3,135 | 52.2 |
| npd | 51 | 2 | 28 | 21 | 4,065 | 67.8 |
| oee | 27 | 6 | 9 | 12 | 1,995 | 33.2 |
| planning | 33 | 4 | 16 | 13 | 3,690 | 61.5 |
| planning-ext | 25 | 6 | 8 | 11 | 3,810 | 63.5 |
| production | 33 | 4 | 17 | 12 | 2,510 | 41.8 |
| quality | 32 | 3 | 11 | 18 | 2,970 | 49.5 |
| reporting | 28 | 7 | 5 | 16 | 3,050 | 50.8 |
| scanner | 41 | 6 | 22 | 13 | 2,705 | 45.1 |
| settings | 37 | 6 | 5 | 26 | 3,015 | 50.2 |
| shipping | 41 | 6 | 16 | 19 | 4,605 | 76.8 |
| technical | 47 | 8 | 16 | 23 | 2,480 | 41.3 |
| warehouse | 31 | 0 | 18 | 13 | 3,115 | 51.9 |
| **TOTAL** | **514** | **74** | **199** | **241** | **48,255** | **804.2** |

### 5.2 component_type distribution

modal=199, page-layout=175, table=51, wizard=27, tabs=23, form=22, dashboard-tile=9, sidebar=8 (8 of 9 canonical values used; `stepper` unused).

### 5.3 ui_pattern distribution

crud-form-with-validation=172, detail-view=115, list-with-actions=80, search-filter-list=59, dashboard-tile=26, multi-step-wizard=24, bulk-action=16, wizard-step=12, import-export=9, **dashboard=1 (off-canon)**.

### 5.4 interaction distribution

read-only=207, edit=110, create=75, approve=61, delete=22, sign-off=13, bulk=12, export=7, import=6, **view=1 (off-canon)**.

### 5.5 complexity distribution

page-level=241 (47%), composite=199 (39%), primitive=74 (14%).

### 5.6 data_domain top 10

WO=71, LP=37, FA=21, BOM=21, OEE=20, Report=20, Recipe=19, Allergen=17, StandardCost=15, Asset=13. (54 unique domains total, no casing/spelling drift detected.)

### 5.7 Filesystem scan

- Total `.jsx` files in `design/Monopilot Design System/`: **160**
- Files referenced by ≥1 master entry: **106**
- Orphan files: **54** (49 infrastructure shells; **5 content orphans**: `_shared/modals.jsx`, `maintenance/sanitation.jsx`, `npd/d365-screens.jsx`, `planning/suppliers.jsx`, `settings/onboarding-screens.jsx`)

### 5.8 Index file inventory

- 1 master index: `master-index.json` (514 entries, list-of-objects)
- 17 per-module indexes (1 module = warehouse-haiku/sonnet split):
  - 15 canonical: finance, maintenance, multi-site, npd, oee, planning, planning-ext, production, quality, reporting, scanner, settings, shipping, technical, warehouse-sonnet
  - 1 vestigial: warehouse-haiku
  - All are bare arrays; none follow the SKILL.md `{module, generated_at, generator, mode, entries}` wrapper shape.
- 16 translation-notes files (15 modules + warehouse-haiku/sonnet split; missing canonical `translation-notes-warehouse.md`).
