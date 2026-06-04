# PROPOSED TASK STUB — site_id universal-column strategy + operational_tables registry (D-1)

> Proposal only. Not added to any manifest/STATUS. Gated on human DECISION D-1.
> Dominant blocker for 14-multi-site; touches 00-foundation + every module 04–15.
> Supersedes/extends prior `plan-site-id-policy.md` with a concrete recommendation.

## Problem (verified live 2026-06-04)
- `docs/prd/14-MULTI-SITE-PRD.md` §6.4 (L239) + D-MS-1 (L282) and `13-MAINTENANCE-PRD.md` §6.3 (L171)
  assume every operational table already carries `site_id UUID NULL` "from Foundation day 1".
- Built reality: **140 migrations, 0 contain `site_id`** (`grep -rl site_id packages/db/migrations/`=0);
  `00-FOUNDATION-PRD` defers multi-site to Phase C/D; no foundation task adds site_id; built modules
  01-npd + 02-settings have none.
- `14-multi-site/tasks/T-030.json` retrofits via "ALTER + backfill **21 operational tables**" — a HARDCODED
  list. 14 is built #14 (after 04–13). Each of 04–13 adds operational tables; the fixed list goes stale →
  silent multi-site RLS gaps (cross-site leakage) that pass tests (tests only check the 21 listed tables).
- T-030 is itself internally inconsistent: title/ACs say "21", body says "20", list has 21.

## RECOMMENDATION: (A) day-1 rule + checked-in `operational_tables` registry, with T-030 made registry-driven.
Pure option B (catalog query) still needs a classification artifact to tell operational from master — so A and B
converge on building the registry. 04–13 mostly unbuilt → adding `site_id UUID NULL` at creation is one line now
vs an error-prone bulk ALTER later. Only 01-npd + 02-settings need retrofit.

## Proposed scope
1. CLAUDE.md hard rule: *every new operational (transaction/event) table ships `site_id UUID NULL`
   (FK to sites deferred until sites exists) and registers in the `operational_tables` registry.*
   Update skills `MON-multi-tenant-site` + `MON-t1-schema`.
2. Create SSOT registry `_meta/operational-tables.json` (mirrored to a seed/DB table) classifying every table
   operational vs master + its site_id status; each module's T1-schema task must update it.
3. Retrofit `site_id UUID NULL` onto already-built 01-npd + 02-settings operational tables (small migrations 150+).
4. Rewrite `14-multi-site/tasks/T-030.json` to iterate the registry (not a fixed list); add a drift-check AC:
   registry == pg_catalog operational tables (fail-closed if any operational table missing site_id).
5. Clarify production_shifts (D-MS-9) site-scoping owner (currently orphaned: PRD §9.7 says 14-a, T-030 excludes it).

## Acceptance
- One SSOT for "which tables are site-scoped"; 14 activation provably covers 100% of operational tables.
- No operational table can be added without a recorded site_id decision (CI guard on registry vs pg_catalog).

## Risk tier: high (RLS / multi-tenant correctness). Cross-provider review.
## Cross-module: 00-foundation, 14-multi-site, every module adding operational tables (04–15).
</content>
