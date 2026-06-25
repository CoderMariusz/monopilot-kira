# Manifest zrzutów ekranu — przewodnik PL dla testerów

Zrzuty ekranu wykonane na żywo (Vercel + Supabase, locale PL, viewport 1440×900,
zalogowany jako `admin@monopilot.test`) dnia 2026-06-25.

Każdy wpis: **plik** · **URL** · **moduł / ekran** · **sugerowana sekcja przewodnika**
(plik `docs/guide/pl/...` + nagłówek, pod którym orkiestrator ma osadzić obraz).

> Uwaga: TYLKO ten plik manifestu został utworzony — pliki `.md` przewodnika NIE były edytowane.
> Osadzanie obrazów w przewodniku wykonuje orkiestrator.

---

## 1. Logowanie i pulpit

| Plik | URL | Moduł / ekran | Sekcja przewodnika |
|------|-----|---------------|--------------------|
| `auth-login.png` | `/pl/login` | Uwierzytelnianie — strona logowania (e-mail + hasło, „Zapamiętaj mnie", SSO wkrótce) | `docs/guide/pl/01-golden-flow-end-to-end.md` → sekcja startowa „Logowanie / Pierwsze kroki" (krok 1) |
| `dashboard-overview.png` | `/pl/dashboard` | Pulpit — KPI (aktywne WO, oczekujące ZZ, wstrzymania jakości), szybkie akcje, ostatnia aktywność | `docs/guide/pl/01-golden-flow-end-to-end.md` → „Pulpit / Przegląd operacyjny" (po zalogowaniu) |

## 2. Produkcja (moduł 08)

| Plik | URL | Moduł / ekran | Sekcja przewodnika |
|------|-----|---------------|--------------------|
| `production-wo-list.png` | `/pl/production/wos` | Produkcja — lista zleceń produkcyjnych (14 WO, zakładki statusów: W toku / Wstrzymane / Zaplanowane / Zakończone / Zamknięte) | `docs/guide/pl/modules/08-production.md` → „Lista zleceń produkcyjnych (WO)" |
| `production-wo-detail.png` | `/pl/production/wos/{id}` (WO-202606-0007, „W toku") | Produkcja — szczegóły WO: paski Zużycie/Wyjście, akcje (Wstrzymaj/Odpad/Waga zmienna/Zakończ), zakładki Przegląd/Zużycie/Wyjście/QA/Genealogia | `docs/guide/pl/modules/08-production.md` → „Szczegóły zlecenia produkcyjnego" |
| `production-register-output-modal.png` | `/pl/production/wos/{id}` → zakładka „Wyjście" → „Zarejestruj wyjście" | Produkcja — modal „Zarejestruj wyrób" (typ wyrobu, ilość kg, waga rzeczywista, numer partii) — bez zatwierdzania | `docs/guide/pl/modules/08-production.md` → „Rejestrowanie wyjścia (wyrobu) — modal" |

## 3. Magazyn (moduł 05)

| Plik | URL | Moduł / ekran | Sekcja przewodnika |
|------|-----|---------------|--------------------|
| `warehouse-hub.png` | `/pl/warehouse` | Magazyn — hub / strona główna modułu (kafelki nawigacyjne) | `docs/guide/pl/modules/05-warehouse.md` → „Magazyn — wprowadzenie / nawigacja" |
| `warehouse-lp-list.png` | `/pl/warehouse/license-plates` | Magazyn — lista nośników LP (14 LP, zakładki: Dostępne / Zarezerwowane / Blokada QC; kolumny Towar/Ilość/Partia/Termin/Status/QA/Lokalizacja) | `docs/guide/pl/modules/05-warehouse.md` → „Lista nośników LP (License Plates)" |
| `warehouse-lp-detail.png` | `/pl/warehouse/license-plates/{id}` | Magazyn — szczegóły pojedynczego LP | `docs/guide/pl/modules/05-warehouse.md` → „Szczegóły nośnika LP" |

## 4. Skaner (moduł 06)

| Plik | URL | Moduł / ekran | Sekcja przewodnika |
|------|-----|---------------|--------------------|
| `scanner-device-login.png` | `/pl/scanner/home` → przekierowanie do `/pl/scanner/login` | Skaner — powłoka urządzenia / ekran logowania (e-mail + klawiatura PIN 4–6 cyfr, status ONLINE) | `docs/guide/pl/modules/06-scanner.md` → „Logowanie na skanerze / wejście do powłoki urządzenia" |

## 5. NPD (moduł 01)

| Plik | URL | Moduł / ekran | Sekcja przewodnika |
|------|-----|---------------|--------------------|
| `npd-pipeline-kanban.png` | `/pl/pipeline` | NPD — pipeline Stage-Gate (widok Kanban; kolumny bramek Brief→Wdrożony; KPI projektów) | `docs/guide/pl/modules/01-npd.md` → „Pipeline NPD (Stage-Gate / Kanban)" |
| `npd-project-gate-brief.png` | `/pl/pipeline/{id}/brief` (Night Proof Sausage) | NPD — szczegóły projektu, zakładka bramki „Brief" + nawigacja po etapach (Brief/Receptura/Opakowanie/Próba/Sensoryka/Pilotaż/Zatwierdzenie/Przekazanie) | `docs/guide/pl/modules/01-npd.md` → „Szczegóły projektu i bramki etapów (gate tabs)" |

## 6. Jakość (moduł 09)

| Plik | URL | Moduł / ekran | Sekcja przewodnika |
|------|-----|---------------|--------------------|
| `quality-holds-list.png` | `/pl/quality/holds` (zakładka „Wszystkie") | Jakość — lista blokad (HLD); zakładki Aktywne/Zwolnione/Wszystkie; filtry typu referencji LP/Partia/ZP/ZZ/GRN | `docs/guide/pl/modules/09-quality.md` → „Blokady jakościowe (Holds)" |
| `quality-hold-detail.png` | `/pl/quality/holds/{id}` (HLD-00001000) | Jakość — szczegóły blokady: kontekst, zablokowane pozycje, zapis zwolnienia (e-podpis / 21 CFR Part 11, decyzja `release_as_is`, rozdział obowiązków V-QA-HOLD-006) | `docs/guide/pl/modules/09-quality.md` → „Szczegóły blokady i zwolnienie z e-podpisem" |

## 7. Planowanie / Zakupy (moduł 04 / 06-purchasing)

| Plik | URL | Moduł / ekran | Sekcja przewodnika |
|------|-----|---------------|--------------------|
| `planning-po-list.png` | `/pl/planning/purchase-orders` | Planowanie — lista zamówień zakupu (8 ZZ; zakładki statusów Wersja robocza/Wysłane/Częściowo przyjęte/Przyjęte/Anulowane; Importuj/Eksportuj/Utwórz) | `docs/guide/pl/modules/06-purchasing.md` → „Zamówienia zakupu (PO) — lista" (alternatywnie `04-planning.md`) |

## 8. Ustawienia (moduł 02)

| Plik | URL | Moduł / ekran | Sekcja przewodnika |
|------|-----|---------------|--------------------|
| `settings-npd-fields.png` | `/pl/settings/npd-fields` | Ustawienia — Pola NPD: wybór działu (Core/Planning/Commercial/Production/Technical/MRP/Procurement) + tabela schematu pól (typ danych, wymagane, widoczne, kolejność) | `docs/guide/pl/modules/02-settings.md` → „Pola NPD (schemat działów)" |

---

## Podsumowanie wykonania

- **Wykonano: 15 zrzutów** (wszystkie z 14 docelowych ekranów + dodatkowo `quality-hold-detail.png`).
- **Ekrany, które się NIE załadowały / odbiegały od planu:**
  - **Modal e-podpisu zwolnienia jakości** — pełny „pusty" modal zwolnienia blokady NIE był osiągalny bez tworzenia danych: jedyna istniejąca blokada (HLD-00001000) jest już **zwolniona**, więc jej widok nie oferuje przycisku zwolnienia (pokazuje tylko niezmienny zapis 21 CFR Part 11). Zamiast tego dołączono `quality-hold-detail.png`, który pokazuje rekord e-podpisu/zwolnienia (decyzja `release_as_is`, rozdział obowiązków). Akcje QA na poziomie wyjścia WO („QA pass"/„QA fail") wykonują się natychmiast (bez modala potwierdzenia), więc nie nadają się jako zrzut „otwartego modala".
  - **Karta bramki „Przekazanie" (handoff)** w NPD zwraca błąd ładowania danych („Nie można załadować danych przekazania"); jako reprezentatywną kartę bramki użyto zakładki **Brief** (`npd-project-gate-brief.png`).
  - **Skaner** `/pl/scanner/home` przekierowuje do `/pl/scanner/login` (powłoka urządzenia wymaga PIN-u) — to oczekiwane wejście do skanera; zrzut przedstawia ekran logowania urządzenia.
- **Uwaga operacyjna:** przepływ logowania na skanerze raz wylogował sesję desktopową (`/pl/login?reason=idle`) — wykonano ponowne logowanie i kontynuowano. Wszystkie ekrany desktopowe renderowały realne dane Supabase.
