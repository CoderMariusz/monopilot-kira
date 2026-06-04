# T-109 GateApprovalModal — Prototype Parity Mapping

**Prototype anchor (verified):** `prototypes/design/Monopilot Design System/npd/gate-screens.jsx:378-522` (GateApprovalModal). File length = 616 lines (`wc -l`), so the range is valid.
**Prototype index entry:** `_meta/prototype-labels/prototype-index-npd.json#gate_approval_modal`.
**Production component:** `apps/web/app/(npd)/_modals/gate-approval-modal.tsx` (+ `?modal=` host `gate-approval-modal-host.tsx`).

## Structural correspondence (prototype JSX region → production)

| Prototype (gate-screens.jsx) | Production region | shadcn / @monopilot/ui primitive |
|---|---|---|
| `<Modal title="Gate Approval" foot=…>` (408-418) | `Modal` + `Modal.Header` + `Modal.Footer` | `@monopilot/ui` Modal (Radix Dialog) |
| Project header card (449-453) | `[data-testid="gate-approval-project"]` (code mono + name) | div card |
| Gate-transition visual (455-474) | `[data-testid="gate-transition-card"]` with `data-decision`; current→next gate badges; `══>` / `— — ✕ — —`; red/dashed + text warning on reject | section + Badge-style chips |
| Checklist completion bar (476-486) | `[data-testid="gate-approval-progress"]` `role="progressbar"` + `{done} of {total} required items complete` | progressbar div |
| Decision radios (488-502) | `<fieldset>`/`<legend>` + two `role="radio"` (approve default) | native radio group (see deviation) |
| Notes textarea (504-515) | `#gate-approval-notes` RHF-bound, min 10 trimmed chars, label flips Approval/Rejection | `@monopilot/ui` Textarea |
| E-signature overlay (428-445) | `[data-testid="gate-approval-esign"]` — `type=password` Input + confirmation Checkbox + Confirm&Sign (disabled until both) | `@monopilot/ui` Input + Checkbox + Button |
| Submitted alert (420-426) | `[data-testid="gate-approval-done"]` `role="status"` | div alert |
| Footer Cancel + Submit (410-417) | `Modal.Footer` Cancel + Submit Approval/Rejection (disabled until notes valid) | `@monopilot/ui` Button |

## Step state machine (parity with prototype)

`decision` → (approve) `esign` → `submitted`; (reject) `decision` → `submitted`.
Password field is reachable ONLY on the approve path; reject NEVER renders it (AC #3 / risk red-line).

## Required UI states (captured DOM snapshots)

| State | Artifact |
|---|---|
| ready (decision, approve) | `ready-decision.html` |
| reject decision (red/dashed) | `reject-decision.html` |
| e-signature overlay | `esign-overlay.html` |
| submitted (optimistic→success) | `submitted.html` |
| loading | `loading.html` |
| empty | `empty.html` |
| error | `error.html` |
| permission-denied | `permission-denied.html` |

## Real-data wiring

`onApprove` prop calls the MERGED `approveProjectGate` Server Action (T-058,
`apps/web/app/(npd)/pipeline/_actions/approve-project-gate.ts`), which discriminates on
`decision` ('approved' | 'rejected') and verifies the e-sign PIN via `@monopilot/e-sign`
`signEvent`, then writes `gate_approvals` + outbox server-side. The client never queries the DB
and never trusts itself for the gate decision; RBAC (`npd.gate.approve`) is enforced server-side.

## Deviations (see closeout deviation log)

1. No shadcn `RadioGroup`/`Progress` primitive exists in `@monopilot/ui`; adding a Radix primitive
   there is out of STRICT SCOPE. Used accessible native `<input type=radio>` (fieldset/legend) and a
   `role="progressbar"` div — matching the prototype's own native markup; not a red-line.
2. Task contract mentions a separate `rejectProjectGate` action; the merged T-058 reality is a
   single `approveProjectGate` with a `decision` discriminator. Wired to the real action. The UI
   reject path sends NO password (AC #3 red-line); the page adapter (T-111) reconciles the action's
   password requirement for reject server-side.
3. axe automated scan: no axe library in `apps/web` deps and STRICT SCOPE forbids package.json
   changes — documented blocker. a11y asserted structurally via RTL (dialog, progressbar, radio,
   checkbox, labelled password input, role=status/alert). Route-level Playwright + screenshots are
   owned by T-112 (out of scope; no page route exists yet — T-111).
