# Runbook — clean-slate wipe + machines-free acceptance walkthrough

_Authored 2026-07-06 during the process-model consolidation (Waves 1–5). Companion to
`_meta/plans/2026-07-06-process-model-consolidation.md` + `2026-07-06-consolidation-waves.md`._

## 1. Clean-slate DB wipe (org -002)

Goal: empty operational + master data so onboarding can be re-run, WITHOUT breaking login.

**KEEP** (or the app breaks / can't log in): organizations, users, roles, role_permissions,
user_roles, org_*_policies, org_document_settings, reference_schemas, reference_tables,
npd_departments/field_catalog/department_field, unit_of_measure, settings tables, schema_migrations,
tenants. **WIPE**: sites, warehouses, locations, production_lines, routings, labor_rates, suppliers,
items, formulations, BOM*, npd_projects, PO/WO/GRN, stock/LP, quality, maintenance, costing, audit/outbox,
org_sequences.

Privileged access (app_user is RLS-gated and CANNOT wipe):
- `service_role` key via PostgREST bypasses RLS for plain DELETEs — but NOT BEFORE-DELETE
  immutability triggers (BOM/audit append-only) nor schema `app`.
- `postgres` via `psql "host=aws-1-eu-central-2.pooler.supabase.com port=6543 user=postgres.<ref>"`
  has BYPASSRLS + can `SET session_replication_role=replica` (disables triggers+FK in a txn) + owns tables.
  Port 6543 (txn mode) accepts a freshly-reset password immediately; 5432 (session) lags ~1 min.

⚠ **Resetting the Supabase DB password breaks the deployed app** — Vercel `DATABASE_URL_OWNER`
(postgres role) still holds the old password → `withOrgContext` owner-pool auth fails → whole shell
degrades ("could not be loaded", nav collapses to Dashboard). Fix: `vercel env add DATABASE_URL_OWNER
production --sensitive --force` with the new password + redeploy. (`app_user`/`DATABASE_URL_APP` has a
separate password, untouched — misleading because direct app_user queries still work.) See
`[[monopilot_db_reset_breaks_vercel_owner]]`.

## 2. Two independent numbering systems (post-wipe expectation)

- **NPD project codes** (`NPD-001`…) come from `org_sequences` → WIPED → **restart at 001**.
- **Document numbers** (PO/WO/GRN, `PO-YYYYMM-NNNN`) come from `org_document_settings.next_seq` (via
  `lib/documents/numbering.ts`) → **KEPT** → **continue** from wherever they were (they do NOT restart).
  This is intended (code masks / numbering config are org settings, not operational data).

## 3. Reference vocabulary survives the wipe (by design)

`reference_tables` / `reference_schemas` are KEPT, so controlled vocab (processes-vocab, allergens, UoM,
country, categories) persists. After the Wave-2 consolidation the legacy reference-A "process steps"
system is RETIRED (migration 441) — process definitions now live in `npd_process_defaults` (+roles),
surfaced by the unified Settings → Processes screen.

## 4. Machines-free acceptance walkthrough (post Waves 1–4)

Machines are GONE (migration 443): no machines tables/columns; equipment carries maintenance under a line;
lines are active with no precondition. Re-run acceptance in this order and assert each ✓:

1. **Site** → Settings → Sites & lines.
2. **Warehouse + location** → Settings → Warehouses / Locations (receive location for GRN).
3. **Line** → Settings → Production lines → create → **activate with ZERO machines** ✓ (V-SET-62 removed).
4. **Labor rates** → Settings → Labor rates → add role rates (e.g. operator @ £/h). These feed process cost.
5. **Processes** → Settings → Processes (unified) → create a process with **roles×headcount** → cost
   **auto-computes** = Σ(headcount × rate) with a manual override; **prefix auto-numbers** (PREP-01…);
   setup/throughput/yield present ✓. (No machine field — capability only; where it runs is routing.)
6. **Items** → Technical → Items → create RM/ING/PM (supplier → auto-approved spec, buy price →
   supplier_specs.unit_price, sell price separate) + FG.
7. **NPD** → new project → pick **≥1 process** (pizza-style: several processes across stages) → recipe →
   packaging → costing: labor now flows from real process roles×rate (WO stage), NPD live-panel shows Σ
   process cost once processes are chosen (else labelled "estimate").
8. **Routing** → Technical → Routings → op requires **line** (no machine option) ✓.
9. **WO** → Planning → Work orders → New WO → **no machine picker** ✓; crew-less op costs via
   npd_process_default_roles, setup charged once per distinct process ✓.
10. **MWO** → Maintenance → create reactive MWO → **equipment picker** (not machine) ✓.
11. **PO** → Planning → Purchase orders → to supplier, price prefilled from spec.

## 5. Known remaining work (not blockers)
- **W4-T2 WO chain surfacing UX** (pizza multi-line flow): `create-work-order-chain` + `wo_dependencies`
  exist; per-station chain preview UI + surfacing `npd_wip_processes.throughput_per_hour` still to build.
- Allergen/nutrition still require explicit item declarations (all-Absent otherwise — no inference).
- `packages/db/__tests__/infra-master.test.ts` still references machines (fails only under `pnpm db:test`).
- W4-T1 did not wire `npd_wip_processes.setup_cost` (only `npd_process_defaults.setup_cost`).
