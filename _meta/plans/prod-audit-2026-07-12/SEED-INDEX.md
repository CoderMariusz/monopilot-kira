# Prod-audit E2E verification seed — INDEX (for 2nd reviewer)

**Env:** https://monopilot-kira.vercel.app · login `admin@monopilot.test` / `Admin2026!!!` · org **Apex 22** (`00000000-0000-0000-0000-000000000002`) · deploy `44b153c1`.
**Seed script:** `_meta/plans/prod-audit-2026-07-12/seed-e2e.sql` (idempotent; re-run to reset; all rows prefixed `E2E-A-*`).
**Cleanup:** re-run the DELETE block at the top of seed-e2e.sql, or `psql -f` the whole file (it deletes-then-reinserts). A separate teardown is in the last section.

> Note: the WO list `/en/planning/work-orders` filters by the session **site** — the seeded WOs are on **Main Factory**. If the list shows 0, either switch site context to Main Factory, or open each WO by its direct URL below.

---

## A. Seeded data-state scenarios (open the URL, do the action, expect the result)

### C4 — completion blocked below yield tolerance (was: completed at 2.6%)
- **WO:** `E2E-A-C4-YIELD` · `/en/production/wos/a0000001-0000-4000-8000-000000000001`
- State: IN_PROGRESS, 3 kg primary output, **0 consumption** (far below tolerance).
- **Do:** attempt **Complete**. **Expect:** BLOCKED — requires supervisor yield-gate override + e-sign (`prod.wo.yield_override`); WO stays IN_PROGRESS. Completing without override must be rejected.
- Server proof: the deployed evaluator returns `within_tolerance=false` for this WO.

### C5 — chain-delete guard (was: deleting draft child orphaned genealogy)
- **WOs:** `E2E-A-C5-FG` (parent, draft) + `E2E-A-C5-WIP` (child, draft), linked by `wo_dependencies`.
- WIP: `/en/production/wos/a0000002-0000-4000-8000-000000000003`
- **Do:** attempt to **delete** the WIP (or the FG). **Expect:** BLOCKED (`chain_delete_blocked`) — it participates in an active dependency edge. Cancellation is allowed; hard delete is not.

### C3 — WIP→FG release gate (was: FG released while WIP still draft)
- **WO:** `E2E-A-C5-FG` · `/en/production/wos/a0000002-0000-4000-8000-000000000002`
- **Do:** attempt to **Release** the FG while the WIP child is still DRAFT. **Expect:** BLOCKED (`upstream_wip_not_ready`) with a message naming the WIP predecessor.

### C1 / C2 / N2 — consume held LP → real "quality hold" message (was: phantom consume / "insufficient stock")
- **WO:** `E2E-A-HOLD-CONSUME` · `/en/production/wos/a0000003-0000-4000-8000-000000000004` → Consumption tab, material **Wheat Flour**.
- The ONLY eligible ING-FLOUR LP (`E2E-A-HOLD-LP`, 40 kg) is on an **open quality hold**.
- **Do:** attempt to consume Wheat Flour (incl. the "no LP + reason code" path). **Expect:** REJECTED with a **quality-hold** message (not "insufficient free stock"); NO consumption row is written; the held LP quantity is unchanged (no phantom consumption; no zero-UUID LP).

### S8 — started_at / completed_at set on start & complete (was: NULL)
- **WO:** `E2E-A-S8-TIMESTAMPS` (RELEASED) · `/en/production/wos/a0000004-0000-4000-8000-000000000006`
- **Do:** **Start**, then **Complete** (register a proportional output first so the yield gate passes; or override). **Expect:** after Start the WO has `started_at`; after Complete it has `completed_at`. Verify in DB: `select started_at, completed_at from work_orders where wo_number='E2E-A-S8-TIMESTAMPS'`.

### S14 — QA-release promotes received→available (was: stuck received/pending)
- **LP:** `E2E-A-S14-QA-LP` (received / qa pending, 25 kg ING-FLOUR).
- **Do:** pass QA on this LP (scanner inspect or QA action). **Expect:** LP becomes `status=available`, `qa_status=released`, and now appears in available inventory (`v_inventory_available`). DB check: `select status, qa_status from license_plates where lp_number='E2E-A-S14-QA-LP'`.

### N1 — production summary shows real kg precision (was: 7.8 → 8)
- **WO:** `E2E-A-N1-DISPLAY` (IN_PROGRESS, 7.800 kg output on a 300 kg plan) · `/en/production/wos/a0000007-0000-4000-8000-00000000000a`
- **Do:** open the WO summary / Output tab. **Expect:** output renders **7.8 / 300 kg** (not "8 / 300 kg"); the % is unchanged.

### S16 — downtime & waste categories exist (was: pause/waste fully blocked)
- **Do:** on any IN_PROGRESS seeded WO (C4/N1/HOLD), open **Pause** (downtime) and **Waste**. **Expect:** category pickers are populated (9 downtime + 6 waste seeded via mig 486); a pause/waste can be recorded with a category+reason. DB: `select count(*) from downtime_categories where org_id='…0002'` → 9; waste → 6.

### S19 — submit-for-trial on a locked version (was: VERSION_NOT_LOCKED / 42703)
- **Project:** `E2E R07 Multistage Shortbread` (`21e26d40-8cf2-47d4-bfeb-9aad3fddc14c`), formulation version `a7b32f4e-9980-433b-bcbf-f3da2b864fb3` **state=locked**.
- **Do:** open that project's formulation and **Submit for trial**. **Expect:** SUCCESS (creates a trial batch, transitions to `submitted_for_trial`). Previously errored with a wrong-column 42703. NOTE: submitting consumes the locked state — re-lock a version if you need to repeat.

### S13 — supplier resolution skips blocked (was: "no supplier" / picks blocked)
- **Data:** item `flower2` has a **blocked** supplier (`E2E-A-SUP-BLOCKED`) and an **active** approved supplier-spec (`E2E-A-SUP-ACTIVE`). *(Advanced — needs an MRP run + convert-to-PO for a `flower2` shortage.)*
- **Do:** run MRP with a `flower2` shortage and convert the planned order. **Expect:** the auto-PO resolves the **active** supplier, never the blocked one.

---

## B. UI-flow scenarios (no seed row — exercise the flow live)

- **S1 cross-site line:** Create WO → try to attach a line from a *different* site → expect rejection (`line_site_mismatch`); "None" stays null (no auto cross-site line).
- **S2 scheduled date:** Create a WO with a Scheduled start, save, reopen → date persists; edit it → persists.
- **S3 qty_entered:** Create a WO in **box** UoM → DB `qty_entered`/`qty_entered_uom` are populated (not null).
- **S4 refresh:** After create/edit/delete/release, the WO list & detail update without a manual full reload.
- **S10 sod_violation:** Apply a schedule that violates segregation-of-duties → a user-visible error appears (not a silent no-op).
- **S15 inspection:** Open an inspection for a material with no template → either a usable default parameter set or a clear "assign template" gate (never a dead empty form with Pass/Fail/Hold blocked).
- **S18 NPD gate:** Try to advance a stage-gate with required checklist items incomplete (0/N) → blocked unless a recorded override.
- **S20 allergen:** Follow an allergen-criterion remediation link → the target page offers an accept/acknowledge action that clears the criterion.
- **S22 dual-sign:** In Settings → Authorization set dual-sign + min_approvers ≥ 2; on a release bundle, one approver → stays pending ("distinct second approver required"); a *second distinct* user → completes. Same user signing twice is rejected. Server rejects saving dual-sign with min_approvers < 2.
- **S23 create project & open recipe:** "Create project & open recipe" → lands on the recipe with a non-empty code/header (not an empty Brief).
- **C6 deactivate user:** Settings → Users → deactivate a test user → it persists (user becomes inactive and is blocked from the app); a failed auth-revoke surfaces a warning, not silent success. (Create a throwaway user first; don't deactivate admin.)
- **S21 onboarding:** A newly invited member logs in → reaches the app shell (not stuck on "Onboarding in progress").

---

## C. Teardown (remove all E2E-A-* fixture)
Run the DELETE block from seed-e2e.sql (lines under "idempotent cleanup"), or:
```sql
-- WOs + children, LPs, holds, suppliers, specs — all E2E-A-* in org 0002
```
(Re-running seed-e2e.sql end-to-end also resets to a clean fixture.) The S19 locked formulation is pre-existing real data — do NOT delete it; just re-lock a version if consumed.
