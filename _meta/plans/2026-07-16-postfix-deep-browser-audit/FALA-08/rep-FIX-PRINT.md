# FALA 08 / FIX-PRINT — postfix po cross-review T2

**Data:** 2026-07-29  
**Tor:** inwentaryzacja (R08-03) + druk etykiety LP (R08-05)

## T2-1 [P1] — import modala bez pliku w patchu

**Problem:** `lp-detail.client.tsx` importował `./lp-print-label-modal.client`, ale plik był pusty / nieśledzony (`??` w `git status`).

**Naprawa:** Zweryfikowano istnienie pliku (`/bin/ls`, `grep export` → `export function LpPrintLabelModal` L36). Komponent jest kompletny (~200 linii): Modal + Input + Select, walidacja kopii, przekazanie `printAction`.

**Pliki:** `license-plates/[lpId]/_components/lp-print-label-modal.client.tsx` (istniejący, nieśledzony — do zastagowania przy commicie).

## T2-2 [P1] — brak egzekwowania site drukarki po stronie serwera

**Problem:** Filtr site był tylko w `page.tsx` (`loadSitePrinters`); `printLabel` akceptował dowolne `printerId` z orgu.

**Naprawa:** W `printers.ts` dodano `assertPrinterSiteScope` (L227–233): po `loadPrinterMode` + `loadLicensePlateForLabel`, gdy drukarka ma `site_id`, musi zgadzać się z `lp.site_id` (drukarki org-wide `site_id IS NULL` przechodzą). Błąd domenowy: `throw new Error('printer_site_mismatch')` — spójnie z `printer_not_found`; adapter `printLpLabel` łapie i zwraca `{ status: 'failed', code }`.

**Mapowanie UI:** `lp-detail.client.tsx` L398 — `printer_site_mismatch` → `labels.labels.errors.printerSiteMismatch` (fallback w `lp-detail-labels.ts` L603–605).

**Pliki:**
- `settings/infra/printers/_actions/printers.ts` L227–233, L471–472
- `license-plates/[lpId]/_components/lp-detail.client.tsx` L398
- `license-plates/[lpId]/_components/lp-detail-labels.ts` L172, L603–605

## T2-3 [P1] — czerwony test wiersza bez LP

**Problem:** Test oczekiwał aria-label w starym formacie (`Counted qty — A-01-01 R-1001` ze spacją między lokalizacją a kodem), a `entryQtyAriaLabel` łączy segmenty em-dashami (`Counted qty — A-01-01 — R-1001`).

**Naprawa:** Zaktualizowano asercję testu do faktycznego formatu `join(' — ')`.

**Pliki:** `counts/_components/__tests__/count-session-detail.test.tsx` L247–250

## T2-4 [P2] — martwa walidacja „wybierz drukarkę”

**Problem:** `useEffect` auto-ustawiał `printerId = printers[0].id`, więc `printerError` (`printerId === ''`) nigdy nie był prawdziwy.

**Naprawa:**
- Usunięto auto-wybór pierwszej drukarki przy otwarciu modala.
- Dodano `submitAttempted`; `printerError` pokazuje się po próbie submitu bez wyboru.
- Submit włączony gdy kopie poprawne (`copiesValid`), walidacja drukarki w `submit()` przed wywołaniem akcji.
- Testy LP: helper `selectPrintPrinter()` + jawny wybór przed submit.

**Pliki:**
- `lp-print-label-modal.client.tsx` L57, L70–71, L79–86, L94–99
- `lp-detail.test.tsx` L186–190, L643, L687, L720

## T2-5 [P2] — błąd ładowania drukarek = „brak konfiguracji”

**Problem:** `loadSitePrinters` w `catch` zwracał `[]`, UI pokazywało `noPrinters`.

**Naprawa:**
- `loadSitePrinters` zwraca `{ printers, loadError }`.
- `page.tsx` przekazuje `sitePrintersLoadError` do `LpDetailClient` → `LpPrintLabelModal`.
- Modal: `printersLoadError` → `data-testid="lp-print-printers-error"` + `labels.printersLoadError` (czerwony alert); `noPrinters` tylko gdy `loadError === false && printers.length === 0`.

**i18n:** `_meta/i18n-staging/warehouse-lp.json` — `printModal.printersLoadError` (en + pl).

**Pliki:**
- `license-plates/[lpId]/page.tsx` L129–139, L211–214, L235
- `lp-detail.client.tsx` L201, L229–231, L1228
- `lp-print-label-modal.client.tsx` L42, L52, L149–152, L198
- `lp-detail-labels.ts` L203, L571–573
- `_meta/i18n-staging/warehouse-lp.json`

## Świadomie pozostawione

| Temat | Dlaczego |
|-------|----------|
| **Wymaganie `printerId` w `printLabel`** | Bez `printerId` nadal działa tryb PDF (legacy); walidacja site dotyczy tylko jawnego wyboru drukarki. |
| **Nowy test serwerowy `printer_site_mismatch`** | Zakaz uruchamiania vitest w tej sesji; orchestrator odpala bramkę. Istniejące testy `printers.test.ts` nie rozszerzane. |
| **Staging `printerSiteMismatch` w warehouse-lp.json** | Fallback EN w `lp-detail-labels.ts` wystarcza do merge; klucz opcjonalny przez `t.has`. |
| **Persystencja „ostatniej drukarki”** | Poza zakresem R08-05 (znane w rep-T2). |

## Testy

Nie uruchamiano (zakaz sesji). Zmienione pliki testów:
- `count-session-detail.test.tsx` — poprawiona asercja aria-label
- `lp-detail.test.tsx` — `selectPrintPrinter()` przed submit w scenariuszach druku
