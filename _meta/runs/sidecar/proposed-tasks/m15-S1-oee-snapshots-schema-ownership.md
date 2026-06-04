# PROPOSED STUB — m15-S1 (15-oee): Move oee_snapshots schema ALTER+RLS to producer (sidecar F-5)

**Severity:** Medium — canonical-owner boundary.
**Type:** Fix (ownership reassignment). Confirms + resolves sidecar F-5.

## Problem (evidence — F-5 CONFIRMED)
- `_meta/atomic-tasks/15-oee/tasks/T-002.json` implementation contract:
  - step 1: `ALTER TABLE oee_snapshots ADD COLUMN IF NOT EXISTS site_id UUID;` +
    `CREATE INDEX idx_oee_site_line_time ON oee_snapshots(site_id, line_id, snapshot_minute DESC);`
  - step 2: **adds/replaces RLS policies** on `oee_snapshots` if they reference `current_setting()`.
- `oee_snapshots` is **created and owned by 08-production T-008** (PRD §9.9; D-OEE-1).
  CLAUDE.md hard rule + D-OEE-1: "oee_snapshots written ONLY by 08-production; 15-oee is
  READ-ONLY consumer."
- The DATA contract is honored: T-002 has 4 red-lines + AC#1 forbidding any
  INSERT/UPDATE/DELETE path from 15-OEE. The crossing is purely **schema/DDL ownership**:
  a consumer module altering + re-policying a producer-owned table.
- It IS PRD-authorized: `docs/prd/15-OEE-PRD.md §9.1` lines 497-499 literally assign the
  site_id ALTER+index to "15-OEE scope" (REC-L1). So this is a PRD-vs-canonical-owner tension.

## Proposed resolution (preferred)
1. Move the `site_id` column + `idx_oee_site_line_time` index + any RLS policy correction into
   **08-production's** migration (the table owner ships ALL schema of its own table, including
   the REC-L1 site_id day-1).
2. Reduce 15-oee/T-002 to: (a) a pre-flight assertion that the column + index exist (fail fast
   citing 08-production if not), and (b) the read-only Drizzle Select schema
   `packages/db/src/schema/oee/snapshots.ts` (no Insert export).
3. Keep all existing read-only red-lines.

## Alternative (if PRD §9.1 ownership is kept)
- Explicitly document the exception in 08-production/STATUS.md, and add a guard test asserting
  15-OEE's DB role never holds INSERT/UPDATE/DELETE grant on `oee_snapshots`.

## Acceptance
- `oee_snapshots` schema (incl. site_id + index + RLS) is owned by exactly one migration, and
  that migration belongs to 08-production; OR the documented exception + grant-guard test exists.
- No 15-OEE task writes DATA to oee_snapshots (already true: T-006/T-007 are read-only MVs with
  explicit red-lines).

## Note
- T-002 is hard-blocked anyway: 08-production T-008 (oee_snapshots CREATE) is ⛔ MISSING.
  Resolving ownership now (before 08-production ships) is the cheapest moment.

READ-ONLY proposal.
