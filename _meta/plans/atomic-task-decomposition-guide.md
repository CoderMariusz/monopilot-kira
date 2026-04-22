---
title: Atomic Task Decomposition Guide — Monopilot Phase E
version: 1.0
date: 2026-04-22
status: Helper B — input dla prd-decomposition-hybrid skill na drugiej maszynie
scope: Foundation impl (00-a..i), Settings-a carveout, NPD-a..e, downstream modules
related:
  - _meta/plans/2026-04-22-phase-e-kickoff-plan.md (the plan)
  - _foundation/decisions/ADR-032-settings-minimum-carveout-for-npd-unlock.md (helper A)
---

# Atomic Task Decomposition Guide

**Cel:** ustalić **jeden wzorzec** rozbijania features na atomic tasks, który `prd-decomposition-hybrid` skill wykorzysta do generacji backlogu. Guide = input skilla, nie output.

**Filozofia (user directive 2026-04-22):**
- Zadanie = **4-5 elementów max**
- Context budget = **<100k tokens per task**
- Więcej wywołań, mniejszy scope każde
- "1 UI modal" > "zbuduj NPD"
- Agent focus = quality + debugability + rollback safety

---

## §1 — Atomic task types (T1-T5)

Każdy feature rozbija się na **do 5 atomic tasks typu T1-T5**. Nie wszystkie features potrzebują wszystkich 5 — backend-only feature nie ma T3 (UI), config-only feature nie ma T2 (API).

| Type | Scope | Context budget | Est time | Deliverable |
|---|---|---|---|---|
| **T1 Schema** | DB schema + migration + Zod schema + TS types | ~30-50k | 30-60 min | Drizzle migration file + `schema.ts` + Zod types + seed factory update |
| **T2 API** | Server Action / route handler + input validation + error path + RBAC guard + audit + outbox event | ~40-60k | 60-90 min | `app/api/<feature>/route.ts` or `actions/<feature>.ts` + unit test |
| **T3 UI** | React component/modal + RHF + Zod resolver + shadcn/Radix primitives + loading/error states | ~50-80k | 60-120 min | `components/<feature>/*.tsx` + Storybook entry (optional) |
| **T4 Wiring + Test** | End-to-end integration (UI ↔ API ↔ DB) + E2E Playwright test + integration test | ~60-100k | 60-90 min | `e2e/<feature>.spec.ts` + `integration/<feature>.test.ts` + PR-ready |
| **T5 Seed/Fixture** (opt) | Dedykowany seed data lub test fixture | ~20-40k | 30 min | `seed/<feature>-seed.ts` + named snapshot |

**Reguła:** jeśli task przekracza context budget lub time estimate, **split again**. T2 może się rozpaść na T2a (route handler) + T2b (validation + guard).

---

## §2 — Feature → atomic tasks mapping pattern

### §2.1 Backend-only feature (np. 00-f Outbox worker)

Feature: "Outbox pg-boss worker + DLQ"

| Atomic | Type | Scope |
|---|---|---|
| T-00f-001 | T1 | Migration: `outbox_events` table + indexes + DLQ table + Drizzle types |
| T-00f-002 | T2 | `insertOutboxEvent(tenantId, eventType, aggregateType, aggregateId, payload)` helper + input validation + transactional insert |
| T-00f-003 | T2 | pg-boss worker config + event consumer registration + retry logic (5 attempts: 5min/30min/2h/12h/24h) |
| T-00f-004 | T4 | Integration test: emit event → worker processes → marks consumed + DLQ test (5 fails → DLQ) |
| T-00f-005 | T5 | Seed: synthetic events dla testów (100 rows) |

**5 atomic tasks**, każdy <100k context.

### §2.2 Full-stack feature (np. 02-SET-a Orgs CRUD)

Feature: "Organizations CRUD (create/edit/delete) z admin UI"

| Atomic | Type | Scope |
|---|---|---|
| T-02SETa-001 | T1 | Migration: `organizations` table + `org_security_policies` FK + Drizzle types + Zod schema |
| T-02SETa-002 | T2 | Server Action `createOrg(input)` + RBAC guard (owner only) + audit emit + outbox event `org.created` |
| T-02SETa-003 | T2 | Server Action `updateOrg`, `deleteOrg` (soft delete) z audit + outbox |
| T-02SETa-004 | T3 | `<OrgsList />` + `<OrgForm />` modal (create/edit) z shadcn Dialog + RHF + Zod resolver |
| T-02SETa-005 | T4 | E2E Playwright: owner tworzy org → widzi na liście → edituje → soft-delete → audit log zawiera 3 entries |

**5 atomic tasks**. Zauważ że T2 rozdzielone na dwa (create vs update/delete) bo create ma dodatkowy seed security_policies step.

### §2.3 Config-only feature (np. Module toggles seed)

Feature: "Seed 15 modules + 1 org_modules row per existing org"

| Atomic | Type | Scope |
|---|---|---|
| T-02SETa-011 | T1 | Migration: `modules` (15 rows static) + `organization_modules` table |
| T-02SETa-012 | T5 | Seed: 15 modules hardcoded + backfill `organization_modules` dla każdego existing org (all enabled=false default) |
| T-02SETa-013 | T4 | Integration test: middleware blokuje request jeśli `organization_modules.enabled=false` |

**3 atomic tasks** (nie wszystkie 5 needed).

### §2.4 UI-heavy feature (np. Schema wizard Step 1)

Feature: "Schema wizard Step 1: field type picker"

| Atomic | Type | Scope |
|---|---|---|
| T-02SETb-021 | T3 | `<FieldTypePicker />` — radio group z 6 options (string/number/date/enum/formula/relation) + live preview of form control |
| T-02SETb-022 | T3 | `<WizardStep />` layout + navigation (back/next/cancel) + state machine (draft state in URL or Zustand) |
| T-02SETb-023 | T4 | E2E: user klika "Add column" → step 1 renders → picks "string" → next button unlocks |

**3 atomic tasks** — tylko T3+T4, bo step 1 sam w sobie nie robi write operacji (finalny save w kolejnym step).

---

## §3 — Naming convention

`T-<sub-module>-<NNN>` where:
- `<sub-module>` = `00a`, `00b`, ..., `00i`, `02SETa`, `02SETb`, ..., `01NPDa`, `01NPDb`, ...
- `<NNN>` = 3-digit sequential per sub-module, starting 001

Examples:
- `T-00b-003` (Foundation 00-b, task 3)
- `T-02SETa-015` (Settings-a, task 15)
- `T-01NPDa-042` (NPD-a, task 42)

**Cross-references:** task może cite'ować inny task przez ID (upstream/downstream/parallel).

---

## §4 — Task metadata template (skill output shape)

Każdy atomic task w `pipeline.log.md` musi mieć:

```markdown
## T-<ID> — <short title>

**Type:** T1-schema | T2-api | T3-ui | T4-wiring+test | T5-seed
**Context budget:** ~<N>k tokens
**Est time:** <X> min
**Parent feature:** <feature-id>
**Agent:** any | frontend-specialist | backend-specialist | test-specialist
**Status:** pending | in_progress | blocked | done

### Dependencies
- **Upstream (must be done first):** [T-XXX, T-YYY]
- **Downstream (will consume this):** [T-ZZZ]
- **Parallel (can run concurrently):** [T-AAA, T-BBB]

### GIVEN / WHEN / THEN
**GIVEN** <state preconditions>
**WHEN** <trigger / action>
**THEN** <expected outcomes, observable>

### Implementation (max 5 sub-steps)
1. <step>
2. <step>
3. <step>
4. <step>
5. <step — optional>

### Files
- **Create:** `path/to/new.ts`, `path/to/other.tsx`
- **Modify:** `path/to/existing.ts`

### Test gate
- **Unit:** `vitest path/to/thing.test.ts` — covers: <specific behavior>
- **Integration:** `vitest path/to/thing.integration.test.ts` — covers: <DB / RLS / trigger behavior>
- **E2E:** `playwright e2e/flow.spec.ts` — covers: <user flow>
- **CI gate:** `npm run test:smoke` green

### Rollback
<one-line how to revert jeśli task fails>

### Notes (optional)
<gotchas, edge cases, alternative approaches rozważone>
```

---

## §5 — Dependency graph conventions

**Upstream:** task MUSI być done zanim ten zaczniemy. Hard block.
**Downstream:** task zacznie po tym. Nie blokuje us, ale dobry traceability.
**Parallel:** task może lecieć concurrent w tym samym wall-clock window (różny agent, różny worktree).

**Parallelization rule:** jeśli dwa tasks dzielą pliki do modify → NIE parallel (merge conflict ryzyko). Jeśli tylko create różne → YES parallel.

**Architect owner lock (przed parallel dispatch):**
- `permissions.enum.ts` — centralne definicje RBAC (fa.create, fa.edit, ...)
- `events.enum.ts` — centralne definicje outbox events (fa.created, brief.converted, lp.received, ...)
- `ref-tables.enum.ts` — centralne definicje reference table names
- `migrations/001-baseline.sql` (Foundation 00-b) — baseline schema

Te 4 artefakty blokują **wszystkie downstream atomic tasks** dopóki nie są locked. **Nie dispatchujemy parallel przed ich merge.**

---

## §6 — Agent specialization (optional routing)

Niektóre atomic tasks korzystają z specialized agent:

| Agent | Kiedy użyć | Nie używać dla |
|---|---|---|
| `general-purpose` | T1 schema, T2 API, T5 seed | T3 UI (brak design knowledge), T4 E2E (brak Playwright fluency) |
| `frontend-design:frontend-design` | T3 UI gdy potrzeba design quality (modal z wieloma stanami, wizard) | Plain CRUD lists (overkill) |
| `feature-dev:code-architect` | Pre-atomic: gdy feature za duży na 5 tasks i potrzebuje split | Atomic tasks (za high-level) |
| `Explore` | Discovery: "gdzie używamy `insertOutboxEvent`?" | Writing kod |
| `feature-dev:code-reviewer` | Post-T4: review PR przed merge | Pre-implementation |

**Routing hint w task metadata:** `agent: frontend-design` jeśli atomic wymaga design quality, else `any`.

---

## §7 — Context budget audit (per task)

Skill przed emissją task powinien estymować context:

```
PRD reference tokens (filtered section only)    ~10-30k
This guide snippet + ADR-032                    ~5k
Neighboring code files (read only)              ~10-30k
Test fixtures + seed                            ~5-10k
Task metadata + implementation notes            ~5k
----
Total input budget                              ~35-80k
Headroom                                        ~20-65k
=====================================================
Hard ceiling                                    <100k
```

Jeśli estymacja >80k, **split task**. Dobrym sygnałem za split jest >5 implementation steps lub >3 files to modify.

---

## §8 — Examples: Foundation feature-to-atomic breakdown

Poniżej sample jak Foundation 00-b (Supabase + Drizzle setup) rozkłada się na atomic tasks. Używam tego jako **reference dla skilla** — skill powinien zwrócić podobny shape dla innych sub-modułów.

### Feature: 00-b Supabase + Drizzle scaffolding

| ID | Type | Title | Upstream | Budget | Est |
|---|---|---|---|---|---|
| T-00b-001 | T1 | Supabase project init + env config | T-00a-005 (monorepo done) | 30k | 30 min |
| T-00b-002 | T1 | Drizzle config + first migration (baseline tables: tenants, users, roles) | T-00b-001 | 50k | 60 min |
| T-00b-003 | T2 | Migration runner scripts (up/down) + package.json commands | T-00b-002 | 40k | 45 min |
| T-00b-004 | T5 | Seed factories (Forza baseline: 1 tenant + 3 users + 3 roles) | T-00b-002 | 40k | 45 min |
| T-00b-005 | T4 | Integration test: migrate → seed → query | T-00b-003, T-00b-004 | 60k | 45 min |
| T-00b-006 | T2 | Supabase client singleton + RLS context setter (`setCurrentOrgId`) | T-00b-001 | 40k | 30 min |
| T-00b-007 | T4 | E2E: app boots, connects Supabase, queries empty users table | T-00b-006 | 50k | 30 min |

**7 atomic tasks** dla całego 00-b. Wall-clock jeśli sequential: ~4.5h. Jeśli parallel (T-00b-004, T-00b-006 mogą iść równolegle z T-00b-003): ~3.5h.

**Extrapolating:** 9 Foundation sub-modułów × ~5-8 atomic tasks = **~45-70 atomic tasks dla Foundation** (nie 180 jak wcześniej proponowałem). **User's 47 tasków na drugiej maszynie najprawdopodobniej JEST atomic-grain level**, nie feature level. Rewidowana math:

| Module | Features (old math) | Atomic tasks (actual) |
|---|---|---|
| 00-FOUNDATION | ~47 | ~47-70 (match user's 47) |
| 02-SETTINGS-a | ~15 | ~30-40 |
| 02-SETTINGS b-e | ~35 | ~80-120 |
| 01-NPD a-e | ~50 | ~120-180 |
| **Total pre-Phase-C-impl** | **~147** | **~280-410 atomic tasks** |

Bardziej realistic niż 588. Zgodne z twoim 47 output.

---

## §9 — Skill invocation contract

`prd-decomposition-hybrid` skill na drugiej maszynie dostaje:

**Inputs:**
1. `_meta/plans/2026-04-22-phase-e-kickoff-plan.md` (the plan — what, why, when)
2. `_foundation/decisions/ADR-032-settings-minimum-carveout-for-npd-unlock.md` (helper A — architectural decision)
3. `_meta/plans/atomic-task-decomposition-guide.md` (helper B — this doc, HOW to decompose)
4. PRD źródłowe: `00-FOUNDATION-PRD.md`, `01-NPD-PRD.md`, `02-SETTINGS-PRD.md` (filtered sections only — skill decyduje jakie)
5. User's existing 47 tasks (jeśli feature-level — skill je expanduje; jeśli atomic — skill je valiuje + dopełnia)

**Output:**
- `pipeline.log.md` z listą atomic tasks w shape §4 template
- Dependency graph (markdown diagram lub JSON)
- Suggested parallel dispatch plan per Phase E-0/E-1/E-2

**Skill NIE tworzy:**
- Dodatkowych spec files (cancelled per user directive)
- Tasks o context budget >100k
- Tasks o >5 implementation steps
- Feature-level tasks (chyba że jawnie jako parent_feature metadata dla grupowania)

---

## §10 — Pattern-match dla user's 47 Foundation tasks

Bez widzenia user's output, zakładam że 47 tasków mieści się w shape §4 template. **Po user's review tej guide, skill powinien:**

1. Validate: czy każdy z 47 ma <100k context budget
2. Validate: czy każdy ma ≤5 implementation steps
3. Validate: czy każdy ma dependencies (upstream/downstream) określone
4. Validate: czy każdy ma test gate (unit + integration + E2E)
5. Flag: tasks brakujące seed (T5) gdy feature wymaga dedykowanego seed
6. Flag: tasks łączące T1+T2 (często trzeba split na dwa atomic)

**Feedback loop:** user review flagged tasks → manual split / approve → skill regenerates final `pipeline.log.md`.

---

## §11 — Granularity hierarchy + verification test (clarification 2026-04-22)

### §11.1 Trzy poziomy (NIE dwa)

Częste źródło nieporozumień — hierarchia ma **3 poziomy, nie 2**:

```
Phase (np. Phase E-0 Foundation)
  └─ Sub-module (np. 00-a, 00-b, ..., 00-i)  ← area architektoniczna
       └─ Feature (np. "Supabase project init + env config")  ← coherent capability
            └─ Atomic task (T1-T5)  ← fokus agenta, <100k context
```

**Sub-module ≠ feature.** 00-b Supabase to 1 sub-module zawierający ~1-3 features ("Supabase init", "Drizzle setup", "Seed factories"). Każda feature = 4-5 atomic tasks.

### §11.2 Math formula

**Per sub-module:**
- 1-3 features × 4-5 atomic = **5-15 atomic tasks per sub-module**

**Per Phase E-0 (Foundation, 9 sub-modules):**
- 9 × (5-15) = **45-135 atomic tasks**
- Realistic middle: **~60-80 atomic tasks**

**Per Phase E-1 (Settings-a, carveout):**
- 3-5 sub-modules × (5-10 atomic) = **15-50 atomic tasks**

**Per Phase E-2 (NPD a-e + Settings b-e parallel):**
- NPD 5 sub-modules × (10-20 atomic) = 50-100 atomic
- Settings b-e 4 sub-modules × (15-25 atomic) = 60-100 atomic
- Total: **~110-200 atomic tasks**

**Total pre-Phase-C-impl: ~200-330 atomic tasks.** Poprzednie "~588" było overshoot, "~435" też. Realistic = **~280 atomic tasks** (zgodne z user's 47 Foundation × ~6 average per sub-module).

### §11.3 Verification test (4 checks per existing task)

Jeśli istniejąca lista N tasków (np. user's 47 Foundation) — weryfikuj każdy task tym testem:

| Check | ✅ Atomic | ❌ Feature-level (wymaga split) |
|---|---|---|
| **Jeden deliverable?** | "Create migration for `users` table" | "Setup auth module" |
| **≤5 implementation steps?** | 3 kroki | 10+ kroków |
| **<100k context estimate?** | ~40k (1 file context + spec) | ~200k (multiple files + specs) |
| **Jeden type (T1/T2/T3/T4/T5)?** | Tylko migration (T1) | Migration + endpoint + UI razem |

**Decyzja:**
- **Wszystkie 4 checks pass** → atomic, keep as-is
- **1-2 checks fail** → borderline, może split (zalecane jeśli >3 steps)
- **3-4 checks fail** → feature-level, MUST split na T1-T5

### §11.4 Skill validation loop

Skill `prd-decomposition-hybrid` przy re-processingu istniejącej listy:

1. **Parse existing tasks** → extract implementation steps, files, budget estimate per task
2. **Apply §11.3 test** → classify każdy task: atomic | borderline | feature
3. **Output table:** `| Task ID | Classification | Recommended split | Reason |`
4. **User review** → approve splits / reject / manual override
5. **Regenerate** → final `pipeline.log.md` z 100% atomic-grain

**Expected outcome dla Foundation 47 tasków:**
- Jeśli 47 = atomic → validate pass, Foundation done w 45-75 range (mid of math §11.2)
- Jeśli 47 = feature-level → split → ~188-235 atomic (each × 4-5 split)
- Jeśli mieszane (niektóre atomic, niektóre feature) → partial split → ~80-150 atomic

### §11.5 Why this matters dla skill design

Skill-creator (user's next step) powinien embeddować §11.3 test JAKO CORE VALIDATION w skill logic. Bez tego testu skill może:
- Produce mix of granularities (chaos w backlog)
- Miss obvious feature-level tasks (które się wydają małe bo short title, ale mają 10 steps)
- Generate tasks >100k context (overflow w agencie → halucynacje)

**§11.3 = gate przed każdym task emission.** Jeśli fail → skill musi auto-split lub flag for user review.

---

## §12 — Prototype reuse pattern dla T3 UI tasks

### §12.1 Context

`design/Monopilot Design System/` zawiera **~48k linii JSX prototypów** (15 modułów, ~200 modals + formy + tabele) — reference dla production UI. Naiwne podejście "Opus czyta prototype + pisze production" = context overflow + drogie.

Lepsza strategia: **Haiku pre-pass labeluje + indeksuje prototypy**, potem T3 UI atomic tasks dostają pre-loaded snippet + translation notes. Haiku ~60x tańszy niż Opus dla rote extraction.

### §12.2 Translation gap (dlaczego labeling ≠ copy)

Prototypy to **nie production code**. Delta per component ~30-40%:

| Prototype | Production |
|---|---|
| `window.Modal` + `Object.assign(window, ...)` globals | `@radix-ui/react-dialog` import |
| Mock data inline | Drizzle query w Server Component parent |
| `useState` local form | RHF + `zodResolver` |
| Brak validation | Zod schema + error states |
| Brak RLS awareness | `setCurrentOrgId` middleware |
| Brak audit/outbox emit | Trigger + `insertOutboxEvent` |
| Brak loading/error | Suspense + error boundaries |
| Hardcoded labels | next-intl keys |

Agent w T3 **translatuje**, nie kopiuje. Speedup realistic: **~50%** vs blank write (30-45 min vs 60-90 min).

### §12.3 Pipeline — 3 fazy

**Phase 0 (one-time, ~4-8h Haiku wall-clock):**
- 15 parallel Haiku agents (1 per module: `npd/`, `settings/`, ..., `oee/`)
- Każdy skanuje swój moduł → emituje `prototype-index-<module>.json` + `translation-notes-<module>.md`
- Master merge: `_meta/prototype-labels/master-index.json`

**Phase 1 (per T3 UI task dispatch):**
- Pre-hook: query `master-index.json` by feature AC → find best-match label → extract JSX snippet (exact line range) → prepend to agent context (~3-8k tokens overhead)
- Opus agent: translates snippet to production stack (~40-60k total context)

**Phase 2 (T4 wiring — separate atomic task):**
- Integrates translated component with Server Action + DB + E2E test
- Ten sam pattern jak każdy T4

### §12.4 prototype-index.json schema

Per entry (one per identifiable reusable component):

```json
{
  "label": "crud_modal_create_fa",
  "file": "design/Monopilot Design System/npd/modals.jsx",
  "lines": "100-220",
  "component_type": "modal",
  "ui_pattern": "crud-form-with-validation",
  "data_domain": "FA",
  "interaction": "create",
  "complexity": "composite",
  "depends_on_prototypes": [
    "_shared/modals.jsx#Modal",
    "_shared/modals.jsx#Field"
  ],
  "translation_notes": [
    "window.Modal → @radix-ui/react-dialog Dialog",
    "Local useState form → useForm + zodResolver",
    "Mock data → Drizzle query w parent Server Component",
    "Add Server Action createFA with RBAC guard fa.create",
    "Emit outbox event fa.created on success",
    "Hardcoded PL labels → next-intl keys (fa.create.title, etc.)"
  ],
  "shadcn_equivalent": [
    "Dialog", "DialogContent", "DialogHeader",
    "Form", "FormField", "FormLabel", "FormControl", "FormMessage",
    "Input", "Select", "Button"
  ],
  "known_bugs": [
    "BL-SHARED-01 (resolved 2026-04-21): hook ordering fixed"
  ],
  "estimated_translation_time_min": 35
}
```

### §12.5 5-wymiarowa taxonomy (Haiku prompt MUST enforce)

Każdy entry labeluje po 5 wymiarach:

| Dimension | Allowed values |
|---|---|
| **component_type** | `modal` / `form` / `table` / `wizard` / `stepper` / `sidebar` / `tabs` / `dashboard-tile` / `page-layout` |
| **ui_pattern** | `crud-form-with-validation` / `search-filter-list` / `detail-view` / `multi-step-wizard` / `dashboard-tile` / `list-with-actions` / `wizard-step` / `bulk-action` / `import-export` |
| **data_domain** | `FA` / `Brief` / `ProdDetail` / `WO` / `LP` / `PO` / `TO` / `Supplier` / `Customer` / `Role` / `Spec` / `BOM` / `Shipment` / `NCR` / `WR` / `MWO` / `QualityHold` / `Allergen` / ... |
| **interaction** | `create` / `edit` / `delete` / `read-only` / `bulk` / `import` / `export` / `approve` / `sign-off` |
| **complexity** | `primitive` (Button, Input, Label) / `composite` (Form, Modal z fields) / `page-level` (Dashboard, List view) |

**Skill-creator note:** prototype-labeling-skill MUSI walidować że każdy entry ma wszystkie 5 wymiarów wypełnione (non-null, z allowed value lista). Missing value → skill flags for manual review.

### §12.6 T3 atomic task template extension

Extend §4 template z 3 nowymi polami gdy T3 ma prototype match:

```markdown
## T-<ID> — <UI component title>
**Type:** T3-ui
**Prototype ref:** crud_modal_create_fa  ← new field
**Translation checklist:**        ← new field
  - [ ] Replace window.Modal → Radix Dialog
  - [ ] Convert useState → useForm + zodResolver
  - [ ] Wire Server Action createFA
  - [ ] Add RBAC guard fa.create
  - [ ] Emit outbox fa.created
  - [ ] Replace labels z next-intl keys
  - [ ] Fix known bug BL-XX (if applicable)
**Shadcn imports:**               ← new field
  - Dialog, DialogContent, DialogHeader
  - Form, FormField, FormLabel, FormControl, FormMessage
  - Input, Select, Button
... (reszta §4 template)
```

Jeśli brak prototype match (np. purely custom pattern) → `prototype_ref: null` + normalna T3 bez pre-load.

### §12.7 Pre-hook logic (skill runtime)

```
on T3 task dispatch:
  if task.prototype_ref:
    load master-index.json
    find entry where label == task.prototype_ref
    extract JSX: readLines(entry.file, entry.lines)
    prepend to agent context:
      - ## Prototype reference (FROM {entry.file}:{entry.lines})
      - ```jsx\n{snippet}\n```
      - ## Translation checklist\n{task.translation_checklist}
      - ## Shadcn equivalents\n{entry.shadcn_equivalent}
      - ## Known bugs to fix\n{entry.known_bugs}
  dispatch agent z Opus
```

Context budget audit: snippet ~3-8k + translation notes ~1-2k + task spec ~3-5k = **~7-15k overhead**, zostaje ~85k dla agent work + PRD + neighboring code. Bezpieczny margin.

### §12.8 Execution plan — Haiku fleet

**Prompt template dla Haiku per module:**

```
You are scanning prototype JSX in design/Monopilot Design System/<module>/.

For each distinct reusable component (modal, form, table, wizard step, etc.):
1. Extract exact file + line range
2. Classify 5 dimensions (per taxonomy §12.5)
3. List depends_on_prototypes (imports from _shared/)
4. Write translation_notes (min 4 bullets, format "prototype → production")
5. Map to shadcn_equivalent primitives
6. Cross-reference BACKLOG.md for known_bugs affecting this component
7. Emit JSON entry per schema §12.4

Output: prototype-index-<module>.json + translation-notes-<module>.md

Do NOT write production code. Only extract + classify + describe translations.
```

**Parallel dispatch:** 15 agents (1 per module), 4-8 godzin wall-clock total. Output ~150-250 labeled entries (Warehouse 16 modals + NPD ~15 + Planning 15 + Shipping 21 + ... all summed).

**Deliverable folder:** `_meta/prototype-labels/`
- `master-index.json` (merged from all modules)
- `prototype-index-<module>.json` × 15
- `translation-notes-<module>.md` × 15
- `README.md` (how to query + how to update when prototypes change)

### §12.9 Known bugs integration

Cross-reference **`design/Monopilot Design System/BACKLOG.md`** per module:
- BL-SHARED-01 (resolved 2026-04-21) — hook ordering fix
- BL-SCN-01..08 scanner follow-ups
- BL-WH-01..06 warehouse (cycle count, ZPL render)
- BL-OEE-01..09, BL-RPT-01..10, BL-MS-01..07, BL-QA-01..07
- BL-SHIP-01..14, BL-FIN-01..08, BL-MAINT-01..07, BL-PEXT-01..09

Każdy prototype entry **flag bugs affecting its code** w `known_bugs[]` field. T3 translation checklist auto-includes "fix BL-XX" step. **Nie kopiujemy bugów z prototypów do produkcji.**

### §12.10 Maintenance

Gdy prototype zmienia się (user iteruje design):
1. Re-run Haiku dla tego 1 module (1 agent, ~30 min)
2. Merge updated module index do master
3. Flag T3 tasks które referują changed labels → manual review czy translation_checklist wymaga update

Daily job nie potrzebny — prototype changes są rare w late Phase E/beyond. Reactive maintenance wystarczy.

### §12.11 Experimental validation (recommended przed full 15-module rollout)

**Pilot 1 module:** `warehouse/` (baseline per `project_monopilot_prototypes.md` memory — 3611 lines, 16 modals, reference pattern).

**Ocena pilot:**
- Jakość labeli (covered 5 dimensions? accurate?)
- Translation notes actionable? (agent faktycznie to zużyje?)
- JSON schema adequate?
- Wall-clock realne (ok dla 1 module)?

Jeśli pilot ok → full 15-module parallel dispatch. Jeśli problemy → tune Haiku prompt + schema, re-run pilot.

### §12.12 Integration z prd-decomposition-hybrid skill

Skill przy emissji T3 tasks:
1. **Parse feature AC** (what UI this task builds)
2. **Query master-index.json** z fuzzy match (component_type + data_domain + interaction)
3. Jeśli match confidence >70% → populate `prototype_ref`, `translation_checklist`, `shadcn_imports` automatically
4. Jeśli <70% → `prototype_ref: null`, flag manual review w task notes
5. Human approves/overrides w review

Skill-creator note: prototype-label-lookup to osobny skill, NIE część prd-decomposition. Dwie skille łańcuchowo: prd-decomposition generuje T3 bez prototype_ref → prototype-linker skill dopina references. Separation pozwala maintainance bez re-generowania całego backlogu.

---

*Atomic Task Decomposition Guide v1.2 — Helper B dla Phase E kickoff. Feeds prd-decomposition-hybrid skill + skill-creator input dla atomicity + prototype-linker skills. Updated 2026-04-22 z granularity hierarchy + prototype reuse pattern.*
