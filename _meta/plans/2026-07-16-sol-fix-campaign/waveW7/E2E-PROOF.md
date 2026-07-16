# W7 E2E proof — Settings/users/security (16 findings)

Deploy: `03fa2ff9` → dpl `k4ef892jr` READY (prod). mig509 `app.upsert_my_tenant_idp_policy` verified LIVE via psql. Org: Apex 22 (…0002).

## Browser-E2E on prod (https://monopilot-kira.vercel.app), logged in as admin@monopilot.test

### ✅ C007 — Authorization policies reachable + renders
`/en/settings/authorization` renders (not 404): "Save authorization policies" region + BOM-versioning policy copy. New settings-nav entry (Sign-off group) added. Was: route existed but unreachable from nav.

### ✅ C021 — D365 cost export-only
`/en/settings/integrations/d365/mapping` alert: *"Cost data is export-only (Monopilot → D365). D365 → Monopilot cost import is not permitted per R15."* `InventCost.StandardCost` row shows Direction = **Monopilot → D365** (outgoing). Server guard `export_only_violation` in trigger-cost-import.ts. Cost-import screen shows export-only banner (no Apply). Screenshot: `w7-C021-C022-d365-mapping.png`.

### ✅ C022 — D365 mapping directions
Same screen: per-row Direction column now correct (InventTable.ItemId = "D365 → Monopilot", SalesTable.SalesId = "Monopilot → D365"), NOT the old always-"Monopilot → D365". Direction filter restored: "All (5) / D365 → Monopilot (2) / Monopilot → D365 (3)".

## Verified via gate (tsc + passing unit tests + PREPARE), not browser (stateful/role-gated):
- C001 re-invite no-overwrite (23t), C002 PIN deadlock (shared client), C003 security-save persist (mig509 live), C004 Viewer PII/role RBAC guard (9t incl. Viewer-blocked negative), C005 real MFA enrollment (35t, env-guarded), C006 audit resource_type='users' (17t, 7 writers), C008 S22 dual-sign msg, C012 warehouse reactivate, C015 printer/dock delete FK-guarded, C013 site tz/country/legal-entity edit (IANA), C014 map-pin spider+a11y (39t), C023 email trigger registry (48t), C024 yield-range help `(0,100]`.

## Gate summary
- tsc = 0 (W7-FIX unified DocksLabels → yard-types)
- web suite: 68 fails < W6 baseline 73 → **0 new regressions** (rigorous git-stash diff), +5 net fixed
- next build green (66/66 static pages)
- mig509 PREPARE PASS on prod owner; auto-applied on deploy; function live
- Cross-review caught + fixed: invite.ts seat-limit source-order guard; totp.ts module-load throw (broke build via new profile MFA import)
