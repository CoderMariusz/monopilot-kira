# Wave B1 — Planning: WO-edit chain integrity, date off-by-one, MRP labels (P1). Prod-repro'd 2026-07-12 (owner round-2 audit).

Repo: monopilot-kira. Work in THIS worktree only. DB ground truth: packages/db/migrations.
DISCIPLINE: every NEW raw SQL must be valid on real Postgres (verify column names vs migrations — wrong column = prod 42703). withOrgContext COMMITS unless you THROW. NEVER export non-async from a 'use server' module. All qty math SQL numeric/Dec. Next free migration = 487 — say LOUDLY if used.

Files: apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/update-work-order.ts, create-work-order-chain.ts, shared cores, _components/create-wo-modal.tsx + edit modal; planning/_actions/mrp*.ts; dashboard component with "Run MRP".

## B1a (P1) — editing a parent WO breaks the production chain
Repro: WO changed 10.500→12.750 kg; the FG's WIP requirement recomputed to 10.710 kg on the parent's wo_materials, but the CHILD WIP WO planned_quantity and the wo_dependencies.required_qty stayed at the old 8.820 → phantom 1.890 kg shortfall. Also qty_entered stayed "7 box" though it no longer matches the new base qty.
FIX: on parent-WO quantity edit, propagate proportionally to (a) the chain child WO planned_quantity and (b) wo_dependencies.required_qty for its dependency rows — atomically in the SAME txn; if the child has already progressed beyond DRAFT/RELEASED, BLOCK the edit with a typed error instead of silently desyncing. Also reconcile qty_entered/qty_entered_uom: if the edit is made in base UoM, either clear qty_entered or recompute it from pack factors — never leave a stale entered-qty that contradicts base qty. Test: editing the parent updates child WO + dependency qty in one txn; editing when child is IN_PROGRESS is rejected.

## B1b (P1) — WO scheduled date shifts one day (date-only local vs UTC)
Repro: picking 15 July persists+displays 14 July 23:00 UTC; picking 16 shows 15 23:00. The date-only form value is interpreted in local tz then converted to UTC.
FIX: treat the scheduled-start date-only input as a CIVIL date: persist as date (or midnight UTC of the picked calendar date) and display the same calendar date back — round-trip picked=shown=stored. Find the conversion point (form → action payload) and fix at the choke point. Test: '2026-07-15' round-trips as 15 July regardless of tz.

## B1c (P2) — MRP list labels horizon-start date as run date
The MRP runs list shows the horizon start date labeled as the run/execution date. FIX: label/display the actual run timestamp (created_at) as run date; show horizon separately if useful. Test/assert correct field mapping.

## B1d (P2) — dashboard "Run MRP" navigates to Scheduler instead of MRP
FIX the link target to the MRP route. One-line; verify no other dashboard quick-links are similarly miswired.

## B1e (P2) — consumption list stale after mutations
After recording consumption the list needs manual reload. FIX: revalidate the WO-detail consumption data after the consume/reverse mutations (same pattern as A3 S4). Test/assert revalidate fires.

## Requirements
Read touched files FULLY; grep callers; fix at shared choke points. Tests per finding (vitest; `.tsx` under vitest.ui.config.ts). Gates: tsc --noEmit clean + touched vitest green; full build if 'use server' export shape changes. Summary → _meta/plans/prod-audit-2026-07-12/B1-summary.md with root cause + diff locations + any NEW raw SQL pasted verbatim. No git add -A, no commit.
