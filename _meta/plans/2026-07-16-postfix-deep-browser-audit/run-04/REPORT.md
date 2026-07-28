# RUN 04/20 — New NPD project, stage gates and full CRUD

## Verdict

**FAIL — 14 production defects: 1 P0, 9 P1, 3 P2 and 1 P3.**

Target: `https://monopilot-kira.vercel.app` · deployment `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm` · commit `2eb57cf7b90c23d4c55afeb01116eaabc3250385` · Vercel state `READY`.

The browser walk created `NPD-021` / `FG-021` and drove the project from G0 through signed G3 and G4 decisions to Handoff. All writes were made through visible production UI in the Codex/Sol Playwright browser. Every arithmetic/persistence claim below was checked after navigation or refresh. The project was deleted at the end; the linked FG was correctly archived as Blocked, while an independently owned Technical sensory row remained orphaned.

## Scenario matrix

| Scenario | Result | Evidence / observation |
|---|---|---|
| Blank project create | PASS | `NPD-021`, linked `FG-021` and formulation draft were created; valid Basics/Brief fields survived navigation. [create](evidence/R04-03-project-created.yml) |
| Clone without a source | **FAIL / P2** | Selecting Clone without choosing a source reached a dead Review with disabled Create and no explanation. [evidence](evidence/R04-01-clone-no-source-dead-review.yml) |
| G0→G1→G2 adjacency | PARTIAL | The old one-click G0→G3 jump did not recur, but readiness/transition truth still diverged between client and server. [G0](evidence/R04-04-g0-blocked.yml), [G2](evidence/R04-06-g2-semantic-blocker.yml) |
| Required checklist and formal approval | **FAIL / P0** | G3 approval was e-signed with 1/11 complete; G4 approval moved to Handoff without pilot WO, usable supplier spec, stock or compliance document. [evidence](evidence/R04-12-approval-bypass.yml) |
| E-sign wrong/right secret | PASS with audit defect | Wrong secret was rejected; correct secret produced a Valid signature. Certificate ID/hash rendered blank. |
| Formulation CRUD / lock | PASS | `0.480 kg × £0.5000/kg`, 100% composition and lock persisted; pilot scaled the ingredient to `25.555 kg` exactly. |
| Formula costing | **FAIL / P1** | Yield `0%` behaves like `100%`; the row labelled margin displays revenue instead of margin. [math](evidence/R04-09-costing-arithmetic.yml) |
| Trial create/edit/validation/line booking | PARTIAL | Decimal persistence and output math pass; invalid `101%` is generic, and after approval only Edit/Re-book exist—no void/delete/unbook. [evidence](evidence/R04-10-trial-pilot-crud.yml) |
| Technical→NPD sensory read-through | PARTIAL | Scores persist and NPD consumes them; the read-only screen writes, and mixed deltas produce a misleading verdict. [evidence](evidence/R04-11-sensory-semantics.yml) |
| Pilot plan and material scale | PASS with UX defect | `25.555 kg`, `92.75%`, `3.25 h` persisted; material shortfall was exact; concrete `SUPPLIER_SPEC_NOT_ACTIVE` message verifies C037. Invalid `100.01%` stayed generic. |
| Pilot WO creation | CORRECTLY BLOCKED | No WO was created; active supplier specification and material were absent. |
| Handoff checklist/readiness | **FAIL / P1** | Five unsupported claims could be checked; UI then said all gates pass while shared BOM and factory spec visibly did not. [evidence](evidence/R04-13-handoff-readiness-bom.yml) |
| Generate production BOM | **FAIL / P1** | Locked formulation still returned `persistence_failed`; destination BOM remained empty. |
| Launch guard | SERVER PASS / CLIENT FAIL | Server blocked missing compliance document; modal simultaneously said `0 of 0 required` and `No blockers`. |
| Post-approval editing | **FAIL / P1** | Signed G4/Handoff data stayed editable; approval remained valid, and a 500 g Brief temporarily coexisted with 480 g FG and recipe. [evidence](evidence/R04-14-post-approval-mutation.yml) |
| Delete lifecycle | PARTIAL | Project disappeared and FG became Blocked (C027 passes), but the Technical sensory row survived as editable raw UUID. [evidence](evidence/R04-15-delete-cross-module-orphan.yml) |

## Findings

### PF-R04-01 — P0 — Formal G3/G4 approval ignores required checklist and operational evidence

**Reproduction:** on `NPD-021`, complete only one G3 checklist row, approve G3 with e-sign, continue the operational stages, then submit G4 with no pilot WO, inactive supplier specification, `25.555 kg` shortage and no compliance document.

- Expected: per NPD PRD §17.6, required incomplete checklist rows are blockers; formal G3/G4 approvals must not be recorded until the configured evidence/criteria pass.
- Actual: G3 was approved at `1/11 (9%)`; later G4 was approved and moved the project to Handoff while the listed prerequisites were still false. The server did block terminal Launch for C7, but the formal approval record already asserted success.
- Source correlation: [`approve-project-gate.ts`](../../../../apps/web/app/(npd)/pipeline/_actions/approve-project-gate.ts) calls `getBlockers` but never `incompleteRequiredChecklistItems`/`evaluateStageGate`; required checklist enforcement exists only in [`advance-project-gate.ts`](../../../../apps/web/app/(npd)/pipeline/_actions/advance-project-gate.ts), where it is classified as overridable soft state.
- Impact: a valid e-signature certifies an objectively incomplete development/testing gate. This is a release-control and audit-integrity failure even though a later independent launch guard happened to stop this specific project.
- Evidence: [approval state](evidence/R04-12-approval-bypass.yml), [early G3](evidence/R04-07-g3-approval-deadlock.yml).

### PF-R04-02 — P1 — Signed G4 definition remains mutable without invalidation/versioning

At `Handoff · G4 Testing · APPROVED`, Brief allowed changing name, launch date and pack weight. Changing `480 g → 500 g` left the signed approval and all approval criteria valid while FG Core and the locked recipe still said `480 g`. No reapproval or new version was requested.

- Expected: edits after formal approval are frozen, versioned, or atomically invalidate downstream approval/readiness.
- Actual: the same approved identity temporarily represented three contradictory weights. Restoring values was also accepted without an approval event.
- Impact: Planning/label/cost/BOM consumers can use different physical definitions under one still-valid signature.
- Evidence: [controlled mutation and restoration](evidence/R04-14-post-approval-mutation.yml).

### PF-R04-03 — P1 — C025 gate-truth fix is incomplete: modal and server still disagree

Four independently reproduced manifestations share one truth-source defect:

1. G0 modal said no blockers after the visible checklist, then the server revealed a hidden duplicate Runs/week requirement.
2. G2 modal said no blockers with zero ingredients, then the server blocked the write.
3. several operational-stage modals displayed `G3 → G3` while successful actions moved to a different stage;
4. Handoff launch modal said `0 of 0 required` / `No blockers`, then server returned missing Compliance documents.

The prior catastrophic G0→G3 skip is fixed, but the deployed UI still does not render the authoritative server readiness it submits against. This is a **regression/partial closure of C025**, not a duplicate claim that the old direct jump remains.

### PF-R04-04 — P1 — Required stage evidence is an unauthenticated soft override

When the server listed missing Production line/Yield/Rate and checklist evidence, a plain-text “Override and advance” note permitted the next stage. There was no e-sign, second actor or reason category. Source confirms [`advance-project-gate.ts`](../../../../apps/web/app/(npd)/pipeline/_actions/advance-project-gate.ts) places required checklist/fields in `SOFT_GATE_BLOCKED` and accepts `override.note`.

This contradicts PRD §17.6, where required unfinished rows are blockers and advancement is disabled. Audit logging a bypass does not make a required control optional.

### PF-R04-05 — P1 — “Margin vs target price” displays revenue, not margin

With cost `£0.50/kg`, pack `0.480 kg`, target `£2.50/pack` and `500` packs/batch:

| Measure | Correct margin | UI “Margin” |
|---|---:|---:|
| per kg | `£5.208333… − £0.50 = £4.708333…` | `£5.20` |
| per pack | `£2.50 − £0.24 = £2.26` | `£2.50` |
| per batch | `£1250 − £120 = £1130` | `£1250` |

The values are target revenue, not profit. [`compute-waterfall.ts`](../../../../apps/web/lib/costing/compute-waterfall.ts) deliberately stores the cumulative target price in the step named `Margin vs target price`; the adapter then renders it verbatim as the margin row.

### PF-R04-06 — P1 — Expected yield `0%` is treated as no loss

Recipe showed raw `£0.50/kg` and “After yield (0%) £0.50/kg”. Zero output yield cannot have a finite unchanged unit cost; it must be rejected or represented undefined/infinite. [`recompute-calc.ts`](../../../../packages/domain/src/formulation/recompute-calc.ts) explicitly substitutes raw cost when `yieldPctDec.isZero()`, explaining the browser result.

### PF-R04-07 — P1 — Handoff reports “All gates pass” while two release gates fail

All six checklist flags can be manually checked without linked evidence. Once checked, status becomes `Ready to promote. All gates pass`, although `Active shared BOM with lines` and `Factory spec approved` remain `Not met`, the destination BOM is empty and Release is disabled.

The server-side disabled Release is the safe part; the readiness headline and unaudited claims are false and can mislead a manager into believing the release package is complete.

### PF-R04-08 — P1 — Locked NPD formulation cannot generate the production BOM

After locking the 100% flour formulation, **Generate production BOM** returned `{"ok":false,"error":"persistence_failed"}`. No destination header/version/lines appeared and no actionable cause was shown. This blocks the normal Handoff path and needs runtime-log correlation for the exact failing statement.

### PF-R04-09 — P1 — E-sign history says Valid but exposes an empty certificate/hash

Both signed approvals show the e-sign icon and `Valid — Signature verified`, yet expanded **Certificate ID** has an empty value. PRD §17.7 requires the e-signature hash to be visible/expandable for BRCGS audit traceability. Raw timestamptz strings are also exposed, but the missing immutable identifier is the substantive defect.

### PF-R04-10 — P1 — Deleting an NPD project orphans its Technical sensory record

Deleting `NPD-021` correctly removed the project and archived `FG-021` to Blocked. The Technical sensory evaluation remained, however, as subject `e60aa78f-…`, Type Project, Pass, with **Edit** but no delete/void. Its schema stores `subject_ref` as text and has no parent FK, so the delete action cannot discover it automatically.

This is distinct from old C027: the FG is no longer Active. The new defect is cross-module referential integrity and cleanup/audit discoverability.

### PF-R04-11 — P2 — Clone mode can reach an unexplained dead Review

Choose Clone, leave source unselected, and continue. Review is reachable, Create is disabled, and no validation message or link identifies the missing source. A user can only guess to go back.

### PF-R04-12 — P2 — Trial/pilot validation and corrective CRUD are incomplete

- Trial `101%` and Pilot `100.01%` are correctly rejected server-side but both surface only `Could not save`.
- A persisted trial offers Edit/Re-book only; there is no void/delete operation and no cancel/unbook for line time.
- This is especially inconsistent after G4 approval because the supposedly approved trial remains editable while a mistaken booking cannot be explicitly reversed.

Decimal persistence itself passes: `12.345 × 52.35% = 6.4626075 kg`, and pilot `25.555 kg × 100% = 25.555 kg` with no drift.

### PF-R04-13 — P2 — Sensory ownership/read-only and benchmark semantics contradict the data

Technical labels the screen “Read-only” while exposing **Record evaluation** and **Edit**. In NPD, scores average correctly to `7.33` and deltas average `+0.5`, but the summary says `Below benchmark (7.3)` because any single negative attribute forces the whole result negative. [`sensory-screen.tsx`](../../../../apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/sensory/_components/sensory-screen.tsx) confirms that algorithm and interpolates the overall score, not a benchmark/delta, into the verdict.

### PF-R04-14 — P3 — NPD exposes stale navigation and raw/untranslated audit copy

- Successful advances repeatedly remained on the previous route until a later navigation.
- approval/checklist history exposes raw PostgreSQL timestamps such as `2026-07-17 09:13:14.821+00` instead of locale/civil-time formatting;
- English locale surfaced Polish costing fallback messages.

These are lower-severity truth/locale defects, consolidated because none altered the underlying persisted state.

## Calculation checks

| Calculation | Manual | UI | Verdict |
|---|---:|---:|---|
| Ingredient raw cost/pack | `0.480 kg × £0.50/kg` | `£0.24` | PASS |
| Raw cost/batch | `500 × £0.24` | `£120.00` | PASS |
| Revenue/kg | `£2.50 / 0.480` | `£5.20` (2dp) | PASS as revenue |
| Margin/pack | `£2.50 − £0.24` | `£2.50` under margin label | **FAIL** |
| Trial output | `12.345 × 0.5235` | source values persisted; `6.4626075 kg` | PASS |
| Pilot ingredient | `25.555 × 100%` | `25.555 kg` | PASS |
| Sensory score average | `(8+7+9+6+7+7)/6` | `7.33` | PASS |
| Sensory delta average | `(1+0+2−1+0+1)/6` | verdict “Below benchmark” | **FAIL semantics** |

## Dedupe and prior-fix verification

| Prior item | Result |
|---|---|
| C025 honest NPD gate sequence | **PARTIAL REGRESSION** — no direct G0→G3 jump, but client/server readiness and transition labels still diverge; PF-R04-01/03/04 are new deployed manifestations. |
| C026 canonical FG name | **PASS for eventual name synchronization** during the controlled rename; pack-weight propagation remains a separate PF-R04-02 defect. |
| C027 delete project / linked FG | **PASS** — `FG-021` was archived to Blocked. PF-R04-10 concerns a different Technical sensory child. |
| C028 price scale | PASS — target price remained `£2.50`; no >2dp value was committed. |
| C037 concrete pilot-WO error | **PASS** — UI named `ING-FLOUR: SUPPLIER_SPEC_NOT_ACTIVE`. |
| C030/C033/WIP recursion and costing | Not applicable to this one-level flour recipe; later WIP runs cover it. |

## Cleanup and retained artifacts

- Deleted pilot plan and verified the empty state.
- Unchecked the five intentionally false Handoff flags and verified persistence before project deletion.
- Restored project name, launch date and `480 g` pack weight before deletion.
- Deleted `NPD-021` through visible UI; direct route now returns Page not found.
- `FG-021` remains **Blocked** by the fixed child-archive behavior.
- Technical sensory row for subject UUID `e60aa78f-f093-48dc-baf3-50e312af783b` remains as the reproduced orphan; the UI has no delete/void action.
- Gate approvals are designed to survive project deletion through snapshot fields/`ON DELETE SET NULL`; this run did not use database access to claim their live row contents after deletion.

## Limitations

- Terminal Launch/Release was not forced: the server correctly blocked missing compliance documents and the Release button was disabled for missing BOM/spec.
- Exact SQL root cause of the BOM `persistence_failed` requires production runtime logs; no inference is presented as proof.
- A second user was not used; the org's displayed NPD chain was single-approver, so this run does **not** misclassify same-user approval as the separate S22 Technical dual-sign issue.
