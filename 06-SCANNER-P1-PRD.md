# 06-SCANNER-P1 — PRD v3.1.1

**Wersja:** 3.1.1 (PRD ↔ UX reconciliation pass — adds SCN-011b/c, SCN-013, SCN-095 + §8.8 traceability matrix)
**Data:** 2026-04-30
**Status:** Phase C2 Sesja 3 deliverable (Monopilot Migration) — Multi-industry code standardization
**Phase D module #:** 06 (renumbering per 00-FOUNDATION §4.2)
**Supersedes:** v1.2 (2026-02-18) pre-Phase-D baseline
**Consumer of:** 05-WAREHOUSE v3.0 §13 Scanner Integration contract
**Depends on:** 00-FOUNDATION v3.0, 02-SETTINGS v3.0, 03-TECHNICAL v3.0, 04-PLANNING-BASIC v3.1, 05-WAREHOUSE v3.0

---

## Spis treści

1. Executive Summary
2. Objectives & Metrics
3. Personas
4. Scope (P1 / P2 / P3)
5. Constraints
6. Decisions (D1-D9)
7. Module Map & Epics
8. Requirements per Screen (SCN-010..090 + sub-screens)
9. UX Patterns
10. Barcode Formats & GS1 Parsing
11. Hardware Integration & Device Detection
12. Authentication & Security
13. Offline Queue Contract (P2)
14. API Contract
15. Validation Rules V-SCAN-*
16. Telemetry, Build Sequence, Changelog

---

## §1 — Executive Summary

Scanner (moduł 06) to **dedykowany mobilny interfejs** Monopilot MES, zaprojektowany jako osobny UX pod routingiem `/scanner/*`, zoptymalizowany dla operatorów hali produkcyjnej i magazynu Apex. Scanner **NIE jest responsywną wersją desktopu** (ADR-006): osobny layout, ciemny motyw slate-900, scan-first input, touch targets ≥48dp, liniowe workflow'y z minimalną liczbą decyzji na ekran.

**Kluczowe ramy architektury v3.0 (vs baseline v1.2 pre-Phase-D):**

| Wymiar | v1.2 baseline | v3.0 Phase D aligned |
|---|---|---|
| Moduł # | M05 | **06** (per Phase D §4.2) |
| Auth | Session reuse z desktop | **Username + 4-6 digit PIN (bcrypt)** — 05-WH §13.3 |
| LP lock | brak | **5min auto-release protocol** — 05-WH §13.4 |
| Consume-to-WO | brak | **SCN-080 NEW** — intermediate cascade core (05-WH §10) |
| Input methods P1 | Hardware wedge + manual | **Hardware + Camera + Manual** (3-method parity, Q4) |
| Split LP | Phase 2 | **SCN-060 P1** (parity z 05-WH §6.4-6.5) |
| Site/Line/Shift | brak | **SCN-010-site** pre-Home screen (multi-tenant L2) |
| Co-product + Waste | output only | **4 dedicated sub-flows** SCN-080-coproduct/-waste |
| Screen numbering | flat ad-hoc | **SCN-010..090 major + hierarchical sub-screens** (Q8) |

**Model budowy:** Inkrementalny, 5 sub-modules **06-a..e** (22-28 sesji impl est.). Każdy sub-module odblokowuje grupę workflow'ów po dostarczeniu odpowiednich zależności.

**Code Format Alignment v3.1:** Per 01-NPD v3.2 multi-industry manufacturing operations pattern — FA codes renamed to **FG** (Finished Goods), PR codes standardized to **WIP-<2-letter-process-suffix>-<7-digit-sequence>** format (e.g., WIP-BK-0000001, WIP-MX-0000042). All scanner examples and validation rules updated to reflect new code nomenclature. Barcode parsing and validation logic unchanged; examples only.

**Cel użytkownika:** wykonanie operacji magazynowo-produkcyjnej w **<30s per scan**, bez klawiatury, w warunkach hali (hałas, rękawice, słabe oświetlenie, niestabilna sieć).

**Stack tech (Q1 decision):** PWA (Progressive Web App) osadzony w monorepo Monopilot, Next.js App Router `/scanner/*`, service worker (P2), manifest.json installable, IndexedDB offline queue (P2). Shared services `lib/services/*` z desktop (różni się tylko UI).

**Primary reality anchor:** Apex Foods — 2 sites (FNOR Norwich + FKOB Kobe pilot), 3-5 linii produkcyjnych per site, ~30-50 operatorów aktywnych per zmiana, 3 zmiany (ranna/popołudniowa/nocna). Hardware fleet: Zebra TC52/MC3300 (dominant), Honeywell CT60/CK65, ring scanner RS6000 (Bluetooth HID), iPhone/Samsung A-series (camera fallback dla supervisor override).

---

## §2 — Objectives & Metrics

### 2.1 Cel główny

Dostarczyć operatorom hali Apex (i przyszłym tenantom) narzędzie mobilne do realizacji 9 kluczowych operacji (login, receive PO, receive TO, move, putaway, pick, split, consume-to-WO, QA inspect) poprzez skanowanie kodów kreskowych, **z czasem operacji <30s per scan** i wsparciem offline P2.

### 2.2 Cele drugorzędne

1. **Eliminacja papieru** — zastąpienie papierowych list pickingowych, GRN, checklist QA
2. **Traceability real-time** — każdy scan → `lp_genealogy` update w <30s (online) lub po sync (P2 offline)
3. **Adopcja operatorów** — intuicyjny UX, szkolenie **<1h do proficiency**
4. **Multi-hardware support** — Zebra TC52/MC3300, Honeywell CT60/CK65, ring scanner Bluetooth, iPhone/Android (camera fallback)
5. **3-method input parity** — hardware wedge / camera / manual działają identycznie dla każdego workflow (Q4)
6. **Intermediate cascade core** — SCN-080 Consume-to-WO jako jedyny mechanizm konsumpcji intermediate LPs (per 05-WH Q6 revised "always to_stock")

### 2.3 Success metrics (moduł-level)

**Operational (per scan):**

| KPI | Cel P1 | Pomiar |
|---|---|---|
| Scan operation time | <30s median | APM / user sessions |
| Scan success rate (1st attempt) | >95% | `scanner_audit_log` |
| Scan→response API latency | <500ms P95 | APM |
| Error rate (invalid/unrecognized) | <5% | `scanner_audit_log` |
| Manual entry fallback rate | <10% | Analytics |
| Camera scan success rate | >85% (P1 new method) | `scanner_audit_log` |

**Module-level:**

| KPI | Cel | Pomiar |
|---|---|---|
| GRN completion via scanner | >80% (vs desktop) | Usage analytics |
| Material consumption via scanner | >70% (vs desktop) | Usage analytics |
| QA inspections via scanner | >60% | Usage analytics |
| Intermediate cascade consumption via SCN-080 | 100% (jedyny mechanizm) | DB query `wo_material_consumption.source` |

**Offline (P2):**

| KPI | Cel | Pomiar |
|---|---|---|
| Offline queue sync success | >99% | `scanner_sync_log` |
| Queue drain time (100 ops) | <60s | Sync logs |
| Offline→online reconnect time | <5s detection | `navigator.onLine` + ping |

**UX / Adoption:**

| KPI | Cel | Pomiar |
|---|---|---|
| Operator adoption (2 tyg) | >80% | User tracking |
| Training time to proficiency | <1h | Onboarding tracking |
| Session duration (avg) | <10 min | Analytics |
| Task abandonment rate | <5% | Workflow completion |

**System:**

| KPI | Cel | Pomiar |
|---|---|---|
| Scanner page load (P95) | <2s | APM |
| API lookup P95 | <500ms | APM |
| Uptime | ≥99.5% | Monitoring |

---

## §3 — Personas

### 3.1 Persony główne (Scanner daily users)

**P1. Operator magazynu (Anna, 32, Apex Norwich)**
- Scope: GRN receiving (SCN-020 PO + SCN-030 TO), stock moves (SCN-030), putaway (SCN-040)
- Device: Zebra TC52 (personal handheld) lub ring scanner RS6000 z tabletem
- Warunki: magazyn zewnętrzny/chłodnia, rękawice, stojąca praca, temp 4-8°C
- Sesja: ~20-30 scanów/h, zmiana 8h
- Kryterium: operacja <30s, zero manual entry (hardware wedge), audio feedback mandatory (hałasy)

**P2. Operator produkcji (Piotr, 28, Apex Norwich linia 2)**
- Scope: pick dla WO (SCN-050), consume-to-WO (SCN-080 intermediate + RM), output registration + co-product + waste (SCN-output), split LP (SCN-060)
- Device: **Kiosk tablet shared** przy stanowisku (Samsung Tab Active3 rugged) + hardware scanner Bluetooth ring
- Warunki: linia produkcyjna, rękawice nitrylowe, hałas 80-85dB, standing, temp 10-15°C
- Sesja: ~50-80 scanów/h, zmiana 8h, **kiosk 60s idle timeout** (multiple operators z tą samą sesją ograniczone)
- Kryterium: consume + output w <45s, intermediate cascade <60s (SCN-080 scan-to-WO z FEFO suggest)

**P3. Inspektor QA (Marta, 41, Apex Norwich Technical dept)**
- Scope: QA inspect (SCN-071 pass/fail/hold), CCP monitoring (P2 — 09-QUALITY)
- Device: iPhone 14 Pro (personal) lub Zebra TC57 (supervisor fleet), **camera scanning** często używany (P2 w baseline, **P1 w v3.0 per Q4**)
- Warunki: linia + chłodnia, rękawice, tablet montowany na przenośnym stojaku, temp 4-8°C (chłodnia) lub 20°C (pakowalnia)
- Sesja: ~15-25 inspekcji/zmiana
- Kryterium: inspekcja <60s, offline support (chłodnia — słaba Wi-Fi) P2, clear visual status badges (PASS/FAIL/HOLD kolory semantyczne)

### 3.2 Persony drugorzędne

| Rola | Workflow Scanner | Częstotliwość |
|---|---|---|
| Kierownik zmiany (shift supervisor) | Podgląd postępu dashboard scanner (read-only, SCN-home summary) | Ad-hoc |
| Supervisor (override authority) | Force-complete, FIFO skip override z audit trail, unlock LP (force-release lock) | Rzadko |
| Picker (wysyłka, 11-SHIPPING P2 ext) | Pick→pack workflow (rozszerzenie SCN-050 po M07) | Codziennie |
| Admin (2-SETTINGS) | Scanner PIN reset, device_mode config (kiosk/personal), idle timeout override | Rzadko |

### 3.3 Kiosk vs personal device modes (Q5)

Scanner obsługuje 2 tryby urządzenia, konfigurowalne per `lines.device_mode` lub `users.preferred_device_mode`:

| Tryb | Scenario | Idle timeout | Session behavior |
|---|---|---|---|
| **personal** | Operator z osobnym Zebra TC52 (warehouse) | 300s (configurable `scanner_idle_timeout_sec`) | Long-lived session, remember-me 8h |
| **kiosk** | Shared tablet przy linii produkcyjnej (multiple operators per zmiana) | **60s** (hardcoded shorter) | Auto-logout po każdej operacji success + confirmation; PIN re-auth wymagany |

Admin L2 config decyduje default per site/line. User może override per session (tylko personal→kiosk, nie odwrotnie — security).

---

## §4 — Scope

### 4.1 In Scope — Phase 1 (MVP) — Sub-modules 06-a..e

| Epik | Odblokowany po | Sub-module | Screens | FR count |
|---|---|---|---|---|
| **SC-E1: Shell & Core** (login, home, settings, feedback, parser) | 00-FOUNDATION + 02-SETTINGS | **06-a** | SCN-010, SCN-011 (PIN), SCN-012 (site-select), SCN-home, SCN-settings | ~15 |
| **SC-E2: Warehouse In** (receive PO, receive TO, putaway) | 03-TECHNICAL + 05-WAREHOUSE + 06-a | **06-b** | SCN-020 PO (lines→item→done), SCN-030 TO, SCN-040 putaway | ~18 |
| **SC-E3: Warehouse Movement** (move LP, split LP) | 05-WAREHOUSE (split/merge §6.4-6.5) + 06-a | **06-c** | SCN-031 move, SCN-060 split (scan→qty→done) | ~10 |
| **SC-E4: Production Pick + Consume-to-WO** | 04-PLANNING + 05-WH §10 intermediate + 08-PRODUCTION stub | **06-d** | SCN-050 pick (WO list→pick list→scan→done), **SCN-080 consume-to-WO** (scan-WO→suggest-LP→confirm) | ~14 |
| **SC-E5: Production Output + Waste + QA** | 08-PRODUCTION output + 09-QUALITY QA | **06-e** | SCN-082 output (qty+batch+expiry→new LP), SCN-083 co-product (purple LP), SCN-084 waste (5 categories, NO LP), SCN-071 QA inspect (PASS/FAIL/HOLD), SCN-072 QA fail-reason | ~17 |

**Total P1:** ~9 major SCN codes + ~34 sub-screens, ~70 FR (BE+FE combined), 5 sub-modules, 22-28 sesji impl est.

### 4.2 Out of Scope — Phase 2 (deferred)

| Epik | Powód | Unlock trigger |
|---|---|---|
| **SC-E6: Offline Mode** (IndexedDB queue, conflict resolution, sync) | Stability P1 workflow'ów online first | Post-P1 stabilization |
| **SC-E7: PWA installable** (service worker, manifest, install prompt) | Po P1 stabilizacji | Post-P1 |
| **SC-E8: SSCC-18 palet scan** (AI 00 GS1-128 multi-LP lookup) | Nie wymagane P1 (Apex nie używa SSCC dzisiaj) | Customer demand |
| **SC-E9: Advanced Camera** (Data Matrix, extended GS1 AI 13/15/310x-3103 full) | P1 ma Code128+GS1-128 basic | 07-QUALITY lab integration |
| **SC-E10: Pack & Ship** (SO pick workflow) | Po 11-SHIPPING module | 11-SHIPPING unlock |
| **SC-E11: CCP Monitoring** (QR scan CCP checkpoints) | Po 09-QUALITY advanced HACCP full | 09-QUALITY E10+ |
| **SC-E12: Stock Audit / Cycle Count** (inwentaryzacja) | Po 05-WH WH-E14 cycle counts P2 | 05-WH WH-E14 unlock |
| **SC-E13: EPCIS events consumer** (traceability standard) | Po 05-WH WH-E16 EPCIS | 05-WH WH-E16 unlock |

### 4.3 Exclusions — NIGDY (architectural)

- **Native mobile app** (iOS .ipa / Android .apk) — wyłącznie PWA + web
- **Dashboard / raporty** na scanner — to desktop-only (12-REPORTING)
- **Configuration / settings global** — tylko desktop (02-SETTINGS)
- **CRUD master data** (products, BOM, routings) — desktop only (03-TECHNICAL)
- **Printing** etykiety ZPL — drukowane z desktop (05-WH WH-E07), scanner trigger print → P2
- **Desktop workflows** (multi-column grids, bulk edit) — scanner jest task-focused nie browse-focused

---

## §5 — Constraints

### 5.1 Techniczne

| Constraint | Wartość | Rationale |
|---|---|---|
| Platform | **PWA** (web, Next.js App Router) | Q1 decision, cross-platform, no store approval |
| Framework | Next.js 16+ / React 19+ (reuse Monopilot monorepo) | Shared services |
| Styling | Tailwind CSS + custom tokens (slate-900 dark) | Design system spójny z desktop |
| Barcode P1 | **Code 128, GS1-128** (AI 01 GTIN, 10 Batch, 17 Expiry YYMMDD, 21 Serial, 310x/3103/3922 Weight) | 05-WH §7 GS1-128 spec |
| Barcode P2 | QR Code, SSCC-18 (AI 00), Data Matrix, GS1-128 extended (AI 13 pack date, AI 15 best-before) | Customer demand driven |
| Camera library (P1) | **`@zxing/browser`** (MIT, ~200KB gzipped) lub native `BarcodeDetector` API fallback | Q4 decision |
| Offline storage (P2) | IndexedDB (`scanner-queue` DB, max 100 ops × ~5KB = ~500KB) | P2 well within browser limits |
| Offline trigger | `navigator.onLine` + periodic ping `/api/health` (15s interval) | Defensive detection |
| Touch targets | **≥48dp** (buttons), **≥64dp** (list items), **≥72dp** (primary actions, QA big-3-buttons 80dp) | Glove usability |
| Text size | Primary 24px, secondary 18px, small 11-13px | Legibility z dystansu |
| Dark theme | **slate-900 bg**, f1f5f9 text, high contrast WCAG AA | Warehouse conditions |
| Soft keyboard | `inputMode="none"` domyślnie dla hardware mode (auto-detect) | Nie zasłania ekranu |
| Auto-advance | Po successful scan → następny krok automatycznie (300ms debounce) | Flow speed |
| Supabase RLS | `org_id` na każdym zapytaniu (identical z desktop) | Multi-tenant from day 1 |
| Response format | `{ success: boolean, data?: T, error?: { code: string, message: string } }` | Unified API schema |

### 5.2 Biznesowe

| Constraint | Wartość | Rationale |
|---|---|---|
| Inkrementalna budowa | Scanner roze z modułami; nie można build SC-E4 przed 08-PRODUCTION | Unlock dependency chain |
| Shared services | `lib/services/*` reuse z desktop — tylko UI się różni | DRY, maintenance |
| Training target | Operator produktywny <1h szkolenia | UX simplicity requirement |
| Multi-tenant | `org_id` scoping na wszystkich API calls, RLS enforced | ADR-031 multi-tenant foundation |
| Site awareness | `site_id` na `scanner_audit_log`, `scanner_session` | 14-MULTI-SITE prep |

### 5.3 Regulacyjne

| Constraint | Wartość | Rationale |
|---|---|---|
| Audit trail | Każdy scan logowany: user_id, org_id, site_id, timestamp, barcode, scan_type, result, device_type, scan_method, ip_address | FSMA 204 traceability |
| Retention `scanner_audit_log` | **30 dni** (separate from main `audit_log` 1-year retention) | High volume (setki scanów/h), storage cost |
| GS1 compliance | GTIN-14 check digit (mod 10), AI parsing per GS1 General Spec, Group Separator ASCII 29 | GS1 standard |
| PIN policy | 4-6 digit numeric, bcrypt-hashed, min complexity configurable | Food mfg security audit (customer requirement) |
| LP traceability | Scan LP → genealogy update <30s online (near-real-time) lub <5min offline sync (P2) | FSMA 204, EU 178/2002 |

---

## §6 — Decisions (D1-D9)

### D1. Scanner-First UX (ADR-006) — OBOWIĄZKOWE

Scanner to **osobny interfejs**, nie responsywny desktop. Reguły:

| Wymiar | Wartość |
|---|---|
| Routing | `/scanner/*` (osobne od `/dashboard/*` i `/(authenticated)/*`) |
| Layout | Bez sidebar, ciemny motyw slate-900, fixed bottom action bar |
| Input | Scan-first (keyboard wedge > camera > manual fallback) |
| Flow | Liniowy step-by-step, max 3-5 kroków per workflow |
| Touch targets | 48dp buttons, 64dp list items, 72dp primary, 80dp QA big-3 |
| Text | Primary 24px, secondary 18px |
| Contrast | slate-900 bg, f1f5f9 fg (WCAG AA) |
| Auto-advance | 300ms debounce po successful scan → next step |
| Soft keyboard | `inputMode="none"` gdy hardware detected |

### D2. Feedback Patterns — STANDARD

| Zdarzenie | Audio | Haptic | Visual |
|---|---|---|---|
| Scan success | 1× długi beep (500ms, 800Hz) | Krótka wibracja (100ms) | Green flash + ✓ icon 64px |
| Scan error | 2× krótkie beep (200ms, 400Hz) | Podwójna wibracja (100ms×2) | Red flash + error message |
| Warning (FEFO deviation, partial consume) | 1× średni ton (300ms, 600Hz) | Długa wibracja (300ms) | Amber banner `warn-banner` |
| Critical (LP not found, WO invalid) | 3× krótkie beep | Silna wibracja (500ms) | Full-screen error + retry |
| Lock conflict | 1× beep-low (200Hz) | Pulsing wibracja | Amber modal "LP in use by [user] — retry in [Xs]" |

Konfigurowalne per user w SCN-settings (on/off per event type). Persist: localStorage.

### D3. Offline Queue (Phase 2) — SPECYFIKACJA

| Property | Value |
|---|---|
| Storage | IndexedDB database `scanner-queue` |
| Max operations | **100 per device** (unified dla WH+PROD+QA) |
| Max payload | ~500KB total |
| Granularity (Q3) | **Per operation** (1 op = 1 queue row, FIFO replay) |
| Sync trigger | Auto on `navigator.onLine` event + manual "Sync Now" button |
| Retry | 3 próby z exponential backoff (1s, 5s, 15s) |
| Conflict resolution | Server-authoritative: 409 Conflict → user sees operation-level error + "Retry" / "Discard" |
| Queue order | **FIFO chronologiczne** |
| TTL | 72h (post-expiry → `expired` status, user powtarza) |
| State machine | `queued → syncing → synced | failed | expired` |
| Idempotency | Każda operacja ma `client_operation_id` (UUID), server skip jeśli duplicate |
| Max queue warning | 80 ops → amber banner; 100 ops → red + block new ops |

### D4. Barcode Formats & GS1 Parsing

**Phase 1 obowiązkowe:**

| Format | Użycie | Parsowanie |
|---|---|---|
| Code 128 | LP barcode, location barcode, PO number | Direct match (exact lookup by `barcode` column) |
| **GS1-128** | Products, batches, expiry dates, weights, serials | AI parsing: 01=GTIN-14, 10=Batch/Lot, 17=Expiry (YYMMDD→ISO8601), 21=Serial, 310x=Weight, 3103=Net weight kg, 3922=Price |
| Manual input | Fallback (wszystkie formaty) | Free-text, server-side validation |

**Phase 2:**

| Format | Użycie |
|---|---|
| QR Code | CCP checkpoints, operation codes, URL deep-links |
| SSCC-18 (AI 00) | Palety — multi-LP lookup |
| Data Matrix | Małe etykiety (lab samples, CCP) |
| GS1-128 extended | AI 13 pack date, AI 15 best-before, AI 310x weight variants |

**Parser utility (shared):** `lib/utils/gs1-parser.ts`
- GTIN-14 check digit (modulo 10 per GS1 spec)
- Date format YYMMDD → ISO 8601 (Y2K boundary: YY<50 → 20YY, YY≥50 → 19YY per GS1 convention)
- Variable-length AI: Group Separator (ASCII 29, `\x1d`) jako delimiter
- Unknown AI → log warning + pass raw value (graceful degradation)
- Unit tests: ≥20 fixtures per AI code, edge cases (missing GS, invalid checksum, UTF-8)

**v3.1 — Manufacturing Code Format Examples:**

Per 01-NPD v3.2 multi-industry standard:
- **FG codes (Finished Goods):** `FG-BRD-0001`, `FG-BRD-0002` — baked products (BRD suffix for bread/buns)
- **WIP codes (Work-In-Progress):** `WIP-MX-0000001`, `WIP-MX-0000042`, `WIP-BK-0000004` — intermediate stages
  - Suffix = 2-letter process code (MX=mixing, BK=baking, KN=kneading, PR=proofing, etc.)
  - Sequence = 7-digit zero-padded number (0000001..9999999)
- **Pattern validation:** FG-[A-Z]{3}-\d{4,} | WIP-[A-Z]{2}-\d{7}
- Barcode encoding: Code-128 or GS1-128 with AI 01 (GTIN) + AI 10 (batch) + AI 17 (expiry YYMMDD)

Example scanner validation: Scan `FG-BRD-0001` → lookup products.code → found. Scan `WIP-BK-0000001` → lookup lp.code → found (intermediate LP).

### D5. 3-Method Input Parity (Q4) — NEW v3.0

Scanner obsługuje **3 równoległe metody wprowadzania** w P1:

| Metoda | Mechanizm | Detection | Priorytet auto |
|---|---|---|---|
| **Hardware wedge** | Keyboard-HID (Zebra/Honeywell/ring Bluetooth), Enter jako terminator | `navigator.userAgent` match (`/Zebra|Honeywell|Datalogic/i`) + input event timing analysis (<50ms per char = wedge) | **1st** (auto-focus input) |
| **Camera** | `@zxing/browser` library lub native `BarcodeDetector` API fallback, viewfinder overlay | `navigator.mediaDevices.getUserMedia` capability check + user permission grant | **2nd** (button "📷 Skanuj aparatem") |
| **Manual** | Soft keyboard, text input | Always available (fallback) | **3rd** (button "⌨ Wpisz ręcznie") |

**Detection flow:** `detectScannerCapabilities()` → `{ hardware: boolean, camera: boolean, manual: true }` — auto-adjust UI mode.

**Camera UX (P1 core):**
- Viewfinder overlay z scan area marker (ramka 300×100px, rounded, amber border)
- Auto-detect + auto-close po successful scan (300ms debounce)
- Switch front/rear camera button
- Torch toggle (jeśli hardware wspiera)
- Permission handling: graceful fallback do manual gdy denied
- Performance: max 10 FPS scanning (CPU save), debounce duplicate scans 1s

**Library choice:** `@zxing/browser` (primary) — MIT, multi-format, proven. Native `BarcodeDetector` API as fallback (iOS Safari 17+, Chrome Android): mniejszy bundle ale ograniczony format support.

### D6. Scanner API Routes — KONSOLIDACJA

Wszystkie Scanner endpoints rozmieszczone:

| Prefix | Użycie |
|---|---|
| `/api/scanner/*` | Shared scanner utilities (auth, lookup universal, sync) |
| `/api/warehouse/scanner/*` | Warehouse consumer (05-WH §13.1-13.5): inventory, lookup, lock-lp, suggest-lp, GRN, move, putaway, split |
| `/api/production/scanner/*` | Production consumer (08-PRODUCTION): active-WOs, materials, consume, output, co-product, waste |
| `/api/quality/scanner/*` | Quality consumer (09-QUALITY): pending-inspections, inspect, failure-reasons |

**Response format ustandaryzowany:**
```json
{
  "success": true,
  "data": { /* payload */ },
  "error": null
}
```
lub
```json
{
  "success": false,
  "data": null,
  "error": { "code": "SC_LP_NOT_FOUND", "message": "LP 'LP001' not found" }
}
```

**Error code prefixes:**
- `SC_*` — scanner generic (SC_UNAUTHORIZED, SC_INVALID_BARCODE, SC_SESSION_EXPIRED)
- `SC_LP_*` — LP-specific (SC_LP_NOT_FOUND, SC_LP_LOCKED, SC_LP_CONSUMED, SC_LP_QA_HOLD)
- `SC_WO_*` — WO-specific (SC_WO_NOT_IN_PROGRESS, SC_WO_MATERIAL_NOT_IN_BOM)
- `SC_QTY_*` — quantity (SC_QTY_EXCEEDS_AVAILABLE, SC_QTY_ZERO)
- `SC_PO_*` — PO/TO (SC_PO_NOT_FOUND, SC_PO_FULLY_RECEIVED)

### D7. Kiosk vs Personal Device Mode (Q5) — NEW v3.0

Dual-mode device assignment:

| Mode | Idle timeout | Session lifetime | Auto-logout trigger |
|---|---|---|---|
| **personal** | 300s (configurable `scanner_idle_timeout_sec`, default z 02-SETTINGS §14) | 8h or explicit logout | Idle only |
| **kiosk** | **60s hardcoded** (shorter, anti-hijack) | Per-operation (logout po success + confirmation) OR idle whichever first | **Post-success** + idle |

Konfiguracja:
- `lines.device_mode` (kiosk/personal/both) — production line default
- `users.preferred_device_mode` — operator override
- `scanner_session.active_mode` — runtime value (decided on login)

PIN re-auth in kiosk mode wymagany przed każdą nową operacją (SCN-home powrót po success → PIN modal).

### D8. PIN Policy (Q7) — NEW v3.0

| Property | Value |
|---|---|
| Format | 4-6 digit numeric only |
| Storage | bcrypt hash (separate column `users.scanner_pin_hash`, salt rounds 10) |
| First-time setup | Forced at first scanner login (no default PIN) |
| Self-service rotation | Available via SCN-settings (user can change anytime) |
| Forced rotation | **Admin-configurable**: 30/60/90/180/365/never (default **180 days**, 02-SETTINGS §14) |
| Complexity | Admin-configurable: `forbid_sequential` (1234), `forbid_repeating` (1111), `min_unique_digits` (default 3) |
| Rate limit | 5 failed attempts → 10 min lockout per user (V-SCAN-LOGIN-002) |
| Reset | Admin-only (SCN-nie, tylko desktop 02-SETTINGS user mgmt) |

### D9. Error Recovery Policy (Q6) — NEW v3.0 per-severity

Per-severity error handling (zgodne z 05-WH Q6B FEFO deviation pattern):

| Severity | Class | UX | Example |
|---|---|---|---|
| **block** | Data integrity violation, security | Full-screen error + "Retry" / "Back" — cannot proceed | LP not found, WO ≠ IN_PROGRESS, qty > available, session expired, LP locked by another user |
| **warn** | Policy deviation, soft rule | Amber banner + "Confirm" / "Cancel" + optional `reason_code` field → audit trail | FEFO deviation (05-WH Q6B), non-suggested location (putaway override), partial consume (less than BOM qty) |
| **info** | Informational, no action needed | Blue banner auto-dismiss 5s | Auto-catch weight detected, suggested next material, LP split successful |
| **success** | Operation completed | Green flash + ✓ + next action button | Every successful scan |

Hard-stop (block) triggers: **NEVER** bypass. User musi naprawić input lub wrócić.
Soft-warn (warn) triggers: **ALWAYS** require `reason_code` (dropdown z 5-10 opcjami + "other" free text) → logowane w `scanner_audit_log.metadata` JSONB.

---

## §7 — Module Map & Epics

### 7.1 Architektura modułu

```
06 Scanner (PWA)
├── SC-E1 Shell & Core (06-a)
│   ├── Layout `/scanner/layout.tsx` (dark, no sidebar, 56px topbar, fixed bottom)
│   ├── ScanInput component (auto-focus, inputMode=none, Enter terminator)
│   ├── CameraScanner component (@zxing/browser, viewfinder overlay, torch)
│   ├── ManualInput component (soft keyboard fallback)
│   ├── Feedback system (audio Web Audio API + haptic Vibration API + visual)
│   ├── SettingsStore (localStorage: beep/vibration/auto-advance/camera)
│   ├── GS1Parser utility (`lib/utils/gs1-parser.ts`)
│   ├── AuthContext (scanner session + PIN)
│   ├── PermissionGuard (role-based workflow visibility)
│   └── Screens: SCN-010 Login, SCN-011 PIN, SCN-012 Site/Line/Shift, SCN-home, SCN-settings
│
├── SC-E2 Warehouse In (06-b, po 05-WH + 03-TECH)
│   ├── SCN-020 Receive PO (po-list → po-lines → po-item → po-done)
│   ├── SCN-030 Receive TO (to-list → to-scan → to-done)
│   └── SCN-040 Putaway (putaway-scan → putaway-suggest → putaway-done)
│
├── SC-E3 Warehouse Movement (06-c, po 05-WH split/merge)
│   ├── SCN-031 Move LP (move-lp → move-done)
│   └── SCN-060 Split LP (split-lp → split-done) — NEW v3.0 P1
│
├── SC-E4 Production Pick + Consume (06-d, po 04-PLAN + 08-PROD + 05-WH §10)
│   ├── SCN-050 Pick for WO (pick-wo-list → pick-list → pick-scan → pick-done)
│   └── SCN-080 Consume-to-WO (NEW v3.0 intermediate cascade core)
│       ├── SCN-080-wo-list (active WOs)
│       ├── SCN-080-execute (tabs Komponenty/Zeskanowane, next-suggestion, 4 actions)
│       ├── SCN-080-scan-component (scan LP → validate FEFO → qty → confirm)
│       └── SCN-080-warn-partial (warn-banner niepełna konsumpcja)
│
└── SC-E5 Production Output + QA (06-e, po 08-PROD + 09-QA)
    ├── SCN-082 Output (qty + batch* + expiry* + location → new LP) → SCN-082-done (LP created green card)
    ├── SCN-083 Co-product (purple LP, genealogia z WO) → SCN-083-done
    ├── SCN-084 Waste (5 categories fat/floor/giveaway/rework/other, NO LP) → SCN-084-done (4-cell summary)
    ├── SCN-071 QA Inspect (big-3-buttons 80dp PASS/FAIL/HOLD)
    ├── SCN-072 QA Fail Reason (7 reasons + notes → create NCR basic)
    └── SCN-073 QA Done (dynamic success per PASS/FAIL/HOLD)

Phase 2:
├── SC-E6 Offline Mode (IndexedDB, 06-f future)
├── SC-E7 PWA installable (manifest, service worker)
├── SC-E8 SSCC-18 palet scan
├── SC-E9 Advanced Camera (Data Matrix, GS1 extended AI)
├── SC-E10 Pack & Ship (SO pick, po 11-SHIPPING)
├── SC-E11 CCP Monitoring (po 09-QUALITY advanced)
├── SC-E12 Stock Audit / Cycle Count (po 05-WH WH-E14)
└── SC-E13 EPCIS events consumer (po 05-WH WH-E16)
```

### 7.2 Zależności budowy (unlock order)

```
00-FOUNDATION ─────────────────────────────┐
02-SETTINGS ─ SC-E1 Shell (auth, PIN, feedback) │ ← PIERWSZY (fundament)
                                                │
03-TECHNICAL ─┐                                 │
              ├─ SC-E2 Warehouse In (receive+putaway)
05-WAREHOUSE ─┘                                 │
                                                │
05-WAREHOUSE split/merge ── SC-E3 Movement (move+split) │
                                                │
04-PLANNING-BASIC ─┐                            │
05-WH §10 intermediate ─┼─ SC-E4 Pick+Consume (SCN-050+SCN-080) │
08-PRODUCTION stub ─┘                           │
                                                │
08-PRODUCTION output ─┐                         │
09-QUALITY ───────────┴─ SC-E5 Output+QA
```

### 7.3 Screen catalog (SCN-010..090 + sub-screens per Q8)

**Major codes (9 + 4 PIN/devices/inquiry variants amended 2026-04-30):**

| Code | Screen | Epik | Workflow |
|---|---|---|---|
| SCN-010 | Login (card scan + email/pass + PIN button) | E1 | Auth entry |
| SCN-011 | PIN (6-digit numpad 3×4, auto-advance) | E1 | Auth PIN |
| SCN-011b | PIN First-time Setup (forced 2-step Set/Confirm) | E1 | Auth PIN setup |
| SCN-011c | PIN Change (self-service 3-step Old/New/Confirm) | E1 | Auth PIN rotation |
| SCN-012 | Site/Line/Shift select | E1 | Context |
| SCN-013 | Devices (Org/Admin device fleet pairing+health) | E1 | Admin device mgmt |
| SCN-home | Home menu (grid: Produkcja / Magazyn / Jakość) | E1 | Task router |
| SCN-020 | Receive PO | E2 | Receive |
| SCN-030 | Receive TO | E2 | Receive |
| SCN-031 | Move LP | E3 | Movement |
| SCN-040 | Putaway | E2 | Storage |
| SCN-050 | Pick for WO | E4 | Picking |
| SCN-060 | Split LP | E3 | LP ops |
| SCN-070 | QA Inspect entry | E5 | QA |
| SCN-080 | Consume-to-WO (intermediate cascade) | E4 | Production consume |
| SCN-081 | WO execute (tabs + next-sug + 4 actions) | E4/E5 | Production central |
| SCN-082 | Output (new LP) | E5 | Production output |
| SCN-083 | Co-product (purple LP) | E5 | Production output |
| SCN-084 | Waste (no LP) | E5 | Production output |
| SCN-090 | Offline sync indicator | E6 (P2) | Offline UX |
| SCN-095 | LP Inquiry (read-only LP detail + history) | E1 | Inquiry (P2) |

**Sub-screens (hierarchical, ~34 total):** każdy major code rozwinięty w 2-5 sub-screens per prototype HTML. Nazewnictwo `SCN-{code}-{step}` (np. SCN-020-lines, SCN-020-item, SCN-020-done).

Detal sub-screens w §8 Requirements; bidirectional traceability matrix w §8.8 (added 2026-04-30 reconciliation pass per ADR-034 generic naming convention — entity labels like "Devices" follow `[UNIVERSAL]` pattern, configurable per industry).

---

## §8 — Requirements per Screen

**Notation:** FR-SC-BE-XXX = backend, FR-SC-FE-XXX = frontend. Priorytety: HIGH/MEDIUM/LOW.

### 8.1 SC-E1 Shell & Core (06-a)

**Zależności:** 02-SETTINGS (user mgmt, PIN config, feature flags, site/line config)

#### Backend

| ID | Wymaganie | Priorytet |
|---|---|---|
| FR-SC-BE-001 | `POST /api/scanner/login` — body `{username, pin}` → response `{session_token, expires_at, user: {id, name, role}, allowed_sites: []}`. Walidacja: username exists, pin bcrypt match, active user, rate limit V-SCAN-LOGIN-002. Session stored w `scanner_sessions` table (columns: id, user_id, org_id, site_id, line_id, device_mode, ip_address, user_agent, created_at, expires_at, last_activity_at, ended_at). | HIGH |
| FR-SC-BE-002 | `POST /api/scanner/logout` — ends session, audit log entry. Idempotent. | HIGH |
| FR-SC-BE-003 | `GET /api/scanner/session` — validate + refresh session token (sliding expiration). Response: `{valid: boolean, expires_at, user, context: {site_id, line_id, shift_id}}`. | HIGH |
| FR-SC-BE-004 | `POST /api/scanner/pin/setup` — first-time PIN setup `{new_pin}`. Policy check (length 4-6, D8 complexity rules). Bcrypt hash. | HIGH |
| FR-SC-BE-005 | `POST /api/scanner/pin/change` — self-service rotation `{old_pin, new_pin}`. Verify old + set new. Record `pin_last_changed_at`. | HIGH |
| FR-SC-BE-006 | `GET /api/scanner/context/sites` — list sites user may login (per org_id membership). | HIGH |
| FR-SC-BE-007 | `GET /api/scanner/context/lines?site_id=` — list lines at site (filtered by user.allowed_lines jeśli set). | HIGH |
| FR-SC-BE-008 | `GET /api/scanner/context/shifts` — list shifts (default 3: morning/afternoon/night). | MEDIUM |
| FR-SC-BE-009 | `POST /api/scanner/context` — set session context `{site_id, line_id, shift_id, device_mode}`. Updates `scanner_sessions`. | HIGH |
| FR-SC-BE-010 | GS1-128 parser utility (`lib/utils/gs1-parser.ts`): AI codes 01/10/17/21/310x/3103/3922, GTIN-14 check digit, date YYMMDD→ISO, variable-length with GS delimiter. | HIGH |
| FR-SC-BE-011 | Unified barcode lookup `GET /api/scanner/lookup/:type/:barcode` — type ∈ {lp, location, product, po, to, wo}. Auto-detect prefix jeśli type='auto'. RLS: org_id + site_id context. | HIGH |
| FR-SC-BE-012 | `POST /api/scanner/audit` — bulk audit log entries (batch up to 50). Async processing. Table `scanner_audit_log` z kolumnami per §5.3 + schema-driven ext cols (ADR-028 L3). Indeksy (org_id, timestamp), (org_id, user_id, timestamp), (org_id, barcode). Retention 30 dni (auto-cleanup cron). | HIGH |
| FR-SC-BE-013 | Test data seed `scripts/seed-scanner-test-data.ts` — PO/TO/WO/LP z poprawnymi statusami, test users z PIN, sites/lines/shifts. Komendy `npm run seed:scanner`, `npm run verify:scanner`. | HIGH |

#### Frontend / UX

| ID | Wymaganie | Priorytet |
|---|---|---|
| FR-SC-FE-001 | Scanner Layout `app/scanner/layout.tsx` — dark theme slate-900, no sidebar, 56px topbar (BackButton + Title + UserBadge + SyncStatus + Menu), full-height `content` area overflow-y auto, optional fixed bottom action bar. | HIGH |
| FR-SC-FE-002 | **SCN-010 Login** — logo 72×72px, username input, password input, card scan input (scan-first), "Użyj PIN" secondary button. Device frame 390px (responsive scales down na smaller). | HIGH |
| FR-SC-FE-003 | **SCN-011 PIN** — 6-dot indicator + numpad 3×4 (1-9, 0, ⌫), auto-advance po 6th digit, biometric button (future P2), "Wróć" back button. Error shake animation on wrong PIN. | HIGH |
| FR-SC-FE-003b | **SCN-011b PIN First-time Setup** (forced przy first-ever scanner login per FR-SC-BE-004; UX `design/06-SCANNER-P1-UX.md:240-249`; prototype label `pin_screen` `scanner/login.jsx:58-112` reused for setup steps) — 2-step wizard (Set / Confirm) z progress steps indicator, ten sam 6-dot+numpad pattern co SCN-011, info banner "PIN jest wymagany do szybkiego logowania na hali. Zapamiętaj go — nie możesz go zresetować samodzielnie." Policy validation post-confirm: minimum 4 unique digits (admin-configurable, `[UNIVERSAL]` per ADR-034), reject sequential (1234) lub all-repeating (1111) → inline error "PIN nie spełnia wymagań bezpieczeństwa." Success → SCN-012. | HIGH |
| FR-SC-FE-003c | **SCN-011c PIN Change (self-service)** (entry z SCN-settings "Zmień PIN" button per FR-SC-BE-005; UX `design/06-SCANNER-P1-UX.md:253-258`; prototype label `pin_screen` reused) — 3-step wizard (Wpisz obecny PIN → Wpisz nowy PIN → Potwierdź nowy PIN), 3-step indicator, success banner "PIN zmieniony pomyślnie." → return SCN-settings. Policy identyczna jak SCN-011b. Verifies old PIN before accepting new (per FR-SC-BE-005). | HIGH |
| FR-SC-FE-004 | **SCN-012 Site/Line/Shift** — 2-column cards site (FNOR, FKOB), grid 4 lines (L1-L4), 3 shift buttons (Ranna 6-14, Popołudniowa 14-22, Nocna 22-6), "Rozpocznij zmianę" CTA. | HIGH |
| FR-SC-FE-004b | **SCN-013 Devices** (Admin/Org screen — moved from 02-SETTINGS prototype index 2026-04-30 labeling fix; prototype label `devices_screen` `design/Monopilot Design System/settings/ops-screens.jsx:4-95`) — fleet management page surface owned by scanner module per device-pairing flow: KPI tiles (total/online/low battery/offline), table with battery bar (Progress component), pair-device modal with QR (server-generated UUID pairing token, 5-min TTL), device defaults form. Backed by `scanner_devices` table (Drizzle query JOIN users + production_lines). Visibility: `org_admin` + `site_admin` roles only — surfaces in 02-SETTINGS Org Admin entry-point but rendered under `/scanner/admin/devices` for shared device-context with scanner sessions (`[UNIVERSAL]` per ADR-034 — applies to all industries). Bridge with 02-SETTINGS §6 schema admin (device_defaults config). | MEDIUM |
| FR-SC-FE-005 | **SCN-home** — task menu grid organized 3 sekcje: **Produkcja** (Work Order z badge liczbą aktywnych, Pick dla WO), **Magazyn** (Przyjęcie PO, Przyjęcie TO, Putaway, Przesuń LP, Split LP, Part Movement P2), **Jakość** (Inspekcja QC z badge, Inwentaryzacja P2). Icons 46dp, labels 14px medium, subtitle 11px. Visibility per role (RLS + client-side filter). | HIGH |
| FR-SC-FE-006 | **ScanInput component** — wspólny prymityw: auto-focus, `inputMode="none"` default (hardware mode), Enter jako terminator, min height 50px (desktop) / 64px (scanner), font 16px (standard) / 24px (big mode), blue border (#3b82f6), focus ring 3px alpha-20. Clear after scan. Props: `onScan(value: string, method: 'hardware'|'camera'|'manual')`. | HIGH |
| FR-SC-FE-007 | **CameraScanner component** — `@zxing/browser` BrowserMultiFormatReader, viewfinder 300×100px overlay, amber border 2px rounded, front/rear toggle, torch toggle (if supported), auto-detect + 300ms debounce close, permission denied → fallback message + manual button. Max FPS 10. | HIGH |
| FR-SC-FE-008 | **ManualInput component** — text input + qty keypad (numpad 3×4), submit button 48dp, used as fallback + explicit "Wpisz ręcznie" button on every scan screen. | HIGH |
| FR-SC-FE-009 | **Feedback system** — `lib/scanner/feedback.ts`: `playSuccess()`, `playError()`, `playWarn()`, `playCritical()` — Web Audio API oscillator + Vibration API + visual callbacks. Config persisted localStorage. | HIGH |
| FR-SC-FE-010 | **SCN-settings** — config page: beep on/off, vibration on/off, auto-advance on/off, camera selection (if multi), scan timeout (s), session timeout preview (read-only, admin-set), language (pl/en/uk/ro per 02-SETTINGS §14), PIN change button. Persist: localStorage + sync to user profile on logout. | MEDIUM |
| FR-SC-FE-011 | **Device detection** — `lib/scanner/detect.ts`: `detectScannerCapabilities()` returns `{ hardware: boolean, camera: boolean, manual: true, deviceType: 'zebra'|'honeywell'|'datalogic'|'iphone'|'android'|'desktop'|'unknown' }`. Hardware detection via UserAgent + input event timing analysis. | HIGH |
| FR-SC-FE-012 | **Permission guard** — HOC `withScannerPermission(workflow)` sprawdza role user ma `scanner.access` + workflow-specific (np. `warehouse.receive`, `production.consume`, `quality.inspect`). Jeśli brak → redirect SCN-home z warn banner. | HIGH |
| FR-SC-FE-013 | **Error states** — 3 wzorce: (a) full-screen error dla block-severity (D9), (b) amber banner dla warn-severity z reason_code input, (c) info banner auto-dismiss 5s. Każdy error ma `error_code` + `message` (pl/en/uk/ro translations z 02-SETTINGS). | HIGH |
| FR-SC-FE-014 | **Session timeout UX** — 30s before expiry → modal "Sesja wygaśnie za 30s — [Przedłuż] [Wyloguj]". Przedłuż = refresh token. Idle kiosk mode (60s) = no warning, direct logout. | HIGH |
| FR-SC-FE-015 | **Offline indicator** (P2 stub P1) — header badge green/amber/red dot z pending count. Tap → SCN-090 queue view (P2). P1: just detection + disabled state (no queue yet). | MEDIUM |

### 8.2 SC-E2 Warehouse In (06-b)

**Zależności:** 03-TECHNICAL (products, BOM), 05-WAREHOUSE v3.0 (LP lifecycle, GRN multi-LP §7, putaway §8.4, locations ltree §8.6, FEFO rule §9.1)

#### Backend (consumer 05-WH §13)

| ID | Wymaganie | Priorytet |
|---|---|---|
| FR-SC-BE-020 | `GET /api/warehouse/scanner/pending-receipts` — pending PO (confirmed/approved/partial) + TO (in_transit/awaiting_receipt). Include: PO/TO number, supplier/source, lines count, received count, ETA, urgency (red ≤1d/amber ≤3d/blue normal). RLS org_id + site_id context. | HIGH |
| FR-SC-BE-021 | `GET /api/warehouse/scanner/po/:id/lines` — PO lines: `{line_id, product, qty_ordered, qty_received, remaining, uom, catch_weight_required}`. | HIGH |
| FR-SC-BE-022 | `POST /api/warehouse/scanner/receive-po-line` — accept receipt row (Multi-LP Q1 05-WH): `{po_line_id, product_id, qty, lot_number, expiry_date, catch_weight_kg?, location_id, pallet_id?}`. Tworzy GRN row + LP (per 05-WH §6 state machine). Walidacja: qty_total ≤ qty_ordered + tolerance (per 05-WH §7.2), over-receipt escalation per policy. | HIGH |
| FR-SC-BE-023 | `POST /api/warehouse/scanner/receive-to-line` — TO line receive: `{to_line_id, lp_id_in_transit, qty_actual, discrepancy_reason?}`. Walidacja: LP in transit, per-line qty ≤ expected. | HIGH |
| FR-SC-BE-024 | `GET /api/warehouse/scanner/putaway/suggest/:lpId` — sugestia lokalizacji per 05-WH §8.4 algorithm: 1) FEFO zone (soonest expiry for same product), 2) FIFO zone, 3) product.preferred_zone_id, 4) default. Response `{suggested_location, reason, reason_code, strategy: 'fefo'|'fifo'|'product'|'default', alternatives: [top 3], lp_details}`. SLO <300ms P95. | HIGH |
| FR-SC-BE-025 | `POST /api/warehouse/scanner/putaway` — execute `{lp_id, location_id, suggested_location_id?, override: boolean, override_reason_code?}`. Tworzy `stock_moves` (move_type='putaway'). LP.location_id update. Override → audit log z suggested vs selected + reason_code. | HIGH |
| FR-SC-BE-026 | GRN validation rules (R14 idempotency per 00-FOUNDATION): `client_operation_id` UUID per receive call, server skip duplicate. | HIGH |
| FR-SC-BE-027 | GS1-128 product matching (FR-SC-BE-010 parser) — scan GS1 → extract GTIN → lookup `products.gtin` → auto-fill lot (AI 10) + expiry (AI 17). | HIGH |

#### Frontend / UX

| ID | Wymaganie | Priorytet |
|---|---|---|
| FR-SC-FE-020 | **SCN-020 Receive PO** (5-krok workflow): SCN-020-list (pending PO z urgency dots) → SCN-020-lines (po lines progress circles) → SCN-020-item (scan product GS1 → auto-fill lot/expiry → qty numpad → location scan) → SCN-020-done (success + new LP green card + "Kolejna pozycja"). Multi-LP per line (Q1 05-WH): possibility to add multiple rows per line (40+60 batch split example). | HIGH |
| FR-SC-FE-021 | PO lines display — product name, SKU/GTIN, ordered qty, received qty (progress circle), remaining, urgency dot (🔴 overdue / 🟡 today / 🔵 future). Progress color per % complete. | HIGH |
| FR-SC-FE-022 | **SCN-030 Receive TO** (3-krok): SCN-030-list → SCN-030-scan (LP checklist ✓/○ + scan input + partial accept button) → SCN-030-done (accepted LPs + warning niezeskanowanych). | HIGH |
| FR-SC-FE-023 | **SCN-040 Putaway** (4-krok): SCN-040-scan (scan LP → LP details mini-grid 2×3: product, qty, expiry, current loc) → SCN-040-suggest (suggestion card 28px monospace location code, strategy badge FEFO/FIFO, alternatives list, scan destination) → override flow inline (amber warn-banner + "Use anyway" / "Scan Suggested" + optional reason_code dropdown) → SCN-040-done (from→to table, strategy used, override yes/no). | HIGH |
| FR-SC-FE-024 | Putaway override UX — amber warn-banner: "Inna lokalizacja niż sugestia. Powód?" + dropdown 5 reason_codes (wrong zone suggested, space full, urgency, alternate location better, other + free text). Green confirm button (match) vs amber confirm (override). | HIGH |
| FR-SC-FE-025 | Catch weight (03-TECH §8) — jeśli `product.is_catch_weight`, po scan GS1-128 z AI 3103/3922 extract weight + qty separately. Jeśli missing AI → manual weight input field. | MEDIUM |

### 8.3 SC-E3 Warehouse Movement (06-c)

**Zależności:** 05-WAREHOUSE §6.4-6.5 split/merge, §8 movement

#### Backend

| ID | Wymaganie | Priorytet |
|---|---|---|
| FR-SC-BE-030 | `POST /api/warehouse/scanner/lock-lp` — acquire lock (5min default, 05-WH §13.4) `{lp_id, operation_type}`. Response `{locked: true, expires_at}` or `{locked: false, held_by, held_since}`. Used before every LP-modifying scanner op. | HIGH |
| FR-SC-BE-031 | `POST /api/warehouse/scanner/release-lock` — manual release post-operation (otherwise auto-release after 5min or session end). | HIGH |
| FR-SC-BE-032 | `POST /api/warehouse/scanner/move-lp` — `{lp_id, destination_location_id}`. Walidacja: LP exists, status available/reserved (not consumed/hold/blocked), destination ≠ current, destination in same warehouse lub transfer (→ TO flow). Creates `stock_moves` (move_type='move'). | HIGH |
| FR-SC-BE-033 | `POST /api/warehouse/scanner/split-lp` — split LP: `{original_lp_id, split_qty}`. Walidacja: split_qty < original qty, LP available. Creates new LP z inherited batch/expiry/product, updates original qty. Returns `{original_lp, new_lp}`. Per 05-WH §6.4. | HIGH |

#### Frontend

| ID | Wymaganie | Priorytet |
|---|---|---|
| FR-SC-FE-030 | **SCN-031 Move LP** (3-krok): scan LP → mini-grid details → scan destination (lub 4 quick buttons dla frequent locations) → confirm → SCN-031-done success orange→green. | HIGH |
| FR-SC-FE-031 | Move validation UX — LP na hold: "LP na QA Hold, nie można przesunąć" + block. LP consumed: "LP już skonsumowane" + block. LP blocked: "LP zablokowane — kontakt QA". | HIGH |
| FR-SC-FE-032 | **SCN-060 Split LP** (3-krok): SCN-060-scan (scan LP) → SCN-060-qty (scan qty input, live preview "Oryginał: 30 kg / Nowy: 20 kg") → SCN-060-done (2 karty side-by-side gray original / green new z inherited partia). NEW v3.0 (baseline Phase 2). | HIGH |

### 8.4 SC-E4 Production Pick + Consume-to-WO (06-d)

**Zależności:** 04-PLANNING-BASIC v3.1 (WO, BOM, reservations RM root only §5.10), 05-WAREHOUSE §10 Intermediate LP handling scan-to-consume, 08-PRODUCTION stub (WO execution engine)

#### Backend (consumer 05-WH §13.5 + 04-PLAN §12.3)

| ID | Wymaganie | Priorytet |
|---|---|---|
| FR-SC-BE-040 | `GET /api/production/scanner/pick-lists` — active WO pick lists (status IN_PROGRESS | RELEASED + has unfulfilled material_source='stock' reservations). Include WO number, product, items count, picked count, priority, location path. RLS org_id + site. | HIGH |
| FR-SC-BE-041 | `GET /api/production/scanner/pick-list/:woId` — per 04-PLAN §12.3: reservation lines (material_source='stock' RM root only — per Q6 revision). FEFO suggestion per line (top 1, alternatives top 3). | HIGH |
| FR-SC-BE-042 | `POST /api/production/scanner/pick` — `{wo_id, bom_line_id, lp_id, qty_picked}`. Walidacja: reservation exists (material_source='stock'), LP matches reserved material, qty ≤ available, FEFO enforcement per `fefo_strategy_v1` rule (05-WH §9.1). Updates `wo_material_reservations.fulfilled_qty`, creates `stock_moves` (type='pick'). | HIGH |
| FR-SC-BE-043 | `POST /api/warehouse/scanner/suggest-lp` (05-WH §13.5 consumer) — dla SCN-080 Consume: body `{wo_id, wo_material_id, qty_needed, warehouse_id}`. Top 5 FEFO-ranked suggestions per `fefo_strategy_v1`. | HIGH |
| FR-SC-BE-044 | `POST /api/production/scanner/consume-to-wo` — **NEW v3.0 intermediate cascade core** (05-WH §10): `{wo_id, lp_id, qty_consumed, reason_code?}`. Walidacja: WO in IN_PROGRESS, LP status=available, LP product matches wo_material (rm OR intermediate), qty ≤ lp.current_qty, qa_status ∈ allowed (per V-WH-SCAN-003). Updates: LP qty (partial→reduce, full→status=consumed), creates `wo_material_consumption` row z `source='scanner'`, updates `lp_genealogy.operation_type='consume' + wo_id`, emits outbox event `lp.consumed`. | HIGH |
| FR-SC-BE-045 | `GET /api/production/scanner/active-wos` — list WOs IN_PROGRESS (filtered by user site+line context). Include planned qty, actual qty, consumed count, output count, progress %. | HIGH |
| FR-SC-BE-046 | `GET /api/production/scanner/wo/:id/materials` — expected materials z BOM snapshot (03-TECH §7): product, required qty, consumed qty, remaining, LP suggestions (top 3 FEFO). Multi-source: material_source='stock' (reserved RM) + material_source='upstream_wo_output' (intermediate projected). | HIGH |

#### Frontend

| ID | Wymaganie | Priorytet |
|---|---|---|
| FR-SC-FE-040 | **SCN-050 Pick for WO** (5-krok): SCN-050-wo-list (active WOs progress N/M) → SCN-050-list (BOM lines sorted by location, FIFO/FEFO highlighted blue border) → SCN-050-scan (scan location → ✓ → scan LP → validate FIFO/FEFO → qty input) → override flow inline (amber warn "Not FIFO/FEFO order" + reason_code) → SCN-050-done (success + progress N+1/M + "Następna: X w lokalizacji Y"). | HIGH |
| FR-SC-FE-041 | Pick FEFO suggestion display — suggested LP highlighted (green 2px border), alternatives list z expiry dates. Override requires reason_code: {expiry_close, location_closer, different_batch, damaged_suggested, other}. | HIGH |
| FR-SC-FE-042 | Pick progress tracker — items picked / total, current location indicator, kolejka pozostałych lokalizacji (pill list). | HIGH |
| FR-SC-FE-043 | **SCN-080 Consume-to-WO** (NEW v3.0 intermediate cascade core, 4-krok): SCN-080-wo-list (active WOs) → SCN-081 WO execute (central screen: progress strip, tabs Komponenty/Zeskanowane, warn-banner jeśli niepełna konsumpcja, next-suggestion chip "Następny: [material]", 4 action buttons: Skanuj komponent / Wyrób gotowy / Co-product / Odpad) → SCN-080-scan (scan LP → LP details card produkt/partia/dostępne/data ważności → qty input, batch mandatory) → SCN-080-done (success + progress). | HIGH |
| FR-SC-FE-044 | SCN-081 WO execute — tabs "Komponenty" (BOM lines, per-row check ✓/warn/empty, progress mini-bar) / "Zeskanowane" (consumed LPs list z qty + batch + timestamp). 4 buttons 44dp każdy: niebieski "Skanuj komponent" (primary), zielony "Wyrób gotowy", fioletowy "Co-product", amber "Odpad". | HIGH |
| FR-SC-FE-045 | SCN-081 warn-banner niepełna konsumpcja — po "Wyrób gotowy" jeśli BOM nie w pełni skonsumowany → amber banner "Niepełna konsumpcja materiałów. Kontynuować?" + [Anuluj] / [Kontynuuj + audit log]. | HIGH |
| FR-SC-FE-046 | SCN-080 FEFO deviation — per 05-WH Q6B, soft warn tylko (nie block) — amber banner "Sugestia FEFO: LP-ABC (expiry 2026-05-01). Wybrany: LP-XYZ (expiry 2026-06-15). Powód?" + dropdown 5 reasons + confirm. Logged w `scanner_audit_log.metadata.fefo_deviation`. | HIGH |
| FR-SC-FE-047 | SCN-081 next-suggestion chip — cyan chip "Następny do zeskanowania: [material name] (brakuje [qty])" — tap → auto-fill SCN-080-scan z material filter. | MEDIUM |
| FR-SC-FE-048 | Catch weight support — jeśli LP z catch weight (03-TECH §8), po scan pokazuje "Waga LP: 184.2 kg, Jednostek: 120 BOX" + qty input podpowiedź "Konsumujesz pełne LP? [Tak/Nie]". | MEDIUM |

### 8.5 SC-E5 Production Output + Co-product + Waste + QA (06-e)

**Zależności:** 08-PRODUCTION output registration + co-products, 09-QUALITY QA holds + NCR basic

#### Backend

| ID | Wymaganie | Priorytet |
|---|---|---|
| FR-SC-BE-050 | `POST /api/production/scanner/output` — `{wo_id, qty_produced, lot_number, expiry_date, location_id, pallet_id?, catch_weight_kg?}`. Tworzy nowy LP (status=available lub qc_pending per product.requires_qa), creates `wo_outputs` row (type='primary'), updates `wo.actual_qty`. `lp_genealogy`: link all consumed LPs → new LP. | HIGH |
| FR-SC-BE-051 | `POST /api/production/scanner/co-product` — `{wo_id, co_product_id, qty, lot_number, expiry_date, location_id}`. Per 03-TECH §7 `co_products` z BOM allocation_pct. Tworzy LP (product=co_product), `wo_outputs` (type='co_product'), `lp_genealogy` parent=wo_id. | HIGH |
| FR-SC-BE-052 | `POST /api/production/scanner/waste` — `{wo_id, waste_category_id, qty, production_phase, notes?}`. NIE tworzy LP (waste nie trafia do magazynu). Creates `wo_waste_log` entry. Kategorie: `waste_categories` (fat, floor, giveaway, rework, other — configurable per org per 02-SETTINGS). | HIGH |
| FR-SC-BE-053 | `GET /api/quality/scanner/pending-inspections` — LP z qa_status='pending' + WO z required inspection. Age (days since LP created), urgency dots. | HIGH |
| FR-SC-BE-054 | `POST /api/quality/scanner/inspect` — `{lp_id, result: 'pass'|'fail'|'hold', failure_reason_id?, notes?, inspector_id}`. Pass → LP.qa_status='passed'. Fail → LP.qa_status='failed' + status='blocked' + create basic NCR (09-QA module). Hold → LP.qa_status='hold'. Audit log entry. | HIGH |
| FR-SC-BE-055 | `GET /api/quality/scanner/failure-reasons` — lista (configurable per org): contamination, wrong_label, temperature, visual_defect, weight_variance, date_code_issue, other. | HIGH |

#### Frontend

| ID | Wymaganie | Priorytet |
|---|---|---|
| FR-SC-FE-050 | **SCN-082 Output** (invoked z SCN-081 button "Wyrób gotowy"): qty input numpad (domyślnie remaining planned = wo.planned_qty - wo.actual_qty), batch* (mandatory), expiry* (mandatory), location scan + pallet_id optional, catch_weight (jeśli is_catch_weight), confirm → SCN-082-done (new LP 26px monospace green card + side-by-side "2 LP z tym samym produktem" jeśli multi-output). | HIGH |
| FR-SC-FE-051 | Output yield indicator — actual vs planned, yield %, color-coded (green ≥95%, amber 80-95%, red <80%). | HIGH |
| FR-SC-FE-052 | **SCN-083 Co-product** (invoked z button "Co-product"): co_product dropdown (z BOM co_products), qty, batch*, expiry, location → SCN-083-done (fioletowy card LP + genealogia z WO). | HIGH |
| FR-SC-FE-053 | **SCN-084 Waste** (invoked z button "Odpad"): 5 category buttons 44dp (fat amber / floor gray / giveaway blue / rework purple / other red), qty, production phase dropdown (przed gotowaniem / w trakcie / po gotowaniu / pakowanie), notes textarea, no-LP info banner "Brak LP — odpad nie trafia do magazynu" → SCN-084-done (4-cell summary grid kategoria / qty / faza / timestamp). | HIGH |
| FR-SC-FE-054 | Multi-output workflow — operator może rejestrować wielokrotnie (np. 2× Wyrób gotowy + 1× Co-product + 3× Odpad w ramach 1 WO) — każdy scan tworzy osobny LP (primary/co) lub log entry (waste). | HIGH |
| FR-SC-FE-055 | **SCN-070 QA Inspect entry** — pending list z urgency dots (red ≤1d age / amber 1-3d / blue normal), scan LP input, "Rozpocznij inspekcję" button. | HIGH |
| FR-SC-FE-056 | **SCN-071 QA Inspect** — LP card (6 pól meta: product, qty, batch, expiry, location, WO ref, age), 3 big buttons 80dp: ✓ PASS (green) / ✗ FAIL (red) / ⏸ HOLD (amber), optional notes textarea. | HIGH |
| FR-SC-FE-057 | **SCN-072 QA Fail Reason** (invoked z FAIL) — 7 reason buttons z ikonami (🦠 contamination / 🏷 wrong label / 🌡 temperature / 👁 visual defect / ⚖ weight variance / 📅 date code / ❓ other), notes textarea, "Utwórz NCR" button. | HIGH |
| FR-SC-FE-058 | **SCN-073 QA Done** — dynamic success (zielony checkmark PASS / czerwony X FAIL / amber pauza HOLD), NCR info card (jeśli fail — "NCR-2026-042 utworzony"), inspection counter "Wykonano: 12/23 dzisiaj". | HIGH |
| FR-SC-FE-059 | QA batch inspection — "Inspect Next" button → auto-reset do SCN-070. Counter inspected/total. | MEDIUM |
| FR-SC-FE-060 | QA visual indicators — LP card z color-coded status badge (available=green, qc_pending=amber, hold=yellow, blocked=red, consumed=gray). | HIGH |

### 8.6 SC-E6 Offline Mode + SCN-095 Inquiry (Phase 2)

**Note:** Full spec deferred P2. P1 includes detection stub + SCN-090 placeholder + SCN-095 inquiry preview screen (data wired to mock fallback).

| ID | Wymaganie | Priorytet | Phase |
|---|---|---|---|
| FR-SC-BE-070 | `POST /api/scanner/sync-queue` — batch sync endpoint: accepts array of ops, processes FIFO, returns per-op results. Idempotency via `client_operation_id`. | HIGH | P2 |
| FR-SC-BE-071 | Conflict resolution: LP already consumed → reject + suggest re-scan; qty exceeds → reject + return current; PO fully received → reject. | HIGH | P2 |
| FR-SC-BE-072 | `GET /api/scanner/lp/:code/inquiry` — read-only LP detail with history: full LP record JOIN lp_movements + users + locations + parent WO + child LPs. RLS org_id + site_id. SLO <500ms P95. (P2 endpoint; P1 uses `SCN_LPS` mock fallback in prototype.) | MEDIUM | P2 |
| FR-SC-FE-070 | Offline detection: `navigator.onLine` + ping `/api/health` 15s. Status indicator header (green/amber/red dot). | HIGH | P1 stub |
| FR-SC-FE-071 | **SCN-090 Queue view** — badge pending count, list (operation type, timestamp, status queued/syncing/synced/failed), "Sync Now" button, per-op retry/discard. | HIGH | P2 |
| FR-SC-FE-072 | Auto-sync on reconnect + progress bar. | HIGH | P2 |
| FR-SC-FE-073 | Queue overflow: 80 ops → amber warning, 100 ops → red + block new ops. | MEDIUM | P2 |
| FR-SC-FE-074 | **SCN-095 LP Inquiry** (entry: SCN-home Magazyn section "Inspekcja LP" P2 tile lub deep-link `/scanner/inquiry`; UX cross-ref `design/06-SCANNER-P1-UX.md:1057-1063` §5.7 LP Inquiry; prototype label `inquiry_screen` `scanner/flow-other.jsx:391-438`) — Read-only screen: scan LP input → 8-cell `mini-grid` 2×4 (Product, SKU, Batch/Lot, Expiry, Qty available, Location, Status, QA status) + collapsible "Historia LP" timeline (received → picked → consumed → output) + parent WO link + child LP list. P1 prototype shows static history with feature flag `flags.scanner_lp_inquiry` defaulting OFF (redirect to SCN-home). P2 wires to FR-SC-BE-072. Banner "P2 preview" while flag is OFF. `[UNIVERSAL]` per ADR-034 (applies to any product type — meat / bakery / pharma). | MEDIUM | P2 (UI shell P1) |

### 8.7 SC-E7+ Phase 2 placeholders

Skrócone (pełne spec post-P1):

| Epik | Scope preview |
|---|---|
| SC-E7 PWA installable | Service worker (network-first API, cache-first static), manifest.json, install prompt, capability detection |
| SC-E8 SSCC-18 | AI 00 parsing → multi-LP palet lookup, bulk putaway |
| SC-E9 Advanced Camera | Data Matrix, extended GS1 AI 13/15/310x multi-weight, multi-format simultaneous |
| SC-E10 Pack & Ship | SO pick (po 11-SHIPPING), container assignment |
| SC-E11 CCP Monitoring | QR scan CCP checkpoints, HACCP full (po 09-QUALITY E10+) |
| SC-E12 Stock Audit | Cycle count workflow, blind count, discrepancy reconciliation (po 05-WH WH-E14) |
| SC-E13 EPCIS consumer | GS1 EPCIS events (po 05-WH WH-E16) |

### 8.8 UI Surfaces Traceability Matrix (added 2026-04-30 reconciliation pass)

**Purpose:** Bidirectional PRD ↔ UX-spec ↔ prototype label traceability for downstream task decomposition (Phase E ASP). Every prototype in `_meta/prototype-labels/prototype-index-scanner.json` must appear here; every PRD SCN-NNN must link to a UX line + prototype label or carry an explicit `[NO-PROTOTYPE-YET]` / `[NO-UX-YET]` TODO.

Per ADR-034 generic naming convention, entity labels in this matrix follow `[UNIVERSAL]` patterns (e.g. "WO" = work order across industries; "LP" = license plate / container; "Devices" = scanner fleet) — industry-specific renaming (FA→FG, PR→WIP) is handled in 03-TECHNICAL/01-NPD reference data, not here.

| PRD SCN-ID | Screen / contract | UX line (`design/06-SCANNER-P1-UX.md`) | Prototype label (`_meta/prototype-labels/prototype-index-scanner.json`) | Prototype file:lines | Status |
|---|---|---|---|---|---|
| SCN-010 | Login (badge scan + email/pass + PIN button) | `:183-203` §3.1 | `login_screen` | `scanner/login.jsx:5-56` | OK |
| SCN-011 | PIN entry (6-dot + 3×4 numpad) | `:212-231` §3.2 | `pin_screen` | `scanner/login.jsx:58-112` | OK |
| SCN-011b | PIN First-time Setup (2-step Set/Confirm) | `:240-249` §3.3 | `pin_screen` (reused) | `scanner/login.jsx:58-112` | OK (FR-SC-FE-003b) |
| SCN-011c | PIN Change Self-service (3-step) | `:253-258` §3.4 | `pin_screen` (reused) | `scanner/login.jsx:58-112` | OK (FR-SC-FE-003c) |
| SCN-012 | Site / Line / Shift select | `:262-286` §3.5 | `site_select_screen` | `scanner/login.jsx:114-180` | OK |
| SCN-013 | Devices fleet management (org admin) | (no dedicated section — covered via 02-SETTINGS Org Admin entry-point) | `devices_screen` | `settings/ops-screens.jsx:4-95` | OK (FR-SC-FE-004b — moved from settings 2026-04-30) |
| SCN-home | Workflow launcher menu | `:290-323` §3.6 | `home_screen` | `scanner/home.jsx:7-61` | OK |
| SCN-settings | Per-user scanner settings | `:778-813` §3.22 | `settings_screen` | `scanner/home.jsx:63-136` | OK |
| SCN-020 | Receive PO (4-step list/lines/item/done) | `:327-389` §3.7 (sub `:334`/`:346`/`:354`/`:383`) | `po_list_screen` / `po_lines_screen` / `po_item_screen` / `po_done_screen` | `scanner/flow-receive.jsx:7-37, 40-86, 89-233, 236-264` | OK |
| SCN-030 | Receive TO (3-step list/scan/done) | `:391-414` §3.8 | `to_list_screen` / `to_scan_screen` | `scanner/flow-receive.jsx:267-294, 297-385` | OK |
| SCN-031 | Move LP | `:454-480` §3.10 | `move_screen` | `scanner/flow-other.jsx:10-86` | OK |
| SCN-040 | Putaway (scan/suggest/done) | `:416-452` §3.9 | `putaway_scan_screen` / `putaway_suggest_screen` | `scanner/flow-putaway.jsx:5-63, 65-144` | OK |
| SCN-050 | Pick for WO (5-step) | `:507-544` §3.12 | `pick_wo_list_screen` / `pick_list_screen` / `pick_scan_screen` | `scanner/flow-pick.jsx:5-40, 42-94, 96-238` | OK |
| SCN-060 | Split LP (3-step) | `:482-505` §3.11 | `split_scan_screen` / `split_qty_screen` | `scanner/flow-other.jsx:111-150, 152-193` | OK |
| SCN-070 | QA Inspection list | `:678-693` §3.17 | `qa_list_screen` | `scanner/flow-other.jsx:227-260` | OK |
| SCN-071 | QA Inspect (PASS/FAIL/HOLD) | `:695-716` §3.18 | `qa_inspect_screen` | `scanner/flow-other.jsx:262-294` | OK |
| SCN-072 | QA Fail Reason + NCR create | `:718-741` §3.19 | `qa_fail_reason_screen` | `scanner/flow-other.jsx:296-336` | OK |
| SCN-073 | QA Done (dynamic per result) | `:743-755` §3.20 | (rendered inline in qa_inspect/qa_fail flows) | `scanner/flow-other.jsx` (success branches) | OK (composed) |
| SCN-080 | Consume-to-WO (intermediate cascade core) | `:546-608` §3.13 (sub `:551`/`:555`/`:586`) | `wo_list_screen` / `wo_detail_screen` / `consume_scan_screen` | `scanner/flow-consume.jsx:8-54, 56-121, 216-410` | OK |
| SCN-081 | WO Execute (tabs + 4 actions) | `:561-584` §3.13.3 | `wo_execute_screen` | `scanner/flow-consume.jsx:123-213` | OK |
| SCN-082 | Output registration (new LP) | `:610-631` §3.14 | `output_screen` | `scanner/flow-register.jsx:6-121` | OK |
| SCN-083 | Co-product registration (purple LP) | `:633-650` §3.15 | `coproduct_screen` | `scanner/flow-register.jsx:152-202` | OK |
| SCN-084 | Waste registration (no LP) | `:652-676` §3.16 | `waste_screen` | `scanner/flow-register.jsx:226-285` | OK |
| SCN-090 | Offline Queue view | `:757-776` §3.21 | `[NO-PROTOTYPE-YET]` (P2 deferred) | — | OK (P2) |
| SCN-095 | LP Inquiry (read-only detail + history) | `:1057-1063` §5.7 | `inquiry_screen` | `scanner/flow-other.jsx:391-438` | OK (P2 shell P1 — FR-SC-FE-074) |
| SCN-error | Unrecoverable error overlay | `:817-846` §3.23 | `block_fullscreen` | `scanner/modals.jsx:277-298` | OK |

**Modal contracts (referenced from above flows):**

| Modal | UX section | Prototype label | Prototype file:lines | Owner flow |
|---|---|---|---|---|
| Reason Code Picker | `:848` §4.1 | `reason_picker_sheet` | `scanner/modals.jsx:21-53` | Putaway override, FEFO override |
| FEFO Deviation Confirm | `:858` §4.2 | `fefo_deviation_sheet` | `scanner/modals.jsx:55-98` | SCN-050, SCN-080 |
| Qty Entry Keypad | `:870` §4.3 | `qty_keypad_sheet` | `scanner/modals.jsx:251-275` | All quantity steps |
| Best-before Warning | `:914` §4.8 | `best_before_sheet` | `scanner/modals.jsx:100-124` | SCN-020-item, SCN-080 |
| Partial Consume Warning | `:886` §4.5 | `partial_consume_sheet` | `scanner/modals.jsx:126-155` | SCN-082 (output gate) |
| Printer Picker (P2) | `:924` §4.9 | `printer_picker_sheet` | `scanner/modals.jsx:157-180` | SCN-020-done, SCN-082-done |
| Language Picker | `:932` §4.10 | `language_sheet` | `scanner/modals.jsx:182-212` | SCN-settings |
| Logout Confirm | `:940` §4.11 | `logout_sheet` | `scanner/modals.jsx:214-228` | Topbar overflow |
| Generic Scan Error | `:964` §4.14 | `scan_error_sheet` | `scanner/modals.jsx:230-249` | All scan inputs |
| LP Locked (5-min lock collision) | (covered §3.10 Move + §3.13.4 Consume narratives) | `lp_locked_sheet` | `scanner/modals.jsx:300-310` | SCN-031, SCN-080 |
| Use-by Hard Block | `:908` §4.7 | `block_fullscreen` (reused fullscreen) | `scanner/modals.jsx:277-298` | SCN-080 |

**Coverage summary 2026-04-30:**
- Direction A (PRD → UX/prototype): 24/24 SCN-IDs linked (SCN-090 explicitly P2-deferred with `[NO-PROTOTYPE-YET]` marker; all others link both UX line + prototype label).
- Direction B (prototype → PRD): 41/41 entries in `prototype-index-scanner.json` referenced — `pin_screen` is multi-anchored (SCN-011 + SCN-011b + SCN-011c), `block_fullscreen` is multi-anchored (SCN-error + Use-by Hard Block).
- Coverage ≥98% (was ~95% in `_meta/audits/2026-04-30-design-prd-coverage.md` Module 06-SCANNER-P1).

---

## §9 — UX Patterns

Design system spójny z prototype HTML (`SCANNER-PROTOTYPE (2).html`), ~34 screens referencyjne.

### 9.1 Scan-first input pattern

Każdy screen operacyjny zaczyna się od dużego pola skanu:
```
<div class="sinput-area">
  <input class="sinput" inputmode="none" autofocus />
  <div class="shint">Zeskanuj LP lub lokalizację</div>
</div>
```
- Font 16px, border #3b82f6 (blue-500), rounded 10px, padding 13px 16px
- Focus: border #60a5fa + box-shadow 3px alpha-20
- Placeholder #334155 (slate-700)

### 9.2 Mini-grid (LP details card)

Po successful scan — 2×3 lub 2×2 grid z metadata:
```
.mini-grid (slate-800 bg, rounded 10, margin 12 16)
  .mini-row (grid 1fr 1fr, border-bottom slate-700)
    .mini-cell (padding 9 12, border-right slate-700)
      .mini-label (10px, slate-600)
      .mini-val (12px bold, slate-100)
```

### 9.3 Next-suggestion chip

Cyan chip z proponowanym next material:
```
.next-sug (cyan-900 bg, cyan-700 border, rounded 10)
  .ninfo
    .nlabel ("NASTĘPNY DO ZESKANOWANIA", cyan-300, 10px uppercase)
    .nname (cyan-50, 13px bold, material name + "brakuje X kg")
```

### 9.4 Banners (warn / info)

**warn-banner** (amber-900 bg, amber-700 border):
- `banner-icon` 18px (⚠ lub 🟡)
- `banner-title` (12px bold, amber-300)
- `banner-text` (11px, amber-100)

**info-banner** (blue-900 bg, blue-700 border):
- Analogicznie, blue-300 title / blue-100 text

### 9.5 Success screen

Po każdej operacji success:
```
.success-wrap (padding 40 16 20, center)
  .success-icon (64px emoji: ✓ ✅ 🎉)
  .success-title (22px bold)
  .success-sub (13px, slate-500)
  [LP card jeśli applicable]
  [2 buttons: Primary "Kolejna" + Secondary "Wróć"]
```

### 9.6 Steps indicator

3-5 step progress visual:
```
.steps (gap 5, padding 12 16)
  .step (flex 1, h 3px, rounded 2)
  .step.done (green-600)
  .step.active (blue-500)
  .step (default slate-800 = pending)
```

### 9.7 Big-3-buttons (QA pattern)

Dla binary-ternary critical decisions (QA pass/fail/hold):
- Height 80dp (2× standard)
- Color semantic: green-600 PASS, red-600 FAIL, amber-600 HOLD
- Icon 28px + label 16px bold
- Full width, gap 8px vertical

### 9.8 LP created card (success)

Po output/co-product — green LP card:
```
.lp-card (green-900 bg, green-600 border, rounded 12, padding 18)
  .lp-num (26px bold, green-400, Courier New monospace, letterspacing 3)
  .lp-sub (11px, green-300)
```
Co-product = purple-900 bg, purple-600 border variant.

### 9.9 Split result (side-by-side)

```
.split-grid (grid 1fr 1fr, gap 10, padding 10 16)
  .split-orig (slate-800 bg, rounded 10, padding 14, center)
  .split-new (green-900 bg, green-600 border, rounded 10)
  .split-lp-num (14px bold monospace, letterspacing 2)
  .split-qty (12px, slate-400 / green-300)
```

### 9.10 Status badges

Kolory semantyczne dla LP/WO/PO statuses:
| Status | Background | Foreground |
|---|---|---|
| planned | blue-950 | blue-400 |
| released | green-950 | green-400 |
| in_progress | amber-950 | orange-400 |
| on_hold | stone-950 | stone-500 |
| done | green-950 | green-400 |
| blocked | red-950 | red-400 |

### 9.11 Batch mandatory indicator

Każde pole batch (LP number) ma:
```
<label>Partia <span class="req">*</span></label>
<div class="fhint">Obowiązkowe</div>
```
`.req` = red-500 color.

---

## §10 — Barcode Formats & GS1 Parsing

### 10.1 Phase 1 formats (obowiązkowe)

**Code 128:**
- Direct scan, lookup by `barcode` column in appropriate table
- Prefix convention: `LP` (license plate), `LOC` (location), `PO` (purchase order), `TO` (transfer order), `WO` (work order)
- Fallback: auto-detect by pattern match (UUID-like, numeric, alphanumeric)

**GS1-128:**
- Application Identifiers (AI) parsing per GS1 General Specification v22
- Separator: Group Separator (GS) ASCII 29 `\x1d`
- Primary AIs:

| AI | Name | Format | Example |
|---|---|---|---|
| 01 | GTIN-14 | 14 numeric (incl. check digit) | `01`+`10012345678902` |
| 10 | Batch/Lot | variable up to 20 alphanumeric | `10`+`B20260410` |
| 17 | Expiry date | YYMMDD | `17`+`260501` |
| 21 | Serial | variable up to 20 | `21`+`SN001` |
| 310n | Net weight kg (n=decimals) | 6 numeric | `3103`+`000184` = 18.4 kg |
| 3922 | Amount payable single | variable | `3922`+`00295` |
| 13 | Pack date (P2) | YYMMDD | `13`+`260401` |
| 15 | Best before (P2) | YYMMDD | `15`+`260515` |

**Manual input:** fallback for wszystkie formaty, wsparcie copy-paste + numpad.

### 10.2 Phase 2 formats

| Format | Use case | Library support |
|---|---|---|
| QR Code | CCP checkpoints, deep-links, operation codes | @zxing/browser QR_CODE |
| SSCC-18 (AI 00) | Palety multi-LP | GS1 parser extension |
| Data Matrix | Small labels (lab samples) | @zxing/browser DATA_MATRIX |

### 10.3 Parser utility (FR-SC-BE-010)

`lib/utils/gs1-parser.ts`:
```typescript
export type ParsedGS1 = {
  ais: Record<string, string>;
  gtin?: string;
  batch?: string;
  expiry?: Date; // ISO 8601
  serial?: string;
  netWeightKg?: number;
  rawValue: string;
  unknownAIs?: string[]; // graceful degradation
  valid: boolean;
  errors?: string[];
};

export function parseGS1(input: string): ParsedGS1;
export function validateGTIN14(gtin: string): boolean; // mod 10
export function detectBarcodeType(input: string): 'gs1-128' | 'code-128' | 'manual' | 'unknown';
```

**Y2K convention** (per GS1): YYMMDD — YY<50 → 20YY, YY≥50 → 19YY.

**Unit tests:** ≥20 fixtures per AI + edge cases:
- Missing Group Separator on variable-length AI
- Invalid GTIN checksum
- Leading zeros in weight AI
- Mixed case batch (normalize to uppercase)
- UTF-8 non-ASCII in batch (log warning)

---

## §11 — Hardware Integration & Device Detection

### 11.1 Device compatibility matrix

| Device | Scan method | Detection heuristic | P1 support |
|---|---|---|---|
| Zebra TC52 / TC57 / MC3300 | Keyboard wedge (HID), Enter terminator | UserAgent `/Zebra|Datalogic/i` | ✅ Primary |
| Honeywell CT60 / CK65 | Keyboard wedge (HID), Enter terminator | UserAgent `/Honeywell/i` | ✅ Primary |
| Ring scanner RS6000 (Bluetooth HID) | Keyboard wedge via BT pairing | BT paired devices detection API | ✅ Primary |
| iPhone 12+ (Safari 17+) | Camera (`@zxing/browser` or native BarcodeDetector) | `navigator.mediaDevices.getUserMedia` | ✅ P1 (Q4) |
| Samsung Galaxy A-series (Chrome Android) | Camera | getUserMedia | ✅ P1 (Q4) |
| Samsung Tab Active3 (kiosk tablet) | Camera + Bluetooth HID ring | Both detection paths | ✅ P1 |
| Desktop browser | Manual only (keyboard) | Fallback | ⚠ Limited (dev only) |

### 11.2 Detection flow

`detectScannerCapabilities()` → returns capability matrix:
```typescript
type ScannerCapabilities = {
  hardware: boolean;         // Keyboard wedge detected via timing
  camera: boolean;            // getUserMedia available + permissioned
  manual: true;               // Always available
  deviceType: 'zebra' | 'honeywell' | 'datalogic' | 'iphone' | 'android' | 'desktop' | 'unknown';
  preferredMode: 'hardware' | 'camera' | 'manual';
};
```

**Hardware detection heuristic:**
1. UserAgent regex match for known vendors
2. Input event timing analysis: wedge sends chars <50ms apart + Enter at end → burst pattern
3. Fallback: first 3 successful scans use timing to classify user as hardware

**Camera detection:**
1. `navigator.mediaDevices` capability
2. `getUserMedia({ video: true })` permission probe (non-blocking, lazy)
3. Fallback: no camera = hide camera button, show manual prominent

### 11.3 Hardware scanner config (per vendor)

| Vendor | Recommended config |
|---|---|
| Zebra | DataWedge profile `MonoPilot`: decode Code128+GS1-128 enabled, output via `Keystroke Output` with Enter key postfix, scan timeout 3s |
| Honeywell | `Scanner Wedge`: same AI list, Enter terminator |
| Ring (BT) | Pair as HID keyboard, scan Code128 enable only (reduce noise) |

Dokumentacja setup → `monopilot-kira-main/docs/scanner-hardware-setup/` (future).

### 11.4 Camera integration (Q4 P1 core)

**Library:** `@zxing/browser` BrowserMultiFormatReader
- Dependency bundle: ~200KB gzipped
- Import lazy (only when camera button clicked) — Webpack code-splitting

**Viewfinder UI:**
- Full-screen video element (autoplay, playsInline, muted)
- Overlay SVG z scan area marker 300×100px (landscape barcode) lub 200×200 (QR)
- Amber border 2px rounded
- Torch button (top-right) if hardware supports (test `track.getCapabilities().torch`)
- Close button (top-left)
- Front/rear switch (top-center)

**Performance:**
- FPS limit 10 (CPU save)
- Debounce duplicate scans 1000ms
- Auto-close after successful decode (300ms)
- Permission denial → graceful fallback to manual

**Alternative:** native `BarcodeDetector` API (iOS 17+, Chrome Android) — smaller bundle, ale ograniczony format support (Code128 OK, DataMatrix iOS only Q3 2024+). Użyjemy jako fast-path jeśli `'BarcodeDetector' in window`, fallback zxing.

---

## §12 — Authentication & Security

### 12.1 Authentication model

**Flow:**
1. Username + PIN entry (SCN-010 + SCN-011)
2. `POST /api/scanner/login` → bcrypt pin match → `scanner_sessions` row → token JWT
3. Token stored localStorage (`scanner_session_token`) + HttpOnly cookie (`scanner_session` refresh)
4. Auto-refresh sliding expiration (idle timeout per device_mode D7)

**Token claims:**
```json
{
  "user_id": "uuid",
  "org_id": "uuid",
  "site_id": "uuid",
  "line_id": "uuid",
  "device_mode": "personal|kiosk",
  "roles": ["warehouse.operator", "quality.inspector"],
  "iat": 1713456000,
  "exp": 1713456300
}
```

**Refresh:**
- Each API call sliding: if `(exp - now) < 60s` → server issues new token
- Idle beyond `scanner_idle_timeout_sec` → 401 `SC_SESSION_EXPIRED` → redirect SCN-010

### 12.2 PIN policy (D8)

Per §6 D8. Server-side enforcement:
- `POST /api/scanner/pin/setup` z policy check:
  - Length 4-6 digits numeric
  - No sequential (1234, 4321) jeśli `forbid_sequential=true`
  - No repeating (1111, 2222) jeśli `forbid_repeating=true`
  - Min unique digits (default 3) jeśli `min_unique_digits > 0`
- Storage: `users.scanner_pin_hash` (bcrypt rounds 10)
- Rotation tracked: `users.pin_last_changed_at` timestamp
- Forced rotation cron (daily): jeśli `now - pin_last_changed_at > rotation_days` → set `users.pin_rotation_required=true` → next login forces SCN-pin-change before proceeding

### 12.3 Rate limiting

| Endpoint | Limit |
|---|---|
| `/api/scanner/login` | 5 failed attempts per user per 10min → lockout (V-SCAN-LOGIN-002). Admin unlock only. |
| `/api/scanner/login` | 20 attempts per IP per 1min → rate-limit 429 |
| Scan operations (post-auth) | 300 req/min per user (burst 50) |
| Sync endpoint (P2) | 10 req/min per user |

### 12.4 Session security

| Aspect | Measure |
|---|---|
| Token validity | Short-lived (5min sliding), refresh cookie 8h (personal) / 60s (kiosk) |
| Transport | HTTPS only, HSTS, `SameSite=Strict` cookie |
| Storage | JWT in localStorage (scanner context), refresh in HttpOnly cookie |
| CSRF | Double-submit cookie pattern for POST ops |
| Concurrent sessions | Max 1 active session per user (new login ends previous) — per 02-SETTINGS §14 policy |
| Audit | Every login/logout/PIN change/failed attempt logged to `scanner_audit_log` |

### 12.5 Authorization (RBAC)

Role hierarchy per 02-SETTINGS §14:
- `scanner.access` — base role (wymagane dla każdego scanner workflow)
- `warehouse.operator` — SCN-020/030/031/040/060 access
- `production.operator` — SCN-050/080/081/082/083/084 access
- `quality.inspector` — SCN-070/071/072/073 access
- `scanner.supervisor` — override authority (FEFO override approval, LP unlock, session terminate)
- `scanner.admin` — PIN reset (delegated from 02-SETTINGS admin)

RLS on `scanner_audit_log`: `org_id = auth.org_id()` + `site_id IN auth.allowed_sites()`.

### 12.6 Security incident handling

- 5 failed PIN attempts → user locked 10min + email notification do supervisor (per 02-SETTINGS §13 EmailConfig)
- Concurrent login attempt while session active → old session force-logout + `scanner_audit_log` entry type='session_hijack_suspected'
- Idle kiosk beyond 60s → auto-logout + force PIN re-entry
- Supervisor override of LP lock → audit log z `metadata.override_by_supervisor=true` + reason_code mandatory

---

## §13 — Offline Queue Contract (P2)

**Note:** Full implementation Phase 2. P1 obejmuje tylko detection + placeholder.

### 13.1 Storage

**IndexedDB database:** `scanner-queue`
- Object store: `operations`
- Keys: `client_operation_id` (UUID v4)
- Schema:
```typescript
type QueuedOperation = {
  client_operation_id: string;
  op_type: 'receive_po' | 'receive_to' | 'move' | 'putaway' | 'split' | 'pick' | 'consume' | 'output' | 'coproduct' | 'waste' | 'qa_inspect';
  endpoint: string; // '/api/warehouse/scanner/receive-po-line'
  method: 'POST' | 'PUT';
  payload: Record<string, any>;
  created_at: number; // Unix ms
  status: 'queued' | 'syncing' | 'synced' | 'failed' | 'expired';
  synced_at?: number;
  retry_count: number;
  last_error?: string;
  ttl_expires_at: number; // 72h from created_at
};
```

### 13.2 Sync protocol (05-WH §13.6 consumer)

**Endpoint:** `POST /api/scanner/sync-queue` — batch sync
```json
{
  "operations": [
    { "client_operation_id": "uuid", "op_type": "...", "payload": {...} },
    ...
  ]
}
```

**Response:**
```json
{
  "results": [
    { "client_operation_id": "uuid", "success": true, "data": {...} },
    { "client_operation_id": "uuid2", "success": false, "error": { "code": "SC_LP_CONSUMED", "message": "..." } }
  ]
}
```

**Server-side:**
1. Idempotency check: lookup `scanner_audit_log.client_operation_id` — skip jeśli exists (return cached result)
2. Process FIFO (preserve order), abort-on-critical-error flag per op
3. Apply same validation as online (5-WH §13 contracts)
4. Conflict (409): return current state + suggested action ("re-scan LP", "update qty")

### 13.3 Sync triggers

- Auto on `navigator.onLine` = true event
- Auto on `visibilitychange` to visible (tab foreground)
- Manual "Sync Now" button w SCN-090
- Periodic check 30s (if pending > 0)

### 13.4 Conflict resolution UX (SCN-090)

Per-op result shown:
- ✅ Synced — auto-remove from queue
- ❌ Failed — show error code + message + reason + [Retry] / [Discard] buttons
- ⏰ Expired — auto-mark after 72h, user must re-do operation from scratch

### 13.5 Validation

| Rule | Enforcement |
|---|---|
| Max 100 ops per device | Block new ops w amber modal |
| TTL 72h | Cron daily cleanup + UI badge "Expired: 3" |
| Idempotency server-side | Skip duplicate by `client_operation_id` |
| FIFO order | Client enforces queue order, server processes sequentially |

---

## §14 — API Contract

### 14.1 Endpoint catalog (P1)

**Auth / session:**
- `POST /api/scanner/login` — FR-SC-BE-001
- `POST /api/scanner/logout` — FR-SC-BE-002
- `GET /api/scanner/session` — FR-SC-BE-003
- `POST /api/scanner/pin/setup` — FR-SC-BE-004
- `POST /api/scanner/pin/change` — FR-SC-BE-005
- `GET /api/scanner/context/sites` — FR-SC-BE-006
- `GET /api/scanner/context/lines` — FR-SC-BE-007
- `GET /api/scanner/context/shifts` — FR-SC-BE-008
- `POST /api/scanner/context` — FR-SC-BE-009

**Shared utility:**
- `GET /api/scanner/lookup/:type/:barcode` — FR-SC-BE-011 (type ∈ lp/location/product/po/to/wo/auto)
- `POST /api/scanner/audit` — FR-SC-BE-012

**Warehouse (consumer 05-WH §13):**
- `GET /api/warehouse/scanner/pending-receipts` — FR-SC-BE-020
- `GET /api/warehouse/scanner/po/:id/lines` — FR-SC-BE-021
- `POST /api/warehouse/scanner/receive-po-line` — FR-SC-BE-022
- `POST /api/warehouse/scanner/receive-to-line` — FR-SC-BE-023
- `GET /api/warehouse/scanner/putaway/suggest/:lpId` — FR-SC-BE-024
- `POST /api/warehouse/scanner/putaway` — FR-SC-BE-025
- `POST /api/warehouse/scanner/lock-lp` — FR-SC-BE-030 (05-WH §13.4)
- `POST /api/warehouse/scanner/release-lock` — FR-SC-BE-031
- `POST /api/warehouse/scanner/move-lp` — FR-SC-BE-032
- `POST /api/warehouse/scanner/split-lp` — FR-SC-BE-033
- `GET /api/warehouse/scanner/inventory` — 05-WH §13.1 (consumer, read-only)
- `POST /api/warehouse/scanner/suggest-lp` — FR-SC-BE-043 (05-WH §13.5)

**Production:**
- `GET /api/production/scanner/pick-lists` — FR-SC-BE-040
- `GET /api/production/scanner/pick-list/:woId` — FR-SC-BE-041
- `POST /api/production/scanner/pick` — FR-SC-BE-042
- `POST /api/production/scanner/consume-to-wo` — FR-SC-BE-044 (NEW v3.0)
- `GET /api/production/scanner/active-wos` — FR-SC-BE-045
- `GET /api/production/scanner/wo/:id/materials` — FR-SC-BE-046
- `POST /api/production/scanner/output` — FR-SC-BE-050
- `POST /api/production/scanner/co-product` — FR-SC-BE-051
- `POST /api/production/scanner/waste` — FR-SC-BE-052

**Quality:**
- `GET /api/quality/scanner/pending-inspections` — FR-SC-BE-053
- `POST /api/quality/scanner/inspect` — FR-SC-BE-054
- `GET /api/quality/scanner/failure-reasons` — FR-SC-BE-055

**Offline (P2):**
- `POST /api/scanner/sync-queue` — FR-SC-BE-070

### 14.2 Standard headers

| Header | Required | Value |
|---|---|---|
| `Authorization` | Yes | `Bearer <jwt>` (scanner_session_token) |
| `X-Client-Operation-Id` | Yes (mutating ops) | UUID v4 (idempotency) |
| `X-Scanner-Device-Type` | Yes | zebra/honeywell/iphone/android/desktop |
| `X-Scanner-Scan-Method` | Yes | hardware/camera/manual |
| `X-Scanner-Device-Mode` | Yes | personal/kiosk |
| `Content-Type` | POST/PUT | application/json |

### 14.3 Standard response envelope

Success:
```json
{ "success": true, "data": { /* payload */ }, "error": null }
```

Error:
```json
{ "success": false, "data": null, "error": { "code": "SC_LP_NOT_FOUND", "message": "LP 'LP001' not found", "severity": "block"|"warn"|"info", "context": { "barcode": "LP001" } } }
```

### 14.4 Error code registry

**SC_* generic:**
- `SC_UNAUTHORIZED` (401)
- `SC_SESSION_EXPIRED` (401)
- `SC_RATE_LIMITED` (429)
- `SC_INVALID_BARCODE` (400)
- `SC_CONTEXT_MISSING` (400, no site/line/shift set)

**SC_LP_* LP-specific:**
- `SC_LP_NOT_FOUND` (404)
- `SC_LP_LOCKED` (409, held_by another user)
- `SC_LP_CONSUMED` (409)
- `SC_LP_QA_HOLD` (409)
- `SC_LP_BLOCKED` (409)
- `SC_LP_QTY_INSUFFICIENT` (409)

**SC_WO_* WO-specific:**
- `SC_WO_NOT_FOUND` (404)
- `SC_WO_NOT_IN_PROGRESS` (409)
- `SC_WO_MATERIAL_NOT_IN_BOM` (400)
- `SC_WO_CASCADE_PARENT_NOT_READY` (409)

**SC_PO_/SC_TO_:**
- `SC_PO_NOT_FOUND` (404)
- `SC_PO_FULLY_RECEIVED` (409)
- `SC_PO_OVER_RECEIPT_EXCEEDED` (409)
- `SC_TO_NOT_IN_TRANSIT` (409)

**SC_QA_:**
- `SC_QA_ALREADY_INSPECTED` (409)
- `SC_QA_MISSING_FAILURE_REASON` (400)

### 14.5 SLOs

| Endpoint class | P50 | P95 |
|---|---|---|
| `GET lookup/*` | <100ms | <200ms |
| `GET pending-*` / lists | <150ms | <300ms |
| `GET putaway/suggest` | <150ms | <300ms |
| `POST receive-*` / mutating | <200ms | <500ms |
| `POST login` | <300ms (bcrypt cost) | <800ms |

---

## §15 — Validation Rules V-SCAN-*

### 15.1 Login & auth

| ID | Rule | Severity |
|---|---|---|
| V-SCAN-LOGIN-001 | PIN length 4-6 digits | block |
| V-SCAN-LOGIN-002 | Rate limit 5 failed / 10min → lockout | block (10min) |
| V-SCAN-LOGIN-003 | PIN complexity policy enforced (D8) | block (at setup/change) |
| V-SCAN-LOGIN-004 | Forced rotation after configured days | warn + force change |
| V-SCAN-LOGIN-005 | Session token HMAC + TTL valid | block 401 |
| V-SCAN-LOGIN-006 | Max 1 active session per user | warn (end previous) |

### 15.2 Scan input

| ID | Rule | Severity |
|---|---|---|
| V-SCAN-INPUT-001 | GS1-128 GTIN-14 check digit valid | warn (still parse, log) |
| V-SCAN-INPUT-002 | Barcode format detected within 3 methods | block 400 |
| V-SCAN-INPUT-003 | Manual input length ≤ 100 chars | block 400 |
| V-SCAN-INPUT-004 | Camera scan debounce 1s (no duplicate) | auto-skip |

### 15.3 LP operations

| ID | Rule | Severity |
|---|---|---|
| V-SCAN-LP-001 | LP lock acquired before mutation | block 409 |
| V-SCAN-LP-002 | LP lock 5min auto-release | auto-cleanup |
| V-SCAN-LP-003 | LP status ∈ allowed for operation type | block 409 |
| V-SCAN-LP-004 | Qty ≤ lp.current_qty | block 409 |
| V-SCAN-LP-005 | Split qty < original qty | block 400 |
| V-SCAN-LP-006 | Move destination ≠ current location | block 400 |

### 15.4 WO operations

| ID | Rule | Severity |
|---|---|---|
| V-SCAN-WO-001 | WO status = IN_PROGRESS for consume/output | block 409 |
| V-SCAN-WO-002 | Material matches BOM line | block 400 |
| V-SCAN-WO-003 | FEFO deviation — soft warn + reason_code (05-WH Q6B) | warn |
| V-SCAN-WO-004 | Partial consume before output → warn + reason_code | warn |
| V-SCAN-WO-005 | Output qty > 0 | block 400 |
| V-SCAN-WO-006 | Output batch mandatory | block 400 |
| V-SCAN-WO-007 | Output expiry date ≥ today (unless best_before) | block 400 |

### 15.5 Putaway

| ID | Rule | Severity |
|---|---|---|
| V-SCAN-PUT-001 | Override non-suggested location → reason_code mandatory | warn |
| V-SCAN-PUT-002 | Location exists and available | block 404/409 |
| V-SCAN-PUT-003 | LP not already at destination | block 400 |

### 15.6 QA

| ID | Rule | Severity |
|---|---|---|
| V-SCAN-QA-001 | LP qa_status = pending for inspect | block 409 |
| V-SCAN-QA-002 | Fail → failure_reason_id required | block 400 |
| V-SCAN-QA-003 | Fail → create NCR basic (09-QUALITY module) | info |
| V-SCAN-QA-004 | Inspector_id = auth user | auto |

### 15.7 Offline queue (P2)

| ID | Rule | Severity |
|---|---|---|
| V-SCAN-OFFLINE-001 | Max 100 ops per device | block + alert |
| V-SCAN-OFFLINE-002 | TTL 72h enforced | auto-expire |
| V-SCAN-OFFLINE-003 | Idempotency via client_operation_id | auto-skip dupe |
| V-SCAN-OFFLINE-004 | FIFO order preserved | auto |

---

## §16 — Telemetry, Build Sequence, Changelog

### 16.1 Telemetry

**Scanner-specific events** (sent to PostHog per 02-SETTINGS §10):

| Event | Payload |
|---|---|
| `scanner.login` | user_id, site_id, device_mode, device_type, scan_method |
| `scanner.logout` | session_duration_s, reason (manual/idle/forced) |
| `scanner.scan.success` | workflow, scan_method, latency_ms |
| `scanner.scan.error` | workflow, error_code, scan_method |
| `scanner.workflow.complete` | workflow, duration_s, steps_count |
| `scanner.workflow.abandon` | workflow, step_abandoned_at |
| `scanner.fefo_deviation` | wo_id, suggested_lp, selected_lp, reason_code |
| `scanner.override.putaway` | lp_id, suggested_loc, selected_loc, reason_code |
| `scanner.offline.queue.size` | pending_ops_count (sampled every 30s) |
| `scanner.offline.sync.complete` | synced_count, failed_count, duration_s |
| `scanner.camera.permission.grant` / `.deny` | device_type |

### 16.2 Dashboard KPIs (desktop 12-REPORTING consumer)

Widok per site/line/zmiana:
- Scans per hour (avg last 24h)
- Scan success rate (1st attempt)
- Avg scan→response latency
- Top 5 workflows by volume
- Top 5 error codes
- Offline queue current size (P2)
- Device breakdown (Zebra/Honeywell/iPhone/Android %)

### 16.3 Build sequence — 5 sub-modules

| Sub-module | Scope | Sesji impl est. | Dependencies |
|---|---|---|---|
| **06-a: Shell & Core** | SC-E1 (login, PIN, site-select, home, settings, feedback, parser, auth, detect, camera component) | 5-6 | 02-SETTINGS PIN policy + user mgmt |
| **06-b: Warehouse In** | SC-E2 (SCN-020 PO, SCN-030 TO, SCN-040 putaway) | 4-5 | 05-WH GRN §7 + putaway §8.4 + FEFO §9.1 |
| **06-c: Warehouse Movement** | SC-E3 (SCN-031 move, SCN-060 split) | 3-4 | 05-WH split/merge §6.4-6.5 |
| **06-d: Production Pick + Consume** | SC-E4 (SCN-050 pick, SCN-080 consume-to-WO + SCN-081 WO execute) | 6-7 | 04-PLAN reservations §5.10 + 05-WH §10 intermediate + 08-PROD stub |
| **06-e: Production Output + QA** | SC-E5 (SCN-082 output, SCN-083 co-product, SCN-084 waste, SCN-071-073 QA) | 4-6 | 08-PROD output + 09-QA NCR basic |

**Total P1:** 22-28 sesji impl (1 sesja ~= 1 dzień focused work). Phase 2 sub-modules (06-f offline, 06-g PWA, etc.) = post-P1 per customer demand.

### 16.4 Risks & mitigations

**Phase 1:**

| Ryzyko | Prawdop. | Wpływ | Mitygacja |
|---|---|---|---|
| Camera scan success rate <85% w warehouse lighting | Średnie | Średni | Torch toggle, manual fallback zawsze dostępny, test na 3+ device types |
| PIN rotation disruptive dla operatorów | Wysokie | Niski | Admin default 180d (nie 30d), self-service change w SCN-settings, 7-day warning |
| LP lock 5min hijack scenarios (supervisor emergency override) | Niskie | Średni | Supervisor override requires reason_code + audit log + email notification |
| FEFO deviation rate high → data quality concerns | Średnie | Średni | Dashboard report per operator FEFO compliance %, training feedback |
| Kiosk 60s idle timeout frustrates operators | Średnie | Średni | Pilot test 60s vs 90s vs 120s na 3 liniach, adjust per feedback |
| 3-method input parity UX complexity | Średnie | Niski | Auto-detect preferred method, button order zgodny z detected capability |
| Hardware fleet fragmentation (Zebra/Honeywell/BT ring) | Niskie | Średni | Keyboard wedge universal fallback, device-specific profiles w docs |
| Brak test data blokuje dev/QA | Wysokie | Wysoki | `npm run seed:scanner` mandatory, fixtures per workflow |
| Intermediate cascade consume UX confusing (Q6 revised) | Średnie | Wysoki | Pilot test SCN-080 z 3 operatorami linii 2 (multi-stage RM→intermediate→FG WOs), iterate before full rollout |

**Phase 2:**

| Ryzyko | Prawdop. | Wpływ | Mitygacja |
|---|---|---|---|
| Offline sync conflicts high | Wysokie | Wysoki | Server-authoritative, idempotency keys, clear UX dla conflict resolution |
| iOS PWA install awkward (Safari limitations) | Średnie | Średni | Progressive enhancement, iOS install instructions page |
| IndexedDB quota exceeded | Niskie | Średni | 100 op cap + TTL 72h = ~500KB max |
| Camera quality różni per device | Średnie | Średni | Library zxing robust, hardware wedge primary zawsze dostępny |

### 16.5 Open questions carry-forward (C2 Sesja 3 close)

| ID | Pytanie | Rozstrzygnięcie w |
|---|---|---|
| OQ-SC-01 | Card scan na SCN-010 (login) — jaki format? NFC / barcode / QR? | 06-a build start (po 02-SETTINGS user mgmt final) |
| OQ-SC-02 | Shift enforcement — czy operator może pracować poza swoją deklarowaną zmianą? | 06-a build (po 02-SETTINGS shifts config) |
| OQ-SC-03 | Biometric as PIN alternative (Touch ID / Face ID) — P1 or P2? | Customer demand signal (default P2) |
| OQ-SC-04 | Label printing integration (ZPL trigger from scanner) — P2 timing? | Post-P1, 05-WH WH-E07 budget |
| OQ-SC-05 | Operator productivity leaderboard (gamification) — in scope 12-REPORTING? | 12-REPORTING PRD writing |
| OQ-SC-06 | Multi-language per user vs per site — runtime override? | 02-SETTINGS §14 i18n final spec |
| OQ-SC-07 | Hardware wedge + camera parallel active → first-to-scan wins or conflict prevention? | 06-a build (empirical test) |

### 16.6 Changelog

**v3.1.1 (2026-04-30) — PRD ↔ UX reconciliation pass**
- Added screen IDs **SCN-011b** PIN First-time Setup + **SCN-011c** PIN Change Self-service to §7.3 catalog (UX `:240-258`); enumerated as FR-SC-FE-003b/003c (HIGH).
- Added **SCN-013 Devices** screen (admin device fleet pairing+health) — anchors prototype `devices_screen` (`design/Monopilot Design System/settings/ops-screens.jsx:4-95`) which moved from settings to scanner index during 2026-04-30 labeling fix; FR-SC-FE-004b (MEDIUM). `[UNIVERSAL]` per ADR-034.
- Added **SCN-095 LP Inquiry** (P2 with P1 shell) anchoring orphan `inquiry_screen` prototype (UX `:1057-1063` §5.7); FR-SC-FE-074 + FR-SC-BE-072 (MEDIUM, P2). `[UNIVERSAL]` per ADR-034.
- Added **§8.8 UI Surfaces Traceability Matrix** — bidirectional PRD ↔ UX line ↔ prototype label table (24 screens + 11 modal contracts); coverage 95% → ≥98%.
- No content removed; all FR-SC-BE-NNN/FR-SC-FE-NNN existing IDs unchanged.

**v3.1 (2026-04-30) — Multi-industry code standardization**
- **Code nomenclature update:** FA codes → **FG** (Finished Goods), PR codes → **WIP-<2-letter-process-suffix>-<7-digit-sequence>** per 01-NPD v3.2 multi-industry manufacturing operations pattern
- Examples updated: "FA-BRD-0001" → "FG-BRD-0001", "PR-A-001" → "WIP-BK-0000001", "PR-H-002" → "WIP-MX-0000042"
- Transaction payloads and validation examples aligned to new code formats
- **Barcode parsing & validation logic: unchanged** — only examples and documentation updated
- All acceptance criteria and UX patterns remain valid with new code nomenclature
- Cross-reference: 01-NPD v3.2 (manufacturing operations §12), 05-WAREHOUSE v3.1 (LP codes §6), 03-TECHNICAL v3.0 (product codes §3)
- No functional changes to scanner workflows, validation rules, or architecture

**v3.0 (2026-04-20) — Phase D aligned, C2 Sesja 3**
- Module renumbered M05 → 06 per Phase D §4.2
- 16-sekcja structure aligned z 04-PLANNING / 05-WH v3.0
- **D5 NEW: 3-method input parity (Q4)** — hardware + camera + manual wszystkie P1
- **D7 NEW: Kiosk vs personal device mode (Q5)** — 60s vs 300s idle
- **D8 NEW: PIN policy admin-configurable rotation (Q7)** — default 180d
- **D9 NEW: Per-severity error policy (Q6)** — block/warn/info
- **SCN-080 Consume-to-WO NEW** — intermediate cascade core (05-WH §10 consumer)
- **SCN-081 WO execute central screen** — tabs + next-sug + 4 actions (z HTML prototype)
- **SCN-083 Co-product + SCN-084 Waste** NEW sub-flows (z HTML prototype)
- **SCN-060 Split LP promoted P1** (Q9, baseline Phase 2)
- **SCN-012 Site/Line/Shift select** NEW (multi-tenant L2 prep)
- **LP lock protocol 5min** NEW (05-WH §13.4 consumer)
- **Username + PIN auth** (previously session reuse z desktop)
- API routes restructured: `/api/scanner/*` + `/api/{module}/scanner/*`
- Error code registry SC_/SC_LP_/SC_WO_/SC_PO_/SC_TO_/SC_QA_/SC_OFFLINE_
- 21 validation rules V-SCAN-* (LOGIN/INPUT/LP/WO/PUT/QA/OFFLINE)
- 5 sub-modules 06-a..e build sequence (was 3 sub-modules baseline)
- Risk matrix rozszerzona (intermediate cascade UX, FEFO deviation dashboard, 3-method parity complexity)

**v1.2 (2026-02-18) — pre-Phase-D**
- site_id UUID NULL w scanner_audit_log + device_type/scan_method
- M05-E3b SO pick Phase 1 po M07
- ADR-008 audit_log exception documented

**v1.1 (2026-02-xx) — pre-Phase-D**
- Putaway jako osobny workflow (separation from Move)
- Pick WO-only (SO pick = M05-E3b)
- scanner_audit_log separate table

**v1.0 (2026-02-xx) — initial consolidation z ANALYSIS + ADR-006**

---

## Appendix A — Reference to prototype HTML

**Primary UX reference:** `SCANNER-PROTOTYPE (2).html` (~1826 linii, 34 sub-screens, 11 workflows) + `SCANNER-SCREEN-INDEX (1).md` (lookup table).

Mapping major SCN codes → HTML screens (per `SCANNER-SCREEN-INDEX`):

| SCN code | HTML screens (range) |
|---|---|
| SCN-010/011 | login 270-320, login-pin 321-360 |
| SCN-012 | site-select 361-430 |
| SCN-home | home 431-465 |
| SCN-020 | po-list 1096, po-lines 1121, po-item 1151, po-done 1201 |
| SCN-030 | to-list 1221, to-scan 1246, to-done 1281 |
| SCN-031 | move-lp 1451, move-done 1496 |
| SCN-040 | putaway-scan 1306, putaway-suggest 1351, putaway-done 1421 |
| SCN-050 | pick-wo-list 926, pick-list 961, pick-scan 1011, pick-done 1071 |
| SCN-060 | split-lp 1521, split-done 1571 |
| SCN-070/071/072/073 | qa-list 1601, qa-inspect 1641, qa-fail-reason 1691, qa-done 1731 |
| SCN-080/081 | wo-list 466, wo-detail 491, wo-execute 541, wo-scan 601 |
| SCN-082 | wo-output 651, wo-output-done 711 |
| SCN-083 | wo-coproduct 751, wo-coproduct-done 801 |
| SCN-084 | wo-waste 831, wo-waste-done 891 |

**Design system z prototype lockowane w §9 UX Patterns.**

**Note:** User confirmed 2026-04-20 że design całości będzie updatowany (może wyglądać "trochę inaczej") ale bazą jest aktualny prototype. Pixel-level tokens (color values, spacing) mogą ulec zmianie w iteracjach implementacji; **struktura screens, workflow semantics, FR/NFR są final v3.0**.

---

## Appendix B — Related PRDs & Foundations

**Phase D aligned dependencies (v3.1 — Multi-industry code standardization):**
- `01-NPD-PRD.md` v3.2 — **§12 Validation Rules, manufacturing operations code format (FG-*, WIP-<suffix>-<seq>)**, multi-industry recipe support
- `00-FOUNDATION-PRD.md` v3.0 — tech stack §5, markers §3, multi-tenant foundations §8, ADR-028/029/030/031
- `02-SETTINGS-PRD.md` v3.0 — §6 schema admin, §7 rules registry (read-only), §14 security+i18n+PIN config, §10 feature flags, §13 EmailConfig
- `03-TECHNICAL-PRD.md` v3.0 — §6 item master + rm/intermediate/fg (formerly fa), §7 BOM snapshot + co-products, §8 catch weight GS1 AI
- `04-PLANNING-BASIC-PRD.md` v3.1 — §5.10 reservations RM root only (post-revision), §8 WO cascade DAG + disposition to_stock P1, §12 release-to-warehouse trigger (scanner visibility)
- `05-WAREHOUSE-PRD.md` v3.1 — §6 LP state machine + lock protocol + FG/WIP code alignment, §7 GRN multi-LP Q1, §8 putaway + ltree locations, §9 FEFO rule, **§10 Intermediate LP Handling (scan-to-consume core)**, §11 lot genealogy, §13 Scanner Integration contract (full consumer interface)
- `08-PRODUCTION-PRD.md` (pending C3) — WO execution engine, output registration, co-product allocation
- `09-QUALITY-PRD.md` (pending C4) — QA holds, NCR basic, failure reasons registry
- `_foundation/research/MES-TRENDS-2026.md` §9 "06-SCANNER-P1" — mobile MES trends, PWA vs RN comparison, hardware fleet patterns, food-mfg UX

**Primary HANDOFFs:**
- `2026-04-20-c2-sesja2-close.md` — C2 Sesja 2 close → C2 Sesja 3 bootstrap (scope input this PRD)
- `2026-04-20-c2-sesja3-close.md` (this session output, pending) — C2 Sesja 3 close → C3 bootstrap

**Related ADRs:**
- ADR-006 Scanner-First UX (foundation)
- ADR-008 Audit Trail (with scanner exception — separate table)
- ADR-028 Schema-driven ext cols (L3 on scanner_audit_log + scanner_sessions)
- ADR-029 Rule engine DSL (`fefo_strategy_v1` consumer)
- ADR-031 Multi-tenant variation (site/line/device_mode per tenant L2)
- ADR-034 Generic product lifecycle naming & industry configuration (`[UNIVERSAL]` entity labels — Devices/LP/WO are industry-agnostic; tenant-level prefix renaming applies in 03-TECHNICAL/01-NPD reference data, scanner UI uses generic labels)

---

_PRD 06-SCANNER-P1 v3.1 — 9 major SCN codes + ~34 sub-screens, ~70 FR P1 (BE+FE combined), 16 sekcji, 9 D-decisions, 21 validation rules, 3-method input parity (hardware+camera+manual), intermediate cascade scan-to-consume core (SCN-080), 5 sub-modules build 06-a..e (22-28 sesji impl est.). Phase D aligned (Phase 0+A+D+Research+B+C1+C2 Sesji 1+2 foundation). Consumer 05-WH v3.1 §13 Scanner Integration contract. v3.1 Multi-industry code standardization: FA→FG (Finished Goods), PR→WIP-<2-letter-suffix>-<7-digit-seq> per 01-NPD v3.2. Kluczowe inowacje v3.0 vs v1.2: SCN-080 consume-to-WO, username+PIN auth, LP lock protocol 5min, 3-method input parity Q4, kiosk/personal device mode Q5, per-severity error policy Q6, split LP P1 promotion Q9. Build unlock chain: 02-SETTINGS → 06-a → 05-WH+03-TECH → 06-b+06-c → 04-PLAN+05-WH §10+08-PROD stub → 06-d → 08-PROD output+09-QA → 06-e._
_Data: 2026-04-30 (C2 Sesja 3 standardization update)._
