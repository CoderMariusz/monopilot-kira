# Track-1 Browser Audit Findings — E-waves batch 1

**Date:** 2026-06-24
**Auditor:** Track-1 browser tester (Claude Opus 4.8, Playwright MCP)
**Target:** LIVE prod deploy — https://monopilot-kira-codermariuszs-projects.vercel.app
**Login:** admin@monopilot.test
**Locale:** PL (`/pl/...`)
**Scope:** the 6 NEW E-waves whose mocked tests missed real bugs — cold-chain (Quality → delivery temp checks), yard (dock doors/appointments/gate-in-out), production scheduler, cycle-count (warehouse counts), freight (planning carriers/lanes), andon. ~3 pages done well.

Severity legend: **L1** = blocker (crash / data loss / core action dead) · **L2** = significant (wrong behaviour, missing reverse, dead primary control) · **L3** = polish (i18n leak, minor UX).

---

## SMOKE CHECK — GREEN

- `/` redirects to `/en/login?reason=idle`; login page renders (not 404/500/blank).
- Login with admin@monopilot.test succeeds → redirect to `/en` (placeholder page confirming active Supabase session).
- `/pl/dashboard` loads with REAL Supabase data: 7 active WOs, 4 pending POs, live activity feed (`schema.drift_detected` events with real timestamps), "Na żywo · Supabase" badge. PL locale clean, no raw i18n keys in nav/dashboard.
- Site selector shows real sites: Demo Plant — Warsaw, AUDIT2-SITE Test Site, site 2.
- Screenshot: `apps/web/e2e/artifacts/audit-0624/00-dashboard.png`

**Smoke result: PASS — new build is genuinely up and serving real data.**

---

## PAGE 1 — Production Scheduler (`/pl/scheduler` + `/pl/scheduler/changeover-matrix`)

Screenshots: `apps/web/e2e/artifacts/audit-0624/01-scheduler-permission-error.png`

**ROOT-CAUSE finding (RBAC permission-string mismatch — missed by mocked tests):**
The scheduler server actions enforce permissions that are **not seeded for any role**, while the seed only grants a read-only string the code never checks.

- Code (`scheduler/_actions/scheduler-actions.ts:21-23`) requires:
  - `scheduler.run.dispatch` — to run the schedule (`hasPermission` at :541, :579)
  - `scheduler.matrix.read` — to view the changeover matrix (:627)
  - `scheduler.matrix.edit` — to edit the matrix (:650)
- DB seed (`role_permissions`) grants only **`scheduler.run.read`** (to 6 roles). The three enforced strings exist for **0 roles** — verified via Supabase: `select permission,count(*) from role_permissions where permission in (...)` returns only `scheduler.run.read=6`.
- Net effect: for EVERY user incl. the org `admin` (is_system), "Uruchom harmonogram" and the changeover matrix are permanently dead.

| control / area | expected | actual | sev | file-hint |
|---|---|---|---|---|
| "Uruchom harmonogram" button (run schedule) | admin runs MRP/sequence solver, proposals render | Button shown + enabled, click → inline alert **"Nie masz uprawnień do wykonania tej operacji."** Always fails — `scheduler.run.dispatch` seeded for no role. | **L1** | seed: grant `scheduler.run.dispatch`; or code `scheduler-actions.ts:21` — align to seeded `scheduler.run.*` |
| "Macierz przezbrojeń" link → matrix page | matrix of changeover cost / wash requirement renders | Link shown on scheduler page; page header renders but body = **"Nie masz uprawnień do przeglądania macierzy przezbrojeń."** `scheduler.matrix.read` seeded for no role. | **L1** | seed: grant `scheduler.matrix.read`/`.edit`; `scheduler-actions.ts:22-23` |
| Run button gating (checklist #10) | control hidden/disabled if user lacks permission | Control is fully enabled then server-rejects — classic "shown but 403" anti-pattern. | L2 | scheduler `page.tsx` / `scheduler-board-view.tsx` — gate button on `scheduler.run.dispatch` |
| Changeover-matrix link gating | hide link if no `scheduler.matrix.read` | Link always shown even though view is denied → dead nav. | L2 | scheduler `page.tsx:e100` |
| Empty state ("Brak propozycji") | renders sensibly | OK — clean empty state, PL clean. | — | — |
| Horizon select (3/7/14/30 dni) | selectable | OK (renders; couldn't validate effect since run is blocked). | — | — |
| i18n / locale | PL, no raw keys | OK — fully Polish, no leaks. | — | — |

**Note:** because the run action is dead, CREATE-flow (checklist #4) and reverse/correction (#5) for schedule proposals could not be exercised at all — the whole module is gated off behind the missing permissions.

---

## PAGE 2 — Cold-chain delivery temperature check (Quality wave, surfaced on GRN line)

Route note: **`/pl/quality/cold-chain` 404s** — the cold-chain wave has no standalone Quality sub-nav entry. The feature lives inline on the **GRN detail line** (`/pl/warehouse/grns/[grnId]`) as a per-line "Zapisz temp." (Save temp) control. Tested GRN `GRN-20260623-0001` line 1 (AUDIT2-RM1, LP-1782211767577-B473).

Screenshots: `apps/web/e2e/artifacts/audit-0624/02-coldchain-temp-save-error.png`

**ROOT-CAUSE finding (live SQL error — missed by mocked tests):**
Entered a valid delivery temperature **3.5 °C** and clicked **"Zapisz temp."** → inline alert **"Nie udało się zapisać temperatury. Spróbuj ponownie."** The save fails server-side. **Supabase Postgres log at the exact click second (epoch 1782282069553) = `ERROR: column gi.item_id does not exist`.** The `delivery_condition_checks` row is NOT persisted (verified: action returns `persistence_failed`).

Important: the cold-chain action source on local HEAD (`quality/_actions/cold-chain-actions.ts`) uses the CORRECT column names (`gi.site_id`, `product_temp_ranges.item_id`), and `git log -S "gi.item_id"` finds the string in **no** commit. So the `gi.item_id` query is **not** on current `main` — strong signal the **deployed bundle is older than current main** (the cold-chain query fix landed after the deployed revision), OR an unmerged revision shipped. Either way the LIVE feature is broken right now.

| control / area | expected | actual | sev | file-hint |
|---|---|---|---|---|
| "Zapisz temp." (save delivery temp, valid 3.5 °C) | persist `delivery_condition_checks` row; in/out-of-range badge; out-of-range → auto quality hold | Save fails: alert "Nie udało się zapisać temperatury…"; PG `column gi.item_id does not exist`; nothing persisted. | **L1** | deployed revision's GRN-line/temp query selects `gi.item_id`; `grn_items` has `product_id` not `item_id`. Track-2: confirm deployed commit, redeploy current `main` (HEAD uses `gi.site_id`/`product_id`) or fix the stray `gi.item_id`. |
| `/pl/quality/cold-chain` route | either a cold-chain page or no link | Hard 404 ("Page not found"). It's an inline GRN feature, so arguably fine — but there's no discoverability from the Quality hub. | L3 | add a Quality sub-nav entry or document that cold-chain = GRN-line only |
| 404 page locale | stay in `/pl` | 404 "Back to dashboard" link points to **`/en/dashboard`** — drops PL locale on the not-found page. | L3 | not-found page: use active locale, not hardcoded `/en` |
| Temp input + °C affordance, per-line buttons (Zwolnij QC / Drukuj etykiety / Zapisz temp. / Anuluj przyjęcie…) render | all present, PL | OK — all render, PL clean, real LP link resolves. | — | — |
| Reverse/correction (#5) for a recorded temp | once a temp check is wrong, can it be voided/re-recorded? | Could not test (save is blocked). Note for Track-2: verify a recorded out-of-range check + its auto-hold has a reachable release/void path. | (L2 if absent) | cold-chain + holds |

---

## ★ CROSS-CUTTING ROOT CAUSE (the single biggest finding) — missing `app_user` table grants on ALL new E-wave tables

The app connects to Postgres as DB role **`app_user`** (via `withOrgContext` / Supavisor). Every new E-wave table was created by migrations 315-318 **with RLS policies but WITHOUT the `GRANT ... TO app_user`**. So every read/write to these tables throws `permission denied for table <x>` (a hard 42501), which the UI surfaces as a load/save error or a full Server-Components crash. Mocked unit tests never connect as `app_user`, so they all stayed green.

Verified via Supabase `has_table_privilege('app_user', ...)` — `app_user` has **NO SELECT** on:

| wave | tables with no `app_user` grant |
|---|---|
| cold-chain | `product_temp_ranges`, `delivery_condition_checks` |
| yard | `dock_doors`, `dock_appointments`, `yard_visits`, `weighings` |
| freight | `carriers`, `transport_lanes` |
| cycle-count | `count_sessions`, `count_lines`, `stock_adjustments` |

Postgres logs corroborate, all within the audit window: `permission denied for table dock_doors`, `permission denied for table product_temp_ranges`, `permission denied for table quality_event`.

**FIX HINT (one migration fixes 4 of the 6 waves):** add a migration that runs `GRANT SELECT, INSERT, UPDATE, DELETE ON public.{product_temp_ranges, delivery_condition_checks, dock_doors, dock_appointments, yard_visits, weighings, carriers, transport_lanes, count_sessions, count_lines, stock_adjustments} TO app_user;` (mirror the grant block the older modules' migrations use). Then re-run the per-page CREATE/reverse checks. (Cold-chain ALSO has the separate `gi.item_id` query bug — see Page 2 — which the grant fix alone won't resolve.)

---

## PAGE 3 — Yard (dock doors / appointments / gate / weighbridge) — `/pl/yard`, `/pl/yard/appointments`

Screenshots: `apps/web/e2e/artifacts/audit-0624/03-yard-crash.png`

| control / area | expected | actual | sev | file-hint |
|---|---|---|---|---|
| `/pl/yard` index loads | dock-door board / yard overview with real data | **Full crash → error boundary** "Coś poszło nie tak" (Identyfikator: 3568291831). Console: "An error occurred in the Server Components render". Root cause: `permission denied for table dock_doors`. | **L1** | grant gap (see root-cause); yard `page.tsx` data loader |
| `/pl/yard/appointments` loads | appointment list + book/gate-in/gate-out actions | **Full crash → error boundary** (Identyfikator: 3725257207). Same `dock_appointments`/`dock_doors` grant gap. | **L1** | grant gap |
| CREATE appointment / gate-in-out / reverse (#4, #5) | testable | **Unreachable** — page never renders. | — (blocked) | unblock via grant fix, then re-audit |
| Error-boundary UX (#7) | renders sensibly | OK — clean PL error card with retry + error id (graceful, not a white screen). | — | — |

## PAGE 4 — Cycle-count / stock counts — `/pl/warehouse/counts`

Screenshots: `apps/web/e2e/artifacts/audit-0624/05-cyclecount-load-error.png`

| control / area | expected | actual | sev | file-hint |
|---|---|---|---|---|
| Counts list loads | list of cycle counts + create/variance/approve | Header renders; body = **"Nie udało się wczytać inwentaryzacji. Spróbuj ponownie."** Root cause: `count_sessions`/`count_lines` grant gap. | **L1** | grant gap; counts `page.tsx` loader |
| CREATE count / post variance / approve / reverse (#4, #5) | testable | **Unreachable** — list never loads (no "new count" affordance reachable). | — (blocked) | unblock via grant fix, then re-audit |
| Error state (#7) | sensible | OK — inline error banner under the header, not a crash (handled more gracefully than yard). | — | — |

## PAGE 5 — Freight / carriers + lanes — `/pl/planning/carriers`

Screenshots: `apps/web/e2e/artifacts/audit-0624/04-freight-carrier-save-error.png`

| control / area | expected | actual | sev | file-hint |
|---|---|---|---|---|
| Carriers list loads | list of carriers + their transport lanes | Header + "+ Dodaj przewoźnika" render; body = **"Nie udało się załadować przewoźników."** Root cause: `carriers`/`transport_lanes` grant gap. | **L1** | grant gap; carriers `page.tsx` loader |
| "+ Dodaj przewoźnika" modal (#2, #4) | opens, exposes all fields | OK — modal opens, all fields present (Kod, Nazwa, Domyślny tryb=Drogowy, e-mail, telefon, Aktywny), PL clean. | — | — |
| CREATE carrier — Save (filled AUDIT-0624-CARR / AUDIT-0624 Test Carrier) | persist + appear in list | **"Zapis nie powiódł się. Spróbuj ponownie."** INSERT fails on `carriers` grant gap — nothing persisted. | **L1** | grant gap (INSERT) |
| Reverse/correction (#5) | deactivate/delete a carrier; remove a lane | **Unreachable** — no carrier ever persists; list empty/errored. | — (blocked) | re-audit after grant fix |

## PAGE 6 — Andon board — `/pl/oee/andon` (HEALTHY — control sample)

Screenshots: `apps/web/e2e/artifacts/audit-0624/06-andon-board-healthy.png`

This wave does NOT use the ungranted tables (reads existing OEE/line/wo tables), so it works — a useful contrast confirming the root cause is grant-specific, not a global deploy failure.

| control / area | expected | actual | sev | file-hint |
|---|---|---|---|---|
| Board loads with real data | line tiles w/ status, WO, output, waste | OK — 8 lines, real values (DEMO-LINE-1 "Pracuje", WO-20260611072835, good 29.8; DEMO-LINE-2 good 520 / waste 6.75). PL clean. | — | — |
| Tile → detail deep-link (#6) | correct line, correct locale | OK — opens `/pl/oee/andon/{id}` (relative href inherits `/pl`), real WO + product "Night Proof Sausage". | — | — |
| OEE value | computed % | Shows "-" on every line incl. ones with output — OEE not computed/populated. Data-completeness gap, not a crash. | L3 | oee snapshot/MV producer (15-oee read-only; 08-production owns producer) |
| Andon hrefs omit locale prefix | `/pl/...` | Hrefs are `/oee/andon/{id}` (no `/pl`). Works from `/pl` via relative resolution, but is fragile (would break if ever rendered from a non-locale base). | L3 | andon board tile `href` — prefix with `/${locale}` |

---

## SUMMARY — L1 / L2 for Track-2

**L1 (blockers):**
1. **Missing `app_user` grants on ALL new E-wave tables** (cold-chain, yard, freight, cycle-count) → 1 grant migration unblocks 4 waves. Verified by `has_table_privilege` + Postgres `permission denied` logs.
2. **Yard `/pl/yard` + `/pl/yard/appointments`** → full Server-Components crash (`dock_doors` grant). (subset of #1)
3. **Cold-chain temp save** (`/warehouse/grns/[grnId]`) → fails with `column gi.item_id does not exist` (grn_items col is `product_id`). Likely a stale/divergent deployed revision — string is on NO commit on `main`. Needs deploy-revision confirmation + the grant fix.
4. **Freight carrier CREATE** (`/planning/carriers`) → list load AND insert both fail (`carriers` grant). (subset of #1)
5. **Cycle-count list** (`/warehouse/counts`) → fails to load (`count_sessions` grant). (subset of #1)
6. **Scheduler "Uruchom harmonogram" + changeover matrix** → permission strings the code enforces (`scheduler.run.dispatch`, `scheduler.matrix.read/edit`) are seeded for ZERO roles; only `scheduler.run.read` is seeded → run + matrix permanently dead for every user incl. org admin.

**L2 (significant):**
- Scheduler run button + changeover-matrix link are shown/enabled then server-rejected (render-then-403 anti-pattern; should be gated on the real permission).
- (Pending re-audit once grants land) reverse/void paths for cold-chain temp checks, yard appointments, cycle-count variance, and carrier/lane deactivation were unreachable — verify they exist.

**Healthy:** dashboard, GRN list/detail, andon board+detail — all real Supabase data, PL clean.

**No AUDIT-prefixed data persisted** — every create attempt failed at the grant layer, so the live DB is unchanged by this audit.

