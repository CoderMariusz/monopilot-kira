# Atomic-grain validation gate

Use this reference whenever you generate tasks OR re-process an existing task list. The goal is that every emitted task fits a single agent's focus and context window.

## T1-T5 taxonomy

Every atomic task has exactly ONE type. Mixing types is the primary sign that a task needs splitting.

| Type | Scope | Context | Time | Deliverable |
|------|-------|---------|------|-------------|
| **T1 Schema** | DB migration + schema + TS types + Zod | ~30-50k | 30-60 min | Migration file, `schema.ts`, Zod types, seed factory update |
| **T2 API** | Server action / route + input validation + RBAC guard + audit + outbox event | ~40-60k | 60-90 min | `app/api/<feature>/route.ts` or `actions/<feature>.ts` + unit test |
| **T3 UI** | React component/modal + RHF + Zod resolver + shadcn/Radix + loading/error states | ~50-80k | 60-120 min | `components/<feature>/*.tsx` + Storybook entry (opt) |
| **T4 Wiring+Test** | UI ↔ API ↔ DB integration + E2E Playwright + integration test | ~60-100k | 60-90 min | `e2e/<feature>.spec.ts` + `integration/<feature>.test.ts` |
| **T5 Seed/Fixture** (opt) | Dedicated seed data or test fixture | ~20-40k | ~30 min | `seed/<feature>-seed.ts` + named snapshot |

Not every feature needs all 5 types. Backend-only → no T3. Config-only → no T2. UI-heavy wizard step → may be all T3+T4.

Doc/spec tasks (category `docs/*`) are exempt from T1-T5 typing and from the 4-check gate below. They still need a measurable done criterion (see SKILL.md Step 5 doc exemption).

## §11.3 — 4-check atomicity test

Run this gate BEFORE emitting a task AND whenever validating an existing list.

| # | Check | ✅ Atomic | ❌ Feature-level |
|---|-------|-----------|-------------------|
| 1 | One deliverable? | "Create migration for `users` table" | "Setup auth module" |
| 2 | ≤5 implementation steps? | 3 steps | 10+ steps |
| 3 | Context estimate <100k? | ~40k | ~200k |
| 4 | One type (T1/T2/T3/T4/T5)? | Only migration (T1) | Migration + endpoint + UI together |

**Decision:**
- **4/4 pass** → atomic, keep as-is
- **2–3/4 pass** → borderline, split recommended (required if >3 implementation steps)
- **0–1/4 pass** → feature-level, MUST split into T1-T5 children

When re-processing an existing list, emit a classification table before any mutation:

```markdown
| Task ID | Classification | Recommended split | Reason |
|---------|----------------|-------------------|--------|
| T-20    | atomic         | keep              | 4/4 pass |
| T-21    | borderline     | split into 3      | large T1 + 7 steps |
| T-29    | feature-level  | split into T1+T2+T3+T4 | mixes MFA + switcher + SIEM |
```

Ask the user to approve splits before regenerating the store.

## Context budget audit

Estimate input tokens before dispatching a task:

```
PRD reference (filtered section only)       ~10-30k
Guide / ADR snippets                        ~5k
Neighboring code read-only                  ~10-30k
Test fixtures + seed                        ~5-10k
Task metadata + implementation notes        ~5k
---- Total input                            ~35-80k
Headroom (agent work + tool calls)          ~20-65k
==== Hard ceiling                           <100k
```

If estimate exceeds 80k OR >5 implementation steps OR >3 files to modify → **split**.

## Common split recipes

- **T1+T2 combo** → split into T1 (migration + types) then T2 (route using those types). T2 depends on T1.
- **Broad T2** → split into T2a (route handler + happy path) + T2b (validation + RBAC + audit + outbox).
- **T3 with many states** → split by sub-flow (create modal vs. edit modal; list vs. detail).
- **T4 too broad** → split per user journey (create path, then edit path as separate T4s).
- **Schema + seed bundled** → split T1 (migration/schema) from T5 (seed factory).

## Parent/child traceability

When splitting existing ID `T-N` into children:
- Preserve the parent ID in each child's metadata as `parent_feature: T-N`
- Use the naming convention in `references/atomic-task-template.md` for child IDs
- In the coverage audit, show both the old ID column and the new child IDs so the mapping is visible
