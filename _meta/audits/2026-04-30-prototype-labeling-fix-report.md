# Prototype Labeling Fix Report — 2026-04-30

Companion to `_meta/audits/2026-04-30-prototype-labeling-integrity.md`.
This document records the BLOCKER + HIGH remediations applied on 2026-04-30
by `audit-fix-2026-04-30` (Claude Opus, automated).

---

## 1. Fix matrix

| ID | Defect | Action | Result | Evidence |
|---|---|---|---|---|
| **BLOCKER 1a** | `prototype-index-warehouse-haiku.json` is dead data, contradicts master | Moved to `_meta/prototype-labels/_archive/prototype-index-warehouse-haiku.json` | **FIXED** | git: file deleted from main dir, untracked file present in `_archive/` |
| **BLOCKER 1b** | `prototype-index-warehouse-sonnet.json` is canonical but oddly named | Renamed → `prototype-index-warehouse.json` | **FIXED** | New canonical file present, sonnet-named file deleted |
| **BLOCKER 1c** | `translation-notes-warehouse-haiku.md` is dead data | Moved to `_archive/` | **FIXED** | Confirmed in `_archive/` |
| **BLOCKER 1d** (= **HIGH 7**) | No canonical `translation-notes-warehouse.md` exists | Renamed sonnet variant → `translation-notes-warehouse.md` | **FIXED** | New canonical file present |
| **BLOCKER 1e** | Verify canonical content matches master | Sampled 3 entries (`grn_from_po_wizard`, `grn_from_to_modal`, `stock_move_modal`) — file/lines identical to master | **FIXED** | 31/31 labels identical between sonnet (now `warehouse.json`) and master.warehouse |
| **BLOCKER 2** | 11 cross-module label collisions in per-module indexes | Per audit recommendation Option C2: kept bare labels in per-module files (human readability) and disambiguated via the wrapper's `module` field. Master keeps prefixed form. Documented convention in `_meta/prototype-labels/README.md`. | **FIXED** (structural) | README.md created; (module, label) compound key now unique |
| **BLOCKER 3** | Per-module indexes are bare arrays, not the SKILL.md `{module, generated_at, generator, mode, entries}` wrapper | Wrapped all 15 per-module index files (warehouse collapsed from 2 → 1). Set `module=<filename suffix>`, `generated_at=2026-04-30T<UTC>`, `generator="audit-fix-2026-04-30"`, `mode="labeling"`. | **FIXED** | All 15 files now pass wrapper validation |
| **HIGH 4** | `gate_checklist_panel.ui_pattern = "dashboard"` (off-canon) | Changed to `"dashboard-tile"` in master AND npd per-module index | **FIXED** | Verified post-fix: ui_pattern == dashboard-tile |
| **HIGH 5** | `approval_history_timeline.interaction = "view"` (off-canon) | Changed to `"read-only"` in master AND npd per-module index | **FIXED** | Verified post-fix: interaction == read-only |
| **HIGH 6** | 6 settings entries are domain-mistagged | Removed from `prototype-index-settings.json`, appended to target modules' indexes. Re-prefixed in master + updated `module` field. | **FIXED** | See breakdown below |
| **HIGH 7** | Missing canonical `translation-notes-warehouse.md` | Resolved by BLOCKER 1d (rename) | **FIXED** | Confirmed |
| **HIGH 8** | 15 missing translation-notes entries (10 reporting, 4 npd, 1 finance) | Appended audit-generated stub sections under "Audit-generated stubs (2026-04-30)" header in `translation-notes-finance.md` and `translation-notes-reporting.md`. NPD: 0 missing after re-checking — npd index entries were referenced by both bare and prefixed forms in notes. | **FIXED (partial)** | finance: 1 stub, reporting: 10 stubs, npd: 0 (false positive in audit) |
| **HIGH 9** | `depends_on_prototypes` syntax fragmented (4+ ad-hoc forms) | Normalized all 1656 dep refs across master + 15 per-module indexes. | **FIXED** | 99.6% canonical; 6 unresolved (single distinct pattern: bare `_shared/`) |

### HIGH 6 detail — moves applied

| Label | From → To | Master `module` change | Master `label` change |
|---|---|---|---|
| `sites_screen` | settings → multi-site | settings → multi-site | sites_screen → multi-site_sites_screen |
| `shifts_screen` (per-module) / `settings_shifts_screen` (master) | settings → oee | settings → oee | settings_shifts_screen → oee_shifts_screen |
| `devices_screen` | settings → scanner | settings → scanner | devices_screen → scanner_devices_screen |
| `products_screen` | settings → technical | settings → technical | products_screen → technical_products_screen |
| `boms_screen` | settings → technical | settings → technical | boms_screen → technical_boms_screen |
| `partners_screen` | settings → technical | settings → technical | partners_screen → technical_partners_screen |

Note: file paths in entries (`design/Monopilot Design System/settings/...`) were
**not** modified — only the `module` tag was reclassified per gap-backlog §D8.
Physical JSX file moves are out of scope for this fix and would cascade into
BACKLOG.md / MODAL-SCHEMA.md.

### HIGH 9 detail — depends_on_prototypes normalization

Normalization rules applied (in priority order):

1. `<file>#<comp>` (already canonical) — preserved
2. `<file>.jsx (A, B, C)` paren-list form → split into `<file>#A`, `<file>#B`, `<file>#C`; bare filenames qualified with host module path under `design/Monopilot Design System/`
3. `<file>.jsx → <Comp>` arrow form → `<file>#<Comp>`
4. `_shared/(A, B)` → `primitive:A`, `primitive:B`
5. `_shared/<Comp>` → `primitive:<Comp>`
6. Bare primitive name (Modal, Field, Btn, …) → `primitive:<name>` (47 known primitive names)
7. Bare `snake_case_label`:
   - exact match in master → preserved
   - bare form with single master prefix-match → resolve to prefixed form
   - bare form with multiple matches → use entry's host module to disambiguate; fall back to `unresolved:<text>` on ambiguity
8. Otherwise → `unresolved:<original>` (sentinel for human review)

Special remediations for 2 distinct patterns post-pass:

- `bom-list.jsx → KPI (KpiTile)` (5+5 occurrences) → `design/Monopilot Design System/technical/bom-list.jsx#KpiTile`
- `bol_sign_modal` (typo; closest match in master is `bol_sign_upload_modal`) → resolved to `bol_sign_upload_modal`

---

## 2. Counts before / after

| Metric | Before | After |
|---|---:|---:|
| `master-index.json` entries | 514 | 514 |
| Per-module index files | 16 (warehouse split) | 15 (warehouse merged) |
| Per-module index files using 5-key wrapper | 0 | 15 |
| Sum of per-module entries | 542 (28 dupes from haiku) | 514 |
| Settings index entries | 37 | 31 (–6 moved) |
| Multi-site / oee / scanner / technical entries | 27 / 27 / 41 / 47 | 28 / 28 / 42 / 50 |
| NPD per-module entries | 47 | 51 (4 backfilled from master: `gate_checklist_panel`, `advance_gate_modal`, `gate_approval_modal`, `approval_history_timeline`) |
| Off-canon `ui_pattern=dashboard` | 1 | 0 |
| Off-canon `interaction=view` | 1 | 0 |
| Translation-notes coverage gaps | 15 | 0 (11 stubs added; 4 npd were false positives in audit because labels appear with both bare + prefixed forms in notes) |
| `depends_on_prototypes` total refs | 784 (master only counted in audit) → re-counted post-wrap = 1656 (master + per-module) | 1656 |
| Canonical (`#`, `primitive:`, or master label) | ~99/784 master = 12.6% (audit-stated) | 1650/1656 = **99.6%** |
| Unresolved sentinel | n/a | 6 (single pattern: `unresolved:_shared/`) |
| `_archive/` subfolder | absent | present, 2 files |
| `README.md` documenting conventions | absent | present |

---

## 3. Deferred items

### 3.1 The 6 `unresolved:_shared/` references

Bare `_shared/` (no component name after the slash) cannot be auto-resolved.
These appear to be data-entry stubs where the original author meant to type a
component but left it blank.

**Proposed human action:** Open the 6 affected entries and fill in the
intended component (likely `Modal`, `Field`, or similar primitive — to be
determined by reading the file/lines context).

To find them:

```bash
grep -rn "unresolved:_shared/" _meta/prototype-labels/
```

### 3.2 Items intentionally NOT addressed (out of scope per brief)

- **MED 10–13, LOW 14–15** — out of scope; this fix targeted only BLOCKERS + HIGH.
- **Physical JSX file moves for HIGH 6** — kept logical reclassification only.
  Physical moves would touch BACKLOG.md and MODAL-SCHEMA.md cross-refs and
  warrant a separate ticket.
- **`estimated_translation_time_min` >90 violations (175 entries)** — flagged in
  audit as MED 13; not touched. Likely needs SKILL.md bound update rather than
  data migration.
- **5 content-orphan JSX files** (`_shared/modals.jsx`, `maintenance/sanitation.jsx`,
  `npd/d365-screens.jsx`, `planning/suppliers.jsx`, `settings/onboarding-screens.jsx`)
  — flagged as MED 12; not indexed.

### 3.3 Audit false-positive: NPD translation-notes

Audit listed 4 npd labels as missing notes (`gate_checklist_panel`,
`advance_gate_modal`, `gate_approval_modal`, `approval_history_timeline`).
Re-running the substring-match scan after BLOCKER 3 wrap shows **0 missing** in
npd. Likely the audit's substring scan didn't account for the bare/prefixed
label dual-presence in `translation-notes-npd.md`. No action needed.

---

## 4. Verification script output

Script: `_meta/audits/_verify.py`
Run: `python3 _meta/audits/_verify.py`

```
  [PASS] master-index has 514 entries — actual=514
  [PASS] all 15 per-module indexes have 5-key wrapper
  [PASS] sum of per-module entries equals master entries — per-module=514, master=514
  [PASS] no bare-primitive depends_on_prototypes remain — found=0
       dep distribution: {'label': 534, 'primitive': 600, 'hash': 516, 'unresolved': 6}
  [PASS] no 'other' (uncanonicalized) deps — other=0
  [PASS] gate_checklist_panel.ui_pattern == dashboard-tile — actual=dashboard-tile
  [PASS] approval_history_timeline.interaction == read-only — actual=read-only
  [PASS] npd gate_checklist_panel.ui_pattern == dashboard-tile — actual=dashboard-tile
  [PASS] npd approval_history_timeline.interaction == read-only — actual=read-only
  [PASS] moved entries not present in settings — intersection=set()
  [PASS] sites_screen present in multi-site/per-module
  [PASS] shifts_screen present in oee/per-module
  [PASS] devices_screen present in scanner/per-module
  [PASS] products_screen present in technical/per-module
  [PASS] boms_screen present in technical/per-module
  [PASS] partners_screen present in technical/per-module
  [PASS] master has technical_boms_screen
  [PASS] master has oee_shifts_screen
  [PASS] master has technical_products_screen
  [PASS] master has multi-site_sites_screen
  [PASS] master has scanner_devices_screen
  [PASS] master has technical_partners_screen
  [PASS] _archive/ subfolder exists
  [PASS] _archive/prototype-index-warehouse-haiku.json exists
  [PASS] _archive/translation-notes-warehouse-haiku.md exists
  [PASS] prototype-index-warehouse.json (canonical) exists
  [PASS] translation-notes-warehouse.md (canonical) exists
  [PASS] warehouse-sonnet.json renamed (no longer at original path)
  [PASS] warehouse-haiku.json moved out of main dir

=== 29 PASS / 0 FAIL ===
```

All 29 assertions pass.

---

## 5. Git diff statistics

```
21 files changed, 17312 insertions(+), 14942 deletions(-)
```

Modified (M):
- `_meta/prototype-labels/master-index.json` — HIGH 4, HIGH 5, HIGH 6 master re-tags, HIGH 9 dep normalization
- `_meta/prototype-labels/prototype-index-{15 modules}.json` — BLOCKER 3 wrap + HIGH 9 dep normalization (+ HIGH 6 destinations + npd HIGH 4/5 backfill)
- `_meta/prototype-labels/translation-notes-finance.md` — +13 lines (HIGH 8 stub: cost_center_gl_mapping_modal)
- `_meta/prototype-labels/translation-notes-reporting.md` — +67 lines (HIGH 8 stubs × 10)

Deleted (D):
- `_meta/prototype-labels/prototype-index-warehouse-haiku.json` (moved to `_archive/`)
- `_meta/prototype-labels/prototype-index-warehouse-sonnet.json` (renamed to `prototype-index-warehouse.json`)
- `_meta/prototype-labels/translation-notes-warehouse-haiku.md` (moved to `_archive/`)
- `_meta/prototype-labels/translation-notes-warehouse-sonnet.md` (renamed to `translation-notes-warehouse.md`)

Untracked (??):
- `_meta/prototype-labels/_archive/` (new dir, 2 archived files)
- `_meta/prototype-labels/prototype-index-warehouse.json` (canonical; was sonnet)
- `_meta/prototype-labels/translation-notes-warehouse.md` (canonical; was sonnet)
- `_meta/prototype-labels/README.md` (BLOCKER 2 documentation)
- `_meta/audits/2026-04-30-prototype-labeling-fix-report.md` (this file)
- `_meta/audits/_apply_fixes.py`, `_apply_fixes_part2.py`, `_apply_fixes_part3.py`, `_apply_fixes_part4.py`, `_verify.py` (fix scripts)
- `_meta/audits/_fix_state.json`, `_verify_results.json` (machine-readable run logs)

---

## 6. Files to keep / cleanup

The fix scripts (`_meta/audits/_apply_fixes*.py`, `_verify.py`) and JSON state
logs are kept for reproducibility / audit trail. They can be moved into
`_archive/` or deleted at any time without affecting the data.

Recommended next steps (not part of this fix):

1. Resolve the 6 `unresolved:_shared/` deps (search command above).
2. Fill in the 11 audit-generated translation-notes stubs with real prose
   (search for `audit-generated stub` in `translation-notes-*.md`).
3. Address the MED + LOW items from the original audit in a follow-up fix.
4. Update SKILL.md to reflect the new `depends_on_prototypes` syntax sentinels
   (`primitive:`, `unresolved:`).
