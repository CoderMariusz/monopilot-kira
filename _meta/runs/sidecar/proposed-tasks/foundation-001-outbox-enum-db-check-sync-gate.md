# PROPOSED TASK — foundation-001: Outbox enum↔DB-CHECK sync gate

**Type:** T4-wiring-test (+ small T1-schema/contract follow-up)
**Module:** 00-foundation
**Priority:** P1
**Evidence:** `_meta/runs/sidecar/reports/foundation-audit.md` §P1

## Why
`packages/outbox/src/events.enum.ts` (`ALL_EVENTS`, 50 events) is the declared
"single source of truth" but the DB CHECK `outbox_events_event_type_check`
(migration 147) holds **82** events. 32 DB-only events are emitted by live
01-npd/02-settings/03-technical code; the foundation consumer's
`normalizeEventType` throws on every one of them. There is NO test asserting the
two are in sync — `events.test.ts` only checks the enum against a frozen literal
of itself. T-122 `check:drift` catches DDL drift, not this semantic divergence.

## Scope (rough)
- Add a DB-gated test (`RLS_LIVE_TESTS`-style opt-in, real Postgres) that:
  - reads the live `outbox_events_event_type_check` allowed-value set, and
  - asserts `dbCheckSet ⊆ (ALL_EVENTS ∪ LegacyEventAlias targets)` AND
    `(ALL_EVENTS ∪ alias values) ⊆ dbCheckSet` (bidirectional).
- Make this the canonical "source-of-truth lock" (the existing self-referential
  assertion in `events.test.ts` is misleadingly named).
- Wire into CI alongside `check:drift` so it blocks merges.

## Acceptance
- Test FAILS today (proves non-vacuous) listing the 32 missing + `fg.edit`.
- After foundation-003 reconciliation, test passes.
- Adding an event to a migration CHECK without updating the enum (or vice-versa)
  turns CI red.

## Decision dependency
Human decision #1 (enum-authoritative vs DB-authoritative) sets whether the test
*generates* the CHECK from the enum or *validates* the enum against the CHECK.
