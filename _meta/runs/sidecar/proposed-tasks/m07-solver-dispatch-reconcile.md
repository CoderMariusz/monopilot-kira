# PROPOSED TASK — 07-planning-ext: reconcile solver dispatch to canonical outbox/worker

**Suggested ID:** 07-T-062 (or amend T-012 + T-021 in place)
**Type:** T2-api (architecture reconciliation)
**Risk tier:** high (durability/consistency + diverges from foundation primitive)
**Closes:** audit finding 07-F3

## Problem
The scheduler async path diverges from the system's canonical async mechanism:
- T-012 dispatches via `NOTIFY 'scheduler_solver'` (Postgres LISTEN/NOTIFY).
- T-021 builds `app/listener.py` doing Postgres LISTEN.

But 00-FOUNDATION already shipped the canonical durable async path: **outbox + `apps/worker` + queue** (T-111 ✅ DONE, T-112 ✅ DONE, with DLQ at attempts≥5, idempotency, retry). LISTEN/NOTIFY:
1. does not survive Vercel serverless invocation boundaries (no persistent listener in the web tier);
2. has no DLQ / retry / delivery-durability story (T-024 covers run-level idempotency, not delivery durability);
3. creates a second, parallel async mechanism the rest of the system does not use.

## Title
T-062 — Reconcile scheduler→solver dispatch onto the canonical outbox/worker primitive (or document an explicit exception)

## Scope (pick one, document the decision as an ADR note)
**Option A (preferred):** dispatch via outbox event `scheduler.run.requested` → `apps/worker` consumer (T-111/T-112) calls the deployed solver over authenticated HTTP (T-061). Gives DLQ/retry/idempotency for free. Update T-012 to enqueue an outbox event instead of `NOTIFY`; retire/repurpose `listener.py` (T-021) to a plain HTTP `/solve` handler.
**Option B (only if A rejected):** keep LISTEN/NOTIFY but add a documented exception note explaining how durability/retry/DLQ are handled, plus a recovery sweep for missed notifications, plus confirmation the listener runs in a persistent process (not Vercel).

## Acceptance criteria
- Decision recorded (ADR-style) with rationale referencing T-111/T-112.
- If Option A: a scheduler run requested while the solver is down is retried and eventually delivered (or DLQ'd after N attempts) — integration test.
- No reliance on a persistent LISTEN connection inside Vercel web functions.
- run-level idempotency (T-024) preserved end-to-end.

## Dependencies
- Local: T-012, T-021, T-024.
- Cross-module: 00-FOUNDATION T-111/T-112 ✅ DONE; pairs with m07-solver-hosting (T-061).

## Red lines
- Do NOT introduce a third async mechanism.
- Preserve at-least-once + idempotent-replay semantics established by the outbox.
