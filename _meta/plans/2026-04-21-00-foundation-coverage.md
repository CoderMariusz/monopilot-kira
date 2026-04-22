# Coverage Audit — 00-FOUNDATION PRD v3.0

**PRD:** `00-FOUNDATION-PRD.md` (744 lines, Phase B.1)
**Plan:** `_meta/plans/2026-04-21-00-foundation-plan.md`
**Total tasks:** 47 (IDs 1..47 in Taskmaster `master` tag)
**Skill:** `prd-decompose-hybrid`

## Source PRD sections (extracted)

- Exec Summary (positioning, strip-down, two-systems, SaaS model)
- §1 Six Architectural Principles (P1-P6)
- §2 Marker Discipline ([UNIVERSAL], [FORZA-CONFIG], [EVOLVING], [LEGACY-D365])
- §3 Personas (Primary 6, Secondary 5, role naming fix)
- §4 Module Map — §4.1 Writing phases B.1/B.2/C1-C5; §4.2 Build sequence; §4.3 15-module table; INTEGRATIONS distribution; Scanner P1 incremental
- §5 Tech Stack — Runtime/Frontend (Next.js, TS, React 19, RHF+Zod, Tailwind, PWA); Backend (Postgres 16+, JSONB hybrid [R2], RLS [R3], Zod runtime [R4], Outbox [R1]); Cross-cutting infra (PostHog [R6], Sentry/OTel, Event bus, LLM platform, Vitest+Playwright, i18n [R11]); Integration stack (D365 [R8], Peppol, GS1 [R15])
- §6 Schema-driven Foundation [ADR-028] — Koncepcja, Admin UI wizard, Storage tiers L1-L4, Schema versioning, Reject patterns
- §7 Rule Engine DSL [ADR-029] — 4 obszary (cascading/conditional/gate/workflow), Format (JSON+Mermaid+Wizard), Example allergen gate, Open items
- §8 Multi-tenant L1-L4 [ADR-031] — 4 layers, Isolation default [R3,R7], Data residency [R7], Upgrade orchestration (canary, tenant_migrations, PostHog), Admin tooling (impersonation, switcher, analytics), Open items
- §9 Configurable Department Taxonomy [ADR-030] — 7 Forza depts, variations, Phase D decision #15
- §10 Event-first + AI/Trace-ready Schema [R1, R13] — Outbox SQL, ISA-95 naming, Identity cols, GS1-first [R15], Idempotent mutations [R14]
- §11 Cross-cutting Requirements — i18n, Audit log, Regulatory roadmap, Out-of-scope, Build posture
- §12 ADRs — Active (028/029/030/031), Candidates R1-R15, Pre-Phase-D ADRs 001-019
- §13 Success Criteria — Architektoniczne, Funkcjonalne, Niefunkcjonalne, Compliance
- §14 Open Items — 16 items (8 carry-forward + 4 research + 4 new)
- §15 References (no tasks — pointer-only)

## Coverage, grouped by category

### docs (12 tasks)

| PRD ref | task | subcategory |
|---|---|---|
| §6 (ADR-028)           | T-1  | adr |
| §7 (ADR-029)           | T-2  | adr |
| §9 (ADR-030)           | T-3  | adr |
| §8 (ADR-031)           | T-4  | adr |
| §1 P6 + §2             | T-5  | readme |
| §3 + §4                | T-7  | readme |
| §11 regulatory table   | T-40 | regulatory |
| §11 out-of-scope       | T-41 | user-guide |
| §11 build posture + §13 | T-42 | user-guide |
| §12 R1-R15 candidates  | T-43 | adr |
| §12 Pre-Phase-D 001-019 | T-44 | adr |
| §14 open items         | T-45 | user-guide |
| (cross-ref table for §1 P1-P6 covered via ADR-028/029/030/031 + marker doc, no separate task needed) | — | — |

### infra (13 tasks)

| PRD ref | task | subcategory |
|---|---|---|
| §2 + §1 P6 enforcement  | T-6  | ci |
| §5 Runtime/Frontend     | T-8  | config |
| §5 Tailwind + L2 theming | T-9  | config |
| §5 RHF + Zod            | T-10 | config |
| §5 PWA (R5)             | T-11 | config |
| §5 Postgres + §11 app-role | T-12 | config |
| §5 Vitest + Playwright + §13 | T-13 | ci |
| §5 build posture + §11 18k cap | T-14 | ci |
| §5 testing + §13 CI     | T-15 | ci |
| §5 (implied Supabase/D365/Peppol/PostHog keys) | T-16 | secrets |
| §5 Observability        | T-17 | monitoring |
| §5 Feature flags (R6) + §8 canary | T-18 | config |
| §5 i18n (R11) + §11     | T-19 | config |

### data (10 tasks)

| PRD ref | task | subcategory |
|---|---|---|
| §8 tenants baseline     | T-20 | migration |
| §5 R2 + §6 storage tiers + §10 identity | T-21 | migration |
| §6 koncepcja (DeptColumns/FieldTypes/Formulas) | T-22 | migration |
| §5 R4 + §6 engine       | T-23 | model |
| §6 versioning + drift   | T-24 | migration |
| §7 rules table          | T-25 | rule |
| §10 outbox + AI/trace identity + R14 + R15 | T-31 | migration |
| §9 depts + decision #15 | T-34 | migration |
| §11 audit log           | T-35 | migration |
| §8 tenant_migrations + canary | T-36 | migration |

Count: 10 (migration: 7, model: 1, rule: 1, migration: 1 — corrected: 10 total under data; typo in header — actual count below is 10).

### api (3 tasks)

| PRD ref | task | subcategory |
|---|---|---|
| §7 rule runtime         | T-26 | middleware |
| §5 middleware + /[tenant]/* | T-27 | middleware |
| §5 event bus + §6 drift + §10 outbox worker | T-30 | job |

### auth (2 tasks)

| PRD ref | task | subcategory |
|---|---|---|
| §5 R3 + §8 RLS baseline | T-28 | session |
| §8 impersonation        | T-29 | session |

### ui (2 tasks)

| PRD ref | task | subcategory |
|---|---|---|
| §6 Admin UI wizard      | T-32 | page |
| §7 Rule wizard + dry-run | T-33 | page |

### integration (3 tasks)

| PRD ref | task | subcategory |
|---|---|---|
| §5 D365 R8              | T-37 | d365 |
| §5 Peppol + §14.12      | T-38 | peppol |
| §5 GS1 R15 + §10        | T-39 | gs1 |

### test (2 tasks)

| PRD ref | task | subcategory |
|---|---|---|
| §13 RLS 100% coverage   | T-46 | harness |
| §13 Phase B.1 close     | T-47 | harness |

## Per-section coverage check

| PRD section | Mapped tasks | Status |
|---|---|---|
| Exec Summary (positioning, two-systems, SaaS) | T-5 (markers), T-7 (personas/module-map), T-41 (out-of-scope) | covered (meta — no runtime) |
| §1 P1 Easy extension | T-1, T-32 (wizard), T-22 | covered |
| §1 P2 Two-systems | T-7 (module map narrates strangler), T-41 (out-of-scope for on-prem) | covered (narrative-only) |
| §1 P3 Schema-driven + rules | T-1, T-2, T-22, T-23, T-25, T-26, T-32, T-33 | covered |
| §1 P4 Reality fidelity | T-7 (module map), T-21 (69-col Main Table sourced from MAIN-TABLE-SCHEMA.md) | covered |
| §1 P5 Multi-tenant | T-4, T-20, T-27, T-28, T-29, T-36 | covered |
| §1 P6 Marker discipline | T-5, T-6 | covered |
| §2 (4 markers) | T-5, T-6 | covered |
| §3 Personas | T-7 | covered |
| §4.1 Writing phases | T-7 | covered |
| §4.2 Build sequence | T-7 | covered |
| §4.3 15-module table | T-7 | covered |
| §4 INTEGRATIONS distribution | T-7, T-37, T-38 | covered |
| §4 Scanner P1-only | T-7, T-11 | covered |
| §5 Next.js + RSC | T-8 | covered |
| §5 TS strict | T-8 | covered |
| §5 React 19 + RHF + Zod | T-10 | covered |
| §5 Tailwind + theming | T-9 | covered |
| §5 PWA (R5) | T-11 | covered |
| §5 Postgres 16+ | T-12, T-20 | covered |
| §5 JSONB hybrid storage (R2) | T-21 | covered |
| §5 RLS default (R3) | T-28 | covered |
| §5 Zod runtime (R4) | T-23 | covered |
| §5 Outbox MVP (R1) | T-31, T-30 | covered |
| §5 PostHog (R6) | T-18 | covered |
| §5 Sentry/OTel | T-17 | covered |
| §5 Event bus (R10.3 open) | T-30 (Azure Service Bus default), T-45 (open-item register) | covered |
| §5 LLM platform (open) | T-45 | open-tracked (no FOUNDATION code) |
| §5 Vitest+Playwright | T-13 | covered |
| §5 i18n (R11) | T-19 | covered |
| §5 D365 adapter (R8) | T-37 | covered (stub) |
| §5 Peppol AP | T-38 | covered (stub) |
| §5 GS1 lib (R15) | T-39 | covered |
| §6 Koncepcja schema-driven | T-1, T-22, T-23 | covered |
| §6 Admin UI wizard 5-step | T-32 | covered |
| §6 Storage tiers L1-L4 | T-4, T-21 | covered |
| §6 Schema versioning + drift | T-24 | covered |
| §6 Reject patterns | T-1 (captured in ADR-028 outline) | covered |
| §7 Cascading rules | T-25, T-26 | covered |
| §7 Conditional required | T-25, T-26 | covered |
| §7 Gate rules (allergen example) | T-25, T-26, T-33 | covered |
| §7 Workflow-as-data | T-25, T-26 | covered |
| §7 Format (JSON+Mermaid+Wizard) | T-2, T-33 | covered |
| §7 Open items (versioning, hard-lock, dry-run) | T-2, T-33, T-45 | tracked |
| §8 L1-L4 layers | T-4, T-21 | covered |
| §8 Isolation default (R3) | T-28 | covered |
| §8 Data residency (R7) | T-20 (EU/US CHECK) | covered |
| §8 Upgrade orchestration | T-36, T-18 | covered |
| §8 Admin tooling (impersonation) | T-29 | covered |
| §8 Open items (partition, opt-in) | T-45 | tracked |
| §9 Forza 7-dept baseline | T-3, T-34 | covered |
| §9 Variation (split/merge/custom) | T-3, T-34 | covered |
| §9 Decision #15 naming | T-3, T-34 | covered |
| §10 Outbox pattern + SQL | T-31 | covered |
| §10 ISA-95 event naming | T-31 (CHECK constraint) | covered |
| §10 AI/Trace-ready identity cols | T-31 | covered |
| §10 GS1-first (R15) | T-31, T-39 | covered |
| §10 Idempotent mutations (R14) | T-11 (client), T-31 (server txn_id) | covered |
| §11 i18n from day 1 | T-19 | covered |
| §11 Audit log | T-35 | covered |
| §11 Regulatory roadmap | T-40 | covered |
| §11 Out-of-scope | T-41 | covered |
| §11 Build posture | T-42, T-6, T-14, T-24 | covered |
| §12 Active ADRs 028-031 | T-1, T-2, T-3, T-4 | covered |
| §12 Candidate R1-R15 | T-43 | covered |
| §12 Pre-Phase-D deep review | T-44 | covered (review scheduled, not executed) |
| §13 Architektoniczne close | T-47 | covered |
| §13 Funkcjonalne MVP | (out of FOUNDATION scope — module PRDs 01-15) | out of scope per §4 — tracked via module PRDs |
| §13 Niefunkcjonalne (uptime, P95, RLS 100%, DR) | T-46 (RLS 100%), T-15 (CI), T-42 (DR runbook) | covered |
| §13 Compliance (SOC2/GDPR/FIC/BRCGS/FSMA/EUDR/Peppol) | T-40 (roadmap), T-35 (audit retention), T-31 (FSMA traceability), T-39 (GS1) | covered |
| §14 Open items 1-16 | T-45 | covered (register) |
| §15 References | (no tasks — pointer doc only) | out of scope (references, not deliverables) |

## Explicitly out-of-scope rows

| Row | Reason |
|---|---|
| §13 Funkcjonalne MVP (15 modules rewritten, Dashboard, Scanner running on Zebra/Honeywell, D365 P1 operational, traceability <30s) | Out of FOUNDATION by design — delivered in module PRDs 01-NPD..15-OEE per §4.3 |
| §15 References | Pointer list — not a deliverable |
| Exec Summary business metrics (MRR, churn, customers) | Explicitly "out-of-scope tego PRD — living w osobnym business plan doc" (PRD Exec Summary last paragraph) |
| §5 LLM platform open question (Claude API vs Azure OpenAI vs Modal) | Open research item, no FOUNDATION code — tracked in T-45 register |

## Gaps

| PRD section | Mapped tasks | Status |
|---|---|---|
| (none detected) | — | no ❌ GAP |

## Category balance sanity check

| Category | Count | Sanity |
|---|---|---|
| docs | 12 | high (expected — FOUNDATION is doc-heavy by design: 4 ADRs + 2 reference docs + regulatory + out-of-scope + build-posture + candidate ADRs + pre-Phase-D review + open items + marker doc) |
| infra | 13 | high (expected — greenfield scaffolding: Next.js, Tailwind, RHF, PWA, DB client, Vitest, pre-commit, CI, secrets, OTel, PostHog, i18n, plus marker lint) |
| data | 10 | core work — schema-driven and event-first FOUNDATION lives here |
| api | 3 | lean — FOUNDATION provides middleware + rule engine + cron, modules 01-15 add per-domain endpoints |
| auth | 2 | lean but sufficient (RLS + impersonation); per-user login flows land in 02-SETTINGS PRD |
| ui | 2 | lean — only admin wizards (schema + rules) belong to FOUNDATION; module UIs live in 01-15 |
| integration | 3 | stubs only — real impls in C1 (D365), C4 (Peppol) per §4 INTEGRATIONS distribution |
| test | 2 | harness-only (RLS leak + Phase-B1 acceptance); per-feature tests live inside feature tasks |

No silent imbalance: doc-heavy and infra-heavy distributions are the expected shape of a FOUNDATION PRD. ui/api/auth counts stay lean because FOUNDATION is deliberately a contract doc, not a user-facing feature set.

## Conclusion

- 47 tasks created, IDs 1..47, tag `master`.
- 100% of PRD deliverables mapped (0 gaps; 4 explicit out-of-scope rows with rationale).
- Category distribution matches FOUNDATION character (doc + infra + data heavy).
- Downstream module PRDs (01-NPD..15-OEE) will consume these IDs as cross-PRD dependencies.
