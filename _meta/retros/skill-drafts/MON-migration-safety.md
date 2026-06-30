---
name: MON-migration-safety
description: Use when creating, reviewing, or deploying MonoPilot Kira database migrations. Covers checksum immutability, Vercel migrate-gate behavior, drop-after-deploy ordering, drift detection through schema_migrations.checksum, and post-push deploy verification.
tags:
  - monopilot
  - migrations
  - supabase
  - vercel
  - checksum
  - gate-5
---

# MON-migration-safety

## Purpose

This skill is a focused safety overlay for `MON-t1-schema`. Use it before changing anything under `packages/db/migrations/`, reviewing a migration PR, or declaring a migration-bearing branch deploy-safe.

The key distinction: local app build is not the migration truth. Vercel runs `pnpm --filter @monopilot/db migrate` against Supabase, and that gate can fail even when `pnpm build`, `pnpm typecheck`, and local Vitest are green.

## When To Use

- Creating a new SQL migration.
- Reviewing any diff that touches `packages/db/migrations/*.sql`.
- Fixing a deploy failure from `@monopilot/db migrate`.
- Renaming, dropping, or replacing a database object.
- Checking schema drift between the repo and Supabase.

## Required Reading

1. `.claude/skills/MON-t1-schema/SKILL.md`
2. `docs/workflow/02-QUALITY-GATES.md` Gate 5 and recurring live-bug class 4
3. The task JSON `scope_files`; use the exact migration filename from the task when provided
4. The current `packages/db/migrations/` head and the deployed `public.schema_migrations` state

## Hard Rules

### Never Edit Applied Migrations

Once a migration has been applied to any shared Supabase environment, its file content is immutable. This includes comments and whitespace. The migration runner records a checksum; editing the file changes the checksum and causes a deploy-time mismatch.

Wrong:

```text
Edit packages/db/migrations/123-existing-file.sql to fix a comment or tweak DDL.
```

Right:

```text
Add a new forward migration with the next valid filename, and leave the applied file untouched.
```

If an applied migration was edited accidentally, do not keep layering fixes blindly. Check the deployed `schema_migrations.checksum` state and decide whether the correct remediation is to restore the file content or create a forward migration.

### Vercel Migrate Gate Is Not Local Build

Local Next build does not prove migration safety. Vercel runs the DB package migration gate against Supabase:

```bash
pnpm --filter @monopilot/db migrate
```

That deploy gate catches:
- checksum mismatches,
- missing privileges on Supabase,
- non-superuser migration failures,
- drift between repo migrations and `schema_migrations`,
- SQL that local test Postgres accepted but Supabase rejects.

Do not close migration work as safe based only on local build/typecheck.

### Migration Filename Discipline

Follow the runner contract from `MON-t1-schema`:

```text
^(\d{3})-[a-z0-9-]+\.sql$
```

Use the exact filename listed in the task JSON `scope_files` when present. Do not invent a different number. If no exact filename is provided, choose the next valid 3-digit migration number after checking current head.

Invalid names can sort wrong or be skipped.

### Drop-After-Deploy Ordering

For destructive changes, use expand/contract ordering:

1. Add the new column/table/view/function while keeping the old object.
2. Deploy app code that reads/writes the new shape and no longer depends on the old object.
3. Verify Vercel preview and Supabase state.
4. Only then add a later migration that drops the old object.

Never combine "move app to new object" and "drop old object" in one risky deploy unless the task explicitly proves all live callers have already stopped using the old object.

## Drift Detection

Use Supabase or a DB connection to inspect the migration ledger:

```sql
select filename, checksum, applied_at
from public.schema_migrations
order by filename;
```

At minimum, verify:
- the highest deployed filename matches repo expectation,
- newly added migration filenames are present after deploy,
- the checksum for an applied file has not changed unexpectedly,
- `to_regclass('public.<table>')` or view/function checks prove the new object exists.

For suspected checksum drift, compare the repository file content against the checksum recorded in the target environment. Do not assume local test DB state matches Supabase.

## Review Checklist

- Did this diff touch an existing migration file? If yes, determine whether it is already applied. If applied, block and require a forward migration or file restoration.
- Is every new migration filename valid and task-approved?
- Does the migration avoid local-superuser-only operations such as forbidden owner changes, unguarded extensions, or `LEAKPROOF`?
- If the migration changes permissions/RLS, does it use `org_id` and `app.current_org_id()`?
- If it drops or renames objects, is the drop ordered after app deploy compatibility?
- Is `schema_migrations.checksum` verification part of closeout?
- Has the Vercel deploy state been checked after push?

## Closeout Evidence

Migration closeout must include:
- changed migration filenames,
- whether each file is new or previously applied,
- local migration/test command output if run,
- Vercel deploy status and migrate-step result after push,
- Supabase `schema_migrations` verification,
- drift checks for the created/altered/dropped objects.

## Common Failure Patterns

- Local build green, Vercel migrate red due to checksum mismatch.
- A comment edit in an applied SQL file breaks deploy.
- A 4-digit or underscore migration name is skipped by the runner.
- Destructive migration drops an object still used by the currently deployed app.
- Local Postgres accepts SQL that Supabase rejects due to non-superuser privileges.
