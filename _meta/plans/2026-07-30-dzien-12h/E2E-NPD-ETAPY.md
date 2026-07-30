# E2E NPD — etapy · zamknięcie luki dowodowej commita `4a3d02a9`

**Data:** 2026-07-30 · **Baza:** lokalny `monopilot` (127.0.0.1:5432) · **Persona:** `harness`
**Spec:** `apps/web/e2e/npd-chain-seams.spec.ts`, blok `ETAPY` (dopisany do istniejącego pliku, nowego nie tworzono)
**Uruchomienie:** `bash scripts/e2e-local.sh apps/web/e2e/npd-chain-seams.spec.ts --grep "ETAP-" --reporter=line`
**Wynik ostatniego przebiegu:** `5 passed (35.7s)` · log `/tmp/etap-run3.log`

Tor naprawiający napisał wprost: **„NIE klikałem — przeglądarka zajęta"**. Ten dokument dostarcza
brakujący dowód: **akcja w przeglądarce + trwały stan w Postgresie**.

---

## WERDYKT

**Naprawa działa.** Sekcje działowe renderują się na `/formulation` (etap `recipe`) i `/approval`,
operator w nie wpisuje, zapis dociera do źródła, z którego czyta bramka, a bramka na to reaguje —
w **obie strony**: puste pole dalej blokuje, wypełnione przepuszcza.

**Projekt NPD-018 przeszedł z `recipe/G2` do `pilot/G3` — sześć etapów od `brief`.**
Reszta bazy (18 projektów) nadal stoi na `brief/G0`.

```
current_stage | current_gate | count
--------------+--------------+-------
 brief        | G0           |    18
 pilot        | G3           |     1     <- NPD-018
```

---

## 1. Czy sekcje faktycznie się renderują — i czy operator może w nie wpisać?

**TAK, na obu ekranach.** Nie „komponent jest w źródle" — pola są widoczne, edytowalne,
oznaczone gwiazdką wymagalności i mają własny przycisk `Save`.

### `/en/pipeline/<NPD-018>/formulation` — etap `recipe`

Test `ETAP-1` czeka na `stage-dept-sections-recipe`, po czym dla **każdego z trzech** pól sprawdza:
widoczność → obecność kontrolki `input`/`textarea` → **brak atrybutu `readonly`** → wpisuje wartość →
asertuje, że wartość została w polu → asertuje, że `Save` przy tym polu **aktywował się po zmianie**.

Zrzut: `apps/web/e2e/artifacts/npd-chain-seams/etap-02-recipe-fields-typed.png` — na dole ekranu
karty **Planning** (`Primary Ingredient Pct *`, `Date Code Per Week *`) i **Technical** (`Shelf Life *`),
z wpisanymi wartościami i aktywnymi przyciskami `Save`.

Konfiguracja, na której liczy bramka (to samo źródło, którego używa `requiredFieldsMissing`):

```sql
select distinct d.name as dept, lower(f.code) as field, f.label, f.data_type,
       to_jsonb(p.*) ->> lower(f.code) as wartosc
  from public.npd_departments d
  join public.npd_department_field df on df.department_id = d.id and df.org_id = d.org_id
  join public.npd_field_catalog f     on f.id = df.field_id and f.org_id = df.org_id
  join public.npd_projects np         on np.id = $1::uuid
  left join public.product p          on p.org_id = np.org_id and p.product_code = np.product_code
 where d.org_id = np.org_id and d.active and d.stage_code = 'recipe'
   and df.visible and df.required and f.active;
```

Wynik przed wypełnieniem (`[STAN ETAP-1]`):

```json
[{"dept":"Planning","field":"date_code_per_week","label":"Date Code Per Week","data_type":"text","wartosc":null},
 {"dept":"Planning","field":"primary_ingredient_pct","label":"Primary Ingredient Pct","data_type":"number","wartosc":null},
 {"dept":"Technical","field":"shelf_life","label":"Shelf Life","data_type":"text","wartosc":null}]
```

Kontrola uczciwości w tym samym teście: po samym **wpisaniu bez kliknięcia `Save`** to zapytanie
nadal zwraca trzy `null` — czyli test mierzy realny zapis, a nie stan pola w DOM.

### `/en/pipeline/<NPD-018>/approval` — etap `approval`

Test `ETAP-5`: **7 z 7** wymaganych pól obecnych na ekranie
(`article_number`, `bar_codes`, `cases_per_week_w1/w2/w3`, `department_number`, `launch_date`) —
każde sprawdzane po `data-field`, nie po indeksie.

Zrzut: `etap-08-approval-section.png` — karta **Commercial** z siedmioma polami i przyciskami `Save`.

Dowód zapisu (nie renderu) — jedno pole zapisane z ekranu i odczytane z bazy:

```sql
select p.article_number
  from public.product p
  join public.npd_projects np on np.org_id = p.org_id and np.product_code = p.product_code
 where np.id = $1::uuid;
--  article_number
-- ----------------
--  E2E-ART-266102      <- wartość wpisana i zapisana z /approval w tym przebiegu
```

---

## 2. Czy wpisana wartość odblokowuje bramkę?

**TAK. Blokery 3 → 0, potwierdzenie odblokowane, projekt przeszedł etap.** (test `ETAP-3`)

### Stan PRZED

```sql
select current_stage, current_gate from public.npd_projects where code = 'NPD-018';
-- recipe | G2
```
Pola `recipe` w źródle bramki: **wszystkie `null`** (zapytanie z sekcji 1).
Blokery w modalu przejścia: **3**.

### Akcja

Trzy pola wypełnione **z ekranu** `/formulation`, każde własnym przyciskiem `Save`:

```
[ETAP-3] zapis „primary_ingredient_pct" → saved
[ETAP-3] zapis „date_code_per_week"    → saved
[ETAP-3] zapis „shelf_life"            → saved
```

### Stan PO — źródło, z którego czyta bramka

```json
[{"field":"date_code_per_week","wartosc":"W-CODE-3"},
 {"field":"primary_ingredient_pct","wartosc":"42"},
 {"field":"shelf_life","wartosc":"21 dni"}]
```

Modal przejścia: `[DOWÓD ETAP-3] blokery PO wypełnieniu (0): []`, przycisk potwierdzenia **aktywny**,
serwer zwrócił `advance-gate-success`.

### Stan PO — projekt

```sql
select current_stage, current_gate from public.npd_projects where code = 'NPD-018';
-- packaging | G3        <- było recipe | G2
```

Asercje testu (nie „pomiar", tylko twarde `expect`): blokery `= 0`, potwierdzenie `toBeEnabled`,
`stage = 'packaging'`, `gate = 'G3'`.

---

## 3. Kontrola przeciwna — czy puste pole DALEJ blokuje?

**TAK, tym samym komunikatem, co przed naprawą.** (test `ETAP-2`, uruchamiany **przed** wypełnieniem)

Fixture (punkt startowy, nie obejście bramki): etap ustawiony na `recipe/G2`, trzy kolumny
wyzerowane w tabeli bazowej widoku `public.product`:

```sql
update public.fg_npd_ext x
   set primary_ingredient_pct = null, date_code_per_week = null, shelf_life = null
  from public.items i
 where i.id = x.item_id and i.item_code = 'FG-018';
```

Lista bramki G2 przeklikana w interfejsie (`odhaczono 0`; stan `4 wymagane / 3 done` — czwarty punkt
jest rozstrzygany automatycznie i nie da się go odhaczyć ręcznie). Że lista **nie jest** przyczyną
blokady, dowodzi `ETAP-3`: przy **tym samym** stanie listy, po wypełnieniu samych pól, blokerów jest
zero. Modal przejścia przy pustych polach:

```
[DOWÓD ETAP-2] blokery przy PUSTYCH polach (3):
  ["○ Planning: Primary Ingredient Pct", "○ Planning: Date Code Per Week", "○ Technical: Shelf Life"]
[DOWÓD ETAP-2] potwierdzenie aktywne: false
```

Stan po próbie:

```sql
select current_stage, current_gate from public.npd_projects where code = 'NPD-018';
-- recipe | G2      <- NIE ruszył
```

Asercje: każdy z trzech komunikatów wymieniony z osobna, potwierdzenie `= false`,
`stage = 'recipe'`, `gate = 'G2'`. **Naprawa nie przepuszcza wszystkiego.**

---

## 4. Jak daleko da się teraz dojść?

**Sześć etapów: `brief` → `recipe` → `packaging` → `costing_nutrition` → `trial` → `sensory` → `pilot`.**
(test `ETAP-4`, sterownik: wypełnij wymagane pola działowe etapu z ekranu → odhacz listę bramki →
otwórz modal → potwierdź, jeśli aktywny → odczytaj stan z bazy)

| krok | etap → etap                     | pól działowych | blokery twarde | miękkie                                   | wynik |
|------|---------------------------------|----------------|----------------|-------------------------------------------|-------|
| 1    | `packaging` → `costing_nutrition` | 11 (MRP, Procurement) | 0 | — | przeszedł, `G3` |
| 2    | `costing_nutrition` → `trial`   | 0              | 0              | `Cost breakdown computed`, `Nutrition computed` → nadpisane notatką | przeszedł, `G3` |
| 3    | `trial` → `sensory`             | 0              | 0              | —                                         | przeszedł, `G3` |
| 4    | `sensory` → `pilot`             | 0              | 0              | —                                         | przeszedł, `G3` |
| 5    | `pilot` → `approval`            | 3 (Production) | **1** — patrz niżej | — | **ŚCIANA** |

Wszystkie 11 pól `packaging` i 3 pola `pilot` (w tym dropdown `Line`) dały się wypełnić i zapisać
z ekranu — w bazie:

```sql
select primary_ingredient_pct, date_code_per_week, shelf_life, line, rate, yield_line, article_number
  from public.product where product_code = 'FG-018';
--  42 | W-CODE-3 | 21 dni | L1 | 12 | 12 | E2E-ART-266102
```

Nadpisanie miękkiej bramki zostawiło ślad w audycie (dowód, że przejście było świadome, nie ciche):

```sql
select action, after_state->>'fromStage', after_state->>'toStage', after_state->>'missing'
  from public.audit_log where action = 'npd.stage.gate_overridden' order by occurred_at desc limit 1;
-- npd.stage.gate_overridden | costing_nutrition | trial | ["Cost breakdown computed", "Nutrition computed"]
```

---

## GDZIE ŁAŃCUCH URYWA SIĘ TERAZ

**Spoina `pilot` → `approval`, przejście bramkowe G3 → G4.**

```
[DOWÓD ETAP-4] ŚCIANA: {"etap":"pilot","bramka":"G3",
  "blokery":["○ Gate G3 e-signature approval is required before entering the Approval stage."],
  "blad":null}
[DOWÓD ETAP-4] stan końcowy: {"stage":"pilot","gate":"G3"}
```

**To NIE jest nowa przeszkoda ani defekt — to zaprojektowany punkt kontrolny BRCGS/CFR-21**
(`gate-helpers.ts:529 hasG3ESignForApproval` → `evaluate-stage-gate.ts:200-212`). Zachowuje się
poprawnie i **uczciwie**: gotowość świeci na czerwono (`gotowoscZielona: false`), przycisk
potwierdzenia jest wyłączony, komunikat mówi wprost, czego brakuje, projekt nie drgnął w bazie.

Ścieżka dalej istnieje i jest widoczna na `/approval` (zrzut `etap-08-approval-section.png`):
panel **Approval gates** z siedmioma kryteriami + **Approval chain** z przyciskiem `Submit for approval`.
Przycisk jest zablokowany komunikatem `All criteria must pass before you can submit`, bo na NPD-018
pięć kryteriów stoi na `Pending` (C1 receptura zablokowana, C2 NutriScore, C3 marża, C5 alergeny
zadeklarowane, C7 dokumenty zgodności) — **to praca produktowa do wykonania, nie usterka**.
Formalny podpis G3 nie był w zakresie tego zlecenia i nie był wykonywany.

---

## Uwagi poboczne (do decyzji ownera, NIE zgłaszane jako blokery)

1. **Sprzeczność „gotów"/„niekompletny" na miękkiej bramce `costing_nutrition` → `trial`.**
   Modal jednocześnie pokazuje zielone `✓ No blockers — ready to advance!` **i** czerwone
   `Required stage checks are incomplete. Add an override note to continue.`
   Przyczyna w kodzie: `evaluateStageGate` liczy doradczy warunek kosztu/wartości odżywczych
   **tylko** w trybie `advance` (`evaluate-stage-gate.ts:240`), a modal pobiera gotowość w trybie
   `readiness` (`fetch-stage-gate-readiness.ts:212`), który ten warunek pomija. Efekt: pierwsze
   kliknięcie „Advance" zawsze idzie w próżnię, a operator dowiaduje się o notatce dopiero po nim.
   Skutek dla użytkownika łagodny (druga próba z notatką przechodzi), ale komunikat jest mylący.

2. **Surowe klucze i18n na ekranie operatora — nadal żywe instancje.** Widoczne na zrzutach:
   `npd.faProductionTab.componentsCount`, `npd.costPanel.afterYield`, `npd.costPanel.processing`
   (`/formulation`) oraz `npd.approvalScreen.countPass / countWarn / countPending` (`/approval`).
   To ta sama klasa, którą zamykał commit `63f8016d` — te miejsca zostały poza nim.

3. **`FORMATTING_ERROR: The intl string context variable "…" was not provided`** — setki wystąpień
   w konsoli serwera na każdym ekranie NPD (`{n} unread notifications`, `{count} blocking`,
   `Completed by {by} · {at}`, `Ingredient total is {qty} kg…`). **DUPLIKAT** — to samo zjawisko
   opisały dziś już inne tory (`E2E-BOM-ZLECENIE.md`, `E2E-PELNY-LANCUCH.md`,
   `E2E-JAKOSC-PO-NAPRAWIE.md`, `E2E-SCIEZKA-NPD-FINANSE.md`). Notuję tylko potwierdzenie zasięgu:
   dotyczy również wszystkich dziewięciu ekranów etapów NPD.

4. **Umiejscowienie sekcji.** Na `/formulation` karty Planning/Technical są doklejone na samym dole
   bardzo długiej strony (pod recepturą, panelem kosztów, Production detail i BOM-em). Operator musi
   przewinąć kilka ekranów, żeby zobaczyć pola, bez których nie przejdzie bramki. Działa — ale to
   najgorsze możliwe miejsce dla pól blokujących postęp.

---

## Zmiany w repo

- **Kod produkcyjny: nietknięty.**
- `apps/web/e2e/npd-chain-seams.spec.ts` — dopisany blok `ETAPY` (5 testów + helpery). Nowego pliku
  spec nie tworzono, zgodnie ze zleceniem.
- Nic nie commitowane, nic nie pushowane. Migracji nie aplikowano.

Dwie pułapki wyłapane po drodze — **oba to były błędy specu, nie produktu**, warte zapisania:

- `page.getByRole('option')` łapie **natywny `<select>` wyboru zakładu z nagłówka** (`All sites`),
  a nie listę komponentu `Select` (portalowaną do `<body>`). Zgłosiłoby to fałszywą ścianę
  „dropdown `Line` nie ma opcji". Poprawny selektor: `page.getByRole('listbox').getByRole('option')`.
  **Ta sama pułapka siedzi nadal w helperze `fillStageDeptField` bloku `POFIX`** (linie 704-705) —
  nieszkodliwa dzisiaj (POFIX nie dotyka dropdownów), ale wybuchnie przy pierwszym użyciu.
- Przycisk `Save` sekcji działowej jest **rodzeństwem** `[data-field]`, nie jego dzieckiem.
  `getByRole('button').first()` w rodzicu trafia w trigger dropdownu, nie w zapis.
  Poprawnie: `editor.locator('xpath=following-sibling::div[1]').getByRole('button').first()`.

## Jak powtórzyć

```bash
bash scripts/e2e-local.sh apps/web/e2e/npd-chain-seams.spec.ts --grep "ETAP-" --reporter=line
```

Blok jest **powtarzalny**: `ETAP-1` sam ustawia punkt startowy (NPD-018 → `recipe/G2`, trzy pola
`recipe` wyzerowane), więc cały dowód — łącznie z kontrolą przeciwną — odtwarza się od zera przy
każdym uruchomieniu. Potwierdzone trzema kolejnymi przebiegami.
Zrzuty: `apps/web/e2e/artifacts/npd-chain-seams/etap-*.png`.
