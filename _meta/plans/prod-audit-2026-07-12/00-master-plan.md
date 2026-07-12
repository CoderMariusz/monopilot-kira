# Prod audit 2026-07-12 — repair master plan (Fable coordinating)

Source: Codex 8-run sequential production browser audit (R01–R08) against monopilot-kira.vercel.app.
29 findings: **6 P0 (integrity/access)** + 23 significant. Base commit `4c307186` (== origin/main).

Pipeline per wave: **Composer (impl, worktree) → Codex (cross-review, diff+spec) → Fable (arbitrate + final fix) → serialize migrations → build gate → deploy → re-verify on prod (real browser, screenshots)**.
Writer ≠ reviewer (different provider). Composer code ALWAYS reviewed (reward-hacking risk). Migrations serialized before merge (next free = **486**; max on disk 485). Vercel build auto-applies migrations — backup before push.

Definitive closure per owner's rule = real-browser E2E on prod with before/after screenshots, not green unit tests.

---

## Deduplicated findings → waves

### WAVE A1 — Consume & genealogy integrity (P0 core) · files: production/_actions/consume-material-actions.ts, lib/production/*, corrections
- **C1 (P0)** Consume from nonexistent material: 2.52 kg WIP consumed with **zero-UUID LP**, no stock, `fefo_adherence=true`. Root: no-LP consume branch skips LP existence/qty validation.
- **C2 (P0)** Hold bypass: LP on hold correctly hidden from FEFO, but "no LP + reason code" path records consumption anyway → **phantom consumption**, LP qty unchanged. Same branch as C1.
- **S6 (P0-adjacent)** Dangerous rounding: 2.52→3, 0.48→**0**, 12.632→13. Integer/UoM rounding on consume/output loses material. All qty math must be SQL numeric / Dec.
- **S17** Catch-weight lost nominal 1 kg (saved 0.95, no `qty_units`/`catch_weight_details`).
- **C5 (P0)** Deletable chain history: after FG complete, UI let user delete its WIP WO → `wo_dependencies` row vanished, genealogy destroyed. Root: delete action missing "referenced-by-dependency / completed-chain" guard.

### WAVE A2 — WO lifecycle & release gating (P0) · files: lib/production/complete-cancel-wo.ts, yield-gate-override.ts, work-order-chain, release
- **C3 (P0)** WIP→FG dependency not enforced: FG released+started+completed while prerequisite WIP still DRAFT (unreleasable). Root: release/start/complete gate doesn't check upstream dependency state.
- **C4 (P0)** WO completed at 2.6% consumption: yield-out-of-tolerance warning did **not block** completion. Gate is advisory, must hard-block or require supervisor e-sign override.
- **S5** Failed WIP release (`factory_release_incomplete`, missing `factory_spec`) not surfaced to user.
- **S8** `started_at`/`completed_at` stay NULL after start/complete → broken audit trail.
- **S19** "Submit for trial" returned `VERSION_NOT_LOCKED` though DB confirms locked; UI showed no error (stale read + swallowed error).

### WAVE A3 — WO creation & scheduling (P1) · files: planning/work-orders/_actions, scheduler/_actions/sequence-solver.ts
- **S1** WO create ignores selected line; can attach a **cross-site** line to a warehouse-1 WO. (site/line validation)
- **S2** Planned date disappears on create AND edit.
- **S3** `qty_entered`/`qty_entered_uom` stay empty despite box qty entry.
- **S4** WO list & detail don't refresh after create/edit (revalidatePath/router.refresh).
- **S9** Scheduler includes draft non-releasable WOs + cross-site lines despite site filter. (overlaps wave-13 spec — verify prod)
- **S10** Applying schedule ends in `sod_violation` invisible in UI.

### WAVE A4 — MRP & procurement (P1) · files: mrp/_actions, procurement/create-purchase-order-core.ts
- **S11** MRP counts draft, non-releasable WIPs as open supply.
- **S12** MRP proposed a purchase date **5 days in the past**.
- **S13** Auto-PO reports "no supplier" despite an existing PO for that material+supplier. (overlaps wave-14 N-55)
- **S14** Received LP `status=available` while `qa_status=pending` (correctly excluded from available view — low, verify only).

### WAVE A5 — Quality, catch-weight indicators & NPD gates (P1) · files: quality/_actions, npd pipeline gates, config seeds
- **S15** Inspection for new material has **zero parameters**; Pass/Fail/Hold blocked. (inspection template resolution)
- **S16** Missing downtime & waste categories completely block pause + waste registration. (seed / config data)
- **S7** Consumption indicator sums across different UoM (kg + pcs). (display aggregation)
- **S18** NPD gate allowed G2 with **0/3** required checklist points. (gate enforcement)
- **S20** Allergen-criterion remediation link → page with no accept mechanism.

### WAVE A6 — Access control, onboarding & RLS (P0/P1) · files: settings/users, onboarding, npd project-create
- **C6 (P0)** User deactivation broken: two attempts `persistence_failed`, account stays active. (deactivate action)
- **S21** New regular user lands only on "Onboarding in progress" while admin uses the app. (onboarding gate / role provisioning)
- **S22** Production approval chain configured single-approver; dual-sign untestable. (config — verify whether policy or bug)
- **S23** "Create project & open recipe" opens Brief; new recipe has empty code/header.
- **RLS residual**: 5 of 6 flagged tables are intentional global lookups already write-revoked in mig 408 (documented). Only **`yield_gate_override_reasons` (mig 459)** already does `revoke all from public` + grant select to app_user — so it is fine. Net: the Supabase advisor "rls_disabled_in_public" is a lint on deliberate global reference tables; **enable RLS with a permissive `select using(true)` policy** to silence the advisor without behavior change, OR document as accepted. Low priority.

---

## Execution order & rationale
1. **A1 + A2 first, in parallel** (independent file sets: A1=consume/genealogy, A2=lifecycle/gate). These are the money bugs — phantom stock, deletable genealogy, unenforced gates.
2. **A3 + A4** next (planning + MRP; some overlap with prior waves 13/14 — confirm the prod repro is a real regression vs undeployed fix).
3. **A5 + A6** last (quality/config/access; several are seed-data or UI-surface, cheaper).

## ADDENDUM 2026-07-12 — owner prod E2E results + new findings

**A1/A2 verified on prod** (owner browser audit): C1✅ C2✅ S6✅(persist) C3✅ C4✅ S5✅. Regressions HOTFIXED (`4527131f`):
- **C5 (P0) re-fixed** — guard only blocked on progression; a DRAFT child of a DRAFT parent deleted and ON-DELETE-CASCADE orphaned wo_dependencies. Added clause: block when target has ANY dependency edge to a non-cancelled counterpart. Proven: old_blocked=f → new_blocked=t.
- **S19 (P0) re-fixed** — query used `fv.version_no`, prod column is `version_number` → 42703. The unit test asserted the BUGGY string (masking). This was the ONE SQL I skipped PREPARE-ing — now PREPAREd. LESSON: PREPARE EVERY new SQL, no exceptions.
- Unverifiable this pass: S17 (no catch-weight products in Apex 22 — verify when seeded), S8 (couldn't reach new Start path via UI — blocked by A3 bugs).

**New findings folded into remaining waves:**
- **→ A3: N1 (P1) production-summary display rounding** — DB holds 7.800 kg, screen shows 8/300 kg (mass mis-rendered; pct correct). Fix the production-summary display formatter to show real precision (display-only rounding, never integer-round a kg mass). Pairs with S4 (stale views) already in A3.
- **→ A4: N2 (P2) hold masked as insufficient stock** — consuming a held LP is correctly blocked, but the operator sees "insufficient free stock" instead of "active quality hold". Fix the consume-rejection message to distinguish quality_hold_active from genuine shortage (the resolver already knows — surface the real reason).

## Standing discipline (from memory)
- Never `git add -A`. Worktrees NOT in /tmp. RSC: never export non-async from `'use server'`.
- New SQL must PREPARE on real PG (non-reserved aliases). Migrations serialize before merge.
- Composer BLOCKING via cursor-exec.sh; Codex BLOCKING via `codex exec`. Async bridges lose output.
- Backup before any push (Vercel build auto-migrates live).
