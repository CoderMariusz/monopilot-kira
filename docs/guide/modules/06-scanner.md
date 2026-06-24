# Scanner — handheld PWA: login / receive / putaway / move / pick / consume / output / reverse / QC / sync (module guide)

> Per-module deep guide. Every claim below is anchored to a real file under
> `apps/web/…` or `packages/…`; nothing is invented. The module number is
> **06** (`06-scanner-p1`, canonical event prefix `scanner.*.*`, per
> `.claude/skills/MON-project-overview/SKILL.md`); the file is named
> `06-scanner.md` because the desktop **Purchasing** surface already claimed
> `06-purchasing.md` — both descend from the same PRD-numbering era, and the
> scanner is the operator-facing half of that band.
>
> The Scanner is a **dark-mode, phone-sized PWA** that wraps a thin client
> (`apps/web/app/[locale]/(scanner)/**`) around a fleet of **stateless JSON route
> handlers** (`apps/web/app/api/scanner/**`, `…/api/production/scanner/**`,
> `…/api/warehouse/scanner/**`, `…/api/quality/scanner/**`). It does **not** own a
> business table of its own — it is a **write surface** over three canonical
> owners: it *receives/putaway/moves/picks* LPs (05-warehouse), *starts/consumes/
> outputs/wastes/reverses* against work orders (08-production owns `wo_outputs` /
> `wo_waste_log` / `wo_material_consumption` — the scanner **writes via the same
> SQL / the same service layer** the desktop uses), and *QC-inspects* LPs
> (09-quality). Its only first-class tables are `scanner_sessions` (PIN-bearer
> auth) and `scanner_audit_log` (every scan + idempotency key).
>
> Routes are written without the `[locale]` prefix. Last reviewed against the
> uncommitted working tree (W11 reverse-consume, scanner reverse-consume
> supervisor-PIN flag, labor clock-in/out, scanner QC inspect).

---

## a. Overview

The Scanner replaces a desktop mouse with a **PIN + a barcode**. An operator logs
in with **email + numeric PIN** (not a Supabase cookie session), picks a
**site / line / shift** context, and then drives the shop floor from a tile grid:
**Production** (work orders → consume / register output / waste / reverse), 
**Warehouse** (receive against a PO, putaway, move LP, pick to a WO, LP info),
and **Quality** (QC inspect an LP pass/fail/hold). Every mutating tap is a single
JSON POST carrying a client-generated **`clientOpId`** so a double-tap or a retry
is an idempotent no-op.

Authentication is deliberately **not** the app's Supabase/`withOrgContext` stack.
A scanner session is a **bearer token** minted by `POST /api/scanner/login` after
a PIN check, stored hashed in `scanner_sessions`, and re-verified on every request
by `requireScannerSession` (`lib/scanner/guard.ts`). The token is held in the
browser's `sessionStorage` and attached as `Authorization: Bearer …` by the
client's `scannerFetch` (`(scanner)/_components/scanner-session.tsx:116-142`); a
`401` clears it and bounces back to `/scanner/login`. Because a bearer session is
not a Supabase user session, the route handlers can't lean on request cookies for
`app.current_org_id()` — so the module ships its **own org-context seam**
(`lib/scanner/with-scanner-org.ts` + `lib/scanner/txn-org-context.ts`) that
registers the verified session's `org_id` into `app.active_org_contexts` *inside
the transaction* so RLS and org-guarded functions resolve.

Two security layers stack on every stock-mutating route: (1) a **valid bearer
session** (`requireScannerSession`), and (2) a **re-checked RBAC permission**
(`hasPermission(user, org, '…')`) mirroring the exact desktop gate — a stock
mutation must never be reachable by *any* valid session
(`consume/route.ts:90-97`). PIN-elevated paths (over-consume approval, reverse
supervisor) verify a *second* user's PIN (`verifyPin`) and *that* user's
permission.

The shared write logic is reused, not re-implemented: scanner **output** calls
`registerOutput` (`lib/production/output/register-output.ts`), **waste** calls
`recordWaste` (`lib/production/waste/record-waste.ts`), **start** calls `startWo`
(`lib/production/start-wo.ts`), **receive** calls `receiveScannerPoLine`
(`lib/warehouse/scanner/receive-po.ts`), **putaway/move/pick** call the
`lib/warehouse/scanner/movement.ts` helpers. **Consume** and **reverse-consume**
are the two paths the scanner re-implements inline (in their route files) so they
can add the handheld-only PIN approval branches — but mirror the desktop SQL.

---

## b. Function inventory

> Reads/writes name the Postgres tables touched. "Gate" is the auth checked
> server-side **inside** the route: every route requires a **scanner PIN session**
> (`requireScannerSession`); stock-mutating routes additionally **re-check an
> RBAC permission** with `hasPermission` (a miss returns a typed `forbidden`,
> never a 500). All qty maths are NUMERIC-exact (decimal strings straight to
> `NUMERIC`, never a JS float). Idempotency is a client-supplied `clientOpId`
> replayed against `scanner_audit_log(org_id, client_op_id)` under a
> `pg_advisory_xact_lock`.

### Session / auth — `apps/web/app/api/scanner/*` (`lib/scanner/{auth,session,guard,db}.ts`)

| Route (file) | What it does | Reads / writes | Gate | Notes |
|---|---|---|---|---|
| `POST /api/scanner/set-pin` (`set-pin/route.ts`) | First-time PIN enrolment. Verifies the user's **Supabase password** (`verifySupabaseLoginPassword`, a real GoTrue `grant_type=password` call) then `setPin` hashes the new 4–6-digit PIN. | reads `users`; writes `user_pins`, `scanner_audit_log` | none (password-gated) | `validPin` = `^\d{4,6}$`. |
| `POST /api/scanner/login` (`login/route.ts`) | Email + PIN → bearer session. `findUserByEmail` (active only) → `userHasPin` → `verifyPin` (lockout-aware: `locked` → 423) → `createScannerSession` (12-h TTL, token = double-UUID, **SHA-256-hashed** at rest). | reads `users`, `user_pins`; writes `scanner_sessions`, `scanner_audit_log` | PIN | Returns `{ token, user, expiresAt }`. |
| `POST /api/scanner/change-pin` (`change-pin/route.ts`) | Rotate PIN (verify current PIN, then `setPin`). | writes `user_pins`, `scanner_audit_log` | scanner session + current PIN | — |
| `GET /api/scanner/bootstrap` (`bootstrap/route.ts`) | Post-login context picker data: active **sites** + active **production lines** for the org. | reads `sites`, `production_lines` | scanner session | — |
| `POST /api/scanner/context` (`context/route.ts`) | Set the session's **site / line / shift** (partial update; each field only written if present). | writes `scanner_sessions` | scanner session | line scopes every WO/receive read downstream. |
| `POST /api/scanner/logout` (`logout/route.ts`) | End the session (`ended_at = now()`). | writes `scanner_sessions` | scanner session | `verifyScannerSession` then refuses an `ended_at`-stamped token. |
| `POST /api/scanner/lock-lp` (`lock-lp/route.ts`) | Acquire / release a soft LP edit-lock. Acquire steals a lock **held > 5 min** (audited `lp_stolen`); release only clears your own. | writes `license_plates` (`locked_by`/`locked_at`) | scanner session | 5-min stale-steal window (mig 191). |
| `POST /api/scanner/print-label` (`print-label/route.ts`) | Mint a GS1-LP label `print_jobs` row (`status='sent'`, `result_url` = data-URL) for a scanned LP. | reads `license_plates`, `items`; writes `print_jobs` | scanner session **+ ANY of** `settings.org.update` / `warehouse.grn.receive` / `warehouse.stock.move` / `production.output.write` | GS1 element-string is a **TODO** (`build.ts` not yet wired — `gtin_missing` flag). |
| `POST /api/scanner/audit` (`audit/route.ts`) | **Offline-replay sink** — bulk-insert ≤50 buffered `ScannerAuditEntry` rows; in-batch + cross-row dedupe on `client_op_id`. | writes `scanner_audit_log` | scanner session | The endpoint the IndexedDB sync queue would flush to — **no live client calls it yet** (see gaps). |

### Production — WO list/detail/reads — `…/api/production/scanner/wos/**`

| Route (file) | What it does | Reads | Gate |
|---|---|---|---|
| `GET /api/production/scanner/wos` (`wos/route.ts`) | Pickable WO list for the scanner: `RELEASED` **or** runtime `in_progress`/`paused`, line-scoped to the session's `line_id`, ordered by scheduled start. | `work_orders`, `wo_executions`, `items`, `production_lines` | scanner session |
| `GET …/wos/[id]` (`wos/[id]/route.ts`) | WO execute-hub bundle: header (status fold, produced base-kg + produced units from canonical `wo_outputs`), materials (`required/consumed/uom`), output rollups by type, and an **allergen-gate** flag (`allergen_profile_snapshot` non-empty). | `work_orders`, `wo_executions`, `items`, `production_lines`, `wo_outputs`, `wo_materials` | scanner session |
| `GET …/wos/[id]/lps?materialId=` (`wos/[id]/lps/route.ts`) | **FEFO** consumable-LP candidates for a material (`v_inventory_available`, `expiry asc nulls last`, ≤25). Resolves material `product_id`+`uom` first; runs inside `withTxnOrgContext` so `app.current_org_id()` resolves. | `wo_materials`, `v_inventory_available` | scanner session |
| `GET …/wos/[id]/consumptions` (`wos/[id]/consumptions/route.ts`) | Reversible **original** consumption rows for the reverse-consume picker: `qty_consumed>0`, `correction_of_id is null`, no existing counter-entry (≤50). Intentionally permission-free at the read tier — the destructive gate lives on the POST. | `wo_material_consumption`, `wo_materials`, `items`, `license_plates` | scanner session |
| `GET /api/production/scanner/waste-categories` (`waste-categories/route.ts`) | Active waste categories (`code`/`name`) for the waste dropdown. | `waste_categories` | scanner session |

### Production — WO execution writes — `…/api/production/scanner/wos/[id]/**`

| Route (file) | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `POST …/wos/[id]/start` (`start/route.ts`) | `RELEASED → in_progress` via the shared `startWo` service (BOM freeze + `wo_outputs` placeholders + allergen gate). Remaps `allergen_changeover_required` → canonical `changeover_signoff_required` (409 with `changeoverId`). Deterministic `transactionId` from `clientOpId`. | reads/writes the full `startWo` set (`wo_events`, `wo_executions`, `work_orders`, `wo_outputs`, `bom_snapshots`, …) | scanner session **+ `production.wo.start`** | desktop `cancelWo` |
| `POST …/wos/[id]/consume` (`consume/route.ts`) | **Handheld consume** — mirrors `recordDesktopConsumption` SQL. LP safety gate (`assertLpConsumableForProduction`: `lp_not_released` / `lp_expired` / **T-064** `quality_hold_active` → emits `production.consume.blocked`). **Two-tier over-consume gate**: warn band (`overconsume_warn_pct`) → proceed + warning; approve band (`overconsume_threshold_pct`) → **supervisor PIN** (`overconsume_approval_required` 409 if absent; the approver is a *different* in-org PIN-holder with `production.consumption.override_approve`). Bumps `wo_materials.consumed_qty`, decrements the LP (reserved-safe, → `consumed` at 0), records FEFO adherence, inserts the consumption ledger LAST, emits `warehouse.material.consumed`. Idempotent. | reads `tenant_variations`, `wo_materials`, `v_inventory_available`, `license_plates`; writes `wo_materials`, `license_plates`, `wo_material_consumption`, `scanner_audit_log`, `outbox_events` | scanner session **+ `production.consumption.write`** (+ approver `production.consumption.override_approve` over-limit) | `…/reverse-consume` |
| `POST …/wos/[id]/output` (`output/route.ts`) | Register a `primary`/`co_product`/`by_product` output via shared `registerOutput` (mints the output LP, genealogy-links to consumed LPs, holds-guard, catch-weight). Line-scopes the WO (`production_line_id = session.line_id`). On `QualityHoldError` emits `production.consume.blocked`. | reads `work_orders`; writes via `registerOutput` (`wo_outputs`, `license_plates`, `lp_genealogy`, `lp_state_history`, `outbox_events`) + `scanner_audit_log` | scanner session **+** (the `registerOutput` `holdsGuard` / state gates) | desktop `voidWoOutput` |
| `POST …/wos/[id]/waste` (`waste/route.ts`) | Log a categorized `wo_waste_log` row (qty **always kg**, `> 0`) via shared `recordWaste`. `shift_id` defaults to the session shift else `'scanner'`. | writes via `recordWaste` (`wo_waste_log`, `outbox_events`) + `scanner_audit_log` | scanner session | desktop `voidWasteEntry` |
| `POST …/wos/[id]/reverse-consume` (`reverse-consume/route.ts`) | **R3 handheld reverse** — see *§e* for the full auth model. Operator PIN + `production.consumption.correct` ALWAYS; supervisor email+PIN + `production.consumption.override_approve` **iff** org flag `scanner_reverse_require_supervisor_pin` ≠ `'false'`; closed WO needs `production.corrections.closed_wo`. Inserts a **negated storno** `wo_material_consumption` (`correction_of_id`), decrements `consumed_qty` (SQL-validated ≥0 → else `inconsistent_ledger`), restores the LP qty + QA-aware state (`consumed`→`available` only if still `qa released`, else `received`), writes LP history + audit `production.consumption.corrected`. Idempotent (replay + `23505` → `already_corrected`). | reads `tenant_variations`, `wo_material_consumption`, `license_plates`, `wo_materials`, `work_orders`, `wo_executions`; writes `wo_material_consumption`, `wo_materials`, `license_plates`, `lp_state_history`, `audit_events`, `scanner_audit_log` | scanner session **+ operator PIN + `production.consumption.correct`** (+ supervisor PIN + `production.consumption.override_approve` if flag on; + `production.corrections.closed_wo` if WO closed) | **is** the reverse of consume |
| `POST /api/scanner/labor` (`labor/route.ts`) | E4B clock-in / clock-out against a WO (auto-closes the prior open log on clock-in). `GET` returns current state. **No CFR e-sign**; identity = the PIN session. | writes `wo_labor_log` | scanner session | clock-out / clock-in |

### Warehouse — receive / putaway / move / pick / LP — `…/api/warehouse/scanner/**`

> These call into `lib/warehouse/scanner/{receive-po,movement}.ts` (documented in
> depth in *05-warehouse.md §b*). The scanner-specific facts are the **session
> operation strings** and the **RBAC re-check**: the three inventory-write routes
> (putaway / move / pick) all re-gate on the single **`warehouse.stock.move`**
> permission (`putaway/route.ts:27`, `move/route.ts:28`, `pick/route.ts:28`);
> receive gates on the session operation `scanner.receive_po` only.

| Route (file) | What it does | Gate |
|---|---|---|
| `GET …/scanner/pos` + `…/pos/[id]` | Open-PO list / detail for receiving. | scanner session (`scanner.receive_po.list` / `.detail`) |
| `POST …/scanner/receive-line` (`receive-line/route.ts` → `receiveScannerPoLine`) | The **one** receive txn (desktop + scanner share it): mints the GRN line + LP (`received`/`qa pending`), 110% over-receive cap, optional destination, opens a GRN-QC inspection when flagged. | scanner session (`scanner.receive_po`) — **not** an RBAC perm |
| `GET …/scanner/lp` + `…/scanner/location` | Scan an LP# / location code → detail for the LP-info & move/putaway destination. | scanner session (`warehouse.scanner.lp.lookup` / `.location.lookup`) |
| `GET …/scanner/putaway/suggest` | Ranked destination suggestions (same-product → empty → default). | scanner session (`warehouse.scanner.putaway.suggest`) |
| `POST …/scanner/putaway` (`moveScannerLp` putaway) | Relocate + **promote `received→available`** (FEFO-visible). | scanner session **+ `warehouse.stock.move`** |
| `POST …/scanner/move` (`moveScannerLp` transfer) | Pure location move (no promotion). | scanner session **+ `warehouse.stock.move`** |
| `POST …/scanner/pick` (`pickScannerLp`) | FEFO pick → WO staging (`move_type='issue'`, no qty deduction; QA-released only). | scanner session **+ `warehouse.stock.move`** |
| `GET …/scanner/pick/wos` + `…/pick/lps` | Pickable WOs + FEFO LP candidates for a material. | scanner session (`warehouse.scanner.pick.wos` / `.pick.lps`) |

### Quality — scanner QC inspect — `…/api/quality/scanner/inspect`

| Route (file) | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `POST /api/quality/scanner/inspect` (`inspect/route.ts`) | Record a fast-path LP QC decision: `pass`→`qa_status='released'`, `fail`→`'rejected'`, `hold`→`'on_hold'` **and** opens a real `quality_holds`/`quality_hold_items` row + emits `quality.hold.created`. Writes a `quality_inspections` row (`next_quality_inspection_number`, `signature_hash` **NULL by design**). Refuses terminal LPs (`consumed/merged/shipped/returned`). Idempotent. | reads `license_plates`; writes `quality_inspections`, `license_plates`, `quality_holds`, `quality_hold_items`, `outbox_events`, `scanner_audit_log` | scanner session **+ `quality.inspection.execute`** | desktop QA / hold flows |

**Routes inventoried: 27** — 8 session/auth, 5 production reads, 6 production
writes (incl. labor), 8 warehouse (cross-ref 05), 1 quality. The execution core
is **consume + reverse-consume** (inline, PIN-elevated) and the shared-service
writers **start / output / waste / receive / putaway / move / pick / inspect**.

> The QC `inspect` route deliberately records **without a CFR-21 e-signature** —
> unlike the desktop `submitInspectionDecision` — because "the user is already
> individually identified by the PIN-bound scanner session"
> (`inspect/route.ts:160-165`); the `decided_by` + the `scanner_audit_log` row
> give traceability and `signature_hash` is intentionally `NULL`.

---

## c. State machine

The scanner **owns no lifecycle of its own** — it drives the WO runtime machine
(08-production) and the LP machine (05-warehouse). What it *does* own is a
**session lifecycle** and a **per-mutation idempotency state machine**.

### Scanner session (`scanner_sessions`, `lib/scanner/session.ts`)

```
 set-pin (password) ─► (user enrolled, no session)
        │
   login (PIN)
        ▼
   active ──context(site/line/shift)──► active (scoped)
     │  ▲                                  │
     │  └────── every request: verifyScannerSession (last_seen_at = now)
     │                                     │
   logout / 12-h TTL expiry                │
        ▼                                  ▼
   ended (ended_at set) ◄──── expired (expires_at < now)
```

| State | Set by | Notes |
|---|---|---|
| enrolled (no session) | `setPin` (Supabase-password-gated) | A PIN exists in `user_pins`; no bearer yet. |
| `active` | `createScannerSession` | 12-h TTL; token SHA-256-hashed at rest; bearer in `sessionStorage`. |
| `active (scoped)` | `POST /context` | `site_id`/`line_id`/`shift` set — the line scopes WO/receive reads. |
| `ended` | `POST /logout` | `ended_at` stamped; `verifyScannerSession` then rejects. |
| `expired` | TTL | `expires_at < now()` → `invalid_session` (401) → client clears + redirects. |

`verifyScannerSession` is a single `UPDATE … set last_seen_at=now() where
session_token_hash=$1 and expires_at>now() and ended_at is null returning *`
(`session.ts:103-119`) — verification and touch in one statement; a failed
verify still audits via `findScannerSessionForAudit` (`guard.ts:42-46`).

### Per-mutation idempotency (every stock-mutating POST)

```
client: clientOpId = crypto.randomUUID()  (held until success; reused on retry)
        ▼
begin ─► registerTxnOrgContext ─► pg_advisory_xact_lock($org:scanner:clientOpId)
        ▼
   replay? (scanner_audit_log where client_op_id = clientOpId)
     ├─ yes ─► commit + return stored 'ok' payload (replay:true)
     └─ no  ─► run mutation ─► write scanner_audit_log(result_code='ok', client_op_id, ext)
                              ─► commit (ext mirrors the success response for replay fidelity)
```

The **advisory xact-lock + the `(org_id, client_op_id)` unique row** make a
double-tap, a network retry, or a back-button resubmit a no-op that **replays the
original response** rather than mutating twice (`consume/route.ts:105-140`,
`reverse-consume/route.ts:500-516`). On reverse-consume a `23505` unique-violation
race even re-reads the replay *after* rollback (`readReplayAfterRollback`) so a
lost race still returns the winner's payload.

### The org-context seam (why scanner SQL isn't just `withOrgContext`)

`app.current_org_id()` (mig 002) does **not** read a GUC — it joins
`app.active_org_contexts` (keyed on backend PID + the **current txid**) to
`app.session_org_contexts`. A bearer session has no Supabase cookie to seed that,
so the scanner registers it explicitly:
- **`withScannerOrg(session, fn)`** (`with-scanner-org.ts`) — the app-role/RLS
  equivalent of `withOrgContext`, binding the verified session's `org_id`; used by
  the shared-service writers (output/waste/start/labor/receive/inspect).
- **`registerTxnOrgContext` / `withTxnOrgContext`** (`txn-org-context.ts`) — called
  immediately after `begin` so autocommit SELECTs filtering on
  `app.current_org_id()` (FEFO list, waste categories, consumptions list) actually
  resolve the org *inside the transaction*. Cleanup after commit; the mig-031
  janitor reaps leaks.

<!-- screenshot: scanner login (email + PIN keypad) -->
<!-- screenshot: scanner home (Production / Warehouse / Quality tile grid) -->
<!-- screenshot: scanner WO execute hub (Consume / Output / Waste tiles + materials list) -->

---

## d. User how-tos

> Tiles and labels are the scanner PWA i18n bundles
> (`(scanner)/_components/scanner-*labels`); the home tile grid is
> `home-screen.tsx:31-56`. Tiles whose screens aren't built are rendered
> **disabled** with `title="Coming soon"` (`home-screen.tsx:118-120`).

### (i) Enrol a PIN + log in

1. From a device, open `/scanner/login`. First time only: **Set PIN** →
   `POST /api/scanner/set-pin` with your **account email + Supabase password** + a
   new **4–6-digit PIN**.
2. Log in with **email + PIN** → `POST /api/scanner/login`. After 5 wrong PINs the
   account locks (423 `pin_locked`).
3. You land on **Pick site / line / shift** (`/scanner/login/site`,
   `GET /bootstrap` → `POST /context`). The **line** you pick scopes the WO and
   receive lists you'll see.

### (ii) Receive goods against a PO

Home → **Warehouse → Receive (PO)** → open-PO list → a line → enter Batch /
Best-before / optional destination / Qty → **Receive**
(`POST …/warehouse/scanner/receive-line`). You get the new **LP number**; the LP
is born `received`/`qa pending`; a **QC-hold** banner shows if Require-GRN-QC is
on. (Over 110% of ordered → `over_receive_cap`.) Full flow: *05-warehouse.md §d(i)*.

### (iii) Putaway / Move / Pick

- **Putaway:** Home → **Putaway** → scan LP → accept a suggested location → confirm
  (`POST …/scanner/putaway`). A still-`received` LP is **promoted to `available`**.
- **Move LP:** Home → **Move LP** → scan LP → scan destination → confirm
  (`POST …/scanner/move`). Pure relocation.
- **Pick:** Home → **Pick** → choose a WO + material → scan the FEFO-suggested LP +
  a staging location → **Pick** (`POST …/scanner/pick`). QA-released stock only; no
  qty deduction (consume happens later). All three need `warehouse.stock.move`.

### (iv) Start + consume + output + waste a WO

1. Home → **Work orders** → open a WO → **Start** (`POST …/wos/[id]/start`,
   needs `production.wo.start`). Blocked starts surface `changeover_signoff_required`
   with the `changeoverId` to clear on desktop first.
2. **Consume:** **Consume** tile → scan the LP, enter qty → **Receive**
   (`POST …/wos/[id]/consume`). A **warn-tier** over-consume returns success with an
   amber warning; above the **approve tier** the screen reveals a **supervisor email
   + PIN** prompt (a different in-org user with `production.consumption.override_approve`).
   Quality holds / non-released / expired LPs are refused.
3. **Register output:** **Output** tile → pick type (primary/co/by) + qty
   (units + `each|box`, or `actualWeightKg`, or `qtyKg`) → submit
   (`POST …/wos/[id]/output`). Mints the output LP on QA hold, genealogy-linked.
4. **Waste:** **Waste** tile → pick a category + qty (**always kg**) → submit
   (`POST …/wos/[id]/waste`).

### (v) Reverse a wrong consumption (handheld R3)

1. WO → **Reverse consumption** → pick a reversible row
   (`GET …/wos/[id]/consumptions`).
2. Enter a **reason code** + note + your **operator PIN** → submit
   (`POST …/wos/[id]/reverse-consume`).
3. If the org requires it, the server replies `invalid_supervisor` and the screen
   **reveals a supervisor email + PIN section reactively**
   (`reverse-consume-screen.tsx:15-16, 227`) — re-submit with the supervisor
   credentials. On a **closed** WO you additionally need `production.corrections.closed_wo`.
4. On success the original is struck-through, `consumed_qty` is decremented, and the
   LP qty/state is restored (re-pickable only if still QA-released).

### (vi) QC-inspect an LP

Home → **Quality → QC inspect** → scan LP → **Pass / Fail / Hold** + note → submit
(`POST /api/quality/scanner/inspect`, needs `quality.inspection.execute`). Pass
releases the LP for FEFO; Fail rejects; Hold opens a real quality hold. No e-sign —
the PIN session is the identity.

### (vii) Clock labor + print a label

- **Labor:** the WO execute hub shows **Clock in / Clock out**
  (`POST /api/scanner/labor`), auto-closing any prior open log on clock-in.
- **Print label:** scan an LP → **Print** (`POST /api/scanner/print-label`) mints a
  `print_jobs` row; needs any of `settings.org.update` / `warehouse.grn.receive` /
  `warehouse.stock.move` / `production.output.write`.

---

## e. The reverse-consume auth model (precise)

`POST …/wos/[id]/reverse-consume` (`reverse-consume/route.ts`) is the most
auth-dense route in the module. The decision order (every failure rolls back and
audits):

1. **Idempotency first** — replay check (twice: before + after the advisory lock);
   a `23505` race re-reads the winner's payload (`already_corrected`).
2. **Operator PIN — ALWAYS.** `verifyPin(session.user_id, operatorPin)` →
   `locked` = 423, wrong = **commit** (preserve the lockout counter) + 401
   `invalid_pin` (`route.ts:518-528`).
3. **Operator permission — ALWAYS.** `hasPermission(operator,
   'production.consumption.correct')` → else 403 `forbidden` (`route.ts:530-534`).
   This is the unconditional gate: *every* scanner reversal needs the operator to
   hold `production.consumption.correct`.
4. **Supervisor tier — feature-flagged.** `supervisorPinRequired(ctx)` reads
   `tenant_variations.feature_flags->>'scanner_reverse_require_supervisor_pin'`;
   **absent or any value other than `'false'` = required (default ON)**
   (`route.ts:226-234`). When required:
   - a **supervisor email + PIN** is mandatory (`invalid_supervisor` 401 if absent);
   - the supervisor must be a **different** in-org user (`route.ts:549`);
   - the supervisor's PIN is verified (`pin_locked` 423 / `invalid_pin` 401);
   - the supervisor must hold **`production.consumption.override_approve`**
     (`supervisor_forbidden` 403) (`route.ts:572-577`).
   When OFF (`'false'`), it's **operator-PIN-only** — but the operator *still* needs
   `production.consumption.correct`.
5. **Closed-WO escalation.** If the WO is `closed`, the operator additionally needs
   **`production.corrections.closed_wo`** (`closed_wo_correction_forbidden` 403,
   `route.ts:594-598`).
6. **Reversibility guards.** Original must exist + be uncorrected
   (`already_corrected` 409); the LP must be `consumed|available|received`
   (`lp_not_restorable` 409); the `wo_materials` decrement must stay ≥0
   (`inconsistent_ledger` 409) — all validated **before** any write.

The org flag is administered at **Settings → Sign-off & PINs → scanner-auth**
(`settings/scanner-auth/_actions/scanner-auth-actions.ts`): `getScannerAuthPolicy`
reads it (fail-closed behind `org.access.admin`), `setScannerReverseAuthPolicy`
upserts it into `tenant_variations.feature_flags` as text `'true'`/`'false'` behind
`settings.flags.edit` + an audit row. The scanner UI does **not** pre-fetch the
flag — it discovers it reactively from the server's `invalid_supervisor` reply
(`reverse-consume-screen.tsx:227`), so the server flag is the single source of truth.

---

## f. RBAC & permissions

> The scanner stacks **two** auth tiers: a **bearer session** (PIN-derived,
> non-Supabase) and a **re-checked RBAC string** on stock mutations. The session
> alone is never enough to mutate stock.

**RBAC permission strings the scanner checks** (all present in
`packages/rbac/src/permissions.enum.ts`):

| Permission | Checked by | Tier |
|---|---|---|
| `production.wo.start` | scanner `start` | operator |
| `production.consumption.write` | scanner `consume` | operator |
| `production.consumption.override_approve` | over-consume approver + reverse supervisor | second user (PIN) |
| `production.consumption.correct` | scanner `reverse-consume` | operator (ALWAYS) |
| `production.corrections.closed_wo` | reverse on a closed WO | operator (escalation) |
| `quality.inspection.execute` | scanner `inspect` | operator |
| `warehouse.stock.move` | putaway / move / pick | operator |
| `settings.org.update` / `warehouse.grn.receive` / `warehouse.stock.move` / `production.output.write` (ANY) | `print-label` | operator |

**Session-level operation strings** (NOT RBAC enum members; they label
`scanner_audit_log.operation` and gate the read routes by *session validity
only*): `scanner.receive_po(.list/.detail)`, `warehouse.scanner.lp.lookup`,
`warehouse.scanner.location.lookup`, `warehouse.scanner.putaway(.suggest)`,
`warehouse.scanner.move`, `warehouse.scanner.pick(.wos/.lps)`,
`production.scanner.wos.{list,detail,lps,consumptions,consume,output,waste,
start,reverse_consume}`, `quality.scanner.inspect`, `scanner.{login,logout,
context,bootstrap,change_pin,set_pin,lock_lp,print_label,audit,labor}`. These are
free strings, not enum-locked — granting "use the scanner" is implicit in holding
a valid session.

**Identity & PIN primitives** (`packages/auth/src/verify-pin.ts`, re-exported by
`lib/scanner/auth.ts`): `setPin` (hash + enrol), `verifyPin` (lockout-aware:
returns `true` / `false` / `'locked'`), `userHasPin`. `verifySupabaseLoginPassword`
hits real GoTrue (`grant_type=password`) — used only for PIN enrolment.

---

## g. Data sources (Supabase tables)

Scanner-owned (first-class):

- `scanner_sessions` — bearer sessions (`session_token_hash` SHA-256, `org_id`,
  `user_id`, `site_id`/`line_id`/`shift`, `mode`, `expires_at` 12-h, `ended_at`,
  `last_seen_at`).
- `scanner_audit_log` — every scan + result code + **idempotency key**
  `(org_id, client_op_id)`; the `ext` jsonb on a success row mirrors the response
  for replay fidelity.
- `user_pins` — hashed PINs (`setPin`/`verifyPin`; lockout state).

Production (08-production owns; scanner **writes via** the same tables/services):

- `work_orders`, `wo_executions`, `wo_events`, `bom_snapshots` — WO lifecycle (start).
- `wo_materials` — `consumed_qty` (consume bumps, reverse decrements).
- `wo_material_consumption` — consumption ledger (UNIQUE `transaction_id`;
  reverse posts a negated `correction_of_id` storno).
- `wo_outputs` — **canonical (08-production)** output table (scanner mints via
  `registerOutput`).
- `wo_waste_log` — **canonical (08-production)** waste (kg).
- `wo_labor_log` — E4B clock-in/out.

Warehouse / inventory (05-warehouse owns):

- `license_plates` — consume decrements, putaway promotes, pick relocates, QC flips
  `qa_status`, reverse restores; `locked_by`/`locked_at` soft-lock (5-min steal).
- `v_inventory_available` — FEFO consumable/pickable view (`available` + `released`
  minus reserved, `expiry asc nulls last`).
- `lp_state_history`, `lp_genealogy` — LP transition ledger + parent/child edges.
- `grns`, `grn_items` — receive (shared txn; *05/06-purchasing*).
- `stock_moves`, `locations`, `warehouses` — putaway/move/pick + destination resolve.
- `print_jobs` — scanner label prints.

Quality (09-quality owns):

- `quality_inspections` — scanner QC decision (`signature_hash` NULL by design).
- `quality_holds`, `quality_hold_items` — opened on a QC `hold` decision.

Config / reference / governance:

- `tenant_variations.feature_flags` — `scanner_reverse_require_supervisor_pin`
  (reverse supervisor tier), `overconsume_threshold_pct` / `overconsume_warn_pct`
  (over-consume tiers), `require_grn_qc_inspection` (receive QC).
- `sites`, `production_lines`, `items`, `waste_categories` — context + dropdowns.
- `users`, `user_roles`, `roles`, `role_permissions` — RBAC re-check + approver lookup.
- `audit_events` — `production.consumption.corrected` (reverse).
- `outbox_events` — `warehouse.material.consumed` (consume), `quality.hold.created`
  (QC hold), `production.consume.blocked` (T-064 hold), + the events the shared
  services emit (`production.output.recorded`, `production.waste.recorded`, …).
- `app.session_org_contexts` / `app.active_org_contexts` — the scanner org-context
  seam (mig 002/031).

---

## h. Known gaps / TODO

Grounded in the code that was read — no guesses:

1. **The offline sync queue is built but UNWIRED.** `packages/sync-queue`
   (IndexedDB `enqueue`/`listPending`/`flusher` + UUID-v7 `generateTransactionId`,
   T-043/T-044) and the bulk-replay sink `POST /api/scanner/audit` both exist, but
   **no file under `apps/web` imports `sync-queue`** and **no client calls
   `/api/scanner/audit`**. The live `scannerFetch` is a plain online `fetch` over
   `sessionStorage` (`scanner-session.tsx:116-142`); a lost connection just fails
   the tap. Per-mutation idempotency (`clientOpId` + `scanner_audit_log`) is wired,
   so the offline buffer *can* be layered on safely — it just isn't yet. The PWA
   is "phone-shaped + online-aware" (a `navigator.onLine` dot in
   `scanner-frame.tsx:79-120`), not offline-capable.

2. **Several home tiles are "Coming soon."** `home-screen.tsx:31-56` wires
   live tiles to `scanner/wos`, `scanner/pick`, `scanner/receive-po`,
   `scanner/putaway`, `scanner/move`, `scanner/qa`, `scanner/lp`; any tile with
   `to: null` renders **disabled** (none are null in the current grid, but the
   mechanism is explicit and the `consume`/`output` tiles both route to
   `scanner/wos`, not a dedicated entry — you reach consume/output from inside a WO).

3. **No service worker / installable PWA manifest was found** in the scanner route
   group — the "PWA" is a dark, phone-framed SPA, not a registered
   serwist/`sw.js` app (recurring live-bug class #7 in `MON-project-overview`).
   Combined with gap 1, "works offline / installs to home screen" is aspirational.

4. **Warehouse putaway/move/pick share one RBAC string.** All three re-gate on
   `warehouse.stock.move` (`putaway`/`move`/`pick` routes) — you cannot grant pick
   without granting free-form moves; there is no `warehouse.lp.pick` /
   `warehouse.putaway` (same gap noted in *05-warehouse.md §f.3*).

5. **The scanner QC inspect path has no e-signature** by deliberate decision
   (`inspect/route.ts:160-165`) — the desktop inspection collects a CFR-21
   `signEvent`, the scanner relies on the PIN session + audit row. Flagged so a
   reader doesn't mistake the absent `signature_hash` for a bug.

6. **`scanner.receive_po` is a session string, not an RBAC perm.** Receiving on the
   scanner is gated by **session validity only** (`receive-line/route.ts:28`), unlike
   the desktop GRN write which is also `warehouse.grn.receive`-aware — any valid
   scanner session can receive. (Putaway/move/pick *do* re-check `warehouse.stock.move`;
   receive does not.)

7. **GS1 label element-string is a TODO.** `print-label/route.ts:106-107` ships a
   JSON payload with `gtin_missing` flagging when `buildGs1Element` /
   `packages/gs1/src/build.ts` isn't wired — the printed "label" is a data-URL JSON
   blob, not a real GS1-128 element string.

8. **`apps/worker` now exists but the outbox consumer still doesn't run end-to-end.**
   The memory note "`apps/worker` does NOT exist" is **stale** (the package is
   present: `apps/worker/src/{index,registry}.ts`), but per `MON-project-overview`
   the live dispatcher for `warehouse.material.consumed` / `quality.hold.created` /
   `production.*` is still a seam — scanner events persist to `outbox_events` and
   wait there.

No raw `// TODO` markers were found in the scanner lib/routes beyond the GS1 note
(gap 7); the gaps list is otherwise derived from capability limits (offline,
PWA-install, label encoding) and the session-vs-RBAC gating drift observed in the
code.
