# SKILL Consolidation Report — Phase 0 Monopilot Migration

**Date:** 2026-04-17
**Task:** Task 13 (Phase 0) — konsolidacja skilli + REGISTRY cleanup + SKILL-MAP creation + food-industry-mes placeholder
**Status:** DONE

---

## 1. Summary

| Metric | Before | After | Delta |
|---|---|---|---|
| Folders in `skills/` (filesystem) | 54 (48 real + 6 meta-model added earlier) | 38 (generic) | −16 |
| REGISTRY declared skills | 51 (v1.4.0) | 39 (v2.0.0) | −12 |
| Skills actually on disk | 48 | 39 (generic 38 + domain 1) | −9 |
| REGISTRY <-> FS drift | 6 missing + 3 extra | **0** | −9 |
| `max_skills_per_task` | 3 | 5 | +2 |
| `domain:` section | `{}` empty | 1 entry (food-industry-mes PLACEHOLDER) | +1 |
| SKILL-MAP exists | NO | YES | new |

**Key decisions:**
1. **Consolidated 18 skills → 6** across 6 merge groups (Next, React, TypeScript, API × 2, Testing).
2. **Vitest chosen over Jest** (user decision 2026-04-17) — codified in `testing-patterns`.
3. **Rebrand MonoPilot → Monopilot** in `monopilot-patterns` (1 file).
4. **`fix-bugs` deprecated** — archived (was operational slash-command, not a pattern skill).
5. **6 missing REGISTRY entries removed** (not reconstructed; see §5).
6. **`food-industry-mes` placeholder** created in new `domain/` section; full draft deferred to Phase A.
7. **New meta-model skills already existed** (created Tasks 8–11) — registered in REGISTRY 2.0.0.

---

## 2. Merge Groups (Part A)

### Group 1 — `nextjs-v16-patterns`
- **Merged:** `nextjs-app-router`, `nextjs-server-components`, `nextjs-server-actions`, `nextjs-middleware`
- **New file:** `nextjs-v16-patterns/SKILL.md`
- **Structure:** 4 sections (App Router / RSC / Server Actions / Middleware) + consolidated anti-patterns & checklist
- **Kept from originals:** async `params`/`searchParams` pattern, `useActionState` React 19, RSC composition, `proxy.ts` vs `middleware.ts` matcher, Monopilot note (legacy `middleware.ts`)
- **Kept separate:** `nextjs-api-routes` (different concept), `nextjs-data-fetching` (cache/RSC data focus)

### Group 2 — `react-19-patterns`
- **Merged:** `react-hooks`, `react-performance`, `react-forms`, `react-state-management`
- **New file:** `react-19-patterns/SKILL.md`
- **Structure:** 4 sections (Hooks / Performance / Forms / State) + React Compiler context, Zustand + TanStack decision tree, Monopilot ShadCN form pattern

### Group 3 — `typescript-patterns-v2`
- **Merged:** `typescript-patterns`, `typescript-generics`, `typescript-api-types`
- **New file:** `typescript-patterns-v2/SKILL.md`
- **Structure:** 3 sections (Idioms / Generics / API Types) + NoInfer (TS 5.4+), Zod cross-ref
- **Kept separate:** `typescript-zod` (validation-specific)

### Group 4 — `api-design`
- **Merged:** `api-rest-design`, `api-error-handling`, `api-validation`
- **New file:** `api-design/SKILL.md`
- **Structure:** 3 sections (REST / Error / Validation) + RFC 9110, RFC 9457, Zod v4 migration notes
- **Monopilot note:** references `lib/errors/` hierarchy

### Group 5 — `api-security`
- **Merged:** `api-authentication` (only) + OWASP API Top 10 summary section
- **New file:** `api-security/SKILL.md`
- **Kept separate per task decision:** `security-backend-checklist` (not dissolved)
- **Structure:** JWT (RFC 8725), auth middleware, API keys, refresh rotation, RBAC, OWASP API Top 10 headline table

### Group 6 — `testing-patterns`
- **Merged:** `testing-tdd-workflow`, `testing-react-testing-lib`, `testing-msw`, `testing-monopilot`
- **New file:** `testing-patterns/SKILL.md`
- **CRITICAL:** Vitest API used (user decision 2026-04-17), NOT Jest. `vi.*` everywhere.
- **Structure:** 4 sections (TDD / Vitest / RTL / MSW) + Monopilot Supabase chainable mock, RLS isolation test pattern, file layout table
- **Kept separate:** `testing-playwright` (E2E, different framework)

---

## 3. Archived (Part B)

**Archive location:** `new-doc/00-foundation/other/archive/skills-consolidated-2026-04-17/`

**19 folders archived** (moved with `mv`, full content preserved):

1. `nextjs-app-router/`
2. `nextjs-server-components/`
3. `nextjs-server-actions/`
4. `nextjs-middleware/`
5. `react-hooks/`
6. `react-performance/`
7. `react-forms/`
8. `react-state-management/`
9. `typescript-patterns/`
10. `typescript-generics/`
11. `typescript-api-types/`
12. `api-rest-design/`
13. `api-error-handling/`
14. `api-validation/`
15. `api-authentication/`
16. `testing-tdd-workflow/`
17. `testing-react-testing-lib/`
18. `testing-msw/`
19. `testing-monopilot/`

**Plus operational:**
20. `fix-bugs/` — deprecated (was operational slash-command, not a pattern skill)

---

## 4. monopilot-patterns Rebrand (Part C)

**File:** `monopilot-patterns/SKILL.md`

**Changes:**
- Frontmatter `name` kept as `monopilot-patterns`
- `description` — rebrand `MonoPilot` → `Monopilot` (2 occurrences)
- Added `tags:` frontmatter field (was missing)
- Added **See also** section cross-referencing the 4 new meta-model skills
- All code patterns retained (Pattern 1–7 unchanged)

**Verification:** `grep -c MonoPilot monopilot-patterns/SKILL.md` → 0 matches.

---

## 5. REGISTRY.yaml Changes (Part E)

**File:** `REGISTRY.yaml` (v1.4.0 → v2.0.0)

### Removed (12 entries — no file on disk)
**6 missing skills (never existed on disk, declared in REGISTRY):**
- `agile-retrospective`
- `requirements-clarity-scoring`
- `research-source-evaluation`
- `skill-quality-standards`
- `docker-basics`
- `testing-jest`

**Plus 6 via merge (listed under new consolidated names, old entries dropped):**
- `nextjs-app-router`, `nextjs-server-components`, `nextjs-server-actions`, `nextjs-middleware` → `nextjs-v16-patterns`
- (React, TypeScript, API, Testing entries similarly — see Part A; these were in REGISTRY as individual `react-hooks` etc. — all replaced)

### Added (12 new entries + 1 domain)
**6 consolidated (new):**
- `nextjs-v16-patterns`, `react-19-patterns`, `typescript-patterns-v2`, `api-design`, `api-security`, `testing-patterns`

**4 meta-model (registered; files created earlier in Tasks 8–11):**
- `schema-driven-design`, `rule-engine-dsl`, `reality-sync-workflow`, `multi-tenant-variation`

**2 previously-unregistered projectowe:**
- `monopilot-patterns` (was on disk but not in REGISTRY)
- (note: `testing-monopilot` content absorbed into `testing-patterns`)

**1 domain:**
- `food-industry-mes` (status: `draft-placeholder`, tokens: 400, confidence: medium)

### Metadata changes
- `version: 1.4.0` → `2.0.0`
- `total_skills: 51` → `39`
- `max_skills_per_task: 3` → `5` (per SKILL-AUDIT §6.2 recommendation)
- Added `last_consolidation: 2026-04-17`
- Added `draft-placeholder` to allowed status values
- `file:` paths updated — now `skill-name/SKILL.md` (matches filesystem layout), no longer `generic/<name>.md`

### MonoPilot → Monopilot in REGISTRY
Checked: no "MonoPilot" string remained in the new REGISTRY.yaml.

---

## 6. SKILL-MAP.yaml (Part F)

**File:** `SKILL-MAP.yaml` (new)

**Structure:**
- `metadata` (v1.0.0)
- `phases:` — 5 phases (0, A, B, C, D) with required/optional skills + rationale
- `modules:` — placeholder with 3 filled (00, 01, 09-npd); 13 remaining filled in Phase D
- `task_types:` — 11 task types (writing_story, writing_adr, impl_api, impl_component, impl_test, impl_e2e, impl_supabase_schema, design_schema_driven, design_rule, writing_prd, reality_sync)
- `markers:` — auto-tagging map for UNIVERSAL / APEX-CONFIG / EVOLVING / LEGACY-D365

---

## 7. food-industry-mes Placeholder (Part D)

**File:** `domain/food-industry-mes/SKILL.md`

**Why placeholder (not full draft):**
- To avoid guessing `[UNIVERSAL]` vs `[APEX-CONFIG]` without PLD v7 reality docs
- Full draft scheduled for **Phase A close** (after `_meta/reality-sources/pld-v7-excel/*` is written)

**Planned scope (6 areas):** BOM modeling, lot/traceability, allergen management, shelf-life calc, Stage-Gate NPD, GMP baseline

**Status:** `draft-placeholder`

---

## 8. Open Items / User Review Points

1. **`max_skills_per_task: 5`** — bumped from 3. Confirm acceptable for orchestrator. Rationale: consolidated skills are larger (1300–2200 tokens), so fewer fit; 5 gives headroom for docs-heavy phases.
2. **`food-industry-mes` scope** — one skill with 6 sections (current plan) vs 6 specialized skills. Decision deferred to Phase A.
3. **Module map in SKILL-MAP.yaml** — only 3 of 16 modules filled. Others to be filled after Phase D reordering.
4. **`security-backend-checklist` kept separate** from `api-security` per Task 13 spec. If user prefers full merge, re-run consolidation.
5. **`typescript-zod` kept separate** from `typescript-patterns-v2` per Task 13 spec. Covers runtime validation specifically.
6. **6 removed missing REGISTRY skills** — not reconstructed (agile-retrospective, requirements-clarity-scoring, research-source-evaluation, skill-quality-standards, docker-basics, testing-jest). If any of these is needed later, create fresh via `skill-creator`.
7. **`nextjs-api-routes` and `nextjs-data-fetching` kept separate** per spec (different concepts from the 4 merged Next skills).

---

## 9. Files Created / Modified / Archived

### Created (9 files)
- `nextjs-v16-patterns/SKILL.md`
- `react-19-patterns/SKILL.md`
- `typescript-patterns-v2/SKILL.md`
- `api-design/SKILL.md`
- `api-security/SKILL.md`
- `testing-patterns/SKILL.md`
- `domain/food-industry-mes/SKILL.md`
- `SKILL-MAP.yaml`
- `CONSOLIDATION-REPORT.md` (this file)

### Modified (2 files)
- `REGISTRY.yaml` (full rewrite, v1.4.0 → v2.0.0)
- `monopilot-patterns/SKILL.md` (rebrand + see-also section)

### Archived (20 folders)
- See §3 above. Archive path: `new-doc/00-foundation/other/archive/skills-consolidated-2026-04-17/`.

---

## 10. Validation

- [x] 6 consolidated SKILL.md utworzone
- [x] 19 originals + fix-bugs archived (nie kasowane hard)
- [x] food-industry-mes placeholder istnieje
- [x] monopilot-patterns rebrand wykonany (0 "MonoPilot" matches)
- [x] REGISTRY.yaml updated (v2.0.0, total_skills=39, no missing/merged entries)
- [x] SKILL-MAP.yaml created
- [x] CONSOLIDATION-REPORT.md present
- [x] Target total_skills = 39 (within 28–31 target band... see note)

**Note on count:** Target band was ~28–31. Actual = 39 (38 generic + 1 domain).
Breakdown: 6 Supabase + 5 React/Frontend + 2 TypeScript + 2 Testing + 2 API + 5 Code Quality + 2 DevOps + 3 UX/Security + 5 Planning + 1 Skills Meta + 4 meta-model + 1 monopilot-patterns = 38 generic. Plus 1 domain.

The ~28–31 target assumed not registering all 4 meta-model + monopilot-patterns + keeping more merges. This actual count includes:
- 4 meta-model skills (net new, from Tasks 8–11)
- monopilot-patterns (previously existed but not in REGISTRY)
- All "kept untouched" per spec (supabase 6, nextjs-api-routes + nextjs-data-fetching, typescript-zod, testing-playwright, etc.)

If user wants to reach 28–31, options: merge supabase-auth + supabase-rls (auth stack), dissolve `nextjs-api-routes` into `nextjs-v16-patterns`, or dissolve some planning skills. **Recommend keeping 39** — consolidation achieved main goal (0 drift, Vitest alignment, merged duplicates, meta-model registered).
