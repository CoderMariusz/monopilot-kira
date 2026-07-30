# Testy, których NAZWA obiecuje bezpieczeństwo, a treść mierzy atrapę — 30.07, 19:38

To groźniejsze niż zwykły słaby test, bo **nazwa czyta się jak dowód**. Ktoś przeglądający
suitę widzi „odmawia dostępu z innej organizacji" i słusznie zakłada, że to sprawdzone.

Metoda: usuwam filtr organizacji z **produkcyjnego** zapytania, uruchamiam test,
patrzę czy zauważy. Wszystkie mutacje cofnięte, kod produkcyjny nietknięty.

## Potwierdzone mutacją — trzy miejsca, w których usunięcie filtru organizacji nie rusza NICZEGO

| plik | testów | co naprawdę mierzy |
|---|---|---|
| `lib/warehouse/scanner/write-permissions.contract.test.ts` | **24** | okablowanie trasy, nie kontrolę dostępu |
| `actions/infra/site-ownership.test.ts` | **5** | strażnika przynależności zakładu do organizacji |
| `app/(admin)/gdpr/_actions/__tests__/redact-user.test.ts` | **3** | wartość zmiennej testowej, nie zapytanie |

## Najgorszy przypadek dnia — kasowanie danych osobowych, dwie warstwy obrony, obie namalowane

Kontrola uprawnień do **usunięcia danych osobowych** może stracić filtr organizacji
i **żaden test w repo tego nie zauważy** — mimo że **dwa** testy mają w nazwie dokładnie
tę obietnicę.

**Warstwa pierwsza** — test jednostkowy: atrapa na widok ról zwraca wynik zależny wyłącznie
od zmiennej testowej i **ignoruje przekazane parametry w całości** — ani identyfikatora
użytkownika, ani organizacji, ani nazwy uprawnienia.

**Warstwa druga** — test nazwany *„prawdziwe zapytanie pod kontekstem aplikacji"*. Sprawdziłem
osobiście: plik zawiera **własną kopię zapytania**, wklejoną do treści testu (linie 74-77,
razem z `and ur.org_id = $2::uuid`). Mutacja kodu produkcyjnego **go nie dotyczy**.

Dwa testy, dwie nazwy obiecujące izolację organizacji przy usuwaniu danych osobowych,
**zero rzeczywistego pokrycia**.

## Naprawione teraz

`lib/auth/__tests__/has-permission.test.ts` — test sprawdzający kształt zapytania dostał
**brakujący warunek `ur.org_id = $2`**. To nie zastępuje testu na prawdziwej bazie
(`has-permission.pg.test.ts`, dodany wcześniej), ale **zabija tę konkretną mutację
w suicie bez bazy** — istotne, bo pliki `*.pg.test.ts` bramkują się na zmiennej środowiskowej
i bez niej **cicho się pomijają**.

## Sprawdzone i UCZCIWE

`site-actions.test.ts` → *„odrzuca użytkownika przypisanego do innego zakładu"* — **wzorcowy**:
atrapa zwraca surowe wiersze, a test **twardo sprawdza kształt zapytania i dokładne parametry**.
**To jest technika do naśladowania** i warto go pokazywać jako wzór.

Uczciwa jest też cała rodzina testów w `packages/db`, `packages/rbac`, `packages/auth`
(12 plików) — tam testy uderzają w **prawdziwą bazę pod prawdziwym użytkownikiem aplikacji**.
**Wzorzec z `apps/web` nie rozlał się na pakiety.**

## Rozbieżność zgłoszona wprost

Przy `write-permissions.contract.test.ts` dwie oceny się rozeszły: czy nazwa
*„odmawia operacji z 403"* czyta się jako gwarancja kontroli dostępu, czy tylko jako
opis okablowania. **Fakty są bezsporne** (24 zielone po usunięciu filtru), różnica dotyczy
wyłącznie oceny nazwy. Zostawiam do rozstrzygnięcia.

## Czego nie ustalono

- Czy trasy skanera i usuwania danych są chronione przez RLS **niezależnie** od tych testów —
  udowodniono wyłącznie, że **te testy tego nie dowodzą**
- ~150 plików testowych w `packages/db` nieotwartych
- Jedno zgłoszenie (`role-admin-actions.test.ts` — test zielony z niewłaściwego powodu)
  **niepotwierdzone mutacją**, zgłoszone jako do sprawdzenia
