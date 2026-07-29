# FALA-11 / T2 — NCR linkage + post-close immutability

## PF-R16-03 — NCR create did not persist typed links

### Root cause
`createNcr` already accepted `referenceType`, `referenceId`, `productId`, and `linkedHoldId` (`ncr-actions.ts:561-625`), but `ncr-create-modal.client.tsx:139-146` submitted only type/severity/title/description/qty. The server wrote NULL links because the UI never sent them — not a schema gap.

### Changes (file:line) and why
| File | Lines | Why (root cause) |
|---|---|---|
| `lookup-actions.ts` | +`searchInspectionsForNcr`, +`searchHoldsForNcr`, `LpLookupResult.productId` | Human-readable pickers resolve org-scoped UUIDs (audit defect #4 pattern); LP rows now expose `product_id` for client prefill. |
| `ncr-actions.ts` | `createSchema` refine, `assertNcrCreateLinks`, `resolveNcrLinkedProductId`, `createNcr` pre-insert validation | Server validates same-org references/holds/products **before** INSERT; auto-fills `product_id` from inspection/LP/WO when omitted. |
| `ncr-create-modal.client.tsx` | full rewrite of submit + link pickers | Wires inspection/LP source, product, and hold into `createNcr` payload. |
| `ncr-list.client.tsx` / `ncrs/page.tsx` | pass lookup/search actions into modal | Page supplies real server reads (`searchLps`, `searchInspectionsForNcr`, `searchHoldsForNcr`, `searchItems`). |
| `labels.ts` + `_meta/i18n-staging/quality-ncrs.json` | `createModal.lookup.*` | Staged i18n for new picker copy (loader reads staging bundle). |

No migration (`539-*.sql`) required — `ncr_reports.reference_type/reference_id/product_id/linked_hold_id` already exist (`schema.sql:9306-9328`).

## PF-R16-04 — Closed NCR stayed editable until hard refresh

### Root cause
`ncr-detail.client.tsx:152-156` copied server `status` into client state once. `onClosed` only called `router.refresh()` (`:508-509`); RSC refresh does not reset client island state, so header stayed `investigating` and save/close controls remained until remount.

Server-side immutability for investigation was already present (`updateNcrInvestigation` filters `status not in ('closed','cancelled')` at `:685-686`).

### Changes (file:line) and why
| File | Lines | Why (root cause) |
|---|---|---|
| `ncr-detail.client.tsx` | `closedAt`/`closureSignatureHash` state; `onClosed` sets `status='closed'` + banner fields | Immediate UI lock after successful close without waiting for remount. |
| `ncr-close-modal.client.tsx` | `onClosed` passes `{ status, closedAt, signatureHash }` from action result | Detail island can update authoritative fields synchronously. |

`safeRevalidateNcrRoutes` already uses `revalidateLocalized('/quality/ncrs/${id}')` without route-group segments — no revalidatePath no-op fix needed in this lane.

## Tests added (dry-run; orchestrator runs gate)

| Test file | What would fail without the fix |
|---|---|
| `lookup-actions.test.ts` — `searchInspectionsForNcr` / `searchHoldsForNcr` | New reads would 404-wrong-table or return empty shapes. |
| `ncr-actions.test.ts` — create persists `referenceType/referenceId/productId/linkedHoldId` bind positions | INSERT would still omit link columns (old `[8]` qty-only assertion). |
| `ncr-actions.test.ts` — `ncr_reference_not_found` | Missing validation would allow orphan references. |
| `ncr-actions.test.ts` — closed investigation rejected | Would pass if terminal guard removed. |
| `ncrs.test.tsx` — create modal submits typed links | Modal would still call `createNcr` without `referenceType`/`linkedHoldId`. |
| `ncrs.test.tsx` — close immediately locks detail | Status would stay `Investigating` and close/save buttons would remain after mock close success. |

## Consciously NOT touched
- **PF-R16-01/02/05/06** (inspection numeric gate, fail→hold/NCR side effects, Zod UX, i18n banner duplication) — other FALA-11 lanes.
- **NCR detail linked-record display** beyond existing sidebar — read path already shows `referenceType`/`linkedHoldId` when populated.
- **`apps/web/i18n/{en,pl,ro,uk}.json`** — NCR namespace still loaded from `_meta/i18n-staging/quality-ncrs.json` per `qa-ncrs-labels.ts`.
- **Migration 539** — not needed; columns and CHECK on `reference_type` already deployed.

## Out-of-scope findings (report only)
- **`batch` / `po` / `supplier` NCR reference types** — validated server-side if passed, but create UI only exposes inspection + LP (covers audit scenario SC-R16-08). Extending picker to all `reference_type` enum values is follow-up UX.
- **`pickLp` product chip** uses `name: itemCode` when only code is known from LP search — cosmetic; server still resolves `product_id` from LP on insert.
