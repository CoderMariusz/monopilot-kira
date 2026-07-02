# NPD claim-vs-reality audit — repo @ main `1ca532d0` (2026-07-02)

Read-only. Evidence is file:line in the LIVE tree (`.claude/worktrees/*` copies ignored).

## Findings table

| ID | Claim | Verdict | Evidence (file:line) |
|----|-------|---------|----------------------|
| 1 | Settings NPD-fields with stage assignments (brief/packaging/trial) do NOT render on stage screens | **CONFIRMED** | `stage_code` is WRITE-ONLY. Only writers/readers of `stage_code` are the settings screen itself: `settings/npd-fields/_actions/npd-field-config.ts:593,595,601,624` (write), `.../get-department-field-config.ts:64,104` (settings own loader). grep of `apps/web` shows ZERO `stage_code` reader in any `pipeline/[projectId]/**` stage page. No pipeline stage page imports `npd_field_catalog`/`npd_department_field` at all. |
| 2 | Catalog entries locked / delete refuses | **REFUTED (as stated)** | Edit + delete fully wired: `npd-field-config.ts:533 deleteField`, `:381 deleteDepartment`, `:633 removeAssignment`, `:459 updateField`, `:611 updateAssignment`. Page passes them: `settings/npd-fields/page.tsx:5,199-200`. Only guards: field un-deletable **while assigned** (`field_in_use`, `npd-field-config.ts:547-558`; UI disables Delete when `assignment_count>0`, `npd-fields-screen.client.tsx:38-44`); `core` dept immutable (`:395-397, :346-348`). No `is_system` flag; nothing seeded that delete refuses once unassigned. |
| 3 | Departments enable/disable toggle ignored — FG dashboard shows ALL departments even when disabled | **CONFIRMED** | Toggle writes `npd_departments.active` (`npd-field-config.ts:363-368` via `setDepartmentActive`). FG dashboard per-dept cards read a HARDCODED 7-row VALUES list off `public.product.done_*`, never joining `npd_departments`, never filtering `active`: `(npd)/dashboard/_actions/get-dashboard-summary.ts:7 DEPTS`, `:140-193 readPerDept` (`dept_rows(...) values ('core',...)('procurement',...)`). Disabling a dept has zero effect on the dashboard. (FG DETAIL page DOES honor active — `fg/[productCode]/page.tsx:301-311 readActiveDeptCodes` — so the split is dashboard-ignores vs detail-honors.) |
| 4 | Fields exist in catalog with zero renderers | **CONFIRMED (structural)** | Seed maps every dept to a `stage_code` (`386-seed-npd-catalog-on-org-insert.sql:77-87`: core→brief, planning→recipe, commercial→approval, production→pilot, technical→recipe, mrp/procurement→packaging). Because NO consumer reads `stage_code`, the entire per-stage dimension is unrendered. Catalog field VALUES are rendered by DEPARTMENT only on the FG/FA detail (`readDeptColumns`), so any catalog field whose dept is NOT one of the 7 canonical `DEPT_KEYS` also never renders (`fg/[productCode]/page.tsx:308-310` filters to `DEPT_KEYS`). See seed excludes `Done_*`,`Benchmark`,`Number_of_Cases` (`386...sql:66-68`). |
| 5 | Brief stage = per-department modules | **REFUTED** | Brief stage renders a STATIC hardcoded form (fixed labels: Product name/Category/Target launch/Pack format/…), reading `public.brief`+`public.brief_lines` only. No dept sections, no catalog: `pipeline/[projectId]/brief/page.tsx:65-113 DEFAULT_LABELS`, `:212-223 <ProjectBriefScreen>`, header comment `:11-19`. Per-dept modules exist ONLY on FG/FA detail (`FaSectionWrapper`), NOT on the brief stage. |
| 6 | Walk-blocking gates | **CONFIRMED (chain mapped; mostly catalog-INDEPENDENT)** | Pipeline advance hard gates (`advance-project-gate.ts` + `_lib/gate-helpers.ts`): (a) `RECIPE_INGREDIENTS_REQUIRED` leaving recipe (`gate-helpers.ts:315-322`); (b) `FG_ALREADY_LINKED` entering packaging (`:327-334`); (c) G3→G4 e-sign `assertG3ESignForApproval` (`advance:112-114`); (d) approval→handoff e-sign `assertG4ESignForHandoff` (`advance:119-122`); (e) launch closeout `close-out-legacy-stages.ts:171-189`: approved factory release + G4 approval + shelf_life + allergen-recompute stamp + pilot WO evidence + active BOM + `done_mrp OR closed_mrp='Yes'`. Gate checklist items are ADVISORY (`gate-helpers.ts:296-309`). **Only catalog coupling in the walk = the MRP closure**: `closed_mrp='Yes'` is set by `closeDeptSection`, which enforces catalog required-fields via `is_all_required_filled` (`close-dept-section.ts:92-101, 138-172`) — but `done_mrp=true` is an alternate path that bypasses the catalog. So a project can reach handover WITHOUT the catalog plumbing; the catalog only bites when the operator drives launch via the FG dept-close (MRP) route AND that dept has broken/empty required-field config. |
| 7 | A1(F3) "settings ↔ FA dynamic sections read the same catalog" true where? | **CONFIRMED SPLIT** | TRUE for FG/FA DETAIL: `fg/[productCode]/_actions/load-fa-dynamic-sections.ts:120-143` and `fg/[productCode]/page.tsx:256-288 readDeptColumns` both read `npd_departments`+`npd_department_field`+`npd_field_catalog`, rendered via `FaSectionWrapper`/`FaCoreTab` (`page.tsx:557-565,1607+,1740-1744`). FALSE for pipeline STAGE screens (claim 1). Both readers group by DEPARTMENT + filter `active`/`visible`+`required`; NEITHER reads `stage_code`. This department-vs-stage split is exactly what the owner is hitting. |

## Stage → catalog plumbing map

| Pipeline stage screen | Reads npd catalog? | Which store | stage_code respected? | What it actually renders |
|-----------------------|--------------------|-------------|-----------------------|--------------------------|
| brief `.../brief/page.tsx` | NO | — | n/a | static hardcoded brief form (`public.brief`/`brief_lines`) |
| formulation `.../formulation/page.tsx` | NO | — | n/a | recipe/formulation editor (ingredients/nutrition/allergen) |
| trial `.../trial/page.tsx` | NO | — | n/a | static trial form |
| sensory `.../sensory/page.tsx` | NO | — | n/a | static sensory form |
| pilot `.../pilot/page.tsx` | NO | — | n/a | static pilot form |
| packaging `.../packaging/page.tsx` | NO (only a packaging-ITEM catalog picker, line 316) | — | n/a | static packaging form + item picker |
| nutrition / costing | NO | — | n/a | static |
| approval `.../approval/page.tsx` | NO | — | n/a | gate approval + criteria |
| handoff `.../handoff/page.tsx` | NO | — | n/a | handoff checklist |
| gate `.../gate/page.tsx` | NO | — | n/a | gate checklist (advisory) |
| **FG/FA DETAIL** `fg/[productCode]` (NOT a pipeline stage) | **YES** | `npd_departments`+`npd_department_field`+`npd_field_catalog` (dynamic; `Reference.DeptColumns` retired, seeded FROM it via mig 370/386) | **NO — grouped by DEPARTMENT (SECTION_MAP), stage_code never queried** | per-dept sections (Core/Planning/Commercial/Production/Technical/MRP/Procurement) with dynamic fields + Close-dept gate |

Settings WRITE target (`npd-field-config.ts`): `npd_departments(code,name,display_order,active)`, `npd_field_catalog(code,label,data_type,validation_json,is_auto,auto_source_field,active)`, `npd_department_field(department_id,field_id,required,visible,stage_code,display_order)`. `stage_code` and `visible`/`required` are written; `stage_code` has NO downstream reader; `visible`/`required`/`active` ARE honored by the FG detail + dept-close gate.

## Gate chain (create → handover)

create(brief/G0) → **advance** brief→recipe → **advance** recipe→packaging [GATE: RECIPE_INGREDIENTS_REQUIRED ≥1 ingredient; entering packaging: FG_ALREADY_LINKED guard + createFgCandidate] → packaging→trial→sensory→pilot (G3, advisory checklists only) → **advance** pilot→approval [GATE: G3 e-sign assertG3ESignForApproval] → **advance** approval→handoff [GATE: G4 e-sign assertG4ESignForHandoff + seedHandoffChecklist] → **advance** handoff→launched [GATE: closeOutLegacyStagesForLaunch — approved factory release + active/technical_approved BOM + G4 approval + shelf_life + allergen-recompute stamp + pilot WO evidence + (done_mrp OR closed_mrp='Yes')].

Catalog/department dependency in the chain: ONLY the terminal `closed_mrp='Yes'` alternative, which routes through `closeDeptSection → is_all_required_filled` (reads `npd_department_field.required` for the active MRP dept). `done_mrp=true` (a plain boolean on `product`) is a parallel, catalog-free path — so broken catalog plumbing does NOT by itself block handover. What DOES silently strand a project is orthogonal to the catalog: a brand-new org with an empty catalog makes `is_all_required_filled` return true (mig 386 header lines 7-9), i.e. it UNDER-gates rather than over-gates.

## What a repair wave must touch (file list)

Stage-screen catalog rendering (claim 1/4/5 — the core owner complaint):
- `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/brief/page.tsx` (+ `_components/project-brief-screen`) — add dynamic per-dept/per-stage catalog sections; currently 100% static.
- `.../pipeline/[projectId]/{trial,sensory,pilot,packaging}/page.tsx` — same; none read the catalog.
- NEW shared loader mirroring `fg/[productCode]/_actions/load-fa-dynamic-sections.ts` but filtered by `npd_department_field.stage_code = <stage>` (the reader that does not exist today).

Dashboard department-active filter (claim 3):
- `apps/web/app/(npd)/dashboard/_actions/get-dashboard-summary.ts:7,140-193` — hardcoded `DEPTS`/`dept_rows` VALUES; must join `npd_departments` and filter `active=true`.
- `public.dashboard_summary` / `public.missing_required_cols` views (read at `:125-127`, `:168-171`) — verify they don't also hardcode the 7 depts.

stage_code decision (claim 1/4):
- `settings/npd-fields/_actions/npd-field-config.ts` + `npd-fields-screen.client.tsx` — either wire a stage reader (above) or drop the stage-assignment UI so Settings stops promising a dimension nothing renders.

Gate/plumbing correctness (claim 6):
- `packages/db/migrations/*is_all_required_filled*` (377/378) + `close-dept-section.ts` — empty catalog → `ready=true` (under-gate); decide whether that is intended.
- `apps/web/app/(npd)/pipeline/_actions/close-out-legacy-stages.ts:188` — the `done_mrp OR closed_mrp` dual path is the only catalog touchpoint in the walk; confirm intended.

## Phantoms / carry-forwards / extras
- **PHANTOM dimension:** `npd_department_field.stage_code` — written by Settings + seeded by mig 386, ZERO production reader. Highest-signal defect behind claim 1.
- **Carry-forward (F1):** promote wedge / handoff-checklist seeding fixed (`gate-helpers.ts:834-869 seedHandoffChecklist`, header lines 827-831) — verified present, not re-broken.
- **Carry-forward (A1/F3):** "settings ↔ FA dynamic sections share catalog" — TRUE only on FG/FA detail (department-keyed), never on stage screens; `stage_code` never read even there.
- **EXTRA / legacy split:** dashboard reads `product.done_*` (7 hardcoded) while FG detail reads dynamic `npd_departments.active` — two department models coexist; dashboard is the stale one.
- **Note:** `Reference.DeptColumns` legacy store is retired for reads (mig 370/386 seed the dynamic catalog FROM it); FG detail comment `page.tsx:262-268` confirms DeptColumns is no longer authoritative.
