---
title: E-0 Validation Report — 2026-04-22-foundation-merged-plan.md
date: 2026-04-23
validator: Claude Sonnet 4.6 (subagent)
prd_source: /Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md
plan_source: /Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md
---

## Validation report — 2026-04-22-foundation-merged-plan.md

**Tasks analyzed:** 95 (67 code tasks, 28 docs tasks)
**PASS:** 19 | **HARD FAIL:** 76 (77 issues across 76 tasks) | **SOFT WARN:** 7 (across 6 tasks)

> Note: The 76 tasks with HARD FAILs break down into two systemic issues (see below) that affect groups of tasks. There are NO scattered individual structural failures. The core content (GIVEN/WHEN/THEN, Implementation steps, Files, Rollback) is complete on all code tasks that have been flagged.

---

### HARD FAILURES (must fix before execution)

#### Category 1 — ID format regex violations (29 tasks)

The spec requires: `^T-[a-z0-9]+-(\d{3}[a-z]?|E\d{2}|M\d{2})$`

All 29 failing tasks use non-numeric suffixes (GOV, ADR, OOS, A01) that are not covered by the defined regex alternatives.

| Task ID | Field | Issue |
|---|---|---|
| T-GOV-001 through T-GOV-012 (12 tasks) | ID format | Suffix `GOV-NNN` does not match `\d{3}[a-z]?`, `E\d{2}`, or `M\d{2}` |
| T-ADR-R01 through T-ADR-R15 (15 tasks) | ID format | Suffix `R\d{2}` not in allowed set (spec has `E\d{2}` and `M\d{2}`, not `R\d{2}`) |
| T-00b-A01 | ID format | Suffix `A01` — `A` not in `[a-z0-9]` (uppercase) and `\d{3}[a-z]?` requires leading digit |
| T-OOS-001 | ID format | Module segment `OOS` contains uppercase letters; suffix `001` OK but module fails `[a-z0-9]+` |

**Root cause:** The plan uses descriptive namespace prefixes (GOV, ADR, OOS) for docs/governance tasks and an uppercase A01 for a gap-fill. The regex was defined for code tasks only. Docs and governance tasks were added after the regex was written without extending the allowed pattern.

**Fix options (pick one):**
1. Extend regex to allow uppercase-letter suffixes: `^T-[a-zA-Z0-9]+-(\d{3}[a-z]?|[A-Z]{1,3}\d{2,3}|E\d{2}|M\d{2}|R\d{2})$`
2. Rename all GOV/ADR/OOS tasks to numeric format: `T-gov-001..012`, `T-adr-r01..r15`, `T-oos-001`
3. Declare docs/governance tasks exempt from the code-task ID regex (add a separate `^T-(gov|adr|oos)-\d{3}$` pattern)

#### Category 2 — Missing explicit CI gate label (45 code tasks)

The spec requires: "CI gate — wymieniony w Test gate (np. `pnpm test:smoke green`)". This means an explicit `**CI gate:** pnpm test:X green` line must appear in the Test gate section.

These 45 tasks list unit/integration/E2E test commands but lack the `**CI gate:**` label linking to a named `pnpm test:*` pipeline command:

| Task ID | Field | Issue |
|---|---|---|
| T-00a-007 | CI gate | Test gate has `vitest` call but no `**CI gate:** pnpm test:unit green` |
| T-00b-002 | CI gate | Missing `**CI gate:**` label |
| T-00b-004 | CI gate | Missing `**CI gate:**` label |
| T-00b-005 | CI gate | Missing `**CI gate:**` label |
| T-00b-006 | CI gate | Missing `**CI gate:**` label |
| T-00c-001 | CI gate | Missing `**CI gate:**` label |
| T-00c-002 | CI gate | Missing `**CI gate:**` label |
| T-00c-003 | CI gate | Missing `**CI gate:**` label |
| T-00c-004 | CI gate | Missing `**CI gate:**` label |
| T-00c-005 | CI gate | Missing `**CI gate:**` label |
| T-00c-006 | CI gate | Has `playwright e2e/auth.spec.ts green` but no `**CI gate:**` prefix |
| T-00d-001 | CI gate | Missing `**CI gate:**` label |
| T-00d-002 | CI gate | Missing `**CI gate:**` label |
| T-00d-003 | CI gate | Missing `**CI gate:**` label |
| T-00d-005 | CI gate | Missing `**CI gate:**` label |
| T-00e-001 | CI gate | Missing `**CI gate:**` label |
| T-00e-002 | CI gate | Missing `**CI gate:**` label |
| T-00e-003 | CI gate | Missing `**CI gate:**` label |
| T-00e-004 | CI gate | Missing `**CI gate:**` label |
| T-00e-005 | CI gate | Missing `**CI gate:**` label |
| T-00f-001 | CI gate | Missing `**CI gate:**` label |
| T-00f-002 | CI gate | Missing `**CI gate:**` label |
| T-00f-003 | CI gate | Missing `**CI gate:**` label |
| T-00f-004 | CI gate | Missing `**CI gate:**` label |
| T-00f-005 | CI gate | Missing `**CI gate:**` label |
| T-00f-006 | CI gate | Has `Integration: green` but no `**CI gate:**` pnpm command |
| T-00g-001 | CI gate | Missing `**CI gate:**` label |
| T-00g-002 | CI gate | Missing `**CI gate:**` label |
| T-00g-003 | CI gate | Missing `**CI gate:**` label |
| T-00g-004 | CI gate | Missing `**CI gate:**` label |
| T-00g-005 | CI gate | Missing `**CI gate:**` label |
| T-00g-006 | CI gate | Missing `**CI gate:**` label |
| T-00g-007 | CI gate | Missing `**CI gate:**` label |
| T-00h-001 | CI gate | Missing `**CI gate:**` label |
| T-00h-002 | CI gate | Missing `**CI gate:**` label |
| T-00h-003 | CI gate | Missing `**CI gate:**` label |
| T-00h-004 | CI gate | Missing `**CI gate:**` label |
| T-00h-005 | CI gate | Has `Integration: green` but no `**CI gate:**` pnpm command |
| T-00i-003 | CI gate | Missing `**CI gate:**` label |
| T-00i-004 | CI gate | Missing `**CI gate:**` label |
| T-00i-005 | CI gate | Has `E2E: smoke passes` but no `**CI gate:** pnpm test:e2e green` |
| T-00i-007 | CI gate | Missing `**CI gate:**` label |
| T-00i-009 | CI gate | Has `E2E: no critical violations` but no `**CI gate:**` label |
| T-00i-010 | CI gate | Missing `**CI gate:**` label |
| T-00a-009 | CI gate | Has unit+E2E listed but no `**CI gate:**` label |

**Fix:** Add `- **CI gate:** pnpm test:unit green` (or `:integration` / `:e2e` as appropriate) to the Test gate section of each affected task. This is a mechanical addition — the test commands are already specified. Approximately 5 minutes per task, ~4h total across 45 tasks, or can be done via script.

#### Category 3 — T3-ui missing Prototype ref (3 tasks)

The spec requires T3-ui tasks to have a `Prototype ref` field (either a label or "none — no prototype exists").

| Task ID | Field | Issue |
|---|---|---|
| T-00a-003 | T3 Prototype ref | MISSING — Tailwind/shadcn init task, no prototype ref field present |
| T-00c-004 | T3 Prototype ref | MISSING — Login page UI task, no prototype ref field present |
| T-00a-008 | T3 Prototype ref | MISSING — PWA scaffold task, no prototype ref field present |

**Fix:** Add `**Prototype ref:** none — no prototype exists` (or link to SCANNER-PROTOTYPE.html / MONOPILOT-SITEMAP.html if applicable) to each T3-ui task's header metadata. Note: T-00c-004 (Login page) and T-00a-003 (shadcn init) likely warrant `none — no prototype exists`. T-00a-008 (PWA manifest) is borderline T3 but similarly has no prototype.

> Additional T3-specific observations (SOFT level):
> - T-00a-003: No RHF+Zod mention (appropriate for a shadcn init task, not a form task)
> - T-00a-008: No shadcn/Radix mention (appropriate for a manifest/SW task)

---

### SOFT WARNINGS (should fix, won't block)

| Task ID | Field | Issue |
|---|---|---|
| T-00a-001 | Type | Non-standard label: `T1-schema (scaffold infra)` — extra annotation after type; should be exactly `T1-schema` |
| T-00a-002 | Type | Non-standard label: `T3-ui (app shell)` — extra annotation; should be exactly `T3-ui` |
| T-00a-003 | T3 RHF+Zod | shadcn init task; no form present so RHF omission is expected — acceptable |
| T-00a-008 | T3 shadcn/Radix | PWA manifest task; no UI components; acceptable |
| T-00a-008 | T3 RHF+Zod | PWA manifest task; no form; acceptable |
| T-00b-A01 | Type | `T1-schema + T2-wiring` — non-standard compound type; functionally clear but not in the enum |
| T-00a-006b | Type | `T2-api (hook extension)` — non-standard; could be `T4-wiring+test` or `T2-api` |

---

### Passed tasks (19)

These tasks have NO hard issues. All core fields present, CI gate explicit, no T3 violations:

T-00b-000 ✅ | T-00b-E01 ✅ | T-00b-E02 ✅ | T-00b-E03 ✅ | T-00a-001 ✅ | T-00a-002 ✅ | T-00a-004 ✅ | T-00a-005 ✅ | T-00a-006 ✅ | T-00b-001 ✅ | T-00b-003 ✅ | T-00d-004 ✅ | T-00i-001 ✅ | T-00i-002 ✅ | T-00i-006 ✅ | T-00i-008 ✅ | T-00b-M01 ✅ | T-00a-006b ✅ | T-00i-011 ✅

---

## PRD coverage

Based on reading `00-FOUNDATION-PRD.md` sections against the 95-task plan:

✅ **§1 — Six Architectural Principles** → Covered through cross-cutting enforcement: P1 (schema-driven) → T-00h-*, P2 (two-systems) → implicit via T-00b-005 drift detection, P3 (schema-driven + rule engine) → T-00g-* + T-00h-*, P4 (reality fidelity) → T-00b-M01 (69 cols), P5 (multi-tenant) → T-00d-*, P6 (marker discipline) → T-GOV-005 + T-GOV-006

✅ **§2 — Marker Discipline** → T-GOV-005 (reference doc) + T-GOV-006 (lint check CI gate) — fully covered

✅ **§3 — Personas** → T-GOV-007 (PERSONAS.md) — covered as doc artifact

✅ **§4 — Module Map** → T-GOV-007 (MODULE-MAP.md) — covered as doc artifact

✅ **§5 — Tech Stack** → All stack components covered:
- Next.js App Router → T-00a-002
- TypeScript strict → T-00a-002 + T-00a-004
- React/RHF/Zod → T-00c-004 (login form)
- Tailwind + shadcn → T-00a-003
- PWA (Workbox) → T-00a-008 + T-00a-009
- Postgres/Supabase → T-00b-001
- Drizzle → T-00b-002
- RLS → T-00d-*
- Zod runtime → T-00h-002
- Outbox pattern → T-00f-*
- PostHog feature flags → T-00i-007
- Sentry → T-00i-006
- Vitest + Playwright → T-00i-001 + T-00i-005

⚠️ **§5 — i18n [R11]** → PARTIAL — `T-OOS-001` explicitly defers i18n scaffold (pl/en/uk/ro) to E-1 per ADR-032. The PRD requires i18n "od dnia 1" but the plan defers it. This is flagged as a known decision (ADR-032 §6.19 carveout) but it means E-0 ships without i18n baseline.

⚠️ **§5 — D365 adapter [R8]** → PARTIAL — `T-OOS-001` defers D365 adapter to E-2. The PRD describes it as integration stack but does include it as Phase C1+. The task for ADR stub R8 (T-ADR-R08) covers documentation only.

✅ **§6 — Schema-driven Foundation [ADR-028]** → Fully covered:
- `Reference.DeptColumns` → T-00h-001
- JSON-Schema → Zod runtime → T-00h-002
- ext_jsonb / private_jsonb → T-00h-003
- schema_version bump + add-column → T-00h-004
- Live metadata → Zod integration test → T-00h-005
- Drift detection → T-00b-005

⚠️ **§6 — Admin UI wizard (blocker for P1)** → NOT COVERED in E-0 — explicitly deferred to E-2 per §8 preamble ("Runtime only. Admin wizard UI → E-2"). This is expected and intentional, but means E-0 does not satisfy the P1 "easy extension" principle operationally. The runtime plumbing is covered; the user-facing wizard is not.

✅ **§7 — Rule Engine DSL [ADR-029]** → Fully covered:
- `reference_rules` catalog → T-00g-001
- Cascading interpreter → T-00g-002
- Conditional-required interpreter → T-00g-003
- Gate interpreter → T-00g-004
- Registry loader + LRU cache → T-00g-005
- Dry-run harness → T-00g-006
- Seed with canonical rules → T-00g-007

⚠️ **§7 — Workflow-as-data (4th rule type)** → PARTIAL — PRD §7 lists 4 rule types: cascading, conditional_required, gate, **workflow**. The migration T-00g-001 includes `workflow` in the `rule_type` CHECK constraint, but there is NO interpreter task for `workflow` type. Only 3 of 4 interpreters are implemented. This is a gap.

✅ **§8 — Multi-tenant Model L1-L4 [ADR-031]** → Covered:
- L1 (typed cols) → T-00b-000 + T-00b-M01
- L2 (org config flags) → T-00h-004 schema_version
- L3 (ext_jsonb) → T-00h-003
- L4 (private_jsonb) → T-00h-001 + T-00h-003
- RLS → T-00d-*
- Impersonation → T-00d-005

⚠️ **§8 — Upgrade orchestration (canary, tenant migrations table)** → NOT COVERED in E-0 — no task creates the `tenant_migrations` table or canary rollout machinery. PRD §8 describes this but it is reasonable to defer to E-1/E-2 infrastructure.

✅ **§9 — Configurable Department Taxonomy [ADR-030]** → Covered via T-00b-E03 (ref-tables enum lock) and T-00b-000 (baseline with modules/organization_modules tables). The 7 Forza dept names are seeded via T-00g-007 (rule seed).

✅ **§10 — Event-first + AI/Trace-ready Schema [R1, R13]** → Fully covered:
- outbox_events table + DLQ → T-00f-001
- insertOutboxEvent helper → T-00f-002
- pg-boss worker → T-00f-003
- Retry policy → T-00f-004
- Healthcheck → T-00f-005
- End-to-end test → T-00f-006
- R13 columns (id UUID, external_id, created_by_user, etc.) → T-00b-000 THEN clause explicitly lists all 8 R13 cols
- UUID v7 → T-00f-002

⚠️ **§10 — GS1-first identifiers [R15]** → NOT COVERED in E-0 — `T-OOS-001` defers GS1-128 parser to E-2. The ADR stub T-ADR-R15 documents the intent. GS1 identifiers (GTIN/SSCC/GLN) would need to land in E-1/E-2 when scanner/shipping modules appear.

✅ **§11 — Cross-cutting: Audit log** → Fully covered: T-00e-001 through T-00e-005

⚠️ **§11 — Cross-cutting: i18n [R11]** → NOT COVERED (deferred to E-1 per ADR-032)

⚠️ **§11 — Regulatory roadmap artifact** → PARTIAL — T-GOV-008 creates the regulatory roadmap doc (FSMA/EUDR/Peppol/ViDA/BRCGS/FIC/KSeF). Doc exists but no runtime compliance tasks in E-0 — correct for a foundation phase.

✅ **§11 — Build posture** → Covered: no-DDL-in-request → T-00b-A01 (app_role split), app-role tests → T-00i-003, drift detection → T-00b-005, 40k PR cap → T-00a-006b, CI matrix → T-00i-002

✅ **§12 — ADRs (Active: 028-031)** → T-GOV-001..T-GOV-004 publish all 4 active ADRs. T-ADR-R01..R15 stub all R-series candidates.

✅ **§13 — Success criteria (architektoniczne)** → All 4 architecture criteria achievable from E-0 tasks:
- 00-FOUNDATION PRD aligned → T-GOV-* docs tasks
- Marker discipline 100% → T-GOV-005 + T-GOV-006
- Cross-refs to reality → implicit in T-00b-M01 (references MAIN-TABLE-SCHEMA.md)
- 01-NPD PRD → out of scope for E-0 (correct)

❌ **§13 — Success criteria (funkcjonalne)** → NOT COVERED in E-0 — schema-driven Admin UI wizard, rule engine wizard UI, multi-tenant L1-L4 full production, D365 adapter, 06-SCANNER-P1 PWA, traceability <30s — all deferred to E-1/E-2/later phases. Expected and correct for Foundation phase.

✅ **§14 — Open Items (carry-forward)** → T-GOV-012 creates the open items register covering all 16 items from PRD §14.

---

## Summary

**FIX REQUIRED — 77 blocking issues across 76 tasks.**

However, the blocking issues are entirely in 3 systemic categories, not 76 individually unique problems:

### Issue 1 (29 tasks) — ID regex coverage gap
The ID regex `^T-[a-z0-9]+-(\d{3}[a-z]?|E\d{2}|M\d{2})$` does not cover docs/governance task naming conventions (GOV, ADR, OOS, R-series). This is a **schema definition bug**, not a task authoring bug. All 29 failing IDs are docs/governance tasks with self-consistent naming. Fix: extend the regex or declare two separate patterns (one for code tasks, one for docs tasks).

### Issue 2 (45 tasks) — CI gate label missing
45 code tasks have test commands specified but lack the `**CI gate:** pnpm test:X green` label. The tests exist; only the label is missing. Fix: mechanical addition of one line per task. Can be done in a single batch edit pass.

### Issue 3 (3 tasks) — T3-ui Prototype ref
3 T3-ui tasks (T-00a-003, T-00c-004, T-00a-008) need `**Prototype ref:** none — no prototype exists` added to their metadata block.

### PRD coverage gaps (known, intentional)
- **i18n scaffold** → deferred to E-1 per ADR-032 decision (SOFT risk: PRD says "od dnia 1")
- **Admin UI wizard** → deferred to E-2 (explicitly noted in plan)
- **Workflow-as-data interpreter** → 4th rule type has schema but no interpreter task (REAL GAP — needs T-00g-008 or explicit deferral note)
- **GS1-first identifiers** → deferred to E-2 (acceptable for Foundation)
- **Canary/upgrade orchestration** → deferred (acceptable for Foundation)
- **D365 adapter** → deferred to E-2 (acceptable for Foundation)

### One genuine content gap discovered
**T-00g — Missing workflow-as-data interpreter:** PRD §7 lists 4 rule types. Tasks T-00g-002/003/004 implement 3 interpreters (cascading, conditional_required, gate). The 4th type (`workflow`) is declared in the schema (T-00g-001 migration CHECK constraint) but has no interpreter task. Recommend adding `T-00g-008 — DSL interpreter: workflow-as-data rule type` or explicitly noting this as deferred with a deferral task, otherwise the runtime is incomplete against PRD §7.
