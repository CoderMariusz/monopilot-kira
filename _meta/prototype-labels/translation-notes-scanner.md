# Scanner Module — Prototype Translation Notes

Generated: 2026-04-23  
Source files scanned: 9 JSX files + BACKLOG.md  
Components indexed: 41  
Total estimated translation time: ~2,705 min (~45 h)

---

## Cross-cutting concerns (apply to ALL scanner components)

### 1. Dark-theme token mapping
All scanner CSS custom properties (`--sc-*`) must be mapped to Tailwind/shadcn design tokens before any component translation begins. Key mappings:

| Prototype token | Production equivalent |
|---|---|
| `var(--sc-bg)` | `bg-background` (dark variant) |
| `var(--sc-surf)` | `bg-card` |
| `var(--sc-txt)` | `text-foreground` |
| `var(--sc-mute)` | `text-muted-foreground` |
| `var(--sc-red)` | `text-destructive` |
| `var(--sc-green)` | `text-green-400` (custom token) |
| `var(--sc-amber)` | `text-amber-400` (custom token) |
| `var(--sc-blue)` | `text-blue-400` (custom token) |

### 2. Shared primitive extraction (do first)
Before translating any flow screen, extract these shared primitives:

- `ScanInputArea` → `<ScanField>` server component (label, placeholder, hint, state: idle/ok/err, onSubmit)
- `MiniGrid` → `<LpDetailGrid>` reusable server component (rows of {label, value, cls} pairs)
- `StepsBar` → shadcn `<Steps>` with active/completed indicators, driven by URL searchParam `?step=N`
- `NumpadInput` → standalone client primitive extracted from `QtyKeypadSheet` for reuse in all quantity-entry screens
- `SuccessScreen` → shared layout wrapper (icon + title + subtitle) used in every `*DoneScreen`
- `Topbar` → shared server component with back-link (Next.js `<Link>`) + sync badge + avatar button
- `Banner` → map to shadcn `<Alert>` with variant prop: `info→default`, `warn→warning(custom)`, `err→destructive`, `success→success(custom)`

### 3. State machine → URL routing
The prototype uses a client-side `onNav(screen, ...args)` callback pattern to navigate between screens within a single SPA shell. In production this must be replaced with Next.js App Router pages under `/scanner/` with URL searchParams for wizard steps:

```
/scanner/home
/scanner/settings
/scanner/login
/scanner/login/pin
/scanner/login/site-select
/scanner/receive/po                    → PoListScreen
/scanner/receive/po/[poCode]           → PoLinesScreen
/scanner/receive/po/[poCode]/[lineId]  → PoItemScreen ?step=0..3
/scanner/receive/to                    → ToListScreen
/scanner/receive/to/[toCode]           → ToScanScreen
/scanner/putaway                       → PutawayScanScreen
/scanner/putaway/suggest               → PutawaySuggestScreen
/scanner/pick                          → PickWoListScreen
/scanner/pick/[woCode]                 → PickListScreen
/scanner/pick/[woCode]/[bomLine]       → PickScanScreen ?step=0..2
/scanner/consume                       → WoListScreen
/scanner/consume/[woCode]              → WoDetailScreen
/scanner/consume/[woCode]/execute      → WoExecuteScreen
/scanner/consume/[woCode]/scan/[line]  → ConsumeScanScreen
/scanner/output/[woCode]              → OutputScreen ?step=0..3
/scanner/output/[woCode]/done          → OutputDoneScreen
/scanner/coproduct/[woCode]            → CoproductScreen
/scanner/waste/[woCode]                → WasteScreen
/scanner/move                          → MoveScreen
/scanner/split                         → SplitScanScreen
/scanner/split/[lp]                    → SplitQtyScreen
/scanner/qa                            → QaListScreen
/scanner/qa/[lp]                       → QaInspectScreen
/scanner/qa/[lp]/fail-reason           → QaFailReasonScreen
/scanner/inquiry                       → InquiryScreen (P2 flag-gated)
```

### 4. Mock data → real data sources
| Mock constant | Real data source |
|---|---|
| `SCN_USER` | Next-Auth/Lucia session; `session.user` injected by middleware |
| `SCN_HOME_GROUPS`, `SCN_TILES` | `/api/scanner/menu` with RBAC filter |
| `SCN_POS` | `purchase_orders` table via Drizzle |
| `SCN_TOS` | `transfer_orders` table |
| `SCN_LPS[code]` | `lp_units` table JOIN `products` |
| `SCN_WOS` | `work_orders` table |
| `SCN_BOM[woCode]` | `bom_lines` table JOIN `lp_units` |
| `SCN_PICK` | `pick_tasks` view |
| `SCN_QA` | `qa_tasks` WHERE status='pending' |
| `SCN_QUICK_LOCS` | `storage_locations` WHERE is_quick_access = true AND site = session.siteId |
| `SCN_REASONS_*` | `reason_codes` table WHERE type = '...' |
| `SCN_WASTE_CATS` | `waste_categories` WHERE active = true |
| `SCN_COPRODUCTS[wo]` | `bom_coproducts` WHERE wo_code = wo |
| `SCN_SITES`, `SCN_LINES`, `SCN_SHIFTS` | `sites`, `production_lines`, `shifts` tables |

### 5. Server Actions pattern
All write operations must use Next.js Server Actions with this standard signature:
```typescript
async function actionName(formData: FormData): Promise<ActionResult<T>> {
  const session = await getSession(); // RBAC guard
  const validated = schema.safeParse(Object.fromEntries(formData));
  if (!validated.success) return { error: validated.error };
  // ... DB write via Drizzle
  // ... outbox event emit
  revalidatePath('/scanner/...');
  return { data: result };
}
```

### 6. i18n — all strings hard-coded Polish
**ALL** 37 components have hard-coded Polish strings. Before any component translation, set up next-intl with locale routing for `pl | en | uk | ro` (matching `LanguageSheet` options). Use a flat key namespace per screen: `scanner.{screen_name}.{key}`.

### 7. Known bugs from BACKLOG.md (scanner-specific)
| ID | Description | Priority |
|---|---|---|
| BL-SCN-01 | bottom-sheet is CSS-override approach; needs dedicated `ScannerModal` primitive | Medium |
| BL-SCN-02 | Camera viewfinder placeholder (zxing deferred to P2) | P2 |
| BL-SCN-03 | Offline queue screen not implemented — logout may lose data | Medium |
| BL-SCN-04 | PIN setup/change wizard not built | Low |
| BL-SCN-05 | Session idle-timeout 30s warning not wired | Low |
| BL-SCN-06 | Kiosk 3s countdown chip not activated | Low |
| BL-SCN-07 | Language apply picker works but i18n re-render not implemented | Medium |
| BL-SCN-08 | Site-select stored-context pre-fill not implemented | Low |

---

## Component-by-component translation summary

### modals.jsx

**`reason_picker_sheet`** (lines 21–53) — generic reason-code bottom-sheet  
Priority primitive: used by `putaway_suggest_screen`, `qa_fail_reason_screen`. Extract `SCN_REASONS_*` arrays to a `reason_codes` DB table. The `other` branch with 5-char min is a validation rule — encode in zod schema. shadcn: `Dialog + RadioGroup + Textarea + Button`. ~60 min.

**`fefo_deviation_sheet`** (lines 55–98) — LP comparison + reason  
Critical compliance modal: every FEFO deviation must write an audit record. The two-column compare grid becomes a CSS Grid with two shadcn Cards. Server Action must emit `FEFO_DEVIATION` outbox event consumed by audit log service. ~75 min.

**`best_before_sheet`** (lines 100–124) — soft warning + reason  
Simple but compliance-sensitive: daysLeft must be computed server-side to prevent clock manipulation. Three hard-coded reason options should be made configurable via Settings. ~45 min.

**`partial_consume_sheet`** (lines 126–155) — BOM deficit list + reason  
The missing[] list should be a proper shadcn Table, not an inline ul. Production must enforce `V-SCAN-WO-008` rule check server-side before allowing partial proceed. ~60 min.

**`printer_picker_sheet`** (lines 157–180) — P2 stub  
Keep disabled in P1. Wire to ZPL print queue in P2. ~30 min.

**`language_sheet`** (lines 182–212) — locale picker  
Must call `router.replace()` with new locale segment on apply — this is the key missing piece from BL-SCN-07. Locale options auto-generated from `routing.locales` config. ~45 min.

**`logout_sheet`** (lines 214–228) — confirmation  
Must drain/persist offline queue before logout once BL-SCN-03 is resolved. ~25 min.

**`scan_error_sheet`** (lines 230–249) — recoverable error  
Map error codes to i18n keys. Show raw code only in debug builds. ~30 min.

**`qty_keypad_sheet`** (lines 251–275) — numeric keypad  
Extract as `NumpadInput` primitive. Reused in: PoItemScreen, PickScanScreen, ConsumeScanScreen, OutputScreen, CoproductScreen, WasteScreen, SplitQtyScreen. Factor once, use everywhere. ~50 min.

**`block_fullscreen`** (lines 277–298) — hard block overlay  
Uses React Portal. Must reset LP lock via Server Action before allowing retry. ~35 min.

**`lp_locked_sheet`** (lines 300–310) — LP lock warning  
Static 'seconds' prop must become a countdown fed by polling `/api/lp/{lp}/lock-status`. ~25 min.

---

### home.jsx

**`home_screen`** (lines 7–61) — workflow launcher  
Replace mock tile groups with RBAC-filtered server fetch. Replace client-side `onOpenFlow` with Next.js `router.push`. The sync-state badge in `Topbar` connects to BL-SCN-03 (offline queue). ~60 min.

**`settings_screen`** (lines 63–136) — operator settings  
Persist all toggle states to `user_preferences` DB table. PIN change row wires to BL-SCN-04 flow. Scan mode selector (Hardware/Camera/Manual) affects `ScanInputArea` behavior. ~90 min.

---

### login.jsx

**`login_screen`** (lines 5–56) — badge scan + email/password fallback  
Two credential providers for Next-Auth. Badge scan path is the primary flow (autoFocus). Remove hard-coded demo email. ~75 min.

**`pin_screen`** (lines 58–112) — 6-digit PIN entry  
Extract `NumpadInput` here too (or reuse from qty_keypad_sheet extraction). Persist attempt count in DB per BL-QA-06 anti-keylogger concern. ~70 min.

**`site_select_screen`** (lines 114–180) — shift context setup  
Server Component fetches RBAC-filtered sites/lines/shifts. On confirm, Server Action creates shift context record and sets session. BL-SCN-08 pre-fill from stored context. ~80 min.

---

### flow-receive.jsx

**`po_list_screen`** (lines 7–37) — PO search list  
Server-side ILIKE filter. Urgency dot from PO.urgency field. ~45 min.

**`po_lines_screen`** (lines 40–86) — PO line checklist  
Compute received/ordered pct in SQL. Share checklist row pattern with `to_scan_screen`. ~55 min.

**`po_item_screen`** (lines 89–233) — 4-step receive wizard  
Most complex receive screen. GS1-128 parse must be a real Server Action in production. Two-click overreceive pattern must emit `PO_OVERRECEIVE` event with supervisor gate if qty > 1.1× ordered. ~120 min.

**`po_done_screen`** (lines 236–264) — receive success  
Extract `SuccessScreen` wrapper here for reuse. ~40 min.

**`to_list_screen`** (lines 267–294) — TO search list  
Same pattern as `po_list_screen`. ~40 min.

**`to_scan_screen`** (lines 297–385) — TO LP checklist scan  
Key flow for partial TO acceptance. `TO_PARTIAL_RECEIVE` outbox event keeps unconfirmed LPs in `in_transit` status. ~90 min.

---

### flow-putaway.jsx

**`putaway_scan_screen`** (lines 5–63) — LP scan  
LP status validation server-side. Expiry color computed in SQL. ~60 min.

**`putaway_suggest_screen`** (lines 65–144) — location suggestion + override  
LocationSuggester service is the key integration point. Override path must write reason to audit log. ~80 min.

*(PutawayDoneScreen at lines 146–178 is under 20 significant logic lines — skip per rules)*

---

### flow-pick.jsx

**`pick_wo_list_screen`** (lines 5–40) — WO pick list  
Same filter-pill pattern as `wo_list_screen`. Share filter component. ~50 min.

**`pick_list_screen`** (lines 42–94) — BOM component checklist  
Progress bar + next-suggestion card. FEFO LP suggestion fetched in same query join. ~60 min.

**`pick_scan_screen`** (lines 96–238) — 3-step location→LP→qty  
Shares FEFO deviation flow with `consume_scan_screen`. Server Action `Pick.verifyLP()` returns deviation metadata. ~120 min.

*(PickDoneScreen at lines 240–274 is primarily display/routing logic — under 20 meaningful lines)*

---

### flow-consume.jsx

**`wo_list_screen`** (lines 8–54) — WO list with progress  
Inline `sc-cbar` progress bar → small shadcn `Progress` in table cell. ~55 min.

**`wo_detail_screen`** (lines 56–121) — WO detail + BOM overview  
WO card with metadata grid + full BOM checklist + 3-button action row. ~70 min.

**`wo_execute_screen`** (lines 123–213) — execution dashboard with tabs  
Tab state in URL searchParam. Missing materials Banner must list specific items. 4-button action row for scan/output/coproduct/waste. ~90 min.

**`consume_scan_screen`** (lines 216–410) — LP scan with 6-gate validation  
Most complex single screen in the scanner module. Server Action `Consume.validateLP()` must implement all 6 gates as a typed Result union. FEFO and best_before modals overlap with pick flow — share implementation. ~150 min.

*(ConsumeDoneScreen at lines 413–431 is display-only)*

---

### flow-register.jsx

**`output_screen`** (lines 6–121) — register finished goods (4-step)  
Yield calculation must be server-side. Missing-materials gate triggers `PartialConsumeSheet`. LP number issued by LP registry service. V-SCAN-WO-006/007 validation rules kept visible as FormDescription. ~130 min.

**`coproduct_screen`** (lines 152–202) — co-product registration  
LP type `co_product` (violet badge). Inherits source WO. BOM co-products fetched from DB. ~75 min.

**`waste_screen`** (lines 226–285) — waste registration  
No LP created. Waste categories configurable from settings. Phase selector as Select enum. ~80 min.

*(OutputDoneScreen, CoproductDoneScreen, WasteDoneScreen are display-only screens under 40 meaningful lines but included in JSON as they exist; translation time dominated by shared SuccessScreen pattern already factored in)*

---

### flow-other.jsx

**`move_screen`** (lines 10–86) — LP relocation  
Two-phase scan with pessimistic LP lock. Lock heartbeat from client every 60s. `LP_MOVED` outbox event. ~90 min.

**`split_scan_screen`** (lines 111–150) — LP scan for split  
RBAC: requires `warehouse_operator` role minimum. Next screen receives LP via URL searchParam. ~50 min.

**`split_qty_screen`** (lines 152–193) — split quantity entry + preview  
Before/after 2-col card preview. `Split.execute()` Server Action issues sequential new LP number. ~65 min.

**`qa_list_screen`** (lines 227–260) — QA inspection queue  
Scan-to-navigate directly to inspect screen. Urgency sorted server-side. ~50 min.

**`qa_inspect_screen`** (lines 262–294) — LP inspection with 3-outcome buttons  
3 outcome buttons (Pass/Reject/Hold). Reject path routes to `qa_fail_reason_screen`. ~65 min.

**`qa_fail_reason_screen`** (lines 296–336) — NCR reason + notes  
Creates NCR record. discriminatedUnion zod schema for sel/other fields. ~70 min.

**`inquiry_screen`** (lines 391–438) — LP info lookup (P2 preview)  
Feature-flag gated. Static history list replaced with `lp_movements` table join in P2. ~50 min.

---

## Translation priority order (suggested)

| Phase | Components | Rationale |
|---|---|---|
| 0 — Primitives | NumpadInput, ScanField, LpDetailGrid, StepsBar, SuccessScreen, Topbar, Banner→Alert mapping | Block all flows |
| 1 — Auth | login_screen, pin_screen, site_select_screen | Gate to all other screens |
| 2 — Home | home_screen, settings_screen | Entry point after auth |
| 3 — Modals | All 11 modal components from modals.jsx | Shared dependencies for flows |
| 4 — Receive | po_list→po_lines→po_item→po_done, to_list→to_scan | Inbound stock flow |
| 5 — Putaway | putaway_scan→putaway_suggest | Follows receive |
| 6 — Pick | pick_wo_list→pick_list→pick_scan | Pre-production |
| 7 — Consume | wo_list→wo_detail→wo_execute→consume_scan | Core production loop |
| 8 — Register | output, coproduct, waste | Closes production loop |
| 9 — Other | move, split_scan, split_qty, qa_*, inquiry | Utility + QA flows |
