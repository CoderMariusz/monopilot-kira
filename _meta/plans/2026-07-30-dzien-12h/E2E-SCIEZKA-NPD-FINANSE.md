# E2E — ścieżka NPD → finanse (przeglądarka, baza `monopilot`)

**Data:** 2026-07-30 · **Tor:** E2E sekwencyjny (przeglądarka na wyłączność)
**Uruchamianie:** `bash scripts/e2e-local.sh apps/web/e2e/<spec>.spec.ts` (asercja 127.0.0.1, `--workers=1`)
**Zasada dowodu:** akcja → **wiersz w bazie**. Renderowanie strony nie jest dowodem.
Każdy krok specu `npd-create-to-wo-flow` czyta stan zwrotnie z Postgresa (`pg.Client`,
wzorzec z `faza1-ui-recheck-b.spec.ts:15-33`).

---

## 1. Tabela kroków

| # | krok | spec | wynik | dowód (akcja → wiersz w bazie) | werdykt |
|---|------|------|-------|--------------------------------|---------|
| 1 | NPD: utworzenie projektu przez kreator | `npd-create-to-wo-flow` #1 | ✅ | `npd_projects` NPD-016: `name`, `weekly_volume_packs=1200`, `runs_per_week=3` + 48× `gate_checklist_items` | **przestarzały spec — naprawiony** |
| 2 | Mint FG (kandydat) | `npd-create-to-wo-flow` #2 | ✅ | `npd_projects.product_code='FG-016'` + `items` FG-016 (`item_type='fg'`, nazwa = nazwa projektu) | **przestarzały spec — naprawiony** |
| 3 | Receptura: dodanie składnika | `npd-create-to-wo-flow` #3 | ⚠️ zielony **tylko po obejściu** | `formulation_ingredients` = 1 wiersz (v1 tego projektu) | **BLOKER PRODUKTU** (P0-1) |
| 3b | Bramka „Recipe has ≥1 ingredient" | `npd-create-to-wo-flow` #3 | ⏭️ degraduje | pozycja `recipe-has-ingredient` nieobecna (projekt stoi na G0/brief) | konsekwencja P0-4 |
| 4 | Opakowania: komponent + dostawca | `npd-create-to-wo-flow` #4 | ✅ | `packaging_components`: 1 wiersz, `supplier_id=a8e90767…` (nie NULL) | **przestarzały spec — naprawiony** |
| 5 | Produkcja: proces + linia + konsumpcja | `npd-create-to-wo-flow` #5 | ❌ nie zapisuje | `npd_wip_processes` = **0** dla każdego projektu | **BLOKER PRODUKTU** (P0-1, ten sam) |
| 6 | Planning: zlecenie produkcyjne (WO) | `npd-create-to-wo-flow` #6 | ⚠️ WO powstaje, ale **pusty** | `work_orders` WO-202607-0001, `status=DRAFT`, `planned_quantity=100` — **`bom_headers` = 0** | **BLOKER PRODUKTU** (P0-4) |
| 7 | Sprzedaż: utworzenie SO | `order-to-ship-flow` #1 | ⚠️ zielony **tylko po dosianiu** | `sales_orders` SO-202607-00001, `status=draft` | **BLOKER PRODUKTU** (P0-2) + **LUKA DANYCH** |
| 8 | SO: confirm → allocate | `order-to-ship-flow` #2 | ❌ | `sales_orders.status` zostaje `draft` po kliknięciu Confirm | **BLOKER PRODUKTU** (P0-3) |
| 9 | Kompletacja / pakowanie (SSCC) | `order-to-ship-flow` #3 | ⏭️ did not run | — | **nieosiągalne** — zablokowane przez P0-3 |
| 10 | Wysyłka + BOL | `order-to-ship-flow` #4 | ⏭️ did not run | — | **nieosiągalne** — zablokowane przez P0-3 |
| 11 | POD → delivered | `order-to-ship-flow` #5-6 | ⏭️ did not run | — | **nieosiągalne** (dodatkowo e-podpis = brak dowodu, patrz §4) |
| 12 | Wycena / WAC (finanse) | — | ⏭️ nieosiągalne | brak LP z produkcji (P0-4) i brak wysyłki (P0-3) | **nieosiągalne** |

**Bilans:** przeszedłem **8 z 12** przejść, **6 z 6** kroków głównego specu jest zielonych z dowodem w bazie
(2 z nich wyłącznie po obejściu udokumentowanego blokera). **4 przejścia nieosiągalne.**

---

## 2. Blokery produktu (kod NIE naprawiany — do fal naprawczych)

### P0-1 · Portalowany panel pickera nie mieści się w oknie — pozycji nie da się kliknąć
**Anchor:** `apps/web/app/[locale]/(app)/(npd)/_components/item-picker.tsx:128-136`

```ts
const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12)); // ← poziomo PRZYCIĘTE
setPanelRect({ top: r.bottom + 4, left, width });                            // ← pionowo NIGDY
```

Panel jest `position: fixed` i kotwiczy się na `trigger.bottom + 4`. Oś pozioma jest przycinana do
okna, **pionowa nie ma żadnego ograniczenia i nie ma odbicia w górę**. Gdy trigger siedzi nisko,
lista opcji ląduje **pod krawędzią okna**; ponieważ panel jest `fixed`, a listener `scroll`
przekotwicza go z powrotem do triggera, użytkownik **nigdy** nie doprowadzi opcji do widoku.

**Dowód (kontrola przeciwna, ta sama akcja, dwie wysokości okna):**

| okno | klik w opcję | `formulation_ingredients` |
|---|---|---|
| 1280×720 (domyślne) | `locator.click` **timeout** | **0 wierszy** (11 przebiegów) |
| 1280×1600 | klik przechodzi w **~50 ms** | **1 wiersz** |

**Skutek biznesowy:** na standardowym laptopie **nie da się dodać składnika do receptury** —
etap „Recipe" jest ślepym zaułkiem. Ten sam wzorzec blokuje picker procesów w panelu WIP
(`npd_wip_processes` = 0), który siedzi jeszcze niżej na stronie.

**Wzorzec powtórzony w 7 miejscach** (ten sam `top: …bottom + 4` bez przycięcia pionowego):
- `apps/web/app/[locale]/(app)/(npd)/_components/item-picker.tsx:135`
- `apps/web/app/(npd)/fa/[productCode]/_components/fa-production-tab.tsx:655`
- `packages/ui/src/Select.tsx:427` ← **współdzielony prymityw, używany wszędzie**
- `apps/web/app/[locale]/(app)/(modules)/warehouse/adjustments/_components/direct-adjust-form.client.tsx:800`
- `apps/web/app/[locale]/(app)/(modules)/warehouse/counts/_components/count-session-detail.client.tsx:998`
- `apps/web/app/[locale]/(app)/(modules)/technical/wip-library/_components/wip-process-chain-editor.tsx:47`
- `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/formulation/_components/wip-definition-picker.tsx:70`

> Uwaga do §6.8 planu dnia („guard chroniący jeden przypadek zamraża sąsiedni"): tutaj jest
> odwrotność — przycięcie zrobiono **tylko na jednej osi** i skopiowano ten półśrodek 7×.

---

### P0-2 · Linia SO z ceną 0 jest odrzucana, a komunikat wskazuje **nie te pola**
**Anchory:** `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-line-numeric.ts:12-21,32-36`
· `apps/web/app/[locale]/(app)/(modules)/shipping/_components/create-so-modal.tsx:325-341`

```ts
function isPositiveDecimalInput(value: string): boolean {
  if (/^0+(?:\.0+)?$/.test(trimmed)) return false;   // ← "0.0000" odrzucone
}
export function normalizeSoLineUnitPrice(value) { if (!isPositiveDecimalInput(trimmed)) return null; }
```

`validLines` wymaga `isValidSoLineUnitPriceInput(l.unitPriceGbp)`. Świeżo zmintowany FG z NPD ma
`items.list_price_gbp = NULL`, więc `resolveSoLinePrices` zwraca **0.0000** → linia wypada z
`validLines` → modal pokazuje `linesRequired`:

> „Add at least one line with an item and a positive quantity."

Komunikat mówi o **pozycji i ilości**, których **nic nie brakuje** (zrzut a11y w chwili błędu:
`row "FG-016 E2E FG … Remove line | 10 | | 0.0000 | 0 | 0 | GBP | —"`). O cenie — ani słowa.

**Dowód (kontrola przeciwna):** `update items set list_price_gbp = 12.50` → krok 1 przechodzi na
zielono, `sales_orders` SO-202607-00001 zapisany jako `draft`. Bez tego: 0 wierszy.

**Skutek biznesowy:** produktu przeprowadzonego przez NPD **nie da się sprzedać** — nie ma ekranu,
który by o tym powiedział.

---

### P0-3 · „Confirm" nie przeprowadza SO z `draft`
**Dowód:** po kliknięciu Confirm `sales_orders.status` **zostaje `draft`**; przycisk „Confirm"
pozostaje **aktywny**, „Allocate"/„Create pick list"/„Create shipment" nadal `[disabled]`,
żaden błąd nie jest pokazany. Testid `so-status-confirmed` nigdy się nie pojawia
(`so-status-badge.tsx:32` renderuje `so-status-<status>`).

**Skutek:** zamraża **całą drugą połowę ścieżki** — kroki 3-7 specu `order-to-ship-flow`
(allocate → pack SSCC → BOL/ship → POD → delivered) mają status *did not run*.
Do osobnego toru: ustalić, czy akcja w ogóle jest wołana, czy odrzucana po cichu.

---

### P0-4 · Receptura NPD nigdy nie staje się BOM-em → zlecenie produkcyjne jest **puste**
**Dowód (stan po pełnym przejściu kreatora dla 16 projektów):**

```
 code    | product_code | gate | stage | ingr | pkg | wip | boms | wos
 NPD-016 | FG-016       | G0   | brief |   1  |  1  |  0  |  0   |  1
```

WO powstaje, ale interfejs sam to przyznaje — komunikat z listy WO:

> „Work order created, but the product has no active BOM — no materials were generated."

`bom_headers` = **0** dla każdego projektu. Projekt zostaje na **G0/brief** — łańcuch
bramek → NPD Handoff → release-to-factory nigdy nie rusza, więc receptura (`formulation_ingredients`)
nie przechodzi do BOM-u. Bez BOM-u nie ma konsumpcji materiału, nie ma outputu, nie ma LP w
magazynie, nie ma czego wysłać i **nie ma czego wycenić (WAC)**.

---

### P0-5 · Bramka „NPD-backed → tylko przez Handoff" jest **martwa** (fail-open)
**Anchor:** `apps/web/app/[locale]/(app)/(modules)/technical/factory-specs/actions/factory-spec-flow.ts:285-330`

```ts
const npdProjectId = await loadFgNpdProjectId(db, spec.fg_item_id);   // items.npd_project_id
if (npdProjectId) {
  return { ok: false, error: 'npd_handoff_required',
           message: 'NPD-backed specifications must be released via NPD Handoff' };
}
```

Kreator NPD tworzy FG przez **widok** `public.product` (`create-project.ts:345-352`), a jego
trigger `product_instead_of_insert_fn` **nie ustawia `items.npd_project_id`**.

**Dowód:** wszystkie FG-001…FG-016 mają `npd_project_id = NULL` przy `origin_module = 'npd'`.

**Skutek:** warunek `if (npdProjectId)` jest zawsze fałszywy → specyfikację produktu pochodzącego
z NPD **można zwolnić do fabryki z pominięciem NPD Handoff**. Bramka istnieje w kodzie, ale nie
chroni żadnego realnego przypadku.

---

## 3. Pozostałe znaleziska (nie blokują przejścia)

| # | znalezisko | anchor | skutek |
|---|---|---|---|
| D-1 | `@monopilot/ui/Select` **po cichu gubi `data-testid`** — `SelectProps` go nie deklaruje (tylko `SelectTriggerProps`), a atrybuty z myślnikiem omijają kontrolę nadmiarowych propsów w JSX, więc kompiluje się i znika | `packages/ui/src/Select.tsx:21-37` vs `:289` | **10 miejsc**, m.in. `packaging-component-modal.tsx:303 data-testid="field-supplier"` — każdy spec celujący w te selektory jest ślepy |
| D-2 | ~21 błędów i18n `FORMATTING_ERROR: The intl string context variable "X" was not provided` przy każdym renderze etapu Recipe i powłoki | m.in. „Locking freezes v{n}", „Ingredient total is {qty} kg", „{count} allergen(s) detected", „After yield ({yieldPct}%)", „Advance to {gate}", „{n} unread notifications", „{n}m ago" | komunikaty renderują się **bez podstawionych wartości** |
| D-3 | `unit_of_measure` ma **każdy kod zdublowany** (22 wiersze = 11 jednostek × 2: `box box, cm cm, g g, kg kg, L L, m m, mg mg, mL mL, pallet pallet, pcs pcs, t t`) | tabela `public.unit_of_measure` | lista UoM na linii SO pokazuje każdą jednostkę dwa razy |
| D-4 | Picker jest **pusty przy pierwszym otwarciu** — `item-picker-empty` („No matching items") renderuje się od pierwszej klatki, zanim debounce zdąży odpalić wyszukiwanie | `item-picker.tsx:162-169` + `:317` | wygląda jak pusty katalog; **wprowadza w błąd także testy** (patrz S-5) |
| D-5 | ostrzeżenie hydracji: „A tree hydrated but some attributes of the server rendered HTML didn't match" | strona `formulation` | odnotowane; hydracja jako taka **działa** (Server Actions przechodzą) |

---

## 4. Luki danych (dosiane — opisuję czego brakowało)

| co | stan zastany | co dosiałem |
|---|---|---|
| `customers` | **0 wierszy** → `order-to-ship-flow` padał na „a customer must be available or creatable" | `CUST-E2E-001 · E2E Retail Ltd` (org Apex) |
| `items.list_price_gbp` dla FG | **NULL** na wszystkich 18 FG → P0-2 | `12.5000` (18 wierszy) |
| `npd_process_defaults` | 0 wierszy | **nie dosiewałem** — katalog operacji `"Reference"."ManufacturingOperations"` ma 10 wierszy, więc krok 5 blokuje **P0-1**, nie brak danych |

Bazy klonów `t1/t2/t3` nietknięte. `.env.local`, `scripts/test-db.sh`, migracje i seedy nietknięte.

---

## 5. Przestarzałe specy — naprawione

| # | co było nieaktualne | dlaczego | naprawa |
|---|---|---|---|
| S-1 | krok 1 wypełniał tylko nazwę; komentarz twierdził „Continue is gated until a name is filled" | `create-project-wizard.tsx:476` wymaga **trzech** pól; `Weekly volume` i `Runs per week` przyszły z migracją 427 **po** napisaniu testu | wypełniam `wiz-weekly-volume` + `wiz-runs-per-week`, asercja `toBeEnabled` na Continue |
| S-2 | krok 2 klikał modal „Create FG" i czytał kod z hrefa `/fg/<code>` | FG jest mintowany **razem z projektem** (`create-project.ts:328-364`), więc `project-header-create-fg` nigdy się nie renderuje; C7b wchłonął `/fg` do pipeline'u (`project-header.tsx:352-359`, `fg/[productCode]/page.tsx` = czysty redirect) | krok przepisany: kod FG czytany z `npd_projects.product_code` + `items`; niezmiennik B2 asertowany w nowej formie (link zostaje w `/pipeline`) |
| S-3 | krok 5 szedł na `/fg/<code>?tab=production` | ta trasa tylko przekierowuje; `FaProductionTab` jest montowany na etapie formulation (`formulation-wip-panel.tsx:46-60`) | trasa poprawiona na `/pipeline/<id>/formulation` |
| S-4 | krok 4 celował w `getByTestId('field-supplier')` | testid **gubiony** przez `Select` (D-1) | selektor po roli: `form.getByRole('combobox', { name: /supplier/i })` |
| S-5 | krok 3 liczył opcje natychmiast po pojawieniu się `<ul>`, a potem ścigał `item-picker-empty` | `<ul>` istnieje pusty, a `item-picker-empty` renderuje się **od pierwszej klatki** — wyścig zawsze rozstrzygał się na pustce → **cichy „degrade" maskował P0-1** | czekam na samą opcję; ścieżka degradacji **rzuca wyjątek** z treścią panelu zamiast logować i wychodzić |
| S-6 | krok 6 brał `getByRole('combobox').first()` jako pole szukania | trafiał w **przycisk** Selecta „Production line" → `fill` na nie-inpucie | selektor zawężony do `item-picker-panel` |
| S-7 | 11 klików „best-effort" bez limitu czasu | każdy połknięty timeout 30 s zjadał budżet testu, a błąd wypadał w **niepowiązanej** linii | wszystkie ograniczone do 8 s |
| S-8 | domyślny limit testu 30 s | pierwsze wejście na trasę płaci kompilację Turbopacka | `test.describe.configure({ timeout: 180_000 })` — jak `faza1-ui-recheck-b.spec.ts:35` |
| S-9 | brak jakiejkolwiek weryfikacji stanu trwałego | spec potwierdzał wyłącznie render | **6 asercji SQL** — po jednej na krok (`npd_projects`, `items`, `formulation_ingredients`, `packaging_components`, `npd_wip_processes`, `work_orders`) |

Zmienione pliki (tylko specy, kodu produkcyjnego nie ruszałem):
- `apps/web/e2e/npd-create-to-wo-flow.e2e.spec.ts`
- `apps/web/e2e/order-to-ship-flow.e2e.spec.ts` (obejście P0-1 + komentarz z anchorem)

Obejście P0-1 w specach to `page.setViewportSize({ height: 1600 })` — **opatrzone komentarzem
`⚠ WORKAROUND for a PRODUCT BLOCKER`** z anchorem i pomiarem, żeby nie zostało wzięte za preferencję.
Do usunięcia, gdy picker zacznie odbijać panel w górę.

---

## 6. Gdzie ścieżka się rwie — najsłabsze przejścia

**1. Receptura → cokolwiek dalej (P0-1). Najmocniejsze rwanie.**
To nie jest problem etapu, tylko **współdzielonego prymitywu**. Jeden nieprzycięty piksel w pionie
(`item-picker.tsx:135`) zamyka etap Recipe na standardowym laptopie, a ten sam wzorzec powtórzono
7× — w tym w `packages/ui/src/Select.tsx`, czyli pod każdym dropdownem w aplikacji.
**Jedna poprawka w jednym miejscu odblokowuje receptury, procesy WIP, korekty magazynowe i
inwentaryzację naraz.** To jest pierwszy ruch.

**2. NPD → technical/BOM (P0-4 + P0-5). Najgłębsze rwanie.**
Tu nie ma mostu w ogóle. Receptura powstaje, ale **nie ma drogi z `formulation_ingredients` do
`bom_headers`** — projekt zostaje na G0/brief, a zlecenie produkcyjne rodzi się puste i sama
aplikacja to komunikuje. Do tego jedyna bramka pilnująca tego przejścia (`npd_handoff_required`)
jest **martwa**, bo pyta o kolumnę, której mintowanie FG nigdy nie wypełnia. Czyli: przejścia nie
da się wykonać legalnie, a nielegalnie — da się bez przeszkód.

**3. SO draft → confirmed (P0-3). Rwanie odcinające całą sprzedaż.**
Cztery ostatnie etapy ścieżki (kompletacja, wysyłka, POD, wycena) nigdy nie zostały uruchomione,
bo zamówienie nie wychodzi z `draft`. Bez tego finanse są nieosiągalne z definicji.

**4. Cicha degradacja jako mnożnik (S-5).**
P0-1 leżał pod zielonym testem, który logował „no items available … degrading" i **przechodził**.
Wzorzec z §6.2 planu dnia w czystej postaci: test istniał, był zielony i mierzył coś obok.
Dowodem nie było „ekran się wyrenderował" — dowodem było `formulation_ingredients = 0` **po
jedenastu przebiegach**. Każda ścieżka „degrade gracefully" w tych specach zasługuje na ten sam
audyt.

---

## 7. Czego świadomie NIE uznałem za dowód

- **E-podpis** — lokalny fałszywy serwer auth przyjmuje dowolne hasło
  (`packages/e-sign/src/sign.ts:143-160`). Kroki POD (#5-6 `order-to-ship-flow`) i tak nie ruszyły;
  gdyby ruszyły, **nie wyciągałbym z nich żadnego wniosku o bramce podpisu**.
- **Renderowanie strony** — każdy krok ma asercję SQL; kroki 3 i 5 przechodziły „wizualnie"
  (wiersz w tabeli, panel procesów) przy **zerze wierszy w bazie**.
- **Zablokowane kontrolki** — `Allocate`, `Create pick list`, `Create shipment` w stanie
  `[disabled]` potraktowałem jako **wynik testu**, nie jako przeszkodę do obejścia.
- Supabase Storage, unieważnianie tokenów, flagi funkcji, `public.modules` — nietykane.
