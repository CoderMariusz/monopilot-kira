## 1. Function Inventory

#### Auth

| Action | What it does | Route / Screen | Data source (table) | Reverse / Correction |
|---|---|---|---|---|
| `POST /api/scanner/set-pin` (`apps/web/app/api/scanner/set-pin/route.ts`) | First-time PIN enrollment after email/password verification; writes the scanner PIN hash and audit row. | `/scanner/login/pin-setup` | reads `users` through scanner auth helpers; writes scanner PIN auth storage, `scanner_audit_log` | Change later with **Zmień PIN**; no self-service delete path found. |
| `POST /api/scanner/login` (`apps/web/app/api/scanner/login/route.ts`) | Verifies email + 4-6 digit PIN and creates a personal scanner bearer session. | `/scanner/login` | reads users/PIN auth via `lib/scanner/auth.ts`; writes `scanner_sessions`, `scanner_audit_log` | `POST /api/scanner/logout` ends the session; failed PINs can lock the PIN. |
| `POST /api/scanner/context` (`apps/web/app/api/scanner/context/route.ts`) | Saves selected site, line and shift onto the active scanner session. | `/scanner/login/site` | writes `scanner_sessions.site_id`, `line_id`, `shift`, `last_seen_at`; writes `scanner_audit_log` | Run **Start zmiany** again with a different site/line/shift; no separate undo action. |
| `POST /api/scanner/change-pin` (`apps/web/app/api/scanner/change-pin/route.ts`) | Verifies the current PIN under the bearer session and replaces it with a new valid PIN. | `/scanner/settings` | reads/writes scanner PIN auth storage; writes `scanner_audit_log` | Change PIN again; locked/invalid current PIN blocks the change. |
| `POST /api/scanner/logout` (`apps/web/app/api/scanner/logout/route.ts`) | Ends the active scanner bearer session. | `/scanner/settings`, home user menu | writes `scanner_sessions.ended_at`, `last_seen_at`; writes `scanner_audit_log` | Log in again with email + PIN. |
| `requireScannerSession` (`apps/web/lib/scanner/guard.ts`) | Accepts `Authorization: Bearer <token>` or body `token`, verifies active `scanner_sessions`, and scopes scanner API access to the session org/user. | All `/api/**/scanner/**` guarded routes | reads/writes `scanner_sessions.last_seen_at`; may write `scanner_audit_log` on invalid-session audit | Missing/expired tokens return 401; operator must log in again. |

#### Production (consume, output/catch-weight, waste, reverse-consume)

| Action | What it does | Route / Screen | Data source (table) | Reverse / Correction |
|---|---|---|---|---|
| `GET /api/production/scanner/wos` (`apps/web/app/api/production/scanner/wos/route.ts`) | Lists released/in-progress/paused WOs for the scanner session line. | `/scanner/wos` | reads `work_orders`, `wo_executions`, `items`, `production_lines` | Read-only. |
| `GET /api/production/scanner/wos/[id]` (`apps/web/app/api/production/scanner/wos/[id]/route.ts`) | Loads the WO execute hub: header, produced totals, allergen flag, BOM materials and output rollups. | `/scanner/wos/[woId]` | reads `work_orders`, `wo_executions`, `items`, `production_lines`, `wo_materials`, `wo_outputs` | Read-only. |
| `POST /api/production/scanner/wos/[id]/start` (`apps/web/app/api/production/scanner/wos/[id]/start/route.ts`) | Starts a released WO through `startWo`, using session line/shift and `production.wo.start` permission. | `/scanner/wos/[woId]` button **Uruchom work order** | writes through `lib/production/start-wo.ts`; reads RBAC permissions | No scanner stop/reopen path found; errors include allergen changeover signoff required. |
| `GET /api/production/scanner/wos/[id]/lps` (`apps/web/app/api/production/scanner/wos/[id]/lps/route.ts`) | Lists FEFO LP candidates for one WO material, ordered by earliest expiry. | `/scanner/wos/[woId]/consume` | reads `wo_materials`, `v_inventory_available` | Read-only; pick another LP or use **Ręcznie / bez LP** fallback. |
| `POST /api/production/scanner/wos/[id]/consume` (`apps/web/app/api/production/scanner/wos/[id]/consume/route.ts`) | Records material consumption, decrements selected LP quantity, updates `wo_materials.consumed_qty`, emits `warehouse.material.consumed`, and audits by `clientOpId`. | `/scanner/wos/[woId]/consume` button **Potwierdź konsumpcję** | writes `wo_materials`, `license_plates`, `wo_material_consumption`, `outbox_events`, `scanner_audit_log`; reads `tenant_variations`, `v_inventory_available`, permissions | `/scanner/wos/[woId]/reverse-consume`; over-consume can require supervisor PIN. |
| `POST /api/production/scanner/wos/[id]/output` (`apps/web/app/api/production/scanner/wos/[id]/output/route.ts`) | Registers finished goods/catch-weight output via `registerOutput`; accepts entered quantity, optional actual kg and batch, returns created LP id for printing. | `/scanner/wos/[woId]/output` button **Zatwierdź rejestrację** | writes through `lib/production/output/register-output`; reads `work_orders`; writes `scanner_audit_log` | No scanner output reversal path found; use production correction flow outside scanner if available. |
| `POST /api/production/scanner/wos/[id]/waste` (`apps/web/app/api/production/scanner/wos/[id]/waste/route.ts`) | Records WO waste/scrap quantity in kg and category, no LP creation. | `/scanner/wos/[woId]/waste` button **Rejestruj odpad** | writes through `lib/production/waste/record-waste`; reads `work_orders`; writes `scanner_audit_log` | No scanner waste reversal path found. |
| `GET /api/production/scanner/wos/[id]/consumptions` (`apps/web/app/api/production/scanner/wos/[id]/consumptions/route.ts`) | Lists original positive consumption rows that do not already have a counter-entry. | `/scanner/wos/[woId]/reverse-consume` | reads `wo_material_consumption`, `wo_materials`, `items`, `license_plates` | Read-only input to reverse consume. |
| `POST /api/production/scanner/wos/[id]/reverse-consume` (`apps/web/app/api/production/scanner/wos/[id]/reverse-consume/route.ts`) | Reverses one material consumption under operator PIN and optional supervisor PIN; inserts a negative counter-entry, decrements BOM consumed qty, restores LP quantity/state and writes audit/history. | `/scanner/wos/[woId]/reverse-consume` button **Cofnij konsumpcję** | writes `wo_material_consumption`, `wo_materials`, `license_plates`, `lp_state_history`, `audit_events`, `scanner_audit_log`; reads permissions, `tenant_variations` | Idempotent by `clientOpId`; blocked if already corrected, LP not restorable, closed WO without permission, or inconsistent ledger. |

#### Warehouse (receive PO, putaway, move LP, pick, LP info, QC inspection)

| Action | What it does | Route / Screen | Data source (table) | Reverse / Correction |
|---|---|---|---|---|
| `GET /api/warehouse/scanner/pos` (`apps/web/app/api/warehouse/scanner/pos/route.ts`) | Lists open POs (`sent`, `confirmed`, `partially_received`) with supplier and received-line counts. | `/scanner/receive-po` | reads `purchase_orders`, `suppliers`, `purchase_order_lines`, `grn_items` | Read-only. |
| `GET /api/warehouse/scanner/pos/[id]` (`apps/web/app/api/warehouse/scanner/pos/[id]/route.ts`) | Loads one PO and its line remaining quantities for scanner receipt. | `/scanner/receive-po/[poId]`, `/scanner/receive-po/[poId]/[lineId]` | reads `purchase_orders`, `suppliers`, `purchase_order_lines`, `items`, `grn_items` | Read-only. |
| `POST /api/warehouse/scanner/receive-line` (`apps/web/app/api/warehouse/scanner/receive-line/route.ts`, `apps/web/lib/warehouse/scanner/receive-po.ts`) | Receives a PO line: creates/reuses a day GRN, inserts GRN item, creates received/pending LP, writes LP history/outbox, optional QC inspection, and rolls PO status. | `/scanner/receive-po/[poId]/[lineId]` button **Przyjmij** | writes `grns`, `grn_items`, `license_plates`, `lp_state_history`, `outbox_events`, `quality_inspections`, `purchase_orders`, `scanner_audit_log`; reads `warehouses`, `locations`, `tenant_variations` | No handheld receipt cancel path found; desktop GRN line cancellation is the observed correction path. |
| `GET /api/warehouse/scanner/location` (`apps/web/app/api/warehouse/scanner/location/route.ts`) | Resolves scanned/typed location code, barcode or UUID to an org-owned location. | Destination fields on receive, putaway, move and pick | reads `locations`, `warehouses` | Read-only. |
| `GET /api/warehouse/scanner/lp` (`apps/web/app/api/warehouse/scanner/lp/route.ts`, `apps/web/lib/warehouse/scanner/movement.ts`) | Looks up LP detail, status, QA status, location, warehouse, last move and genealogy. | `/scanner/lp`, putaway/move/QA scan steps | reads `license_plates`, `items`, `locations`, `warehouses`, `stock_moves`, parent/child `license_plates` | Read-only. |
| `GET /api/warehouse/scanner/putaway/suggest` (`apps/web/app/api/warehouse/scanner/putaway/suggest/route.ts`, `apps/web/lib/warehouse/scanner/movement.ts`) | Suggests putaway locations by same-product, empty and default-location heuristics. | `/scanner/putaway` step **Sugerowane lokalizacje** | reads `license_plates`, `locations` | Read-only; operator can choose another resolved location. |
| `POST /api/warehouse/scanner/putaway` (`apps/web/app/api/warehouse/scanner/putaway/route.ts`, `apps/web/lib/warehouse/scanner/movement.ts`) | Moves an LP to a location, writes stock move, updates LP location, and promotes `received -> available` for putaway. | `/scanner/putaway` button **Potwierdź odłożenie** | writes `stock_moves`, `license_plates`, `lp_state_history`, `outbox_events`, `scanner_audit_log`; reads `locations`, `license_plates`, permissions | Move the LP again with **Przesuń LP**; no delete of the stock move. |
| `POST /api/warehouse/scanner/move` (`apps/web/app/api/warehouse/scanner/move/route.ts`, `apps/web/lib/warehouse/scanner/movement.ts`) | Moves an LP to a resolved destination with optional reason. | `/scanner/move` button **Przenieś** | writes `stock_moves`, `license_plates`, `scanner_audit_log`; reads `locations`, `license_plates`, permissions | Move the LP back with a new move; no stock-move reversal action found. |
| `GET /api/warehouse/scanner/pick/wos` (`apps/web/app/api/warehouse/scanner/pick/wos/route.ts`, `apps/web/lib/warehouse/scanner/movement.ts`) | Lists WOs and BOM materials available for warehouse picking. | `/scanner/pick` | reads `work_orders`, `wo_executions`, `items`, `production_lines`, `wo_materials` | Read-only. |
| `GET /api/warehouse/scanner/pick/lps` (`apps/web/app/api/warehouse/scanner/pick/lps/route.ts`, `apps/web/lib/warehouse/scanner/movement.ts`) | Lists FEFO LP candidates for a picked material. | `/scanner/pick` LP step | reads `v_inventory_available`, `locations` | Read-only. |
| `POST /api/warehouse/scanner/pick` (`apps/web/app/api/warehouse/scanner/pick/route.ts`, `apps/web/lib/warehouse/scanner/movement.ts`) | Stages a whole QA-released LP to a WO/material destination using stock move type `issue`; quantity is not decremented. | `/scanner/pick` LP row tap / confirm path | writes `stock_moves`, `license_plates.location_id`, `scanner_audit_log`; reads `wo_materials`, `work_orders`, `wo_executions`, `production_lines`, `license_plates`, `locations`, permissions | Move LP again if staged to the wrong location; consume is a separate production step. |
| `POST /api/quality/scanner/inspect` (`apps/web/app/api/quality/scanner/inspect/route.ts`) | Records scanner QC decision `pass`, `fail` or `hold`; creates a quality inspection, updates LP QA status, and opens a quality hold on hold decisions. | `/scanner/qa` buttons **PASS / FAIL / HOLD** | writes `quality_inspections`, `license_plates`, `quality_holds`, `quality_hold_items`, `outbox_events`, `scanner_audit_log`; reads permissions | No scanner undo for inspection decision found; follow quality correction/reinspection outside scanner. |

#### Labels (print label)

| Action | What it does | Route / Screen | Data source (table) | Reverse / Correction |
|---|---|---|---|---|
| `POST /api/scanner/print-label` (`apps/web/app/api/scanner/print-label/route.ts`) | Builds an LP label payload and inserts a sent print job; current result is a `data:text/plain` payload URL. | **Drukuj etykietę** after PO receipt or output registration | reads `license_plates`, `items`, permissions; writes `print_jobs` | Reprint by pressing **Drukuj etykietę** again; no cancel print-job path found in scanner. |

## 2. User How-To (Handheld Walkthroughs)

Scanner auth is not a Supabase browser session. The operator logs in with **Email / Login** + **PIN**; the API returns a bearer token stored by the scanner session client. Guarded scanner APIs accept `Authorization: Bearer <token>` or a body `token`, verify `scanner_sessions`, and scope operations to that session's `org_id`, user, site, line and shift.

1. PIN login
   1. Open `/<locale>/scanner/login`.
   2. Enter **Email / Login** and the 4-6 digit **PIN** using the on-screen keypad.
   3. Tap **Zaloguj się →**. A `409 pin_not_enrolled` redirects to `/<locale>/scanner/login/pin-setup`.
   4. On first setup, enter **Email / Login**, **Hasło logowania**, choose a PIN on **Ustaw PIN (pierwsze logowanie)**, repeat it on **Potwierdź PIN**, then tap **Zapisz PIN**.
   5. After login, choose **Zakład / firma**, optional **Linia produkcyjna**, and **Zmiana** (`Ranna`, `Popołudniowa`, `Nocna`), then tap **▶ Rozpocznij zmianę**.

2. Start a WO + consume via FEFO LP selection
   1. From **Scanner**, tap **Work Orders**.
   2. On **Work Orders**, search with **Skanuj WO lub wpisz…** or use filters **Wszystkie**, **Moja linia**, **Aktywne**.
   3. Open a WO row. If the WO is not started, tap **Uruchom work order**. The consume/output/waste/reverse tiles are disabled until the start succeeds.
   4. Tap **Konsumpcja**.
   5. On **Wybierz materiał**, tap the BOM material. The screen loads FEFO LP candidates from `GET /api/production/scanner/wos/[id]/lps`; the earliest expiry row is labelled **Sugerowany (FEFO)**.
   6. Tap the FEFO LP row, or use **Ręcznie / bez LP** only when doing manual/no-LP consumption with a required **Kod powodu ręcznego**.
   7. On **Ilość do konsumpcji**, tap **Podaj ilość**, confirm the quantity in the keypad, then tap **Potwierdź konsumpcję**.
   8. If over-consumption crosses the configured approval threshold, fill **Email przełożonego** and **PIN przełożonego**, then tap **Zatwierdź i zapisz**.
   9. The done screen shows **Konsumpcja zapisana**, **BOM zaktualizowany**, and **Skanuj kolejny**.
   10. Known gap: the current production consume screen does not expose a camera/manual LP scan field; it uses the FEFO candidate list plus **Ręcznie / bez LP** fallback.

3. Register output with catch-weight
   1. Open `/<locale>/scanner/wos/[woId]` for a started WO.
   2. Tap **Rejestruj wyrób**.
   3. On **Rejestruj wyrób gotowy**, tap **Podaj ilość** under **Ilość wyprodukowana** and enter the produced quantity. The unit comes from the WO UoM snapshot (`szt`, `karton`, or `kg`).
   4. For catch-weight, tap **Podaj wagę** under **Waga rzeczywista (kg)** and enter the actual kg.
   5. Optionally enter **Partia / numer serii**.
   6. If the soft warning **Brak zarejestrowanej konsumpcji** appears, either go back and consume first or tap **Kontynuuj mimo to**.
   7. Tap **Zatwierdź rejestrację**.
   8. On **Wyrób zarejestrowany**, tap **Drukuj etykietę** if an LP was returned, then use **Rejestruj kolejny** or **Wróć do WO**.

4. Receive a PO by scanning
   1. From **Scanner**, tap **Przyjęcie PO**.
   2. Use **Kamera** or **Ręcznie** in **Zeskanuj numer PO** (`PO-XXXX lub wpisz…`). The camera overlay is **Skanuj kamerą** and supports **Latarka**, **Zmień kamerę**, **Anuluj**, plus **Wpisz ręcznie** fallback.
   3. Exact PO number match opens the PO; otherwise tap the PO row.
   4. On **Pozycje PO**, tap the item line.
   5. Fill **Partia / numer serii**, **Najlepiej przed**, optional **Lokalizacja docelowa** and **Ilość**.
   6. If you type a destination, press Enter to resolve it; the screen shows **Wybrana lokalizacja** or **Nie znaleziono lokalizacji.** A typed unresolved destination disables **Przyjmij**.
   7. Tap **Przyjmij**. If quantity exceeds remaining but stays inside the 110% server cap, the screen shows **Przekroczenie zamówienia**.
   8. The done screen shows **Przyjęto**, **Nowy LP**, optional **Wymagana kontrola jakości**, and actions **Drukuj etykietę**, **Następna pozycja PO**, **Wróć do listy PO**.

5. Putaway / move an LP
   1. For putaway, tap **Putaway**. For general movement, tap **Przesuń LP**.
   2. In **Zeskanuj LP do odłożenia** or **Zeskanuj LP do przeniesienia**, use **Kamera** or **Ręcznie** and scan/type `LP-XXXXX`.
   3. Verify the LP card: **Produkt**, **Ilość**, **Partia**, **Termin ważności**, **Obecna lokalizacja**, **Status QA**.
   4. Putaway: tap **Wybierz lokalizację**, then choose a row under **Sugerowane lokalizacje** or enter **Lub zeskanuj / wpisz lokalizację** and press Enter. Tap **Potwierdź odłożenie**.
   5. Move: enter **Lokalizacja docelowa**, press Enter to resolve, optionally choose **Relokacja**, **Konsolidacja**, **Uszkodzenie** or **Inny**, then tap **Przenieś**.
   6. Success screens show **LP odłożony** or **LP przeniesiony**, with from/to location chips and **Następny LP** / **Przesuń kolejny**.

6. Pick for a WO
   1. From **Scanner**, tap **Pick dla WO**.
   2. Use **Kamera** or **Ręcznie** in **Szukaj zlecenia** (`WO-XXXX lub produkt…`), then open the WO.
   3. Under **Komponenty BOM**, tap the material row.
   4. The LP step lists FEFO candidates; the first row is labelled **FEFO**. Tap the QA-released LP to stage the whole LP.
   5. If the server requires a staging destination, the screen reveals **Lokalizacja kompletacji**. Scan/type a location, resolve it to **Lokalizacja kompletacji**, then tap the LP again to confirm.
   6. Success shows **Materiał skompletowany** and **License Plate został przeniesiony do strefy kompletacji.** Use **Zbierz kolejny materiał** to continue.

7. Reverse a wrong consume
   1. Open the started WO and tap **Cofnij konsumpcję**.
   2. On **Wybierz konsumpcję do cofnięcia**, tap the original consumption row.
   3. Choose **Powód**: **Błąd wprowadzenia**, **Błędna ilość**, **Błędna partia**, **Błędny produkt** or **Inny**.
   4. Optionally fill **Notatka (opcjonalnie)**.
   5. Enter **Twój PIN**.
   6. Tap **Cofnij konsumpcję**.
   7. If the org requires supervisor approval, the POST response reveals **Zgoda przełożonego**. Fill **Email przełożonego** and **PIN przełożonego**, then tap **Cofnij konsumpcję** again.
   8. Success shows **Konsumpcja cofnięta**, **Materiał zwrócony, postęp BOM odświeżony.**, and the restored LP status when applicable.

## 3. Reverse / Correction Map

| Action | Undo path | Allowed state | Notes |
|---|---|---|---|
| PIN login / scanner session | **Wyloguj** or session expiry | Active `scanner_sessions` row with unexpired token | `logout` sets `ended_at`; all guarded routes then return 401 for that token. |
| Set/change PIN | Change PIN again | User must know current PIN for scanner change; first setup requires Supabase password | Failed PIN attempts can lock the PIN. |
| Start WO | No scanner undo found | Released WO with `production.wo.start`, line/shift session context | Start can be blocked by allergen changeover signoff. |
| Consume material | **Cofnij konsumpcję** | Original positive consumption, not already corrected; WO not closed unless user has closed-WO correction permission | Requires operator PIN; supervisor PIN may be required by `scanner_reverse_require_supervisor_pin`; LP must be restorable. |
| Register output | No scanner undo found | WO must be recordable; output route delegates to production output service | Scanner can print the created LP label, but no reverse-output screen/API was found. |
| Register waste | No scanner undo found | WO exists on session line and waste qty/category are valid | Waste has no LP; no scanner waste correction route found. |
| Receive PO line | Desktop GRN line cancellation, not handheld | Receipt line/LP must still be cancellable in the desktop correction flow | Handheld creates GRN/LP and PO status rollup only; no `/api/warehouse/scanner/**cancel**` route found. |
| Putaway LP | Move LP again | LP not `consumed`, `destroyed` or `shipped`; not actively locked by another scanner; user has `warehouse.stock.move` | Putaway promotes `received -> available` but does not release QA. |
| Move LP | Move LP again | LP movable and destination resolves to an org location; user has `warehouse.stock.move` | Stock move history is append-only in scanner. |
| Pick LP for WO | Move LP again or consume later | WO released/in-progress/paused; LP product/UoM matches material; LP QA status is `released` | Pick writes stock move type `issue` and changes location only; it does not consume quantity. |
| QC inspection | No scanner undo found | LP exists, is not terminal, and user has `quality.inspection.execute` | `hold` additionally creates `quality_holds` and `quality_hold_items`; scanner fast path intentionally records no desktop e-signature. |
| Print label | Reprint | LP exists and user has one of the print permissions | Inserts another `print_jobs` row; no scanner cancel print-job path found. |

## 4. Known Gaps / Not-Yet-Built

- Production consume LP camera scan is not built.
  - `apps/web/app/[locale]/(scanner)/scanner/wos/[woId]/consume/_components/consume-screen.tsx` loads FEFO candidates from `GET .../lps?materialId=...` and renders tappable LP rows plus **Ręcznie / bez LP**. It does not import `CameraScannerOverlay` or render `ScanInputArea` for LP scan.

- Scanner output and waste reversals are not built.
  - `apps/web/app/api/production/scanner/wos/[id]/output/route.ts` registers output, and `apps/web/app/api/production/scanner/wos/[id]/waste/route.ts` records waste. No matching scanner reverse route was found for output or waste.

- Scanner PO receipt cancellation is not built.
  - `apps/web/app/api/warehouse/scanner/receive-line/route.ts` creates GRN/LP receipt rows. No handheld cancel/reverse receipt route was found under `apps/web/app/api/warehouse/scanner/**`.

- Home-screen disabled-tile comment is stale, but no disabled home tile is active today.
  - `apps/web/app/[locale]/(scanner)/scanner/home/_components/home-screen.tsx` says missing screens render disabled with **Wkrótce**, but every tile in `SECTIONS` has a non-null route in the observed code.

- Some production action tiles are state-gated, not stubbed.
  - `apps/web/app/[locale]/(scanner)/scanner/wos/[woId]/_components/wo-execute-screen.tsx` disables **Konsumpcja**, **Rejestruj wyrób**, **Odpad** and **Cofnij konsumpcję** until the WO is started. This is a workflow gate backed by `POST .../start`, not a missing action.

- Camera / Code-128 barcode scanning status: built.
  - `git log` shows `d6203ee4 feat(scanner): real camera/barcode scanning (owner decision #2)`.
  - `apps/web/components/shell/camera-scanner-overlay.tsx` uses `@zxing/browser` `BrowserMultiFormatReader` with `BarcodeFormat.CODE_128`, plus Code 39, EAN, UPC, QR, Data Matrix and PDF417. It handles permission-denied/no-camera states and exposes **Wpisz ręcznie** fallback.
  - Camera overlay is wired on receive PO, putaway, move, pick, LP info and QC screens; it is not wired on production consume/output/waste/reverse-consume screens.
