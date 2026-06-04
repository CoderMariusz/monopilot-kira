# PROPOSED REFINEMENT — 11-shipping T-029 split + prerequisite verification (D365 outbox/dispatcher)

**Type:** split + prerequisite check. **Priority:** HIGH. **Finding:** S-3.

## Problem
T-029 = "shipping_outbox_events + shipping_push_dlq schema + D365 SalesOrder confirm push dispatcher (apps/worker)" is ONE task (risk_tier=high) that bundles schema with the dispatcher worker. STATUS.md confirms `apps/worker`, `packages/integrations-d365`, AND `packages/events` **do not exist yet**. This is the heaviest infra gap in the module and a single failure point for INTEGRATIONS stage 3.

## Proposed split
- **T-029a (T1-schema):** `shipping_outbox_events` + `shipping_push_dlq` (clone 08-PROD §9.10-9.11 schema, reuse shared `outbox_status_enum` from 08-PROD). Deps: T-006, T-018; xdep 08-production (enum owner).
- **T-029b (T2-api / worker):** D365 SalesOrder confirm push dispatcher in `apps/worker` — poll → R15 adapter map (`@monopilot/d365-shipping-adapter`) → POST OData → retry 5min/30min/2h/12h/24h → DLQ after 5. Deps: T-029a, T-020 (confirmShipment enqueues).

## CRITICAL prerequisite verification (do before scheduling either)
The manifest declares these as cross-module deps but the packages are ABSENT today:
- **00-foundation T-111** (`apps/worker` JobRegistry) — REQUIRED before T-029b.
- **00-foundation T-112** (`@monopilot/outbox`) — REQUIRED before T-029a/b AND before 11 T-013 (which emits `shipping.quality_hold.overridden`).
- `packages/events` (`packages/events/src/shipping.ts`) — referenced by T-013/T-029; confirm an owner task exists (likely 00-foundation or a 11-shipping events-bootstrap line). **If no task creates `packages/events`, add one.**

## Acceptance
- T-029a/b scheduled strictly after 00-foundation T-111 + T-112 are DONE.
- A task owns creation of `packages/events` + `packages/integrations-d365` (or they are confirmed in 00-foundation scope).
- Dispatcher reuses the 08-PROD shared `@monopilot/d365-outbox-dispatcher` worker (routes by `target_system`), not a fork.
