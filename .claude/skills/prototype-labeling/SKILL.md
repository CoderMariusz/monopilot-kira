---
name: prototype-labeling
description: Two-phase Haiku workflow for prototype-driven task development. Phase 1 = label prototype JSX components with 5-dimensional taxonomy + translation notes. Phase 2 = batch-link atomic task JSONs to index entries so ACP agents read 20-line entries instead of 800-line JSX files. Use after prototypes change, after PRD decomposition adds new tasks, or as the standard close-out for any module-level UI work.
version: 1.1.0
model: haiku
canonical_spec: _meta/plans/atomic-task-decomposition-guide.md §12
---

# Prototype Labeling Skill (Haiku) — two-phase workflow

**Purpose:** keep task JSONs and prototype label index in sync, so every ACP agent executing a T3-ui task can read a pre-built 20-line JSON entry (lines, ui_pattern, shadcn primitives, translation notes, known bugs) instead of opening 800 lines of raw JSX.

**Two phases, run in this order:**
- **Phase 1: Label** — scan prototype JSX, produce/refresh `prototype-index-<module>.json` + `translation-notes-<module>.md` (this skill's original job)
- **Phase 2: Link** — batch-update every task JSON in the same module's `atomic-tasks/<module>/tasks/` directory to add `pipeline_inputs.prototype_index_ref` pointing into the index

Both phases run as Haiku — rote extraction + JSON manipulation, no architectural thinking. Opus tokens are saved for the actual T3 implementation work that consumes both outputs.

**When to run:**
- Prototype JSX was modified (new component added, lines shifted, screen removed) → run both phases
- PRD decomposition added new task JSONs → run Phase 2 only (index still current)
- Index is missing entirely for a module → run Phase 1 only first, then Phase 2
- Settings/NPD-style audit shows `prototype_index_ref` coverage below 80% of T3-ui → run Phase 2

**Why Haiku (not Opus):** this is rote extraction + classification + string-matching work. ~60x cheaper than Opus. Architectural thinking is wasted here — save it for T3 translation.

## Phase 1: Label (produce index)

**When to use Phase 1:**
- Haiku agent is dispatched with a target module path (e.g., `prototypes/design/Monopilot Design System/warehouse/`)
- Goal is to produce labeled index of reusable components
- Prototype JSX changed (lines shifted, new components, removed components)
- Initial labeling for a module that has no index yet

**Do NOT run Phase 1 when:**
- Writing production code (translation happens in T3 tasks, not here)
- Labeling backend-only prototypes (this skill is for visual UI prototypes)
- Full 15-module rollout BEFORE pilot has validated taxonomy + schema
- Just adding new tasks that reference an already-current index → skip to Phase 2

## Required reading (load in this order, be selective)

1. `_meta/plans/atomic-task-decomposition-guide.md` §12 — canonical spec (this skill is a Haiku-optimised adapter of §12)
2. `prototypes/design/Monopilot Design System/BACKLOG.md` — known bug list; needed for `known_bugs` field cross-reference. Filter by `BL-<target-module-abbrev>-*` entries.
3. `prototypes/design/Monopilot Design System/_shared/MODAL-SCHEMA.md` (if present) — production porting contract, informs translation notes
4. Target module's JSX files — ONLY these, not other modules. Prefer `modals.jsx` as primary source (most components live there).

**Do NOT read:**
- Other modules' JSX (scope is one module per invocation)
- Full `_shared/modals.jsx` source (reference only, don't copy)
- Any PRD / docs unrelated to current module

## Output contract (exact)

### File 1: JSON index

**Path:** `_meta/prototype-labels/prototype-index-<module>.json` (or `_meta/prototype-labels/pilot/prototype-index-<module>.json` in pilot mode)

**Shape:**

```json
{
  "module": "<module-name>",
  "generated_at": "<ISO-8601-timestamp>",
  "generator": "haiku via prototype-labeling skill v1.0.0",
  "mode": "pilot | full",
  "entries": [
    {
      "label": "<pattern>_<domain>_<interaction>",
      "file": "<relative-path-from-repo-root>",
      "lines": "<NNN-NNN>",
      "component_type": "modal | form | table | wizard | stepper | sidebar | tabs | dashboard-tile | page-layout",
      "ui_pattern": "crud-form-with-validation | search-filter-list | detail-view | multi-step-wizard | dashboard-tile | list-with-actions | wizard-step | bulk-action | import-export",
      "data_domain": "<entity-name>",
      "interaction": "create | edit | delete | read-only | bulk | import | export | approve | sign-off | confirm",
      "complexity": "primitive | composite | page-level",
      "depends_on_prototypes": ["_shared/modals.jsx#Modal", "..."],
      "translation_notes": [
        "<prototype-pattern> → <production-equivalent>",
        "... min 4 bullets, specific, not filler"
      ],
      "shadcn_equivalent": ["Dialog", "Form", "FormField", "..."],
      "known_bugs": ["BL-<module>-<NN>", "..."],
      "estimated_translation_time_min": <int 15-90>
    }
  ]
}
```

**JSON validity:** must pass `python -m json.tool` check. If that tool unavailable, manually validate: balanced braces/brackets, no trailing commas, all strings double-quoted, all fields present.

### File 2: Translation notes

**Path:** `_meta/prototype-labels/translation-notes-<module>.md` (or `pilot/translation-notes-<module>.md`)

**Structure:**

```markdown
# Translation notes — <module>

Generated <date> by Haiku via prototype-labeling skill v1.0.0. This file is the human-readable companion to `prototype-index-<module>.json`.

## Intro
2-3 sentences: what this file is, who consumes it, how to use it.

## Per-component notes

### <label>
**Location:** <file>:<lines>
**Translation checklist:**
- [ ] Replace window.<X> → <production equivalent>
- [ ] Convert <pattern> → <production pattern>
- [ ] Wire Server Action <name>
- [ ] Add RBAC guard <permission>
- [ ] Emit outbox event <event-name>
- [ ] Replace hardcoded labels → next-intl keys
- [ ] Fix known bug BL-XX (if applicable)

**Shadcn imports:** Dialog, Form, FormField, Input, ...

**Known bugs:** BL-<module>-<NN> (if any)

---

(repeat per component)

## Common patterns in this module
2-4 paragraphs: patterns that repeat across many components (e.g., "All CRUD modals use _shared/Modal + _shared/Field", "Most forms follow step-by-step wizard pattern with Summary step at end").
```

### File 3: Pilot summary (PILOT MODE ONLY)

**Path:** `_meta/prototype-labels/pilot/PILOT-SUMMARY-<module>.md`

~100-200 lines:
- Pilot date + module + entry count
- Taxonomy coverage: count of each value per dimension
- Skipped / unclassifiable components with reasons
- Sum of `estimated_translation_time_min` across all entries
- Self-assessment: which 2-3 entries have most uncertain taxonomy assignments
- Recommendation: `READY for 15-module fleet` / `TAXONOMY-TWEAKS: <what>` / `SCHEMA-GAPS: <what>`

## 5-dimensional taxonomy (enforced)

**Every entry MUST have non-null values for all 5 dimensions.**

### Dimension 1: component_type

One of: `modal` / `form` / `table` / `wizard` / `stepper` / `sidebar` / `tabs` / `dashboard-tile` / `page-layout`

Pick the MOST SPECIFIC applicable. E.g., a modal that contains a form is `modal` not `form` — the outer container dominates.

### Dimension 2: ui_pattern

One of: `crud-form-with-validation` / `search-filter-list` / `detail-view` / `multi-step-wizard` / `dashboard-tile` / `list-with-actions` / `wizard-step` / `bulk-action` / `import-export`

This is the behavioural pattern. A `modal` might have pattern `crud-form-with-validation` (for create/edit) or `confirm` (for delete confirms) or `detail-view` (for read-only display).

### Dimension 3: data_domain

String value — the primary entity the component operates on. Monopilot common domains:

| Module | Typical domains |
|---|---|
| npd | Brief, FA, ProdDetail |
| settings | Role, User, Org, Reference (specific table like DeptColumns, PackSizes) |
| technical | Spec, BOM, Allergen |
| planning | PO, TO, WO, CustomerOrder |
| warehouse | LP, GRN, PickList, StockLevel, LocationMove, CycleCount, Adjustment |
| scanner | ScanSession, PickJob, ConsumeJob |
| production | WO (execution), Changeover, Downtime, Output |
| quality | NCR, QualityHold, Inspection, HACCP, CCP |
| finance | CostEntry, Yield, Waste |
| shipping | Shipment, SO, RMA |
| reporting | Dashboard, Report, Export |
| maintenance | WR, MWO, Asset, Calibration |
| multi-site | Site, SitePermission, InterSiteTO |
| oee | OEEMetric, DowntimeReason, AvailabilityLoss |

If component spans multiple domains (e.g., a generic table used by 3 entities), pick the HARDEST-LINKED one or use parent domain.

### Dimension 4: interaction

One of: `create` / `edit` / `delete` / `read-only` / `bulk` / `import` / `export` / `approve` / `sign-off` / `confirm`

If component supports multiple (e.g., modal with both create + edit), emit SEPARATE entries with distinct labels.

### Dimension 5: complexity

- `primitive`: basic building block (Button, Input, Label, single-field)
- `composite`: contains multiple primitives or fields (form, modal with 5 fields, table row renderer)
- `page-level`: full screen / route entry (dashboard, list page, detail page)

## Label naming convention

Format: `<pattern>_<domain>_<interaction>`

Examples:
- `crud_modal_create_lp` — CRUD modal for creating an LP (warehouse)
- `detail_view_fa_read_only` — FA detail page (npd)
- `multi_step_wizard_edit_brief` — Brief editor wizard (npd)
- `search_filter_list_po` — PO search/filter list (planning)
- `confirm_modal_delete_ncr` — NCR deletion confirm (quality)
- `page_layout_dashboard_wh` — Warehouse dashboard page (warehouse)

**Rules:**
- Lowercase, snake_case, ASCII only
- No abbreviations unless standard (lp, fa, po, wo, ncr, grn, sscc, gtin OK)
- Start with pattern word, then domain, then interaction
- No trailing underscores or numbers unless disambiguating multiple similar (e.g., `crud_modal_create_lp_single` vs `crud_modal_create_lp_bulk`)

## Translation notes rules

Every entry MUST have min 4 bullets in `translation_notes[]`. Each bullet:

- Format: `<prototype-fragment> → <production-fragment>` (arrow between)
- Concrete, not generic. BAD: "Improve validation". GOOD: "Inline `if (!name) alert(...)` → Zod schema `z.string().min(1).max(100)` + RHF form state"
- Cover these categories (minimum):
  1. UI primitive replacement (window.Modal → Radix Dialog)
  2. Form state management (useState → RHF + Zod)
  3. Data source (mock → Drizzle query in parent Server Component)
  4. Side-effect / persistence (handler → Server Action + outbox event)

Optional additional bullets:
- i18n: hardcoded labels → next-intl keys
- RBAC: add permission guard
- Accessibility: missing aria attributes
- Error states: add loading/error boundaries
- Empty state: improve placeholder

## shadcn_equivalent mapping

Typical mappings (not exhaustive — use your judgement):

| Prototype primitive | shadcn component |
|---|---|
| window.Modal | Dialog + DialogContent + DialogHeader + DialogTitle + DialogFooter |
| Field (from _shared) | FormField + FormLabel + FormControl + FormMessage |
| Input row | Input |
| Select dropdown | Select + SelectTrigger + SelectContent + SelectItem |
| Action button | Button |
| Data table | Table + TableHeader + TableBody + TableRow + TableCell |
| Tab nav | Tabs + TabsList + TabsTrigger + TabsContent |
| Toast | Sonner (shadcn toast v2) |
| Stepper | Custom or built with nav primitives (no direct shadcn) |

## Known bugs cross-reference

For each entry, grep `prototypes/design/Monopilot Design System/BACKLOG.md` for module-prefixed bugs (`BL-NPD-*`, `BL-WH-*`, etc.) that affect this specific component. Add bug ID to `known_bugs` array. If bug is resolved (per BACKLOG line annotation), still include with note or omit — prefer omit for clean labels.

## Execution workflow

1. **Read canonical spec section** — `_meta/plans/atomic-task-decomposition-guide.md` §12 (10 sub-sections)
2. **Read BACKLOG.md** — filter to target module's `BL-<abbrev>-*` entries
3. **Read target module files** — prefer `modals.jsx` first, then screens/dashboard/shell; stop when you have enough to classify every reusable component
4. **Identify components** — walk JSX, find named exports, component-like functions, reusable JSX blocks (3+ usages)
5. **Classify each across 5 dimensions** — apply taxonomy rules above
6. **Write translation notes per entry** — min 4 bullets, concrete, pattern-based
7. **Cross-ref BACKLOG** for `known_bugs`
8. **Emit JSON + markdown files** per output contract above
9. **(Pilot mode only)** — emit `PILOT-SUMMARY-<module>.md` with recommendation

## Constraints

- **Do NOT modify any prototype files** — labeling is read-only on prototypes
- **Do NOT commit** — operator reviews output first
- **Do NOT read other modules** — scope is strictly one module per invocation
- **Stay under 100k context** — `modals.jsx` files can be 3000+ lines; read selectively (scan + jump to component boundaries)
- **Emit valid JSON** — corrupted JSON blocks downstream consumption
- **Non-null taxonomy** — every entry has all 5 dimensions populated (no `null`, no missing field)
- **Min 4 translation_notes bullets** — never 3, never filler

## Report format (end of invocation)

~200-400 words markdown:

1. **Entry count** + breakdown by `component_type` (e.g., "modal: 16, composite: 2, page-level: 3 = 21 total")
2. **File paths** of output files (JSON + notes + pilot summary if applicable)
3. **JSON validity** — confirm `python -m json.tool` passed (or: describe manual validation)
4. **3 most uncertain classifications** — entries where taxonomy assignment has highest uncertainty
5. **Taxonomy issues** — any dimension that didn't fit cleanly? (e.g., "component X could be `bulk` or `import`")
6. **Translation time estimate** — sum of `estimated_translation_time_min` across all entries
7. **Readiness** (pilot mode) — `READY` / `TAXONOMY-TWEAKS: <what>` / `SCHEMA-GAPS: <what>`
8. **Budget used** — approx context tokens consumed

## Integration with downstream (T3 tasks)

This skill's output feeds a pre-hook at T3 UI atomic task dispatch:

```
on T3 task dispatch:
  if task.prototype_ref is not null:
    load master-index.json
    entry = find_by_label(task.prototype_ref)
    jsx = readLines(entry.file, entry.lines)
    prepend_to_agent_context:
      - "## Prototype reference (FROM {entry.file}:{entry.lines})"
      - "```jsx\n{jsx}\n```"
      - "## Translation checklist\n{task.translation_checklist}"
      - "## Shadcn equivalents\n{entry.shadcn_equivalent}"
      - "## Known bugs to fix\n{entry.known_bugs}"
  dispatch_agent(opus_or_gpt5_4)
```

Context budget impact: snippet ~3-8k + notes ~1-2k + task spec ~3-5k = ~7-15k overhead, leaving ~85k for agent implementation work. Safe margin.

## Phase 2: Link (wire tasks to index)

**Goal:** for every task JSON in `_meta/atomic-tasks/<module>/tasks/T-*.json` that builds a real UI screen, add `pipeline_inputs.prototype_index_ref` pointing at its matching index entry. This is the field consumed by the ACP pre-hook; without it the agent falls back to reading raw JSX.

**Why this is a separate Haiku phase:** Phase 1 produces the index, Phase 2 wires it into the consumer surface (task JSONs). Doing it manually leaks tokens; doing it with Opus is overkill — it's string-matching plus careful JSON edits.

**Input:**
- Index from Phase 1: `_meta/prototype-labels/prototype-index-<module>.json`
- Tasks: `_meta/atomic-tasks/<module>/tasks/T-*.json`

**Output:** each eligible task JSON has new field
```json
"pipeline_inputs": {
  ...,
  "prototype_index_ref": "_meta/prototype-labels/prototype-index-<module>.json#<label>",
  "prototype_index_entry": "<label>"
}
```

### Eligibility rules — skip these tasks

A task does NOT get a `prototype_index_ref` if any of these match:

- `task_type` ∈ {`T0-root`, `T1-data`, `T1-schema`, `T2-server`, `T2-api`, `T2-rpc`}
- `category` ∈ {`data`, `backend`, `server`, `parity`, `auth`, `docs`, `infra`, `test`}
- `prototype_match` is `false` AND no closest path can be inferred from prompt body

Eligible: `task_type == "T3-ui"` OR `category == "ui"`.

### Mapping algorithm (apply in order)

For each eligible task, find the matching index entry by trying these in priority:

1. **Direct path match** — task already has `prototype_path` (e.g., `"ops-screens.jsx:247-383"`). Parse file + line range. Find index entry whose `file` matches and whose `lines` overlap. Confidence: HIGH.

2. **Label match on entry field** — task has `prototype_index_entry` already (as a string like `"global_import_export_screen"` or with suffix like `"users_screen (closest pattern …)"`). Extract base label before any `(` or whitespace. Lookup directly in index by `label` field. Confidence: HIGH if exact, MEDIUM if suffix-stripped.

3. **JSX reference in prompt** — prompt body contains `<file>.jsx:NNN-NNN`. Same overlap check as (1). Confidence: HIGH.

4. **Screen name from title/subcategory** — task title or subcategory like `SET-029 Global Import / Export` or `Schema Shadow Preview`. Convert to snake_case (`global_import_export_screen`, `schema_shadow_preview_screen`) and look up. Confidence: MEDIUM. Verify with one keyword match against the entry's translation_notes / spec hint.

5. **Unmapped** — none of the above. Leave task untouched, list in final report.

### Edit rules

- Use the `Edit` tool, one task = one Edit when possible. Do NOT use `Write` (would lose original formatting).
- ONLY add/modify `prototype_index_ref` and `prototype_index_entry` inside `pipeline_inputs`. Do NOT touch `prompt`, `details`, `acceptance_criteria`, or any other field.
- If `prototype_index_entry` already had a free-form suffix (e.g., `"users_screen (closest pattern — invited-users status column)"`), normalise it to the bare label if confidence is HIGH; preserve suffix if confidence is MEDIUM.
- Preserve JSON `indent=2, ensure_ascii=False` style — match existing file formatting.
- DO NOT commit. Operator commits after reviewing the report.

### Report format (Phase 2)

Under 300 words. Include:

1. **Counts:**
   - Total tasks scanned
   - T3-ui tasks
   - T3-ui now with `prototype_index_ref` (numerator / denominator)
   - Tasks skipped by type/category (with breakdown by skip reason)
   - Tasks unmapped (needs human review)

2. **Unmapped list:** one line per task — `T-NNN | <reason>` (e.g., `T-041 | onboarding-screens.jsx has no top-level components in index`)

3. **Confidence breakdown:** how many mappings used rule 1 / 2 / 3 / 4 above

4. **Coverage target:** if T3-ui mapped coverage is below 80%, recommend Phase 1 re-scan to fill gaps

### Common gotchas

- **Stale lines in index** — if Phase 1 wasn't re-run after prototype lines shifted, Phase 2 still maps correctly by label, but ACP pre-hook will read wrong lines. Always run Phase 1 first if prototypes were modified.
- **Free-form entry suffixes** — tasks created via PRD decomposition often have `prototype_index_entry` with explanatory text. Strip parens-delimited suffixes when looking up; preserve them in the field if no exact label exists.
- **Closest-pattern tasks** — task has `prototype_match: false` but `prototype_closest_path` is set. Still map it — write `prototype_index_ref` pointing to the closest entry. Pre-hook displays it with a "closest pattern" hint.
- **Index entry not found for a known screen** — means Phase 1 missed it. Flag in report, run Phase 1 re-scan, then re-run Phase 2.

## Two-phase orchestration template

When operator says "run prototype-labeling for `<module>`" without phase qualifier, default to running both phases sequentially:

1. Dispatch Haiku agent for Phase 1 → produces `prototype-index-<module>.json` + `translation-notes-<module>.md`
2. Wait for Phase 1 completion. Review entry count, line accuracy, taxonomy distribution.
3. Dispatch Haiku agent for Phase 2 → updates task JSONs.
4. Wait for Phase 2 completion. Review unmapped count.
5. Operator reviews + commits + creates PR.

If operator says "phase 1 only" or "label only" → run Phase 1, stop. If operator says "phase 2 only" or "link only" or "wire tasks" → run Phase 2, stop.

## Maintenance workflow

When prototype for a module changes:
1. Re-invoke Phase 1 for that 1 module (~30 min wall-clock for Haiku)
2. Re-invoke Phase 2 for the same module — captures new entries and corrected line numbers in task refs
3. Flag T3 tasks whose `prototype_index_ref` references entries with changed labels — these tasks need re-review before dispatch

When PRD decomposition adds new tasks to a module:
1. Phase 1 stays (no prototype change)
2. Run Phase 2 only — links the new tasks to existing index

Do NOT delete historical entries — future replay may need them.

## Version history

- v1.1.0 (2026-05-13) — added Phase 2 (task linking) as a first-class part of this skill. Two-phase orchestration template + eligibility rules + 4-priority mapping algorithm + common gotchas. Drives `prototype_index_ref` coverage on T3-ui task JSONs from ~0% to ~80%+ per module.
- v1.0.0 (2026-04-23) — initial Phase 1 only, canonical Haiku labeling adapter of `_meta/plans/atomic-task-decomposition-guide.md` §12. Supports pilot + full modes, 5-dim taxonomy, output contract aligned with pre-hook consumer pattern.
