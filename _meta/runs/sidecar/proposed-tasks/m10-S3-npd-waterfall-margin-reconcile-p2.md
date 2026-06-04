# PROPOSED STUB — m10-S3 (10-finance): NPD design-waterfall ↔ operational standard_cost (P2, advisory)

**Severity:** Low (advisory / traceability only — correctly deferred to P2).
**Type:** Documentation note. NOT a P1 gap.

## Context (evidence)
- 01-NPD owns a design-time 9-step costing waterfall (`costing_breakdowns` +
  `costing_waterfall_steps`, task `01-npd/T-070`, PRD §17.11.3): Raw materials → Yield loss →
  Process labour → Packaging → Overhead → Logistics → Margin → Distributor → Retail, with 3
  margin scenarios + target_price.
- 10-finance owns operational per-WO actual costing + `standard_costs` (PRD §6/§9). The finance
  "waterfall chart" (T-020/T-031) is a Recharts visualization of MTD std-vs-actual, NOT a read
  of `costing_waterfall_steps`.
- Correctly separated. The ONLY shared datum is `items.cost_per_kg` (dual-owned per D-FIN-9).

## Note
There is no P1 task reconciling the NPD design waterfall's `target_price`/margin against
operational `standard_costs` actuals. PRD §3.1 scopes margin analysis to **P2 (EPIC 10-G
Margin Analysis)** + savings calculator (EPIC 10-H). So this is *intentionally deferred*, not a
missing P1 task. Recorded here only so the future P2 wave knows to: (a) consume the NPD
waterfall target as the baseline, and (b) reuse 12-reporting's fiscal calendar rather than a
parallel one. No P1 action required.

READ-ONLY proposal.
