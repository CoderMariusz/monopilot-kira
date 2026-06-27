# E2E Tester Tour — FINAL COMPREHENSIVE REPORT (2026-06-27, autonomous night run)

Five live tours (RUN-1 … RUN-5) on the deployed app + every blocker fixed and re-verified live.
Per-run detail: `e2e-tour-2026-06-27-{findings,RUN2-findings,RUN3-findings,RUN4-findings,RUN5-findings}.md`.
Login: admin@monopilot.test. App: `monopilot-kira-git-main-codermariuszs-projects.vercel.app`.

## 🟢 HEADLINE VERDICT

**The product is walkable END-TO-END FROM ABSOLUTE SCRATCH, with no blockers remaining.**

A from-nothing operator path was driven live and verified in the DB at every step:

> create warehouse (with a required **Site**) → create location → create a fresh **NPD project** →
> advance every stage-gate (G0→G2 self-advance, G3/G4 with the real BRCGS **e-signature**) → **Handoff** →
> **Generate production BOM** → **promote** → production FG + auto-built BOM → create **PO** (with a destination
> warehouse, 2 lines) → **receive into 2 different warehouses** (one on the **scanner**, one on the **desktop**;
> auto-putaway + QC quarantine) → **QC-PASS** → create **WO** → **consume** on the scanner (FEFO) → **produce FG**
> (with a correct over-production mass-balance warning) → **move** an LP → create **TO** to another warehouse
> (ship + receive) → create **SO** → allocate → pack (**SSCC** generated) → ship → **BOL**.

## What was fixed + verified live this run

| # | Fix | Commit | How it was verified |
|---|-----|--------|---------------------|
| 1 | **Received stock never pickable** (TO-ship + SO-allocate dead-ended) → owner-chosen **auto-putaway** (receive lands LP at `status='available'`) | `42af68f3` | RUN-2/3: TO-ship + SO-ship work |
| 2 | **warehouses.site_id = NULL** on all warehouses → scanner receive/consume couldn't resolve a location | backfill + Site-picker | RUN-3: scanner receive OK |
| 3 | **Add-warehouse had no Site picker** (new WHs born NULL) → now **requires a Site** | `2ca88194` | RUN-4: R4WH created with a site |
| 4 | **NPD Generate-BOM crashed on recipe yield=0** | `2c5f11b3` | RUN-3/5: BOM generates clean |
| 5 | **Partial ship froze the LP remainder** (`status='shipped'` on a partly-shipped LP → stranded stock) | `8d986445` | code + reconciled the 1 frozen LP |
| 6 | **Fresh NPD project couldn't advance past G2** (gate panel routed G2 into the e-sign modal → `GATE_MISMATCH`) → G2 is now **self-advance** | `2c801c1c` | **RUN-5 PASS** (NPD-009 G2→G3, then to G4/handoff/BOM) |
| 7 | **Warehouses "Site" column showed the address**, not the linked site name | `<this run>` | live SQL: shows Production1 / warehouse 1 |
| — | i18n: PO destination, gate/formulation/locations missing keys, yield-error mapping | various | RUN-5: clean labels |

RBAC (mig 356/360) + PO destination field (mig 361) also shipped earlier in the night.

## ⚖️ OWNER DECISIONS (no blockers — your call)

1. **F-1 — G3→G4 e-sign enforcement.** The model is stage-native: a project can **stage-advance across the G3→G4
   boundary without the G3 e-signature**. The hard line correctly holds at **approval→handoff** (the G4 e-sign guard
   blocks promotion), so there is **no data-integrity risk** — but the gate state can sit at G4 before any G3 sign.
   This is by-design per the "e-sign is a checkpoint record" model. **Decide:** should crossing G3→G4 also require
   the G3 e-sign (stricter BRCGS), or is handoff-only enforcement acceptable?
2. **Merge cut product→items (migs 357/358/359).** GO-ready (2 Codex reviews, fixes applied), **UNCOMMITTED + GATED**
   on a supervised apply window with you present (atomic 357→358→359 + verify harness + rollback). Design §8g.

## 🟡 Remaining LOWs (cosmetic / non-blocking — queued)

- **F-2** empty gate label in the G4 "before advancing to `: Launched`" alert.
- **F-3** Handoff release-gate panel doesn't auto-refresh after Generate-BOM (needs a reload).
- `formulation_versions.batch_size_kg` persists NULL though the UI validates off it.
- No "Release" control on the WO **detail** page (only the list row action).
- SO second-allocated-LP pack into a box silently no-ops (one SSCC box still ships fine).
- `warehouses.site_id` is still nullable at the DB (app-layer validation only).
- Scanner Receive/Move location pickers are **site-scoped** (correctly hide other-site locations) — consider a
  "this location is on another site" hint instead of a silently-disabled button. *(Not a bug — by design.)*

## Live artifacts left on the test env (for resume)
NPD-009 (now G4/handoff, promoted → FG-NPD-009 + BOM), warehouse R4WH (site "warehouse 1") + R4-BIN-01,
PO-202606-0008, WO-202606-0003, TO-202606-0003, SO-202606-00003, SH-2026-00009. Scanner PIN 246819.

## Bottom line
Every operational and NPD→production path is unblocked and live-verified from scratch. What's left is **two owner
decisions** (G3→G4 e-sign policy; the supervised merge-cut window) and a short list of cosmetic LOWs.
