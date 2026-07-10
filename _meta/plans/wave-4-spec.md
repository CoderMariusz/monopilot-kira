# Wave 4 — pagination + i18n (4 clusters)

Repo: monopilot-kira. Work in THIS worktree only.

## Bug 1 (P1) — Production WO list: hard-cap 200, no pagination, client-side search
`apps/web/app/[locale]/(app)/(modules)/production/_actions/list-work-orders.ts:227` — limit 200, no offset; `production/wos/_components/wo-list-screen.tsx:180-182` — search/tabs client-side on the 200-slice. Also :122-145 statusCounts computed without limit → counts disagree with reachable rows.
FIX: add server-side pagination (page param, 50/page like planning lists) + push search/status into SQL; status counts via count(*) group by status with same WHERE. URL as source of truth (?q=&status=&page=). NOTE: a parallel wave just did exactly this for planning PO/WO/TO lists — mirror the planning pattern (read planning/purchase-orders/page.tsx and its action on origin/main for the convention), but implement independently in production files.

## Bug 2 (P1) — Technical items + materials: cap 200, no pager, no search param
`technical/items/page.tsx:85` — listItems() DEFAULT=MAX=200, truncation banner but no pager, action has no search param; `items-table.client.tsx` filters/tabs/search client-side on the truncated 200 → wrong counters. Same at `technical/materials/page.tsx:37`.
FIX: same treatment — server-side search (?q=), type filter (?type=) into SQL, pagination, counts via count(*) group by item_type.

## Bug 3 (P1) — i18n missing key packs (runtime MISSING_MESSAGE in pl/ro/uk)
Add the missing translations (translate properly to Polish/Romanian/Ukrainian, match the existing tone of each locale file):
- `Technical.factorySpecs.release.*` (12 keys + cloneNewVersion) — only en.json has them → add pl/ro/uk (used by technical/factory-specs/_components/release-spec.client.tsx)
- `Planning.{workOrders,purchaseOrders,transferOrders}.list.pagination.*` (showing/previous/next ×3) → add pl/ro/uk
- `npd.faProductionTab.*` (11 keys) → add ro/uk
- `npd.faRightPanel.totalYield` → add pl/ro/uk
- `npd.projectWizard.fieldOutputUnit*` (4) + `errorBoxesOutputUnit` → add pl; `npd.briefStage.errOutputUnitBoxesPackFactors` → add pl/ro/uk
- `technical.wip.process.yieldPct` → add pl
- `npd.handoff.revertToNpd` + `npd.packaging.supplierPlaceholder` + `npd.packaging.supplierLegacyHint` → add ro/uk
- `Planning.workOrders.create.chainCreatedWarning` → add ro/uk
Verify each key path exists in en.json first and copy the exact nesting. Also DELETE the four committed `messages/*/02-settings.json.bak` files (hygiene).

## Bug 4 (P2) — messages hygiene check
After Bug 3, write/extend a locale-parity test if one exists (grep for existing i18n parity tests); if none exists, add a small vitest that asserts the specific key paths from Bug 3 exist in all 4 locales (do NOT build a full-tree parity framework).

## Requirements
- Read files fully; mirror existing patterns. For lists, the planning list pattern is the reference.
- Tests: action-level tests asserting SQL filters/pagination params; the i18n key test.
- Gates: `pnpm --filter web exec tsc --noEmit` clean; touched `.ts` tests with default config, `.tsx` tests with `--config vitest.ui.config.ts` (this matters — wrong config gives a fake JSX parse error).
- Summary → `_meta/plans/wave-4-summary.md`.
