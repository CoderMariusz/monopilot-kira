# PROPOSED TASK STUB — relocate oee_snapshots.site_id ownership off 15-oee (F-5)

> Proposal only. Not added to any manifest/STATUS. Gated on DECISION D-1.
> Re-confirms prior `plan-oee-snapshot-siteid-owner.md`; here as a 14-context stub.

## Problem (evidence)
- Canonical rule (CLAUDE.md / D-OEE-1): `oee_snapshots` written **only by 08-production**; 15-oee read-only.
- Producer owned correctly: `08-production/tasks/T-008.json` (oee_snapshots + V-PROD-10 + RLS).
- `15-oee/tasks/T-002.json` = "oee_snapshots site_id extension + read-only consumer indexes" — the CONSUMER
  issues `ALTER TABLE oee_snapshots ADD site_id`. A consumer altering the producer's table breaks the
  canonical-owner discipline AND tangles with the F-1/D-1 retrofit.
- `14-multi-site/tasks/T-030.json` §9.8 list also includes `oee_snapshots` (1 of 21) — double-ownership risk.

## Proposed scope (depends on D-1 outcome)
- If D-1 = (A) owning-module adds its own site_id: move `oee_snapshots.site_id` to **08-production** (producer).
- If D-1 = (B) central retrofit: keep it solely in **14-multi-site T-030** activation.
- Either way: reduce `15-oee/tasks/T-002.json` to read-only consumer indexes + typed mirror only (drop the ALTER).

## Acceptance
- 15-oee performs ZERO DDL on oee_snapshots; site_id column owned by 08 or 14; RLS org+site scoped; one owner only.

## Risk tier: high (canonical owner + RLS). Cross-provider review.
## Cross-module: 08-production (producer), 14-multi-site (activation), 15-oee (consumer to de-scope).
</content>
