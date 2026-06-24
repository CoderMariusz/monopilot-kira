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
