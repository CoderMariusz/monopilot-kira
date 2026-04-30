# 06-SCANNER-P1 — UX Specification (for prototype generation)

**Version:** 1.0
**Date:** 2026-04-20
**Status:** Final — Designer handoff
**Source PRD:** 06-SCANNER-P1-PRD.md v3.0
**Primary prototype reference:** SCANNER-PROTOTYPE (2).html (~1826 lines, 34 sub-screens)
**Consumer of:** 05-WAREHOUSE v3.0 §13, 08-PRODUCTION stub, 09-QUALITY QA
**Target output:** Interactive HTML prototypes via Claude Design

---

## 0. Module Overview

Scanner (module 06) is the **dedicated mobile interface** of MonoPilot MES. It runs under routing `/scanner/*`, is a Progressive Web App (PWA) installable on handheld devices, and is optimised for shop-floor operators working in conditions of noise, gloves, variable lighting, and intermittent Wi-Fi.

**Persona:** Three primary roles use this interface daily:

- **Anna — Warehouse Operator** (personal Zebra TC52, chilled warehouse, 4–8°C, gloves, ~20–30 scans/h). She runs GRN receiving, stock moves, and putaway.
- **Piotr — Production Operator** (shared kiosk tablet Samsung Tab Active3 + Bluetooth ring scanner, production line, 80–85 dB, ~50–80 scans/h, 60 s idle timeout). He runs material pick, consume-to-WO, output registration, co-product, and waste.
- **Marta — QA Inspector** (iPhone 14 Pro or Zebra TC57, chilled + ambient areas, ~15–25 inspections/shift). She runs QA PASS/FAIL/HOLD inspections.

**Key concepts this spec covers:**

- **Offline-first queue** — P1 includes detection stub and placeholder screen; P2 adds full IndexedDB queue with sync. Designer must show all offline states, pending badge, conflict resolution UX.
- **Barcode scan contract** — each scan step specifies exactly which barcode type is expected (LP, location, product/GTIN, PO, TO, WO) and what validation fires.
- **use_by vs best_before gating** — use_by is a hard block (operator cannot proceed); best_before triggers a soft warn requiring acknowledgement and a reason code. Both fire at scan time.
- **FEFO deviation runtime confirm** — consuming or picking an LP whose expiry is later than the FEFO-suggested LP triggers an amber warning requiring a reason code; it is never a hard block (per 05-WH Q6B).
- **Intermediate LP always to_stock P1** — there is no "direct continue" option in the scanner UI. All intermediate outputs register to stock first.
- **3-method input parity** — every scan step works identically via hardware wedge (Zebra/Honeywell HID), camera (zxing), or manual keypad fallback. The UI adapts the visible affordances based on detected capabilities.
- **Kiosk vs personal device mode** — kiosk: 60 s hardcoded idle timeout, auto-logout after each success; personal: 300 s configurable timeout, remember-me 8 h.
- **State machine transitions via scan** — each successful scan advances the workflow step automatically (300 ms debounce). Errors halt and display appropriate severity UI.

---

## 1. Design System — Mobile Variant

### 1.1 Layout

The scanner layout is **fullscreen — no sidebar**. It consists of four fixed regions:

**Top app bar (56 px, `background: #1e293b`, `border-bottom: 1px solid #334155`):** Contains a back button (44×44 px touch target, hidden on root screens), a page title (16 px semibold, `color: #f1f5f9`), a user initials badge (pill, `background: #0f172a`, 10 px), an optional sync status indicator (dot + count), and an overflow menu button (44×44 px).

**Main content area (flex-1, `overflow-y: auto`, `-webkit-overflow-scrolling: touch`):** All workflow content lives here. Custom scrollbar `width: 3 px`, `background: #334155`. Content starts at the top of this region and scrolls up to reveal the bottom action bar.

**Bottom action bar (64 px, `background: #0f172a`, `border-top: 1px solid #334155`, `padding: 8px 16px`):** Primary action button fills the full width minus 32 px padding. Height 50 px. This bar is always visible over the content. In screens with two primary actions (e.g., QA big-3 buttons), the bottom bar is replaced by an inline action block that is still pinned to the visible viewport via sticky positioning.

**Bottom sheets** (modals that slide up from the bottom): Used for reason code pickers, FEFO deviation confirm, qty keypad, printer picker, conflict resolution, language picker, logout confirm. They dim the main content with a `rgba(0,0,0,0.7)` overlay. Handle is a 32×4 px rounded pill at the top. Maximum height is 80% of viewport. Scrollable internally.

### 1.2 Typography

All type renders in **Inter** (system-ui fallback). Dark theme: `background: #0f172a` (deepest bg), `background: #1e293b` (card/surface), `color: #f1f5f9` (primary text), `color: #94a3b8` (secondary text), `color: #64748b` (hint/disabled text).

| Role | Size | Weight | Color |
|---|---|---|---|
| Page title (topbar) | 16 px | 600 | #f1f5f9 |
| Section header | 10 px | 700, uppercase, letter-spacing .1em | #475569 |
| List item title | 13–14 px | 600 | #f1f5f9 |
| List item subtitle | 11 px | 400 | #64748b |
| LP barcode number | 26 px | 700, Courier New monospace, letter-spacing 3px | #4ade80 (green LP) or #c084fc (purple co-product) |
| Scan input | 16 px | 400, center-aligned | #f1f5f9 |
| Scan input big (qty) | 24 px | 700, center-aligned | #f1f5f9 |
| Mini-grid label | 10 px | 400 | #475569 |
| Mini-grid value | 12 px | 600 | #f1f5f9 |
| Button primary | 14–15 px | 600 | #ffffff |
| Success title | 22 px | 700 | #f1f5f9 |
| WO number headline | 18 px | 700 | #f1f5f9 |

Glove-readability guideline: primary interactive text minimum 14 px; scan input fields minimum 16 px; big mode (qty numpad) 24 px.

### 1.3 Touch Targets

| Element | Minimum size |
|---|---|
| Standard button | 50 px height × full width |
| List item | 68 px height |
| Numpad key | 64 px height × 1/3 width minus 10 px gap |
| QA big-3 button | 80 px height × full width |
| Topbar icon button | 44×44 px |
| Scan input | 50 px height (hardware) / 64 px (explicit focus) |
| Quick location button | 52 px height |

### 1.4 Color Semantics

| Role | Token name | Hex value | Usage |
|---|---|---|---|
| Background deep | slate-900 | #0f172a | Screen background, numpad bg |
| Background surface | slate-800 | #1e293b | Cards, topbar, sinput-area, tabs |
| Background elevated | slate-700 | #334155 | Borders, separators, disabled bg |
| Primary blue | blue-500 | #3b82f6 | Scan input border, primary button, tab active, step active |
| Success green | green-400 | #4ade80 | LP card text, success icon, check indicator |
| Success green bg | green-950 | #052e16 | LP card background |
| Success green border | green-600 | #16a34a | LP card border, done step |
| Warning amber | amber-300 | #fdba74 | Banner title (warn) |
| Warning amber bg | amber-950 | #431407 | Warn banner background |
| Warning amber border | amber-700 | #9a3412 | Warn banner border |
| Error red | red-400 | #ef4444 | Error text, FAIL button |
| Error red bg | red-950 | #450a0a | Error banner background |
| Info blue | blue-300 | #93c5fd | Info banner title |
| Info blue bg | blue-950 | #172554 | Info banner background, micon-blue |
| Co-product purple | purple-400 | #c084fc | Co-product LP text |
| Co-product purple bg | purple-950 | #2e1065 | Co-product LP background |
| Next-suggestion cyan | cyan-300 | #7dd3fc | Next-sug label text |
| Next-suggestion cyan bg | cyan-900 | #0c4a6e | Next-sug background |
| Waste amber | amber-600 | #d97706 | Waste button `btn-w` |
| Separator | slate-750 | #1a2332 | Row border-bottom |

### 1.5 Scanner Camera Viewfinder

When the camera scan mode is active, a full-screen video element fills the display (autoplay, playsInline, muted). An SVG overlay paints a rectangular cutout 300×100 px centered horizontally at 40% vertical — amber (#f59e0b) 2 px border, 8 px border-radius. A horizontal scan line (2 px, amber, 0.6 opacity) animates top-to-bottom inside the cutout over a 1.5 s loop. Four corner reinforcements (L-shaped, white, 12 px arms, 3 px thick) mark the scan area. Controls: close button (top-left, 44×44 px, `background: rgba(0,0,0,0.5)`), front/rear toggle (top-center), torch toggle (top-right, shown only if `track.getCapabilities().torch` is true). On permission denied: the overlay shows a centered message card with camera icon, "Brak dostępu do kamery" title, and a "Wpisz ręcznie" button.

### 1.6 Keypad Fallback Bottom Sheet

Triggered by tapping "Wpisz ręcznie" button on any scan step, or automatically when no hardware wedge is detected. Slides up from bottom. Contains: a large display field (24 px, center, `background: #0f172a`), a 3×4 numpad (keys 1–9, blank, 0, backspace), and a full-width "Potwierdź" button (50 px). For alpha-numeric manual entry (LP, location codes), a standard soft keyboard is invoked via `inputMode="text"` on a text input.

### 1.7 Sound and Haptic Cues

| Event | Audio | Haptic |
|---|---|---|
| Scan success | 1× 500 ms tone, 800 Hz | Vibrate 100 ms |
| Scan error / invalid barcode | 2× 200 ms tones, 400 Hz, 200 ms gap | Vibrate 100 ms × 2, 100 ms gap |
| Warning (FEFO deviation, partial consume) | 1× 300 ms tone, 600 Hz | Vibrate 300 ms |
| Critical (LP not found, WO invalid, hard block) | 3× 200 ms tones, 300 Hz | Vibrate 500 ms |
| LP lock conflict | 1× 200 ms tone, 200 Hz | Pulsing 100 ms × 3 |
| Sync complete | Ascending 2-note (500 Hz → 700 Hz) | Vibrate 100 ms |

All feedback is configurable per user in SCN-settings (on/off per event type). Settings persist to `localStorage.scanner_feedback`.

### 1.8 Sync Status Badge

The sync badge appears in the top app bar, right of the page title. It displays as a colored pill: **green** (text "ONLINE") when connected and no pending queue; **amber** (text "QUEUED N") when offline queue has pending items; **red** (text "SYNC ERROR") when last sync attempt failed. Tapping the badge navigates to SCN-090 Queue view. In P1 the badge is detection-only (no real queue); the badge shows ONLINE/OFFLINE state only, with queue count always 0.

---

## 2. Information Architecture

### 2.1 Route Map (Mobile)

```
/scanner                         → redirect to /scanner/login (if no session) or /scanner/home
/scanner/login                   → SCN-010 Login (card scan + email/pass + PIN button)
/scanner/login/pin               → SCN-011 PIN (6-digit numpad)
/scanner/login/pin-setup         → SCN-011b PIN First-time Setup
/scanner/login/pin-change        → SCN-011c PIN Change (self-service)
/scanner/site-select             → SCN-012 Site / Line / Shift select
/scanner/home                    → SCN-home Workflow launcher
/scanner/settings                → SCN-settings Scanner settings
/scanner/receive/po              → SCN-020 Receive PO (list → lines → item → done)
/scanner/receive/to              → SCN-030 Receive TO (list → scan → done)
/scanner/putaway                 → SCN-040 Putaway (scan LP → suggest → done)
/scanner/move                    → SCN-031 Move LP (scan LP → destination → done)
/scanner/split                   → SCN-060 Split LP (scan LP → qty → done)
/scanner/pick                    → SCN-050 Pick for WO (WO list → pick list → scan → done)
/scanner/produce/wo              → SCN-080/081 WO execute (WO list → detail → execute tabs)
/scanner/produce/consume         → SCN-080-scan Component consume
/scanner/produce/output          → SCN-082 Output registration
/scanner/produce/coproduct       → SCN-083 Co-product
/scanner/produce/waste           → SCN-084 Waste
/scanner/qa                      → SCN-070 QA Inspect list
/scanner/qa/inspect              → SCN-071 QA Inspect (PASS/FAIL/HOLD)
/scanner/qa/fail-reason          → SCN-072 QA Fail Reason
/scanner/qa/done                 → SCN-073 QA Done
/scanner/queue                   → SCN-090 Offline Queue (P2)
/scanner/error                   → SCN-error Unrecoverable error
```

### 2.2 Role-based Workflow Visibility

| Role | Visible workflows |
|---|---|
| `scanner.access` (base) | Login, Home, Settings, Queue |
| `warehouse.operator` | + Receive PO, Receive TO, Putaway, Move, Split |
| `production.operator` | + Pick for WO, WO Execute (Consume, Output, Co-product, Waste) |
| `quality.inspector` | + QA Inspect |
| `scanner.supervisor` | All + can approve FEFO override, unlock LP locks |

Home menu items are filtered client-side by role. Items the user cannot access are hidden entirely (not grayed) to prevent confusion. Attempting to deep-link an unauthorized workflow redirects to SCN-home with an info banner "Brak uprawnień do tego workflow."

---

## 3. Screens

### 3.1 SCN-010 — Login

**Route:** `/scanner/login`
**Purpose:** Authenticate operator before accessing any workflow. Supports three paths: (1) card/badge scan via hardware wedge, (2) email + password manual entry, (3) PIN via dedicated screen.

**Layout:**

The content area contains three vertical blocks. The logo block occupies approximately the top 35% of the viewport: centred, 72×72 px icon container (`background: #172554`, 20 px border-radius, factory emoji 36 px), 22 px "MonoPilot" headline, 13 px "Scanner · MES System" subtitle in slate-500. Below the logo block is the scan-badge block: an 11 px uppercase label "ZESKANUJ KARTĘ PRACOWNIKA", then a `sinput-area` box containing the scan input field (placeholder "Skanuj kartę lub wpisz ID…") and a hint "Przyłóż kartę do czytnika lub użyj skanera". A horizontal divider "lub zaloguj ręcznie" separates the scan block from the manual login form. The form contains an "Email / Login" field and a "Hasło" password field stacked vertically. The bottom action bar holds a full-width primary "Zaloguj się →" button (52 px) and a ghost button "🔢 Zaloguj przez PIN". App version "v2.1.0 · MonoPilot MES" appears centered below the buttons in 10 px slate-700 text.

**Scan target:** Badge/card scan = Code 128 employee ID barcode. Auto-submits on Enter from hardware wedge; manual entry requires pressing the submit button.

**States:**

- **Idle/Ready:** Scan input is auto-focused (hardware mode) or shows camera button (camera mode).
- **Scanning (hardware wedge):** Input receives burst of characters, auto-submits.
- **Loading:** Primary button shows spinner "Weryfikacja…", input disabled.
- **Error — Invalid credentials:** Red banner below the form "Nieprawidłowy login lub hasło. Pozostało prób: N." Input fields shake animation (translateX 4px, 0.3 s, 3 cycles).
- **Error — Account locked:** Full-screen error overlay "Konto zablokowane. Zbyt wiele nieudanych prób. Skontaktuj się z supervisorem." with a single "Wróć" button.
- **Error — Rate limited:** "Zbyt wiele prób logowania. Spróbuj za 10 minut."

**Transitions:** Successful authentication → SCN-012 Site/Line/Shift. PIN button tap → SCN-011. First-time user (no PIN set) → after credential auth → SCN-011b PIN Setup before SCN-012.

**Microcopy:**
- Scan hint: "Przyłóż kartę do czytnika lub użyj skanera"
- Auth error: "Nieprawidłowy login lub hasło. Pozostało prób: [N] z 5."
- Locked: "Konto zablokowane na 10 minut. Zbyt wiele nieudanych prób PIN."

---

### 3.2 SCN-011 — PIN Entry

**Route:** `/scanner/login/pin`
**Purpose:** Fast PIN authentication. Primary method for returning operators. 6-digit PIN with numeric keypad.

**Layout:**

No bottom action bar — the numpad occupies the full lower portion of the screen. The top portion contains a 14 px "Wpisz swój 6-cyfrowy PIN" label and a row of six PIN indicator dots: each dot is 14×14 px, `border-radius: 50%`, `border: 2px solid #334155`. As digits are entered, filled dots switch to `background: #3b82f6` (blue). The numpad is a 3×4 grid: rows [1, 2, 3], [4, 5, 6], [7, 8, 9], [empty, 0, backspace]. Each key is 64 px height, `border-radius: 12 px`, `background: #1e293b`, `border: 1px solid #334155`. The backspace key renders ⌫ at 22 px in slate-500. The empty position is transparent with no border and disabled. Below the numpad, a ghost button "← Inne metody logowania" navigates back to SCN-010.

**Auto-advance:** After the 6th digit is entered, the dots all flash blue for 300 ms, then the auth request fires automatically (no confirm button needed for 6-digit). For 4- or 5-digit PINs (policy allows 4–6), the operator must press a submit key that appears after digit 4.

**States:**

- **Idle:** Auto-focus not applicable (no hardware input on PIN screen). Numpad visible and active.
- **PIN rotation required:** Before the numpad, a yellow info banner "Wymagana zmiana PIN — poprzedni wygasł. Ustaw nowy poniżej." is shown; submission redirects to SCN-011c.
- **Error (wrong PIN):** All six dots flash red (`background: #ef4444`) for 400 ms, then clear. Error message appears below the dots "Nieprawidłowy PIN. Pozostało prób: [N] z 5." The dots shake horizontally.
- **Locked:** After 5 wrong attempts, a full-screen error: "Konto zablokowane na 10 minut ze względu na zbyt wiele błędnych prób PIN. Skontaktuj się z supervisorem." + back button.
- **Loading (after auto-submit):** Dots spin animation, numpad disabled.

**Transitions:** Correct PIN + session OK → SCN-012 (if no context set) or SCN-home (if context already stored from previous session). Wrong PIN → shake + counter decrement. 5 failures → account lock screen.

**Microcopy:**
- Subtitle: "Wpisz swój 6-cyfrowy PIN"
- Wrong PIN: "Nieprawidłowy PIN. Pozostało prób: [N] z 5."
- Locked: "Konto zablokowane na 10 minut."

---

### 3.3 SCN-011b — PIN First-time Setup

**Route:** `/scanner/login/pin-setup`
**Purpose:** Forced at first-ever scanner login. Operator must set their PIN before accessing any workflows.

**Layout:** A progress steps indicator (2 steps: Set / Confirm) at the top, under the topbar. Step 1 (active blue): operator sees the same 6-dot indicator + numpad as SCN-011, with the label "Ustaw swój nowy PIN (4–6 cyfr)." Step 2 (confirm, active after step 1): "Potwierdź nowy PIN — wpisz ponownie." An info banner "PIN jest wymagany do szybkiego logowania na hali. Zapamiętaj go — nie możesz go zresetować samodzielnie." appears on step 1.

**Policy validation (after confirm step):** If PIN is sequential (1234, 4321) or all repeating (1111) and policy forbids it, an inline error appears "PIN nie spełnia wymagań bezpieczeństwa. Spróbuj innego." The operator must re-enter both steps. Policy rules: minimum 4 unique digits by default (admin-configurable).

**States:** Step 1 entry, step 2 confirmation, policy error, success (navigates to SCN-012).

---

### 3.4 SCN-011c — PIN Change (Self-service)

**Route:** `/scanner/login/pin-change`
**Purpose:** Operator-initiated PIN rotation from SCN-settings.

**Layout:** Three sequential steps: (1) "Wpisz obecny PIN" → (2) "Wpisz nowy PIN" → (3) "Potwierdź nowy PIN." Same 6-dot + numpad pattern. A step indicator (3 steps) at the top tracks progress. On success, green banner "PIN zmieniony pomyślnie." then navigates back to SCN-settings.

---

### 3.5 SCN-012 — Site / Line / Shift Select

**Route:** `/scanner/site-select`
**Purpose:** Set session context (site, line, shift) before entering the workflow launcher. Required once per session start.

**Layout:**

Top region: a user confirmation strip (56 px, `background: #1e293b`) with operator avatar (40×40 px circle, blue-950 bg), name (14 px bold), email + role (11 px slate-500), and a green "ZALOG." badge on the right.

Site selection: section header "ZAKŁAD / FIRMA", then a vertical list of 2-column cards (each card is full-width, flex row). Each site card: 40×40 px icon container (rounded 10 px, blue-950), site code + name (13 px bold), description (11 px slate-500), blue checkmark on selected. Only one site can be selected; tap to select. Selected state: `background: #0d2149`, `border: 2px solid #3b82f6`, name in blue-400.

Line selection: section header "LINIA PRODUKCYJNA", then a 2-column grid of line buttons. Each line button: status dot (green active, amber pause), line name (12 px bold), description (10 px). Selected: same blue highlight pattern. Up to 4–6 lines per site.

Shift selection: section header "ZMIANA", then a 3-column grid of shift buttons. Each shift: name (12 px bold), hours (10 px slate-500). Shifts: Ranna 06:00–14:00, Popołudniowa 14:00–22:00, Nocna 22:00–06:00.

Bottom action bar: a summary line "APEX · Linia A · Zmiana ranna · 06:00–14:00" (11 px slate-500), then full-width "▶ Rozpocznij zmianę" button (52 px).

**States:**

- **Default:** If user has a stored context from the last session (same shift active), the stored values are pre-selected. User can change.
- **Loading (on submit):** Button shows spinner "Zapisywanie…", all selectors disabled.
- **Error (context required):** If any of the three is not selected, the "Rozpocznij zmianę" button is disabled (ghosted, `opacity: 0.4`). No error messages needed — button is simply not tappable.
- **Shift already started:** If the selected shift is outside working hours, an amber banner "Zmiana nocna jeszcze nie zaczęła się. Kontynuować?" + [Tak] [Anuluj] — enforced only if `shift_enforcement = strict` (admin config, default = loose/warn).

**Transitions:** Successful context set → SCN-home.

---

### 3.6 SCN-home — Workflow Launcher

**Route:** `/scanner/home`
**Purpose:** Central hub. Operator selects which workflow to start. All available workflows for the operator's role are listed here.

**Layout:**

The top portion contains a context strip (56 px, `background: #1e293b`, rounded 10 px, 12 px margin): operator avatar (36 px circle, blue-950), name (13 px bold), context line "Linia A · Zmiana ranna · [time]" (11 px slate-500), and sync badge on the right (green ONLINE / amber QUEUED N / red SYNC ERROR).

Below the context strip, the menu is organised in three labelled sections:

**Sekcja: PRODUKCJA**
- Work Order (icon 🏭, `micon-blue`): "Konsumpcja + rejestracja wyrobu" — navigates to SCN-080 WO list. Badge shows count of active WOs for current line (e.g. "3").
- Pick dla WO (icon 🧺, `micon-purple`): "Zbierz materiały z magazynu" — navigates to SCN-050 pick WO list.

**Sekcja: MAGAZYN**
- Przyjęcie PO (icon 📦, `micon-green`): "Odbierz zamówienie zakupu" → SCN-020 PO list.
- Przyjęcie TO (icon 🔄, `micon-cyan`): "Transfer Orders do odbioru" → SCN-030 TO list.
- Putaway (icon 📍, `micon-green`): "Odłóż LP — sugestia FIFO/FEFO" → SCN-040.
- Przesuń LP (icon 🚚, `micon-amber`): "Przenieś paletę / pojemnik" → SCN-031.
- Part Movement / Split LP (icon ✂️, `micon-purple`): "Podziel License Plate" → SCN-060.

**Sekcja: JAKOŚĆ**
- Inspekcja QC (icon 🔍, `micon-red`): "Zatwierdź, odrzuć lub wstrzymaj partię" → SCN-070. Badge shows count of pending inspections (e.g. "5").
- Inwentaryzacja (icon 📊, `micon-blue`): "Licz i weryfikuj stany" → placeholder (P2, tapping shows info banner "Funkcja dostępna w przyszłej wersji.").

Each menu item is a `mitem` row: 68 px height, flex row with left icon (`micon` 46×46 px, 13 px border-radius), a title (14 px bold) + description (11 px slate-500) block, and a right chevron (›) or badge pill. A 1 px separator line spans from the icon right edge to the screen edge.

**Visibility:** Items where the operator lacks permission are not rendered. The sections themselves collapse if empty (e.g. a warehouse-only operator sees no Produkcja section).

**States:**
- **Normal:** All accessible items visible.
- **Kiosk mode (after successful operation):** The screen reappears after logout, showing only the login prompt and the PIN modal. The workflow launcher itself is behind the PIN barrier.
- **Offline:** The sync badge shows OFFLINE in amber. All workflows remain tappable (P1 online-only: user can attempt but will hit API errors; P2: operations queue).

---

### 3.7 SCN-020 — Receive PO (GRN)

**Route:** `/scanner/receive/po`
**Purpose:** Register receipt of goods against a Purchase Order. Creates one or more LPs per PO line. Supports multi-LP split per line (e.g. 100 kg order received as 40 kg + 60 kg on two LPs).

This workflow has four sub-screens: PO List → PO Lines → PO Item (receive form) → PO Done.

#### 3.7.1 SCN-020-list — PO List

**Layout:** Top is a search/scan bar (`sinput-area`): large scan input (placeholder "Zeskanuj numer PO lub wpisz…") with hint "Skanuj kod z dokumentu dostawy". Below, a list of pending purchase orders. Each row is a `litem`: left icon (📦 in `licon` container), PO number (13 px bold), supplier name + ETA (11 px slate-500), an urgency dot + status badge on the right, and chevron.

**Urgency dot colours:** Red circle (🔴) = overdue (ETA in past); amber (🟡) = due today; blue (🔵) = future. Urgency dot is a 8×8 px circle positioned top-right of the icon container.

**Scan target:** Code 128 PO barcode. Auto-matches to a PO row and navigates to SCN-020-lines.

**States:** Loading (skeleton rows), empty (no pending POs — blue info banner "Brak oczekujących zamówień dla tej lokalizacji"), error (API failure — red banner + retry button).

**Transitions:** Tap PO row or successful PO scan → SCN-020-lines. Back → SCN-home.

#### 3.7.2 SCN-020-lines — PO Lines

**Layout:** Topbar title shows PO number (e.g. "PO-2026-0018"). A compact PO header card (`wo-card` style) shows: supplier name, PO date, total lines, urgency. Below, a list of PO lines. Each line row: product name (13 px bold), SKU + GTIN (11 px slate-500), two-column right block showing "Zamówiono: X kg" and "Odebrano: Y kg". A circular progress indicator (28 px diameter, SVG) shows received percentage — green for complete, blue for partial, red for zero received. Lines are sorted: incomplete first (urgency order), complete last.

**States:** All complete → blue info banner "Wszystkie pozycje odebrane." + "Wróć" button. Partial → normal list. Loading → skeleton.

**Transitions:** Tap a line → SCN-020-item (pre-loaded with that line's product data). Back → SCN-020-list.

#### 3.7.3 SCN-020-item — Receive Item

**Layout:** Step indicator (4 steps: Produkt → Partia/Expiry → Ilość → Lokalizacja) at the top. Then a sequence of form groups with scan inputs:

Step 1 — **Skanuj produkt:** Scan input (placeholder "Skanuj GS1/LP dostawcy lub wpisz GTIN…"). Hint "Kod GS1-128 z etykiety dostawcy". On scan of GS1-128, auto-extracts: GTIN (AI 01) → product lookup, batch/lot (AI 10) → pre-fills batch field, expiry (AI 17) → pre-fills expiry field. Catch weight: if product has `is_catch_weight=true` and AI 3103 is present, weight is auto-extracted. Mini-grid appears after product identified: 2×3 cells showing Product name, SKU/GTIN, UoM, Remaining qty, Catch weight flag (yes/no), Product status (badge).

Step 2 — **Partia / Nr serii:** Text input field (label "Partia *", `req` asterisk in red-500). Hint "Obowiązkowe". Pre-filled from GS1 AI 10 if available. Expiry date input (label "Data ważności *" or "Best before" depending on product date policy). Date input with numeric keypad or date picker sheet.

Step 3 — **Ilość:** Large numeric input (24 px bold, center) with numpad. Hint shows "Pozostało: X kg" from PO line remaining qty. If over-receipt would occur: amber banner "Uwaga: ilość przekracza zamówioną. Kontynuować?" + [Anuluj / Potwierdź nadwyżkę].

Step 4 — **Lokalizacja:** Scan input for destination location code (placeholder "Skanuj kod lokalizacji lub wpisz…"). 4 quick-access location buttons for frequent locations (52 px height, `background: #1e293b`, location code monospace 12 px). Optional pallet_id field: scan pallet barcode or tap "Generuj nowy LP" to auto-assign.

Bottom action bar: "Zatwierdź przyjęcie" button.

**Scan targets by step:**
- Step 1: GS1-128 (Code 128 or GS1) — type: `product` or `auto`. Validation: GTIN-14 check digit, product must exist in database.
- Step 2: No scan — keyboard/numpad entry only.
- Step 3: No scan — numpad entry.
- Step 4: Code 128 — type: `location`. Validation: location must exist, status active.

**States (all steps):**
- Scan loading (after any scan): input shows spinner inline, border pulses blue.
- Scan success: short green flash on input border, auto-advance to next step.
- Scan error (unknown barcode): red border flash, error banner (see Section 4 — Generic scan error modal).
- use_by gate: if product has `date_policy = use_by` and scanned/entered expiry is today or past → hard block full-screen error "Produkt po dacie use_by. Przyjęcie niemożliwe. Skontaktuj się z supervisorem." — no bypass possible.
- best_before gate: if `date_policy = best_before` and entered date is within `best_before_warning_days` of today → soft warn amber banner "Produkt zbliża się do daty best_before ([date]). Akceptujesz?" + [Odrzuć / Przyjmij i kontynuuj]. Reason code dropdown required.

**Transitions:** Final confirm → SCN-020-done. Back (any step) → previous step (step-stack within workflow).

#### 3.7.4 SCN-020-done — PO Receipt Confirmed

**Layout:** `success-wrap` (padding-top 40 px, center). Large checkmark emoji ✅ (64 px). Title "Przyjęto!" (22 px bold). Subtitle "Pozycja PO-2026-0018 · Wiśniowy jogurt 150g" (13 px slate-500). Below, a green LP card (`lp-card`): LP barcode number (26 px, Courier New, green-400), subtitle "Nowy LP · 40 kg · Partia B20260401 · Expiry 2026-07-01". If two LPs were created (multi-LP split): two LP cards side-by-side in a 2-column grid (LP-001 left, LP-002 right). Each card is a scaled-down version (14 px LP number, 11 px subtitle). Yield indicator not shown on receive.

Bottom action bar: two buttons stacked — primary "Następna pozycja PO" (navigates back to SCN-020-lines for next incomplete line), secondary "Wróć do listy PO" (navigates to SCN-020-list).

---

### 3.8 SCN-030 — Receive Transfer Order (TO)

**Route:** `/scanner/receive/to`
**Sub-screens:** TO List → TO Scan → TO Done.

#### 3.8.1 SCN-030-list

**Layout:** Same pattern as SCN-020-list but filtered to Transfer Orders. Scan input placeholder "Zeskanuj numer TO lub wpisz…". Each TO row: TO number (e.g. "TO-2026-042"), source site (e.g. "z FNOR Norwich"), expected LP count, ETA, status badge (in_transit / awaiting_receipt). No urgency dot — instead a "W tranzycie" amber badge or "Oczekuje" blue badge.

#### 3.8.2 SCN-030-scan

**Layout:** TO header card (mini-grid 2×2: TO number, source, lines expected, date). Below, a checklist of expected LPs. Each LP row: LP barcode (13 px monospace), product name (11 px slate-500), expected qty, a confirmation circle (○ empty → ✓ confirmed, green). Scan input at top: "Skanuj LP z dostawy…" — each scan of an LP barcode confirms that row. A partial accept note: "Nie wszystkie LP? Naciśnij 'Przyjmij częściowo' aby kontynuować."

Bottom action bar: "Przyjmij potwierdzonych" (counts: N / total confirmed, button disabled until at least 1 confirmed).

**Scan target:** Code 128 LP barcode. Type: `lp`. Validation: LP must be in transit for this TO.

**States:** No LPs scanned yet → all rows empty circles. All scanned → all green. Partial → mixed. Unknown LP scan → red banner "LP nie należy do tego TO lub nie jest w tranzycie." Extra LP (not in TO) → amber banner "Ten LP nie jest przypisany do tego TO. Dodać jako nadwyżkę?" + [Dodaj / Odrzuć].

#### 3.8.3 SCN-030-done

**Layout:** Success screen. Icon ✅. Title "Transfer odebrany." Subtitle "TO-2026-042 · [N] z [M] LP potwierdzono." If partial: amber warning card "UWAGA: [K] LP nie zeskanowano. Zostają w tranzycie." List of confirmed LPs (compact rows, green dot + LP number + qty). Bottom action bar: "Wróć do listy TO."

---

### 3.9 SCN-040 — Putaway

**Route:** `/scanner/putaway`
**Sub-screens:** Putaway Scan → Putaway Suggest → Putaway Done.

#### 3.9.1 SCN-040-scan

**Layout:** Scan input at top (`sinput-area`): placeholder "Skanuj LP do odłożenia…". Hint "Skanuj etykietę z dokumentu przyjęcia". After scan, LP details appear in a `mini-grid` (2×3): Product, Qty + UoM, Batch / Lot, Expiry date (color-coded: green = ok, amber = <60 days, red = <14 days), Current location (or "Brak lokalizacji" for newly received), LP status badge.

Bottom action bar: "Sprawdź sugestię" button (enabled only after LP is loaded).

**Scan target:** Code 128 LP. Type: `lp`. Validation: LP must exist, status = `available` or `qc_pending` (not `consumed`, `blocked`, `hold`).

**States:** Initial empty scan area. Post-scan loading (500 ms API call to `suggest/:lpId`). Post-scan success: LP grid appears, button becomes active. Error (LP not found): red flash, error modal. Error (LP locked): amber modal "LP używany przez [user]. Retry za [N]s."

#### 3.9.2 SCN-040-suggest

**Layout:** A large suggestion card (80% width, centered, `background: #1e293b`, `border-radius: 16px`, `border: 2px solid #334155`). Inside: label "SUGEROWANA LOKALIZACJA" (10 px uppercase, slate-500), the location code (28 px bold, Courier New, white — center), strategy badge pill (e.g. "FEFO" green / "FIFO" blue / "PREFEROWANA" purple), hint text (11 px slate-500, e.g. "Inne LP tego produktu już w tej strefie"). Below the suggestion card: scan input "Zeskanuj lokalizację docelową lub wpisz kod…". Hint "Zeskanuj sugerowaną lub wybierz inną".

Alternatives section: collapsible row "Inne opcje (3)" — expands to show 3 alternative location cards in a scrollable horizontal strip, each showing location code (14 px) + strategy badge + distance indicator.

**States:**
- User scans the **suggested location**: input border flashes green, a "MATCH" green badge animates over the suggestion card, automatically advances to SCN-040-done after 300 ms.
- User scans a **different location**: amber warn-banner appears inline (see 3.9.2a Override Flow).
- Scan error (location not found): red border flash, "Nie znaleziono lokalizacji [code]." message.

**3.9.2a — Override Flow (inline, no separate screen):**

The override flow occurs entirely within SCN-040-suggest. When a non-suggested location is scanned and validated as existing, the override section expands below the scan input:

Amber warn-banner: "Inna lokalizacja niż sugestia ([SUGGESTED]). Podaj powód aby kontynuować." Below the banner, a reason code dropdown (full-width `select.finput`): options — Błędna sugestia (strefa pełna), Pilna potrzeba innej lokalizacji, Bliższa lokalizacja dostępna, Inna lokalizacja lepsza dla produktu, Inny powód (+ free text area that appears on selection). Below the dropdown, two buttons stacked: amber "Potwierdź z podanego powodu" (50 px) and ghost "Skanuj sugerowaną" that pre-fills the suggested location.

#### 3.9.3 SCN-040-done

**Layout:** Success screen. Icon ✅. Title "LP odłożony!" Subtitle "LP-00234 · Śmietana 36%". From/to table: two rows — "Z:" (old location or "Bez lokalizacji") with arrow → "Do:" (confirmed location), each cell with location code in monospace. Strategy row: "Strategia: FEFO · Override: Nie" (or "Tak — [reason]" in amber). Bottom action bar: "Odłóż kolejny LP" (→ SCN-040-scan reset) and "Wróć do menu" (→ SCN-home).

---

### 3.10 SCN-031 — Move LP

**Route:** `/scanner/move`
**Sub-screens:** Move LP → Move Done.

#### 3.10.1 SCN-031-move

**Layout:** Scan input at top "Skanuj LP do przeniesienia…". After LP scan, mini-grid (2×3): Product, Qty, Batch, Expiry, Current location, Status. Below the mini-grid, a destination section: scan input "Skanuj lokalizację docelową…" with 4 quick-access location buttons (2×2 grid, 52 px each, `background: #1e293b`, border, location code 12 px monospace + zone name 10 px).

**Scan targets:**
- First scan: Code 128 LP. Type: `lp`. Validation: LP exists, status = `available` or `reserved` (not `consumed`, `hold`, `blocked`).
- Second scan: Code 128 location. Type: `location`. Validation: location exists, active, ≠ current location.

**States:**
- LP on hold: red banner "LP na QA Hold — nie można przenieść. Kontakt QA." Hard block.
- LP consumed: red banner "LP już skonsumowane." Hard block.
- LP locked (by another user): amber modal "LP używany przez [user] (operacja: [type]). Wygasa za [N]s. Poczekaj lub poproś supervisora."
- Destination = current location: red banner "LP już w tej lokalizacji." Hard block.
- Lock acquired: a small "🔒 Zablokowano na 5 min" indicator appears below the mini-grid, with a countdown.

Bottom action bar: "Przenieś" button (enabled only after both LP and destination are selected).

#### 3.10.2 SCN-031-done

**Layout:** Success. Icon ✅. Title "LP przeniesiony!" Two location pills side by side: left pill (amber bg) "POPRZEDNIA: [code]", right pill (green bg) "NOWA: [code]". LP number and product shown. Bottom action bar: "Przesuń kolejny LP" + "Wróć".

---

### 3.11 SCN-060 — Split LP

**Route:** `/scanner/split`
**Sub-screens:** Split Scan → Split Qty → Split Done.

#### 3.11.1 SCN-060-scan

**Layout:** Scan input "Skanuj LP do podziału…". After scan, mini-grid showing LP details (same as SCN-031). Below: info banner "Podziel ten LP na dwa mniejsze. Oryginalny LP zachowuje partię i datę ważności."

**Scan target:** Code 128 LP. Validation: LP exists, status = `available`, qty > 0 (must have something to split).

#### 3.11.2 SCN-060-qty

**Layout:** The LP details mini-grid remains at top. Below, a large qty input (24 px, center) with label "Ile przenieść na nowy LP?" and hint "Maks: [original_qty] [uom]". As the user types, a live preview appears: two cards in `split-grid` — left "ORYGINAŁ" (slate-800 bg, `split-orig`): LP number (14 px monospace), remaining qty after split (12 px slate-400), right "NOWY LP" (green-950 bg, green-600 border, `split-new`): "LP-XXXX (auto)" (14 px monospace), split qty (12 px green-300). Both cards update in real-time as qty is typed.

**Validation:** Split qty must be < original qty (V-SCAN-LP-005). If equal or greater → inline error "Qty do podziału musi być mniejsze niż dostępna ilość ([original] [uom])."

Bottom action bar: "Podziel LP" button.

#### 3.11.3 SCN-060-done

**Layout:** Success. Icon ✅. Title "LP podzielony!" `split-grid` (side-by-side): left card (slate-800) "ORYGINAŁ" — LP-00234, remaining qty, "Partia: B20260401 (zachowana)"; right card (green-950, green-600 border) "NOWY LP" — LP-00567 (26 px monospace, green-400), split qty, "Partia: B20260401 (odziedziczona)". Bottom: "Podziel kolejny" + "Wróć".

---

### 3.12 SCN-050 — Pick for WO

**Route:** `/scanner/pick`
**Sub-screens:** Pick WO List → Pick List → Pick Scan → Pick Done.

#### 3.12.1 SCN-050-wo-list

**Layout:** Search bar + pills filter (Wszystkie / Moja linia / Wymagają kompletacji). List of WOs needing picking. Each row: WO number, product, line, progress pill "0 / 4 skomp." (amber if incomplete, green if complete). No scan input on this screen — list selection only.

#### 3.12.2 SCN-050-list

**Layout:** Topbar title "Pick: WO-2025-0142." Progress bar: "Zebrano: 2 / 4 pozycji" with progress bar fill. Below, BOM component list sorted by location path (warehouse zone → aisle → bay). Each component row: location code pill (cyan chip, 10 px monospace), product name (13 px bold), required qty and UoM, a FEFO-suggested LP chip "SUGESTIA FEFO: LP-00245 · Expiry 2026-05-01" (green 1 px border on the row). Scanned rows: green checkmark + LP number. Remaining rows: empty circle.

**Next-to-pick chip:** cyan chip showing "NASTĘPNY: [product] w [location]" at the top of the list.

#### 3.12.3 SCN-050-scan

**Layout:** Step indicator (3 steps: Lokalizacja → LP → Ilość). 

Step 1: Scan input "Skanuj lokalizację [code]…". Hint shows expected location code. On correct location scan: green flash, ✓ badge on step 1, advance to step 2.

Step 2: After location confirmed, shows FEFO suggestion card (same style as SCN-040-suggest but smaller — 60 px height compact card): location code, LP number, product, expiry, qty available. Scan input below "Skanuj LP składnika…". On scan of the suggested LP: green flash, advance to step 3. On scan of a **different LP**: FEFO deviation flow triggers (see 3.12.3a).

Step 3: Qty input (24 px numpad, default = remaining required from BOM line). Confirm button in bottom bar.

**Scan targets:**
- Step 1: Code 128 location. Type: `location`. Must match the BOM line's suggested location.
- Step 2: Code 128 LP. Type: `lp`. Validation: LP product must match BOM material; LP status = `available` or `reserved`; qty ≥ requested.

**3.12.3a — FEFO Deviation (inline):**

When a different LP is scanned in step 2, an amber warn-banner slides in below the step indicator: "Sugestia FEFO: LP-00245 (expiry 2026-05-01). Wybrany: LP-00287 (expiry 2026-06-15). To odchylenie od reguły FEFO." Below: reason dropdown (Bliska data sugestii, Bliższa lokalizacja, Inna partia wybrana, Sugestia uszkodzona, Inny powód + free text). Two buttons: amber "Potwierdź z wybranym LP" (50 px) and ghost "Użyj sugestii FEFO" (resets to suggested LP). This is always a `warn` severity — operator can always override with reason code. The deviation is logged to `scanner_audit_log.metadata.fefo_deviation`.

#### 3.12.4 SCN-050-done

**Layout:** Success. Title "Pozycja zebrana!" Product + qty confirmed. Progress "3 / 4 zebrano." Next suggestion chip: "NASTĘPNA: [product] w [location]" (cyan, tappable → auto-advances to that row in pick list). Bottom: "Następna pozycja" (→ SCN-050-scan for next row) + "Wróć do listy".

---

### 3.13 SCN-080/081 — WO Execute (Consume-to-WO)

**Route:** `/scanner/produce/wo`
**Sub-screens:** WO List → WO Detail → WO Execute.

#### 3.13.1 SCN-080-wo-list

**Layout:** Search bar + pills (Wszystkie / Moja linia / Aktywne). List of WOs. Each row: WO number, product name, line, status badge, progress "180 / 500 kg", time started. Tap → SCN-080-wo-detail.

#### 3.13.2 SCN-080-wo-detail

**Layout:** `wo-card` block at top: WO number (18 px bold), product (12 px slate-500), status badge (`st-inprog` orange). `wo-meta` 2×2 grid: Cel, Wyprod., Czas trwania, Operator. Progress bar below the card with percentage (36%). Below: BOM summary component rows (`crow`) showing status per material (✓ ok / ! warn / ○ empty), name, qty consumed vs required, mini-progress bar.

Bottom action bar: two rows — primary "▶ Kontynuuj produkcję" (→ SCN-081-execute), secondary two-column buttons: "⏸ Wstrzymaj" + "📋 Szczegóły BOM".

#### 3.13.3 SCN-081 — WO Execute (Central Screen)

**Layout:** This is the central hub for all production operations on a WO. It is persistent across consume/output/waste/co-product sub-flows (operators return here after each operation).

**Progress strip** (44 px, `background: #1e293b`, `border-bottom: 1px solid #334155`): product name (11 px slate-500 left), "180 / 500 kg (36%)" (11 px green-400, bold, right). Progress bar (4 px, green fill, width = percentage).

**Warn banner** (conditional): if any BOM component is under-consumed, amber `warn-banner`: "Brakuje składnika: [name]: zeskanowano [X] / [Y] [uom]. Zeskanuj więcej przed rejestracją wyrobu gotowego." Multiple missing materials: list them. Dismissible with an "×" button (but will re-appear until resolved).

**Next-suggestion chip** (conditional): cyan `next-sug` chip "NASTĘPNY DO ZESKANOWANIA: [material name] · potrzeba jeszcze [qty] [uom]" — tappable, navigates directly to SCN-080-scan pre-filtered for that material.

**Tabs** (`tabs` bar, `border-bottom: 1px solid #334155`):
- Tab "📦 Komponenty [count]": shows BOM list (`crow` rows — ✓/!/○, product, detail sub-line, mini-bar, qty scanned / qty needed).
- Tab "✅ Zeskanowane [count]": shows list of consumed LP rows (`srow`): LP icon, product name + batch (13 px), timestamp (11 px slate-500), qty in UoM (13 px bold green-400).

**Action buttons** (4 stacked, `brow` block below tabs, each 50 px):
1. Blue primary "📷 Skanuj komponent" → SCN-080-scan.
2. Green "✅ Wyrób gotowy" → SCN-082 Output. If BOM incomplete → partial-consume warn modal first (see Section 4).
3. Purple "⚡ Co-product" → SCN-083.
4. Amber "🗑 Odpad" → SCN-084.

**States:**
- WO not in progress: this screen is not reachable. SCN-080-wo-detail shows a hard block banner.
- All components consumed: warn banner disappears, green info banner "Wszystkie składniki zeskanowane. Gotowy do rejestracji wyrobu."
- Kiosk idle 60 s: auto-logout without warning (no confirmation dialog in kiosk mode).

#### 3.13.4 SCN-080-scan — Scan Component

**Layout:** Topbar shows WO number + "Konsumpcja składnika". Step indicator (3 steps: Skanuj LP → Weryfikacja → Ilość). 

Step 1: Scan input "Skanuj LP składnika…". Hint "Zeskanuj kod z opakowania lub palety". Below: if next-suggestion active, shows cyan chip repeating the material suggestion. Camera + manual buttons below input.

After successful LP scan: LP details card appears (`mini-grid` 2×3): Produkt (product name), Partia (batch), Dostępne (available qty + UoM), Data ważności (color-coded), Lokalizacja, WO materiał match (✓ green "Zgodny z BOM" or ⚠ amber "Inny materiał niż BOM — sprawdź").

**FEFO deviation check (inline, step 2):** After LP is identified, if the LP expiry is later than the FEFO-suggested LP for this WO material, the FEFO deviation amber banner appears (same pattern as SCN-050-scan 3.12.3a). Operator must select reason code + confirm or switch to suggested LP. This is a `warn` severity only.

**use_by check (inline, step 2):** If `lp.date_policy = use_by` and `lp.expiry_date ≤ today`: hard block full-screen error card appears (red background overlay on the LP details mini-grid): "LP po dacie USE BY ([date]). Konsumpcja niemożliwa. Wybierz inny LP lub skontaktuj się z supervisorem." Two buttons: "Skanuj inny LP" (clears step 1 and returns to scan input) and "Wróć do WO" (→ SCN-081). The block cannot be bypassed.

**best_before check (inline, step 2):** If `lp.date_policy = best_before` and expiry within `best_before_warning_days`: amber warn-banner "Ten LP zbliża się do daty best_before ([date]). Kontynuować konsumpcję?" + reason dropdown + [Odrzuć / Kontynuuj]. On Odrzuć → clears step 1. On Kontynuuj → advances to step 3.

Step 3 — **Ilość:** Large qty input (24 px, center, numpad). Default = full LP qty (consume all). Hint "Dostępne: [qty] [uom]". Catch weight: if LP is catch weight, shows "Waga LP: [X] kg, Jednostek: [Y] BOX" with a pre-fill "Konsumujesz całe LP? [Tak / Nie]". Batch mandatory row: batch value pre-filled from LP scan (read-only display, not re-enterable since LP is the source of truth). "Partia: [value] *" displayed.

Bottom action bar: "Potwierdź konsumpcję" button.

**Scan target:** Code 128 LP. Type: `lp`. Validation: LP status = `available`, product matches WO BOM (or generates warn if not matching but supervisor can override), qty ≤ lp.current_qty.

**Transitions:** Success → returns to SCN-081 execute screen with updated Zeskanowane tab count and updated BOM row. Warn (FEFO / best_before) → requires confirmation before proceeding. Block (use_by) → cannot proceed.

---

### 3.14 SCN-082 — Output Registration

**Route:** `/scanner/produce/output`
**Purpose:** Register finished goods output against the active WO. Creates a new LP with primary output type.

**Layout:** Topbar "Rejestruj wyrób gotowy." Step indicator (4 steps: Ilość → Partia/Expiry → Lokalizacja → Confirm).

Step 1 — **Ilość wyprodukowana:** Large qty input (24 px numpad). Default pre-filled with `wo.planned_qty - wo.actual_qty` (remaining planned). Yield indicator below the input: "Cel: [X] kg · Wyprodukowano dotąd: [Y] kg · Yield: [Z]%" — color coded (green ≥95%, amber 80–95%, red <80%).

Step 2 — **Partia * + Data ważności *:** Two fields stacked. Batch: text input (label "Partia / Numer serii *", `req` asterisk). Expiry: date input. Both are mandatory (V-SCAN-WO-006, V-SCAN-WO-007). If expiry < today → block "Data ważności jest w przeszłości. Wprowadź poprawną datę." (exception: best_before products with admin override). Below: optional pallet/container scan "Skanuj paletę lub wpisz ID palety (opcjonalnie)."

Step 3 — **Lokalizacja:** Scan input "Skanuj lokalizację magazynową dla wyrobu gotowego…". 4 quick-location buttons for common output zones. Catch weight field (shown only if `product.is_catch_weight`): "Waga netto (kg):" numeric input.

Step 4 — **Potwierdzenie:** Summary card showing all entered data (qty, batch, expiry, location) for review. Info banner "Nowy LP zostanie utworzony i umieszczony w magazynie (to_stock)." — this reinforces the P1 rule that all output goes to stock first. Confirm button.

**States:** All fields validated on confirm. Missing batch → red inline error under field. Missing expiry → red inline error. Partial consume warn modal fires if BOM not complete (see Section 4).

**Transitions:** Success → SCN-082-done. Back → SCN-081 execute.

**SCN-082-done:** `success-wrap`. Icon ✅. Title "Wyrób gotowy zarejestrowany!" LP card (green): new LP number (26 px monospace green-400), product, qty, batch, expiry, location. If this is the second or subsequent output for this WO, two LP cards appear side-by-side with label "2 LP z tym samym produktem." Yield summary row. Bottom: "Rejestruj kolejny wyrób" (→ SCN-082 reset) + "Wróć do WO" (→ SCN-081).

---

### 3.15 SCN-083 — Co-product Registration

**Route:** `/scanner/produce/coproduct`
**Purpose:** Register a co-product (by-product of the same WO) as a separate LP. Creates LP with type = `co_product`.

**Layout:** Topbar "Rejestruj produkt uboczny." Step indicator (3 steps).

Step 1: Co-product selector dropdown or segmented picker — lists co-products defined in BOM (`co_products` table). Each option shows product name + allocation_pct. Label "Wybierz produkt uboczny."

Step 2: Qty (numpad), Batch * (mandatory, same enforcement as output), Expiry * (mandatory), Location scan.

Step 3: Confirmation summary.

**Transitions:** Success → SCN-083-done.

**SCN-083-done:** `success-wrap`. Icon ✅. Title "Produkt uboczny zarejestrowany!" LP card — **purple variant** (`background: #2e1065`, `border: 1px solid #7c3aed`): LP number (26 px, purple-400, Courier New), product name, qty, batch, expiry. Genealogy row: "Powiązane z WO: WO-2025-0142" (10 px uppercase, purple-300). Bottom: "Kolejny co-product" + "Wróć do WO."

---

### 3.16 SCN-084 — Waste Registration

**Route:** `/scanner/produce/waste`
**Purpose:** Log production waste. Does NOT create an LP — waste does not enter stock.

**Layout:** Topbar "Rejestruj odpad." Info banner at top (blue, auto-dismiss: never): "Brak LP — odpad nie trafia do magazynu. To jest tylko zapis ilości."

Category selector: 5 large buttons (each 52 px height, full width, `border-radius: 10px`) arranged vertically:
- 🐄 Tłuszcz / Fat (amber bg)
- 🧹 Odpady produkcyjne / Floor (slate-600 bg)
- 📦 Naddatek / Giveaway (blue-800 bg)
- ♻️ Do przeróbki / Rework (purple-800 bg)
- ❓ Inne / Other (red-900 bg)

Below: qty input (numpad, 24 px). Production phase dropdown: "Faza produkcji" — options: Przed gotowaniem, W trakcie gotowania, Po gotowaniu, Pakowanie, Inne. Notes textarea (3 rows, `finput`, optional): placeholder "Opcjonalne notatki…".

Bottom action bar: "Rejestruj odpad."

**States:** Category must be selected; qty > 0 required (V-SCAN-WO-005 analogue for waste). Both validated on submit.

**Transitions:** Success → SCN-084-done.

**SCN-084-done:** `success-wrap`. Icon ✅. Title "Odpad zarejestrowany." `4-cell summary grid` (2×2, `background: #1e293b`, `border-radius: 10px`, each cell `padding: 12px`): Kategoria / Ilość / Faza / Godzina. No LP card (waste has no LP). Bottom: "Rejestruj kolejny odpad" + "Wróć do WO."

---

### 3.17 SCN-070 — QA Inspection List

**Route:** `/scanner/qa`
**Purpose:** Entry point for QA inspection workflow. Shows pending LPs requiring inspection.

**Layout:** Scan input at top "Skanuj LP do inspekcji lub wybierz z listy…". Below: list of pending inspection items. Each row: urgency dot (red ≤1 day old, amber 1–3 days, blue normal), LP number (13 px monospace), product name + batch (11 px slate-500), age "Oczekuje: [N] dni" (amber if >1d, red if >3d), WO reference (if applicable), inspection type badge.

"Rozpocznij inspekcję" button appears in the bottom bar (disabled until LP selected by scan or tap).

**Scan target:** Code 128 LP. Type: `lp`. Validation: LP.qa_status = `pending` or `qc_pending`.

**States:** Empty list → blue info banner "Brak oczekujących inspekcji." Error (LP already inspected) → block "Ten LP został już oceniony (status: [result]). Nie można ponownie inspekować." Error (LP not pending) → "Ten LP nie oczekuje na inspekcję (status: [current])."

**Transitions:** Scan LP or tap row + tap "Rozpocznij inspekcję" → SCN-071.

---

### 3.18 SCN-071 — QA Inspect

**Route:** `/scanner/qa/inspect`
**Purpose:** Inspector evaluates the LP: PASS, FAIL, or HOLD.

**Layout:** LP details card (`mini-grid` 2×3): Product name, Qty + UoM, Batch/Lot, Expiry date, Location, WO reference (or "—"), Age (days since created). A label row above the grid: "INSPEKCJA: [LP-number]" (10 px uppercase, slate-500).

**Big-3 buttons** (each 80 px height, full width, `border-radius: 12px`, `font-size: 18px bold`):
1. ✓ PASS (green-600, white text, icon ✓ 28 px) — tap → success immediately + navigate to SCN-073.
2. ✗ FAIL (red-600, white text, icon ✗ 28 px) — tap → navigate to SCN-072 Fail Reason first.
3. ⏸ HOLD (amber-600, white text, icon ⏸ 28 px) — tap → success with hold status + navigate to SCN-073 (hold state).

Optional notes textarea (3 rows) below the big-3 buttons: "Opcjonalne uwagi do inspekcji…". Notes text is included in the API call regardless of result.

**States:** PASS state: all validation passes (no failure reason required). FAIL state: must navigate to SCN-072 first. HOLD state: no failure reason required (just holds the LP without releasing).

**Microcopy:**
- PASS button: "✓  ZATWIERDŹ"
- FAIL button: "✗  ODRZUĆ"
- HOLD button: "⏸  WSTRZYMAJ"

---

### 3.19 SCN-072 — QA Fail Reason

**Route:** `/scanner/qa/fail-reason`
**Purpose:** Mandatory step after FAIL decision. Inspector selects a failure reason and can add notes.

**Layout:** Header "Przyczyna odrzucenia" (topbar title). Info card showing LP number + product (mini header row). Seven reason buttons (each 52 px height, full width, icon + label, `background: #1e293b`, selected state `background: #450a0a`, `border: 2px solid #ef4444`):

1. 🦠 Zanieczyszczenie / Contamination
2. 🏷 Błędna etykieta / Wrong label
3. 🌡 Temperatura / Temperature
4. 👁 Wada wizualna / Visual defect
5. ⚖ Odchylenie wagi / Weight variance
6. 📅 Problem z datą / Date code issue
7. ❓ Inny powód / Other

When "Inny powód" is selected, a text area expands below the buttons "Opisz przyczynę:" (mandatory when Other is selected).

Notes textarea at bottom (optional additional notes for all reasons).

"Utwórz NCR i zapisz" button in bottom bar (enabled once a reason is selected). This calls `POST /api/quality/scanner/inspect` with result='fail' + failure_reason_id, and also triggers basic NCR creation in the 09-QUALITY module.

**Transitions:** Confirm → SCN-073 Done (fail state). Back → SCN-071 (cancels fail, returns to inspection without saving).

---

### 3.20 SCN-073 — QA Done

**Route:** `/scanner/qa/done`
**Purpose:** Confirmation screen after any QA inspection result.

**Layout:** Dynamic based on result:
- **PASS:** Green `success-wrap`. Large ✅ (64 px). Title "Partia zatwierdzona!" Subtitle "LP-[number] · [product]". Green LP status badge "DOSTĘPNE". Counter "Inspekcje dziś: [N] / [M]."
- **FAIL:** Red `success-wrap` (background tint `#1a0a0a`). Large ✗ emoji (64 px, red). Title "Partia odrzucona." Subtitle "[product] · Partia [batch]." NCR card (red, `border-radius: 10px`, `padding: 12px`): "NCR-2026-042 utworzony" (13 px bold red-400), reason summary (11 px). LP status badge "ZABLOKOWANE."
- **HOLD:** Amber `success-wrap` (background tint). Large ⏸ (64 px, amber). Title "Partia wstrzymana." LP status badge "WSTRZYMANE." Note "LP jest niedostępne do czasu rozstrzygnięcia."

Counter row in all states: "Wykonano dziś: [N] inspekcji." Bottom action bar: "Następna inspekcja" (→ SCN-070 list reset) + "Wróć do menu" (→ SCN-home).

---

### 3.21 SCN-090 — Offline Queue

**Route:** `/scanner/queue`
**Purpose (P2 full implementation, P1 stub):** Shows the pending offline sync queue. In P1, this screen is accessible from the sync badge but shows a placeholder.

**P1 Stub Layout:** Blue info banner "Tryb offline dostępny w wersji P2. Twoje skany wymagają połączenia internetowego." Sync status card: green dot "ONLINE · Wszystkie operacje zsynchronizowane." No queue items. Back button only.

**P2 Full Layout:**

Top bar shows queue summary: total pending count (18 px bold), "Oczekuje na synchronizację" label, "Sync teraz" button (tappable even offline — queues retry).

Filter pills: Wszystkie / Oczekujące / Błędy / Wygasłe.

Operations list: each row (`litem` style, 80 px height): icon showing operation type (📦 receive / 🚚 move / ✅ consume / etc.), operation description (13 px bold, e.g. "Przyjęcie PO-2026-0018 · 40 kg"), timestamp "2026-04-20 14:32" (11 px slate-500), status badge (queued amber / syncing blue spinner / synced green / failed red / expired gray). For `failed` items: a two-button inline row "Ponów" (blue, 36 px) + "Usuń" (red, 36 px). For `expired` items: one button "Usuń" + note "Operacja wygasła po 72h. Powtórz ręcznie."

Bottom action bar: "Synchronizuj wszystkie oczekujące" button (disabled when online + no pending items).

**States:** All synced → blue info banner "Kolejka pusta. Wszystkie operacje zsynchronizowane." 80+ pending → amber banner "Kolejka prawie pełna (80+). Zsynchronizuj wkrótce." 100 pending → red banner + block message "Kolejka pełna. Nowe operacje zablokowane do czasu synchronizacji."

---

### 3.22 SCN-settings — Scanner Settings

**Route:** `/scanner/settings`
**Purpose:** Per-user scanner preferences. Accessible from the topbar overflow menu (⋮).

**Layout:** Standard settings list with section headers and toggle/select rows.

**Sekcja: Powiadomienia**
- Dźwięki skanera: toggle on/off.
- Wibracje: toggle on/off.
- Dźwięk sukcesu: toggle. (sub-item, indent)
- Dźwięk błędu: toggle.
- Dźwięk ostrzeżenia: toggle.

**Sekcja: Skanowanie**
- Auto-advance po skanie: toggle (300 ms auto-step when on).
- Preferowany tryb skanu: segmented [Hardware / Kamera / Ręczny].
- Timeout kamery (s): numeric input, default 30.
- Flesz kamery: toggle.

**Sekcja: Sesja**
- Tryb urządzenia: display only (Kiosk / Personal — set by admin). "Zmień" button greyed if kiosk-only.
- Timeout sesji: display only "300 s (skonfigurowane przez administratora)."
- Aktywna sesja: display "Linia A · Zmiana ranna · Zalogowano: 09:41."

**Sekcja: Bezpieczeństwo**
- Zmień PIN: button → navigates to SCN-011c.
- Ostatnia zmiana PIN: "2026-01-15 (89 dni temu)."

**Sekcja: Język**
- Język interfejsu: select row → language picker bottom sheet (options: Polski, English, Українська, Română).

**Sekcja: Konto**
- Wyloguj: button (red text, `color: #ef4444`) → logout confirm bottom sheet.

Bottom: app version "MonoPilot MES v2.1.0 · Skaner v3.0."

---

### 3.23 SCN-error — Unrecoverable Error

**Route:** `/scanner/error` (or inline full-screen overlay)
**Purpose:** Shown for block-severity errors that cannot be recovered within the current workflow step.

**Layout:** Full-screen, `background: #0f172a`. Centered content (50% vertical centering):

Large error icon (64 px): ✗ or ⚠ depending on error type. Title (22 px bold, red-400): short error summary. Message (15 px, slate-300, centered, max 280 px width): human-readable explanation. Error code (10 px, slate-600, uppercase): "Kod błędu: SC_LP_NOT_FOUND."

Two action buttons (stacked, 50 px each):
1. Primary "Spróbuj ponownie" (blue, if retry is possible).
2. Secondary "Wróć do menu" (slate-700, always available).

Optional: "Zgłoś problem" ghost button (opens an email draft or logs a support ticket — P2).

**Specific error texts:**

| Error code | Title | Message |
|---|---|---|
| SC_LP_NOT_FOUND | "LP nie znaleziony" | "LP '[barcode]' nie istnieje w systemie. Sprawdź etykietę lub użyj wyszukiwania ręcznego." |
| SC_LP_LOCKED | "LP zablokowany" | "LP jest aktualnie używany przez [user] (od [time]). Wygasa za [N]s. Odczekaj lub skontaktuj się z supervisorem." |
| SC_LP_CONSUMED | "LP już skonsumowany" | "Ten LP został w pełni skonsumowany i nie jest dostępny. Wybierz inny LP." |
| SC_LP_QA_HOLD | "LP na wstrzymaniu QA" | "Ten LP jest wstrzymany do inspekcji QA. Nie można wykonać operacji." |
| SC_WO_NOT_IN_PROGRESS | "WO nie jest aktywne" | "Work Order [id] ma status [status]. Konsumpcja możliwa tylko dla WO W TOKU." |
| SC_SESSION_EXPIRED | "Sesja wygasła" | "Twoja sesja wygasła. Zaloguj się ponownie." (Redirect to login on confirm.) |
| SC_INVALID_BARCODE | "Nierozpoznany kod" | "Kod '[barcode]' nie pasuje do żadnego formatu. Sprawdź kod lub wpisz ręcznie." |

---

## 4. Modals and Bottom Sheets

### 4.1 Reason Code Picker

**Trigger:** Any operation requiring a reason code (putaway override, FEFO deviation, partial consume, waste, etc.).

**Type:** Bottom sheet. Handle pill at top. Title row (14 px bold, left-aligned). List of reason options (each 52 px row, radio-button left, reason text 14 px right). Optionally: free-text area (3 rows) appears after selecting "Inny powód / Other." Full-width "Potwierdź" button (50 px). Full-width ghost "Anuluj" button.

**Dismiss behaviour:** Swipe down or tap overlay dismisses without selecting (cancels the override).

---

### 4.2 FEFO Deviation Confirm

**Trigger:** Scanning a non-FEFO-compliant LP in pick or consume.

**Type:** Bottom sheet (critical variant, amber tint on handle area).

**Content:** "ODCHYLENIE FEFO" header. Two LP comparison cards side-by-side: left "SUGESTIA FEFO" (green border, expiry date, green-400 text), right "WYBRANY LP" (amber border, expiry date, amber-400 text). Reason code dropdown (full-width). Confirm (amber, "Potwierdź z wybranym LP") + "Użyj FEFO" ghost button. Tapping "Użyj FEFO" dismisses the sheet and populates the scan input with the suggested LP barcode.

**Cannot be bypassed without reason code.** Confirm button disabled until reason is selected.

---

### 4.3 Qty Entry Keypad

**Trigger:** Tapping any qty field that uses the numpad, or tapping "Wpisz ręcznie" on any scan step.

**Type:** Bottom sheet (half-screen). Large display showing current value (28 px bold, Courier New, center). 3×4 numpad grid (keys 64 px). Decimal point key (for catch weight). Backspace. Full-width "Zatwierdź" button (50 px). Current value constraint hint: "Maks: [X] [uom]" shown below the display.

---

### 4.4 Batch/Expiry Entry

**Trigger:** Batch or expiry date fields when camera or hardware scan doesn't auto-fill them.

**Type:** Inline (within the scan form, not a bottom sheet). Two stacked fields: batch text input + expiry date input (numeric soft keyboard). Best-before/use-by label appears next to expiry based on product policy. This is not a separate modal but part of the form layout.

---

### 4.5 Partial Consume Warning

**Trigger:** Operator taps "Wyrób gotowy" (SCN-082) or confirms output when BOM is not fully consumed.

**Type:** Bottom sheet (amber).

**Content:** Amber warning icon ⚠ (28 px). Title "Niepełna konsumpcja materiałów." List of under-consumed materials: each row shows material name, consumed qty, required qty, deficit quantity in red. Reason code dropdown (mandatory): reasons include — "Planowa różnica (oversized batch)", "Materiał niedostępny — uzupełnione później", "Zmiana receptury", "Inny powód." Two buttons: amber "Kontynuuj z audytem" (saves reason to audit log, proceeds to output) + ghost "Anuluj" (returns to SCN-081).

---

### 4.6 Pallet Override

**Trigger:** Operator enters a different pallet than the suggested one (receive flow).

**Type:** Inline amber warn-banner (not a separate bottom sheet). Shows: "Inna paleta niż sugestia. Kontynuuj?" + "Potwierdź" small button.

---

### 4.7 Use-by Blocked Alert (Hard Block)

**Trigger:** LP's use_by date is today or in the past.

**Type:** Full-screen error overlay (see SCN-error 3.23 pattern with red background). No reason code, no bypass. Only action: "Skanuj inny LP" or "Wróć do menu." Supervisor override is not available in scanner P1 for use_by blocks.

**Content:** Error title "LP po dacie USE BY — konsumpcja niemożliwa." Message: "Ten LP wygasł [N] dni temu (use_by: [date]). Wybierz inny LP z magazynu lub skontaktuj się z supervisorem." Error code "SC_LP_USE_BY_EXPIRED."

---

### 4.8 Best-before Warning (Pass-through)

**Trigger:** LP's best_before date is within `best_before_warning_days` (admin config, default 7 days) of today.

**Type:** Bottom sheet (amber, smaller than FEFO sheet).

**Content:** Amber icon ⚠. "DATA BEST BEFORE" header. "Ten LP zbliża się do daty best_before: [date] (za [N] dni)." Reason code dropdown (mandatory). Two buttons: "Kontynuuj" (amber, proceeds) + "Użyj innego LP" (dismisses, returns to scan input). This is a `warn` severity — operator can always proceed with reason.

---

### 4.9 Printer Picker (P2)

**Trigger:** After output or co-product success, when label print is triggered.

**Type:** Bottom sheet. Title "Wybierz drukarkę." List of available printers (each 52 px row): printer name, IP/zone, status (online green dot / offline gray dot). "Wydrukuj na wybranej" primary button. The printer picker is P2 (label printing from scanner is deferred). P1: info banner "Drukowanie etykiet z skanera dostępne w P2. Wydrukuj z pulpitu." with a ghost "Pomiń" button.

---

### 4.10 Language Picker

**Trigger:** Tapping language row in SCN-settings.

**Type:** Bottom sheet. Title "Język interfejsu." Four options (each 52 px row, radio button + flag emoji + language name): 🇵🇱 Polski, 🇬🇧 English, 🇺🇦 Українська, 🇷🇴 Română. "Zastosuj" primary button. Change takes effect immediately (re-renders all UI strings). Stored to `localStorage.scanner_language` + synced to `users.preferred_language` on next API call.

---

### 4.11 Logout Confirm

**Trigger:** Tapping "Wyloguj" in SCN-settings or session timeout warning.

**Type:** Bottom sheet (compact). Title "Wylogować się?" Message "Twoja sesja zostanie zakończona. Niezapisane operacje mogą zostać utracone (P1 — brak offline queue)." Two buttons: red "Wyloguj" (50 px) + ghost "Anuluj."

---

### 4.12 Sync Conflict Resolution (P2)

**Trigger:** API returns 409 conflict during queue sync.

**Type:** Bottom sheet (expanded, scrollable). Title "Konflikt synchronizacji." Operation card showing: type icon, description, original timestamp. Conflict detail: "Operacja zakończyła się konfliktem: [SC_LP_CONSUMED / SC_QTY_EXCEEDS_AVAILABLE / etc.]." Server's current state is shown: "Stan serwera: LP-00234 qty=0 (skonsumowany przez Jan K. o 14:32)." Two buttons: blue "Ponów z nowymi danymi" (navigates to the original workflow screen pre-filled with operation context, letting operator re-scan fresh data) + red "Usuń operację" (discards from queue with audit log entry). Single "Usuń wszystkie błędy" button at bottom of the conflict list view.

---

### 4.13 Offline Mode Indicator

**Trigger:** `navigator.onLine` becomes false (or ping to `/api/health` fails for 2+ consecutive checks).

**Type:** Non-blocking top toast (below topbar, slides down, `background: #431407`, `border: 1px solid #9a3412`, amber-300 text): "Brak połączenia — tryb offline. Skany są kolejkowane. (P2)" or in P1: "Brak połączenia. Skany nie są możliwe. Sprawdź sieć." The toast persists until reconnection. On reconnect: green toast "Połączono. Synchronizacja…" for 3 s.

---

### 4.14 Generic Scan Error (Unknown Barcode)

**Trigger:** Scanned barcode does not match expected type or cannot be looked up.

**Type:** Inline (below the scan input, not a modal). Appears as a red-bordered banner: red-950 bg, red-600 border, red-400 title "Nierozpoznany kod kreskowy", red-200 body text "Kod '[barcode]' nie pasuje do formatu [expected_type]. Sprawdź etykietę i spróbuj ponownie." Two inline link-buttons: "Wpisz ręcznie" + "Zeskanuj ponownie" (clears input). Banner auto-dismisses after 8 s or when the user starts scanning again.

---

### 4.15 Idle Timeout Warning (Personal Mode)

**Trigger:** Session will expire in 30 seconds (personal mode only; kiosk mode has no warning — immediate logout).

**Type:** Bottom sheet (compact, persistent until interacted with). Title "Sesja wygaśnie za 30 s." Countdown timer (28 px bold, center, updates every second). Two buttons: blue "Przedłuż sesję" (refreshes token, dismisses sheet) + ghost "Wyloguj teraz."

---

## 5. Flows (Step-by-step Scan Sequences)

### 5.1 Happy-path Receive Multi-LP (PO 100 kg → 40 + 60 split)

1. **SCN-home** → tap "Przyjęcie PO" → SCN-020-list (loading skeleton, then list appears).
2. **SCN-020-list** → hardware-wedge scan of PO barcode "PO-2026-0018" → API lookup returns PO record → auto-navigate to **SCN-020-lines**.
3. **SCN-020-lines** → list shows one line: "Wiśniowy jogurt 150g, zamówiono: 100 kg, odebrano: 0 kg, remaining: 100 kg." Tap the line → **SCN-020-item** (step indicator at step 1).
4. **SCN-020-item step 1** → scan supplier GS1-128 barcode → parser extracts GTIN 10012345678902, batch "B20260410", expiry "2026-07-01" → product lookup succeeds → mini-grid appears → green flash on input → auto-advance to step 2 (300 ms).
5. **SCN-020-item step 2** → batch pre-filled "B20260410", expiry pre-filled "2026-07-01." Operator verifies (no changes needed) → tap qty field → numpad appears.
6. **SCN-020-item step 3** → operator enters 40 (kg) → remaining hint updates to "Pozostało po tej paczce: 60 kg."
7. **SCN-020-item step 4** → operator scans location "LOC-A-04-01" → location validated → quick-location buttons visible as alternative.
8. **Bottom bar** → tap "Zatwierdź przyjęcie" → API call `POST /api/warehouse/scanner/receive-po-line` with `client_operation_id` → success → navigate to **SCN-020-done** (LP-00567 created, 40 kg).
9. **SCN-020-done** → tap "Następna pozycja PO" → returns to **SCN-020-lines** → same line still shown (60 kg remaining). Tap line again → **SCN-020-item** (all fields reset).
10. **SCN-020-item (second pass)** → scan same GS1 barcode → batch + expiry auto-fill again → qty: 60 → same location scan → confirm → **SCN-020-done** (LP-00568 created, 60 kg). Two LP cards shown side by side.
11. **SCN-020-done** → tap "Wróć do listy PO" → PO line now shows 100/100 kg (100%, green circle). Session complete.

**Branch: best_before warning in step 6:** Operator enters expiry within warning threshold → amber bottom sheet appears → reason selected "Akceptuję: produkty nadal do sprzedaży" → tap "Przyjmij i kontynuuj" → flow resumes normally.

**Branch: over-receipt in step 6:** Operator enters 110 → amber banner "Ilość przekracza zamówioną (100 kg). Nadwyżka: 10 kg. Kontynuować?" → tap "Potwierdź nadwyżkę" → flow continues with over-receipt logged.

---

### 5.2 Happy-path Putaway

1. **SCN-home** → tap "Putaway" → **SCN-040-scan**.
2. **SCN-040-scan** → scan LP "LP-00567" → API call `suggest/LP-00567` → LP details mini-grid appears (40 kg, batch B20260410, expiry 2026-07-01, no location) → button "Sprawdź sugestię" becomes active.
3. Tap button → **SCN-040-suggest** → suggestion card shows "LOC-B-02-03" (FEFO strategy badge, green) → operator scans "LOC-B-02-03."
4. Scan matches suggestion → green "MATCH" badge flashes on suggestion card → auto-advance 300 ms → **SCN-040-done** (from: none, to: LOC-B-02-03, strategy: FEFO, override: No).

**Branch: override** at step 3 → operator scans "LOC-C-05-01" (different location) → amber warn-banner appears inline → reason dropdown → "Strefa B pełna" selected → tap "Potwierdź z podanego powodu" → **SCN-040-done** (override: Yes — Strefa B pełna).

---

### 5.3 Pick with FEFO Deviation (warn + reason → confirm)

1. **SCN-home** → tap "Pick dla WO" → **SCN-050-wo-list**.
2. Tap WO "WO-2025-0142" → **SCN-050-list** (BOM lines sorted by location, next chip "NASTĘPNY: Śmietana 36% w LOC-A-02-01").
3. Tap next item row or chip → **SCN-050-scan** (step 1: Lokalizacja).
4. Step 1: scan "LOC-A-02-01" → green flash → step 2: Scan LP.
5. Step 2: FEFO suggestion card shows LP-00245 (expiry 2026-05-01). Operator scans LP-00287 (expiry 2026-06-15) instead.
6. FEFO deviation bottom sheet slides up: LP-00245 (green left) vs LP-00287 (amber right). Reason dropdown → operator selects "LP sugestii uszkodzony" → tap "Potwierdź z wybranym LP."
7. Deviation confirmed → step 3: qty input → operator enters 4 kg → "Zatwierdź" → API call with `fefo_deviation: true, reason_code: 'damaged_suggested'` → success → **SCN-050-done**.
8. Progress updates to 3/4. Next chip shown. Tap "Następna pozycja" → repeat.

---

### 5.4 Consume with use_by Blocked (hard block → end)

1. **SCN-081 execute** → tap "Skanuj komponent" → **SCN-080-scan** step 1.
2. Operator scans LP-00301 (expired use_by: 2026-04-18, today is 2026-04-20).
3. Step 2 (validation): use_by check fires → hard block full-screen overlay: "LP PO DACIE USE BY — konsumpcja niemożliwa. use_by: 2026-04-18 (2 dni temu)." Buttons: "Skanuj inny LP" + "Wróć do WO."
4. Operator taps "Skanuj inny LP" → returns to step 1 scan input (LP-00301 cleared).
5. Operator scans LP-00302 (expiry 2026-07-15, fine) → proceeds normally through steps 2 and 3.

---

### 5.5 Consume with best_before (warn → proceed)

1. **SCN-080-scan** step 1 → operator scans LP-00303 (best_before: 2026-04-24, 4 days away, threshold is 7 days).
2. Step 2: best_before warning bottom sheet: "Produkt zbliża się do daty best_before: 2026-04-24 (za 4 dni)." Reason dropdown: operator selects "Planowe zużycie — produkt w dobrej jakości." Tap "Kontynuuj."
3. Step 3: qty input → enter qty → confirm → success.

---

### 5.6 Register Output → to_stock → (Label P2)

1. **SCN-081 execute** → tap "Wyrób gotowy."
2. If BOM incomplete → partial consume warn bottom sheet → operator selects reason "Materiał niedostępny" → tap "Kontynuuj z audytem."
3. **SCN-082 output** step 1: qty = 320 (auto-filled from remaining planned). Yield: 64% (amber colour). Operator accepts.
4. Step 2: batch "BATCH-2026-A01" entered manually. Expiry "2026-09-01." No pallet selected.
5. Step 3: scan location "LOC-FA-01-01." Catch weight not applicable.
6. Step 4 confirm summary → tap "Zatwierdź rejestrację." API call `POST /api/production/scanner/output` → new LP "LP-FA-0892" created.
7. **SCN-082-done**: green LP card "LP-FA-0892 · 320 kg · BATCH-2026-A01 · 2026-09-01." Info banner "LP w magazynie: LOC-FA-01-01 (to_stock)." P1: no label print trigger. P2: printer picker bottom sheet would appear here.
8. Tap "Wróć do WO" → **SCN-081**.

---

### 5.7 LP Inquiry (scan → detail → back)

The scanner does not have a dedicated inquiry workflow in P1. Inquiry is available inline via the LP details mini-grid on any scan step. Operator can scan an LP on the **SCN-031 Move** screen as a proxy inquiry (without completing the move). The mini-grid shows: product, qty, batch, expiry, location, status badge, reservation status (reserved / available). Operator reads the info and taps back without confirming the move.

A dedicated `/scanner/inquiry` screen is a P2 feature (SCN-inquiry). Spec note for designer: the P2 inquiry screen follows the same mini-grid pattern with expanded genealogy link showing parent WOs, child LPs, and traceability chain.

**P2 inquiry screen layout (for prototype preview only):** Topbar "Inspekcja LP." Scan input at top "Skanuj dowolny LP…". After scan: full LP detail card (8-cell `mini-grid` 2×4): Product, SKU, Batch/Lot, Expiry date, Qty available, Location, Status, QA status. Below: genealogy section (collapsible "Historia LP"): list of events (received → picked → consumed → output) with timestamps and user names. Link to parent WO (if applicable) and child LPs. "Drukuj etykietę" ghost button (P2 only). Back button only — no confirm action needed on inquiry.

### 5.9 QC Batch Inspection (list → inspect → next → inspect → done)

1. **SCN-home** → tap "Inspekcja QC" (badge "5") → **SCN-070-qa-list** (5 pending items, sorted by urgency — red dots first).
2. Operator scans first LP "LP-00301" (red dot, 4 days waiting) → matched in list → "Rozpocznij inspekcję" button activates → tap button → **SCN-071-qa-inspect**.
3. LP card shows: Serek waniliowy 250g, 200 kg, Batch B20260310, Expiry 2026-06-30, Location LOC-QA-01, WO-2025-0138, Age "4 dni." Optional notes field (empty). Big-3 buttons visible.
4. Operator adds note "Opakowanie lekko uszkodzone — sprawdzić" then taps ⏸ HOLD (amber).
5. API call: `POST /api/quality/scanner/inspect` → `{result: 'hold', notes: "Opakowanie..."}` → success → navigate **SCN-073-qa-done** (hold state: amber icon ⏸, "Partia wstrzymana", LP badge "WSTRZYMANE").
6. Counter: "Wykonano dziś: 1 inspekcja."
7. Tap "Następna inspekcja" → **SCN-070-qa-list** (4 remaining). Tap next LP row → **SCN-071** → PASS → **SCN-073** (green). Counter: 2.
8. Repeat for remaining 3. Last item: FAIL → **SCN-072-qa-fail-reason** → select "Zanieczyszczenie" → notes "Widoczna pleśń" → "Utwórz NCR i zapisz" → NCR-2026-043 created → **SCN-073** (red, "Partia odrzucona", NCR card shown).
9. Counter: 5. All inspections complete. Tap "Wróć do menu" → **SCN-home** (badge "Inspekcja QC" now shows "0").

---

### 5.8 Offline Receive → Queue → Sync → Conflict Resolution (P2)

This flow is Phase 2 and the designer should show the states but they are not interactive in the P1 prototype.

1. Connection drops → offline toast slides down → QUEUED badge appears in topbar (amber).
2. Operator attempts GRN receive in SCN-020-item → after step 4 confirm, instead of API call, the operation is written to IndexedDB `scanner-queue` with status `queued`. A green inline banner "Operacja dodana do kolejki (tryb offline)." Success micro-animation. Operator continues workflow as if online.
3. Operator returns to **SCN-090-queue** → sees 1 queued operation row. "Sync teraz" button available.
4. Connection restored → online toast → automatic sync begins → operation row shows spinner (status `syncing`) → success → row turns green and fades out (auto-removed after 3 s).
5. **Conflict case:** LP was consumed by another operator during offline window → sync returns 409 `SC_LP_CONSUMED` → row turns red → conflict resolution bottom sheet (see 4.12).
6. Operator taps "Ponów z nowymi danymi" → pre-filled receive form opens with original PO context → operator re-scans a different LP → completes operation fresh.

---

## 6. Empty/Zero/Onboarding States

### 6.1 First-time Operator Onboarding

**Sequence on very first login:**

1. **SCN-010 login** → credentials verified → API returns `pin_setup_required: true`.
2. Redirect to **SCN-011b PIN Setup** → blue info banner "Witaj w MonoPilot Scanner! Skonfiguruj swój PIN aby szybko logować się w przyszłości." Step 1: set PIN. Step 2: confirm PIN. Success banner "PIN ustawiony."
3. Redirect to **SCN-012 site-select** → no pre-selected context (all cards unselected). Operator must choose site + line + shift.
4. First entry to **SCN-home** → blue info banner (dismissible) "Pierwsze logowanie. Wybierz workflow, aby rozpocząć pracę." Dismisses after 5 s or on first menu tap.

### 6.2 Permission Prompts

**Camera permission:** On first tap of "Skanuj aparatem" button on any scan screen → browser permission prompt fires. If denied → `Permission denied` overlay appears on the camera viewfinder (see 1.5). App gracefully falls back to manual entry. Preference remembered in `localStorage.scanner_camera_denied = true` (hides camera button until user manually re-enables in settings).

**Vibration/audio:** No explicit prompt — Web Audio API and Vibration API are used silently. Settings are on by default. User can turn off in SCN-settings.

**Device mode prompt:** On first SCN-012 entry, if `lines.device_mode = 'both'` (admin allows either), a bottom sheet appears: "Tę sesję używasz jako kiosk (auto-wylogowanie po każdej operacji) czy urządzenie osobiste (dłuższa sesja)?" Two buttons: "Kiosk 60s" + "Osobiste 300s."

### 6.3 Empty States per Screen

| Screen | Empty state message |
|---|---|
| SCN-020-list (no pending POs) | "Brak oczekujących zamówień zakupu dla tego zakładu." + "Odśwież" button |
| SCN-030-list (no pending TOs) | "Brak transferów do odbioru." |
| SCN-050-wo-list (no WOs) | "Brak aktywnych Work Orders dla tej linii. Skontaktuj się z planistą." |
| SCN-080-wo-list (no active WOs) | "Brak aktywnych WO. Czekaj na zwolnienie WO przez planistę." |
| SCN-070-qa-list (no pending) | "Brak oczekujących inspekcji QC. Świetna robota!" (green info) |
| SCN-090-queue (no items) | "Kolejka pusta. Wszystkie operacje zsynchronizowane." (green info) |

---

## 7. Notifications, Toasts, Sound, and Haptic

### 7.1 Toast System

Toasts appear at the **top of the content area** (below the topbar), sliding down. They are 44 px height, full-width minus 16 px margins, `border-radius: 10px`. Auto-dismiss after the specified duration unless marked persistent. Stacked if multiple toasts occur within 3 s (max 3 visible, older ones fade out).

| Event | Toast colour | Text | Duration | Sound | Haptic |
|---|---|---|---|---|---|
| Scan success (any step) | green-950 bg, green-600 border | "✓ [barcode] — zeskanowano" | 2 s | 500 ms 800 Hz | 100 ms |
| LP details loaded | blue-950 bg | "[LP-number] — [product] · [qty]" | 3 s | None | None |
| Operation complete | green-950 | "Operacja zakończona pomyślnie." | 3 s | 500 ms 800 Hz | 100 ms |
| FEFO deviation logged | amber-950 | "Odchylenie FEFO zalogowane." | 4 s | 300 ms 600 Hz | 300 ms |
| Best-before warning | amber-950 | "Best-before za [N] dni — zweryfikuj." | Persistent (until ack) | 300 ms 600 Hz | 300 ms |
| Scan error | red-950 | "✗ Błąd: [error_message]" | 6 s | 2× 200 ms 400 Hz | 2× 100 ms |
| Session expiry warning | amber-950 | "Sesja wygaśnie za 30 s — [Przedłuż]" | Persistent | 300 ms 600 Hz | 300 ms |
| Offline detected | amber-950 | "Brak połączenia — skany wstrzymane." | Persistent | None | 300 ms |
| Reconnected | green-950 | "Połączono z siecią." | 3 s | Ascending 2-note | 100 ms |
| Sync complete | green-950 | "✓ [N] operacji zsynchronizowanych." | 4 s | Ascending 2-note | 100 ms |
| Sync failed | red-950 | "Synchronizacja nieudana. Sprawdź kolejkę." | Persistent | 3× 200 ms 300 Hz | 500 ms |
| Queue 80% full | amber-950 | "Kolejka prawie pełna (80/100). Zsynchronizuj." | Persistent | None | 300 ms |
| Queue full (100) | red-950 | "Kolejka pełna. Zablokowano nowe operacje." | Persistent | 3× 200 ms 300 Hz | 500 ms |
| LP lock conflict | amber-950 | "LP zablokowany przez [user]. Za [N]s." | Persistent | 200 ms 200 Hz | Pulse 3× |

### 7.2 Kiosk Mode Auto-logout Toast

In kiosk mode, no idle timeout warning is shown (per D7). Instead, 3 seconds after a successful operation's done screen, a countdown chip appears at the bottom: "Automatyczne wylogowanie za 3s…" (counts to 0). On reaching 0: session ends, screen transitions directly to SCN-010 login (back button is not shown, no confirmation).

---

## 8. Responsive and Device Notes

### 8.1 Primary: Portrait Handheld (360–430 px)

All layouts in this spec are designed for 390 px width (iPhone 14 reference). Minimum viable width: 360 px. At 360 px: the 2-column grids (split result, pick progress) compress gracefully — columns minimum 140 px each with 8 px gap. The 3-column numpad maintains 64 px key height at all widths ≥ 320 px.

Touch targets: all interactive elements maintain ≥ 48 px height. Scan input maintains 50 px minimum. Bottom action bar stays at 64 px (56 px content + 8 px padding) regardless of width.

Device pixel ratio: all icon/emoji sizes are specified in dp (device-independent pixels). The prototype uses px values that map 1:1 to dp at 1× density.

### 8.2 Tablet Cradle Landscape (768+)

When width ≥ 768 px (tablet or kiosk cradle), the scanner layout adapts:

- The main content area centers at max-width 480 px with auto side margins.
- A left column (200 px) shows a simplified workflow navigation (current step in the workflow only — not the full home menu). This column has `background: #1e293b`, `border-right: 1px solid #334155`.
- The scan input, mini-grid, and action buttons remain in the right main column.
- Bottom action bar becomes a right-column-only bar (not full screen width).
- QA big-3 buttons stack horizontally on landscape (3 columns, each 1/3 width, 80 dp height maintained).

Tablet landscape is primarily the kiosk use case (Samsung Tab Active3). The kiosk idle timeout (60 s) countdown is shown as a progress arc around the user avatar in the home screen when the device is in tablet mode.

### 8.3 Ruggedized Zebra/Honeywell Keypad Devices

Zebra TC52/MC3300 and Honeywell CK65 have physical keypads. Key mapping:

| Physical key | Scanner action |
|---|---|
| Hardware scan trigger (side button) | Trigger camera scan (if camera mode active) or focus scan input |
| Enter / Green key | Confirm / Submit (equivalent to bottom bar primary button) |
| Back / Escape | Navigate back (equivalent to topbar back button) |
| Function key + numeric | Numpad input (for qty entry) |

The `inputMode="none"` on scan inputs prevents the soft keyboard from appearing on these devices. When the hardware scan trigger fires, the device sends a burst of HID keystrokes to the focused input field, terminated by Enter.

On Zebra devices, DataWedge profile "MonoPilot" should be configured: Code128 decode enabled, GS1-128 enabled, output via Keystroke Output, Enter key postfix, scan timeout 3 s. The scanner app does not manage DataWedge directly; it relies on the wedge output appearing as keyboard input.

Auto-detect heuristic: if `navigator.userAgent` matches `/Zebra|Datalogic|Honeywell/i`, the app sets `hardware: true` in capabilities and hides the "Skanuj aparatem" camera button. Hardware wedge is the assumed primary input method.

### 8.4 iOS Safari Specific

On iPhone/iPad with iOS 17+, `BarcodeDetector` API is available as a fast-path over `@zxing/browser`. The app detects this via `'BarcodeDetector' in window` and uses it for Code128 scanning. `@zxing/browser` is loaded lazily as fallback.

PWA installation on iOS requires the "Add to Home Screen" gesture from Safari. The app shows an install prompt only on first visit on iOS: a bottom sheet "Dodaj MonoPilot do ekranu głównego → Safari → Udostępnij → Do ekranu głównego" with a diagram. This prompt is dismissible and not shown again if dismissed once (stored `localStorage.install_prompt_dismissed = true`).

On iOS, `Vibration API` is not available. The app detects this and shows only audio feedback. The haptic toggle in settings is hidden (or shown as read-only "Niedostępne na iOS").

---

## 9. Open Questions for Designer

The following ambiguities in the PRD remain open for the designer to flag or resolve before finalising interactive prototypes:

| ID | Question | Impact on design | Suggested default |
|---|---|---|---|
| OQ-SC-01 | Card scan on SCN-010 login — what format? NFC (tap) / barcode (scan) / QR code? | Determines whether the "scan badge" input is a standard scan field or an NFC tap zone with different visual affordance | Show as standard scan input (Code 128 / QR capable); NFC variant is a future enhancement |
| OQ-SC-02 | Shift enforcement — can operator start outside declared shift hours? `strict` vs `loose` | Determines whether the amber shift warning in SCN-012 blocks or is merely informational | Design both: `loose` = amber warn only; `strict` = hard block + supervisor override button |
| OQ-SC-03 | Biometric (Touch ID / Face ID) as PIN alternative — P1 or P2? | If P1, SCN-011 needs a biometric button and a permissions flow | Show greyed biometric button with "P2" label in prototype |
| OQ-SC-04 | Label printing from scanner — P2 confirmed. Show printer picker in prototype or omit? | If shown (P2 preview), adds a step to output and co-product done screens | Show printer picker bottom sheet in prototype with "P2" badge, but skip it in the happy-path P1 flow |
| OQ-SC-06 | Language per user vs per site — can a Polish operator on an English-configured site use Polish? | Determines whether the language picker in settings shows all options or is restricted by site config | Show all 4 languages always (per-user override) |
| OQ-SC-07 | Hardware wedge + camera both active simultaneously — first-to-scan wins? Or is one disabled when the other is active? | If parallel: UI must handle both inputs simultaneously. If exclusive: mode switch button needed | Design as exclusive (one active at a time); toggle button "Przełącz tryb skanowania" in scan input area |
| PWA-01 | Service worker caching strategy — should the designer prototype an "update available" banner? | Minor UI addition: top banner "Aktualizacja dostępna — odśwież" | Include as a low-priority stub; blue info banner |
| KIOSK-01 | Kiosk auto-logout — should the done screen show a 3 s countdown chip, or instant logout? | 3 s chip gives operator a moment to read the LP number; instant logout is harsher | Design with 3 s countdown chip as described in §7.2 |
| USE_BY-01 | Supervisor override for use_by blocks on scanner — allowed or not in P1? | If allowed: supervisor role can bypass use_by block in SCN-080-scan; adds a "Supervisor override" button path | P1: no override (hard block only); P2: supervisor override with reason + dual-auth |
| AUDIT-01 | Is the `scanner_audit_log` used to drive any visible UI in the scanner itself (history, recent scans)? | If yes, a "Recent scans" section could appear on SCN-home or a dedicated history screen | P1: no history screen; recent scan data is server-only. Designer should not add this surface |

---

## 10. Scan Contract Reference

This section provides a consolidated barcode scan contract table. Every scan step in every workflow is listed, specifying: the barcode type expected, the Code 128 / GS1-128 format, the API lookup endpoint used, and what success/fail response triggers.

### 10.1 Consolidated Scan Step Table

| Workflow | Step | Expected type | Format | Lookup endpoint | Success trigger | Fail trigger |
|---|---|---|---|---|---|---|
| SCN-010 Login | Badge scan | Employee ID | Code 128 | `POST /api/scanner/login` (username from barcode) | Auto-fill username, prompt PIN | Red banner "Karta nie rozpoznana" |
| SCN-020 PO | Step 1: Scan PO | Purchase Order | Code 128 prefix "PO" | `GET /api/scanner/lookup/po/:barcode` | Navigate to PO lines | Red "PO nie znalezione" |
| SCN-020 PO item | Step 1: Scan product | Product / GS1 | GS1-128 AI 01+10+17 or Code 128 | `GET /api/scanner/lookup/product/auto` | Extract GTIN, batch, expiry | Red "Produkt nie znaleziony w katalogu" |
| SCN-020 PO item | Step 4: Scan location | Location | Code 128 prefix "LOC" | `GET /api/scanner/lookup/location/:barcode` | Fill location field | Red "Lokalizacja nie istnieje" |
| SCN-030 TO | TO scan | Transfer Order | Code 128 prefix "TO" | `GET /api/scanner/lookup/to/:barcode` | Navigate to TO lines | Red "TO nie znaleziony" |
| SCN-030 TO scan | LP confirm | LP barcode | Code 128 prefix "LP" | `GET /api/scanner/lookup/lp/:barcode` | Mark LP ✓ in checklist | Amber "LP nie należy do tego TO" |
| SCN-040 Putaway | LP scan | LP | Code 128 prefix "LP" | `GET /api/scanner/lookup/lp/:barcode` + `GET /api/warehouse/scanner/putaway/suggest/:lpId` | Load LP details + fetch suggestion | Red "LP nie znaleziony" |
| SCN-040 Putaway | Destination scan | Location | Code 128 prefix "LOC" | `GET /api/scanner/lookup/location/:barcode` | Match vs suggestion or trigger override flow | Red "Lokalizacja nie istnieje" |
| SCN-031 Move | LP scan | LP | Code 128 prefix "LP" | `GET /api/scanner/lookup/lp/:barcode` + `POST /api/warehouse/scanner/lock-lp` | Load LP details + acquire lock | Red (not found) / Amber (locked by user) |
| SCN-031 Move | Destination scan | Location | Code 128 prefix "LOC" | `GET /api/scanner/lookup/location/:barcode` | Enable "Przenieś" button | Red "Lokalizacja nie istnieje" |
| SCN-060 Split | LP scan | LP | Code 128 prefix "LP" | `GET /api/scanner/lookup/lp/:barcode` | Load LP + lock | Red (not found) / status error |
| SCN-050 Pick | Location scan (step 1) | Location | Code 128 prefix "LOC" | Client-side match vs BOM line expected location | Green ✓ advance | Amber "Nie ta lokalizacja. Oczekiwano: [expected]" |
| SCN-050 Pick | LP scan (step 2) | LP | Code 128 prefix "LP" | `GET /api/scanner/lookup/lp/:barcode` + FEFO check | Load LP details + FEFO validation | FEFO deviation warn / block errors |
| SCN-080 Consume | LP scan | LP | Code 128 prefix "LP" | `GET /api/scanner/lookup/lp/:barcode` + use_by / best_before check | Load LP details + date policy check | use_by = hard block / best_before = soft warn |
| SCN-082 Output | Location scan | Location | Code 128 prefix "LOC" | `GET /api/scanner/lookup/location/:barcode` | Fill location field | Red "Lokalizacja nie istnieje" |
| SCN-082 Output | Pallet scan (optional) | Pallet | Code 128 prefix "PAL" | `GET /api/scanner/lookup/lp/:barcode` (pallets are LPs) | Fill pallet_id field | Red "Paleta nie znaleziona" |
| SCN-070 QA | LP scan | LP | Code 128 prefix "LP" | `GET /api/scanner/lookup/lp/:barcode` + qa_status check | Load LP + enable inspect | Block if qa_status ≠ pending |

### 10.2 GS1-128 AI Auto-parse Behaviour

When a GS1-128 barcode is scanned on the product receive step (SCN-020-item step 1), the parser extracts all available AIs and auto-fills corresponding form fields:

| AI code | Field auto-filled | Notes |
|---|---|---|
| AI 01 (GTIN-14) | Product lookup key | Check digit validated; if invalid → log warning + still attempt lookup |
| AI 10 (Batch/Lot) | Batch field (step 2) | Normalised to uppercase |
| AI 17 (Expiry YYMMDD) | Expiry date field (step 2) | Y2K: YY < 50 → 20YY, YY ≥ 50 → 19YY |
| AI 21 (Serial) | Stored in metadata only; not displayed | For audit / traceability |
| AI 3103 (Net weight kg) | Catch weight field (shown only if `is_catch_weight`) | Decimal = digits / 10^n where n = 4th digit of AI code |
| AI 3922 (Price) | Not displayed in scanner; passed to API metadata | |
| Unknown AIs | Ignored gracefully; raw value stored to `scanner_audit_log.metadata.unknown_ais` | |

Group Separator (ASCII 29, `\x1d`) is used as delimiter for variable-length AIs. The parser handles both GS-delimited and fixed-length AIs correctly. Missing GS on variable-length AI → parser attempts best-effort parse using known AI length rules.

### 10.3 Input Method Fallback Chain per Step

For every scan step, the three input methods are available in this priority order:

1. **Hardware wedge (primary):** Input field is auto-focused (`autofocus`), `inputMode="none"` prevents soft keyboard. Hardware scan sends keystroke burst + Enter. 300 ms debounce on successive scans.
2. **Camera (secondary):** "Skanuj aparatem" button (camera icon, 44 px) appears below the scan input when `capabilities.camera = true`. Tapping opens the camera viewfinder overlay. On successful decode, barcode value is injected into the scan input and processed identically to hardware scan.
3. **Manual (tertiary):** "Wpisz ręcznie" ghost button appears on every scan step. Tapping switches the `inputMode` to `"text"` or `"numeric"` (depending on expected barcode type) and invokes the platform's soft keyboard. For numeric-only fields (qty), the keypad bottom sheet is used instead of the platform keyboard.

The UI shows method-switch buttons in this order left to right below the scan input area: [📷 Kamera] [⌨ Ręczny]. Hardware wedge requires no button — it is always active when the scan input is focused.

---

## 11. LP State Machine Reference (Scanner Perspective)

The scanner enforces the following LP state transition rules at scan time. These are the states an LP can be in, and which scanner operations are permitted in each state.

| LP Status | Allowed operations (scanner) | Blocked operations | Visual badge |
|---|---|---|---|
| `available` | Putaway, Move, Pick, Consume, Split, QA inspect (if qa_status=pending) | None | Green "Dostępne" |
| `reserved` | Move (with override), Pick (primary use) | Consume (must pick first), Split (with supervisor) | Blue "Zarezerwowane" |
| `qc_pending` | QA inspect only | Move, Pick, Consume, Split | Amber "Oczekuje QA" |
| `hold` | QA inspect (to release hold) | All others — block with "LP na QA Hold" | Yellow "Wstrzymane" |
| `blocked` | QA inspect (to release block) | All others — hard block | Red "Zablokowane" |
| `consumed` | None (read-only inquiry only) | All — block "LP już skonsumowane" | Gray "Skonsumowane" |
| `in_transit` | Receive TO (SCN-030 confirm) | All others | Cyan "W tranzycie" |

**LP lock protocol:** Before any mutation (move, putaway, consume, split), the scanner calls `POST /api/warehouse/scanner/lock-lp` to acquire a 5-minute exclusive lock. The lock prevents a second operator from performing a conflicting mutation on the same LP concurrently. The lock is per-LP, not per-user — a single operator can hold locks on multiple LPs simultaneously (e.g. during a split flow that reads source and validates destination). If the lock is already held by another user, the scan fails with `SC_LP_LOCKED` and an amber modal shows who holds the lock and the remaining time. The lock is released automatically after 5 minutes or on `POST /api/warehouse/scanner/release-lock` after a successful operation. If the operation fails (user navigates away), the lock expires naturally at 5 minutes.

**QA hold on consume:** If `lp.qa_status = 'hold'` or `lp.qa_status = 'failed'`, consuming the LP is blocked with `SC_LP_QA_HOLD`. The error screen shows: "LP wstrzymany przez kontrolę jakości. Inspekcja wymagana przed użyciem." with a button "Przejdź do inspekcji QA" (→ SCN-071, pre-loaded with this LP). The button is only shown if the current user has `quality.inspector` role. Otherwise, the error message reads: "Skontaktuj się z inspektorem QA aby zwolnić ten LP."

**Reserved LP on consume:** If LP status is `reserved` (reserved for a different WO), a warn-severity banner is shown: "Ten LP jest zarezerwowany dla WO-[id]. Użyć go dla tego WO? [Tak / Nie]." Selecting Tak proceeds with reason logged to `scanner_audit_log.metadata.reservation_override = true`. This requires `scanner.supervisor` role (operator-level gets a hard block "LP zarezerwowany dla innego WO").

---

## 12. Component CSS Class Reference (for HTML Prototype Generation)

This section maps all UX patterns to their CSS class names from the reference prototype. Designers generating HTML prototypes should use these class names to maintain design system consistency.

| Pattern | CSS class(es) | Notes |
|---|---|---|
| Device frame | `.device` | 390 px width, slate-800 bg, 44 px border-radius, box-shadow |
| Status bar | `.statusbar` | 44 px, flex, slate-900 bg |
| Top app bar | `.topbar` | 56 px, slate-800 bg, border-bottom slate-700 |
| Topbar icon button | `.tbtn` | 44×44 px, 8 px border-radius, transparent bg |
| Topbar title | `.ttitle` | 16 px 600, flex-1 |
| Topbar badge (user/sync) | `.tbadge` | 10 px, slate-900 bg, 20 px border-radius |
| Content scroll area | `.content` | flex-1, overflow-y auto |
| Section header (menu) | `.msection` | 10 px, 700, uppercase, slate-600 |
| Menu item row | `.mitem` | 68 px height, flex, pseudo ::after separator |
| Menu icon container | `.micon` | 46×46 px, 13 px border-radius |
| Menu icon variants | `.micon-blue` `.micon-green` `.micon-amber` `.micon-purple` `.micon-cyan` `.micon-red` | Each has specific dark bg |
| Menu title | `.mtitle` | 14 px 600 |
| Menu description | `.mdesc` | 11 px, slate-500 |
| Menu badge (count) | `.mbadge` | blue-500 bg, white, 10 px 700, 12 px border-radius |
| List item row | `.litem` | flex, 12 16 padding, border-bottom separator |
| List icon box | `.licon` | 42×42 px, 10 px border-radius, slate-800 bg |
| List info block | `.linfo` | flex-1, min-width 0 |
| List title | `.ltitle` | 13 px 600 |
| List subtitle | `.lsub` | 11 px, slate-500 |
| List chevron | `.lchev` | 18 px, slate-700 |
| Status badge | `.status` | flex, 3px 9px, 20 px border-radius, 11 px 600, with ::before dot |
| Status variants | `.st-planned` `.st-released` `.st-inprog` `.st-onhold` `.st-done` | Per §1.4 color semantics |
| WO card | `.wo-card` | slate-800 bg, 12 px border-radius, 16 px padding, 12 16 margin |
| WO meta grid | `.wo-meta` | 2-col grid, 6 px gap |
| WO meta cell | `.wm` | slate-900 bg, 8 px border-radius, 8 10 padding |
| WO meta label | `.wm-label` | 10 px, slate-600 |
| WO meta value | `.wm-val` | 13 px 600 |
| Progress bar wrap | `.pbar-wrap` | 0 16 padding |
| Progress bar track | `.pbar` | 4 px height, slate-800 bg, 2 px border-radius |
| Progress bar fill | `.pbar-fill` | height 100%, border-radius 2 px, transition width .3 s |
| Tabs bar | `.tabs` | flex, slate-800 bg, border-bottom |
| Tab | `.tab` | flex-1, 11 8 padding, 12 px 600, slate-500, border-bottom 2 px transparent |
| Tab active | `.tab.on` | blue-500 color + border-bottom |
| Component row (BOM) | `.crow` | flex, 10 16 padding, border-bottom |
| Component check | `.ccheck` | 30×30 px circle, 13 px 700 |
| Check ok | `.cck-ok` | green-950 bg, green-400 color |
| Check warn | `.cck-warn` | amber-950 bg, orange-400 color |
| Check empty | `.cck-empty` | slate-800 bg, slate-700 color, 2 px dashed border |
| Scanned row | `.srow` | flex, 10 16 padding, border-bottom |
| Scanned qty | `.sqty` | 13 px 700, green-400 |
| Scan input area | `.sinput-area` | 14 16 padding, slate-800 bg, border-bottom |
| Scan input field | `.sinput` | 100% width, slate-900 bg, 2 px solid blue-500 border, 10 px border-radius, 13 16 padding, 16 px, center-aligned |
| Scan hint | `.shint` | center, 11 px, slate-700, margin-top 5 |
| Warn banner | `.warn-banner` | amber-950 bg, amber-700 border, 10 px border-radius, 11 13 padding, flex gap 10 |
| Info banner | `.info-banner` | blue-950 bg, blue-700 border, same dimensions |
| Banner icon | `.banner-icon` | 18 px, flex-shrink 0 |
| Banner title | `.banner-title` | 12 px 700; amber-300 (warn) / blue-300 (info) |
| Banner text | `.banner-text` | 11 px line-height 1.5; amber-100 / blue-100 |
| Next suggestion | `.next-sug` | cyan-900 bg, cyan-700 border, 10 14 padding, flex |
| Next sug label | `.nlabel` | 10 px, cyan-300, uppercase |
| Next sug name | `.nname` | 13 px 600, cyan-50 |
| Button row | `.brow` | grid, 8 px gap, 12 16 padding |
| Button base | `.btn` | 50 px height, 10 px border-radius, 14 px 600, flex center |
| Button primary (blue) | `.btn-p` | blue-500 bg, white |
| Button success (green) | `.btn-s` | green-600 bg, white |
| Button violet (co-product) | `.btn-v` | violet-700 bg, white |
| Button warn (amber/waste) | `.btn-w` | amber-600 bg, white |
| Button secondary | `.btn-sec` | slate-800 bg, slate-300, slate-700 border |
| Button ghost | `.btn-ghost` | transparent, slate-500, 40 px height |
| Button small | `.btn-sm` | 40 px height, 12 px |
| Form group | `.fgroup` | 12 16 padding, border-bottom |
| Form label | `.flabel` | 11 px, slate-500, 600, uppercase |
| Required asterisk | `.req` | red-500 |
| Form input | `.finput` | slate-900 bg, slate-700 border, 8 px border-radius, 10 14 padding, 14 px |
| Form input big | `.finput.big` | 24 px, center, 700, letter-spacing 1 |
| Form hint | `.fhint` | 11 px, slate-600, margin-top 4 |
| Mini info grid | `.mini-grid` | slate-800 bg, 10 border-radius, overflow hidden, 10 16 margin |
| Mini row | `.mini-row` | grid 1fr 1fr, border-bottom slate-700 |
| Mini cell | `.mini-cell` | 9 12 padding, border-right slate-700 |
| Mini label | `.mini-label` | 10 px, slate-600 |
| Mini value | `.mini-val` | 12 px 600, slate-100 |
| Steps indicator | `.steps` | flex, gap 5, 12 16 0 padding |
| Step | `.step` | flex-1, 3 px height, 2 px border-radius, slate-800 bg |
| Step done | `.step.done` | green-600 bg |
| Step active | `.step.active` | blue-500 bg |
| LP created card | `.lp-card` | green-950 bg, green-600 border, 12 border-radius, 18 padding, center |
| LP barcode number | `.lp-num` | 26 px 700, green-400, Courier New, letter-spacing 3 |
| LP subtitle | `.lp-sub` | 11 px, green-300 |
| Co-product card | (`.lp-card` variant) | purple-950 bg, violet-600 border; `.lp-num` purple-400 |
| Split grid | `.split-grid` | grid 1fr 1fr, 10 gap, 10 16 padding |
| Split original | `.split-orig` | slate-800 bg, 10 border-radius, 14 padding, center |
| Split new | `.split-new` | green-950 bg, green-600 border, 10 border-radius |
| Split LP number | `.split-lp-num` | 14 px 700, Courier New, letter-spacing 2 |
| Split qty | `.split-qty` | 12 px; slate-400 (orig) / green-300 (new) |
| Success wrap | `.success-wrap` | 40 16 20 padding, center |
| Success icon | `.success-icon` | 64 px emoji, margin-bottom 14 |
| Success title | `.success-title` | 22 px 700, margin-bottom 6 |
| Success subtitle | `.success-sub` | 13 px, slate-500 |
| Search bar | `.sbar` | 10 16 padding, slate-800 bg, border-bottom |
| Search input | `.sinp2` | 100% width, slate-900 bg, slate-700 border, 8 border-radius, 9 14 padding, 13 px |
| Pills row | `.pills` | flex, 6 gap, 8 16 padding, flex-wrap |
| Pill | `.pill` | 4 11 padding, 20 border-radius, 11 px 600; inactive: slate-800 bg, slate-500 |
| Pill active | `.pill.on` | blue-950 bg, blue-400 text, blue-700 border |

---

_06-SCANNER-P1 UX Specification v1.0 — 9 major SCN codes, ~34 sub-screens, 11 workflows, 5 scan contract tables, full offline queue surface (P1 stub + P2 full spec), use_by hard block, best_before warn-pass, FEFO deviation pattern, kiosk/personal dual mode, 3-method input parity, LP state machine, complete CSS class reference, 10 open questions, Phase D aligned. Consumer: Claude Design → interactive HTML prototypes. Self-contained: designer builds prototypes from this file alone without reading source PRD._
