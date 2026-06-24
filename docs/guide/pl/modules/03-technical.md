# Technical — kartoteka towarowa, BOM, alergeny, specyfikacje (przewodnik modułu)

> Szczegółowy przewodnik modułu. Każde stwierdzenie poniżej jest powiązane z
> rzeczywistym plikiem w `apps/web/…`; nic nie zostało wymyślone. Technical to
> **moduł 03** (`03-technical` w `.claude/skills/MON-project-overview/SKILL.md`)
> — działa jako autorytatywne źródło specyfikacji fabrycznych. Jest właścicielem
> **kartoteki towarowej**, wspólnego **BOM SSOT**
> (`bom_headers/lines/co_products`), **alergenów** (profile na pozycję +
> macierz kontaminacji + kaskada), **wartości odżywczych**, **specyfikacji
> dostawców**, **terminu przydatności**, **marszrut**, **kosztu/kg** (wspólna
> własność z modułem Finance) oraz **pakietu wydania specyfikacji fabrycznej**.
>
> Ekrany dostępne są pod `/technical/*`
> (`apps/web/app/[locale]/(app)/(modules)/technical/`); ścieżki podano
> bez przedrostka `[locale]`. Akcje serwerowe znajdują się w folderach
> `_actions/` (i kilku `actions/`) dla każdej funkcji. Ostatni przegląd
> na podstawie drzewa roboczego (mig 267 hierarchia-opakowań,
> pakiet wydania specyfikacji fabrycznej T-080/T-081).

---

## a. Przegląd ogólny

Technical to miejsce, gdzie produkt jest **specyfikowany** zanim cokolwiek
zostanie zaplanowane, zakupione lub wytworzone. Technolog tworzy **pozycję
towarową** (surowiec, składnik, półprodukt, wyrób gotowy, produkt uboczny
podstawowy, produkt uboczny odpadowy lub opakowanie) z hierarchią opakowań
UoM, trybem wagowym, terminem przydatności i atrybutami handlowymi; deklaruje
**profil alergenowy** i **wartości odżywcze**; dołącza i zatwierdza
**specyfikację dostawcy**, aby pozycja była możliwa do użycia w produkcji;
buduje **BOM** (nagłówek + linie składników + produkty uboczne) i przeprowadza
go przez serwerową maszynę stanów wersjonowania
(`draft → in_review → technical_approved → active`, atomowo zastępując
poprzednią aktywną wersję); tworzy **marszrutę** (operacje produkcyjne na
liniach/maszynach); prowadzi historię **kosztu/kg** pozycji; a na końcu
bundluje BOM + **factory_spec** przez **wydanie z podpisem elektronicznym**,
które udostępnia recepturę na hali produkcyjnej.

Dwa twarde niezmienniki, na których opiera się cały moduł: **wydany/zatwierdzony
rekord jest niezmienny** — edycje tworzą nową wersję metodą clone-on-write,
nigdy nie modyfikując w miejscu (BOM `BOM_LINE_EDITABLE_STATUSES`,
factory-spec `guardBusinessFieldEdit`); oraz każdy składnik BOM musi przejść
kanoniczny łańcuch **przydatności RM** (aktywna pozycja + zatwierdzona,
aktualna specyfikacja dostawcy + brak zakazanego alergenu dla docelowego WG)
przed utworzeniem BOM, dodaniem linii lub zatwierdzeniem wersji.

Lokalizacje kluczowych akcji: kartoteka towarowa `technical/items/_actions/*`;
BOM `technical/bom/_actions/*`; alergeny `lib/technical/allergens/*` (sterowane
przez `technical/items/[item_code]/_actions/allergen-profile.ts` i
`technical/allergens-config/_actions/*`); specyfikacje dostawców
`technical/items/_actions/supplier-spec-actions.ts`; wartości odżywcze
`technical/items/[item_code]/_actions/upsert-nutrition.ts`; marszruty
`technical/routings/_actions/*`; koszt `technical/cost/_actions/*`; specyfikacje
fabryczne `technical/factory-specs/actions/*` + `actions/technical/release-bundles/*`
(pakiet z podpisem elektronicznym).

---

## b. Inwentarz funkcji

> Odczyty/zapisy wskazują tabele Postgres, których dotyczą. „Brama" to uprawnienie
> sprawdzane po stronie serwera **wewnątrz** akcji (brak uprawnienia zwraca
> `{ ok:false, error:'forbidden' }`, nigdy 500). Cała rodzina `technical.*`
> jest przypisywana roli org-admin przez migrację 154; czytniki poniżej nie mają
> dedykowanego uprawnienia do odczytu i opierają się wyłącznie na RLS.
> Każdy zapis tworzy również wiersz w `audit_log` / `audit_events`.

### Kartoteka towarowa — `technical/items/_actions/*`

| Akcja (plik) | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie / korekta |
|---|---|---|---|---|
| `createItem(input)` (`create-item.ts`) | Wstawia jedną pozycję (`status` domyślnie `active`); waliduje hierarchię opakowań + GS1 GTIN + kanoniczny UoM w zod (zgodnie z CHECKami z mig 153/267). Opcjonalnie zapisuje wstępny koszt/kg przez wspólny rejestr kosztów. | zapisuje `items`, `item_cost_history` (gdy podano `costPerKg`), `audit_log` (`item.created`) | `technical.items.create` | `deactivateItem` (→ zablokowany) / `transitionItemStatus` |
| `updateItem(input)` (`update-item.ts`) | Zmiana atrybutów opisowych i handlowych (`item_code` jest niezmienialny — naturalny klucz org). Koszt **nie** jest tu zapisywany nawet jeśli zostanie podany. | zapisuje `items`, `audit_log` (`item.updated`) | `technical.items.edit` | Edytuj ponownie (każda edycja jest auditowana) |
| `transitionItemStatus({id,toStatus})` (`transition-item-status.ts`) | Przenosi pozycję wzdłuż `draft→active` / `active→deprecated` / `deprecated→active`. **Brama aktywacji:** `draft→active` wymaga kanonicznego `uom_base` (odrzuca dawny dowolny tekst `eac`). Idempotentna. | zapisuje `items`, `audit_log` (`item.status_transitioned`) | `technical.items.edit` | Cofnij przez odwrotną tranzycję (dezaktywacja/reaktywacja); nigdy z powrotem do `draft` |
| `deactivateItem({id,reason?,notes?})` (`deactivate-item.ts`) | „Dezaktywacja" = ustawienie `status='blocked'` (brak kolumny soft-delete). Powód i notatki są rejestrowane wyłącznie w audycie (TEC-081). Idempotentna. | zapisuje `items`, `audit_log` (`item.deactivated`) | `technical.items.deactivate` | Brak akcji odblokowania; utwórz nową / sklonuj pozycję |
| `setShelfLifeOverride({id,...,reason})` (`shelf-life/_actions/set-shelf-life-override.ts`) | Nadpisuje preset terminu przydatności dla **WG** (`shelf_life_days`/`mode`/`date_code_format`); powód obowiązkowy → audit. Odmawia dla typów innych niż WG. | zapisuje `items`, `audit_log` (`item.shelf_life_overridden`) | `technical.items.edit` | Nadpisz ponownie (każda zmiana auditowana) |
| `previewItemsImport(scope,csv)` / `commitItemsImport(rows)` (`items/import/_actions/*`) | Masowy import pozycji z CSV — podgląd w trybie dry-run (walidacja per-wiersz), następnie commit tworzący pozycje. | odczytuje `items`; zapisuje `items`, `audit_log` | `technical.items.create` | Dezaktywuj każdą utworzoną pozycję osobno |
| `listItems` / `getItem` (`list-items.ts`, `get-item.ts`) | Lista pozycji (z dołączonymi nazwami alergenów, liczbą BOM, statusem synchronizacji z D365) + szczegóły pojedynczej pozycji. | odczytuje `items`, `item_allergen_profiles`, `bom_headers`, … | Odczyt z zakresem RLS | — (odczyt) |

### Specyfikacje dostawców — `technical/items/_actions/supplier-spec-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie / korekta |
|---|---|---|---|---|
| `createItemSupplierSpec({itemCode,supplierId,...,approveNow})` | Dołącza specyfikację dostawcy do istniejącej pozycji i (domyślnie `approveNow=true`) zapisuje stan **zatwierdzony + aktywny**, który czyści bramki BOM `SUPPLIER_NOT_APPROVED` / `SUPPLIER_SPEC_NOT_ACTIVE`. Idempotentny upsert na częściowym indeksie unikalności z mig-162 `(org_id,item_id,supplier_code) where active+approved`; rozwiązuje **kod** dostawcy z `supplierId`. Przy `approveNow=false` zapisuje status oczekujący/roboczy (ostrzeżenia pozostają). | odczytuje `items`, `suppliers`; zapisuje `supplier_specs`, `audit_log` (`item.supplier_spec.created`/`.updated`) | `technical.items.edit` | Ponowne wywołanie z nowymi datami (odświeżenie) / dołączenie kolejnego wiersza zastępującego |
| `listItemSupplierSpecs(itemCode)` | Re-eksportuje loader specyfikacji dostawców dla szczegółów pozycji (pojedynczy punkt importu). | odczytuje `supplier_specs`, `suppliers` | Odczyt z zakresem RLS | — (odczyt) |

### Wartości odżywcze — `technical/items/[item_code]/_actions/upsert-nutrition.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie |
|---|---|---|---|---|
| `upsertNutrition({itemCode,nutrition,allergensInherited})` | Wartości odżywcze na 100 g (energia/tłuszcz/nasycone kwasy tłuszczowe/węglowodany/cukry/białko/sól jako ciągi dziesiętne) + kody alergenów odziedziczonych UE-14 dla pozycji `rm`/`ingredient`/`intermediate`. Upsert z kluczem `(org_id,rm_code)`. Odmawia dla innych typów pozycji. | odczytuje/zapisuje `"Reference"."RawMaterials"`, odczytuje `items`; zapisuje `audit_log` (`item.nutrition_upserted`) | `technical.items.edit` | Upsert ponownie (stan sprzed audytowany) |
| `getItemNutrition(itemCode)` | Odczytuje zapisane wartości odżywcze + odziedziczone alergeny. | odczytuje `"Reference"."RawMaterials"` | Odczyt z zakresem RLS | — (odczyt) |

### Alergeny — `technical/items/[item_code]/_actions/allergen-profile.ts` (+ `lib/technical/allergens/service.ts`)

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie / korekta |
|---|---|---|---|---|
| `loadAllergenProfileEditor(itemCode)` | Model odczytu edytora: znaczniki profilu, lista referencyjna UE-14 + niestandardowe alergeny org, historia nadpisań (append-only), możliwość edycji przez wywołującego. | odczytuje `items`, `item_allergen_profiles`, `"Reference"."Allergens"`, `item_allergen_profile_overrides` | Odczyt z zakresem RLS | — (odczyt) |
| `saveAllergenOverride({itemCode,allergenCode,intensity,confidence,reason})` → `upsertProfile(source='manual_override')` | Ręczne nadpisanie jednego alergenu. V-TEC-40 (kod musi istnieć), V-TEC-42 (powód obowiązkowy). Dołącza **niezmienialny** wiersz rejestru `item_allergen_profile_overrides`; **nigdy nie usuwa źródła kaskadowego**. Odmawia dla pozycji opakowaniowych. | zapisuje `item_allergen_profiles`, `item_allergen_profile_overrides`, `audit_log` (`allergen.override`) | `technical.allergens.edit` | `clearAllergenOverride` |
| `clearAllergenOverride({itemCode,allergenCode})` → `deleteProfile` | Usuwa wiersz ręcznego nadpisania; dołącza wiersz rejestru `clear` z aktorem i znacznikiem czasu. | zapisuje/usuwa `item_allergen_profiles`, `item_allergen_profile_overrides`, `audit_log` (`allergen.delete`) | `technical.allergens.edit` | Ustaw ponownie przez `saveAllergenOverride` |
| `saveRiskCell` / `removeRiskCell` (`allergens-config/_actions/load-config.ts` → `lib/technical/allergens/contamination.ts`) | Upsert/usunięcie komórki macierzy ryzyka kontaminacji (linia × alergen, poziom ryzyka + środki zaradcze). | zapisuje tabele ryzyka kontaminacji, `audit_log` | `technical.allergens.edit` | Odwrotna operacja (save/remove) |
| `saveMfgOpAddition` / `removeMfgOpAddition` (ten sam plik → `manufacturing-op.ts`) | Dodanie alergenu per-operacja-produkcyjna (co operacja wprowadza) używane przez kaskadę. | zapisuje tabele alergenów operacji produkcyjnych, `audit_log` | `technical.allergens.edit` | Odwrotna operacja (save/remove) |
| `loadAllergensConfig` / `loadAllergenMatrix` / `loadAllergenCascade` / `loadAllOverrides` (`allergens-config/*`, `allergens/cascade/*`, `allergens/overrides/*`) | Modele odczytu: siatka konfiguracji, pełna macierz alergenów org, wielopoziomowa **kaskada** (formulacja → alergeny produktu), ogólnoorgowy rejestr nadpisań. **Silnik kaskady (T-024) jest jedynym zapisującym wiersze `source='cascaded'`** — te czytniki nie zapisują. | odczytuje tabele profili/referencji/kaskady alergenów | Odczyt z zakresem RLS (dowolne uprawnienie `technical.*`) | — (odczyt) |

### Wspólny BOM SSOT — `technical/bom/_actions/*`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie / korekta |
|---|---|---|---|---|
| `createBomDraft(input)` (`create-draft.ts`) | Tworzy **nową** wersję BOM w stanie `draft` (nagłówek + linie + produkty uboczne, atomowo). Wykonuje V-TEC-13 (odwołanie własne + cykl na grafie ACTIVE), V-TEC-12 (suma alokacji produktów ubocznych niebędących odpadami = 100), V-TEC-14 (każdy składnik przechodzi przydatność RM); V-TEC-11 jest doradczym `warning`. `version = max+1` per produkt. Automatycznie mintuje agregat `public.product` z aktywnego WG gdy brakuje. | odczytuje `product`, `items`, `bom_headers`, `bom_lines`, `supplier_specs`, `item_allergen_profiles`, `nutrition_allergens`; zapisuje `product`, `bom_headers`, `bom_lines`, `bom_co_products`, `audit_log` (`bom.created`), `outbox_events` (`bom.version_submitted`) | `technical.bom.create` | `deleteBomVersion` (tylko draft) |
| `addBomLine(input)` (`line-actions.ts`) | **Dołącza** jedną linię składnika do edytowalnej (`draft`/`in_review`) wersji W MIEJSCU (bez tworzenia nowej wersji — naprawia F-B01). Ten sam łańcuch V-TEC-13/14; `line_no = max+1` z pojedynczym retry savepoint przy kolizji unikalności. | zapisuje `bom_lines`, `audit_log` (`bom.line_added`) | `technical.bom.create` | `deleteBomLine` |
| `updateBomLine(input)` (`line-actions.ts`) | Zmiana ilości / UoM / notatek jednej linii na wersji `draft`/`in_review`. Wydane statusy odmawiają z `bom_not_editable`. | zapisuje `bom_lines`, `audit_log` (`bom.line_updated`) | `technical.bom.create` | Edytuj ponownie lub usuń |
| `deleteBomLine(input)` (`line-actions.ts`) | Usuwa jedną linię na wersji `draft`/`in_review` i przenumerowuje pozostałe do ciągłego zakresu `1..N`. | zapisuje/usuwa `bom_lines`, `audit_log` (`bom.line_deleted`) | `technical.bom.create` | `addBomLine` |
| `approveBom({productId,version})` (`workflow.ts`) | `draft|in_review → technical_approved`; **ponownie waliduje** brak cykli + przydatność RM (kontekst `factory_spec_approval`) w momencie zatwierdzenia; stempluje `approved_by/at`. | zapisuje `bom_headers`, `audit_log` (`bom.approve`) | `technical.bom.approve` | Opublikuj poprzednią wersję; brak akcji „cofnij zatwierdzenie" |
| `publishBom({productId,version})` (`workflow.ts`) | V-TEC-10: `technical_approved → active`; **zastępuje** poprzednią aktywną wersję danego produktu w **tej samej transakcji**. | zapisuje `bom_headers` (aktywacja + zastąpienie), `audit_log` (`bom.publish`), `outbox_events` (`fg.bom.released`) | `technical.bom.version_publish` | „Rollback" = ponowne wywołanie `publishBom` na poprzedniej wersji |
| `deleteBomVersion({productId,version})` (`delete-bom-version.ts`) | Trwałe usunięcie wersji wyłącznie w stanie **draft**. Odmawia jeśli jest to **jedyna** wersja (`only_version`) lub jest referowana przez `bom_snapshots` (`snapshot_referenced`). | zapisuje/usuwa `bom_headers` (+ kaskadowo linie), `audit_events` (`bom.version_deleted`) | `technical.bom.create` | To usunięcie — odtwórz przez `createBomDraft` |
| `diff`, `queries`, `detail-page`, `history`, `recipe`, `generate-batch`, `disassembly` (pozostałe `_actions/*`) | Diff BOM między wersjami, czytniki listy/szczegółów, historia wersji, widok receptury, zadanie generatora wsadowego + tworzenie BOM demontażu (oddzielny `createDisassemblyBomDraft`). | odczytuje `bom_*`; generator zapisuje `bom_generator_jobs` | Odczyt RLS / `technical.bom.create` / `technical.bom.generate_batch` | per-funkcja |

### Marszruty — `technical/routings/_actions/*`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie / korekta |
|---|---|---|---|---|
| `createRouting(input)` (`create-routing.ts`) | Tworzy marszrutę w stanie `draft` z jej operacjami (atomowo). Waliduje V-TEC-60 (ciągłość `op_no` od 1), V-TEC-61 (każda operacja ma `line_id` LUB `machine_id`), V-TEC-62 (czas cyklu > 0 dla operacji produkcyjnych), V-TEC-63 (`manufacturing_operation_name` ∈ `"Reference"."ManufacturingOperations"`). `version = max+1` per pozycja. | odczytuje `items`, `routings`, `"Reference"."ManufacturingOperations"`; zapisuje `routings`, `routing_operations`, `audit_log` (`routing.created`) | `technical.bom.create` (brak dedykowanego uprawnienia marszruty — blokada Wave0 enum) | Sklonuj nową wersję (drafty nigdy nie są usuwane) |
| `updateRouting({routingId,operations})` (`update-routing.ts`) | Atomowo zastępuje zestaw operacji **roboczej** marszruty (usuń + wstaw ponownie), ponownie uruchamiając V-TEC-60..63. Inny niż draft → `invalid_state` (sklonuj nową wersję przez clone-on-write). | zapisuje `routing_operations`, `audit_log` (`routing.operations_replaced`) | `technical.bom.create` | Edytuj ponownie w trybie draft |
| `approveRouting({routingId})` (`approve-routing.ts`) | `draft → approved` (stempluje `approved_by/at`). | zapisuje `routings`, `audit_log` (`routing.approved`) | `technical.bom.approve` | Brak „cofnij zatwierdzenie"; sklonuj nową wersję |
| `publishRouting({routingId})` (`approve-routing.ts`) | `approved → active`, **zastępując** dotychczasową aktywną marszrutę pozycji (`status='superseded'`, `effective_to=today`) w tej samej transakcji (pozycja ma 0 lub 1 aktywną marszrutę). | zapisuje `routings`, `audit_log` (`routing.published`) | `technical.bom.approve` | Ponownie opublikuj inną wersję |
| `listRoutings` / `costPreview` (`list-routings.ts`, `cost-preview.ts`) | Lista marszrut per pozycja; podgląd kosztu robocizny sumowany SQL-em (NUMERIC-exact). | odczytuje `routings`, `routing_operations` | Odczyt z zakresem RLS | — (odczyt) |

### Koszt/kg (wspólna własność z Finance) — `technical/cost/_actions/*`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie |
|---|---|---|---|---|
| `postCost(input)` (`post-cost.ts` → `write-cost-ledger.ts`) | Zapisuje nowe naliczenie kosztu: V-TEC-51 (`effective_from ≤ today`), V-TEC-53 (zmiana >20% przy `manual`/`supplier_update` wymaga osoby zatwierdzającej → `approver_required`), zamknięcie poprzedniego aktywnego wiersza, wstawienie nowego wiersza historii, **denormalizacja** `items.cost_per_kg`. Technical zapisuje WYŁĄCZNIE `items.cost_per_kg` + `item_cost_history` (nigdy tabele Finance). | zapisuje `item_cost_history`, `items.cost_per_kg`, `audit_log` | `technical.cost.edit` | Zapisz nowy wiersz kosztu zastępujący poprzedni |
| `listCostItems` / `listCostHistory` / `listRecipeCost` (odczyt `_actions/*`) | Lista pozycji kosztowych, historia per pozycja, zrolowany koszt receptury. | odczytuje `item_cost_history`, `items`, `bom_*` | Odczyt z zakresem RLS | — (odczyt) |

### Pakiet wydania specyfikacji fabrycznej — `technical/factory-specs/actions/*` + `actions/technical/release-bundles/*`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie / korekta |
|---|---|---|---|---|
| `createFactorySpec({fgItemId,specCode,notes?})` (`actions/create-factory-spec.ts`) | Tworzy factory_spec w stanie `draft` powiązaną z pozycją **WG**; `version = max+1` per WG. | odczytuje `items`, `factory_specs`; zapisuje `factory_specs`, `audit_events` (`factory_spec.created`) | `technical.product_spec.approve` **lub** `technical.factory_spec.approve` (jedno z dwóch) | Wycofanie (później) |
| `submitFactorySpecForReview({specId})` (`actions/factory-spec-flow.ts`) | `draft → in_review` (strzeżone przez `guardStatusTransition`). | zapisuje `factory_specs`, `audit_events` (`factory_spec.submitted_for_review`) | `technical.product_spec.approve`/`.factory_spec.approve` | Odrzucenie pakietu / wycofanie |
| `linkFactorySpecBom({specId,bomHeaderId})` (`actions/factory-spec-flow.ts`) | Paruje BOM (zgodny z `product_id` WG specyfikacji) do specyfikacji w stanie `draft`/`in_review`; odmawia przy niezgodności produktu / niezmienialnej specyfikacji. | odczytuje `bom_headers`; zapisuje `factory_specs` (`bom_header_id`,`bom_version`), `audit_events` (`factory_spec.bom_linked`) | `technical.product_spec.approve`/`.factory_spec.approve` | Ponowne powiązanie gdy edytowalna |
| `approveReleaseBundleAction(input)` (`actions/technical/release-bundles/approve-bundle.ts` → `lib/technical/release-bundle-service.ts`) | **Podpisane elektronicznie** atomowe zatwierdzenie pakietu: `factory_spec in_review → approved_for_factory` + sparowany BOM `draft/in_review → technical_approved` (lub pozostaje `active`) w JEDNEJ transakcji. Weryfikuje zgodność WG↔produkt-BOM, przydatność RM i podpis elektroniczny z kodem PIN (CFR 21 Part 11), którego ID podpisu zakotwicza pakiet dowodowy. Emituje `technical.factory_spec.approved`. | odczytuje `factory_specs`, `bom_headers`, `bom_lines`, `items`; zapisuje `factory_specs`, `bom_headers`, `outbox_events` (`technical.factory_spec.approved`), tabele e-podpisu i audytu | `technical.factory_spec.approve` (przez `FACTORY_SPEC_APPROVE_PERMISSION`) + ważny PIN | `rejectReleaseBundleAction` / `recallFactorySpec` |
| `rejectReleaseBundleAction(input)` (`actions/technical/release-bundles/reject-bundle.ts`) | Atomowe odrzucenie pakietu — **żadna** strona nie zostaje wydana; specyfikacja pozostaje w draft/in_review (brak emisji `technical.factory_spec.approved`). | zapisuje `factory_specs`/audit | `technical.factory_spec.approve` | Ponowne zgłoszenie / zatwierdzenie |
| `recallFactorySpec({specId,reason?})` (`_actions/recall-spec.ts`) | `released_to_factory → draft` (usuwa stemple zatwierdzenia i wydania) by specyfikacja mogła zostać ponownie edytowana. **Zablokowane** gdy jakikolwiek `released`/`in_progress` zlecenie produkcyjne referuje tę specyfikację (`active_factory_spec_id`). | odczytuje `factory_specs`, `work_orders`; zapisuje `factory_specs`, `audit_events` (`technical.factory_spec.recalled`) | `technical.factory_spec.recall` | Ponowne zatwierdzenie przez pakiet |
| `loadBundle` / `listFactorySpecs` (`_actions/bundle-data.ts`, `_actions/list-factory-specs.ts`) | Odczyt preflight pakietu (blokery: RBAC, release-guard, status BOM, przydatność RM składników nieaktywnych; informacja D365) + historia zatwierdzeń z audytu + lista specyfikacji fabrycznych. | odczytuje `factory_specs`, `bom_headers`, `bom_lines`, `items`, `feature_flags_core`, `audit_log` | Odczyt z zakresem RLS | — (odczyt) |

**Zinwentaryzowana liczba akcji: ~37 akcji zapisu/tranzycji** w kartotece towarowej (7), specyfikacjach dostawców (1 zapis), wartościach odżywczych (1 zapis), alergenach (5 serwisów zapisu), BOM (7), marszrutach (4), kosztach (1), specyfikacji fabrycznej/pakiecie (6), plus czytniki pomocnicze wymienione inline. „Rdzeń" interfejsu, który użytkownik obsługuje na co dzień: `createItem`, `createItemSupplierSpec`, nadpisania alergenów, `createBomDraft` + akcje linii + `approveBom`/`publishBom` oraz pakiet specyfikacji fabrycznej.

---

## c. Maszyny stanów

### Cykl życia wersji BOM (`BOM_STATUSES`, `shared.ts:63`; tranzycje w `workflow.ts`)

```
 draft ──► in_review ──► technical_approved ──► active ──► superseded ──► archived
   │           │                                  │ (publish zastępuje poprzednią aktywną wersję)
   └───────────┴── edytowalne (dodaj/edytuj/usuń linie, deleteBomVersion[tylko-draft])
```

| Stan | Dozwolony następny | Kto zapisuje | Uwagi |
|---|---|---|---|
| `draft` | `in_review`, `technical_approved` (przez approve), usunięty (tylko draft) | `createBomDraft` | **Edytowalny** — `addBomLine`/`updateBomLine`/`deleteBomLine` wymagają `draft`\|`in_review` (`BOM_LINE_EDITABLE_STATUSES`). Usuwalny gdy nie jest jedyną wersją i żaden snapshot do niego nie referuje. |
| `in_review` | `technical_approved` | recenzent | Nadal edytowalny (ten sam zestaw). |
| `technical_approved` | `active` (publish) | `approveBom` | Zawartość niezmienialna; ponownie walidowana przy zatwierdzeniu (V-TEC-13/14). |
| `active` | `superseded` | `publishBom` | Dokładnie jedna aktywna wersja per produkt; publish atomowo przestawia poprzednią aktywną na `superseded`. |
| `superseded` / `archived` | terminalne | `publishBom` / cykl życia | Wyłącznie clone-on-write; akcje linii odmawiają z `bom_not_editable`. |

Egzekwowane **dwukrotnie**: akcje linii wymagają edytowalnego statusu, a `publishBom`
sprawdza bramkę V-TEC-10 (musi być `technical_approved`). Nie ma operacji
„cofnij zatwierdzenie" — rollback polega na ponownym wywołaniu `publishBom`
na poprzedniej wersji (`workflow.ts:17-22`).

### Cykl życia pozycji towarowej (`ITEM_STATUSES`, `items/_actions/shared.ts:36`)

```
 draft ──► active ⇄ deprecated
   (brama aktywacji: kanoniczny uom_base)        dowolny ──► blocked  (deactivateItem, quasi-terminalne)
```

| Stan | Dozwolony następny | Zapisujący | Uwagi |
|---|---|---|---|
| `draft` | `active` | `transitionItemStatus` | `draft→active` wymaga **kanonicznego** `uom_base` (w przeciwnym razie `activation_gate_failed`). |
| `active` | `deprecated`, `blocked` | `transitionItemStatus` / `deactivateItem` | — |
| `deprecated` | `active` | `transitionItemStatus` | Reaktywacja. |
| `blocked` | — | `deactivateItem` | „Dezaktywacja"; idempotentna; brak akcji odblokowania. Nic nigdy nie wraca do `draft`. |

### Cykl życia specyfikacji fabrycznej (`ALLOWED_TRANSITIONS`, `factory-spec-release-guards.ts:53-60`)

```
 draft ⇄ in_review ──► approved_for_factory ──► released_to_factory ──► superseded ──► archived
                                  └──────────────► superseded / archived
 (approved_for_factory & released_to_factory są użyteczne na hali = NIEZMIENNE → clone-on-write)
```

`createFactorySpec`→`draft`; `submitFactorySpecForReview`→`in_review`;
`linkFactorySpecBom` paruje BOM; **`approveReleaseBundleAction`** (z podpisem elektronicznym)
przenosi `in_review → approved_for_factory` i zatwierdza BOM w tej samej transakcji;
`recallFactorySpec` cofa `released_to_factory → draft` chyba że aktywne ZP
referuje tę specyfikację.

### Cykl życia marszruty (`ROUTING_STATUSES`, `routings/_actions/shared.ts:35`)

```
 draft ──► approved ──► active ──► superseded
   └── edytowalne (updateRouting zastępuje operacje; inny niż draft jest niezmieniany)
```

`createRouting`→`draft`; `approveRouting`→`approved`; `publishRouting`→`active`
(zastępuje dotychczasową aktywną marszrutę pozycji); każda pozycja ma 0 lub 1 aktywną
marszrutę.

<!-- screenshot: technical/items list (zakładki typów pozycji + Utwórz pozycję) -->
<!-- screenshot: technical/bom/[itemCode] szczegóły BOM (wersja + linie + zatwierdź/opublikuj) -->
<!-- screenshot: technical/factory-specs modal recenzji pakietu wydania (e-podpis) -->

---

## d. Instrukcje dla użytkownika

> Etykiety przycisków są kluczami i18n (bundle `Technical.*`). Dosłowna treść
> angielska pochodzi z tych bundli; nazwy akcji w nawiasach są punktami wejścia
> po stronie serwera.

### (i) Tworzenie pozycji towarowej

1. Przejdź do **Technical → Pozycje** (`/technical/items`).
2. Kliknij **Utwórz pozycję**. W oknie dialogowym ustaw:
   - **Kod pozycji** (alfanumeryczny + `. _ -`, ≤64; niezmieniany po zapisaniu) i **Nazwa**.
   - **Typ pozycji** — `rm` / `ingredient` / `intermediate` / `fg` / `co_product` / `byproduct` / `packaging`.
   - **Bazowy UoM** — wybierany z **zamkniętej** listy kanonicznej (`kg/g/l/ml/szt`), nigdy dowolny tekst; opcjonalny pomocniczy UoM.
   - **Tryb wagowy** (`fixed`/`catch`) + wartości nominalna/tara/maks-brutto w zależności od potrzeb.
   - **Hierarchia opakowań** — `output_uom` (`base`/`each`/`box`); `each` ⇒ ilość-netto-per-sztuka > 0; `box` ⇒ również sztuk-per-box > 0.
   - Opcjonalnie GS1 GTIN (8/12/13/14 cyfr), termin przydatności, cena katalogowa i wstępny **koszt/kg** (zapisywany przez rejestr kosztów).
3. **Zapisz** → `createItem`. Pozycja trafia do stanu `active` domyślnie (lub `draft` dla importów/przekazań NPD).
4. Pozycja w stanie `draft` jest aktywowana akcją **Aktywuj** (`transitionItemStatus`) — która egzekwuje bramkę kanonicznego UoM.

### (ii) Ustawianie alergenów / wartości odżywczych

1. Otwórz pozycję (`/technical/items/[item_code]`) → zakładka **Alergeny**.
2. Siatka pokazuje UE-14 + alergeny niestandardowe org; znaczniki kaskadowe (`source='cascaded'`) są **tylko do odczytu** (silnik kaskady jest ich właścicielem).
3. Aby dodać/nadpisać: wybierz intensywność + pewność, wpisz **obowiązkowy powód** → **Zapisz** (`saveAllergenOverride`). Dołącza niezmienialny wiersz historii nadpisań i nigdy nie usuwa źródła kaskadowego. Usuń przez `clearAllergenOverride`.
4. Zakładka **Wartości odżywcze** (tylko rm/ingredient/intermediate): wprowadź wartości na 100 g + kody alergenów odziedziczonych → **Zapisz** (`upsertNutrition`).
5. Macierz kontaminacji + dodatki alergenów per operacja są zarządzane w **Technical → Konfiguracja alergenów** (`saveRiskCell` / `saveMfgOpAddition`) i zasilają kaskadę.

### (iii) Dołączanie i zatwierdzanie specyfikacji dostawcy

1. Otwórz pozycję → zakładka **Specyfikacje dostawców**.
2. **Dodaj specyfikację dostawcy**: wybierz **dostawcę** (z kartoteki `suppliers`), ustaw wersję specyfikacji + daty: wystawienia / obowiązywania-od / wygaśnięcia.
3. Zostaw **Zatwierdź teraz** WŁĄCZONE (domyślnie) → `createItemSupplierSpec` zapisuje `supplier_status='approved'`, `lifecycle_status='active'`, `review_status='approved'`. To dokładnie ta postać, którą odczytują bramki przydatności RM w BOM, więc ostrzeżenia `SUPPLIER_NOT_APPROVED` / `SUPPLIER_SPEC_NOT_ACTIVE` znikają po odświeżeniu.
4. Zatwierdź-teraz jest idempotentnym upsert na częściowym indeksie unikalności active+approved — ponowne dołączenie tego samego dostawcy odświeża okno aktualności zamiast duplikować wiersz.

### (iv) Budowanie BOM i dodawanie linii

1. Przejdź do **Technical → BOM** (`/technical/bom`) → otwórz WG (`/technical/bom/[itemCode]`).
2. **Nowa wersja** → formularz tworzenia. Dodaj **linie składników** (selektor pozycji → ilość > 0, UoM, % odpadów, opcjonalna nazwa operacji produkcyjnej); ustaw **produkty uboczne** z % alokacji; alokacje rodzica + produktów ubocznych niebędących odpadami muszą sumować się do **100** (V-TEC-12).
3. **Zapisz** → `createBomDraft`. Uruchamia V-TEC-13 (cykl/odwołanie własne), V-TEC-12, V-TEC-14 (każdy składnik przechodzi przydatność RM) i zwraca ewentualne doradcze **ostrzeżenia** V-TEC-11. Wersja jest tworzona jako `draft`, `version = max+1`.
4. Na wersji `draft`/`in_review` dodawaj kolejne składniki przez **Dodaj składnik** (`addBomLine` — dołącza w miejscu, bez forka), lub **Edytuj** / **Usuń** wiersz (`updateBomLine` / `deleteBomLine`). Wydane wersje pokazują te przyciski wyłączone, a serwer odmawia z `bom_not_editable`.

### (v) Wersjonowanie, zatwierdzanie i publikowanie BOM

1. Otwórz wersję BOM. **Zgłoś do recenzji** przenosi `draft → in_review` (opcjonalny etap pośredni).
2. **Zatwierdź** → `approveBom` (`technical.bom.approve`): ponownie waliduje brak cykli + przydatność RM w kontekście `factory_spec_approval`, stempluje `approved_by/at`, status → `technical_approved`.
3. **Opublikuj** → `publishBom` (`technical.bom.version_publish`): V-TEC-10 wymaga `technical_approved`; status → `active` i poprzednia aktywna wersja przestawia się na `superseded` w tej samej transakcji. Emituje `fg.bom.released`.
4. Aby **iterować**, utwórz NOWĄ wersję roboczą (clone-on-write) — zatwierdzonej/aktywnej wersji nigdy nie edytujesz w miejscu. Aby wykonać **rollback**, ponownie opublikuj poprzednią wersję. Błędny **draft** można trwale usunąć przez `deleteBomVersion` (chyba że jest jedyną wersją lub snapshot do niego referuje).

### (vi) Tworzenie marszruty

1. Z poziomu pozycji otwórz **Marszruty** → **Nowa marszruta**.
2. Dodaj operacje: ciągłe `op_no` od 1 (V-TEC-60), każda wiąże **linię lub maszynę** (V-TEC-61), operacje produkcyjne mają czas cyklu > 0 (V-TEC-62), a `manufacturing_operation_name` musi istnieć w referencji operacji produkcyjnych org (V-TEC-63).
3. **Zapisz** (`createRouting`, status `draft`) → **Zatwierdź** (`approveRouting`) → **Opublikuj** (`publishRouting`, zastępuje dotychczasową aktywną marszrutę). Edytuj operacje draftu przez `updateRouting`; marszruta inna niż draft jest niezmieniana (sklonuj nową wersję).

### (vii) Wydanie specyfikacji fabrycznej (pakiet BOM + spec)

1. **Technical → Specyfikacje fabryczne** → **Utwórz** (`createFactorySpec`, powiązana z WG).
2. **Powiąż BOM** (`linkFactorySpecBom`, musi pasować do produktu WG) i **Zgłoś do recenzji** (`submitFactorySpecForReview`).
3. Otwórz modal recenzji **pakietu wydania**. Preflight (`loadBundle`) wyświetla blokery (RBAC, release-guard, status BOM, przydatność RM nieaktywnych składników; D365 pokazywane tylko informacyjnie).
4. Wprowadź swój **PIN** i **Zatwierdź** → `approveReleaseBundleAction`: specyfikacja przechodzi `in_review → approved_for_factory`, a BOM do `technical_approved`/`active` atomowo, zakotwiczone podpisem elektronicznym; emituje `technical.factory_spec.approved`. **Odrzuć** (`rejectReleaseBundleAction`) nie wydaje żadnej ze stron.
5. Specyfikację wydaną do hali można cofnąć przez **Wycofaj** (`recallFactorySpec`) — odmawia gdy aktywne/w toku ZP ją referuje.

---

## e. Źródła danych (tabele Supabase)

Kartoteka towarowa + atrybuty:

- `items` — kartoteka towarowa (kod/typ/status, hierarchia opakowań UoM, tryb wagowy, termin przydatności, GS1, denormalizacja `cost_per_kg`).
- `item_cost_history` — rejestr kosztów/kg (zapisywany przez Technical; wspólna własność z Finance).
- `"Reference"."RawMaterials"` — wartości odżywcze na 100 g + odziedziczone alergeny (rm/ingredient/intermediate).

Alergeny:

- `item_allergen_profiles` — deklaracja per (pozycja × alergen) (źródło/intensywność/pewność).
- `item_allergen_profile_overrides` — rejestr ręcznych nadpisań (append-only).
- `"Reference"."Allergens"` — referencja alergenów UE-14 + niestandardowych org.
- `nutrition_allergens` — deklaracja WG free-from / obecność (odczytywana przez przydatność RM dla sprawdzenia zakazanych alergenów).
- tabele ryzyka kontaminacji + alergenów operacji produkcyjnych (wejścia kaskady).

BOM:

- `bom_headers` — nagłówek wersji (`product_id`, status, wersja, uzysk, stemple zatwierdzeń).
- `bom_lines` — linie składników (item_id, component_code, ilość, UoM, odpady, nazwa op., line_no).
- `bom_co_products` — alokacje produktów ubocznych/odpadowych.
- `bom_snapshots` — snapshoty w momencie tworzenia ZP (zapisywane przez inny moduł; blokują usunięcie draftu gdy są obecne).
- `bom_generator_jobs` — kolejka generatora wsadowego.
- `product` — agregat produktu WG (`product_code`) nadrzędny dla BOM; automatycznie mintowany z aktywnego WG.

Marszruty:

- `routings` — nagłówek wersji marszruty (item_id, status, wersja, daty obowiązywania).
- `routing_operations` — wiersze operacji (op_no, kody, linia/maszyna, czasy, koszt).
- `"Reference"."ManufacturingOperations"` — referencja operacji V-TEC-63.

Specyfikacje dostawców i fabryczne:

- `supplier_specs` — specyfikacja per (pozycja × dostawca) (supplier_status / lifecycle_status / review_status, daty) odczytywana przez przydatność RM.
- `suppliers` — kartoteka dostawców (odczyt do rozwiązywania kodu).
- `factory_specs` — pakiet wydania Technical (fg_item_id, spec_code, wersja, status, sparowane bom_header_id/wersja, stemple zatwierdzenia/wydania).
- `work_orders` — odczytywane przez `recallFactorySpec` (`active_factory_spec_id`) w celu blokowania wycofania.

Przekrojowe:

- `audit_log` / `audit_events` — każdy zapis (`item.*`, `allergen.*`, `bom.*`, `routing.*`, `factory_spec.*`).
- `outbox_events` — `bom.version_submitted`, `fg.bom.released`, `technical.factory_spec.approved` (jedyne zdarzenia Technical w zablokowanym enum SoT).
- `feature_flags_core` — `integration.d365.enabled` (preflight pakietu, tylko informacyjnie).

---

## f. Znane luki / TODO

Na podstawie przeanalizowanego kodu — bez domysłów:

1. **Brak dedykowanego uprawnienia do marszrut.** Marszruty ponownie używają
   `technical.bom.create` / `technical.bom.approve`, ponieważ blokada Wave0
   enum-lock zabrania nowych ciągów uprawnień
   (`routings/_actions/shared.ts:21-25`). Użytkownik z prawem zapisu BOM może
   tworzyć/zatwierdzać marszruty.

2. **Brak zdarzeń outbox Technical dla pozycji / kosztu / marszrut.**
   `outbox_events.event_type` to zablokowany CHECK + bramka dryfu bez członków
   `item.*` / `technical.cost.*` / `technical.routing.*`, więc te zapisy trafiają
   wyłącznie do `audit_log`
   (`items/_actions/shared.ts:349-352`, `cost/_actions/shared.ts:154-156`,
   `routings/_actions/shared.ts:232-233`). Konsumenci downstream nie mogą
   subskrybować zmian pozycji/kosztu/marszruty przez outbox.

3. **„Dezaktywacja" pozycji to `blocked`, nie soft-delete, i jest jednokierunkowa.**
   Tabela nie ma kolumny soft-delete, więc dezaktywacja ustawia `status='blocked'`
   (`deactivate-item.ts:7-9`) i **nie ma akcji odblokowania** — nic nigdy nie
   wraca do `draft`. Powód/notatki istnieją wyłącznie w łańcuchu audytu (brak kolumny).

4. **Wartości odżywcze są w `"Reference"."RawMaterials"`, kluczowane przez `rm_code`,
   i dotyczą wyłącznie RM/ingredient/intermediate** (`upsert-nutrition.ts:116-118`).
   Wartości odżywcze WG nie są edytowalne z tego widoku; inne typy pozycji są odrzucane.

5. **`approveBom` nie ma e-podpisu**, w przeciwieństwie do pakietu specyfikacji fabrycznej.
   Zatwierdzenie/publikacja BOM są chronione wyłącznie przez RBAC + ponowną walidację
   (`workflow.ts`), podczas gdy `approveReleaseBundleAction` wymaga kodu PIN
   zgodnego z CFR-21-Part-11
   (`release-bundle-service.ts:402-424`). Kluczowy podpis jest na poziomie pakietu
   specyfikacji fabrycznej, nie na poziomie publikacji BOM.

6. **Dwa miejsca przechowywania akcji specyfikacji fabrycznej.** Tworzenie
   specyfikacji jest w `technical/factory-specs/actions/` (nie `_actions/`),
   akcje zatwierdzenia/odrzucenia pakietu są w `apps/web/actions/technical/release-bundles/`,
   a wycofanie jest w `technical/factory-specs/_actions/`. Podział jest historyczny
   (T-080/T-081); czytelnik musi sprawdzić trzy miejsca dla pełnego cyklu życia specyfikacji.

7. **Tworzenie/zgłaszanie specyfikacji fabrycznej akceptuje jedno z dwóch uprawnień**
   (`technical.product_spec.approve` LUB `technical.factory_spec.approve` —
   `factory-specs/_actions/shared.ts:31-32`, `canApproveFactorySpec`). Każde z nich
   działające w danej org jest wystarczające, ale podwójne sprawdzanie jest miejscem
   do obserwowania przy dryftowaniu seedowania RBAC.

8. **`recallFactorySpec` ma `TODO(R4)` dotyczący e-podpisu** (`recall-spec.ts:141`):
   wycofanie aktualnie wymaga tylko `technical.factory_spec.recall` + blokady
   referencji ZP, z zaznaczonym zadaniem do ponownej oceny czy wycofanie specyfikacji
   powinno wymagać podpisu elektronicznego.

9. **Sprawdzanie przydatności RM i cykli odczytuje AKTYWNY graf BOM w momencie
   zapisu** (`create-draft.ts:112-123`, `line-actions.ts:99-111`). Są to
   punktowe sprawdzenia po stronie serwera, nie ograniczenia DB — równoczesne
   aktywacje mogą teoretycznie wejść w wyścig, choć zastąpienie w tej samej
   transakcji w `publishBom` zawęża to okno.

Liczba akcji i każda z powyższych luk są wyprowadzone z cytowanych plików; brak
dosłownych markerów `// TODO` poza e-podpisem wycofania (#8) i uwagami
uzupełniającymi pakietu.
