Fix round 2 is implemented and committed on `fix/wave9-production-qa` (`f8a3c1e`).

### Changes in `register-output.ts`

**1. WO-level genealogy serialization**
- `allocateGenealogyContributionsForOutput` now takes `pg_advisory_xact_lock(hashtext(woId || '::genealogy'))` before reading `already_attributed` or inserting edges.
- All output types for a WO serialize through one lock (batch numbering still uses the per-type lock in `nextBatchNumber`).

**2. Mixed parent-consumption UoM guard**
- Upfront query rejects parents with `count(distinct mc.uom) > 1` → `uom_mismatch` with `lp_id` + `uoms`.
- `parent_net` CTE also requires `count(distinct mc.uom) = 1` — no more silent `sum(qty)` under `min(uom)`.

### Tests

**Mock regressions** (`register-output-genealogy-net-consumed.test.ts`):
- WO-level genealogy lock assertion
- Mixed kg+lb rejection (no genealogy writes)
- Primary 30 kg + by_product 70 kg against 50 kg parent net → summed edges = 50

**Real Postgres** (`register-output-genealogy.pg.test.ts`, skips without `DATABASE_URL`):
- PREPARE smoke on production CTE SQL
- Mixed-UoM rejection on real DB
- Concurrent different-output-type registration (primary + by_product in parallel)

### Gates
- `tsc --noEmit` — clean
- Vitest — 6 passed, 3 skipped (pg tests without local Postgres)

`## Fix round 2` appended to `_meta/plans/wave-9-summary.md`.
