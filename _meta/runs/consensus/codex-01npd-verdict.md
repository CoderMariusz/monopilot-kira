VERDICT: BLOCK

**P0 Findings**
- `apps/web/app/(npd)/fa/actions/update-fa-cell.ts:282` / `packages/db/migrations/144-npd-legacy-closeout.sql:6`  
  `updateFaCell` inserts outbox event `fa.edit`, but the latest recreated `outbox_events_event_type_check` in migration 144 omits `fa.edit`. Migration 141 had added it at `packages/db/migrations/141-update-fa-cell-reset-built.sql:28`, then 143/144 dropped it from the allowed union. On a fully migrated DB, normal FG cell edits will fail at the outbox insert. Fix with a new migration restoring `fa.edit` to the final check constraint and add a regression against migrations 001→latest, not only isolated T-009.

**P1 Findings**
- `packages/outbox/src/events.enum.ts:1` / `packages/outbox/src/event-types.ts:7`  
  Event source lists diverge: `event-types.ts` includes `fa.edit`, while `events.enum.ts` does not. Given the project rule that event enums are source-of-truth locks, add canonical enum coverage for `fa.edit` and route raw string constants through the shared type where practical.

**Gap Assessment**
The 11 gaps are acceptable as deferrals: D365 builder/export/wizard/UI/parity x9 are explicitly user-deferred pending PRD field mappings, and Sensory schema/UI x2 are cross-module items owned by `03-technical`. I did not find evidence that a non-gap task was intentionally reclassified as a gap.

**Checks Summary**
Wave0 spot checks were mostly clean: sampled NPD migrations use `org_id`, forced RLS, and `app.current_org_id()`; no NPD `tenant_id` business-scope leakage or `current_setting('app.tenant_id')` in migrations 075-146. Costing/formulation/nutrition storage and core computations use `numeric`/decimal strings rather than floats. Migration 144 treats `pilot_wo_id` as a soft UUID link, with no FK to `work_order`; the read-only existence check is not ownership. UI evidence exists across representative NPD tasks, and raw `<select>`/direct Radix imports did not show in implementation files, only comments/tests.

I did not rerun the full build/test suite per the requested method.