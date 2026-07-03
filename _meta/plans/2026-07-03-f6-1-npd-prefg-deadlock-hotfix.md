# Wave F6.1 — NPD pre-FG field deadlock hotfix

Date: 2026-07-03 · Orchestrator: Fable · Trigger: owner hit the deadlock live on first walk.

## The bug (owner-reported, confirmed in code)

Mutual block at the Brief stage:

1. `load-stage-dept-sections.ts` stores/reads dept-field values on `public.product`
   via `npd_projects.product_code`. When `product_code IS NULL` it marks EVERY field
   `readOnly` (`noFgLinked`).
2. The FG/product row is only created at **G3** (`createFgCandidate` in
   `_lib/gate-helpers.ts`, wired to the header FG-candidate modal).
3. `getStageRequiredFieldsStatus` (same loader) still counts the required Core fields
   (`Product Name`, `Pack Size`, `Recipe Components`) → the brief→recipe gate returns
   `SOFT_GATE_BLOCKED` listing fields the user **cannot fill** → only escape is
   override-with-note. Two absences block each other.

Root cause: NPD-v2 decision D1/D2 (project = FG, long-tail values in
`npd_projects.field_values` jsonb — **mig 387, applied live**) was never wired; F5's
stage-section engine pointed reads/writes exclusively at `public.product`.

## Fix design (finishes D1/D2)

Project is the editable home of dept-field values until the FG exists; values
transfer to the product at FG creation/mapping.

- **Read (pre-FG):** loader resolves values from `to_jsonb(npd_projects.*)` +
  `field_values` jsonb (direct columns win; alias `product_name` ↔ `npd_projects.name`).
  Fields editable (readOnly only for auto/formula). `no_fg_linked` stays as an
  informational flag.
- **Write (pre-FG):** `saveStageDeptField` gains a project-scoped path — same dept
  RBAC (`npd.<dept>.write` via `Reference.DeptColumns`), same value validation as
  `updateFaCell` (shared helpers extracted to a non-`'use server'` `_lib` module),
  writes the aliased/direct project column when it physically exists
  (information_schema whitelist) else `field_values` jsonb; audit via outbox.
- **Transfer:** `ensureFgCandidateMapped` copy-over extended: every org catalog field
  with a project value → matching physical `public.product` column, coalesce-only
  (never clobbers), identifier-safe; `recipe_components` triggers
  `sync_prod_detail_rows` like the normal edit path.
- **Gate:** `getStageRequiredFieldsStatus` reuses the loader → sees project values →
  brief gate becomes satisfiable WITHOUT override. No gate-hardness change.
- **UI:** banner flips from amber "read-only" warning to neutral "values save on the
  project, transfer at G3" (i18n copy updated, 4 locales); hardcoded EN strings in
  `StageDeptSections` threaded through `npd.stageDeptSections.*`; advance-modal
  duplicate soft-block list deduped (F5 escape #2).

## Lanes

| Lane | Engine | Scope |
|---|---|---|
| H1 | Codex (codex-rescue) | loader values+editability, project write path + shared validation extraction, copy-over at FG create/map, unit tests |
| H2 | Composer (cursor-rescue) | StageDeptSections banner/labels + editable pre-FG, advance-modal dedup, RTL tests (ui config) |
| H3 | Opus (post-deploy) | **full NPD logic walk** on production: create → Brief (fill Core, NO override) → advance → … → as far as prod data allows; every gate/modal judged for logical satisfiability, not just mechanics |

File ownership is disjoint (H1 = actions/_lib, H2 = components/_modals); i18n JSONs
edited only by the orchestrator (already done).

## Gate & deploy

tsc + targeted vitest (default config for .ts, `vitest.ui.config.ts` for .tsx) +
`pnpm --filter web build` by orchestrator → commit → push via mk_push → Vercel READY →
H3 Opus logic walk → owner notified to run his own full walk.

## Process change (standing, owner mandate 2026-07-03)

After EVERY wave: an **Opus browser LOGIC walk** of the touched flow end-to-end on
production — not only "does it render / does the action succeed" but "is the flow
logically passable: can every gate's requirements actually be satisfied at that stage;
do modals/copy tell the truth; no mutually-blocking requirements". Recorded in
`docs/workflow/02-QUALITY-GATES.md` + skills + memory. Wave reports: HTML format.
