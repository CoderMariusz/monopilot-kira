<result>All the evidence is collected. Here is the full build manifest.

---

## Scanner Module — Reality Audit and Build Manifest

### 1. Existing Scaffold

**Route group and shell (STUB — chrome only, no screens):**

- Route group: `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(scanner)/` containing only two files.
- Layout: `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(scanner)/layout.tsx` (lines 1-12). Wraps children in `ScannerFrame`. Intentionally isolated from the AppShell route group per comment `T-134`.
- Dev harness only: `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(scanner)/dev/scanner/page.tsx` (lines 1-45). Static placeholder with a dummy blue button and dashed rectangle. No real content, no navigation, no session state.
- `ScannerFrame`: `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/components/shell/scanner-frame.tsx` (lines 1-105). Fully implemented device chrome: 390x844 notch + status bar + scrollable content slot + bottom-actions slot. Accepts optional `statusBar` and `bottomActions` slot props. Has `data-testid="scanner-frame"`. This component is real and complete.
- CSS tokens: the frame uses CSS variables `--shell-scanner-w` and `--shell-scanner-h` set via Tailwind class `w-scanner h-scanner` — no inline pixel dimensions.
- Shell test: `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/components/shell/__tests__/scanner-frame.test.tsx` exists.

**Settings devices pairing (IMPLEMENTED):**

- Migration 238 (`/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/238-settings-scanner-devices.sql`, lines 1-94) creates `public.scanner_devices` and `public.scanner_device_defaults`, both with `org_id` (not `tenant_id`), RLS via `app.current_org_id()`, full CRUD policies. Note: this migration has a filename collision — there are two files named `238-*.sql` (`238-settings-scanner-devices.sql` and `238-npd-core-extra-fields.sql`), which is a deployment hazard.
- `pairDevice` server action: `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(admin)/settings/devices/_actions/devices.ts` (lines 186-226). Writes to `public.scanner_devices` with `INSERT ... RETURNING`. Also exposes `updateDeviceDefaults` (upsert to `scanner_device_defaults`) and `readDevicesSettingsData`.
- No Drizzle schema wrapper for `scanner_devices` or `scanner_device_defaults` — the action queries raw SQL.

**No scanner-specific routes beyond `/scanner/dev/scanner`** — zero screens for Login/PIN/Site/Home/Consume/Output/Receive/Move/Putaway/Pick/Pack/Transfer.

---

### 2. Prototype Inventory (all files under `/Users/mariuszkrawczyk/Projects/monopilot-kira/prototypes/scanner/`)

| File | Lines | Screens exported | Key data/actions needed |
|---|---|---|---|
| `shell.jsx` | 203 | `ScannerFrame`, `Topbar`, `Content`, `BottomActions`, `ScanInputArea`, `Banner`, `MiniGrid`, `StepsBar`, `Toast` | No data; pure UI primitives |
| `data.jsx` | 213 | Data constants only (`SCN_USER`, `SCN_WOS`, `SCN_BOM`, `SCN_LPS`, `SCN_POS`, `SCN_TOS`, etc.) | All currently mocked |
| `app.jsx` | 183 | `ScannerApp` (state-based router) | Routes: login, login_pin, pin_setup, pin_change, site_select, home, settings, wos, wo_detail, wo_execute, consume_scan, output, coproduct, waste, pick, receive_po, receive_to, putaway, move, split, qa, inquiry |
| `login.jsx` | 426 | `LoginScreen` (SCN-010), `PinScreen` (SCN-011), `SiteSelectScreen` (SCN-012), `PinSetupScreen` (SCN-011b), `PinChangeScreen` (SCN-011c) | Needs: `user_pins` (exists, mig 019) + `verifyPin` (exists, `packages/auth/src/verify-pin.ts`) + `scanner_sessions` (MISSING) + `scanner_audit_log` (MISSING) + sites/lines from `public.sites` + `public.production_lines` (mig 042 + 215) |
| `home.jsx` | 144 | `HomeScreen`, `SettingsScreen` | Session context (site/line/shift) from `scanner_sessions` (MISSING) |
| `flow-consume.jsx` | 445 | `WoListScreen`, `WoDetailScreen`, `WoExecuteScreen`, `ConsumeScanScreen`, `ConsumeDoneScreen` | Needs: `work_orders` (mig 176), `wo_material_consumption` (mig 181), `license_plates` (mig 191), `v_inventory_available` (mig 191). No `/api/scanner/consume` route exists — only desktop `/production/work-orders/[id]/outputs/route.ts` and `/waste/route.ts` |
| `flow-register.jsx` | 315 | `OutputScreen`, `OutputDoneScreen`, `CoproductScreen`, `CoproductDoneScreen`, `WasteScreen`, `WasteDoneScreen` | Reuses `wo_outputs` (mig 181) — desktop `POST .../outputs/route.ts` exists but is scoped to the production desktop module, not the scanner auth path |
| `flow-receive.jsx` | 431 | `PoListScreen`, `PoLinesScreen`, `PoItemScreen`, `PoDoneScreen`, `ToListScreen`, `ToScanScreen`, `ToDoneScreen` | Needs: `purchase_orders` + `purchase_order_lines` (mig 262, NOW LANDED), `transfer_orders` + `transfer_order_lines` (mig 263, NOW LANDED), `grn_items` (mig 193), `license_plates` (mig 191). Zero scanner API routes for receive PO/TO exist. |
| `flow-putaway.jsx` | 180 | `PutawayScanScreen`, `PutawaySuggestScreen`, `PutawayDoneScreen` | Needs: `license_plates` (mig 191), `locations` (mig 042), `stock_moves` (mig 193), FEFO suggestion service (none exists). Zero scanner API routes. |
| `flow-pick.jsx` | 280 | `PickWoListScreen`, `PickListScreen`, `PickScanScreen`, `PickDoneScreen` | Needs: `work_orders` (mig 176), `pick_lists` + `pick_list_lines` (mig 211), `license_plates` (mig 191). Zero scanner pick API routes. |
| `flow-other.jsx` | 503 | `MoveScreen`, `MoveDoneScreen`, `SplitScanScreen`, `SplitQtyScreen`, `SplitDoneScreen`, `QaListScreen`, `QaInspectScreen`, `QaFailReasonScreen`, `QaDoneScreen`, `InquiryScreen` + `acquireLpLock` mock | Move/Split need LP lock lease (FR-SC-BE-030/031) — no `lock-lp` API. QA needs `quality_holds` + `ncr_reports` (mig 197). |
| `modals.jsx` | 496 | `ReasonPickerSheet`, `FefoDeviationSheet`, `BestBeforeSheet`, `PartialConsumeSheet`, `PrinterPickerSheet`, `LanguageSheet`, `LogoutSheet`, `ScanErrorSheet`, `QtyKeypadSheet`, `BlockFullscreen`, `LpLockedSheet` | No data dependencies; pure UI |

Total prototype JSX: 3,819 lines across 12 files.

**Identical copies exist at** `/Users/mariuszkrawczyk/Projects/monopilot-kira/prototypes/design/Monopilot Design System/scanner/` — same files, same line counts. The canonical anchor path to use in task parity evidence is `prototypes/scanner/&lt;file&gt;.jsx`.

---

### 3. Data Dependencies Per Flow

#### Auth / Session

| Item | Status | Evidence |
|---|---|---|
| `user_pins` table | EXISTS | Mig 019 `/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/019-pins.sql` |
| `verifyPin` / `setPin` library | EXISTS | `/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/auth/src/verify-pin.ts` |
| `setPin` wired to any scanner route | MISSING | No scanner action or route calls `setPin` — enrollment gap confirmed |
| `scanner_sessions` table | MISSING | Zero migrations matching this name |
| `scanner_audit_log` table | MISSING | Zero migrations matching this name |
| Scanner JWT / token issuance (`POST /api/scanner/login`) | MISSING | No such route exists anywhere in `apps/web/app` |
| `POST /api/scanner/context` (set site/line/shift) | MISSING | No such route |
| `POST /api/scanner/audit` (bulk audit log) | MISSING | No such route |

The PRD (line 1068) describes a `POST /api/scanner/login` that creates a `scanner_sessions` row and issues a JWT/cookie. Standard Supabase session auth cannot satisfy the PIN-then-site-select flow or the kiosk/personal device mode — scanner needs its own session model. Both `scanner_sessions` and `scanner_audit_log` are required new tables.

#### Consume to WO

| Item | Status | Evidence |
|---|---|---|
| `work_orders` | EXISTS | Mig 176 |
| `wo_material_consumption` | EXISTS | Mig 181 `/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/181-production-wo-outputs-consumption.sql` line 146 |
| `license_plates` + FEFO view | EXISTS | Mig 191 |
| LP lock field (`locked_by`, `locked_at`) | EXISTS | Mig 191 line 77-78 |
| `POST /api/scanner/consume` (scanner-specific) | MISSING | The desktop `outputs/route.ts` writes `wo_outputs` not `wo_material_consumption`; no consume route exists |
| `POST /api/scanner/lock-lp` | MISSING | No route |

#### Output Registration

| Item | Status | Evidence |
|---|---|---|
| `wo_outputs` | EXISTS | Mig 181 |
| `register-output.ts` service | EXISTS | `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts` |
| `POST .../outputs/route.ts` | EXISTS (desktop) | Under production work-orders — uses Supabase session auth, not scanner auth |
| Scanner-scoped output endpoint | MISSING | The desktop route is reusable in principle but is guarded by `withOrgContext` standard session, not scanner JWT |

#### Receive PO

| Item | Status | Evidence |
|---|---|---|
| `purchase_orders` + `purchase_order_lines` | EXISTS (just landed) | Mig 262 `/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/262-planning-purchase-orders.sql` |
| `grns` + `grn_items` | EXISTS | Mig 193 |
| `license_plates` | EXISTS | Mig 191 |
| `POST /api/warehouse/scanner/receive-po-line` | MISSING | No route |
| `lp_genealogy` table | MISSING | Confirmed zero matches across all migration files |

The PRD (line 73) cites `lp_genealogy` as the real-time traceability write target for every scan. This table does not exist. `lp_state_history` (mig 193) captures LP state transitions but is not a genealogy graph. This is a named gap: scanner receive creates new LPs and the lineage chain (parent_lp_id on `license_plates`) is a soft field, but there is no dedicated genealogy table or service.

#### Move LP / Putaway

| Item | Status | Evidence |
|---|---|---|
| `locations` table | EXISTS | Mig 042 (code/path/parent_id model, no ltree) |
| `stock_moves` table | EXISTS | Mig 193 |
| LP lock fields | EXISTS | Mig 191 |
| FEFO putaway suggestion service | MISSING | No server-side code |
| `POST /api/warehouse/scanner/move-lp` | MISSING | |
| `POST /api/warehouse/scanner/putaway` | MISSING | |

#### Pick for WO

| Item | Status | Evidence |
|---|---|---|
| `pick_lists` + `pick_list_lines` | EXISTS | Mig 211 `/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/211-shipping-schema-foundation.sql` lines 353-421 |
| `POST /api/warehouse/scanner/pick-confirm` | MISSING | |

#### Receive TO / Transfer

| Item | Status | Evidence |
|---|---|---|
| `transfer_orders` + `transfer_order_lines` | EXISTS (just landed) | Mig 263 `/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/263-planning-transfer-orders.sql` |
| `inter_site_transfer_orders` | EXISTS | Mig 215 |
| `POST /api/warehouse/scanner/receive-to-line` | MISSING | |

---

### 4. Task File Status

The manifest at `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks/06-scanner-p1/manifest.json` lists 51 tasks (T-001 through T-051). The tasks directory at `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks/06-scanner-p1/tasks/` is **empty** — zero task JSON files exist. All 51 tasks are PHANTOM (referenced by manifest, no file on disk).

---

### 5. Summary Table

| Area | Verdict | Evidence Path | Gap / Note |
|---|---|---|---|
| `(scanner)` route group layout | STUB | `.../app/[locale]/(scanner)/layout.tsx:1-12` | Chrome only; no actual screen routes |
| Dev harness `/scanner/dev` | STUB | `.../app/[locale]/(scanner)/dev/scanner/page.tsx:1-45` | Static placeholder, no real content |
| `ScannerFrame` component | IMPLEMENTED | `.../components/shell/scanner-frame.tsx:1-105` | Real; has test |
| `scanner_devices` + `scanner_device_defaults` tables | IMPLEMENTED | `migrations/238-settings-scanner-devices.sql:1-94` | Filename collision with 238-npd-core-extra-fields.sql |
| `pairDevice` / `updateDeviceDefaults` actions | IMPLEMENTED | `settings/devices/_actions/devices.ts:186-265` | Writes `scanner_devices`; no Drizzle schema |
| Login / PIN screens | MISSING | Prototype: `prototypes/scanner/login.jsx:1-426` | No Next.js route; no `/api/scanner/login` |
| `scanner_sessions` table | MISSING | Referenced in PRD line 1068, 411 | Required for PIN-per-shift auth model |
| `scanner_audit_log` table | MISSING | Referenced in PRD lines 86-90, 1120 | Required for compliance (30-day retention) |
| `setPin` enrollment wiring | MISSING | `packages/auth/src/verify-pin.ts` exists | `setPin` exists but no scanner route calls it |
| Home / launcher screen | MISSING | Prototype: `prototypes/scanner/home.jsx:1-144` | No Next.js route |
| Site/line/shift context API | MISSING | PRD line 572 | No `POST /api/scanner/context` |
| Consume-to-WO flow | MISSING | Prototype: `prototypes/scanner/flow-consume.jsx:1-445` | `wo_material_consumption` exists (mig 181); no scanner API route |
| Output registration flow | MISSING | Prototype: `prototypes/scanner/flow-register.jsx:1-315` | Desktop `outputs/route.ts` exists but is session-scoped, not scanner-scoped |
| LP lock API (`lock-lp`) | MISSING | `flow-other.jsx:16-24` references `acquireLpLock` (mocked) | `locked_by`/`locked_at` columns exist on `license_plates` (mig 191 lines 77-78) |
| Receive PO flow | MISSING | Prototype: `prototypes/scanner/flow-receive.jsx:1-238` | `purchase_orders` table EXISTS (mig 262); no API route |
| Receive TO flow | MISSING | Prototype: `prototypes/scanner/flow-receive.jsx:271-432` | `transfer_orders` table EXISTS (mig 263); no API route |
| `lp_genealogy` table | MISSING | PRD line 73 | Does not exist anywhere; `lp_state_history` (mig 193) is not a substitute |
| Move LP flow | MISSING | Prototype: `prototypes/scanner/flow-other.jsx:9-143` | Tables exist; no API |
| Putaway flow | MISSING | Prototype: `prototypes/scanner/flow-putaway.jsx:1-180` | Tables exist; no FEFO suggestion service |
| Pick for WO flow | MISSING | Prototype: `prototypes/scanner/flow-pick.jsx:1-280` | `pick_lists` EXISTS (mig 211); no API |
| QA Inspection flow | MISSING | Prototype: `prototypes/scanner/flow-other.jsx:283-445` | `quality_holds`/`ncr_reports` exist (mig 197); no scanner route |
| Split LP flow | MISSING | Prototype: `prototypes/scanner/flow-other.jsx:148-280` | Tables exist; no API |
| Scanner modals | MISSING | Prototype: `prototypes/scanner/modals.jsx:1-496` | Pure UI, not ported |
| 06-scanner-p1 task files (T-001..T-051) | PHANTOM | `_meta/atomic-tasks/06-scanner-p1/tasks/` (empty dir) | Manifest lists 51 tasks; zero JSON files on disk |

---

### 6. Build Manifest — 4 Disjoint Lanes

#### Lane A — Backend Prerequisites (new migrations + API gateway)

Classification: MUST

New tables required (next sequential migrations after 263):
- `scanner_sessions` (org_id, user_id, device_id soft FK, site_id, line_id, shift, mode: personal/kiosk, session_token_hash, expires_at, created_at) — PRD line 411/1068
- `scanner_audit_log` (org_id, session_id, user_id, device_id, operation, barcode_raw, lp_id soft, wo_id soft, scan_method, result_code, client_op_id for idempotency, occurred_at, ext_jsonb) — PRD lines 86-90
- Both need RLS via `app.current_org_id()`, APPEND-ONLY for audit_log

New API routes required:
- `POST /api/scanner/login` — PIN verify via `packages/auth/src/verify-pin.ts:verifyPin`, create `scanner_sessions` row, return session token
- `POST /api/scanner/context` — patch session with site_id/line_id/shift
- `POST /api/scanner/logout`
- `POST /api/scanner/audit` — bulk audit entries (batch up to 50)
- `POST /api/scanner/lock-lp` — acquire/release LP mutex (writes `license_plates.locked_by`/`locked_at`)
- Auth middleware: scanner JWT guard (separate from Supabase session) for all `/api/scanner/*` and `/api/warehouse/scanner/*` and `/api/production/scanner/*` routes

Dependency: migs 261-263 already landed (suppliers/POs/TOs). `lp_genealogy` decision: either create the table (new migration) or document that `license_plates.parent_lp_id` + `lp_state_history` satisfies P1 without a dedicated genealogy table. The PRD cites it by name as a KPI target; this must be resolved before receive flows can be signed off.

setPin enrollment gap: `packages/auth/src/verify-pin.ts:setPin` exists but no route calls it. Lane A must add `POST /api/scanner/set-pin` (first-login enrollment) and `POST /api/scanner/change-pin` (self-service).

Prototype anchors: `prototypes/scanner/login.jsx:1-70` (LoginScreen), `login.jsx:72-126` (PinScreen), `login.jsx:201-294` (PinSetupScreen)

Size estimate: 1 migration file, 7-8 route files, 1 middleware file.

---

#### Lane B — Shell + Launcher + Session Context UI

Classification: MUST

New Next.js routes:
- `/[locale]/(scanner)/login/page.tsx` — `LoginScreen` from `prototypes/scanner/login.jsx:5-69`
- `/[locale]/(scanner)/login/pin/page.tsx` — `PinScreen` from `prototypes/scanner/login.jsx:72-126`
- `/[locale]/(scanner)/login/pin-setup/page.tsx` — `PinSetupScreen` from `prototypes/scanner/login.jsx:201-294`
- `/[locale]/(scanner)/login/site/page.tsx` — `SiteSelectScreen` from `prototypes/scanner/login.jsx:128-194`
- `/[locale]/(scanner)/home/page.tsx` — `HomeScreen` from `prototypes/scanner/home.jsx:7-61`
- `/[locale]/(scanner)/settings/page.tsx` — `SettingsScreen` from `prototypes/scanner/home.jsx:63-142`

Port shell primitives from `prototypes/scanner/shell.jsx:1-203` into `apps/web/components/shell/scanner-primitives.tsx`: `Topbar`, `Content`, `BottomActions`, `ScanInputArea`, `Banner`, `MiniGrid`, `StepsBar`. `ScannerFrame` already exists and does not need porting.

Port all modals from `prototypes/scanner/modals.jsx:1-496` into `apps/web/app/[locale]/(scanner)/_components/scanner-modals.tsx`.

Session context: React Context provider wrapping the `(scanner)` route group. Reads from `scanner_sessions` via Lane A context API.

Navigation: client-side state router matching `prototypes/scanner/app.jsx:1-183` pattern but using Next.js `useRouter` / `useParams`.

Data: `prototypes/scanner/data.jsx` is pure mock — replace with real Supabase queries in Lane C/D.

Prototype anchors: `shell.jsx:1-203`, `home.jsx:1-144`, `login.jsx:1-426`, `modals.jsx:1-496`

Size estimate: 10-12 component files, 1 context provider.

---

#### Lane C — Consume to WO + Output Registration (production loop)

Classification: MUST (closes the Planning-to-Production loop per user priority)

New routes and services:
- `/[locale]/(scanner)/wos/page.tsx` — WO list, `flow-consume.jsx:8-53`
- `/[locale]/(scanner)/wos/[woId]/page.tsx` — WO detail, `flow-consume.jsx:55-120`
- `/[locale]/(scanner)/wos/[woId]/execute/page.tsx` — WO execute screen, `flow-consume.jsx:122-212`
- `/[locale]/(scanner)/wos/[woId]/consume/page.tsx` — Consume scan, `flow-consume.jsx:215-422`
- `/[locale]/(scanner)/wos/[woId]/output/page.tsx` — Output registration, `flow-register.jsx:6-121`
- `/[locale]/(scanner)/wos/[woId]/waste/page.tsx` — Waste, `flow-register.jsx:226-315`
- Optional for P1: `/[locale]/(scanner)/wos/[woId]/coproduct/page.tsx` — `flow-register.jsx:152-225`

New API routes (scanner-auth guarded):
- `POST /api/production/scanner/consume` — writes `wo_material_consumption` (mig 181) + LP reservation update + `scanner_audit_log` entry
- `POST /api/production/scanner/output` — wraps existing `register-output.ts` service but under scanner JWT auth
- `POST /api/production/scanner/waste` — wraps existing `record-waste.ts` service

The existing `record-waste.ts` and `register-output.ts` library code at `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/` can be reused; the routes need scanner-JWT auth wrapper instead of `withOrgContext`.

Data: real queries to `work_orders`, `wo_material_consumption`, `license_plates`, `v_inventory_available`, FEFO ordering already available via the view.

Prototype anchors: `flow-consume.jsx:1-445`, `flow-register.jsx:1-315`

Size estimate: 7 page files, 3 API route files.

---

#### Lane D — Receive PO + Move/Putaway (warehouse loop) — STRETCH for P1 cut

Classification: MUST for receive PO (closes planning-to-warehouse loop); STRETCH for move/putaway

Receive PO:
- `/[locale]/(scanner)/receive-po/page.tsx` — `flow-receive.jsx:7-42`
- `/[locale]/(scanner)/receive-po/[poId]/page.tsx` — `flow-receive.jsx:44-91`
- `/[locale]/(scanner)/receive-po/[poId]/[lineId]/page.tsx` — `flow-receive.jsx:93-238`
- `POST /api/warehouse/scanner/receive-po-line` — creates GRN + `grn_items` row + new `license_plates` row + `lp_state_history` (genesis transition `null → received`) + `scanner_audit_log`. Tables: migs 191, 193, 262.

Receive TO (STRETCH):
- `POST /api/warehouse/scanner/receive-to-line` — confirms `transfer_order_lines` LP. Tables: mig 263.

Move LP (STRETCH):
- `POST /api/warehouse/scanner/move-lp` — writes `stock_moves` (mig 193), updates `license_plates.location_id`, requires lock-lp from Lane A.

Putaway (STRETCH):
- `POST /api/warehouse/scanner/putaway` — same as move but with FEFO location suggestion. Suggestion logic: query `v_inventory_available` for same product in same zone, return nearest expiry location.

Pick for WO (STRETCH):
- `POST /api/warehouse/scanner/pick-confirm` — updates `pick_list_lines.status`, reserves LP in `license_plates`.

`lp_genealogy` gap: if a genealogy table is required by PRD KPI (line 73), it must be created in Lane A before receive flows in Lane D can write to it. If deferred to P2, the receive flow writes only `license_plates.parent_lp_id` (soft genealogy). This decision gates Lane D.

Prototype anchors: `flow-receive.jsx:1-431`, `flow-putaway.jsx:1-180`, `flow-pick.jsx:1-280`, `flow-other.jsx:9-143` (Move), `flow-other.jsx:148-250` (Split)

---

### 7. Phantoms and Extras

**Phantom references (exist in docs/PRD, no implementation):**
- `lp_genealogy` table — cited in PRD line 73 as a KPI target, does not exist in any migration
- All 51 task files in `_meta/atomic-tasks/06-scanner-p1/tasks/` — manifest references them, directory is empty

**Extra code with no owning scanner task:**
- `ScannerFrame` component and its test were built as part of the foundation wave (T-134) — task file exists at `_meta/atomic-tasks/00-foundation/waves/app-shell-foundation-20260520/tasks/T-134-foundation-scanner-shell-isolation.json`
- `scanner_devices` and `scanner_device_defaults` tables and the `pairDevice` / `updateDeviceDefaults` actions were built for the settings module (02-settings wave) — correct owners

**Migration filename collision (bug, not a task):**
- Both `238-settings-scanner-devices.sql` and `238-npd-core-extra-fields.sql` carry the prefix `238`. Depending on the migration runner's sort order one may shadow the other. This needs a file rename.</result>
