# Decision — 01-npd migration renumbering (075+)

Date: 2026-06-03
Context: run-module 01-npd.

## Problem
The 01-npd atomic tasks were decomposed on 2026-05-11 referencing 4-digit migration
filenames (e.g. `packages/db/migrations/0010_product_and_fa_view.sql`). Since then the
02-settings module advanced the migration chain to `074-*` using the **3-digit
`NNN-kebab.sql`** convention. The hardcoded `0010_*` names in the task JSON `scope_files`
are stale and would (a) use the wrong numbering format and (b) sort before existing
migrations, breaking apply order.

## Decision
Migration filenames for 01-npd are **reassigned to continue the 3-digit chain from 075**,
allocated in dependency order. The task JSON `scope_files` migration name is overridden by
this table (worktree protocol "filename verbatim from task JSON" is superseded for 01-npd
by this decision because the JSON value is stale).

| Task | original (stale) | assigned |
|---|---|---|
| T-001 | 0010_product_and_fa_view.sql | 075-product-and-fa-view.sql |
| T-002 | (prod_detail) | 076-prod-detail.sql |
| T-003 | (DeptColumns) | 077-reference-dept-columns.sql |
| T-004 | (ManufacturingOperations) | 078-reference-manufacturing-operations.sql |
| T-005 | (PackSizes/Templates/LineTypes) | 079-reference-lookups-npd.sql |
| T-006 | (RolePermissions) | 080-reference-role-permissions.sql |
| T-030 | (brief) | 081-brief-tables.sql |
| T-036 | (Allergens) | 082-allergens-tables.sql |
| T-041 | (D365_Constants) | 083-reference-d365-constants.sql |
| T-049 | (AlertThresholds + d365_import_cache) | 084-alert-thresholds-import-cache.sql |
| T-054 | (npd_projects + gates) | 085-npd-projects-gates.sql |
| T-069 | (nutrition_profiles) | 086-nutrition-profiles.sql |
| T-070 | (costing_breakdowns) | 087-costing-breakdowns.sql |
| T-080 | (risks + V18) | 088-risks.sql |
| T-083 | (compliance_docs) | 089-compliance-docs.sql |

Later waves (T-037 fa_allergen_overrides, T-063 formulations, etc.) get numbers allocated
when their wave is scheduled, always = current-highest + 1, respecting intra-wave dep order.

## Consequence
- Parallel schema worktrees are safe to write concurrently because each owns a **distinct
  pre-allocated migration number** (no collision on filename). The migrate+test GATE is still
  serialized against the single local Postgres.
- The 4-digit `0010_*`-style references inside task prompts are interpreted as "the product/fa
  migration", not a literal filename.
