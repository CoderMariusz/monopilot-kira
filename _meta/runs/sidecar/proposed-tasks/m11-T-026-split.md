# PROPOSED REFINEMENT — 11-shipping T-026 split (RMA compound task)

**Type:** split one task into three. **Priority:** MED. **Finding:** S-2.

## Problem
T-026 = "RMA schema + Server Actions + rma_list_page (SHIP-026)" bundles schema + API + UI into a single task with 13 scope files. This breaks the module's own atomic norm (every other epic splits T1-schema / T2-api / T3-ui). A single checkpoint failure blocks the whole RMA epic; reviewer context exceeds budget.

## Proposed split
- **T-026a (T1-schema):** `rma_requests` + `rma_lines` schema + RLS + Drizzle + retention. Deps: T-001, T-006, T-018.
- **T-026b (T2-api):** RMA Server Actions (create, approve, receive via scanner, disposition restock/scrap/quality_hold, close). Cross-writes: 05-WH `create_lp` (restock), 08-PROD `waste_categories` (scrap), 09-QA `create_hold` (quality_hold). Deps: T-026a + those xdeps.
- **T-026c (T3-ui):** `rma_list_page` (SHIP-026) + disposition modal. Deps: T-026b. Prototype anchor required.

## Notes
- Preserve all original ACs, distributed across the three tasks.
- Keep RMA `reason_code` → `rma_reason_codes` ref table (02-SETTINGS §8) dep on T-026b.
- Renumber downstream or use a/b/c suffixes per repo convention.
