# MonoPilot Kira — general check: menu coverage / TV views / reports-per-site / gaps (2026-06-24)

Read-only Codex audit (answers owner's "where are the TV views? does the menu cover all modules? rebuild what's missing").

## TV / KIOSK views — THEY EXIST (under OEE/Andon) but are UNREACHABLE
- Routes: `/oee/andon` (TV list) + `/oee/andon/[lineId]` (detail, polls status every 15s). **Real data** (andon-data.ts — production lines, WO, output, waste, last oee_snapshots), NOT stubs.
- ❌ NOT in sidebar or the OEE hub — only reachable by typing the URL (`module-registry.ts:256` exposes only `/oee`).
- ❌ List tiles use `href={\`/oee/andon/${line.id}\`}` — **missing `/${locale}`** → broken navigation on click (`oee/andon/page.tsx:44`).
- ❌ Permission `oee.tv.kiosk_view` exists (`permissions.enum.ts:418`) but is **unused** — andon pages gate only on withOrgContext.
- "OEE shows -" = correct: renders `-` when no oee_snapshot exists for the line.
- **FIX DISPATCHED** (lane adad22ef): nav/hub link + locale href + perm gate.

## Menu coverage — most modules in nav; several E-waves are hub-card-only
| module | route | in sidebar? | note |
|---|---|---|---|
| dashboard/settings/planning/scheduler/production/warehouse/quality/OEE/maintenance/reporting | — | ✅ yes | covered |
| cycle-count | /warehouse/counts | hub-card only | via Warehouse hub |
| yard | /yard | hub-card only | `yard.manage`; dead-URL without warehouse hub |
| cold-chain | /settings/quality/temp-ranges + GRN inline | settings only | **no operational `/quality/cold-chain` page** |
| freight | /planning/carriers | hub-card ("Carriers") | no top-level "Freight/Spedycja" |
| HACCP / complaints-CAPA / recall-drills | /quality/* | hub-card only | reachable via Quality hub |
| andon (TV) | /oee/andon | ❌ NOT reachable | see TV section |

## Reports-per-site — ALL org-scoped, no site filter, no per-site view
- `reporting/page.tsx` has no site selector. These reads are org-only and should take `site_id` (depends on `withSiteContext` — site-scoping S2):
  reportingProductionLines (report-read-actions.ts:148), productionSummary (:181/:189), inventorySnapshot (:391/:415), qualitySummary (:468/:471/:499), procurementSummary (:553/:596).
- No per-site reporting view exists (`reporting-overview.client.tsx:544`). → build after site-scoping S1/S2 land.

## Prioritized rebuild list
1. **S — Andon reachable + locale href + kiosk gate** (DISPATCHED adad22ef).
2. **M — Reporting site filter + per-site view** (after withSiteContext S2; site-scoping plan S6).
3. **S — Surface Yard in nav** (role-aware link beside Warehouse).
4. **M — Cold-chain operational register/dashboard** `/quality/cold-chain` (backend + GRN inline exist; no entry point).
5. **S — Surface Freight as top-level** (rename "Carriers" → Freight or add nav item).
6. **S — Retire/redirect legacy `/settings/infra/machines`** → `/settings/machines`.

Source: read-only audit lane aa061297, file:line cited inline.
