# Wave A4 — MRP & procurement + hold-message (P1/P2). Prod-repro'd 2026-07-12.

Repo: monopilot-kira. Work in THIS worktree only. DB ground truth: packages/db/migrations.
DISCIPLINE: every NEW raw SQL must PREPARE on real Postgres — verify column names against migrations, NO reserved bare aliases. withOrgContext COMMITS unless you THROW. NEVER export non-async from a 'use server' module. All qty/date math exact (SQL numeric / proper date types), never JS float on money. Next free migration = 486 — say so LOUDLY if used.

Files: `apps/web/app/[locale]/(app)/(modules)/mrp/_actions/*` (or planning/mrp), `apps/web/lib/procurement/create-purchase-order-core.ts`, procurement auto-PO action, and the production consume resolver `apps/web/lib/production/consume-material-core.ts` (for N2).

## S11 (P1) — MRP counts draft, non-releasable WIP as open supply
MRP nets draft/unreleasable WIP work orders as incoming supply, understating net requirements. FIX: include only schedulable (released/in-progress) supply in netting; exclude DRAFT/cancelled/unreleasable WOs. Test: a draft WIP WO does NOT count as supply in the netting.

## S12 (P1) — MRP proposes a purchase date in the past
A planned-order suggestion came back dated 5 days ago. Root: lead-time offset from need-date can produce a past order date with no floor. FIX: floor the suggested order date at today (or next valid working day); if lead time makes on-time infeasible, flag it (typed "expedite"/late signal) rather than emitting a past date. Test: a need-date within lead-time yields today (or a flagged expedite), never a past date.

## S13 (P1) — auto-PO reports "no supplier" despite an existing PO for that material+supplier
Auto-PO generation says no supplier even though a confirmed PO exists for that material+supplier. Root: supplier resolution ignores existing supplier links / item-supplier records that the manual PO used. FIX: resolve the supplier the same way manual PO creation does (item default supplier / supplier-item link); only report no-supplier when genuinely unlinked. (Related wave-14 N-55.) Test: a material with a linked supplier resolves it in auto-PO.

## S14 (P2, verify) — received LP available while qa_status pending
A received LP shows status=available with qa_status=pending (it is correctly excluded from available-inventory views). Confirm whether this is a real inconsistency or acceptable; if the status should stay 'received'/'quarantine' until QA passes, fix the receiving transition. If already correct (excluded everywhere it matters), document as a non-finding with evidence. Test only if a real fix is made.

## N2 (P2) — hold masked as insufficient stock (consume message)
Consuming a held LP is correctly BLOCKED, but the operator sees "insufficient free stock" instead of "active quality hold". The resolver (consume-material-core.ts) already distinguishes quality_hold_active vs lp_unavailable — surface the real reason to the UI message. FIX: map quality_hold_active to a distinct, actionable message ("material on quality hold — release the hold to consume"), separate from genuine shortage. Test: held-LP consume rejection returns the hold reason, not a shortage message.

## Requirements
- Read touched files FULLY; grep callers; reuse existing supplier-resolution / date helpers (don't duplicate).
- Tests per finding. Any new SQL PREPAREs on real PG. tsc --noEmit clean + touched vitest green; FULL build if 'use server' export shape changes.
- Summary → `_meta/plans/prod-audit-2026-07-12/A4-summary.md`. Do NOT git add -A, no commit.
