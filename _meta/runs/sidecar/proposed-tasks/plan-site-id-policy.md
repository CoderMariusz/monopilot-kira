# PROPOSED TASK STUB — site_id universal-column policy + registry

> Proposal only. Not added to any manifest/STATUS. Gated on DECISION D-1.
> Addresses findings F-1 (site_id day-1 assumption false) and F-5 (oee_snapshots site_id owner).

## Problem (evidence)
- `docs/prd/14-MULTI-SITE-PRD.md` §6.4 (line 239) / D-MS-1 (line 282) assume all operational tables
  *already* carry `site_id UUID NULL` from the Foundation phase.
- Built reality: `grep -c site_id packages/db/migrations/* = 0`; `00-foundation` has no site_id task;
  `docs/prd/00-FOUNDATION-PRD.md` line 54 defers multi-site to Phase C/D.
- `14-multi-site/tasks/T-030.json` retrofits via "ALTER + backfill **21 operational tables**" — a hardcoded
  count that will be stale once modules 04–13 add new operational tables.

## Proposed scope (pick per D-1 outcome)
**If D-1 = (A) day-1 rule:**
- Add a hard rule to `CLAUDE.md` + `MON-multi-tenant-site` / `MON-t1-schema` skills:
  *every new operational (transaction/event) table ships `site_id UUID NULL REFERENCES sites(id)`
  (FK deferred until `sites` exists) and registers in an `operational_tables` manifest.*
- Create/seed an `operational_tables` registry (table or checked-in JSON) listing every site-scoped table,
  updated by each module's schema tasks.
- Retrofit-ALTER the already-built operational tables (npd `product`?/`prod_detail`/events, etc. — classify each).

**If D-1 = (B) catalog-driven retrofit:**
- Rewrite `14-multi-site/tasks/T-030.json` to discover site-scoped tables from a registry / catalog query
  instead of a fixed list; add a classification artifact (operational vs master-data) per existing table.

## Acceptance
- A single SSOT for "which tables are site-scoped"; 14-MS activation provably covers 100% of operational tables.
- No operational table can be added without a site_id decision recorded.

## Risk tier: high (RLS / multi-tenant correctness). Cross-provider review.
## Cross-module: touches 00-foundation, 14-multi-site, and every module that adds operational tables (04–15).
