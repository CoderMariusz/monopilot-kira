# PROPOSED TASK — foundation-002: Harden outbox cron consumer against poison-pill

**Type:** T2-api (route handler hardening) + T4 test
**Module:** 00-foundation
**Priority:** P1 (P0 if the cron route is the live production consumer)
**Evidence:** `_meta/runs/sidecar/reports/foundation-audit.md` §P1

## Why
`apps/web/app/api/internal/cron/outbox/route.ts` `runOnce()` (lines 85-115)
calls `normalizeEventType(row.event_type)` with no per-row try/catch. An
un-normalizable `event_type` (currently 32 live values not in the TS enum)
throws and aborts the whole batch. Because the poll is
`WHERE consumed_at IS NULL ORDER BY org_id, created_at LIMIT 100`, the throwing
row is re-read first on every run → permanent head-of-line block (queue outage).
The `apps/worker` consumer already has per-row try/catch + DLQ (T-112); the cron
route does not.

## Scope (rough)
- Wrap each row's normalize+publish+mark-consumed in a try/catch.
- On a normalize/publish failure: log structured error (event_type, id, org_id),
  increment `attempts` and route to `outbox_dead_letter` at maxAttempts (reuse
  the T-112 attempts/DLQ columns + helpers so cron and worker behave identically)
  — do NOT abort the batch and do NOT leave the row to head-of-line-block.
- Keep at-least-once semantics (only mark consumed after successful publish).

## Acceptance
- Unit/integration test: a batch containing one unknown event_type + several
  valid ones processes all valid rows and quarantines the unknown one (no batch
  abort, no head-of-line block on re-run).
- Behavior matches `apps/worker/src/jobs/outbox-consumer.ts`.

## Note
This is defense-in-depth and should land even after foundation-001/003 fix the
drift, so the queue can never be poisoned by a future enum/CHECK mismatch.
