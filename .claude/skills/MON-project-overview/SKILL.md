---
name: MON-project-overview
description: Read FIRST before implementing in monopilot-kira — repo map, tech stack, module glossary, pointers to MON-* implementation skills
version: 1.0.0
model: any
canonical_spec: _meta/audits/2026-05-14-MASTER-AGGREGATE-REPORT.md
---

# MON Project Overview (first-read orientation)

**Purpose:** every agent touching monopilot-kira reads this file FIRST. It maps the repo, locks the tech stack, names the 16 business modules, and routes you to the specialized `MON-*` skill for the work in front of you. Do NOT skip — wrong tech-stack guesses cost rework hours (see `prd-decompose-hybrid` SKILL §"Why Opus only").

**What this project is:** browser-based MES (Manufacturing Execution System) for food-grade manufacturing — full plant lifecycle (technical, planning, production, warehouse, scanner, quality, shipping) plus premium modules (NPD, finance, OEE, reporting, multi-site, maintenance). Multi-tenant, white-label. First tenant: Apex (dairy).

## Repo map

| Path | Purpose |
|---|---|
| `apps/web/` | Next.js 15 App Router app — the entire product UI + Server Actions. Routes under `apps/web/app/**`. Middleware: `apps/web/middleware.ts`. Tests: `apps/web/__tests__/`, E2E in `apps/web/e2e/`. |
| `apps/worker/` | **Does NOT exist yet** — created by foundation T-111. Will host outbox consumer, GDPR cron, long-running jobs. |
| `packages/db/` | Drizzle ORM workspace. Schema in `packages/db/schema/*.ts`, migrations in `packages/db/migrations/*.sql` (numbered `001-baseline.sql` upward). Drizzle config: `drizzle.config.ts`. |
| `packages/ui/` | Shared UI components (React 19 + Tailwind 4). |
| `packages/auth/` | Supabase GoTrue wrappers + `@boxyhq/saml-jackson` SAML bindings. |
| `packages/rbac/` | Permission enum + checker. **Locked by ESLint (Settings T-130).** |
| `packages/outbox/` | Outbox table writers + consumer scaffolding. |
| `packages/rule-engine/` | DSL evaluator (rules_registry consumers). |
| `packages/schema-driven/` + `packages/schema-runtime/` | Schema-Driven Design runtime (see `_foundation/skills/schema-driven-design/`). |
| `packages/gs1/` | GS1 / SSCC-18 / GTIN helpers. |
| `packages/ops/` | Ops primitives (rate-limit, idempotency, observability). |
| `packages/server/` + `packages/sync-queue/` | Server primitives + offline scanner sync. |
| `tooling/eslint/` | Workspace ESLint config (`base.mjs`). Custom rules workspace planned at `tooling/eslint-rules/` (Settings T-130). |
| `prototypes/design/Monopilot Design System/` | Source-of-truth React/JSX prototypes per module (one folder per module). Cited by T3 UI tasks via `prototype_match`. |
| `prototypes/design/<NN>-<MODULE>-UX.md` | Per-module UX spec (e.g., `08-PRODUCTION-UX.md`). |
| `docs/prd/00-FOUNDATION-PRD.md` … `15-OEE-PRD.md` | 16 PRDs. The source of truth for requirements. |
| `_meta/` | Planning, atomic tasks, audits, decisions. See `_meta/README.md`. |
| `_meta/atomic-tasks/<NN-module>/` | Per-module task corpus: `manifest.json`, `coverage.md`, `tasks/T-NNN.json`, sometimes `_generate.py` + `_validate.py`. |
| `_meta/audits/` | Cross-cutting audits (reviewer reports, remediation logs). Master index: `2026-05-14-MASTER-AGGREGATE-REPORT.md`. |
| `_foundation/` | ADRs, architecture, skill registry, contracts, regulatory references. Hard contracts in `_foundation/contracts/`. |
| `_shared/` | Shared cross-app primitives (modals, CSS, etc.). |
| `_archive/` | Legacy / cherry-pick reference. Do not edit. |

## Tech stack invariants (DO NOT hallucinate alternatives)

| Layer | Correct | Wrong |
|---|---|---|
| API | Next.js Server Actions in `apps/web/app/.../_actions/*.ts` | FastAPI, Express, `src/api/` |
| DB | Drizzle ORM + Postgres, `packages/db/migrations/*.sql` | SQLAlchemy, generic `migrations/` |
| Tests | Vitest (`pnpm --filter <pkg> test`), Playwright E2E | pytest, Jest standalone |
| UI | Next.js App Router `apps/web/app/.../(module)/page.tsx` | Pages Router `src/pages/` |
| Schema barrel | `packages/db/schema/*.ts` | `src/models/*.py` |
| i18n | next-intl | react-i18next |
| Auth | Supabase GoTrue + `@boxyhq/saml-jackson` | Clerk, Auth.js |

Other locks:
- **Package manager:** pnpm workspaces only. `pnpm-workspace.yaml` lists `apps/*`, `packages/*`, `tooling/*`.
- **Node:** TypeScript 5.8, React 19, Tailwind 4. Vitest 4.
- **CI entry:** `pnpm ci` = `pnpm build && pnpm test:smoke && pnpm lint`.
- **DB local:** `pnpm db:up` (docker-compose postgres), `pnpm db:migrate:local`, `pnpm db:test:local`.

## Modules glossary

16 modules. Task counts measured from `_meta/atomic-tasks/<m>/tasks/` 2026-05-14.

| Folder | Domain | PRD file | Tasks | Canonical event prefix |
|---|---|---|---:|---|
| `00-foundation` | Auth, RBAC, tenancy, audit, outbox, worker, GDPR, observability, e-sign | `00-FOUNDATION-PRD.md` | 125 | `foundation.*.*` |
| `01-npd` | New Product Development, FG product SSOT, allergen cascade | `01-NPD-PRD.md` | 101 | `npd.*.*` |
| `02-settings` | Settings, ref-tables, rules registry, permission enum lock | `02-SETTINGS-PRD.md` | 130 | `settings.*.*` |
| `03-technical` | Products, BOM, routing, equipment, items, cost_per_kg | `03-TECHNICAL-PRD.md` | 90 (manifest=6 stale) | `tech.*.*` |
| `04-planning-basic` | Suppliers, PO, WO baseline, MRP, wo_dependencies | `04-PLANNING-BASIC-PRD.md` | 66 | `planning.*.*` |
| `05-warehouse` | LP tracking, GRN, transfers, transitions DSL | `05-WAREHOUSE-PRD.md` | 58 | `wh.*.*` |
| `06-scanner-p1` | Mobile scanner (dark), operators, scan_event_id | `06-SCANNER-P1-PRD.md` | 49 | `scanner.*.*` |
| `07-planning-ext` | Extended planning, scheduler, schedule_outputs | `07-PLANNING-EXT-PRD.md` | 116 (manifest 57+59 carry-fwd) | `scheduler.*.*` |
| `08-production` | WO execution, **wo_outputs canonical here**, wo_waste_log, downtime | `08-PRODUCTION-PRD.md` | 56 | `wo.*.*` / `production.*.*` |
| `09-quality` | Specs, holds, NCR, HACCP, CCP, allergen gates | `09-QUALITY-PRD.md` | 65 | `qa.*.*` |
| `10-finance` | Standard costs, WO actual costing, FIFO/WAC variance, D365 stage 5 | `10-FINANCE-PRD.md` | 32 | `finance.*.*` |
| `11-shipping` | Customer, SO, allocation, pick/pack, SSCC-18, BOL/POD, RMA, carriers | `11-SHIPPING-PRD.md` | 32 | `shipping.*.*` |
| `12-reporting` | KPIs, dashboards, exports, OEE/quality consumers | `12-REPORTING-PRD.md` | 27 | `reporting.*.*` |
| `13-maintenance` | Asset, PM schedule, MWO, LOTO, calibration, sanitation | `13-MAINTENANCE-PRD.md` | 30 | `mnt.*.*` |
| `14-multi-site` | Site context, inter-site TO, transport lanes, master-data sync | `14-MULTI-SITE-PRD.md` | 31 | `multi_site.*.*` |
| `15-oee` | OEE MVs, snapshots (read-only consumer), drilldowns | `15-OEE-PRD.md` | 25 | `oee.*.*` |

## Where to find what

| Looking for | Path |
|---|---|
| DB schema (Drizzle tables) | `packages/db/schema/*.ts` |
| DB migrations (raw SQL) | `packages/db/migrations/NNN-*.sql` |
| Server Actions | `apps/web/app/<route>/_actions/*.ts` |
| Pages / Server Components | `apps/web/app/<route>/page.tsx` |
| API route handlers (rare) | `apps/web/app/api/<endpoint>/route.ts` |
| Middleware | `apps/web/middleware.ts` |
| Unit / integration tests | `apps/web/__tests__/`, `packages/<pkg>/__tests__/` |
| E2E (Playwright) | `apps/web/e2e/` + root `playwright.config.ts` |
| UI prototypes per module | `prototypes/design/Monopilot Design System/<module>/` (JSX) |
| UX spec per module | `prototypes/design/<NN>-<MODULE>-UX.md` |
| PRDs | `docs/prd/<NN>-<MODULE>-PRD.md` |
| Foundation contracts (hard SLAs) | `_foundation/contracts/*.md` + `*.schema.json` |
| Auth policy | `_foundation/contracts/authorization-policy.md` |
| D365 posture | `_foundation/contracts/d365-posture.md` |
| BOM SSOT | `_foundation/contracts/shared-bom-ssot.md` |
| ESLint custom rules | `tooling/eslint/base.mjs` (root config), `tooling/eslint-rules/` (custom — Settings T-130) |
| Per-module task corpus | `_meta/atomic-tasks/<NN-module>/tasks/T-NNN.json` |
| Per-module manifest | `_meta/atomic-tasks/<NN-module>/manifest.json` |
| Per-module coverage map | `_meta/atomic-tasks/<NN-module>/coverage.md` |
| Master remediation log | `_meta/audits/2026-05-14-MASTER-AGGREGATE-REPORT.md` |

## Wave0 + critical locks

Hard invariants — violation = immediate revert.

- **`org_id` (NOT `tenant_id`).** Wave0 column lock. PRDs sometimes say `tenant_id`; map to `org_id` at task-decomp time. Audit-flagged tasks reverted in F1 (see master report Phase 3).
- **`app.current_org_id()` (NOT raw `current_setting('app.tenant_id')`).** RLS reader function lives in foundation; wrap inserts via `withOrgContext` HOF (`packages/db/src/with-org-context.ts`, foundation T-125).
- **Permission enum locked by ESLint.** Custom rule in `tooling/eslint-rules/` enforces `packages/rbac/permissions.enum.ts`. Owner task: Settings T-130. All per-module perm-enum tasks (`*.perm-enum`) declare cross-dep on T-130.
- **`wo_outputs` canonical = 08-production.** 04-planning-basic uses `schedule_outputs`. User decision 2026-05-14; do not re-introduce duplicate table in 04.
- **D365 export-only (R15 anti-corruption).** Finance T-028, master-data sync 14-MS T-003 — never import D365 state into MES tables; one-way dispatcher only.
- **Site rollout (REC-L1).** All multi-site-touching tables get `site_id` day-1 (14-MS T-030 ALTER+backfill across 20 tables × 9 modules).
- **UI parity:** `prototype_match: true` requires literal `jsx:NN-NN` line-range citation. Foundation generator auto-sets `prototype_match: true` whenever jsx:line ref exists (R1 fixer note).
- **CFR-21 Part 11 e-sign:** `@monopilot/e-sign` (foundation T-124) — required for LOTO, calibration, BOL, NCR closure, spec sign-off.
- **GDPR registry + dispatcher:** foundation T-113/T-114. Every PII-touching task wires into the registry.
- **Outbox + worker:** foundation T-111 (worker scaffold) + T-112 (outbox consumer). All `*.event` emission goes through outbox, not direct queue writes.
- **Rate-limit:** foundation T-121 middleware. All public-facing actions cite it.

## When to dispatch which MON-* skill

Read this skill, then route to the specialist before implementing.

| Work type | Skill |
|---|---|
| Writing a new Drizzle schema + migration (T1-schema) | [[MON-t1-schema]] |
| Writing a Server Action / API (T2-api) | [[MON-t2-api]] |
| Building a Server Component / route / form (T3-ui) | [[MON-t3-ui]] |
| Wiring + test task (T4-test) | [[MON-t4-test]] |
| Anything touching outbox, worker, rate-limit, e-sign, GDPR registry, observability | [[MON-foundation-primitives]] |
| Anything touching `org_id`, `site_id`, `app.current_org_id()`, `withOrgContext`, `withSiteContext` | [[MON-multi-tenant-site]] |
| D365, BRCGS, CFR-21, GS1/SSCC, GDPR-specific flows | [[MON-integrations-compliance]] |
| Decomposing a PRD into atomic tasks | `prd-decompose-hybrid` (existing) |
| Labeling JSX prototypes | `prototype-labeling` (existing) |
| Domain-specific NCR / HACCP / spec / hold | [[MON-domain-09-quality]] |
| Domain-specific SO / pick / pack / SSCC / BOL | [[MON-domain-11-shipping]] |
| Domain-specific WO / wo_outputs / wo_waste_log / downtime | [[MON-domain-08-production]] |
| Domain-specific PM / MWO / LOTO / calibration | [[MON-domain-13-maintenance]] |
| Domain-specific OEE snapshots / MVs / drilldowns | [[MON-domain-15-oee]] |
| Domain-specific LP / GRN / transitions DSL | [[MON-domain-05-warehouse]] |
| Domain-specific FG SSOT / allergen cascade | [[MON-domain-01-npd]] |
| Domain-specific PO / WO baseline / MRP / scheduler | [[MON-domain-04-07-planning]] |
| Domain-specific scanner flows, offline sync, dark-mode | [[MON-domain-06-scanner]] |
| Domain-specific cost-per-kg / FIFO/WAC / variance | [[MON-domain-10-finance]] |

If no specialist exists yet, fall back to this skill + the relevant PRD + the audit report at `_meta/audits/2026-05-14-MASTER-AGGREGATE-REPORT.md`.

## Cross-links

- [[MON-t1-schema]] — Drizzle schema + migration authoring
- [[MON-t2-api]] — Server Actions, auth-adjacent backend
- [[MON-t3-ui]] — Next.js App Router UI with prototype parity
- [[MON-t4-test]] — Vitest + Playwright wiring tests
- [[MON-foundation-primitives]] — outbox, worker, rate-limit, e-sign, GDPR, observability
- [[MON-multi-tenant-site]] — `org_id`, `site_id`, RLS function, HOFs
- [[MON-integrations-compliance]] — D365, BRCGS, CFR-21, GS1, GDPR
- [[MON-domain-01-npd]]
- [[MON-domain-04-07-planning]]
- [[MON-domain-05-warehouse]]
- [[MON-domain-06-scanner]]
- [[MON-domain-08-production]]
- [[MON-domain-09-quality]]
- [[MON-domain-10-finance]]
- [[MON-domain-11-shipping]]
- [[MON-domain-13-maintenance]]
- [[MON-domain-15-oee]]
