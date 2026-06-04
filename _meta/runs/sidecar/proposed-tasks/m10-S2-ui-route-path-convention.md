# PROPOSED STUB — m10-S2 (10-finance + 12-reporting + 15-oee): Normalize UI route paths

**Severity:** Medium — affects every T3-ui task in all three modules.
**Type:** Fix (path convention). Not a feature.

## Problem (evidence)
- Live app + stubs + nav use the locale group:
  `apps/web/app/[locale]/(app)/(modules)/finance/page.tsx` (and `.../reporting/`, `.../oee/`),
  wired in `apps/web/lib/navigation/app-nav.ts:67-71`.
- Finance UI tasks write to a DIFFERENT path WITHOUT the locale/group segments, e.g.:
  - T-031: `apps/web/app/finance/page.tsx`
  - T-020: `apps/web/app/finance/wos/[woId]/cost/page.tsx`
  - T-019/025/026/030 similar `apps/web/app/finance/...`
- Same pattern likely in 12-reporting (`apps/web/app/reporting/...`) and 15-oee
  (`apps/web/app/(oee)/...` in T-023) UI tasks.
- Result if unfixed: a second, un-routed tree OR broken next-intl locale routing; the existing
  `[locale]/(app)/(modules)/<module>/page.tsx` stub gets orphaned.

## Proposed resolution
Rewrite `scope_files` + `## Files` paths in all T3-ui tasks (10/12/15) to the canonical
`apps/web/app/[locale]/(app)/(modules)/<module>/...` convention used by 02-settings and the
existing stubs. Verify against `Mon-ui` skill and `apps/web/lib/navigation/app-nav.ts`.

## Acceptance
- Every finance/reporting/oee UI task targets a path under `[locale]/(app)/(modules)/`.
- `apps/web/e2e/module-nav-route-contract.spec.ts` passes for the three module landing routes.

READ-ONLY proposal.
