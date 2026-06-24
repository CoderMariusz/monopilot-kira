# 3-TRACK plan — next 8h & 24h (2026-06-24)

Owner wants 3 parallel tracks over the day, token-paced. **Browser is a SINGLE shared resource → Track 1 is serial
(one tester agent at a time).** Tracks 2 & 3 run in parallel (no browser, except Track 3 screenshots which wait for the
browser to free).

## Token pacing (owner's budget — respect it)
- **Now → 16:00:** LOW intensity (owner needs tokens for other projects). Few concurrent agents; Track 1 (naturally
  serial/low) + Track 3 docs (cheap) + light Track 2. Sparse crons (~every 90 min, 1–2 agents).
- **18:00 → ~23:00:** HIGH intensity (up to ~50% of the window over ~5h). Dense Track-2 fix fan-out + parallel. Crons
  ~every 45 min, more agents.
- **Reserve ~30% of the weekly budget for tomorrow (05:00–20:00).** Hard stop the day's autonomous spend ~23:00.
- Codex hitting its cap = fine/expected (efficient window use); pace Codex bursts to the high-intensity evening.

## TRACK 1 — Browser audit (serial, Playwright MCP; "tester agent")
A tester agent logs in (admin@monopilot.test / Admin2026!!!), opens ~3 pages per run, **actively uses** them (creates
records, clicks every control), and reports per-page findings. ~255 pages / 3 ≈ **~85 serial runs** → multi-day; the
8h/24h gets through a PRIORITIZED subset. Findings append to `_meta/plans/2026-06-24-browser-audit-findings.md`; real
bugs feed Track 2.

**Priority order (highest value first):**
1. The 6 NEW E-waves (cold-chain, freight, yard, scheduler, cycle-count, andon) — mocked tests missed real bugs, these
   NEED browser verification.
2. Core operational flows: scanner (consume/output/receive/putaway/move/pick/qa), WO lifecycle, PO→GRN, inventory/LP,
   SO→pick→ship.
3. NPD pipeline, Technical (items/BOM/allergens), Planning (MRP/forecasts/suppliers).
4. Quality (holds/NCR/CAPA/inspections), Reporting/dashboards/OEE.
5. Settings/admin (many; lower value — batch & skim).

### TRACK-1 AUDIT CHECKLIST (what every tester run checks, per page)
1. **Loads** — page renders (no 404/500/blank), correct locale (PL), no raw i18n keys / English leak.
2. **Every button/action reacts** — clicking opens a modal / navigates / shows a toast / changes state. **Flag every
   DEAD click** (no visible reaction) with the control's label + location.
3. **Tables/lists** — are ALL expected row-actions present AND enabled? Are they **logically assigned to the row's
   lifecycle state** (draft → edit/delete; sent/posted → cancel/correct NOT edit; terminal → view-only)? Any action
   that 403s/errors but is still shown?
4. **Create flow ("add an element")** — actually CREATE a record (PO line, item, appointment, count, etc.): does the
   add modal expose ALL input fields? does Submit persist? does it then APPEAR in the list/table? Validation errors shown?
5. **Reverse / correction (owner priority)** — for the entity, is there a reachable way to UNDO/correct: cancel, reverse,
   void, unblock, delete-draft, deallocate? If the real world needs an undo and there's none → flag it.
6. **References / deep-links** — every link goes to the RIGHT place (correct entity, no 404, correct locale prefix).
7. **States** — empty / loading / error / permission-denied render sensibly (not a blank or a crash).
8. **Data sourced not faked** — numbers are real (Supabase), consistent across views (e.g. a count shown here matches
   the detail there); no placeholder/`notLive`/hardcoded sample data.
9. **Logical consistency** — the page's available actions match the entity's state machine + business rules (can't ship
   an un-picked SO; can't consume on a closed WO; etc.).
10. **Permissions** — controls the user shouldn't have are hidden/disabled, not just server-rejected on click.
Output per page: a table { control/area · expected · actual · severity L1/L2/L3 · file hint }.

## TRACK 2 — Fix & update (parallel, Codex/Claude; NO browser)
Consumes Track-1 findings + the existing backlog. Auto-fix CLEAR bugs (build-gated, committed); queue only true
flow-decisions. Standing queue at start:
- The 2 deferred E-wave follow-ups: **E2B hold txn-sharing** (careful refactor of shared hold-actions.ts) + **E8
  separate-approver SoD** (needs owner's role decision).
- **R6b** NPD approver UUID→name (still open).
- Whatever the owner's answers to Q1–Q8 unblock (scanner-reverse, PO-amend, shipping-reverse, D365, etc.).
- New bugs Track 1 surfaces (the main feed).
Discipline carried over: tell Codex "do NOT run build" (orchestrator runs ONE build gate); `next build` is the gate;
EXACT action-file paths for backend+UI lanes; adversarially review new backend before trusting it.

## TRACK 3 — Full module guide / "guild" (parallel; screenshots wait for browser)
Extend `docs/guide/03-module-howto.md` (the existing start) into a complete guide. Per module produce:
- **Function inventory** — the list of EVERY action the module exposes (e.g. Purchasing: create PO, add/edit/delete
  line (draft), send, confirm, receive (scanner/desktop), cancel GRN line, …) with what each does + where the data
  comes from + its reverse/correction (how to undo). This is derivable from the `_actions` + the audit docs (no browser).
- **User how-to** — step-by-step "how to add / remove / register / deregister a delivery" etc. per the owner's ask.
- **Screenshots** — once Track 1 frees the browser, a screenshot agent captures each module's key screens → embed.
Output: `docs/guide/modules/<NN>-<module>.md` per module + an index.

## Deferred / decision-gated (from 5am — see 2026-06-24-5am-questions.md, Q1–Q8)
Q1 scanner-reverse · Q2 wrong-PO amend · Q3 cycle-count approval rule (built, confirm) · Q4/Q6 reporting/thresholds
(done, confirm scope) · Q5 NPD revert · Q7 D365 live · Q8 shipping-reverse.

## 24h cron schedule (proposed — set after owner answers)
- Day loop `7,52 * * * *`-ish but GATED to LOW intensity 05:00–16:00 (1 tester run + 1 doc lane per tick).
- Evening loop ramps 18:00–23:00 (HIGH: tester + 2–3 fix lanes per tick).
- One-shot 23:00 → wind down for the day (reserve tomorrow's budget). One-shot ~05:00 tomorrow → resume.
- Hourly progress note; do NOT push (owner pushes).

## LIVE-AUDIT FIX QUEUE (2026-06-24, from Track-1 browser audit on the new deploy)
Source: `_meta/plans/2026-06-24-browser-audit-findings.md`. Priority order for the evening HIGH window:
1. ✅ **DONE — app_user grant gap** (mig 323, c8b38911): migs 315-318 granted wave-E tables to
   `authenticated` not `app_user` → cold-chain/freight/yard/cycle-count all `permission denied`.
   Applied live + committed. **Re-run the tester on these 4 waves** to confirm + audit their
   reverse/void paths (were unreachable behind the grant gap).
2. **L1 — Scheduler perms dead** (seed mig, next free number): `scheduler-actions.ts:21-23` enforces
   `scheduler.run.dispatch` / `scheduler.matrix.read` / `scheduler.matrix.edit` but only
   `scheduler.run.read` is seeded (mig 260) → "Uruchom harmonogram" + changeover matrix dead for
   ALL roles incl. admin. Fix: seed the 3 perms to the roles that already hold `scheduler.run.read`
   (mirror the cold-chain/yard/freight perm-seed in mig 319). Verify on live + ledger-record.
3. **L1 — Cold-chain temp save `column gi.item_id does not exist`** on `/warehouse/grns/[grnId]`.
   `grn_items` column is `product_id`. `git log -S "gi.item_id"` is EMPTY (not in any committed
   file) → INVESTIGATE: it's likely a DB VIEW/FUNCTION (created ad-hoc via MCP, not a migration)
   referencing `gi.item_id`. Hunt `pg_views`/`pg_proc` for `item_id` on a grn_items join; fix to
   `product_id` via a new migration. Deploy revision already confirmed = 449772ae (not stale).
4. **L2 — render-then-403 anti-pattern**: scheduler run button + matrix link (and similar) are
   shown/enabled then server-rejected. Gate on the real permission (hidden/disabled), not just deny.
5. **L1 (from Track-3 prod guide) — RBAC enum drift**: correction perms (`production.{output,
   consumption,waste}.correct`, `production.corrections.closed_wo`, `production.wo.cancel`) are
   seeded via migs 293/296/225 + consumed by actions but ABSENT from `permissions.enum.ts` →
   invisible to enum-lock guard + Settings→Roles matrix. Add to the enum + bump the test count
   (careful: also the scheduler perms from #2 likely belong in the enum too).
6. **L3 polish**: andon OEE shows "-" (not computed); andon tile hrefs omit `/${locale}`;
   `/pl/quality/cold-chain` 404 back-link hardcodes `/en/dashboard`.
   (NOTE: queue #2 scheduler perms = DONE, mig 324 / 27e60228.)

## OWNER-FOUND LIVE BUGS (2026-06-24, Settings → Sites & Lines + dock doors) — root-cause lane a953 running
The owner found these just clicking ~3 fields — the tester was TOO SHALLOW (checked page-load, not
create→persist→edit→cross-ref). OPEN list, expect more of this class everywhere:
- **L1 Add line does NOT persist the site link** — the site always shows "No production lines are
  assigned"; the line is created without site_id (or the per-site list query mismatches). DATA INTEGRITY.
- **L1 No way to edit a created line** — no update affordance/action in Settings Sites & Lines.
- ~~L2 Line table omits the warehouse column~~ — **WON'T-FIX (owner 2026-06-24): site ≡ warehouse
  (same `site_id`); a warehouse column/picker on a line DUPLICATES the site. Unify all terminology on
  "site"; do NOT add warehouse fields to the lines UI. Bug 1 (refresh) is the ONLY sites&lines fix.**
- **L1? Dock doors "Something went wrong"** — confirm mig 323 grant fixed it or there's a 2nd cause.
- **L3 "Add machine" button near-invisible** — plain text vs the blue "+ Add line"/"+ Add process"; wrong variant.

## TRACK-1 RIGOR + VERIFY LOOP (owner mandate 2026-06-24)
- The tester MUST go DEEP per entity, NOT page-load-only: CREATE a record → confirm it PERSISTS and
  DISPLAYS everywhere it should (its list, its parent, related settings) → EDIT it → check cross-references
  and related table columns → REVERSE/delete. The owner found 4 bugs in one create-flow the tester skipped.
- Tests are LIVE, never mocks — confirm against the running app + the real Supabase rows.
- **VERIFY LOOP:** every Track-2 fix MUST append a Track-1 RE-VERIFY item below. Loop = Tor1 finds →
  records → Tor2 fixes → **Tor1 re-clicks the exact path to confirm live**. A fix is NOT done until
  re-verified live on the new deploy.
- LOW intensity raised ~10% (owner) — a little more per tick, still token-aware until 16:00.

## TRACK-1 RE-VERIFY QUEUE (clear these FIRST each tick, after the fix's redeploy is READY)
- [!] mig 323 grant — cold-chain / freight / yard / cycle-count: grant CONFIRMED (app_user has CRUD on all 8 tables).
      Freight (carrier created+persisted) PASS; Cold-chain (temp range created+persisted, old gi.item_id bug GONE) PASS;
      Cycle-count (session created+persisted, but list needs reload — NEW L2) PASS-with-caveat; **Yard FAIL** —
      /settings/infra/docks + /yard + /yard/appointments all crash "Coś poszło nie tak" via function-prop-across-RSC
      (yard-labels.ts), NOT the grant. (re-verified 2026-06-24, deploy c4872e9d)
- [!] mig 324 scheduler perms — /pl/scheduler: perms seeded (4×6 roles); changeover matrix loads for admin (matrix.read PASS).
      "Uruchom harmonogram" no longer 403s BUT now fails "Coś poszło nie tak" — NEW L1 ambiguous `id` (42702) in
      MATRIX_SELECT/loadChangeoverMatrixForRun. Run not end-to-end. (re-verified 2026-06-24, deploy c4872e9d)
- [!] Settings → Sites & Lines: add line → line PERSISTS (correct site_id) + badge count updates, BUT the detail-panel
      lines list NEVER renders (empty for ALL sites, even Demo Plant w/ 8 lines, even after reload) → Edit unreachable.
      NEW L1: `queryLinesForSite` SELECT DISTINCT+ORDER BY → 42P10. c4872e9d fixed the wrong layer (client cache).
      (re-verified 2026-06-24, deploy c4872e9d)
- [!] dock doors page — STILL "Coś poszło nie tak" (2nd cause = yard-labels function props, see mig-323 line above).
- [ ] (after fix) "Add machine" button matches the other +Add buttons. — NOT RE-TESTED this tick (no fix shipped yet).

## RE-VERIFY ROUND 1 → fixes in flight (2026-06-24 ~mid-morning)
Re-verify of c4872e9d FAILED A & C and exposed real root causes (my earlier Bug-1 fix was the wrong layer):
- **Fix 1 — sites&lines 42P10** (drop DISTINCT in queryLinesForSite) — DONE `8ecbb0ee`, live-query-verified. RE-VERIFY pending redeploy.
- **Fix 2 — scheduler 42702** (MATRIX_SELECT_CM cm-qualified in the join) — DONE `8ecbb0ee`, live-query-verified. RE-VERIFY pending.
- **Fix 3 — yard whole-module crash** (function-valued label props Server→Client → build labels client-side; 4 views + 4 pages) — DONE (yard lane), typecheck + 25/25 RTL. RE-VERIFY pending.

### NEW L1s flagged by the yard lane — SAME crash pattern (server→client function props), NOT yet fixed:
- **`/settings/integrations`** — `settings/integrations/page.tsx:422-428` passes function-valued `IntegrationLabels`
  (`categorySummary`, `connectedBadge`, …) into client `<CategoryAccordion>` → identical crash. Fix: build those labels client-side.
- **`/quality/trace`** — `quality/trace/page.tsx:90` passes `buildDetailHref={(type,nodeId)=>…}` (a raw function) into
  client `<TraceWorkbench>` → identical crash. Fix: build the href client-side (or pass serialisable data).
- (Cleared safe by the lane: reporting, planning/mrp, production tables, settings/notifications+email — those function-labels stay server-side.)

### Still queued
- **L2 cycle-count list doesn't refresh after create** (`/warehouse/counts`) — same class as the sites refresh.
- `gi.item_id` cold-chain — re-verify saw it GONE on temp-ranges; needs a targeted check on the GRN-line temp-save path before closing.

### LESSONS (process)
- NEVER gate a build with `… | tail` — the pipe's exit code masks `next build` failure. Use `build > log 2>&1; echo EXIT=$?`.
- NEVER run a build while a concurrent edit lane is mid-refactor (it catches a half-done tree). Wait for the lane to commit.
- Root-cause by READING code is insufficient — REPRODUCE the live error (the a953 lane reasoned "cache race"; the real bug was a 42P10 the query throws). Verify the fixed query live before trusting.

## RE-VERIFY QUEUE additions (batch 35339648→ next deploy)
- [x] `/settings/integrations` loads (no RSC crash) — fb98657e. PASS on crash-fix. NEW L2: "Przeglądaj katalog" is a DEAD click (catalog/accordion unreachable). (re-verified 2026-06-24, deploy 1142f7f0)
- [x] `/quality/trace` loads (no RSC crash) — fb98657e. PASS. Ran real trace on LP-1782211767577-B473 → full genealogy; LP node deep-link resolves to the right LP detail. (re-verified 1142f7f0)
- [x] Settings→Roles matrix correction perms (76a4c9b0 enum) — PASS w/ caveat. 5 perms in permissions.enum.ts:205-225 + deployed; matrix is enum-driven ⇒ assignable. Granular 241-perm matrix UI not directly reachable from /settings/users to click each row (coarse grid only). (re-verified 1142f7f0)
- [x] PO cancel-with-stock (1142f7f0) — PASS. Server guard `po_has_receipts` verified in deployed source + `received` terminal. Reopen BUTTON confirmed ABSENT (queue Reopen-button UI lane). META L2: PO cancel has NO UI affordance anywhere (detail/list) — couldn't trigger the error in-browser. (re-verified 1142f7f0)

## TRACK-1 RE-VERIFY 2 RESULTS (deploy 1142f7f0, 2026-06-24) — full A–G + new-page audit in `2026-06-24-browser-audit-findings.md`
- [!] **A — Sites&Lines** — FAIL. 42P10 gone + line CREATE/persist/count work (8→9), but the per-site lines LIST is still empty for ALL sites at runtime (RSC payload has 0 line rows); Edit unreachable. NEW L1 #5: `queryLinesForSite` returns [] under `withOrgContext` despite standalone SQL returning 9.
- [x] **B — Scheduler** — PASS. Run is end-to-end (real sequence, 4 lines), matrix loads. 42702 resolved.
- [x] **C — Yard** — PASS. All 4 pages load; dock door + appointment created/persisted/listed/cross-ref'd.
- [x] **D — /settings/integrations** — PASS (crash-fix) + NEW L2 #7 (dead "Przeglądaj katalog").
- [x] **E — /quality/trace** — PASS (trace + deep-link resolve).
- [x] **F — Settings→Roles** — PASS w/ caveat (enum verified; granular matrix UI not reachable here).
- [x] **G — PO cancel-with-stock** — PASS (server guard verified) + META L2 #8 (no cancel UI) + Reopen button absent.
- NEW L1 #6: **desktop WO consume silently fails** (`consume-material-actions.ts` recordDesktopConsumption → generic error, writes nothing). Core production consume broken on desktop.
- NEW L3 #9: `/pl/production/work-orders/[id]` leaks WO-state JSON to the browser (API route.ts under locale UI segment).

## OWNER DECISION (2026-06-24) — scanner-reverse auth = SECURE (no mig 322)
operator-PIN-only mode STILL requires the operator to hold `production.consumption.correct` →
only leads/supervisors can reverse. Do NOT seed the perm to scanner-operator roles (no mig 322).
Already implemented by the M1 fix (5 commits). Decision: locked.

## RE-VERIFY 2 outcome (deploy 1142f7f0) + new bugs
PASS: B scheduler · C yard · D integrations · E trace · F roles-enum · G PO-guard (6/7).
- **A Sites&Lines = FAIL (3rd layer)**: 42P10 fixed + create/persist OK, but `queryLinesForSite`
  returns [] under withOrgContext while `querySites` works. NOT a grant (app_user SELECT verified on
  production_lines/shift_patterns/locations/sites). Root-cause lane dispatched.
- **#6 L1 desktop WO consume silently fails** (`recordDesktopConsumption`) — core flow; root-cause lane dispatched.
- L2: #7 integrations "Przeglądaj katalog" dead click · #8 PO cancel has NO UI affordance (guard works) ·
  Reopen button still absent.
- L3: #9 /pl/production/work-orders/[id] leaks WO-state JSON (API route under locale UI seg) · appointment
  UTC offset (09:00→08:00) · LP warehouse shows "FG" (seed) · some English labels in /pl.
- NEW enum drift (Warehouse doc): `warehouse.receipt.correct` seeded (293/296) but absent from the enum.

## AUDIT core-flows (2026-06-24) → Track-2 queue
- ✅ **L1 DONE: shipment_seq + all public sequences granted to app_user (mig 326)** — SO→ship unblocked. RE-VERIFY: full SO→pick→pack→ship→POD chain.
- **L1/L2 INFRA: DB pool exhaustion** (EMAXCONNSESSION, Supavisor session mode, pool_size 15) — `withOrgContext` owner-register path 500s under load (`lib/auth/with-org-context.ts`). May be heavy-test-induced; confirm under normal load + check for a connection leak / pooler mode.
- **L2 No customer creation** (no createCustomer action/UI) → a clean system can't make an SO.
- **L2 Desktop PO "receive" = status-flip** (no GRN/LP/QA; real receiving is scanner-only) — planning/purchase-orders/[id].
- **L2 DRAFT WO dead-end**: production detail offers only "Start" which the SM rejects (needs RELEASED; Release is in planning) — `production/wos/_components/modals/gating.ts:28` render-then-reject.
- **L2 Void-output e-sign mislabel**: UI says "account password — not a PIN" but backend verifies PIN (`page.tsx:481/487` vs `corrections-actions.ts:821`) → can't sign. Fix to "PIN or password" (Close modal is the reference). QUICK.
- L3: scanner Putaway promotes QA-pending LP to available (`movement.ts:462`, gated downstream by v_inventory_available); catch-weight provenance dropped; completed_at/produced_quantity not stamped on Complete; create-SO item-picker behind overlay; /scanner/lp-info 404 /en back-link.
- HEALTHY end-to-end: scanner receive/putaway/move, GRN release+cancel, WO output/waste/complete/close+PIN-esign, SO create/confirm/allocate.
