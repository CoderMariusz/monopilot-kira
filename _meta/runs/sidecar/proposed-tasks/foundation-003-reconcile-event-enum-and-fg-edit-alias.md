# PROPOSED TASK — foundation-003: Reconcile events.enum.ts with full event union + fix fg.edit alias/CHECK contradiction

**Type:** T1-schema (migration + enum) 
**Module:** 00-foundation
**Priority:** P1
**Evidence:** `_meta/runs/sidecar/reports/foundation-audit.md` §P1, decisions #1/#2

## Why
Two concrete inconsistencies:
1. `events.enum.ts` `EventType` is missing 32 events that exist in the DB CHECK
   (migration 147) and are emitted by live code → consumer `normalizeEventType`
   throws on them.
2. `LegacyEventAlias` maps `fa.edit → fg.edit`, and `normalizeEventType('fa.edit')`
   returns `'fg.edit'`, but the DB CHECK contains `fa.edit` and NOT `fg.edit`. So
   the canonical alias target is un-insertable; only the raw `fa.edit` works.
   `update-fa-cell.ts:8` currently emits raw `'fa.edit'` (works today) — a latent
   landmine the moment any code emits the "canonical" value.

## Scope (rough) — exact shape depends on human decision #1/#2
Option A (enum authoritative): extend `EventType`/`ALL_EVENTS` to the full 82-event
union (registering the NPD/settings/technical/onboarding/formulation events that
today live only in migrations); update the frozen literal in `events.test.ts`;
then either add `fg.edit` to the DB CHECK or drop the `fa.edit→fg.edit` alias and
keep `fa.edit` canonical.
Option B (DB authoritative): reduce the enum to a generated/validated mirror.

Either way: one foundation migration that makes the DB CHECK and the enum∪aliases
agree, and resolve the fa/fg naming so `normalizeEventType` round-trips to a value
that passes the CHECK.

## Acceptance
- `normalizeEventType(x)` returns a CHECK-valid value for every live emitted event.
- foundation-001's bidirectional sync test passes.
- No `fa.*`/`fg.*` value exists that the enum accepts but the CHECK rejects (or
  vice-versa).

## Cross-module note
This touches the canonical event prefix policy that 01-npd standardized on
(`fa.*` raw). Coordinate with 01-npd sign-off owner — do NOT modify 01-npd files
in this task; only the foundation enum + a foundation migration.
