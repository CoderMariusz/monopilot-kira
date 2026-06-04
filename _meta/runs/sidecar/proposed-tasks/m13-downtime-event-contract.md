# PROPOSED TASK STUB — pin the downtime.created event contract (08-production → 13-maintenance)

> Proposal only. Not added to any manifest/STATUS.

## Problem (evidence)
- `13-maintenance/tasks/T-017.json` (auto-MWO from downtime) consumes outbox `downtime.created`. Its red-lines say:
  *"Do not invent a downtime schema if 08-production has not published one — use a minimal local STUB schema and
  escalate to 08-production owner before merging."*
- There is **no task that pins the canonical `downtime.created` Zod payload** (`packages/events/src/downtime.ts`).
  This is the same unowned-contract anti-pattern as F-4 (npd `pilot_wo_id` soft link with no 08 hardening task).
- T-017 needs: `id, equipment_id, severity, reporter_user_id, reason, create_maintenance_task` fields.

## Proposed scope
- Owning module = **08-production** (producer). Add a task to define `packages/events/src/downtime.ts` Zod contract
  + register `downtime.created` in the event catalog (00-foundation T-111 enum).
- 13-maintenance T-017 imports the canonical contract instead of a local stub.
- Mirror the 09-quality T-064 "contract pin" pattern (08 already does this for holds).

## Acceptance
- One canonical `downtime.created` Zod schema in `packages/events`; T-017 imports it; event registered in catalog enum.

## Risk tier: medium (cross-module contract).
## Cross-module: 08-production (owner/producer), 00-foundation (event enum), 13-maintenance (consumer).
</content>
