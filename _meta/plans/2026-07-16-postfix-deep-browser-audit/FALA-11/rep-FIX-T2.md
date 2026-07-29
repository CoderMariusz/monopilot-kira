# FALA-11 / FIX-T2 — NCR linkage review fixes

## Root-cause fixes (file:line → why)

| File | Change | Root cause |
|---|---|---|
| `ncr-create-modal.client.tsx:36-37` | `SOURCE_REF_TYPES = ['inspection','lp'] as const satisfies readonly NcrReferenceType[]` + narrowed `NcrCreateSourceRefType` | Array was typed as full `NcrReferenceType[]`, so `.map(rt => changeSourceRefType(rt))` widened to 9-value union and broke TS2345/TS7053 against the 2-option handler/labels. UI intentionally exposes only inspection+LP — narrow the const, don't fake the other seven types. |
| `lookup-actions.ts` (+`searchProductsForNcr`) | Named `'use server'` product search for NCR create picker | `ncrs/page.tsx:112` passed an inline RSC closure to a client island → Next.js serialization failure on `/pl/quality/ncrs`. Mirrors Fala-6 Printers pattern: pass a real Server Action reference. |
| `ncrs/page.tsx:28-32,111` | Import + pass `searchProductsForNcr` directly; removed `searchItems` closure | Same RSC→client function serialization bug. |
| `ncr-actions.ts:187-270` | `assertNcrCreateLinks`: resolve source product first; throw `ncr_product_reference_mismatch` on conflict; add `batch`→`wo_outputs`, `supplier`→`suppliers` validation branches; extend `resolveNcrLinkedProductId` for `batch`/`grn` | Server only checked product existence, not consistency with inspection/LP — audit trail could pair wrong product. Guard also returned `ncr_reference_not_found` for legal `batch`/`supplier` refs because SQL union lacked those branches. |
| `_meta/i18n-staging/quality-ncrs.json` `pl.createModal.lookup` | Full Polish lookup block | Loader fell back to EN for all new picker strings on `/pl/quality/ncrs`. |
| `apps/web/i18n/pl.json` `quality.ncrs.createModal.lookup` | Mirror Polish lookup keys | Second translation catalog kept in sync for eventual next-intl merge. |

## Tests rewritten / added (what fails without the fix)

| Test | Would fail without fix because |
|---|---|
| `ncr-actions.test.ts` — *auto-fills product_id from the inspection source when the client omits productId* | Replaces old bind-position test that passed even when UI never sent links. Asserts INSERT `$7` (index 6) is auto-resolved `PRODUCT_ID` with **no** `productId` in input — old code left NULL. |
| `ncr-actions.test.ts` — *rejects create when productId conflicts with the inspection source product* | Replaces terminal-guard test that predated this lane. Asserts `ncr_product_reference_mismatch` when client sends a different product than inspection source. |
| `ncr-actions.test.ts` — *validates supplier and batch references against org-scoped rows* | Asserts validation SQL contains `from public.suppliers s` / `from public.wo_outputs woo` for those `referenceType` params — missing branches = test fails. |
| `lookup-actions.test.ts` — `searchProductsForNcr` (2 cases) | New action + item-type filter; import would 404 / empty shape without export. Permission-denied returns `[]`. |
| `ncrs.test.tsx` i18n — pl `lookup.sourceRefType` / `lookup.product` differ from en | Catches missing `pl.createModal.lookup` staging keys (EN fallback echo). |

Dry-run export checks: `grep -n "export async function searchProductsForNcr"` and `createNcr` confirmed before test imports.

## Consciously NOT touched

- **UI exposure of all 9 `NcrReferenceType` values** — create modal stays inspection+LP only (audit SC-R16-08 scope); server now validates API/programmatic `batch`/`supplier`/`…` correctly.
- **`updateNcrInvestigation` terminal guard test** — behavior predates T2; still covered elsewhere in `ncr-actions.test.ts` close/update suites.
- **Migration 539** — columns/CHECK already deployed; no schema gap.
- **NCR detail linked-record display** — read path unchanged.

## Out-of-scope findings (report only)

- `formIncomplete` string in `labels.ts:116` is hardcoded EN (not in staging bundle) — pre-existing, not introduced by T2.
- `pickLp` / `pickInspection` product chip uses `name: itemCode` when only code known — cosmetic; server still resolves `product_id`.
