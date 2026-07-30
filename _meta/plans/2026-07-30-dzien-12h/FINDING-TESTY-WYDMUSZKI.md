# Testy, które przechodzą przy ZEPSUTYM kodzie — 30.07, 19:15

Każde znalezisko udowodnione **mutacją**: psuję kod produkcyjny, uruchamiam test,
pokazuję że **nadal jest zielony**. Test przechodzący przy zepsutym kodzie go nie pokrywa
i jest to nie do podważenia. Wszystkie mutacje cofnięte, `git diff` na sześciu plikach **pusty**.

## M1 — NAJDROŻSZE: izolacja organizacji w uprawnieniach mierzona na atrapie

`apps/web/lib/auth/__tests__/has-permission.test.ts`

Usunąłem **filtr organizacji** z produkcyjnego SQL (`ur.org_id = $2::uuid` → warunek zawsze
prawdziwy) i dostałem **12 z 12 zielonych** — łącznie z testem, który nazywa się
„odmawia dostępu użytkownikowi z innej organizacji".

Przyczyna: `FakePermissionClient` w samym pliku testu **reimplementuje całą logikę grantu,
razem z filtrem organizacji**. Prawdziwe zapytanie nigdy się nie wykonuje, a test „tokenów SQL"
sprawdza obecność fragmentów zapytania, ale `org_id` wśród nich **nie ma**.

**To jest dokładnie ta klasa błędu, którą łatały wcześniejsze fale (org-scope).** Pokrycie
istnieje na papierze i nie istnieje w rzeczywistości.

Naprawa jest tania i wzorzec już jest w repo: **jeden test przeciw prawdziwemu Postgresowi**
(`*.pg.test.ts`).

## M2-M5 — testy „dowodowe" bez ani jednej asercji

Renderują komponent i zrzucają HTML do katalogu dowodów. Nic nie sprawdzają.

| # | plik | mutacja | wynik |
|---|---|---|---|
| M2 | `nutrition-tab.evidence.test.tsx` | każda wartość odżywcza → **999999** | **1/1 zielony** |
| M3 | `costing-screen.evidence.test.tsx` | każda kwota → **0.00** | **5/5 zielony** |
| M4 | `items-parity-evidence.test.tsx` | koszt za kilogram → **−1.00** | **3/3 zielony** |
| M5 | `tec-053-085-086-parity-evidence.test.tsx` | nagłówek kolumny kosztu → duplikat | **5/5 zielony** |

M2 dotyczy **etykiety wartości odżywczych produktu spożywczego**. M3, M4 i M5 dotyczą **kwot**.

Jedyna asercja w M3 to `innerHTML.length > 0`. Nagłówek M4 sam przyznaje: „Not an assertion test".

**Uczciwie:** siostrzany `costing-screen.test.tsx` tę samą mutację **złapał**. Pusty test
żyje **obok** realnego pokrycia — nie zastępuje go, ale też nie ostrzega, że nic nie wnosi.

## Kontr-dowód K1 — e-podpis wypadł DOBRZE

Zepsułem `hashESignSubject` (stała zamiast SHA-256) → **2 testy padły**, bo mają przypięte
wartości heksadecymalne. Kryptografia podpisu **ma** realne pokrycie. `gate-approval-esign`,
`quality-signoff` i `release-bundle` mają asercje behawioralne.

Tor odnotował też **własną pomyłkę pomiarową**: pierwsze „zielone" wyszło z odczytu kodu
wyjścia `tail`-a w potoku, nie vitesta. Poprawił i pokazał to w raporcie.

## Liczby z metodą

- **Zero asercji**: 4 pliki `.tsx` bez ani jednego `expect(`, skan po 1311 plikach testowych.
  Licząc przypadki: **~15-18 testów** — zgadza się z wcześniej odnotowanym „~16"
- **Tautologie**: 39 plików zawiera `toBeGreaterThanOrEqual(0)`, ale **większość to
  `findIndex >= 0`, czyli prawdziwe asercje**. Realnych tautologii: 7
- **Pusta pętla jako sukces**: skan **nie znalazł żywej dziury** — sprawdzone kandydaty mają
  licznik przed pętlą. Ten kształt w tym repo nie występuje
- **215 plików** ma `describe.skip` warunkowy na `DATABASE_URL`: lokalnie **zielona pustka**,
  wykonuje je dopiero CI. Bezwarunkowych `it.skip` **zero** — nic do włączenia jednym znakiem
- Dodatkowo: `materials-packaging.evidence.test.tsx` jest **dziś czerwony w baseline**
  (dryf propsów) — kolejny dowód, że suita UI bywa nieoglądana

## Czego audyt NIE ustalił

- Szerokości kształtu „asercja na atrapie" poza `has-permission` — **jeden dowód mutacyjny**,
  reszta to podejrzenie wzorca w innych testach z fałszywymi klientami
- Zachowania CI — twierdzenie „CI wykonuje pakiety" opiera się na lekturze `ci.yml`, nie na runie
