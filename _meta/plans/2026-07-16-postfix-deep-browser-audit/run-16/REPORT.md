# Run 16 — Quality containment, NCR and traceability

Date: 2026-07-18  
Target: `https://monopilot-kira.vercel.app`  
Expected deployment: `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm`  
Expected SHA: `2eb57cf7b90c23d4c55afeb01116eaabc3250385`  
Marker: `NIGHT-R16-20260718T0728Z`

## Verdict

**FAIL — 3 P1, 2 P2 and 1 P3 findings.** The core PO → GRN → LP setup, quality-spec approval, failed-inspection e-sign, segregation-of-duties guard, multiple-hold invariant and final NCR immutability worked. However, the inspection result endpoint accepted an operator-selected PASS for a numerically out-of-spec result, the promised failed-inspection containment automation did not create a hold or NCR, and the manual NCR form could not establish traceability links.

This was a production browser walk using only records created during this run. No product code or database state was edited outside the application UI.

## Scenario ledger

| ID | Scenario | Result | Evidence / observation |
|---|---|---:|---|
| SC-R16-01 | Login and production navigation | PASS | Production UI loaded and authenticated; live data was available. |
| SC-R16-02 | PO → GRN → LP setup with exact quantities and cost | PASS | `PO-R16-0728` → `GRN-20260718-0003` → `LP-1784360222874-WVBX`; 10 kg received, £40.00 total. |
| SC-R16-03 | Incoming RM specification create, review and e-sign approval | PASS | Spec `NIGHT-R16-IN-BUTTER` v1; Incoming selector included RM-BUTTER; approved and Active. |
| SC-R16-04 | Blank actual-value validation | FAIL | Save was blocked, but operator received raw Zod JSON/schema details rather than a field-level message (PF-R16-05). |
| SC-R16-05 | Four-decimal result-boundary enforcement | FAIL | `5.5001 pH` against max `5.5000 pH` was saved as PASS (PF-R16-01). |
| SC-R16-06 | Signed Fail decision → automatic containment | FAIL | Inspection became Failed and LP QA became Rejected, but no promised hold or NCR appeared after fresh revisits (PF-R16-02). |
| SC-R16-07 | Two holds on one LP, release one, preserve the other | PASS | Holds `HLD-00001027` and `HLD-00001028`; release of the latter left LP On hold. Same-user release of the former was blocked. |
| SC-R16-08 | Major NCR create → investigate → close → immutability | FAIL | Lifecycle persisted, but linkage was impossible and the post-close view was stale until hard refresh (PF-R16-03/04). |
| SC-R16-09 | HACCP/CCP execution | NOT RUN | Timeboxed closeout; no scenario was started and no claim is made. |
| SC-R16-10 | Recall drill | NOT RUN | Timeboxed closeout; no scenario was started and no claim is made. |
| SC-R16-11 | In-process and finished-goods inspection variants | NOT RUN | No owned WO was created in this run. |
| SC-R16-12 | Cross-site quality visibility | NOT RUN | Site-filter behavior was not exercised with controlled records. |

Counts: **12 planned; 8 attempted; 4 PASS; 4 FAIL; 0 BLOCKED; 4 NOT RUN.**

## Findings

### PF-R16-01 — P1 — Out-of-spec measurement can be persisted as PASS

**Area:** Quality inspections / numeric result gate  
**Record:** `INSP-00000014` (`606ac371-a5bc-4497-92f3-e5213d6f4e60`)  
**URL:** `/en/quality/inspections/606ac371-a5bc-4497-92f3-e5213d6f4e60`  
**Evidence:** [PF-R16-01-out-of-range-pass.png](evidence/PF-R16-01-out-of-range-pass.png)
and [root source trace](evidence/SOURCE-TRACE.md#pf-r16-01--numeric-result-is-trusted-from-the-client).

Reproduction:

1. Activate Incoming spec `NIGHT-R16-IN-BUTTER`, parameter `NIGHT-R16 pH`, min `4.5000`, target `5.0000`, max `5.5000`.
2. Create an Incoming inspection for owned LP `LP-1784360222874-WVBX`.
3. Enter actual `5.5001`.
4. Select the row result `Pass` and save.
5. Reopen/observe the saved inspection.

Actual: the UI reports `Results saved` and `Overall result PASS`.

Expected: the server derives or validates the result from the active specification bounds and rejects a PASS whenever actual is outside `[min,max]`. The client-selected outcome must not override the numerical gate.

Manual control: `5.5001 - 5.5000 = +0.0001 pH`; therefore the observation is strictly above the maximum.

Impact: a nonconforming incoming material can be accepted as conforming, bypassing containment and downstream quality gates.

Persistence: the PASS value and overall PASS banner remained after reopening the saved inspection; it changed only after the operator explicitly corrected the row to Fail.

### PF-R16-02 — P1 — Signed failed inspection does not create the promised hold or NCR

**Area:** Quality inspection → warehouse/hold/NCR automation  
**Record:** `INSP-00000014`; LP `LP-1784360222874-WVBX`  
**URLs:** `/en/quality/inspections/606ac371-a5bc-4497-92f3-e5213d6f4e60`,
`/en/quality/holds`, `/en/quality/ncrs`  
**Evidence:** [SC-R16-03-failed-inspection.png](evidence/SC-R16-03-failed-inspection.png)
and [root source trace](evidence/SOURCE-TRACE.md#pf-r16-02--lp-fail-branch-does-not-create-a-hold).

Reproduction:

1. Correct the parameter result to Fail.
2. Save results.
3. Choose decision Fail and complete the e-signature with a note.
4. Revisit the inspection, LP detail, Quality Holds and NCR lists.

Actual:

- inspection is Failed and immutable;
- LP QA status changes to Rejected;
- the decision UI states that submitting Fail creates a hold;
- no new hold and no new NCR for the inspection/LP appears after fresh list revisits.

Expected: the signed Fail transition atomically creates the configured containment record(s), links them to the inspection and LP, and only then commits the failed decision.

Impact: rejected stock is not represented by the promised quality workflow, leaving containment and investigation dependent on an operator noticing the missing automation.

Persistence: the inspection and LP were revisited after the signed decision and both lists were freshly reopened; the owned hold/NCR remained absent.

### PF-R16-03 — P1 — Manual NCR creation cannot link the affected inspection, LP, product or hold

**Area:** NCR traceability  
**Record:** `NCR-00001006` (`6711c949-8d44-42da-9dec-129af62bf169`)
**URLs:** `/en/quality/ncrs`, `/en/quality/ncrs/6711c949-8d44-42da-9dec-129af62bf169`  
**Evidence:** [root source trace](evidence/SOURCE-TRACE.md#pf-r16-03--server-contract-supports-links-but-the-create-ui-omits-them).

Reproduction:

1. Open Create NCR after the owned inspection failed.
2. Inspect all create fields and create a Major NCR.
3. Open Linked records on the resulting NCR.

Actual: the create dialog only exposes type, severity, title, description and affected quantity. It has no product, inspection, LP, hold or source selector. The created record shows Product `—`, Hold `—` and Source reference `—`; placing identifiers in the description creates no functional links.

Expected: an NCR created from or for a failed inspection must support typed links to its source inspection, LP/product and applicable hold, with server-validated same-org relationships.

Impact: the investigation and audit trail cannot reliably answer which stock and failed inspection the NCR controls.

Persistence: reopening `NCR-00001006` showed Product `—`, Hold `—` and Source reference `—`; no later lifecycle action added the missing relationships.

### PF-R16-04 — P2 — NCR close succeeds but the detail view remains stale and writable until hard refresh

**Area:** NCR mutation revalidation  
**Record:** `NCR-00001006`
**URL:** `/en/quality/ncrs/6711c949-8d44-42da-9dec-129af62bf169`  
**Evidence:** [root source trace](evidence/SOURCE-TRACE.md#pf-r16-04--close-refresh-does-not-update-client-owned-status).

Reproduction:

1. Move the Major NCR to Investigating and save the investigation.
2. Close it with the e-signature.
3. Observe the same page before refreshing.

Actual: history immediately contains `quality.ncr.closed`, but the header still shows Investigating, edit controls remain active and Close remains available. A hard revisit changes the page to Closed and disables the fields.

Expected: a successful close mutation immediately revalidates/refetches the detail and disables all mutable controls.

Impact: the operator sees contradictory authoritative state and may attempt duplicate or invalid follow-up actions.

Persistence: the contradictory state survived the successful close response and RSC refresh; a hard revisit corrected it, confirming a client-state freshness defect rather than a failed close.

### PF-R16-05 — P2 — Blank inspection result exposes raw validation JSON to the operator

**Area:** Inspection result validation UX  
**Record:** `INSP-00000014`
**URL:** `/en/quality/inspections/606ac371-a5bc-4497-92f3-e5213d6f4e60`  
**Evidence:** [root source trace](evidence/SOURCE-TRACE.md#pf-r16-05--raw-zod-text-is-returned-and-rendered).

Reproduction:

1. Leave the parameter actual value blank.
2. Click Save results.

Actual: save is correctly rejected, but the alert begins `Could not save results:` and renders the raw Zod issue array, including `code`, `origin`, `path` and internal parameter indexes.

Expected: show a localized field-level message such as `Actual value is required`, while logging structured validation details only to diagnostics.

Impact: poor recovery UX and unnecessary exposure of internal validation structure.

Persistence: the same blank-value save path reproduced before a valid value was entered; no record mutation occurred.

### PF-R16-06 — P3 — Closed NCR repeats the signature-storage notice

**Area:** NCR closed-state copy  
**Record:** `NCR-00001006`
**URL:** `/en/quality/ncrs/6711c949-8d44-42da-9dec-129af62bf169`  
**Evidence:** [root source trace](evidence/SOURCE-TRACE.md#pf-r16-06--deployed-translation-already-contains-the-appended-notice).

Actual: after refresh, the closed state renders `SHA-256 signature stored.` twice.

Expected: render the notice once.

Persistence: the duplicate remained after hard refresh in the authoritative Closed state.

## Confirmed controls and calculations

- PO arithmetic: `10.000000 kg × £4.0000/kg = £40.00`; UI total was £40.00.
- Receipt reconciliation: ordered 10 kg, received 10 kg, outstanding 0 kg; created LP quantity was 10 kg.
- Spec activation: Draft → review → e-signed Active; active specification was immutable.
- Failed inspection: final measured value `5.5001 pH`, displayed Fail, signed decision persisted, inspection became immutable.
- SoD: creator of `HLD-00001027` could not release their own hold; the distinct-creator rule produced an explicit block.
- Multiple-hold invariant: releasing `HLD-00001028` (10/10 kg) did not free the LP while `HLD-00001027` remained Open; LP stayed On hold.
- NCR final-state guard: after a hard revisit, `NCR-00001006` was Closed and its investigation fields were disabled.
- Inspection-list arithmetic observed during setup: 5 passed of 7 total displayed 71%, consistent with `5/7 = 71.428…%` rounded to a whole percent.

## Artifacts and cleanup

| Artifact | Final state |
|---|---|
| `PO-R16-0728` | Received; immutable business record |
| `GRN-20260718-0003` | Completed |
| `LP-1784360222874-WVBX` | QA Rejected; On hold |
| `NIGHT-R16-IN-BUTTER` v1 | Active |
| `INSP-00000014` | Failed; e-signed; immutable |
| `HLD-00001027` | Open/Critical; intentionally retained because creator-release SoD blocked this operator |
| `HLD-00001028` | Released; 10/10 kg released |
| `NCR-00001006` | Closed; immutable after refresh |

No deletable draft was left behind. The retained rejected/on-hold state is the safest available production cleanup because releasing the remaining critical hold would require a distinct authorized user and should not be bypassed.

## Severity summary

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 3 |
| P2 | 2 |
| P3 | 1 |
| **Total** | **6** |

## Limitations

- HACCP/CCP, recall, in-process/finished-goods inspection and controlled cross-site variants were not started and are explicitly NOT RUN.
- Deployment ID/SHA are the run-dispatch target; the application UI does not expose an independent build identifier.
- Findings are browser-observed behavior. The root auditor added a read-only
  source trace for the exact production SHA; no product source was edited.
