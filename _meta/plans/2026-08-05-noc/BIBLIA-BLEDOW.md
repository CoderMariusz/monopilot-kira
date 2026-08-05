# Biblia błędów — noc 5/6 sierpnia 2026

Dokument uporządkowany **według tego, co trzeba zrobić**, nie chronologicznie.
Przebieg godzina po godzinie jest w `DZIENNIK-NOCY.md`.

## Jak czytać status dowodu

| status | znaczenie |
|---|---|
| **UDOWODNIONE** | odtworzone uruchomieniem, z pomiarem stanu przed/po. Można działać. |
| **DO ROZSTRZYGNIĘCIA** | kod działa świadomie tak, jak działa — potrzebna decyzja ownera, nie naprawa. |
| **TEZA** | ustalone z czytania kodu, **nieodtworzone**. Traktować jak hipotezę, nie jak błąd. |
| **OBALONE** | sprawdzone i nieprawdziwe. Zapisane celowo, żeby nikt tego drugi raz nie ścigał. |

---

# CZĘŚĆ I — ZANIM COKOLWIEK WDROŻYSZ

## 1. Push nie uruchamia wdrożenia. Nic nie trafia na produkcję. — UDOWODNIONE

```
gh api repos/CoderMariusz/monopilot-kira/hooks  →  []
```

Repozytorium ma **zero webhooków**. GitHub nie ma komu powiedzieć, że coś się zmieniło,
więc Vercel nigdy nie startuje builda.

- najnowszy build produkcyjny: **30 lipca 07:59** (z rana, sprzed całego dnia audytu)
- na GitHubie leży **79 commitów**, których produkcja nie widziała
- produkcja **działa** — `/` i `/en/login` odpowiadają 200

**Do zrobienia:** podłączyć repozytorium w ustawieniach projektu Vercel — ale dopiero
po punkcie 2, bo podłączenie wyzwoli natychmiastowy deploy wszystkiego naraz.

## 2. Nieudana migracja NIE zatrzymuje wdrożenia. To jest fail-open. — UDOWODNIONE

Polecenie budujące projektu:
```
cd ../.. && (pnpm --filter @monopilot/db migrate || echo "[WARN] Migrations skipped …") && cd apps/web && pnpm build
```

To `||` **połyka błąd migracji**. Build wypisuje ostrzeżenie i buduje dalej — wdrażając kod,
który zakłada schemat, jakiego w bazie nie ma.

**To jest najgroźniejsza pojedyncza rzecz w tym repozytorium**, bo zamienia głośną awarię
w cichą. Wszystkie inne błędy z tej listy są mniejsze od tego jednego.

**Do zrobienia:** usunąć `|| echo …` z polecenia budującego. Niech nieudana migracja
zatrzyma deploy. Nie zrobiłem tego bez Ciebie — to zmiana zachowania wdrożeń,
a Ty spałeś. Zajmuje minutę.

*Sprostowanie:* przez cały 30 lipca twierdziłem — także w `OSTRZEZENIE-PRZED-PUSHEM.md` —
że odmowa migracji zatrzyma deploy i to jest awaria bezpieczna. **To było nieprawdziwe.**
Założyłem zamiast sprawdzić.

## 3. Migracja 563 odwracała bramkę widoczności zakładów — NAPRAWIONE I UDOWODNIONE

Commit `b81ad9de`.

Predykat przed naprawą:
```
(nieograniczony) OR site_id IS NULL OR site_id = any(widoczne)
```
Człon `site_id IS NULL` czynił wiersze bez zakładu **widocznymi** — dla administratora
i dla ścieżek bez zalogowanego użytkownika. Migracja 551 stanowi wprost coś przeciwnego.

Własna kontrola migracji to złapała (`old=f new=t`) i migracja odmawiała wykonania,
przez co **563 i 564 nie były zastosowane nigdzie** — ani lokalnie, ani na produkcji.

Po naprawie predykat ma kształt z 551:
```
site_id IS NOT NULL AND ((nieograniczony) OR site_id = any(widoczne))
```

Dowód (baza `monopilot_ver`, łańcuch dojechał do 564):

| | wynik |
|---|---|
| polityki przepisane na nowy predykat | 13 |
| polityki wciąż wołające starą funkcję per-wiersz | 0 |
| ten sam wiersz, prawdziwy zakład | **widoczny (1)** ← kontrola przeciwna |
| ten sam wiersz, `site_id = NULL` | **ukryty (0)** |

## 4. Nie wiem, na jakiej migracji stoi produkcyjna baza — NIEROZSTRZYGNIĘTE

Próba połączenia (wyłącznie `select`) została **zablokowana przez klasyfikator**, tak samo
jak 30 lipca. Nie obchodziłem tej blokady.

**To jest najważniejsza niewiadoma przed wdrożeniem.** Nie wiem, czy produkcja stoi na 550,
562, czy gdzie indziej, ani czy ma wiersze bez zakładu blokujące migrację 551.

**Do zrobienia — wykonaj to sam przed deployem:**
```sql
select max(filename) from schema_migrations;
```
oraz, dla każdej z pięciu tabel (`license_plates`, `lp_state_history`, `work_orders`,
`wo_events`, `wo_outputs`):
```sql
select count(*) from public.<tabela> where site_id is null;
```
Jeżeli którakolwiek liczba jest większa od zera — **migracja 551 odmówi, a build to połknie**.

---

# CZĘŚĆ II — BŁĘDY W APLIKACJI

## 5. W drzewie leżał celowo zepsuty kod — ZNALEZIONE I COFNIĘTE

`apps/web/app/api/warehouse/scanner/pick/lps/route.ts` — skasowana jedna linia:
```sql
and (lp.expiry_date is null or lp.expiry_date::date >= current_date)
```

Pozostałość po dowodzie mutacyjnym: agent skasował filtr, żeby pokazać, że test i tak zostaje
zielony, i nie cofnął. Skutek: skaner pokazywałby przeterminowane palety jako kandydatów
do pobrania. Sam ruch nadal blokuje osobna kontrola (409), więc towar by nie wyjechał — ale
operator wybiera pozycję, której wybrać nie wolno, i dowiaduje się dopiero przy zapisie.

Triage 66 plików kodu: **64 realne poprawki, 1 celowe uszkodzenie, 1 szum.**

## 6. Wiersze bez zakładu — źródło jest w kodzie, nie w danych — TEZA (dobrze udokumentowana)

Odbudowa bazy od zera z samych migracji **przeszła 551**, więc istniejące puste wiersze
to pozostałość po testach. Ale kod **nadal produkuje nowe**.

Najgroźniejsza aktywna ścieżka ma jawny komentarz w kodzie:

> `apps/web/lib/production/start-wo.ts:263` — *„When the WO has no site, site_id stays NULL"*

Zlecenie produkcyjne bez zakładu materializuje pozycje wyrobu bez zakładu.
Dalej `wo-state-machine.ts:237` propaguje to na zdarzenia. Trigger bazodanowy
`384-trigger-user-default-site.sql:93` robi `coalesce(linia, domyślny użytkownika,
domyślny organizacji)` i **przy pustym wyniku zwraca rekord** zamiast odmówić.

Do tego kilkanaście miejsc w historii palet przekazuje `lp.site_id` dalej bez odrzucenia
pustego (m.in. `complete-cancel-wo.ts:606`, `record-waste.ts:235`, `hold-actions.ts:1005`,
`ship-actions.ts:570`, `cancelShipment.ts:412`).

**Naprawa jednego miejsca niczego nie da — trzeba zamknąć źródło.** Pełna mapa ścieżek zapisu:
`RAPORT-PUSTY-ZAKLAD.md`.

## 7. Rozjazd uprawnień: 45 istnieje tylko w bazie, 4 tylko w kodzie — TEZA

Seed person wypisuje `[ADMIN PERMISSION DRIFT]`. Uprawnienia obecne wyłącznie w bazie to m.in.
`npd.project.create`, `settings.roles.manage`, `warehouse.lp.destroy`, `fa.create`, `fa.delete`.

Jeśli kod sprawdza uprawnienie, którego baza nie zna — bramka może **cicho nigdy nie trafiać**:
albo blokować wszystkich, albo nie blokować nikogo. Sprawdzane behawioralnie personami
`no_module_access` i `single_site_operator`.

## 8. Zachowanie ilości — 13 tez, w weryfikacji adwersarskiej

Pełna lista: `TEZY-ZACHOWANIE-ILOSCI.md`. Werdykty: `WERDYKTY-ZACHOWANIE-ILOSCI.md`.

**Nie traktuj tych tez jak błędów, dopóki nie mają werdyktu.** Powstały z czytania kodu bez
dostępu do bazy. Pierwsza z nich (rejestracja 103 kg wyrobu przy zużyciu 100 kg) już przy
pobieżnym czytaniu wygląda na **decyzję produktową**, nie błąd: testy jawnie asercjonują
sukces z ostrzeżeniem, a próg blokujący `block_pct` jest konfiguracją.

---

# CZĘŚĆ III — NARZĘDZIA, KTÓRE KŁAMIĄ

Lista z 30 lipca miała pięć pozycji. Tej nocy doszły trzy.

| komenda | fałszywy wynik | dlaczego |
|---|---|---|
| `pgrep -f 'codex exec'` | „6 torów żyje", gdy nie żył żaden | dopasowuje własną powłokę |
| `ls <katalog>` | pusto, choć są pliki | przechwytuje hook rtk |
| `wc -l < plik` | `0` dla pliku z 50 liniami | jw. |
| `grep` bez `-a` | „nikt nie pisze do tabeli", a zapis był w linii 481 | plik uznany za **binarny** |
| `rtk grep` z `> plik` | nadpisuje plik własnym podsumowaniem | wrapper wypisuje raport, nie wynik |
| **`test-db.sh clone`** | **kod 0, a nie sklonowało niczego** | przewraca się na migracji, kod powrotu bierze się z ostatniej instrukcji potoku |
| **`find -newermt "<data>"`** | **pustka, choć pliki istnieją** | predykat cicho nie dopasowuje |
| **kod powrotu polecenia w tle** | **„exit code 0" przy nieudanej migracji** | RC bierze się z ostatniej komendy łańcucha, nie z tej, która zawiodła |

**Wniosek metodyczny:** w tym repozytorium żadnej komendy nie wolno przyjmować na słowo.
Każde „zielone" musi mieć kontrolę przeciwną — dowód, że gdy warunek jest niespełniony,
wynik jest czerwony.

---

*Dokument uzupełniany w trakcie nocy. Ostatnia aktualizacja: 02:30.*
