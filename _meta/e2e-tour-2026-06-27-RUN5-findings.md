# E2E Tour — RUN5 — NPD G2 self-advance fix verification + full gate chain

- **Date:** 2026-06-27
- **App (LIVE):** https://monopilot-kira-git-main-codermariuszs-projects.vercel.app/en
- **Login:** admin@monopilot.test (Apex Admin)
- **Project under test:** NPD-009 "R4 Premium Bacon 250g" (id `be91fb3c-48bc-4d8d-805e-5ca066ed66d3`)
- **DB (read-only verify):** Supabase project `khjvkhzwfzuwzrusgobp`
- **Tooling:** Playwright MCP browser + Supabase MCP `execute_sql` (read-only)

---

## PRIMARY VERIFICATION — G2 self-advance fix

**VERDICT: PASS.**

The reported bug (a fresh NPD project at gate G2 routed into the e-sign approval
modal, which only accepts G3/G4, failing with "Could not record the gate
decision" and writing no `gate_approvals` row) is **fixed**. G2 now behaves as a
self-advance gate via the AdvanceGateModal.

| Step | What I saw (real UI text) | Status | Screenshot |
|---|---|---|---|
| Baseline (DB) | `npd_projects` NPD-009 → `current_gate=G2`, `current_stage=recipe` | OK | — |
| 1. Open Gate screen | "Current gate: **G2 — Business Case**", checklist **11/11 (100%)** | PASS | — |
| 2. Current-gate CTA | Status banner "✓ All required items for G2 complete. Ready to advance to Development." + button **"Advance to G3: Development →"** (NOT "Request approval") | PASS | `r5-01-g2-advance-cta.png` |
| 3. Click CTA | **AdvanceGateModal** "Advance gate" opened — gate transition G2 Business Case → G3 Development, "7 of 7 required items complete", "✓ No blockers — ready to advance!", a "Gate advancement notes" textbox. **NO password / e-sign field.** | PASS (self-advance, not e-sign) | `r5-01b-advance-gate-modal.png` |
| 4. Confirm advance | Header changed to "**Packaging · G3 Development**"; current gate **G3 — Development**; Brief ✓ / Recipe ✓; an "Open FG" link (`/en/fa/FG-NPD-009`) appeared (FG auto-mapped on advance) | PASS | `r5-02-advanced-to-g3.png` |
| 4. DB confirm | `npd_projects` NPD-009 → `current_gate=G3`, `current_stage=packaging` | PASS | — |

**`gate_approvals` check:** No row was written for the G2→G3 self-advance
(`select … from gate_approvals where project_id=… → []`). This is **correct and
expected** — self-advance gates record the transition via project state +
audit log, not a formal e-sign approval row. The old bug's failure mode (modal
error, no advance) is gone.

**i18n spot-check:** Gate screen renders clean labels. A scan for raw dotted
i18n keys (`npd.gateChecklist.advanceTerminalHint`, `npd.*`, `pipeline.*`)
returned **zero** matches. All CTAs are human-readable.

---

## CONTINUATION — full NPD gate chain G2 → G3 → G4 → handoff → production BOM

The project was pushed all the way to a promoted/released production BOM.

| Step | What I saw | Status | Screenshot |
|---|---|---|---|
| G3 checklist | Entered G3 with **10 blocking** items (Technical 5 / Business 2 / Compliance 3). Ticked all 10 → "G3: Development 100% 10/10", banner "✓ All required items for G3 complete. Ready to advance to Testing.", **"Request approval →"** button enabled | PASS | — |
| Stage walk (G3) | Header "Advance stage →" opens AdvanceGateModal (self-advance, notes only). Walked **packaging → trial → sensory → pilot → approval**. The pilot→approval move crossed into G4 ("Advance to G4: Testing · Approval") — still a no-e-sign self-advance modal | PASS | — |
| At G4 / approval (DB) | `current_gate=G4`, `current_stage=approval` | PASS | — |
| G4 gate checklist | G4 — Testing has **18 items** (0/18, 17 blocking). Ticked all 18 → 100% 18/18. Bottom CTA became **"Mark as launched ✓"** (terminal). NO separate gate-level e-sign button at G4 | PASS | `r5-03-g4-testing-checklist.png`, `r5-04-g4-complete-mark-launched.png` |
| approval→handoff guard | "Advance stage →" (approval→handoff) was **correctly blocked** by the G4 e-sign guard: modal showed "🛡 Approval required — a Manager/Director must sign off on this gate." + red alert "Gate G4 e-signature approval is required before handoff — approve it on the Approval stage." | PASS (expected guard) | — |
| Approval gates screen (`/approval`) | The real e-sign approval chain. 7 criteria C1–C7. Initially 2 pass / 4 pending (C2 NutriScore, C3 margin, C5 allergens, C7 docs). "Submit for approval" disabled. "Go fix →" links route correctly | PASS | `r5-05-approval-gates-criteria.png` |
| Clear C5 | Allergen cascade screen → ticked "I confirm the allergen declaration above is complete and accurate" → C5 PASS | PASS | — |
| Clear C7 | Compliance docs → uploaded a Spec PDF (title + file + expiry 2030-12-31) → "✓ Valid" → C7 PASS | PASS | — |
| Clear C3 | Costing stage → "Compute costing" → Target scenario margin **+20.0%** → C3 PASS | PASS | — |
| Clear C2 | Nutrition stage → "Compute NutriScore" → grade **B** (A–C spec) → C2 PASS | PASS | — |
| All criteria | "✓ 6 pass / 0 warn / 0 pending" (C4 not required). "Submit for approval" enabled | PASS | `r5-06-approval-criteria-all-pass.png` |
| **G4 e-signature** | "Submit for approval" → modal "Submit for approval / An e-signature is required to submit this gate for approval. NPD-009 · G4" with **Password** + **Approval notes** fields. Entered admin password + notes → "Confirm submission" → approval chain shows "✓ Approver Admin · 2026-06-27 10:33:29 ✓ Approved". **E-sign accepts a PASSWORD (not a PIN).** | PASS | `r5-07-g4-esign-modal.png` |
| G4 e-sign DB | `gate_approvals` row written: `gate_code=G4`, `decision=approved`, `esigned_at` set, **`esign_hash` NOT NULL** | PASS | — |
| advance approval→handoff | After e-sign, the approval→handoff guard cleared; AdvanceGateModal confirm enabled → advanced. DB: `current_stage=handoff` | PASS | — |
| Handoff screen | "Handoff to production BOM". Release gates initially: ✓G4 / ✓FG mapped / ✗ Active shared BOM with lines / ✗ Factory spec approved / ✓ No high risks | PASS | `r5-08-handoff-screen.png` |
| **Generate production BOM** | Clicked "Generate production BOM". DB: `bom_headers` row created — `npd_project_id=NPD-009`, `origin_module=npd`, **`status=active`**, `version=1`, `bom_type=forward`, 1 `bom_lines` row (RM-001 MAKA SUPER). After reload, release gates "Active shared BOM with lines" + "Factory spec approved" flipped to **Met** | PASS | `r5-09-handoff-bom-generated.png` |
| Promote | Ticked the 6 handoff checklist items → "Ready to promote. All gates pass." → "✓ Promote to production BOM" → "**Promoted. This project has been released to the factory.** … Production FG FG-NPD-009 was created and its BOM auto-built." | PASS | `r5-10-handoff-ready-to-promote.png`, `r5-11-promoted-released.png` |

---

## FINDINGS for the orchestrator

### Severity 2 (workflow / data-integrity worth a look)

- **F-1 — G4 e-sign can be bypassed by the stage-advance path (workflow gap).**
  The header "Advance stage →" self-advance (AdvanceGateModal, notes-only, no
  e-sign) moves the project *across the G3→G4 gate boundary* without ever
  performing the G4 e-signature. I reached `current_gate=G4 / current_stage=approval`
  purely via stage advances. The formal G4 e-sign ("Request approval →" at the G3
  gate, and "Submit for approval" on the `/approval` screen) was never forced to
  enter G4. The system DOES re-impose the e-sign guard at **approval→handoff**
  (good — see the "e-signature required before handoff" block), so the project
  cannot be *handed off / promoted* without the e-sign. But the gate-state itself
  (`current_gate=G4`) advances ahead of the e-sign, which makes "Request approval"
  at the G3 gate effectively optional. Recommend deciding whether crossing the
  G3→G4 boundary via stage-advance should also require the e-sign, or whether the
  handoff guard is considered sufficient. (Not a crash; the hard gate at handoff
  holds the line.)

### Severity 3 (minor / cosmetic)

- **F-2 — Empty gate label in the G4 "blocking items" message.** While G4 was
  incomplete, the blocking banner read "⚠ 17 blocking item(s) must be completed
  before advancing to **`: Launched`**." — there is an empty gate code/name before
  "Launched" (looks like a missing `G5`/terminal-gate label or a null interpolation).
  Captured in the journey (G4 incomplete state). Cosmetic only.

- **F-3 — Release-gate panel does not auto-refresh after "Generate production BOM".**
  Immediately after generating, the Handoff "Destination BOM" stayed "—" and the
  "Active shared BOM with lines" / "Factory spec approved" gates still read "Not met";
  a manual page reload was needed for them to flip to "Met". The BOM *was* created
  in the DB at click time (`bom_headers` 10:34:58). Minor stale-UI / missing
  revalidation after the generate action.

### Non-findings (expected gates — NOT bugs, pushed through)

- G2 self-advance is a self-advance (no e-sign) — **this is the fix, working.**
- G3 had 10 required checklist items; G4 had 18 — ticked them all.
- G4 e-sign (password + notes, esign_hash persisted) — real BRCGS e-sign, expected.
- approval→handoff e-sign guard — expected, correctly enforced.
- C1–C7 approval criteria (NutriScore, margin, allergen declaration, compliance
  docs) — legitimate domain blockers; all satisfied through the UI.
- Handoff "Promote" gated behind 6 handoff-checklist items — expected.

---

## SUMMARY

- **G2 self-advance fix: PASS** (UI + DB; AdvanceGateModal opened, no e-sign,
  NPD-009 moved G2→G3, DB confirms `current_gate=G3`).
- **Furthest gate reached:** G4 / stage `handoff`, fully **promoted & released**
  (production FG FG-NPD-009 + active forward BOM v1 with 1 line).
- **Generate production BOM: SUCCEEDED** (active `bom_headers` row + 1 `bom_lines`;
  subsequently promoted to the release pipeline).
- **G4 BRCGS e-signature: SUCCEEDED** (password-based; `gate_approvals` row with
  `esign_hash`).
- **Most important next fix:** F-1 — decide whether the stage-advance path crossing
  the G3→G4 boundary should also require the G4 e-signature (currently the gate
  state advances ahead of the e-sign; only the handoff guard enforces it). Secondary:
  F-2 empty gate label in the G4 blocking message, F-3 handoff release-gate stale UI
  after Generate BOM.
