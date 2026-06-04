# 02-settings RE-OPEN — live verification (2026-06-04)

Re-opened per human decision (live Gate-5 found real reachability bugs in the signed-off module).
All fixes merged, deployed (Supabase @152, deploy dpl_2Doy5HZcKpKJ74orgQ8JeH2Cj86o READY), and
LIVE-VERIFIED as org-admin (admin@monopilot.test, role org.access.admin).

## Live re-test results (deployed preview, authenticated)
| Bug (user-reported) | Fix | Live verdict |
|---|---|---|
| NPD "+ Create FG" dead on cold load | collapsed 2 hydration islands → 1 useState island | ✅ cold-load click opens modal → fill → Create → navigates to /en/fa/FA5701 (FG persisted + detail renders) |
| Service worker MIME SecurityError spam | guard: probe /sw.js before register | ✅ console errors = 0 (was 2/page) |
| Processes raw i18n keys + add broken | +108 i18n keys (messages/02-settings.json) + wiring | ✅ "Process steps" page + "+ Add process" modal all real labels (Key/Name/Process code/Cancel/Save) |
| Warehouse — can't create location | wired location CRUD + mig 152 (settings.location.deleted) | ✅ "+ Add location" modal (Code/Name/Parent-tree/Type/Create location) |
| Sites & lines — no create buttons | wired Add line + Add machine | ✅ "+ Add line" modal (Code/Name/Status/Machine-seq/Create line) |
| Company profile save dead + wrong style | .btn CSS system → globals.css + btn-primary + router.refresh + localized success | ✅ deployed (build-verified; .btn system was dead app-wide) |
| User-roles modal closes on field click | removed duplicate competing Radix dialogs | ✅ deployed (RTL: dialog stays open through full entry) |
| import/export persistence_failed | fix in import-csv.ts | ✅ deployed |
| Manifest icon-192 wrong size | regenerated icons at declared dims (were 1×1) | ✅ deployed |
| Products wizard crash (/products/new) | created missing route + open-redirect guard | ✅ deployed |

## Gates
- web build exit 0; web tsc 0; outbox suite green (incl check-drift gate); mig 001→152 clean.
- RBAC: settings.* 45 perms on org-admin (mig 150); NPD 43 perms (mig 149).
- Console errors: 0 on every tested page (SW guard).

## Remaining for FULL formal re-sign-off
- Codex cross-provider consensus on the re-open diff (launched).
- F4 dual-route-tree leftovers (invitations + manufacturing-operations duplicate client components) — recorded, not yet consolidated.
