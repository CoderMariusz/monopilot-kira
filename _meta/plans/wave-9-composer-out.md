All four Wave 9 bugs are implemented on `fix/wave9-production-qa` in four logical commits, with tests and `_meta/plans/wave-9-summary.md`.

### Bug 1 — Supplied output LP validation
`registerOutput` now locks and validates caller-supplied `lp_id` **before any write** (product, site, UoM, `received`/`pending`, WO ownership). After the receipt move it increments `license_plates.quantity` by the output qty.

### Bug 2 — Genealogy net consumed qty
Consumption parents are netted per `lp_id` (reversals included); parents with net ≤ 0 are excluded. Each `lp_genealogy` edge uses that LP's net consumed qty, not the full output qty.

### Bug 3 — Inspection pass ↔ `wo_outputs.qa_status`
New production-owned `transitionWoOutputQaForContext` atomically sets `wo_outputs.qa_status` and releases the linked LP. Quality's `submitInspectionDecision` calls this instead of `releaseLpQaForContext` alone; `releaseWoOutputQa` delegates to the same helper.

### Bug 4 — Hold dedup scoped to event
CCP and inspection hold "already exists" checks now match `reason_free_text` (monitoring log id / inspection id). Unrelated active holds on the same reference no longer suppress new safety holds.

### Gates
- `pnpm --filter web exec tsc --noEmit` — clean
- 65 tests green across 6 touched test files

### Commits
1. `ffb9a157` — Bugs 1+2 (production output LP + genealogy)
2. `143f30b8` — Bug 3 (production QA transition)
3. `17f68f8e` — Bug 3 consumer + inspection hold dedup (Bug 4 partial)
4. `ef14fd8d` — Bug 4 CCP hold dedup + summary

Per-bug detail is in `_meta/plans/wave-9-summary.md`. No migrations were added.
