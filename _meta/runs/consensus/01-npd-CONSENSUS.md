# 01-npd — Claude + Codex Consensus Gate

**Date:** 2026-06-04 · **Branch:** kira/long-run · **Module:** 01-npd (New Product Development)

## Outcome: CONSENSUS REACHED ✅ (both sign off)

| Reviewer | Round 1 | Round 2 (after fixes) |
|---|---|---|
| **Claude (Opus)** | SIGN-OFF-WITH-NITS (no P0; 3×P2) | — (no P0 to re-check) |
| **Codex (gpt-5.5)** | **BLOCK** (1×P0, 1×P1) | **SIGN-OFF** (P0+P1 resolved) |

## Round 1 findings + resolution

### P0 (Codex BLOCK) — RESOLVED
**`fa.edit` dropped from the outbox `event_type` CHECK union.** Migration 141 added `fa.edit`
(emitted by `updateFaCell`, the core FG cell-edit Server Action), but migrations 143 & 144
each recreated `outbox_events_event_type_check` with their own cumulative union and silently
omitted it → on a fully-migrated DB every FG cell edit fails the outbox insert (CHECK violation).
Reproduced live on canon (`23514`).
- **Fix:** migration **147-restore-fa-edit-outbox-event.sql** recreates the constraint with the
  full **82-event** union (strict superset of 144's 81 + `fa.edit`). Verified: insert of `fa.edit`
  now accepted; fresh migrate 001→147 clean; Codex confirmed strict-superset (no dropped events).

### P1 (hidden runtime break) — RESOLVED
**`events.enum.ts` had no coverage for `fa.edit`** while `event-types.ts` did. The outbox worker
(`worker.ts:44`) and cron (`route.ts:95`) call `normalizeEventType(row.event_type)` on **every**
row, which THREW `Unknown event type: fa.edit` → fa.edit rows would choke the worker.
- **Fix:** added canonical `FG_EDIT = 'fg.edit'` + `LegacyEventAlias 'fa.edit' → fg.edit`
  (mirrors the existing `fa.created → fg.created` pattern). `normalizeEventType('fa.edit')` → `fg.edit`.
  Source-of-truth tests updated; outbox suite green (19 passed).

### P2 (Claude, non-blocking, recorded follow-ups)
1. The orphaned non-locale `(npd)` route tree still hosts the allergen `_actions`/`_lib` the locale
   tree imports + one stray allergens route page; full removal is a recorded follow-up gap.
2. Migration numbering gaps from reworks (cosmetic; runner orders numerically; 001→147 clean).
3. Nutri-Score fiber/FVN inputs hardcoded 0 (RM schema lacks the columns; revisit with 03-technical).

## Hard-rule checks (both reviewers): PASS
- Wave0 lock: `org_id` not `tenant_id`; RLS via `app.current_org_id()` + ENABLE+FORCE; no `current_setting('app.tenant_id')`.
- Canonical owners: mig 144 treats `work_order` as SOFT uuid link (no hard FK); read-only grant documented for 08-production hand-off.
- Money: costing/nutrition NUMERIC-exact (scaled BigInt), no float.
- Tests run for real (per-task isolated); migrations 001→147 apply clean; web tsc 0.

## Gaps accepted by both
- **D365 builder ×9** (T-042/044/046/047/123/124/125/126/127): user-decided deferral pending PRD field mappings. Confirmed: no exceljs code exists (genuine deferral, not a stubbed "done").
- **Sensory ×2** (T-071/076): cross-module, canonical owner 03-technical.
