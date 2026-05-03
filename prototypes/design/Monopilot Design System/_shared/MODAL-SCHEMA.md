# Modal pattern — Planning module (reusable across MonoPilot MES)

This doc describes the modal architecture used in the Planning prototype, so the real product can copy the pattern without re-inventing. All 10 modals in `modals.jsx` follow this contract.

---

## 1. Primitives (shared — build once, reuse everywhere)

All primitives live at the top of `modals.jsx`. In the real product, move them to a shared UI package.

### `<Modal/>` — base wrapper
```jsx
<Modal open={bool} onClose={fn} title="..." subtitle="..." size="default|sm|wide|fullpage" foot={<>...</>}>
  {body}
</Modal>
```
- Renders nothing when `open === false`.
- Backdrop (black 45%) closes on click (unless `dismissible={false}` — reserved for destructive confirms).
- ESC closes. First focusable auto-focuses.
- Size token → width: `sm` 420px, `default` 560px, `wide` 760px, `fullpage` 900px.
- Body scrolls when content > `max-height: 86vh`.

### `<Stepper/>` — wizard progress
```jsx
<Stepper steps={[{key:"supplier",label:"Supplier"},{key:"products",label:"Products"},{key:"review",label:"Review"}]} current="products" completed={new Set(["supplier"])} />
```
- Three visual states per step: `completed` (green check), `current` (blue filled), `upcoming` (gray outline).
- Horizontal on desktop, stacked on narrow.

### `<Field/>` — form field wrapper
```jsx
<Field label="Supplier" required help="Auto-fills currency & payment terms" error="Required">
  <select>...</select>
</Field>
```
- Standard label (uppercase, muted), help text below, error in red.
- `required` adds red asterisk after label.

### `<ReasonInput/>` — textarea with min-length
```jsx
<ReasonInput value={v} onChange={setV} minLength={10} placeholder="Explain why this override is necessary..." />
```
- Enforces minimum character count (visible counter).
- Used everywhere the spec says "reason (required, min N chars)" — V-PLAN-RES-003, V-PLAN-SEQ-003.

### `<Summary/>` — read-only review table
```jsx
<Summary rows={[{label:"Supplier", value:"Agro-Fresh"}, {label:"Total", value:"£12,400", emphasis:true}]} />
```
- Used in review step of wizards and final-confirm modals.

---

## 2. Naming convention

**File layout** — single `modals.jsx` per module, grouped by entity:
```
// PRIMITIVES
Modal, Stepper, Field, ReasonInput, Summary

// PO modals
POFastFlowModal, AddPOLineModal, POApprovalModal

// TO modals
LPPickerModal

// WO modals
WOCreateModal (imports CascadePreviewModal as sub-modal)

// Cross-cutting
ReservationOverrideModal, CycleCheckWarningModal, D365TriggerConfirmModal,
DeleteConfirmModal, HardLockReleaseConfirmModal
```

**Component naming** — `<Entity><Action>Modal`:
- `POFastFlowModal` not `CreatePOModal` — matches spec ID
- `DeleteConfirmModal` is generic (parameterized by entity)

---

## 3. State wiring — two valid patterns

### Pattern A — single switch at app root (chosen for production/)
```jsx
const [modal, setModal] = useState(null); // {name: string, data?: any}
const open = (name, data) => setModal({name, data});
const close = () => setModal(null);

return (
  <>
    <PageContent openModal={open} />
    {modal?.name === "poApprove" && <POApprovalModal data={modal.data} onClose={close} onConfirm={approvePO} />}
    {modal?.name === "delete" && <DeleteConfirmModal data={modal.data} onClose={close} onConfirm={del} />}
  </>
);
```

### Pattern B — co-located with trigger
```jsx
function POListRow({po}) {
  const [approveOpen, setApproveOpen] = useState(false);
  return (
    <>
      <button onClick={() => setApproveOpen(true)}>Approve</button>
      <POApprovalModal open={approveOpen} onClose={() => setApproveOpen(false)} data={po} onConfirm={approvePO} />
    </>
  );
}
```

**Use Pattern A** when multiple screens share a modal (Delete, LP Picker). **Use Pattern B** for one-off trigger/modal pairs tightly scoped to one row.

---

## 4. Pattern catalog — which modal type for which UX

| # | Pattern | When to use | Example (this module) |
|---|---|---|---|
| 1 | **Wizard** | Multi-step entry, >3 required fields, cross-entity validation | POFastFlow (3 steps), WOCreate (2 steps + sub-modal) |
| 2 | **Simple form** | Single-step create/edit | AddPOLine, TOCreate |
| 3 | **Dual-path** | Approve + Reject branching with different fields | POApproval, DraftWOReview (MODAL-16) |
| 4 | **Picker** | Search + select from large dataset | LPPicker (MODAL-06), ProductPicker |
| 5 | **Override with reason** | Break a rule, audit-logged | ReservationOverride, SequencingOverride |
| 6 | **Error dialog** | Validation failure w/ remediation links | CycleCheckWarning (single "Close" action) |
| 7 | **Confirm non-destructive** | High-stakes but recoverable | D365TriggerConfirm |
| 8 | **Confirm destructive (simple)** | Irreversible, type-to-confirm | DeleteConfirm |
| 9 | **Confirm destructive (with reason)** | Irreversible + audit + checkbox | HardLockReleaseConfirm |
| 10 | **Preview / compare** | Show predicted result before apply | SequencingPreview (MODAL-15, already in Sequencing screen), CascadePreview (sub-modal in WOCreate) |

---

## 5. Sizing + footer rules

| Pattern | Size | Footer |
|---|---|---|
| Simple form | `default` (560px) | `[Cancel] [Primary]` |
| Confirm | `sm` (420px) | `[Cancel] [Action/danger]` |
| Picker / Preview | `wide` (760px) | `[Cancel] [Confirm selection]` |
| Wizard | `wide` (760px) | `[← Back] ... [Cancel] [Next →]` or `[Submit/primary]` |
| Error dialog | `default` | `[Close]` (single action) |

**Primary button is always right-most.** Danger variants swap blue → red.
**Disable primary until validation passes** — don't let users submit broken data.

---

## 6. Validation surfaces

- **Inline per-field** — red text under field on blur or submit attempt.
- **Modal-level banner** — red alert at top of body for cross-field errors (e.g., "Shipment qty exceeds line qty").
- **Submit button** — disabled (gray) until all required fields + validators pass.
- **API errors** — red alert inside modal body with Retry button; do NOT close modal on error.

Every `V-PLAN-*` rule in the PRD must be enforced in at least one of these three places.

---

## 7. Accessibility baseline (port to real product)

- `role="dialog"` + `aria-modal="true"` + `aria-labelledby="modal-title-id"`
- ESC → close (except destructive confirm in mid-action)
- Focus trap: Tab cycles within modal
- Autofocus first focusable on open
- Return focus to trigger element on close
- Backdrop has `aria-hidden="true"`

In the real product, use **Radix Dialog** or **Headless UI Dialog** — both handle this for free.

---

## 8. Async submit states

Every submit button has three visual states:

| State | Visual |
|---|---|
| Idle | Normal styling |
| Loading | Spinner icon + disabled + "Creating…" / "Saving…" text |
| Error | Return to idle; red banner appears above footer |

Pattern:
```jsx
const [submitting, setSubmitting] = useState(false);
const [error, setError] = useState(null);
const submit = async () => {
  setSubmitting(true); setError(null);
  try { await api.create(payload); onClose(); toast.success(...); }
  catch (e) { setError(e.message); }
  finally { setSubmitting(false); }
};
```

**Never auto-close on error.** User must see what went wrong and retry.

---

## 9. Port to real code

| Prototype | Real product |
|---|---|
| `<Modal/>` primitive | **Radix Dialog** or **Headless UI Dialog** |
| `useState` for form data | **React Hook Form** + **Zod** schema per V-PLAN-* rule |
| Inline validation | `zod.string().min(5).max(200)` |
| Toast on success | **Sonner** / **react-hot-toast** |
| `Object.assign(window, {...})` | ES modules (`export { POFastFlowModal }`) |
| Mock data in JSX | TanStack Query hooks hitting `/api/planning/*` |

Each modal component in `modals.jsx` ships a `data` prop + `onConfirm(payload)` callback — in the real product, `onConfirm` becomes the mutation trigger. Keep the modal UI pure (no direct API calls inside) — that way it's trivially testable with Storybook.

---

## 10. Checklist before shipping any new modal

- [ ] Uses `<Modal/>` primitive — no custom backdrop
- [ ] Follows naming: `<Entity><Action>Modal`
- [ ] Props: `open` (bool), `onClose` (fn), `data?` (obj), `onConfirm?` (fn)
- [ ] Size chosen per §5
- [ ] Footer chosen per §5
- [ ] Every required field uses `<Field required/>`
- [ ] Every "reason" field uses `<ReasonInput minLength={N}/>`
- [ ] Primary button disabled until valid
- [ ] Async submit has loading + error states
- [ ] V-PLAN-* rules surfaced per §6
- [ ] Accessibility props present (§7)
- [ ] Added to modal gallery for manual QA
