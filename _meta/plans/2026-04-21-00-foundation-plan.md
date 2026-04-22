# Implementation Plan — 00-FOUNDATION (monopilot-kira)

**Source PRD:** `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` (v3.0, Phase B.1, 744 lines)
**Mode:** Single-PRD. FOUNDATION is the root meta-PRD; every module 01-15 will depend on the tasks below.
**Decomposition date:** 2026-04-21
**Skill:** `prd-decompose-hybrid`

## Sequencing rationale

FOUNDATION has no "features" in the end-user sense. It is architectural contract + infra + metadata schemas that everything else depends on. Internal topological order:

1. `docs` — ADRs that encode principles (must exist before code references them)
2. `infra/config` + `infra/ci` — repo scaffold, Next.js, TS strict, Vitest, Playwright, lint, pre-commit
3. `infra/monitoring` + `infra/secrets` — observability baseline before writing runtime code
4. `data/migration` — foundational schemas (tenants, outbox, audit, metadata tables)
5. `data/model` + `data/rule` — Zod runtime, rule DSL runtime
6. `auth/session` — RLS, LEAKPROOF wrappers, impersonation, tenant switcher
7. `api/middleware` + `api/job` — request tenant resolver, outbox worker, schema drift job
8. `ui/page` — admin wizard shell (for schema + rule engine)
9. `integration` — placeholder adapters (D365, Peppol, GS1) — thin interfaces only at foundation level
10. `docs` — regulatory roadmap, README index, marker-discipline guide, pre-Phase-D ADR review

## Task list

---

## Task 1: [docs/adr] Publish ADR-028 Schema-driven column definition

**Files:**
- Create: `docs/adr/ADR-028-schema-driven-column-definition.md`
- Modify: `docs/adr/README.md` (index — create if absent)

**PRD coverage:** §1 P3, §6 (whole), §12 (ADR-028 row)

**Outline:**
- Context — why Main Table 69 cols must be metadata, not DDL per-org
- Decision — `Reference.DeptColumns` + `Reference.FieldTypes` + `Reference.Formulas` drive forms/validators/views/API
- Consequences — schema_version bumps, migration runner, drift detection job
- Alternatives rejected — pure EAV, Notion blocks, Retool platform, pure DDL (per §6 Reject patterns)
- Hard-lock open question — developer vs superadmin (§14 item 4)
- Cross-links — ADR-029 (rules), ADR-031 (multi-tenant L3 ext_jsonb)

**Definition of Done:**
- File committed under `docs/adr/ADR-028-schema-driven-column-definition.md`
- Linked from `docs/adr/README.md` index
- Referenced by FOUNDATION-PRD §6 hyperlink works
- Peer (non-author) confirms all §6 subsections (koncepcja, wizard, storage tiers, versioning, reject patterns) are covered

---

## Task 2: [docs/adr] Publish ADR-029 Rule engine DSL + workflow-as-data

**Files:**
- Create: `docs/adr/ADR-029-rule-engine-dsl-and-workflow-as-data.md`
- Modify: `docs/adr/README.md` (append index entry)

**PRD coverage:** §1 P3, §7 (whole), §12 (ADR-029)

**Outline:**
- Context — 4 rule obszary: cascading, conditional required, gate, workflow-as-data
- Decision — JSON runtime stored in `Reference.Rules`; Mermaid for docs; Admin wizard for authoring
- Example — allergen changeover gate (PRD §7 example preserved verbatim)
- Versioning — v1 active vs v2 draft (open item, §14 item 5)
- Dry-run scope — complete replay vs sample (open item, §14 item 15)
- Hook points — rule engine is data, runtime is `api/middleware` (evaluator) + `api/job` (scheduled rules)

**Definition of Done:**
- File committed; linked from ADR index
- Captures all 4 rule obszary with one example each
- Open items 5, 15 explicitly called out with owner + phase

---

## Task 3: [docs/adr] Publish ADR-030 Configurable department taxonomy

**Files:**
- Create: `docs/adr/ADR-030-configurable-department-taxonomy.md`
- Modify: `docs/adr/README.md`

**PRD coverage:** §1 P1, §9 (whole), §3 persona naming rule

**Outline:**
- Baseline — 7 Forza depts `core|technical|packaging|mrp|planning|production|price` (PRD §9 table)
- Role naming — Core = NPD team (not "Development"), Technical = Quality, MRP NOT split
- Variation patterns — split/merge/custom (ADR-030)
- Storage — L2 `tenant.dept_overrides` JSONB
- Re-mapping impact on cascading/gate rules at runtime

**Definition of Done:**
- File committed; linked from ADR index
- Forza 7-dept table reproduced with `[FORZA-CONFIG]` markers on each
- `tenant.dept_overrides` JSONB shape specified

---

## Task 4: [docs/adr] Publish ADR-031 Schema variation per org (L1-L4)

**Files:**
- Create: `docs/adr/ADR-031-schema-variation-per-org.md`
- Modify: `docs/adr/README.md`

**PRD coverage:** §1 P5, §8 (whole), §12 (ADR-031)

**Outline:**
- 4-layer model L1 (core) / L2 (org config) / L3 (ext_jsonb) / L4 (private_jsonb)
- Isolation default — shared DB + tenant_id + RLS; silo opt-in for enterprise
- Data residency — EU default, US when first US customer lands
- Upgrade orchestration — canary 5-10% → 50% → 100%, `tenant_migrations` table, PostHog feature flags
- Admin tooling — impersonation with `impersonating_as` + SIEM audit, tenant switcher MFA-gated
- Open items — partition-by-tenant strategy (§14 item 9), opt-in granularity (§14 item 6)

**Definition of Done:**
- File committed; linked from ADR index
- All 4 layers have storage + upgrade model rows
- Open items 6 and 9 explicitly listed

---

## Task 5: [docs/readme] Marker discipline reference doc

**Files:**
- Create: `docs/conventions/MARKER-DISCIPLINE.md`
- Modify: `README.md` (link from root)

**PRD coverage:** §1 P6, §2 (whole — 4 markers)

**Outline:**
- Rule — every PRD/ADR/skill/business-logic comment carries exactly one marker
- `[UNIVERSAL]` — examples from §2 (outbox, GS1 AI parse, RLS, EPCIS 2.0, 14 allergens EU FIC)
- `[FORZA-CONFIG]` — examples (7 dept names, Jane=NPD manager person, Builder_FA5101 D365 constants, PR_Code_Final regex)
- `[EVOLVING]` — examples (brief allergens loc, ADR-028 hard-lock, rule engine versioning)
- `[LEGACY-D365]` — examples (D365 Item dims, Release Workflow states, DMF, N+1 OP=10)
- Decision rule — "if unsure → `[EVOLVING]` + add to open items"
- Enforcement — Task 6 lint (out of scope for this doc)

**Definition of Done:**
- File committed
- Linked from root `README.md`
- All 4 markers each have ≥3 canonical examples from PRD §2

---

## Task 6: [infra/ci] Marker-discipline lint check

**Files:**
- Create: `scripts/lint/check_markers.py`
- Create: `tests/lint/test_check_markers.py`
- Modify: `.pre-commit-config.yaml` (add hook)
- Modify: `.github/workflows/ci.yml` (run script)

**PRD coverage:** §1 P6, §2

**Steps:**
- [ ] Step 1: Write failing test — fixture `docs/_fixtures/prd-missing-marker.md` with a behavioral paragraph and no marker, assert script exits non-zero.
  ```python
  def test_missing_marker_flagged(tmp_path):
      f = tmp_path / "x.md"
      f.write_text("## Foo\n\nSome behavioral rule here.\n")
      r = subprocess.run(["python", "scripts/lint/check_markers.py", str(f)], capture_output=True)
      assert r.returncode != 0
      assert b"missing marker" in r.stderr.lower()
  ```
- [ ] Step 2: Run test (expected FAIL — script does not exist)
- [ ] Step 3: Implement — walk MD under `docs/` and `*-PRD.md`, for each `##/###` section that mentions business keywords (allergen, tenant, rule, dept, lot, wo, shipment, etc.), require one of `[UNIVERSAL] [FORZA-CONFIG] [EVOLVING] [LEGACY-D365]` within same section.
  ```python
  MARKERS = {"[UNIVERSAL]", "[FORZA-CONFIG]", "[EVOLVING]", "[LEGACY-D365]"}
  ```
- [ ] Step 4: Run test (expected PASS)
- [ ] Step 5: Wire pre-commit + CI
- [ ] Step 6: Commit
  ```
  git add scripts/lint/check_markers.py tests/lint .pre-commit-config.yaml .github/workflows/ci.yml
  git commit -m "feat(lint): enforce marker discipline per FOUNDATION §2"
  ```

**Definition of Done:**
- `pre-commit run --all-files` catches missing markers
- CI green on PRs with markers, red without
- Script emits machine-parseable JSON (`--json` flag) for future dashboards

---

## Task 7: [docs/readme] Personas + module map reference

**Files:**
- Create: `docs/reference/PERSONAS.md`
- Create: `docs/reference/MODULE-MAP.md`
- Modify: `README.md`

**PRD coverage:** §3 (personas), §4 (whole — writing phases, build sequence, 15-module table, INTEGRATIONS distribution, Scanner P1 incremental)

**Outline (PERSONAS.md):**
- Primary personas table (NPD Manager, Technical/Quality, Planning, Production Manager, Warehouse Operator, Shipping Lead) with markers
- Secondary personas table
- Role naming rule (Core = NPD team, Technical = Quality, MRP NOT split)

**Outline (MODULE-MAP.md):**
- §4.1 PRD writing phases table (B/C1-C5)
- §4.2 Build order sequence (per §4.2 master order)
- §4.3 15-module table with dependencies + PRD file pointers
- INTEGRATIONS distribution table (stages 1-5)
- Scanner P1-only scope note

**Definition of Done:**
- Both docs linked from root README
- Every PRD filename in §4.3 is listed and hyperlinked
- Build order column reproduces §4.2 exactly

---

## Task 8: [infra/config] Repo scaffold — Next.js 14+ App Router + TS strict

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/[tenant]/layout.tsx`
- Create: `.nvmrc`, `.gitignore`

**PRD coverage:** §5 Tech Stack → Runtime + Frontend (Next.js App Router + RSC, TS 5+ strict, React 19+)

**Steps:**
- [ ] Step 1: Write failing test — `tests/scaffold/test_scaffold.sh`
  ```bash
  test -f package.json && jq -e '.dependencies.next' package.json
  test -f tsconfig.json && jq -e '.compilerOptions.strict == true' tsconfig.json
  test -d app/\[tenant\]
  ```
- [ ] Step 2: Run (expect FAIL)
- [ ] Step 3: `pnpm create next-app@latest --ts --app --tailwind --eslint --src-dir=false --import-alias="@/*"` then hand-edit `tsconfig.json` to set `"strict": true, "noUncheckedIndexedAccess": true`.
- [ ] Step 4: Create `app/[tenant]/layout.tsx` stub that reads the `tenant` param.
  ```tsx
  export default function TenantLayout({ children, params }: { children: React.ReactNode; params: { tenant: string } }) {
    return <div data-tenant={params.tenant}>{children}</div>;
  }
  ```
- [ ] Step 5: Run test (expect PASS)
- [ ] Step 6: `git add . && git commit -m "chore(scaffold): Next.js App Router + TS strict per FOUNDATION §5"`

**Definition of Done:**
- `pnpm dev` boots without warnings
- TS compiles with `strict: true`
- `/app/[tenant]/...` route renders with `tenant` param

---

## Task 9: [infra/config] Tailwind + minimal design system with per-tenant theming hook

**Files:**
- Modify: `tailwind.config.ts`
- Create: `app/theme.tsx` (ThemeProvider reading L2 config stub)
- Create: `tests/theme/theme.test.tsx`

**PRD coverage:** §5 Tech Stack → Tailwind + per-tenant theming via L2 config

**Steps:**
- [ ] Step 1: Failing test — `theme.test.tsx` renders `<ThemeProvider tenant="forza">` and asserts `--brand-primary` CSS var set.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Implement `ThemeProvider` that looks up `tenant → { brand_primary }` from a stub map (real lookup in 02-SETTINGS).
  ```tsx
  export function ThemeProvider({ tenant, children }: { tenant: string; children: React.ReactNode }) {
    const theme = TENANT_THEMES[tenant] ?? DEFAULT_THEME;
    return <div style={{ "--brand-primary": theme.brandPrimary } as React.CSSProperties}>{children}</div>;
  }
  ```
- [ ] Step 4: Run test (PASS)
- [ ] Step 5: Commit `feat(theme): L2 per-tenant theming hook`

**Definition of Done:**
- Tailwind compiles; custom CSS var consumed via `var(--brand-primary)` in a test component
- Stub theme map documents "02-SETTINGS will replace this with DB-backed lookup"

---

## Task 10: [infra/config] React Hook Form + Zod resolver wiring

**Files:**
- Create: `lib/forms/rhf.ts`
- Create: `tests/forms/rhf.test.tsx`

**PRD coverage:** §5 Tech Stack → React 19+, RHF + Zod resolver; §6 schema-driven (runtime validators)

**Steps:**
- [ ] Step 1: Failing test — render a form with Zod schema `z.object({ email: z.string().email() })`, type invalid, assert error shown.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Export `useZodForm<T>(schema)` wrapper.
  ```ts
  import { zodResolver } from "@hookform/resolvers/zod";
  export const useZodForm = <T extends z.ZodTypeAny>(schema: T) =>
    useForm<z.infer<T>>({ resolver: zodResolver(schema) });
  ```
- [ ] Step 4: Run test (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- Wrapper typed end-to-end (no `any`)
- Test proves error propagates to UI

---

## Task 11: [infra/config] PWA scaffold (Workbox + Service Worker + IndexedDB queue stub)

**Files:**
- Create: `public/sw.js`, `lib/pwa/register-sw.ts`, `lib/pwa/indexeddb-queue.ts`
- Create: `tests/pwa/queue.test.ts`

**PRD coverage:** §5 Tech Stack → PWA (Workbox) for 06-SCANNER-P1, Service Worker, IndexedDB sync queue, DataWedge keyboard-wedge, Capacitor P2 fallback

**Steps:**
- [ ] Step 1: Failing test — `queue.test.ts` pushes mutation, calls `flush()`, asserts `fetch` invoked with body.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Implement `IndexedDBQueue.push({ txId, payload })` + `.flush(endpoint)` that sends in FIFO order.
- [ ] Step 4: Run test (PASS)
- [ ] Step 5: Commit `feat(pwa): offline mutation queue stub per R5 / §5`

**Definition of Done:**
- Queue survives page reload (verified via Playwright in a later task)
- `transaction_id` (UUID v7) carried through
- DataWedge wedge + Capacitor P2 noted in `lib/pwa/README.md`

---

## Task 12: [infra/config] Supabase / Postgres 16+ connection scaffold with app-role

**Files:**
- Create: `lib/db/client.ts`, `lib/db/admin.ts`, `lib/db/app-role.ts`
- Create: `supabase/config.toml`
- Create: `tests/db/connection.test.ts`

**PRD coverage:** §5 Backend → Postgres 16+ (Supabase or self-host), §11 build posture → "Tests zawsze z app-role connection"

**Steps:**
- [ ] Step 1: Failing test — spin local Postgres (testcontainers), connect via `app-role`, assert `current_user` == `app_role`.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: `lib/db/client.ts` exports two clients: `dbAdmin` (migrations only) + `dbApp` (all request code). Throw if request-path code imports `dbAdmin`.
- [ ] Step 4: Run test (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- `grep -r "dbAdmin" app/` returns zero hits (lint guard in Task 6 extended)
- Connection pool configured (min 2, max 20)
- Supabase + self-host both documented in `lib/db/README.md`

---

## Task 13: [infra/ci] Vitest + Playwright harness

**Files:**
- Create: `vitest.config.ts`, `playwright.config.ts`, `tests/e2e/smoke.spec.ts`
- Modify: `package.json` (scripts)

**PRD coverage:** §5 Testing → Vitest (Phase D decision #10) + Playwright (E2E per module); §13 Funkcjonalne → "Tests run w app-role (nigdy superuser) w CI"

**Steps:**
- [ ] Step 1: Failing test — `tests/e2e/smoke.spec.ts` navigates to `/` and asserts 200.
- [ ] Step 2: Run (FAIL — no config)
- [ ] Step 3: Add `vitest.config.ts` with `environment: "jsdom"`; `playwright.config.ts` with one project, baseURL `http://localhost:3000`.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- `pnpm test` → Vitest green
- `pnpm test:e2e` → Playwright green
- Both wired into Task 16 CI

---

## Task 14: [infra/ci] Pre-commit hook: ruff/eslint/prettier + typecheck

**Files:**
- Create: `.pre-commit-config.yaml`
- Create: `.eslintrc.cjs`, `.prettierrc`

**PRD coverage:** §5 build posture, §11 build posture → "PR files cap ~18k tokenów; split jeśli większy"

**Steps:**
- [ ] Step 1: Failing test — craft a TS file with an unused import, run pre-commit, assert it flags.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Wire `eslint --max-warnings=0`, `prettier --check`, `tsc --noEmit` + a custom hook that rejects diffs >18k tokens.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- `pre-commit run --all-files` green on clean repo
- 18k-token cap demoed on a synthetic big diff

---

## Task 15: [infra/ci] GitHub Actions CI pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

**PRD coverage:** §5 Testing, §13 Niefunkcjonalne → "Tests run w app-role w CI"

**Steps:**
- [ ] Step 1: Failing test — expect CI config to include lint, typecheck, vitest, playwright, marker-lint.
  ```bash
  yq '.jobs.ci.steps[].name' .github/workflows/ci.yml | grep -i playwright
  ```
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Author workflow: pnpm setup, DB service (Postgres), run migrations as admin, run tests as app-role.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- PR build green end-to-end
- DB service comes up with `app_role` grants applied
- Marker-lint from Task 6 runs as a required check

---

## Task 16: [infra/secrets] .env handling + Doppler/1Password integration

**Files:**
- Create: `docs/conventions/SECRETS.md`, `.env.example`, `scripts/secrets/load.sh`

**PRD coverage:** §5 Tech Stack (implied for Supabase + D365 adapter + PostHog + Peppol keys)

**Outline:**
- Rule — `.env` never committed; `.env.example` keys only
- Local dev — Doppler OR 1Password CLI
- CI — GitHub Secrets → workflow env
- Production — per-tenant KMS envelope keys (§8 L4 notes)

**Definition of Done:**
- `.env.example` enumerates every secret used in repo (validated by a script)
- Missing secrets at boot → clear error "missing SUPABASE_URL (see docs/conventions/SECRETS.md)"

---

## Task 17: [infra/monitoring] Sentry + OpenTelemetry baseline

**Files:**
- Create: `lib/obs/sentry.ts`, `lib/obs/otel.ts`, `instrumentation.ts`
- Create: `tests/obs/otel.test.ts`

**PRD coverage:** §5 Cross-cutting infra → Observability: Sentry + Datadog / OpenTelemetry

**Steps:**
- [ ] Step 1: Failing test — assert `trace_id` propagates through an HTTP call.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Wire `@sentry/nextjs`, `@opentelemetry/api` + auto-instrumentation for `http`, `pg`.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- Error thrown in a route appears in Sentry dev project
- OTel traces include `tenant_id` attribute (hook point for Task 28)

---

## Task 18: [infra/config] PostHog self-host feature-flag client

**Files:**
- Create: `lib/flags/posthog.ts`, `lib/flags/use-flag.tsx`
- Create: `tests/flags/flag.test.tsx`

**PRD coverage:** §5 Cross-cutting infra → Feature flags PostHog self-host [R6]; §8 Upgrade orchestration → "Feature flags per-tenant targeting (PostHog)"

**Steps:**
- [ ] Step 1: Failing test — `useFlag("new-wizard", { tenant: "forza" })` returns boolean.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Init PostHog client with `distinctId = tenant_id` so per-tenant targeting works.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- Flag eval <50ms (local cache)
- Per-tenant override proven with two distinct tenant IDs in tests

---

## Task 19: [infra/config] i18n scaffold (pl/en/uk/ro via ICU MessageFormat)

**Files:**
- Create: `lib/i18n/index.ts`, `locales/en.json`, `locales/pl.json`, `locales/uk.json`, `locales/ro.json`
- Create: `tests/i18n/format.test.ts`

**PRD coverage:** §5 Tech Stack → i18n [R11], §11 Cross-cutting → "Minimum pl, en, uk, ro baseline"

**Steps:**
- [ ] Step 1: Failing test — `t("welcome", { name: "Jane" })` in `pl` returns `Witaj, Jane`.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Wrap `@formatjs/intl` with ICU formatter; ship 4 locale files with `welcome` + `items_count` (plural).
- [ ] Step 4: Run (PASS — plural rules exercised for pl/uk/ro)
- [ ] Step 5: Commit

**Definition of Done:**
- 4 locales load
- Plural rules correct for Slavic (pl/uk) and Romance (ro)
- No string concatenation in codebase (lint rule added)

---

## Task 20: [data/migration] Core tenants table + tenant_id convention

**Files:**
- Create: `supabase/migrations/20260421000001_tenants.sql`
- Create: `tests/db/tenants.test.ts`

**PRD coverage:** §5 Backend → RLS default; §8 Multi-tenant shared DB + tenant_id; §10 AI/Trace-ready schema identity fields

**Steps:**
- [ ] Step 1: Failing test — insert into `tenants` with `('forza','EU')`, select back, assert 1 row.
- [ ] Step 2: Run (FAIL — table missing)
- [ ] Step 3: Migration:
  ```sql
  CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    data_region TEXT NOT NULL CHECK (data_region IN ('EU','US')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    dept_overrides JSONB NOT NULL DEFAULT '{}'::jsonb
  );
  ```
- [ ] Step 4: Run test (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- Migration idempotent (`IF NOT EXISTS` where legal)
- `data_region` constrained to EU/US (P7 data residency)
- `dept_overrides` JSONB ready for ADR-030

---

## Task 21: [data/migration] Main Table — 69 typed cols + ext/private JSONB + schema_version

**Files:**
- Create: `supabase/migrations/20260421000002_main_table.sql`
- Create: `tests/db/main_table.test.ts`

**PRD coverage:** §5 Storage pattern [R2]; §6 storage tiers L1-L4; §6 schema versioning

**Steps:**
- [ ] Step 1: Failing test — insert row with `schema_version=1`, read back, assert columns exist and RLS set.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Migration creates `main_table` with:
  ```sql
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  schema_version INT NOT NULL DEFAULT 1,
  -- 69 typed columns ordered per _meta/reality-sources/pld-v7-excel/MAIN-TABLE-SCHEMA.md
  ext_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  private_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT main_table_schema_version_positive CHECK (schema_version > 0)
  ```
  Plus composite index `(tenant_id, dept_id, status, created_at)` and GIN on `ext_jsonb`.
- [ ] Step 4: Run test (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- 69 typed cols reflected from `_meta/reality-sources/pld-v7-excel/MAIN-TABLE-SCHEMA.md`
- Composite index + GIN created
- `schema_version` column present and indexed

---

## Task 22: [data/migration] Metadata tables — Reference.DeptColumns / FieldTypes / Formulas

**Files:**
- Create: `supabase/migrations/20260421000003_reference_metadata.sql`
- Create: `tests/db/reference_metadata.test.ts`

**PRD coverage:** §6 (whole — schema-driven foundation)

**Steps:**
- [ ] Step 1: Failing test — seed 3 rows in each table, assert FK `column_id → field_type_id` valid.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Migration creates `reference.field_types`, `reference.dept_columns(tenant_id, dept, name, field_type_id, validation_json, presentation_json)`, `reference.formulas`.
- [ ] Step 4: Run test (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- Schema namespace `reference` exists
- Wizard (Task 32) can write metadata without touching DDL
- FK integrity tested

---

## Task 23: [data/model] Zod + json-schema-to-zod runtime loader

**Files:**
- Create: `lib/schema/load.ts`, `lib/schema/cache.ts`
- Create: `tests/schema/load.test.ts`

**PRD coverage:** §5 Backend → Zod + json-schema-to-zod [R4]; §6 koncepcja (runtime engine generuje forms/validators/views)

**Steps:**
- [ ] Step 1: Failing test — call `loadZodSchema({ tenant, dept })`, assert returned Zod rejects bad input.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Implement: read `reference.dept_columns` → JSON Schema → `json-schema-to-zod` → cache LRU by `schema_version`.
  ```ts
  const cache = new LRUCache<string, z.ZodTypeAny>({ max: 500 });
  export async function loadZodSchema(ctx: { tenant: string; dept: string }) {
    const v = await schemaVersion(ctx);
    const key = `${ctx.tenant}:${ctx.dept}:${v}`;
    return cache.get(key) ?? cache.set(key, await build(ctx)).get(key)!;
  }
  ```
- [ ] Step 4: Run test (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- Cache hit rate >90% in a warm test
- Invalidation on `schema_version` bump proven in test

---

## Task 24: [data/migration] Schema migration ledger + drift detection job

**Files:**
- Create: `supabase/migrations/20260421000004_schema_migrations.sql`
- Create: `scripts/jobs/schema_drift.ts`
- Create: `tests/jobs/schema_drift.test.ts`

**PRD coverage:** §6 Schema versioning → drift detection daily job; §11 build posture

**Steps:**
- [ ] Step 1: Failing test — insert divergence into `information_schema` vs `reference.dept_columns`, run job, assert report row.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Table `schema_migrations(tenant_id, component, from_version, to_version, applied_at, checksum)`; job diffs `information_schema.columns` against `reference.dept_columns` per tenant.
- [ ] Step 4: Run test (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- Job runs daily via cron (Task 30)
- Slack/Sentry alert on drift
- Deprecate-then-remove policy documented in README

---

## Task 25: [data/rule] Reference.Rules table + 4 rule_type enum

**Files:**
- Create: `supabase/migrations/20260421000005_reference_rules.sql`
- Create: `tests/db/reference_rules.test.ts`

**PRD coverage:** §7 (format — JSON stored in `Reference.Rules`)

**Steps:**
- [ ] Step 1: Failing test — insert a `gate` rule (allergen changeover example from PRD §7 verbatim), read back, assert JSON valid.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Migration:
  ```sql
  CREATE TYPE rule_type AS ENUM ('cascading','conditional_required','gate','workflow');
  CREATE TABLE reference.rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    rule_type rule_type NOT NULL,
    definition_json JSONB NOT NULL,
    version INT NOT NULL DEFAULT 1,
    active_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    active_to TIMESTAMPTZ
  );
  ```
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- ENUM covers exactly the 4 obszary in §7
- Versioning columns support "v1 active vs v2 draft" open item

---

## Task 26: [api/middleware] Rule engine runtime evaluator

**Files:**
- Create: `lib/rules/engine.ts`, `lib/rules/types.ts`
- Create: `tests/rules/engine.test.ts`

**PRD coverage:** §7 (JSON runtime engine), §7 example allergen changeover gate

**Steps:**
- [ ] Step 1: Failing test — load the exact allergen-changeover gate JSON from PRD §7, feed a WO transition, assert `block_transition: true` when cleaning checklist missing.
  ```ts
  const res = evaluate(allergenGateRule, { prev_wo: {...}, next_wo: {...} });
  expect(res.blocked).toBe(true);
  expect(res.missing).toContain("cleaning_validation_checklist_signed");
  ```
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Implement `evaluate(rule, ctx)` switch by `rule_type`: cascading fills, conditional_required returns missing fields, gate returns `{blocked, missing}`, workflow advances state machine.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- Engine pure function (no DB calls — caller loads rule + ctx)
- All 4 `rule_type` branches covered by tests
- Dry-run mode returns explanation trace

---

## Task 27: [api/middleware] Tenant resolver middleware

**Files:**
- Create: `middleware.ts` (Next.js root middleware)
- Create: `lib/tenant/context.ts`
- Create: `tests/middleware/tenant.test.ts`

**PRD coverage:** §5 Runtime → `/app/[tenant]/...` + middleware; §8 RLS enforcement

**Steps:**
- [ ] Step 1: Failing test — request to `/forza/dashboard`, middleware sets `x-tenant-id` header + cookie.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Middleware looks up `params.tenant` slug → tenant_id UUID (cached), sets headers, rejects unknown slug with 404.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- Unknown tenant → 404 (not 500)
- Tenant ID propagated to RLS via Postgres session var (Task 28)

---

## Task 28: [auth/session] RLS policies + LEAKPROOF SECURITY DEFINER wrappers

**Files:**
- Create: `supabase/migrations/20260421000006_rls_baseline.sql`
- Create: `tests/rls/rls_crosscheck.test.ts`

**PRD coverage:** §5 Backend → RLS default [R3], LEAKPROOF SECURITY DEFINER wrappers; §8 Isolation default

**Steps:**
- [ ] Step 1: Failing test — tenant A inserts row; as tenant B, SELECT returns 0 rows; as superuser, still both rows visible but test RUNS AS app-role → 0 rows.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Migration enables `ROW LEVEL SECURITY` on `main_table`, adds policies `USING (tenant_id = current_setting('app.tenant_id')::uuid)` + `WITH CHECK`. Wrap helper `app.current_tenant()` as `LEAKPROOF SECURITY DEFINER`.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- Every business table has RLS on (verified by a test that iterates `pg_tables`)
- Cross-tenant leak test green
- Helper function marked LEAKPROOF

---

## Task 29: [auth/session] Impersonation + tenant switcher (superadmin only, MFA, SIEM-logged)

**Files:**
- Create: `lib/auth/impersonate.ts`, `app/(admin)/switch-tenant/page.tsx`
- Create: `supabase/migrations/20260421000007_impersonation.sql`
- Create: `tests/auth/impersonate.test.ts`

**PRD coverage:** §8 Admin tooling → impersonation with explicit `impersonating_as` + SIEM audit log

**Steps:**
- [ ] Step 1: Failing test — superadmin impersonates tenant forza, SELECT from `main_table` returns forza rows; audit row inserted with `impersonating_as='forza'`.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Create `auth.impersonation_events` table; `impersonate(targetTenant)` sets session var + inserts audit row; enforce MFA claim check in middleware.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- No silent RLS bypass possible
- Every impersonation yields an audit event (verified by a test that omits the bookkeeping and asserts it fails CI)
- UI shows persistent red banner when impersonating

---

## Task 30: [api/job] Outbox worker + schema drift daily cron

**Files:**
- Create: `scripts/jobs/outbox_worker.ts`, `scripts/jobs/schedule.ts`
- Create: `tests/jobs/outbox_worker.test.ts`

**PRD coverage:** §5 Tech Stack → Event bus; §10 Outbox pattern (worker publishing to queue); §6 Schema versioning → drift detection daily job

**Steps:**
- [ ] Step 1: Failing test — insert `outbox_events` row, run one worker tick, assert row flagged `consumed_at IS NOT NULL` and a publish fn called.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Worker: `SELECT … FOR UPDATE SKIP LOCKED`, publish to Azure Service Bus stub (R10.3 open — provider pluggable), mark consumed, retry with exponential backoff → DLQ after N attempts.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- Idempotent publish (duplicate-safe via `txn_id`)
- DLQ table `outbox_dead_letter`
- Cron runner invokes both outbox + drift jobs

---

## Task 31: [data/migration] outbox_events + AI/Trace-ready identity columns migration

**Files:**
- Create: `supabase/migrations/20260421000008_outbox_and_identity.sql`
- Create: `tests/db/outbox.test.ts`

**PRD coverage:** §10 Outbox pattern (SQL shape from PRD §10 verbatim); §10 AI-ready + traceability-ready fields (id, external_id, tenant_id, created_at, created_by_user, created_by_device, app_version, model_prediction_id, epcis_event_id); §10 GS1-first; §10 Idempotent mutations

**Steps:**
- [ ] Step 1: Failing test — migration creates `outbox_events` with exactly the columns PRD §10 specifies; asserts unique index on `(tenant_id, created_at) WHERE consumed_at IS NULL`.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Migration:
  ```sql
  CREATE TABLE outbox_events (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    consumed_at TIMESTAMPTZ,
    app_version TEXT NOT NULL
  );
  CREATE INDEX ON outbox_events (tenant_id, created_at) WHERE consumed_at IS NULL;
  ```
  Plus `trace_identity` composite type (UUID v7 id, external_id, gtin/sscc/gln slots, model_prediction_id, epcis_event_id) applied to each business table as columns.
- [ ] Step 4: Run test (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- Every business table exposes the 9 AI/trace identity columns from PRD §10
- ISA-95 event-type format enforced by a CHECK constraint (`/^[^/]+/[^/]+/[^/]+/[^/]+/[^/]+$/`)
- GS1 ID columns (`gtin`, `sscc`, `gln`, `grai`, `gdti`) present where applicable; internal IDs allowed alongside

---

## Task 32: [ui/page] Admin UI wizard shell — add/edit column

**Files:**
- Create: `app/[tenant]/admin/schema/page.tsx`, `app/[tenant]/admin/schema/ColumnWizard.tsx`
- Create: `tests/ui/ColumnWizard.test.tsx`

**PRD coverage:** §6 Admin UI wizard (blocker for P1 "easy extension") — 5-step flow

**Steps:**
- [ ] Step 1: Failing test — render wizard, pick field type "enum", enter values, assert step-5 "Preview" shows payload with metadata upsert.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Implement 5-step UI: (1) field type enum, (2) validation DSL builder, (3) presentation opts, (4) sample preview, (5) commit → metadata upsert + schema_version bump.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- Wizard writes via `reference.dept_columns` (never direct DDL)
- Preview pulls real sample via Task 23 loader
- Accessible (WCAG keyboard nav)

---

## Task 33: [ui/page] Admin UI wizard shell — rule authoring

**Files:**
- Create: `app/[tenant]/admin/rules/page.tsx`, `app/[tenant]/admin/rules/RuleWizard.tsx`
- Create: `tests/ui/RuleWizard.test.tsx`

**PRD coverage:** §7 Wizard Admin UI (visual builder, dry-run, diff preview, version history)

**Steps:**
- [ ] Step 1: Failing test — author a cascading rule "Core.allergens → Technical.allergens", click Dry-run, assert sample row shows filled value.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Build visual condition→action composer; dry-run calls Task 26 `evaluate`; diff view compares v1 vs v2; version-history timeline.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- All 4 rule_type values authorable through UI
- Dry-run scope (full vs sample) user-selectable — open item §14.15 tracked
- Mermaid export button produces valid diagram text

---

## Task 34: [data/migration] Dept taxonomy baseline — Forza 7 depts + tenant.dept_overrides

**Files:**
- Create: `supabase/migrations/20260421000009_dept_taxonomy.sql`
- Create: `tests/db/depts.test.ts`

**PRD coverage:** §9 Configurable Department Taxonomy (7 Forza depts table, L2 `tenant.dept_overrides`); §9 Phase D decision #15 (Core=NPD, Technical=Quality, MRP NOT split)

**Steps:**
- [ ] Step 1: Failing test — seed tenant `forza`, assert 7 depts with codes `core|technical|packaging|mrp|planning|production|price`; override `technical → food_safety + quality_lab`, assert re-mapping returns 8 rows.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Migration creates `reference.depts(tenant_id, code, name, display_order, marker)`; seed Forza 7 with `[FORZA-CONFIG]` marker; use `tenants.dept_overrides` JSONB for L2 split/merge.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- Override runtime exposed via `getEffectiveDepts(tenantId)`
- Forza seed uses the exact names from §9 table
- MRP stays 1 dept (decision #15 encoded in test)

---

## Task 35: [data/migration] audit_events append-only table + business-table triggers

**Files:**
- Create: `supabase/migrations/20260421000010_audit_events.sql`
- Create: `tests/db/audit.test.ts`

**PRD coverage:** §11 Cross-cutting → Audit log (append-only `audit_events`, triggers on business tables, event-sourced integration with rule engine); §11 retention → SOC 2, GDPR, FDA 21 CFR Part 11, FSMA 204

**Steps:**
- [ ] Step 1: Failing test — UPDATE a row on `main_table`, assert 1 row appears in `audit_events` with before/after JSONB.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Table + generic trigger function `audit_trigger()` attached to business tables via migration; append-only enforced by revoking UPDATE/DELETE from app-role.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- UPDATE/DELETE attempts against `audit_events` fail with RLS error
- Retention policy documented (hot 12m / cold 7y per §11 compliance)
- Trigger attaches to every FOUNDATION business table (verified by iterating `pg_tables`)

---

## Task 36: [data/migration] tenant_migrations + canary upgrade scaffolding

**Files:**
- Create: `supabase/migrations/20260421000011_tenant_migrations.sql`
- Create: `scripts/jobs/canary_rollout.ts`
- Create: `tests/jobs/canary.test.ts`

**PRD coverage:** §8 Upgrade orchestration — canary 5-10% → progressive, `tenant_migrations(tenant_id, component, current_version, target_version, last_run_at)`

**Steps:**
- [ ] Step 1: Failing test — 10 tenants, canary 10% → 1 tenant upgraded; advance, 5 upgraded; advance, all 10.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Table migration + worker that picks tenants stratified by region + risk tier.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- Rollback path covered (downgrade within N-2 majors)
- PostHog flag (Task 18) wrapped per-tenant

---

## Task 37: [integration/d365] D365 adapter interface stub

**Files:**
- Create: `packages/d365-adapter/src/index.ts`, `packages/d365-adapter/src/dmf.ts`
- Create: `packages/d365-adapter/tests/contract.test.ts`

**PRD coverage:** §5 Integration stack → D365 adapter [R8]: DMF client + retry/DLQ + schema mapping; one-way pull + one-way push

**Steps:**
- [ ] Step 1: Failing test — contract test: pull-items returns `{items: []}` shape; push-confirmation returns `{accepted: true}` — against a stubbed DMF server.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Define interfaces only:
  ```ts
  export interface D365Adapter {
    pullItems(since: Date): Promise<Item[]>;
    pullBOM(since: Date): Promise<BOM[]>;
    pushProductionConfirmation(c: Confirmation): Promise<{accepted: boolean}>;
  }
  ```
  Plus retry + DLQ wrappers.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- `[LEGACY-D365]` marker on every public interface
- Real implementation deferred to INTEGRATIONS stage 1 (C1) — stub only here
- Outbox hook documented (push goes via outbox → worker → D365)

---

## Task 38: [integration/peppol] Peppol AP vendor-agnostic adapter interface stub

**Files:**
- Create: `packages/peppol-adapter/src/index.ts`
- Create: `packages/peppol-adapter/tests/contract.test.ts`

**PRD coverage:** §5 Integration stack → Peppol access point; §14 open item 12 (Storecove vs Pagero vs Tradeshift)

**Outline (interface shape):**
- `sendInvoice(xml: UBLInvoice, recipientGLN: string): Promise<PeppolReceipt>`
- `listIncoming(since: Date): Promise<UBLInvoice[]>`
- Pluggable provider (Storecove default, Pagero + Tradeshift behind feature flag)

**Definition of Done:**
- Interface + one provider stub (`NullProvider` for tests)
- Open item §14.12 referenced in README with deferred-to-C4 note

---

## Task 39: [integration/gs1] GS1-128 parser + identifier utils

**Files:**
- Create: `packages/gs1-lib/src/parse.ts`, `packages/gs1-lib/src/types.ts`
- Create: `packages/gs1-lib/tests/parse.test.ts`

**PRD coverage:** §5 Integration stack → GS1 lib [R15] (GS1 General Specs 24.0); §10 GS1-first (GTIN/SSCC/GLN/GRAI/GDTI)

**Steps:**
- [ ] Step 1: Failing test — `parse("01090311234567893103001750")` returns `{ "01": "09031123456789", "3103": "001750" }` + decoded `gtin`, `netWeightKg`.
- [ ] Step 2: Run (FAIL)
- [ ] Step 3: Implement parser respecting fixed-length + FNC1 variable-length AIs 01/10/17/21/37 + netweight/dates.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- AI 01/10/17/21/37 covered by tests (one per PRD §2 UNIVERSAL example)
- Shared between backend + frontend (no Node-only deps)

---

## Task 40: [docs/regulatory] Regulatory roadmap artifact

**Files:**
- Create: `docs/regulatory/README.md`, `docs/regulatory/FSMA-204.md`, `docs/regulatory/EUDR.md`, `docs/regulatory/PEPPOL.md`, `docs/regulatory/EU-ViDA.md`, `docs/regulatory/BRCGS-v10.md`, `docs/regulatory/EU-FIC-1169-2011.md`, `docs/regulatory/PL-KSeF.md`
- Modify: `README.md`

**PRD coverage:** §11 Cross-cutting → Regulatory roadmap first-class artifact; full table of deadlines; §14 open item #14

**Outline (per file):**
- Regulation + source URL (from §15 external standards)
- Enforcement date (reproduced from §11 table)
- Impacted modules (01-NPD, 11-SHIPPING, 08-PRODUCTION, etc.)
- Current status + quarterly review cadence
- Owner + next review date

**Definition of Done:**
- All 7 regulations from §11 table have their own file
- Quarterly-review tracker in `docs/regulatory/README.md`
- Linked from root README

---

## Task 41: [docs/user-guide] Out-of-scope policy doc

**Files:**
- Create: `docs/conventions/OUT-OF-SCOPE.md`
- Modify: `README.md`

**PRD coverage:** §11 Out-of-scope Monopilot [R8] — GL/AP/AR, HR, CRM, Custom dev, On-prem, Blockchain, Autonomous LLM agents

**Outline:**
- 7 out-of-scope items with rationale and "use instead" pointer (D365/Xero/Comarch, dedicated HR, external CRM, etc.)
- Review cadence: annually OR on PRD v-bump

**Definition of Done:**
- File committed, linked from README
- Each of the 7 items has a one-line "what we do instead" note

---

## Task 42: [docs/user-guide] Build posture + DR policy doc

**Files:**
- Create: `docs/conventions/BUILD-POSTURE.md`

**PRD coverage:** §11 Build posture (no DDL in request path, app-role tests, index audit per release, drift detection, 18k PR token cap); §13 Niefunkcjonalne (DR quarterly)

**Outline:**
- 5 build-posture rules with automated-enforcement pointer
- DR documented + tested quarterly — template DR runbook
- Index audit checklist per release

**Definition of Done:**
- File committed
- Each rule links to the enforcement mechanism (Task 6 / 14 / 15 / 24)

---

## Task 43: [docs/adr] Candidate ADR stubs R1-R15 (one file each)

**Files:**
- Create: `docs/adr/candidates/R01-outbox-event-first.md` … `docs/adr/candidates/R15-gs1-first-identifiers.md` (15 files)
- Modify: `docs/adr/README.md`

**PRD coverage:** §12 Candidate ADRs z Research (R1-R15)

**Outline per file:**
- Title (from §12 table)
- Marker (from §12 table)
- Source § (from §12)
- Status: Candidate — promote to active ADR during Phase B.2 or C
- 3-5 bullet summary (not full ADR — will be expanded per promotion)

**Definition of Done:**
- 15 candidate stubs exist
- Index in `docs/adr/README.md` separates Active from Candidate
- Each links to MES-TRENDS-2026.md section

---

## Task 44: [docs/adr] Pre-Phase-D ADR review tracker (ADR-001..019)

**Files:**
- Create: `docs/adr/_review/pre-phase-d-audit.md`

**PRD coverage:** §12 Pre-Phase-D ADRs deferred review; §14 open item #13

**Outline:**
- Table with columns: ADR # / Title / Verdict (Active | Supersede | Renumber | Deprecate) / Owner / Target session
- Flagged collisions called out per PRD: ADR-002 BOM Snapshot, ADR-003/013 Multi-Tenancy, ADR-006 Scanner-First, ADR-008 Audit Trail
- Schedule: "Phase C start (preferably)" per §12

**Definition of Done:**
- All 18 legacy ADRs in the tracker with "Verdict TBD — review in Phase C kickoff" BUT phase + owner filled (exempt from no-TBD rule since this is a review-scheduling doc, not a design doc — noted in the file)
- Linked from ADR index

---

## Task 45: [docs/user-guide] Open items register

**Files:**
- Create: `docs/conventions/OPEN-ITEMS.md`

**PRD coverage:** §14 (all 16 open items + new ones)

**Outline:**
- Table: item # / title / source § / phase / owner / status / last reviewed
- Items 1-8 (Phase D EVOLVING carry-forward)
- Items 9-12 (Research §10.3)
- Items 13-16 (Phase B.1 new)
- Process — review each Phase kickoff; close or re-schedule

**Definition of Done:**
- All 16 PRD §14 items present
- Cross-linked from relevant ADRs (Task 43/44) and from FOUNDATION-PRD §14

---

## Task 46: [test/harness] RLS cross-tenant leak test fixture

**Files:**
- Create: `tests/_fixtures/multi_tenant.ts`
- Create: `tests/rls/leak_crosscheck.test.ts`

**PRD coverage:** §13 Niefunkcjonalne → "RLS policy coverage 100% business tables"; §5 Testing → app-role only

**Steps:**
- [ ] Step 1: Failing test — iterate every business table (via `pg_tables WHERE schemaname='public'`), insert 1 row as tenant A, connect as tenant B app-role, assert SELECT count = 0.
- [ ] Step 2: Run (FAIL until all tables have RLS)
- [ ] Step 3: Ensure Tasks 21, 22, 25, 31, 34, 35, 36 migrations enable RLS on every business table.
- [ ] Step 4: Run (PASS)
- [ ] Step 5: Commit

**Definition of Done:**
- Test auto-discovers new tables (no manual list)
- Runs in CI on every PR
- Failure message identifies the specific table missing RLS

---

## Task 47: [test/harness] Acceptance harness for Phase B close criteria

**Files:**
- Create: `tests/acceptance/phase_b1_close.test.ts`

**PRD coverage:** §13 Architektoniczne close criteria (6 principles alignment, marker discipline 100%, cross-refs to reality docs 100%)

**Steps:**
- [ ] Step 1: Failing test — walk PRD files, call marker-lint (Task 6), assert exit 0; walk every PRD fragment mentioning reality, assert `_meta/reality-sources/**` hyperlink present.
- [ ] Step 2: Run (FAIL initially — expected until B.2 ships)
- [ ] Step 3: Harness + fixtures + CI job that runs but is non-gating until B.2 (allow-fail flag).
- [ ] Step 4: Run (PASS once B.2 lands; at B.1 close we expect FOUNDATION-only green)
- [ ] Step 5: Commit

**Definition of Done:**
- Harness runs per-PRD and aggregates a single JSON report
- Report consumable by dashboard (future)

---

## End of plan

Task count: 47. Coverage audit in `_meta/plans/2026-04-21-00-foundation-coverage.md`.
