# B-3 Catch-Weight Output Registration — Parity Evidence

## Prototype anchor

- `prototypes/design/Monopilot Design System/production/modals.jsx:168-206`
  (`data-prototype-label: catch_weight_modal`, verified: file has 678 lines).
- Index: `_meta/prototype-labels/prototype-index-production.json` →
  `catch_weight_modal` (component_type: modal, ui_pattern:
  crud-form-with-validation).

## Structural parity (prototype → translation)

| Prototype region (modals.jsx) | Translation (action-modals.tsx OutputModal) |
| --- | --- |
| Info alert "Each unit scanned captures its actual weight…" (181-184) | `sectionHint` copy under the per-unit section title |
| Read-only "Nominal" field (188) | Product identity is already read-only; nominal driven by `netQtyPerEach` snapshot (shown via the existing conversion preview, not duplicated) |
| "Captured units: 14 / 24 · Running total 34.82 kg · Avg · Variance" (192) | Live `Σ {total} kg` sum line (`wo-output-catch-sum`); N is driven by the qty field |
| Per-unit numbered grid `#1 … 2.48` (193-200) | N compact decimal inputs `wo-output-catch-weight-{i}`, aria-label "Unit {n}" |

## Documented deviations

1. **Scanner-stream affordances dropped** — the prototype's "Send remaining
   captures to scanner device" link (203+) and MQTT streaming are OUT OF SCOPE
   (hard rule: no `scanner/**`). The desktop modal captures all weights inline.
2. **Avg / Variance not surfaced in the modal** — the service
   (`register-output.ts`) computes avg/variance/`warning` server-side from the
   posted array and persists them to `catch_weight_details`; the modal shows the
   live `Σ` sum only (count is implicit from N). No backend change was made.
3. **N is operator-driven** — the prototype hard-codes "/ 24" (configured lot
   count). Here N derives from the qty (units) field; the base-uom fallback
   (textarea, one weight per line) covers items where N is unknown up front.
4. **Dynamic-list cap = 50** — beyond 50 units the per-unit grid is replaced by
   an honest `tooMany` message (`wo-output-catch-toomany`) rather than rendering
   hundreds of inputs.

## Service contract (verbatim, unchanged)

`lib/production/output/register-output.ts:306-339` — for `item.weight_mode ===
'catch'` it REQUIRES `catch_weight_kg_per_unit` (array of decimal strings) and
throws `ProductionActionError('invalid_input', 422, { fields:
['catch_weight_kg_per_unit'] })` when absent/empty, OR when a 'fixed' item
receives weights. Tolerance is a soft `warning` flag — NOT an error. There is no
server-side count-vs-qty mismatch. The modal surfaces `invalid_input` verbatim
via the existing `mapError` mechanism and enforces count==N client-side.

## Five UI states

- loading — `Submitting…` on confirm (modal shell default; busy disables inputs).
- empty — `state-empty.html` (catch section visible, no per-unit inputs until qty).
- error — `state-error.html` (verbatim `invalid_input` → role="alert" banner).
- permission-denied — `outputWrite` RBAC gate hides the trigger server-side
  (`WoActionTrigger`); covered by `wo-actions.test.tsx`. Never client-trusted.
- optimistic — `state-optimistic-filled.html` (N inputs + live `Σ 7.490 kg`).
- over-cap — `state-over-cap.html` (honest "too many units" message).

## How weightMode reaches the modal

`items.weight_mode` → `get-work-order-detail.ts` header SELECT (`i.weight_mode`)
→ `WoDetailHeader.weightMode` → `wo-detail-screen.tsx` `outputUom.weightMode`
→ `WoActionsProvider` → `OutputModal` `snap.weightMode` → `isCatch`.

## Test + a11y

- RTL behaviour: `output-uom.test.tsx` (16 pass, 7 catch-weight cases).
- Evidence: `catch-weight-evidence.test.tsx` (5 pass — per-state HTML + a11y).
- a11y: `a11y-report.json` (RTL role/accessible-name substitute; jest-axe out of
  scope, same documented blocker as allergen-panel.evidence + T-040).
- E2E stub: `e2e/production-wo-actions.spec.ts` "B-3 catch-weight" (skips without
  `PLAYWRIGHT_BASE_URL`; RTL is the accepted fallback per the spec contract).
