---
name: MON-domain-npd
description: "Use when implementing 01-npd (New Product Development) tasks: FG/product aggregate (69-col Main Table + fa read-only compat view), schema-driven Dept columns, cascade chains, allergen multi-level cascade, Brief→Project→FG flow, Stage-Gate G0-G4, formulation/nutrition/costing, risks+V18 built-blocker, compliance docs, D365 Builder (export-only per R15), V01-V08 validators. HEAVY UI: prototype parity + real Supabase data are the two hard gates."
---

# MON-domain-npd — 01-npd implementation rules

Read FIRST: `MON-project-overview`, then `MON-multi-tenant-site` (org_id/RLS LAW), then the per-area
skill for the surface you're touching — `MON-t1-schema` (Drizzle + migrations + RLS),
`MON-t2-api` (Server Actions), `MON-t3-ui` + `Mon-ui` (prototype→production), `MON-t4-test` (TDD/evidence).
Scope: `_meta/atomic-tasks/01-npd/` (**139 tasks**; only T-001 DONE — the rest pending/blocked).
STATUS: `_meta/atomic-tasks/01-npd/STATUS.md` · coverage: `_meta/atomic-tasks/01-npd/coverage.md` ·
PRD authority: `docs/prd/01-NPD-PRD.md` (v3.3 + N-* gap-backlog amendments; the **2026-05-03 FINAL
Amendment** at the top supersedes any conflicting older text — read it).

01-npd replaces the legacy Smart_PLD_v7 Excel. It is the **primary product-master module**: it owns the
NPD lifecycle from Brief → NPD project (`DEV-123`) → Stage-Gate G0-G4 → 7-dept parallel fill → NPD Builder
that creates WIP/intermediates + the FG + the **initial shared BOM/product-spec version**, plus optional
D365 export/import. Downstream factory modules consume what NPD releases.

## When to use it
Implementing ANY 01-npd task (T-001..T-139) — schema, Server Actions, cascade engine, allergens, Brief,
D365 Builder, dashboard, Stage-Gate pipeline, formulation/nutrition/costing, risks, compliance, FG release.
Also read it before any cross-module task whose `cross_module_dependency` points at an NPD table or at
`npd.fg.released` / `npd.gate.*` events.

## THE TWO HARD GATES (every 01-npd task — non-negotiable)

1. **Prototype parity.** Every screen matches its prototype JSX 1:1 (structure, 5 states, interactions).
   - Prototypes: `prototypes/design/Monopilot Design System/npd/*.jsx` (note the spaces — always quote):
     `fa-screens.jsx` (FA list/detail/tabs/BOM), `brief-screens.jsx`, `pipeline.jsx` + `project.jsx` +
     `gate-screens.jsx` (Stage-Gate), `formulation-screens.jsx` + `recipe.jsx`, `allergen-screens.jsx`,
     `d365-screens.jsx`, `docs-screens.jsx` (compliance), `other-stages.jsx` (nutrition/costing/sensory/
     approval/risk), `data.jsx`, plus `modals.jsx` for dialogs.
   - Cite a **literal anchor** `prototypes/design/Monopilot Design System/npd/<file>.jsx:<start>-<end>`,
     verify range with `wc -l "<path>"`, pull the `prototype_index_entry` from
     `_meta/prototype-labels/prototype-index-npd.json`, translate to shadcn/ui (no verbatim JSX paste, no raw
     `<select>`, `@radix-ui/*` only inside `packages/ui`). Implement loading/empty/error/permission-denied/optimistic.
   - Closeout evidence: per-state screenshot/Playwright trace + axe (0 or justified) + parity diff +
     `ui_evidence_policy` reference. A UI task with no parity evidence DOES NOT merge.

2. **Real data — NO hardcode/mocks.** Every link/page reads/writes **real Supabase data**, never a hardcoded
   array or mock. Reads via Server Components/Actions through `withOrgContext` (org-scoped, RLS-enforced via
   `app.current_org_id()`). Writes via Server Actions wrapped in `withOrgContext` + zod validation + outbox.
   Several FA-detail/dashboard components currently ship as "deferred-empty" stubs with mock data
   (T-020, T-052, T-132/133, T-136/137) — those are GAPS to wire, not "done".

## Domain glossary

- **FG / Finished Good** — canonical user-facing term for the released sellable product and the NPD candidate
  that becomes released. **`FA` / Factory Article is a compatibility alias ONLY** (legacy DB fields, routes,
  seed codes, prototype identifiers, D365 examples). Never introduce `FA` as final user-facing copy.
- **product aggregate (the Main Table)** — 1 row per launch candidate, **69 typed cols** across 7 depts +
  System, plus `ext_jsonb`/`private_jsonb` (L3/L4 tenant extensions), `schema_version`, R13 audit cols.
  Physical table is `product` (ADR-034). `fa` exists only as a **read-only SQL view** over `product`
  (`security_invoker=true` + INSTEAD OF trigger, structurally read-only) for D365 Builder/integration compat.
  Event aggregate prefix stays `fa.*` (decoupled from storage).
- **Dept sections + schema-driven columns** — 7 depts (Core, Planning, Commercial, Production, Technical,
  MRP, Procurement) + System. All column metadata (dept, data_type, dropdown_source, `blocking_rule`,
  `required_for_done`, display_order, marker) lives in **`Reference.DeptColumns`** (ADR-028). The 01-npd
  runtime reads DeptColumns to generate RHF+Zod forms, server validators, per-dept filtered views, cell locks,
  and `IsAllRequiredFilled` checks. Per-dept readiness = `Done_<Dept>` = `IsAllRequiredFilled AND
  Closed_<Dept>='Yes'` (independent per dept). `Status_Overall` is a 5-state enum
  (`Built`/`Complete`/`Alert`/`InProgress`/`Pending`); `Days_To_Launch` is computed on-the-fly (not persisted).
- **ProdDetail** — multi-component source of truth (1 row per component). Main Table
  `Manufacturing_Operation_1..4 / Line / Equipment_Setup / Intermediate_Code_Final` are an **aggregate**
  (comma-sep) auto-derived from ProdDetail when N>1; when N==1, ProdDetail mirrors the Main Table.
- **Cascade chains (4)** — rule-engine DSL (ADR-029), JSON in `Reference.Rules`, interpreted by
  `cascade-engine` (never hardcoded): (1) Pack_Size→Line→Equipment_Setup (clears+autofills);
  (2) Manufacturing_Operation_N→Intermediate_Code_P<N>→Intermediate_Code_Final (suffix from
  `Reference.ManufacturingOperations.process_suffix`, configurable per tenant — NOT hardcoded A/B/C/D);
  (3) Recipe_Components→Ingredient_Codes + idempotent `sync_prod_detail_rows`; (4) Template→ApplyTemplate.
- **Allergen cascade** — multi-level **derivation** RM → PR_step → FG: union of confirmed RM allergens
  (`Reference.Allergens_by_RM`) + process-added allergens (`Reference.Allergens_added_by_Process`), plus
  `may_contain` from RM trace + line changeover history. EU FIC 1169/2011 (14 EU allergens seed). Auto-derived
  badges are **read-only**; manual override requires reason + audit, and never clears the auto-cascade source
  (`fa_allergen_overrides` keeps per-(FG×allergen×actor×ts) history). Bulk reference change → rebuild worker (T-099).
- **Stage-Gate G0-G4** — `npd_projects` lifecycle: G0 Idea → G1 Feasibility → G2 Business Case (self-advance,
  no approval) → **G3 Development (e-signature required)** → **G4 Testing (e-signature required)** → Launched.
  Brief creates the project; the FG candidate is created/mapped at **G3** (T-095); NPD Builder release happens
  at G4 (T-096). Trial/Pilot/Handoff/Packaging stay inside the NPD flow (not deprecated, not moved to Technical).
- **Formulation versions** — `formulations`/`formulation_versions`/`formulation_ingredients`; lifecycle
  `draft → submitted_for_trial → locked`. Submit-for-trial gated on `totalPct ∈ [99.99,100.01]` + every RM has
  cost + no missing nutrition target. Lock via `formulation.lock`.
- **brief → FA convert** — `brief`/`brief_lines` (2 templates, 37 cols). `convertBriefToFa` creates the
  `npd_project` first (FG is NOT created at Brief stage), maps 13 required brief→FA fields (V08), then freezes
  the Brief (`status='converted'`, read-only).
- **D365 Builder / export** — generates a per-FA `Builder_FA<code>.xlsx` (8 tabs) via server-side `exceljs`;
  N+1 products per FA (1 final FG + N intermediate PR products), `OP=10` always; constants from
  `Reference.D365_Constants`. Stored in `fa_builder_outputs` + signed-URL download. **Export/import only** —
  anti-corruption (R15): D365 is never the source of truth and never sets release/factory state.
- **V01-V08 validators** — V01 Product_Code `^FA[A-Z0-9]+$`; V02 Product_Name non-empty; V03 Pack_Size in
  `Reference.PackSizes`; V04 D365 material codes Found/NoCost/Missing (WARN/FAIL); V05-<Dept> dept-complete;
  V06 operation-suffix matches Intermediate_Code suffix; V07 allergens complete; V08 brief→FA mapping complete.
  **V18 (risks) = built-blocker** (see invariants). Stored as `rule_type='validation'` in `Reference.Rules`.

## Hard domain rules / invariants (violation = revert / red-line)

- **V18 high-risk built-blocker.** FG cannot transition to `built=TRUE` while any `risks` row with
  `bucket='High' AND state='Open'` exists. Enforced in the D365 Builder wizard step 1 + single-click
  pre-flight + dashboard tile (severity FAIL). `risks.score = likelihood × impact`; `High≥6 / Med 3-5 / Low<3`.
- **`fa` is a read-only compat VIEW over `product`** — never write through `fa`, never create a second
  `product`/`fa` storage table. All writes target `product`. The view is `security_invoker=true` and write-blocked.
- **Allergen cascade is derived, not authored.** Auto-derived allergens are read-only; overrides are additive
  with mandatory reason + audit and must NOT mutate/clear the cascade source.
- **D365 is export/import only (R15 anti-corruption).** Monopilot is the system of record for product/BOM/WIP/FG.
  D365 export/paste never sets `built`, release state, or factory availability; import/overwrite is allowed only
  via an authorized workflow, never as silent canonical replacement.
- **`built=TRUE` auto-resets to FALSE on ANY edit** (incl. ProdDetail). `built` is a `[LEGACY-D365]` flag, NOT
  a canonical release state — do not treat it as release.
- **Post-release edits create a NEW version.** Any NPD-requested change to a released product/BOM/factory-spec
  creates a new BOM/product-spec version and routes to **Technical approval** before factory use — never an
  in-place mutation of the approved factory version.
- **Shared BOM is SSOT.** NPD Builder creates the *initial* shared BOM version (with WIP/intermediates + FG);
  NPD must not maintain a separate long-lived canonical computed BOM after release. One shared
  `bom_headers`/`bom_lines` model across NPD/Technical/Planning/Production/integrations.
- **G3/G4 require e-signature** (password/bcrypt verify → `gate_approvals` with `esigned_at`+`esign_hash`,
  immutable, BRCGS audit-ready). G0-G2 self-advance with blocker checks only. `d365_builder.execute`,
  `fa.delete`, `schema.edit`, `rule.edit` require MFA re-auth + audit.
- **org_id, not tenant_id.** PRD code blocks still show `tenant_id` (legacy text) — implement as **`org_id`**
  with RLS via `app.current_org_id()` per the Wave0 lock (`MON-multi-tenant-site`). Do NOT copy `tenant_id`.

## Canonical-owner boundaries (what 01-npd owns vs must NOT cross)

- **OWNS:** `product`/`fa` view, `prod_detail`, `brief`/`brief_lines`, `Reference.DeptColumns` +
  `Reference.ManufacturingOperations` + NPD `Reference.*` lookups/seeds, the cascade + validation rule
  definitions for NPD, allergen tables + `fa_allergen_overrides`, `npd_projects` + gate_checklist_items +
  `gate_approvals`, `formulations*`, nutrition/costing tables, `risks` (+V18), `compliance_docs`,
  `fa_builder_outputs`, the **initial** shared BOM version + the **factory release read-model/events**
  (T-092/T-093/T-097 `npd.fg.released`).
- **Does NOT own (never create/write these here):** `wo_outputs` → 08-production; `schedule_outputs` →
  04-planning; `oee_snapshots` → 08-production (15-oee read-only). See CLAUDE.md hard rules + `MON-domain-production`.
- **Sensory belongs to 03-Technical.** Tasks T-071/T-076 are deferred/cross-module; do not BUILD standalone NPD
  sensory schema/UI unless Technical re-owns it. NPD may consume Technical sensory status for gating only.
- **Factory-spec maintenance after release belongs to 03-Technical.** NPD hands off the FG + initial BOM/factory
  spec; Technical owns ongoing factory-spec correctness (BOM SSOT hand-off contract). Production/Planning
  consume the released read-model (`npd.fg.released`), they do not read NPD internals.

## Recurring live-bugs this module is prone to (P0 — fix proactively)
These passed vitest+tsc but broke the npd run live (see `docs/workflow/02-QUALITY-GATES.md` §checklist):
- **RBAC seed → 403-everywhere.** The `npd.*` perms must be GRANTed (not just enum-added) to the org-admin role
  family (`org.access.admin`/`org.platform.admin`/`owner`/`admin`/`org_admin` — deployed admin is on
  `org.access.admin`, NOT `admin`) + NPD operator roles, in BOTH `role_permissions` and legacy `roles.permissions`
  jsonb, with org-insert trigger + backfill. Ship a wave-1 P0 `NNN-npd-permission-seed.sql` (mirror `116`/`146`/
  `148`/`150`). Strings GRANTed must equal strings the pages CHECK. → `MON-multi-tenant-site` §SEED.
- **Migration renumbering.** This run renumbered `0010` → `075+` because hardcoded/4-digit prefixes silently never
  ran (runner regex `^(\d{3})-[a-z0-9-]+\.sql$`). Rebuild the local gate DB to canon HEAD and number new
  migrations 3-digit ≥ HEAD; never edit an applied one. → `MON-t1-schema`.
- **`'use server'` non-async exports** (error classes/consts) break `next build` — keep them in a sibling. → `MON-t2-api`.
- **i18n 4-locale parity** for every `npd.*` `t('key')`. → `MON-t3-ui`.

## Gates recap (per task G1-G4, + G5 per module before sign-off)
G1 real tests run + captured (DB-gated suites against a real/local Postgres — foundation's pattern) ·
G2 prototype parity (above) · G3 deps DONE in STATUS · G4 cross-provider review (Opus↔Codex).
**G5 (MANDATORY pre-sign-off, module-level): live-deploy verification** — green-local ≠ live. Push → Vercel
build `READY` with fail-loud migrate → confirm Supabase `max(filename)` in `public.schema_migrations` ==
repo's highest `packages/db/migrations` file (no stale schema; project `khjvkhzwfzuwzrusgobp`; latest is
`075-product-and-fa-view.sql`) → log in to the deployed PREVIEW (`/en/login`) and Playwright-click EVERY npd
route, capturing the exact `get_runtime_logs` server error for any ERROR. Detail: `docs/workflow/02-QUALITY-GATES.md`
Gate 5. DoD echo: a user logs in on the deployed Vercel+Supabase app and clicks every NPD link → sees a
prototype-faithful screen backed by real Supabase data (verified live, not just locally).

## Cross-links
- [[MON-project-overview]] — repo map, tech stack, glossary (read first)
- [[MON-multi-tenant-site]] — `org_id` LAW, `app.current_org_id()` RLS, `withOrgContext`/`withSiteContext`
- [[MON-t1-schema]] — Drizzle schema + migrations + RLS (product/prod_detail/brief/allergens/projects/risks/docs)
- [[MON-t2-api]] — Server Actions (createFa/updateFaCell, convertBriefToFa, gate advance/approve, buildD365)
- [[MON-t3-ui]] · [[Mon-ui]] — prototype anchor format, ui_evidence_policy, i18n, required states
- [[MON-t4-test]] — RED-first TDD, fixtures, parity/E2E evidence capture
- [[MON-foundation-primitives]] — outbox (T-112), worker (T-111, allergen rebuild + D365 cache sync), e-sign
  (T-124, gate approvals), GDPR (T-113, right-to-erasure T-089), rate-limit, withOrgContext (T-125)
- [[MON-integrations-compliance]] — D365 export-only anti-corruption (R15), BRCGS/CFR-21 e-sign, GS1 barcodes
- [[MON-domain-production]] — consumer of `npd.fg.released`; canonical-owner boundary reference (wo_outputs/oee)
- [[MON-domain-planning]] — consumes the factory release read-model; owns `schedule_outputs` (not NPD)
