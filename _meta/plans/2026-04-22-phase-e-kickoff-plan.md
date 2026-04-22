---
title: Phase E Kickoff Plan — Foundation + Settings-minimum + NPD-a parallel build
version: 1.0
date: 2026-04-22
status: Draft for GPT consultation + prd-decomposition-hybrid skill input
authors: Claude (Opus 4.7) + Explore agent analysis
related:
  - _foundation/decisions/ADR-032-settings-minimum-carveout-for-npd-unlock.md
  - 00-FOUNDATION-PRD.md (§4.2 amendment target)
  - 02-SETTINGS-PRD.md v3.3 (§16.2 addendum target)
  - 01-NPD-PRD.md v3.0 (consumer, unchanged)
---

# Phase E Kickoff Plan

**Cel dokumentu:** zamknąć pre-build ambiguity (what exactly is "Foundation infra in minimum scope"?), rozłożyć pracę na **parallel-friendly backlog** zanim zaczniemy pierwszy `npm install`, dostarczyć GPT wystarczający kontekst do niezależnego review przed zatwierdzeniem.

**Output docelowy:** this doc + ADR-032 zasilą `prd-decomposition-hybrid` skill która wygeneruje konkretne epics+stories do `pipeline.log.md`.

---

## §1 — NPD-a Settings dependency matrix (hard vs soft blockers)

Żeby ustalić carveout, przeszliśmy 02-SETTINGS v3.3 + 01-NPD v3.0 sekcję po sekcji. Wynik:

### §1.1 Hard blockers (NPD-a nie ruszy)

| # | NPD-a potrzeba | 02-SETTINGS sekcja | Dlaczego blokuje |
|---|---|---|---|
| 1 | `Reference.DeptColumns` metadata | §8.1 + ADR-028 runtime | Runtime form generation dla 69-col Main Table. Bez tego engine nie wie co renderować per-dept. |
| 2 | `Reference.PackSizes` seed | §8.1 | Cascade chain 1 (§6.1 NPD): user picks pack_size → filter Line → auto-fill Dieset. Pierwszy dropdown w Core. |
| 3 | `Reference.Lines_By_PackSize` | §8.1 | Cascade chain 1 dynamic filter. Production.Line dropdown filtered by Pack_Size. |
| 4 | `Reference.Dieset_By_Line_Pack` | §8.1 | Cascade chain 1 final auto-fill. |
| 5 | `Reference.Templates` | §8.1 | Cascade chain 4: FA.Template → ApplyTemplate fills Process_1..4 ProdDetail. ~30% Forza user time per v7. |
| 6 | `Reference.Processes` | §8.1 | Cascade chain 2: Process_N → PR_Code suffix lookup. Required dla Phase D #10 PR_Code_Final. |
| 7 | `Reference.dept_columns` config | §8.1 | Per-dept blocking rule + `Closed_<Dept>` fields definition. |
| 8 | RBAC permissions (fa.create, fa.edit, brief.convert_to_fa, closed_flag.unset) | §3, §5.1 | CRUD guard. Bez tego wszyscy dept managers mogą edytować wszystko (security + integrity failure). |
| 9 | RLS baseline (`app.current_org_id` middleware + policies) | §5.7, §14.1 | **Runtime — należy do Foundation 00-d, nie 02-SET-a.** Corrected in ADR-032. |
| 10 | Audit log triggers on fa/brief/prod_detail | §5.6, ADR-008 | **Runtime infra — należy do Foundation 00-e, nie 02-SET-a.** Corrected in ADR-032. |
| 11 | Outbox pattern runtime (event emit + worker) | 00-FOUND §10, R1 | **Runtime infra — należy do Foundation 00-f, nie 02-SET-a.** Corrected in ADR-032. |
| 12 | Module toggles (`organization_modules.enabled` check) | §10.1 | Middleware feature gate. |
| 13 | i18n scaffolding (en + pl keys, next-intl config) | §14.2 | Form labels + validation messages from day 1. Can't retrofit post-release. |

**13 hard blockers.** Explore agent słusznie zidentyfikował 10 + 3 infra z Foundation; mój split: **9 trafia do 02-SET-a** (#1-8, 12, 13), **3 do 00-FOUNDATION-impl** (#9, 10, 11).

### §1.2 Soft blockers (NPD-a ruszy z stubem, flag later)

| # | Potrzeba | Source | Stub strategy |
|---|---|---|---|
| S1 | `Reference.Allergens` EU-14 seed | 02-SET §8.1 + 03-TECH §10 | Brief form collects raw strings P1; real cascade validation dopiero w 01-NPD-c. Seed deferred do 02-SET-d. |
| S2 | `Reference.AlertThresholds` (10/21 day launch alerts) | 02-SET §8.1 | Hardcoded w P1; UI picker w 02-SET-d/e. |
| S3 | `Reference.D365_Constants` (Forza FNOR/FOR100048/etc.) | 02-SET §11 + 01-NPD §10.4 | Hardcoded w 01-NPD-d stub; full admin w 02-SET-e. |
| S4 | Feature flags (PostHog) | 02-SET §10 | Core flags hardcoded default false; full PostHog integration 02-SET-e. |
| S5 | Onboarding wizard + MFA enroll | 02-SET §14.3 | Not needed for internal Forza pilot; 02-SET-e. |

### §1.3 Ref table split — 7 in carveout, 10 deferred

02-SETTINGS v3.3 §8.1 definiuje **17 reference tables cumulative**. NPD-a potrzebuje tylko 7:

**In 02-SET-a (seed + basic CRUD UI):**
1. `dept_columns` (schema metadata)
2. `pack_sizes`
3. `lines_by_pack_size`
4. `dieset_by_line_pack`
5. `templates`
6. `processes`
7. `close_confirm` (Yes/No enum — może być hardcoded, ale tanio dodać)

**Defer to 02-SET-d (full ref CRUD):**
8. `allergens_reference` (needed 01-NPD-c)
9. `alert_thresholds`
10. `quality_hold_reasons` (needed 09-QA)
11. `qa_failure_reasons`
12. `waste_categories` (08-PROD)
13. `allergen_hold_reasons`
14. `shipping_override_reasons` (11-SHIP)
15. `rma_reason_codes`
16. `maintenance_alert_thresholds` (13-MAINT)
17. `technician_skills`, `spare_parts_categories`, `sites_hierarchy_config` (14-MULTI)

Plus `dashboards_catalog`, `shift_configs`, `oee_alert_thresholds` z C5 → total realnie >17 po wszystkich phases.

---

## §2 — Foundation vs Settings infrastructure split (ADR-032 core decision)

Explore agent original proposal wrzucił **Outbox + RLS + Audit triggers + Materialized views** do 02-SET-a. To jest **architecturally wrong**:

| Concern | Natura | Właściwa lokacja |
|---|---|---|
| Outbox runtime (pg_boss worker, `insertOutboxEvent`, DLQ) | Universal runtime primitive, cross-cutting | **00-FOUNDATION-impl (00-f)** |
| RLS policies + `app.current_org_id` middleware | Universal data-layer enforcement | **00-FOUNDATION-impl (00-d)** |
| Audit log triggers (generic, on all business tables) | Universal compliance primitive | **00-FOUNDATION-impl (00-e)** |
| Rule engine DSL interpreter + registry loader | Universal runtime (per ADR-029) | **00-FOUNDATION-impl (00-g)** |
| Schema-driven JSON-Schema→Zod runtime | Universal runtime (per ADR-028) | **00-FOUNDATION-impl (00-h)** |
| Orgs/Users CRUD UI | Configuration UI | **02-SETTINGS-a** |
| 10 Roles + permission JSONB matrix UI | Configuration UI | **02-SETTINGS-a** |
| Reference CRUD UI (generic) | Configuration UI | **02-SETTINGS-a (7 tables) + -d (remaining 10)** |
| Module toggle UI + org_modules table | Configuration UI | **02-SETTINGS-a** |
| Schema admin wizard UI (ADR-028 L1 promotion, migration editor) | Admin UI on runtime | **02-SETTINGS-b** |
| Rule registry UI (read-only, dry-run viewer) | Admin UI on runtime | **02-SETTINGS-c** |
| Dept split/merge L2 config UI | Admin UI | **02-SETTINGS-d** |
| D365 Constants admin UI | Admin UI | **02-SETTINGS-e** |

**Rule of thumb:** if it runs at request-time without admin touching anything → Foundation. If it's a form/table/wizard that admin uses to configure the runtime → Settings.

---

## §3 — Revised build order (amendment do 00-FOUNDATION §4.2)

### §3.1 Current §4.2 (v3.0, linie 170-181)

```
| 1 | B.1 post-writing | _skip — 00-FOUNDATION nie ma "build" (meta-PRD)_ | — |
| 2 | B.2 post-writing | 01-NPD implementation (a..e) | Foundation infra minimum |
| 3 | C1 post-writing | 02-SETTINGS → 03-TECHNICAL → INTEGRATIONS stage 1 | 01-NPD done |
...
```

### §3.2 Proposed §4.2 (revised per ADR-032)

```
| # | Build order | Module/Part | Prerequisite |
|---|---|---|---|
| 1 | Phase E-0 | 00-FOUNDATION-impl (a..i) runtime infrastructure | Phase C PRD CLOSED ✅ |
| 2 | Phase E-1 | 02-SETTINGS-a (minimum carveout: orgs/users + RBAC + 7 ref tables + module toggles + i18n scaffold + org security baseline) | 00-FOUNDATION-impl-d/e/f/g/h complete |
| 3 | Phase E-2 TRACK A (sequential) | 01-NPD-a → -b → -c → -d → -e | 02-SETTINGS-a done |
| 3 | Phase E-2 TRACK B (parallel with A) | 02-SETTINGS-b (schema wizard) → -c (rule registry) → -d (ref CRUD full + L2) → -e (infra/D365/onboarding) | 02-SETTINGS-a done |
| 4 | Phase E-3 | 03-TECHNICAL-a..d | 01-NPD done, 02-SETTINGS done |
| 5 | Phase E-4 | 04-PLANNING-BASIC-a..d | 03-TECH done |
| 6 | Phase E-5 | 05-WAREHOUSE-a..d + 06-SCANNER-P1-a..e (can parallel after 05-a done) | 04 done |
| 7 | Phase E-6 | 07-PLANNING-EXT-a..d + 08-PRODUCTION-a..g + INTEGRATIONS stage 2 | 04+05+06 done |
| 8 | Phase E-7 | 09-QUALITY-a..e + 10-FINANCE-a..e + 11-SHIPPING-a..e + INTEGRATIONS 3+5 | 08 done |
| 9 | Phase E-8 | 12-REPORTING-a..e + 13-MAINTENANCE-a..e + 14-MULTI-SITE-a..e + 15-OEE-a..c + INTEGRATIONS 4+6 | 08+09 done |
```

### §3.3 Amendment mechanism

Nie przepisujemy całego PRD. W `00-FOUNDATION-PRD.md` **dodajemy addendum** po §4.2:

> **§4.2-AMENDMENT (2026-04-22, per ADR-032):** build order row 2 dependency "Foundation infra w minimum scope" zastępujemy explicit Phase E-0 = `00-FOUNDATION-impl-a..i` (spec w `_meta/specs/00-FOUNDATION-impl-spec.md`). Row 3 prerequisite "01-NPD done" zmieniamy na "02-SETTINGS-a minimum carveout done" z parallel Track A/B. Pełna tabela patrz `_meta/plans/2026-04-22-phase-e-kickoff-plan.md` §3.2.

Czyste, krótkie, nie psuje istniejącej treści, łatwo zmergować z pending work na drugiej maszynie.

---

## §4 — Stack decisions (D1-D8) — do klepnięcia w brainstorming session

Przed pierwszym `npm install` potrzeba locked decisions. Rekomendacje z prior response, bez zmian:

| # | Decyzja | Rekomendacja | Rationale |
|---|---|---|---|
| D1 | Monorepo tool | **pnpm workspaces + Turborepo** | Lekkie, świetny cache, szeroko używane w Next.js ecosystem |
| D2 | ORM | **Drizzle** | Type-safe, migrations jako code, zero runtime overhead, lepsze niż Prisma dla schema-driven L3 JSONB |
| D3 | Supabase hosting | **Cloud dev + self-host prod** | Forza compliance + data residency EU R7; cloud sprawdzi w dev |
| D4 | Forms + validation | **React Hook Form + Zod** | Już w MODAL-SCHEMA.md locked |
| D5 | UI primitives | **Radix + shadcn/ui** | Mapuje się 1:1 na prototypy design system (~48k linii JSX) |
| D6 | Rule DSL syntax | **TypeScript functions + JSON config** | Dev-authored PR per Q2 02-SET (no admin DSL editor) |
| D7 | Feature flags | **PostHog self-host** | R6 decision locked |
| D8 | CI/CD | **GitHub Actions + Vercel preview deploys** | Standard, auto preview per PR dla QA |

**Dodatkowe decyzje wynikłe z tej analizy (D9-D12):**

| # | Decyzja | Rekomendacja | Rationale |
|---|---|---|---|
| D9 | Outbox worker | **pg-boss** (Postgres-backed job queue) | Native PG, zero new infra, transactional guarantees |
| D10 | Testing strategy | **Vitest unit + Playwright E2E + Supabase local test DB per test run** | Real DB for RLS/trigger validation; no mocks for integration tests |
| D11 | Seed data strategy | **Typed seed via Drizzle + factory functions + named snapshots** (forza-baseline, empty-tenant, multi-tenant-3) | Repeatable, fast, CI-friendly |
| D12 | Deployment target | **Vercel Edge + Supabase managed for MVP** → self-host migration plan Phase 2 | Forza pilot fits cloud; self-host când dev obciążenie wymaga |

---

## §5 — Parallel agent dispatch plan

Key insight: **większość Phase E-0 i -1 ma dobre boundaries dla parallel agents**. Poniżej konkretne grupy zadań które można odpalić równolegle.

### §5.1 Phase E-0 (Foundation) — 3 parallel tracks

**Konfiguracja:** 3 agenty w parallel, synchronizacja po każdym sub-module end. Każdy track ma własny worktree (isolation).

**Track F-α (Scaffold + Data):**
- 00-a Monorepo + Next.js 14 scaffold
- 00-b Supabase + Drizzle + migrations pipeline
- 00-d RLS baseline
- **Output:** pnpm workspace, 1st migration, RLS policies deployable
- **Est:** 4-5 sesji

**Track F-β (Auth + Audit + Outbox):**
- 00-c Auth + session + org_id middleware (waits for F-α 00-b migration)
- 00-e Audit log infrastructure
- 00-f Outbox runtime + pg-boss worker
- **Output:** login works, audit triggers emit, events flow outbox→worker
- **Est:** 5-6 sesji

**Track F-γ (Engines + Tests):**
- 00-g Rule engine DSL runtime (independent of auth)
- 00-h Schema-driven JSON-Schema→Zod runtime
- 00-i Testing + CI + seed fixtures
- **Output:** rule `dry-run` works on sample, ext_jsonb queryable, Vitest+Playwright green in CI
- **Est:** 6-8 sesji

**Sync points:** after 00-b complete, F-β unblocked. After 00-c complete, 02-SET-a can plan. After all F tracks green, Phase E-1 starts.

**Wall clock:** max(F-α, F-β, F-γ) = ~6-8 sesji (vs 15-20 sequential). **Save ~10 sesji.**

### §5.2 Phase E-1 (02-SETTINGS-a) — 3 parallel tracks

**Track S-α (Identity):**
- Orgs + Users CRUD
- 10 Roles + RBAC middleware + permission enum lock
- Org security policies baseline
- **Est:** 3-4 sesji

**Track S-β (Reference data):**
- Generic reference CRUD component
- 7 ref tables seed + admin UI (pack_sizes, lines_by_pack_size, dieset_by_line_pack, templates, processes, close_confirm, dept_columns)
- Materialized view refresh strategy
- **Est:** 3-4 sesji

**Track S-γ (Toggles + i18n):**
- Module toggles schema + middleware
- i18n scaffolding (next-intl, EN full, PL placeholders)
- **Est:** 2 sesji

**Sync points:** RBAC permission enum (S-α) must land before NPD-a stories reference it. i18n keys (S-γ) needed before NPD-a forms. Reference seed (S-β) needed before NPD-a cascades test.

**Wall clock:** max(S-α, S-β, S-γ) = ~3-4 sesji (vs 7-9 sequential). **Save ~4-5 sesji.**

### §5.3 Phase E-2 (NPD + Settings parallel) — 2 large tracks

**Track A (NPD, sequential within):** 01-NPD-a → -b → -c → -d → -e. Sequential because each NPD sub-module builds on previous FA model.
- Est: 17-24 sesji

**Track B (Settings, parallel with A):** 02-SETTINGS-b → -c → -d → -e. Independent of NPD.
- Est: 14-17 sesji

**Wall clock:** max(A, B) = ~17-24 sesji. **Save ~14-17 sesji.**

### §5.4 Skumulowane oszczędności

| Phase | Sequential sesji | Parallel wall clock | Save |
|---|---|---|---|
| E-0 Foundation | 15-20 | 6-8 | 9-12 |
| E-1 Settings-a | 7-9 | 3-4 | 4-5 |
| E-2 NPD+Settings b-e | 31-41 | 17-24 | 14-17 |
| **Total E-0 through E-2** | **53-70** | **26-36** | **~27-34 sesji** |

**~50% wall-clock time reduction** jeśli parallel agents działają czysto. W praktyce sync friction + handoff overhead odetną ~20-30% — realny save ~20-25 sesji (calendar).

### §5.5 Agent dispatch mechanics

Każdy task w parallel track wymaga:
- **Isolated worktree** (superpowers `using-git-worktrees` skill)
- **Clear interface contract** (RBAC permission names, ref table names, event names) locked PRZED rozjazdem
- **Automated regression gate** per merge (Foundation 00-i must be live first — chicken-and-egg: 00-i needs to ship early, probably Track F-γ first 2 sesji)
- **Handoff doc** per sub-module close (what landed, what's next, what broke)

**Architect owner role:** single point-of-truth dla cross-track contracts (permission enum, event names, ref table names). Prevents integration hell. Recommend: Claude main session owns contracts, sub-agents implement against spec.

---

## §6 — Automated testing plan (critical path)

User emphasized: manual testing eats time → automate. Here's what Foundation delivers and what every subsequent story consumes.

### §6.1 Foundation 00-i delivers

| Tool | Purpose | Blocker for |
|---|---|---|
| Vitest + `@testing-library/react` | Unit + component tests | All sub-module ACs |
| Playwright + `@playwright/test` | E2E tests | UI flow validation |
| Drizzle seed factories + named snapshots | Repeatable DB state | Integration tests |
| Supabase local (Docker) + `supabase db reset` per test run | Real RLS/trigger behavior | Data-layer tests |
| MSW (Mock Service Worker) | External API mocking (D365 adapter) | Integration tests without hitting D365 |
| Playwright auth fixture (store session) | Fast authenticated E2E | Every UI E2E |
| `@axe-core/playwright` | Accessibility baseline | WCAG 2.2 AA compliance |
| GitHub Actions matrix (unit / integration / E2E) | CI gate | Every PR |
| Preview deploy per PR (Vercel) | Manual QA on real URL | Complex UX validation |
| PostHog session recording (self-host) | Replay prod issues | Bug triage |

### §6.2 Per-story test template (applied from 00-a onward)

Każda story w `pipeline.log.md` musi mieć:

```yaml
acceptance_criteria:
  - AC1: ...
tests:
  unit:
    - vitest: src/feature/foo.test.ts (covers AC1 logic)
  integration:
    - vitest: src/feature/foo.integration.test.ts (DB + RLS, real seed)
  e2e:
    - playwright: e2e/foo.spec.ts (covers AC1 user flow)
  regression:
    - npm run test:smoke (full regression green before merge)
```

**Żadna story nie jest `done` bez wszystkich 4 test types green.** Supports vba-qa / vba-regression-analogous skill pattern.

### §6.3 First automated test milestone

| Sesja | Co testujemy | Test type |
|---|---|---|
| 00-a sesja 2 | Scaffold works | Vitest: `sum(1,2)` + Playwright: `curl / → 200` |
| 00-b sesja 3 | Migration + Drizzle | Vitest: schema introspection + seed |
| 00-c sesja 4 | Auth + middleware | Playwright: login flow + middleware sets `app.current_org_id` |
| 00-d sesja 5 | RLS | Integration test: user org A cannot read org B data |
| 00-e sesja 6 | Audit triggers | Integration: INSERT → audit_log row created |
| 00-f sesja 7 | Outbox | Integration: emit event → pg-boss processes → marks consumed |
| 00-g sesja 8 | Rule engine | Unit: `fefo_strategy_v1` dry-run zwraca expected pick list |
| 00-h sesja 9 | Schema-driven | Integration: add ext col via migration → Zod runtime picks it up |
| 00-i sesja 10 | CI green | GitHub Actions: all 4 test types pass on dummy PR |
| 02-SET-a sesja ~18 | Admin flow | Playwright: create org → create user → assign role → login as user → RLS enforces org scope |
| 01-NPD-a sesja ~28 | **First Jane click-through** | Playwright: Jane logs in → opens Brief form → saves → Supabase row + outbox event + audit log all present |

### §6.4 Test coverage target

Following Explore agent's V-rule coverage analysis (~60% z 02-SET-a scope):

- **Foundation (00-a..i):** 85% line coverage, 100% critical path (auth/RLS/outbox)
- **02-SETTINGS-a:** 75% line coverage, 90% RBAC guard paths
- **01-NPD-a:** 70% line coverage, 100% cascade rules + validation rules
- **Accessibility:** WCAG 2.2 AA baseline on all pages via `@axe-core/playwright`

---

## §7 — Risks + red flags

(Z Explore analysis + moje dodatki.)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Allergen cascade becomes P1 blocker for Brief form | Medium | 02-SET-a scope balloons | ADR-032 explicit: Brief collects strings, no validation P1; validation w 01-NPD-c |
| D365 material validation (V04) forces D365 adapter early | Medium | 01-NPD-d blocked | V04 as soft warn P1, hard fail post-D365 adapter mature |
| RBAC permission names drift across tracks | High | Silent auth failure | Central `permissions.enum.ts` lock BEFORE parallel dispatch |
| RLS context not set → data leakage | High | Compliance failure | Middleware check mandatory; integration test every table |
| Outbox worker not deployed at release | Medium | Events rot | Release gate: pg-boss healthcheck w prod deploy check |
| Event name drift (snake vs dot) | Medium | Consumer breakage | Central `events.enum.ts` lock BEFORE parallel dispatch |
| Reference table schema drift (ADR-028 L1 promotion skipped) | Low | Admin UI breaks | Schema drift daily job (from 00-h) |
| Parallel merge conflicts | High (3 tracks) | Velocity loss | Worktrees + daily rebase from main + small PRs <500 lines |
| Automated test flakiness (Supabase local timing) | Medium | CI noise | Retry 1x on timeout only; budget <5% flake rate |
| Preview deploys overwhelming Vercel quota | Low | CI blocked | Cap concurrent PRs; cleanup old previews weekly |
| Foundation 00-i ships last → no test infra during 00-a..h | Critical | **Chicken-and-egg** | **00-i first 2 sesji prioritized** (basic Vitest + Playwright harness) then expand parallel |
| Pending work na drugiej maszynie nie zmerguje się | Medium | Lost progress | ADR-032 + plan doc to NOWE pliki; istniejące PRD dostają tylko addendum linię |

---

## §8 — Atomic task philosophy + prd-decomposition-hybrid integration

### §8.1 Filozofia: atomic >>> long tasks (user directive 2026-04-22)

**Reguła #1 — Fokus agenta:** jedno zadanie = **4-5 elementów max**, <100k context tokens. Agent nie gubi uwagi, nie halucynuje, nie skraca ścieżek.

**Reguła #2 — Nie "zbuduj feature", tylko slice:** zamiast "zbuduj Brief form" → **4 atomic taski**:
1. **T1 Schema** (Drizzle migration + Zod schema + TS types)
2. **T2 API** (Server Action / route handler + input validation + error path)
3. **T3 UI** (React component/modal z shadcn/Radix + RHF wiring)
4. **T4 Wiring + Test** (end-to-end flow: UI → API → DB + unit/E2E tests)

Opcjonalnie **T5 Seed/Fixture** jeśli feature potrzebuje dedykowanego seed data.

**Reguła #3 — Więcej wywołań, mniejszy scope:** 4 focused agent calls przebija 1 long-context call pod względem quality + debugability + rollback safety.

**Reguła #4 — Context budget per task:** <100k tokens input (PRD refs + spec + neighboring code). Jeśli task przekracza, **split again**.

### §8.2 47 vs 180 — clarification (rewritten 2026-04-22)

Earlier v1.0 tego planu proponowało "~180 stories" dla Foundation. Po analizie granularity hierarchy (patrz Helper B §11) to było **overshoot — poprawna math to ~45-80 atomic dla Foundation**.

User's 47 tasków na drugiej maszynie **prawdopodobnie już JEST atomic-grain** (mieści się w range 45-75). Weryfikujemy §11.3 test (4 checks per task) w Helper B.

**Kluczowa hierarchy:** sub-module (9) → feature (~1-3 per sub-module) → atomic task (~4-5 per feature). NIE sub-module → feature direct.

### §8.3 Revised backlog math

| Phase | Sub-modules | Est atomic tasks | Notes |
|---|---|---|---|
| **Foundation (E-0)** | 9 | **45-75** | User's 47 fits perfectly |
| **Settings-a (E-1)** | 3-5 | 15-50 | Carveout only |
| **Settings b-e (parallel w E-2)** | 4 | 60-100 | Full rest |
| **NPD a-e (E-2)** | 5 | 50-100 | Primary module |
| **Total pre-Phase-C-impl** | 21-23 | **~170-325 atomic** | Middle: ~250 |

~250 atomic tasks, każdy <100k context + ~30-90 min agent time. **Parallel 3-5 agentów = ~60-100 wall-clock sesji** (vs 150-250 solo).

### §8.4 Inputs dla prd-decomposition-hybrid (minimal file set)

User directive: **1 plan + 2 helpers, nie 10 plików**.

| File | Rola | Trwałość |
|---|---|---|
| `_meta/plans/2026-04-22-phase-e-kickoff-plan.md` (this doc) | **THE PLAN** — what, why, when | evergreen, rev per phase close |
| `_foundation/decisions/ADR-032-settings-minimum-carveout-for-npd-unlock.md` | **Helper A** — architectural decision (immutable record) | evergreen, status może zmienić (Proposed→Accepted) |
| `_meta/plans/atomic-task-decomposition-guide.md` | **Helper B** — HOW to break features into atomic tasks (input dla skilli) | evergreen, updated gdy zmienia się philosophy |

**Nie tworzymy separate spec files per-module** (wcześniej proponowane `00-FOUNDATION-impl-spec.md` + `02-SETTINGS-a-carveout-spec.md` — **cancelled**). Zamiast tego:
- Sub-module scope żyje w sekcji planu (§3.2 tabela) + Helper B pattern
- `prd-decomposition-hybrid` skill na drugiej maszynie konsumuje te 3 pliki + źródłowe PRD, produkuje atomic backlog bezpośrednio do `pipeline.log.md`

### §8.5 Expected skill output shape

Skill zwraca listę atomic tasks w `pipeline.log.md`:

```markdown
## T-00b-003 — Drizzle migration runner
type: schema
context_budget: ~40k
est: 1h
parent_feature: 00-b-02-setup-drizzle
dependencies:
  upstream: [T-00b-002]
  downstream: [T-00b-004]
  parallel: [T-00b-005, T-00b-006]

### GIVEN
Drizzle config exists, empty migrations folder
### WHEN
Developer runs `pnpm drizzle:migrate`
### THEN
- Migration applies cleanly
- `drizzle_migrations` table created
- Rollback command works

### Implementation (max 5 steps)
1. Add migrate command to package.json
2. Write migration runner script wrapping drizzle-kit
3. Add rollback command
4. Integration test (migrate up + down)
5. Document in README snippet

### Files
- Create: scripts/migrate.ts, scripts/rollback.ts
- Modify: package.json, drizzle.config.ts

### Test gate
- vitest: scripts/migrate.test.ts (up + rollback)
- CI: migration smoke test on PR
```

To jest **jedna atomic task**. Agent dostaje ~40k context (ten task + drizzle config + package.json), wykonuje 5 kroków, wraca. Nie rozpraszamy go na "zbuduj całego Drizzle'a".

---

## §9 — Next-session action items (execute BEFORE Phase E-0 starts)

**Revised 2026-04-22 per user directive: 1 plan + 2 helpers, atomic tasks, no extra spec files.**

| # | Action | Owner | Est |
|---|---|---|---|
| 1 | User reviews plan + ADR-032 + atomic-task guide z GPT (async, druga maszyna) | User + GPT | async |
| 2 | User porównuje swoje 47 tasków Foundation z atomic-task-guide pattern. Jeśli 47 = feature-level → skill generuje ~188 atomic z nich. Jeśli 47 = już atomic → ok. | User + skill | async |
| 3 | Add §4.2-AMENDMENT line to `00-FOUNDATION-PRD.md` + §16.2 addendum to `02-SETTINGS-PRD.md` (tylko linki do ADR-032, bez kopiowania treści) | Claude session | 0.25 sesja |
| 4 | Brainstorming session locking D1-D12 stack decisions | User + Claude | 1 sesja |
| 5 | Run `prd-decomposition-hybrid` na 3 plikach (plan + ADR-032 + atomic-task-guide) + źródłowe PRD → atomic backlog w `pipeline.log.md` | User na drugiej maszynie | async |
| 6 | Setup worktrees (superpowers `using-git-worktrees`) dla 3 parallel tracks | Claude | 0.5 sesja |
| 7 | Phase E-0 sesja 1: 00-a-T1 (monorepo init atomic task) | Agent Track F-α | 30-60 min |

**Pre-build overhead:** ~1.5-2 sesji (znacznie mniej niż wcześniej, bo **nie tworzymy spec files** — plan + atomic-task-guide wystarczą skill'owi).

**Time-to-first-Jane-click:**
- Sequential (solo): ~sesja 36 → atomic tasks to ~120 atomic wall clock → **first click ~120 atomic**
- Parallel (3-5 agents, atomic grain): **first click ~60-80 atomic tasks** (~30-40 calendar sesji jeśli 2 atomic/sesja solo orchestration lub shorter jeśli agents auto-run)

Atomic grain daje lepszą **testability + rollback**: jeśli T-00b-003 fails, rollback jednego atomic nie blokuje Track F-β.

---

## §10 — Open questions dla user (blokujące Phase E start)

**User odpowiedział 2026-04-22:**
- ✅ Atomic tasks philosophy (4-5 elementów, <100k context) — LOCKED
- ✅ File budget: 1 plan + 2 helpers — LOCKED
- ✅ 47 tasków Foundation na drugiej maszynie istnieje — need alignment z atomic-task-guide

**Pozostałe pytania:**

1. **47 tasków vs atomic:** czy twoje 47 to feature-level (każdy → ~4 atomic subtasks) czy już atomic? Od tego zależy czy skill generuje atomic z feature list, czy twoje 47 bierze jako final.
2. **Worktree setup:** jest na tej maszynie? Jeśli nie — atomic parallel leci przez `Agent` tool w isolation mode zamiast git worktrees.
3. **Stack lock session D1-D12:** brainstorming now czy inline w Phase E sesja 1? Rekomendacja: **now**, 1 sesja, locks permission enum + event enum + ref table names PRZED parallel dispatch (prevents drift między agentami).
4. **Test infra first:** potwierdzasz że 00-i-minimum (Vitest + Playwright harness, ~2 atomic tasks) leci **przed** 00-a-T2+ żeby każda kolejna atomic task mogła mieć test gate?
5. **Pending work merge strategy:** 47 tasków z drugiej maszyny — merge teraz czy po review GPT? Jeśli teraz — atomic-task-guide musi być kompatybilny z twoim existing output shape.
6. **Velocity:** ile atomic tasks / tydzień realistycznie? Jeśli 3 agenty × 2 atomic/dzień × 5 dni = ~30 atomic/tydz → Foundation (~188 atomic) w ~6-7 tygodni.

---

## §11 — Minimal viable "first test Jane sees" definition

For user to communicate internally what Phase E-2 completion means:

> **Milestone "Jane dogfood":** Jane (NPD Manager @ Forza) loguje się do Monopilot staging. Otwiera Brief form (01-NPD-a first flow). Wypełnia single-component brief wg brief 1.xlsx template. Klika Save. Brief zostaje zapisany do Supabase (org_id scoped, RLS enforced). Audit log entry visible w admin panel. Outbox event `brief.created` flows przez pg-boss. Jane widzi brief na liście Pipeline Dashboard. Może kliknąć Convert to FA — tworzy FA z FA5XXX PR_Code generated zgodnie z Phase D #10 cascade. FA pokazuje 7 dept sections (Core filled, pozostałe 6 empty, Closed_<Dept> wszystkie false).
>
> **Co działa:** auth, RLS, audit, outbox, rule engine (cascade), schema-driven form render, Reference table dropdowns (pack_size, line, dieset, template, process), RBAC (Jane = NPD Manager może create), module toggles (01-NPD + 02-SETTINGS enabled).
>
> **Co NIE działa jeszcze (deferred):** allergen cascade validation, D365 Builder output, dashboard launch alerts, multi-component brief 2, additional 6 dept sections filled.

Sesja ~24-36 depending on parallelization.

---

*Plan doc v1.0 — Phase E kickoff. Feeds prd-decomposition-hybrid + GPT consultation. After user + GPT feedback, this doc rev → v1.1 → specs (#2, #3) → backlog → first build sesja.*
