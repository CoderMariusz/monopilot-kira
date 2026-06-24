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

