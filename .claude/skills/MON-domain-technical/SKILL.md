---
name: MON-domain-technical
description: "Use when implementing 03-technical (Technical / factory specification) tasks: item master (rm/intermediate/fg/co_product/byproduct + schema-driven L3 ext_jsonb), shared BOM SSOT (bom_headers/lines/co_products/snapshots + draft→technical_approved→active), factory_specs (Technical-owned approval bundle + clone-on-write on release edits, emits technical.factory_spec.approved), allergen full cascade (per-item profiles + manufacturing-op additions + contamination risk; consumes 01-npd MATERIALIZED product.allergens/may_contain), shelf life, cost_per_kg + item_cost_history (dual-owned with finance), routings, D365 sync (jobs/dlq), supplier_specs, sensory schema+UI. Canonical owners + Wave0 lock + the RBAC technical.* permission family. HEAVY UI: prototype parity + real Supabase data are the two hard gates."
---

# MON-domain-technical — 03-technical implementation rules

Read FIRST: `MON-project-overview`, then `MON-multi-tenant-site` (org_id/RLS LAW), then the per-area
skill for the surface you're touching — `MON-t1-schema` (Drizzle + migrations + RLS),
`MON-t2-api` (Server Actions), `MON-t3-ui` + `Mon-ui` (prototype→production), `MON-t4-test` (TDD/evidence).
Scope: `_meta/atomic-tasks/03-technical/` (**93 tasks**; none IMPLEMENTED — 9 STUB, rest pending/blocked).
STATUS: `_meta/atomic-tasks/03-technical/STATUS.md` · coverage: `_meta/atomic-tasks/03-technical/coverage.md` ·
PRD authority: `docs/prd/03-TECHNICAL-PRD.md` (read §0 final-decision block first — it supersedes any
conflicting older/prototype text). Pre-run blockers + decisions: `_meta/runs/sidecar/reports/03-technical-phase0-audit.md`
and `_meta/runs/reopen/03-technical-decisions.md`.

03-technical is the **Technical-owned factory specification + shared BOM SSOT module**. It owns the **item
master** (RM / WIP-intermediate / FG / co-product / byproduct), the canonical `factory_spec` /
`internal_product_spec` for an FG, the **one shared BOM model** consumed by NPD/Technical/Planning/Production,
BOM/spec version approval before factory use, allergen cascade governance, shelf-life regulatory data,
cost/spec review, routings/resources, supplier_specs Phase 1, non-conformance triggers, and the **optional**
D365 stage-1 integration. 01-npd hands off the FG + initial shared BOM/factory spec at G4; Technical owns
their ongoing correctness from there.

## When to use it
Implementing ANY 03-technical task (T-001..T-093) — items, BOM SSOT + version transitions, factory_specs +
bundle approval, allergen profiles/cascade/risk, cost history, routings, D365 sync/DLQ, supplier_specs,
sensory, the `technical.*` RBAC enum + grant seed. Also read it before any cross-module task whose
`cross_module_dependency` points at a Technical table (`items`, `bom_*`, `factory_specs`,
`item_cost_history`, `routings`, `d365_sync_*`, `supplier_specs`) or at `technical.factory_spec.approved`.

## THE TWO HARD GATES (every UI 03-technical task — non-negotiable)

1. **Prototype parity.** Every screen matches its prototype JSX 1:1 (structure, 5 states, interactions).
   - Prototypes: `prototypes/design/Monopilot Design System/technical/*.jsx` (note the spaces — always quote):
     `bom-list.jsx`, `bom-detail.jsx` (BOM detail + 7 tabs), `other-screens.jsx` (item list/detail,
     dashboard `tech_dashboard_screen`, D365 status/log/mapping/drift screens), `modals.jsx`
     (item create/deactivate, allergen declaration, BOM edit, D365 sync/DLQ confirm), `spec-driven-screens.jsx`
     (Wave0 spec-driven screens with no dedicated prototype), `data.jsx`, `app.jsx`/`shell.jsx`.
   - Cite a **literal anchor** `prototypes/design/Monopilot Design System/technical/<file>.jsx:<start>-<end>`,
     verify range with `wc -l "<path>"`, pull the `prototype_index_entry` from
     `_meta/prototype-labels/prototype-index-technical.json` + translation notes
     `_meta/prototype-labels/translation-notes-technical.md`, translate to shadcn/ui (no verbatim JSX paste,
     no raw `<select>`, `@radix-ui/*` only inside `packages/ui`). Implement loading/empty/error/permission-denied/optimistic.
   - **Prototype labels are PascalCase component names** (`tech_dashboard_screen`, `d365_mapping_screen`) and
     the PRD/coverage cite snake_case that does NOT string-match the JSX — always anchor by **line range**, not
     by label search. Prototype legacy copy (`FA`/`FA5100`/`PR-code`/`process_stage`) must be translated to the
     canonical vocabulary (`FG`/WIP-intermediate/`manufacturing_operation_name`) per T-083 red-lines.
   - Closeout evidence: per-state screenshot/Playwright trace + axe (0 or justified) + parity diff +
     `ui_evidence_policy` reference. A UI task with no parity evidence DOES NOT merge.

2. **Real data — NO hardcode/mocks.** Every link/page reads/writes **real Supabase data**. Reads via Server
   Components/Actions through `withOrgContext` (org-scoped, RLS-enforced via `app.current_org_id()`). Writes via
   Server Actions wrapped in `withOrgContext` + zod validation + outbox. The 9 STUB pages (the technical
   dashboard skeleton, the four D365 stub pages under the wrong namespace, the d365-dlq SettingsRouteStub) are
   GAPS to build/relocate, not "done".

## Domain glossary

- **item master (`items`)** — Technical-owned product/material master. `item_type ∈
  {rm, intermediate, fg, co_product, byproduct}`. Code conventions: `RM<digits>` or custom for RM
  (e.g. `RM1234`, `SALT-01`); WIP/intermediate codes are `WIP-<suffix>-<sequence>` (e.g. `WIP-CT-0000001`);
  `FG<digits>` for finished goods. Intermediate is a **first-class citizen** (Phase D decision #19 — D365
  Builder N+1 needs it). Schema-driven L3/L4 tenant extensions live in `ext_jsonb`/`private_jsonb` (managed via
  02-SETTINGS §6 schema columns, propagated by T-027); `schema_version` + R13 audit cols on every row.
  D365 mirror fields (`d365_item_id TEXT` **soft** ref, `d365_last_sync_at`, `d365_sync_status`) are NEVER
  hard FKs. **T-001 `items` is the critical-path root** — 04/05/08/10/11 consume it; today BOM lines reference
  `component_code TEXT` because `items` doesn't exist yet (T-002 adds the `item_id` FK).
- **shared BOM SSOT** — ONE model `bom_headers` / `bom_lines` / `bom_co_products` / `bom_snapshots` shared
  across NPD/Technical/Planning/Production/Finance/integrations. **01-npd already created `bom_headers`/`bom_lines`
  via migration 090**; 03-technical adds the `item_id` FK on lines + `bom_co_products` + `bom_snapshots` (T-002)
  and owns the version-state machine: **`draft → technical_approved → active`** (T-073). NPD Builder creates the
  *initial* shared BOM version at G4; Technical approves it for factory use. BOM Generator (TEC-024) is
  orthogonal to NPD's D365 Builder (D365 Builder = "send to ERP"; BOM Generator = explode/compose internal BOM).
- **factory_specs** — **Technical-owned** canonical production specification for an FG (`factory_spec` /
  `internal_product_spec`). Approval is a **bundle**: a factory_spec version is approved together with a specific
  **BOM version** (T-080 FactorySpec+BOM bundle approval). On release edits, **clone-on-write a NEW version** —
  NEVER mutate an approved/`active`/released row in place. Approval **emits `technical.factory_spec.approved`**,
  consumed by **01-npd `factory_release_status`** (the dangling `factory_release_status.active_factory_spec_id`
  soft-uuid awaits T-079). The Technical **release adapter** (T-081) closes the loop with 01-npd T-097.
  **04-planning T-001 hard-depends on Technical T-080/T-081** → 04 is blocked until 03 delivers the bundle
  approval + release adapter.
- **allergen full cascade** — Technical owns the *full* cascade: per-item allergen **profiles** +
  **manufacturing-operation additions** (process-added allergens) + **contamination risk matrix** (T-004 tables;
  T-017/T-018/T-019 CRUD; T-024 cascade rule deployment; TEC-040/042/044 UI T-047/T-048/T-049). It **consumes**
  01-npd's **MATERIALIZED** `product.allergens` / `product.may_contain` and the `fa.allergens_changed` event
  (note: **materialized, not derived** — Technical reads the materialized NPD value, does not recompute NPD's).
  EU FIC 1169/2011 (EU-14 seed already exists in `public.allergens`). Auto-cascaded badges are read-only; manual
  overrides require reason + audit (V-TEC-42) and never clear the cascade source.
- **shelf life** — Technical-owned shelf-life / regulatory config per FG (TEC-030 Shelf Life Config, T-046).
- **cost_per_kg + `item_cost_history`** — **DUAL-OWNED with 10-finance.** `item_cost_history` (T-003) records
  cost rolls; `source ∈ {manual, d365_sync, supplier_update, variance_roll}`. **NUMERIC precision is mandatory**
  (no float). Technical owns the master cost edit + history UI (TEC-050, T-050; cost endpoints T-021); Finance
  owns standard-cost/valuation/variance. `technical.cost.edit` gates Technical writes — do NOT write Finance's
  costing tables here.
- **routings** — `routings` / `routing_operations` (T-006; CRUD T-022; cost preview T-023; UI TEC-060/062
  T-051/T-052). Tooling/equipment setup list (TEC-087) + maintenance cross-link panel (TEC-088, cross-dep
  13-maintenance).
- **D365 sync (stage 1, `[LEGACY-D365]` bridge, OPTIONAL)** — `d365_sync_jobs` + `d365_sync_dlq` (T-007;
  **distinct** from Settings' `d365_sync_runs` migration 065). Pull items + BOM/formula nightly + on-demand;
  push WO confirmations on close; outbox + worker + retry (3× backoff 1s/5s/25s) + DLQ; idempotency_key [R14].
  Feature flag `integration.d365.enabled` (02-SETTINGS §10.2). Connection config is in SETTINGS > Integrations >
  D365 (02-SETTINGS §11.3). UI surfaces TEC-070 dashboard / TEC-071 manual trigger / TEC-072 audit log /
  TEC-073 DLQ + TEC-090 field mapping (BL-TEC-01 unmapped-allergens alert) + TEC-091 drift resolution.
  **Route namespace + field-mapping authority are OPEN decisions** — see
  `_meta/runs/reopen/03-technical-decisions.md` before touching D365 routes/mapping.
- **supplier_specs** — supplier spec Phase 1 governance (T-005 lab_results + supplier_specs migration; T-075
  governance migration; T-072 governance brief). RM usability validation (T-074) checks approved supplier +
  active supplier_spec + allergens + item active + cost/spec review + QC/release before a component is usable.
- **sensory** — Technical-owned. Schema/contract = **T-084** (read model only: required/pending/pass/fail/hold
  + not_required; NPD treats sensory as N/A unless org policy requires it; downstream guards show
  `SENSORIAL_BLOCKED`). The **UI** for sensory is the orphaned 01-npd deferral (npd T-071 schema + T-076 UI both
  re-owned here) — built by **T-092** (added by sidecar prep), consuming T-084 read-only. Do NOT move NPD gate
  ownership into Technical and do NOT build a second sensory write path.
- **lab_results** — Quality-OWNED, Technical reads READ-ONLY (T-020 read model; TEC-045 log T-088). ATP swab
  auto-fail trigger (T-026). No Technical approval action on lab results in Technical UI.

## Hard domain rules / invariants (violation = revert / red-line)

- **Released BOM/factory_spec edits clone-on-write a NEW version.** Never mutate an approved/`active`/released
  row in place. Post-release change → new version → routes to Technical approval (the bundle) before factory use.
- **Shared BOM SSOT is canonical.** Technical/NPD/Planning/Production/Warehouse/Finance read the SAME
  `bom_headers`/`bom_lines`/`bom_co_products` tables. Do NOT fork a parallel BOM model. 01-npd owns the
  *initial* version; Technical owns the version state machine + ongoing correctness.
- **factory_specs are Technical-owned; approval emits `technical.factory_spec.approved`.** 01-npd
  `factory_release_status` is a consumer (its `active_factory_spec_id` is set via the release adapter, not by
  NPD writing factory_specs). 04-planning consumes the released read-model, never Technical internals.
- **D365 is OPTIONAL integration, export/import only (R15 anti-corruption).** D365 is never the system of record
  for items/BOM/factory_spec; pull/import or overwrite requires an explicitly **authorized + audited** workflow,
  never silent/canonical-by-default. `d365_item_id` is a **TEXT soft reference**, never a hard FK. Drift =
  local edit newer than incoming D365 → log + skip (V-TEC-73), do not overwrite local edits.
- **FG is canonical; `FA` is a legacy alias ONLY.** Do not introduce `FA-*` identifiers in new schemas, code,
  labels, or tests. Translate prototype legacy copy per T-083 (`FA`→`FG`, `PR-code`→WIP/intermediate,
  `process_stage`/`process_code`→`manufacturing_operation_name`). Exception: explicit legacy imported-source /
  audit-history labels.
- **cost is NUMERIC-exact + dual-owned.** No float in cost columns/calcs. Technical edits cost master +
  history; Finance owns standard cost/valuation/variance — do not cross.
- **allergen cascade source is materialized + read-only at the NPD boundary.** Technical adds its own
  profile/op/risk layers but consumes NPD's materialized `product.allergens`/`may_contain`; auto-cascaded badges
  are read-only, overrides are additive with reason + audit (V-TEC-42).
- **org_id, not tenant_id.** PRD code blocks still show `tenant_id` (legacy text) — implement as **`org_id`**
  with RLS via `app.current_org_id()` per the Wave0 lock (`MON-multi-tenant-site`). Do NOT copy `tenant_id`.

## RBAC — the `technical.*` permission family

The 10 canonical strings (PRD §3) live in `packages/rbac/src/permissions.enum.ts`, exported as
`ALL_TECHNICAL_PERMISSIONS` (T-091): `technical.items.{create,edit,deactivate}`,
`technical.bom.{create,approve,version_publish,generate_batch}`, `technical.allergens.edit`,
`technical.cost.edit`, `technical.d365.sync_trigger`. **`technical.product_spec.approve` is an 11th, EARLIER
string** (used by the NPD released-product-edit workflow) currently grouped under `ALL_SETTINGS_EXT_PERMISSIONS`
— per the audit it is **misclassified**; T-091's scope note covers consolidating it into the technical family.
**Enum strings alone are NOT enough** — like the X-1 standard (npd 146/149, settings 148), a **grant seed
migration (T-093)** must GRANT `technical.*` to the org-admin role family
(`array['org.access.admin','org.platform.admin','owner','admin','org_admin']` + the technical role) in BOTH the
normalized `role_permissions` table and the legacy `roles.permissions` jsonb cache, with an AFTER-INSERT trigger
+ existing-org backfill, idempotent. Without it, every technical page 403s for the org admin at Gate-5
(exactly the live-deploy failure that 01-npd hit). Model on `packages/db/migrations/149-npd-permissions-org-admin-seed.sql`.

## Canonical-owner boundaries (what 03-technical owns vs must NOT cross)

- **OWNS:** `items` master, the shared BOM version state machine (`draft→technical_approved→active`) +
  `bom_co_products`/`bom_snapshots` + `item_id` FK, `factory_specs` + the FactorySpec+BOM bundle approval +
  the `technical.factory_spec.approved` event + the NPD release adapter, allergen profiles/op-additions/risk
  matrix + cascade rule deployment, shelf life, `item_cost_history` (cost edit + history, dual with Finance),
  routings/routing_operations, `d365_sync_jobs`/`d365_sync_dlq` (distinct from Settings' `d365_sync_runs`),
  supplier_specs + RM usability validation, the sensory read model (T-084) + sensory UI (T-092), the
  `technical.*` permission family + its grant seed.
- **Does NOT own (never create/write these here):** `wo_outputs` → 08-production; `schedule_outputs` →
  04-planning; `oee_snapshots` → 08-production (15-oee read-only); `lab_results` are **Quality-owned**
  (Technical reads only); Finance's standard-cost/valuation/variance tables; the canonical `product`/`fa` aggregate
  + `Reference.DeptColumns` cascade/validation rules → **01-npd**. See CLAUDE.md hard rules.
- **Initial BOM/factory spec come FROM 01-npd** (NPD Builder at G4). Technical takes over the version lifecycle;
  it does not author the initial NPD product aggregate. Connection config for D365 lives in **02-settings**.

## Gates recap (per task G1-G4, + G5 per module before sign-off)
G1 real tests run + captured (DB-gated suites against a real/local Postgres) · G2 prototype parity (above) ·
G3 deps DONE in STATUS (no task starts until its `dependencies` + `cross_module_dependencies` are ✅ DONE) ·
G4 cross-provider review (Opus↔Codex).
**G5 (MANDATORY pre-sign-off, module-level): live-deploy verification** — green-local ≠ live. Push → Vercel
build `READY` with fail-loud migrate → confirm Supabase `max(filename)` in `public.schema_migrations` ==
repo's highest `packages/db/migrations` file (no stale schema; project `khjvkhzwfzuwzrusgobp`) → log in to the
deployed PREVIEW (`/en/login`) and Playwright-click EVERY technical route, capturing the exact
`get_runtime_logs` server error for any ERROR. Detail: `docs/workflow/02-QUALITY-GATES.md` Gate 5. The grant
seed (T-093) is what makes the org-admin click-through pass — verify it specifically.

## Cross-links
- [[MON-project-overview]] — repo map, tech stack, glossary (read first)
- [[MON-multi-tenant-site]] — `org_id` LAW, `app.current_org_id()` RLS, `withOrgContext`/`withSiteContext`, ESLint enum-lock
- [[MON-t1-schema]] — Drizzle schema + migrations + RLS (items/bom_*/factory_specs/allergens/cost/routings/d365)
- [[MON-t2-api]] — Server Actions (item CRUD, BOM approve/publish, allergen cascade, cost, D365 sync, release adapter)
- [[MON-t3-ui]] · [[Mon-ui]] — prototype anchor format, ui_evidence_policy, i18n, required states
- [[MON-t4-test]] — RED-first TDD, fixtures, parity/E2E evidence capture, NUMERIC-exact cost assertions
- [[MON-foundation-primitives]] — outbox (T-112), worker (T-111, D365 sync worker + DLQ), e-sign (T-124, bundle approval), withOrgContext (T-125)
- [[MON-integrations-compliance]] — D365 export-only anti-corruption (R15), BRCGS/CFR-21, 7y retention
- [[MON-domain-npd]] — upstream: hands off FG + initial BOM/factory spec; consumes `technical.factory_spec.approved`; sensory re-owned here
- [[MON-domain-finance]] — cost-per-kg dual ownership; NUMERIC precision; D365 stage 5
- [[MON-domain-planning]] — 04-planning T-001 hard-depends on Technical T-080/T-081 (bundle + release adapter)
- [[MON-domain-production]] — consumes released BOM/factory spec; owns `wo_outputs`/`oee_snapshots` (not Technical)
