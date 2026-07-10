# Wave 2 — Planning list integrity + RBAC (5 bugs)

Repo: monopilot-kira. Work in THIS worktree only. DB ground truth: packages/db/migrations.

## Bug 1 (P0) — PO list: filters run client-side on a paginated slice
`apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_components/po-list-view.tsx:251-263` filters search/tabs/supplier client-side on the 50-row page, while `page.tsx:252` calls `listPurchaseOrders({page,archived})` even though the action SQL already supports ilike/status (`_actions/actions.ts:366`). A PO on page 2+ is unfindable.
FIX: push search/status/supplier through searchParams → action (SQL is ready). Keep the URL as source of truth (`?q=&status=&supplier=`), debounce input client-side, reset to page 1 on filter change.

## Bug 2 (P0) — PO tab counters computed from current page
`po-list-view.tsx:235-249` — status tab counts from the 50 loaded rows → wrong totals when >50 POs. FIX: `count(*) group by status` in the action using the SAME WHERE (minus the status filter itself), returned alongside the page.

## Bug 3 (P0) — WO list: same pattern
`planning/work-orders/page.tsx:251` calls `listPlanningWorkOrders({page,archived})` without status/search despite ready `WO_LIST_WHERE` ($1 status, $2 ilike). Same fix as Bug 1+2 (server-side filters + real counts).

## Bug 4 (P0) — TO list: same pattern
`planning/transfer-orders/page.tsx:221` — searchParams type only `{new,archived,page}`. Same fix.

## Bug 5 (P1) — Planning RBAC allow-everywhere
No permission check in ANY mutation: `purchase-orders/_actions/actions.ts:456,476,552,628,696,796,876`, `transfer-orders/_actions/actions.ts`, `suppliers/_actions/actions.ts`, `import-po.ts`, `import-to.ts`. And NO `planning.po.*`/`planning.to.*`/`planning.supplier.*` strings exist in migration seeds (only planning.forecast.manage, planning.mrp.run, planning.mrp.convert).
FIX:
- New migration (next free number in packages/db/migrations — CHECK existing numbering; two files already share 459, take max+1): seed permissions `planning.po.manage`, `planning.to.manage`, `planning.supplier.manage` and grant them to the same roles that currently hold `planning.mrp.run`-class permissions (mirror how existing planning permissions are seeded/granted — copy that pattern exactly).
- Add `requireActionPermission` (use the existing helper pattern from other modules, e.g. NPD/technical actions) to every mutating action in the 5 files above. Reads stay open.
- Follow the existing typed-error pattern for denial (find how other modules return permission failures and mirror it).

## Requirements
- Read files fully; mirror existing patterns (other module lists already do server-side filtering — find one and copy the approach).
- Tests: action-level tests that (a) filters hit SQL (assert the SQL/params like existing action tests do), (b) counts query groups by status, (c) mutations without permission return the typed denial.
- MIGRATION DISCIPLINE: migration must be additive seed-only (INSERT ... ON CONFLICT DO NOTHING), no destructive DDL. Say loudly in summary that a migration was added.
- Gates: `pnpm --filter web exec tsc --noEmit` clean + touched vitest files green.
- Summary per bug → `_meta/plans/wave-2-summary.md`.
