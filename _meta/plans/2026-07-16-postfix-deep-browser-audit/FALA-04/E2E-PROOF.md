# FALA 4 — E2E PROOF (dowód behawioralny na produkcji)

**Cel:** https://monopilot-kira.vercel.app · org **Apex 22** (`00000000-0000-0000-0000-000000000002`)
**Build:** `main@6846f9d6` · weryfikacja 2026-07-27, 22:52–23:22 UTC
**Konto:** admin@monopilot.test (Apex Admin)

## Potwierdzenie, że testowany jest NOWY build

| Sprawdzenie | Oczekiwane | Zmierzone |
|---|---|---|
| `routing_operations.setup_time_min` numeric_scale | 6 | **6** (`numeric(18,6)`) |
| mig 523 zastosowana | tak | `523-routing-setup-time-numeric-scale.sql` @ `2026-07-27 20:13:59.470+00` |
| mig 524 zastosowana | tak | `524-bom-snapshots-unique-wo-header.sql` @ `2026-07-27 20:13:59.930+00`, indeks `bom_snapshots_org_wo_header_unique` istnieje |
| mig 525 zastosowana | tak | `525-routing-reference-counts-security-definer.sql` @ `2026-07-27 20:14:00.350+00`, `routing_reference_counts(p_routing_id uuid)` z `prosecdef = t` |

Build potwierdzony jako nowy. Testy wykonane.

---

## Tabela wyników

| Znalezisko | Werdykt | Dowód (wartości dosłowne) |
|---|---|---|
| **PF-R06-02** FactorySpec shelf life | **PROVEN** | Review `FS-FG0014-v4`: „Shelf life **30 d**” + „**Inherited from FG item FG0014 — held on the item master, not on this specification.**” + link `Open FG item` → `/en/technical/items/NIGHT-R06-FG-1138` (trasa działa, nie 404). Przypadek braku: Review `FS-NIGHT-R06-1138 v1` → „Shelf life: **Not set on FG item NIGHT-R06-FG-1138**” — nazwany, NIE gołe `—`. DB: `items.FG0014.shelf_life_days = 30`, `items.NIGHT-R06-FG-1138.shelf_life_days = NULL`. Zgodność 1:1. |
| **PF-R06-03** scrap % edytowalny | **PARTIAL** | ✅ Edycja działa: linia ING-FLOUR `scrap_pct 3.33 → 8.88` trwale w DB. ✅ Audyt zawiera pole: `bom.line_updated` @ `23:14:21.400+00`, `before.scrapPct="3.33"` → `after.scrapPct="8.88"`. ✅ 3. miejsce **jawnie odrzucone** w OBU ścieżkach (dodawanie i edycja): komunikat w DOM „**Scrap % supports at most 2 decimal places.**”, przycisk `disabled` — bez cichego zaokrąglenia. ❌ **Ale**: edycja linii RM-BUTTER (operacja `CODEX-R15 Mixing edit`) padła — patrz Defekt A. |
| **PF-R06-04** kolejność linii BOM | **PROVEN** | BOM draft FG-018 v1, 3 linie. Przed: `1 RM-BUTTER / 2 ING-FLOUR / 3 ING-SUGAR`. Dwa kliknięcia „Move ING-SUGAR up”. Po: `1 ING-SUGAR / 2 RM-BUTTER / 3 ING-FLOUR`. Gęstość: `count=3, min=1, max=3, distinct=3` — bez luk i duplikatów. Kolejność na ekranie po pełnym reloadzie == DB. Audyt: 2× `bom.line_moved` (`lineNo 3→2`, `2→1`, `direction:"up"`). Granice: `↑` w 1. wierszu i `↓` w ostatnim są `disabled`. |
| **PF-R06-05** kolejność operacji routingu | **PROVEN** | Routing draft `b1edf8c3…` v2. Przed: `op_no 1 = SOLR08-S1`, `2 = SOLR08-WH1`. Po „Operation 2 Move up” + Save: `op_no 1 = SOLR08-WH1`, `2 = SOLR08-S1` — przenumerowane, gęste 1..2. |
| **PF-R06-06** kasowanie draft routingu | **PROVEN** | Kasowanie `b1edf8c3…` v2 przez potwierdzenie „Type v2 to confirm”. Po: `select count(*) from routings where id='b1edf8c3…'` → **0**; `routing_operations` dla tego routingu → **0** (kaskada zadziałała). **Anty-regresja:** wiersz `v1 Superseded` ma Actions = `—` (brak przycisków), routing `active` v1 (`2c11a528…`, item NIGHT-R06-FG-1138) też ma Actions = `—`. Delete istnieje wyłącznie przy `draft`. |
| **PF-R06-07** selektor linii: site + zawężenie | **PROVEN** | **Tożsamość site:** wszystkie 10 opcji niesie kod site — `LINE01 · LINE 1 BAKE — bakery`, `LINE02 · Oven Line — SITE1`, `LINE01 · line01 — tester1`, `LINE01 · LINE 1 — warehouse 1` … (`LINE01` występuje 3× w różnych site'ach — dokładnie ta niejednoznaczność, którą fix usuwa). Liczba opcji = **10** = dokładnie liczba `production_lines` ze statusem `active` w DB (2 `inactive` + 1 `draft` odfiltrowane). **Zawężenie:** po przypięciu `routings.site_id = ce456378…` (warehouse 1) ten sam picker pokazał **2 opcje**, obie `— warehouse 1` = dokładnie 2 aktywne linie tego site'u w DB. |
| **PF-R06-08** edycja ACTIVE → `in_review` | **PROVEN** | Dosłowny tekst UI (modal „Save BOM version”, BOM `NIGHT-R06-FG-1138 v4 active`): „**This BOM is active. Editing creates a new version in review — the released version is never edited in place.**”. DB po zapisie: nowy `bom_headers` `487df50c-2201-4a7e-a097-277722ed2d34`, `version = 5`, **`status = 'in_review'`** (nie `draft`). v4 pozostała `active` (wersja wydana nieedytowana w miejscu). Linie skopiowane wiernie: v4 = 2 linie / suma scrap 1.10; v5 = 2 linie / suma scrap 1.10. |
| **PF-R06-09** ułamkowy setup | **PROVEN** | Wpisane `12.345` → DB `setup_time_min = 12.345000` (nie `12`, nie no-op). Round-trip: po reloadzie modal pokazuje `12.345000`. Wartość odrzucana (`-5`): zapis odrzucony, komunikat **OSIĄGALNY** w DOM — „Please check the operation values and try again.”, DB nienaruszone (`12.345000`). |
| **PF-R06-10** released/archived bez kontrolek | **PROVEN** | BOM `NIGHT-R06-FG-1138 v1 archived`: `Add component` **disabled** / „Cannot add components — this BOM version is archived.”; `Save version` **disabled** / „Cannot save — this BOM version is archived.”; `Delete version` **disabled** / „Only draft versions can be deleted — approved or active versions are never removed.”; wszystkie kontrolki wierszy (`↑ ↓ ✎ 🗑`, 3 wiersze) **disabled**. Na `v4 active` kontrolki wierszy również disabled. **Anty-regresja (draft):** na FG-018 v1 `draft` `Add component`, `Save version`, `✎`, `🗑` są AKTYWNE, a `↑/↓` aktywne od 2. linii wzwyż. |
| **PF-R06-11** snapshot przy TWORZENIU WO | **PROVEN** | Utworzono WO przez UI (FG0014, 7 box). DB: `WO-202607-0039` `status = DRAFT`, **`started_at = NULL`** (nigdy nie wystartowane), a wiersz `bom_snapshots af72ef4f-c8a0-450c-93ff-6ba762626bbd` istnieje z `snapshot_at = 2026-07-27 23:06:03.041687+00` — **identycznym co `work_orders.created_at`**, czyli zapis w tej samej transakcji. To samo dla dziecka `WO-202607-0039-W1` (`22716d5d…`). **Kontrast ze starym zachowaniem w tych samych danych:** `WO-202607-0037` (`DRAFT`, ten sam BOM `cdc8a9a7…`) snapshotu NIE ma, a jego dziecko `-W1` dostało go dopiero o `started_at`. Licznik UI „**Snapshots 2**” na Technical → BOM FG0014 v3 zgadza się co do wiersza z DB (2 rekordy: `WO-202607-0010`, `WO-202607-0039`). |

**Wynik: 9 × PROVEN, 1 × PARTIAL (PF-R06-03).**

---

## Nie udowodnione i dlaczego

Bez owijania — to są rzeczy, których **nie** wykazałem, i nie udaję, że jest inaczej.

1. **Anty-regresja PF-R06-11: „start produkcji nie tworzy duplikatu snapshotu”. NIE WYKONANE.**
   Ścieżka wymaga `Release` → start WO. Kliknięcie `Release` zostało zablokowane przez klasyfikator
   uprawnień sesji (nie przez aplikację). Zgodnie z zasadą „nie obchodzę blokad” nie próbowałem
   obejścia. Mam wyłącznie dowód **strukturalny**: unikalny indeks
   `bom_snapshots_org_wo_header_unique (org_id, work_order_id, bom_header_id)` z mig 524 istnieje na
   prodzie, a `createBomSnapshot` używa `on conflict … do nothing` + ponownego odczytu. To czyni
   duplikat niemożliwym na poziomie bazy, ale **nie jest to dowód behawioralny** i nie liczę go jako taki.

2. **PF-R06-03 dla linii z operacją spoza słownika. UDOWODNIONE JAKO ZEPSUTE, nie jako działające.**
   Patrz Defekt A. Sama edytowalność scrap % jest udowodniona na linii poprawnej.

3. **PF-R06-07 — gałęzie etykiet „All sites” / „Unknown site” są NIEOSIĄGALNE na obecnych danych.**
   `siteQualifier()` ma trzy gałęzie; przetestowałem tylko jedną (`siteCode`). W org Apex 22
   `select count(*) filter (where site_id is null) from production_lines` = **0** z 13 — nie istnieje
   ani jedna linia org-wide, więc etykiety `fLineOrgWideSite` ('All sites') i `fLineUnknownSite`
   ('Unknown site') nie dają się wywołać z UI. To jest dokładnie lekcja nr 1 z planu Fali 4
   (weryfikuj OSIĄGALNOŚĆ): dwie z trzech gałęzi tego fixu to na dziś martwy kod na produkcji.
   Nie twierdzę, że są błędne — twierdzę, że **nie zostały udowodnione**.

4. **Anty-regresja Walk B nr 3 (zapotrzebowanie WO liczone ze scrap %) — udowodniona ARYTMETYCZNIE, nie na linii, którą sam edytowałem.**
   Na `WO-202607-0039` (7 box = ×7): PM-BOX `6.000 × 7 / (1 − 0.05) = 44.211` == `wo_materials.required_qty = 44.211`;
   LAB-001 `36.000 × 7 / (1 − 0.10) = 280.000` == `280.000`; RM-BUTTER (scrap 0) `0.240 × 7 = 1.680` == `1.680`.
   Wzór potwierdzony też w kodzie (`create-work-order-core.ts:255`). Scrap % jest realnie użyty.
   Nie zbudowałem natomiast WO na BOM-ie FG-018, w którym zmieniałem scrap — ten BOM jest `draft`
   i nie da się na nim utworzyć WO.

5. **Nie sprawdziłem gałęzi `bom_not_editable` po stronie serwera dla archived/released.**
   Kontrolki są `disabled` (co jest właściwym zachowaniem i to udowodniłem), więc żeby dojść do
   walidacji serwerowej musiałbym wymusić kliknięcie w wyłączony przycisk — czyli obejść blokadę.
   Nie zrobiłem tego.

---

## Nowe defekty wykryte przy okazji

### Defekt A — linia BOM z operacją spoza słownika jest TRWALE NIEEDYTOWALNA, a komunikat nic nie mówi

**Waga:** średnia (blokuje PF-R06-03 dla danych zastanych) · **Status:** ZASTANY, ujawniony przez tę falę

**Odtworzenie:**
1. `/en/technical/bom/FG-018` (BOM `draft` v1)
2. Wiersz `RM-BUTTER`, operacja `CODEX-R15 Mixing edit` → `✎`
3. Zmień `Scrap %` na `6.25` → `Save changes`
4. **Skutek:** modal zostaje otwarty, komunikat „**Unable to update this component line. Please try again.**”,
   DB niezmienione (`scrap_pct` nadal `2.50`). Ponawianie nigdy nie pomoże.

**Kontrola pozytywna:** ta sama operacja na wierszu `ING-FLOUR` (operacja `Mixing`) — działa,
`scrap_pct 3.33 → 8.88`. Różnicą jest wyłącznie nazwa operacji.

**Przyczyna źródłowa:** `updateBomLine` (`.../technical/bom/_actions/line-actions.ts`, ok. linii 270)
bezwarunkowo waliduje `manufacturingOperationName` przez `validateBomManufacturingOperationNames`.
Modal edycji **zawsze odsyła bieżącą nazwę operacji**, więc linia z nazwą historyczną odrzuca sama
siebie przy każdej edycji — nawet gdy użytkownik rusza wyłącznie scrap %.
Potwierdzenie w DB: `Reference.ManufacturingOperations` dla tej org ma 12 nazw
(`BAKE, Chilling, Cooking, E2E Verify QZ, Grinding, Labelling, Metal detection, Mixing, Packing, Slicing, Smoking, Stuffing`);
`CODEX-R15 Mixing edit` **nie występuje** (`count = 0`).

**Zasięg dziś:** 1 linia w BOM-ach edytowalnych (FG-018 v1 / RM-BUTTER). Tryb awarii jest jednak
ogólny — każda linia z nazwą historyczną wpada w tę pułapkę, a klon-on-write przenosi nazwy operacji
do nowej wersji `in_review`.

**Dodatkowo:** komunikat jest generyczny i sugeruje błąd przejściowy („try again”), podczas gdy błąd
jest trwały i ma konkretną, znaną przyczynę. To odstaje od standardu, który ta sama fala ustawiła gdzie
indziej (np. „Only draft versions can be deleted — …”).

---

### Defekt B — numeracja materiałów na WO idzie z martwej kolumny `sequence`, nie z `line_no`

**Waga:** niska–średnia (mylące dla operatora; latentna niespójność z PF-R06-04) · **Status:** ZASTANY

**Odtworzenie:**
1. Utwórz WO na FG0014 (BOM v3) — np. `WO-202607-0039`
2. `/en/planning/work-orders/<id>` → sekcja „Materials (BOM snapshot)”
3. **Skutek:** kolumna `#` pokazuje `1, 3, 3, 4` — duplikat `3` i brak `2`.

**Stan faktyczny w DB:** `bom_lines.line_no` dla `cdc8a9a7…` jest **gęste**: `1,2,3,4`.
Rozjeżdża się `bom_lines.sequence` = `3,1,3,4`.

**Przyczyna źródłowa:** `create-work-order-core.ts:255` —
`… bl.uom, coalesce(bl.sequence, bl.line_no), …`. Gdy `sequence` jest niepuste, **przesłania**
`line_no` i trafia do `wo_materials.sequence`, które renderuje kolumnę `#`.

**Znaczenie dla PF-R06-04:** komentarz w `line-actions.ts` (ok. linii 459) stwierdza, że
`bom_lines.sequence` jest „dead — no unique, no index, no check, never written by the UI […] It stays dead.”
Pierwsza część jest prawdziwa o *zapisie*, ale kolumna **jest czytana** i wygrywa z `line_no` na ścieżce
WO. Konsekwencja: reorder z PF-R06-04 przestawia `line_no`, ale kolejność materiałów na zleceniu
pozostanie stara.

**Zasięg:** 23 z 38 linii w org ma `sequence <> NULL`. Realnie niespójny jest dziś jeden nagłówek
(FG0014 v3: `line_no {1,2,3,4}` vs `sequence {3,1,3,4}`). Ryzyko jest **latentne**, bo klon-on-write
tworzy nowe wersje z `sequence = NULL` (potwierdzone na świeżo utworzonej v5 `in_review`), a nagłówki
z niepustym `sequence` są w większości `active` (nieedytowalne). Ale jeśli którykolwiek z nich stanie
się edytowalny i zostanie przestawiony — ekran BOM i ekran WO pokażą różne kolejności bez ostrzeżenia.

---

### Obserwacja C — draft routingu z operacjami w dwóch site'ach jest niezapisywalny (zachowanie poprawne, ale ślepy zaułek)

**Status:** ZASTANY, zachowanie serwera **prawidłowe** — zgłaszam jako pułapkę UX, nie jako błąd.

Draft `b1edf8c3…` miał op. 1 na linii z site `SITE1` i op. 2 na linii z site `warehouse 1`.
Każdy zapis (również sam reorder, bez dotykania linii) był odrzucany komunikatem
„**Every operation must use production lines from the same site as the routing (V-TEC-64).**”
Komunikat jest OSIĄGALNY i nazywa regułę — to plus. Ale ponieważ `routings.site_id` był `NULL`,
picker (zgodnie z projektem: brak zawężenia dla nieprzypiętego routingu) nadal oferował linie z obu
site'ów, więc UI nie prowadzi operatora do wyjścia. Odblokowałem to ręcznie, ustawiając obie operacje
na linie z `warehouse 1`; wtedy zapis przeszedł i `site_id` przypiął się na `ce456378…`.

### Obserwacja D — drobne nieścisłości w tekstach

- Tooltip kontrolek wiersza na wersji **archived** brzmi „This BOM version is **approved or active** —
  its components can no longer be edited.” — stan to `archived`, nie „approved or active”.
  Blokada działa poprawnie, myli tylko uzasadnienie.
- Odrzucenie ujemnego setupu w routingu: „Please check the operation values and try again.” — nie nazywa
  ani pola, ani reguły, w odróżnieniu od reszty komunikatów tej fali.

---

## Mutacje wykonane na PRODUKCJI (do prześledzenia)

Wszystkie poniższe zmiany zostały wprowadzone przez UI w trakcie weryfikacji, 2026-07-27 22:53–23:20 UTC,
przez `admin@monopilot.test`.

| # | Obiekt | Zmiana | Stan końcowy |
|---|---|---|---|
| 1 | `routing_operations` routingu `b1edf8c3…` | op. 2 przestawiona na 1 | *(nieistotne — routing skasowany w kroku 4)* |
| 2 | `routing_operations` routingu `b1edf8c3…` | linia op. `SOL-R08 Site1 Mix` zmieniona z `LINE03 (SITE1)` na `LINE11 (warehouse 1)` — konieczne, by V-TEC-64 przepuściło zapis | *(j.w.)* |
| 3 | `routings.b1edf8c3…` | `site_id` przypięty na `ce456378…` (warehouse 1) jako skutek zapisu; `setup_time_min` op. 1 = `12.345000` | *(j.w.)* |
| 4 | `routings` + `routing_operations` | **USUNIĘTY** draft `b1edf8c3-9893-46f1-a4b0-ae50350e897d` v2 wraz z 2 operacjami (test PF-R06-06) | Zostały: `2c11a528…` v1 `active`, `83614f0c…` v1 `superseded`. **Org nie ma już żadnego draftu routingu** — kolejna fala musi utworzyć własny fixture. |
| 5 | `bom_lines` BOM-u `ff2bda0a…` (FG-018 v1 `draft`) | **DODANA** linia `ING-FLOUR`, qty `2.500000` kg, scrap `3.33`, op. `Mixing` | obecnie `line_no = 3`, scrap `8.88` |
| 6 | `bom_lines` BOM-u `ff2bda0a…` | **DODANA** linia `ING-SUGAR`, qty `1.250000` kg, scrap `7.77`, op. `BAKE` | obecnie `line_no = 1` |
| 7 | `bom_lines` BOM-u `ff2bda0a…` | `ING-SUGAR` przesunięta 3 → 1 (2 kliknięcia) | kolejność: `1 ING-SUGAR / 2 RM-BUTTER / 3 ING-FLOUR` |
| 8 | `bom_lines` BOM-u `ff2bda0a…` | `ING-FLOUR.scrap_pct` `3.33 → 8.88` | utrwalone |
| 9 | `bom_headers` | **UTWORZONA** wersja `487df50c-2201-4a7e-a097-277722ed2d34` = `NIGHT-R06-FG-1138 v5`, `status = in_review`, notes „v5 — FALA-04 E2E prod verification of PF-R06-08 in_review status” + 2 skopiowane linie | v4 nadal `active` |
| 10 | `work_orders` | **UTWORZONE** `WO-202607-0039` (`30b0b94b…`) i dziecko `WO-202607-0039-W1` (`f9332c62…`), FG0014, 7 box, site Main Factory, oba `DRAFT`, nigdy nie startowane | + 4 wiersze `wo_materials` dla rodzica |
| 11 | `bom_snapshots` | **UTWORZONE** 2 wiersze automatycznie przy tworzeniu WO: `af72ef4f…` i `22716d5d…` | łącznie w org: 7 → **9** |
| 12 | `audit_log` | 5 wpisów: 2× `bom.line_added`, 2× `bom.line_moved`, 1× `bom.line_updated` (+ wpisy routingu/BOM z pozostałych akcji) | — |

**Próby, które NIE zmieniły stanu** (odrzucone przez aplikację, celowo):
scrap `1.234` i `4.567` (3 miejsca po przecinku), setup `-5`, zapis routingu mieszającego site'y,
edycja scrap na linii `RM-BUTTER`.

**Do posprzątania, jeśli ktoś chce wrócić do stanu sprzed:** wersja BOM `NIGHT-R06-FG-1138 v5`
(`in_review`), zlecenia `WO-202607-0039` / `-W1` z ich snapshotami, oraz dwie dodane linie w FG-018.
Usunięty draft routingu `b1edf8c3…` jest **nieodwracalny**.
