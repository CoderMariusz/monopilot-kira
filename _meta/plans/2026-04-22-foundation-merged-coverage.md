---
title: Phase E-0 Foundation — Merged Coverage Audit
version: 1.0
date: 2026-04-22
status: audit of merged plan vs 00-FOUNDATION-PRD + existing 47 tasks + 6 user decisions
source: _meta/plans/2026-04-22-foundation-merged-plan.md (95 tasks)
---

# Merged Coverage Audit

Every row has a status: PLANNED (covered by a task), DEFERRED (out of scope with explicit pointer), or SPLIT (covered by multiple atomic tasks). Zero GAP rows.

## A. 00-FOUNDATION-PRD.md sections → merged coverage

### A.1 PRD §2 Markers

| PRD item | Status | Coverage |
|---|---|---|
| [UNIVERSAL]/[FORZA-CONFIG]/[EVOLVING]/[LEGACY-D365] marker doctrine | PLANNED | T-GOV-005 (reference doc) + T-GOV-006 (lint check) |

### A.2 PRD §3 Personas & §4 Module map

| PRD item | Status | Coverage |
|---|---|---|
| Writing phases, build order, 15-module table, INTEGRATIONS stages | PLANNED | T-GOV-007 (PERSONAS.md + MODULE-MAP.md) |

### A.3 PRD §5 Tech stack (D1-D12)

| PRD item | Status | Coverage |
|---|---|---|
| D1 pnpm + Turborepo | PLANNED | T-00a-001 |
| D2 Next.js App Router + RSC + TS strict | PLANNED | T-00a-002 |
| D3 Supabase (local + Cloud dev) | PLANNED | T-00b-001; cloud migration plan DEFERRED post-E-0 |
| D4 Tailwind + shadcn/ui | PLANNED | T-00a-003 |
| D5 RHF + Zod | PLANNED | T-00h-002 (runtime compile) + T-00c-004 (login form) |
| D6 Drizzle | PLANNED | T-00b-002 |
| D7 PostHog flags | PLANNED | T-00i-007 (client singleton); ops infra DEFERRED |
| D8 Vercel preview deploys | PLANNED | T-00i-008 |
| D9 pg-boss outbox worker | PLANNED | T-00f-003 |
| D10 Sentry | PLANNED | T-00i-006 |
| D11 testing stack (Vitest + Playwright + axe) | SPLIT | T-00i-001 + T-00i-005 + T-00i-009 |
| D12 CI matrix + release gates | PLANNED | T-00i-002 + T-00i-008 + T-00f-005 + T-00i-010 |

### A.4 PRD §6 Schema-driven engine (ADR-028)

| PRD item | Status | Coverage |
|---|---|---|
| Reference.DeptColumns/FieldTypes/Formulas | PLANNED | T-00h-001 |
| schema_migrations ledger | PLANNED | T-00h-001 (includes table) + T-00b-005 (drift detector) |
| Zod runtime loader + cache | PLANNED | T-00h-002 |
| schema_version bump + add-column helper | PLANNED | T-00h-004 |
| ext_jsonb R/W + expression indexes | PLANNED | T-00h-003 |
| Wizard UI | DEFERRED | Pointer in §10 alt out-of-scope → E-2 (02-SET-b) |

### A.5 PRD §7 Rule engine (ADR-029)

| PRD item | Status | Coverage |
|---|---|---|
| reference.rules table + 4-type enum | PLANNED | T-00g-001 |
| Cascading interpreter | PLANNED | T-00g-002 |
| Conditional-required interpreter | PLANNED | T-00g-003 |
| Gate interpreter | PLANNED | T-00g-004 |
| Workflow-as-data interpreter | DEFERRED | Alt defers workflow-as-data post-E-0 (listed in alt §10) |
| Rule registry loader + LRU | PLANNED | T-00g-005 |
| Dry-run harness API | PLANNED | T-00g-006 |
| Canonical rule seeds (fefo/catch-weight/allergen) | PLANNED | T-00g-007 |
| Admin wizard UI | DEFERRED | E-2 per ADR-032 |

### A.6 PRD §8 Multi-tenant baseline

| PRD item | Status | Coverage |
|---|---|---|
| Core tenants/users/roles tables | PLANNED | T-00b-000 (baseline migration) |
| Tenant resolver middleware | PLANNED | T-00c-003 |
| RLS policies + LEAKPROOF wrappers | SPLIT | T-00d-001 + T-00d-002 + T-00d-003 |
| app-role connection split | PLANNED | T-00b-A01 (gap-fill per Decision) |
| Impersonation + MFA + SIEM | SPLIT | T-00d-005 (flag plumbing only); MFA enrollment + SIEM DEFERRED to E-2+ |
| Canary rollout + tenant_migrations | DEFERRED | Alt §10 — needed at 2nd tenant (post-E-2); not in merged backlog |
| Dept taxonomy (Forza 7) | PLANNED | ADR-030 via T-GOV-003; runtime via T-00h-001; seed DEFERRED to E-1 per ADR-032 |

### A.7 PRD §9 Auth

| PRD item | Status | Coverage |
|---|---|---|
| Supabase Auth GoTrue + users FK | PLANNED | T-00c-001 |
| Signup/login Server Actions | PLANNED | T-00c-002 |
| Logout | PLANNED | T-00c-005 |
| Login UI | PLANNED | T-00c-004 |
| Full auth E2E | PLANNED | T-00c-006 |

### A.8 PRD §10 Outbox pattern

| PRD item | Status | Coverage |
|---|---|---|
| outbox_events table | PLANNED | T-00f-001 |
| DLQ table | PLANNED | T-00f-001 |
| insertOutboxEvent helper + UUID v7 | PLANNED | T-00f-002 |
| pg-boss worker | PLANNED | T-00f-003 |
| Retry policy config | PLANNED | T-00f-004 |
| Healthcheck + release gate | PLANNED | T-00f-005 |
| Pipeline integration test | PLANNED | T-00f-006 |

### A.9 PRD §11 Compliance / build posture

| PRD item | Status | Coverage |
|---|---|---|
| audit_log partitioned append-only | PLANNED | T-00e-001 |
| Generic audit trigger | PLANNED | T-00e-002 |
| audit.recorded outbox emission | PLANNED | T-00e-003 |
| Audit query API | PLANNED | T-00e-004 |
| Retention + partition maintenance | PLANNED | T-00e-005 |
| Build posture + DR doc | PLANNED | T-GOV-010 |
| Regulatory roadmap (FSMA/EUDR/Peppol/ViDA/BRCGS/FIC/KSeF) | PLANNED | T-GOV-008 |
| Out-of-scope policy | PLANNED | T-GOV-009 |
| 40k PR cap | PLANNED | T-00a-006b (gap-fill per Decision #5) |
| i18n ICU pl/en/uk/ro | DEFERRED | Pointer T-OOS-001 → E-1 per ADR-032 |

### A.10 PRD §12 Candidate ADRs (R1-R15)

| PRD item | Status | Coverage |
|---|---|---|
| R1-R15 ADR stubs | SPLIT | 15 atomic tasks T-ADR-R01 … T-ADR-R15 (per Decision #6) |

### A.11 PRD §13 Acceptance / architektoniczne

| PRD item | Status | Coverage |
|---|---|---|
| Marker discipline 100% | PLANNED | T-GOV-005 + T-GOV-006 |
| 6-principles alignment + reality-source cross-refs | PLANNED | T-00i-011 (dogfood acceptance) |
| Phase B.1 close acceptance harness | PLANNED | T-00i-011 (merged from existing T-47) |

### A.12 PRD §14 Open items

| PRD item | Status | Coverage |
|---|---|---|
| 16 open items register (phase D carry-forward + research + new) | PLANNED | T-GOV-012 |
| Pre-Phase-D ADR review | PLANNED | T-GOV-011 |
| ADR-028/029/030/031 authored | PLANNED | T-GOV-001..T-GOV-004 |

---

## B. Existing 47 tasks → merged disposition

| Existing | Status | Coverage in merged |
|---|---|---|
| T-1 ADR-028 | PLANNED | T-GOV-001 |
| T-2 ADR-029 | PLANNED | T-GOV-002 |
| T-3 ADR-030 | PLANNED | T-GOV-003 |
| T-4 ADR-031 | PLANNED | T-GOV-004 |
| T-5 Marker discipline doc | PLANNED | T-GOV-005 |
| T-6 Marker lint | PLANNED | T-GOV-006 |
| T-7 Personas + module map | PLANNED | T-GOV-007 |
| T-8 Next.js scaffold | PLANNED | T-00a-002 |
| T-9 Tailwind + per-tenant theming | SPLIT / partial DEFER | Tailwind init → T-00a-003; per-tenant theming hook DEFERRED to E-1 (pointer in T-OOS-001 per Decision #4) |
| T-10 RHF + Zod | PLANNED | T-00h-002 (compiler) — RHF usage in T-00c-004 |
| T-11 PWA + IndexedDB | SPLIT | T-00a-008 + T-00a-009 (per Decision #3) |
| T-12 app-role connection split | PLANNED | T-00b-A01 (gap-fill) |
| T-13 Vitest + Playwright harness | SPLIT | T-00i-001 + T-00i-005 + T-00i-003 |
| T-14 Pre-commit + 18k cap | PORT w/ change | T-00a-006 + T-00a-006b (cap = 40000 per Decision #5) |
| T-15 GitHub Actions CI | PLANNED | T-00i-002 |
| T-16 Secrets management | PLANNED | T-00a-007 (env loader) |
| T-17 Sentry + OpenTelemetry | SPLIT / partial DEFER | Sentry → T-00i-006; OTel DEFERRED (pointer T-OOS-001) |
| T-18 PostHog flag client | PLANNED | T-00i-007 |
| T-19 i18n scaffold pl/en/uk/ro | DEFERRED | Pointer T-OOS-001 → E-1 per ADR-032 |
| T-20 tenants table | PLANNED | Rolled into T-00b-000 baseline |
| T-21 Main Table 69 cols | PLANNED | T-00b-M01 (gap-fill, per Decision #1) |
| T-22 Reference metadata tables | PLANNED | T-00h-001 (DeptColumns); FieldTypes + Formulas folded into ADR-028 (T-GOV-001), runtime tables in E-0 via DeptColumns |
| T-23 Zod + LRU | SPLIT | T-00h-002 (schema cache) + T-00g-005 (rule cache) |
| T-24 Schema migration ledger + drift | SPLIT | T-00h-001 (migration ledger) + T-00b-005 (drift detector) |
| T-25 Reference.Rules table | PLANNED | T-00g-001 |
| T-26 Rule engine evaluator | SPLIT | T-00g-002/003/004 + T-00g-005 loader |
| T-27 Tenant resolver middleware | PLANNED | T-00c-003 |
| T-28 RLS + LEAKPROOF wrappers | SPLIT | T-00d-001 + T-00d-002 + T-00d-003 |
| T-29 Impersonation + MFA + SIEM | SPLIT / partial DEFER | Flag plumbing → T-00d-005; MFA/SIEM DEFERRED to E-2+ |
| T-30 Outbox worker + drift cron | SPLIT | T-00f-003 worker + T-00b-005 drift + T-00e-005 retention cron |
| T-31 outbox_events + trace cols | SPLIT | T-00f-001 outbox + T-00b-000 R13 cols + T-00b-E02 events enum |
| T-32 Admin UI schema wizard | DEFERRED | E-2 (02-SET-b) per ADR-032 |
| T-33 Admin UI rule wizard | DEFERRED | E-2 (02-SET-c) |
| T-34 Dept taxonomy seed | SPLIT / partial DEFER | Runtime resolution via T-00h-001; Forza seed DEFERRED to E-1 |
| T-35 audit_events + triggers | SPLIT | T-00e-001 + T-00e-002 |
| T-36 tenant_migrations + canary | DEFERRED | Needed at 2nd tenant; alt §10 defers; noted in coverage A.6 |
| T-37 D365 adapter stub | DEFERRED | Pointer T-OOS-001 → E-2 per module (per Decision #2) |
| T-38 Peppol AP adapter stub | DEFERRED | Pointer T-OOS-001 → E-2 (Decision #2) |
| T-39 GS1-128 parser | DEFERRED | Pointer T-OOS-001 → E-2 (Decision #2) |
| T-40 Regulatory roadmap | PLANNED | T-GOV-008 |
| T-41 Out-of-scope policy doc | PLANNED | T-GOV-009 |
| T-42 Build posture + DR | PLANNED | T-GOV-010 |
| T-43 Candidate ADR stubs R1-R15 | SPLIT | 15 tasks T-ADR-R01..R15 (per Decision #6) |
| T-44 Pre-Phase-D ADR review | PLANNED | T-GOV-011 |
| T-45 Open items register | PLANNED | T-GOV-012 |
| T-46 RLS cross-tenant leak test | PLANNED | T-00d-004 |
| T-47 Phase B.1 acceptance harness | PLANNED | T-00i-011 (merged as E-0 DoD) |

---

## C. 6 user decisions → merged coverage

| Decision | Status | Coverage |
|---|---|---|
| #1 Main Table 69 cols KEEP in E-0 | PLANNED | T-00b-M01 (gap-fill, §12) |
| #2 D365/Peppol/GS1 DEFER to E-2 | DEFERRED | T-OOS-001 single pointer (§13) |
| #3 PWA + IndexedDB KEEP in E-0 | PLANNED | T-00a-008 (PWA) + T-00a-009 (IndexedDB queue) (§12) |
| #4 Per-tenant theming DEFER to E-1 | DEFERRED | T-OOS-001 pointer (§13); no atomic task emitted |
| #5 Pre-commit token-cap gate 40000 | PLANNED | T-00a-006b (§12, extends T-00a-006) |
| #6 T-43 ADR stubs SPLIT NOW | PLANNED | 15 tasks T-ADR-R01..R15 (§11) |

---

## D. Summary

- 95 total tasks (4 architect locks + 7 00-a + 6 00-b + 6 00-c + 5 00-d + 5 00-e + 6 00-f + 7 00-g + 5 00-h + 10 00-i + 12 governance + 15 T-43 splits + 6 gap-fills + 1 OOS pointer)
- 0 GAP rows across PRD sections A.1-A.12
- 0 GAP rows across existing 47 tasks (every one is PLANNED, DEFERRED with pointer, or SPLIT)
- 6/6 user decisions applied
- 13 items DEFERRED to later phases with explicit phase-owner + pointer, all consolidated in T-OOS-001 or the alt §10 narrative referenced from the merged plan preamble

Audit passes: zero uncovered items, zero GAP rows.
