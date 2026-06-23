# 5am decision questions — flow-affecting only (overnight run 2026-06-24)

Owner trusts my judgment on most things and wants me to SOLVE what I can. This file holds only the
decisions that genuinely change the FLOW / business rules and need the owner. Everything else I resolve
and record in the build commits / per-page audit.

Format: Q — context — options — my recommended default (which I'll implement unless it's truly flow-gating).

---

## Open questions for the owner (5am)

(accumulated through the night)

### Q1 — Scanner REVERSE/correction logic (your headline ask: over-consume on scanner → how to undo)
Today reverseConsumption / void output / void waste / GRN-line-cancel all WORK but are **desktop-only** (no scanner
routes). Also: desktop reverse uses an e-sign **account password**; scanner operators have numeric **PINs**.
- **Decision A — auth:** on the scanner, gate a reverse with the operator's **PIN + a supervisor PIN** (like the
  existing over-consume approval), NOT a web password. (My recommendation — fits the device.)
- **Decision B — scope:** which reverses to expose on the scanner first? My rec: (1) reverse last consumption, (2) void
  last output, (3) void last waste, (4) cancel a just-made receipt — in that order, each as a "history → undo" tile.
- **My default if you don't answer:** build a `consume → history → reverse (PIN+supervisor-PIN)` slice as the pattern,
  leave the rest queued. Flagging because it changes operator flow + an auth rule.

### Q2 — Wrong PO to a supplier → correction model
A `sent`/`confirmed` PO is read-only; only exit is `→cancelled` (loses the doc). No amend.
- **Option A (my rec):** add **"Reopen to draft"** (sent/confirmed → draft) so it can be edited then re-sent, with an
  audit trail. Simple, matches how people actually fix a wrong order.
- **Option B:** keep cancel-only + force a new PO. Cleaner audit, more clicks.
- Also: make `partially_received → cancelled` either blocked when stock exists, or auto-reverse the received LPs. My rec:
  **block with a clear message** ("receipts exist — cancel the GRN lines first"). Flagging — it's a procurement business rule.

### Q3 — Cycle count / found-stock → create a pallet (your ask: "can we create one via counting if we find stock")
Entirely absent today (no table/action/UI; `warehouse.stock.adjust` is a phantom permission).
- **My rec:** build a **stock-count + adjustment wave**: a count session (blind count per location), variance approval
  (e-sign), and a positive adjustment that **mints a new LP** (origin='adjustment') for found stock — plus a negative
  adjustment for shrinkage. This is a real wave (mig + actions + desktop UI + scanner "Count" tile).
- Flagging for **scope/priority + the approval rule** (who signs a variance?). I can start the backend (count tables +
  adjust action) tonight if you want it prioritized; otherwise it stays queued.

### Q4 — Reporting: period selector + search by order/line + wire the dead MVs
Reports are real but every window is hardcoded (no daily/weekly/monthly) and there's no WO/PO/SO/line filter; the 7
`mv_reporting_*` matviews exist but nothing reads them.
- **My rec (will start tonight, low-risk):** add a **period selector (Day/Week/Month/custom range)** + a **filter by
  WO/PO/line** to `/reporting` + the dashboards, driven by `searchParams`; and fix the refresh cron so the MVs actually
  refresh. Wiring the MVs as the read source vs keeping raw-table queries is the only real choice — my default is keep
  raw-table queries (simpler, already correct) and treat the MVs as a later perf optimization. Flagging only the
  "do you want monthly/quarterly rollups + CSV/PDF export" scope.
