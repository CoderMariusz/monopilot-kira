# W8 E2E proof — Scanner/PWA/technical/infra/maintenance (13 findings)

Deploy: `ea823ba9` → dpl `a7nyk7qiw` READY (prod). No new migration (C117 uses existing `equipment` table, mig201). Org: Apex 22 (…0002).

## Browser-E2E on prod (https://monopilot-kira.vercel.app), logged in as admin@monopilot.test

### ✅ C117 — Maintenance asset registry reachable + live
`/en/maintenance/assets` renders (was 404): "1 assets · 0 require LOTO", table Code/Name/Type/LOTO/Calibration/Status, row "LINE1 / Packing Line 1 / production_line / Active", "+ Add asset" + Export CSV + Maintenance nav links. LOTO can now reference assets.

### ✅ C118 — OEE reversed custom date range → explicit error, no silent fallback
`/en/oee?period=custom&from=2026-07-20&to=2026-07-01` (from > to): explicit alert ×2 (period selector + page) "The start date must be on or before the end date." KPI data NOT rendered (silent 7d fallback removed). Screenshot: `w8-C118-oee-reversed-range.png`.

### ✅ C009 — /sw.js (recheck) already-fixed
`curl -sI https://monopilot-kira.vercel.app/sw.js` → 200 + application/javascript (Wave F 3f7c646d). No code change.

## Verified via gate (tsc + passing tests), not browser (stateful/device-gated):
- C094 scanner PIN/auth error a11y (role=alert), C095 offline useSyncExternalStore (14t), C096 login-footer overlap, C097 Back 44×44, C048 draft BOM Save Version (27t), C049 factory-spec lifecycle, C016 dup location code typed error (9t), C017 L2/bin tier, C029 NPD boundary guards (10t), C039 line UUID→code (28t, planning WO + changeover, shared resolve-line-label).

## Gate summary
- tsc = 0 (W8-FIX unified location-types, moved maintenance i18n off _meta staging, WOHeader stub cols)
- web suite: 68 fails == W7-HEAD 68 → **0 new regressions** (rigorous git-stash/pop diff)
- next build green (66/66 static pages)
- No new migration
- Recheck-first discipline: C117 (route missing not table → no mig510), C009 (already-fixed → no change)
