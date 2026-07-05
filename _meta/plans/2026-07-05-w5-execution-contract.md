# W5 Execution Contract — Technical↔BOM↔NPD alignment (2026-07-05)

Binding contract for Wave-A lanes. Charter + rulings: `2026-07-05-technical-bom-alignment-charter.md`.
Wave0 lock: org_id + `app.current_org_id()`. Next free migration = **436**. Migrations must be
fully re-entrant (Vercel runner re-executes). Lanes do NOT edit `apps/web/i18n/*.json` — return
needed keys in the report; orchestrator merges centrally. Codex lanes: NO `pnpm build`; verify
with targeted vitest only. NO lane touches a file owned by another lane.

## Contracted DDL (migrations 436-439, authored by L1)

**436-w5-process-yield-and-lines.sql**
- `npd_wip_processes` + `wip_definition_processes`: `add column if not exists yield_pct numeric(6,3) not null default 100` CHECK (>0 and <=100).
- `npd_projects`: `add column if not exists production_line_id uuid references public.production_lines(id)`.
- `pilot_runs`: `add column if not exists production_line_id uuid references public.production_lines(id)` (legacy text `line` kept, deprecated).
- `wo_operations`: `add column if not exists crew jsonb` — shape `[{"role_group":text,"headcount":int}]`.
- `routing_operations`: `add column if not exists crew jsonb` (same shape) + `add column if not exists yield_pct numeric(6,3) not null default 100`; COMMENT `cost_per_hour` as DEPRECATED (kept, no longer written/read).

**437-w5-product-categories.sql**
- `"Reference"."ProductCategories"` (id uuid pk, org_id, code text, label text, is_active bool default true, display_order int, unique(org_id, code)); RLS org-scoped function-form; grants to app_user (select/insert/update); org-insert seed trigger; backfill seed of the 5 existing hardcoded values ('Meat · Cold cut','Meat · Smoked','Meat · Cured','Meat · Pâté','Fish · Smoked') for ALL existing orgs.
- `items`: `add column if not exists category_code text` (validated in actions, not FK).

**438-w5-packaging-substitutes.sql**
- `packaging_components`: `add column if not exists substitute_item_id uuid references public.items(id) on delete restrict`.

**439-w5-routing-origin.sql**
- `routings`: `add column if not exists origin_module text not null default 'technical'` CHECK in ('technical','npd').

## Lane ownership (Wave A)

| Lane | Engine | Owns (files) | Scope |
|---|---|---|---|
| L1 | Codex | packages/db/migrations/436-439 | Author DDL above verbatim; re-entrancy double-exec proof against local `monopilot_w3` DB |
| L2 | Codex | `apps/web/app/(npd)/pipeline/_actions/_lib/materialize-npd-bom.ts` + its tests; `apps/web/app/(npd)/fa/actions/wip-process-actions.ts`; `technical/wip-library/_actions/wip-definition-actions.ts` | Yield compounding (qty = qty_per_pack / Π(yield of own+downstream processes) × packs_per_case); regen NEW BOM version at materialize when formulation/packaging changed since active BOM; uom_base correction (post-conflict UPDATE 'szt'→'kg') + output_uom='box' when packs_per_case>0; copy PM substitute → bom_lines.substitute_item_id; accept/persist yield_pct in process save actions. Pinning tests incl. 0.300/0.95/0.95=0.3324 |
| L3 | Codex | NEW `_lib/materialize-npd-routing.ts`; `planning/work-orders/_actions/create-work-order-core.ts`; `technical/routings/_actions/cost-preview.ts` + `create-routing.ts`/`update-routing.ts`; `finance/_actions/wo-cost-actions.ts` | Routing bridge: export `materializeNpdRouting(sql, projectId)` building draft routing (origin_module='npd') from npd_wip_processes (op_no=display_order, run_time from throughput, line_id from npd_projects.production_line_id, crew from roles, yield_pct); WO create copies crew→wo_operations; Finance costs from wo_operations.crew × labor_rates (fallback = old chain); routing cost-preview from crew × labor_rates; stop writing cost_per_hour |
| L4 | Composer | `apps/web/app/(npd)/fa/_components/fa-production-tab.tsx` + `_actions/load-formulation-wip-panel.ts`; pilot/trial line pickers (`trial/_actions/list-production-lines.ts` consumers, `create-pilot-wo.ts` prefill) | ONE line picker: UUID picker over production_lines in Production detail → npd_projects.production_line_id; pilot + WO create PREFILL from it; remove Lines_By_PackSize dropdown; hide legacy prod_detail line/rate/resource_requirement cells; yield% input per process row (calls L2 action per contract) |
| L5 | Composer | `handoff/_actions/generate-production-bom.ts`; `(npd)/builder/_actions/release-npd-project-to-factory.ts`; `technical/items/[item_code]/_actions/get-item.ts` + overview tab | Packaging HARD GATE (block with loud error listing item-unlinked packaging rows) before materialize; wire `materializeNpdRouting` call after BOM (signature per L3 contract); at promote persist target_retail_price→items.list_price_gbp + effective-cost snapshot; Technical item page shows effective cost (v_item_effective_cost) alongside/instead of raw cost_per_kg |
| L6 | Composer | NEW Settings screen `settings/reference/product-categories/`; `create-project-wizard.tsx` + `project-brief-screen.tsx` (category dropdown source); items wizard + `technical/bom/_actions/queries.ts` | Category from Reference.ProductCategories (org CRUD in Settings); NPD wizard/brief dropdown reads it; items wizard collects category_code; BOM list column reads real category (STOP rendering fg_npd_ext.department_number as category) |
| L7 | kira-ui | `technical/bom/**` detail/tree UI; `pipeline/_lib/gate-checklist-auto-satisfy.ts` (1-line) | BOM detail tree: line quantities with "per box × N" basis annotation; substitute shown on RM+PM lines; WIP lines expandable to show their sub-BOM; checklist fix: add "recipe has at least one ingredient" to INGREDIENTS_PRESENT_TEXTS |
| L8 | Opus | (review-only, Wave B) | Regulatory/logic review of all diffs, then Gate-5b browser walk |

Cross-lane API contracts:
- `materializeNpdRouting(sql, projectId)` → `{ ok: true, routingId } | { ok: false, code: 'no_processes'|'no_line'|'routing_exists' }` (idempotent; existing npd-origin routing reused).
- L2 process-save actions accept `yieldPct?: number` (validated 0<x<=100, default 100).
- Crew jsonb shape everywhere: `[{"role_group": string, "headcount": number}]`.

## Waves
- **A** (now): L1-L7 build. Gate: tsc + targeted vitest + `pnpm --filter web build`; migs 436-439 applied via MCP pre-push; push via mk_push; Vercel READY.
- **B**: L8 Opus review + fixes; Gate-5b browser walk #1 (full NPD→handoff→Technical→WO line: handoff builds COMPLETE BOM incl. packaging+substitutes, prices on item, routing exists, WO pulls ops+crew+BOM per-box).
- **C**: fix lanes for walk findings; walk #2 (+#3 if needed) until CLEAN per owner's mandated proof: "handoff tworzy cały BOM, ceny się zgadzają, WO wszystko poprawnie pobiera z BOM".
- **D**: final end-to-end logic audit (field typology sign-off = minimal product field set T9) + HTML wave report + purge test data.
