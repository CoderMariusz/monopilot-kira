# Logic-gap audit — VERIFIED against current code (2026-06-25)

Read-only triage of `_meta/plans/2026-06-24-logic-gap-audit.md` (71 gaps) vs the CURRENT code.
Verdict: **3 CLOSED / 67 OPEN / 0 stale** (every row grounded in file:line). Owner per-rule
decision governs treatment: **BLOCK** for safety/compliance (holds, allergens, expiry/dates, QA
status, negative/contaminated stock), **WARN + supervisor-override (PIN + audit)** for the rest.

CLOSED (prior session work): G-SHIP-04 (ship LP decrement), G-PROD-03 (waste LP draw-down),
G-XCUT-01 (desktop consume WO-state gate).

SPOT-VERIFIED REAL (not false-positive): G-QA-01 / G-SHIP-06 — `pack-actions.ts` AND
`ship-actions.ts` have ZERO qa_status / hold / v_active_holds / holdsGuard / expiry references →
pack & ship genuinely do NOT recheck QA holds or expiry before committing/shipping LPs. A hold
placed AFTER allocation does not stop pack/ship. Confirmed → the triage's file:line verdicts are trustworthy.

## TOP-10 build queue (Wave-A/B, ranked) — owner per-rule treatment

| # | Gap(s) | What | Treat | Target action |
|---|---|---|---|---|
| 1 | G-SHIP-06 / G-QA-01 / G-XCUT-06 | Pack/ship commit LPs without rechecking QA hold/status → ships held/contaminated goods | **BLOCK** | shipping/_actions/pack-actions.ts + ship-actions.ts |
| 2 | G-QA-03 / G-XCUT-04 | Allocation lets EXPIRED LPs through (expiry only orders, never filters) | **BLOCK** | shipping/_actions/so-actions.ts |
| 3 | G-PROD-02 | Disassembly output lacks WO-state/hold/mass-balance gate before creating inventory | **BLOCK** | lib/production/output/register-disassembly-output.ts |
| 4 | G-PLAN-03 | Scanner receive writes a PAST best-before as canonical expiry, no block → rotten stock records | **BLOCK** | lib/warehouse/scanner/receive-po.ts |
| 5 | G-PROD-01 | Disassembly creates co-product LPs without consuming the source LP → stock double-counts | WARN+override | register-disassembly-output.ts |
| 6 | G-FIN-01 | WO actual cost sums multiple currencies without normalization → wrong costing | WARN+override | finance/_actions/wo-cost-actions.ts |
| 7 | G-PLAN-01 / G-XCUT-05 | Desktop PO marks received without GRN/stock → balance shows received, nothing in WH | WARN+override | purchase-orders/_actions/actions.ts |
| 8 | G-PLAN-04 | PO create accepts inactive/blocked supplier (FK-existence only) | WARN+override | purchase-orders/_actions/actions.ts |
| 9 | G-PLAN-06 | PO/TO line UoM free-form → poisons MRP/transfer math | WARN+override | planning/_actions/procurement-shared.ts |
| 10 | G-PLAN-07 | MRP conversion creates zero-priced EUR POs with no warning | WARN+override | planning/_actions/mrp.ts |

Full 70-row verified table (with per-row file:line evidence) is in the triage agent transcript
(task a7deacbc). Other waves: C (production corrections/start/complete), D (quality holds/NCR/
cold-chain/CCP/allergen), E (shipping state-machine/allergen/RMA), F (finance cost-ledger/valuation),
G (NPD lock/gate/allergen-override/release-docs), H (warehouse FEFO/over-pick/reservation/expiry).

## How to build (owner-confirmed)
- Sequence by safety first (the 4 BLOCK gaps above = food-safety: shipping held/expired/contaminated).
- Each BLOCK gap = a hard guard throwing a clear ProductionActionError/typed 409 with a PL "why-blocked" message.
- Each WARN gap = soft warning surfaced in the result + (where destructive) a supervisor-override path (PIN + audit), mirroring the over-consume threshold pattern.
- One lane per gap-cluster; adversarially kira-codex-review every one (reversal/RBAC/money/safety).
