# 2026-05-14 — Architecture, Foundation, Prototype, and Cross-cutting Gap Audit

**Auditor:** Auditor B (architecture/foundation/prototype/cross-cutting; complements Auditor A who covers PRD-vs-task coverage).
**Scope:** read-only sweep of `_foundation/`, `_meta/atomic-tasks/00-foundation/`, all per-module `prototype-index-*.json` + `translation-notes-*.md`, ADRs, recent specs/decisions/audits, every module's `coverage.md`/`manifest.json`, sampled T1-schema tasks across modules, and `apps/`+`packages/`+`lib/` inventory. **Tasks JSONs under 03/05/06/07/08 were read only — never modified.**
**Date of evidence:** 2026-05-14.

---

## Executive summary

### Top 10 foundation/architecture gaps

1. **Tenant-context API drift between Foundation and module tasks.** Foundation ships a non-spoofable `app.set_org_context(session_token, org_id)` function plus an `app.current_org_id()` SQL function backed by `app.active_org_contexts` (see `packages/db/migrations/002-rls-baseline.sql:30-73`). 20 task JSONs across 7 modules (01/02/04/05/07/08/09 + parts of 00) still spec RLS via the GUC pattern `current_setting('app.current_org_id')` or even `current_setting('app.tenant_id')`. Counts: 13 tasks use `current_setting('app.current_org_id')`, 7 use `current_setting('app.tenant_id')` (e.g. `_meta/atomic-tasks/01-npd/tasks/T-001.json:29` RLS policy and AC). These will compile but will not interoperate with the Foundation RLS contract.
2. **50 carry-forward Foundation tasks (FT-001..FT-050) exist on paper only.** `_meta/audits/2026-05-07-foundation-final-carry-forward-backlog.md` enumerates them; **none has a JSON file under `_meta/atomic-tasks/00-foundation/tasks/`** — the pipeline cannot pick them up. Of these, 5 are P0 deploy blockers (FT-001 withOrgContext HOF, FT-020 org.platform.admin seed, FT-021 017-rbac.sql checksum, FT-024 tenant_idp_config RLS, FT-033 packages/ui React 19 alignment).
3. **No production observability scaffolding.** Zero Foundation tasks mention OpenTelemetry / Sentry / structured logger / metrics exporter / dashboards. One off-mention exists in `08-production/T-026`. Module tasks assume `logger.*` calls will "just exist."
4. **No backup / DR / RPO / RTO policy or task anywhere.** Searched all 637 task JSONs — zero matches for `backup|disaster|RPO|RTO`. Audit log retention enforcement also missing (audits already note this — see `2026-05-07-foundation-final-production-readiness-audit.md` §F.2).
5. **No rate-limiting / abuse-protection foundation.** Two task hits, both module-local fixes; no global middleware or auth-endpoint rate limit task.
6. **No GDPR right-to-erasure framework.** Zero hits for `gdpr|RTBF|erasure` outside 01-NPD T-089. `audit_events` retention-class column exists but no enforcement.
7. **Outbox worker has no production caller.** `packages/outbox/src/worker.ts` exists (T-008) but no cron/process/route invokes `runOnce()` — confirmed in production-readiness audit §F.3. Every event written to `outbox_events` accumulates.
8. **Cron / scheduler runtime is Vercel-only.** `scripts/cron.json` per T-034 is Vercel-format; no Kubernetes/GitHub Actions/AWS EventBridge alternative. Self-host = no schema-drift detection, no D365 sync, no GDPR jobs, no audit-retention jobs. Foundation owns this primitive only in stub form.
9. **`packages/ui` consumability blocker (FT-033/T-076).** `packages/ui` peerDeps lock React 18; `apps/web` is React 19. Six primitives (Modal/Stepper/Field/ReasonInput/Summary/Tuning) are functionally unconsumable. Wave-B UI module work will silently re-inline.
10. **ADR adoption is anaemic in module tasks.** ADR-031 (schema variation per org) referenced by **1** task; ADR-030 (configurable dept taxonomy) by **2**; ADR-032 (Settings carve-out for NPD unlock) by **0**; ADR-035 (marker discipline) referenced only inside Foundation. The meta-model contract is not flowing into module implementation contracts.

### Top 5 worst prototype traceability gaps

1. **09-QUALITY: 6 prototype labels with no atomic task** (out of 32 labels). Specifically: `ncr_list`, `ncr_detail`, `haccp_plans`, `ccp_monitoring`, `ccp_deviations`, `allergen_gates` (all in `prototypes/design/Monopilot Design System/quality/ncr-screens.jsx` and `…/haccp-screens.jsx`). These are PRD-critical regulatory features (BRCGS, HACCP, allergen control) with full prototypes and zero implementation atom.
2. **05-WAREHOUSE shell chrome uncovered.** `app_sidebar`, `app_topbar`, `warehouse_sub_nav` (all in `warehouse/shell.jsx`) have no task — but tasks in 05-WAREHOUSE are read-only per parallel-work policy; flagging only.
3. **01-NPD: 2 uncovered prototype labels** — `create_project_wizard` and `brief_screen` (`prototypes/design/Monopilot Design System/npd/project.jsx:107-263` and `:45-104`). These are the primary entry points to NPD; their absence in the atomic-task graph is significant.
4. **Translation-notes rules not encoded as risk_red_lines.** 09-quality translation notes explicitly call out 21 CFR Part 11 e-sign rules, server-side SoD enforcement, and PIN keypad (BL-QA-06). Only 19 of 36 quality tasks mention CFR/e-sign, and only 2 mention SoD-server-side. The architectural rules live in markdown, not in task contracts.
5. **Legacy `prototypes/<module>/` set is mostly superseded but has 4 stragglers** that exist only in legacy and not in `Monopilot Design System/`:
   - `prototypes/npd/config-data.jsx`, `prototypes/npd/config-runtime.jsx`, `prototypes/npd/config-screens.jsx`
   - `prototypes/settings/import-export.jsx`
   These are not covered by the prototype-labeling system and no task references them. They are either dead code (and should be archived) or load-bearing for an unrepresented feature.

### Top 5 worst cross-cutting concern gaps

1. **Tenant-context middleware not wired.** `apps/web/middleware.ts:13-18` explicitly disclaims calling `app.set_org_context`. There is no `withOrgContext` HOF (FT-001), so every Server Action must remember to set context or rows silently return 0. This is reachable from the open internet today and is **the #1 foot-gun in the system**.
2. **`tenant_idp_config` exposed without RLS.** Migration 025 grants SELECT to `app_user`; migration 005 enabled no RLS; `/api/auth/saml/login?tenant=…` accepts attacker-controlled tenant. Unauthenticated cross-tenant IdP-config enumeration (FT-024). Documented in `_meta/audits/2026-05-07-foundation-final-consistency-audit.md` P0 finding #6.
3. **No CI/CD pipeline definition lives in the task graph.** `.github/workflows/` is not under any task scope. `pnpm lint` from root currently fails on `packages/ops` per the production-readiness audit. No preview-env policy.
4. **No `apps/web/e2e/` Playwright directory and only a 12-line stub `playwright.config.ts`.** UI-PROTOTYPE-PARITY-POLICY mandates Playwright traces but no foundation task installs the harness end-to-end.
5. **No secret-management foundation task.** `.env.example` documents only `DATABASE_URL`; 5 production-required env vars (`MFA_MASTER_KEY`, `CRON_SECRET`, `RBAC_APPROVAL_HMAC_KEY`, `POSTHOG_*`, Supabase service-role) are undocumented. Only one of five has a fail-closed prod guard.

### Data-model coherence verdict

**AMBER → RED on shared-table ownership and naming consistency.** Foundation T-040 created singular placeholder tables (`lot`, `work_order`, `quality_event`, `shipment`, `bom_item`) but module tasks consistently reference plural names (`work_orders` 25×, `license_plates` 24×, `bom_headers` 196×, `bom_lines` 22×). Two competing finished-good identifiers appear in tasks: `items` (352 hits, 03-Technical canonical per PRD §5.1) and `products` (321 hits, 01-NPD canonical per ADR-034 rename of `fa`). The two are stratified by module intent (Technical = universal item master, NPD = product/FG aggregate) but **no foundation task or contract enforces the boundary**, and shared-BOM-SSOT contract (`_foundation/contracts/shared-bom-ssot.md`) explicitly leaves physical naming to "downstream Technical-module DDL tasks." Tenant scoping is similarly fractured: 7 tasks still use `tenant_id`/`current_setting('app.tenant_id')` instead of `org_id`/`app.current_org_id()` despite the Wave0 v4.3 lock.

---

## 1. Foundation layer gaps

### 1.1 `_foundation/contracts/` reference graph

| Contract | Tasks that cite it | Verdict |
|---|---|---|
| `authorization-policy.md` | 00-foundation/T-050; 01-npd/T-092, T-093 | Underreferenced — Settings/Technical tasks should cite it when enforcing permission grants. |
| `shared-bom-ssot.md` + `.schema.json` | 00-foundation/T-049; 01-npd/T-092, T-093 | Almost no downstream Technical task cites the contract that owns BOM identity. |
| `d365-posture.md` | 00-foundation/T-051 | Cited by **0** module tasks despite 27 module tasks mentioning D365. |

### 1.2 ADRs vs. tasks

| ADR | Module tasks citing it |
|---|---|
| ADR-028 schema-driven column definition | 10 |
| ADR-029 rule engine DSL / workflow-as-data | 7 |
| ADR-030 configurable dept taxonomy | **2** |
| ADR-031 schema variation per org | **1** |
| ADR-032 Settings minimum carve-out for NPD unlock | **0** |
| ADR-034 generic product lifecycle naming | 8 |
| ADR-035 marker discipline | Foundation-only |

ADRs 030/031/032 are core meta-model commitments and they are essentially invisible in module implementation contracts.

### 1.3 Carry-forward backlog has zero atomic-task representation

`_meta/audits/2026-05-07-foundation-final-carry-forward-backlog.md` lists 50 distinct carry-forward items renumbered FT-001..FT-050. `/bin/ls _meta/atomic-tasks/00-foundation/tasks/` returns 61 files (T-001..T-061); no `FT-*` files exist. **Five P0 items remain unactionable until atomized:**
- **FT-001** withOrgContext HOF (T-011)
- **FT-020** org.platform.admin seed (T-039)
- **FT-021** 017-rbac.sql checksum mismatch (T-039, T-013)
- **FT-024** tenant_idp_config RLS + service-role-only read (T-012)
- **FT-033** packages/ui React 19 peerDeps alignment (T-037)

### 1.4 Missing baseline platform primitives — suggested atomic tasks

The following platform primitives are **assumed by multiple module tasks** but have **no Foundation task that owns the primitive**. None should be created without first reading the matching production-readiness audit section.

| Missing primitive | Why every module needs it | Suggested atomic task |
|---|---|---|
| `withOrgContext` Server Action HOF (FT-001) | Without it every tenant-scoped Server Action silently returns 0 rows or leaks. Every module's `actions/` files assume it. | New foundation T-062: `withOrgContext` HOF in `apps/web/lib/auth/` + contract test across N RLS-scoped tables. |
| Outbox worker production caller | Every domain event (cascade, schema publish, cohort advance, audit-via-outbox) is written but never consumed. | New foundation T-063: outbox worker process under `packages/outbox` invoked from a deployable target (cron route + queue worker container). |
| Audit-log retention enforcement job | Migration 004 declared 4 retention classes; no job enforces them. | New foundation T-064: retention worker iterating `audit_events` by class with HARD-stop for `security` (7y). |
| GDPR right-to-erasure framework | No module task can erase a user without a coordinated cascade. | New foundation T-065: GDPR controller in `packages/server` driving per-table soft-delete + anonymisation chain. |
| Cron scheduler abstraction | Vercel-only today; self-host has no schema-drift, no D365 sync, no GDPR jobs. | New foundation T-066: `packages/scheduler` adapter w/ Vercel + GitHub Actions + Kubernetes CronJob targets. |
| OpenTelemetry / structured logging | No module task wires logger/metrics; every code path silently logs to console. | New foundation T-067: `packages/observability` exporting `logger` + `trace()` + Sentry/OTel exporters configured by env. |
| Rate-limiting middleware | Auth, SAML, SCIM, magic-link endpoints are unbound today. | New foundation T-068: `apps/web/middleware.ts` integration with a rate-limit primitive (Upstash/Vercel KV or in-memory + Postgres). |
| Backups / DR runbook | No artifact, no task, no runbook. | New foundation T-069: `_foundation/runbooks/backup-restore.md` + DR RPO/RTO contract. |
| `apps/web/public/icons/` PWA assets | T-041/T-042 reference 3 icon files; directory does not exist. | New foundation T-070: produce icons and add CI check. |
| Storybook + axe-core CI | T-025/T-056 closeouts deferred; no `.storybook/` in `packages/ui`. | New foundation T-071: real `packages/ui/.storybook/` + axe-core CI step. |
| Playwright harness | `playwright.config.ts` is a 12-line stub; `apps/web/e2e/` does not exist. | New foundation T-072: install @playwright/test, create `apps/web/e2e/`, wire to CI matrix. |
| Secrets baseline & `.env.example` | Only `DATABASE_URL` documented. | New foundation T-073: enumerate every `process.env.*` used in `apps/`+`packages/`, write `.env.example`, add prod-fail-closed guards for the 4 still missing them. |
| ESLint coverage extension to new packages | T-055 closeout drift broken by `packages/ops` immediately. | New foundation T-074: extend `tooling/eslint/base.mjs` ruleset to every package added post-T-055 (`packages/ops`, `packages/schema-driven`, future). |

---

## 2. Prototype traceability gaps

### 2.1 Per-module audit (paths validated against disk)

Method: each per-module `prototype-index-*.json` was parsed; every `file` field was tested against the filesystem; every `lines:` range against line count. **All 437 prototype-index entries resolve to existing files with valid line ranges.** No broken paths anywhere in the index — that part of the labeling system is healthy.

Coverage method: for each label, search every task JSON in the corresponding module folder for the label string, the file path, or the file basename.

| Module | Total labels | Uncovered | Uncovered labels (where) |
|---|---|---|---|
| 02-settings | 32 | 0 | — |
| 01-npd | 54 | **2** | `create_project_wizard` (`npd/project.jsx:107-263`); `brief_screen` (`npd/project.jsx:45-104`) |
| 03-technical | 63 | 0 | (tasks/ read-only — coverage validates) |
| 04-planning-basic | 40 | 0 | — |
| 05-warehouse | 35 | **3** | `app_sidebar`, `app_topbar`, `warehouse_sub_nav` (all `warehouse/shell.jsx`) — tasks/ read-only |
| 06-scanner-p1 | 55 | 0 | (tasks/ read-only) |
| 08-production | 35 | 0 | (tasks/ read-only) |
| 09-quality | 32 | **6** | `ncr_list`, `ncr_detail` (`quality/ncr-screens.jsx`); `haccp_plans`, `ccp_monitoring`, `ccp_deviations`, `allergen_gates` (`quality/haccp-screens.jsx`) |

### 2.2 Tasks pointing to broken prototype paths

None found. Spot-check of T-025 → `prototypes/design/Monopilot Design System/settings/access-screens.jsx:131-154` resolves (file is 247 lines). The labeling-fix audit (2026-04-30) appears to have hardened paths effectively.

### 2.3 Legacy-only prototype files (not in design system)

These files exist only under `prototypes/<module>/` and have no equivalent in `prototypes/design/Monopilot Design System/<module>/`:
- `prototypes/npd/config-data.jsx`
- `prototypes/npd/config-runtime.jsx`
- `prototypes/npd/config-screens.jsx`
- `prototypes/settings/import-export.jsx`

Decision needed: either archive them, or promote them into the design system and label them (currently no task and no prototype-index entry references them).

---

## 3. Translation-notes vs. task implementation contracts

Sampling: read `_meta/prototype-labels/translation-notes-quality.md` in full, `translation-notes-settings.md` in full, and spot-checked NPD/warehouse/technical.

Translation rules that are NOT encoded as `risk_red_lines` or implementation-contract items in any atomic task (in modules where the agent is allowed to act — 01/02/04/09):

### 09-quality (translation-notes-quality.md)
- "Build a single shared `<ESignBlock>` server component" — not red-lined in any of the 36 quality tasks; the responsibility is fragmented across modal tasks.
- "PIN verification MUST call Server Action with PBKDF2 comparison" — only 2 of 36 quality tasks include this assertion.
- "Dual-Sign Pattern — second signer must log in with their own credentials on the same screen or a separate session" — not encoded as a server-side AC anywhere.
- "BL-QA-06: build a virtual numeric keypad component to defeat keyloggers" — present in translation notes, absent from any task scope_files / acceptance_criteria.
- "Immutability: after any signing event, all editable fields must switch to read-only via Server Component" — declared in translation notes, not encoded as an AC.

### 02-settings (translation-notes-settings.md)
- "L1 flag edits must redirect to PromoteToL2Modal — not allow direct save" — encoded in T-048 (flag_edit_modal) but the "redirect, never direct save" red-line is described in translation-notes more strictly than the task AC.
- "BL-PROD-05: `.btn-danger` missing — add `Button variant="destructive"` to shared CSS" — global UI debt note, not assigned to any task.
- "Inline custom modals (Devices pair, Users invite) must be extracted to shared Dialog" — translation note, no task currently owns the extraction.
- "useFormStatus / useActionState (React 19) or react-hook-form" — translation note, but `packages/ui` is still React 18 (FT-033 blocker).

### 01-npd (translation-notes-npd.md, sampled)
- The `create_project_wizard` and `brief_screen` translation-note guidance is orphan — no task references either label.

### 04-planning-basic, 05/06/07/08 (read-only)
Coverage looks complete via task labels; the architectural translation rules (URL-as-state, server-side SoD, immutability after signing) are translation-notes-level commitments that should be lifted into a foundation `_foundation/patterns/UI-TRANSLATION-RULES.md` and red-lined globally.

---

## 4. Cross-cutting concern gaps

### 4.1 Auth & session
- Server Action auth context propagation: **MISSING** (FT-001 withOrgContext HOF).
- Impersonation guard: in place in audit log trigger (`packages/db/migrations/004-audit.sql`) but no UI/Service for "act as user" flows.
- JWT/cookie config: Supabase deploy-config not documented (FT-005 Supabase deploy runbook).
- Session lifetime: idle 60min wired in T-011; absolute 8h promised by FT-010 — not closed.
- SLO clearing: FT-034 — not closed.

### 4.2 Tenant context middleware
- **Naming inconsistency confirmed.** Foundation uses `app.current_org_id()` function; 7 module tasks still spec `current_setting('app.tenant_id')` (NPD T-001), and 13 use `current_setting('app.current_org_id')` (a GUC pattern, not the function). The runtime is the function returning from `app.active_org_contexts`; the GUC reads would resolve to NULL and silently fail.
- No HOF/middleware closes the wiring (FT-001).

### 4.3 Outbox / event bus
- Schema: present (T-008, migration 003).
- Worker: stub exists in `packages/outbox/src/worker.ts`.
- Production caller: **MISSING** — no cron, no API route, no separate process.
- Retry/DLQ: outbox has retry semantics in code; no DLQ inspection UI; no operator tooling.
- Idempotency keys: T-024 wired in `packages/server/src/idempotent.ts` but with `new pg.Pool` raw-bypass (P1 in consistency audit).

### 4.4 Cron scheduler
- Vercel-format `scripts/cron.json` only. Non-Vercel deploys have no schema drift, no D365 sync, no GDPR job, no audit retention job (FT-045 documents this for x-vercel-cron auth).

### 4.5 Audit log shared library
- Schema: 13-field R13 columns (T-009).
- Library: read-side helpers exist; write-side spread across modules.
- Actor capture: nullable-org problem (FT-027 — open).
- DB CHECK for `dept_column_denied` security retention: FT-023 — open.

### 4.6 i18n
- next-intl bootstrap: T-022 PASS.
- Per-module namespaces: 02-settings has T-116 (`02-settings.json`); other modules silent.
- Locale negotiation/RTL: not in any task.

### 4.7 Accessibility / a11y test harness
- `jest-axe` fallback in packages/ui RTL (T-025 deviation).
- Real `@axe-core/playwright` CI step: not running (no Storybook deploy).

### 4.8 Playwright harness + artifacts dir
- `playwright.config.ts` is a 12-line stub. `apps/web/e2e/` does not exist (FT-039).
- UI-PROTOTYPE-PARITY-POLICY requires Playwright traces in closeout — no module can satisfy this today.

### 4.9 Storage / secret management
- `.env.example` documents only `DATABASE_URL`. 5 secrets undocumented: `MFA_MASTER_KEY`, `CRON_SECRET`, `RBAC_APPROVAL_HMAC_KEY`, `POSTHOG_KEY`/`POSTHOG_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Only `RBAC_APPROVAL_HMAC_KEY` has a fail-closed prod guard.
- No vault key rotation policy. No signed-URL contract for file uploads.

### 4.10 Observability
- No logger/metrics/tracing package. No Sentry. No dashboards.

### 4.11 CI/CD
- No `.github/workflows/` is in any task scope. No preview-env policy. `pnpm lint` currently fails from root (production-readiness audit §G).

### 4.12 Backups, DR, RPO/RTO
- Zero hits across 637 task JSONs.

### 4.13 Rate limiting
- Two module-local hits; no foundation primitive.

### 4.14 Feature flags
- PostHog wired in T-033 with `POSTHOG_KEY` env-name drift (FT-015 — open). 89 tasks reference flags concept; runtime fallback is `phc_placeholder` (T-033 deviation).

---

## 5. Data model coherence

### 5.1 Shared-table inventory (sampled across modules; non-exhaustive)

| Table (as referenced) | Foundation owns? | Module-task creators | Concern |
|---|---|---|---|
| `lot` (R13 placeholder, foundation T-040) | YES | Module tasks reference `lots` (plural) | Naming drift singular→plural. |
| `work_order` (foundation T-040) vs. `work_orders` (modules) | YES singular | 25 hits in modules for plural | Naming drift. |
| `quality_event` (T-040) vs. quality module tasks | YES | 09-quality module owns extension | Acceptable; flag if plural drift. |
| `shipment` (T-040) vs. `shipments` | YES | 11-shipping references plural | Naming drift. |
| `bom_item` (T-040) vs. `bom_headers`/`bom_lines` | YES placeholder | 03-Technical creates `bom_headers` + `bom_lines` + `bom_co_products` + `bom_snapshots` (T-002) | **Two competing BOM models.** Foundation placeholder `bom_item` is single-table; Technical T-002 is a 4-table aggregate. Reconcile or formally retire the placeholder. |
| `items` (universal item master, 03-Technical T-001 per PRD §5.1) | NO | 03-Technical owns | OK in isolation. |
| `product` (01-NPD T-001 per ADR-034 rename of `fa`) | NO | 01-NPD owns | OK in isolation, but the relationship to `items` is not stated anywhere. NPD `product` is the FG-only aggregate; Technical `items` is the universal RM/intermediate/FG master. The mapping needs an explicit contract (likely a `factory_spec`-mediated link). |
| `license_plates` | NO | 05-Warehouse (24 hits) | Per ADR-001/ADR-006 (archived). No foundation task. |
| `factory_spec` | Glossary lock T-048 + contract T-049 | Owned by Technical (downstream); no foundation creator task | Acceptable per contract but the read-model in 04-planning-basic (T-001) assumes it exists at runtime. |

### 5.2 Tenant scoping column inconsistency

| Pattern | Tasks using it |
|---|---|
| `org_id` + `app.current_org_id()` function | Foundation 002-rls-baseline + module Wave0-amended tasks |
| `org_id` + `current_setting('app.current_org_id')` GUC | 13 module tasks |
| `tenant_id` + `current_setting('app.tenant_id')` GUC | 7 module tasks incl. 01-npd/T-001 (FG primary table!) |

The Wave0 v4.3 lock declared `org_id` as the business-scope column; 7 tasks still defy this. Specifically NPD T-001 is the primary FG table and uses `tenant_id` end-to-end (`scope_files`, `details`, `acceptance_criteria`).

### 5.3 Indexes referenced in PRDs vs. tasks

Spot-check: 03-TECHNICAL-PRD.md §5.1 declares `idx_items_org_type`, `idx_items_d365` (partial), `idx_items_ext_jsonb` (GIN). T-001 AC2 asserts they exist — covered. Not exhaustively sweep-tested.

### 5.4 FK gaps

- `tenant_migrations` has no FK to `organizations` (Foundation consistency audit P1; FT-048 open).
- `factory_spec_id` references on `shared_bom_revision` are not yet enforced anywhere because `factory_spec` table is owned by Technical and may not exist by the time NPD writes its first revision.

---

## 6. Apps / packages reality check

### 6.1 Existing packages (12)

`packages/auth`, `db`, `gs1`, `ops`, `outbox`, `rbac`, `rule-engine`, `schema-driven`, `schema-runtime`, `server`, `sync-queue`, `ui`.

### 6.2 Packages referenced by tasks but not present (13)

`packages/api-services`, `packages/barcode-parser` (tasks expect this; `packages/gs1` exists and may be the intended renaming target), `packages/cascade-engine`, `packages/contracts`, `packages/domain`, `packages/dsl-rules` (rule-engine exists; possible split intent), `packages/email`, `packages/idempotency` (logic lives in `packages/server`), `packages/labels`, `packages/queries`, `packages/scanner-utils`, `packages/storage`, `packages/validation`.

Action: each of these needs either a Foundation scaffolding task or a rename/redirect contract (e.g. `barcode-parser` → `gs1`).

### 6.3 Packages present but no task references them

`packages/gs1` — exists from T-023 but module tasks reference `barcode-parser`. Rename or update tasks.

### 6.4 `lib/` discrepancy

Root `lib/` contains only `reference/`. Task `scope_files` reference many `lib/<domain>/…` paths (auth, cascade, cron, db, feature-flags, integrations, outbox, planning, production, reference, scanner, scheduler, schema, scim, services, settings, shared, technical, tenant, utils). Most of those live under `apps/web/lib/` (auth, feature-flags, i18n, scim) — the dual `lib/` vs `apps/web/lib/` paths produce ambiguous scope. Foundation lacks a "lib boundary" contract.

### 6.5 `apps/`

Only `apps/web`. Tasks consistently target it. No `apps/worker`, `apps/api`, `apps/mobile`. The outbox worker (T-008) and any future scanner native client will need a new `apps/*` target or a `packages/worker` runtime.

---

## 7. Recommended next steps (advisory; **no JSON written**)

1. Atomize FT-001..FT-050 into the `00-foundation/tasks/` namespace immediately, starting with the 5 P0 items.
2. Create a Wave-B platform-primitives manifest covering the 13 missing packages, the cron abstraction, observability, GDPR, and backup runbook (see §1.4).
3. Promote translation-notes architectural rules (e-sign, dual-sign, immutability-after-signing, URL-as-state) into `_foundation/patterns/UI-TRANSLATION-RULES.md` and add a foundation task that lints every UI task's risk_red_lines against the pattern set.
4. Pass through the 20 tasks that still use `tenant_id` / GUC patterns and migrate them to `org_id` + `app.current_org_id()` function. Where the tasks are under the parallel-work modules (03/05/06/07/08), file follow-up tickets only — do not edit during the parallel upgrade.
5. Reconcile NPD `product` vs. Technical `items` with an explicit contract (or sequence diagram) in `_foundation/contracts/`.
6. Decide on legacy-only prototype files (`npd/config-*.jsx`, `settings/import-export.jsx`): archive or promote.
