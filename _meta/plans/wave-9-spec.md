# Wave 9 — Production output & QA handshake integrity (from 2026-07-10 hunt, h6+h7)

Repo: monopilot-kira. Work in THIS worktree only. DB ground truth: packages/db/migrations.
Canonical owners (CLAUDE.md): `wo_outputs` → 08-production ONLY. Quality must route through a production-owned transition, never write wo_outputs directly. All qty math in SQL numeric.

## Bug 1 (P1) — caller-supplied output LP is not validated and its inventory is not updated
`lib/production/output/register-output.ts:85` accepts `lp_id` from the caller (forwarded unchanged from the public endpoint `production/work-orders/[id]/outputs/route.ts:41`), writes it onto `wo_outputs` (:698). LP creation + qty init happen ONLY when lpId is absent (:762). For a SUPPLIED LP the only check reads its location (:790) — no product/UOM/status/QA/WO-ownership/quantity validation — yet a positive receipt `stock_moves` row IS posted (:803). So a caller can supply an LP of another product or an already-consumed LP: output + receipt ledger recorded, but `license_plates.quantity` never increments → authoritative LP balance and stock ledger disagree, output linked to wrong product/UoM.
FIX: for a caller-supplied LP, `select ... for update` the LP and ENFORCE matching product_id, site/warehouse, UoM, and an acceptable status/QA state, and that it belongs to this WO's org; then atomically INCREMENT `license_plates.quantity` by the output qty (SQL numeric) consistent with the receipt move. If any check fails, reject with a typed error (mirror existing register-output typed errors) BEFORE any write. (Prefer this over blanket-rejecting supplied LPs, since the internal happy path may legitimately pass an lpId — verify which callers do.)
Tests: wrong-product LP rejected; consumed/blocked LP rejected; UoM mismatch rejected; existing-LP quantity increases by the output qty.

## Bug 2 (P1) — output genealogy includes fully-reversed consumption and records false per-parent qty
`register-output.ts:345` groups parents by `lp_id` from consumption rows WITHOUT excluding correction/reversal rows or requiring positive NET consumed qty (reversals are negative counter-rows, not deletes — `reverse-consume/route.ts:284`). Then every selected parent gets a genealogy edge whose `qty` is the FULL output quantity (:566), not that LP's consumed contribution.
FIX: (a) compute NET consumed per lp_id (sum including negative reversal rows) and EXCLUDE parents whose net ≤ 0; (b) set each genealogy edge's qty to that LP's actual net consumed contribution (or a correct proportional share), not the whole output qty. SQL numeric. Test: an LP whose consumption was fully reversed is NOT a genealogy parent; per-parent qty equals net consumed, not total output.

## Bug 3 (P1) — passing a wo_output inspection releases the LP but leaves wo_outputs.qa_status PENDING
`quality/_actions/inspection-actions.ts:356` for a passed wo_output inspection calls only `releaseLpQaForContext` (LP → released) and NEVER transitions `wo_outputs.qa_status`; the production-owned `production/_actions/output-qa-actions.ts:89` is the only code that moves PENDING→PASSED/FAILED. Result: signed inspection = passed, LP released/usable, but the canonical production output stays PENDING → the two QA read models disagree and the LP is usable before the output records a passing decision.
FIX: add a production-owned atomic transition (in lib/production or output-qa-actions) that records the output QA decision AND applies the LP side-effect together; call it from the signed inspection flow instead of releasing the LP alone. Do NOT have Quality write wo_outputs directly — call the production-owned transition. Test: passing the inspection moves wo_outputs.qa_status to PASSED in the same tx that releases the LP.

## Bug 4 (P1) — CCP/inspection holds dedup against UNRELATED active holds
`quality/_actions/haccp-actions.ts:238,267` (`createCcpDeviationHoldIfMissing`) and `inspection-actions.ts:266,286` (`createInspectionHoldIfMissing`) treat ANY active hold with the same `(reference_type, reference_id)` as satisfying the new safety event — ignoring the hold's reason, originating deviation/inspection, and affected-item set. So a new CCP deviation or failed inspection can be silently swallowed by an unrelated existing hold → the safety hold for the new event is never created.
FIX: scope the "already exists" check to the SAME originating event — match on the reason/source identity (e.g. the deviation id / inspection id, or the reason code + affected items), not just (reference_type, reference_id). A distinct safety event must create its own hold. Test: an active unrelated hold on the same WO does NOT suppress a new CCP-deviation hold.

## Requirements
- Read every touched file fully; grep all callers; respect canonical ownership (no Quality writes to wo_outputs — route through production).
- Tests per bug (existing __tests__ patterns). `.ts` default vitest config, `.tsx` under `--config vitest.ui.config.ts`.
- NO new dependencies. Avoid migrations unless strictly required; if one is needed, additive + next free number (check max, two files share 459) and say so LOUDLY (auto-applies on Vercel).
- Gates: `pnpm --filter web exec tsc --noEmit` clean + touched vitest green. Any NEW raw SQL: keep aliases non-reserved (no `grant`/`user`/`order` as bare identifiers) — it must PREPARE on real Postgres.
- Summary per bug → `_meta/plans/wave-9-summary.md`.
