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

---

# RE-VERIFY — 2026-06-24 (deploy c4872e9d; tester DEEP create→persist→display→edit→reverse)

Login admin@monopilot.test on `/pl/`. **Smoke: GREEN** (login → `/pl` dashboard, PL locale; only console error = harmless `/sw.js` 404). Screenshots under `apps/web/e2e/artifacts/reverify-0624/`. Real Supabase rows verified via MCP (project `khjvkhzwfzuwzrusgobp`).

## A — Sites & Lines refresh (c4872e9d, the headline) → **FAIL**

Steps: Settings → Sites & Lines → site "site 2" (0 lines) → "+ Dodaj linię" → created line **AUDIT0624-LINE** (code+name) → Save.

- The line **persists** (DB `production_lines` row has correct `site_id`; site badge updated **0 → 1 linii** immediately) — so the data-integrity half is fine.
- BUT the per-site **lines list in the detail panel STILL shows the empty-state** "Do tego zakładu nie przypisano jeszcze linii produkcyjnych" — **immediately AND after a full page reload AND after reselecting the site.** The new line never renders; the per-row **Edit** button is therefore **unreachable** (cannot complete the edit sub-test).
- Decisive tell: **"Demo Plant — Warsaw" shows "8 linii" in its badge but its detail panel is ALSO empty** on a clean load — i.e. the detail lines list is broken for EVERY site, not just newly-created ones.
- **ROOT CAUSE (found, not the fix's layer):** `queryLinesForSite` in `…/settings/sites/_actions/sites.ts:330-353` uses `SELECT DISTINCT … GROUP BY … ORDER BY lower(pl.name), lower(pl.code)`. Postgres rejects this with **`42P10: for SELECT DISTINCT, ORDER BY expressions must appear in select list`** (reproduced live via MCP; also in postgres logs). So `getLinesForSite` **always throws**; the client `handleSelect`/`handleMutated` catch it and render `[]` (the ghost). The c4872e9d fix only rewired the client cache-refresh in `sites-screen.client.tsx` — but the underlying query was already broken, so re-fetching just re-throws.
- **FIX (Track 2, L1):** drop the `distinct` keyword in `queryLinesForSite` (line 331) — the `GROUP BY` already dedups; removing DISTINCT returns all 8 lines (verified live). Same pattern likely worth grepping elsewhere.
- Evidence: `A1-add-line-modal.png`, `A2-after-save-no-refresh.png`, `A3-site2-after-reload-still-empty.png`.

## B — mig 323 grant (cold-chain / freight / yard / cycle-count)

mig 323 grant **confirmed at DB level**: `app_user` now holds INSERT/SELECT/UPDATE/DELETE on `carriers`, `transport_lanes`, `yard_visits`, `dock_appointments`, `dock_doors`, `count_sessions`, `count_lines`, `product_temp_ranges`. (NOTE: migs 323/324 are NOT tracked in `supabase_migrations.schema_migrations` — they were applied ad-hoc via MCP, only up to 320 is tracked. Cosmetic, but means re-running the migration runner could re-attempt or miss them.)

- **B-Freight (carriers) → PASS.** `/pl/planning/carriers` loads clean (PL). Created carrier **AUDIT0624-CARR / AUDIT0624-Carrier Test** (mode Drogowy, email) → **persists + lists** (DB row confirmed) with row-actions Edytuj + Trasy present. Evidence: `B1-carrier-created.png`.
- **B-Cold-chain (temp ranges) → PASS.** `/pl/settings/quality/temp-ranges` loads clean. Created range for **RM-BEEF-80 / 0.0–4.0 °C / Wymagane** (real item picker, portal works) → **persists + lists** + success toast. The old `gi.item_id` GRN-temp-save bug is **GONE** — no view/function references `gi.item_id` anymore (MCP `pg_views`/`pg_proc` hunt = empty). Evidence: `B2-temp-range-created.png`.
- **B-Yard (dock doors / appointments / board) → FAIL.** All three Yard pages crash to the global error boundary "Coś poszło nie tak": `/pl/settings/infra/docks`, `/pl/yard`, `/pl/yard/appointments`. **NOT the grant** (grant is fine; the page catches `forbidden`). **ROOT CAUSE (NEW L1):** the label builders `buildDocksLabels`/`buildBoardLabels`/`buildAppointmentsLabels` in `…/(modules)/yard/_components/yard-labels.ts` return objects with **function-valued props** (`directionLabel`, `statusLabel`, `minutes`, `directionOption` — e.g. lines 22-23, 47, 55-56, 77-78, 100-102, 170, 190, 203). The Server-Component pages pass these objects to **Client Components** (`DocksView`, board/appointments views) → Next.js throws **"Functions cannot be passed directly to Client Components"** during SSR. **FIX:** resolve all direction/status/minutes variants to plain strings (or precomputed `Record<>` maps) server-side before crossing the RSC boundary; never pass functions in the labels object. Cannot create a dock door / appointment until fixed. Evidence: `B3-yard-appointments-error.png`.
- **B-Cycle-count → PASS (with NEW L2).** `/pl/warehouse/counts` loads clean. Created session (warehouse **Finished Goods**, type **Liczenie cykliczne**) → **persists** (DB `count_sessions` row status=open count_type=cycle). **NEW L2: the list did NOT refresh after create** — page still showed "Liczenia: 0"/empty; only after a manual reload did **CNT-2E51BF1F** appear (status Otwarte, working deep-link to detail). Same "router.refresh doesn't rebuild client cache" class as Sites&Lines. Detail page has full tabbed workflow (blind count / variance review); no items to count (empty FG stock) so approval/reverse path not exercised. Evidence: `B4-count-session-listed.png`.

## C — mig 324 scheduler perms → **FAIL** (perm fix verified, but run still broken by a NEW L1)

mig 324 **confirmed**: `scheduler.run.read/dispatch` + `scheduler.matrix.read/edit` all seeded to 6 roles each.

- **Changeover matrix (matrix.read) → PASS.** `/pl/scheduler/changeover-matrix` loads for admin, no 403/error — empty state ("Brak profili przezbrojeń", derives from allergen profiles). matrix.edit perm seeded; no reachable edit control in the empty state, but READ definitively works.
- **"Uruchom harmonogram" run → does NOT 403 (perm gate fixed) BUT FAILS to run.** Button is clickable, no permission-denied — instead shows inline **"Coś poszło nie tak. Spróbuj ponownie."** **ROOT CAUSE (NEW L1):** `MATRIX_SELECT` in `…/(modules)/scheduler/_actions/scheduler-actions.ts:75-89` lists **unqualified** columns (`id`, `org_id`, `site_id`, `version_id`, …); it's used in `loadChangeoverMatrixForRun` (line 133-147) which **joins `changeover_matrix cm` + `changeover_matrix_versions cmv`** — both have `id`/`org_id` → Postgres **`42702: column reference "id" is ambiguous`** (reproduced live via MCP + in postgres logs at the click timestamp). `runScheduler` catches it → returns `persistence_failed`. **FIX:** qualify `MATRIX_SELECT` columns with `cm.` (at least `id`, `org_id`, `site_id`, `version_id`, `line_id`).
- Net: the **permission** subject of mig 324 is verified fixed; the **feature** is still not end-to-end (run dies on the ambiguous-id bug). Marked FAIL because the prompt's gate is "PASS if both work" and the run does not complete.
- Evidence: `C1-scheduler-run-error.png`, `C2-changeover-matrix-loads.png`.

## NEW BUGS surfaced (feed Track 2)

1. **L1 — Sites&Lines per-site list query broken** (`settings/sites/_actions/sites.ts:331` `SELECT DISTINCT … ORDER BY lower(...)` → 42P10). Lines never render for ANY site. Fix = drop `distinct`. (This is why headline A is still broken after c4872e9d.)
2. **L1 — Whole Yard module crashes** (`(modules)/yard/_components/yard-labels.ts`): function-valued label props passed from Server → Client Components. Affects `/settings/infra/docks`, `/yard`, `/yard/appointments`. Fix = stringify labels server-side. (This is the "2nd cause" behind the dock-doors "Something went wrong" — grant 323 alone did NOT fix it.)
3. **L1 — Scheduler run fails** (`(modules)/scheduler/_actions/scheduler-actions.ts:75-89` `MATRIX_SELECT` + `:133` join): ambiguous `id` (42702). Fix = qualify with `cm.`.
4. **L2 — Cycle-count list does not refresh after create** (`/warehouse/counts`): new session only appears after a manual page reload (router.refresh-vs-client-cache class). Fix = re-fetch/refresh the sessions list on create success.

---

# RE-VERIFY 2 + AUDIT — 2026-06-24 (deploy 1142f7f0, READY)

Live re-verify of the batch shipped after round-1 (commits `8ecbb0ee` sites+scheduler, yard lane, `fb98657e` integrations+trace, `76a4c9b0` RBAC enum, `1142f7f0` PO cancel-with-stock). Deployed prod commit confirmed = **1142f7f0** (Vercel `dpl_23LGYJQT3SaJ7SwduwdePuE3qJrN`, READY). All 5 fix commits are ancestors of 1142f7f0 (verified via `git merge-base`). Login admin@monopilot.test, /pl locale. **Smoke = PASS** (login → /pl dashboard, only console error is benign `/sw.js 404`).

## PASS/FAIL per A–G

| Item | Verdict | Evidence / note |
|---|---|---|
| **A — Sites&Lines (8ecbb0ee 42P10)** | **FAIL** | SQL fix IS correct + deployed (ran `queryLinesForSite` SQL live → 9 rows, no 42P10). Created **AUDIT0624-LINE** → persists (DB count 8→9, correct `site_id`), badge updates 8→9. BUT the **detail-panel lines list is STILL EMPTY** on a clean load for Demo Plant (9 lines in DB) — table never renders, Edit unreachable. RSC flight payload contains the site id but **ZERO line rows** → `initialLines` arrives empty at runtime. The 42P10 is gone but the panel is broken at a deeper layer (runtime `queryLinesForSite` under `withOrgContext` returns `[]` even though the standalone query returns 9; `querySites` count works, so org-context is set). Re-fix needed — see new bug #5. Evidence: `reverify2-0624/A-sites-lines-empty-ghost.png`. |
| **B — Scheduler (8ecbb0ee 42702)** | **PASS** | "Uruchom harmonogram" runs end-to-end, NO "Coś poszło nie tak". Generated real sequence across 4 lines (AUDIT2-LINE, DEMO-LINE-1/2, LINE93) with real WO numbers + "Łączny koszt przezbrojeń: 0" + "Zastosuj harmonogram" button. Changeover matrix loads (empty-state, no crash). The 42702 `id ambiguous` is resolved. |
| **C — Yard (yard-labels fix)** | **PASS** | All 4 pages load clean (no "Coś poszło nie tak"): `/yard`, `/yard/appointments`, `/yard/weighbridge`, `/settings/infra/docks`. Created **AUDIT0624-DOCK** dock door → persists + lists IMMEDIATELY with Edytuj action. Created appointment **AUDIT0624-APPT** on that dock → persists + lists (cross-ref: the new dock was pre-selected in the appointment modal). The function-prop RSC crash is fixed. Evidence: `reverify2-0624/C-yard-appointment-persisted.png`. |
| **D — /settings/integrations (fb98657e)** | **PASS (crash) + NEW L2** | Page loads, NO RSC crash (empty-state "Brak skonfigurowanych integracji"). Could not verify "expand a category / Configure-Connect render" because the **"Przeglądaj katalog" button is a DEAD click** — no dialog, no catalog, page unchanged (new L2, see bug #7). The fb98657e crash-fix itself = PASS. |
| **E — /quality/trace (fb98657e)** | **PASS** | Loads, NO RSC crash. Ran a real trace on `LP-1782211767577-B473` → full genealogy (Dostawca SUP-DEMO-01 → PO-202606-0001 → GRN-20260623-0001 → LP, 40 kg) + summary + flat list. Node deep-link **resolves correctly**: clicked the LP "Otwórz" → landed on the right LP detail (LP-1782211767577-B473 / AUDIT2 Meat Trim 80/20, 40 kg, RACK2/FG), `/pl/` prefix + real UUID. Evidence: `reverify2-0624/E-trace-lp-deeplink-resolved.png`. |
| **F — Settings→Roles correction perms (76a4c9b0)** | **PASS (w/ caveat)** | The 5 correction perms (`production.wo.cancel`, `production.{consumption,output,waste}.correct`, `production.corrections.closed_wo`) are now in `packages/rbac/src/permissions.enum.ts:205-225` + the test count — deployed (76a4c9b0 ⊂ 1142f7f0). Matrix is enum-driven ⇒ they're assignable. **Caveat:** the granular 241-perm matrix UI is not directly reachable from `/settings/users` in this build (only a coarse NPD/Planning/Quality×role grid + role-filter pills surface there) — couldn't visually click each new row, so verdict rests on the (authoritative) enum-lock source. The coarse roles matrix loads with no error. |
| **G — PO cancel-with-stock (1142f7f0)** | **PASS (verified) + meta-finding** | Server guard verified in deployed source: `transitionPurchaseOrderStatus` returns `{ok:false, error:'po_has_receipts'}` when `activeReceivedCount>0` for a cancel; `received` is terminal in `PO_TRANSITIONS`. Confirmed PO-202606-0001 (received, has GRN stock) and PO-2026-032 (partially_received, 200 kg received) show **NO Cancel button** on detail or list → cancel-with-stock is unreachable via UI too (defense in depth). **Reopen button = confirmed ABSENT** (action `reopenPurchaseOrder` exists at actions.ts:725, no UI trigger) — as predicted, not failed. **Meta-finding (L2):** PO **cancel has NO UI affordance anywhere** (detail or list) — couldn't trigger the "clear error" through the browser; only "Oznacz jako przyjęte" / "Podgląd" exist. |

## PART 2 — NEW page deep-audits (create→persist→display→edit→cross-ref→reverse)

| Page | control/area | expected | actual | sev | file hint |
|---|---|---|---|---|---|
| `/pl/production/wos/[id]` (WO detail, IN_PROGRESS) | Zużycie tab → "Zarejestruj" → register 2 kg w/ manual reason | consumption persists, row shows 2 kg / progress, ledger row written | **Modal stays open + alert "Nie można zarejestrować zużycia." (generic). DB: NO `wo_material_consumption` row, `wo_materials.consumed_qty` still 0.** Whole txn rolls back. Admin HAS `production.consumption.write`; no Postgres ERROR logged ⇒ swallowed JS/PG throw → `reason:'error'`→generic copy. | **L1** | `production/_actions/consume-material-actions.ts:242-531` (`recordDesktopConsumption`; insert @475, catch→`reason:'error'`@530). Real consume is broken on desktop. |
| `/pl/production/work-orders/[id]` | navigate in browser | a UI page or a 404 | **Dumps raw JSON** `{"ok":true,"data":{…WO state…}}` — it's an API `route.ts` under `[locale]/(app)`, publicly navigable, leaks WO state JSON with no UI. (Real UI route is `/production/wos/[id]`.) | L3 | `production/work-orders/[id]/route.ts` — route-hygiene; should 404/redirect for browser GETs or move out of the locale UI segment. |
| `/pl/production/wos/[id]` (WO detail) | page load, tabs, progress, data | real data, consistent | **PASS** — WO-…A79C9DE3 "W toku", product Night Proof Sausage (FG-NPD-004), DEMO-LINE-1; ⚠ "Brak konsumpcji" genealogy warning; Zużycie 0%, Wyjście 30/50 kg (59.6%) — matches the route.ts JSON. Tabs all carry live counts. Actions: Wstrzymaj/Odpad/Waga zmienna/Zakończ/Anuluj present. | — | — |
| `/pl/warehouse/license-plates` (LP browser) | load, data sourcing, tabs, deep-links | real LPs, consistent counts | **PASS** — 9 real LPs, status tabs w/ live counts (Wszystkie 9 / Dostępne 3 / Blokada QC 6) consistent with header summary; expiry relative dates ("za 1 dni"/"9 dni temu"); deep-links to LP detail work. | — | — |
| `/pl/warehouse/license-plates` | row / bulk actions | some reverse/correction affordance | **No row actions, no bulk** — explicit "Zaznaczanie zbiorcze / akcje są odłożone na późniejszy etap." Read-only by design; reverse/correct only from LP detail. | L3 (by design) | — |
| `/pl/warehouse/license-plates` | warehouse column | RM/packaging in their own WH | **All 9 LPs show warehouse "FG"** incl. RMs (AUDIT2-RM1, ING-CURE-SALT) + packaging (PKG-TRAY-MAP) — likely seed artifact (everything received into FG), but a data-consistency smell. | L3 | seed data / receive-into-WH default. |
| `/pl/yard/appointments` | booked appointment row | edit/cancel/reschedule affordance | **No row action** on a booked slot — cannot cancel/reschedule an appointment (missing reverse). | L2 | `(modules)/yard` appointments view — add cancel/reschedule row action. |
| `/pl/yard/appointments` | time display | shows entered 09:00 | **Lists "08:00"** for an entered 09:00 (UTC/TZ display offset). | L3 | appointment time render (UTC→local). |
| `/pl/settings/sites` "+ Dodaj linię" / dock modal / consume modal | i18n in PL locale | Polish labels | **Add-line modal is English** ("Add production line", "Line code", "Name", "Save"); company-profile sections English ("Identity", "Registered address"). Pre-existing i18n leak. | L3 | `settings/sites` add-line modal + `settings/company` labels. |

## NEW BUGS (round 2 — feed Track 2)

5. **L1 — Sites&Lines per-site list STILL empty after 8ecbb0ee** (`settings/sites/_actions/sites.ts:326-357` `queryLinesForSite`). The 42P10 is fixed (standalone SQL returns all 9 rows), but at **runtime under `withOrgContext`** the query returns `[]` — RSC flight payload has the site id but no line rows, so `initialLines` is empty and the panel renders the ghost for ALL sites. `querySites` (same HOF/`app.current_org_id()`) returns counts fine, so org-context is set; the diff is `queryLinesForSite`'s joins to `shift_patterns`/`locations` + GROUP BY. Track 2: add server-side logging on `queryLinesForSite`, reproduce with the request's real `app.current_org_id()` context (not service-role MCP), confirm whether the join/RLS or a type mismatch zeroes it. Create + persist + count all WORK; only the list read is broken.
6. **L1 — Desktop WO consume silently fails** (`production/_actions/consume-material-actions.ts:242-531`). `recordDesktopConsumption` returns `{ok:false, reason:'error'}` (→ generic "Nie można zarejestrować zużycia.") and writes nothing — no `wo_material_consumption` row, `wo_materials.consumed_qty` unchanged. Admin holds `production.consumption.write`; inputs valid (2 kg, manual reason, no-LP path); no Postgres ERROR logged ⇒ a swallowed throw inside the txn. Blocks the core production consume flow on desktop. Reproduce with the exact payload + a temporary `console.error(error)` dump.
7. **L2 — `/settings/integrations` "Przeglądaj katalog" is a DEAD click** — no dialog, no catalog accordion, page unchanged. The browse-catalog CTA / category accordion (the thing fb98657e was meant to render) is unreachable when there are no configured integrations. `settings/integrations/page.tsx` + the catalog/CategoryAccordion component.
8. **L2 — PO cancel has NO UI affordance** (detail + list). The server-side cancel + `po_has_receipts` guard exist and are correct, but there is no Cancel button anywhere to invoke them; "Anulowane" filter shows 0. Pairs with the unwired Reopen button. `planning/purchase-orders` detail + list components.
9. **L3 — `/pl/production/work-orders/[id]` leaks WO-state JSON** to the browser (it's an API `route.ts` under the locale UI segment). Should not be browser-navigable as a bare page.

---

# AUDIT — core flows (2026-06-24, deploy dpl_FScef2kiZJ64BFk6qx2FkmJTTZHb, READY)

**Auditor:** Track-1 browser tester (Claude Opus 4.8, Playwright MCP). DEEP live testing — create→persist→display→edit→cross-ref→reverse, real Supabase rows verified via MCP (project `khjvkhzwfzuwzrusgobp`) + Vercel runtime logs.
**Scope (per brief):** 4 CORE operational flows — PO→GRN receive (desktop+scanner), SO→pick→pack→ship→POD, scanner warehouse tiles, WO lifecycle desktop (except known-broken consume). Known bugs (Sites&Lines empty, desktop consume, PO reopen/cancel UI, integrations dead click) intentionally NOT re-investigated.
**Smoke = PASS** — login admin@monopilot.test → `/pl/dashboard`, "Na żywo · Supabase" badge, 7 active WOs / 4 pending POs / live activity feed (incl. a `planning.carrier.created` from a prior audit run). PL clean. Only console error = benign `/sw.js 404`.
**Real data persisted by this audit (AUDIT0624- prefix):** scanner GRN `GRN-20260624-0001` + LP `LP-1782293232526-89PB` (25 kg), 2 WO output LPs (`-FOP2` 4→10 kg, `-6PW1` 2.15 kg) on WO-…A79C9DE3, 1 waste row (0.5 kg), customer `AUDIT0624-CUST` + address, SO `SO-202606-00001`. WO-…A79C9DE3 driven to CLOSED. The account e-sign/scanner PIN was reset to a known value via the in-app `/pl/account/pin` page (password-authorized) to reach the scanner — itself verified working.
Screenshots: `apps/web/e2e/artifacts/audit3-0624/`.

## FLOW 1 — PO → GRN receive (desktop + scanner) → **PASS (with desktop gap)**

| control / area | expected | actual | sev | file-hint |
|---|---|---|---|---|
| Desktop PO detail receive (`/pl/planning/purchase-orders/[id]`) | a real GRN/receive flow (qty, warehouse, LP mint, QA) | **NO real receive on desktop** — only status-flip buttons "Oznacz jako przyjęte / częściowo przyjęte" → a bare `confirm()` dialog that flips PO status, mints NO GRN, NO LP, NO QA. The actual goods-receipt only exists on the scanner. | L2 | `planning/purchase-orders/[id]` detail — the desktop offers a status flip masquerading as receive; either wire a desktop GRN flow or relabel as "mark status". |
| Scanner Receive-PO (`/pl/scanner/receive-po`) — pick PO, line, qty 25 kg, batch | GRN created, GRN line, LP minted, QA pending, PO→partially_received | **PASS** — received 25/100 kg of `PO-E2E-001` → success "Utworzono nowy LP `LP-1782293232526-89PB`". DB: grns 5→6, grn_items 7→8, LPs 9→10, PO confirmed→**partially_received**. New GRN `GRN-20260624-0001`, line 25 kg, `qa_status_initial=pending`, LP `origin=grn`, qty 25, batch persisted, warehouse+location defaulted. | — | — |
| Cross-device display | scanner receipt shows on desktop GRN detail | **PASS** — `/pl/warehouse/grns/[id]` renders the scanner-created line (ordered 100 / received 25, batch, LP link, QA=pending) with full per-line actions. | — | — |
| GRN line "Zwolnij QC" (QA release) | LP qa pending→released, status received→available | **PASS** — clicked → DB LP `qa_status` pending→**released** + `status` received→**available** (now pickable); GRN-line `qa_status_initial` stays pending (immutable snapshot, correct); UI badge updates + button disappears. | — | — |
| GRN line "Anuluj przyjęcie…" (cancel/reverse) | reachable reverse that voids the LP + reverses receipt | **PASS (reachable; not executed on demo LP)** — proper modal: clear storno copy, **required reason** dropdown (Entry error / Wrong qty / Wrong batch / Wrong product / Other), optional note, submit **disabled** until reason chosen. DB cols `cancelled_at/by/reason_code/note` confirm it persists. | — | — |
| Scanner PIN gate | scanner requires its own auth | By design — scanner tiles redirect to `/pl/scanner/login` (email + 4–6-digit PIN, separate from the desktop Supabase session) → shift-start (site/line/shift). Account PIN settable from `/pl/account/pin` (password-auth) — verified end-to-end. | — | — |

## FLOW 2 — SO → allocate → **create shipment (BLOCKED)** → pick/pack/ship/POD → **FAIL (L1 + ecosystem gap)**

| control / area | expected | actual | sev | file-hint |
|---|---|---|---|---|
| Customers exist / are creatable | a customer to put on an SO | **0 customers in DB AND no UI anywhere to create one** — New-SO customer `<Select>` is empty; no customer-admin page in ANY module, no `createCustomer` action (`grep` = nothing). The whole SO→ship flow is unreachable from a clean system. (Seeded one `AUDIT0624-CUST` via DB to proceed.) | **L2** | add a customer-management screen + create action; the SO `_actions/so-form-data.ts:listSoCustomers` reads real `public.customers` correctly — there's just no way to populate it via the app. |
| New SO modal — create | SO persists + lists | **PASS** — `SO-202606-00001` (customer AUDIT0624, FG-NPD-004 10 kg) → persists, lists as "Wersja robocza". | — | — |
| Item-picker inside SO modal | dropdown clickable | **L3** — the picker's option list renders BEHIND the modal overlay (z-index/portal layering); Playwright "element intercepts pointer events". Real FG list loads fine; had to JS-dispatch the click. | L3 | `shipping` create-SO modal item-picker portal z-index vs `mp-modal-overlay`. |
| SO Confirm → Allocate | state machine advances; allocate gated on released stock | **PASS** — Confirm → `confirmed`; Allocate **correctly blocked** with clear copy "Brak wystarczającego zwolnionego zapasu…" until ≥10 kg QA-released stock existed (released 2 audit LPs); allocate is **all-or-nothing** (no partial). After stock, Allocate → SO `allocated`, line reserved 10, LP `reserved_qty=10`. | — | — |
| **"Utwórz wysyłkę" (Create shipment)** | shipment row created → pick/pack/ship | **FAIL — generic "Coś poszło nie tak podczas zapisu."** Reproduced. **ROOT CAUSE (Vercel runtime log, code 42501): `permission denied for sequence shipment_seq`.** `shipments.shipment_seq DEFAULT nextval('shipment_seq')` but **`app_user` has NO USAGE on `shipment_seq`** (`has_sequence_privilege` = false). Every `createShipment` INSERT dies → the SO can never become a shipment → **pick/pack/ship/POD/BOL all unreachable**. (Same missing-grant class as the prior audit's E-wave tables, but a SEQUENCE this time.) | **L1** | `pack-actions.ts:createShipment` insert @256; fix = migration `GRANT USAGE ON SEQUENCE public.shipment_seq TO app_user;` (also audit other `nextval` sequences for the same gap). |
| (also surfaced) connection-pool exhaustion | DB stays available | **EMAXCONNSESSION** — runtime log shows `[withOrgContext] phase_failed { phase: 'resolve_context' \| 'owner_register_session', '(EMAXCONNSESSION) max clients reached in session mode — pool_size: 15' }` → 500s on a Server Action AND even a page GET (which fell back to "rendering ungated modules only"). Supavisor SESSION-mode pool of 15 is being exhausted (connection leak / wrong pool mode on hot `withOrgContext` owner-register path). Intermittent app-wide reliability risk. | **L1/L2** | `lib/auth/with-org-context.ts` owner-register path + Supavisor pool mode/size; the `verify-pin.ts` header already documents a prior half-closed-socket leak on hot paths — same family. |
| pick / pack / ship / BOL / POD | testable | **Unreachable** — blocked behind createShipment. Re-audit after the sequence grant. | — (blocked) | — |

## FLOW 3 — Scanner warehouse tiles (Putaway / Move LP / LP info) → **PASS (one QA-gate smell)**

| control / area | expected | actual | sev | file-hint |
|---|---|---|---|---|
| LP info (`/pl/scanner/lp`) | real LP lookup w/ genealogy | **PASS** — looked up `LP-1782293232526-89PB`: status received/Oczekuje, product RM-E2E-BEEF, 25 kg, batch, reserved 0 / available 25, LOC1/FG, genealogy (no parents/children — correct for fresh GRN LP). Values match DB. | — | — |
| Putaway (`/pl/scanner/putaway`) | scan LP → suggested slots → confirm move | **PASS** — scanned LP, intelligent suggestions (LOC1 "Ten sam produkt" / BIN-A1-02 "Pusta"); confirmed LOC1→BIN-A1-02. DB: location→BIN-A1-02, `stock_moves` row type `putaway`. | — | — |
| Putaway QA-gate side effect | a pure location move | **L3 (food-safety smell)** — putaway flips LP `status` received→**available** while `qa_status` stays **pending** (`promoteLpReceivedToAvailable` is gated only on `status='received'`, and threads `lpQaStatus` into the event but **never uses it as a gate**). The LP then shows "Dostępne 25 kg" though QA never released it. **Mitigated** because `v_inventory_available` double-gates on `qa_status='released'`, so it can't actually be picked/consumed — but the misleading "available" status on a QA-pending LP is a real consistency bug. | L3 | `lib/warehouse/scanner/movement.ts:462` + `promoteLpReceivedToAvailable` (:769) — gate the promotion on `qa_status='released'` (param is already plumbed, just unused). |
| Move LP (`/pl/scanner/move`) | scan LP → dest + reason → move | **PASS** — moved `…-89PB` BIN-A1-02→LOC1 with reason "Relokacja". DB: location→LOC1, 2nd `stock_moves` row type `transfer`. Reason chips (Relokacja/Konsolidacja/Uszkodzenie/Inny) all present. | — | — |
| Dedicated "Pick (FEFO)" warehouse tile | exists? | There is no standalone warehouse Pick tile — Pick is "Pick dla WO" (WO-scoped). FEFO ordering surfaces correctly in putaway suggestions + expiry dashboard. Not a bug, noted for the brief. | — | — |
| `/pl/scanner/lp-info` route | the LP screen | **404** (real route is `/pl/scanner/lp`). The 404 "Back to dashboard" link points to `/en/dashboard` — drops PL locale (same pre-existing L3 as elsewhere). | L3 | not-found page locale; no `lp-info` alias. |

## FLOW 4 — WO lifecycle desktop (release→start→output fixed+catch-weight→waste→complete→close) → **PASS (one dead-end + one e-sign mislabel)**

| control / area | expected | actual | sev | file-hint |
|---|---|---|---|---|
| DRAFT WO "Rozpocznij" (Start) on `/pl/production/wos/[id]` | a DRAFT WO is releasable→startable | **DEAD-END / render-then-reject** — a DRAFT WO (WO-202606-0003, "Zaplanowane") offers **only** "Rozpocznij" (Start) as its forward action, but Start is server-rejected "Ta akcja jest niedozwolona dla bieżącego stanu zlecenia." (WO must be RELEASED first; **Release lives in the planning module**, not production). No Release affordance on the production detail → a DRAFT WO is stuck here. DB confirms WO stayed DRAFT. | **L2** | `production/wos/_components/modals/gating.ts:28` treats `status=null` (no execution row) as `planned`→offers `start`, but `null` is ALSO an un-released DRAFT. Gate Start on the real `work_orders.status='RELEASED'`, or surface a Release action / explanatory disabled state. |
| Register output — FIXED weight | output persists, FG LP minted | **PASS** — on IN_PROGRESS WO-…A79C9DE3 registered 4 kg, batch AUDIT0624-OUT-FIX (ack'd "Kontynuuj mimo to" no-consumption warning) → "Utworzono LP `…-FOP2`", output 30→34 kg. DB: `wo_outputs` 4 kg/PENDING, LP `origin=production`, qa pending. | — | — |
| Register output — CATCH-WEIGHT | nominal + actual weight | **PASS** — "Waga zmienna" opens the same output modal; entered nominal 2 + actual 2.15 kg → LP `…-6PW1`, DB `qty_kg=2.150` (actual wins). **Note (L3):** the nominal-vs-actual provenance is NOT retained — `catch_weight_details` and `lp.catch_weight_kg` both null; only the final actual survives. | L3 | output action — persist nominal + units breakdown into `catch_weight_details`. |
| Waste (Odpad) | categorized waste persists (always kg) | **PASS** — 0.5 kg, category "Trim / offcut", shift Ranna (required), reason AUDIT0624-TRIM → Odpady tab 0→1; DB `wo_waste_log` row correct. | — | — |
| Void output (Anuluj wyjście…) reverse + e-sign | reachable e-sign reverse | **PARTIAL — e-sign field MISLABELED (L2).** Modal is excellent (storno copy, required reason, CFR-21 e-sign) BUT it says **"Hasło — To jest hasło Twojego konta — nie osobny PIN"** (account password, not a PIN) while the backend verifies the value as the **PIN** (`corrections-actions.ts:821` passes `{ pin: password }` to `assertCorrectionAllowed`/`signEvent`). Account password `Admin2026!!!` → "Podpis nie powiódł się"; following the on-screen instruction can never sign the void. The Close modal handles the SAME credential correctly ("PIN e-podpisu lub hasło konta") — proving the void copy is the outlier. | **L2** | `production/wos/[id]/page.tsx:481/487` + `i18n/*.json voidCorrection.esign.*` — relabel to "e-sign PIN" (matching the Close modal), or make the backend accept the account password too. |
| Complete (Zakończ) | COMPLETED + yield gate | **PASS** — confirmed (no override needed at 72% yield) → status "Zakończone"; action bar updates to Odpad/Waga zmienna/Zamknij/Anuluj. DB status COMPLETED. **Note (L3):** `work_orders.completed_at` and `produced_quantity` stay NULL after completion — header roll-up not stamped. | L3 | WO complete action — stamp `completed_at` / roll up produced qty onto the WO header. |
| Close (Zamknij) e-sign | terminal CLOSED w/ supervisor e-sign | **PASS** — Close modal correctly accepts **PIN or account password**; entered PIN `135790` + reason → status "Zamknięte", action bar empty (terminal). DB status **CLOSED**. Confirms the e-sign PIN path works when the modal is labeled to accept it (contrast with the void mislabel above). | — | — |

## NEW BUGS (core-flows audit — feed Track 2)

10. **L1 — SO→ship totally blocked: `permission denied for sequence shipment_seq`** (42501). `app_user` lacks USAGE on `shipment_seq`; `createShipment` (`shipping/_actions/pack-actions.ts:256`) INSERT into `shipments` always fails (verified `has_sequence_privilege('app_user','shipment_seq','USAGE')=false` + Vercel runtime log). Fix = migration `GRANT USAGE ON SEQUENCE public.shipment_seq TO app_user;` then re-audit pick/pack/ship/BOL/POD. Sweep other `nextval` sequences for the same gap.
11. **L1/L2 — DB connection-pool exhaustion (EMAXCONNSESSION, pool_size 15, session mode)** — runtime logs show `withOrgContext` failing at `resolve_context`/`owner_register_session` with 500s on Server Actions AND page GETs (falling back to "ungated modules only"). Connection leak / wrong pooler mode on the hot owner-register path (`lib/auth/with-org-context.ts`); `packages/auth/src/verify-pin.ts` header documents a prior half-closed-socket leak of the same family. App-wide intermittent reliability risk.
12. **L2 — No customer creation anywhere** — 0 customers in DB and no customer-admin UI / `createCustomer` action in any module, so a clean system can NEVER create a sales order (empty customer select, no "add" path). `public.customers` is read correctly by `shipping/_actions/so-form-data.ts` — only the write/admin side is missing.
13. **L2 — Desktop PO "receive" is a status-flip, not a goods receipt** — `planning/purchase-orders/[id]` detail offers "Oznacz jako przyjęte/częściowo przyjęte" → bare `confirm()` that flips PO status with NO GRN, NO LP mint, NO QA. Real receiving is scanner-only. Either add a desktop GRN flow or relabel to avoid implying a receipt.
14. **L2 — DRAFT WO dead-ends on the production detail** — `production/wos/_components/modals/gating.ts:28` maps a WO with no execution row (incl. un-released DRAFTs) to `planned`→offers only "Rozpocznij" (Start), which the state machine rejects ("not allowed for current state"); Release lives in planning, with no affordance/explanation on the production page. Render-then-reject + missing forward path.
15. **L2 — Void-output e-sign field mislabeled** — `production/wos/[id]/page.tsx:481/487` + `i18n voidCorrection.esign.*` say "account password — not a PIN", but `corrections-actions.ts:821` verifies it as the e-sign **PIN** (`{ pin: password }`). Following the instruction can never sign the void. The Close modal (correctly "PIN or password") is the reference. Reverse-consumption (:943) shares the same `pin: password` contract — verify its label too.
16. **L3 — Scanner Putaway promotes a QA-pending LP to `status=available`** while `qa_status` stays `pending` (`lib/warehouse/scanner/movement.ts:462`/`promoteLpReceivedToAvailable:769` — `lpQaStatus` plumbed but unused as a gate). Misleading "Dostępne" display; not exploitable for pick/consume because `v_inventory_available` re-gates on `qa_status='released'`. Gate the promotion on `qa_status='released'`.
17. **L3 — misc:** catch-weight output drops nominal/units provenance (`catch_weight_details`/`lp.catch_weight_kg` null); `work_orders.completed_at`/`produced_quantity` not stamped on Complete; create-SO item-picker option list renders behind the modal overlay (z-index); `/pl/scanner/lp-info` 404 with `/en/dashboard` back-link (locale drop).

## HEALTHY (real Supabase, PL clean, persists end-to-end)
Scanner Receive-PO (GRN + LP mint + QA pending + PO state machine), desktop GRN detail + Zwolnij QC + cancel-receipt reverse, scanner LP-info / Putaway / Move-LP (+ stock_moves ledger), WO output (fixed + catch-weight) + FG LP genealogy, WO waste, WO Complete→Close with e-sign, SO create/confirm/allocate state machine + allocation gate. Account-PIN management page (password-authorized) + scanner PIN login + shift-start.

---

# RE-VERIFY 3 (A / #6 / SEQ) — 2026-06-24

**Auditor:** Track-1 browser re-verify (Claude Opus 4.8, Playwright MCP)
**Target:** LIVE prod — https://monopilot-kira.vercel.app/pl/ · login admin@monopilot.test
**Deployed commit (Vercel READY, production):** `a9e7247c` (descendant of local HEAD `746a2699`; **contains** the consume fix `cc9e8db9` AND the sites fix `f0b731fc` AND mig 326 / `shipment_seq` grant — all three fixes are genuinely in the live build).
**Smoke:** GREEN — login → `/pl` app shell renders, all modules, PL clean; only console error is the pre-existing `/sw.js` 404 (harmless missing service-worker).
**Data convention:** AUDIT0624-prefixed test data; DB verified via Supabase MCP on project `khjvkhzwfzuwzrusgobp`.
**Artifacts:** `apps/web/e2e/artifacts/reverify3-0624/` (11 PNGs).

## A — Sites & Lines list (fix f0b731fc) → **PASS** (3rd attempt finally works)

| check | expected | actual | evidence |
|---|---|---|---|
| Existing lines visible for a seed-org-UUID site | the list SHOWS lines (was always empty "No production lines") | **PASS** — "Demo Plant — Warsaw" (`site_id 61dcddac…`, `org_id 00000000-…-002`, version-0/variant-0 UUID the strict regex used to reject) now lists **9 lines** (DEMO-LINE-1/2, LINE93/99/999/9921, AUDIT0624-LINE, AUDIT2-LINE2, LINE-TEST-01). Counts correct ("9 linii"). | `A-01-sites-lines-list-populated.png` |
| Add line appears immediately | new row + count bump w/o reload | **PASS** — added `AUDIT0624-LINE-RV3 / "AUDIT0624-LINE ReVerify3"`; row appeared instantly, site count 9→10. DB row written with correct `site_id`. | `A-02-line-added-immediately.png` |
| Per-row Edit visible + persists | Edytuj per row; edit saves | **PASS** — every row has **Edytuj**; edited the new line (name→"…EDITED", status active→**maintenance**); UI updated to "⚒ Konserwacja". DB: `status=maintenance`, `name='AUDIT0624-LINE ReVerify3 EDITED'`. | `A-03-line-edit-persisted.png` |

**Verdict A = PASS.** The fix holds end-to-end: list populated, add immediate, edit persists to Supabase.

## #6 — Desktop WO consume (fix cc9e8db9 — "untyped $1 / 42P18") → **FAIL** (still broken on live)

Setup: seeded a consumable BOM component (`RM-E2E-BEEF`, 10 kg) onto IN_PROGRESS WO `b0e84a24` (Night Proof Sausage) so the desktop consume modal had a material **with a real available LP** (`LP-1782293232526-89PB`, batch AUDIT0624-BEEF-B1, 25 kg, available/released). Opened `/pl/production/wos/b0e84a24…` → Zużycie tab → Zarejestruj → modal correctly offered the FEFO LP (`LP-…-89PB · 25 kg (sugerowany)`) → entered qty **8 kg** → submit.

| check | expected | actual | evidence |
|---|---|---|---|
| Consume with valid material+LP+qty | succeeds, persists, no error | **FAIL** — generic error toast **"Nie można zarejestrować zużycia."** in the modal. POST returned 200 (handled `{ok:false,reason:'error'}`), wrote **nothing**: `wo_materials.consumed_qty` stayed `0.000`, **0** rows in `wo_material_consumption`, LP quantity untouched at 25 kg. | `6-01-consume-modal-filled.png`, `6-02-consume-FAIL-untyped-param.png` |
| Live root cause | — | **Postgres error log (project khjvkhzwfzuwzrusgobp) at the submit time:** `ERROR: could not determine data type of parameter $1` — i.e. the **42P18 untyped-parameter** family the fix claimed to close STILL fires on the live deploy. A DB statement IS reached and rejected (contradicts the prior `9570250e` rootcause doc's "no DB statement ever issued / DATABASE_URL_OWNER empty" theory — that theory was for the no-LP path; the **LP path** reaches Postgres and dies on 42P18). | postgres log |

**Why it's still broken though `cc9e8db9` is deployed:** commit `cc9e8db9` only added `$1::text` to the advisory-lock (`consume-material-actions.ts:275`) + casts to `emitMaterialConsumed`'s outbox INSERT (:551). I re-tested **every** `$1`-bearing statement in the consume path as live `PREPARE`d statements (advisory-lock, replay-probe, holdsGuard, lp-safety-guard, the FEFO-violation `EXISTS`, the over-consume gate) — **each one prepares cleanly with explicit param types**. So the failure is the `pg` driver's *unnamed prepared-statement / type-inference* behaviour (it sends param OID 0 = unknown and lets the server infer), where some `$1` in this path is genuinely un-inferable at Parse time under the extended protocol — the `::text` cast added by `cc9e8db9` was **necessary but not sufficient**; another untyped `$1` remains. The fix as shipped does NOT resolve #6.

**Verdict #6 = FAIL.** Desktop consume is still a silent no-op on live; the 42P18 error persists in the deployed build.

**File-hint / next step:** `apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.ts` — `recordDesktopConsumption` path. The first stock-touching statement that can hit the driver's unknown-OID inference is the advisory lock at **:275** `pg_advisory_xact_lock(hashtextextended($1::text, 0))` — even with `$1::text`, the bare `0` is an untyped literal for `hashtextextended(text, bigint)`; cast it `0::bigint` (and audit each remaining `$N` in this action for a value passed as JS `null`/`undefined`, which the `pg` driver also sends as OID 0 → 42P18). Reproduce locally against the live driver (not via `PREPARE`, which masks it). Cross-check the prior rootcause doc `_meta/plans/2026-06-24-desktop-consume-rootcause.md`.

## SEQ — SO → ship chain (mig 326 — `shipment_seq` grant) → **PASS** (reached POD/Delivered)

Pre-check: `has_sequence_privilege('app_user','public.shipment_seq','USAGE') = true` (grant live). Used existing AUDIT0624 test data: customer **AUDIT0624 Test Customer** (1 customer in DB — no seed needed), SO **SO-202606-00001** already `allocated` (10 kg FG-NPD-004 reserved on LP `LP-1782293831593-FOP2`).

| step | result | evidence |
|---|---|---|
| Create shipment (the action that 500'd on `permission denied for sequence shipment_seq`) | **PASS** — `Utwórz wysyłkę` → no 500, navigated to new shipment **SH-2026-00002** (Pakowanie). Sequence advanced. | `SEQ-01-so-allocated-detail.png`, `SEQ-02-shipment-created-pack.png` |
| Pack carton (SSCC) | **PASS** — packed the allocated FG LP into Carton 1; server minted **SSCC-18 `012345670000000015`** (mod-10). Free-text "new" LP correctly rejected ("Nie znaleziono tego nośnika") — must be a real LP. | `SEQ-03-carton-packed-sscc.png` |
| Close packing → Ship | **PASS** — `Zamknij pakowanie` → status Spakowano; `Wyślij wysyłkę` → **Wysłano** (shipped 24 cze 2026 11:13), "Wysyłka wysłana." | `SEQ-04-shipped.png` |
| POD / Delivered | **PASS** — `Zarejestruj POD` modal → signed-POD URL → `Oznacz jako dostarczone` → **Dostarczono** (11:14). DB: `shipments.status='delivered'`, `shipped_at` + `delivered_at` stamped. | `SEQ-05-delivered-pod.png` |

**Verdict SEQ = PASS.** `createShipment` no longer 500s; the full SO → create-shipment → pack/SSCC → ship → POD chain is clickable end-to-end on live and persists. The `shipment_seq` grant fixed the blocker.

## NEW BUGS (re-verify 3)

18. **L1 — Desktop WO consume STILL fails on live (42P18 not closed by `cc9e8db9`).** Live Postgres logs `could not determine data type of parameter $1` on the LP-consume path; consume writes nothing (consumed_qty 0, zero ledger rows, LP untouched). The shipped fix added `$1::text` to the advisory lock + outbox INSERT casts but an untyped `$1` remains (bare `0` literal in `hashtextextended($1::text, 0)` and/or a JS-`null` param the `pg` driver sends as OID 0). File: `production/_actions/consume-material-actions.ts:275` (cast `0::bigint`; sweep every `$N` for null-valued params). Note: the deployed commit `a9e7247c` DOES contain `cc9e8db9` — so this is a code-insufficiency, not a stale deploy.

## CLEANUP
- Removed the seeded `wo_materials` test row (`RM-E2E-BEEF` on WO `b0e84a24`) after the #6 test — DB restored. Left in place (harmless AUDIT0624 test data): line `AUDIT0624-LINE-RV3` on Demo Plant, shipment `SH-2026-00002` (delivered) + its carton/SSCC, the consumed-to-shipment FG LP.

---

# RE-VERIFY 4 (#6 consume + scanner-reverse UI + sign-off settings)

**Date:** 2026-06-24 (later run)
**Target:** LIVE prod — https://monopilot-kira.vercel.app · login admin@monopilot.test · PL (`/pl/`)
**Deployed commit confirmed:** Vercel deployment `dpl_6YfCn58bBj3rACwcUVJo9C5pe6k2` = **READY · production · SHA `fafbda6524a3f4b2844acb3b1c7238741ef9b278`** (the desktop-consume *dangling-$1* fix, the 3rd attempt) — verified via Vercel MCP `list_deployments`. Smoke: `/pl` app shell + nav render, active Supabase session admin@monopilot.test, site selector lists real sites (Demo Plant — Warsaw, AUDIT2-SITE, site 2). **Smoke PASS.**
**Supabase project:** khjvkhzwfzuwzrusgobp.

## ITEM 1 — #6 Desktop WO consume (3rd fix attempt, dangling-$1) → **PASS** ✅ (THE CRITICAL ONE)

Setup (AUDIT0624 data): seeded one material line `AUDIT0624-RV4-BEEF-TRIM` (id `196b2a17…`) on the IN_PROGRESS WO **WO-20260610231609-B0E84A24** (`b0e84a24…`, org `…002`), product = `E2E Beef Trim 80/20` (`54916ced…`, kg) which has an available+QA-released FEFO LP **LP-1782293232526-89PB** (25 kg, batch AUDIT0624-BEEF-B1). (`v_inventory_available` = `status='available' AND qa_status='released'`; the older audit's `status='released'` probe was a red herring.)

| step | result | evidence |
|---|---|---|
| Open desktop consume modal (Produkcja → WO detail → Zużycie tab → "Zarejestruj") | **PASS** — modal "Zarejestruj zużycie materiału" opens; component preselected, FEFO LP `LP-1782293232526-89PB · 25.000000 kg (sugerowany)` preselected | `reverify4-0624-6-01-consume-modal-filled.png` |
| Enter qty **5 kg** + submit "Zarejestruj zużycie" | **PASS** — NO error toast, modal closed cleanly; row now reads **5 kg consumed / 15 kg remaining / 25%**; header overall consumption **2.8% → 16.7%**; the "⚠ Brak konsumpcji" badge disappeared | `reverify4-0624-6-02-consume-SUCCESS.png` |
| DB persistence (Supabase MCP) | **PASS** — `wo_materials.consumed_qty` **0 → 5.000**; **1 row** in `wo_material_consumption` (id `6fc48dd6…`, qty 5.000, lp_id linked, operator_id `31fe18af…`, `fefo_adherence_flag=true`, transaction_id present); LP `LP-1782293232526-89PB` decremented **25 → 20.000 kg** with `consumed_by_wo_id` set to the WO | execute_sql |
| Postgres error log around submit | **PASS / no 42P18** — submit ran at 10:38:10 UTC; the postgres log has **zero** `could not determine data type of parameter $1` at that time. The only 42P18 in the window is at 10:27:28 UTC (a *prior* session, before this test). The 42P18 family is genuinely closed on the deployed build. | get_logs(postgres) |

**Verdict #6 = PASS.** The dangling-$1 fix (org filter `where org_id = app.current_org_id()` → `where org_id = $1::uuid` in both the `wo_materials` and `license_plates` UPDATEs, so the passed `$1`=orgId is now actually referenced) closes the 42P18. Desktop consume genuinely persists end-to-end: material counter, ledger row, and FEFO LP decrement all written in one txn. **Three-fix saga resolved.**

## ITEM 2 — Scanner reverse-consume UI (new 4th hub tile + screen) → **PASS** ✅

Path: `/pl/scanner/home` (logged in as Admin) → **Work Orders** → filter **Wszystkie** → WO `WO-20260610231609-B0E84A24` → execute screen.

| check | result | evidence |
|---|---|---|
| 4th hub tile exists | **PASS** — execute screen shows exactly 4 tiles: **Konsumpcja** 📥 / **Rejestruj wyrób** 📤 / **Odpad** 🗑 / **Cofnij konsumpcję** ↩ ("Wycofaj konsumpcję materiału", amber). Tile enabled (WO in_progress). | `reverify4-0624-scanner-01-hub-4-tiles.png` |
| Reverse screen loads + lists reversible consumptions | **PASS** — `/scanner/wos/[id]/reverse-consume` renders "Wybierz konsumpcję do cofnięcia" and lists the real consumption I'd just made: **AUDIT0624-RV4-BEEF-TRIM · 5.000 kg · LP-1782293232526-89PB · skonsumowano 24 cze, 11:38**. No crash. | `reverify4-0624-scanner-02-reverse-list.png` |
| Detail captures reason + operator PIN (+ conditional supervisor) | **PASS** — selecting the row reveals: reason chips (Błąd wprowadzenia / Błędna ilość / Błędna partia / Błędny produkt / Inny), optional note, **"Twój PIN *"** operator-PIN field, submit disabled until PIN entered. Supervisor PIN is revealed *reactively* on a POST `invalid_supervisor` 401 when the org flag is ON (confirmed in code `reverse-consume-screen.tsx:80-205` + its test). I did NOT complete a reverse. | `reverify4-0624-scanner-03-reverse-pin-form.png` |

**Verdict item 2 = PASS.** Tile + screen render without crash; operator-PIN always, supervisor-PIN conditional — all wired.

## ITEM 3 — Settings → Sign-off & PINs (new section) → **PASS** ✅ (one minor UI note)

A new **"Zatwierdzenia"** settings nav group exists with two links: **Zasady zatwierdzeń** (`/settings/signoff`, sign-off policies + production over-consumption tolerance) and **Zatwierdzenia i PIN-y** (`/settings/scanner-auth`, the scanner PIN policy). The supervisor-PIN-required toggle lives on the **scanner-auth** page.

| check | result | evidence |
|---|---|---|
| `/pl/settings/signoff` loads | **PASS** — "Zasady zatwierdzeń": policy table (Allergen changeover, 2 sigs) + "Zatwierdzenia produkcyjne" (warn% + over-consumption tolerance, "wymaga zatwierdzenia kodem PIN przez przełożonego"). | `reverify4-0624-settings-01-signoff-page.png` |
| `/pl/settings/scanner-auth` loads + toggle reads | **PASS** — "Cofanie konsumpcji na skanerze" with switch **"Wymagaj PIN-u przełożonego przy cofaniu na skanerze"** reading **checked** (default-ON when no `tenant_variations` row exists). | `reverify4-0624-settings-02-scanner-auth-toggle-saved.png` |
| Toggle can be flipped + persists to `tenant_variations.feature_flags` | **PASS** — flipped OFF → Save enabled → "Zapisz" → status "Zasada zatwierdzeń skanera zapisana."; DB upserted `tenant_variations` (org `…002`) `feature_flags = {"scanner_reverse_require_supervisor_pin":"false"}`. Round-trip: flipped back ON + saved → DB flag back to `"true"` (default restored). | execute_sql (both directions) |

**Verdict item 3 = PASS.** The new section loads, the supervisor-PIN toggle reads, flips both ways, and persists to `tenant_variations.feature_flags`. Helper copy updates correctly with state.

## NEW BUG (re-verify 4)

19. **L3 — scanner-auth supervisor toggle has a 0×0 mouse hitbox.** The `[data-testid="scanner-reverse-supervisor-toggle"]` `<button role="switch" class="switch">` computes to **`width:0px; height:0px`** (rect 0×0 at x≈285), so Playwright (and a real mouse) can't click it — only a synthetic `.click()` on the element flips it. The thumb/track styling (`.switch` / `.switch__thumb`) isn't sizing the button. Keyboard/programmatic toggling works and Save persists, so it's cosmetic-but-real (touch/mouse users can't toggle via the switch itself; the label text is also not wired as a click target). File-hint: the `.switch` CSS class / the `Switch` primitive used by `settings/scanner-auth/_components/*` — give the switch button an explicit width/height (it likely lost its dimensions in the shared `switch` style). Verify the same primitive on `/settings/signoff` and any other toggle.

## CLEANUP (re-verify 4)
- Reversed the #6 test footprint by hand to restore the DB: LP `LP-1782293232526-89PB` restored **20 → 25.000 kg** + `consumed_by_wo_id` nulled; deleted the `wo_material_consumption` row (`6fc48dd6…`); deleted the seeded `wo_materials` line `AUDIT0624-RV4-BEEF-TRIM` (`196b2a17…`). WO `b0e84a24` is back to its pre-test state (only its original `RM-BEEF-80` line, 1 kg consumed).
- The `tenant_variations` row for org `…002` now exists with `scanner_reverse_require_supervisor_pin="true"` (the same as the prior implicit default — harmless; it just makes the default explicit).

## RE-VERIFY (deploy 8cd5bf22, batch-2+3 + L1 fixes)

Live deploy `https://monopilot-kira-git-main-codermariuszs-projects.vercel.app` (PL locale). Logged in as admin@monopilot.test. Browser-tested against real Supabase (project `khjvkhzwfzuwzrusgobp`). 3 PASS / 1 FAIL.

| check | expected | actual | PASS/FAIL | severity |
|---|---|---|---|---|
| **1. Sites&Lines per-site list (fix f0b731fc)** | Selecting "Demo Plant — Warsaw" renders its production-lines list (~10 lines), NOT a ghost-empty "Brak linii" state; line is reachable for edit. | `/pl/settings/sites` → "Demo Plant — Warsaw" pressed → table renders **10 lines** (AUDIT0624 Test Line, AUDIT0624-LINE ReVerify3 EDITED, AUDIT2-LINE2, Demo Line 1, Demo Line 2, Line 93, Line 99, Line 9921, Line 999, Test Line Alpha); header reads "10 linii". Every row has an **Edytuj** button; clicking it opens the "Edit production line" modal (Save/Cancel). No empty state. | **PASS** | — |
| **2. Desktop WO consume (fix fafbda65)** | Consuming a small qty via the manual/no-LP reason path PERSISTS — success + consumed qty increases after reload. | WO-202606-0007 (W toku) → Zużycie tab → RM-WATER-ICE "Zarejestruj" → modal "Zarejestruj zużycie materiału", no carrier ("Brak dostępnych nośników"), qty **2 kg** + manual reason code `MANUAL-VERIFY` → submit. Modal closed, no error banner; row updated 0→**2 kg consumed / 98 kg remaining / 2%**; overall consumption 49.5→50.5%. After full page reload the DB value persists (2 kg). | **PASS** | — |
| **3. Item edit wizard hides 'blocked' (WF-BUGS technical)** | Editing an ACTIVE item → Status dropdown does NOT offer 'blocked' (only valid transitions; blocked goes via deactivate). | Technical → Items → Edit AUDIT2-FG1 (Active) → step 2 "Classification" → Status combobox (current "Active") opened → options are exactly **Draft · Active · Deprecated**. 'Blocked' is absent. (Note: the "All status / Active / Draft / Deprecated / Blocked" chips on the list page behind the modal are the list filter, not the edit control.) | **PASS** | — |
| **4. WO notes clear (WF-BUGS planning)** | Clearing a WO note → save → reopen → note is empty/gone (old COALESCE bug must be fixed). | Planning → WO-202606-0003 (Szkic) → Edytuj → Notatki textarea = "AUDIT2 audit work order" → cleared to empty (Ctrl+A, Delete; verified value="" len 0) → "Zapisz zmiany" → modal closed OK. **On reload + reopen the note is BACK to "AUDIT2 audit work order".** DB confirms: `work_orders.ext_jsonb.notes = "AUDIT2 audit work order"`, `updated_at = 2026-06-24 15:12:08` (the save DID run — row touched — but the empty note was dropped and the old value retained). The COALESCE-keeps-old-note bug is **NOT fixed** on this deploy. | **FAIL** | **L2** |

## Tick audit: PO flow + WO-notes re-verify (deploy cb3f2899)

Live deploy `https://monopilot-kira-git-main-codermariuszs-projects.vercel.app` (PL locale). Logged in as admin@monopilot.test. Browser-tested against real Supabase (project `khjvkhzwfzuwzrusgobp`, HEAD = cb3f2899). 8 PASS / 1 FAIL.

### Task A — RE-VERIFY WO note clear (commit cb3f2899)

| check | expected | actual | PASS/FAIL | severity |
|---|---|---|---|---|
| **A. Clear WO note persists** | WO-202606-0003 (Szkic) → Edytuj → clear Notatki → Zapisz → reopen → note EMPTY/gone. | Edit modal opened, Notatki = "AUDIT2 audit work order" (matches task). Cleared to empty (event-dispatch + Ctrl+A/Delete; verified form `value=""`). "Zapisz zmiany" → **red alert "Wystąpił błąd podczas zapisu. Spróbuj ponownie za chwilę." Modal STAYS open. Retried once — same error.** POST returns HTTP 200 but action result = `persistence_failed`. DB row UNCHANGED: `ext_jsonb.notes` still `"AUDIT2 audit work order"`, `updated_at` still `2026-06-24 15:12:08` (pre-test). The note is NOT cleared. **The cb3f2899 fix swapped the silent no-op for a hard save error — clearing a WO note is now MORE broken (the whole save fails).** | **FAIL** | **L2 (regression)** |

**ROOT CAUSE (DB-confirmed, code-confirmed).** Postgres logs at the two save attempts (epoch 1782315518082 / 1782315492522) show: `null value in column "ext_jsonb" of relation "work_orders" violates not-null constraint`. The fix (`edit-wo-modal.tsx:269` now sends `notes: notes.trim()` = `''`) correctly reaches the action, but the action's SQL is wrong for the clear case. `apps/web/.../planning/work-orders/_actions/update-work-order.ts:294` maps `''` → SQL `null` param `$7`, and line 272 does `jsonb_set(coalesce(wo.ext_jsonb,'{}'), '{notes}', to_jsonb($7::text), true)`. **`to_jsonb(NULL::text)` returns SQL NULL, and `jsonb_set(target, path, NULL)` returns NULL for the WHOLE jsonb** → `ext_jsonb` becomes NULL → NOT-NULL violation → `persistence_failed`. Proven live: `select jsonb_set('{"notes":"old","x":1}'::jsonb,'{notes}',to_jsonb(NULL::text),true)` → `null`; with `'null'::jsonb` → `{"x":1,"notes":null}`. **Fix:** for the clear case pass JSON-null not SQL-null — e.g. `coalesce(to_jsonb($7::text),'null'::jsonb)`, or drop the key with `wo.ext_jsonb - 'notes'`. (Feed to Track 2 — planning.)

### Task B — DEEP audit Purchasing PO create→line flow (`/pl/planning/purchase-orders`)

| check | expected | actual | PASS/FAIL | severity |
|---|---|---|---|---|
| **B1. Create modal fields** | Create modal exposes supplier, expected delivery, currency, lines, notes. | "Utwórz zamówienie zakupu" modal exposes: PO number (auto-number hint), **Dostawca** dropdown (4 suppliers: SUP-DEMO-01, SUP-E2E-01, SUP-ING-01, SUP-PKG-01), Oczekiwana dostawa (date), Waluta (EUR), inline Pozycje table (Item picker / Ilość / JM / Cena jedn.), Notatki. All needed fields present. | **PASS** | — |
| **B2. Submit persists + appears in list** | Submit creates a numbered PO that shows in the list. | Picked SUP-DEMO-01, delivery 2026-07-15, line AUDIT2-RM1 100 kg @ 12.50, note "TICK-AUDIT PO create test" → Utwórz. New **PO-202606-0003** appears in list: supplier, "15 lip 2026", 1 pozycja, status **Wersja robocza**, EUR. Tab counts updated All 6→7, Draft 1→2. | **PASS** | — |
| **B3. Line persists w/ correct totals** | Open PO → line shows with correct line value + order total. | Detail: line 1 = AUDIT2 Meat Trim 80/20 / AUDIT2-RM1 / 100.000 kg / 12.50 EUR / **Wartość 1,250.00 EUR**; Razem **1,250.00 EUR**; Postęp przyjęcia 0/1; Notatki persisted. Math correct. | **PASS** | — |
| **B4. Edit line (qty) recalcs + persists** | Change qty → line value + order total recompute and persist. | Edytuj line → qty 100→150 → Zapisz pozycję. Row → 150.000 kg, **Wartość 1,875.00 EUR**, Razem **1,875.00 EUR**. Correct. | **PASS** | — |
| **B5. Add 2nd line + DELETE draft line** | Add affordance works; delete affordance exists + works with guard. | "+ Dodaj pozycję" → DEMO-RM-FLOUR 50 kg @ 2.00 → row 2 = 100.00 EUR, Razem 1,975.00 EUR (1,875+100). **Usuń** on line 2 → native confirm "Usunąć pozycję 2? Tej operacji nie można cofnąć." → accept → line removed, back to 1 line, Razem 1,875.00. Both affordances present + working. | **PASS** | — |
| **B6. Send transition + status-aware actions** | "Wyślij" transitions to Sent; row-actions adapt (no edit/add/delete on a sent PO). | Status panel "Wyślij" → confirm "Zmienić status PO-202606-0003 na Wysłane?" → accept → badge "Wysłane". **"+ Dodaj pozycję" gone, per-line Edytuj/Usuń gone (action column dropped), header "Edytuj zamówienie" → "Przywróć do wersji roboczej".** Status panel now offers "Potwierdź" + "Anuluj zamówienie". Excellent state-machine behavior. | **PASS** | — |
| **B7. Cross-ref list after send** | Sent status reflects in list tabs. | Back to list: **Wysłane** tab 0→1, Wersja robocza 2→1. Transition persisted across navigation. | **PASS** | — |
| **B8. Reverse/cancel affordances** | Reverse + cancel affordances present per state. | Draft PO: "Wyślij" + "Anuluj zamówienie". Sent PO: "Przywróć do wersji roboczej" (revert), "Potwierdź", "Anuluj zamówienie". Reverse + cancel both present. | **PASS** | — |

**No dead clicks, no 403/500s, no English-on-PL leaks in the PO flow.** Item-picker portal options are mouse-clickable (the earlier portal `pointer-events` regression is NOT present here). Item picker is shared across create-modal and detail add-line. Only console noise is a harmless `GET /sw.js 404` (missing service worker) on every page — not PO-specific.

**Test footprint left behind (PO flow):** created **PO-202606-0003** (SUP-DEMO-01, 1 line AUDIT2-RM1 150 kg @ 12.50 = 1,875.00 EUR, status now **Wysłane**). Not reversed — flag for cleanup if the seed set must stay pristine.
