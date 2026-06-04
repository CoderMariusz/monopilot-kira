# PROPOSED TASK STUB — 08-production: harden NPD pilot_wo_id ↔ work_order contract

> Proposal only. Not added to any manifest/STATUS.
> Addresses finding F-4 (npd pilot_wo_id soft-link has no 08-production owning task).

## Problem (evidence)
- npd mig 144 added `pilot_wo_id uuid` as a **soft link (plain uuid, no FK)** plus
  `grant select on public.work_order to app_user`, with the comment
  *"08-production owns work_order writes/RLS"* (`packages/db/migrations/144-npd-legacy-closeout.sql` lines 104, 127, 165–167).
- No 08-production task formalizes this: `grep -l pilot_wo 08-production/tasks/*.json` = empty.
- 08 already has the analogous pattern for holds (`09-quality T-064` consume-gate contract pin) but not for the
  npd pilot/trial WO link.

## Proposed scope (08-production, after work_order table exists)
- Decide & implement: keep `pilot_wo_id` as soft UUID link, OR add a real FK
  `npd_legacy_closeout.pilot_wo_id → work_order(id)` once `work_order` exists.
- 08-production **owns** the `grant select on public.work_order to app_user` (move the grant out of npd mig 144's
  scope into a production migration; npd grant becomes a no-op / superseded).
- Provide a read adapter / contract pin so npd can resolve pilot/trial WO state without writing to work_order.

## Acceptance
- Single owner (08) for work_order grants + RLS; npd pilot link is either a verified FK or a documented soft link
  with an existence-check contract (not "ownership"); regression test the npd→pilot WO read.

## Risk tier: high (schema/RLS + cross-owner grant). Cross-provider review.
## Cross-module: 01-npd is the consumer; canonical owner of work_order = 08-production.
## Blocked by: 08-production work_order table.
