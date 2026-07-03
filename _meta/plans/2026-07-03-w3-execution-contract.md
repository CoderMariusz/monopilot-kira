# W3 execution contract — WIP platform (F-NPD-3, lanes L8-L11)

Single source of truth for all four W3 lanes. Owner rulings: D29/D32/D33/D34/D35/D42/D43, U3/U4
(charter: `_meta/plans/2026-07-03-npd-round3-charter.md`). Orchestrator (Fable) applies migrations
via Supabase MCP and commits — lanes NEVER run migrations, NEVER commit, NEVER edit migrations 001-429.

## Design (locked by orchestrator)

A **WIP definition** is a self-contained org-wide mini-product:
composition (RM per 1 output unit) + process chain + yield + ONE shared items row (D34).
`base_uom` = the creating process's output unit (D42) — v1 recipe picker restricted to mass units (kg/g).

Ground truth (recon): `formulation_ingredients` has NO linkage to `prod_detail`/WIP chains; bridge is
`product.recipe_components` code-string → `sync_prod_detail_rows()`. Cost engine `wipComponents` input
exists but is fed `[]` (compute.ts:394). BOM `component_type='WIP'` is valid in CHECK but never written.
`wo_dependencies` exists (mig 177) but no caller. No notification inbox exists anywhere.

Flow:
1. **Create/publish** (project side): production-tab component chain → "publish as WIP definition"
   captures chain into `wip_definition_processes`; user completes composition+yield in the library.
   Definitions can also be created from scratch in the library.
2. **Reuse** (recipe side): formulation editor WIP picker adds a `formulation_ingredients` row with
   `item_id` = WIP shared item + `wip_definition_id` set (qty_kg per pack). Existing lock→
   `recipe_components`→`sync_prod_detail_rows` bridge then materializes the prod_detail component
   automatically (WIP items are item_type='intermediate', already in the allowed set).
   Production tab shows referenced chains READ-ONLY with "edit in library" link (D32 reference, not copy).
3. **Costing**: compute.ts partitions formulation rows — `wip_definition_id IS NULL` → `ingredients`,
   else → `wipComponents` (qty per pack, kg; rawMaterialCostPerOutputUnit from composition ×
   `v_item_effective_cost`; processes+yield from definition). Uncosted composition → existing
   `ingredient_costs_missing` typed blocker (never silent 0).
4. **Handoff / per-level BOM (D43)**: materializeNpdBom v2 — WIP recipe rows become FG BOM lines
   `component_type='WIP'`; each referenced definition gets/refreshes its OWN active BOM on the WIP item
   (line_basis='per_base', lines from composition, yield_pct from definition). WIPs storable as LP stock
   (no schema change needed — normal items).
5. **WO chain (U4)**: new `createWorkOrderChain` — creates WIP WO(s) for `component_type='WIP'` BOM lines
   + FG WO, linked via `wo_dependencies` (verify columns; fallback `schedule_outputs.downstream_wo_id`).
   Pilot uses the chain. Genealogy via EXISTING LP output/consume chokepoints — T-064 holds gate UNTOUCHED.
6. **Change flow (D33/U3)**: definition edit → `version+1` → outbox `wip.definition.updated` +
   `user_notifications` rows (created_by of referencing projects) → banner on referencing project pages →
   explicit "Update & accept" per project records `wip_definition_acks(accepted_version)`; if the project's
   FG BOM is already active (in production), accept ALSO regenerates the WIP BOM + FG BOM.

## Migrations (next free = 430; re-entrant — Vercel re-runs them; DML must not read columns a later mig drops)

### 430-wip-definitions-platform.sql (owner: L8)
- `public.wip_definitions`: id uuid PK default gen_random_uuid(), org_id uuid NOT NULL REFERENCES
  organizations(id) ON DELETE CASCADE, item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  name text NOT NULL, description text, base_uom text NOT NULL DEFAULT 'kg',
  yield_pct numeric(6,3) NOT NULL DEFAULT 100 CHECK (yield_pct > 0 AND yield_pct <= 100),
  version int NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft','active','archived')), reusable boolean NOT NULL DEFAULT false,
  source_project_id uuid REFERENCES npd_projects(id) ON DELETE SET NULL, created_by uuid,
  created_at/updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (id, org_id).
  Partial unique index (org_id, lower(name)) WHERE status <> 'archived'.
- `public.wip_definition_ingredients`: id PK, org_id (CASCADE), wip_definition_id uuid NOT NULL
  (composite FK (wip_definition_id, org_id) → wip_definitions(id, org_id) ON DELETE CASCADE),
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  qty_per_unit numeric(14,6) NOT NULL CHECK (qty_per_unit >= 0), uom text NOT NULL DEFAULT 'kg',
  sequence int NOT NULL DEFAULT 0, UNIQUE (org_id, wip_definition_id, item_id).
- `public.wip_definition_processes`: mirror of npd_wip_processes scalars — id PK, org_id,
  wip_definition_id (composite FK CASCADE), process_name text NOT NULL, display_order int NOT NULL
  DEFAULT 0, duration_hours numeric(10,4) NOT NULL DEFAULT 0, additional_cost numeric(14,4) NOT NULL
  DEFAULT 0, throughput_per_hour numeric(14,4), throughput_uom text, setup_cost numeric(14,4) NOT NULL
  DEFAULT 0, UNIQUE (id, org_id). Same non-negative CHECKs as mig 389/429. NO creates_wip_item here.
- `public.wip_definition_roles`: id PK, org_id, process_id uuid NOT NULL (composite FK (process_id,
  org_id) → wip_definition_processes(id, org_id) ON DELETE CASCADE), role_group text NOT NULL,
  headcount int NOT NULL DEFAULT 1, rate_per_hour numeric(18,4), UNIQUE (org_id, process_id, role_group).
- `public.wip_definition_acks`: id PK, org_id, wip_definition_id (composite FK CASCADE),
  npd_project_id uuid NOT NULL REFERENCES npd_projects(id) ON DELETE CASCADE, accepted_version int NOT
  NULL, accepted_by uuid, accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, wip_definition_id, npd_project_id).
- `ALTER TABLE npd_wip_processes ADD COLUMN IF NOT EXISTS wip_definition_id uuid` + composite FK
  (wip_definition_id, org_id) → wip_definitions(id, org_id) ON DELETE SET NULL.
- `ALTER TABLE formulation_ingredients ADD COLUMN IF NOT EXISTS wip_definition_id uuid REFERENCES
  wip_definitions(id) ON DELETE SET NULL` (no org composite — table has no org_id; scoped via version).
- RLS on ALL new tables: `FOR ALL TO app_user USING/WITH CHECK (org_id = app.current_org_id())`
  (function form — NEVER raw current_setting). GRANT SELECT/INSERT/UPDATE/DELETE to app_user
  (acks: SELECT/INSERT/UPDATE only). Indexes for the hot reads (org+definition+order; org+project on acks).

### 431-user-notifications.sql (owner: L8)
`public.user_notifications`: id PK, org_id (CASCADE), user_id uuid NOT NULL, type text NOT NULL,
title text NOT NULL, body text, link text, payload jsonb NOT NULL DEFAULT '{}', read_at timestamptz,
created_at timestamptz NOT NULL DEFAULT now(). Index (org_id, user_id, created_at DESC).
RLS: mirror `notification_preferences` (mig 070) pattern for user-level scoping — verify whether a
current-user function exists; if not, org RLS + mandatory user_id filter in every query.
GRANT SELECT/INSERT/UPDATE to app_user (no DELETE).

### 432-technical-wip-permissions.sql (owner: L8)
`technical.wip.create` / `technical.wip.edit` / `technical.wip.deactivate` seeded to operator+lead+
org-admin family in BOTH role_permissions AND legacy jsonb, with org-insert trigger + backfill
(model: mig 207 + mig 149; recurring live-bug class 1 — page CHECK strings must byte-match seeds).
Outbox: add `wip.definition.updated` to packages/outbox/src/events.enum.ts; check whether a DB CHECK
constraint on outbox_events.event_type exists (follow how the LAST event type was added) — if yes,
extend it here.

## File ownership (EXCLUSIVE — do not touch other lanes' files)

| Lane | Owns |
|---|---|
| L8 (Codex) | migs 430/431/432; NEW `apps/web/app/[locale]/(app)/(modules)/technical/wip-library/_actions/wip-definition-actions.ts` (+ siblings) — CRUD, publish-from-prod-detail capture, version bump + outbox + notifications fan-out, ack accept action, allergen aggregate on save; `ensureWipItem` v2 inside `apps/web/app/(npd)/fa/actions/wip-process-actions.ts` (dedup via definition.item_id, uom_base = definition.base_uom, audit_log write); unit tests |
| L9 (Codex) | `apps/web/app/(npd)/pipeline/_actions/_lib/materialize-npd-bom.ts` (v2 per-level); NEW `create-work-order-chain.ts` under planning work-orders _actions; `create-work-order-core.ts` (only if chain linkage requires a param); `create-pilot-wo.ts` (chain); `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/costing/_actions/compute.ts` (partition rows → wipComponents assembly); real-DB integration tests (multi-level BOM, WO chain, genealogy) + unit tests |
| L10 (Composer) | NEW `apps/web/app/[locale]/(app)/(modules)/technical/wip-library/**` pages/components (list/detail/chain+composition editor/where-used, reusable toggle); `apps/web/lib/navigation/technical-nav.ts` (+nav item); formulation editor WIP picker (`formulation-editor.tsx` + a NEW small server action `search-wip-definitions.ts`); `get-component-processes.ts` read-through (referenced chain → read-only + definition link) + `fa-production-tab.tsx` read-only rendering + "publish as WIP definition" button wiring |
| L11 (Composer) | NEW notification inbox: bell + unread count in the shell topbar, `/[locale]/(app)/notifications` page (or dropdown), mark-read action; WIP-updated banner on NPD project pages (amber section pattern from formulation-wip-panel.tsx:22-31) + "Update & accept" button calling L8's ack action; where-used surfacing on banner |

Shared contracts: L10/L11 call L8's actions by the signatures in this doc; if a signature must change,
record it in `_meta/tmp/w3-contract-changes.md` (append-only) instead of editing other lanes' files.

## Action signatures (L8 implements; L10/L11 consume)

- `listWipDefinitions(filter?) → {ok, definitions: [{id, name, baseUom, version, status, reusable, itemCode?, processCount, referencingProjects}]}`
- `getWipDefinition(id) → {ok, definition, ingredients[], processes[{...roles[]}], whereUsed: [{projectId, projectName, fgCode, acceptedVersion}]}`
- `saveWipDefinition({id?, name, description?, baseUom, yieldPct, reusable, ingredients[], processes[]}) → {ok, id, version}` — bumps version on content change, fans out notifications+outbox, refreshes WIP item allergens (canonical Reference."Allergens" semantic codes; NEVER public.allergens)
- `publishWipDefinitionFromComponent({prodDetailId, name}) → {ok, id}` — captures chain, links npd_wip_processes.wip_definition_id
- `acceptWipDefinitionUpdate({wipDefinitionId, projectId}) → {ok, acceptedVersion}` — upserts ack; if project FG BOM active → regenerate WIP BOM + FG BOM
- `archiveWipDefinition({id}) → {ok}` — blocked while referenced by non-archived projects (409-style typed error)
- `searchWipDefinitions({q}) → {ok, options: [{id, name, baseUom, itemId, itemCode}]}` — reusable+active only, mass units only (v1)
- `listMyNotifications({unreadOnly?}) / markNotificationRead({id}) / markAllRead()`

## Non-negotiables (all lanes)

- RBAC: server actions check permissions inside `withOrgContext` (`technical.wip.*` for library writes,
  `npd.production.write` for project-side, `npd.planning.write` for WO chain). Fail-closed.
- `'use server'` modules export ONLY async functions — zod schemas/consts in non-'use server' sidecars.
- i18n: DO NOT edit en.json/pl.json/ro/uk. Write needed keys to `_meta/tmp/w3-i18n-<lane>.json`
  as `{ "namespace.key": {"en": "...", "pl": "..."} }`. Orchestrator merges centrally.
- Verification = targeted vitest (`node node_modules/vitest/vitest.mjs run <path>` — .tsx needs
  `--config vitest.ui.config.ts`) + tsc on touched packages. NEVER `pnpm build` (hangs the shared env).
- Real data honesty: no silent zeros, no silent fallbacks; typed error codes; truthful copy.
- English code/comments/artifacts. No commits. Report = files touched + what/why + test output + open risks.
