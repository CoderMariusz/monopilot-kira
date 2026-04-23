---
name: prototype-labeling
description: Label prototype JSX components with 5-dimensional taxonomy + translation notes for production reuse. Use when Haiku agent is dispatched to scan a Monopilot design system module (design/Monopilot Design System/<module>/) and produce prototype-index JSON + translation-notes markdown. Produces consumable input for T3 UI atomic task pre-hooks.
version: 1.0.0
model: haiku
canonical_spec: _meta/plans/atomic-task-decomposition-guide.md §12
---

# Prototype Labeling Skill (Haiku)

**Purpose:** produce a standardized label-index + translation-notes for one prototype module so future T3 UI atomic tasks receive pre-loaded JSX snippets + translation checklist + shadcn equivalents instead of writing components from blank.

**Why Haiku (not Opus):** this is rote extraction + classification work — pattern-match on JSX structure, apply taxonomy, write structured JSON. ~60x cheaper than Opus. Opus's architectural thinking is wasted here; saved for the T3 translation step that USES this output.

## When to use

- Haiku agent is dispatched with a target module path (e.g., `design/Monopilot Design System/warehouse/`)
- Goal is to produce labeled index of reusable components
- Output will be consumed by T3 UI atomic task pre-hooks OR operator review (pilot phase)
- First-pass labeling OR re-labeling after prototype changes (maintenance mode)

**Do NOT use this skill when:**
- Writing production code (translation happens in T3 tasks, not here — skill produces notes for that)
- Labeling backend-only prototypes (this skill is for visual UI prototypes)
- Full 15-module rollout BEFORE pilot has validated taxonomy + schema

## Required reading (load in this order, be selective)

1. `_meta/plans/atomic-task-decomposition-guide.md` §12 — canonical spec (this skill is a Haiku-optimised adapter of §12)
2. `design/Monopilot Design System/BACKLOG.md` — known bug list; needed for `known_bugs` field cross-reference. Filter by `BL-<target-module-abbrev>-*` entries.
3. `design/Monopilot Design System/_shared/MODAL-SCHEMA.md` (if present) — production porting contract, informs translation notes
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

For each entry, grep `design/Monopilot Design System/BACKLOG.md` for module-prefixed bugs (`BL-NPD-*`, `BL-WH-*`, etc.) that affect this specific component. Add bug ID to `known_bugs` array. If bug is resolved (per BACKLOG line annotation), still include with note or omit — prefer omit for clean labels.

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

## Maintenance workflow

When prototype for a module changes:
1. Re-invoke this skill for that 1 module (~30 min wall-clock for Haiku)
2. Merge updated module index into `master-index.json`
3. Flag T3 tasks whose `prototype_ref` references entries with changed labels/lines — these tasks need re-review before dispatch

Do NOT delete historical entries — future replay may need them.

## Version history

- v1.0.0 (2026-04-23) — initial, canonical Haiku labeling adapter of `_meta/plans/atomic-task-decomposition-guide.md` §12. Supports pilot + full modes, 5-dim taxonomy, output contract aligned with pre-hook consumer pattern.
