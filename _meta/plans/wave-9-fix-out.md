Wave 9 fix round 1 is implemented and committed on `fix/wave9-production-qa` (`5a8f...` — 7 files, +512/−134).

### Bug 2 — Genealogy double-counting
`allocateGenealogyContributionsForOutput` replaces the full-net-per-child behavior:
- Proportional share: `net × this_output_qty / total_wo_output`
- Subtracts genealogy already attributed to prior child LPs on this WO
- Caps by remaining parent qty and (for mass UoMs) this output qty
- Genealogy edges use the parent **consumption** UoM; consumption/output UoM mismatch → `uom_mismatch`

**Test:** 100 kg parent, two 50 kg outputs → edges `50 + 50 = 100` (not 200).

### Bug 1 — Supplied-LP site/warehouse validation
`validateAndLockSuppliedOutputLp` now locks and validates `warehouse_id` + `site_id`:
- Rejects null site on site-scoped WOs
- Rejects warehouse mismatch vs WO output destination
- Stock moves use the locked LP's `site_id` (not fabricated WO site)
- `wo_id` null allowed for internal reuse; conflicting non-null `wo_id` rejected

### Bug 3 — Hold-active QA pass
`transitionWoOutputQaForContext` calls `assertNoActiveHoldForLp` **before** updating `wo_outputs`. Active hold → `{ ok: false, reason: 'quality_hold_active' }` with no partial commit.

### Canonical ownership
`applyWoOutputHoldForContext` and `restoreWoOutputsAfterWoHoldReleaseForContext` live in `transition-output-qa.ts`. `hold-actions.ts` no longer writes `wo_outputs` directly.

### Gates
- `tsc --noEmit` clean
- 16 tests in the 3 output test files + 51 inspection/haccp tests green

`_meta/plans/wave-9-summary.md` has the **Fix round 1** section appended.
