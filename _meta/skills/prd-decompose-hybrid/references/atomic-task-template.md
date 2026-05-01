# Atomic task template (§4 metadata shape)

Every atomic task in the plan markdown must carry this shape. It gives agents enough to execute without re-reading the PRD and keeps the dependency graph machine-readable.

## Template

```markdown
## T-<ID> — <short title>

**Type:** T1-schema | T2-api | T3-ui | T4-wiring+test | T5-seed       (required)
**Context budget:** ~<N>k tokens                                      (required)
**Est time:** <X> min                                                 (required)
**Parent feature:** <feature slug or parent task ID>                  (required)
**Agent routing:** any | frontend-specialist | backend-specialist | test-specialist  (required)
**Status:** pending | in_progress | blocked | done                    (required)
**Track:** α | β | γ | δ (optional — see references/parallel-dispatch.md)

### Dependencies
- **Upstream (must finish first):** [T-XXX, T-YYY]
- **Downstream (will consume this):** [T-ZZZ]
- **Parallel (can run concurrently):** [T-AAA, T-BBB]

### GIVEN / WHEN / THEN
**GIVEN** <state preconditions>
**WHEN** <trigger / action>
**THEN** <expected observable outcome>

### Implementation (≤5 sub-steps)
1. <step>
2. <step>
3. <step>
4. <step — optional>
5. <step — optional>

### Files
- **Create:** `path/to/new.ts`, `path/to/other.tsx`
- **Modify:** `path/to/existing.ts`
- **Test:** `tests/path/to/thing.test.ts`

### Test gate
- **Unit:** `vitest path/to/thing.test.ts` — covers: <specific behavior>
- **Integration:** `vitest path/to/thing.integration.test.ts` — covers: <DB / RLS / trigger behavior>
- **E2E:** `playwright e2e/flow.spec.ts` — covers: <user flow>
- **CI gate:** `<command>` green

### Rollback
<one-line: how to revert if task fails>

### Notes (optional)
<gotchas, edge cases, alternatives considered>
```

## Naming convention

`T-<sub-module>-<NNN>` where
- `<sub-module>` = short slug matching the PRD sub-module (e.g., `00a`, `00b`, `02SETa`, `01NPDa`)
- `<NNN>` = 3-digit sequential per sub-module, starting at `001`

Examples:
- `T-00b-003` — Foundation 00-b, third atomic task
- `T-02SETa-015` — Settings carveout a, 15th task
- `T-01NPDa-042` — NPD module a, 42nd task

Flat single-namespace IDs (`T-1`, `T-2`, …) remain acceptable for small single-PRD projects without sub-modules. Use sub-module IDs when the corpus has ≥3 distinct modules or ≥~50 tasks, because the prefix makes the backlog scannable.

## Doc/spec task shape

For `docs/*` tasks (no code), replace the `Implementation` / `Files` / `Test gate` sections with:

```markdown
### Done check
- Final output path: `docs/adr/ADR-XXX-<slug>.md`
- Outline (3–8 headings): <list>
- Verifiable by someone other than the author: <check>
```

Everything else in the template (type unused but mark as `docs`, deps, parent_feature, rollback) still applies.

## Test-gate realism

Require unit + integration + E2E only for product slices. Do NOT force E2E on:
- Pure data migrations (T1 alone) — integration test against ephemeral DB is enough
- Pure seed tasks (T5 alone) — "seed produces expected row counts" is enough
- Doc tasks — not applicable

The gate is a floor, not a ceiling. Prefer skipping E2E explicitly ("E2E: N/A — pure migration") over forcing a pantomime test.
