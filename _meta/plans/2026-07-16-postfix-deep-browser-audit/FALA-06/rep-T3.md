# FALA 6 / TOR T3 — Printers RSC boundary (R02-02)

**Task:** `[R02-02 · P1]` Settings → Printers route crashes at RSC boundary due to inline closure on `deletePrinter`.

## Fix

### Signature mismatch

- **Server action** (`_actions/printers.ts`): `deletePrinter({ id: string })`
- **Client consumer** (`printers-screen.client.tsx:255`): `deletePrinter(deleteTarget.id)` — expects `(printerId: string) => Promise<void>`

Passing `removePrinter` by reference would leave the client calling `deletePrinter(uuid)` while the action expects `{ id: uuid }`.

**Resolution:** Named inline server action in `page.tsx` (same pattern as `settings/sites/page.tsx:119-122`):

```tsx
async function deletePrinterAction(printerId: string): Promise<void> {
  'use server';
  return removePrinter({ id: printerId });
}
```

Passed as `deletePrinter={props.deletePrinter ?? deletePrinterAction}` — reference to a `'use server'` function, not a JSX inline arrow.

### What was broken

`page.tsx:216` previously had:

```tsx
deletePrinter={props.deletePrinter ?? ((printerId: string) => removePrinter({ id: printerId }))}
```

That arrow is a plain closure → loses `'use server'` identity → Next.js error *"Functions cannot be passed directly to Client Components"* → global error boundary on every render/retry.

## Other props audit (serializable?)

| Prop | Value | OK? |
|------|-------|-----|
| `initialPrinters` | `loaded.printers` (array of plain objects) | ✅ |
| `sites` | `loaded.sites` (array of plain objects) | ✅ |
| `labels` | `buildLabels(locale)` (plain string record) | ✅ |
| `canManage` | boolean | ✅ |
| `state` | string union | ✅ |
| `upsertPrinter` | `props.upsertPrinter ?? persistPrinter` (module action ref) | ✅ |
| `deletePrinter` | was inline closure → **fixed** | ✅ after fix |

No other non-serializable props found on this route.

## Tests added (not run — orchestrator gate)

- `page-rsc.test.ts` — source contract: named `deletePrinterAction`, no inline closure; `upsertPrinter` by ref; data props only
- `page.test.tsx` — delete flow via injected `deletePrinter`; combined list/empty/error render without boundary crash

## Uncertainties

- Inline `'use server'` actions declared inside the page component are the established repo pattern (`sites/page.tsx`); not re-verified against a live Next.js 16 deploy in this lane.
- Delete-button copy for the confirm CTA (`confirmDelete` label) was assumed from i18n keys — not manually checked against `en.json` in this pass.
- Whether production error digest `3974216983` maps 1:1 to this closure (diagnosis is from static analysis + sibling-route precedent, not a reproduced prod stack trace here).
