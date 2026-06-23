# Scanner overhaul — real barcode capture + input + de-chrome (BACKLOG, owner-requested 2026-06-23)

Owner feedback (2026-06-23, looking at the live `/scanner/move` "Move LP" screen): the scanner
was built for visual fidelity (colors/layout) but key pieces are **non-functional placeholders**.
This is a big dedicated theme. Owner can't do it now — captured here in full.

## What's broken / wrong today
1. **Camera scan does NOT work.** The `[📷 Camera]` button is a dead control — it does not open
   the camera or scan a barcode. (`components/shell/scanner-primitives.tsx` `ScanInputArea` —
   both `scanToolStyle` buttons have NO onClick.)
2. **`[⌨ Manual]` button does NOT work** either — it should focus/raise the manual entry field.
3. **Fake OS status bar should be GONE entirely** — the `09:41` + 📶 🔋 + notch reproduces an
   iPhone status bar. (A de-mock landed in code — `components/shell/scanner-frame.tsx` hides it on
   `max-width:640px` + real clock/online-dot on desktop preview — but it is **not deployed yet**
   because push is blocked; and owner now wants it removed entirely, not just on mobile.) **Reclaim
   that vertical space for the scanner** (e.g. the camera viewfinder / scan field).
4. **Number entry / keypad UX:** instead of an on-screen number pad, owner asks: wouldn't the
   **phone/computer keyboard** work better? The manual field should accept native keyboard input
   directly (with the right `inputmode` per field — numeric for quantities, text for codes).

## Goals (what "done" means)
- **G1 — Real camera barcode scanning in the browser.** Tapping Camera opens a live camera
  viewfinder; when a barcode (GS1-128/EAN/QR/Code128…) enters the frame it is auto-decoded and the
  value fills the active scan field, then the flow advances. No hardware needed beyond the phone camera.
- **G2 — Camera/Manual buttons actually do something.** Camera → open viewfinder (G1). Manual →
  focus the text field + show the native keyboard. If the device has **no camera / permission
  denied**, Camera shows a clear message ("No camera available — enter the code manually") and falls
  back to manual, never a dead button.
- **G3 — Hardware barcode scanner (keyboard-wedge / HID).** A plugged-in USB/Bluetooth scanner
  types the code into the focused field + Enter. The scan field must be auto-focused and a global
  "wedge capture" should route rapid keystroke bursts ending in Enter into the active scan field even
  if focus drifted — so a real warehouse gun "just works".
- **G4 — De-chrome.** Remove the fake status bar/notch entirely; reclaim the space; the app uses the
  device's real OS bar. (The existing de-mock CSS is a partial step — finish it: drop the desktop
  preview chrome too, or make it opt-in dev-only.)
- **G5 — Keyboard-first manual input** with correct `inputmode`/`enterkeyhint` per field.

## Technical approach
- **Barcode decode:** prefer the native **`BarcodeDetector` API** (Chrome/Android, some desktop)
  with a JS fallback (`@zxing/browser` or `quagga2`) for Safari/iOS where BarcodeDetector is absent.
  Feature-detect; bundle the fallback lazily (dynamic import) so it doesn't bloat the main scanner.
- **Camera:** `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })` into a
  `<video>`; run the detector on frames (`requestVideoFrameCallback`/rAF). Handle permission states
  (prompt/denied/unsupported) explicitly with UI. Stop the stream on unmount / after a successful scan.
- **HW wedge:** a document-level keydown listener that buffers fast char sequences (gap < ~50ms)
  terminated by Enter and dispatches them to the active scan field; ignore when a user is typing
  normally (rate/heuristic). Make it a small hook reused by every scan screen.
- **Field UX:** `inputMode="numeric"` + `enterKeyHint="done"` for quantities; `inputMode="text"` for
  codes; autofocus the primary scan field on each screen.
- **Frame:** delete `scanner-frame.tsx`'s notch + status-bar slots (or gate behind a dev flag); the
  content area expands to fill. Keep the contract tests aligned (they assert the slots today —
  rewrite them for the new no-chrome contract).

## Wave breakdown (slices, when scheduled)
- **SCAN-1 — barcode-capture hook** (`useBarcodeScanner`): BarcodeDetector + zxing fallback + the
  HW-wedge keydown capture, as one reusable hook with `{ start, stop, supported, permission }`. Unit-test the wedge buffering + fallback selection.
- **SCAN-2 — camera viewfinder component** (`<ScanCamera>`): getUserMedia + `<video>` + overlay +
  permission/no-camera states + "scanned!" feedback. Wire it into `ScanInputArea` so the Camera
  button opens it and a detected code fills `onSubmit`.
- **SCAN-3 — Manual button + keyboard-first fields:** Manual focuses the field; per-field
  `inputmode`/`enterkeyhint`; autofocus. Replace any on-screen numeric keypad with native keyboard
  where owner prefers.
- **SCAN-4 — de-chrome:** remove the fake status bar/notch, reclaim space, update
  `scanner-frame.tsx` + `scanner-frame.test.tsx` + `shell-contract.test.tsx` + the tokens test.
- **SCAN-5 — wire into every scan screen:** receive-po (PO/line/LP), consume (LP pick), output,
  putaway/move/pick, LP-info, QA — each uses the hook + camera + autofocus consistently.
- **SCAN-6 — verification:** real browser test on a phone (camera scan a printed GS1 label from the
  E1 print feature → fills field → flow advances), HW-scanner test (gun → field), no-camera fallback,
  iOS Safari fallback path.

## Holistic review findings (read-only audit, 2026-06-23)
**Verdict: the scanner logically hangs together end-to-end** (login→site→home→WO start→consume[FEFO]
→output[LP+print]→waste→clock; receive→GRN/LP→print; putaway/move/pick/lp/qa all complete + the data
written at each step matches what downstream reads). De-mock IS in the current code (real clock +
online dot, fake 09:41/signal/battery removed, hidden ≤640px) — the live `09:41` is just the
un-deployed old build. THREE structural gaps + several small ones:

### Goes into the OVERHAUL above (big, owner deferred)
- **[SEV1] Camera + Manual buttons are DEAD** — `components/shell/scanner-primitives.tsx:432-443`,
  no onClick, no camera API anywhere; present on 6+ screens (receive list, putaway, move, lp, qa,
  pick). = G1/G2.
- Native-keyboard vs on-screen keypad inconsistency = G5. HW keyboard-wedge: today only JS autofocus
  (works for a HID gun into the focused field), no dedicated wedge capture = G3.

### Quick-fix batch (small, NOT the camera overhaul — a separate "scanner fixes" wave)
- **[SEV2] Labor clock-in missed `lineId`** — FIXED 2026-06-23 (`wo-execute-screen.tsx:114` now passes
  `session.lineId`; was writing wo_labor_log.line_id=null → broke OEE-per-line).
- **[SEV2] Labor state not hydrated** — `wo-execute-screen.tsx:63` inits 'clocked_out' every mount; no
  `GET /api/scanner/labor?woId=` → nav-away resets buttons, allows double clock-in. FIX: GET + hydrate.
- **[SEV2] QC-hold receive dead-end** — `receive-po-item-screen.tsx:264` shows "QC required" but no
  "Inspect now" button; FIX: deep-link to the QA screen pre-loaded with the LP.
- **[SEV3] Pick tautological phase** — `pick-screen.tsx:131` `setPhase(len===0?'materials':'materials')`.
- **[SEV3] `my_line` WO filter unimplemented** — `wo-list-screen.tsx:83` (should match session.lineId).
- **[SEV3] Receive-PO list scan field no onSubmit** — `receive-po-list-screen.tsx:69` (Enter does nothing).
- **[SEV4] "Consume"/"Output" home tiles** both route to the WO list — `home-screen.tsx:36-37` (cosmetic).
- **[SEV4] `dev/scanner` orphan stub** — `dev/scanner/page.tsx` no-onClick button, direct-URL reachable.

## Verification gates (owner's standard: hard evidence)
- Camera actually decodes a real printed barcode in a phone browser (screenshot/video).
- HW barcode gun fills the field with no app code change beyond focus.
- No-camera device shows the message + manual fallback (no dead button).
- Fake status bar/notch GONE on the live deploy; space reclaimed.
- Every scan screen: field autofocuses, Camera + Manual both functional, flow advances on scan.
