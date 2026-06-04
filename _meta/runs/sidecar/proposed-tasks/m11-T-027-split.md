# PROPOSED REFINEMENT — 11-shipping T-027 optional split (carriers compound task)

**Type:** optional split. **Priority:** LOW. **Finding:** S-4.

## Problem
T-027 = "carriers schema + Server Actions + carriers_list_page (SHIP-014b)" bundles schema + API + UI (12 scope files). Same anti-pattern as T-026, lower risk because P1 carriers is thin (P2 holds the carrier-API integration).

## Proposed split (optional — only if wave-balancing benefits)
- **T-027a (T1-schema):** `carriers` table + RLS + Drizzle.
- **T-027b (T2-api + T3-ui):** carrier CRUD Server Actions + `carriers_list_page` (SHIP-014b).

## Notes
- If left compound, flag risk_tier and ensure reviewer context budget accounts for 12 files.
- P2 carrier API (DHL/UPS/DPD OAuth, rate shopping, tracking webhooks, POD automation — Epic 11-F) stays OUT of this task.
