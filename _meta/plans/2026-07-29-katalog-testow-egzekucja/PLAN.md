# Egzekucja katalogu testów — plan wykonawczy

**Data:** 2026-07-29 · **Autoryzacja ownera:** pełna, decyzje 1-6 podjęte (niżej)
**Dokument jest SAMOWYSTARCZALNY** — pisany pod świeże okno kontekstowe. Nie zakłada pamięci rozmowy.

---

# 0. Kontekst w trzech zdaniach

Katalog `_meta/plans/2026-07-18-full-test-catalog/` zawiera **1459 testów** aplikacji
(sekcje A-H + J, z anchorami `plik:linia`). Był przerabiany 18-19.07 i **NIE został wykonany** —
udowodnione jest 502 (34%), a **902 pozycje (62%) są nierozstrzygnięte**.
Cała ta ocena jest **starsza o 10 dni od kodu na produkcji** (fale naprawcze 1-12 szły 23-29.07),
więc część werdyktów jest nieaktualna.

## Stan wyjściowy (ostatni pomiar: 19.07)

| Werdykt | Liczba | Znaczenie |
|---|---:|---|
| PASS | 502 | dokładna asercja albo pełna bezpieczna interakcja |
| **FAIL** | **55** | dowód **zaprzeczył** kontraktowi |
| **GAP** | **567** | dowód częściowy / bez dokładnej asercji |
| **BLOCKED** | **335** | brak wykonalnej ścieżki |
| **Razem** | **1459** | |

Źródła prawdy:
- katalog: `_meta/plans/2026-07-18-full-test-catalog/FULL-TEST-CATALOG.md` (1459 pozycji, 9299 linii)
- do przeklikania: `.../BROWSER-CLICKTHROUGH.md` (~165 ekranów / ~436 interakcji)
- klasyfikacja: `.../KLASYFIKACJA-FRONT-BACKEND.md` (FRONT 176 / MIXED 791 / BACKEND 352)
- ostatni bilans: `.../runs/unblock-blocked-2026-07-19/MASTER.md`
- bilans pełny: `.../runs/full-remaining-2026-07-18/FULL-MASTER.md`

---

# 1. DECYZJE OWNERA (podjęte 2026-07-29, obowiązują)

| # | Decyzja | Rozstrzygnięcie |
|---|---|---|
| 1 | Baza do testów | **Supabase dozwolona** — wszystkie dane są testowe, **zero danych produkcyjnych**. Fallback: lokalny Postgres. |
| 2 | Operacje destrukcyjne | **TAK** |
| 3 | Konta testowe z rolami | **TAK** |
| 4 | Integracje zewnętrzne | **tylko wysyłka maili**; D365/SCIM **odłożone** — najpierw samowystarczalna aplikacja, integracje potem |
| 5 | Harness współbieżnościowy | **TAK** |
| 6 | Dopisanie 121 brakujących testów | **TAK** |

## 1.1. Strategia baz — rozstrzygnięcie techniczne

Owner dopuścił Supabase. Mimo to **domyślnym środowiskiem dla suit destrukcyjnych i równoległych
jest lokalny Postgres**, z trzech konkretnych powodów:

1. **Równoległość.** Przebieg z 19.07 udowodnił, że działa: pełny łańcuch migracji
   (488 rekordów, 302 tabele), `app_user` z RLS bez `SUPERUSER`/`BYPASSRLS`, **trzy klony**
   do równoległych torów. Na jednej bazie Supabase trzy tory wchodzą sobie w drogę.
2. **Rozróżnialność przyczyn.** Gdy testy destrukcyjne mielą tę samą bazę, na której stoi
   wdrożona aplikacja, przestaje być odróżnialne „test to zepsuł" od „kod to zepsuł".
   Weryfikacja E2E przestaje być wiarygodna.
3. **Szybkość.** Brak sieci.

**Supabase używamy tam, gdzie tylko ona może dać odpowiedź:** browser-E2E przeciw wdrożonej
aplikacji, prawdziwy Supabase Auth, RLS w konfiguracji produkcyjnej, weryfikacja po deployu.

Komendy lokalne (istnieją w `package.json`):
```
pnpm db:up                # docker compose up -d postgres
pnpm db:migrate:local     # łańcuch migracji na localu
pnpm db:verify:local
pnpm db:down
```
Connection string owner-proda: `DATABASE_URL_OWNER` w `apps/web/.env.local`.
**Dla `psql` zamień `sslmode=no-verify` → `sslmode=require`** (`no-verify` to składnia sterownika Node).

---

# FAZA 0 — ODBLOKOWANIE (musi być pierwsze)

Bez tego reszta się nie wykona. Cztery zadania, wszystkie niezależne → równolegle.

## 0.1. ⚠️ Migracja naprawcza defektu `504` — BLOKER TWORZENIA ORGANIZACJI

**To defekt produkcyjny, nie testowy.** Zweryfikowany na prodzie 2026-07-29, indeks dosłownie:

```sql
CREATE UNIQUE INDEX npd_field_catalog_active_semantic_code_uidx
  ON public.npd_field_catalog
  USING btree (org_id, lower(regexp_replace(TRIM(BOTH FROM code), '[^a-z0-9]+', '', 'g')))
  WHERE (active = true);
```

Klasa znaków `[^a-z0-9]` **nie obejmuje wielkich liter**, więc `regexp_replace` **usuwa je**
zanim `lower()` zdąży je zmniejszyć. Różne kody kolapsują do tego samego klucza →
`duplicate key value violates unique constraint`. Dokumentacja samej migracji 504 opisuje
kolejność `trim → lower → strip`, czyli **inną niż jej własny kod**.

Poprawna kolejność:
```sql
regexp_replace(lower(trim(code)), '[^a-z0-9]+', '', 'g')
```

**Zadanie:** nowa migracja do przodu (następny wolny numer to **543**), przebudowująca **oba**
indeksy (`_code_uidx` i `_label_uidx`). **NIE edytuj zastosowanej migracji 504.**
Migracja musi mieć samowystarczalny post-check `do $$`, który **faktycznie wstawia** dwa kody
różniące się tylko wielkością liter i sprawdza, że oba przechodzą.
**Uwaga:** przebudowa indeksu unikalnego na istniejących danych może paść, jeśli w bazie są już
wiersze kolidujące po poprawnej normalizacji — sprawdź to SELECT-em **przed** napisaniem migracji.

## 0.2. Środowisko testowe

Odtworzyć konfigurację z 19.07: `pnpm db:up` → `pnpm db:migrate:local` → weryfikacja
(`app_user` ma RLS, nie ma `SUPERUSER`/`BYPASSRLS`) → **trzy klony** dla równoległych torów.
Zapisać jako skrypt wielokrotnego użytku, nie jako jednorazową sekwencję —
**poprzedni przebieg tego nie zapisał i dlatego trzeba to robić od nowa.**

## 0.3. Konta testowe z rolami (decyzja 3)

Utworzyć i **udokumentować** zestaw person. Minimum wynikające z tego, co realnie blokowało:
- użytkownik **bez** `mnt.asset.deactivate` (reaktywacja aktywu — dziś tylko dowód statyczny)
- **drugi** użytkownik uprawniony do podpisu dwuosobowego (LOTO, kalibracja — dziś blokowane)
- operator ograniczony do **jednego zakładu** (bramki site-scope)
- użytkownik bez uprawnień do modułu (ścieżki negatywne / `forbidden`)

**Dlaczego to jest najważniejsza pozycja Fazy 0:** testowanie wszystkiego z konta admina
**systematycznie maskuje bramki uprawnień**. W nocy 28/29.07 trafiłem na to dwukrotnie —
oba razy dowód musiał zostać oznaczony jako „statyczny, nie behawioralny".

## 0.4. Działająca wysyłka maili (decyzja 4)

**Stan zastany:** `apps/web/actions/email/test-provider.ts:141` to jedyne wywołanie
`resend.emails.send()` i jest **opisane w kodzie jako martwy kod**
(`invitations-lifecycle.ts:136`). Zapytanie pyta o **3 kolumny, których nie tworzy żadna migracja**.
`email_delivery_log` zapisuje `'sent'` dla listów, **które nigdy nie wyszły**.

**To zadanie budowlane, nie testowe** — najpierw musi powstać działająca wysyłka,
dopiero potem da się ją przetestować. Zakres: kolumny w schemacie, realne wywołanie providera,
uczciwy zapis statusu (`sent` tylko gdy faktycznie wysłano).

---

# FAZA 1 — PRZELICZENIE 55 FAIL (najtańsze, najwięcej informacji)

**Cel:** ustalić, ile z 55 zamknęła kampania naprawcza „przy okazji", a co jest realnie zepsute.

Rozkład domenowy 46 FAIL-i z 18.07:
`UI` 11 · `SFQ` 8 · `E2E` 7 · `TEC` 4 · `WH` 4 · `NSA` 4 · `XC` 4 · `PRD` 3 · `PLN` 1
plus 9 świeżych z 19.07: `PRD-001/008/009/014`, `SFQ-069/164/166`, `NSA-150`, `XC-018`.

## Silne przesłanki, że część jest już nieaktualna
- **`SFQ-164`, `SFQ-166`** (podpisywanie LOTO → `forbidden`) — Fala 1 przepisała dualSign
  z ograniczeniem w bazie (mig 514). Prawdopodobnie **już naprawione**.
- **`PRD-001/008/009/014`** (start WO, replay, pauza, blokada optymistyczna) — Fala 10
  przerabiała dokładnie ten obszar.
- **11× `UI-*`** — fale 4-11 mocno ruszały UI.
- **`XC-018`** (SCIM 401 + konflikt z `users.name NOT NULL`) — to jest w backlogu jako
  **nadal otwarte**, więc spodziewaj się dalej FAIL.

## Metoda
Per ID: znaleźć dokładny kontrakt w `FULL-TEST-CATALOG.md` → wykonać dokładną asercję →
zapisać werdykt z **twardym dowodem**. Nie „ekran się otworzył".
Szardowanie po domenie, ~5 torów równolegle.

**Produkt:** `FAZA-1-FAIL-RECHECK.md` — tabela `ID | domena | werdykt 19.07 | werdykt dziś |
dowód | czy zamknięte przez falę X`.

---

# FAZA 2 — DOMKNIĘCIE 567 GAP (praca masowa, dobrze się zrównolegla)

**GAP nie znaczy „zepsute".** Znaczy: dowód był częściowy, poboczny albo bez dokładnej asercji.
Czyli w większości przypadków **zachowanie jest poprawne, brakuje testu, który to przypina**.

## Metoda
Dla każdego GAP-a: znaleźć kontrakt → ustalić, czego zabrakło (brak asercji / asercja poboczna /
dowód na sąsiednim zachowaniu) → **dopisać dokładną asercję** → uruchomić.

**Kryterium jakości, nienegocjowalne:** dla każdego dopisanego testu odpowiedz na pytanie
*„czy ten test przeszedłby TAKŻE bez sprawdzanego zachowania?"*. Jeśli tak — jest bezwartościowy
i trzeba go przepisać. W nocy 28/29.07 ten wzorzec (testy, które nic nie testują) był
**stałym kosztem** każdej fali.

## Szardowanie
Po domenach, proporcjonalnie do rozmiaru: TEC 460 · SFQ 182 · NSA 180 · WH 135 · PLN 130 ·
PRD 124 · XC 56 · UI 52 · E2E 140. Realnie ~8-12 fal po ~5 torów.

**Produkt:** `FAZA-2-GAP-*.md` per domena + bilans zbiorczy.

---

# FAZA 3 — 335 BLOCKED (odblokowane decyzjami ownera)

Kolejność wg stosunku wartości do kosztu:

| Pula | Ile | Co odblokowuje | Warunek |
|---|---:|---|---|
| **Persona/rola** | ~40 | bramki uprawnień, dziś systematycznie maskowane | Faza 0.3 |
| **Mutacje destrukcyjne** | ~80 | anulowania, usunięcia, odwrócenia, zamknięcia okresów | Faza 0.2 + decyzja 2 |
| **Brakujące testy (DB-no-test)** | 121 | scenariusze gotowe na izolowaną bazę, brak testu | Faza 0.2 |
| **Współbieżność** | 12 | blokady optymistyczne, TOCTOU, idempotencja | harness |
| **Wysyłka maili** | ~2-3 | po Fazie 0.4 | Faza 0.4 |
| **D365 / SCIM** | ~14 | **ODŁOŻONE decyzją ownera** | — |

**Uwaga o współbieżności:** to nie jest kategoria teoretyczna. `PRD-014` **już padł**
(„zero zwycięzców zamiast dokładnie jednego"), a cross-review w nocy 28/29.07 znalazł
TOCTOU w guardzie aktywności aktywu.

---

# 2. METODYKA — obowiązuje we wszystkich fazach

Pełne reguły: **`_meta/WZORCE-KAMPANII-NAPRAWCZEJ.md`** (343 linie, destylat z 2 kampanii /
252 findingów / 23 fal). **Przeczytaj przed startem.** Skrót tego, co najbardziej dotyczy testów:

1. **Renderowanie strony to NIE dowód.** Dowód = akcja + **stan trwały**.
2. **Kontrola przeciwna.** Zamrożony licznik mógłby znaczyć, że zegar stanął globalnie —
   dopiero pokazanie, że sąsiedni przypadek dalej działa, dowodzi, że naprawa jest celowana.
3. **Rozróżniaj „działa" od „udowodniłem, że działa tam, gdzie trzeba."** Jeśli odrzuciło
   po stronie klienta i w logu nie ma żądania — bramka serwerowa **nie została wykonana**.
4. **Flaki od obciążenia są przewidywalne** — rozstrzygaj `--fileParallelism=false`, 3× pod rząd.
5. **Testy `*.pg.test.ts` tworzą fixture'y** — na izolowanej bazie OK, **na Supabase tylko
   świadomie** (owner dopuścił, ale patrz 1.1).
6. **Porównuj ZBIORY czerwonych plików, nie liczby.**
7. Grep: wykluczaj `.next/` i `node_modules/`; nazwa kolumny łapie **aliasy** — patrz na `FROM`.

---

# 3. KOLEJNOŚĆ STARTU (po compakcie zacząć stąd)

```
FAZA 0 równolegle:
  0.1 migracja 543 (defekt 504)      ← bloker tworzenia organizacji
  0.2 środowisko + 3 klony (skrypt)
  0.3 konta testowe z rolami          ← największa wartość
  0.4 wysyłka maili (zadanie budowlane)
        ↓
FAZA 1: 55 FAIL — przeliczenie na dzisiejszym kodzie (~5 torów, 1 fala)
        ↓
FAZA 2: 567 GAP — domykanie asercji (~8-12 fal po 5 torów)
        ↓
FAZA 3: 335 BLOCKED wg tabeli priorytetów
```

**Bramka po każdej fali:** typecheck · **obie suity osobno** · build · PREPARE każdej migracji **3×** ·
różnica **zbiorów** czerwonych plików vs baseline.

**Zasada nadrzędna:** raportuj uczciwie. „Nieosiągalne na dzisiejszych danych" i „zablokowane
przez bramkę" to **akceptowalne wyniki**. Sfabrykowany dowód nie jest.
