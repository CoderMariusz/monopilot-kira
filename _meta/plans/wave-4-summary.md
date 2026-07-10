# Wave 4 — pagination + i18n summary

Branch: `fix/wave4-pagination-i18n`

## Bug 1 — Production WO list (P1)

**Problem:** `listWorkOrders` hard-capped at 200 rows; status tab counts disagreed with reachable rows; search/tabs were client-side only.

**Fix:**
- `listWorkOrders` now accepts `search`, `status`, `page`/`limit`/`offset` plus existing `siteId`.
- SQL applies search (`wo_number`, `product_id`, `item_code`, `product_name` ILIKE) and materialized status filter; 50 rows/page via `DEFAULT_PRODUCTION_WO_LIST_PAGE_SIZE`.
- Status-tab counts use `count(*) … group by` with the same search/site WHERE (no status filter).
- `/production/wos` reads `?q=&status=&page=`; `WoListScreen` navigates via `buildListPageHref` (debounced search, tab links, `ListPaginationFooter`).

**Tests:** `production/_actions/list-work-orders.test.ts`, `wos/_components/__tests__/wo-list-screen.test.tsx`

## Bug 2 — Technical items + materials (P1)

**Problem:** `listItems` defaulted to max 200 with truncation banner; client-side search/tabs on truncated slice.

**Fix:**
- `listItems` accepts `search`, `itemType`, `page` (50/page); type counts via `count(*) group by item_type` with search scope.
- `/technical/items` and `/technical/materials` use `?q=&type=&page=`; table clients push filter changes to the URL; pagination footer added.
- Truncation banner removed from items page (pagination replaces it).
- Status/D365 filters on items remain client-side on the current page (out of spec scope).

**Tests:** `technical/items/_actions/list-items.test.ts`

## Bug 3 — i18n missing keys (P1)

Added translations (pl/ro/uk as specified; en baseline where new UI keys were needed):

| Namespace | Keys |
|-----------|------|
| `Technical.factorySpecs` | `cloneNewVersion`, `release.*` (11 keys) |
| `Planning.{workOrders,purchaseOrders,transferOrders}.list.pagination` | showing/previous/next |
| `npd.faRightPanel` | `totalYield` |
| `npd.projectWizard` | `fieldOutputUnit*` + `errorBoxesOutputUnit` (pl) |
| `npd.briefStage` | `errOutputUnitBoxesPackFactors` |
| `technical.wip.process` | `yieldPct` (pl) |
| `npd.handoff` / `npd.packaging` | `revertToNpd`, `supplierPlaceholder`, `supplierLegacyHint` (ro/uk) |
| `Planning.workOrders.create` | `chainCreatedWarning` (ro/uk) |
| `production.wos.pagination` | showing/previous/next (all locales — new list footer) |
| `technical.items.list.pagination` / `technical.materials.pagination` | showing/previous/next |

Deleted committed `apps/web/messages/*/02-settings.json.bak` (4 files).

## Bug 4 — Locale parity test (P2)

`apps/web/i18n/__tests__/wave-4-locale-parity.test.ts` asserts all Bug 3 key paths exist as real strings in the required locales.

## Gates (evidence)

```text
pnpm --filter web exec tsc --noEmit          # clean
pnpm exec vitest run (apps/web):
  production/_actions/list-work-orders.test.ts
  technical/items/_actions/list-items.test.ts
  i18n/__tests__/wave-4-locale-parity.test.ts
  → PASS 148 / FAIL 0

pnpm exec vitest run --config vitest.ui.config.ts \
  production/wos/_components/__tests__/wo-list-screen.test.tsx
  → PASS 7 / FAIL 0
```

## Commits

1. `fix(production): server-side WO list pagination, search, and status filters`
2. `fix(technical): server-side items/materials list pagination and search`
3. `fix(i18n): wave-4 missing locale keys, remove .bak files, parity test`
