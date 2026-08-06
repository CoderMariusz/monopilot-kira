# RAPORT D — weryfikacja przegladarkowa dzisiejszych napraw

Katalog: `/Users/mariuszkrawczyk/Projects/_noc/B` @ `6341c847`
Baza: `monopilot_t2` (domigrowana do **564**, 2 migracje zastosowane: 563, 564)
Port: 3514 / app 3814

---

## 0. BRAMKA HYDRACJI — **PRZESZLA**

```
PORT=3514 bash scripts/e2e-local.sh --db monopilot_t2 apps/web/e2e/hydration-click-proof.spec.ts
[proof] picked item: RM-BEEF-50 Beef trim 50VL RM — /kg
  ✓  1 [chromium] › hydration-click-proof.spec.ts:20:5 › real click reaches upsertReorderThreshold and writes a row (3.9s)
  1 passed (5.2s)
```

Lancuch React-hydracja -> kliknieciu -> server action -> wiersz w bazie **dziala**.

### Migracja

```
applied          : 563-site-visibility-rls-hoist.sql
applied          : 564-complaint-box-number-uniqueness.sql
Done: 2 applied, 517 already applied (skipped).
```

Doszlo do 564 zgodnie z oczekiwaniem.

### Stan bazy startowo (wazne dla interpretacji)

`monopilot_t2` jest bazą prawie **pustą** — to migrowany szkielet z personami, nie kopia
demo-danych:

| tabela | wierszy |
|---|---|
| items | 43 |
| license_plates | 3 |
| sales_orders | **0** |
| shipments | **0** |
| customers | **0** |
| stock_moves | **0** |
| work_orders | 5 |
| locations | 1 |
| sites | 1 (Demo Plant — Warsaw, tz Europe/Warsaw) |

Wszystko, co dotyczy wysylek/zlecen, wymagalo wiec **zasiania danych SQL-em przed klikaniem**.

---

## POZYCJA 8 — WYCIEK ODCZYTU (commit 5f286e3a) — **POTWIERDZONA**

Spec: `apps/web/e2e/_noc/d08-read-leak.spec.ts`

### Odmowa — persona `no_module_access` (0 uprawnien w `role_permissions`)

| ekran | panel odmowy | wierszy `tbody tr` |
|---|---|---|
| `/en/technical/items` | `items-list-denied` = 1 | **0** |
| `/en/technical/materials` | `materials-list-denied` = 1 | **0** |
| `/en/settings/schema` | `schema-browser-denied` = 1 | **0** |
| `/en/settings/sites` | `sites-denied` = 1 | **0** |
| `/en/planning/transfer-orders` | `to-list-denied` = 1 | **0** |

Twarda asercja `toHaveCount(0)` na `tbody tr` przeszla na wszystkich pieciu ekranach.

### Kontrola przeciwna — **nie admin**: `single_site_operator`

Rola `Test — Single-site line operator` (9 uprawnien produkcyjnych, **zero admina**) dostala
SQL-em 4 klucze odczytu, ktorych wymagaja nowe bramki:
`technical.sensory.read`, `settings.schema.read`, `settings.org.read`, `scheduler.run.read`.

| ekran | panel odmowy | wierszy `tbody tr` |
|---|---|---|
| `/en/technical/items` | 0 | **43** |
| `/en/technical/materials` | 0 | **40** |
| `/en/settings/schema` | 0 | **18** |
| `/en/settings/sites` | 0 | **2** |
| `/en/planning/transfer-orders` | 0 | **2** |

Bramka **nie odrzuca wszystkiego** — otwiera sie dokladnie na nadanym uprawnieniu, i to
personie operacyjnej, nie adminowi. Naprawa potwierdzona behawioralnie.


---

## POZYCJA 5 — KOSZT RECEPTURY (commit 2dcd9a73) — **POTWIERDZONA**

Spec: `apps/web/e2e/_noc/d05-recipe-cost.spec.ts`. Zasiane SQL-em: BOM FG-001, linia
`SP-PEPPER-BLK 200 g` przy `item_cost_history.cost_per_kg = 5,0000 GBP`, linia kontrolna
`ING-SUGAR 2 kg` przy 3,0000 GBP/kg.

Odczyt z ekranu `/en/technical/cost` (dokladny tekst, po wyborze FG-001 w selektorze):

```
Std. material cost 7.00 | Yield 100.0% | Components 2 | Costed lines 2/2
ING-SUGAR      Sugar             RM  6.00 · 85.7%   2.000000 kg × 3.00/kg
SP-PEPPER-BLK  Black pepper...   RM  1.00 · 14.3%   200.000000 g × 5.00/kg
Total std. material cost 7.00
```

**1,00 przy 200 g i 5,00/kg** — blad tysiackrotny nie wystepuje. Kontrola przeciwna
(pozycja w kilogramach) bez zmian: 2 kg × 3,00 = 6,00.

### Uwaga do tej naprawy (nie jest to blad, ale owner powinien to wiedziec)

Konwersja `g -> kg` dziala **tylko wtedy, gdy karta towaru deklaruje `uom_secondary='g'`**.
Sprawdzilem obie konfiguracje tym samym specem:

| `items.uom_secondary` | linia 200 g | suma | "Costed lines" |
|---|---|---|---|
| `'g'` | **1.00** | 7.00 | 2/2 |
| `NULL` | **no cost** (bursztynowo) | 6.00 | **1/2** |

Drugi przypadek jest **zamierzony** (kod: „an unconvertible line must surface as `uncosted`,
never as a silent factor of 1") i ekran uczciwie to sygnalizuje. Ale konsekwencja biznesowa
jest taka, ze receptura dozowana w gramach na towarze bez drugiej jednostki **wypada z kosztu
standardowego** zamiast go zawyzac. Lepiej niz 1000,00 — ale to nadal zla liczba, tyle ze
w druga strone i oznaczona.

### Uwaga druga: tej linii NIE DA SIE zrobic z ekranu BOM

Dialog „Add component" (`bom-edit-dialog.tsx:571-583`) **nie ma pola jednostki** — etykieta
brzmi `quantityPerPack({uom: picked.uomBase})`, czyli ilosc jest zawsze w jednostce bazowej
skladnika. Linia w gramach na skladniku kilogramowym powstaje tylko sciezka NPD
(`materialize-npd-bom.ts`) albo importem. Dlatego zasialem ja SQL-em; sam odczyt kosztu
zweryfikowalem juz klikaniem.

---

## POZYCJA 6 — PREFIKS GS1 (commity 9ad47fbf + 48e0f149) — **POTWIERDZONA**

Spec: `apps/web/e2e/_noc/d06-gs1-and-d01-expiry.spec.ts`.
Seed lancucha: `apps/web/e2e/_noc/seed-shipping.sql` (klient, SO 400 kg, 4 palety, alokacje,
wysylka `D-SHP-1` w statusie `pending`). Start: `organizations.gs1_prefix` **pusty**.

**D6a — pusty prefiks.** Wpisalem `D-LP-OK` w `pack-lp-input`, klik `pack-lp-submit`:

> „GS1 company prefix is not set for this organization. **Set it in Settings → Company profile
> (7 digits)**, then pack again."

Komunikat nazywa brakujace ustawienie i miejsce — nie „sprobuj ponownie". Asercja
`not.toMatch(/Something went wrong/i)` przeszla.

**D6b — ustawienie z ekranu.** `/en/settings/company`, pole `#company-gs1-prefix` = `5901234`,
przycisk „Save changes". Stan w bazie po zapisie:

```
select id,name,gs1_prefix from organizations where id='...0002';
00000000-0000-0000-0000-000000000002 | Apex | 5901234
```

**D6c — pakowanie po ustawieniu prefiksu DZIALA.** Ta sama paleta, ten sam przycisk:

```
Box 1  SSCC: 059012340000000031  (00)059012340000000031
LICENSE PLATE  ITEM                     QTY
D-LP-OK        RENAMED-NOC-A FG-001     100.000
```

W bazie: `shipment_boxes` 1 wiersz z SSCC-18, `shipment_box_contents` 100,000 kg dla `D-LP-OK`.

---

## POZYCJA 1 — BRAMKA TERMINU W WYSYLKACH (commit 93730681) — **POTWIERDZONA**

Dwie proby, obie klikane w `/en/shipping/shipments/<id>`.

**(a) Paleta jawnie przeterminowana.** `D-LP-EXPIRED`, expiry 2026-08-04 → **ODRZUCONA**.
**Kontrola przeciwna:** `D-LP-CTRL` (expiry +60 dni) → **spakowana**, pudlo nr 2 powstalo.

**(b) RDZEN NAPRAWY — doba ZAKLADU, nie doby SESJI.** Spec `apps/web/e2e/_noc/d01-site-day.spec.ts`.
Przestawilem strefe sesji bazy (`alter database monopilot_t2 set TimeZone='America/New_York'`,
potwierdzone na swiezym polaczeniu roli aplikacji `monopilot`), zeby odtworzyc dokladnie
sytuacje z commita: doba sesji **2026-08-05**, doba zakladu Warszawa **2026-08-06**.

Paleta `D-LP-BOUNDARY`, expiry `2026-08-05 23:00 UTC`. Rozjazd zmierzony w SQL:

```
lp_number      | expiry_date            | stara_regula | nowa_regula
D-LP-BOUNDARY  | 2026-08-05 19:00:00-04 | f            | t
```

czyli **stara regula puscilaby ta palete**. Kliknieta proba spakowania w przegladarce:

```
[D1-BOUNDARY] ok=false   -> ODRZUCONA
[D1-OK-NY]    ok=true    -> kontrola przeciwna w tych samych warunkach przeszla
```

Bramka liczy dobe zakladu. Naprawa potwierdzona behawioralnie, nie tylko na zapytaniu.
Strefe bazy przywrocilem do `Europe/London`.

---

## POZYCJA 2 — ANULOWANIE WYSYLKI: KSIEGA vs STAN (commit b59a5285) — **POTWIERDZONA**

Pelny lancuch **klikany**: pakuj (`pack-lp-submit`) -> zapiecztuj (`shipment-seal-submit`)
-> wygeneruj i podpisz BOL (`shipment-bol-submit`, e-sign PIN) -> wyslij (`shipment-ship-submit`)
-> anuluj (`shipment-cancel-submit`, powod „Customer request" + e-sign PIN).
Spec: `apps/web/e2e/_noc/d02-cancel-shipment-ledger.spec.ts` + `d02b-ship-cancel.spec.ts`.

Stan po anulowaniu (`shipments.status = cancelled`, `shipped_at` niepuste):

```
lp_number      | stan_palety | status    | ksiega_netto | ruchow
D-LP-OK        |  100.000000 | available |     0.000000 |   2
D-LP-BOUNDARY  |  100.000000 | available |            0 |   0
D-LP-CTRL      |  100.000000 | available |            0 |   0
D-LP-EXPIRED   |  100.000000 | available |            0 |   0

lp_number | move_type  | quantity   | uom | reason_code        | status
D-LP-OK   | issue      | 100.000000 | kg  | shipment_dispatch  | completed
D-LP-OK   | adjustment | 100.000000 | kg  | shipment_cancelled | completed
```

Paleta wrocila do 100,000000 kg i statusu `available`; ksiega ma **para** ruchow
`issue -100` / `adjustment +100`, netto **0** — zgadza sie ze stanem **co do grama**.
Palety nietkniete operacja maja 0 ruchow i nietkniety stan.

---

## POZYCJA 4 — COFNIECIE KONSUMPCJI SUROWCA (commit 58900b69) — **POTWIERDZONA**

Spec: `apps/web/e2e/_noc/d04-reverse-consume.spec.ts`. WO `DEMO-WO-259-003` (IN_PROGRESS),
material `DEMO-RM-FLOUR`, zasiana paleta `D-RM-FLOUR-1` = 200 kg.

Klikniete: zakladka Consumption -> „Record" na wierszu DEMO-RM-FLOUR -> ilosc **100**,
paleta z listy (`D-RM-FLOUR-1 · 200.000000 kg · 2026-11-04 (suggested)`) -> zapis.
Potem zakladka Genealogy -> przycisk cofniecia -> powod „Entry error" + e-sign PIN -> zapis.

```
lp_number     | stan_palety | status    | ksiega_netto | ruchow
D-RM-FLOUR-1  |  200.000000 | available |     0.000000 |   2

move_type       | quantity   | reason_code
consume_to_wo   | 100.000000 | production_consume
adjustment      | 100.000000 | consumption_reversed      <- DODATNI, poprawnie

wo_material_consumption: +100.000 (oryginal) / -100.000 (kontr-zapis)
wo_materials.consumed_qty: 0.000
```

Znak jest **dodatni**. Przy starym (odwroconym) znaku ksiega pokazalaby -200 kg przy palecie
przywroconej do 200 kg — 200-kilogramowa dziura na 100-kilogramowym cofnieciu. Nie ma jej.

---

## POZYCJA 3 — ANULOWANIE ZAKONCZONEGO ZLECENIA (commit 1308ce11) — **POTWIERDZONA**

Spec: `apps/web/e2e/_noc/d03-cancel-completed-wo.spec.ts`. WO `DEMO-WO-259-004`.

Klikniete: „Catch-weight" -> rejestracja wyrobu 100 kg (powstaje paleta FG) -> „Complete"
(bramka wydajnosci wymagala nadpisania: kod „Scrap Quality" + PIN + uzasadnienie) ->
„Cancel" (kod `OPERATOR_ERROR` + notatka). WO konczy w statusie **CANCELLED**.

```
lp_number              | stan_palety | status    | ksiega_netto | ruchow
LP-1785984335100-XFZ2  |    0.000000 | destroyed |     0.000000 |   2
LP-1785984378980-3WB0  |    0.000000 | destroyed |     0.000000 |   2
LP-1785984431080-4O0U  |    0.000000 | destroyed |     0.000000 |   2

move_type  | quantity    | reason_code
receipt    |  100.000000 | production_output
adjustment | -100.000000 | wo_cancelled       <- kontr-zapis dla kazdej z 3 palet
```

Kazda paleta wyjsciowa wyzerowana i `destroyed`, dla kazdej ksiega ma pare
`receipt +100` / `adjustment -100`, netto **0**. Sto kilogramow juz nie znika bez sladu.

---

## POZYCJA 9 — BRAMKA BLOKAD JAKOSCIOWYCH (commit bf7f0579) — **CZESCIOWO**

Spec: `apps/web/e2e/_noc/d09-holds-gate.spec.ts`. Na palecie `D-LP-CTRL` zasialem
**aktywna blokade** (`quality_holds`, `hold_status='open'`, widoczna w `v_active_holds`
jako `HLD-00001003`), palete `D-LP-OK` zostawilem bez blokady. Obie alokowane do tej samej wysylki.

| paleta | blokada | wynik pakowania |
|---|---|---|
| `D-LP-CTRL` | aktywna | **odrzucona** |
| `D-LP-OK` | brak | **spakowana** |

**Bramka dziala — towar pod blokada nie wychodzi.** Ale komunikat brzmi:

> „Something went wrong saving. Please retry."

Zadanie mowilo „z komunikatem o blokadzie". Komunikatu o blokadzie **nie ma** — patrz
BLOKER/POWAZNE nizej (`lp_blocked_for_pack` bez mapowania).

---

## POZYCJA 7 — POWODY ZWROTU (commit 9ad47fbf) — **NIE DZIALA**

Szczegoly z dowodem w sekcji POWAZNE poniżej. Skrot: przycisk „Add RMA reason" na
`/en/settings/ship-override-reasons` **nie zapisuje niczego** w organizacji, na ktorej
chodzi caly lokalny harness — `rma_reason_codes` zostaje puste, a ekran mowi
„Reason code was not saved. Check the code is unique for this organization…", czyli
wskazuje zla przyczyne.

---
---

# ZNALEZISKA

## POWAZNE 1 — „Add RMA reason" nie zapisuje: schemat odrzuca WLASNE org_id aplikacji

**Waga:** POWAZNY (sciezka ustawien nadal martwa w kazdym srodowisku lokalnym/E2E;
komunikat wskazuje zla przyczyne). Naprawa z commita 9ad47fbf **nie dziala tu, gdzie testujemy**.

**Odtworzenie**
1. `/en/settings/ship-override-reasons` jako admin (`harness`)
2. sekcja „RMA reason codes" -> „+ Add RMA reason"
3. Reason code `D-DAMAGED`, Label (EN) `Damaged in transit (TOR D)` -> „Save"

**Co widac**

> „Reason code was not saved. Check the code is unique for this organization, …"

**Stan w bazie** — pusto, mimo ze kod byl unikalny (tabela byla pusta):

```
select count(*) from rma_reason_codes;   ->  0
```

**Przyczyna (zmierzona sonda w akcji serwerowej, sonda usunieta po pomiarze)**

```
[IN] {"orgId":"00000000-0000-0000-0000-000000000002","code":"D-DAMAGED",
      "label_en":"Damaged in transit (TOR D)"}
     parsed=false err=[{"validation":"regex","code":"invalid_string","path":["orgId"]}]
```

Walidacja **nie doszla nawet do bazy** — poleglo `orgId`. Plik
`apps/web/app/[locale]/(app)/(admin)/settings/ship-override-reasons/_actions/shipping-overrides.ts:101`
uzywa **scislego RFC-4122**:

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
```

podczas gdy `apps/web/lib/auth/with-org-context.ts:180` (ten sam repozytoryjny wzorzec w
`platform-context.ts`, `site-context.ts`, `resolve-line-label.ts`, `lab/read-model.ts`) uzywa
luznego, samych szesnastkowych. `withOrgContext` **oddaje** `00000000-0000-0000-0000-000000000002`,
a schemat w tym jednym pliku ten sam identyfikator **odrzuca** (cyfra wersji `0`, wariant `0`).

```
id                                   | name | przechodzi_scisly_regex
00000000-0000-0000-0000-000000000002 | Apex | f
00000000-0000-0000-0000-0000000000ee | GDPR | f
```

**Zasieg.** Ten sam `orgId: UuidInput` stoi w `CreateReasonCodeInput` (linie 104-107),
`UpdateReasonCodeInput`, `DeactivateReasonCodeInput` i w `safeParse` na linii 239 — czyli
**wszystkie zapisy tego ekranu** ida przez ten sam warunek. Siostrzanego „Add reason"
nie kliknalem osobno (spec serial przerwal sie na D7a), wiec zglaszam go jako
*ta sama sciezka kodu*, nie jako osobne odtworzenie.

**Dlaczego zielony test tego nie zlapal.** Nowy `create-rma-reason-code.integration.test.ts`
podaje `seed.orgId` — wygenerowany, poprawny UUID v4. Test przechodzi, ekran nie dziala.
To dokladnie wzorzec „zielony test obok defektu".

**Uwaga uczciwosciowa.** Na produkcji, gdzie org ma UUID v4 z `gen_random_uuid()`, ten zapis
prawdopodobnie **zadziala** — ale kazde srodowisko lokalne i kazdy tor przegladarkowy chodzi na
organizacji `…0002`, wiec dla nich funkcja jest martwa i nie da sie jej tam zweryfikowac.

---

## POWAZNE 2 — blokada zywnosciowa melduje sie jako „Something went wrong. Please retry."

**Waga:** POWAZNY. Sama bramka dziala (towar nie wychodzi) — zly jest komunikat, i to
na sciezce bezpieczenstwa zywnosci, gdzie „sprobuj ponownie" zapraszа operatora do
bicia w przycisk zamiast do kwarantanny towaru.

**Odtworzenie** — trzy niezalezne przypadki, wszystkie klikniete:

| paleta | powod odrzucenia | komunikat na ekranie |
|---|---|---|
| `D-LP-EXPIRED` (expiry 2026-08-04) | przeterminowana | „Something went wrong saving. Please retry." |
| `D-LP-BOUNDARY` (wygasla wg doby zakladu) | przeterminowana | jw. |
| `D-LP-CTRL` (aktywna blokada `HLD-00001003`) | blokada jakosciowa | jw. |

**Przyczyna.** `apps/web/lib/shipping/pack-lp-into-box.ts` zwraca
`{ ok:false, error:'lp_blocked_for_pack' }`, ale mapa etykiet w
`apps/web/app/[locale]/(app)/(modules)/shipping/shipments/[shipmentId]/page.tsx:180-197`
**nie ma klucza `lp_blocked_for_pack`** i nie ma go tez `apps/web/i18n/en.json`
(`Shipping.shipments.pack.errors` zawiera 11 kluczy, tego nie ma). Wpada wiec w
`persistence_failed`.

**To jest dokladnie ta sama usterka, ktora dzis naprawiono obok.** Commit 48e0f149 dopisal
`missing_gs1_prefix` i `invalid_gs1_prefix` z komentarzem „nothing mapped them, so a missing
org setting read as »Something went wrong saving. Please retry.« — a retry can never fix it".
Rodzenstwo `lp_blocked_for_pack` zostalo pominiete — a jest grozniejsze od obu naprawionych.

Dla porownania: siostrzana bramka wysylki ma poprawny tekst
(`ship.errors.lp_blocked_for_ship` = „Cannot ship — a license plate is on a quality hold,
not QA-released, or expired."), wiec brakuje tylko odpowiednika po stronie pakowania.

---

## DROBNE 1 — `pack-lp-success` nigdy sie nie renderuje (martwy kod)

`apps/web/app/[locale]/(app)/(modules)/shipping/shipments/_components/shipment-pack-view.tsx`
deklaruje stan `success` (161) i element `data-testid="pack-lp-success"` (367-374), ale
`setSuccess` jest wolane **wylacznie z `null`** — linie 211, 217, 255. Nigdzie w pliku nie ma
wywolania z komunikatem, nie ma tez klucza `pack.success` w i18n.

Skutek: udane spakowanie palety **nie daje zadnego potwierdzenia** — zmienia sie tylko lista
pudel. Dane zapisuja sie poprawnie (sprawdzone: `shipment_boxes` + `shipment_box_contents`),
wiec to nie jest utrata danych, ale operator skanujacy palety nie dostaje sygnalu, ze skan wszedl.

Uboczny skutek dla testow: `apps/web/e2e/fulfilment-allocate-pack-ship-pod.spec.ts:137-140`
czeka na `pack-lp-success` **lub** `pack-lp-error` — ten warunek moze byc spelniony tylko
przez galaz bledu.

---

## DROBNE 2 — FORMATTING_ERROR i18n na kazdym ekranie

`page.on('console')` zbiera na **kazdej** odwiedzonej stronie serie serwerowych bledow:

```
Error: FORMATTING_ERROR: The intl string context variable "n" was not provided
       to the string "{n} unread notifications"
… "{n}m ago" / "{n}h ago" / "{n}d ago"      (topbar, wszedzie)
… "{shown} of {total} materials"            (/technical/materials)
… "{count} columns"                         (/settings/schema)
… "Sites ({count})", "{lines} lines · {workers} workers", "Expires {date}"  (/settings/sites)
… "{n} rows", "{n} lines"                   (/planning/transfer-orders)
… "Item {itemCode} already exists"          (/technical/items)
```

Nie wywracaja renderu (etykiety pokazuja sie z placeholderem albo pusto), ale zasmiecaja
konsole do tego stopnia, ze prawdziwy blad utonie. Zbiorczo, nie po jednym.

---

## OBALONE / NIE-BLEDY

- **`shipShipment` zwraca „cannot be shipped in its current status" mimo statusu `packed`** —
  scigalem to sonda; to **nie jest** blad produktu. Wysylka i pudla byly w porzadku
  (`[P1] {"found":true,"status":"packed","boxes":1}`, `[P2] {"soStatus":"allocated","lpCount":1}`),
  wywrotka siedziala na koncu funkcji: po wyslaniu ostatniej wysylki kod przestawia **zamowienie**
  na `shipped`, a przejscie `allocated -> shipped` jest nielegalne w grafie statusow
  (`so-status-write.ts`). Moj seed ustawil SO na `allocated` z pominieciem kompletowania.
  Po ustawieniu SO na `packed` wysylka przechodzi. **Warto jednak zauwazyc**, ze operator
  dostaje w tej sytuacji komunikat o statusie **wysylki**, podczas gdy problem jest ze statusem
  **zamowienia** — mylace, ale nie odtwarzalne normalnym przeplywem.

---

# PODSUMOWANIE WERDYKTOW

| # | Naprawa | Commit | Werdykt |
|---|---|---|---|
| 1 | Bramka terminu w wysylkach (doba zakladu) | 93730681 | **POTWIERDZONA** |
| 2 | Anulowanie wysylki — ksiega vs stan | b59a5285 | **POTWIERDZONA** |
| 3 | Anulowanie zakonczonego zlecenia | 1308ce11 | **POTWIERDZONA** |
| 4 | Cofniecie konsumpcji (znak) | 58900b69 | **POTWIERDZONA** |
| 5 | Koszt receptury 200 g @ 5,00/kg | 2dcd9a73 | **POTWIERDZONA** |
| 6 | Prefiks GS1 + komunikat | 9ad47fbf + 48e0f149 | **POTWIERDZONA** |
| 7 | Powody zwrotu (RMA) | 9ad47fbf | **NIE DZIALA** |
| 8 | Wyciek odczytu (5 ekranow) | 5f286e3a | **POTWIERDZONA** |
| 9 | Bramka blokad jakosciowych | bf7f0579 | **CZESCIOWO** (blokuje, komunikat klamie) |

Siedem napraw potwierdzonych klikaniem ze zgodnym stanem w bazie, jedna nie dziala,
jedna dziala polowicznie.

---

# CZEGO NIE SPRAWDZILEM

- **Sciezki PICK i SHIP dla bramki terminu.** Sprawdzilem PACK (i to na obu wariantach doby).
  `pick-actions.ts` i `ship-actions.ts` dostaly w tym samym commicie identyczne
  `expiredBySiteDaySql(...)`, ale osobno ich nie klikalem — pick wymaga listy kompletacyjnej,
  a ship w moim scenariuszu odpalal sie juz po spakowaniu samych waznych palet.
- **Siostrzany zapis „Add reason" na ekranie ustawien wysylki** — patrz POWAZNE 1; ta sama
  linia walidacji, ale nie odtworzylem go osobnym kliknieciem (spec serial przerwal sie wczesniej).
- **Formularz tworzenia zwrotu (RMA Create)** — nie doszedlem, bo bez ani jednego wiersza
  w `rma_reason_codes` nie ma czego wybrac; blokuje to POWAZNE 1.
- **Ekran `/technical/cost` przez sciezke NPD** — linie BOM w gramach powstaja realnie tylko
  przez `materialize-npd-bom.ts`; ja zasialem taka linie SQL-em, bo dialog BOM nie ma pola
  jednostki. Sam odczyt kosztu zweryfikowalem klikaniem.
- **Zachowanie na produkcji dla POWAZNE 1** — nie mam dostepu; na organizacji z UUID v4
  ten zapis prawdopodobnie przechodzi.

# STAN SRODOWISKA PO PRACY

- Strefa bazy `monopilot_t2` przywrocona do `Europe/London` (na czas testu doby zakladu
  byla ustawiona na `America/New_York`).
- Sondy diagnostyczne wstawione tymczasowo do `ship-actions.ts` i `shipping-overrides.ts`
  **usuniete** (`git checkout`); `git status` czysty poza raportami i katalogiem
  `apps/web/e2e/_noc/`.
- Dane zasiane przeze mnie w `monopilot_t2`: klient `D-CUST`, zamowienie z `ext_data.noc='D'`,
  palety `D-LP-*` i `D-RM-*`, wysylka `D-SHP-1`, BOM dla `FG-001` (2 linie), koszty dla
  `SP-PEPPER-BLK`/`ING-SUGAR`, PIN e-sign dla uzytkownika harnessu, 4 uprawnienia odczytu
  dodane roli `Test — Single-site line operator`, blokada jakosciowa na `D-LP-CTRL`,
  `organizations.gs1_prefix = 5901234`. WO `DEMO-WO-259-003` ma cofnieta konsumpcje,
  WO `DEMO-WO-259-004` jest `CANCELLED`.
- Materialy robocze: `apps/web/e2e/_noc/` (7 specow + `seed-shipping.sql`).
