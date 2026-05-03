# Scanner Module — Prototype Translation Notes

Generated: 2026-05-03
Source files scanned: `design/Monopilot Design System/scanner/*.jsx` plus shared Settings device surface
Components indexed: 55 canonical labels
Total estimated translation time: ~3,360 min (~56 h)
Hardening context: Wave Next-3 Scanner P1 readiness, user decisions applied.

---

## 2026-05-03 hardening decisions applied

1. Canonical ambiguous labels are scanner-prefixed:
   - `scanner_settings_screen` replaces scanner-owned `settings_screen`.
   - `scanner_devices_screen` replaces scanner-owned `devices_screen`.
2. First-class MVP labels added:
   - `pin_setup_screen` for `PinSetupScreen` (`scanner/login.jsx:201-297`).
   - `pin_change_screen` for `PinChangeScreen` (`scanner/login.jsx:301-397`).
   - `camera_scanner` for `CameraScanner` (`scanner/modals.jsx:326-391`).
3. User-visible done states are first-class labels:
   - `po_done_screen`, `to_done_screen`, `putaway_done_screen`, `move_done_screen`, `split_done_screen`, `pick_done_screen`, `consume_done_screen`, `output_done_screen`, `coproduct_done_screen`, `waste_done_screen`, `qa_done_screen`.
4. UI implementation closeout requires:
   - mobile viewport `390x844` screenshot;
   - Playwright trace artifact;
   - route/prototype-label parity note;
   - intentional divergence note when implementation differs from PRD/UX/prototype.
5. Scanner tasks now carry explicit cross-module dependency metadata for Settings, Warehouse, Planning, Production, and Quality contracts.

---

## Cross-cutting concerns (apply to all scanner components)

### 1. Dark-theme token mapping

All scanner CSS custom properties (`--sc-*`) must be mapped to Tailwind/shadcn design tokens before translating any component.

| Prototype token | Production equivalent |
|---|---|
| `var(--sc-bg)` | scanner dark background, usually `slate-900` |
| `var(--sc-surf)` | scanner surface/card, usually `slate-800` |
| `var(--sc-txt)` | high-contrast scanner foreground |
| `var(--sc-mute)` | muted foreground |
| `var(--sc-red)` | destructive/error |
| `var(--sc-green)` | success/LP card |
| `var(--sc-amber)` | warning/reason-code banners |
| `var(--sc-blue)` | primary scan/action affordance |

### 2. Shared primitive extraction

Build these primitives first because they unblock most scanner labels:

- `ScanInputArea` -> `<ScanField>` with hardware wedge, camera, and manual parity.
- `MiniGrid` -> `<LpDetailGrid>` reusable across LP/WO/QA detail cards.
- `StepsBar` -> scanner step indicator driven by URL search params.
- `NumpadInput` -> reusable PIN/qty keypad.
- `SuccessScreen` -> shared done-screen wrapper for every first-class done label.
- `Topbar` -> scanner shell with back link, sync badge, user badge, and overflow actions.
- `ScannerModal` -> bottom-sheet primitive for reason pickers, FEFO deviation, qty keypad, language/logout, LP locked, and P2 stubs.
- `Banner` -> scanner variants `info`, `warn`, `err`, `success`.

### 3. State machine to App Router mapping

Prototype callbacks such as `onNav(screen, args)` become route navigation and server actions. Core mapping:

| Prototype label | Route intent |
|---|---|
| `login_screen` | `/scanner/login` |
| `pin_screen` | `/scanner/login/pin` |
| `pin_setup_screen` | `/scanner/login/pin/setup` |
| `pin_change_screen` | `/scanner/settings/pin-change` |
| `site_select_screen` | `/scanner/login/site-select` |
| `home_screen` | `/scanner` or `/scanner/home` |
| `scanner_settings_screen` | `/scanner/settings` |
| `scanner_devices_screen` | `/scanner/admin/devices` |
| `camera_scanner` | modal/overlay launched from any scan route |
| Receive labels | `/scanner/receive/po`, `/scanner/receive/to` route tree |
| Putaway labels | `/scanner/putaway` route tree |
| Move/split labels | `/scanner/move`, `/scanner/split` route tree |
| Pick labels | `/scanner/pick` route tree |
| Consume labels | `/scanner/consume` route tree |
| Output/co-product/waste labels | `/scanner/output`, `/scanner/coproduct`, `/scanner/waste` route trees |
| QA labels | `/scanner/qa` route tree |
| `inquiry_screen` | `/scanner/inquiry` P2 flag-gated shell |

### 4. Mock data to real data sources

| Mock constant | Real data source |
|---|---|
| `SCN_USER` | authenticated scanner session |
| `SCN_HOME_GROUPS`, `SCN_TILES` | `/api/scanner/menu` with RBAC filtering |
| `SCN_POS` | purchase order read model via Warehouse contract |
| `SCN_TOS` | transfer order read model via Warehouse contract |
| `SCN_LPS` | LP units joined to products, locations, QA status |
| `SCN_WOS` | Production/Planning WO read model |
| `SCN_BOM` | active BOM snapshot lines from WO snapshot |
| `SCN_PICK` | WO material reservations and pick tasks |
| `SCN_QA` | Quality pending inspection queue |
| `SCN_QUICK_LOCS` | Warehouse locations filtered by site/context |
| `SCN_REASONS_*` | reason codes from Settings/Quality/Warehouse policies |
| `SCN_WASTE_CATS` | configurable waste categories |
| `SCN_COPRODUCTS` | BOM co-product definitions tied to WO snapshot |
| `SCN_SITES`, `SCN_LINES`, `SCN_SHIFTS` | Settings/Foundation site, line, and shift context |

### 5. Server Actions and API pattern

All scanner writes must use a validated server boundary and write scanner audit metadata. For production flows, D365 SO/Built/export metadata is never an unlock condition. Scanner production writes require the canonical WO snapshot with approved BOM and active factory spec.

### 6. i18n

Prototype strings are Polish. Production routes must route all user-facing strings through the app i18n layer with keys under `scanner.{label}.{key}` or shared scanner primitive namespaces.

---

## Label-specific implementation notes

### Auth, settings, devices

- `login_screen`: badge scan remains primary; email/password fallback remains secondary.
- `pin_screen`: PIN verify only; first-time setup and change are separate first-class labels.
- `pin_setup_screen`: forced SCN-011b Set/Confirm flow; enforce 4-6 digit policy, non-trivial PIN rules, and admin-configured complexity.
- `pin_change_screen`: settings-launched Old/New/Confirm flow; verify old PIN server-side.
- `site_select_screen`: fetch sites, lines, shifts from Settings/Foundation with RBAC filtering.
- `scanner_settings_screen`: persist sound, vibration, auto-advance, camera preference, language, and PIN-change route.
- `scanner_devices_screen`: org/site admin fleet management and pairing surface; shared entry point may live under Settings, but scanner label ownership is canonical.

### Camera and scan primitives

- `camera_scanner`: P1 MVP surface. Use `@zxing/browser` or native `BarcodeDetector` fallback. Must include permission-denied fallback to manual entry, rear/front camera toggle, optional torch, amber 300x100 viewfinder, and 390x844 visual evidence.
- `qty_keypad_sheet`, `scan_error_sheet`, `lp_locked_sheet`, and reason-code sheets: extract once and reuse across all flow routes.

### Warehouse flows

- Receive PO/TO and putaway labels depend on Warehouse LP lifecycle, GRN, TO, location, FEFO, and lock contracts.
- `to_done_screen`, `putaway_done_screen`, `move_done_screen`, and `split_done_screen` use the shared `SuccessScreen` pattern and are no longer omitted as display-only.

### Production flows

- Pick and consume depend on Planning WO/reservation contracts, Warehouse LP/FEFO/intermediate contracts, and Production WO execute contracts.
- `pick_done_screen` and `consume_done_screen` are first-class done labels.
- Output, co-product, and waste labels close the production loop and now have task coverage for both API and UI.
- `output_done_screen`, `coproduct_done_screen`, and `waste_done_screen` must show final state without additional decisions, preserving kiosk post-success logout behavior.

### Quality flows

- QA list, inspect, fail reason, and done depend on Quality inspection/NCR contracts and Warehouse LP `qa_status`/`status` transitions.
- `qa_done_screen` is first-class and must support PASS, FAIL with NCR card, and HOLD success variants.

---

## Translation priority order

| Phase | Labels / tasks | Rationale |
|---|---|---|
| 0 — Evidence harness | `T-048` | Establish 390x844 screenshot and trace closeout before broad UI work |
| 1 — Primitives | scan, keypad, modal, banner, success, topbar | Blocks all flows |
| 2 — Auth/context/settings | `login_screen`, `pin_screen`, `pin_setup_screen`, `pin_change_screen`, `site_select_screen`, `scanner_settings_screen`, `scanner_devices_screen` | Gates scanner access |
| 3 — Warehouse | receive, TO, putaway, move, split labels and done states | Inbound and stock movement |
| 4 — Production pick/consume | pick, WO execute, consume labels and done states | Core production material loop |
| 5 — Production closeout | output, co-product, waste labels and done states | Closes WO execution |
| 6 — Quality | QA queue, inspect, fail reason, done | P1 QA completion |
| 7 — P2 shells | `inquiry_screen`, SCN-090 queue | Keep flag-gated until P2 |
