# Gate screen parity checklist — T-111 (wiring) / T-112 (browser parity)

Prototype source (literal anchor, verified `wc -l` = 616):
`prototypes/design/Monopilot Design System/npd/gate-screens.jsx:106-616`

Index entries (`_meta/prototype-labels/prototype-index-npd.json`):
- `gate_checklist_panel` — 106-258
- `advance_gate_modal` — 261-377
- `gate_approval_modal` — 378-522
- `approval_history_timeline` — 525-616

Production route: `/[locale]/(app)/(npd)/pipeline/[projectId]/gate`
(RSC `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/gate/page.tsx`
+ client orchestrator `…/gate/_components/gate-screen.tsx`).

## Evidence sources

- LIVE browser capture (T-112): `apps/web/e2e/npd-gate-screen.spec.ts` — runs against a
  PLAYWRIGHT_BASE_URL preview with an authenticated session; writes screenshots +
  `axe-*.json` here and a Playwright trace to `apps/web/e2e/artifacts/T-111/trace.zip`.
  SKIPPED in this isolated worktree (no preview/auth) — confirmed `1 skipped`.
- FALLBACK (accepted per `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`):
  per-state composed DOM snapshots at `_meta/parity-evidence/T-111/*.html`
  (panel-default, panel-with-blockers, advance-gate-modal, gate-approval-decision,
  gate-approval-esig, approval-history-expanded, permission_denied, empty), plus the
  per-slice DOM evidence at `_meta/parity-evidence/T-107`, `…/T-109`,
  `apps/web/e2e/parity-evidence/T-108`, and `apps/web/e2e/artifacts/T-110`.

## Parity rows

| # | Row | Prototype lines | Status | Note |
|---|-----|-----------------|--------|------|
| Structural |
| S1 | GateChecklistPanel: overall progress card + per-gate collapsibles + category sub-headers + footer CTA | 106-258 | ✅ | Translated to Card/Checkbox/Badge/Button (T-107); composed into the route by T-111. |
| S2 | AdvanceGateModal: gate-transition card + checklist summary + blockers + notes + confirm | 261-373 | ✅ | shadcn Modal/Textarea/Badge (T-108); mounted as a sibling, opened via panel `openModal('advanceGate')`. |
| S3 | GateApprovalModal: project header + transition + checklist progress + decision radios + notes + e-sign overlay | 378-522 | ✅ | Modal step machine decision→esign→submitted (T-109); opened via panel `openModal('gateApproval')`. |
| S4 | ApprovalHistoryTimeline: reverse-chron vertical timeline + status pills + e-sign disclosure | 525-616 | ✅ | Card/Badge + `<time>` + signature disclosure (T-110); rendered in the route aside. |
| Visual |
| V1 | Density/spacing/component family match prototype | 106-616 | ✅ | Same primitive family; per-state DOM snapshots captured. |
| V2 | Semantic state colours pair with glyph + text (never colour-only) | 106-616 | ✅ | a11y rule held by all four slices. |
| Interaction |
| I1 | Panel advance CTA dispatches AdvanceGateModal vs GateApprovalModal by `requiresApproval` | 106-258 | ✅ | Asserted in gate-screen.test.tsx AC2 (G2→advance, G3→approval). |
| I2 | Approve path requires e-signature (password + confirm) | 378-522 | ✅ | Approve schema requires password; reconciliation test proves it. |
| I3 | Reject path records reason WITHOUT password / e-signature | 378-522 | ✅ | T-111 reconciliation; integration test proves reject sans password + no e_sign_log. |
| I4 | After advance/approve/reject, the timeline revalidates | 525-616 | ✅ | `router.refresh()` on success; asserted AC3. |
| I5 | Five UI states (loading/empty/error/permission_denied/ready) + optimistic | 106-616 | ✅ | Panel + timeline states; permission_denied + empty snapshots captured. |
| Data |
| D1 | Real org-scoped Supabase data via T-057 getProject + withOrgContext (no mocks) | n/a | ✅ | RSC loader maps getProject → props; DB read only in the RSC (risk red-line held). |
| D2 | RBAC resolved server-side (advance/approve action injected only when permitted) | n/a | ✅ | `npd.gate.advance` / `npd.gate.approve` gates; never client-trusted. |
| Accessibility |
| A1 | axe-core 0 violations on route + each modal-open state | 106-616 | ⏳ live | Captured by the Playwright spec on the preview run; fallback = a11y semantics asserted in RTL. |

## Deviations

- D-1: Live Playwright screenshots + axe JSON (T-112) are produced only on a
  PLAYWRIGHT_BASE_URL preview with auth; in the isolated worktree the spec SKIPS and the
  RTL/DOM snapshots above are the accepted fallback (policy §"if Playwright is unavailable").
- D-2: GateApprovalModal uses a native radio group for approve/reject (no RadioGroup
  primitive in `@monopilot/ui`; adding a Radix primitive there is out of scope). Native
  inputs carry full a11y semantics and are not a red-line (only raw `<select>` is). (T-109)
