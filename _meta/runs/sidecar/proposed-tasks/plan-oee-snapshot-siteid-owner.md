# PROPOSED TASK STUB — relocate oee_snapshots.site_id ownership off 15-oee

> Proposal only. Not added to any manifest/STATUS. Gated on DECISION D-1 (site_id strategy).
> Addresses finding F-5 (consumer 15-oee alters producer-owned oee_snapshots).

## Problem (evidence)
- Canonical rule (CLAUDE.md / D-OEE-1): `oee_snapshots` is written **only by 08-production**; 15-oee is read-only.
- Producer owned correctly: `08-production/tasks/T-008.json` (oee_snapshots table + V-PROD-10 + RLS).
- But `15-oee/tasks/T-002.json` = "**oee_snapshots site_id extension** + read-only consumer indexes" — the
  *consumer* issues `ALTER TABLE oee_snapshots ADD site_id`. A consumer altering the producer's table breaks
  the canonical-owner discipline and tangles with the broader site_id retrofit (F-1).

## Proposed scope (depends on D-1 outcome)
- Move the `oee_snapshots.site_id` column addition to its rightful owner:
  - **08-production** (producer) if site_id columns are added by the owning module per D-1(A), OR
  - **14-multi-site** activation migration if site_id is retrofit centrally per D-1(B)/T-030.
- Reduce `15-oee/tasks/T-002.json` to read-only consumer indexes + typed mirror only (drop the ALTER).

## Acceptance
- 15-oee performs zero DDL on oee_snapshots; the site_id column is owned by 08 or 14; RLS still org+site scoped.

## Risk tier: high (canonical owner + RLS). Cross-provider review.
## Cross-module: 08-production (producer), 14-multi-site (activation), 15-oee (consumer to de-scope).
