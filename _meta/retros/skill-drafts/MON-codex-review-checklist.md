---
name: MON-codex-review-checklist
description: Review checklist for Codex/Opus cross-provider review waves in MonoPilot Kira. Covers diff-scoped blocker severity, Vitest .ts/.tsx config routing, literal/test co-updates, and SQL PREPARE/execution of actual query text.
tags:
  - monopilot
  - codex
  - review
  - quality-gates
  - vitest
  - sql
---

# MON-codex-review-checklist

## Purpose

Use this checklist during Codex and Opus review waves. It complements `.claude/agents/kira-codex-review.md`, `docs/workflow/02-QUALITY-GATES.md`, and the layer skills. The aim is to catch real regressions earlier while avoiding false `[BLOCKER]` findings for pre-existing issues not introduced by the diff.

## Required Inputs

- Task JSON, especially `acceptance_criteria`, `risk_red_lines`, `scope_files`, and dependencies.
- Relevant `MON-*` skill files.
- The actual diff against the integration branch.
- Real test command output, not claimed output.

## Diff-Scoped Blocker Rule

Before assigning `BLOCKER`, answer all three:

1. Did this diff introduce the issue?
2. Did this diff expand or make reachable a pre-existing issue?
3. Does this diff now fail a required gate that previously passed?

If all three are no, report the issue as pre-existing residual risk or a follow-up, not a blocker for this PR.

Use:

```bash
git diff -- <path>
git diff <base>...HEAD -- <path>
```

Severity guide:
- `BLOCKER`: introduced regression, broken acceptance criterion, security/data-loss risk, deploy gate failure, or newly reachable invariant violation.
- `HIGH`: likely production bug in changed code, but not necessarily data-loss/security.
- `MEDIUM`: correctness gap, missing edge test, or brittle behavior in changed code.
- `FOLLOW-UP`: pre-existing issue not made worse by this diff.

## Review Order

1. Read the task contract.
2. Read relevant skills.
3. Inspect `git diff` before scanning unrelated files.
4. Map changed files to acceptance criteria.
5. Run or verify the exact required tests.
6. Only then scan surrounding code for context.

Do not start from a broad grep and turn unrelated historical issues into blockers.

## Vitest `.ts` vs `.tsx` Config Rule

In `apps/web`, test extension determines the intended config:

- Server Action, route-handler, pure utility, DB-adapter tests: `.test.ts`, `vitest.config.ts`.
- UI/RTL/component tests: `.test.tsx`, `vitest.ui.config.ts`.

Correct UI command:

```bash
node node_modules/vitest/vitest.mjs run --config vitest.ui.config.ts <path.test.tsx>
```

Server-action tests should not be created as `.tsx`, and should not have redundant `.tsx` wrappers. If a test fails with parse/config errors, verify the config before blaming implementation code.

## Test Co-Update Rule

Any literal changed in production code can be a test contract. This includes:
- currency codes such as `EUR` or `GBP`,
- table names,
- event types,
- permission strings,
- role slugs,
- route paths,
- status enums,
- user-visible labels,
- error codes.

Review action:

```bash
rg "OLD_LITERAL|NEW_LITERAL" apps packages _meta
```

If tests or snapshots assert the old literal, they must be updated in the same change unless the task explicitly preserves backward compatibility. A lane instruction like "do not touch tests" does not override a changed asserted contract.

## SQL Review Rule: Test The Actual Query

Review the SQL text that ships, not a reconstructed query.

For SQL embedded in TypeScript:
- copy the exact template literal after parameter placeholders are understood,
- avoid "simplifying" joins or aliases during review,
- run `PREPARE` where possible to catch syntax, casts, table names, and function calls,
- execute against a minimal fixture when cardinality or aggregation is the risk.

Required SQL checks by pattern:

- Aggregates plus joins: name the grain of each CTE and prove many-side joins cannot multiply metrics.
- `INSERT ... SELECT ... ON CONFLICT`: prove the source query is deduped on the exact conflict key, especially after normalization.
- RLS-sensitive queries: verify `org_id` scoping and `app.current_org_id()` behavior.
- Dynamic identifiers: verify they are enum-bound or hardcoded from a safe map, never interpolated from raw input.

## T2 Transaction Review

For every Server Action using `withOrgContext`:

1. Find the first write.
2. Inspect all branches after that point.
3. A `return { ok: false }` after the first write commits unless an outer helper throws. Require throw-to-rollback or validate-before-write.
4. Check helper functions for their own DB connections/pools.
5. Require a negative test proving no partial row/outbox/audit remains.

## Migration Review

For any migration diff:

- Is every changed migration file new? If not, check whether it was already applied.
- Never accept edits to applied migration files; require a forward migration or restoration.
- Local build is not evidence for migration safety.
- Verify the Vercel `@monopilot/db migrate` gate and Supabase `schema_migrations.checksum` state after push.

## Finding Format

Use the project finding shape:

```text
{severity, file:line, claim, suggested-fix}
```

Make the claim diff-scoped:

```text
{severity: "BLOCKER", file: "apps/web/...", line: 123, claim: "This change adds a post-write `{ ok:false }` branch inside withOrgContext, so the earlier insert commits on failure.", suggested-fix: "Move the validation before the insert or throw a rollback-domain error and map it outside the transaction."}
```

For pre-existing risks:

```text
{severity: "FOLLOW-UP", file: "apps/web/...", line: 45, claim: "Pre-existing pattern: this file has a risky server-action export, but this diff did not introduce or make it reachable.", suggested-fix: "Schedule cleanup separately; do not block this PR unless the build now fails."}
```

## Verdict Rules

`PASS` requires:
- acceptance criteria satisfied,
- required tests run with correct configs,
- no unresolved blocker/high findings introduced by the diff,
- migration/live deploy gates checked where applicable.

`FAIL` requires:
- at least one blocker/high introduced or made reachable by the diff,
- missing required test evidence,
- wrong test config producing misleading evidence,
- migration checksum/deploy state unresolved for migration-bearing changes.
