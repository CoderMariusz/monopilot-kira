# MONOPILOT-KIRA — KOMPLETNY KATALOG TESTÓW APLIKACJI
**Data**: 2026-07-18 · **Metoda**: 2 fale × 3 Opusy (dział per agent, czytanie kodu z anchorami plik:linia) + 2 rundy Fable (runda kodowa: przekrojowe/integracyjne; runda przeglądarkowa: prod UI + luka Settings).

## Statystyki
| Sekcja | Dział | Prefiks | Testów |
|---|---|---|---|
| A | Technical / PDM (items, BOM, routings, alergeny, nutrition, koszty, ECO, factory-specs…) | TEC | 460 |
| B | Planning (WO, MRP, PO, TO, suppliers, forecasts, schedule, import) | PLN | 130 |
| C | Production + Scheduler + OEE (wykonanie WO, konsumpcja, output, waste, runy, andon) | PRD | 124 |
| D | Warehouse + Scanner + Yard (LP, GRN, putaway, inventory, counts, PIN, weighbridge) | WH | 135 |
| E | Shipping + Finance + Quality + Maintenance (SO, shipments, RMA, WAC, holds, HACCP, MWO) | SFQ | 182 |
| F | NPD + Settings/Auth/Admin + Reporting (pipeline, costing, invite, MFA, SAML, GDPR) | NSA | 180 |
| G | Przekrojowe/integracyjne (crony, outbox, D365, SCIM, platform act-as, importy, E2E chains) | XC | 56 |
| H | UI/przeglądarka + Settings-infra (~30 ekranów settings, copy-bugi, formatowanie, modale) | UI | 52 |
| J | Warianty konfiguracji 8 łańcuchów E2E (nie-happy-path: partial, cancel, holdy, role, współbieżność) | E2E | 140 |
| **RAZEM** | | | **1459** |

Każdy test: **Co sprawdza · Kroki · Oczekiwana logika (wzór/reguła + plik:linia) · Priorytet P0/P1/P2**.
Sekcje kończą się listą "Niepewności" (rzeczy do decyzji ownera / nieustalone z kodu) — łącznie ~80 pozycji, wiele to kandydaci na bugi.

## Kluczowe modele logiki (obowiązujące w całym katalogu)
- **Koszty — model 3-podstawowy (NIE mieszać)**: recipe rollup = **net**; waterfall = **×(1+waste_pct)**; WO/MRP = **÷(1−scrap_pct)** (mig427/D41 zakazuje mieszania).
- **Stock = license_plates**; available = quantity − reserved_qty; kanoniczny widok pickable = `v_inventory_available`; FEFO = expiry asc NULLS LAST, tiebreak lp_number.
- **WAC** per (org, item, currency=GBP), normalizacja do kg (each→×net_qty_per_each; box→×each_per_box×…), clamp-to-zero + outbox underflow.
- **OEE = A × P × Q**; mass-balance in−(out+waste+remaining), ε=0.001 kg; yield-tolerance 2%.
- **E-sign / SoD**: decrease-adjustments i count-apply wymagają odrębnego supervisora + PIN; unblock LP, changeover, kalibracje = dual e-sign (21 CFR Part 11).
- **RLS**: org_id + app.current_org_id(); site-visibility przez app.user_can_see_site; warehouse/site_id=NULL bypassuje guardy site (znany edge).

## Spis sekcji
1. [A — Technical/PDM](#sekcja-a) (TEC-001…)
2. [B — Planning](#sekcja-b) (PLN-001…)
3. [C — Production/Scheduler/OEE](#sekcja-c) (PRD-001…)
4. [D — Warehouse/Scanner/Yard](#sekcja-d) (WH-001…)
5. [E — Shipping/Finance/Quality/Maintenance](#sekcja-e) (SFQ-001…)
6. [F — NPD/Settings/Auth/Reporting](#sekcja-f) (NSA-001…)
7. [G — Przekrojowe/integracyjne](#sekcja-g) (XC-001…)
8. [H — UI + Settings-infra](#sekcja-h) (UI-001…)
9. [J — Warianty E2E](#sekcja-j) (E2E-049-01…)

---
<a id="sekcja-a"></a>
# Katalog testów QA — Dział Technical/PDM (monopilot-kira)

Data: 2026-07-18. Zakres: `apps/web/app/[locale]/(app)/(modules)/technical/**`, powiązane `apps/web/actions/technical/**`, `apps/web/lib/technical/**`, `apps/web/app/api/technical/**`, migracje `packages/db/migrations/**`. Wszystkie odwołania `plik:linia` pochodzą z faktycznie otwartego kodu.

**Numeracja**: TEC-001–099 Items/Materials · TEC-100–199 BOM/Revisions/Where-used/WIP · TEC-200–283 Cost/Routings/Tooling · TEC-284 przekrojowy RLS BOM · TEC-300–375 Allergens/Nutrition/Shelf-life/Sensory/Lab · TEC-400–499 ECO/Factory-specs/Release-bundles/Compliance/Traceability. Razem: **460 testów**.

**Kluczowe reguły matematyczne (SoT, nie mieszać):**
- Rollup kosztu recepty = NETTO: `Σ(bl.quantity × vec.amount)` — bez scrap/waste (`technical/cost/_actions/recipe-cost-rollup-sql.ts:10-14`).
- `scrap_pct` → TYLKO konsumpcja WO/MRP: `qty ÷ (1 − scrap/100)` (mig 393).
- `waste_pct` → TYLKO NPD waterfall packaging: `qty × cost × (1 + waste/100)` (mig 427, `lib/costing/compute-waterfall.ts:429-433`).
- Mieszane waluty komponentów → total NULL + marker `mixed_currency` (brak tabeli FX).
- Nutrition: `per100g = Σ(pct/100)·rmNutrient`; `perPortion = per100g × portionGrams/100` (`packages/domain/src/nutrition/compute-nutrition.ts:163,170,181-184`).
- Shelf-life: `data_ważności = data_produkcji + shelf_life_days` (Technical przechowuje tylko dni+mode+format).

**Maszyny stanów (z kodu/migracji):**
- Items: `draft → active → deprecated ⇄ active`, `blocked → active` (reaktywacja przez akcję statusu lub edycję); deactivate = `blocked` (brak soft-delete) — `items/_actions/shared.ts:488-509`. **Decyzja ownera 2026-07-30:** zachować jawną reaktywację po deaktywacji.
- BOM: `draft → in_review → technical_approved → active → superseded → archived`; zakaz reopen technical_approved→in_review (mig 208); treść approved/active immutable poza yield_pct (mig 090/355).
- Routing: `draft → approved → active → superseded`.
- ECO: `draft → approved → implementing → closed` (brak reject/cancel).
- Factory-spec: `draft → in_review → approved_for_factory → released_to_factory → superseded/archived`; recall `released → draft` (mig 453).

---
# Część A — Items & Materials (TEC-001…TEC-099)

**Fakty ustalone z kodu (SoT dla oczekiwań):**
- **item_type** = `rm | ingredient | intermediate | fg | co_product | byproduct | packaging` — `items/_actions/shared.ts:39`; ewolucja CHECK w DB: `153-items-master.sql:45-47` → `248-items-ingredient-item-type.sql:22-23` → `255-packaging-item-type.sql`.
- **status** (walidacja app) = `draft | active | deprecated | blocked` — `shared.ts:40`, `153-items-master.sql:48-50`. UWAGA: `231-settings-products-boms-data-layer.sql:35-40` rozszerzył CHECK w DB o `development|pilot|discontinued`, ale app tego NIE dopuszcza (rozbieżność).
- **item_code**: `/^[A-Za-z0-9._-]+$/`, 1–64 znaków, unikalny per `(org_id, item_code)` — `shared.ts:42,227-232`; UNIQUE `153-items-master.sql:45`.
- **CANONICAL_UOMS** = `kg,g,l,ml,pcs,m,cm` — `shared.ts:56`; legacy `szt`/`ea` → `pcs` — `lib/uom/piece.ts`.
- **output_uom** = `base|each|box` — `shared.ts:74`; reguła pack: each⇒net_qty>0, box⇒net_qty>0 ∧ each_per_box>0 — `shared.ts:157-180`, CHECK `267-items-pack-hierarchy.sql`.
- **RLS**: `items_org_isolation ... org_id = app.current_org_id()` + `force row level security` — `153-items-master.sql:93-100`.
- Brak kolumny soft-delete: "deactivate" = `status='blocked'` — `deactivate-item.ts:43`, komentarz `shared.ts:310-313`.

## Items — Lista / Wyszukiwanie (technical/items, `items/_actions/list-items.ts`)

### TEC-001: Lista pozycji scoped do org (RLS)
- **Co sprawdza**: lista zwraca wyłącznie pozycje bieżącej organizacji.
- **Kroki**: 1) Zaloguj jako user org A. 2) Otwórz `/technical/items`. 3) Sprawdź, że pozycje org B nie są widoczne.
- **Oczekiwana logika**: zapytanie ma `where i.org_id = app.current_org_id()` (`list-items.ts:140`), a polityka RLS wymusza ten sam predykat (`153-items-master.sql:96-100`). `withOrgContext` ustawia kontekst.
- **Priorytet**: P0

### TEC-002: Wyszukiwanie po kodzie i nazwie (ILIKE)
- **Co sprawdza**: pole `q` filtruje po `item_code` LUB `name`, case-insensitive, substring.
- **Kroki**: 1) Wpisz fragment kodu. 2) Wpisz fragment nazwy. 3) Sprawdź wyniki.
- **Oczekiwana logika**: `i.item_code ilike '%'||$2||'%' or i.name ilike '%'||$2||'%'` (`list-items.ts:142-146`). Trim wejścia: `search = opts?.search?.trim() || null` (`list-items.ts:199`).
- **Priorytet**: P1

### TEC-003: Filtr typu — tylko dozwolone wartości
- **Co sprawdza**: nieznany `type` w URL jest ignorowany (brak SQL injection / brak crasha).
- **Kroki**: 1) Wejdź z `?type=hacker`. 2) Sprawdź, że filtr nieaktywny.
- **Oczekiwana logika**: `parseItemTypeFilter` zwraca `null` gdy `!ITEM_TYPE_SET.has(type)` (`list-items.ts:163-168`); parametr bindowany, nie interpolowany.
- **Priorytet**: P1

### TEC-004: Filtr statusu — tylko z ITEM_STATUS_SET
- **Co sprawdza**: `?status=` przyjmuje tylko `draft|active|deprecated|blocked`.
- **Kroki**: 1) `?status=pilot`. 2) Oczekuj braku filtra.
- **Oczekiwana logika**: `parseStatusFilter` odrzuca wartość spoza `ITEM_STATUS_SET` (`list-items.ts:170-174`, set na `:81`). Potwierdza rozbieżność z DB CHECK 231.
- **Priorytet**: P2

### TEC-005: Filtr D365 sync (synced/drift/unsynced)
- **Co sprawdza**: `unsynced` obejmuje NULL oraz statusy spoza (synced,drift).
- **Kroki**: 1) `?d365=unsynced`. 2) Sprawdź, że pozycje z NULL są wliczone.
- **Oczekiwana logika**: `($5='unsynced' and (i.d365_sync_status is null or i.d365_sync_status not in ('synced','drift')))` (`list-items.ts:150-155`).
- **Priorytet**: P2

### TEC-006: Paginacja i limit maksymalny
- **Co sprawdza**: `limit` nie przekracza `ITEM_CHOOSER_MAX_LIMIT`; `page` domyślnie 1.
- **Kroki**: 1) Poproś o `limit=99999`. 2) Sprawdź zwrócony `page.limit`.
- **Oczekiwana logika**: `normalizePage(..., maxLimit: ITEM_CHOOSER_MAX_LIMIT)` (`list-items.ts:204-210`); `parsePage` w `materials/page.tsx:16-19` wymusza integer>0.
- **Priorytet**: P2

### TEC-007: Liczniki typów (typeCounts) niezależne od filtra typu
- **Co sprawdza**: taby liczą wg wyszukiwania, ale nie wg wybranego typu.
- **Kroki**: 1) Wpisz `q`. 2) Wybierz typ `rm`. 3) Sprawdź, że liczniki innych tabów nie zzerowały.
- **Oczekiwana logika**: `typeCountRes` używa tylko `ITEM_BASE_WHERE` (`list-items.ts:221-227`), bez `ITEM_LIST_FILTERS`.
- **Priorytet**: P2

### TEC-008: Stan empty vs error
- **Co sprawdza**: pusty katalog → `empty`; wyjątek DB → `error` bez wycieku stacka.
- **Kroki**: 1) Org bez pozycji. 2) Wymuś błąd zapytania.
- **Oczekiwana logika**: `catalogEmpty = !hasActiveFilters && typeCounts.all===0` → `empty` (`list-items.ts:261-269`); catch zwraca `state:'error'` (`list-items.ts:274-288`).
- **Priorytet**: P1

### TEC-009: CTA "New item" tylko z uprawnieniem create
- **Co sprawdza**: przycisk widoczny tylko przy `technical.items.create`.
- **Kroki**: 1) User bez create. 2) Sprawdź brak CTA.
- **Oczekiwana logika**: `canCreate = hasPermission(ctx, ITEMS_CREATE_PERMISSION)` (`list-items.ts:244`; permission string `shared.ts:30`).
- **Priorytet**: P0

## Items — Tworzenie (wizard: `items/_components/item-create-wizard.tsx`, action: `items/_actions/create-item.ts`)

### TEC-010: Utworzenie pozycji — pola wymagane
- **Co sprawdza**: wymagane `itemCode`, `name`, `itemType`, `uomBase`.
- **Kroki**: 1) Wyślij bez `name`. 2) Oczekuj `invalid_input`.
- **Oczekiwana logika**: `CreateItemInput` — `name.min(1)`, `itemType` enum, `uomBase` canonical, `itemCode` regex (`shared.ts:225-262`); brak parse → `{ok:false,error:'invalid_input'}` (`create-item.ts:37`).
- **Priorytet**: P0

### TEC-011: Walidacja wzorca item_code
- **Co sprawdza**: odrzucenie znaków spoza `[A-Za-z0-9._-]` oraz >64 znaków.
- **Kroki**: 1) `itemCode="RM/01 A"`. 2) Oczekuj błędu walidacji.
- **Oczekiwana logika**: `.regex(ITEM_CODE_PATTERN)` + `.max(64)` (`shared.ts:227-232`, wzorzec `:42`).
- **Priorytet**: P1

### TEC-012: Duplikat item_code → already_exists
- **Co sprawdza**: unikalność `(org_id, item_code)`.
- **Kroki**: 1) Utwórz `RM-001`. 2) Utwórz ponownie `RM-001`. 3) Oczekuj `already_exists` + `itemCode`.
- **Oczekiwana logika**: UNIQUE `items_org_item_code_unique` (`153-items-master.sql:45`); catch `23505` → `already_exists` (`create-item.ts:185-188`).
- **Priorytet**: P0

### TEC-013: Ten sam kod dozwolony w innej org
- **Co sprawdza**: unikalność jest per-org.
- **Kroki**: 1) Org A tworzy `RM-001`. 2) Org B tworzy `RM-001` — sukces.
- **Oczekiwana logika**: UNIQUE obejmuje `org_id` (`153-items-master.sql:45`); INSERT używa `app.current_org_id()` (`create-item.ts:55`).
- **Priorytet**: P1

### TEC-014: Status domyślny = active przy tworzeniu
- **Co sprawdza**: brak `status` → `active`.
- **Kroki**: 1) Utwórz bez status. 2) Sprawdź `status='active'`.
- **Oczekiwana logika**: `status: z.enum(...).optional().default('active')` (`shared.ts:235`).
- **Priorytet**: P2

### TEC-015: Normalizacja legacy UoM (szt/ea → pcs)
- **Co sprawdza**: `uomBase='szt'` lub `'ea'` zapisuje `pcs`.
- **Kroki**: 1) Utwórz z `uomBase='szt'`. 2) Sprawdź zapis `pcs`.
- **Oczekiwana logika**: `CanonicalUomInput` preprocess przez `normalizePieceUom` (`shared.ts:60-63`); `szt|ea → 'pcs'` (`lib/uom/piece.ts`).
- **Priorytet**: P1

### TEC-016: Odrzucenie UoM spoza listy kanonicznej
- **Co sprawdza**: `uomBase='eac'` (literówka) jest odrzucone.
- **Kroki**: 1) Utwórz z `uomBase='eac'`. 2) Oczekuj `invalid_input`.
- **Oczekiwana logika**: `z.enum(CANONICAL_UOMS)` po preprocess (`shared.ts:56-63`).
- **Priorytet**: P1

### TEC-017: Pack hierarchy — output_uom='each' wymaga net_qty_per_each>0
- **Co sprawdza**: cross-field walidacja each.
- **Kroki**: 1) `outputUom='each'`, brak `netQtyPerEach`. 2) Oczekuj błędu na `netQtyPerEach`.
- **Oczekiwana logika**: `refinePackHierarchy` — each⇒`isPositiveDecimalString(netQtyPerEach)` (`shared.ts:162-170`); DB CHECK `items_output_uom_pack_factors_check` (`267-items-pack-hierarchy.sql`).
- **Priorytet**: P0

### TEC-018: Pack hierarchy — output_uom='box' wymaga net_qty>0 ∧ each_per_box>0
- **Co sprawdza**: cross-field walidacja box.
- **Kroki**: 1) `outputUom='box'`, `netQtyPerEach=0.5`, brak `eachPerBox`. 2) Oczekuj błędu na `eachPerBox`.
- **Oczekiwana logika**: `refinePackHierarchy` blok box (`shared.ts:171-179`); CHECK `(output_uom<>'box' or (net_qty_per_each is not null and each_per_box is not null))` (`267-items-pack-hierarchy.sql`).
- **Priorytet**: P0

### TEC-019: net_qty_per_each — maks. 6 miejsc dziesiętnych
- **Co sprawdza**: precyzja `numeric(18,6)` w walidacji.
- **Kroki**: 1) `netQtyPerEach='0.1234567'`. 2) Oczekuj błędu "at most 6 decimal places".
- **Oczekiwana logika**: `hasAtMostDecimalPlaces(v, MAX_NET_QTY_DP=6)` (`shared.ts:106,119-121`). UWAGA/ROZBIEŻNOŚĆ: DB kolumna z mig 267 to `numeric(12,4)` — app dopuszcza 6dp, DB 4dp (potencjalny błąd zaokrąglenia/truncacji; patrz Niepewności).
- **Priorytet**: P1

### TEC-020: each_per_box / boxes_per_pallet — dodatnia liczba całkowita
- **Co sprawdza**: odrzucenie 0, ułamków, wartości ujemnych.
- **Kroki**: 1) `eachPerBox=0`. 2) `eachPerBox=2.5`. 3) Oczekuj błędu.
- **Oczekiwana logika**: `OptionalPositiveInt = z.coerce.number().int().positive()` (`shared.ts:132-135`); CHECK `>0` (`267-items-pack-hierarchy.sql`).
- **Priorytet**: P2

### TEC-021: GS1 GTIN — 8/12/13/14 cyfr
- **Co sprawdza**: walidacja formatu GTIN.
- **Kroki**: 1) `gs1Gtin='12345'`. 2) `gs1Gtin='12345678'` (8) → OK.
- **Oczekiwana logika**: `GS1_GTIN_RE = /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/` (`shared.ts:45,181-184`).
- **Priorytet**: P2

### TEC-022: variance_tolerance_pct w [0,100]
- **Co sprawdza**: zakres tolerancji wariancji.
- **Kroki**: 1) `varianceTolerancePct=150`. 2) Oczekuj `invalid_input`.
- **Oczekiwana logika**: `z.coerce.number().min(0).max(100)` (`shared.ts:257`); DB `items_variance_tolerance_pct_check` (`153-items-master.sql:69-72`).
- **Priorytet**: P1

### TEC-023: Wagi nieujemne (nominal/tare/gross)
- **Co sprawdza**: ujemna waga odrzucona.
- **Kroki**: 1) `nominalWeight=-1`. 2) Oczekuj błędu.
- **Oczekiwana logika**: `OptionalNumeric = z.coerce.number().nonnegative()` (`shared.ts:99-102`); DB `items_weights_nonnegative_check` (`153-items-master.sql:65-68`).
- **Priorytet**: P2

### TEC-024: shelf_life_days — nieujemna liczba całkowita; mode enum
- **Co sprawdza**: `shelfLifeDays>=0`, `shelfLifeMode∈{use_by,best_before}`.
- **Kroki**: 1) `shelfLifeDays=-5`. 2) `shelfLifeMode='exp'`. 3) Oczekuj błędu.
- **Oczekiwana logika**: `shared.ts:258-259`; DB `items_shelf_life_mode_check` (`153-items-master.sql:55-57`), `items_shelf_life_days_check` (`:73-74`).
- **Priorytet**: P2

### TEC-025: Nieznana kategoria produktu → invalid_category
- **Co sprawdza**: `categoryCode` musi być aktywną kategorią org.
- **Kroki**: 1) `categoryCode='ZZZ'`. 2) Oczekuj `invalid_category`.
- **Oczekiwana logika**: `validateActiveCategoryCode(...)` gate (`create-item.ts:45-46`); analogicznie update (`update-item.ts:53-54`).
- **Priorytet**: P1

### TEC-026: Tworzenie bez uprawnienia create → forbidden
- **Co sprawdza**: RBAC gate.
- **Kroki**: 1) User bez `technical.items.create`. 2) Wywołaj createItem. 3) Oczekuj `forbidden`.
- **Oczekiwana logika**: `if (!(await hasPermission(ctx, ITEMS_CREATE_PERMISSION))) return forbidden` (`create-item.ts:43`).
- **Priorytet**: P0

### TEC-027: Powiązanie dostawcy przy tworzeniu — supplier_spec approved+active
- **Co sprawdza**: podanie `supplierCode` tworzy `supplier_specs` approved/active (idempotentnie).
- **Kroki**: 1) Utwórz item z `supplierCode` istniejącego dostawcy + `supplierUnitPrice`. 2) Sprawdź wiersz supplier_specs.
- **Oczekiwana logika**: INSERT `supplier_status='approved', lifecycle_status='active', review_status='approved'` z `on conflict (...) where lifecycle_status='active' AND review_status='approved' do nothing` (`create-item.ts:112-130`).
- **Priorytet**: P1

### TEC-028: Nieistniejący dostawca — item powstaje, spec pominięty (bez błędu)
- **Co sprawdza**: brakujący dostawca nie wywala tworzenia itemu.
- **Kroki**: 1) `supplierCode='NOPE'`. 2) Sprawdź, że item utworzony, spec pominięty (warn w logu).
- **Oczekiwana logika**: gdy `!supplier.rows[0]` → `console.warn ... supplier_spec_skipped_missing_supplier`, brak przerwania (`create-item.ts:100-104`).
- **Priorytet**: P2

### TEC-029: Błąd zapisu supplier_spec → savepoint rollback + warning, item zostaje
- **Co sprawdza**: częściowa awaria specyfikacji nie cofa itemu.
- **Kroki**: 1) Wymuś błąd insertu spec. 2) Sprawdź `warning.code='supplier_spec_failed'` i istnienie itemu.
- **Oczekiwana logika**: `savepoint sp_supplier_spec` + `rollback to savepoint` + `supplierSpecWarning` (`create-item.ts:107-141,179`).
- **Priorytet**: P1

### TEC-030: Koszt przy tworzeniu idzie przez ledger; approver_required → invalid_input
- **Co sprawdza**: `costPerKg` zapisywany do `item_cost_history`, nie do items.cost_per_kg bezpośrednio przez wizard.
- **Kroki**: 1) Utwórz z `costPerKg`. 2) Jeśli wymagany approver → oczekuj `invalid_input`.
- **Oczekiwana logika**: `writeItemCostLedger(...)`; `cost.error==='approver_required' → 'invalid_input'` przez `CreateItemAbort` (`create-item.ts:145-157`).
- **Priorytet**: P1

### TEC-031: Naruszenie CHECK w DB → invalid_input (23514)
- **Co sprawdza**: mapowanie błędu constraint DB.
- **Kroki**: 1) Wymuś wartość łamiącą CHECK omijając zod (np. legacy path). 2) Oczekuj `invalid_input`.
- **Oczekiwana logika**: `isPgError(err) && err.code==='23514' → invalid_input` (`create-item.ts:189`).
- **Priorytet**: P2

### TEC-032: Audit log przy tworzeniu
- **Co sprawdza**: wpis `item.created` w audit_log.
- **Kroki**: 1) Utwórz item. 2) Sprawdź audit_log `action='item.created'`, `resource_type='item'`.
- **Oczekiwana logika**: `writeAudit(..., action:'item.created', afterState:{...})` (`create-item.ts:159-173`; INSERT `shared.ts:399-411`).
- **Priorytet**: P2

## Items — Edycja (action: `items/_actions/update-item.ts`)

### TEC-033: item_code jest niemutowalny w update
- **Co sprawdza**: brak możliwości zmiany kodu przez update.
- **Kroki**: 1) Sprawdź, że `UpdateItemInput` nie ma `itemCode`. 2) Update nie zmienia kolumny.
- **Oczekiwana logika**: `UpdateItemInput` bez `itemCode` (`shared.ts:276-303`); UPDATE nie dotyka `item_code` (`update-item.ts:147-171`), komentarz `:273-275`.
- **Priorytet**: P1

### TEC-034: Update nieistniejącej / obcej pozycji → not_found
- **Co sprawdza**: RLS + istnienie w org.
- **Kroki**: 1) Update itemu org B jako user org A. 2) Oczekuj `not_found`.
- **Oczekiwana logika**: SELECT `before` z `org_id=app.current_org_id()`; pusto → `not_found` (`update-item.ts:56-65`).
- **Priorytet**: P0

### TEC-035: Zmiana statusu na 'blocked' przez update jest zablokowana
- **Co sprawdza**: blokada musi iść przez deactivate, nie update.
- **Kroki**: 1) Update ze `status='blocked'`. 2) Oczekuj `invalid_input` / `invalid_transition`.
- **Oczekiwana logika**: `if (input.status==='blocked' || !isAllowedStatusTransition(before,input)) return invalid_input 'invalid_transition'` (`update-item.ts:91-95`).
- **Priorytet**: P0

### TEC-036: Update respektuje maszynę stanów (np. active→draft zabronione)
- **Co sprawdza**: niedozwolone przejście statusu przez update.
- **Kroki**: 1) Item `active`. 2) Update `status='draft'`. 3) Oczekuj `invalid_transition`.
- **Oczekiwana logika**: `isAllowedStatusTransition` dozwala tylko `[draft→active, active→deprecated, deprecated→active, blocked→active]` (`shared.ts:352-360`); w update sprawdzane tylko gdy status się zmienia (`update-item.ts:91`).
- **Priorytet**: P0

### TEC-037: Reaktywacja blocked→active przez akcję statusu lub edycję
- **Co sprawdza**: zablokowany item można jawnie reaktywować zarówno przez `transitionItemStatus`, jak i przez wizard edycji (`updateItem`).
- **Kroki**: 1) Item `blocked`. 2) Wywołaj `transitionItemStatus` z `toStatus='active'`. 3) Oczekuj sukcesu, UPDATE statusu i wpisu audytowego.
- **Oczekiwana logika**: `['blocked','active']` w `ALLOWED_STATUS_TRANSITIONS` (`shared.ts:497-509`); `active` należy do `TRANSITION_TARGETS`, więc akcja statusu przechodzi guard i zapisuje zmianę (`transition-item-status.ts:65-98`).
- **Decyzja ownera (2026-07-30)**: zachować przejście jako celową reaktywację po deaktywacji; test oczekujący `invalid_transition` był sprzeczny z tym kontraktem.
- **Priorytet**: P1

### TEC-038: item_type niemutowalny gdy active lub referencjonowany
- **Co sprawdza**: zmiana typu blokowana gdy item active LUB użyty w BOM/factory_spec/WO.
- **Kroki**: 1) Item active z BOM. 2) Zmień `itemType`. 3) Oczekuj `item_type_immutable`.
- **Oczekiwana logika**: zapytanie `blocked` = `status='active' OR exists(bom_headers/bom_lines w draft|in_review|technical_approved|active) OR exists(factory_specs<>'archived') OR exists(work_orders)` (`update-item.ts:97-144`); trigger DB `480-items-item-type-immutable-trigger.sql`.
- **Priorytet**: P0

### TEC-039: Zmiana item_type dozwolona dla draft nieużywanego
- **Co sprawdza**: draft bez referencji może zmienić typ.
- **Kroki**: 1) Item `draft`, brak BOM/WO. 2) Zmień `itemType='ingredient'`. 3) Sukces.
- **Oczekiwana logika**: `blocked` = false gdy `status<>'active'` i brak referencji (`update-item.ts:99-135`).
- **Priorytet**: P1

### TEC-040: Nazwa FG powiązanego z NPD jest niemutowalna
- **Co sprawdza**: nazwa itemu typu `fg` powiązanego z npd_projects nie może się zmienić.
- **Kroki**: 1) FG powiązany z NPD (po `npd_project_id` lub `product_code=item_code`). 2) Zmień `name`. 3) Oczekuj `invalid_input: linked_fg_name_immutable`.
- **Oczekiwana logika**: join do `npd_projects`; gdy `linkedProjectRows>0 && name!=before.name` → `linked_fg_name_immutable` (`update-item.ts:68-89`).
- **Priorytet**: P1

### TEC-041: Update UoM legacy normalizuje szt→pcs
- **Co sprawdza**: ta sama normalizacja co create.
- **Kroki**: 1) Update `uomBase='ea'`. 2) Sprawdź zapis `pcs`.
- **Oczekiwana logika**: `UpdateItemInput.uomBase = CanonicalUomInput` (`shared.ts:282`).
- **Priorytet**: P2

### TEC-042: Update bez uprawnienia edit → forbidden
- **Co sprawdza**: RBAC gate na edycji.
- **Kroki**: 1) User bez `technical.items.edit`. 2) updateItem. 3) `forbidden`.
- **Oczekiwana logika**: `hasPermission(ctx, ITEMS_EDIT_PERMISSION)` (`update-item.ts:51`).
- **Priorytet**: P0

### TEC-043: Audit log update zawiera before/after
- **Co sprawdza**: pełny stan przed/po.
- **Kroki**: 1) Zmień nazwę. 2) Sprawdź `before_state`/`after_state`.
- **Oczekiwana logika**: `writeAudit(action:'item.updated', beforeState:beforeRow, afterState:{...})` (`update-item.ts:199-221`).
- **Priorytet**: P2

## Items — Zmiana statusu (modal: `items/_components/status-transition-modal.tsx`, action: `transition-item-status.ts`)

### TEC-044: draft→active (Activate)
- **Co sprawdza**: promocja draftu do active.
- **Kroki**: 1) Item `draft` z UoM `kg`. 2) transitionItemStatus `toStatus='active'`. 3) Sukces.
- **Oczekiwana logika**: dozwolone `['draft','active']` (`shared.ts:353`); UPDATE status (`transition-item-status.ts:83-90`).
- **Priorytet**: P0

### TEC-045: Activation gate — draft z niekanonicznym uom_base blokuje aktywację
- **Co sprawdza**: legacy `uom_base='eac'` blokuje draft→active.
- **Kroki**: 1) Item `draft`, `uom_base='eac'` (wiersz sprzed mig 267). 2) Activate. 3) Oczekuj `activation_gate_failed`.
- **Oczekiwana logika**: `if (draft→active && !CANONICAL_UOM_SET.has(normalizePieceUom(uom_base) ?? uom_base)) return activation_gate_failed` (`transition-item-status.ts:73-81`).
- **Priorytet**: P0

### TEC-046: active→deprecated (Deprecate)
- **Co sprawdza**: dozwolone przejście do deprecated.
- **Kroki**: 1) Item `active`. 2) toStatus `deprecated`. 3) Sukces.
- **Oczekiwana logika**: `['active','deprecated']` (`shared.ts:354`).
- **Priorytet**: P1

### TEC-047: deprecated→active (Reactivate)
- **Co sprawdza**: powrót deprecated do active.
- **Kroki**: 1) Item `deprecated`. 2) toStatus `active`. 3) Sukces.
- **Oczekiwana logika**: `['deprecated','active']` (`shared.ts:355`).
- **Priorytet**: P1

### TEC-048: Idempotencja — ustawienie statusu, który już jest
- **Co sprawdza**: no-op success.
- **Kroki**: 1) Item `active`. 2) toStatus `active`. 3) Sukces bez zmiany/audytu.
- **Oczekiwana logika**: `if (current.status===input.toStatus) return ok` przed sprawdzeniem transition (`transition-item-status.ts:60-63`).
- **Priorytet**: P2

### TEC-049: Niedozwolone przejście → invalid_transition
- **Co sprawdza**: np. brak ścieżki draft→deprecated.
- **Kroki**: 1) Item `draft`. 2) toStatus `deprecated`. 3) Oczekuj `invalid_transition`.
- **Oczekiwana logika**: `!isAllowedStatusTransition('draft','deprecated')` → `invalid_transition` (`transition-item-status.ts:65-71`); brak `['draft','deprecated']` w liście (`shared.ts:501-509`).
- **Decyzja ownera (2026-07-30)**: `blocked → active` nie jest przykładem przejścia niedozwolonego; negatywny kontrakt pozostaje wartościowy dla `draft → deprecated`.
- **Priorytet**: P1

### TEC-050: toStatus ograniczony enumem (nie można przejść na 'blocked' tą akcją)
- **Co sprawdza**: `blocked`/`draft` nieosiągalne przez transition action.
- **Kroki**: 1) transitionItemStatus `toStatus='blocked'`. 2) Oczekuj `invalid_input` (zod).
- **Oczekiwana logika**: `TransitionItemStatusInput.toStatus = z.enum(TRANSITION_TARGETS=['active','deprecated'])` (`shared.ts:349-366`).
- **Priorytet**: P1

### TEC-051: Transition nieistniejącej pozycji → not_found; RBAC edit
- **Co sprawdza**: RLS/istnienie + uprawnienie edit.
- **Kroki**: 1) Obca/nieistniejąca pozycja. 2) Oczekuj `not_found`. 3) User bez edit → `forbidden`.
- **Oczekiwana logika**: SELECT scoped org (`transition-item-status.ts:52-58`); gate `ITEMS_EDIT_PERMISSION` (`:50`).
- **Priorytet**: P0

### TEC-052: Nic nie wraca do 'draft'
- **Co sprawdza**: brak jakiegokolwiek przejścia `*→draft`.
- **Kroki**: 1) Przejrzyj `ALLOWED_STATUS_TRANSITIONS`. 2) Potwierdź brak targetu `draft`.
- **Oczekiwana logika**: żadna para nie ma `draft` po prawej (`shared.ts:352-357`); komentarz `:343`.
- **Priorytet**: P2

## Items — Deaktywacja (modal: `items/_components/deactivate-modal.tsx`, action: `deactivate-item.ts`)

### TEC-053: Deaktywacja ustawia status='blocked' (brak soft-delete)
- **Co sprawdza**: brak kolumny deleted_at; "usunięcie" = blocked.
- **Kroki**: 1) Deaktywuj item. 2) Sprawdź `status='blocked'`, rekord dalej istnieje.
- **Oczekiwana logika**: `update ... set status='blocked'` (`deactivate-item.ts:42-47`); komentarz "table has no soft-delete column" (`:6-9`, `shared.ts:310-313`).
- **Priorytet**: P0

### TEC-054: Deaktywacja idempotentna
- **Co sprawdza**: re-blokada już zablokowanego = success.
- **Kroki**: 1) Item `blocked`. 2) Deaktywuj ponownie. 3) Sukces `status='blocked'`.
- **Oczekiwana logika**: UPDATE nie ma warunku statusu; zwraca `blocked` (`deactivate-item.ts:41-68`); komentarz idempotent (`:8`).
- **Priorytet**: P2

### TEC-055: Powód wymagany + notes gdy reason='other'
- **Co sprawdza**: reguła cross-field na powodzie deaktywacji.
- **Kroki**: 1) `reason='other'`, `notes` puste/krótkie (<10). 2) Oczekuj `invalid_input` na `notes`.
- **Oczekiwana logika**: `.refine(reason!=='other' || (notes?.length ?? 0)>=10)` (`shared.ts:323-332`); enum `DEACTIVATE_REASONS=[discontinued,recipe_change,d365_mismatch,other]` (`:320`).
- **Priorytet**: P1

### TEC-056: Powód/notes zapisane w audit (bez kolumny w items)
- **Co sprawdza**: reason+notes trafiają do audit_log.after_state.
- **Kroki**: 1) Deaktywuj z `reason='recipe_change'`. 2) Sprawdź `after_state.reason`.
- **Oczekiwana logika**: `afterState:{status:'blocked', reason, notes}` (`deactivate-item.ts:59-64`).
- **Priorytet**: P2

### TEC-057: Deaktywacja nieistniejącej/obcej → not_found; RBAC deactivate
- **Co sprawdza**: RLS + uprawnienie `technical.items.deactivate`.
- **Kroki**: 1) Obca pozycja → `not_found`. 2) User bez deactivate → `forbidden`.
- **Oczekiwana logika**: SELECT scoped (`deactivate-item.ts:34-39`); gate `ITEMS_DEACTIVATE_PERMISSION` (`:32`).
- **Priorytet**: P0

## Items — Szczegół / zakładki (screen: `items/[item_code]/page.tsx`, action: `get-item.ts`)

### TEC-058: Szczegół po item_code — org-scoped, stany not_found/error/ready
- **Co sprawdza**: ładowanie jednej pozycji po naturalnym kluczu.
- **Kroki**: 1) Otwórz istniejący kod. 2) Otwórz nieistniejący → not_found.
- **Oczekiwana logika**: `GetItemResult` discriminated `ready|not_found|error` (`get-item.ts:62-65`); SELECT scoped org (komentarz `:5-13`).
- **Priorytet**: P1

### TEC-059: Efektywny koszt i najtańszy dostawca (supplierUnitPrice)
- **Co sprawdza**: detail pokazuje najniższą cenę z aktywnych/zatwierdzonych supplier_specs + effective cost source.
- **Kroki**: 1) Item z kilkoma active/approved specs. 2) Sprawdź `supplierUnitPrice`=najtańsza.
- **Oczekiwana logika**: pole `supplierUnitPrice: 'Cheapest active+approved supplier_specs.unit_price'` + `effectiveCostSource` (`get-item.ts:53-59`).
- **Priorytet**: P1

### TEC-060: Gate Edit/Deactivate na szczególe wg RBAC
- **Co sprawdza**: `canEdit`/`canDeactivate` w wyniku.
- **Kroki**: 1) User read-only. 2) Sprawdź brak akcji.
- **Oczekiwana logika**: `hasPermission(ctx, ITEMS_EDIT_PERMISSION/DEACTIVATE)` (`get-item.ts:16-18`, komentarz `:7-9`).
- **Priorytet**: P1

## Items — Allergen Profile (zakładka: `items/[item_code]/_components/allergens-tab*`, action: `[item_code]/_actions/allergen-profile.ts`)

### TEC-061: Edycja profilu alergenów wymaga technical.allergens.edit
- **Co sprawdza**: gate zapisu profilu.
- **Kroki**: 1) User bez uprawnienia. 2) Save profilu. 3) Blokada.
- **Oczekiwana logika**: `ALLERGENS_EDIT_PERMISSION` gate przez `hasPermission` (`allergen-profile.ts:26-30`); komentarz "gates Save" (`:22`).
- **Priorytet**: P1

### TEC-062: Cascaded badge (source='cascaded') jest read-only
- **Co sprawdza**: manualny override nie kasuje źródła kaskady.
- **Kroki**: 1) Alergen z `source='cascaded'`. 2) Dodaj override z powodem. 3) Kaskada zostaje, override dodany.
- **Oczekiwana logika**: "Auto-cascaded badges ... READ-ONLY here ... override is additive with required reason (V-TEC-42) and never clears the cascade source" (`allergen-profile.ts:31-35`).
- **Priorytet**: P1

### TEC-063: intensity ∈ contains|may_contain|trace
- **Co sprawdza**: dozwolone poziomy intensywności alergenu.
- **Kroki**: 1) Zapisz z intensity spoza listy. 2) Oczekuj odrzucenia.
- **Oczekiwana logika**: `item_allergen_profiles.intensity ∈ contains|may_contain|trace` (`rm-usability.ts:120-123`); usługa `upsertProfile` (`allergen-profile.ts:37-41`).
- **Priorytet**: P2

## Materials — Lista (screen: `materials/page.tsx`, client: `materials/_components/materials-table.client.tsx`)

### TEC-064: Materials pokazuje tylko typy materiałowe (rm/ingredient/intermediate/packaging)
- **Co sprawdza**: FG/co_product/byproduct nie pojawiają się na Materials.
- **Kroki**: 1) Otwórz `/technical/materials`. 2) Sprawdź brak FG.
- **Oczekiwana logika**: `MATERIAL_TYPES=['rm','ingredient','intermediate','packaging']` przekazane do `listItems({itemTypes: MATERIAL_TYPES})` (`materials/page.tsx:14,30-35`).
- **Priorytet**: P0

### TEC-065: Filtr typu Materials nie pozwala wyjść poza dozwolone typy
- **Co sprawdza**: `?type=fg` na Materials jest ignorowany.
- **Kroki**: 1) `/technical/materials?type=fg`. 2) Filtr nieaktywny (all).
- **Oczekiwana logika**: `initialType = MATERIAL_TYPES.find(tab=>tab===sp?.type)` → undefined dla `fg` (`materials/page.tsx:29`); dodatkowo `parseItemTypeFilter` sprawdza `allowedTypes.includes` (`list-items.ts:166`).
- **Priorytet**: P1

### TEC-066: Materials reużywa RLS/org-scope z listItems
- **Co sprawdza**: izolacja org na Materials.
- **Kroki**: 1) User org A. 2) Sprawdź brak materiałów org B.
- **Oczekiwana logika**: `listItems` → `where i.org_id=app.current_org_id()` (`list-items.ts:140`); Materials nie ma własnego zapytania.
- **Priorytet**: P0

### TEC-067: Kolumna kosztu — formatowanie i brak wartości
- **Co sprawdza**: `costPerKg` renderowany do 2 miejsc lub "—".
- **Kroki**: 1) Materiał bez kosztu → "—". 2) Z kosztem 3.5 → "3.50".
- **Oczekiwana logika**: `formatCost` — `null→'—'`, `Number.isFinite→toFixed(2)` (`materials-table.client.tsx:24-28`).
- **Priorytet**: P2

### TEC-068: Badge statusu — mapowanie tonów
- **Co sprawdza**: mapowanie tonów draft/active/deprecated/blocked.
- **Kroki**: 1) Sprawdź kolory badge dla każdego statusu.
- **Oczekiwana logika**: `STATUS_TONE` (`materials-table.client.tsx:15-20`); `blocked→badge-red`.
- **Priorytet**: P2

### TEC-069: "Manage in Items" link tylko z uprawnieniem create
- **Co sprawdza**: CTA edycji materiału prowadzi do items i wymaga canCreate.
- **Kroki**: 1) User bez create → brak linku.
- **Oczekiwana logika**: `{canCreate ? <Link .../technical/items> : null}` (`materials/page.tsx:96-100`).
- **Priorytet**: P2

## Materials — Supplier Specs (action: `items/_actions/supplier-spec-actions.ts`, `[item_code]/_actions/list-supplier-specs.ts`)

### TEC-070: Dodanie supplier_spec (approve-now) czyści gate RM-usability
- **Co sprawdza**: approveNow=true zapisuje approved+active i usuwa ostrzeżenia SUPPLIER_NOT_APPROVED/SUPPLIER_SPEC_NOT_ACTIVE.
- **Kroki**: 1) Item bez specu. 2) createItemSupplierSpec approveNow=true. 3) Odśwież zakładkę.
- **Oczekiwana logika**: insert dokładnie kolumn czytanych przez gate (`supplier-spec-actions.ts:1-33`); rm-usability wymaga `supplier_status='approved'` i `lifecycle='active' ∧ review='approved' ∧ !expired` (`rm-usability.ts:279-317`).
- **Priorytet**: P0

### TEC-071: approveNow=false → spec pending, ostrzeżenia zostają
- **Co sprawdza**: draft/pending nie omija gate — nic nie jest cicho zatwierdzane.
- **Kroki**: 1) createItemSupplierSpec approveNow=false. 2) Gate dalej ostrzega.
- **Oczekiwana logika**: komentarz "When false the row lands as pending/draft and the BOM readiness warnings stay" (`supplier-spec-actions.ts:86-89`).
- **Priorytet**: P1

### TEC-072: expiry_date >= effective_from
- **Co sprawdza**: walidacja dat specyfikacji (create i update).
- **Kroki**: 1) `effectiveFrom='2026-05-01'`, `expiryDate='2026-04-01'`. 2) Oczekuj błędu.
- **Oczekiwana logika**: `.superRefine(expiryDate < effectiveFrom → issue)` (`supplier-spec-actions.ts:91-100` create; `:116-125` update).
- **Priorytet**: P1

### TEC-073: Data w formacie YYYY-MM-DD; unit_price nieujemny
- **Co sprawdza**: walidacja formatu daty i ceny.
- **Kroki**: 1) `issuedDate='01/05/2026'`. 2) `unitPrice=-1`. 3) Oczekuj `invalid_input`.
- **Oczekiwana logika**: `OptionalIsoDate` regex `^\d{4}-\d{2}-\d{2}$` (`supplier-spec-actions.ts:62-66`); `OptionalUnitPrice = number.nonnegative() | string /^\d+(\.\d+)?$/` (`:67-71`).
- **Priorytet**: P2

### TEC-074: createItemSupplierSpec — item/supplier nieznany → typed error
- **Co sprawdza**: `item_not_found` / `supplier_not_found`.
- **Kroki**: 1) `itemCode` nieistniejący → `item_not_found`. 2) `supplierId` nieznany → `supplier_not_found`.
- **Oczekiwana logika**: resolve item_id scoped org → `item_not_found` (`supplier-spec-actions.ts:153-159`); resolve supplier code (`:161+`).
- **Priorytet**: P1

### TEC-075: RBAC — dołączenie/edycja specu wymaga technical.items.edit
- **Co sprawdza**: attach dostawcy to edycja itemu.
- **Kroki**: 1) User bez edit. 2) createItemSupplierSpec. 3) `forbidden`.
- **Oczekiwana logika**: `hasPermission(ctx, ITEMS_EDIT_PERMISSION)` (`supplier-spec-actions.ts:150`); komentarz `:29-30`.
- **Priorytet**: P0

### TEC-076: Idempotencja przez partial unique (org,item,supplier active+approved)
- **Co sprawdza**: powtórne approve-now nie tworzy duplikatu, zwraca updated.
- **Kroki**: 1) createItemSupplierSpec approveNow dwukrotnie tym samym dostawcą. 2) Jeden active/approved wiersz.
- **Oczekiwana logika**: `PARTIAL UNIQUE supplier_specs_one_active_approved (org_id,item_id,supplier_code) where lifecycle='active' and review='approved'` (`supplier-spec-actions.ts:17-21`; `162-lab-supplier.sql`).
- **Priorytet**: P1

## UoM — Konwersje (lib: `lib/uom/convert.ts`, `lib/uom/piece.ts`)

### TEC-077: toBaseQty — each: qty × net_qty_per_each
- **Co sprawdza**: konwersja szt→kg (base).
- **Kroki**: 1) snapshot `outputUom='each'`, `netQtyPerEach=0.5`. 2) `toBaseQty(snap, 10, 'each')`.
- **Oczekiwana logika**: **FORMUŁA**: base = qty × netQtyPerEach = 10 × 0.5 = 5 kg (`convert.ts:39-43`).
- **Priorytet**: P0

### TEC-078: toBaseQty — box: qty × each_per_box × net_qty_per_each
- **Co sprawdza**: konwersja box→kg.
- **Kroki**: 1) `netQtyPerEach=0.5`, `eachPerBox=12`. 2) `toBaseQty(snap, 2, 'box')`.
- **Oczekiwana logika**: **FORMUŁA**: base = qty × eachPerBox × netQtyPerEach = 2 × 12 × 0.5 = 12 kg (`convert.ts:42`).
- **Priorytet**: P0

### TEC-079: fromBaseQty — odwrotność (each/box)
- **Co sprawdza**: kg→szt / kg→box.
- **Kroki**: 1) `fromBaseQty(snap, 5, 'each')` przy net=0.5 → 10. 2) box: base/(eachPerBox×net).
- **Oczekiwana logika**: **FORMUŁY**: each: baseQty / netQtyPerEach; box: baseQty / (eachPerBox × netQtyPerEach) (`convert.ts:58-62`).
- **Priorytet**: P0

### TEC-080: Konwersja decimal-exact (bez float)
- **Co sprawdza**: `toBaseQtyFromDecimal` używa arytmetyki micro (NUMERIC-exact), wynik do 3 miejsc.
- **Kroki**: 1) qty='0.1', net='0.3'. 2) Sprawdź brak błędu float.
- **Oczekiwana logika**: `mulMicro/microToFixed(...,3)` zamiast JS float (`convert.ts:46-56`).
- **Priorytet**: P1

### TEC-081: Brak/zerowy factor → TypedError uom_conversion_unavailable
- **Co sprawdza**: konwersja each/box bez wymaganego factoru rzuca typed error.
- **Kroki**: 1) `outputUom='each'`, `netQtyPerEach=null`. 2) `toBaseQty(...,'each')`. 3) Oczekuj `uom_conversion_unavailable`.
- **Oczekiwana logika**: `requireFactor` rzuca gdy `null || <=0` (`convert.ts:140-145`); klasa `TypedError` (`:14-22`).
- **Priorytet**: P0

### TEC-082: packHierarchyComplete — gate kompletności przed produkcją
- **Co sprawdza**: base zawsze complete; each wymaga net>0; box wymaga net>0 ∧ each_per_box>0.
- **Kroki**: 1) `base`→true. 2) `each` bez net→false. 3) `box` z net,each_per_box→true.
- **Oczekiwana logika**: `packHierarchyComplete` (`convert.ts:91-98`); `positiveFactor` (`:100-102`).
- **Priorytet**: P1

### TEC-083: normalizePieceUom — trim, puste→undefined, legacy→pcs
- **Co sprawdza**: mapowanie kodów sztukowych.
- **Kroki**: 1) `' szt '`→`pcs`. 2) `''`→undefined. 3) `'kg'`→`kg`.
- **Oczekiwana logika**: `normalizePieceUom` (`lib/uom/piece.ts`): trim, `''→undefined`, `szt|ea→'pcs'`, reszta pass-through.
- **Priorytet**: P2

### TEC-084: pieceUomToWacEach — pcs → 'each' dla WAC/kg
- **Co sprawdza**: mostek do gramatyki WAC.
- **Kroki**: 1) `pcs`→`each`. 2) `kg`→`kg`.
- **Oczekiwana logika**: `pieceUomToWacEach` — canonical `pcs→'each'`, reszta trimmed (`lib/uom/piece.ts`).
- **Priorytet**: P2

## RM Usability — decyzja użyteczności komponentu (lib: `lib/technical/rm-usability.ts`)

### TEC-085: Item nieaktywny → ITEM_NOT_ACTIVE (hard block wszędzie)
- **Co sprawdza**: tylko `status='active'` przechodzi check #1; draft/blocked/deprecated blokują.
- **Kroki**: 1) Item `draft` w bom_edit. 2) Sprawdź `blockingReasons=[ITEM_NOT_ACTIVE]`.
- **Oczekiwana logika**: `if (!req.item || req.item.status!=='active') blockingReasons.push('ITEM_NOT_ACTIVE')` (`rm-usability.ts:249-256`); nawet w bom_edit to hard block (`:189-193`).
- **Priorytet**: P0

### TEC-086: bom_edit — readiness dostawcy to WARN (draft BOM edytowalny)
- **Co sprawdza**: SUPPLIER_NOT_APPROVED/SPEC_NOT_ACTIVE/COST/SPEC_REVIEW są warn w kontekście bom_edit.
- **Kroki**: 1) Świeży item bez specu w kontekście `bom_edit`. 2) Sprawdź `warnings`, nie `blockingReasons`.
- **Oczekiwana logika**: `BOM_EDIT_SOFT_READINESS` set + `readinessSeverityForContext` downgrade do warn (`rm-usability.ts:204-223`).
- **Priorytet**: P0

### TEC-087: factory_spec_approval / material_issue — readiness pozostaje hard block
- **Co sprawdza**: te same reasony blokują w seamach release.
- **Kroki**: 1) Ten sam item bez specu w `material_issue`. 2) Oczekuj `usable=false`, blocking.
- **Oczekiwana logika**: `readinessSeverityForContext` zwraca 'block' poza bom_edit (`rm-usability.ts:217-223`); komentarz `:195-199`.
- **Priorytet**: P0

### TEC-088: ALLERGEN_CONFLICT — zawsze hard block (contains/may_contain ∩ forbidden)
- **Co sprawdza**: konflikt alergenowy RM vs zakaz FG blokuje w każdym kontekście.
- **Kroki**: 1) RM `contains GLUTEN`, FG forbidden `[GLUTEN]`, kontekst bom_edit. 2) Oczekuj block + `allergenCodes=['GLUTEN']`.
- **Oczekiwana logika**: intersekcja `intensity∈{contains,may_contain}` ∩ forbidden (uppercase), niepusta → `blockingReasons.push('ALLERGEN_CONFLICT')` (`rm-usability.ts:348-366`); nigdy downgrade (`:191-193`).
- **Priorytet**: P0

### TEC-089: Wygaśnięcie specu — ważny do końca dnia expiry_date
- **Co sprawdza**: spec z expiry wczoraj → not in-date; expiry dziś → jeszcze ważny.
- **Kroki**: 1) `expiryDate` = wczoraj, now teraz. 2) Sprawdź SUPPLIER_SPEC_NOT_ACTIVE.
- **Oczekiwana logika**: `isSpecExpired`: `now > expiry + 24h - 1ms` (ważny przez cały dzień expiry) (`rm-usability.ts:407-413`); niepasująca data → traktowana jak wygasła (`:410`).
- **Priorytet**: P1

### TEC-090: QC_RELEASE_MISSING — block w factory_spec_approval/material_issue, warn w bom_edit/po_receipt
- **Co sprawdza**: kontekstowa surowość braku QC release.
- **Kroki**: 1) `qcRelease.required=true`, `status!='released'`. 2) W factory_spec_approval→block; w bom_edit→warn.
- **Oczekiwana logika**: `qcReleaseSeverityForContext` (`rm-usability.ts:178-180`); tylko `status==='released'` przechodzi (`:377`).
- **Priorytet**: P1

### TEC-091: supplierSourcingRequired=false (WIP) pomija gate dostawcy/kosztu/specu
- **Co sprawdza**: intermediate/WIP nie potrzebuje zakupowego dostawcy.
- **Kroki**: 1) `supplierSourcingRequired=false`. 2) Sprawdź OK dla supplier/spec/cost/spec-review.
- **Oczekiwana logika**: gałąź `if (!supplierSourcingRequired)` pushuje same OK (`rm-usability.ts:264-276`); default true (`:246`).
- **Priorytet**: P1

### TEC-092: verdict.usable = brak blockingReasons
- **Co sprawdza**: definicja użyteczności.
- **Kroki**: 1) Item active + wszystko OK. 2) `usable=true`, `blockingReasons=[]`.
- **Oczekiwana logika**: `usable: blockingReasons.length===0` (`rm-usability.ts:397`).
- **Priorytet**: P1

## Items/Materials — Cross-cutting: RLS, RBAC, integralność

### TEC-093: force RLS — nawet właściciel tabeli nie omija org isolation
- **Co sprawdza**: `force row level security` aktywne.
- **Kroki**: 1) Zapytanie bez ustawionego org context. 2) Brak wierszy.
- **Oczekiwana logika**: `alter table public.items force row level security` + polityka `for all` (`153-items-master.sql:91-100`); grants tylko `app_user` (`:102-104`).
- **Priorytet**: P0

### TEC-094: INSERT używa app.current_org_id() (nie zaufanego org z wejścia)
- **Co sprawdza**: org nie da się sfałszować z payloadu.
- **Kroki**: 1) createItem. 2) Sprawdź, że org_id wiersza = kontekst.
- **Oczekiwana logika**: `values (app.current_org_id(), ...)` (`create-item.ts:55`), `with check (org_id=app.current_org_id())` (`153-items-master.sql:100`).
- **Priorytet**: P0

### TEC-095: Trigger updated_at odświeżany przy każdym UPDATE
- **Co sprawdza**: `updated_at` = now() po edycji.
- **Kroki**: 1) Update item. 2) Sprawdź nowy `updated_at`.
- **Oczekiwana logika**: trigger `items_set_updated_at BEFORE UPDATE` (`153-items-master.sql`).
- **Priorytet**: P2

### TEC-096: mapRow odrzuca wiersze o statusie/typie spoza app-enumów
- **Co sprawdza**: legacy statusy z mig 231 (development/pilot/discontinued) NIE przeciekają do UI listy.
- **Kroki**: 1) Ręcznie ustaw `status='pilot'` w DB. 2) Otwórz listę. 3) Wiersz pominięty.
- **Oczekiwana logika**: `mapRow` zwraca null gdy `!ITEM_STATUS_SET.has(status)` (`list-items.ts:88-89`). ROZBIEŻNOŚĆ modelu: DB dopuszcza, app filtruje.
- **Priorytet**: P1

### TEC-097: Kolizja item_type z legacy CHECK (packaging/ingredient)
- **Co sprawdza**: `packaging`/`ingredient` zapisywalne (mig 248/255), ale nie w oryginalnym CHECK 153.
- **Kroki**: 1) Utwórz `itemType='packaging'`. 2) Sukces (po migracji).
- **Oczekiwana logika**: `ITEM_TYPES` app (`shared.ts:39`) zgodne z DB CHECK po `248`/`255`; oryginał `153-items-master.sql:45-47` był węższy — regression guard na kolejności migracji.
- **Priorytet**: P2

### TEC-098: Ceny i koszt — rozdział list_price (items) vs unit_price (supplier_specs)
- **Co sprawdza**: cena sprzedaży `list_price_gbp` na items; cena zakupu na supplier_specs.unit_price.
- **Kroki**: 1) Utwórz z `listPriceGbp` i `supplierUnitPrice`. 2) Sprawdź rozdział kolumn.
- **Oczekiwana logika**: komentarz "list_price_gbp is the separate sell price ... written only on public.items" vs supplier buy price → `supplier_specs.unit_price` (`create-item.ts:109-111,120,127`).
- **Priorytet**: P1

### TEC-099: Audit log dla każdej mutacji (created/updated/deactivated/status_transitioned)
- **Co sprawdza**: pełny ślad audytowy z resource_type='item'.
- **Kroki**: 1) Wykonaj po jednej z 4 mutacji. 2) Sprawdź odpowiadające `action` w audit_log.
- **Oczekiwana logika**: `writeAudit` z akcjami `item.created`/`item.updated`/`item.deactivated`/`item.status_transitioned`; INSERT `resource_type='item', actor_type='user', retention_class='standard'` (`shared.ts:388-412`; wywołania: `create-item.ts:159`, `update-item.ts:199`, `deactivate-item.ts:52`, `transition-item-status.ts:94`).
- **Priorytet**: P2

---
# Część B — BOM / Revisions / Where-used / WIP-Library (TEC-100…TEC-199, TEC-284)

Maszyna stanów wersji BOM (mig 090/168/208): `draft → in_review → technical_approved → active → superseded/archived`. Dozwolone przejścia zakodowane w triggerze `bom_headers_enforce_status_transition()` (`packages/db/migrations/208-bom-state-machine-no-reopen-technical-approved.sql:39-48`):
- `draft → in_review | technical_approved | active | archived`
- `in_review → draft | technical_approved | active | archived`
- `technical_approved → active | superseded | archived` (BEZ `in_review` — mig 208)
- `active → superseded | archived`
- `superseded → archived`
- `archived →` (terminal, brak)

Niezmienniki treści (mig 090 `bom_headers_reject_approved_content_update`, mig 355 wyłącza `yield_pct`): wiersze `technical_approved`/`active` są clone-on-write — treści się nie mutuje, tylko status (+ `yield_pct`, + `updated_at`).

## BOM — Lista (`technical/bom/page.tsx`)

### TEC-100: Lista BOM — paginacja i izolacja org
- **Co sprawdza**: Lista pokazuje tylko BOM-y bieżącej org, stronicowana po `BOM_LIST_PAGE_SIZE`.
- **Kroki**: 1) Zaloguj jako org A. 2) Otwórz `/technical/bom`. 3) Sprawdź, że BOM-y org B nie są widoczne. 4) Sprawdź licznik strony = 50.
- **Oczekiwana logika**: `BOM_LIST_PAGE_SIZE = 50` (`technical/bom/_actions/shared.ts:54`); RLS `org_id = app.current_org_id()`.
- **Priorytet**: P1

### TEC-101: Lista BOM — pusty stan (brak BOM-ów)
- **Co sprawdza**: Renderowanie pustego stanu bez błędu, gdy org nie ma BOM-ów.
- **Kroki**: 1) Nowa org bez BOM. 2) Otwórz listę.
- **Oczekiwana logika**: Widok listy `bom-list-screen.tsx` pokazuje empty-state, nie crashuje.
- **Priorytet**: P2

## BOM — Tworzenie wersji draft (`_actions/create-draft.ts`, `_components/new-bom-modal.tsx`, `bom-first-authoring.tsx`)

### TEC-102: Utworzenie nowej wersji draft — numeracja version = max+1
- **Co sprawdza**: `createBomDraft` bez `sourceBomHeaderId` zawsze tworzy `status='draft'`, `version = max(version)+1`.
- **Kroki**: 1) Utwórz BOM dla FG bez BOM (→v1). 2) Utwórz kolejny dla tego samego FG (→v2). 3) Sprawdź statusy.
- **Oczekiwana logika**: `version = coalesce(max(version),0)+1` scoped po `item_id` (`create-draft.ts:334-341`); status zawsze `draft`, NIGDY auto-publish.
- **Priorytet**: P0

### TEC-103: Wymagane pola — min. 1 linia
- **Co sprawdza**: BOM bez linii jest odrzucany walidacją zod.
- **Kroki**: 1) Wywołaj `createBomDraft` z `lines: []`.
- **Oczekiwana logika**: `lines: z.array(LineInput).min(1)` → `invalid_input` (`shared.ts:207`).
- **Priorytet**: P0

### TEC-104: Linia z zerową/ujemną ilością odrzucona
- **Co sprawdza**: `quantity <= 0` jest odrzucane.
- **Kroki**: 1) `createBomDraft` z linią `quantity: 0`. 2) Powtórz z `-5`.
- **Oczekiwana logika**: `quantity: z.coerce.number().positive().finite()` (`shared.ts:180`) + DB CHECK `bom_lines_quantity_positive_check (quantity > 0)` (`packages/db/migrations/090-shared-bom-ssot-npd-origin.sql:99-100`).
- **Priorytet**: P0

### TEC-105: quantity — limit 6 miejsc po przecinku
- **Co sprawdza**: `formatBomNumeric` odrzuca >6 dp.
- **Kroki**: 1) Linia z `quantity: 1.1234567`.
- **Oczekiwana logika**: `MAX_BOM_NUMERIC_DP = 6`, rzuca "supports at most 6 decimal places" → `invalid_state`/`invalid_input` (`shared.ts:98-112`). `numeric(14,6)` w DB.
- **Priorytet**: P1

### TEC-106: V-TEC-13 self-reference (linia = parent)
- **Co sprawdza**: Komponent równy `productId` odrzucany wcześnie.
- **Kroki**: 1) `createBomDraft(productId=FG-1)` z linią `componentCode=FG-1`.
- **Oczekiwana logika**: `componentCodes.includes(input.productId)` → `V-TEC-13` "references its own parent item" (`create-draft.ts:125-128`).
- **Priorytet**: P0

### TEC-107: V-TEC-13 wykrycie cyklu przez graf ACTIVE BOM
- **Co sprawdza**: Dodanie krawędzi tworzącej cykl (A→B, gdzie B→…→A istnieje w aktywnych BOM) jest blokowane.
- **Kroki**: 1) Aktywny BOM: B zawiera A. 2) Utwórz draft dla A z linią B. 3) Sprawdź odmowę.
- **Oczekiwana logika**: DFS `detectCycle` nad grafem `status='active'` (`create-draft.ts:129-141`, `_actions/cycle-detection.ts:31-58`). Zwraca `V-TEC-13` "would introduce a cycle".
- **Priorytet**: P0

### TEC-108: Cykl liczony TYLKO nad statusem active
- **Co sprawdza**: Draft/superseded BOM-y NIE tworzą krawędzi w grafie cyklu.
- **Kroki**: 1) BOM B→A w statusie `draft` (nie active). 2) Utwórz draft A z linią B → powinno przejść (brak cyklu z active).
- **Oczekiwana logika**: Zapytanie grafu filtruje `h.status = 'active'` (`create-draft.ts:135`). Uwaga: cykl przez tylko-draftowe łańcuchy nie jest wykrywany do czasu publikacji — patrz Niepewności.
- **Priorytet**: P1

### TEC-109: V-TEC-12 suma alokacji non-byproduct = 100
- **Co sprawdza**: `parentAllocationPct + Σ(co-product non-byproduct allocationPct)` musi = 100 (3 dp).
- **Kroki**: 1) `parentAllocationPct=70`, co-product non-byproduct `allocationPct=20` (suma 90). 2) Sprawdź odmowę. 3) Popraw do 30 (suma 100) → OK.
- **Oczekiwana logika**: `round3(parent + ΣnonByproduct) === 100` inaczej `V-TEC-12` (`create-draft.ts:143-155`). Formuła: `coverage = round3(parentAllocationPct + Σ allocationPct[!isByproduct])`.
- **Priorytet**: P0

### TEC-110: Co-product byproduct wyłączony z sumy alokacji
- **Co sprawdza**: Co-product z `isByproduct=true` nie wlicza się do 100%.
- **Kroki**: 1) `parentAllocationPct=100`, co-product `isByproduct=true, allocationPct=15`. 2) Sprawdź, że przechodzi.
- **Oczekiwana logika**: `filter((cp)=>!cp.isByproduct)` (`create-draft.ts:144-146`).
- **Priorytet**: P1

### TEC-111: V-TEC-14 usability komponentu (RM zablokowany)
- **Co sprawdza**: Komponent nieprzechodzący łańcucha RM-usability blokuje create.
- **Kroki**: 1) RM z zablokowanym supplier_spec (spec_review_blocked) użyty jako linia. 2) Sprawdź odmowę.
- **Oczekiwana logika**: `validateBomLineRmUsability(..., 'bom_edit', productId)` → `V-TEC-14` z `rmUsabilityFailures` (`create-draft.ts:157-167`, `shared.ts:310-397`).
- **Priorytet**: P0

### TEC-112: V-TEC-63 nieznana operacja produkcyjna
- **Co sprawdza**: `manufacturingOperationName` musi istnieć jako aktywna w `"Reference"."ManufacturingOperations"`.
- **Kroki**: 1) Linia z `manufacturingOperationName='NIEISTNIEJE'`. 2) Sprawdź odmowę.
- **Oczekiwana logika**: `validateBomManufacturingOperationNames` → `V-TEC-63` (`create-draft.ts:169-180`, `shared.ts:413-455`). Puste/null nazwy dozwolone.
- **Priorytet**: P1

### TEC-113: V-TEC-11 ostrzeżenie advisory (scrap ≥ 50), nie blokuje
- **Co sprawdza**: Linia ze `scrapPct>=50` daje warning, ale create się udaje.
- **Kroki**: 1) Linia `scrapPct=60`. 2) Sprawdź `ok:true` z `warnings:['V-TEC-11']`.
- **Oczekiwana logika**: `warnings.push('V-TEC-11')`, non-blocking (`create-draft.ts:182-183`).
- **Priorytet**: P2

### TEC-114: line_no gęsty 1..N w kolejności wejścia
- **Co sprawdza**: Wstawiane linie dostają `line_no = i+1`.
- **Kroki**: 1) Create z 3 liniami. 2) Sprawdź `line_no` 1,2,3.
- **Oczekiwana logika**: pętla `i+1` (`create-draft.ts:364-386`). Unikat `(bom_header_id, line_no)` (`mig 090:105`).
- **Priorytet**: P2

### TEC-115: parent intermediate → header.product_id = null (items-only)
- **Co sprawdza**: Dla parenta `item_type='intermediate'` header nie ma product_id.
- **Kroki**: 1) Create dla intermediate. 2) Sprawdź `product_id IS NULL`, `item_id` ustawione.
- **Oczekiwana logika**: `headerProductId = item_type==='intermediate' ? null : productId` (`create-draft.ts:200`); dla product partial-unique po npd_project (`mig 090:55-57`).
- **Priorytet**: P1

### TEC-116: Nieprawidłowy parent (item nieaktywny / zły typ)
- **Co sprawdza**: Parent musi być `fg`/`intermediate` i `status='active'`.
- **Kroki**: 1) Create z productId wskazującym RM lub nieaktywny item.
- **Oczekiwana logika**: `bomParentTypes = {fg, intermediate}` i `status==='active'`, inaczej `invalid reference` (`create-draft.ts:75-78`).
- **Priorytet**: P1

### TEC-117: bom_type='disassembly' odrzucony w createBomDraft
- **Co sprawdza**: Disassembly musi iść przez dedykowaną akcję.
- **Kroki**: 1) `createBomDraft({bom_type:'disassembly'})`.
- **Oczekiwana logika**: Wczesny `invalid_input` "must be created with createDisassemblyBomDraft" (`create-draft.ts:110-116`).
- **Priorytet**: P2

### TEC-118: RBAC — brak technical.bom.create
- **Co sprawdza**: Bez permisji create odmowa `forbidden`.
- **Kroki**: 1) Użytkownik bez `technical.bom.create`. 2) Wywołaj create.
- **Oczekiwana logika**: `hasPermission(ctx, BOM_CREATE_PERMISSION)` (`create-draft.ts:122`).
- **Priorytet**: P0

### TEC-119: Save-as-new-draft z draftowego źródła — archiwizacja źródła
- **Co sprawdza**: Zapis draftu z `sourceBomHeaderId` będącym `draft/in_review` tworzy nowy draft i archiwizuje źródło.
- **Kroki**: 1) Draft v1. 2) `createBomDraft(sourceBomHeaderId=v1)`. 3) Sprawdź v2 draft + v1 `archived`.
- **Oczekiwana logika**: gałąź `['draft','in_review']` — advisory-lock + max+1 + `update … status='archived', effective_to=coalesce(...,current_date)` (`create-draft.ts:231-276`).
- **Priorytet**: P1

### TEC-120: Save-as-new z active/approved źródła → clone-on-write
- **Co sprawdza**: `sourceBomHeaderId` w statusie `technical_approved/active` routuje przez `bom_request_version_edit` (nowy `in_review`, źródło nietknięte), potem nadpisuje linie z inputu.
- **Kroki**: 1) Active v1. 2) `createBomDraft(sourceBomHeaderId=v1, lines=[nowe])`. 3) Sprawdź nowy `in_review` v2 supersedes v1, v1 dalej active.
- **Oczekiwana logika**: gałąź `['technical_approved','active']` → `callBomRequestVersionEdit` + delete lines/co_products + reinsert (`create-draft.ts:277-324`).
- **Priorytet**: P0

### TEC-121: sourceBomHeaderId ≠ productId — odrzucenie
- **Co sprawdza**: Źródło nie pasujące do productId odrzucone.
- **Kroki**: 1) `createBomDraft(productId=FG-1, sourceBomHeaderId=<BOM FG-2>)`.
- **Oczekiwana logika**: `invalid_input` "does not match productId" (`create-draft.ts:223-229`).
- **Priorytet**: P1

### TEC-122: Duplikat wersji (23505) → conflict
- **Co sprawdza**: Wyścig na `(org, product, version)` unikacie zwraca conflict.
- **Kroki**: 1) Symuluj równoległe create dające tę samą version.
- **Oczekiwana logika**: `23505 → conflict 'duplicate BOM version'` (`create-draft.ts:427`); partial-unique `bom_headers_org_product_version_unique` (`mig 090:51-53`).
- **Priorytet**: P1

## BOM — Detal, edycja linii (`_actions/line-actions.ts`, `_components/bom-detail-screen.tsx`, `bom-component-lines.client.tsx`)

### TEC-123: addBomLine — append in-place na draft (line_no=max+1)
- **Co sprawdza**: Dodanie komponentu do istniejącego draftu NIE forkuje nowej wersji (fix F-B01).
- **Kroki**: 1) Draft z 2 liniami. 2) `addBomLine`. 3) Sprawdź 3 linie, ta sama wersja, `line_no=3`.
- **Oczekiwana logika**: append `max(line_no)+1` (`line-actions.ts:151-207`).
- **Priorytet**: P0

### TEC-124: addBomLine na wersji released → bom_not_editable
- **Co sprawdza**: Blokada edycji linii na `technical_approved/active/superseded/archived`.
- **Kroki**: 1) Active BOM. 2) `addBomLine`. 3) Sprawdź `bom_not_editable`.
- **Oczekiwana logika**: `BOM_LINE_EDITABLE_STATUSES = {draft, in_review}` (`shared.ts:536-539`, `line-actions.ts:92-94`).
- **Priorytet**: P0

### TEC-125: addBomLine — V-TEC-13 self/cycle
- **Co sprawdza**: Append komponentu = parent lub tworzącego cykl blokowany.
- **Kroki**: 1) Draft dla FG-1. 2) `addBomLine(componentCode=FG-1)`. 3) Sprawdź V-TEC-13.
- **Oczekiwana logika**: self-ref + `detectCycle` nad active (`line-actions.ts:96-114`).
- **Priorytet**: P0

### TEC-126: addBomLine — V-TEC-14 usability
- **Co sprawdza**: Append zablokowanego RM odrzucony.
- **Kroki**: 1) `addBomLine` z RM z zablokowaną usability. 2) Sprawdź V-TEC-14.
- **Oczekiwana logika**: `validateBomLineRmUsability(..., 'bom_edit', ...)` (`line-actions.ts:116-130`).
- **Priorytet**: P1

### TEC-127: addBomLine — wyścig współbieżny (23505) retry raz
- **Co sprawdza**: Dwa równoległe appendy — jeden wygrywa, drugi retry raz przez SAVEPOINT.
- **Kroki**: 1) Symuluj 2 równoległe appendy (ten sam max+1). 2) Sprawdź, że oba się finalnie udają lub drugi robi retry.
- **Oczekiwana logika**: `savepoint bom_line_append`, rollback-to-savepoint na 23505, jeden retry, potem `persistence_failed` (`line-actions.ts:151-189`).
- **Priorytet**: P1

### TEC-128: updateBomLine — zmiana qty/uom/operacji na draft
- **Co sprawdza**: Aktualizacja pól linii na wersji edytowalnej.
- **Kroki**: 1) Draft. 2) `updateBomLine(qty=5, uom='kg')`. 3) Sprawdź audyt before/after.
- **Oczekiwana logika**: update z guardem statusu + audyt (`line-actions.ts:219-322`). qty jako DecimalString `>0` (`shared.ts:543-547`).
- **Priorytet**: P0

### TEC-129: updateBomLine — qty ≤ 0 odrzucone
- **Co sprawdza**: DecimalString refine wymaga `Number(v)>0`.
- **Kroki**: 1) `updateBomLine(qty='0')`. 2) Sprawdź odmowę.
- **Oczekiwana logika**: refine "quantity must be a positive number" (`shared.ts:546-547`); DB CHECK `quantity > 0` (23514→invalid_input).
- **Priorytet**: P1

### TEC-130: updateBomLine — czyszczenie operacji (pusty string → null)
- **Co sprawdza**: `manufacturingOperationName=''` zapisuje null, bez walidacji V-TEC-63.
- **Kroki**: 1) `updateBomLine(manufacturingOperationName='')`. 2) Sprawdź null.
- **Oczekiwana logika**: `nextOperation = ''? null` (`line-actions.ts:253-269`).
- **Priorytet**: P2

### TEC-131: deleteBomLine — renumeracja gęsta 1..N (two-phase)
- **Co sprawdza**: Po usunięciu środkowej linii pozostałe renumerowane do 1..N bez naruszenia CHECK>0/unique.
- **Kroki**: 1) Draft z liniami 1,2,3. 2) Usuń linię 2. 3) Sprawdź line_no 1,2.
- **Oczekiwana logika**: two-phase offset +100000 potem -100000 (`line-actions.ts:379-402`); offset dodatni, bo `line_no>0` nie-deferrable.
- **Priorytet**: P1

### TEC-132: deleteBomLine na released → bom_not_editable
- **Kroki**: 1) Active BOM. 2) `deleteBomLine`. 3) Sprawdź `bom_not_editable`.
- **Oczekiwana logika**: guard statusu (`line-actions.ts:338-340`).
- **Priorytet**: P1

### TEC-133: Linie — component_code vs item_id resolution
- **Co sprawdza**: Linia z `item_id` rozwiązuje item po FK, bez `item_id` po `component_code`.
- **Kroki**: 1) Linia A z `itemId`, linia B tylko `componentCode`. 2) Sprawdź usability/cost dopasowanie.
- **Oczekiwana logika**: `line.itemId ? by id : by item_code` (`shared.ts:331-336`); cost-join tak samo (`cost/_actions/recipe-cost-rollup-sql.ts:19-24`).
- **Priorytet**: P1

### TEC-134: Duplikat komponentu w liniach (brak DB-unique)
- **Co sprawdza**: Czy dwie linie tego samego `component_code` są dozwolone (BRAK constraintu) — udokumentuj zachowanie i wpływ na diff/where-used.
- **Kroki**: 1) Create/append 2 linii tego samego RM. 2) Sprawdź, że zapisuje się (brak walidacji unikatu). 3) Sprawdź diff (keyed po item_id) i cost (sumuje obie).
- **Oczekiwana logika**: Brak unikatu `(bom_header_id, component_code)` w `mig 090`; diff keyuje po item_id (kolizja klucza — patrz Niepewności) (`_actions/diff.ts:41-43`).
- **Priorytet**: P1

### TEC-135: RBAC linii — technical.bom.create
- **Kroki**: 1) User bez permisji. 2) add/update/delete linii. 3) `forbidden`.
- **Oczekiwana logika**: wszystkie 3 akcje linii gate na `BOM_CREATE_PERMISSION` (`line-actions.ts:88,228,334`).
- **Priorytet**: P1

## BOM — Maszyna stanów: approve/publish (`_actions/workflow.ts`, `lib/technical/bom-publish-service.ts`)

### TEC-136: approveBom — draft/in_review → technical_approved
- **Co sprawdza**: Approve stempluje approved_by/at i przechodzi status.
- **Kroki**: 1) Draft. 2) `approveBom`. 3) Sprawdź `technical_approved`, approved_by set.
- **Oczekiwana logika**: update `status='technical_approved'` where `status in ('draft','in_review')` (`workflow.ts:99-106`); CHECK wymaga approved_by/at (`mig 090:41-42`).
- **Priorytet**: P0

### TEC-137: approveBom — ponowna aproba już approved/active → conflict
- **Kroki**: 1) Active BOM. 2) `approveBom`. 3) `conflict 'version already active'`.
- **Oczekiwana logika**: guard `status==='technical_approved'||'active'` (`workflow.ts:71-73`).
- **Priorytet**: P1

### TEC-138: approveBom — z niedozwolonego statusu (superseded/archived) → conflict
- **Kroki**: 1) Superseded BOM. 2) `approveBom`. 3) conflict.
- **Oczekiwana logika**: `status !== 'draft' && !== 'in_review'` → conflict (`workflow.ts:74-76`).
- **Priorytet**: P1

### TEC-139: approveBom — re-walidacja cyklu (V-TEC-13) i usability (V-TEC-14) w momencie aproby
- **Co sprawdza**: Red-line: cykl/usability sprawdzane ponownie przy approve.
- **Kroki**: 1) Draft, potem inny active BOM tworzy cykl. 2) `approveBom` → V-TEC-13.
- **Oczekiwana logika**: `validateBomApprovalGuards` z kontekstem `factory_spec_approval` (`workflow.ts:83-97`, `shared.ts:467-504`).
- **Priorytet**: P0

### TEC-140: approveBom — RBAC technical.bom.approve
- **Kroki**: 1) User bez permisji. 2) `approveBom`. 3) `forbidden`.
- **Oczekiwana logika**: `BOM_APPROVE_PERMISSION` (`workflow.ts:67`).
- **Priorytet**: P0

### TEC-141: publishBom — technical_approved → active + atomic supersede
- **Co sprawdza**: Publikacja flipuje poprzednią active na superseded w tej samej txn.
- **Kroki**: 1) v1 active, v2 technical_approved. 2) `publishBom(v2)`. 3) Sprawdź v2 active, v1 superseded, emisja `fg.bom.released`.
- **Oczekiwana logika**: supersede update `status='superseded'` potem activate (`bom-publish-service.ts:113-156`).
- **Priorytet**: P0

### TEC-142: publishBom — V-TEC-10 z niezaaprobowanej wersji
- **Co sprawdza**: Draft/in_review nie może publikować.
- **Kroki**: 1) Draft. 2) `publishBom`. 3) `validation_failed code=V-TEC-10`.
- **Oczekiwana logika**: `status !== 'technical_approved'` → V-TEC-10 (`bom-publish-service.ts:104-111`).
- **Priorytet**: P0

### TEC-143: publishBom — już active → conflict (bez allowAlreadyActive)
- **Kroki**: 1) Active BOM. 2) `publishBom`. 3) conflict.
- **Oczekiwana logika**: `status==='active' && !allowAlreadyActive` → conflict (`bom-publish-service.ts:89-102`).
- **Priorytet**: P1

### TEC-144: publishBom — idempotentny re-publish (allowAlreadyActive)
- **Co sprawdza**: ECO apply-on-close retry: active zwraca ok bez drugiego supersede.
- **Kroki**: 1) Active BOM. 2) `publishBom(allowAlreadyActive=true)`. 3) ok.
- **Oczekiwana logika**: `allowAlreadyActive` → `ok:true, supersededHeaderIds:[]` (`bom-publish-service.ts:90-100`).
- **Priorytet**: P2

### TEC-145: publishBom — pojedyncza active per product (partial-unique)
- **Co sprawdza**: Nie mogą istnieć dwie active dla tego samego product (index).
- **Kroki**: 1) Wymuś współbieżną publikację dwóch wersji. 2) Sprawdź `23505 → conflict 'another active version exists'`.
- **Oczekiwana logika**: `bom_headers_active_version_idx` unique where active (`mig 090:67-69`), obsługa 23505 (`workflow.ts:168`).
- **Priorytet**: P0

### TEC-146: publishBom — product/version mismatch
- **Kroki**: 1) `publishBom` z niezgodnym product/version. 2) `validation_failed`.
- **Oczekiwana logika**: `validation_failed 'product mismatch'/'version mismatch'` (`bom-publish-service.ts:82-87`).
- **Priorytet**: P2

### TEC-147: publishBom — RBAC technical.bom.version_publish
- **Kroki**: 1) User bez permisji. 2) `publishBom`. 3) `forbidden`.
- **Oczekiwana logika**: `BOM_VERSION_PUBLISH_PERMISSION` (`workflow.ts:138`, `bom-publish-service.ts:76`).
- **Priorytet**: P0

### TEC-148: State-machine — zakaz reopen (technical_approved → in_review) [mig 208]
- **Co sprawdza**: Trigger DB blokuje in-place reopen approved.
- **Kroki**: 1) UPDATE bom_headers set status='in_review' where status='technical_approved'. 2) Oczekuj 23514.
- **Oczekiwana logika**: `bom_headers_enforce_status_transition` bez `in_review` w zbiorze approved (`mig 208:39-48`).
- **Priorytet**: P0

### TEC-149: State-machine — zakaz backward active → draft
- **Kroki**: 1) UPDATE active→draft. 2) Oczekuj 23514 "may only terminalize".
- **Oczekiwana logika**: `active → superseded|archived` tylko (`mig 208:44`).
- **Priorytet**: P0

### TEC-150: State-machine — zakaz jumpu draft → superseded
- **Kroki**: 1) UPDATE draft→superseded. 2) Oczekuj 23514.
- **Oczekiwana logika**: draft dozwala `in_review|technical_approved|active|archived`, NIE superseded (`mig 208:41`).
- **Priorytet**: P1

### TEC-151: State-machine — archived terminalny
- **Kroki**: 1) UPDATE archived→cokolwiek. 2) Oczekuj 23514.
- **Oczekiwana logika**: `archived → false` (`mig 208:47`).
- **Priorytet**: P1

### TEC-152: Niezmienność treści approved/active (mig 090)
- **Co sprawdza**: Zmiana product_id/version/lines na active blokowana.
- **Kroki**: 1) UPDATE bom_lines na aktywnym headerze / zmień product_id headera. 2) Oczekuj wyjątku immutability.
- **Oczekiwana logika**: `bom_headers_reject_approved_content_update` + `bom_lines_reject_approved_header_update` (`mig 090`, `mig 355:16-45`).
- **Priorytet**: P0

### TEC-153: yield_pct edytowalny na active (mig 355)
- **Co sprawdza**: Wyjątek od immutability — yield_pct można edytować post-activation.
- **Kroki**: 1) Active BOM. 2) `updateBomYield(96)`. 3) Sprawdź sukces + audyt.
- **Oczekiwana logika**: yield_pct wyłączony z guardu (`mig 355:30-33`); RBAC `npd.handoff.promote`.
- **Priorytet**: P1

## BOM — Clone-on-write / request version edit (`_actions/request-version-edit.ts`, `lib/technical/bom-request-version-edit.ts`, mig 168/479)

### TEC-154: ensureBomVersionEditDraft — clone active → nowy in_review supersedes
- **Co sprawdza**: Dla active/approved tworzy nowy `in_review` v+1 kopiujący linie+co-products, źródło nietknięte.
- **Kroki**: 1) Active v1. 2) `ensureBomVersionEditDraft(v1)`. 3) Sprawdź v2 in_review, supersedes=v1, linie skopiowane (`source='superseded_copy'`).
- **Oczekiwana logika**: `bom_request_version_edit` (`mig 168 §2`, `request-version-edit.ts:55-71`).
- **Priorytet**: P0

### TEC-155: clone-on-write idempotentny (istniejący draft)
- **Co sprawdza**: Drugie wywołanie zwraca `decision='existing'`, nie tworzy duplikatu.
- **Kroki**: 1) `ensureBomVersionEditDraft(v1)` ×2. 2) Sprawdź jeden draft.
- **Oczekiwana logika**: reuse istniejącego `supersedes=src AND status in (draft,in_review)` (`mig 168`, `mig 479`).
- **Priorytet**: P1

### TEC-156: clone-on-write na draft/in_review → invalid_state
- **Co sprawdza**: Clone-on-write tylko dla approved/active.
- **Kroki**: 1) `ensureBomVersionEditDraft(<draft>)`. 2) `invalid_state`.
- **Oczekiwana logika**: guard `['technical_approved','active']` (`request-version-edit.ts:47-53`); DB 23514.
- **Priorytet**: P1

### TEC-157: clone-on-write — serializacja współbieżnych forków (mig 479)
- **Co sprawdza**: Dwa równoległe edit-requesty tego samego source atachują do TEGO SAMEGO draftu.
- **Kroki**: 1) 2 równoległe `ensureBomVersionEditDraft(v1)`. 2) Sprawdź jeden draft (jeden `cloned`, drugi `existing`).
- **Oczekiwana logika**: `pg_advisory_xact_lock(hashtext('technical:bom_version_edit::'||org||'::'||product))` + recheck + exception `unique_violation` fallback (`mig 479`).
- **Priorytet**: P1

### TEC-158: clone-on-write emituje bom.version_submitted raz
- **Kroki**: 1) Clone-on-write. 2) Sprawdź pojedynczy outbox event.
- **Oczekiwana logika**: outbox insert `where not exists` (`mig 168 §2`).
- **Priorytet**: P2

## BOM — Usuwanie wersji (`_actions/delete-bom-version.ts`, `_actions/delete-guard.ts`, `_components/delete-version-modal.tsx`)

### TEC-159: deleteBomVersion — tylko draft
- **Kroki**: 1) Active/approved/superseded. 2) delete. 3) `not_draft`.
- **Oczekiwana logika**: `status !== 'draft'` (`delete-bom-version.ts:71-73`).
- **Priorytet**: P0

### TEC-160: deleteBomVersion — blokada gdy referencjonowana przez snapshot
- **Co sprawdza**: Draft z bom_snapshots nie może być usunięty (osierociłby WO snapshot).
- **Kroki**: 1) Draft z snapshotem. 2) delete. 3) `snapshot_referenced` + snapshotCount.
- **Oczekiwana logika**: count bom_snapshots>0 (`delete-bom-version.ts:88-110`); FK 23503 fallback.
- **Priorytet**: P0

### TEC-161: deleteBomVersion — zakaz usunięcia jedynej wersji
- **Kroki**: 1) FG z 1 wersją draft. 2) delete. 3) `only_version`.
- **Oczekiwana logika**: `versionCount <= 1` (`delete-bom-version.ts:97-100`).
- **Priorytet**: P1

### TEC-162: getVersionDeleteGuard — deletable tylko dla draft + snapshotCount
- **Co sprawdza**: Reader modala zwraca `deletable = (status==='draft')` i licznik snapshotów.
- **Kroki**: 1) Otwórz modal delete dla różnych statusów. 2) Sprawdź flagi.
- **Oczekiwana logika**: (`delete-guard.ts:44-76`).
- **Priorytet**: P2

### TEC-163: deleteBomVersion — audyt bom.version_deleted
- **Kroki**: 1) Usuń draft. 2) Sprawdź audit_events.
- **Oczekiwana logika**: audit_events insert z before_state (`delete-bom-version.ts:132-140`).
- **Priorytet**: P2

## BOM — Diff wersji (`_actions/diff.ts`, `bom/diff/[productId]/page.tsx`)

### TEC-164: diffBom — added/removed/changed linii keyowane po item_id/component_code
- **Co sprawdza**: Diff dwóch wersji poprawnie klasyfikuje linie.
- **Kroki**: 1) v1 (A,B), v2 (A z inną qty, C). 2) diff. 3) A changed(qty), B removed, C added.
- **Oczekiwana logika**: `lineKey = itemId ?? 'code:'+componentCode` (`diff.ts:41-43,78-99`).
- **Priorytet**: P1

### TEC-165: diffBom — percentChange i delta numeric
- **Co sprawdza**: Zmiana ilości liczy delta i %.
- **Kroki**: 1) qty 4→5. 2) Sprawdź delta=1, %=25.
- **Oczekiwana logika**: `percentChange = from===0 ? null : (delta/from*100)` (4dp); `delta` do 6dp (`diff.ts:49-58`). Formuła: `%Δ = (to−from)/from×100`.
- **Priorytet**: P1

### TEC-166: diffBom — zmiany co-products (allocation/byproduct/uom)
- **Kroki**: 1) Zmień allocation co-product między wersjami. 2) diff.
- **Oczekiwana logika**: keyed po `coProductItemId` (`diff.ts:45-46,109-127`).
- **Priorytet**: P2

### TEC-167: diffBom — zmiany nagłówka (yield/status/effectiveFrom)
- **Kroki**: 1) Zmień yield między wersjami. 2) diff.
- **Oczekiwana logika**: header field changes (`diff.ts:61-68`).
- **Priorytet**: P2

## BOM — Snapshots (`boms/snapshots/**`, `lib/technical/bom/snapshot.ts`)

### TEC-168: createBomSnapshot — freeze active BOM przy tworzeniu WO
- **Co sprawdza**: Snapshot mrozi header+lines+co_products active BOM keyed po WO.
- **Kroki**: 1) Active BOM. 2) createBomSnapshot(woId, productId). 3) Sprawdź snapshot_json {header,lines,co_products}, snapshotVersion=1.
- **Oczekiwana logika**: `buildSnapshotJson` mirror detail (`snapshot.ts:159-198`).
- **Priorytet**: P0

### TEC-169: createBomSnapshot — brak active BOM → NO_ACTIVE_BOM
- **Kroki**: 1) FG bez active BOM. 2) createBomSnapshot. 3) `BomSnapshotError NO_ACTIVE_BOM`.
- **Oczekiwana logika**: `resolveActiveBomHeaderId` rzuca (`snapshot.ts:133-153`).
- **Priorytet**: P0

### TEC-170: createBomSnapshot — idempotentny per (org, WO, bom_header)
- **Co sprawdza**: Ponowne wywołanie zwraca istniejący snapshot, nie tworzy drugiego.
- **Kroki**: 1) createBomSnapshot ×2 dla tego samego WO. 2) Jeden snapshot.
- **Oczekiwana logika**: existing-check by (WO, bom_header) (`snapshot.ts:220-232`).
- **Priorytet**: P1

### TEC-171: Snapshot niezmienny — post-edit BOM nie wpływa na WO (ADR-002)
- **Co sprawdza**: Po snapshotcie edycja active BOM (clone-on-write nowej wersji) nie zmienia recepty WO.
- **Kroki**: 1) Snapshot. 2) Publikuj v2. 3) Odczytaj getBomSnapshot(WO) — dalej v1.
- **Oczekiwana logika**: WO czyta wyłącznie snapshot; mig 159 trigger blokuje UPDATE/DELETE snapshotu (`snapshot.ts:23-30`).
- **Priorytet**: P0

### TEC-172: Snapshot — NUMERIC jako exact string (bez float)
- **Kroki**: 1) Snapshot z quantity `0.123456`. 2) Sprawdź string verbatim.
- **Oczekiwana logika**: quantity/allocation_pct/scrap/yield trzymane jako string (`snapshot.ts:18-19`).
- **Priorytet**: P1

### TEC-173: Snapshot — org isolation przy odczycie
- **Kroki**: 1) getBomSnapshot cudzego WO. 2) null/not_found.
- **Oczekiwana logika**: `getBomSnapshot` RLS `org_id = app.current_org_id()` (`snapshot.ts:251-263`).
- **Priorytet**: P1

### TEC-174: Snapshots viewer + diff-snapshot (screen)
- **Co sprawdza**: `boms/snapshots/page.tsx` listuje i diffuje snapshoty.
- **Kroki**: 1) Otwórz listę snapshotów. 2) Wykonaj diff dwóch snapshotów.
- **Oczekiwana logika**: `_actions/list-snapshots.ts`, `diff-snapshot.ts`.
- **Priorytet**: P2

## BOM — Disassembly (`_actions/disassembly.ts`, `_components/disassembly-bom-*.tsx`)

### TEC-175: createDisassemblyBomDraft — 1 input line + ≥1 co-product
- **Co sprawdza**: Struktura disassembly: dokładnie jedna linia wejściowa, ≥1 output.
- **Kroki**: 1) 0 lub 2 linie wejściowe → odmowa. 2) 1 linia + outputs → OK draft.
- **Oczekiwana logika**: `rawLines.length !== 1` / `coProducts.length===0` odmowa (`disassembly.ts:386-390`).
- **Priorytet**: P1

### TEC-176: Disassembly — V-TEC-12 alokacja outputs = 100 ±0.01
- **Co sprawdza**: Suma allocation_pct outputów = 100 z tolerancją 0.01.
- **Kroki**: 1) Outputs sumujące 99.99 → OK. 2) 99 → odmowa.
- **Oczekiwana logika**: `|sum - 100000| > 10` (tysięczne) odmowa (`disassembly.ts:121-150`). Formuła: `Σ allocation_pct ≈ 100 (±0.01)`.
- **Priorytet**: P0

### TEC-177: Disassembly — expected_yield_pct wymagany na co-product
- **Kroki**: 1) Co-product bez expectedYieldPct. 2) Odmowa.
- **Oczekiwana logika**: `normalizeCoProduct` wymaga itemId+allocationPct+expectedYieldPct (`disassembly.ts:449-463`).
- **Priorytet**: P2

### TEC-178: Disassembly — version = max+1 per product, status draft
- **Kroki**: 1) Utwórz 2 disassembly dla tego samego product. 2) Wersje 1,2, status draft.
- **Oczekiwana logika**: (`disassembly.ts:174-198`).
- **Priorytet**: P2

### TEC-179: Disassembly — RBAC + operacja V-TEC-63
- **Kroki**: 1) Bez permisji → forbidden. 2) Nieznana operacja → V-TEC-63.
- **Oczekiwana logika**: `BOM_CREATE_PERMISSION` + `validateBomManufacturingOperationNames` (`disassembly.ts:165-172`).
- **Priorytet**: P2

## Where-used (`where-used/_actions/list-where-used.ts`, `where-used/page.tsx`)

### TEC-180: listWhereUsed — FG używające komponentu (tylko active BOM)
- **Co sprawdza**: Zwraca listę FG, których active BOM zawiera dany component_code.
- **Kroki**: 1) Komponent RM-1 w active BOM FG-A i draft BOM FG-B. 2) where-used(RM-1). 3) Tylko FG-A.
- **Oczekiwana logika**: `ph.status='active' AND ph.item_id IS NOT NULL` (`list-where-used.ts:27-51`).
- **Priorytet**: P1

### TEC-181: where-used — wyklucza self (parent = szukany kod)
- **Kroki**: 1) where-used dla kodu będącego parentem. 2) Brak self w wynikach.
- **Oczekiwana logika**: `ph.item_id <> (select id ... item_code=$1)` (`list-where-used.ts:42-47`).
- **Priorytet**: P2

### TEC-182: where-used — distinct on FG, najnowsza wersja
- **Kroki**: 1) FG z v1 i v2 active-history. 2) Jeden wiersz per FG.
- **Oczekiwana logika**: `distinct on (i.item_code) order by i.item_code, ph.version desc` (`list-where-used.ts:28,48`).
- **Priorytet**: P2

### TEC-183: where-used — pusty/whitespace kod → []
- **Kroki**: 1) where-used('  '). 2) [].
- **Oczekiwana logika**: `if (!code) return []` (`list-where-used.ts:21-22`).
- **Priorytet**: P2

### TEC-184: where-used — org isolation
- **Kroki**: 1) where-used kodu org B jako org A. 2) [].
- **Oczekiwana logika**: RLS `bl.org_id = app.current_org_id()` (`list-where-used.ts:38`).
- **Priorytet**: P1

## Revisions (`revisions/_actions/list-revisions.ts`, `revisions/page.tsx`)

### TEC-185: listTechnicalRevisions — filtry entityType/entityId/search
- **Co sprawdza**: Historia rewizji z widoku `v_technical_revision_history` filtrowana.
- **Kroki**: 1) Filtr entityType='bom'. 2) search po code/title/action. 3) Sprawdź wyniki i limit.
- **Oczekiwana logika**: zod EntityTypes `['item','bom','factory_spec','eco']`, limit ≤200 (`list-revisions.ts:14-21,88-98`).
- **Priorytet**: P1

### TEC-186: revisions — actor resolvowany do name/email (nie uuid)
- **Kroki**: 1) Otwórz historię. 2) Sprawdź nazwy aktorów.
- **Oczekiwana logika**: join `public.users` `coalesce(name,display_name)` (`list-revisions.ts:78-80`).
- **Priorytet**: P2

### TEC-187: revisions — org isolation w widoku i joinie users
- **Kroki**: 1) Historia jako org A. 2) Brak wpisów org B.
- **Oczekiwana logika**: `r.org_id = app.current_org_id()` + `u.org_id = app.current_org_id()` (`list-revisions.ts:85-87`).
- **Priorytet**: P1

### TEC-188: revisions — invalid_input przy złym filtrze
- **Kroki**: 1) entityType='xyz'. 2) `invalid_input`.
- **Oczekiwana logika**: `safeParse` fail → invalid_input (`list-revisions.ts:62-63`).
- **Priorytet**: P2

## WIP-Library (`wip-library/_actions/wip-definition-actions.ts`, `_components/**`)

### TEC-189: saveWipDefinition — clone-on-write przy zmianie treści active
- **Co sprawdza**: Edycja treści active WIP tworzy nowy draft v+1 (supersedes), potem aktywuje i archiwizuje stary (gdy reusable).
- **Kroki**: 1) Active WIP v1 reusable. 2) saveWipDefinition ze zmianą składników. 3) Sprawdź v2 aktywne, v1 archived.
- **Oczekiwana logika**: `cloneOnWrite = writeTarget.status==='active' && contentChanged`; supersede+archive (`wip-definition-actions.ts:182-276`). Formuła: `nextVersion = base + (contentChanged?1:0)`.
- **Priorytet**: P0

### TEC-190: saveWipDefinition — brak zmiany treści → brak bumpa wersji
- **Co sprawdza**: Zapis identycznej treści nie tworzy nowej wersji.
- **Kroki**: 1) Save bez zmian. 2) Wersja bez zmiany.
- **Oczekiwana logika**: `contentChanged` przez JSON canonical compare (`wip-definition-actions.ts:182-185,805-834`).
- **Priorytet**: P1

### TEC-191: saveWipDefinition — SUPERCEDE_CONFLICT przy współbieżnej supersesji
- **Co sprawdza**: Gdy row zarchiwizowany współbieżnie a brak active successor.
- **Kroki**: 1) Zasymuluj współbieżną archiwizację. 2) Save → 409.
- **Oczekiwana logika**: `resolveWipWriteTarget` null → 409 (`wip-definition-actions.ts:172-180,666-685`).
- **Priorytet**: P1

### TEC-192: saveWipDefinition — RBAC create vs edit
- **Kroki**: 1) Save nowej bez create → forbidden. 2) Edit bez edit → forbidden.
- **Oczekiwana logika**: `data.id ? EDIT_PERMISSION : CREATE_PERMISSION` (`wip-definition-actions.ts:164-167`).
- **Priorytet**: P1

### TEC-193: archiveWipDefinition — blokada gdy referencjonowany przez nie-Launched projekty
- **Kroki**: 1) WIP użyty w projekcie current_gate<>'Launched'. 2) archive. 3) `WIP_DEFINITION_IN_USE` 409.
- **Oczekiwana logika**: count distinct projektów (`wip-definition-actions.ts:476-494`).
- **Priorytet**: P1

### TEC-194: acceptWipDefinitionUpdate — re-materializacja active BOM projektu
- **Co sprawdza**: Akceptacja nowej wersji WIP regeneruje active BOM projektu (propagacja).
- **Kroki**: 1) Projekt z active BOM referuje WIP. 2) accept. 3) Sprawdź bomsRegenerated / bomBlockedCode.
- **Oczekiwana logika**: `materializeNpdBom` gdy active BOM istnieje (`wip-definition-actions.ts:446-461`); RBAC `npd.production.write`.
- **Priorytet**: P1

### TEC-195: getWipDefinition — rebase archived/stale id na active successor
- **Co sprawdza**: Otwarcie linku do zarchiwizowanej definicji redirectuje na aktywnego następcę.
- **Kroki**: 1) Otwórz stale id. 2) `resolvedFromId` wskazuje successor.
- **Oczekiwana logika**: `resolveWipReadTarget` (`wip-definition-actions.ts:638-660`).
- **Priorytet**: P2

### TEC-196: WIP where-used panel (referencing projects)
- **Co sprawdza**: Panel pokazuje projekty NPD używające definicji + accepted_version.
- **Kroki**: 1) WIP użyty w projektach. 2) Otwórz panel.
- **Oczekiwana logika**: `loadWhereUsed` join formulation_ingredients (`wip-definition-actions.ts:750-771`); `wip-where-used-panel.tsx`.
- **Priorytet**: P2

### TEC-197: WIP — refresh alergenów kaskadowanych (nie nadpisuje manual_override)
- **Co sprawdza**: Po zmianie składników alergeny WIP itemu odświeżane, ale manual_override zachowany.
- **Kroki**: 1) WIP item z manual_override. 2) Zmień składniki + save. 3) Override zostaje.
- **Oczekiwana logika**: delete `source='cascaded'` + upsert `where source <> 'manual_override'` (`wip-definition-actions.ts:940-974`).
- **Priorytet**: P1

### TEC-198: WIP list/search — reads open, writes gated
- **Co sprawdza**: Lista WIP czytelna dla viewerów (org-scoped), searchWipDefinitions wymaga permisji.
- **Kroki**: 1) Viewer otwiera listę → OK. 2) search bez permisji → forbidden.
- **Oczekiwana logika**: list open (`wip-definition-actions.ts:62-98`); search `hasAnyPermission([create,edit,npd.production.write])` (`:513-516`).
- **Priorytet**: P2

## BOM — Propagacja kosztów (cross-cutting)

### TEC-199: Cost rollup — TYLKO net qty, bez scrap/waste
- **Co sprawdza**: Zmiana kosztu materiału propaguje do rollup jako `Σ(quantity × amount)` bez scrap_pct/waste_pct.
- **Kroki**: 1) BOM z linią qty=2, scrap=10%. 2) Zmień koszt komponentu 5→7. 3) Sprawdź total = 2×7=14 (NIE 2/(1−0.1)×7).
- **Oczekiwana logika**: `sum(bl.quantity * vec.amount)` (`technical/cost/_actions/recipe-cost-rollup-sql.ts:10-14,36-40`). scrap→WO/MRP (mig 393), waste→NPD (mig 427) — nie mieszać.
- **Priorytet**: P0

### TEC-284: RLS org isolation — wszystkie akcje BOM
- **Co sprawdza**: Żadna akcja nie widzi/nie modyfikuje BOM innej org; brak service-role bypass.
- **Kroki**: 1) Jako org A wywołaj approve/publish/delete/line-actions z ID BOM org B. 2) Oczekuj `not_found` (RLS filtruje wiersz).
- **Oczekiwana logika**: każdy statement `org_id = app.current_org_id()`; `loadVersion/loadHeader` zwraca null → not_found (`workflow.ts:45-56`, `line-actions.ts:60-70`).
- **Priorytet**: P0

---
# Część C — Cost / Routings / Tooling (TEC-200…TEC-283)

Wszystkie wartości NUMERIC pozostają stringami (bez JS float) — testy tego pilnują.

## Recipe Cost — roll-up materiałowy (technical/cost, `cost/page.tsx`, `_actions/list-recipe-cost.ts`, `_components/recipe-cost.client.tsx`)

### TEC-200: Roll-up NETTO = Σ(quantity × vec.amount) — dokładny przykład
- **Co sprawdza**: Standardowy koszt materiału to suma NETTO ilości × koszt jednostkowy z `v_item_effective_cost`, bez współczynników strat.
- **Kroki**: 1) FG z aktywnym BOM: linia A qty=`1.5`, vec.amount=`4.0000`; linia B qty=`0.5`, vec.amount=`2.0000`. 2) `getRecipeCost(fgCode)`. 3) Odczytaj `totalMaterialCost` i per-line `lineCost`.
- **Oczekiwana logika**: lineCost A = 1.5×4 = `6.0000`, B = 0.5×2 = `1.0000`, total = `7.0000`. Formuła `sum(bl.quantity * vec.amount)` w NUMERIC (`recipe-cost-rollup-sql.ts:37-41`; line query `list-recipe-cost.ts:228-249`). ŻADNEGO scrap_pct/waste_pct w sumie.
- **Priorytet**: P0

### TEC-201: scrap_pct NIE wchodzi do roll-upu recipe
- **Co sprawdza**: Ustawienie `bom_lines.scrap_pct` nie zmienia standardowego kosztu recipe (scrap dotyczy tylko konsumpcji WO/MRP, mig 393).
- **Kroki**: 1) BOM z linią qty=`2.0`, amount=`5.0000`, scrap_pct=`10`. 2) `getRecipeCost`.
- **Oczekiwana logika**: lineCost = 2×5 = `10.0000` (NIE 2/(1−0.1)×5 = 11.1111). Roll-up ignoruje scrap (`recipe-cost-rollup-sql.ts:10-14`). Osobno WO liczy `qty ÷ (1−scrap/100)`.
- **Priorytet**: P0

### TEC-202: waste_pct NIE wchodzi do roll-upu recipe (rozdział od waterfall NPD)
- **Co sprawdza**: `packaging_components.waste_pct` (D41/mig 427) inflatuje TYLKO packaging w waterfallu NPD.
- **Kroki**: 1) Porównaj `sumPackaging` w waterfall (`compute-waterfall.ts:427-434`) z roll-upem recipe. 2) Recipe używa czystego `quantity × amount`.
- **Oczekiwana logika**: waterfall packaging = `qtyPerBox × costPerUnit × (1 + wastePct/100)` (`compute-waterfall.ts:429-433`); recipe roll-up NIE ma tego czynnika. Test enforce'uje separację dwóch loss-factorów.
- **Priorytet**: P0

### TEC-203: Komponent bez efektywnego kosztu — wykluczony z sumy, widoczny w breakdown
- **Co sprawdza**: Linia BOM, której komponent nie ma `v_item_effective_cost.amount`, nie zeruje totalu, ale pokazuje się jako "uncosted".
- **Kroki**: 1) BOM: linia A kosztowana (amount `3.0000`, qty `2`), linia B bez żadnego kosztu. 2) `getRecipeCost`.
- **Oczekiwana logika**: total = 2×3 = `6.0000` (join z `and vec.amount is not null`, `recipe-cost-rollup-sql.ts:33`); line query LEFT JOIN → B `unitCost=null`, `lineCost=null` (`list-recipe-cost.ts:234-235`). UI badge "uncosted" i KPI Costed `1/2` amber (`recipe-cost.client.tsx:199-204,231-238`).
- **Priorytet**: P0

### TEC-204: Mieszane waluty komponentów → total NULL + marker 'mixed_currency'
- **Co sprawdza**: Brak tabeli FX → suma cross-currency tłumiona do NULL.
- **Kroki**: 1) BOM: linia A `vec.currency='GBP'`, linia B `'EUR'`. 2) `getRecipeCost`.
- **Oczekiwana logika**: `count(distinct vec.currency) > 1` → total = `null`, currency = `mixed_currency` (`recipe-cost-rollup-sql.ts:37-51`). UI total "—" (`numeric.ts:33`).
- **Priorytet**: P0

### TEC-205: Jednolita waluta → currency = max(vec.currency)
- **Kroki**: 1) BOM z 3 liniami wszystkie `EUR`. 2) `getRecipeCost`.
- **Oczekiwana logika**: `count(distinct)=1` → total realny, currency = `EUR` (`recipe-cost-rollup-sql.ts:46-50`).
- **Priorytet**: P1

### TEC-206: listCostedProducts — DISTINCT ON item_code, najnowszy nie-archived BOM
- **Kroki**: 1) Item z BOM v1(active) i v2(draft) oraz item z BOM archived-only. 2) `listCostedProducts`.
- **Oczekiwana logika**: `distinct on (i.item_code) ... order by i.item_code, bh.version desc`, `status <> 'archived'` (`list-recipe-cost.ts:122-134`). Item z tylko-archived BOM niewidoczny.
- **Priorytet**: P1

### TEC-207: NPD↔Technical shortcut — link tylko gdy istnieje npd_projects.product_code
- **Kroki**: 1) Produkt zmapowany do npd_projects i drugi bez. 2) `listCostedProducts` → `npdProjectId`. 3) UI dla obu.
- **Oczekiwana logika**: `distinct on (np.product_code) ... order by np.created_at desc` (`list-recipe-cost.ts:143-153`); null → brak linku (`recipe-cost.client.tsx:361-371`).
- **Priorytet**: P2

### TEC-208: getRecipeCost — pusty productCode / brak BOM
- **Kroki**: 1) `getRecipeCost('')` → error. 2) `getRecipeCost(kodBezBOM)` → empty.
- **Oczekiwana logika**: pusty trim → `{ok:false,state:'error'}` (`list-recipe-cost.ts:174-176`); brak header → `{ok:true,state:'empty', cost{totalMaterialCost:null, bomStatus:'none'}}` (`list-recipe-cost.ts:210-226`).
- **Priorytet**: P1

### TEC-209: Export cost sheet CSV — wartości NUMERIC verbatim + wiersz total
- **Kroki**: 1) RecipeCost z 2 liniami. 2) `buildCostSheetCsv(cost, copy)`.
- **Oczekiwana logika**: wartości `l.quantity`, `l.unitCost`, `l.lineCost` verbatim (bez re-parse do float); wiersz total z `cost.totalMaterialCost ?? ''` (`recipe-cost.client.tsx:89-110`). Przycisk disabled gdy 0 linii (`:341`).
- **Priorytet**: P2

### TEC-210: Recompute modal = re-run live roll-upu (bez fałszywego snapshotu)
- **Kroki**: 1) Otwórz modal `TEC-COST-RECOMPUTE`. 2) Zmień cost_per_kg komponentu w DB. 3) Confirm.
- **Oczekiwana logika**: `load(selected)` ponownie wywołuje `getRecipeCost` — koszt liczony przy każdym load (`recipe-cost.client.tsx:416-423`). Brak zapisanego snapshotu.
- **Priorytet**: P2

### TEC-211: Roll-up rozwiązuje WIP przez v_item_effective_cost
- **Co sprawdza**: Komponent WIP/intermediate pobiera koszt z `v_item_effective_cost` (cost_history→supplier→list→wip_computed z ACTIVE BOM + labour, mig 491).
- **Kroki**: 1) BOM FG z komponentem WIP bez cost_history/supplier/list, ale z aktywnym BOM WIP + labour. 2) `getRecipeCost`.
- **Oczekiwana logika**: `vec.amount` dla WIP = wip_computed; wchodzi do `quantity × amount` (`recipe-cost-rollup-sql.ts:30`).
- **Priorytet**: P1

### TEC-212: Dopasowanie komponentu po item_id lub component_code
- **Kroki**: 1) BOM z linią item_id-based i code-based. 2) `getRecipeCost`.
- **Oczekiwana logika**: `(bl.item_id is not null and ci.id=bl.item_id) or (bl.item_id is null and ci.item_code=bl.component_code)` (`recipe-cost-rollup-sql.ts:19-24`). Obie linie kosztowane.
- **Priorytet**: P1

## Cost History + Cost Item Picker (technical/cost/history, `_actions/list-cost-history.ts`, `list-cost-items.ts`, `_components/cost-manager.client.tsx`)

### TEC-213: listCostHistory — kolejność effective_from DESC, created_at DESC
- **Kroki**: 1) Item z 3 rollami. 2) `listCostHistory({itemId})`.
- **Oczekiwana logika**: `order by effective_from desc, created_at desc` (`list-cost-history.ts:80`).
- **Priorytet**: P1

### TEC-214: listCostHistory — gate na technical.cost.edit (forbidden bez uprawnienia)
- **Co sprawdza**: Read historii wymaga `technical.cost.edit` (brak osobnego cost.read).
- **Kroki**: 1) User bez uprawnienia. 2) `listCostHistory`.
- **Oczekiwana logika**: `{ok:false, error:'forbidden'}` (`list-cost-history.ts:65`; `COST_EDIT_PERMISSION='technical.cost.edit'` `shared.ts:33`).
- **Priorytet**: P0

### TEC-215: listCostHistory — invalid_input dla nie-UUID itemId
- **Kroki**: 1) `listCostHistory({itemId:'abc'})`.
- **Oczekiwana logika**: `ListCostHistoryInput = z.object({itemId: uuid()})` fail → `invalid_input` (`list-cost-history.ts:57-58`, `shared.ts:123`).
- **Priorytet**: P1

### TEC-216: Δ% w historii — dokładna arytmetyka decimal-string (bez float)
- **Co sprawdza**: `deltaPctExact(prev,next)` liczy (next−prev)/prev×100 do 1 dp na BigInt.
- **Kroki**: 1) prev=`10.00`, next=`12.50`. 2) prev=`12.00`, next=`11.40`. 3) prev=`0`, next=`5`.
- **Oczekiwana logika**: (1) `+25.0`; (2) `-5.0`; (3) `null` → "—" (`numeric.ts:62-79`). Kolor: dodatnia red-700, ujemna green-700 (`cost-manager.client.tsx:413-418,432-433`).
- **Priorytet**: P0

### TEC-217: formatCost — rounding half-up, trailing zeros, null
- **Kroki**: 1) `formatCost("12.3400")`. 2) `formatCost("12.345")`. 3) `formatCost(null)`. 4) `formatCost("0.1")`.
- **Oczekiwana logika**: (1) `12.34`; (2) `12.35` (half-up BigInt-scaled, `numeric.ts:41-50`); (3) `—`; (4) `0.10`. Żadnego `Number()` na koszcie.
- **Priorytet**: P1

### TEC-218: Sparkline — min/max, ≥2 punkty
- **Kroki**: 1) Historia 1 wiersz → brak sparkline. 2) 4 wiersze → sparkline.
- **Oczekiwana logika**: `costs.length < 2 → null` (`cost-manager.client.tsx:192-193`); etykiety przez `formatCost` (`:214-221`).
- **Priorytet**: P2

### TEC-219: Read-only notice gdy brak canEdit
- **Kroki**: 1) `listCostItems` z canEdit=false. 2) Render CostManager.
- **Oczekiwana logika**: brak "Edit cost" (`cost-manager.client.tsx:501-505`), amber readOnlyNotice (`:547-551`); gate `hasPermission(COST_EDIT_PERMISSION)` (`list-cost-items.ts:61`).
- **Priorytet**: P1

### TEC-220: listCostItems — sortowanie po item_code, cost_per_kg jako string
- **Kroki**: 1) Kilka itemów, jeden bez cost_per_kg. 2) `listCostItems`.
- **Oczekiwana logika**: `order by item_code asc`, `cost_per_kg::text` (`list-cost-items.ts:56-59`); null → `costPerKg:null`.
- **Priorytet**: P2

## Cost Posting / Ledger (`_actions/post-cost.ts`, `write-cost-ledger.ts`, `shared.ts`)

### TEC-221: postCost happy path — insert history + denormalizacja items.cost_per_kg
- **Kroki**: 1) User z `technical.cost.edit`. 2) `postCost({itemId, costPerKg:'5.5000', source:'manual', currency:'GBP', notes:'x'})`.
- **Oczekiwana logika**: insert `item_cost_history` source=manual (`write-cost-ledger.ts:197-204`); `becomesActive=true` → `update items set cost_per_kg=5.5000` (`:208-216`); audit `item_cost.recorded` (`:218-234`); revalidate paths (`post-cost.ts:64-67`).
- **Priorytet**: P0

### TEC-222: V-TEC-50 — koszt ujemny odrzucony (zod + CHECK)
- **Kroki**: 1) `postCost({costPerKg:'-1'})`. 2) Bezpośredni insert ujemnego → CHECK.
- **Oczekiwana logika**: zod `CostPerKgInput` regex `^\d+(\.\d+)?$` fail → `invalid_input` (`shared.ts:85-90`); DB `cost_per_kg_nonnegative_check` → 23514 → `invalid_input` (`post-cost.ts:72`).
- **Priorytet**: P0

### TEC-223: V-TEC-51 — effective_from w przyszłości odrzucony
- **Kroki**: 1) `postCost({effectiveFrom: jutro})`.
- **Oczekiwana logika**: `input.effectiveFrom > today` → `invalid_input 'effective_from must be <= today (V-TEC-51)'` (`post-cost.ts:49-54`). Porównanie stringów kalendarzowych.
- **Priorytet**: P0

### TEC-224: V-TEC-52 — waluta musi być ISO 4217
- **Kroki**: 1) `postCost({currency:'zz'})`. 2) `postCost({currency:'gbp'})`.
- **Oczekiwana logika**: `.length(3)` + `isIso4217Currency` (`shared.ts:96-102`); 'gbp'→'GBP'; 'zz'/'ZZZ' → invalid_input. Default 'GBP' (`:103`).
- **Priorytet**: P1

### TEC-225: V-TEC-53 — zmiana >20% (manual) wymaga approvera
- **Kroki**: 1) current=`10.0000`. 2) `postCost({costPerKg:'13.0000', source:'manual'})` (Δ=30%).
- **Oczekiwana logika**: `abs(13−10)/10 = 0.30 > 0.20` w SQL NUMERIC → `{ok:false, error:'approver_required'}` (`write-cost-ledger.ts:150-160`; `HIGH_VARIANCE_RATIO='0.20'` `shared.ts:46`). UI ujawnia pole approver (`cost-manager.client.tsx:285`).
- **Priorytet**: P0

### TEC-226: V-TEC-53 — approver dostarczony przepuszcza zmianę >20%
- **Kroki**: 1) current=`10`, `postCost({costPerKg:'13', source:'manual', approverUserId: uuid})`.
- **Oczekiwana logika**: `!input.approverUserId` fałszywy → guard pominięty, insert wykonany (`write-cost-ledger.ts:150`).
- **Priorytet**: P0

### TEC-227: V-TEC-53 — d365_sync i variance_roll BYPASS guardu
- **Kroki**: 1) current=`10`, `postCost({costPerKg:'20', source:'d365_sync'})`. 2) to samo `variance_roll`.
- **Oczekiwana logika**: `APPROVER_GUARDED_SOURCES = {manual, supplier_update}` (`shared.ts:42`); d365_sync/variance_roll → guard pominięty (`write-cost-ledger.ts:150`).
- **Priorytet**: P0

### TEC-228: V-TEC-53 — brak aktywnego kosztu → brak guardu
- **Kroki**: 1) Item bez historii. 2) `postCost({costPerKg:'999', source:'manual'})`.
- **Oczekiwana logika**: `item.current_cost !== null` fałszywy → guard pominięty (`write-cost-ledger.ts:150`).
- **Priorytet**: P1

### TEC-229: V-TEC-53 — granica dokładnie 20% przepuszcza (ostra nierówność)
- **Kroki**: 1) current=`10.0000`, `postCost({costPerKg:'12.0000', source:'manual'})` (Δ=20.0%).
- **Oczekiwana logika**: `0.20 > 0.20` = false → insert bez approvera (`write-cost-ledger.ts:152-156`). Test boundary.
- **Priorytet**: P1

### TEC-230: postCost — gate forbidden bez technical.cost.edit
- **Kroki**: 1) User bez cost.edit. 2) `postCost(...)`.
- **Oczekiwana logika**: `{ok:false, error:'forbidden'}` (`post-cost.ts:60`).
- **Priorytet**: P0

### TEC-231: postCost — not_found dla nieistniejącego / cross-org itemId
- **Kroki**: 1) `postCost({itemId: uuidInnejOrg})`.
- **Oczekiwana logika**: `select ... where org_id=app.current_org_id() and id=$1` 0 rows → `not_found` (`write-cost-ledger.ts:132-148`).
- **Priorytet**: P0

### TEC-232: Backdated effective_from — zamknięcie poprzedniego wiersza (interval surgery)
- **Kroki**: 1) Roll1 effective_from=2026-01-01 (open). 2) Roll2 effective_from=2026-06-01.
- **Oczekiwana logika**: open_from < effDate → `closeHistoryRowAt` ustawia `effective_to = greatest(effDate-1day, effective_from)` (`write-cost-ledger.ts:112-119,167-169`); nowy wiersz becomesActive (`:188-195`). Dokładnie jeden open row.
- **Priorytet**: P1

### TEC-233: Backdated wstawienie MIĘDZY istniejące wiersze — becomesActive=false
- **Kroki**: 1) Roll na 2026-06-01 (open). 2) Roll backdated 2026-03-01.
- **Oczekiwana logika**: `next_from=2026-06-01` istnieje → `effective_to = next_from - 1day`, `becomesActive=false` → NIE aktualizuje `items.cost_per_kg` (`write-cost-ledger.ts:188-216`).
- **Priorytet**: P1

### TEC-234: Ponowny roll dokładnie na containing_from — usunięcie duplikatu
- **Kroki**: 1) Roll na 2026-05-01. 2) Kolejny roll na 2026-05-01.
- **Oczekiwana logika**: `containing_from === effDate` → DELETE containing (`write-cost-ledger.ts:179-186`), potem insert nowego. Brak overlapu.
- **Priorytet**: P2

### TEC-235: Advisory lock serializuje współbieżne zapisy per org/item
- **Kroki**: 1) 2 równoległe postCost na ten sam itemId. 2) Invariant: dokładnie 1 wiersz z effective_to IS NULL.
- **Oczekiwana logika**: `pg_advisory_xact_lock(hashtext(org::item::costledger))` (`write-cost-ledger.ts:50-55,164`).
- **Priorytet**: P1

### TEC-236: Audit log zapisany z before/after state
- **Kroki**: 1) `postCost(...)`. 2) Sprawdź audit_log.
- **Oczekiwana logika**: insert `resource_type='item_cost', action='item_cost.recorded', before_state={costPerKg: old}` (`shared.ts:151-163`, `write-cost-ledger.ts:218-234`). Brak outbox event (tylko audit, `shared.ts:134-139`).
- **Priorytet**: P2

### TEC-237: Koszt jako exact decimal string — brak float roundingu end-to-end
- **Kroki**: 1) `postCost({costPerKg:'0.1000'})` po current `0.2000`. 2) Sprawdź porównanie i zapis.
- **Oczekiwana logika**: string do zod (nie float, `shared.ts:86-87`), bind `$2::numeric` (`write-cost-ledger.ts:201`), porównanie >20% w SQL NUMERIC (`:152-156`).
- **Priorytet**: P1

## Portfolio Cost (technical/cost/portfolio, `portfolio/_actions/list-portfolio-cost.ts`) — decyzja FG-only

### TEC-238: Portfolio listuje TYLKO FG (item_type='fg')
- **Kroki**: 1) Org z FG, WIP i RM (każdy z BOM). 2) `listPortfolioCost`.
- **Oczekiwana logika**: `where i.item_type='fg'` (`list-portfolio-cost.ts:53-54`). WIP/RM nieobecne. Poprawność WIP jest w recipe BOM total (`recipe-cost-rollup-sql.ts:6-8`).
- **Priorytet**: P0

### TEC-239: Portfolio roll-up per najnowszy nie-archived BOM (latest_bom CTE)
- **Kroki**: 1) FG z BOM v1(superseded), v2(active). 2) `listPortfolioCost`.
- **Oczekiwana logika**: CTE `distinct on (i.item_code) ... order by bh.version desc`, `status<>'archived'` (`list-portfolio-cost.ts:31-45`); total = `portfolioMaterialTotalSql` (`recipe-cost-rollup-sql.ts:63-69`).
- **Priorytet**: P1

### TEC-240: Portfolio — FG bez BOM → total NULL
- **Kroki**: 1) FG bez żadnego BOM. 2) `listPortfolioCost`.
- **Oczekiwana logika**: LEFT JOIN latest_bom → `total_recipe_cost:null` (`list-portfolio-cost.ts:51,58-66`).
- **Priorytet**: P1

### TEC-241: Portfolio — mieszane waluty → total NULL (podwójny guard w mapowaniu)
- **Kroki**: 1) FG z BOM mieszającym GBP+EUR. 2) `listPortfolioCost`.
- **Oczekiwana logika**: SQL null gdy >1 currency; mapowanie: `total == null || currency === 'mixed_currency' ? null : total` (`list-portfolio-cost.ts:61-64`, `recipe-cost-rollup-sql.ts:63-77`).
- **Priorytet**: P0

### TEC-242: Portfolio — błąd ładowania zwraca pustą listę (graceful)
- **Kroki**: 1) Wymuś błąd query. 2) `listPortfolioCost`.
- **Oczekiwana logika**: catch → `console.error` + `return []` (`list-portfolio-cost.ts:68-73`).
- **Priorytet**: P2

## D365 Cost Import (technical/costs/d365-import)

### TEC-243: Legacy /technical/costs/d365-import → redirect do settings (locale-aware)
- **Kroki**: 1) GET `/{locale}/technical/costs/d365-import`.
- **Oczekiwana logika**: `redirect('/{locale}/settings/integrations/d365/cost-import')`, zachowuje locale (`costs/d365-import/page.tsx:22-23`). `dynamic='force-dynamic'`.
- **Priorytet**: P2

### TEC-244: D365 cost import — realna walidacja w settings/integrations/d365/cost-import
- **Kroki**: 1) Otwórz realny ekran importu. 2) Zweryfikuj walidację wejścia importu D365.
- **Oczekiwana logika**: powierzchnia w `(admin)/settings/integrations/d365/cost-import/_actions/*`. Import zapisuje z `source='d365_sync'` (bypass V-TEC-53, patrz TEC-227). Pełne testy importu poza zakresem technical — patrz Niepewności.
- **Priorytet**: P1

## Routings — CRUD (technical/routings, `_actions/create-routing.ts`, `update-routing.ts`, `approve-routing.ts`, `list-routings.ts`, `list-routing-items.ts`, `shared.ts`, `lib/technical/routing/service.ts`)

### TEC-245: createRouting happy path — draft + operacje w jednej transakcji + auto-wersja
- **Kroki**: 1) User z `technical.bom.create`. 2) `createRouting({itemId, operations:[op1,op2]})` bez version.
- **Oczekiwana logika**: `max(version)+1` (`create-routing.ts:100-108`); header status='draft' + wszystkie ops w tej samej tx (`:121-156`); audit `routing.created` (`:158-165`).
- **Priorytet**: P0

### TEC-246: V-TEC-60 — op_no ciągłe od 1, bez luk/duplikatów
- **Kroki**: 1) ops z opNo [1,3]. 2) [1,1]. 3) [2,3].
- **Oczekiwana logika**: sort + `sorted[i].opNo !== i+1` → `v_tec_60_sequence_gap` (`shared.ts:167-177`). Wszystkie 3 fail.
- **Priorytet**: P0

### TEC-247: V-TEC-61 — każda operacja musi mieć line_id
- **Kroki**: 1) op bez lineId → zod fail. 2) pusty lineId → guard.
- **Oczekiwana logika**: `RoutingOperationInput.lineId: uuid()` (`shared.ts:85`); `!op.lineId → v_tec_61_no_resource` (`shared.ts:180-186`).
- **Priorytet**: P0

### TEC-248: V-TEC-62 — run_time_per_unit_sec > 0 dla operacji produkcyjnych
- **Kroki**: 1) isProduction=true, runTime=null → fail. 2) runTime=`0` → fail. 3) isProduction=false, runTime=null → OK.
- **Oczekiwana logika**: `op.isProduction && (rt==null || Number(rt)<=0) → v_tec_62_zero_run_time` (`shared.ts:189-198`); isProduction default true (`:93`).
- **Priorytet**: P0

### TEC-249: V-TEC-63 — manufacturing_operation_name musi istnieć w referencji (DB lookup)
- **Kroki**: 1) op z nazwą nieobecną w referencji org. 2) op z nazwą nieaktywną.
- **Oczekiwana logika**: `findUnknownOperationName` query `where is_active=true and operation_name=any(...)` (`shared.ts:212-231`); nieznana → `v_tec_63_unknown_operation` (`create-routing.ts:80-90`). is_active=false = nieznana.
- **Priorytet**: P0

### TEC-250: V-TEC-64 — wszystkie linie operacji z jednego site
- **Kroki**: 1) 2 ops z liniami różnych site_id → fail. 2) site-assigned + org-wide → fail. 3) wszystkie org-wide → OK (canonicalSiteId=null).
- **Oczekiwana logika**: `nonNullSites.size>1` lub mix → `v_tec_64_cross_site_lines` (`shared.ts:273-288`). Nieznaleziona linia (cross-org RLS) → count mismatch → v_tec_64 (`:262-268`).
- **Priorytet**: P0

### TEC-251: createRouting — atomowość: failure nie zostawia partial routingu
- **Kroki**: 1) createRouting gdzie druga operacja narusza constraint. 2) Sprawdź brak header row.
- **Oczekiwana logika**: header + ops w tej samej tx (`create-routing.ts:121-156`); 23503 → invalid_input, rollback (`:174-176`).
- **Priorytet**: P0

### TEC-252: createRouting — konflikt unikalności (item+version) → already_exists
- **Kroki**: 1) createRouting z jawnym version już istniejącym.
- **Oczekiwana logika**: 23505 `routings_org_item_version_unique` → `already_exists` (`create-routing.ts:171-172`).
- **Priorytet**: P1

### TEC-253: createRouting — gate forbidden / not_found item
- **Kroki**: 1) Bez uprawnienia → forbidden. 2) itemId spoza org → not_found.
- **Oczekiwana logika**: `hasPermission(ROUTING_WRITE_PERMISSION='technical.bom.create')` (`create-routing.ts:69`, `shared.ts:36`); item RLS 0 rows → not_found (`:72-76`).
- **Priorytet**: P0

### TEC-254: RBAC — routingi reużywają technical.bom.* (brak technical.routing.*)
- **Kroki**: 1) User z bom.create bez bom.approve → create/update OK, approve forbidden. 2) Z bom.approve → approve/publish OK.
- **Oczekiwana logika**: `ROUTING_WRITE_PERMISSION='technical.bom.create'`, `ROUTING_APPROVE_PERMISSION='technical.bom.approve'` (`shared.ts:36-37`).
- **Priorytet**: P1

### TEC-255: updateRouting — tylko draft edytowalny; approved/active/superseded → invalid_state
- **Kroki**: 1) updateRouting na routingu status='approved'.
- **Oczekiwana logika**: `routing.status !== 'draft' → invalid_state` (`update-routing.ts:76-78`). `for update` lock (`:66-71`).
- **Priorytet**: P0

### TEC-256: updateRouting — atomowa wymiana zestawu operacji + rewalidacja V-TEC
- **Kroki**: 1) updateRouting z poprawnym zestawem ops. 2) z zestawem naruszającym V-TEC-60.
- **Oczekiwana logika**: `validateOperationSet` przed tx (`update-routing.ts:57-58`); DELETE ops draftu + re-insert (`:99-130`); site update (`:132-140`).
- **Priorytet**: P0

### TEC-257: approveRouting — draft→approved, records approved_by/at
- **Kroki**: 1) approveRouting na draft. 2) na już-approved → invalid_state.
- **Oczekiwana logika**: `status='draft'` wymagane (`approve-routing.ts:58-60`); update `set status='approved', approved_by, approved_at=now() where status='draft'` (`:92-101`); site scope check (`:62-73`).
- **Priorytet**: P0

### TEC-258: publishRouting — approved→active, supersede dotychczasowego active
- **Kroki**: 1) Item ma routing v1 active. 2) publishRouting v2 (approved).
- **Oczekiwana logika**: `update routings set status='superseded', effective_to=current_date where item_id=... and status='active' and id<>$2` (`approve-routing.ts:77-87`); potem v2→active. Dokładnie jeden active per item.
- **Priorytet**: P0

### TEC-259: publishRouting — tylko approved publikowalny
- **Kroki**: 1) publishRouting na draft.
- **Oczekiwana logika**: `from='approved'`; draft → invalid_state (`approve-routing.ts:58-60,149-151`).
- **Priorytet**: P1

### TEC-260: approve/publish — V-TEC-64 na poziomie DB CHECK mapowane
- **Kroki**: 1) Wymuś naruszenie cross-site przy approve.
- **Oczekiwana logika**: 23514 z message `routing_cross_site_lines`|`routing_operations_immutable` → `v_tec_64_cross_site_lines` (`approve-routing.ts:127-136`).
- **Priorytet**: P2

### TEC-261: listRoutings — wersje DESC z agregacją operacji i operationCount
- **Kroki**: 1) Item z v1,v2. 2) `listRoutings({itemId})`.
- **Oczekiwana logika**: `order by r.version desc`; operations = jsonb_agg order by op_no, numeric jako `::text` (`list-routings.ts:78-111`). Gate bom.create.
- **Priorytet**: P1

### TEC-262: listRoutingItems — items/lines/opNames + flagi uprawnień + graceful absence
- **Kroki**: 1) Org bez production_lines. 2) `listRoutingItems`.
- **Oczekiwana logika**: production_lines `status='active'` z `.catch(()=>{rows:[]})` (`list-routing-items.ts:58-64`); operationNames też catch (`:65-71`); limity 500/200 (`:41-42`). canWrite/canApprove (`:72-73`).
- **Priorytet**: P1

### TEC-263: service.ts re-eksportuje walidatory routingu (stabilny entry point)
- **Kroki**: 1) Import z `lib/technical/routing/service.ts` i użycie validateOperationSet.
- **Oczekiwana logika**: re-export z `routings/_actions/shared` (`service.ts:18-27`). Testy i akcje dzielą jedną implementację.
- **Priorytet**: P2

## Routing Cost Preview (`_actions/cost-preview.ts`, `cost-preview-shared.ts`)

### TEC-264: Cost preview — formuła per-op + dokładny przykład
- **Kroki**: 1) Op: setup=30min, run=10sec, rate=60/h. 2) `routingCostPreview({routingId, volume:100})`.
- **Oczekiwana logika**: **FORMUŁY**: setup = 30/60×60 = `30.00`; run = (10×100)/3600×60 = `16.67`; op = `46.67` (`cost-preview.ts:111-117`). Round 2 dp.
- **Priorytet**: P0

### TEC-265: Cost preview — stawka z crew = Σ(headcount × labor_rates.rate_per_hour)
- **Kroki**: 1) crew=[{operator,2},{lead,1}], labor_rates operator=`10`, lead=`20` (GBP). 2) preview volume=100, run=36sec, setup=0.
- **Oczekiwana logika**: rate = 2×10 + 1×20 = `40`; run = 36×100/3600×40 = `40.00` (`cost-preview.ts:84-103,112`). labor_rates filtr `currency='GBP' and effective_from<=current_date order by effective_from desc limit 1` (`:96-101`).
- **Priorytet**: P0

### TEC-266: Cost preview — fallback do legacy cost_per_hour gdy crew puste
- **Kroki**: 1) Op bez crew, cost_per_hour=`50`. 2) Op bez crew, cost_per_hour=null.
- **Oczekiwana logika**: `when crew len>0 then crew_rate when cost_per_hour not null then cost_per_hour else 0` (`cost-preview.ts:75-82`). Przypadek 2 → koszty 0.00.
- **Priorytet**: P1

### TEC-267: Cost preview — volume wymagany i > 0
- **Kroki**: 1) bez volume. 2) volume='0'. 3) '-5'. 4) 'abc'.
- **Oczekiwana logika**: `refine(regex && Number(v)>0)` → invalid_input (`cost-preview-shared.ts:17-22`). Wszystkie 4 fail.
- **Priorytet**: P0

### TEC-268: Cost preview — cross-org routingId → not_found (RLS)
- **Kroki**: 1) preview z routingId innej org.
- **Oczekiwana logika**: `select id from routings where org_id=app.current_org_id() and id=$1` 0 rows → not_found (`cost-preview.ts:60-64`).
- **Priorytet**: P0

### TEC-269: Cost preview — total sumowany w SQL (nie float-sum zaokrąglonych per-op)
- **Kroki**: 1) Routing z 3 ops z .xx5 rounding. 2) preview; porównaj total vs ręczna suma wyświetlonych per-op.
- **Oczekiwana logika**: osobne query `round(coalesce(sum(exact_op),0),2)` (`cost-preview.ts:161-165`; komentarz `:123-124`). Chroni przed akumulacją błędu zaokrągleń.
- **Priorytet**: P1

### TEC-270: Cost preview — READ-ONLY (brak efektów ubocznych)
- **Kroki**: 1) preview. 2) Sprawdź brak zmian w routing_operations/routings/audit_log.
- **Oczekiwana logika**: tylko SELECT-y (`cost-preview.ts:60-167`); gate `technical.bom.create` (`:57`).
- **Priorytet**: P1

### TEC-271: Cost preview — gate forbidden bez technical.bom.create
- **Kroki**: 1) User bez bom.create. 2) preview.
- **Oczekiwana logika**: `{ok:false, error:'forbidden'}` (`cost-preview.ts:57`).
- **Priorytet**: P1

### TEC-272: Cost preview — operacja bez run_time/setup → coalesce 0
- **Kroki**: 1) Op setup_time_min=null, run_time=null. 2) preview.
- **Oczekiwana logika**: `coalesce(setup_time_min,0)`, `coalesce(run_time_per_unit_sec,0)` → op_cost `0.00` (`cost-preview.ts:111-117`). Bez NULL propagacji.
- **Priorytet**: P2

## Tooling / Equipment Setup (technical/tooling, `_actions/list-tooling-setups.ts`, `_components/tooling-list.client.tsx`, `_actions/shared.ts`)

### TEC-273: listToolingSetups — derived z routing_operations z line_id (brak osobnej tabeli)
- **Kroki**: 1) Routing z op1(line_id set) i op2(line_id null). 2) `listToolingSetups`.
- **Oczekiwana logika**: `where ro.line_id is not null` → tylko op1 (`list-tooling-setups.ts:92-93`); join items+production_lines; `order by item_code asc, version desc, op_no asc` (`:94`). resourceKind='line'.
- **Priorytet**: P1

### TEC-274: Tooling — canWrite z technical.bom.create; brak invented storage
- **Kroki**: 1) User bez bom.create → canWrite=false. 2) Z bom.create → true.
- **Oczekiwana logika**: `TOOLING_WRITE_PERMISSION='technical.bom.create'` (`tooling/_actions/shared.ts:23`); `hasPermission` (`list-tooling-setups.ts:96`).
- **Priorytet**: P1

### TEC-275: Tooling — read-only; Create CTA nawiguje do routingów, gated
- **Kroki**: 1) canWrite=false → brak CTA. 2) canWrite=true → link routingsHref.
- **Oczekiwana logika**: `canWrite ? <Link href={routingsHref}> : null` (`tooling-list.client.tsx:113-117`). Brak mutacji client-trusted.
- **Priorytet**: P1

### TEC-276: Tooling — filtr wyszukiwania (opCode/opName/resource/itemCode)
- **Kroki**: 1) Setups z różnymi kodami. 2) Wpisz fragment resourceName.
- **Oczekiwana logika**: filter `includes(q)` po opCode/opName/resourceCode/resourceName/itemCode (`tooling-list.client.tsx:83-92`); pusta lista → noMatches.
- **Priorytet**: P2

### TEC-277: Tooling — status mapuje na cykl życia routingu (badge tone)
- **Kroki**: 1) Setup z routingu active vs superseded. 2) Render.
- **Oczekiwana logika**: `STATUS_TONE` draft→gray, approved→blue, active→green, superseded→amber (`tooling-list.client.tsx:50-55,174`). routingStatus z `list-tooling-setups.ts:111`.
- **Priorytet**: P2

### TEC-278: Tooling — cost_per_hour NUMERIC verbatim, 4 dp; null → "—"
- **Kroki**: 1) op cost_per_hour=`12.5000`. 2) null.
- **Oczekiwana logika**: `formatCostPerHour` → `12.5000` (toFixed(4)), null → `—` (`tooling-list.client.tsx:57-61`). Uwaga: `Number(value).toFixed(4)` — jedyne miejsce z float na koszcie w module (patrz Niepewności).
- **Priorytet**: P2

## Cost/Routings/Tooling — przekrojowe

### TEC-279: Org isolation — każda akcja scoped app.current_org_id()
- **Kroki**: 1) Org A tworzy routing/koszt. 2) Jako org B wywołaj list/get/preview/post na ID z org A.
- **Oczekiwana logika**: wszystkie query mają `org_id = app.current_org_id()`; cross-org → 0 rows → not_found/empty. Brak service-role bypass (withOrgContext + RLS wszędzie).
- **Priorytet**: P0

### TEC-280: Stany UI — loading/empty/error/permission-denied/populated
- **Kroki**: 1) Symuluj każdy stan (loading, brak danych, błąd query, brak uprawnień, dane) na cost history/recipe/tooling.
- **Oczekiwana logika**: CostManager (`cost-manager.client.tsx:516-545`); RecipeCost (`recipe-cost.client.tsx:384-400`); state='error' z catch we wszystkich loaderach.
- **Priorytet**: P1

### TEC-281: Recipe cost — zero-qty linia
- **Kroki**: 1) BOM linia qty=`0`, amount=`5`. 2) getRecipeCost.
- **Oczekiwana logika**: lineCost = 0×5 = `0.0000`; pct=0 gdy total>0 (`recipe-cost.client.tsx:216`). Bez dzielenia przez zero.
- **Priorytet**: P2

### TEC-282: Recipe cost — total=0 → paski breakdown 0% (brak dzielenia przez zero)
- **Kroki**: 1) BOM gdzie wszystkie komponenty uncosted → total null. 2) Render CostView.
- **Oczekiwana logika**: `totalNum>0 && lineCost!=null ? (lineNum/totalNum)*100 : 0` (`recipe-cost.client.tsx:216`); KPI Costed 0/N amber.
- **Priorytet**: P2

### TEC-283: Currency conversion — brak tabeli FX potwierdzony (żaden roll-up nie konwertuje)
- **Kroki**: 1) Grep implementacji roll-up. 2) BOM 2 waluty → potwierdź null a nie suma po kursie.
- **Oczekiwana logika**: brak FX (`recipe-cost-rollup-sql.ts:2-3`); mixed → null (TEC-204/241). Enforce brak ukrytej konwersji.
- **Priorytet**: P1

---
# Część D — Allergens / Nutrition / Shelf-life / Sensory / Lab (TEC-300…TEC-375)

## Profil alergenowy pozycji — CRUD (API `/api/technical/items/[item_code]/allergens` + `[allergen_code]`; `lib/technical/allergens/service.ts`)

### TEC-300: Utworzenie wiersza profilu alergenowego (upsert po kluczu złożonym)
- **Co sprawdza**: POST tworzy wiersz `item_allergen_profiles` z domyślną intensity/confidence.
- **Kroki**: 1) POST `/api/technical/items/RM-001/allergens` z `{allergenCode:"gluten", source:"supplier_spec"}`. 2) GET listy.
- **Oczekiwana logika**: 201; wiersz z `intensity='contains'`, `confidence='declared'` (zod `.default(...)` — `service.ts:43-44`); upsert po `(org_id,item_id,allergen_code)` — `service.ts:127-138`; audit `allergen.create` — `service.ts:163-167`.
- **Priorytet**: P0

### TEC-301: Aktualizacja istniejącego wiersza (idempotentny upsert, nie duplikuje)
- **Kroki**: 1) POST `gluten/supplier_spec`. 2) POST ponownie z `intensity:"may_contain"`. 3) GET.
- **Oczekiwana logika**: Jeden wiersz, `intensity='may_contain'`, `declared_at=now()`; `on conflict ... do update` — `service.ts:130-136`; audit `allergen.update` — `service.ts:165`.
- **Priorytet**: P0

### TEC-302: manual_override wymaga niepustego reason (V-TEC-42) — walidacja zod
- **Kroki**: 1) POST `{allergenCode:"soy", source:"manual_override"}` bez `reason`.
- **Oczekiwana logika**: 422 `error:"override_reason_required"`, `code:"V-TEC-42"`; superRefine na `reason` — `service.ts:48-56`; mapowanie — `service.ts:95-96`; status 422 — `http.ts:34-37`.
- **Priorytet**: P0

### TEC-303: manual_override zapisuje wiersz ledger + audit allergen.override
- **Kroki**: 1) POST `{allergenCode:"milk", source:"manual_override", reason:"lab confirmed cross-contact"}`.
- **Oczekiwana logika**: Wiersz z `source='manual_override'`, `manual_override_reason` ustawione; INSERT do `item_allergen_profile_overrides` z `action='set'` — `service.ts:153-160`; audit `allergen.override` — `service.ts:163-164`.
- **Priorytet**: P0

### TEC-304: allergen_code musi istnieć w "Reference"."Allergens" (V-TEC-40)
- **Kroki**: 1) POST `{allergenCode:"unicorn-dust", source:"supplier_spec"}`.
- **Oczekiwana logika**: 422 `invalid_allergen_code`/`V-TEC-40`; guard `allergenCodeExists` (org-scoped) — `service.ts:110-112`, `shared.ts:112-121`.
- **Priorytet**: P0

### TEC-305: Pozycja typu packaging odrzuca profil alergenowy (not_applicable)
- **Kroki**: 1) POST na `item_code` o `item_type='packaging'`.
- **Oczekiwana logika**: `error:'not_applicable'` (obecnie mapowane do 500 w `http.ts` — patrz Niepewności); guard `item.itemType === 'packaging'` — `service.ts:105-107`.
- **Priorytet**: P1

### TEC-306: Nieistniejąca pozycja → not_found (404)
- **Kroki**: 1) POST na `item_code` niewidoczny w org.
- **Oczekiwana logika**: 404 `not_found`; `resolveItemIdentity` zwraca null (RLS org-scope) — `service.ts:77-84,104`.
- **Priorytet**: P1

### TEC-307: Brak uprawnienia technical.allergens.edit → 403
- **Kroki**: 1) POST jako user bez `technical.allergens.edit`.
- **Oczekiwana logika**: 403 `forbidden`; `hasPermission(ctx, ALLERGENS_EDIT_PERMISSION)` — `service.ts:101`; status 403 — `http.ts:28-29`.
- **Priorytet**: P0

### TEC-308: DELETE profilu przez path param [allergen_code]
- **Kroki**: 1) DELETE `/api/technical/items/RM-001/allergens/gluten`.
- **Oczekiwana logika**: 200, wiersz usunięty; audit `allergen.delete` z before-state — `service.ts:236-244`; route dekoduje oba paramy — `[allergen_code]/route.ts:18-26`.
- **Priorytet**: P1

### TEC-309: DELETE manual_override dopisuje wiersz ledger 'clear'
- **Kroki**: 1) Utwórz override `milk`. 2) DELETE go.
- **Oczekiwana logika**: INSERT ledger `action='clear'` z reason przeniesionym z wiersza (fallback 'manual override removed') — `service.ts:220-233`.
- **Priorytet**: P1

### TEC-310: DELETE bez query param allergen_code (kolekcyjny route) → 400
- **Kroki**: 1) DELETE `/api/technical/items/RM-001/allergens` bez query.
- **Oczekiwana logika**: 400 `invalid_input`; guard `if (!allergenCode)` — `[item_code]/allergens/route.ts:58-59`.
- **Priorytet**: P2

### TEC-311: PUT jest aliasem POST (upsert), zwraca 200 zamiast 201
- **Kroki**: 1) PUT z poprawnym body.
- **Oczekiwana logika**: 200 (`runAllergenRoute(200, ...)`), ta sama logika co POST — `[item_code]/allergens/route.ts:42-53`.
- **Priorytet**: P2

### TEC-312: Nieautoryzowany (brak sesji) → 401 unauthenticated
- **Kroki**: 1) Żądanie bez sesji.
- **Oczekiwana logika**: 401 `unauthenticated`; `if (!entered) return 401` — `http.ts:68-69`.
- **Priorytet**: P0

### TEC-313: Izolacja org — profil innej org niewidoczny
- **Kroki**: 1) Utwórz profil w org A. 2) GET jako user org B na tym item_code.
- **Oczekiwana logika**: Brak wiersza / not_found; wszystkie query filtrują `org_id = app.current_org_id()` — `service.ts:118-120,209-213`.
- **Priorytet**: P0

## Dodatki alergenowe operacji produkcyjnej (API `/api/technical/manufacturing-operations/allergens`; `lib/technical/allergens/manufacturing-op.ts`)

### TEC-314: Dodanie alergenu do operacji (upsert po (org,operation,allergen))
- **Kroki**: 1) POST `{manufacturingOperationName:"Frying", allergenCode:"gluten"}`.
- **Oczekiwana logika**: 201; upsert `on conflict (org_id,manufacturing_operation_name,allergen_code) do update set reason` — `manufacturing-op.ts:82-84`; audit `manufacturing_op.allergen.create` — `manufacturing-op.ts:95`.
- **Priorytet**: P0

### TEC-315: operation_name musi istnieć jako aktywna w Reference (V-TEC-63)
- **Kroki**: 1) POST z `manufacturingOperationName:"NonexistentOp"`.
- **Oczekiwana logika**: 422 `invalid_manufacturing_operation`/`V-TEC-63`; `manufacturingOperationExists` wymaga `is_active=true` — `manufacturing-op.ts:61-63`, `shared.ts:127-139`.
- **Priorytet**: P0

### TEC-316: allergen_code guard w dodatku operacji (V-TEC-40)
- **Kroki**: 1) POST z poprawną operacją, `allergenCode:"nope"`.
- **Oczekiwana logika**: 422 `invalid_allergen_code`; `allergenCodeExists` — `manufacturing-op.ts:65-67`.
- **Priorytet**: P1

### TEC-317: DELETE dodatku po body {operation, allergen}
- **Kroki**: 1) DELETE z body `{manufacturingOperationName, allergenCode}`.
- **Oczekiwana logika**: 200, audit `manufacturing_op.allergen.delete`; brak wiersza → 404 `not_found` — `manufacturing-op.ts:130-141`.
- **Priorytet**: P1

### TEC-318: GET z filtrem ?manufacturing_operation_name=
- **Kroki**: 1) GET `?manufacturing_operation_name=Frying`.
- **Oczekiwana logika**: Tylko wiersze tej operacji, `order by operation asc, allergen_code asc` — `manufacturing-op.ts:162-174`.
- **Priorytet**: P2

## Macierz ryzyka kontaminacji krzyżowej (API `/api/technical/allergens/contamination-risk`; `lib/technical/allergens/contamination.ts`)

### TEC-319: Upsert wiersza ryzyka po naturalnym kluczu (line_id, allergen_code)
- **Kroki**: 1) POST `{lineId, allergenCode:"gluten", riskLevel:"high"}`. 2) POST ponownie `riskLevel:"low"`.
- **Oczekiwana logika**: Jeden wiersz, `risk_level='low'`, `last_assessed_at`+`assessed_by` odświeżone; SELECT-by-key → UPDATE gdy istnieje — `contamination.ts:65-86`; audit `contamination_risk.update` — `contamination.ts:103`.
- **Priorytet**: P0

### TEC-320: riskLevel spoza enum ('extreme') → 422/400
- **Kroki**: 1) POST `riskLevel:"extreme"`.
- **Oczekiwana logika**: `z.enum(RISK_LEVELS={high,medium,low,segregated})` → `invalid_input` — `contamination.ts:33`, `shared.ts:41`; a przy obejściu — DB CHECK 23514 → `invalid_input` — `contamination.ts:112`.
- **Priorytet**: P0

### TEC-321: Raport luk pokrycia — EU-14 bez wpisu dla linii
- **Kroki**: 1) Ustaw ryzyko dla `gluten` na linii L1. 2) GET `?line_id=L1`.
- **Oczekiwana logika**: `gaps` = wszystkie `"Reference"."Allergens"` org minus już obecne (NOT EXISTS) — `contamination.ts:186-196`; `gluten` nie w gaps.
- **Priorytet**: P1

### TEC-322: allergen_code guard przy upsert ryzyka (V-TEC-40)
- **Kroki**: 1) POST z `allergenCode:"xyz"`.
- **Oczekiwana logika**: `invalid_allergen_code` 422; `allergenCodeExists` — `contamination.ts:60-62`.
- **Priorytet**: P1

### TEC-323: FK violation (line_id nieistniejące) → invalid_input
- **Kroki**: 1) POST z `lineId` losowym UUID.
- **Oczekiwana logika**: `invalid_input`; `err.code === '23503'` — `contamination.ts:113`. Nie 500.
- **Priorytet**: P2

### TEC-324: DELETE ryzyka po ?id=; brak → not_found
- **Kroki**: 1) DELETE `?id=<uuid>`. 2) DELETE nieistniejącego. 3) DELETE bez `?id=`.
- **Oczekiwana logika**: 200 + audit `contamination_risk.delete`; nieistniejące → 404 — `contamination.ts:132-152`; brak `?id=` → 400 — `contamination-risk/route.ts:46-47`.
- **Priorytet**: P1

## Kaskada alergenów BOM→FG (`lib/technical/allergens/cascade.ts`)

### TEC-325: Propagacja przez aktywne BOM-y (RM zmieniony → rodzic przeliczony)
- **Co sprawdza**: Zmiana profilu komponentu przelicza zbiór alergenów każdego rodzica transytywnie zawierającego komponent przez BOM-y `status='active'`.
- **Kroki**: 1) Aktywny BOM: FG zawiera RM. 2) Dodaj `gluten` do RM. 3) `cascadeAllergensForChangedItem(client, org, RM_id)`.
- **Oczekiwana logika**: FG dostaje wiersz `source='cascaded'`, `gluten`; recursive CTE po `bh.status='active'` — `cascade.ts:63-89`; upsert cascaded — `cascade.ts:118-130`.
- **Priorytet**: P0

### TEC-326: Nie-aktywne BOM-y ignorowane
- **Kroki**: 1) BOM `draft`/`superseded` zawiera RM. 2) Kaskada dla RM.
- **Oczekiwana logika**: `affectedParentItemIds` puste, 0 zapisów; joiny wymagają `status='active'` — `cascade.ts:73-85,159`.
- **Priorytet**: P0

### TEC-327: Ochrona manual_override — cascaded NIE nadpisuje
- **Kroki**: 1) FG ma manual_override `milk` (trace). 2) Komponent wnosi `milk` (contains). 3) Kaskada.
- **Oczekiwana logika**: Wiersz FG dalej `manual_override`/`trace`; `overridesPreserved++`, `continue` przed insertem — `cascade.ts:105-116`; dodatkowo `on conflict ... where source <> 'manual_override'` — `cascade.ts:127`.
- **Priorytet**: P0

### TEC-328: Wykluczenie komponentów packaging ze zbioru
- **Kroki**: 1) BOM FG z komponentem packaging niosącym profil alergenowy. 2) Kaskada.
- **Oczekiwana logika**: Alergen packaging pominięty; `component.item_type <> 'packaging'` — `cascade.ts:170-172`; również dla dodatków procesu — `cascade.ts:190`.
- **Priorytet**: P0

### TEC-329: Zbiór = UNION(profile komponentów, dodatki operacji na linii)
- **Kroki**: 1) Komponent bez alergenów, ale linia BOM ma operację "Frying" z dodatkiem `gluten`. 2) Kaskada.
- **Oczekiwana logika**: FG dostaje `gluten` (intensity='contains', confidence='declared') — `cascade.ts:178-194`.
- **Priorytet**: P0

### TEC-330: Najsilniejsza intensity/confidence per allergen_code
- **Kroki**: 1) Dwa komponenty niosą `soy`: `may_contain/assumed` i `trace/tested`. 2) Kaskada.
- **Oczekiwana logika**: FG `soy` = intensity `may_contain` (silniejsza) + confidence `tested` (silniejsza) — łączone niezależnie — `cascade.ts:44-45,209-215`. Ranking: contains>may_contain>trace; tested>declared>assumed.
- **Priorytet**: P1

### TEC-331: Kolejność bottom-up (intermediate przed FG)
- **Kroki**: 1) RM→Intermediate→FG (dwa aktywne BOM-y). 2) Kaskada dla RM.
- **Oczekiwana logika**: `ordered` topologicznie (indegree/Kahn), intermediate przed FG — `cascade.ts:100,226-265`.
- **Priorytet**: P1

### TEC-332: Idempotencja — drugi przebieg bez zmian nic nie pisze nowego
- **Kroki**: 1) Kaskada. 2) Kaskada ponownie bez zmiany źródła.
- **Oczekiwana logika**: Wynik stabilny (upsert do tej samej wartości); dokumentowana idempotencja — `cascade.ts:26`.
- **Priorytet**: P2

### TEC-333: Wybór aktywnej wersji BOM = najwyższa version
- **Kroki**: 1) Dwie aktywne wersje BOM (v1,v2). 2) Kaskada.
- **Oczekiwana logika**: Zbiór z v2; `active_bom` CTE `order by bh.version desc limit 1` — `cascade.ts:153-161`.
- **Priorytet**: P2

### TEC-334: Alergen usunięty z RM znika z FG po ponownej kaskadzie
- **Co sprawdza**: Kaskada odzwierciedla usunięcie źródła (regresja: martwe wiersze).
- **Kroki**: 1) RM ma `gluten`→kaskada (FG cascaded gluten). 2) Usuń `gluten` z RM. 3) Kaskada.
- **Oczekiwana logika**: `computeCascadedSet` nie zawiera `gluten`, ale kod tylko UPSERT-uje obliczony zbiór — nie usuwa poprzednio zapisanych cascaded wierszy (PRAWDOPODOBNY BUG — patrz Niepewności) — `cascade.ts:102-131`.
- **Priorytet**: P1

### TEC-335: Org-scope kaskady (RLS)
- **Kroki**: 1) Analogiczne struktury w dwóch org. 2) Kaskada w org A.
- **Oczekiwana logika**: Zmienione tylko rodzice org A; każde query `app.current_org_id()` — `cascade.ts:72,110,121`.
- **Priorytet**: P0

## Allergens Config / macierz (`technical/allergens-config`; `_actions/load-matrix.ts`, `_actions/load-config.ts`)

### TEC-336: Macierz alergenów — komórka = najsilniejsza intensity per (pozycja×alergen)
- **Kroki**: 1) Otwórz macierz. 2) Pozycja z `contains gluten` i `trace soy`.
- **Oczekiwana logika**: Komórka gluten=2 (red), soy=1 (amber), absent=0; `cellFor` + pivot z max — `load-matrix.ts:54-58,105-110`; wiersze = aktywne `fg`+`intermediate` — `load-matrix.ts:88-92`.
- **Priorytet**: P1

### TEC-337: Macierz — read-gate any technical.* (denied bez uprawnień)
- **Kroki**: 1) Otwórz jako user bez technical permissions.
- **Oczekiwana logika**: `{state:'denied'}`; `hasAnyTechnicalAccess` (dual-store role_permissions + roles.permissions jsonb) — `load-matrix.ts:65-67`, `shared.ts:31-53`.
- **Priorytet**: P0

### TEC-338: Config — liczba luk pokrycia (line×allergen bez wpisu)
- **Kroki**: 1) 2 aktywne linie, 14 alergenów, 1 wpis ryzyka.
- **Oczekiwana logika**: **FORMUŁA**: `coverageGapCount = linie×alergeny − wpisy = 2×14 − 1 = 27`; podwójna pętla minus present set — `load-config.ts:139-146`.
- **Priorytet**: P1

### TEC-339: Config — canEdit steruje afordancjami (read-only bez edit)
- **Kroki**: 1) Załaduj config jako viewer.
- **Oczekiwana logika**: `canEdit=false`; write i tak re-checkowany server-side — `load-config.ts:115,179` + `contamination.ts:58`.
- **Priorytet**: P1

### TEC-340: Config — tylko aktywne linie i aktywne operacje w pickerach
- **Kroki**: 1) Dezaktywuj linię/operację. 2) Załaduj config.
- **Oczekiwana logika**: Niewidoczne w matrix/pickerze — `load-config.ts:84-92`.
- **Priorytet**: P2

### TEC-341: Config — mutacje delegują do serwisów allergen (RBAC egzekwowane)
- **Kroki**: 1) saveRiskCell jako user bez edit.
- **Oczekiwana logika**: `{ok:false,error:'forbidden'}`; delegacja — `load-config.ts:170-188` → `contamination.ts:58`.
- **Priorytet**: P1

## Ekran podglądu kaskady (`technical/allergens/cascade`; `_actions/load-cascade.ts`)

### TEC-342: Podgląd kaskady — read-only, finalny zbiór + łańcuch derywacji
- **Kroki**: 1) Otwórz cascade dla FG z aktywnym BOM.
- **Oczekiwana logika**: `finalAllergens` z profilu; `chain` = component contributions ∪ process additions ∪ węzeł FG; nigdy nie rekomputuje/pisze — `load-cascade.ts:11-22,96-244`.
- **Priorytet**: P1

### TEC-343: Podgląd kaskady — tylko FG z istniejącym profilem, limit 50
- **Kroki**: 1) 60 FG z profilami.
- **Oczekiwana logika**: `exists (...item_allergen_profiles)` filtr + `limit 50` — `load-cascade.ts:60,80-86`.
- **Priorytet**: P2

### TEC-344: Podgląd kaskady — denied bez technical.*
- **Kroki**: 1) Otwórz jako non-technical.
- **Oczekiwana logika**: `{state:'denied'}` — `load-cascade.ts:70-72`.
- **Priorytet**: P1

## Audyt nadpisań alergenów (`technical/allergens/overrides`; `_actions/load-overrides.ts`)

### TEC-345: Log nadpisań z append-only ledger, malejąco po dacie
- **Kroki**: 1) Wykonaj set + clear override. 2) Otwórz audyt.
- **Oczekiwana logika**: 2 wiersze (set, clear) `order by overridden_at desc` limit 500; join po item_id/org — `load-overrides.ts:49-56`.
- **Priorytet**: P1

### TEC-346: canReview = technical.allergens.edit
- **Kroki**: 1) Załaduj jako viewer.
- **Oczekiwana logika**: `canReview=false`; `hasPermission(ctx, ALLERGENS_EDIT_PERMISSION)` — `load-overrides.ts:64`.
- **Priorytet**: P2

## Nutrition panel (read-only) (`technical/nutrition`; `_actions/list-nutrition.ts`; formuła: `packages/domain/src/nutrition/compute-nutrition.ts`)

### TEC-347: Panel makro — per 100 g i per porcja (NUMERIC jako string)
- **Kroki**: 1) Wybierz produkt z materializowanym profilem.
- **Oczekiwana logika**: `per_100g_value::text`, `per_portion_value::text` verbatim — `list-nutrition.ts:184-185`; typy string — `shared.ts:50-52`.
- **Priorytet**: P1

### TEC-348: Formuła per-100g = ważona składem BOM; per-porcja skalowana
- **Co sprawdza**: (źródło NPD, Technical czyta) per100g[n] = Σ (pct/100)·rmNutrition; perPortion = per100g·(portionGrams/100).
- **Kroki**: 1) Skład: RM_A 60% (gluten-nutrient 10 g/100 g), RM_B 40% (0). Porcja 40 g. 2) Sprawdź panel.
- **Oczekiwana logika**: **FORMUŁA**: per100g = 0.60·10 = **6.0 g/100 g**; perPortion = 6.0·(40/100) = **2.4 g** — `compute-nutrition.ts:163,170,181-184`; domyślna porcja `DEFAULT_PORTION_GRAMS` gdy brak.
- **Priorytet**: P1

### TEC-349: Deklaracje alergenów — filtr do enum presence + fallback nazwy
- **Kroki**: 1) Produkt z nutrition_allergens.
- **Oczekiwana logika**: presence ∈ {contains,may_contain,free_from,unknown} (`PRESENCE_SET.has`) + `name ?? allergen_code` — `list-nutrition.ts:227-233`; enum — `shared.ts:22`.
- **Priorytet**: P2

### TEC-350: Orphan-read bridge — RM nutrition z "Reference"."RawMaterials"
- **Co sprawdza**: Gdy brak materializowanego profilu, panel budowany z RawMaterials.nutrition_per_100g + allergens_inherited (presence 'contains', perPortion pusty).
- **Kroki**: 1) RM z nutrition wpisanym w Technical (brak nutrition_profiles). 2) Wybierz go.
- **Oczekiwana logika**: Fallback `buildPanelFromRawMaterials` gdy 0 makro i 0 alergenów w profilu — `list-nutrition.ts:240-247,292-356`; picker dedupuje — `list-nutrition.ts:109-117`.
- **Priorytet**: P1

### TEC-351: Picker pusty → EmptyState, błąd → error state (bez mocków)
- **Kroki**: 1) Org bez profili. 2) Wymuś błąd DB.
- **Oczekiwana logika**: `state:'empty'` / catch `state:'error'` — `list-nutrition.ts:144,146-151`.
- **Priorytet**: P2

### TEC-352: Link "Open NPD project" tylko gdy product_code mapuje na npd_projects
- **Kroki**: 1) Produkt z powiązanym npd_project.
- **Oczekiwana logika**: `npdProjectId` z DISTINCT ON (product_code) ostatniego projektu — `list-nutrition.ts:123-135`; UI — `nutrition-panel.client.tsx:345-355`.
- **Priorytet**: P2

## Shelf-life config (`technical/shelf-life`; `_actions/set-shelf-life-override.ts`, `_actions/list-shelf-life.ts`, `_actions/shared.ts`)

### TEC-353: Lista shelf-life FG + KPI (use_by/best_before/unconfigured)
- **Kroki**: 1) 3 FG: 1 use_by, 1 best_before, 1 bez dni.
- **Oczekiwana logika**: `kpis.useBy=1, bestBefore=1, unconfigured=1`, `products=3` — `list-shelf-life.ts:93-98`.
- **Priorytet**: P1

### TEC-354: Override shelf-life — walidacja days>0, mode enum, reason≥10
- **Kroki**: 1) setShelfLifeOverride `{shelfLifeDays:0}` / `reason:"short"`.
- **Oczekiwana logika**: `invalid_input`; schema `shelfLifeDays` int positive, `shelfLifeMode ∈ {use_by,best_before}`, reason min 10 — `shared.ts:71-77`; klient blokuje Apply — `override-modal.tsx:197`.
- **Priorytet**: P0

### TEC-355: Override zapisuje tylko FG i audytuje item.shelf_life_overridden
- **Kroki**: 1) Override na FG → 200. 2) Override na id nie-FG → not_found.
- **Oczekiwana logika**: UPDATE z WHERE `item_type='fg'` — `set-shelf-life-override.ts:53-64`; audit `item.shelf_life_overridden` z before/after i reason — `set-shelf-life-override.ts:66-78`.
- **Priorytet**: P0

### TEC-356: Override gated na technical.items.edit
- **Kroki**: 1) Override jako user bez `technical.items.edit`.
- **Oczekiwana logika**: `{ok:false,error:'forbidden'}` — `set-shelf-life-override.ts:43`.
- **Priorytet**: P0

### TEC-357: Formuła best-before/use-by (data ważności) — konceptualna
- **Co sprawdza**: data_ważności = data_produkcji + shelf_life_days; mode determinuje etykietę.
- **Kroki**: 1) FG shelf_life_days=21, produkcja 2026-07-01. 2) Sprawdź datę na etykiecie/partii.
- **Oczekiwana logika**: **FORMUŁA**: best-before/use-by = 2026-07-01 + 21 dni = **2026-07-22**. UWAGA: Technical przechowuje tylko `shelf_life_days`+`mode`+`date_code_format` na `items` (mig 153) — kod liczący datę żyje w produkcji/etykietowaniu (patrz Niepewności) — `shared.ts:5-18`.
- **Priorytet**: P1

### TEC-358: Preview kodu daty — YYWW (ISO week) deterministyczny
- **Kroki**: 1) format YYWW dla 2026-07-01.
- **Oczekiwana logika**: `${yy}${isoWeek}` np. 2026 tydz.27 → **2627**; YYJJJ = `${yy}${dayOfYear}`; custom echo — `shared.ts:106-128`.
- **Priorytet**: P2

### TEC-359: CHECK 23514 z DB → invalid_input (nie 500)
- **Kroki**: 1) Wymuś check violation (np. ujemne dni po obejściu zod).
- **Oczekiwana logika**: `invalid_input`; `err.code==='23514'` — `set-shelf-life-override.ts:87`.
- **Priorytet**: P2

## Sensory evaluation (`technical/sensory`; `_actions/record-sensory-evaluation.ts`)

### TEC-360: Utworzenie panelu sensorycznego (header + atrybuty + komentarze)
- **Kroki**: 1) recordSensoryEvaluation bez `panelId`, z attributes[] i comments[].
- **Oczekiwana logika**: `{ok:true, panelId}`; INSERT header + per-attribute + comments z display_order — `record-sensory-evaluation.ts:181-299`.
- **Priorytet**: P0

### TEC-361: Status verdict (pass/fail/hold) stempluje evaluated_at/by; inne null
- **Kroki**: 1) status='pass'. 2) status='pending'.
- **Oczekiwana logika**: pass → `evaluated_at=now(), evaluated_by=user`; pending → null; `isVerdict` — `record-sensory-evaluation.ts:156,188,231`.
- **Priorytet**: P1

### TEC-362: status='not_required' wymusza policy_required=false
- **Kroki**: 1) status='not_required'.
- **Oczekiwana logika**: `policy_required=false`; inne statusy true — `record-sensory-evaluation.ts:157`.
- **Priorytet**: P2

### TEC-363: EDIT — delete-then-insert child sets, org-scoped
- **Kroki**: 1) Utwórz panel z 6 atrybutami. 2) Edit z 3 atrybutami.
- **Oczekiwana logika**: DELETE child po panel_id+org, potem INSERT nowych — `record-sensory-evaluation.ts:262-299`; before-state z prior row — `:211-221`.
- **Priorytet**: P1

### TEC-364: Walidacja zakresów score (0-10) i vsBenchmark (-10..10)
- **Kroki**: 1) attribute `scoreOutOf10:11`.
- **Oczekiwana logika**: `{ok:false,code:'INVALID_INPUT'}`; `attributeSchema` — `record-sensory-evaluation.ts:51-55,73`.
- **Priorytet**: P1

### TEC-365: Write gated na technical.sensory.write (dual-store)
- **Kroki**: 1) record jako user bez `technical.sensory.write`.
- **Oczekiwana logika**: `{ok:false,code:'FORBIDDEN'}`; `hasPermission(ctx, SENSORY_WRITE_PERMISSION)` — `record-sensory-evaluation.ts:163`; helper — `shared.ts:70-83`.
- **Priorytet**: P0

### TEC-366: Audit best-effort w SAVEPOINT (błąd audytu nie cofa zapisu)
- **Kroki**: 1) Zasymuluj błąd audit.
- **Oczekiwana logika**: Panel zapisany, audit rollback do savepoint — `record-sensory-evaluation.ts:106-133`.
- **Priorytet**: P2

### TEC-367: DELETE panelu (child sets + header) + NOT_FOUND
- **Kroki**: 1) deleteSensoryEvaluation dla istniejącego / nieistniejącego id.
- **Oczekiwana logika**: usuwa scores+comments+header; brak → `NOT_FOUND` — `record-sensory-evaluation.ts:349-365`.
- **Priorytet**: P1

### TEC-368: Izolacja org — edit/delete cudzego panelu → NOT_FOUND
- **Kroki**: 1) Edit panelu org B jako user org A.
- **Oczekiwana logika**: `NOT_FOUND` (0 wierszy); `org_id=app.current_org_id()` w UPDATE/DELETE — `record-sensory-evaluation.ts:238-239,257`.
- **Priorytet**: P0

## Lab results (read-only + bridge) (`technical/lab-results`; `lib/technical/lab/read-model.ts`; API `/api/technical/lab-results`)

### TEC-369: GET listy lab-results — read-only nad Quality-owned lab_results
- **Kroki**: 1) GET `/api/technical/lab-results`.
- **Oczekiwana logika**: `{data,count}`; `result_status`/`threshold_rlu` surfaced jak-jest (nie rekomputowane) — `read-model.ts:100-120,196-229`.
- **Priorytet**: P1

### TEC-370: POST z Technical → 501 QUALITY_BRIDGE_MISSING (nigdy nie INSERT-uje)
- **Kroki**: 1) POST poprawnego body.
- **Oczekiwana logika**: 501 `QUALITY_BRIDGE_MISSING`, brak zapisu — `lab-results/route.ts:126-148`.
- **Priorytet**: P0

### TEC-371: Filtry GET walidowane (test_type/result_status/item_id/limit)
- **Kroki**: 1) GET `?result_status=exploded`. 2) `?item_id=notuuid`. 3) `?limit=999`.
- **Oczekiwana logika**: 400 `invalid_filter` z `field`; guards — `read-model.ts:154-177` (limit max 500); route — `lab-results/route.ts:79-82`.
- **Priorytet**: P1

### TEC-372: GET/POST gated na dowolne technical.* → 403 bez
- **Kroki**: 1) Żądanie jako non-technical.
- **Oczekiwana logika**: 403 `forbidden`; `callerIsTechnical` dual-store — `lab-results/route.ts:51-68,87-89,122`.
- **Priorytet**: P0

### TEC-373: Wiersz spoza kanonicznego enum pomijany (defensywnie)
- **Kroki**: 1) Wiersz lab z legacy test_type.
- **Oczekiwana logika**: `toLabResultReadRow` zwraca null → odfiltrowany — `read-model.ts:100-102`; filtr w route — `lab-results/route.ts:93-95`.
- **Priorytet**: P2

### TEC-374: Log UI — LEFT JOIN items dla item_code/name; empty/error state
- **Kroki**: 1) Załaduj log dla org bez wyników.
- **Oczekiwana logika**: `state:'empty'`; join `i.id=lr.item_id and i.org_id=app.current_org_id()` — `list-lab-results.ts:79-95`.
- **Priorytet**: P2

### TEC-375: Sortowanie wyników — coalesce(tested_at,created_at) desc
- **Kroki**: 1) Wyniki z różnymi tested_at/created_at.
- **Oczekiwana logika**: `order by coalesce(tested_at, created_at) desc, created_at desc` — `read-model.ts:225`.
- **Priorytet**: P2

---
# Część E — ECO / Factory-specs / Release-bundles / Compliance / Traceability (TEC-400…TEC-499)

Ustalone z KODU maszyny stanów:
- **ECO** (`technical/eco/_actions/shared.ts:13`): `draft → approved → implementing → closed`. Brak ścieżki reject/cancel; brak skoków (draft→implementing itd.).
- **Factory-spec** (`lib/technical/factory-spec-release-guards.ts:53-62`; enum `packages/db/migrations/165-factory-specs.sql:70-72`): `draft`, `in_review`, `approved_for_factory`, `released_to_factory`, `superseded`, `archived`. Dozwolone: `draft→{draft,in_review,archived}`, `in_review→{draft,in_review,approved_for_factory,archived}`, `approved_for_factory→{released_to_factory,superseded,archived}`, `released_to_factory→{draft(recall),superseded,archived}`, `superseded→{archived}`, `archived→{}`. `draft→approved_for_factory` i `draft→released_to_factory` ZABLOKOWANE.

## ECO — Change Orders (`technical/eco/page.tsx`, `_actions/*`)

### TEC-400: Utworzenie ECO (happy path, draft)
- **Co sprawdza**: `createChangeOrder` tworzy ECO w statusie `draft` z liniami.
- **Kroki**: 1) Zaloguj z `technical.eco.write`. 2) createChangeOrder z code/title, ≥1 target (item/BOM/spec) i ≥1 linią. 3) Sprawdź `{status:'draft'}` i audit `eco.created`.
- **Oczekiwana logika**: INSERT z hardcoded `'draft'` + `replaceEcoLines` + audit (`technical/eco/_actions/create-change-order.ts:28-65`).
- **Priorytet**: P0

### TEC-401: Walidacja — ECO musi mieć target
- **Kroki**: 1) createChangeOrder bez targetItemId/targetBomHeaderId/targetFactorySpecId. 2) `invalid_input`.
- **Oczekiwana logika**: `CreateEcoInput.refine(...'an ECO must target an item, BOM, or factory spec')` (`eco/_actions/shared.ts:70-75`).
- **Priorytet**: P0

### TEC-402: Walidacja — wymagana ≥1 linia
- **Kroki**: 1) createChangeOrder z `lines:[]`. 2) `invalid_input`.
- **Oczekiwana logika**: `lines: z.array(EcoLineInput).min(1)` (`eco/_actions/shared.ts:67`).
- **Priorytet**: P1

### TEC-403: Walidacja enumów linii (action/targetType)
- **Kroki**: 1) Linia z action=`foo`. 2) `invalid_input`.
- **Oczekiwana logika**: enum `['add','change','remove','replace','deprecate']` + targetType enum (`eco/_actions/shared.ts:41-42`).
- **Priorytet**: P2

### TEC-404: Duplikat kodu ECO
- **Kroki**: 1) Utwórz ECO code=`ECO-1`. 2) Utwórz drugi z tym samym code. 3) `already_exists`.
- **Oczekiwana logika**: PG `23505` → `already_exists` (`create-change-order.ts:70`).
- **Priorytet**: P1

### TEC-405: Brak uprawnienia write → forbidden
- **Kroki**: 1) User bez `technical.eco.write`. 2) createChangeOrder. 3) `forbidden`.
- **Oczekiwana logika**: `hasPermission(ctx, ECO_WRITE_PERMISSION)` (`create-change-order.ts:25`).
- **Priorytet**: P0

### TEC-406: Approve ECO (draft→approved)
- **Kroki**: 1) ECO draft. 2) `approveChangeOrder`. 3) status=`approved`, wpis do `technical_change_order_approvals` (action=`approve`) + audit `eco.approved`.
- **Oczekiwana logika**: UPDATE `set status='approved' ... where status='draft'` (`approve-change-order.ts:25-33`).
- **Priorytet**: P0

### TEC-407: Approve wymaga uprawnienia `eco.approve` (nie `write`)
- **Kroki**: 1) User ma write ale nie approve. 2) approveChangeOrder. 3) `forbidden`.
- **Oczekiwana logika**: `hasPermission(ctx, ECO_APPROVE_PERMISSION)` (`approve-change-order.ts:22`; stała `shared.ts:7`).
- **Priorytet**: P0

### TEC-408: Approve BLOKOWANY z nie-draft
- **Kroki**: 1) ECO `approved`. 2) approveChangeOrder ponownie. 3) `invalid_state`.
- **Oczekiwana logika**: UPDATE `where status='draft'` 0 wierszy; row istnieje → `invalid_state` (`approve-change-order.ts:37-44`).
- **Priorytet**: P0

### TEC-409: Approve nieistniejącego ECO → not_found
- **Kroki**: 1) approveChangeOrder z losowym UUID. 2) `not_found`.
- **Oczekiwana logika**: brak wiersza w SELECT → `not_found` (`approve-change-order.ts:42`).
- **Priorytet**: P2

### TEC-410: Start implementation (approved→implementing)
- **Kroki**: 1) ECO approved. 2) `startChangeOrderImplementation`. 3) status=`implementing`, `implementing_at` set, approval `start_implementation`.
- **Oczekiwana logika**: UPDATE `set status='implementing' ... where status='approved'` (`start-change-order-implementation.ts:25-32`).
- **Priorytet**: P0

### TEC-411: Start implementation BLOKOWANY z draft
- **Kroki**: 1) ECO draft. 2) startChangeOrderImplementation. 3) `invalid_state`.
- **Oczekiwana logika**: `where status='approved'` → 0 wierszy → `invalid_state` (`start-change-order-implementation.ts:31,42`). Nie można pominąć approve.
- **Priorytet**: P0

### TEC-412: Link supersession tylko w `implementing`
- **Kroki**: 1) ECO `approved`. 2) `linkEcoSupersession`. 3) `invalid_state`. 4) W implementing → sukces.
- **Oczekiwana logika**: `if (current.status !== 'implementing') return invalid_state` (`link-eco-supersession.ts:36`).
- **Priorytet**: P0

### TEC-413: Link supersession — walidacja lineage BOM
- **Kroki**: 1) ECO implementing target BOM A. 2) linkEcoSupersession z BOM innego produktu. 3) `supersession_invalid`.
- **Oczekiwana logika**: `validateSupersedingBom` — product match (`lib/technical/eco-apply-service.ts:148`), lineage/newer (`:151-155`).
- **Priorytet**: P0

### TEC-414: Link supersession — target niezgodny z typem
- **Kroki**: 1) ECO target = factory_spec. 2) linkEcoSupersession z supersedingBomHeaderId. 3) `supersession_invalid` ("this ECO does not target a BOM").
- **Oczekiwana logika**: `validateEcoSupersessionLink` guard target (`eco-apply-service.ts:295-297,310-311`).
- **Priorytet**: P1

### TEC-415: Close ECO z BOM target — publish superseding BOM (apply-on-close)
- **Kroki**: 1) ECO implementing, target BOM A, zlinkowany superseding BOM (`technical_approved`, ten sam produkt, nowsza wersja). 2) `closeChangeOrder`. 3) status=`closed`, `publishBomVersion` wywołane, audit `eco.applied`.
- **Oczekiwana logika**: `applyEcoOnClose` → `publishBomVersion` gdy status `technical_approved` (`eco-apply-service.ts:213-236`); close UPDATE `where status='implementing'` (`close-change-order.ts:54-64`).
- **Priorytet**: P0

### TEC-416: Close BLOKOWANY bez zlinkowanego superseding (BOM target)
- **Kroki**: 1) ECO implementing target BOM, bez linku. 2) closeChangeOrder. 3) `supersession_required`.
- **Oczekiwana logika**: `if (!supersedingBomHeaderId) return supersession_required` (`eco-apply-service.ts:185-191`).
- **Priorytet**: P0

### TEC-417: Close BLOKOWANY bez zlinkowanego superseding (factory_spec target)
- **Kroki**: 1) ECO implementing target factory_spec, brak linku. 2) closeChangeOrder. 3) `supersession_required`.
- **Oczekiwana logika**: `eco-apply-service.ts:252-257`.
- **Priorytet**: P1

### TEC-418: Close — superseding factory_spec musi być approved/released
- **Kroki**: 1) Zlinkuj superseding spec w `in_review`. 2) closeChangeOrder. 3) `supersession_invalid` ("complete Technical release before closing the ECO").
- **Oczekiwana logika**: `validateSupersedingFactorySpec` wymaga status ∈ `approved_for_factory|released_to_factory` (`eco-apply-service.ts:171-173`).
- **Priorytet**: P0

### TEC-419: Close BLOKOWANY z nie-implementing
- **Kroki**: 1) ECO approved. 2) closeChangeOrder. 3) `invalid_state`.
- **Oczekiwana logika**: FOR UPDATE SELECT `where status='implementing'` → brak → `invalid_state` (`close-change-order.ts:26-43`).
- **Priorytet**: P0

### TEC-420: Idempotencja apply — superseding BOM już `active`
- **Kroki**: 1) Superseding BOM `active`. 2) closeChangeOrder. 3) sukces, bez ponownego publishBomVersion.
- **Oczekiwana logika**: gałąź pomijająca publish gdy status ≠ `technical_approved` (`eco-apply-service.ts:238-248`; komentarz `:213-215`).
- **Priorytet**: P0

### TEC-421: Apply ECO dwukrotnie (podwójny close) — idempotencja
- **Kroki**: 1) Zamknij ECO (closed). 2) closeChangeOrder ponownie. 3) `invalid_state`.
- **Oczekiwana logika**: SELECT FOR UPDATE `status='implementing'` pusty (`close-change-order.ts:26-43`); `EcoCloseAbort` gdy zniknął w trakcie (`:66-67`).
- **Priorytet**: P0

### TEC-422: Close ECO z targetem item-only (bez propagacji)
- **Kroki**: 1) ECO impl. target item (bez BOM/spec). 2) closeChangeOrder. 3) closed, audit `eco.closed` (nie `eco.applied`).
- **Oczekiwana logika**: `applyEcoOnClose` zwraca `{applied:false}` (`eco-apply-service.ts:280`); wybór akcji audytu (`close-change-order.ts:80`).
- **Priorytet**: P1

### TEC-423: Close aborcyjny → rollback zapisów (EcoApplyAbort)
- **Kroki**: 1) publishBomVersion zwraca błąd nie-forbidden. 2) closeChangeOrder. 3) `supersession_invalid`, ECO wciąż implementing (rollback).
- **Oczekiwana logika**: `throw new EcoApplyAbort('supersession_invalid', ...)` po write (`eco-apply-service.ts:223`); łapane w akcji (`close-change-order.ts:95-97`).
- **Priorytet**: P1

### TEC-424: Walidacja effectivity (requestedEffectiveAt format)
- **Kroki**: 1) createChangeOrder z requestedEffectiveAt=`2026-13-40`. 2) `invalid_input`.
- **Oczekiwana logika**: `z.string().datetime({offset:true})` (`eco/_actions/shared.ts:65`).
- **Priorytet**: P2

### TEC-425: Izolacja org — ECO innego org niewidoczny
- **Kroki**: 1) ECO w org A. 2) Jako org B approveChangeOrder z tym id. 3) `not_found`.
- **Oczekiwana logika**: wszystkie zapytania `where org_id = app.current_org_id()` (`approve-change-order.ts:39`).
- **Priorytet**: P0

## Factory-specs — tworzenie i wersjonowanie (`technical/factory-specs/page.tsx`, `actions/*`)

### TEC-426: Create factory_spec (draft, FG only)
- **Kroki**: 1) createFactorySpec z fgItemId (fg). 2) status=`draft`, source=`technical`, version=1, audit `factory_spec.created`.
- **Oczekiwana logika**: guard `item_type !== 'fg' → invalid_input`; INSERT status `'draft'` (`factory-specs/actions/create-factory-spec.ts:56-58,105-111`).
- **Priorytet**: P0

### TEC-427: Create — auto-inkrementacja wersji pod advisory lock
- **Kroki**: 1) Utwórz 2 specs dla tego samego FG (współbieżnie). 2) Wersje 1 i 2, brak duplikatu.
- **Oczekiwana logika**: `pg_advisory_xact_lock(...':factory-spec:'...)` + `max(version)+1` (`create-factory-spec.ts:60-70`).
- **Priorytet**: P1

### TEC-428: Create z supersedesSpecId — walidacja lineage
- **Kroki**: 1) createFactorySpec z supersedesSpecId wskazującym draft/obcy FG. 2) `invalid_input`.
- **Oczekiwana logika**: SELECT walidujący status ∈ approved/released/superseded tego samego FG (`create-factory-spec.ts:74-90`).
- **Priorytet**: P1

### TEC-429: Create — auto-supersedes ostatniej factory-usable
- **Kroki**: 1) FG ma released spec v1. 2) createFactorySpec (bez supersedes). 3) supersedes_factory_spec_id = v1.
- **Oczekiwana logika**: fallback SELECT prior approved/released (`create-factory-spec.ts:91-103`).
- **Priorytet**: P2

### TEC-430: Submit for review (draft→in_review)
- **Kroki**: 1) spec draft. 2) `submitFactorySpecForReview`. 3) status=`in_review`, audit.
- **Oczekiwana logika**: `guardStatusTransition(draft,in_review)`; UPDATE `where status='draft'` (`factory-specs/actions/factory-spec-flow.ts:152-173`).
- **Priorytet**: P0

### TEC-431: Submit BLOKOWANY z nie-draft
- **Kroki**: 1) spec in_review. 2) submitFactorySpecForReview. 3) `invalid_state`.
- **Oczekiwana logika**: `if (spec.status !== 'draft')` (`factory-spec-flow.ts:152`).
- **Priorytet**: P1

### TEC-432: Link BOM — product match wymagany
- **Kroki**: 1) spec draft FG X. 2) linkFactorySpecBom z BOM produktu Y. 3) `product_mismatch`.
- **Oczekiwana logika**: `if (bom.product_id !== spec.fg_item_code)` (`factory-spec-flow.ts:233-239`).
- **Priorytet**: P0

### TEC-433: Link BOM tylko w draft/in_review
- **Kroki**: 1) spec approved_for_factory. 2) linkFactorySpecBom. 3) `invalid_state` (RELEASED_RECORD_IMMUTABLE).
- **Oczekiwana logika**: `guardBusinessFieldEdit` + `['draft','in_review'].includes` (`factory-spec-flow.ts:212-221`).
- **Priorytet**: P0

### TEC-434: Update spec — immutable gdy approved/released
- **Kroki**: 1) spec released. 2) updateFactorySpec (nowy specCode). 3) `invalid_state` (immutable, clone-on-write).
- **Oczekiwana logika**: `guardBusinessFieldEdit(spec.status)` (`factory-specs/actions/factory-spec-lifecycle.ts:124-127`); trigger DB `packages/db/migrations/165-factory-specs.sql:245-249`.
- **Priorytet**: P0

### TEC-435: Update spec draft — dozwolone
- **Kroki**: 1) spec draft. 2) updateFactorySpec. 3) sukces, audit `factory_spec.updated`.
- **Oczekiwana logika**: guard OK dla working states (`factory-spec-lifecycle.ts:124`).
- **Priorytet**: P1

### TEC-436: Delete spec tylko draft/in_review
- **Kroki**: 1) spec approved. 2) deleteFactorySpec. 3) `invalid_state`.
- **Oczekiwana logika**: `if (!['draft','in_review'].includes(spec.status))` (`factory-spec-lifecycle.ts:173-179`).
- **Priorytet**: P0

### TEC-437: Delete BLOKOWANY gdy referencowana (WO/release/supersedes)
- **Kroki**: 1) Draft spec z rekordem w factory_release_status. 2) deleteFactorySpec. 3) `referenced`.
- **Oczekiwana logika**: trzy kontrole referencji (`factory-spec-lifecycle.ts:181-227`) + FK `23503` (`:253-258`).
- **Priorytet**: P1

### TEC-438: saveFactorySpecVersion — clone nowej draft, archiwizacja starej
- **Kroki**: 1) spec draft v1 + changeReason(≥10 zn.). 2) saveFactorySpecVersion. 3) nowy spec v2 draft, stary v1 `archived`.
- **Oczekiwana logika**: INSERT nowej draft + UPDATE starej `status='archived'` (`factory-spec-lifecycle.ts:306-335`).
- **Priorytet**: P1

### TEC-439: saveFactorySpecVersion — changeReason min 10 znaków
- **Kroki**: 1) changeReason=`short`. 2) `invalid_input`.
- **Oczekiwana logika**: `z.string().trim().min(10)` (`factory-spec-lifecycle.ts:30`).
- **Priorytet**: P2

### TEC-440: RBAC create/update/delete/version — approve permission
- **Kroki**: 1) User bez `technical.product_spec.approve` i `technical.factory_spec.approve`. 2) createFactorySpec. 3) `forbidden`.
- **Oczekiwana logika**: `canApproveFactorySpec` (OR dwóch grantów) (`factory-specs/_actions/shared.ts:78-84`).
- **Priorytet**: P0

## Factory-specs — Bundle approval / release (`lib/technical/release-bundle-service.ts`, `actions/technical/release-bundles/*`, `factory-spec-flow.ts`)

### TEC-441: Approve bundle (in_review→approved_for_factory, atomowo)
- **Co sprawdza**: Zatwierdzenie pary factory_spec + BOM przenosi obie strony do factory-usable, emituje outbox, zamyka pętlę NPD.
- **Kroki**: 1) spec in_review sparowany z BOM draft, RM OK, PIN+reason poprawne, policy 1 approver. 2) approveReleaseBundleAction. 3) spec=`approved_for_factory`, BOM=`technical_approved`, outbox `technical.factory_spec.approved`.
- **Oczekiwana logika**: `guardStatusTransition(in_review,approved_for_factory)` + atomowy UPDATE obu (`release-bundle-service.ts:471-478,635-668,680-695`).
- **Priorytet**: P0

### TEC-442: Approve bundle BLOKOWANY — RBAC
- **Kroki**: 1) User bez `technical.product_spec.approve`. 2) approveReleaseBundleAction. 3) `forbidden`.
- **Oczekiwana logika**: `hasPermission(ctx, FACTORY_SPEC_APPROVE_PERMISSION)` (`release-bundle-service.ts:455-457`).
- **Priorytet**: P0

### TEC-443: Approve bundle BLOKOWANY — spec nie in_review
- **Kroki**: 1) spec w `draft`. 2) approveReleaseBundleAction. 3) `invalid_state` (draft→approved_for_factory nielegalne).
- **Oczekiwana logika**: `guardStatusTransition` — brak `approved_for_factory` w allowed dla `draft` (`factory-spec-release-guards.ts:55`; service `:472-478`).
- **Priorytet**: P0

### TEC-444: Approve bundle BLOKOWANY — para spec/BOM niezgodna
- **Kroki**: 1) spec sparowany z BOM A. 2) approve z bomHeaderId B. 3) `invalid_state`.
- **Oczekiwana logika**: `spec.bom_header_id !== bom.id || spec.bom_version !== bom.version` (`release-bundle-service.ts:480-486`, ponownie pod lockiem `:524-530`).
- **Priorytet**: P0

### TEC-445: Approve bundle BLOKOWANY — FG spec ≠ produkt BOM (anti-laundering)
- **Kroki**: 1) spec FG A, BOM product B. 2) approve. 3) `invalid_state` (FG mismatch).
- **Oczekiwana logika**: `specFgMatchesBomProduct` (`release-bundle-service.ts:497-503`, helper `:275-290`).
- **Priorytet**: P0

### TEC-446: Approve bundle BLOKOWANY — RM usability (nieaktywny komponent)
- **Kroki**: 1) BOM ma bom_line z item status≠active. 2) approve. 3) `release_blocked`, żadna strona nie zwolniona.
- **Oczekiwana logika**: `bomRmUsabilityFails` pod lockiem (`release-bundle-service.ts:544-550`, helper `:300-310`).
- **Priorytet**: P0

### TEC-447: Approve bundle BLOKOWANY — sourcing gate (V-TEC-14)
- **Kroki**: 1) BOM z komponentem bez sourcing. 2) approve. 3) `release_blocked` z komunikatem guarda.
- **Oczekiwana logika**: `bomSourcingGateMessage` → `validateBomApprovalGuards` (`release-bundle-service.ts:552-559,317-339`).
- **Priorytet**: P1

### TEC-448: Approve bundle — dual sign-off (drugi odrębny approver)
- **Kroki**: 1) Policy require_dual_sign_off. 2) User1 approve → `approvalStatus:'pending'`. 3) User2 approve → `complete`, spec approved.
- **Oczekiwana logika**: `resolveRequiredBundleApprovers` (dual→≥2), `countDistinctBundleApprovals` (`release-bundle-service.ts:146-168,601-632`).
- **Priorytet**: P0

### TEC-449: Approve bundle — ten sam approver nie może podpisać dwukrotnie
- **Kroki**: 1) User1 podpisał (pending). 2) User1 approve ponownie. 3) `invalid_state` ("already signed").
- **Oczekiwana logika**: `callerAlreadyApprovedBundle` (`release-bundle-service.ts:575-581,170-189`).
- **Priorytet**: P0

### TEC-450: Approve bundle — walidacja PIN/reason (e-sign)
- **Kroki**: 1) approve bez `pin` → `invalid_input`. 2) approve ze złym PIN → błąd e-sign/rollback.
- **Oczekiwana logika**: `ApproveBundleInput` (`pin.min(1)`, `reason.min(1).max(512)`) (`release-bundle-service.ts:123-130`); `signEvent` (`:584-599`).
- **Priorytet**: P0

### TEC-451: Approve bundle — supersedowanie poprzednich factory-usable specs
- **Kroki**: 1) FG ma released spec v1. 2) approve nowej v2. 3) v1 status=`superseded`.
- **Oczekiwana logika**: UPDATE `set status='superseded' ... status in (approved,released) and id<>` (`release-bundle-service.ts:670-678`).
- **Priorytet**: P1

### TEC-452: Approve bundle — zamknięcie pętli NPD (FG z npd_project_id)
- **Kroki**: 1) BOM NPD-originated, release record pending. 2) approve. 3) factory_release_status.release_status=`approved_for_factory`, active_factory_spec_id set.
- **Oczekiwana logika**: `closeNpdReleaseLoop` (`release-bundle-service.ts:402-439,697-703`).
- **Priorytet**: P1

### TEC-453: Reject bundle (→draft, BOM nietknięty, brak release)
- **Kroki**: 1) spec in_review. 2) rejectReleaseBundleAction z reason. 3) spec=`draft`, BOM bez zmian, brak eventu approved.
- **Oczekiwana logika**: UPDATE `status='draft' where status in (draft,in_review)`; BOM zostawiony (`release-bundle-service.ts:790-819`).
- **Priorytet**: P0

### TEC-454: Reject BLOKOWANY na factory-usable (immutable)
- **Kroki**: 1) spec approved. 2) reject. 3) `released_record_immutable`.
- **Oczekiwana logika**: `guardBusinessFieldEdit` (`release-bundle-service.ts:774-777`).
- **Priorytet**: P1

### TEC-455: Release to factory (approved→released), non-NPD
- **Kroki**: 1) spec approved_for_factory, approved_by/at set, bom paired, FG bez npd_project_id. 2) releaseFactorySpecToFactory. 3) status=`released_to_factory`, event `fg.released_to_factory`.
- **Oczekiwana logika**: guard status=approved + evidence + BOM + transition (`factory-spec-flow.ts:309-335`); persistence `insertReleasedToFactoryEvent`/`transitionFactorySpecToReleased` (`lib/technical/factory-release-persistence.ts:107-124`).
- **Priorytet**: P0

### TEC-456: Release BLOKOWANY — spec nie approved_for_factory
- **Kroki**: 1) spec in_review. 2) release. 3) `invalid_state`.
- **Oczekiwana logika**: `if (spec.status !== 'approved_for_factory')` (`factory-spec-flow.ts:309-314`).
- **Priorytet**: P0

### TEC-457: Release BLOKOWANY — FG NPD-backed wymaga handoff
- **Kroki**: 1) approved spec, FG.npd_project_id≠null. 2) release. 3) `npd_handoff_required`.
- **Oczekiwana logika**: `loadFgNpdProjectId` → jeśli set → `npd_handoff_required` (`factory-spec-flow.ts:323-330`).
- **Priorytet**: P0

### TEC-458: Release BLOKOWANY — brak evidence lub BOM
- **Kroki**: 1) approved spec bez approved_by/at lub bez bom_header_id. 2) release. 3) `invalid_state`.
- **Oczekiwana logika**: `factory-spec-flow.ts:316-321`.
- **Priorytet**: P1

### TEC-459: Release — supersedowanie i sync factory_release_status
- **Kroki**: 1) FG ma poprzednią released spec. 2) release nowej. 3) poprzednia `superseded`, factory_release_status zsynchronizowany.
- **Oczekiwana logika**: `supersedePriorReleasedFactorySpecs` + `syncFactoryReleaseStatusForReleasedSpec` (`factory-spec-flow.ts:345-351`; persistence `:40-54,169-192`).
- **Priorytet**: P1

### TEC-460: Release — dedup eventu (releaseAttemptKey)
- **Kroki**: 1) release spec. 2) release ponownie (ta sama approved_at). 3) event z tym samym dedup_key nie zduplikowany.
- **Oczekiwana logika**: `dedup_key` + `on conflict ... do nothing` (`factory-release-persistence.ts:60-85`).
- **Priorytet**: P2

## Factory-specs — Recall (`_actions/recall-spec.ts`, `lib/technical/recall-factory-spec-core.ts`)

### TEC-461: Recall released spec (released→draft, stampy wyczyszczone)
- **Kroki**: 1) spec released, brak blokujących WO. 2) recallFactorySpec. 3) status=`draft`, approved_by/at/released_by/at=null, factory_release_status=`pending_technical_approval`, audit `technical.factory_spec.recalled`.
- **Oczekiwana logika**: UPDATE released→draft z null stampami (`recall-factory-spec-core.ts:144-171`); trigger dopuszcza recall (`packages/db/migrations/453-factory-specs-allow-recall-transition.sql:30-53`).
- **Priorytet**: P0

### TEC-462: Recall BLOKOWANY — WO w RELEASED/IN_PROGRESS
- **Kroki**: 1) spec released, WO z active_factory_spec_id=spec, status IN_PROGRESS. 2) recallFactorySpec. 3) error z listą wo_number.
- **Oczekiwana logika**: `loadBlockingWorkOrders` (`upper(status) in ('RELEASED','IN_PROGRESS')`) → `formatBlockingWorkOrdersError` (`recall-factory-spec-core.ts:63-78,140-141`).
- **Priorytet**: P0

### TEC-463: Recall już-recalled / nie-released
- **Kroki**: 1) spec w draft. 2) recallFactorySpec. 3) error `factory_spec is draft; expected released_to_factory`.
- **Oczekiwana logika**: `if (spec.status !== 'released_to_factory') { if requireReleased return error }` (`recall-factory-spec-core.ts:130-134`); akcja używa `requireReleased=true` (`recall-spec.ts:43-46`).
- **Priorytet**: P0

### TEC-464: Recall — serializacja z bindem WO (advisory lock)
- **Kroki**: 1) Równolegle recall i releaseWorkOrder dla tego FG. 2) Jeden czeka na lock; brak stanu niespójnego.
- **Oczekiwana logika**: `acquireFactorySpecProductBindLock` (`lib/technical/factory-spec-bind-lock.ts:16-26`), użyty w recall (`recall-factory-spec-core.ts:137`).
- **Priorytet**: P1

### TEC-465: Recall RBAC
- **Kroki**: 1) User bez `technical.factory_spec.recall`. 2) recallFactorySpec. 3) `forbidden`.
- **Oczekiwana logika**: `hasPermission(ctx, FACTORY_SPEC_RECALL_PERMISSION)` (`factory-specs/_actions/recall-spec.ts:39-41`).
- **Priorytet**: P0

### TEC-466: Recall — reason opcjonalny/normalizowany
- **Kroki**: 1) recall z reason `"   "` (whitespace). 2) reason zapisany jako null.
- **Oczekiwana logika**: `normalizeReason` trim→null (`recall-spec.ts:25-28`; core `:124-125`).
- **Priorytet**: P2

## Release-bundle — read model / assembly (`factory-specs/_actions/bundle-data.ts`, `release-bundle-panel.client.tsx`)

### TEC-467: Load bundle — panel blockers agregacja
- **Kroki**: 1) spec z niekompletnym BOM/RM. 2) loadReleaseBundle. 3) `blockers[]` z odpowiednimi kodami, `canApprove`.
- **Oczekiwana logika**: obliczanie blockerów bez mutacji (`factory-specs/_actions/bundle-data.ts:172-261`).
- **Priorytet**: P1

### TEC-468: Load bundle — brak sparowanego BOM → NO_PAIRED_BOM
- **Kroki**: 1) spec bez bom_header_id. 2) loadReleaseBundle. 3) blocker `NO_PAIRED_BOM`.
- **Oczekiwana logika**: `if (!bom) blockers.push NO_PAIRED_BOM` (`bundle-data.ts:206-213`).
- **Priorytet**: P2

### TEC-469: Load bundle — cloneOnWrite dla immutable spec
- **Kroki**: 1) spec released. 2) loadReleaseBundle. 3) `cloneOnWrite:true`.
- **Oczekiwana logika**: `guardBusinessFieldEdit` → RELEASED_RECORD_IMMUTABLE (`bundle-data.ts:186-188`).
- **Priorytet**: P2

### TEC-470: Load bundle — D365 informational, nigdy nie blokuje
- **Kroki**: 1) Feature flag d365 disabled/enabled. 2) loadReleaseBundle. 3) blocker `D365_INFORMATIONAL` severity info.
- **Oczekiwana logika**: `bundle-data.ts:263-278`; niezależność D365 od release (`factory-spec-release-guards.ts:132-134`).
- **Priorytet**: P1

### TEC-471: Load bundle — historia z audit_events (nie audit_log)
- **Kroki**: 1) spec z zapisami create/recall. 2) loadReleaseBundle. 3) history niepusta.
- **Oczekiwana logika**: SELECT z `audit_events` resource_type='factory_spec' (`bundle-data.ts:284-296`).
- **Priorytet**: P2

### TEC-472: Load bundle not_found — inny org / brak spec
- **Kroki**: 1) loadReleaseBundle z obcym UUID. 2) `not_found`.
- **Oczekiwana logika**: RLS `where fs.org_id=app.current_org_id()` (`bundle-data.ts:110-130`).
- **Priorytet**: P1

### TEC-473: Approve/Reject action — rewalidacja ścieżek po sukcesie
- **Kroki**: 1) approveReleaseBundleAction success. 2) rewalidacja factorySpecId.
- **Oczekiwana logika**: `safeRevalidateBundlePaths` tylko przy ok (`actions/technical/release-bundles/approve-bundle.ts:35-37`; reject `reject-bundle.ts:23-25`).
- **Priorytet**: P2

### TEC-474: Approve action — mapowanie PG 23514 → invalid_state
- **Kroki**: 1) Wymuś 23514 z DB triggera. 2) approveReleaseBundleAction. 3) `invalid_state` (nie 500).
- **Oczekiwana logika**: `if (isPgError && code==='23514') return invalid_state` (`approve-bundle.ts:40-42`; service rethrow `release-bundle-service.ts:741-743`).
- **Priorytet**: P1

## Compliance — Dashboard (`technical/compliance/page.tsx`, `_actions/load-compliance.ts`)

### TEC-475: Load compliance — coverage 5 regulacji (real aggregate)
- **Kroki**: 1) Org z FG (część z allergen profile / approved spec / shelf-life / supplier spec / lab). 2) loadCompliance. 3) 5 `regulations` z covered/total/coveragePct/tone.
- **Oczekiwana logika**: agregat FG (EU1169/FSMA204/BRCGS/ISO22000/EU2023-915) + `mk(...)` (`compliance/_actions/load-compliance.ts:97-167`).
- **Priorytet**: P1

### TEC-476: FSMA204 coverage = FG z approved/released factory_spec
- **Kroki**: 1) FG bez approved spec. 2) loadCompliance. 3) flag `factory_spec_unapproved` (severity high, route technical).
- **Oczekiwana logika**: `has_approved_spec` (`status in (approved_for_factory,released_to_factory)`) (`load-compliance.ts:106-110,184-193`).
- **Priorytet**: P1

### TEC-477: EU2023/915 — failing lab → flag route to Quality
- **Kroki**: 1) FG z lab_result status `fail`. 2) loadCompliance. 3) flag `lab_result_failing` routeTo=`quality`.
- **Oczekiwana logika**: `has_failing_lab` (`fail/hold`) + routing (`load-compliance.ts:117-121,206-217`).
- **Priorytet**: P2

### TEC-478: Empty state — brak aktywnych FG
- **Kroki**: 1) Org bez FG. 2) loadCompliance. 3) `state:'empty'`.
- **Oczekiwana logika**: `state: fgTotal===0 ? 'empty' : 'ready'` (`load-compliance.ts:220-221`).
- **Priorytet**: P2

### TEC-479: Degradacja — brak danych = open-gap (nie fabrykowany %)
- **Kroki**: 1) FG bez shelf_life_days. 2) coverage BRCGS liczy jako gap.
- **Oczekiwana logika**: `(i.shelf_life_days is not null) as has_shelf_life` (`load-compliance.ts:111`); `pct` z total<=0→100 (`:63-66`).
- **Priorytet**: P2

### TEC-480: Truncation przy >500 FG
- **Kroki**: 1) Org z >500 aktywnych FG. 2) loadCompliance. 3) `truncated:true`, fgTotalAvailable>fgTotal.
- **Oczekiwana logika**: `FG_LIMIT=500` + `count(*) over ()` (`load-compliance.ts:81,126,228`).
- **Priorytet**: P2

### TEC-481: Izolacja org — coverage tylko własnego org
- **Kroki**: 1) FG w org A i B. 2) loadCompliance jako A. 3) tylko FG A liczone.
- **Oczekiwana logika**: wszystkie subqueries `org_id=app.current_org_id()` (`load-compliance.ts:98-133`).
- **Priorytet**: P0

### TEC-482: Compliance jest read-only (brak CRUD/expiry write path)
- **Kroki**: 1) Przegląd katalogu `technical/compliance/_actions`. 2) Tylko `load-compliance.ts`/`shared.ts`.
- **Oczekiwana logika**: Brak `'use server'` mutacji; nagłówek "no write path" (`load-compliance.ts:26-28`). Patrz Niepewności.
- **Priorytet**: P1

## Traceability — Genealogy lookups (`technical/traceability/page.tsx`, `_actions/search-traceability.ts`)

### TEC-483: Wyszukiwanie po LP / batch / item code
- **Kroki**: 1) Podaj batch_number LP. 2) searchTraceability. 3) node `license_plate` + powiązane.
- **Oczekiwana logika**: seed_lps ILIKE po lp_number/lp_code/batch/supplier_batch/item_code (`traceability/_actions/search-traceability.ts:91-103`).
- **Priorytet**: P1

### TEC-484: Kierunek backward (upstream — konsumpcja/komponenty)
- **Kroki**: 1) searchTraceability(direction='backward') dla WO. 2) Węzły consumption/bom_line, brak forward outputs.
- **Oczekiwana logika**: `includeBackward` = $3 steruje consumption/bom_line branch (`search-traceability.ts:80,147,217,251`).
- **Priorytet**: P1

### TEC-485: Kierunek forward (downstream — outputs/LP)
- **Kroki**: 1) searchTraceability(direction='forward'). 2) Węzły wo_output + edge produced/contains.
- **Oczekiwana logika**: `includeForward` = $4 (`search-traceability.ts:81,153,342,355`).
- **Priorytet**: P1

### TEC-486: Both — pełna genealogia lotu (upstream+downstream)
- **Kroki**: 1) searchTraceability(query=WO). 2) Węzły LP/output/consumption/WO/bom_line + edges relation.
- **Oczekiwana logika**: default `'both'` (`search-traceability.ts:21`), touched_wos/touched_lps CTE (`:131-168`).
- **Priorytet**: P0

### TEC-487: Traceability RBAC
- **Kroki**: 1) User bez `quality.dashboard.view`. 2) searchTraceability. 3) `forbidden`.
- **Oczekiwana logika**: `hasPermission(..., TECHNICAL_READ_PERMISSION='quality.dashboard.view')` (`search-traceability.ts:10,85`) — pożyczony grant, patrz Niepewności.
- **Priorytet**: P0

### TEC-488: Walidacja query (min 1, max 128) i limit (1-100)
- **Kroki**: 1) query=''. 2) `invalid_input`. 3) limit=500 → clamp/reject.
- **Oczekiwana logika**: `TraceabilitySearchInput` (`search-traceability.ts:19-23`).
- **Priorytet**: P2

### TEC-489: Transfer orders w genealogii (source/dest LP)
- **Kroki**: 1) query=TO number. 2) searchTraceability. 3) LP z transfer_order_line_lps w touched_lps.
- **Oczekiwana logika**: seed_transfer_orders + union source/dest lp (`search-traceability.ts:124-167`).
- **Priorytet**: P2

### TEC-490: Izolacja org — traceability tylko własnego org
- **Kroki**: 1) LP w org A. 2) Jako org B searchTraceability(A batch). 3) pusty wynik.
- **Oczekiwana logika**: każdy CTE/branch `org_id=app.current_org_id()` (`search-traceability.ts:94,109,120`).
- **Priorytet**: P0

### TEC-491: FEFO flag w węźle consumption
- **Kroki**: 1) Konsumpcja z fefo_adherence_flag=false. 2) node status=`FEFO_DEVIATION`.
- **Oczekiwana logika**: `case when c.fefo_adherence_flag then 'FEFO' else 'FEFO_DEVIATION'` (`search-traceability.ts:212`).
- **Priorytet**: P2

## ECO/Factory-specs — przekrojowe RLS/audyt

### TEC-492: Cross-org bundle approve → not_found (bez leaku istnienia)
- **Kroki**: 1) spec org A. 2) approveReleaseBundleAction jako org B. 3) `not_found`.
- **Oczekiwana logika**: `loadFactorySpec`/`loadBom` RLS-scoped, komentarz o nie-leakowaniu (`release-bundle-service.ts:459-463`).
- **Priorytet**: P0

### TEC-493: Recall/release piszą audyt w audit_events
- **Kroki**: 1) Wykonaj recall i release. 2) Sprawdź audit_events.
- **Oczekiwana logika**: recall audit (`recall-factory-spec-core.ts:87-113`), release audit `factory_spec.released_to_factory` (`factory-spec-flow.ts:353-360`).
- **Priorytet**: P1

### TEC-494: ECO audyt dwutorowy (change_order_audit + audit_log)
- **Kroki**: 1) approve ECO. 2) Sprawdź technical_change_order_audit i audit_log.
- **Oczekiwana logika**: `writeEcoAudit` (`eco/_actions/shared.ts:196-217`).
- **Priorytet**: P2

### TEC-495: Immutability — próba UPDATE approved spec w DB → 23514
- **Kroki**: 1) SQL UPDATE spec_code na approved_for_factory row. 2) Wyjątek 23514.
- **Oczekiwana logika**: trigger `factory_specs_enforce_clone_on_write` (`packages/db/migrations/165-factory-specs.sql:224-249`; recall wyjątek mig 453).
- **Priorytet**: P0

### TEC-496: Guard UNKNOWN_STATUS
- **Kroki**: 1) guardStatusTransition('foo','draft'). 2) `UNKNOWN_STATUS`.
- **Oczekiwana logika**: `factory-spec-release-guards.ts:74-80`.
- **Priorytet**: P2

### TEC-497: D365 metadata update nie zmienia release status
- **Kroki**: 1) approved spec. 2) guardD365MetadataUpdate. 3) OK; canonical status niezmieniony.
- **Oczekiwana logika**: `guardD365MetadataUpdate` zawsze OK (`factory-spec-release-guards.ts:132-134`); adapters nigdy nie czytają D365 (`release-state-adapters.ts:19-25`).
- **Priorytet**: P1

### TEC-498: Badge metadata — mapowanie spec status → canonical + allowedActions
- **Kroki**: 1) specBadge('approved_for_factory'). 2) factoryUsable=true, allowedActions=[release_to_factory,clone_for_edit].
- **Oczekiwana logika**: `BADGE_TABLE` + `specStatusToCanonical` (`release-state-adapters.ts:73-86,145-196`).
- **Priorytet**: P2

### TEC-499: NPD-seeded spec ląduje w in_review (G4 ≠ factory approval)
- **Kroki**: 1) Seed spec z NPD handoff. 2) status=`in_review`, nigdy approved_for_factory.
- **Oczekiwana logika**: `initialSpecStatusFromNpdBuilder()` = `'in_review'` (`release-state-adapters.ts:93-95`; komentarz `:22-24`).
- **Priorytet**: P1

---
# Niepewności

Rzeczy, których nie dało się jednoznacznie ustalić z kodu — do potwierdzenia z ownerem/na żywej bazie. Kilka z nich to prawdopodobne realne bugi, nie tylko luki wiedzy.

## Items / Materials
1. **net_qty_per_each — rozbieżność precyzji**: app waliduje 6dp (`items/_actions/shared.ts:106`), DB z mig 267 to `numeric(12,4)`. Komentarz w kodzie powołuje się na "migration 502" — nie zweryfikowano, czy 502 podnosi precyzję do (18,6). TEC-019 może wymagać korekty oczekiwania po sprawdzeniu realnego typu kolumny na prod.
2. **Model statusów — dwa źródła prawdy**: DB CHECK (mig 231) dopuszcza `development|pilot|discontinued`, app enum nie (`shared.ts:40`). Jeśli Settings Products realnie ustawia te statusy na wierszach współdzielonych z Technical, TEC-096 dokumentuje realny bug wyświetlania (wiersze znikają z listy).
3. **blocked→active — rozstrzygnięte 2026-07-30**: owner zachował przejście; `active` jest prawidłowym targetem `transitionItemStatus`, a wspólny `ALLOWED_STATUS_TRANSITIONS` obsługuje też `updateItem` (`shared.ts:497-509`, `transition-item-status.ts:65-98`).
4. **Materials**: brak osobnej tabeli/pól — profil alergenów i koszt to atrybuty itemu. Plik `materials-packaging.evidence.test.tsx` sugeruje dodatkowe reguły packaging, których nie otwarto.
5. **Walidacje klienta wizarda** (`item-create-wizard.tsx`) nie zostały porównane z serwerowymi — testy zakładają parytet.
6. **API `api/technical/items/[item_code]/allergens`** — warstwa HTTP items pokryta w sekcji Allergens (TEC-300+), ale metody/statusy per-route nie były audytowane wyczerpująco po stronie items.

## BOM / Revisions / WIP
7. **Brak DB-unikatu `(bom_header_id, component_code)`** — duplikaty komponentu w jednej wersji przechodzą; diff keyuje po `item_id` (`diff.ts:41-43`), więc dwie linie tego samego item_id kolidują na kluczu mapy — druga nadpisuje pierwszą. Potencjalny bug diffu (TEC-134).
8. **Cykl tylko nad `active`** — łańcuch cykli złożony wyłącznie z draftów NIE jest wykrywany w create/append/approve; nie znaleziono guardu w `publishBom` re-sprawdzającego cykl przy aktywacji (cykl może się domknąć publikacją). Prawdopodobna luka (TEC-107/108).
9. **`actions/technical/boms/validate-component.ts`** — samodzielny seam enforcement; nie potwierdzono, skąd wywoływany (panel podglądu?).
10. **Numeracja wersji: `item_id` vs `product_id`** — createBomDraft liczy max po `item_id`, disassembly po `product_id` — możliwa rozbieżność numeracji między ścieżkami dla tego samego FG.
11. **Przejście draft→in_review** — nie znaleziono osobnej akcji "Submit for review" w `_actions/`; możliwe, że `in_review` powstaje wyłącznie przez clone-on-write (mig 168). Do potwierdzenia w UI.
12. **`bom_factory_release_bundle_decision` (mig 168 §3)** — atomowa decyzja FactorySpec+BOM wywoływana z serwisu release-bundles; pokryta w sekcji E, nie w akcjach BOM.

## Cost / Routings / Tooling
13. **`tooling-list.client.tsx:57-61` używa `Number(value).toFixed(4)`** na cost_per_hour — jedyne miejsce z JS float na koszcie w module (reszta rygorystycznie BigInt/string). Display-only czy bug — do potwierdzenia; sugerowany test regresyjny (TEC-278).
14. **D365 cost import** — realna walidacja w `(admin)/settings/integrations/d365/cost-import`; szczegóły walidacji pliku/mapowania poza zakresem tego katalogu. Wiadomo: import pisze `source='d365_sync'` → bypass V-TEC-53.
15. **`disassembly_allocation` jako CostSource** — typ TS go zawiera, enum zod `COST_SOURCES` NIE → `postCost` go odrzuci; a `list-cost-history` mapuje go na null source (badge "—"). Wpisywany przez inny moduł — do potwierdzenia renderowanie.
16. **V-TEC-64 constraint DB** — kod mapuje 23514 z nazwą `routing_cross_site_lines`, nie potwierdzono istnienia constraintu w migracji 163/503.
17. **labor_rates twardo filtruje `currency='GBP'`** (`cost-preview.ts:98`) — org z labor w innej walucie dostanie rate 0. Zamierzone (GBP-only) czy gap multi-currency — do potwierdzenia.
18. **`bom_headers.total_material_cost`** — getRecipeCost liczy inline, nie czyta kolumny; jeśli istnieje osobny writer tej kolumny, możliwa rozbieżność — warto test spójności.

## Allergens / Nutrition / Shelf-life / Sensory / Lab
19. **Kaskada — brak prune martwych cascaded wierszy (TEC-334)**: `cascadeAllergensForChangedItem` tylko UPSERT-uje obliczony zbiór; brak DELETE dla alergenów, które przestały być wnoszone (`cascade.ts:102-131`). Gdy RM straci alergen, stary wiersz `source='cascaded'` na FG może zostać. PRAWDOPODOBNY BUG bezpieczeństwa żywności — potwierdzić, czy istnieje osobny reconcile/prune.
20. **`not_applicable` → 500**: `service.ts:106` zwraca `not_applicable`, ale `http.ts` nie ma tego w switchu → default 500 zamiast 4xx. Do potwierdzenia z ownerem.
21. **Shelf-life — brak kodu liczącego datę ważności w Technical**: formuła data_produkcji + shelf_life_days jest konceptualna; stemplowanie daty na partii robi prawdopodobnie produkcja/etykietowanie — nie zweryfikowano tam (TEC-357).
22. **Nutrition — formuła własnością NPD**: per-100g/per-porcja liczone i materializowane przez NPD (`packages/domain/src/nutrition/compute-nutrition.ts`); Technical jest czytelnikiem `nutrition_profiles`. Brak Nutri-Score/zaokrągleń per-etykieta po stronie Technical.
23. **Nutrition orphan-bridge — niekanoniczne kody alergenów** ('A01','soya') bez rozwiązania nazwy z Reference — obecny fallback `name ?? code`; docelowa normalizacja niezaimplementowana.
24. **Lab-results — brak dedykowanego `technical.lab.read`**: gate = "dowolne technical.*" — celowe wg komentarza, ale szerzej niż intuicja.
25. **Sensory read-model** (`list-sensory.ts`, `get-sensory-evaluation.ts`) — nie otwarte w pełni; testy pokrywają write-path, read-listę/detal można dodać analogicznie.

## ECO / Factory-specs / Compliance / Traceability
26. **Compliance nie ma CRUD dokumentów ani wygasania** — katalog `_actions` zawiera wyłącznie read-only dashboard. "Expiry" istnieje tylko pośrednio jako lab fail/hold. Testy CRUD/expiry dokumentów nieaplikowalne do obecnej implementacji.
27. **ECO nie ma ścieżki reject/cancel/revert** — enum i akcje pokrywają tylko ruch do przodu. Jeśli produkt tego wymaga — luka funkcjonalna, nie tylko brak testu.
28. **`link-eco-supersession` pod `technical.eco.write`, nie approve** — linkowanie superseding wersji (wpływające na apply) pod słabszym uprawnieniem niż approve ECO. Celowe? Do potwierdzenia.
29. **Traceability RBAC pożycza `quality.dashboard.view`** — jawny TODO w kodzie o dedykowanym `technical.traceability.read`; po seedzie nowego grantu testy do aktualizacji.
30. **Panel UI PIN/reason** (`release-bundle-panel.client.tsx`, modale lifecycle) — nie otwarte w pełni; testy formularza client-side wymagają osobnego przejścia.
31. **Dwa różne klucze advisory-lock dla sekwencji wersji factory-spec** — `create-factory-spec.ts` (`':factory-spec:'`) vs `saveFactorySpecVersion` (`':factory-spec-version:'`) dla tej samej sekwencji wersji tego samego FG. Potencjalny wyścig wersji między ścieżkami tworzenia — możliwy realny bug.


---
<a id="sekcja-b"></a>
# B — Planning: pełny katalog testów

Ścieżki skrócone: `planning/` = `apps/web/app/[locale]/(app)/(modules)/planning/`; `lib/` = `apps/web/lib/`.
Statusy WO (uppercase): `DRAFT, RELEASED, IN_PROGRESS, ON_HOLD, COMPLETED, CLOSED, CANCELLED` (`work-orders/_actions/shared.ts:176`).
Statusy PO: `draft, sent, confirmed, partially_received, received, cancelled` (`_actions/procurement-shared.ts:63-70`).
Statusy TO: `draft, in_transit, partially_received, received, cancelled` (`procurement-shared.ts:71`).
Uprawnienia: `npd.planning.write`, `scheduler.run.read`, `planning.po.manage`, `planning.to.manage`, `planning.supplier.manage` (`procurement-shared.ts:7-11`), `planning.forecast.manage` (`_actions/forecasts.ts:42`), `freight.manage` (`_actions/freight-actions.ts:67`), `warehouse.transfer.correct` (`transfer-orders/_actions/reverse-receive.ts:30`).

---

## Work Orders (`/planning/work-orders`, `/new`, `/[id]`, `/station`)

### PLN-001: Utworzenie WO — status początkowy DRAFT
- **Co sprawdza**: każde nowe WO ma status `DRAFT` niezależnie od inputu.
- **Kroki**: 1) Otwórz `/planning/work-orders/new`, wypełnij produkt+ilość, zapisz. 2) Sprawdź status na liście i w `wo_status_history`.
- **Oczekiwana logika**: insert z literalnym `'DRAFT'` (`work-orders/_actions/create-work-order-core.ts:201`); historia `null → DRAFT`, action `create` (`:315`).
- **Priorytet**: P0

### PLN-002: Walidacja plannedQuantity przy create — dodatnia, max 4 dp
- **Co sprawdza**: odrzucenie `0`, wartości ujemnych, >4 miejsc dziesiętnych, tekstu.
- **Kroki**: 1) Spróbuj utworzyć WO z qty `0`, `-1`, `1.12345`, `abc`. 2) Oczekuj `invalid_input`/błąd walidacji formularza.
- **Oczekiwana logika**: regex `/^\d+(?:\.\d{1,4})?$/` + refine `> 0` (`shared.ts:268-272`).
- **Priorytet**: P0

### PLN-003: quantityEntered wymaga quantityEnteredUom
- **Co sprawdza**: cross-field refine — podanie ilości w each/box bez wskazania UoM.
- **Kroki**: 1) Wyślij payload z `quantityEntered` bez `quantityEnteredUom`. 2) Oczekuj `invalid_input`.
- **Oczekiwana logika**: `.refine` na `CreateWorkOrderInput` (`shared.ts:283-286`); enum UoM = `['base','each','box']` (`shared.ts:279`).
- **Priorytet**: P1

### PLN-004: Konwersja each/box → base przy create
- **Co sprawdza**: `planned_quantity` = przeliczona ilość bazowa z pack hierarchy.
- **Kroki**: 1) Item z `net_qty_per_each=0.5`, `each_per_box=10`. 2) Utwórz WO na `2 box`. 3) Sprawdź `planned_quantity = 10.000` (2×10×0.5).
- **Oczekiwana logika**: `toBaseQtyFromDecimal(uomSnapshot, qty, uom)` (`create-work-order-core.ts:140`); brak faktorów → `uom_conversion_unavailable` (`:147`).
- **Priorytet**: P0

### PLN-005: Brak pack hierarchy → uom_conversion_unavailable / pack_hierarchy_incomplete
- **Co sprawdza**: item z output_uom `each`/`box` bez `net_qty_per_each`.
- **Kroki**: 1) Item bez faktorów pack. 2) Utwórz WO w `each`. 3) Oczekuj błędu, brak wiersza WO.
- **Oczekiwana logika**: `create-work-order-core.ts:147`; scalar materiałowy `computeWoMaterialScalar` → `WoMaterialScalarError` → `pack_hierarchy_incomplete` (`:173,181`).
- **Priorytet**: P1

### PLN-006: Snapshot materiałów WO ze scrapem — wzór ÷(1−scrap)
- **Co sprawdza**: `wo_materials.required_qty` uwzględnia scrap_pct z BOM.
- **Kroki**: 1) BOM z linią qty=10, scrap_pct=20. 2) Utwórz WO na 1 jednostkę bazową. 3) Sprawdź `required_qty = round(10/0.8, 3) = 12.500`.
- **Oczekiwana logika**: `round((bl.quantity * scalar) / greatest(1 - coalesce(bl.scrap_pct,0)/100.0, 0.01), 3)` (`create-work-order-core.ts:247`).
- **Priorytet**: P0

### PLN-007: Scrap 100% — floor mianownika 0.01
- **Co sprawdza**: brak dzielenia przez zero przy scrap_pct=100.
- **Kroki**: 1) Linia BOM scrap_pct=100, qty=1. 2) Utwórz WO. 3) `required_qty = round(1/0.01,3) = 100.000` (nie błąd/∞).
- **Oczekiwana logika**: `greatest(..., 0.01)` w SQL; `Math.max(..., 0.01)` w TS (`create-work-order-chain.ts:424-429`).
- **Priorytet**: P1

### PLN-008: Czas operacji z routingu — setup + ceil(run×qty/60)
- **Co sprawdza**: `wo_operations.expected_duration_minutes` z aktywnego routingu.
- **Kroki**: 1) Routing: setup 10 min, run 30 s/szt. 2) WO na 100 szt. 3) Duration = 10 + ceil(3000/60) = 60.
- **Oczekiwana logika**: `coalesce(setup,0) + coalesce(ceil((run_time_per_unit_sec * qty)/60.0),0)`; overflow > 2147483647 → null (`create-work-order-core.ts:274-279`).
- **Priorytet**: P1

### PLN-009: Brak routingu / brak BOM przy create
- **Co sprawdza**: WO bez aktywnego routingu tworzy się bez operacji; convert MRP bez BOM jest skippowany (PLN-057).
- **Kroki**: 1) Produkt bez routingu. 2) Utwórz WO. 3) Zero wierszy `wo_operations`, WO utworzone poprawnie.
- **Oczekiwana logika**: insert operacji z `select … from routing_operations` — pusty select = brak wierszy, brak błędu (`create-work-order-core.ts` insert operacji).
- **Priorytet**: P1

### PLN-010: Duplikat wo_number — retry vs persistence_failed
- **Co sprawdza**: kolizja 23505 na numerze: auto-numer → retry z nowym numerem; numer podany ręcznie → błąd.
- **Kroki**: 1) Utwórz WO z documentNumber X. 2) Utwórz drugie z tym samym X. 3) Oczekuj błędu; bez documentNumber — sukces z kolejnym numerem.
- **Oczekiwana logika**: `create-work-order-core.ts:233-235`.
- **Priorytet**: P1

### PLN-011: Site fail-closed — no_active_site / ambiguous_site
- **Co sprawdza**: WO nie zapisze się z site_id NULL.
- **Kroki**: 1) User bez aktywnego site (lub z ≥2 bez wyboru). 2) Utwórz WO. 3) Oczekuj `no_active_site`/`ambiguous_site`, brak wiersza.
- **Oczekiwana logika**: `resolveWriteSiteId` (`shared.ts:27-32`, użycie `create-work-order-core.ts:81-83`).
- **Priorytet**: P0

### PLN-012: Linia produkcyjna z innego site → line_site_mismatch
- **Co sprawdza**: guard site linii przy create i edit.
- **Kroki**: 1) Wybierz linię przypisaną do innego site niż WO. 2) Zapisz. 3) Oczekuj `line_site_mismatch`.
- **Oczekiwana logika**: `lib/planning/production-line-site.ts:34-40`; wywołania `create-work-order-core.ts:89`, `update-work-order.ts:111`; linia nieaktywna/nieistniejąca → `forbidden` (`update-work-order.ts:253-254`).
- **Priorytet**: P1

### PLN-013: Factory-release gate dla FG z NPD
- **Co sprawdza**: FG powiązane z projektem NPD bez `released_to_factory` nie może dostać WO; legacy FG (bez npd_project_id) przechodzi.
- **Kroki**: 1) FG z `npd_project_id` i release_status ≠ `released_to_factory`. 2) Utwórz WO. 3) Oczekuj `not_released_to_factory`; item nie pojawia się też w pickerze.
- **Oczekiwana logika**: `lib/planning/factory-release-wo-gate.ts:16-38,57`; picker SQL w `wo-form-data.ts:96`; pomijane dla `intermediate` i `skipFactoryReleaseGate` (`create-work-order-core.ts:118-119`).
- **Priorytet**: P0

### PLN-014: Edycja WO — tylko DRAFT
- **Co sprawdza**: update WO w statusie RELEASED/innych → `invalid_state`.
- **Kroki**: 1) Zwolnij WO. 2) Spróbuj edytować qty/notes. 3) Oczekuj `invalid_state`.
- **Oczekiwana logika**: guard `current.status !== 'DRAFT'` (`update-work-order.ts:249`) + re-assert w UPDATE `and wo.status='DRAFT'` (`:335`).
- **Priorytet**: P0

### PLN-015: Rozjazd precyzji qty: create 4 dp vs update 3 dp
- **Co sprawdza**: WO utworzone z qty `1.1234` nie da się zapisać ponownie bez zmiany (update przyjmuje max 3 dp).
- **Kroki**: 1) Utwórz WO qty `1.1234`. 2) Otwórz edycję, zapisz tę samą wartość. 3) Zaobserwuj wynik (`invalid_input`?).
- **Oczekiwana logika**: create regex 4 dp (`shared.ts:271`) vs update regex 3 dp (`update-work-order.ts:63-68`) — udokumentowana niespójność.
- **Priorytet**: P2

### PLN-016: Edycja qty → resnapshot materiałów i operacji
- **Co sprawdza**: zmiana planned_quantity w DRAFT przelicza `wo_materials` (ten sam wzór scrap) i `wo_operations`.
- **Kroki**: 1) WO DRAFT qty 10 → edytuj na 20. 2) Sprawdź podwojone required_qty i nowe duration.
- **Oczekiwana logika**: `update-work-order.ts:182` (wzór jak PLN-006), `:203-208` (duration); historia `DRAFT→DRAFT` action `update` (`:397`).
- **Priorytet**: P0

### PLN-017: Wyczyszczenie scheduled_start / linii przy edit (null vs undefined)
- **Co sprawdza**: `productionLineId: null` czyści pole, `undefined` zostawia bez zmian.
- **Kroki**: 1) WO z linią i datą. 2) Wyślij update z `productionLineId: null`. 3) Pole wyczyszczone; update bez pola — bez zmiany.
- **Oczekiwana logika**: `update-work-order.ts:69-71` (nullable/optional semantyka).
- **Priorytet**: P2

### PLN-018: Release WO — DRAFT → RELEASED + self-heal artefaktów
- **Co sprawdza**: release przypina active_bom_header_id / active_factory_spec_id / uom_snapshot gdy null i flipuje status.
- **Kroki**: 1) WO DRAFT z kompletnym BOM+spec. 2) Release. 3) Status RELEASED, artefakty wypełnione, historia `DRAFT→RELEASED` action `release`.
- **Oczekiwana logika**: `releaseWorkOrder.ts:229-303`; UPDATE gated `and wo.status='DRAFT'` (`:284`).
- **Priorytet**: P0

### PLN-019: Release idempotentny — ponowny release RELEASED zwraca ok
- **Co sprawdza**: brak `invalid_state` przy podwójnym kliknięciu release.
- **Kroki**: 1) Release WO. 2) Release ponownie. 3) `ok:true` z istniejącym WO; brak drugiego wpisu historii.
- **Oczekiwana logika**: short-circuit `releaseWorkOrder.ts:191-207`; statusy inne niż DRAFT/RELEASED → `invalid_state` (`:208`).
- **Priorytet**: P1

### PLN-020: Release bez aktywnego BOM/spec → factory_release_incomplete
- **Co sprawdza**: gate preflight z listą braków.
- **Kroki**: 1) WO DRAFT na FG bez factory spec `approved_for_factory`/`released_to_factory`. 2) Release. 3) `factory_release_incomplete`, `missing:['factory_spec']`; analogicznie brak BOM → `active_bom`.
- **Oczekiwana logika**: `evaluateReleasePreflight` (`releaseWorkOrder.ts:129-160`); `intermediate` NIE wymaga factory spec (`:145-147`).
- **Priorytet**: P0

### PLN-021: Release z niekompletną pack hierarchy → pack_hierarchy_incomplete
- **Co sprawdza**: output_uom each/box bez faktorów blokuje release.
- **Kroki**: 1) WO DRAFT, item output_uom `box`, usuń `each_per_box`. 2) Release. 3) Błąd, status pozostaje DRAFT.
- **Oczekiwana logika**: `packHierarchyComplete` tylko dla each/box (`releaseWorkOrder.ts:130-138`).
- **Priorytet**: P1

### PLN-022: Upstream-WIP gate — release FG blokowany przez DRAFT dziecko
- **Co sprawdza**: WO rodzic nie może być zwolniony, gdy WIP dziecko jest DRAFT/CANCELLED.
- **Kroki**: 1) Łańcuch FG+WIP; dziecko DRAFT. 2) Release samego rodzica. 3) `upstream_wip_not_ready` z listą blokerów.
- **Oczekiwana logika**: `release_blocked = upper(child.status) in ('DRAFT','CANCELLED')` (`lib/planning/upstream-wip-dependency-gate.ts:49`); komunikat `:111`; wywołanie `releaseWorkOrder.ts:219-227`.
- **Priorytet**: P0

### PLN-023: Release łańcucha — kolejność deepest-first, gate przechodzi w jednej transakcji
- **Co sprawdza**: release chain zwalnia WIP dzieci przed FG, filtrując blokery będące częścią tej samej transakcji.
- **Kroki**: 1) Łańcuch FG + 2×WIP (wszystkie DRAFT). 2) Release chain. 3) Wszystkie RELEASED; dzieci mają wcześniejsze wpisy historii niż FG.
- **Oczekiwana logika**: `releaseWorkOrderChainForContext` (`releaseWorkOrder.ts:356-385`), preflight z filtrem draft-in-txn (`:336-338`).
- **Priorytet**: P0

### PLN-024: Cancel łańcucha — dozwolone tylko z DRAFT/RELEASED
- **Co sprawdza**: chain-cancel z członkiem IN_PROGRESS/COMPLETED → `chain_cancel_blocked`.
- **Kroki**: 1) Łańcuch z 1 członkiem IN_PROGRESS. 2) Cancel chain. 3) Błąd; żaden członek nie zmienia statusu.
- **Oczekiwana logika**: cancellable set `{'DRAFT','RELEASED'}` (`releaseWorkOrder.ts:395-400`); UPDATE gated `status in ('DRAFT','RELEASED')` (`:442`); historia `cancel_chain` (`:454`).
- **Priorytet**: P0

### PLN-025: Cancel łańcucha blokowany przez egzekucję/output
- **Co sprawdza**: członek z `wo_executions` (status ≠ planned/cancelled) lub jakimkolwiek `wo_outputs` blokuje cancel.
- **Kroki**: 1) Zarejestruj output na WIP. 2) Cancel chain. 3) `chain_cancel_blocked`.
- **Oczekiwana logika**: guard `releaseWorkOrder.ts:402-427`. Uwaga: w cancelWo NIE ma logiki zwalniania rezerwacji/WAC — jeśli spec wymaga, to osobny finding.
- **Priorytet**: P0

### PLN-026: Delete draft — tylko DRAFT/CANCELLED, guard łańcucha
- **Co sprawdza**: usunięcie draftu z aktywnym łańcuchem/genealogią → `chain_delete_blocked`; czysty draft usuwa się z audytem.
- **Kroki**: 1) Usuń solo-DRAFT → sukces + `audit_events` `planning.work_order.deleted` + historia `delete_draft`. 2) Usuń DRAFT będący dzieckiem łańcucha z nie-CANCELLED rodzicem → `chain_delete_blocked`.
- **Oczekiwana logika**: `releaseWorkOrder.ts:512-581`; `assertDraftWorkOrderDeletable` — chain traversal (depth<32), blokery: status spoza DRAFT/CANCELLED, aktywna egzekucja, wo_outputs, krawędź zależności z nie-CANCELLED partnerem (`lib/planning/wo-chain-delete-guard.ts:16-75`).
- **Priorytet**: P0

### PLN-027: Tworzenie łańcucha WO z BOM z liniami WIP
- **Co sprawdza**: create z Planning na FG z BOM zawierającym `component_type='WIP'` tworzy FG + dzieci `-W1..Wn` (intermediate) + `wo_dependencies`.
- **Kroki**: 1) BOM FG z 2 liniami WIP. 2) Utwórz WO z `/planning/work-orders/new`. 3) 3 WO (FG + 2×WIP), numery `X-W1`, `X-W2`, zależności z `material_link`.
- **Oczekiwana logika**: `create-work-order-chain.ts:156-273`; qty dziecka = `computeRequiredMaterialQty` = `round4(qty*scalar/max(1-scrap/100,0.01))` (`:424-429`); linkDependencies upsert (`:517-533`).
- **Priorytet**: P0

### PLN-028: Idempotencja łańcucha — replay documentNumber
- **Co sprawdza**: ponowne wywołanie z tym samym documentNumber zwraca istniejący łańcuch (`created:false`), dzieci `-Wn` nie duplikują się.
- **Kroki**: 1) Utwórz łańcuch X. 2) Wywołaj ponownie z X. 3) Brak nowych wierszy.
- **Oczekiwana logika**: `create-work-order-chain.ts:165-178, 219-221`.
- **Priorytet**: P1

### PLN-029: Ambiwalentny material-link → wip_material_link_ambiguous
- **Co sprawdza**: dwa materiały tego samego produktu bez bomItemId przy linkowaniu zależności.
- **Kroki**: 1) BOM z dwiema liniami WIP tego samego item_id (legacy, bez bom_item_id match). 2) Utwórz łańcuch. 3) Oczekuj błędu i pełnego rollbacku.
- **Oczekiwana logika**: `resolveMaterialForWipEntry` (`shared.ts:566-589`); po pierwszym zapisie błędy rzucają `WorkOrderChainError` → rollback (`create-work-order-chain.ts:235,259`).
- **Priorytet**: P1

### PLN-030: Qty-sync łańcucha przy edycji rodzica
- **Co sprawdza**: zmiana qty rodzica (DRAFT/RELEASED dzieci) propaguje: `wo_dependencies.required_qty`, `planned_quantity` dziecka, `schedule_outputs.expected_qty` dziecka, resnapshot materiałów/operacji dziecka.
- **Kroki**: 1) Łańcuch, edytuj qty FG ×2. 2) Sprawdź wszystkie 4 miejsca u dziecka.
- **Oczekiwana logika**: `lib/planning/wo-chain-qty-sync.ts:273-369`; wzór scrap dziecka `:157`.
- **Priorytet**: P0

### PLN-031: Qty-sync blokowany — dziecko poza DRAFT/RELEASED
- **Co sprawdza**: edycja qty rodzica gdy dziecko IN_PROGRESS → `chain_child_not_editable`, rollback edycji rodzica.
- **Kroki**: 1) Dziecko w IN_PROGRESS. 2) Edytuj qty rodzica. 3) Błąd, qty rodzica bez zmian.
- **Oczekiwana logika**: `EDITABLE_CHILD_STATUSES` (`wo-chain-qty-sync.ts:58`), guard `:339-345`; rollback `ChainQtySyncRollbackError` (`update-work-order.ts:420-421`).
- **Priorytet**: P0

### PLN-032: RBAC WO — wszystkie mutacje wymagają npd.planning.write
- **Co sprawdza**: create/update/release/cancel/delete bez uprawnienia → `forbidden`.
- **Kroki**: 1) User z rolą tylko-read. 2) Wywołaj każdą akcję. 3) `forbidden` wszędzie; odczyt listy działa.
- **Oczekiwana logika**: `hasPermission(ctx,'npd.planning.write')` — `create-work-order-core.ts:64`, `update-work-order.ts:244`, `releaseWorkOrder.ts:467,490,504`, `create-work-order-chain.ts:120,143`.
- **Priorytet**: P0

### PLN-033: Walidacja UUID przed zod w release/delete/cancel
- **Co sprawdza**: nie-UUID id → `invalid_input` (bez SQL erroru); cudzy org UUID → `not_found` (RLS).
- **Kroki**: 1) Wywołaj releaseWorkOrder z `id:'abc'` → `invalid_input`. 2) Z UUID z innego org → `not_found`.
- **Oczekiwana logika**: `UUID_RE` (`releaseWorkOrder.ts:42,463,486,500`); wszystkie SQL z `org_id = app.current_org_id()`.
- **Priorytet**: P1

### PLN-034: Station queue — wyklucza CLOSED/CANCELLED
- **Co sprawdza**: `/planning/work-orders/station` pokazuje kolejkę linii bez zamkniętych/anulowanych WO.
- **Kroki**: 1) Linia z WO w każdym statusie. 2) Otwórz station z lineId. 3) Brak CLOSED i CANCELLED.
- **Oczekiwana logika**: filtr `not in ('CLOSED','CANCELLED')` (`work-orders/_actions/chain-preview.ts:350`); input `{lineId: uuid}` (`:298`).
- **Priorytet**: P2

### PLN-035: Chain preview — zgodność ilości z faktycznym create
- **Co sprawdza**: preview (`chain-preview.ts`) pokazuje te same qty dzieci co późniejszy create.
- **Kroki**: 1) Wygeneruj preview dla FG qty Q. 2) Utwórz łańcuch. 3) Ilości identyczne (ten sam wzór, 4 dp).
- **Oczekiwana logika**: `computeRequiredMaterialQty` w `chain-preview.ts:109-112` ≡ `create-work-order-chain.ts:424-429`. Uwaga QA: SQL materiały 3 dp vs TS planned qty 4 dp — sprawdź spójność na granicy zaokrągleń.
- **Priorytet**: P2

---

## MRP (`/planning/mrp`)

### PLN-036: Wzór nettingu — netPosition
- **Co sprawdza**: `net = onHand − reserved + openSupply − demand` w bazowym UoM, arytmetyka bigint (bez floatów).
- **Kroki**: 1) Przygotuj item: onHand 100, reserved 20, PO otwarte 50, demand WO 90. 2) runMrp. 3) `net = 40.000`, severity `covered`/`at_risk` wg reguł.
- **Oczekiwana logika**: `_actions/mrp-compute.ts:437` (`net = onHand - reserved + openSupply - demand`); micro-bigint scale 6 (`:35-39`).
- **Priorytet**: P0

### PLN-037: Składniki demand — WO (dependent) + forecast + SO (independent)
- **Co sprawdza**: demand = Σ `greatest(required_qty − consumed_qty, 0)` z WO w DRAFT/RELEASED/IN_PROGRESS + forecasty + otwarte linie SO.
- **Kroki**: 1) WO z materiałem częściowo skonsumowanym, forecast na bieżący tydzień, potwierdzone SO. 2) runMrp. 3) Rozbicie `demand`/`forecastDemand`/`soDemand` się zgadza.
- **Oczekiwana logika**: `OPEN_WO_DEMAND_STATUSES=['DRAFT','RELEASED','IN_PROGRESS']` (`mrp.ts:100`); statusy SO (`mrp.ts:110-120`, bez draft/cancelled/delivered); forecast `iso_week >= current` (`mrp.ts:24-28`).
- **Priorytet**: P0

### PLN-038: Składniki supply — PO remainder + schedule_outputs zwolnionych WO
- **Co sprawdza**: openSupply = otwarte PO (qty − received z nie-anulowanych GRN, statusy sent/confirmed/partially_received) + `schedule_outputs.expected_qty` WO RELEASED/IN_PROGRESS z disposition `to_stock`.
- **Kroki**: 1) PO confirmed 100, GRN 30 → supplyFromPo 70. 2) WO RELEASED expected 50 → supplyFromProduction 50. 3) Draft PO i DRAFT WO NIE liczą się jako supply.
- **Oczekiwana logika**: `OPEN_PO_STATUSES=['sent','confirmed','partially_received']` (`mrp.ts:104`); `SCHEDULABLE_WO_SUPPLY_STATUSES=['RELEASED','IN_PROGRESS']` (`mrp.ts:102`).
- **Priorytet**: P0

### PLN-039: Severity — shortage / below_min / at_risk / covered
- **Co sprawdza**: pełna matryca: `net<0` → shortage; `0≤net<min_qty` (min>0) → below_min; `demand>0 && available<demand` → at_risk; inaczej covered.
- **Kroki**: 1) 4 itemy skonstruowane pod każdą gałąź. 2) runMrp. 3) Severity + sortowanie (shortage pierwsze).
- **Oczekiwana logika**: `mrp-compute.ts:437-447`, ranking `:300-305`.
- **Priorytet**: P0

### PLN-040: Sugestia qty — gap zaokrąglony do lot multiple
- **Co sprawdza**: `gap = max(min_qty − net, −net)`; z reorder_qty>0: `qty = ceil(gap/reorder_qty) × reorder_qty`; bez progu: `ceil(−net)` całe jednostki tylko przy shortage.
- **Kroki**: 1) net=−7, reorder_qty=5, min_qty=0 → sugestia 10. 2) net=2, min_qty=10, reorder_qty=0 → sugestia 8. 3) Bez progu i net≥0 → brak sugestii.
- **Oczekiwana logika**: `mrp-compute.ts:459-473, 567-568` (`ceilGapToLotMultiple`); dokumentacja `:44-62`.
- **Priorytet**: P0

### PLN-041: Sugestia buy vs make wg item_type
- **Co sprawdza**: `intermediate`/`fg` → make (WO); rm/ingredient/packaging → buy (PO).
- **Kroki**: 1) Shortage na rm i na intermediate. 2) runMrp. 3) Typy akcji odpowiednio buy/make.
- **Oczekiwana logika**: `mrp-compute.ts:465,590`.
- **Priorytet**: P1

### PLN-042: Due date i release date z lead time dostawcy
- **Co sprawdza**: dueDate = bucket niedoboru (lub today+lead w trybie 1-bucket), `releaseDate = dueDate − lead_time_days`, clamp do today + `isLate=true` gdy w przeszłości; bez preferred_supplier → dueDate null (single-bucket) — „nie wymyślamy lead time".
- **Kroki**: 1) Próg z preferowanym dostawcą lead 14 dni, shortage w buckecie za 7 dni. 2) runMrp. 3) releaseDate=today, isLate=true. 4) Bez dostawcy → releaseDate null.
- **Oczekiwana logika**: `buildSuggestedAction` (`mrp-compute.ts:553-597`); doc `:58-60`.
- **Priorytet**: P0

### PLN-043: Wykluczenie niekonwertowalnych UoM — excludedUoms
- **Co sprawdza**: wiersz z UoM ≠ base i ≠ each/box (lub each/box bez pack faktorów) NIE wchodzi do nettingu, tylko do `excludedUoms`.
- **Kroki**: 1) Stan magazynowy w `l` dla itemu z bazą `kg` bez konwersji. 2) runMrp. 3) Qty pominięte, `excludedUoms:['l']` na wierszu — nigdy cicho zmieszane.
- **Oczekiwana logika**: `normalizeToBaseMicro` (`mrp-compute.ts:272-289`) — faktor ≤0/null → null → exclude (`:362-367`); box→each→base (`:286`).
- **Priorytet**: P0

### PLN-044: Próg min_qty>0 wymusza widoczność itemu bez ruchu
- **Co sprawdza**: item z progiem, zero stock/demand/supply — pojawia się jako below_min (net 0 < min).
- **Kroki**: 1) Ustaw próg min_qty=10 na item bez ruchu. 2) runMrp. 3) Wiersz obecny, severity below_min, sugestia = top-up do 10.
- **Oczekiwana logika**: `mrp-compute.ts:417-419, 732-734`; doc `:61-62`.
- **Priorytet**: P1

### PLN-045: Bucketing czasowy — mapowanie dat do tygodni ISO
- **Co sprawdza**: horyzont domyślny 12 tygodni (Mon-start, reguła czwartkowa ISO); data przed horyzontem → clamp do bucket 0; po horyzoncie (za ostatnią niedzielą) → wykluczona (`OUT_OF_HORIZON`).
- **Kroki**: 1) Demand z need_date wczoraj, w 3. tygodniu, +100 dni. 2) computeMrpPhased. 3) Bucket 0, bucket 2/3, brak.
- **Oczekiwana logika**: `mrp-buckets.ts:65-98` (`buildMrpBucketDates`, `dateToBucketIndex`, `bucketHorizonEnd = lastMonday+6`); `MRP_DEFAULT_HORIZON_WEEKS=12` (`mrp-compute.ts:81`).
- **Priorytet**: P0

### PLN-046: PAB — projected available balance roll-forward
- **Co sprawdza**: `rawPab_i = pab_{i-1} + scheduledReceipts_i − demand_i`; po sugestii `pab = rawPab + suggestedQty`; onHand tylko w buckecie 0.
- **Kroki**: 1) onHand 10, demand 8 w W1 i 8 w W2, receipt 5 w W2. 2) Phased run. 3) W1: pab 2; W2: rawPab −1 → shortage → sugestia 1 → pab 0.
- **Oczekiwana logika**: `mrp-compute.ts:776, 808-809, 869`.
- **Priorytet**: P0

### PLN-047: Invariance — horyzont 1 tydzień ≡ computeMrp
- **Co sprawdza**: przy `horizonWeeks=1` sumy rows z computeMrpPhased równają się computeMrp.
- **Kroki**: 1) Ten sam input do obu funkcji. 2) Porównaj rows/kpis.
- **Oczekiwana logika**: doc `mrp-compute.ts:604-606`.
- **Priorytet**: P2

### PLN-048: KPI coveragePct — demand-weighted
- **Co sprawdza**: `coverage = (1 − Σshortage/Σdemand) × 100`, zaokrąglone do 1 dp (half-up przez bigint), clamp 0..100; per-item shortage cap do demand itemu.
- **Kroki**: 1) 2 itemy: demand 100 short 50, demand 100 covered. 2) KPI = 75.0.
- **Oczekiwana logika**: `mrp-compute.ts:516-522, 929-935` (`(clamped*1000 + total/2)/total ÷ 10`).
- **Priorytet**: P1

### PLN-049: Persist run — idempotencja mrp_requirements
- **Co sprawdza**: `runMrp({persist:true})` zapisuje 1 wiersz `mrp_runs` + requirements per item×bucket; ponowny persist tego samego runu nadpisuje po unikalnym kluczu (ON CONFLICT DO UPDATE), planned orders `release_status='suggested'` czyszczone i przeliczane.
- **Kroki**: 1) Persist ×2. 2) Brak duplikatów requirements; suggested planned orders odświeżone.
- **Oczekiwana logika**: `mrp.ts:7-16`; delete suggested (`mrp.ts:654-657`).
- **Priorytet**: P1

### PLN-050: Konwersja planned→PO — walidacja i skip reasons
- **Co sprawdza**: convertPlannedToPo tworzy PO przez `createPurchaseOrderCore`; skipy: `not found`, `already converted` (release_status ≠ suggested/firm), `not a buy planned order`.
- **Kroki**: 1) Zaznacz mix planned orders (buy, make, already released). 2) Konwertuj do PO. 3) Wynik created + skipped z powodami; planned order → `release_status='released'` z linkiem.
- **Oczekiwana logika**: `mrp.ts:1201-1285`; markPlannedOrdersReleased (`mrp.ts:1056-1057`).
- **Priorytet**: P0

### PLN-051: Konwersja planned→WO — pełny snapshot jak create WO
- **Co sprawdza**: convertPlannedToWo tworzy WO DRAFT z BOM, materiałami (wzór scrap ÷(1−scrap)), operacjami, schedule_outputs, historią; skipy: `no active BOM`, `quantity precision exceeds WO precision`, `missing site`, `pack_hierarchy_incomplete`.
- **Kroki**: 1) Planned make z aktywnym BOM → WO powstaje (sprawdź required_qty wg wzoru z `mrp.ts:1449`). 2) Planned make bez BOM → skip `no active BOM`, ZERO osieroconych nagłówków WO.
- **Oczekiwana logika**: `mrp.ts:1287-1516`; header insert PO walidacji pack (`:1436-1443`); wzór `round((bl.quantity*$2)/greatest(1-coalesce(bl.scrap_pct,0)/100.0,0.01),3)` (`:1449`).
- **Priorytet**: P0

### PLN-052: Cancel planned order — tylko nieskonsumowane
- **Co sprawdza**: cancelPlannedOrder ustawia `release_status='cancelled'` tylko gdy status na to pozwala i linkowany PO/TO/WO nie jest aktywny; audyt `planning.mrp_planned_order.cancelled`.
- **Kroki**: 1) Cancel suggested → ok. 2) Cancel released z aktywnym PO → odmowa/no-op.
- **Oczekiwana logika**: `mrp.ts:1113-1180` (warunki na linked_po/to/wo status).
- **Priorytet**: P1

### PLN-053: RBAC MRP — read vs persist vs convert
- **Co sprawdza**: odczyt runu gated `scheduler.run.read`; persist dodatkowo `npd.planning.write`; convert/cancel wymaga OBU (`hasMrpConvertPermission` + write).
- **Kroki**: 1) User read-only: runMrp bez persist ok, persist → forbidden, convert → forbidden.
- **Oczekiwana logika**: `mrp.ts:46-49, 97, 1122, 1208, 1294`.
- **Priorytet**: P0

### PLN-054: MRP przy ujemnym stanie / zarezerwowanym w całości LP
- **Co sprawdza**: v_inventory_available filtruje available>0 — w pełni zarezerwowany LP jest niewidoczny, ale net się zgadza (onHand−reserved ≡ Σavailable); ujemny net poprawnie daje shortage.
- **Kroki**: 1) LP 100 w pełni zarezerwowany + demand 10. 2) runMrp. 3) net = −10, shortage.
- **Oczekiwana logika**: caveat `mrp-compute.ts:21-23`.
- **Priorytet**: P1

### PLN-055: SO bez daty — demand natychmiastowy + warning
- **Co sprawdza**: SO bez promised/required ship date bucketuje się na dziś i podnosi warning undated-SO na wyniku runu.
- **Kroki**: 1) Confirmed SO bez dat. 2) runMrp. 3) Demand w bucket 0, warning obecny.
- **Oczekiwana logika**: `mrp.ts:35-37`.
- **Priorytet**: P2

### PLN-056: Resolver dostawcy dla planned buy — pomija blocked
- **Co sprawdza**: sugestie buy przypisują dostawcę przez `resolveProcurementSuppliersForItems` z pominięciem blocked.
- **Kroki**: 1) Item z preferowanym dostawcą blocked. 2) Persist run. 3) Planned order bez supplier lub z alternatywnym (fetchNonBlockedSupplierIds).
- **Oczekiwana logika**: `mrp.ts:54, 661-697`.
- **Priorytet**: P2

### PLN-057: Duplikat konwersji — double-click convert
- **Co sprawdza**: druga konwersja tych samych planned orders → wszystkie skipped `already converted`, brak duplikatów PO/WO.
- **Kroki**: 1) Convert ×2 szybko. 2) Jeden PO/WO, drugi wynik ze skipami.
- **Oczekiwana logika**: guard `release_status !== 'suggested' && !== 'firm'` (`mrp.ts:1306-1308`).
- **Priorytet**: P0

---

## Purchase Orders (`/planning/purchase-orders`, `/[id]`, `/import`)

### PLN-058: Create PO — walidacje formularza
- **Co sprawdza**: supplierId wymagany (uuid), currency dokładnie 3 znaki, expectedDelivery `YYYY-MM-DD`, notes ≤2000, linie 1–200.
- **Kroki**: 1) Spróbuj create bez dostawcy, z currency `GB`, z 0 linii, z 201 liniami. 2) `invalid_input` w każdym przypadku.
- **Oczekiwana logika**: `PurchaseOrderCreateInput` (`procurement-shared.ts:92-103`).
- **Priorytet**: P0

### PLN-059: Walidacje linii PO — qty/cena/VAT
- **Co sprawdza**: qty dodatnia ≤6 dp; unitPrice ≥0 ≤4 dp; taxPct 0–100 ≤4 dp; lineNo dodatni int.
- **Kroki**: 1) qty `0`, `1.1234567`; price `-1`; taxPct `101`. 2) Wszystko odrzucone.
- **Oczekiwana logika**: `PurchaseOrderLineInput` (`procurement-shared.ts:83-90`), schematy `:39-60`.
- **Priorytet**: P0

### PLN-060: Create PO zawsze startuje jako draft
- **Co sprawdza**: input `status:'confirmed'` ignorowany — insert hardcoduje draft.
- **Kroki**: 1) Wyślij create z status confirmed. 2) PO w DB = draft.
- **Oczekiwana logika**: `create-purchase-order-core.ts:226`.
- **Priorytet**: P1

### PLN-061: Create PO — dostawca musi być active
- **Co sprawdza**: blocked → `supplier_blocked` "Supplier is blocked"; inactive → komunikat inactive; nieistniejący → `not_found`. Lock FOR UPDATE na dostawcy (race ze zmianą statusu).
- **Kroki**: 1) Create na blocked/inactive/nieistniejącego. 2) Odpowiednie błędy, brak PO.
- **Oczekiwana logika**: `create-purchase-order-core.ts:177-196`.
- **Priorytet**: P0

### PLN-062: Maszyna stanów PO — dozwolone przejścia
- **Co sprawdza**: draft→sent/cancelled; sent→draft/confirmed/cancelled; confirmed→cancelled; partially_received→cancelled; received i cancelled terminalne.
- **Kroki**: 1) Przetestuj każdą parę (from,to) — 6×6 macierz; nielegalne → `invalid_state`.
- **Oczekiwana logika**: `PO_TRANSITIONS` (`purchase-orders/_actions/actions.ts:932-939`), guard `:1066-1067`.
- **Priorytet**: P0

### PLN-063: received/partially_received nieosiągalne ręcznie
- **Co sprawdza**: `transitionPurchaseOrderStatus(id,'received')` z confirmed → odrzucone (`po_open_quantity` przy braku pełnego przyjęcia, potem `invalid_state` z maszyny stanów); statusy te ustawia tylko rollup przyjęć.
- **Kroki**: 1) Confirmed PO bez GRN → transition received → błąd. 2) Przyjmij całość przez receive → status sam przechodzi na received.
- **Oczekiwana logika**: gate ilościowy `actions.ts:1055-1063` przed maszyną stanów; rollup `lib/warehouse/receive-po-line-core.ts:772-814`.
- **Priorytet**: P0

### PLN-064: Cancel PO z przyjęciami → po_has_receipts
- **Co sprawdza**: PO z aktywnym received_qty nie może być anulowane.
- **Kroki**: 1) Przyjmij część linii. 2) Cancel. 3) `po_has_receipts`.
- **Oczekiwana logika**: `actions.ts:1068-1071`.
- **Priorytet**: P0

### PLN-065: Reopen PO — tylko sent/cancelled → draft, bez przyjęć
- **Co sprawdza**: reopen z confirmed → `invalid_state`; reopen sent z GRN → `po_has_receipts`; poprawny reopen cancelled → draft (escape hatch z terminalnego).
- **Kroki**: 1) 3 scenariusze jak wyżej.
- **Oczekiwana logika**: `reopenPurchaseOrder` (`actions.ts:941-1026`, guardy `:964-971`, `not exists` w UPDATE `:980-998`).
- **Priorytet**: P1

### PLN-066: Forward transition wymaga aktywnego dostawcy
- **Co sprawdza**: sent/confirmed/partially_received/received wymagają supplier active; blocked → `supplier_blocked`.
- **Kroki**: 1) Draft PO, zablokuj dostawcę. 2) Transition → sent. 3) Odmowa.
- **Oczekiwana logika**: `SUPPLIER_ACTIVE_REQUIRED_TRANSITIONS` (`actions.ts:416`), check `:1073-1083`.
- **Priorytet**: P1

### PLN-067: Edycja PO/linii tylko w draft + lock
- **Co sprawdza**: update nagłówka, add/update/delete linii poza draft → `invalid_state`; wiersz lockowany `for update of po`.
- **Kroki**: 1) Sent PO — spróbuj każdej edycji. 2) `invalid_state` ×4.
- **Oczekiwana logika**: `actions.ts:625, 702, 780, 852`; `fetchDraftPurchaseOrderForUpdate` (`:328-343`).
- **Priorytet**: P0

### PLN-068: Nie można usunąć ostatniej linii PO
- **Co sprawdza**: delete ostatniej linii → `last_line`.
- **Kroki**: 1) Draft PO z 1 linią. 2) Delete linii. 3) Błąd.
- **Oczekiwana logika**: `actions.ts:869-878` (`line_count <= 1`).
- **Priorytet**: P1

### PLN-069: Warehouse docelowe musi pasować do site PO
- **Co sprawdza**: warehouse z innym site → `warehouse_site_mismatch`; warehouse org-wide (site_id null) przechodzi; recheck przy każdej tranzycji.
- **Kroki**: 1) Create z warehouse innego site → błąd. 2) Org-wide → ok. 3) Zmień site warehouse po create, transition → błąd.
- **Oczekiwana logika**: `po-destination-warehouse.ts:30-48`; `create-purchase-order-core.ts:204-211`; `actions.ts:1050-1053`.
- **Priorytet**: P1

### PLN-070: Matematyka kwot linii — net/tax/gross 4 dp
- **Co sprawdza**: `net = qty×unitPrice` (4 dp); `tax = net×taxPct/100`; `gross = net+tax`; sumy zamówienia przez micro-units.
- **Kroki**: 1) Linia qty 3.333, price 1.9999, tax 23. 2) Porównaj wyświetlone kwoty z ręcznym Dec-obliczeniem.
- **Oczekiwana logika**: `po-line-price.ts:8-28, 36-49` (`PO_LINE_MONEY_SCALE=4`).
- **Priorytet**: P1

### PLN-071: Źródło ceny linii — spec > list_price(GBP) > none
- **Co sprawdza**: cena z `supplier_specs` (active+approved, effective_from ≤ dziś ≤ expiry, najnowsza) ma priorytet; fallback list_price_gbp TYLKO gdy waluta GBP; inna waluta → `source:'none'` (nie fałszować magnitudy).
- **Kroki**: 1) Item ze spec ceną → source spec. 2) Bez spec, supplier EUR, item z list_price → cena pusta. 3) Supplier GBP → list_price.
- **Oczekiwana logika**: `po-form-data.ts:80-166` (spec `:100-124`, GBP-guard `:129-136`).
- **Priorytet**: P1

### PLN-072: Przyjęcie częściowe → partially_received; pełne → received + GRN complete
- **Co sprawdza**: rollup `bool_and(received ≥ ordered)` po każdym przyjęciu; pełny odbiór domyka draft GRNy.
- **Kroki**: 1) PO 2 linie. 2) Przyjmij linię 1 → PO partially_received. 3) Przyjmij linię 2 → received, GRN completed.
- **Oczekiwana logika**: `receive-po-line-core.ts:772-814` (rollup), `:816-833` (completeFullyReceivedGrns); tylko z `('sent','confirmed','partially_received')`.
- **Priorytet**: P0

### PLN-073: Over-receipt — twardy cap 110% + soft confirm 100–110%
- **Co sprawdza**: `cap = ordered×110/100`; przekroczenie → `over_receive_cap`; 100–110% desktop wymaga `confirmOverReceive` → `over_receive_confirm_required`.
- **Kroki**: 1) Ordered 100, przyjęte 90: przyjmij 25 → cap error. 2) Przyjmij 15 bez confirm → confirm_required. 3) Z confirm → ok, overReceived=true.
- **Oczekiwana logika**: `receive-po-line-core.ts:139-157`; `requireOverReceiveConfirm:true` desktop (`warehouse/_actions/receive-po-line.ts:57`).
- **Priorytet**: P0

### PLN-074: Receive — walidacja qty i formatu (bigint, 6 dp)
- **Co sprawdza**: qty ≤0, >6 dp, `01.5`, nienumeryczne → `invalid_qty`; bestBefore musi być `YYYY-MM-DD`.
- **Kroki**: 1) Wyślij każdy zły wariant. 2) `invalid_qty` bez wiersza GRN.
- **Oczekiwana logika**: `parseDecimal` regex `^(?:0|[1-9]\d*)(?:\.\d{1,6})?$` (`receive-po-line-core.ts:835-839`); walidacje desktop (`receive-po-line.ts:217-228`).
- **Priorytet**: P1

### PLN-075: Receive — efekty magazynowe: LP received/pending, WAC, outbox
- **Co sprawdza**: przyjęcie tworzy LP `status='received', qa_status='pending'` (bez auto-putaway), grn_items z qa_status_initial pending, hook WAC (błędy `wac_unresolved_uom`/`wac_unsupported_currency` NIE zapisują przyjęcia), event `warehouse.lp.received`; expiry = bestBefore lub now+shelf_life_days.
- **Kroki**: 1) Przyjmij linię z bestBefore i bez. 2) Sprawdź LP, grn_items, WAC booking, expiry.
- **Oczekiwana logika**: `receive-po-line-core.ts:493-711, 847-852`; WAC preflight+hook (`receive-po-line.ts:55-60, 103-111`).
- **Priorytet**: P0

### PLN-076: Receive guardy statusowe — PO nie-otwarte, dostawca blocked, lokalizacja
- **Co sprawdza**: PO draft/received/cancelled → `invalid_state`; supplier blocked → `supplier_blocked`; lokalizacja nieaktywna → `location_inactive`; warehouse/site mismatch.
- **Kroki**: 1) Każdy przypadek.
- **Oczekiwana logika**: `OPEN_PO_STATUSES` (`receive-po-line-core.ts:7`), guardy `:135-185`; `warehouse/_actions/receive-po-line.ts:182-188`.
- **Priorytet**: P0

### PLN-077: Import PO — walidacje wierszy
- **Co sprawdza**: wymagane external_ref/supplier_code/item_code/uom; qty>0 ≤3 dp; price ≥0 ≤4 dp; UoM zgodne z itemem lub jednostkami org; expected_delivery ISO i NIE w przeszłości; duplikaty PO number/external_ref odrzucone; waluta: wiersz → dostawca → GBP.
- **Kroki**: 1) CSV z każdym rodzajem błędu + poprawnym wierszem. 2) Raport per-wiersz, poprawny commit tylko dobrych (tryb skip_invalid).
- **Oczekiwana logika**: `import-po.ts:268-321` (walidacje), `:364-387,126-143` (dedup), `:199,216` (waluta).
- **Priorytet**: P0

### PLN-078: Parser CSV PO — nagłówki, quoting, puste
- **Co sprawdza**: brak wymaganej kolumny → `header_mismatch` z listą; pusty plik → `empty`; pola cytowane z `""` i przecinkami parsowane; qty nienumeryczne trafia jako NaN do walidacji backendu (błąd wiersza, nie crash).
- **Kroki**: 1) Wgraj wadliwe pliki w wizardzie `/planning/purchase-orders/import`.
- **Oczekiwana logika**: `import/_lib/parse-po-csv.ts:67-136`.
- **Priorytet**: P1

### PLN-079: PO aging report
- **Co sprawdza**: raport starzenia PO liczy się poprawnie i jest scoped do org (uwaga: brak jawnego RBAC — tylko RLS).
- **Kroki**: 1) PO z różnymi expected_delivery. 2) Otwórz raport. 3) Buckety wieku poprawne; user innego org nie widzi danych.
- **Oczekiwana logika**: `actions/get-po-aging.ts:37-39` (withOrgContext, bez permission gate — flagowane).
- **Priorytet**: P2

### PLN-080: RBAC PO — po.manage dla mutacji, read dla list
- **Co sprawdza**: create/update/linie/transition/reopen/import/export wymagają `planning.po.manage`; list/get — `scheduler.run.read`; receive — `warehouse.grn.receive` (NIE planning.*).
- **Kroki**: 1) User z samym read → wszystkie mutacje forbidden. 2) User z po.manage bez warehouse.grn.receive → receive forbidden.
- **Oczekiwana logika**: `actions.ts:495,564,620,697,775,847,948,1035`; `create-purchase-order-core.ts:170`; `import-po.ts:61-86`; `create-export-job.ts:119-120`; `warehouse/_actions/receive-po-line.ts:21-32`.
- **Priorytet**: P0

---

## Suppliers (`/planning/suppliers`, `/[id]`, `/[id]/scorecard`)

### PLN-081: Create supplier — walidacje pól
- **Co sprawdza**: code 1–80 wymagany, name 1–255, currency 3 znaki (default GBP), leadTimeDays int 0–3650 (default 0), status enum active/inactive/blocked, notes ≤2000.
- **Kroki**: 1) Puste code/name, currency `EURO`, leadTime −1 / 4000 / 1.5. 2) Wszystko odrzucone.
- **Oczekiwana logika**: `SupplierCreateInput` (`procurement-shared.ts:73-81`).
- **Priorytet**: P0

### PLN-082: Duplikat kodu dostawcy → already_exists
- **Co sprawdza**: unikalność (org_id, code) na poziomie DB (23505 → already_exists).
- **Kroki**: 1) Utwórz SUP-1 ×2. 2) Drugi → `already_exists`. 3) Ten sam kod w INNYM org → dozwolony (izolacja).
- **Oczekiwana logika**: `suppliers/_actions/actions.ts:176-177`; `pgErrorToResult` (`procurement-shared.ts:249-254`).
- **Priorytet**: P0

### PLN-083: Code niemutowalny przy update
- **Co sprawdza**: update nie zmienia `code` (brak w SET), pozostałe pola tak.
- **Kroki**: 1) Update z nowym code. 2) Code w DB bez zmian, name zmienione.
- **Oczekiwana logika**: `suppliers/_actions/actions.ts:207-221` (lock `:200`).
- **Priorytet**: P1

### PLN-084: Zmiana statusu dostawcy — brak maszyny stanów, skutki downstream
- **Co sprawdza**: transitionSupplierStatus przyjmuje dowolny z 3 statusów; blocked blokuje: create PO (PLN-061), forward transitions PO (PLN-066), receive (PLN-076), przypisanie w MRP (PLN-056).
- **Kroki**: 1) active→blocked→active. 2) Przy blocked wykonaj create PO → `supplier_blocked`.
- **Oczekiwana logika**: `suppliers/_actions/actions.ts:270-312`.
- **Priorytet**: P1

### PLN-085: Scorecard — wzory on-time / variance / NCR
- **Co sprawdza**: `onTime = first_receipt_date ≤ expected_delivery` (date-only, null gdy brak którejś); `onTimePct = #onTime/#comparable×100` (1 dp); `variancePct = (received−ordered)/ordered×100` (null przy ordered=0); `avgQtyVariancePct` = średnia z |variance| po PO z odbiorem (2 dp); NCR open = status ∉ (closed,cancelled); tylko GRN completed.
- **Kroki**: 1) Dostawca z 3 PO: on-time, spóźnione, bez expected. 2) Porównaj metryki z ręcznym wyliczeniem. 3) Progi kolorów: on-time ≥95 good/≥80 warn; variance ≤2/≤5.
- **Oczekiwana logika**: `_actions/freight-actions.ts:359-443, 496-525`; widok `scorecard-view.tsx:100-113,154`. Uwaga: brak jawnego RBAC na `getSupplierScorecard` (`freight-actions.ts:449`) — tylko RLS.
- **Priorytet**: P1

### PLN-086: RBAC suppliers
- **Co sprawdza**: create/update/transition wymagają `planning.supplier.manage`; list/get — read.
- **Kroki**: 1) User read-only → mutacje forbidden.
- **Oczekiwana logika**: `suppliers/_actions/actions.ts:93,117,144,191,277`.
- **Priorytet**: P0

---

## Transfer Orders (`/planning/transfer-orders`, `/[id]`, `/import`)

### PLN-087: Guard same_warehouse przy create
- **Co sprawdza**: source == destination → `same_warehouse`; TO z tylko jednym magazynem (drugi null) przechodzi.
- **Kroki**: 1) Create z from==to → błąd. 2) Create z samym from → ok (draft).
- **Oczekiwana logika**: `create-transfer-order-core.ts:147-149` (`!=null && ===`).
- **Priorytet**: P0

### PLN-088: Guard same_warehouse przy update — inny kod błędu
- **Co sprawdza**: update draftu ustawiający from==to (z koalescencją next-values) → `invalid_input` (nie `same_warehouse` — niespójność do odnotowania).
- **Kroki**: 1) Draft z from=A. 2) Update to=A. 3) Odmowa.
- **Oczekiwana logika**: `transfer-orders/_actions/actions.ts:522-524`.
- **Priorytet**: P1

### PLN-089: Maszyna stanów TO
- **Co sprawdza**: draft→in_transit/cancelled; in_transit→received/cancelled; partially_received→received/cancelled; received i cancelled terminalne; nielegalne → `invalid_state`; header lock FOR UPDATE.
- **Kroki**: 1) Pełna macierz przejść.
- **Oczekiwana logika**: `TO_TRANSITIONS` (`actions.ts:772-778`), guard `:1269-1270`, lock `:1256-1264`.
- **Priorytet**: P0

### PLN-090: Ship (draft→in_transit) — FEFO picking i guardy
- **Co sprawdza**: pick tylko z LP `available`+`qa released`+zgodny uom+warehouse źródłowy, FEFO (`expiry asc nulls last, lp_number`); brak from_warehouse → `from_warehouse_required`; brak linii → `no_lines`.
- **Kroki**: 1) 3 LP z różnymi expiry. 2) Ship. 3) Najkrótszy expiry pobrany pierwszy; `transfer_order_line_lps` + `stock_moves` `transfer`; pełna deplecja LP → status `shipped`.
- **Oczekiwana logika**: `actions.ts:841-988` (filtr `:869-882`, FEFO order).
- **Priorytet**: P0

### PLN-091: Ship — niedobór: insufficient_stock / insufficient_stock_holds
- **Co sprawdza**: plan-first-write-after — przy niedoborze NIC nie jest zapisane; LP na QA hold pomijane i raportowane w `skippedHeldLps`; z holdami → `insufficient_stock_holds`, bez → `insufficient_stock` z komunikatem `line N: short by X UOM`.
- **Kroki**: 1) Stan 5, linia 10 → błąd, zero stock_moves. 2) Dodatkowy LP na holdzie → wariant `_holds`.
- **Oczekiwana logika**: `actions.ts:862-930` (faza 1 bez zapisów, shortfall `:914-921`, holdy `:888-895`).
- **Priorytet**: P0

### PLN-092: Ship — shadow qty dla duplikatów produktu (C058)
- **Co sprawdza**: dwie linie tego samego itemu nie planują z tego samego pre-ship stanu LP podwójnie; assert konserwacji plan==suma picków.
- **Kroki**: 1) TO z 2 liniami tego samego produktu, jeden LP pokrywający obie. 2) Ship. 3) Suma picków = suma linii, brak podwójnego kredytu.
- **Oczekiwana logika**: `lpQtyShadow` (`actions.ts:867,898-903`), assert `:924-930` → `TransferOrderConservationError`.
- **Priorytet**: P0

### PLN-093: Receive (in_transit→received) — materializacja dest LP
- **Co sprawdza**: każdy link bez dest_lp_id tworzy nowy LP w magazynie docelowym: `status available`, qa_status przeniesiony ze źródła (świadomie bez re-kwarantanny), origin `transfer`, parent_lp_id, batch/expiry przeniesione; `lp_genealogy` + `stock_moves` + dest_lp_id na linku.
- **Kroki**: 1) Ship + receive. 2) Zweryfikuj wszystkie pola dest LP i genealogię.
- **Oczekiwana logika**: `actions.ts:1003-1123` (komentarz o qa `:998-999`); brak to_warehouse → `to_warehouse_required` (`:1007`).
- **Priorytet**: P0

### PLN-094: Konserwacja materii przy każdej tranzycji TO
- **Co sprawdza**: po ship/receive/cancel/receive-remainder Σ LP.quantity + Σ nieodebranych linków per (item,uom) jest niezmienna; naruszenie → `CONSERVATION_VIOLATION` (rollback).
- **Kroki**: 1) Wykonaj pełny cykl TO. 2) Snapshot przed/po każdej tranzycji równy.
- **Oczekiwana logika**: `to-conservation.ts:66-153`; wywołania `actions.ts:1279,1284,1309,1314`; bigint micro scale 6.
- **Priorytet**: P0

### PLN-095: Cancel in_transit — przywrócenie źródłowych LP
- **Co sprawdza**: cancel przywraca ilości źródłowych LP (`shipped→available`), usuwa nieodebrane linki; agregacja restore per source LP (bez podwójnego kredytu przy duplikatach produktu).
- **Kroki**: 1) Ship, potem cancel. 2) Stan źródłowy dokładnie jak przed shipem.
- **Oczekiwana logika**: `actions.ts:1131-1241` (`restoreBySourceLp` `:1159-1179`).
- **Priorytet**: P0

### PLN-096: Cancel TO z odebranym stockiem → partially_received error
- **Co sprawdza**: TO z linkami `dest_lp_id not null` nie może być anulowane — najpierw reverse-receive.
- **Kroki**: 1) Ship + receive częściowy. 2) Cancel. 3) `{error:'partially_received', message:'...cancel is not allowed...'}`.
- **Oczekiwana logika**: `actions.ts:1286-1307`; typ błędu `procurement-shared.ts:31-32`.
- **Priorytet**: P0

### PLN-097: Reverse-receive — walidacje i e-podpis
- **Co sprawdza**: qty musi być RÓWNA link_qty i dest LP quantity (`invalid_quantity`); dest LP z rezerwacją/alokacją/wysyłką/konsumpcją → `lp_active`; źródłowy LP consumed/destroyed → `invalid_state` (phantom stock); wymagany `signature.password` + reasonCode; permission `warehouse.transfer.correct`.
- **Kroki**: 1) Reverse na częściową qty → `invalid_quantity`. 2) Dest LP zarezerwowany → `lp_active`. 3) Poprawny reverse: dest LP → `returned`/qty 0, źródło += qty i `available`, link usunięty, status TO przeliczony (partially_received lub in_transit), konserwacja OK.
- **Oczekiwana logika**: `reverse-receive.ts:414-650` (ladder `:430-494`, efekty `:506-607`, reroll `:214-232`).
- **Priorytet**: P0

### PLN-098: TO edycje linii — tylko draft, last_line, renumeracja
- **Co sprawdza**: add/update/delete linii poza draft → `invalid_state`; usunięcie ostatniej → `last_line`; po delete dense renumber.
- **Kroki**: 1) Draft 3 linie → usuń środkową → numery 1,2. 2) Usuń aż zostanie 1 → `last_line`. 3) In_transit → wszystkie edycje odrzucone.
- **Oczekiwana logika**: `actions.ts:512,594,656,724,736`; `denseRenumberTransferOrderLines` (`:354-370`).
- **Priorytet**: P1

### PLN-099: Rozjazd precyzji qty linii TO — create 3 dp vs add/update 6 dp
- **Co sprawdza**: linia w create przyjmuje max 3 dp (`numeric3Schema`), add-line na drafcie 6 dp — udokumentowana niespójność.
- **Kroki**: 1) Create TO z linią `1.1234` → odrzucone. 2) Add-line `1.1234` na drafcie → przyjęte.
- **Oczekiwana logika**: `procurement-shared.ts:105-110` vs `actions.ts:170-176`.
- **Priorytet**: P2

### PLN-100: Import TO — walidacje i dedup
- **Co sprawdza**: wymagane external_ref, kody obu magazynów (muszą się rozwiązać i różnić), item aktywny, uom zgodny, qty>0 ≤3 dp, data ISO opcjonalna; dedup po `to_number == external_ref` → skip; tryb `all_or_nothing` (jeden błąd wali cały commit) vs `skip_invalid`; re-walidacja w transakcji commita (TOCTOU); wiersz `import_export_jobs`.
- **Kroki**: 1) CSV mieszany dobry/zły w obu trybach. 2) all_or_nothing → zero utworzonych; skip_invalid → tylko dobre.
- **Oczekiwana logika**: `import-to.ts:263-319` (walidacje), `:76-92` (tryby), `:362-373` (dedup), grupowanie per `from+to+external_ref` (`:405-422`).
- **Priorytet**: P0

### PLN-101: RBAC TO — to.manage; reverse — warehouse.transfer.correct
- **Co sprawdza**: CRUD/transition/import TO → `planning.to.manage`; reverse-receive → `warehouse.transfer.correct` + e-sign; user z to.manage bez transfer.correct nie zrobi reverse.
- **Kroki**: 1) Kombinacje ról.
- **Oczekiwana logika**: `create-transfer-order-core.ts:142`; `actions.ts:507,589,651,719,1250`; `import-to.ts:59-84`; `reverse-receive.ts:30,424`.
- **Priorytet**: P0

---

## Forecasts (`/planning/forecasts`)

### PLN-102: Upsert forecast — walidacje
- **Co sprawdza**: isoWeek regex `^\d{4}-W\d{2}$`; qty non-negative ≤6 dp (0 dozwolone); item musi być typu fg/intermediate (inne → `not_found`); qty wprowadzona w OUTPUT UoM konwertowana do base; brak pack faktorów → `uom_conversion_unavailable`.
- **Kroki**: 1) Zły format tygodnia, qty ujemna, item rm, item bez konwersji. 2) Odpowiednie błędy. 3) Poprawny fg: qty w each ×net_qty_per_each zapisana w base.
- **Oczekiwana logika**: `forecasts.ts:93-109, 50, 285, 291, 194-198`.
- **Priorytet**: P0

### PLN-103: Forecast w przeszłości — zapis dozwolony, niewidoczny w gridzie, poza MRP
- **Co sprawdza**: brak guardu przeszłego tygodnia przy zapisie; grid renderuje tylko forward (default 12, max 52 tygodnie); MRP czyta tylko `iso_week >= current`.
- **Kroki**: 1) Upsert na tydzień −4. 2) Zapis ok, grid nie pokazuje, runMrp nie liczy tej ilości.
- **Oczekiwana logika**: `forecasts.ts:142-151` (buildForecastWeeks), brak past-guardu (`:104-109`); horyzont MRP (`mrp.ts:24-28`).
- **Priorytet**: P1

### PLN-104: Upsert idempotentny per (org,item,tydzień)
- **Co sprawdza**: drugi upsert tej samej komórki nadpisuje (unikalny klucz), nie duplikuje.
- **Kroki**: 1) Upsert 10, upsert 20. 2) Jedna komórka, qty 20, source manual.
- **Oczekiwana logika**: upsert na `demand_forecasts_org_item_week_unique` (`forecasts.ts:301`).
- **Priorytet**: P1

### PLN-105: Copy week — niedestrukcyjne, from==to zabronione
- **Co sprawdza**: kopiowanie tygodnia nie nadpisuje istniejących komórek docelowych (`on conflict do nothing`); fromWeek==toWeek → `invalid_input`.
- **Kroki**: 1) W1 ma A=10,B=5; W2 ma A=99. 2) Copy W1→W2. 3) W2: A=99 (bez zmiany), B=5 (dodane).
- **Oczekiwana logika**: `forecasts.ts:389-420` (`:394` guard, `:409` conflict).
- **Priorytet**: P1

### PLN-106: Import CSV forecast — częściowe błędy nie-fatalne
- **Co sprawdza**: rows 1–2000; nieznany item_code → `{row, reason:'unknown_item'}` a reszta się zapisuje; source `import`.
- **Kroki**: 1) CSV z 2 dobrymi + 1 nieznanym itemem. 2) 2 zapisane, 1 w błędach.
- **Oczekiwana logika**: `forecasts.ts:429-496` (`:477-479`).
- **Priorytet**: P1

### PLN-107: RBAC forecast — planning.forecast.manage
- **Co sprawdza**: upsert/delete/copy/import → `planning.forecast.manage`; list → `scheduler.run.read`.
- **Kroki**: 1) Kombinacje ról.
- **Oczekiwana logika**: `forecasts.ts:40-42, 216, 336, 357, 399, 456`.
- **Priorytet**: P0

---

## Reorder thresholds (`/planning/reorder-thresholds`)

### PLN-108: Upsert progu — walidacje i typy itemów
- **Co sprawdza**: minQty/reorderQty non-negative ≤6 dp; item musi być typu rm/ingredient/intermediate/packaging (fg → `not_found`); preferredSupplierId walidowany w org (`not_found` gdy obcy/nieistniejący); upsert per (org,item).
- **Kroki**: 1) fg item → odmowa. 2) Supplier z innego org → not_found. 3) Drugi upsert nadpisuje.
- **Oczekiwana logika**: `reorder-thresholds.ts:75-86, 41, 196, 200-216`.
- **Priorytet**: P0

### PLN-109: Próg — brak walidacji relacji min/reorder i zer
- **Co sprawdza**: minQty > reorderQty oraz oba = 0 są akceptowane (świadomy brak guardu — reorder_qty=0 znaczy „top-up do min").
- **Kroki**: 1) min=100, reorder=1 → zapis ok. 2) Zweryfikuj semantykę w MRP: sugestia = ceil(gap/1)×1.
- **Oczekiwana logika**: schema bez cross-check (`reorder-thresholds.ts:81-86`); semantyka `mrp-compute.ts:47-57`.
- **Priorytet**: P2

### PLN-110: Delete progu + wpływ na MRP
- **Co sprawdza**: usunięcie progu — item przestaje być below_min i traci lead-time/supplier w sugestiach; delete nieistniejącego → `not_found`.
- **Kroki**: 1) Item below_min. 2) Usuń próg. 3) runMrp → covered/at_risk, sugestia bez dueDate.
- **Oczekiwana logika**: `reorder-thresholds.ts:258-286`; `mrp-compute.ts:432-434`.
- **Priorytet**: P1

### PLN-111: RBAC progi — write npd.planning.write, read scheduler.run.read
- **Kroki**: 1) Read-only user: lista ok, upsert/delete forbidden.
- **Oczekiwana logika**: `reorder-thresholds.ts:38, 152, 183, 265`.
- **Priorytet**: P1

---

## Schedule (`/planning/schedule`)

### PLN-112: Board — okno 7 dni, statusy DRAFT/RELEASED/IN_PROGRESS
- **Co sprawdza**: board pokazuje WO tylko z 3 statusów w oknie 7 dni od UTC-midnight dziś; WO bez scheduled_end renderowane z fallbackiem 1h.
- **Kroki**: 1) WO w każdym statusie, w/poza oknem. 2) Otwórz board.
- **Oczekiwana logika**: `schedule/_lib/board.ts:13,23,26`; `schedule-board.ts:151-153`.
- **Priorytet**: P1

### PLN-113: Reschedule — tylko RELEASED
- **Co sprawdza**: przeciągnięcie DRAFT lub IN_PROGRESS → `invalid_state`; RELEASED → ok + historia `reschedule`; ochrona przed równoległą zmianą (UPDATE re-check statusu, 0 wierszy → `invalid_state`).
- **Kroki**: 1) Reschedule w każdym statusie. 2) Wyścig: zmień status między odczytem a zapisem.
- **Oczekiwana logika**: `RESCHEDULE_LEGAL_STATUSES=['RELEASED']` (`board.ts:16`); `schedule-board.ts:338-340, 387-389, 410-437`.
- **Priorytet**: P0

### PLN-114: Reschedule — walidacja zakresu dat i linii
- **Co sprawdza**: `end <= start` → `invalid_range`; daty muszą być datetime z offsetem; linia nieaktywna → `invalid_line`; linia z innym site → `line_site_mismatch`.
- **Kroki**: 1) end==start, end<start, linia inactive, linia obcego site.
- **Oczekiwana logika**: `schedule-board.ts:294-313, 342-360`.
- **Priorytet**: P0

### PLN-115: Cykl zależności — defensive guard przy reschedule
- **Co sprawdza**: WO na już-cyklicznym grafie zależności nie może być przesunięte → `dependency_cycle`; self-loop zawsze wykrywany.
- **Kroki**: 1) Wstrzyknij cykl w wo_dependencies (fixture). 2) Reschedule członka. 3) Odmowa.
- **Oczekiwana logika**: `findCycleInvolving` / `wouldCreateCycle` (`schedule/_lib/wo-cycle.ts:61-98`); wywołanie `schedule-board.ts:363-375`.
- **Priorytet**: P1

### PLN-116: Utilization per linia/dzień — wzór i >100%
- **Co sprawdza**: `scheduledHours` = suma nakładania interwałów WO z dobą UTC / 3.6e6; capacity z `scheduler_config.capacity_hours_per_day` (per-linia lub org default); `utilizationPct = hours/capacity×100` (1 dp), null przy capacity ≤0; przeciążenie >100% POKAZYWANE, nie blokowane.
- **Kroki**: 1) Linia capacity 8h, WO 10h w jednym dniu. 2) Board pokazuje 125%.
- **Oczekiwana logika**: `board.ts:178-183, 203-216, 222-273`.
- **Priorytet**: P1

### PLN-117: Konflikty barów — open-interval, stykające się dozwolone
- **Co sprawdza**: dwa WO na tej samej linii z nakładającymi się interwałami są flagowane; koniec==początek NIE jest konfliktem; WO bez linii nigdy nie konfliktuje.
- **Kroki**: 1) WO A 8–10, WO B 10–12 (ta sama linia) → brak konfliktu. 2) B 9–11 → konflikt.
- **Oczekiwana logika**: `computeConflictIds` (`board.ts:95-117`, warunek `:110`).
- **Priorytet**: P2

### PLN-118: Capacity block (NPD trial) — walidacje
- **Co sprawdza**: blockDate `YYYY-MM-DD`, czasy `HH:MM`, `end <= start` → `invalid_range`; linia musi być active → `invalid_line`; trial istnieć → `trial_not_found`; upsert per (org,trial) — jeden blok na trial; blok widoczny na boardzie w oknie.
- **Kroki**: 1) Każdy zły wariant + poprawny upsert ×2 (drugi nadpisuje).
- **Oczekiwana logika**: `capacity-block-actions.ts:13-19, 45-47, 55-86, 94`.
- **Priorytet**: P1

### PLN-119: Scheduler-handoff — released WO widoczne jako supply/board
- **Co sprawdza**: spójność: release WO (PLN-018) → WO pojawia się na boardzie (status RELEASED), jego `schedule_outputs` liczą się w MRP jako supplyFromProduction (PLN-038), staje się reschedulowalne (PLN-113).
- **Kroki**: 1) Utwórz WO z datą i linią, release. 2) Board: bar na linii; runMrp: supply widoczny.
- **Oczekiwana logika**: łańcuch `releaseWorkOrder.ts` → `board.ts:13` → `mrp.ts:102`.
- **Priorytet**: P0

### PLN-120: RBAC schedule — read vs reschedule
- **Kroki**: 1) Read-only: board widoczny, reschedule/capacity-block forbidden.
- **Oczekiwana logika**: `schedule-board.ts:52,147,317`; `capacity-block-actions.ts:51`.
- **Priorytet**: P1

---

## Carriers / freight (`/planning/carriers`)

### PLN-121: Upsert carrier — walidacje
- **Co sprawdza**: code 1–80, name 1–255, mode ∈ {road,sea,air,rail,parcel}, contactEmail poprawny email ≤255 (pusty → undefined), phone ≤64; update nieistniejącego id → `not_found`.
- **Kroki**: 1) Zły mode, zły email, update losowego uuid.
- **Oczekiwana logika**: `freight-types.ts:12, 70-78`; `freight-actions.ts:174-229`.
- **Priorytet**: P1

### PLN-122: Upsert lane — walidacje + mapping cost_basis
- **Co sprawdza**: carrierId musi istnieć w org (`not_found`); costAmount ≥0 ≤4 dp; currency 3 znaki uppercased; transitDays int 0–365; costBasis ∈ {per_shipment,per_kg,per_km,per_pallet}; UI `per_shipment` ↔ DB `'flat'` round-trip.
- **Kroki**: 1) Lane per_shipment → w DB `flat`, w odczycie znów per_shipment. 2) transitDays 400 → odmowa.
- **Oczekiwana logika**: `freight-types.ts:16, 22-26, 81-92`; `freight-actions.ts:130-136, 257-340`.
- **Priorytet**: P1

### PLN-123: RBAC freight — freight.manage; brak gate'a na odczyt
- **Co sprawdza**: upserty wymagają `freight.manage`; listy bez jawnego permission (RLS-only); brak tabeli (42P01) → puste listy zamiast 500.
- **Kroki**: 1) Read-user: lista ok, upsert forbidden.
- **Oczekiwana logika**: `freight-actions.ts:67, 76-92, 168, 251`.
- **Priorytet**: P1

---

## Import hub (`/planning/import`, `/work-orders/import`, `/transfer-orders/import`)

### PLN-124: Gate kart importu — fail-closed per uprawnienie
- **Co sprawdza**: karta PO widoczna tylko z `planning.po.manage`, TO z `planning.to.manage`, WO z `npd.planning.write`; brak uprawnienia = karta zablokowana (fail-closed).
- **Kroki**: 1) Trzy konta z pojedynczym uprawnieniem. 2) Hub pokazuje tylko właściwą kartę.
- **Oczekiwana logika**: `import/_actions/can-import-po.ts:33-43`.
- **Priorytet**: P1

### PLN-125: Parser generyczny (WO/TO) — nagłówki i grupowanie
- **Co sprawdza**: `header_mismatch`/`empty` jak PO; WO required `[external_ref,fg_code,qty,uom]`, grupowanie po external_ref; TO required 6 kolumn, grupowanie `from+to+external_ref`; CRLF/CR, cytowanie, puste linie.
- **Kroki**: 1) Pliki wadliwe/poprawne w obu wizardach.
- **Oczekiwana logika**: `parse-entity-csv.ts:48-150`; `wo-spec.ts:22-46,71`; `to-spec.ts:19-43,66-67`.
- **Priorytet**: P1

### PLN-126: Import WO — walidacja backendu (import-wo)
- **Co sprawdza**: FG code musi się rozwiązać, factory-release gate honorowany, qty/uom walidowane, dedup po external_ref — analogicznie do TO (PLN-100).
- **Kroki**: 1) CSV z FG nie-released-to-factory → wiersz odrzucony. 2) Duplikat external_ref → skip.
- **Oczekiwana logika**: `work-orders/_actions/import-wo.ts` (tor identyczny do `import-to.ts`; szczegóły do potwierdzenia — patrz Niepewności).
- **Priorytet**: P1

---

## Cross-cutting: izolacja org / RLS

### PLN-127: Izolacja org — odczyty wszystkich podmodułów
- **Co sprawdza**: user org B nie widzi WO/PO/TO/suppliers/forecasts/progów/lane'ów org A (listy puste, get → `not_found`, nigdy leak danych).
- **Kroki**: 1) Seed danych w org A. 2) Zaloguj org B, odpytaj każdą listę i każdy `/[id]`.
- **Oczekiwana logika**: każde SQL `org_id = app.current_org_id()` w `withOrgContext` (app_user, bez service-role) — m.in. `create-transfer-order-core.ts:129`, `mrp.ts:18-19`, `forecasts.ts:226`, `freight-actions.ts:452-457`.
- **Priorytet**: P0

### PLN-128: Izolacja org — mutacje cross-org po ID
- **Co sprawdza**: wywołanie akcji (release WO, transition PO/TO, receive, upsert progu z itemId obcego org) z UUID-em zasobu z innego org → `not_found`, zero zmian.
- **Kroki**: 1) Przechwyć ID z org A, wywołaj akcje jako org B.
- **Oczekiwana logika**: RLS + jawne walidacje in-org (`ensureItemInOrg` `actions.ts:446-456`, supplier in-org `reorder-thresholds.ts:200-209`).
- **Priorytet**: P0

### PLN-129: Site-RLS przy receive i WO
- **Co sprawdza**: user bez dostępu do site PO nie przyjmie linii (`app.user_can_see_site`); WO tworzone tylko na dostępnym site.
- **Kroki**: 1) User przypisany do site A, PO na site B → receive not_found/forbidden.
- **Oczekiwana logika**: `receive-po-line-core.ts:334-337`; `resolveWriteSiteId` (PLN-011).
- **Priorytet**: P1

### PLN-130: Audyt operacji planningowych
- **Co sprawdza**: create PO/TO, delete WO, cancel planned order zapisują `audit_events` z actor, before/after state, retention `operational`.
- **Kroki**: 1) Wykonaj operacje. 2) Sprawdź wiersze audytu.
- **Oczekiwana logika**: `writeProcurementAudit` (`procurement-shared.ts:207-235`); `releaseWorkOrder.ts:549`; `mrp.ts:1175-1176`; `create-transfer-order-core.ts:198`.
- **Priorytet**: P2

---

## Niepewności

1. **Cancel WO a rezerwacje/WAC/LP** — w `releaseWorkOrder.ts` (cancel chain) nie znaleziono kodu zwalniania rezerwacji materiałowych ani korekt WAC; blokerem są tylko `wo_executions`/`wo_outputs`. Jeśli „niedawno naprawiany cancelWo" (z brief-u) obejmuje zwalnianie rezerwacji, ta logika żyje poza katalogiem planning (produkcja/warehouse) — do potwierdzenia gdzie i czy jest testowana.
2. **`import-wo.ts`** — nie przeczytany linia-po-linii (założono symetrię z `import-to.ts`); PLN-126 wymaga weryfikacji szczegółów (gate factory-release w imporcie, tryby all_or_nothing).
3. **MOQ / lead-time na PO** — brak jakiejkolwiek walidacji MOQ i lead-time-vs-expected_delivery w kodzie PO (dane tylko przechowywane). Testy „MOQ przy PO" z brief-u nie mają odpowiednika w kodzie — potencjalny gap produktowy, nie test.
4. **Duplikat supplier-item** — nie istnieje osobny katalog supplier-item z guardem duplikatów; link to read-only `supplier_specs` lookup. Gap względem założeń brief-u.
5. **Brak RBAC na odczytach**: `getPoAging`, `getSupplierScorecard`, `listCarriers/listTransportLanes`, `wo-form-data`, `chain-preview` — tylko RLS. Czy to zamierzone (read = org-open), czy finding bezpieczeństwa — decyzja ownera.
6. **Niespójności precyzji**: WO create 4 dp vs update 3 dp (PLN-015); TO create-line 3 dp vs add-line 6 dp (PLN-099); materiały SQL 3 dp vs chain qty TS 4 dp (PLN-035). Zachowanie na granicach zaokrągleń nieprzetestowane w kodzie.
7. **`same_warehouse` vs `invalid_input`** przy update TO (PLN-088) — różne kody błędów dla tej samej reguły; UI może pokazywać gorszy komunikat.
8. **Utilization bez capu** — scheduler pokazuje >100% zamiast blokować; brak twardego gate'a capacity przy release/reschedule. Zgodne z kodem, ale sprzeczne z intuicyjnym „capacity check" — do potwierdzenia z ownerem.
9. **Forecast w przeszłości zapisywalny** (PLN-103) — zapis przechodzi, ale jest martwy (grid i MRP go ignorują). Świadome czy gap — do decyzji.
10. **Statusy `IN_PROGRESS/ON_HOLD/COMPLETED/CLOSED` WO** — przejścia do nich należą do modułu produkcji (poza planning); katalog testuje tylko to, że planning ich nie ustawia i odpowiednio blokuje edycje/cancel.


---
<a id="sekcja-c"></a>
# C — Production + Scheduler + OEE — Katalog testów

Obszar: `apps/web/app/[locale]/(app)/(modules)/{production,scheduler,oee}/**` + `apps/web/lib/production/**` + scheduler `_actions/_lib`.
Stos: Next.js App Router, Supabase/Postgres, multi-tenant `org_id` + RLS (`app.current_org_id()`).
Konwencja: każdy zapis idzie przez `withOrgContext` jako `app_user`; RLS scope’uje wszystkie wiersze. Verby cyklu życia WO NIGDY nie piszą `wo_executions.status` free-formem — przechodzą przez `wo-state-machine.ts` (append `wo_events` + CAS na `version`).

Legenda priorytetów: **P0** = pieniądze/masa/bezpieczeństwo żywności/stan magazynu/nieodwracalne; **P1** = poprawność biznesowa/UX krytyczny; **P2** = kosmetyka/etykiety/sortowanie.

Mapowanie `ERROR_STATUS` (`lib/production/shared.ts:80-99`): `invalid_input`→422, `forbidden`/`esign_failed`→403, `not_found`→404, `rate_limited`→429, `persistence_failed`→500; **409** = `invalid_state`, `invalid_state_transition`, `concurrent_modification`, `quality_hold_active`, `changeover_signoff_required`, `allergen_changeover_required`, `wo_snapshot_missing`, `factory_release_incomplete`, `upstream_wip_not_ready`, `closed_production_strict_failed`, `insufficient_input_for_output`, `insufficient_lp_quantity`.

---

## Wzory (referencja dla sekcji matematycznych)

- **Konsumpcja qty→kg** (`consumption-qty-to-kg.ts:8-24`): `kg` / `base=kg` → qty; `each|pcs|szt|ea` → `qty × net_qty_per_each`; `box` → `qty × each_per_box × net_qty_per_each`; UoM masowy → `qty × factor_to_base` (category='mass'); `lb` → `qty × 0.45359237`; inaczej `NULL` (wiersz pomijany w sumie).
- **Skalar materiału per_box** (`wo-material-scalar.ts:13-28`): `lineBasis='per_box'` → `plannedBaseQty / (each_per_box × net_qty_per_each)`; `each_per_box × net_qty_per_each ≤ 0` → `WoMaterialScalarError('pack_hierarchy_incomplete')`.
- **Yield/tolerancja (strict gate, complete)** (`evaluate-closed-production-strict.ts`): `effective_yield_pct` = pierwszy `wo_operations.expected_yield_percent` (po `sequence`) ?? `bom_headers.yield_pct` ?? 100. `expected_input_kg = output_kg / (yield/100)`. `within_tolerance` (tol=**0.02**) TRUE gdy `yield>0 AND posted_consumption>0 AND output_kg>0 AND expected×(1−0.02) ≤ posted ≤ expected×(1+0.02)`.
- **Mass-balance przy output** (`register-output.ts:585-661`): WARN gdy `posted>0 AND yield>0 AND running_output_kg > posted × (yield/100) × (1 + 0.02)`; BLOCK gdy dodatkowo `block_pct>0 AND running_output_kg > posted × (yield/100) × (1 + block_pct/100)` (`block_pct` z `tenant_variations.feature_flags→massbalance_threshold_pct`). BLOCK → `insufficient_input_for_output` 409.
- **Catch-weight** (`register-output.ts:214-246`): `avg = round((Σmicro + n/2)/n)`; `variance = |avg−ref|/ref` (4 dp, ułamek); `warning = variance > tolerance` (ściśle); domyślna tolerancja **0.1** (10%) / override z inputu / `variance_tolerance_pct/100`.
- **Koszt robocizny WO** (`labor-actions.ts:293-339`): per log `hours = max(0, ended−started)/3.6e6` (otwarte logi liczone do `now`); `cost = hours × rate_per_hour`; `noRate` gdy stawka NULL → 0; agregacja per user; waluta = pierwszy niezerowy log ?? `GBP`.
- **Alokacja kosztu disassembly** (`register-disassembly-output.ts:620-663`): pośredni output `alloc = round(total_input_cost × allocation_pct / 100)`; **ostatni** output `alloc = total_input_cost − Σposzczególne` (reszta bez dryfu); `cost_per_kg = alloc / output_qty`.
- **OEE** (`oee-snapshot-producer.ts`): `availability = clamp₀‥₁₀₀((runtime − downtime)/runtime × 100)` (runtime = `completed_at − started_at` min; downtime = scalone/przycięte interwały `downtime_events`); `performance = clamp((Σ expected_duration_minutes)/(runtime − downtime) × 100)` (HONEST NULL bez expected lub gdy run≤0); `quality = clamp(good/(good+rejected+waste) × 100)` (good = Σ`wo_outputs.qty_kg` gdzie `qa_status<>'FAILED'`, rejected = `=FAILED`, waste = Σ`wo_waste_log.qty_kg`; HONEST NULL gdy mianownik 0); `oee = A×P×Q/10000` (kolumna GENERATED, NULL gdy którykolwiek NULL).

---

## Wykonanie WO — cykl życia (`production/wos/**`, `work-orders/[id]/*/route.ts`, `lib/production/wo-state-machine.ts`)

Legalne przejścia (`wo-state-machine.ts:46-53`): `planned→{start,cancel}`, `in_progress→{pause,complete,cancel}`, `paused→{resume,cancel}`, `completed→{close,cancel}`, `closed`/`cancelled` terminalne.

### PRD-001: Start WO planned→in_progress (happy path)
- **Co sprawdza**: legalne uruchomienie WO z pełnym snapshotem factory-release.
- **Kroki**: 1) WO w stanie RELEASED/planned z `active_bom_header_id` (+`active_factory_spec_id` dla FG) 2) POST `work-orders/[id]/start` z `transactionId` 3) sprawdź odpowiedź.
- **Oczekiwana logika**: 200; status→`in_progress`; freeze BOM snapshot; materializacja `wo_outputs` placeholder (qty_kg=0) z `schedule_outputs`; outbox `production.wo.started` (`start-wo.ts:89-327`).
- **Priorytet**: P0

### PRD-002: Start bez snapshotu BOM/spec
- **Co sprawdza**: preflight factory-release.
- **Kroki**: 1) WO bez `active_bom_header_id` (lub FG bez `active_factory_spec_id`) 2) start.
- **Oczekiwana logika**: 409 `wo_snapshot_missing`, `details.remediation='release_work_order'`; brak self-heal na nowszy BOM (`start-wo.ts:112-129`).
- **Priorytet**: P0

### PRD-003: Start z osieroconym/cross-site snapshotem
- **Co sprawdza**: `validateReleasedSnapshotBindings`.
- **Kroki**: 1) WO wskazuje nieistniejący BOM / spec z innego site / niespójny bundle spec.bom_header 2) start.
- **Oczekiwana logika**: 409 `factory_release_incomplete` z `details.code ∈ {release_snapshot_orphan, cross_site_factory_spec, bom_spec_bundle_mismatch}` (`start-wo.ts:408-480`).
- **Priorytet**: P0

### PRD-004: Start zablokowany otwartym changeover (dual-sign)
- **Co sprawdza**: bramka allergen changeover (prong 3a).
- **Kroki**: 1) na linii WO istnieje `changeover_events` z `risk_level ∈ {medium,high,segregated}` i `dual_sign_off_status ∉ {complete,completed}` 2) start.
- **Oczekiwana logika**: 409 `changeover_signoff_required`, `details.code='changeover_signoff_required'`, `legacyCode='allergen_changeover_required'`, `changeoverId` obecne (`start-wo.ts:165-183`). Bramka bezterminowa (brak timeoutu).
- **Priorytet**: P0

### PRD-005: Start zablokowany snapshot segregation_required (bez eventu changeover)
- **Co sprawdza**: prong 3b — brak eventu ≠ brak ryzyka.
- **Kroki**: 1) `allergen_profile_snapshot.segregation_required=true`, brak wiersza `changeover_events` 2) start.
- **Oczekiwana logika**: 409 `changeover_signoff_required`, `details.code='segregation_required'` (`start-wo.ts:192-200`).
- **Priorytet**: P0

### PRD-006: Line-identity matching changeover (UUID↔code)
- **Co sprawdza**: `findOpenLineChangeover` dopasowuje legacy row po CODE gdy start podaje UUID i odwrotnie.
- **Kroki**: 1) `changeover_events.line_id` = kod linii, start z UUID linii 2) start.
- **Oczekiwana logika**: gate zadziała (blokuje) mimo różnicy klucza (`start-wo.ts:364-387`).
- **Priorytet**: P1

### PRD-007: Start zablokowany upstream WIP niegotowy
- **Co sprawdza**: `assertUpstreamWipReady('start')`.
- **Kroki**: 1) WO ma `wo_dependencies` z upstream WIP producentem, którego `posted_output_kg < required_qty` (lub status ∉ {IN_PROGRESS,ON_HOLD,COMPLETED,CLOSED}) 2) start.
- **Oczekiwana logika**: 409 `upstream_wip_not_ready` z operatorskim `message` (blokujący predecessor). Sufficiency liczona inkrementalnie z `wo_outputs.qty_kg` (primary, `correction_of_id is null`), NIE z `produced_quantity` (`upstream-wip-dependency-gate.ts:39-97`).
- **Priorytet**: P0

### PRD-008: Podwójny Start (idempotencja + brak orphan outputs)
- **Co sprawdza**: R14 replay i deterministyczne output txn_id.
- **Kroki**: 1) start OK 2) ponów start z tym samym `transactionId`; 3) ponów z NOWYM `transactionId`.
- **Oczekiwana logika**: (2) replay zwraca istniejący stan bez drugiego eventu/version bump; (3) przejście odrzucone (już in_progress) PRZED zapisem outputs; `wo_outputs.transaction_id` deterministyczne per (woId,scheduleOutputId) → `on conflict do nothing` (brak duplikatów) (`start-wo.ts:217-299`, `wo-state-machine.ts:208-218`).
- **Priorytet**: P0

### PRD-009: Pause in_progress→paused + otwarcie downtime
- **Co sprawdza**: pause tworzy atomowo otwarty `downtime_events` (source='wo_pause').
- **Kroki**: 1) WO in_progress 2) POST pause z `reasonCategoryId`, `lineId`.
- **Oczekiwana logika**: 200; status→paused; jeden otwarty downtime (`ended_at NULL`); outbox `production.downtime.recorded` state='opened' (`pause-resume-wo.ts:56-134`).
- **Priorytet**: P0

### PRD-010: Pause bez kategorii downtime / z nieistniejącą kategorią
- **Co sprawdza**: V-PROD-22 kategoria wymagana; FK.
- **Kroki**: 1) pause z `reasonCategoryId` nieistniejącym w org.
- **Oczekiwana logika**: rollback całej txn (`ProductionAbort`); `invalid_input` `details.code='invalid_category'` (23503) (`pause-resume-wo.ts:111-121`).
- **Priorytet**: P1

### PRD-011: Resume paused→in_progress zamyka downtime
- **Co sprawdza**: resume ustawia `ended_at` na jedynym otwartym `wo_pause`.
- **Kroki**: 1) WO paused 2) POST resume (bez `actualDurationMin`).
- **Oczekiwana logika**: 200; status→in_progress; `ended_at=now()`; `duration_min` GENERATED (nigdy nie pisany wprost); outbox state='closed' (`pause-resume-wo.ts:151-216`).
- **Priorytet**: P0

### PRD-012: Resume z korektą actualDurationMin
- **Co sprawdza**: `ended_at = started_at + N min`; walidacja N.
- **Kroki**: 1) resume z `actualDurationMin=30`; 2) z `actualDurationMin=-1` lub float.
- **Oczekiwana logika**: (1) `ended_at` przesunięty; (2) `invalid_input` `code='invalid_actual_duration_min'` (`pause-resume-wo.ts:157-190`).
- **Priorytet**: P1

### PRD-013: Nielegalne przejścia stanu (macierz)
- **Co sprawdza**: pełna macierz zabronionych przejść.
- **Kroki**: dla każdego: resume gdy in_progress; pause gdy paused; complete gdy planned; close gdy in_progress; start gdy completed; jakikolwiek verb gdy closed/cancelled.
- **Oczekiwana logika**: 409 `invalid_state_transition` z `details.{from,verb}`; closed/cancelled terminalne (`wo-state-machine.ts:46-68,223-229`).
- **Priorytet**: P0

### PRD-014: Optymistyczny zamek — współbieżne przejścia (CAS)
- **Co sprawdza**: dwa równoległe verby na tej samej wersji.
- **Kroki**: 1) dwa równoczesne POST (np. pause+complete) na wersji N.
- **Oczekiwana logika**: jeden wygrywa (version+1); przegrany → `WoConcurrentModificationError` → 409 `concurrent_modification` z `expectedVersion`; appended `wo_events` przegranego wycofany (rollback) (`wo-state-machine.ts:255-277`, `route-helpers.ts:146-151`).
- **Priorytet**: P0

### PRD-015: Complete — yield gate GREEN (primary output + tolerancja)
- **Co sprawdza**: warunek kompletacji §10.3.
- **Kroki**: 1) WO in_progress z ≥1 primary output qty_kg>0 i konsumpcją w tolerancji 2) complete.
- **Oczekiwana logika**: 200; status→completed; zapis `actual_qty`/`produced_quantity` z primary outputs; snapshot OEE zapisany w tej samej txn; outbox `production.wo.completed` (`complete-cancel-wo.ts:180-357`).
- **Priorytet**: P0

### PRD-016: Complete zablokowany — brak primary output
- **Co sprawdza**: `output_yield_gate` bez override.
- **Kroki**: 1) WO bez primary output qty>0 2) complete bez `overrideReasonCode`.
- **Oczekiwana logika**: 409 `closed_production_strict_failed`, `details.code='output_yield_gate_failed'` (`complete-cancel-wo.ts:207-223`).
- **Priorytet**: P0

### PRD-017: Complete zablokowany — konsumpcja poza tolerancją
- **Co sprawdza**: strict gate 2%.
- **Kroki**: 1) primary output jest, ale `posted_consumption` poza pasmem `expected×(1±0.02)` 2) complete bez override.
- **Oczekiwana logika**: 409 `closed_production_strict_failed`, `code='consumption_yield_out_of_tolerance'` (`complete-cancel-wo.ts:200-223`, `evaluate-closed-production-strict.ts:77-83`).
- **Priorytet**: P0

### PRD-018: Complete z override yield-gate (e-sign + taksonomia)
- **Co sprawdza**: ścieżka supervisor override.
- **Kroki**: 1) gate czerwony 2) complete z `overrideReasonCode` spoza taksonomii → oczekuj `invalid_input`; 3) z kodem legalnym {scrap_quality,equipment_failure,material_shortage,other} bez PIN → `invalid_input`; 4) z kodem + PIN + reason + uprawnieniem `production.wo.override_yield`.
- **Oczekiwana logika**: (2) `code='invalid_yield_gate_override_reason'`; (3) e-sign PIN/reason wymagane; (4) 200 + `audit_events` `production.wo.yield_gate_overridden`; brak uprawnienia → 403 (`complete-cancel-wo.ts:204-315`, `yield-gate-override.ts`).
- **Priorytet**: P0

### PRD-019: Complete zablokowany — aktywny quality hold na WO/output LP
- **Co sprawdza**: `assertWoNotOnHold` + `holdsGuard` per output LP.
- **Kroki**: 1) aktywny hold na WO lub na LP zarejestrowanego outputu 2) complete.
- **Oczekiwana logika**: rollback; 409 `quality_hold_active`; emit `production.consume.blocked` na świeżej txn; body `{holdId, lpId}` (`complete-cancel-wo.ts:120-178`, `route-helpers.ts:124-143`).
- **Priorytet**: P0

### PRD-020: Complete zablokowany — upstream WIP niegotowy
- **Co sprawdza**: `assertUpstreamWipReady('complete')`.
- **Kroki**: 1) upstream niegotowy 2) complete.
- **Oczekiwana logika**: 409 `upstream_wip_not_ready` (`complete-cancel-wo.ts:132-138`).
- **Priorytet**: P1

### PRD-021: Close completed→closed z supervisor e-sign
- **Co sprawdza**: CFR-21 Part 11 atomowość e-sign+close.
- **Kroki**: 1) WO completed 2) close z `signerUserId`,`pin`,`reason`.
- **Oczekiwana logika**: 200; walidacja legalności `close` PRZED podpisem; `signEvent` (e_sign_log + audit) potem CAS→closed; outbox `production.wo.closed`; jeśli transition po podpisie zawiedzie → THROW → rollback podpisu (`close-wo.ts:50-154`).
- **Priorytet**: P0

### PRD-022: Close bez reason / na WO on-hold / w złym stanie
- **Co sprawdza**: bramki close.
- **Kroki**: 1) close z pustym reason → `invalid_input`; 2) close WO z aktywnym hold → `quality_hold_active`; 3) close WO in_progress → `invalid_state_transition`.
- **Oczekiwana logika**: podpis NIE jest utrwalany zanim przejście uznane za legalne (pre-gate) (`close-wo.ts:57-88`).
- **Priorytet**: P0

### PRD-023: Cancel z dowolnego niekończowego stanu (reason wymagany)
- **Co sprawdza**: terminalny branch cancel.
- **Kroki**: 1) cancel bez `reasonCode` → `invalid_input`; 2) cancel WO planned → cancelled.
- **Oczekiwana logika**: 200 dla (2); status→cancelled; outbox `production.wo.closed` terminal='cancelled' (`complete-cancel-wo.ts:465-517`).
- **Priorytet**: P0

### PRD-024: Cancel blokowany — żywe output LP obecne
- **Co sprawdza**: guard live-output-LP (in_progress/paused/completed).
- **Kroki**: 1) WO ma zarejestrowany output z LP `status ∉ {destroyed,consumed}` i qty_kg>0 2) cancel.
- **Oczekiwana logika**: 409 `invalid_state`, `code='live_output_lps_present'`, lista `outputs[{lp_number,qty}]` — najpierw void każdy output (`complete-cancel-wo.ts:476-492`).
- **Priorytet**: P0

### PRD-025: Cancel completed WO — WAC reversal + destroy output LP
- **Co sprawdza**: odwrócenie WAC i zniszczenie LP przy anulowaniu completed.
- **Kroki**: 1) completed WO, output LP bez downstream 2) cancel.
- **Oczekiwana logika**: dla każdego output LP `applyOutputWacReversal`; `lp_state_history` →'destroyed'; LP `status='destroyed', quantity=0, reserved_qty=0`; `voidedOutputLpIds` w outboxie (`complete-cancel-wo.ts:494-650`).
- **Priorytet**: P0

### PRD-026: Cancel completed blokowany — output LP z downstream konsumpcją/dziećmi (LP guard)
- **Co sprawdza**: `hasLpConsumptionOrChildren` (świeżo naprawiany guard).
- **Kroki**: 1) output LP ma `wo_material_consumption.qty_consumed>0` LUB child `parent_lp_id` 2) cancel completed.
- **Oczekiwana logika**: 409 `invalid_state`, `code='output_lp_has_downstream_usage'`, `lpId`; brak reversal/destroy (`complete-cancel-wo.ts:494-508`, `lp-downstream-guard.ts`).
- **Priorytet**: P0

### PRD-027: Release DRAFT→RELEASED (idempotencja + upstream gate)
- **Co sprawdza**: `release/route.ts` (planning action, nie runTransition).
- **Kroki**: 1) DRAFT WO 2) POST release; 3) ponów release na RELEASED; 4) release WO z upstream w stanie DRAFT/CANCELLED.
- **Oczekiwana logika**: (2) 200; (3) idempotent ok; (4) 409 `upstream_wip_not_ready`; non-DRAFT (poza RELEASED) → `invalid_state`; `pack_hierarchy_incomplete` gdy per_box niekompletny; uprawnienie `npd.planning.write` (`release/route.ts`, `releaseWorkOrder.ts:191-227`).
- **Priorytet**: P1

### PRD-028: Malformed JSON / zła walidacja zod na trasach transition
- **Co sprawdza**: `runTransition` glue.
- **Kroki**: 1) POST start z ciałem non-JSON; 2) POST pause bez `transactionId`.
- **Oczekiwana logika**: 422 `invalid_input`; przy zod fail `details=flatten()` (`route-helpers.ts:97-115`).
- **Priorytet**: P1

---

## Konsumpcja materiałów (`_actions/consume-material-actions.ts`, `lib/production/consume-material-core.ts`)

Uprawnienie: `production.consumption.write`; override-approve: `production.consumption.override_approve`.

### PRD-029: Desktop consumption happy path (FEFO auto vs explicit LP)
- **Co sprawdza**: `recordDesktopConsumption` z i bez explicit LP.
- **Kroki**: 1) konsumpcja z explicit `lpId`; 2) bez lpId ale z `reasonCode` (FEFO auto-pick).
- **Oczekiwana logika**: LP zresolvowany przez `resolveConsumptionLp`; FEFO wybiera z `v_inventory_available` `order by expiry_date asc, lp_number asc` `for update`; dekrement `quantity−qty ≥ reserved_qty`; WAC debit; wpis `wo_material_consumption` (`consume-material-actions.ts:397-853`, `consume-material-core.ts:77-296`).
- **Priorytet**: P0

### PRD-030: Walidacja ilości konsumpcji (numeric(12,3))
- **Co sprawdza**: `normalizePersistedQuantity`.
- **Kroki**: dla qty: `0`, `12.9999` (scale>3), `9999999999.5` (int>9 cyfr), `-5`, `abc`.
- **Oczekiwana logika**: `invalid_qty`/`ConsumptionQuantityError` z kodami `invalid_qty|qty_scale_exceeded|qty_range_exceeded`; brak cichej truncacji (`consumption-qty-to-kg`→ konwersja; `consume-material-core.ts:39-67`).
- **Priorytet**: P0

### PRD-031: Idempotencja konsumpcji (clientOpId)
- **Co sprawdza**: deterministyczny txn_id + advisory lock + probe.
- **Kroki**: 1) dwa POST z tym samym `clientOpId`.
- **Oczekiwana logika**: drugi zwraca `{replay:true}` bez ponownego dekrementu; `wo_material_consumption.transaction_id` UNIQUE jako ostatnia bramka; `pg_advisory_xact_lock` serializuje (`consume-material-actions.ts:205-210,438-492,806-814`).
- **Priorytet**: P0

### PRD-032: Konsumpcja — WO nie w stanie recordable
- **Co sprawdza**: bramka lifecycle.
- **Kroki**: 1) WO planned/closed/cancelled 2) konsumpcja.
- **Oczekiwana logika**: `wo_not_consumable` (stan ∉ {in_progress,paused,completed}) (`consume-material-actions.ts:494-501`).
- **Priorytet**: P0

### PRD-033: Konsumpcja zablokowana — WO na hold
- **Co sprawdza**: `assertWoNotOnHold` + `emitConsumeBlocked`.
- **Kroki**: 1) aktywny hold na WO 2) konsumpcja.
- **Oczekiwana logika**: `quality_hold_active`; emit `production.consume.blocked` (`consume-material-actions.ts:440-454`).
- **Priorytet**: P0

### PRD-034: Over-consumption dwupoziomowe (warn vs block+approval)
- **Co sprawdza**: progi `overconsume_warn_pct` i `overconsume_threshold_pct`.
- **Kroki**: 1) qty między warn a threshold → proceed z `warning`; 2) qty ≥ threshold bez approvera → `overconsume_approval_required`; 3) z approverem.
- **Oczekiwana logika**: (`FOR UPDATE OF wm`); (1) `warning` w odpowiedzi; (2) blok z `details`; (3) e-sign approvera (`consume-material-actions.ts:507-641`).
- **Priorytet**: P0

### PRD-035: Over-consumption — walidacja approvera + PIN
- **Co sprawdza**: reguły approvera.
- **Kroki**: approver = operator (self) → `invalid_approver`; approver bez PIN → `pin_not_enrolled`; PIN locked → `pin_locked`; zły PIN → `invalid_pin`; approver bez uprawnienia override → `approver_forbidden`; `signEvent` throw → `esign_failed`.
- **Oczekiwana logika**: każdy kod jak wyżej (`consume-material-actions.ts:585-629`).
- **Priorytet**: P0

### PRD-036: FEFO deviation (naruszenie kolejności) wymaga reason+e-sign
- **Co sprawdza**: `violatesFefoOrder`.
- **Kroki**: 1) explicit LP nowszy niż dostępny starszy (naruszenie FEFO) bez reason → `fefo_deviation_approval_required`; 2) bez esign password → `esign_failed`; 3) z reason+esign.
- **Oczekiwana logika**: flaga `fefo_adherence_flag=false`+`fefo_deviation_reason` zapisane (`consume-material-actions.ts:697-733`).
- **Priorytet**: P1

### PRD-037: Konsumpcja ponad stan / LP niedostępny
- **Co sprawdza**: dekrement guard + rollback po override.
- **Kroki**: 1) qty > `quantity−reserved_qty` 2) konsumpcja.
- **Oczekiwana logika**: `lp_unavailable`; jeśli override e-sign już się odpalił → THROW (rollback), nie ciche ok:false (`consume-material-actions.ts:751-758`).
- **Priorytet**: P0

### PRD-038: LP safety guard — released/available/expired/locked/hold
- **Co sprawdza**: `assertLpConsumableForProduction`.
- **Kroki**: dla explicit LP: `qa_status≠'released'`→`lp_not_released`; `status≠'available'`→`lp_unavailable`; `expiry_date<today`→`lp_expired`; zablokowany przez innego usera <5 min→`lp_locked`; aktywny hold→`quality_hold_active` (przed shortage).
- **Oczekiwana logika**: hold sprawdzany PRZED dostępnością (quarantine nie maskuje się jako shortage) (`lp-safety-guard.ts:37-71`).
- **Priorytet**: P0

### PRD-039: Konwersja UoM konsumpcji do kg (mieszane jednostki)
- **Co sprawdza**: `CONSUMPTION_ROW_QTY_KG_CASE` we wszystkich gałęziach.
- **Kroki**: konsumpcje w kg, each (z `net_qty_per_each`), box (z `each_per_box`×`net`), lb, UoM masowy z `factor_to_base`, oraz UoM bez konwersji (NULL).
- **Oczekiwana logika**: sumy kg jak we wzorze; wiersz NULL (nieznane UoM) pominięty w `posted_consumption_kg` (wpływa na strict/mass-balance) (`consumption-qty-to-kg.ts:8-52`).
- **Priorytet**: P0

### PRD-040: listConsumableLps — walidacja + FEFO order
- **Co sprawdza**: read akcja podpowiedzi LP.
- **Kroki**: 1) woId/materialId nie-UUID → `invalid_input`; 2) materiał spoza WO → `invalid_material`; 3) poprawnie → do 25 LP FEFO.
- **Oczekiwana logika**: `v_inventory_available` limit 25 FEFO (`consume-material-actions.ts:320-372`).
- **Priorytet**: P1

### PRD-041: Progress konsumpcji — nie sumuj różnych UoM
- **Co sprawdza**: `summarizeConsumptionProgress`.
- **Kroki**: WO BOM z 2 UoM (kg + pcs).
- **Oczekiwana logika**: `mixedUnits=true`, `progressPct=null`, per-UoM `progressPct = round(consumed/required×1000)/10`; required≤0→0% (`consumption-progress.ts:29-61`).
- **Priorytet**: P1

---

## Rejestracja produkcji / Output (`lib/production/output/register-output.ts`, `outputs/route.ts`, `wos/[id]` modale)

Uprawnienie: `production.output.write`.

### PRD-042: Register primary output (forward) happy path
- **Co sprawdza**: pełny insert outputu + LP + genealogia + WAC.
- **Kroki**: 1) WO in_progress 2) POST outputs z qty.
- **Oczekiwana logika**: 200; nowe LP `status='received'/qa_status='pending'`; batch `{wo_number}-OUT-{NNN}`; `expiry_date = today + shelf_life_days`; genealogia z consumed LP; `qty_kg>0` wymagane (`register-output.ts:335-356,905-981,970`).
- **Priorytet**: P0

### PRD-043: Output — allow-list produktu (V-PROD-03)
- **Co sprawdza**: `assertOutputProductAllowed`.
- **Kroki**: 1) output z `product_id` spoza {WO primary item, schedule_outputs, bom_co_products} 2) rejestracja.
- **Oczekiwana logika**: 422 `invalid_reference`; `by_product` dopasowuje rolę `in ('byproduct','by_product')` (`register-output.ts:285-333`).
- **Priorytet**: P0

### PRD-044: Output — mass-balance WARN (nadprodukcja 2%)
- **Co sprawdza**: `evaluateMassBalanceGate` gałąź WARN.
- **Kroki**: 1) skumulowany output > posted×(yield/100)×1.02, bez tenant block_pct 2) output.
- **Oczekiwana logika**: 200 z `mass_balance_warning`; WO `over_production_flagged=true` (`register-output.ts:644-647,1025-1034`).
- **Priorytet**: P0

### PRD-045: Output — mass-balance BLOCK (tenant flag)
- **Co sprawdza**: gałąź BLOCK z `massbalance_threshold_pct`.
- **Kroki**: 1) tenant `feature_flags.massbalance_threshold_pct` ustawiony; output przekracza `×(1+block_pct/100)`.
- **Oczekiwana logika**: 409 `insufficient_input_for_output` (`register-output.ts:648-661`).
- **Priorytet**: P0

### PRD-046: Output catch-weight — capture + wariancja + tolerancja
- **Co sprawdza**: `computeCatchWeightSummary` i tryby fixed/catch.
- **Kroki**: 1) item `weight_mode='catch'` bez `catch_weight_kg_per_unit`→`invalid_input`; 2) z wagami jednostkowymi — sprawdź `variance_pct` (ułamek) i `warning` gdy `variance>tolerance`; 3) `weight_mode='fixed'` z podanymi catch weights→`invalid_input`.
- **Oczekiwana logika**: ref = `item.nominal_weight`; tolerancja override ?? `variance_tolerance_pct/100` ?? 0.1 (`register-output.ts:214-246,850-890`).
- **Priorytet**: P0

### PRD-047: Output — quality hold na LP/WO
- **Co sprawdza**: `holdsGuard` przed mutacją; qa_status ON_HOLD.
- **Kroki**: 1) aktywny hold WO→ output rejestrowany z `qa_status='ON_HOLD'` (nie PENDING); 2) aktywny hold na podanym LP → `QualityHoldError`.
- **Oczekiwana logika**: (1) `qa_status` z v_active_holds; (2) 409 `quality_hold_active` + emit blocked (`register-output.ts:918-981`).
- **Priorytet**: P0

### PRD-048: Output — WO nie recordable / walidacja qty
- **Co sprawdza**: bramka OUTPUT_RECORDABLE_STATES + qty>0.
- **Kroki**: 1) WO planned → `wo_not_recordable` 409; 2) qty ≤0 → `invalid_input` 422; 3) `qtyUnits` bez `unitsUom` → invalid.
- **Oczekiwana logika**: jak wyżej (`register-output.ts:75-100,890,911`).
- **Priorytet**: P1

### PRD-049: Output — supplied LP walidacja (product/uom/site/wo/status)
- **Co sprawdza**: `validateAndLockSuppliedOutputLp`.
- **Kroki**: dla podanego LP: zły product→`invalid_reference`; zły uom→`uom_mismatch`; cross-site/inny wo_id/brak warehouse→`invalid_reference`; status terminalny/≠'received'→`lp_not_receivable`; qa_status≠'pending'→`lp_not_receivable`.
- **Oczekiwana logika**: kody jak wyżej (`register-output.ts:478-564`).
- **Priorytet**: P1

### PRD-050: Output idempotencja (transaction_id / batch+year)
- **Co sprawdza**: mapowanie 23505.
- **Kroki**: 1) powtórka z tym samym transaction_id; 2) kolizja batch+year V-PROD-24.
- **Oczekiwana logika**: 409 `already_recorded` (`register-output.ts:1006-1016`).
- **Priorytet**: P1

### PRD-051: Output bez konsumpcji (genealogy empty-state)
- **Co sprawdza**: output gdy brak posted consumption (nil-LP sentinel nie liczy się jako genealogia).
- **Kroki**: 1) WO bez konsumpcji 2) output.
- **Oczekiwana logika**: mass-balance no-op gdy posted=0; genealogia pusta OK; detail loader ostrzega „output bez konsumpcji" (sentinel `0000…` wykluczony) (`register-output.ts:658`, `get-work-order-detail.ts:44-46`).
- **Priorytet**: P1

### PRD-052: Brak warehouse dla site
- **Co sprawdza**: `no_warehouse_for_site`.
- **Kroki**: 1) site bez warehouse 2) output.
- **Oczekiwana logika**: 409 `no_warehouse_for_site` z komunikatem „set one in Settings → Sites" (`register-output.ts:679-739`).
- **Priorytet**: P1

---

## Disassembly output (`register-disassembly-output.ts`, `disassembly-outputs/route.ts`)

### PRD-053: Disassembly — happy path (co-product + by-product)
- **Co sprawdza**: 1 input LP → N co-produktów z alokacją kosztu.
- **Kroki**: 1) WO z BOM `bom_type='disassembly'`, input LP skonsumowany 2) POST z outputs matchującymi wszystkie `bom_co_products`.
- **Oczekiwana logika**: 200; nowe LP `received/pending` uom='kg'; genealogia `derived`; `output_type = is_byproduct?'by_product':'co_product'`; WAC + cost ledger `source='disassembly_allocation'` (`register-disassembly-output.ts:520-719`).
- **Priorytet**: P0

### PRD-054: Disassembly — alokacja kosztu (reszta na ostatnim)
- **Co sprawdza**: brak dryfu zaokrągleń.
- **Kroki**: 3 co-produkty z allocation_pct sumującym do 100.
- **Oczekiwana logika**: Σ allocatedCost == total_input_cost dokładnie; ostatni = remainder (`register-disassembly-output.ts:620-663`).
- **Priorytet**: P0

### PRD-055: Disassembly — walidacja allocation_pct i co-product match
- **Co sprawdza**: bramki wejścia.
- **Kroki**: Σ allocation_pct ≠ 100 (poza tol 0.01)→`allocation-pct-invalid`; outputs nie pokrywają dokładnie zbioru co-produktów→`co-product-mismatch`.
- **Oczekiwana logika**: kody jak wyżej (`register-disassembly-output.ts:128-135,539-549`).
- **Priorytet**: P1

### PRD-056: Disassembly — WO nie disassembly / input nieskonsumowany / snapshot WAC brak
- **Co sprawdza**: bramki referencyjne.
- **Kroki**: bom_type≠disassembly→`not-disassembly`; input LP bez konsumpcji→`input-not-consumed`; brak wac snapshot→`input-wac-snapshot-missing`; nieobsługiwany UoM inputu→`input-uom-unsupported`.
- **Oczekiwana logika**: kody + mapowanie 409/404/422 wg `statusForError` (`register-disassembly-output.ts:534-567`, `disassembly-outputs/route.ts:44-58`).
- **Priorytet**: P1

### PRD-057: Disassembly — mass-balance warn + idempotencja
- **Co sprawdza**: warn 2% + replay per (wo,input LP).
- **Kroki**: 1) |output−input| > 2% → flaga `over_production_flagged` + `mass_balance_warning`; 2) powtórny submit tego samego input LP → istniejące outputy bez re-insertu.
- **Oczekiwana logika**: `lockWorkOrderForDisassembly` serializuje; replay przez `ext_jsonb.disassembly_input_lp_id` (`register-disassembly-output.ts:137-161,584-595`).
- **Priorytet**: P1

---

## Rejestracja waste (`lib/production/waste/record-waste.ts`, `waste/route.ts`, `production/waste/**`)

Uprawnienie: `production.waste.write`.

### PRD-058: Record waste happy path (+ dekrement LP)
- **Co sprawdza**: insert `wo_waste_log` + opcjonalny dekrement LP + stock_move.
- **Kroki**: 1) WO recordable, `category_code`, `qty_kg`, `shift_id` 2) POST waste (z i bez `lp_id`).
- **Oczekiwana logika**: 200; z LP: `quantity−qty`, LP→'destroyed' gdy ≤0, `stock_moves` adjustment; outbox `production.waste.recorded` (`record-waste.ts:128-354`).
- **Priorytet**: P0

### PRD-059: Waste — qty>0 (V-PROD-05) i decimal string
- **Co sprawdza**: red-line qty + typ.
- **Kroki**: qty=`0`/ujemne → `invalid_input` 422; qty jako number/exponential → zod fail.
- **Oczekiwana logika**: `qty_kg` tylko plain decimal string (`record-waste.ts:44-49,143-146`).
- **Priorytet**: P0

### PRD-060: Waste — nieznana/nieaktywna kategoria
- **Co sprawdza**: `resolveCategoryId` (V-PROD-05).
- **Kroki**: `category_code` nieistniejący/`is_active=false`.
- **Oczekiwana logika**: 422 `invalid_reference` field=category_code (`record-waste.ts:113-126`).
- **Priorytet**: P1

### PRD-061: Waste — quality hold / LP nie-released / uom≠kg / niewystarczająca ilość
- **Co sprawdza**: bramki LP.
- **Kroki**: aktywny hold→`quality_hold_active`; qa_status≠released→`lp_not_released`; status≠available→`lp_not_wasteable`; uom≠kg→`uom_mismatch`; qty>dostępne→`insufficient_lp_quantity`.
- **Oczekiwana logika**: kody 409 (`record-waste.ts:165-214`).
- **Priorytet**: P0

### PRD-062: Waste — WO nie recordable / idempotencja
- **Co sprawdza**: bramka lifecycle + 23505.
- **Kroki**: WO planned→`wo_not_recordable` 409; powtórny transaction_id → `already_recorded`.
- **Oczekiwana logika**: jak wyżej (`record-waste.ts:154-158,319-327`).
- **Priorytet**: P1

---

## QA output (`lib/production/output/transition-output-qa.ts`, `_actions/output-qa-actions.ts`)

### PRD-063: releaseWoOutputQa PASSED/FAILED
- **Co sprawdza**: maszyna stanów QA outputu.
- **Kroki**: 1) output `qa_status='PENDING'`, decision PASSED → LP `qa_status='released'`, `status received→available`; 2) FAILED → LP `rejected`, `received→blocked`.
- **Oczekiwana logika**: zmiana + `lp_state_history` reason `production_output_qa_changed`; uprawnienie `quality.batch.release` (`transition-output-qa.ts:94-203`, `output-qa-actions.ts:32-72`).
- **Priorytet**: P0

### PRD-064: QA — stany niedozwolone (ON_HOLD / nie-PENDING / hold aktywny)
- **Co sprawdza**: bramki transition.
- **Kroki**: qa_status='ON_HOLD'→`invalid_state` msg `on_hold_requires_holds_flow`; ≠PENDING→`invalid_state`; PASSED gdy aktywny hold LP→`quality_hold_active`.
- **Oczekiwana logika**: tylko PENDING transitionable (`transition-output-qa.ts:112-127`).
- **Priorytet**: P1

### PRD-065: WO hold apply/restore snapshot outputów
- **Co sprawdza**: `applyWoOutputHold` / `restoreWoOutputsAfterWoHoldRelease`.
- **Kroki**: 1) hold WO → wszystkie outputy →ON_HOLD (snapshot poprzednich); 2) release → przywróć snapshot; pozostałe ON_HOLD→PENDING.
- **Oczekiwana logika**: W3 snapshot semantics (`transition-output-qa.ts:39-92`).
- **Priorytet**: P1

---

## Korekty / Void / Reverse (`_actions/corrections-actions.ts`)

Uprawnienia: waste `production.waste.correct`, output `production.output.correct` (+e-sign `production.output.void`), consumption `CONSUMPTION_CORRECT_PERMISSION` (+e-sign `production.consumption.reverse`). Reason ∈ `CORRECTION_REASON_CODES`.

### PRD-066: voidWasteEntry (bez e-sign)
- **Co sprawdza**: storno waste.
- **Kroki**: 1) void istniejącego waste z `reasonCode`; 2) void ponownie → `already_corrected`; 3) zły UUID/reason → `invalid_input`.
- **Oczekiwana logika**: counter-entry `qty_kg` negowane; `FOR UPDATE OF wl` serializuje; mig-296 unique partial idx → 23505 backstop; audit `production.waste.corrected` (`corrections-actions.ts:856-927`).
- **Priorytet**: P0

### PRD-067: voidWoOutput (e-sign + LP voidable gate)
- **Co sprawdza**: void outputu z podpisem.
- **Kroki**: 1) output z LP `qa_status='pending', status='received', reserved_qty=0`, bez downstream, poprawny PIN → void; 2) LP nie spełnia → `lp_not_voidable`; 3) brak lp_id → `lp_not_voidable`; 4) zły PIN → `esign_failed`.
- **Oczekiwana logika**: counter-entry qa_status='PASSED' (ledger-only, C091); WAC reversal; LP→destroyed qty 0; genealogia dzieci odlinkowana; audit `production.output.corrected` (`corrections-actions.ts:929-1061`).
- **Priorytet**: P0

### PRD-068: reverseConsumption (e-sign + kolejność bramek + LP restore)
- **Co sprawdza**: odwrócenie konsumpcji; wszystkie ok:false PRZED pierwszą mutacją (withOrgContext commit-on-return).
- **Kroki**: 1) reverse z PIN → LP przywrócone (`quantity+qty`), `wo_materials.consumed_qty−qty`, WAC reversal, counter-entry; 2) LP status ∉{consumed,available,received}→`lp_not_restorable`; 3) `consumed_qty−qty<0`→`inconsistent_ledger`.
- **Oczekiwana logika**: kolejność: lock LP+restorability → lock wo_materials+ledger gate → e-sign → dopiero zapisy; post-write dekrement fail → THROW (rollback) (`corrections-actions.ts:1063-1219`).
- **Priorytet**: P0

### PRD-069: reverseConsumption — LP restore target QA-aware
- **Co sprawdza**: `lpRestoreTargetState`.
- **Kroki**: LP `consumed` z qa_status: `released`→'available'; `on_hold` z otwartym hold→'blocked', bez hold→'received'; inne→'received'; częściowo skonsumowane zachowują status.
- **Oczekiwana logika**: `lp_state_history` odzwierciedla faktyczny target (nie hardcoded 'available') (`corrections-actions.ts:776-780`).
- **Priorytet**: P1

### PRD-070: Korekty — mapowanie błędów PG
- **Co sprawdza**: catch bloki.
- **Kroki**: wymuś 23505 / 23514 / 23503 / 22P02.
- **Oczekiwana logika**: 23505→`already_corrected`; reszta→`invalid_input`; inne→`persistence_failed` (`corrections-actions.ts:920-926,1054-1060,1212-1218`).
- **Priorytet**: P2

---

## Downtime (`production/downtime/**`)

Uprawnienie odczytu: `production.oee.read`.

### PRD-071: Downtime dashboard — okno + KPI + Pareto
- **Co sprawdza**: `downtime-data.ts`.
- **Kroki**: 1) windowDays ∈{1,7,30,90}; wartość spoza → coerce do 1; 2) sprawdź KPI event_count/total_min/open_count, Pareto top 12, log 100.
- **Oczekiwana logika**: `isOpen = ended_at===null`; label linii `code — name` / fallback `—`; nieznany source→'manual', nieznany kind→null; UUID nie przecieka jako label (`downtime-data.ts:41-276`).
- **Priorytet**: P1

### PRD-072: Downtime bez shiftu (nullable shift_id)
- **Co sprawdza**: downtime z `shift_id=null`.
- **Kroki**: 1) event bez shiftu → widoczny; roll-up shift filtruje `is not null`.
- **Oczekiwana logika**: shift label null gdy brak; wo_pause downtime zawsze z kategorią (V-PROD-22) (`downtime-data.ts:56,271`, `shifts-data.ts:110`).
- **Priorytet**: P1

### PRD-073: Downtime — bezpieczeństwo interpolacji windowDays
- **Co sprawdza**: brak SQL injection przez allowlist.
- **Kroki**: 1) windowDays = `1; DROP` / 999.
- **Oczekiwana logika**: `normalizeWindowDays` allowlist → 1 (`downtime-data.ts:136`).
- **Priorytet**: P1

---

## Waste (screen) (`production/waste/**`)

### PRD-074: Waste dashboard — net storno + wykluczenie korekt z count
- **Co sprawdza**: semantyka signed/net (mig 293).
- **Kroki**: 1) waste + counter-entry (void) 2) sprawdź KPI.
- **Oczekiwana logika**: SUM signed/net (negatywy kasują void); COUNT `filter(correction_of_id is null)`; qty czytane wprost jako kg (bez konwersji); Pareto top 12; byLine wymaga `production_line_id` (`waste-data.ts:118-222`).
- **Priorytet**: P1

---

## Shifts (`production/shifts/**`)

### PRD-075: Shifts roll-up (downtime + waste + oee latest)
- **Co sprawdza**: `shifts-data.ts` full-outer po shift_id.
- **Kroki**: 1) okno; 2) shift z danymi w 3 tabelach.
- **Oczekiwana logika**: oee = `distinct on(shift_id) order by snapshot_minute desc` (najnowszy); label `shift_configs.shift_label` else `Shift <8 znaków>`; sort po sort_order (`shifts-data.ts:105-153`).
- **Priorytet**: P2

---

## Changeover — read (`production/changeover/**`) + Changeovers — dual-sign (`production/changeovers/**`, `_actions/changeover-actions.ts`)

Uprawnienia: `production.changeover.write`, `production.allergen_gate.sign_first`, `production.allergen_gate.sign_second`.

### PRD-076: createChangeoverEvent — risk heuristic + matrix
- **Co sprawdza**: klasyfikacja ryzyka.
- **Kroki**: 1) brak nowych alergenów → low; 2) `from` puste, `to` niepuste → high; 3) inaczej → medium; 4) z aktywną macierzą → risk z macierzy (line override > org default, max severity across pairs).
- **Oczekiwana logika**: `risk = matrixRisk ?? heuristic`; `segregated` tylko z macierzy; persist `production_lines.id::text`; `ext_jsonb.riskSource` (`changeover-actions.ts:218-507`).
- **Priorytet**: P1

### PRD-077: createChangeoverEvent — linia nieznaleziona / persistence
- **Co sprawdza**: `resolveProductionLine`.
- **Kroki**: lineId/code spoza org → `not_found`.
- **Oczekiwana logika**: komunikat „production line not found"; site_id z linii ?? WO (`changeover-actions.ts:445-507`).
- **Priorytet**: P2

### PRD-078: signChangeover — dual e-sign, sloty, kolejność
- **Co sprawdza**: gate dwupodpisowy.
- **Kroki**: 1) pierwszy podpis (sign_first) → status `first_signed`; 2) drugi (sign_second) → `complete`; 3) `FOR UPDATE` serializuje współbieżnych.
- **Oczekiwana logika**: `required_signatures` z `signoff_policies` (domyślnie 2, allow_same_user=false); `nextStatus = firstSlot && required>1 ? 'first_signed':'complete'` (`changeover-actions.ts:513-628`).
- **Priorytet**: P0

### PRD-079: signChangeover — same-user rejection + wrong role
- **Co sprawdza**: SoD i role.
- **Kroki**: 1) drugi slot tym samym userem gdy `!allow_same_user` → `same_user_rejected`; 2) policy z roleId a user bez roli → `wrong_role`; 3) bez uprawnienia slotu → `forbidden`.
- **Oczekiwana logika**: kody jak wyżej (case-insensitive porównanie usera) (`changeover-actions.ts:576-584`).
- **Priorytet**: P0

### PRD-080: signChangeover — completion wymaga cleaning_completed
- **Co sprawdza**: bramka C4/F3a przed signEvent.
- **Kroki**: 1) próba completion gdy `cleaning_completed=false` → `cleaning_incomplete` (nic nie mutuje).
- **Oczekiwana logika**: sprawdzane PRZED signEvent (`changeover-actions.ts:592`).
- **Priorytet**: P0

### PRD-081: signChangeover — już complete (idempotent reject) / e-sign fail
- **Co sprawdza**: stany końcowe.
- **Kroki**: sign na `complete` → `invalid_state`; zły PIN → `esign_failed`.
- **Oczekiwana logika**: na complete insert `allergen_changeover_validations` `validation_result = cleaning && atpPassish ? 'passed':'failed'` (`changeover-actions.ts:569,604-669`).
- **Priorytet**: P1

### PRD-082: atpPassish — interpretacja wyniku ATP
- **Co sprawdza**: `atpPassish`.
- **Kroki**: atp null→pass; obiekt z result/status/outcome matching `/fail/i`→fail; `pass`/`passed`→honorowane.
- **Oczekiwana logika**: `changeover-actions.ts:312`.
- **Priorytet**: P2

### PRD-083: listChangeovers — paginacja/filtry + read dashboard
- **Co sprawdza**: `changeover-data.ts` + `listChangeovers`.
- **Kroki**: 1) filtr lineId/status; 2) KPI open_count/high_risk_count; log 100.
- **Oczekiwana logika**: maxLimit 200; status `'complete'` toleruje legacy `'completed'`; `isOpen = completed_at===null` (`changeover-actions.ts:345-361`, `changeover-data.ts:98-169`).
- **Priorytet**: P2

---

## Analytics (`production/analytics/**`)

### PRD-084: Analytics KPI (OEE/FPQ/yield/waste%)
- **Co sprawdza**: `analytics-data.ts`.
- **Kroki**: 1) okno domyślne 7d (analytics) / 30d (downtime); 2) sprawdź wzory.
- **Oczekiwana logika**: `oeeAvgPct=avg(oee_pct)`, `fpqAvgPct=avg(quality_pct)`; yield `avg(yield_percent)×100` dla COMPLETED/CLOSED; `wastePct = waste_kg/(waste_kg+output_kg)` (null gdy brak output); invalid okno→defaults dla OBU (`analytics-data.ts:123-151`).
- **Priorytet**: P1

### PRD-085: Analytics — trendy i per-line
- **Co sprawdza**: agregacje.
- **Kroki**: trend hourly oee, yieldByLine (×100, top 12), topDowntime (30d, top 10).
- **Oczekiwana logika**: label linii code|name|'Unassigned' (`analytics-data.ts:180-233`).
- **Priorytet**: P2

---

## Scheduler — Runs (`scheduler/_actions/scheduler-actions.ts`, `runs/**`)

Uprawnienia: dispatch `scheduler.run.dispatch`, read `scheduler.run.read`, approve `scheduler.assignment.approve`, override `scheduler.assignment.override`, matrix read/edit.

### PRD-086: runScheduler — utworzenie runu (happy path)
- **Co sprawdza**: solver → run `completed` + assignments `draft`.
- **Kroki**: 1) RELEASED WO na linii 2) runScheduler (lineId? / horizonDays?).
- **Oczekiwana logika**: 200; `output_summary` z `omitted_work_orders`+`omitted_count`; outbox `scheduler.run.completed`; site-scoped (`scheduler-actions.ts:1024-1099`).
- **Priorytet**: P0

### PRD-087: runScheduler — horizonDays 1..30
- **Co sprawdza**: walidacja horyzontu.
- **Kroki**: horizonDays=0 / 31 / null(→config default 7).
- **Oczekiwana logika**: poza 1..30 → `invalid_input`; lineId nie-UUID → `invalid_input` (`scheduler-actions.ts:1026,1040-1043`).
- **Priorytet**: P1

### PRD-088: Sequencer — allergen-optimized order + changeover cost
- **Co sprawdza**: `sequenceWorkOrders` / `pickNextIndex`.
- **Kroki**: WO z różnymi profilami alergenów + macierz.
- **Oczekiwana logika**: sort due_date→id; score = changeover cost + due-date penalty + utilization penalty; `effectiveChangeoverMinutes = minutes + step_minutes` (cleaning 15 + atp 30); risk multiplier high 1.5/medium 1.25 (`sequence-solver.ts:388-438`, `changeover-matrix-lookup.ts:163-179`).
- **Priorytet**: P1

### PRD-089: Changeover feasibility — segregated infeasible
- **Co sprawdza**: `resolveChangeoverTransition`.
- **Kroki**: 1) para alergenów z `risk_level='segregated'` w macierzy; 2) niedopasowana para gdy macierz skonfigurowana.
- **Oczekiwana logika**: `feasible=false`; `transitionScore=Infinity`; WO omitted `no_feasible_changeover`; niedopasowana para przy skonfigurowanej macierzy → `UNCONFIGURED_PAIR_TRANSITION` (infeasible) (`changeover-matrix-lookup.ts:88-161`).
- **Priorytet**: P1

### PRD-090: Sequencer — omit-crash guard (świeżo naprawiany)
- **Co sprawdza**: budowa `omitted[]` bez `undefined`.
- **Kroki**: 1) WO nieumieszczalny bez zapisanego reason.
- **Oczekiwana logika**: `omitReasons.get(id) ?? 'no_feasible_changeover'`; reasons tylko {no_feasible_changeover, no_feasible_capacity}; solver zawsze zwraca tablicę; read-side `omittedFromOutputSummary` odrzuca wpisy spoza dozwolonego Set (guard przed crash board) (`sequence-solver.ts:609-615`, `scheduler-view-model.ts:138-154`).
- **Priorytet**: P0

### PRD-091: Sequencer — WO bez routingu (duration>0 floor)
- **Co sprawdza**: `durationMs` / `numericMs`.
- **Kroki**: WO bez scheduled/planned window, bez routing/process duration (coalesce 0).
- **Oczekiwana logika**: 0→null→floor 1h; WO nadal schedulable (nigdy zero-length, nie omitted za brak masterów) (`sequence-solver.ts:95-129`).
- **Priorytet**: P0

### PRD-092: Sequencer — capacity constraint / resource conflict
- **Co sprawdza**: budżet dzienny linii + preoccupied seed.
- **Kroki**: 1) suma czasów > capacityHoursPerDay (domyślnie 16); 2) IN_PROGRESS WO zajmuje linię (seed).
- **Oczekiwana logika**: przekroczenie → przesunięcie lub `no_feasible_capacity`; changeover interval liczony przed runem; preoccupied z IN_PROGRESS/RELEASED (`sequence-solver.ts:235-386,620-668`).
- **Priorytet**: P1

### PRD-093: Sequencer — PM windows + shift windows
- **Co sprawdza**: blokady PM i okna zmian.
- **Kroki**: 1) `respect_pm_windows=true` z oknem PM; 2) linia z shift calendar.
- **Oczekiwana logika**: run nie wchodzi w okno PM (przesunięcie na koniec okna); shift-aware placement w `nextShiftStart` (`sequence-solver.ts:176-228,319-386`).
- **Priorytet**: P2

### PRD-094: applySchedule — publish/commit do WO
- **Co sprawdza**: zapis zaplanowanych czasów na WO.
- **Kroki**: 1) applySchedule(runId) przez INNEGO usera niż requested_by.
- **Oczekiwana logika**: 200; per assignment update WO scheduled_start/end + line (guard `status in DRAFT,RELEASED`); rowCount 0 → `stale`; approve→status `approved`; run oznaczony applied; outbox `planning.schedule.published` (`scheduler-actions.ts:1109-1157`).
- **Priorytet**: P0

### PRD-095: applySchedule — SoD (autor runu ≠ approver)
- **Co sprawdza**: separation of duties.
- **Kroki**: 1) applySchedule przez `requested_by` runu.
- **Oczekiwana logika**: `sod_violation` (`scheduler-actions.ts:1121`).
- **Priorytet**: P0

### PRD-096: applySchedule — idempotencja (już applied)
- **Co sprawdza**: `output_summary.applied_at`.
- **Kroki**: 1) applySchedule na runie już applied.
- **Oczekiwana logika**: `ok:true, applied:false, stale:[]`; completed run bez applied_at → applied=false (`scheduler-actions.ts:1126`, `scheduler-view-model.ts:95-99`).
- **Priorytet**: P1

### PRD-097: overrideSchedulerAssignment — drag&drop/resequence
- **Co sprawdza**: jedyna ścieżka przesuwania na boardzie.
- **Kroki**: 1) override z lineId+plannedStartAt+reasonCode; 2) run już applied → `run_already_applied`; 3) lineId spoza org → `invalid_input`; 4) assignmentId/lineId nie-UUID lub zły start → `invalid_input`.
- **Oczekiwana logika**: `shiftEndPreservingDuration` (nowy end = start + oryginalny czas trwania; null gdy degeneracyjne okno); guard `status in draft,overridden`; outbox `scheduler.assignment.overridden` (`scheduler-actions.ts:1161-1209,646-654`).
- **Priorytet**: P0

### PRD-098: getLatestSchedulerRun — tylko completed
- **Co sprawdza**: read run + assignments.
- **Kroki**: 1) runId nie-UUID → `not_found`; 2) run status≠completed → `not_found`; 3) assignments wykluczają rejected/cancelled.
- **Oczekiwana logika**: `scheduler-actions.ts:984-1013,758`.
- **Priorytet**: P2

### PRD-099: Capacity view — occupancy + utilisation
- **Co sprawdza**: `capacity-loaders.ts`.
- **Kroki**: 1) RELEASED/IN_PROGRESS WO + draft assignments; 2) draft de-dup per wo_id (najdłuższy overlap).
- **Oczekiwana logika**: WO/draft end default start+1h gdy null; utilisationPct null gdy capacity ≤0; horizonDays clamp 1..30 (`capacity-loaders.ts:129,161,218-263`).
- **Priorytet**: P2

### PRD-100: Runs read — labels stale/unknown line + limit
- **Co sprawdza**: `runs-loaders.ts`.
- **Kroki**: 1) run z linią spoza org → `Unknown line (…)`; 2) getSchedulerRunDetail nie-UUID → `not_found`; lista limit 100.
- **Oczekiwana logika**: `applied` z `output_summary.applied_at` (`runs-loaders.ts:105,115,207-281`).
- **Priorytet**: P2

---

## Scheduler — Changeover Matrix (`scheduler/changeover-matrix/**`, `_actions/changeover-matrix-lookup.ts`)

### PRD-101: listChangeoverMatrix / upsert (perms)
- **Co sprawdza**: read/edit macierzy.
- **Kroki**: 1) list bez `scheduler.matrix.read` → forbidden; 2) upsert bez `scheduler.matrix.edit` → forbidden.
- **Oczekiwana logika**: `scheduler-actions.ts:1226-1260`.
- **Priorytet**: P1

### PRD-102: upsertChangeoverMatrixEntry — walidacja + upsert po parze
- **Co sprawdza**: walidacja pól.
- **Kroki**: 1) allergen_from/to puste → `invalid_input`; 2) changeover_minutes <0/nieskończone → `invalid_input`; 3) upsert po (version,line,from,to) vs insert; 4) entry.id nieistniejący → `not_found`.
- **Oczekiwana logika**: defaults requires_cleaning/atp false, risk low (`scheduler-actions.ts:917-1260`).
- **Priorytet**: P1

### PRD-103: Matrix lookup — line override > org default > symmetric fallback
- **Co sprawdza**: `resolvePairEntry`.
- **Kroki**: para (A,B) z wierszem line-specific i org-default; oraz tylko reverse (B,A).
- **Oczekiwana logika**: line row wygrywa; brak → org default; brak → reverse pair; agregacja max risk; `step_minutes = cleaning?15:0 + atp?30:0` (`changeover-matrix-lookup.ts:44-161`).
- **Priorytet**: P1

### PRD-104: effectiveChangeoverMinutes / matrixConfigured empty
- **Co sprawdza**: pusty/niepusty profil alergenów.
- **Kroki**: 1) oba profile puste → ZERO_TRANSITION; 2) jeden pusty przy skonfigurowanej macierzy → infeasible; 3) macierz pusta → wszystko feasible.
- **Oczekiwana logika**: `isChangeoverMatrixConfigured = matrix.length>0` (`changeover-matrix-lookup.ts:84-121`).
- **Priorytet**: P2

---

## Scheduler — Settings (`scheduler/settings/**`)

### PRD-105: loadSchedulerSettings — defaults vs org/line scope
- **Co sprawdza**: `settings-loaders.ts`.
- **Kroki**: 1) brak configu → `showingDefaultsOnly=true` scope='defaults'; 2) config org (line_id null) → scope='org'; 3) per-line → scope='line'.
- **Oczekiwana logika**: defaults z `DEFAULT_SEQUENCE_SOLVER_CONFIG` (horizon 7, capacityHoursPerDay 16); read perm `scheduler.run.read` (`settings-loaders.ts:109`).
- **Priorytet**: P2

---

## OEE — Dashboard (`oee/**`, `lib/production/oee-snapshot-producer.ts`)

Uprawnienie: `oee.dashboard.read`. 08-production jest JEDYNYM producentem `oee_snapshots`; 15-oee tylko czyta.

### PRD-106: Snapshot producer przy complete — grain + idempotencja
- **Co sprawdza**: `recordWoCompletionSnapshot`.
- **Kroki**: 1) complete WO z runtime>0 → 1 snapshot; 2) replay complete (R14) → recorded:false (no-op).
- **Oczekiwana logika**: grain (org,line,shift,snapshot_minute) quad-unique + per-WO partial unique (org,active_wo_id); `snapshot_minute=date_trunc('minute',completed_at)`; brak/zerowy runtime → skip (honest) (`oee-snapshot-producer.ts:180-300`).
- **Priorytet**: P0

### PRD-107: Availability — downtime merge/clip
- **Co sprawdza**: `totalDowntimeMinutes` + `computeAvailabilityPct`.
- **Kroki**: 1) nakładające się downtime (merge, bez podwójnego liczenia); 2) otwarty event (clip do końca okna); 3) downtime>runtime (clamp).
- **Oczekiwana logika**: `A = clamp₀‥₁₀₀((runtime−dt)/runtime×100)`; runtime≤0→null→skip (`oee-snapshot-producer.ts:77-119`).
- **Priorytet**: P0

### PRD-108: Performance — HONEST NULL bez expected duration
- **Co sprawdza**: `computePerformancePct`.
- **Kroki**: 1) WO bez `wo_operations.expected_duration_minutes` → P=NULL; 2) run>standard → clamp 100; 3) actual run≤0 → NULL.
- **Oczekiwana logika**: `P = clamp((Σexpected)/(runtime−downtime)×100)` (`oee-snapshot-producer.ts:125-134`).
- **Priorytet**: P0

### PRD-109: Quality — good/(good+rejected+waste) + HONEST NULL
- **Co sprawdza**: `computeQualityPct`.
- **Kroki**: 1) outputs z qa_status PENDING/PASSED (good) i FAILED (rejected) + waste; 2) brak output i waste → NULL (override-complete).
- **Oczekiwana logika**: good = Σqty_kg gdzie qa_status<>'FAILED'; mianownik 0 → NULL (`oee-snapshot-producer.ts:137-146,240-256`).
- **Priorytet**: P0

### PRD-110: OEE composite — NULL propagation
- **Co sprawdza**: `oee_pct` GENERATED.
- **Kroki**: 1) którykolwiek z A/P/Q NULL.
- **Oczekiwana logika**: `oee = A×P×Q/10000`; NULL gdy którykolwiek NULL; producer nigdy nie pisze oee_pct (`oee-snapshot-producer.ts:149-156`).
- **Priorytet**: P0

### PRD-111: OEE dashboard loader — KPI/trend/lines/recent + okno
- **Co sprawdza**: `getOeeScreen`.
- **Kroki**: 1) domyślne okno 7 dni; invalid okno→default; 2) site filter (uuid) / All sites; 3) avg() pomija NULL (all-NULL→"—").
- **Oczekiwana logika**: percenty TEXT end-to-end (round(...)::text); trend limit 60; lines limit 50; recent limit 15; RBAC `oee.dashboard.read` → forbidden (`oee-data.ts:131-354`).
- **Priorytet**: P1

### PRD-112: OEE thresholds — site override + org fallback
- **Co sprawdza**: `oee_alert_thresholds` selection.
- **Kroki**: 1) próg site-specific + org default; wybrany site.
- **Oczekiwana logika**: preferuj site row, fallback org default (`oee-data.ts:174-203`).
- **Priorytet**: P2

---

## OEE — Andon (`oee/andon/**`)

Uprawnienie: `oee.tv.kiosk_view` (kiosk); route egzekwuje gate.

### PRD-113: Andon status route — auth 401/403/404/200
- **Co sprawdza**: `andon/[lineId]/status/route.ts`.
- **Kroki**: 1) `canViewAndonKiosk` throw → 401; 2) false → 403; 3) lineId zły/nieznany → 404 `not_found`; 4) OK → 200 `{data}`, `cache-control:no-store`.
- **Oczekiwana logika**: `route.ts:26-44`.
- **Priorytet**: P1

### PRD-114: Andon — derywacja statusu linii
- **Co sprawdza**: `deriveStatus`.
- **Kroki**: runtime in_progress→Running; paused→Paused; line_status inactive/maintenance/down→Down; setup→Paused; default→Idle.
- **Oczekiwana logika**: runtime mapowany RELEASED→planned, IN_PROGRESS→in_progress, ON_HOLD→paused (`andon-data.ts:56,146`).
- **Priorytet**: P1

### PRD-115: Andon — scrap_kg = rejected + waste, pick WO order
- **Co sprawdza**: agregacja live.
- **Kroki**: 1) output FAILED + waste → scrap_kg; 2) wiele WO na linii → pick in_progress<paused<planned.
- **Oczekiwana logika**: good = qa_status<>'FAILED'; last_activity_at = max(...); org/site scope (`andon-data.ts:75-110`).
- **Priorytet**: P1

### PRD-116: Andon — org scope mismatch guard
- **Co sprawdza**: `assertOrgScope`.
- **Kroki**: 1) requestedOrgId ≠ 'current' i ≠ context org → throw `andon_org_scope_mismatch`.
- **Oczekiwana logika**: `andon-data.ts:124`.
- **Priorytet**: P1

### PRD-117: Andon server-action bez gate (bypass ryzyko)
- **Co sprawdza**: `andon-data.readLineLiveStatus` NIE ma własnego perm-check.
- **Kroki**: 1) wywołanie akcji bez przejścia przez route (kiosk perm).
- **Oczekiwana logika**: gating tylko w route (file 9) — bezpośredni caller omija kiosk permission; potencjalny brak zabezpieczenia (patrz Niepewności) (`andon-data.ts:186-207`).
- **Priorytet**: P1

---

## Uprawnienia / RLS / scanner-RBAC (przekrojowo)

### PRD-118: RLS izolacja org — cross-org WO
- **Co sprawdza**: każdy read/write scoped `app.current_org_id()`.
- **Kroki**: 1) user org A żąda WO org B (start/complete/detail/output/waste).
- **Oczekiwana logika**: `not_found` (nigdy dane innego org); brak service-role bypass (`get-work-order-detail.ts:9-11`, wszystkie query `org_id = app.current_org_id()`).
- **Priorytet**: P0

### PRD-119: RLS izolacja site — cross-site LP/spec
- **Co sprawdza**: warehouse/spec/LP na tym samym site co WO.
- **Kroki**: 1) output/disassembly resolvuje warehouse dla WO site (nie scanner session site); 2) factory spec cross-site.
- **Oczekiwana logika**: `resolveWarehouseForSite(wo.site_id)`; cross-site spec → `factory_release_incomplete` (`register-disassembly-output.ts:360-384`, `start-wo.ts:450-464`).
- **Priorytet**: P0

### PRD-120: Macierz uprawnień per akcja (403)
- **Co sprawdza**: każda akcja gate’owana konkretnym stringiem.
- **Kroki**: dla usera bez uprawnienia wywołaj: start(`production.wo.start`), pause(`.pause`), resume(`.resume`), complete(`.complete`), close(`.close`), cancel(`.cancel`), output(`production.output.write`), waste(`production.waste.write`), consumption(`production.consumption.write`), override_yield(`production.wo.override_yield`), override_approve(`production.consumption.override_approve`), changeover(`production.changeover.write`), sign_first/second, matrix read/edit, scheduler dispatch/read/approve/override, oee read, andon kiosk, release(`npd.planning.write`), correct (waste/output/consumption).
- **Oczekiwana logika**: 403 `forbidden` na każdą bez uprawnienia; gate server-side (`hasPermission` z user_roles⋈roles⋈role_permissions lub jsonb `?`).
- **Priorytet**: P0

### PRD-121: Gating UI = maszyna stanów (affordance)
- **Co sprawdza**: `gating.ts` `canOfferAction`.
- **Kroki**: dla każdego stanu sprawdź oferowane akcje (draft→release; planned→start,cancel; in_progress→pause,complete,cancel,output,waste; paused→resume,cancel,output,waste; completed→close,cancel,output,waste; closed/cancelled→nic; null+RELEASED→start).
- **Oczekiwana logika**: akcja renderowana tylko gdy state-legal AND permission-granted; route re-waliduje server-side (`gating.ts:27-82`).
- **Priorytet**: P1

### PRD-122: Scanner-RBAC remap kodu changeover
- **Co sprawdza**: desktop vs scanner path emitują ten sam kanoniczny kod.
- **Kroki**: 1) start zablokowany changeover przez desktop i przez scanner.
- **Oczekiwana logika**: oba `changeover_signoff_required` (legacy `allergen_changeover_required` tylko alias w unii/i18n); brak rewrite w route (`route-helpers.ts:74-91`, `start-wo.ts:171-183`).
- **Priorytet**: P1

### PRD-123: withOrgContext — auth failure → 403 vs 500
- **Co sprawdza**: rozróżnienie w catch.
- **Kroki**: 1) błąd JWT/org_id/users row → 403 forbidden; 2) inny DB error → 500 persistence_failed.
- **Oczekiwana logika**: regex `/JWT|org_id|users row|verification/i` (`route-helpers.ts:157-162`).
- **Priorytet**: P2

### PRD-124: get-work-order-detail — RBAC read + 8 zakładek
- **Co sprawdza**: `production.oee.read` na detalu.
- **Kroki**: 1) user bez `production.oee.read` → forbidden; 2) WO nie-UUID/cross-org → not_found.
- **Oczekiwana logika**: jeden `withOrgContext`, RLS scoped; loader pokazuje weightMode/bomType do afordancji modali (re-check server-side) (`get-work-order-detail.ts:29-93`).
- **Priorytet**: P1

---

## Niepewności

1. **Andon server-action bez własnego perm-check (PRD-117)** — `readLineLiveStatus` w `andon-data.ts` polega WYŁĄCZNIE na gate w route (`status/route.ts`). Jeśli istnieje inny caller (RSC/page `andon/page.tsx` lub `[lineId]/page.tsx`) wywołujący akcję bez `canViewAndonKiosk`, byłby to bypass kiosk-permission. Nie zweryfikowałem callerów page.tsx — do potwierdzenia.
2. **Interpolacja `windowDays` do SQL** (downtime/waste/shifts/analytics) — chroniona allowlistą `[1,7,30,90]`, ale wartość wstrzykiwana jako string do zapytania (nie parametr). Zakładam brak surface injection; warto dodać test regresyjny na wartości spoza allowlisty.
3. **`transition-output-qa.ts` bez perm-check** — atomowa transition production-owned; zakłada, że wywołania QA (`quality.batch.release`) gate’ują wyżej. Nie prześledziłem wszystkich callerów (np. quality module) — czy każdy caller sprawdza uprawnienie przed wywołaniem.
4. **Rozbieżność UUID_RE między plikami scheduler** — `scheduler-actions.ts` version class `[1-5]`, `runs-loaders.ts` `[1-8]`. Runy z UUID v6/7/8 przejdą w loaderze a odpadną w akcji (`not_found`). Prawdopodobnie nieistotne (Postgres generuje v4), ale to niespójność do testu.
5. **Line-join niespójność** — `changeover-data.ts` (read) używa `pl.id = ce.line_id` BEZ fallbacku na `pl.code`, podczas gdy `downtime-data.ts` i gate startu mają fallback code↔uuid. Legacy changeover z line_id=CODE może mieć pustą etykietę linii na dashboardzie. Do potwierdzenia czy istnieją legacy code-keyed rows.
6. **Scanner-RBAC** — nie znalazłem osobnego middleware scanner-permission na trasach `work-orders/[id]/*` (jedyny ślad to remap kodu w komentarzu `route-helpers.ts:80`). Zakładam, że scanner używa tych samych `production.*` uprawnień co desktop przez `withOrgContext`. Jeśli istnieje odrębna warstwa scan-session RBAC (np. w `proxy.ts`/middleware), jest poza zakresem przeczytanych plików.
7. **Formuła labor cost a „setup"** — zadanie wspominało „materiał+labor z ról×labor_rates+setup". Znalazłem robociznę (`labor-actions.ts`, hours×rate z rozdzielczością ról) i setup w scheduler routing (`setup_time_min` w duration), ale NIE znalazłem jawnego składnika „setup cost" w koszcie WO. Koszt materiału to WAC (`upsert-wac`). Zsumowany „koszt WO = materiał+labor+setup" jako jedna liczba może być w warstwie finance/reporting (poza tym obszarem) — nie potwierdzone.


---
<a id="sekcja-d"></a>
# D — Katalog testów: Warehouse + Scanner + Yard

Źródła (kod, stan na 2026-07-18): `apps/web/app/[locale]/(app)/(modules)/warehouse/**`, `apps/web/app/[locale]/(scanner)/**`, `apps/web/app/[locale]/(app)/(modules)/yard/**`, `apps/web/app/api/scanner/**`, `apps/web/app/api/warehouse/scanner/**`, `apps/web/lib/warehouse/**`, `apps/web/lib/finance/**`, `apps/web/lib/scanner/**`, `packages/auth/src/verify-pin.ts`.

Kluczowe maszyny stanów (z kodu):
- **LP status**: `received → available` (putaway lub QA release), `received → blocked` (QA reject), terminalne: `consumed`, `merged`, `shipped`, `returned`, `destroyed`; dodatkowo `reserved`, `quarantine/blocked`. Immovable: `consumed|destroyed|shipped` (`lib/warehouse/scanner/movement.ts:8`). Terminalne dla QA-transition skanera: `consumed|merged|shipped|returned` (`lib/warehouse/lp-qa-transition-core.ts:14`).
- **LP qa_status**: `pending → released | rejected | on_hold` (`lp-qa-transition-core.ts:5`).
- **Count session**: `open → counting → review → closed | cancelled` (`counts/_actions/count-types.ts:4`).
- **Appointment (yard)**: `scheduled → arrived → completed`, boczne: `cancelled`, `no_show` (`yard/_actions/yard-types.ts:3`); wizyta: `on_site → departed` (`yard-types.ts:4`).
- **PO**: open = `['sent','confirmed','partially_received']` → `partially_received` / `received` (`lib/warehouse/receive-po-line-core.ts:7,63`).

---

## License Plates — szczegóły i mutacje (warehouse/license-plates, [lpId])

### WH-001: Podgląd LP — pola i genealogia parent/child
- **Co sprawdza**: Ekran szczegółów LP pokazuje qty/reserved/available, status, qa_status, expiry, batch, lokację oraz rodziców i dzieci.
- **Kroki**: 1) Utwórz LP przez przyjęcie PO. 2) Wykonaj split. 3) Otwórz `[lpId]`.
- **Oczekiwana logika**: `available = quantity - reserved_qty`; children z `license_plates.parent_lp_id`, parents rekursywnie depth<20 (`lib/warehouse/scanner/movement.ts:117-209`).
- **Priorytet**: P1

### WH-002: Split LP — walidacja ilości (musi być < available)
- **Co sprawdza**: Split odrzuca qty ≥ available.
- **Kroki**: 1) LP qty=100, reserved=20 (available=80). 2) Split 80. 3) Split 79.
- **Oczekiwana logika**: warunek `fits = split_qty < (quantity - reserved_qty)` — split 80 = błąd „split quantity must be less than available quantity”, 79 = OK (`license-plates/[lpId]/_actions/lp-split-merge-destroy-actions.ts:305-314`). Uwaga: ostra nierówność — split całego available jest ZABRONIONY.
- **Priorytet**: P0

### WH-003: Split LP — dziecko dziedziczy atrybuty, genealogia `split`
- **Co sprawdza**: Child LP kopiuje product, uom, batch, expiry; parent_lp_id ustawione; wpis `lp_genealogy` relation_type='split' z qty/uom; parent pomniejszony.
- **Kroki**: 1) Split LP 100 → 30. 2) Sprawdź child (qty=30, parent_lp_id), parent (qty=70), `lp_genealogy`.
- **Oczekiwana logika**: insert child + `update ... quantity = quantity - $2 where $2 < (quantity - reserved_qty)` + genealogy 'split' (`lp-split-merge-destroy-actions.ts:328-397`); stock_move `moveType:'split'` (`:426`).
- **Priorytet**: P0

### WH-004: Split LP — idempotencja clientOpId
- **Co sprawdza**: Powtórka z tym samym clientOpId nie tnie LP drugi raz.
- **Kroki**: 1) Split z clientOpId X. 2) Wyślij ponownie X.
- **Oczekiwana logika**: replay przez audit/transaction id (wzorzec `inIdempotentScannerWrite`/transactionId) — brak drugiego child LP.
- **Priorytet**: P0

### WH-005: Merge LP — tylko rodzeństwo z reserved_qty=0
- **Co sprawdza**: Lista kandydatów do merge wyklucza LP z rezerwacją; merge z zarezerwowanym secondary jest odrzucany.
- **Kroki**: 1) 2 LP tego samego produktu/batch, jeden reserved>0. 2) `listSiblingLpsForMerge`. 3) Wymuś merge z zarezerwowanym po API.
- **Oczekiwana logika**: `sibling.reserved_qty = 0` na liście (`lp-split-merge-destroy-actions.ts:482`); w mergeLps blokada gdy jakikolwiek locked LP ma reserved ≠ 0 (`:576`).
- **Priorytet**: P0

### WH-006: Merge LP — secondary → status `merged`, qty przeniesione do primary
- **Co sprawdza**: Po merge secondary ma status 'merged' (qty zsumowane na primary), genealogia relation_type='merge', stock_move 'merge'.
- **Kroki**: 1) Merge B,C do A. 2) Sprawdź statusy, sumę qty, `lp_genealogy`.
- **Oczekiwana logika**: `set status = 'merged'` (`:600`), genealogy 'merge' (`:607-608`), lp_state_history toState='merged' (`:616`), moveType 'merge' (`:663`).
- **Priorytet**: P0

### WH-007: Merge LP — secondary w statusie merged nie da się skonsumować/przenieść
- **Co sprawdza**: Guard downstream: LP 'merged' jest terminalne dla skanera (QA transition) i niewidoczne w available.
- **Kroki**: 1) Po merge spróbuj move/pick/QA na secondary.
- **Oczekiwana logika**: QA scanner-mode wyklucza `merged` (`lp-qa-transition-core.ts:14`); `v_inventory_available` nie pokazuje (status ≠ available).
- **Priorytet**: P1

### WH-008: Destroy LP — blokada dla statusów terminalnych i zarezerwowanych
- **Co sprawdza**: Nie można zniszczyć LP consumed/shipped/merged/destroyed ani z reserved_qty>0.
- **Kroki**: 1) destroyLp na LP reserved>0. 2) Na LP 'consumed'. 3) Na LP 'destroyed' (powtórka).
- **Oczekiwana logika**: `DESTROY_BLOCKED_STATES = {consumed, shipped, merged, destroyed}` (`lp-split-merge-destroy-actions.ts:26`); reserved → błąd (`:700`); już destroyed → `{ok:true}` idempotentnie (`:696`).
- **Priorytet**: P0

### WH-009: Destroy LP — wpisy audytowe
- **Co sprawdza**: lp_state_history toState='destroyed' + stock_move z pełną qty.
- **Kroki**: 1) Destroy poprawnego LP. 2) Sprawdź history i move.
- **Oczekiwana logika**: `:706-719`, qty = `lp.quantity` (`:746`).
- **Priorytet**: P1

### WH-010: Desktop QA release LP — tylko z qa_status='pending'
- **Co sprawdza**: `releaseLpQa` odrzuca LP nie-pending; release wymaga braku aktywnego holdu.
- **Kroki**: 1) Release LP z qa_status='released'. 2) Release LP pending z aktywnym quality hold. 3) Release LP pending bez holdu.
- **Oczekiwana logika**: `qa_status !== 'pending'` → błąd (`warehouse/_actions/lp-qa-actions.ts:63`); aktywny hold → `quality_hold_active` (`:69`); wymaga permission `quality.batch.release` (`:24`).
- **Priorytet**: P0

### WH-011: QA release/reject — promocja statusu lifecycle
- **Co sprawdza**: released + status='received' → 'available'; rejected + 'received' → 'blocked'; inne statusy nietknięte.
- **Kroki**: 1) Release LP received. 2) Reject LP received. 3) Release LP już available (przez scanner mode).
- **Oczekiwana logika**: CASE w UPDATE (`lib/warehouse/lp-qa-transition-core.ts:46-70`); wpis `lp_state_history` reason_code='qa_status_changed' + outbox `warehouse.lp.transitioned` tylko dla released/rejected (`:78-119`).
- **Priorytet**: P0

### WH-012: Blokada konsumpcji downstream LP na holdzie
- **Co sprawdza**: LP z qa_status='on_hold' nie może być pickowany do WO ani pakowany do wysyłki; konsumpcja produkcyjna dopuszcza released+on_hold w SELECT, ale dalsze gate'y filtrują.
- **Kroki**: 1) Hold LP. 2) Scanner pick → oczekuj `lp_not_released` 409. 3) Ship pack → `lp_blocked_for_pack`.
- **Oczekiwana logika**: pick: `qa_status !== 'released'` → 409 (`movement.ts:547`); pack: hold/qa/expiry re-check (`lib/shipping/pack-lp-into-box.ts:159-178`); consume-material-core czyta `qa_status in ('released','on_hold')` (`lib/production/consume-material-core.ts:155`) — zweryfikować że on_hold ostatecznie NIE jest konsumowany.
- **Priorytet**: P0

### WH-013: LP zero-qty — zachowanie w widokach i operacjach
- **Co sprawdza**: LP z quantity=0: czy znika z available, czy pick/move nadal możliwy.
- **Kroki**: 1) Doprowadź LP do qty=0 (adjust/count). 2) Sprawdź inventory, spróbuj pick.
- **Oczekiwana logika**: BRAK jawnego guardu qty≤0 w move/putaway/pick (`movement.ts` — pick wstawia move na available_qty nawet 0). Test dokumentuje lukę; oczekiwany minimalny standard: LP 0-qty niewidoczny w FEFO (`v_inventory_available`).
- **Priorytet**: P1

### WH-014: Print label + print-history + reprint
- **Co sprawdza**: Wydruk etykiety LP zapisuje job; ekran print-history pokazuje status/kopie/drukarkę i pozwala na Reprint.
- **Kroki**: 1) POST `/api/scanner/print-label` dla LP. 2) Otwórz warehouse/print-history. 3) Reprint.
- **Oczekiwana logika**: print wymaga JEDNEGO z uprawnień `settings.org.update | warehouse.grn.receive | warehouse.stock.move | production.output.write` (`api/scanner/print-label/route.ts:33-61`); reprint przez `reprintFromHistory` (`print-history/page.test.tsx:22`).
- **Priorytet**: P2

### WH-015: Genealogia — ekran genealogy pokazuje łańcuch consumed/split/merge
- **Co sprawdza**: Trace od surowca do FG: relation_type 'consumed' (konsumpcja WO), 'split', 'merge'.
- **Kroki**: 1) Przyjmij RM → pick → consume w WO → register output FG. 2) Otwórz genealogy dla FG.
- **Oczekiwana logika**: `lp_genealogy` relation_type='consumed' przy output (`lib/production/output/register-output.ts:794`); genealogy-actions czytają org-scope.
- **Priorytet**: P1

---

## Przyjęcia — receive-PO desktop + scanner (warehouse/receive-po, scanner/receive-po)

### WH-016: Wspólny core — przyjęcie częściowe aktualizuje status PO
- **Co sprawdza**: Przyjęcie < ordered → PO `partially_received`; przyjęcie wszystkich linii → `received`.
- **Kroki**: 1) PO 2 linie. 2) Przyjmij część linii 1. 3) Przyjmij resztę + linię 2.
- **Oczekiwana logika**: rollup `bool_and(coalesce(rec.received_qty,0) >= pol.qty)` (`lib/warehouse/receive-po-line-core.ts:772-814`; scanner list `:150`); pełne przyjęcie auto-kompletuje draft GRN (`:816-833`).
- **Priorytet**: P0

### WH-017: Over-receipt cap 110% — HARD block
- **Co sprawdza**: Suma przyjęć na linię > 110% ordered → odrzucenie.
- **Kroki**: 1) Linia ordered=100. 2) Przyjmij 100. 3) Przyjmij +11.
- **Oczekiwana logika**: `cap = (ordered * 110n) / 100n; afterLine > cap → over_receive_cap` (`receive-po-line-core.ts:144-152`); scanner → 409 `over_receive_cap` + audit (`lib/warehouse/scanner/receive-po.ts:328-336`).
- **Priorytet**: P0

### WH-018: Over-receipt 100–110% — asymetria desktop vs scanner
- **Co sprawdza**: Desktop wymaga jawnego potwierdzenia (confirm flag) dla 100–110%; scanner przepuszcza CICHO (hardcoded confirmOverReceive:true).
- **Kroki**: 1) Desktop: przyjmij 105/100 bez confirm → oczekuj wymuszenia potwierdzenia. 2) Scanner: przyjmij 105/100 → przechodzi, `overReceived=true` w odpowiedzi.
- **Oczekiwana logika**: soft flag `:154`, confirm gate tylko desktop (`:155-157`); scanner `confirmOverReceive:true, requireOverReceiveConfirm:false` (`scanner/receive-po.ts:290,300`).
- **Priorytet**: P0

### WH-019: Parser qty — micro-units, 6dp, regex
- **Co sprawdza**: Qty przyjęcia parsowane jako bigint micro (scale 6); odrzuca `.5`, `01`, `1.1234567`, `-1`, `0` (wg reguł), przyjmuje `0.000001`–`999999.999999`.
- **Kroki**: 1) Wyślij przez API receive-line każdą z form.
- **Oczekiwana logika**: regex `^(?:0|[1-9]\d*)(?:\.\d{1,6})?$` (`receive-po-line-core.ts:835-839`) → `invalid_qty` 400.
- **Priorytet**: P0

### WH-020: Rozjazd walidacji qty desktop UI (3dp) vs core (6dp)
- **Co sprawdza**: Desktop input pattern (3dp, leading zeros) niespójny z core — wartości akceptowane przez UI a odrzucane przez core i odwrotnie.
- **Kroki**: 1) W UI wpisz `0.1234` (4dp) i `007`. 2) Obserwuj wynik submit.
- **Oczekiwana logika**: UI pattern `po-receive.client.tsx:15` vs core `:835-839`. Spójny komunikat błędu, brak cichego obcięcia.
- **Priorytet**: P1

### WH-021: Regresja „200 → 2” — keypad skanera
- **Co sprawdza**: Wpisanie 2,0,0 na keypadzie daje „200” (fix strippingu zer wiodących nie zjada zer środkowych).
- **Kroki**: 1) Scanner receive-po item: klikaj 2,0,0. 2) Submit. 3) Sprawdź LP qty=200.
- **Oczekiwana logika**: `.replace(/^0(?=\d)/,'')` usuwa tylko zero WIODĄCE (`scanner/receive-po/_components/receive-po-item-screen.tsx:393`).
- **Priorytet**: P0

### WH-022: GRN — jeden draft per PO+warehouse+lokacja+dzień, numeracja
- **Co sprawdza**: Kolejne przyjęcia tej samej PO tego samego dnia trafiają do jednego draft GRN; numer `GRN-YYYYMMDD-NNNN`.
- **Kroki**: 1) Przyjmij 2 linie PO w odstępie minut. 2) Sprawdź liczbę GRN i numer.
- **Oczekiwana logika**: reuse draft (`receive-po-line-core.ts:493-531`) pod advisory day-lock (`:498-501`); numeracja `:533-542`. Równoległe przyjęcia (2 sesje) nie tworzą duplikatu draftu.
- **Priorytet**: P0

### WH-023: LP z przyjęcia — status `received`, qa `pending`, bez przedwczesnego available
- **Co sprawdza**: Nowe LP po receive ma status='received', qa_status='pending'; nie widnieje w FEFO/available.
- **Kroki**: 1) Przyjmij linię. 2) Sprawdź LP + `v_inventory_available`.
- **Oczekiwana logika**: insert `'received','pending'` (`receive-po-line-core.ts:565-571`); komentarz „LP stays received until QA releases” (`:221`); genesis w lp_state_history (`:670-684`); outbox `lp.received` (`:686-711`).
- **Priorytet**: P0

### WH-024: Opcjonalna inspekcja QC przy przyjęciu (flaga org)
- **Co sprawdza**: Gdy `require_grn_qc_inspection='true'` → tworzy się `quality_inspections` pending dla LP; bez flagi brak.
- **Kroki**: 1) Ustaw flagę w tenant_variations. 2) Przyjmij linię. 3) Powtórz bez flagi.
- **Oczekiwana logika**: `:713-770`; odpowiedź scanera zawiera `qcInspectionRequired`, `inspectionId` (`receive-po-line-core.ts:63-65`); brak duplikatu inspekcji pending dla tego samego LP (`:740-744`).
- **Priorytet**: P1

### WH-025: Guard supplier blocked
- **Co sprawdza**: Przyjęcie linii od dostawcy o statusie 'blocked' jest odrzucane.
- **Kroki**: 1) Zablokuj dostawcę. 2) Przyjmij linię jego PO.
- **Oczekiwana logika**: `line.supplier_status === 'blocked'` → błąd (`receive-po-line-core.ts:135-137`).
- **Priorytet**: P0

### WH-026: Guard site — przyjęcie do magazynu innego site'u
- **Co sprawdza**: Nie można przyjąć do warehouse spoza site PO; UWAGA: warehouse z site_id=NULL BYPASSUJE guard (edge!).
- **Kroki**: 1) PO site A, warehouse site B → błąd. 2) Warehouse site=NULL → przechodzi (udokumentować).
- **Oczekiwana logika**: `receive-po-line-core.ts:179-181`; null-site bypass = ryzyko do decyzji ownera.
- **Priorytet**: P0

### WH-027: Przyjęcie do nieaktywnej / nieistniejącej lokacji docelowej
- **Co sprawdza**: `toLocationId` nieaktywnej lokacji → `location_inactive` 422; złej postaci → `invalid_location` 422.
- **Kroki**: 1) Scanner receive z loc.is_active=false. 2) Z nie-UUID. 3) Z UUID spoza org.
- **Oczekiwana logika**: route UUID-gate (`api/warehouse/scanner/receive-line/route.ts:17`); core `invalid_location`/`location_inactive` (`receive-po.ts` mapowanie 422).
- **Priorytet**: P0

### WH-028: PO poza statusami open — niewidoczne i nieprzyjmowalne
- **Co sprawdza**: PO draft/cancelled/received nie pojawia się na liście skanera i nie przyjmuje linii.
- **Kroki**: 1) GET pos. 2) POST receive-line na linię zamkniętej PO.
- **Oczekiwana logika**: `OPEN_PO_STATUSES = ['sent','confirmed','partially_received']` (`receive-po-line-core.ts:7`, `scanner/receive-po.ts:167-169,336`) → `po_line_not_found` 404.
- **Priorytet**: P1

### WH-029: bestBefore — format i zapis expiry
- **Co sprawdza**: `bestBefore` przyjmuje tylko `YYYY-MM-DD`; zapis w LP best_before/expiry.
- **Kroki**: 1) Wyślij `2026-13-45`, `01/02/2026`, poprawną datę.
- **Oczekiwana logika**: regex `^\d{4}-\d{2}-\d{2}$` (`scanner/receive-po.ts:481` validateReceiveInput) → 400.
- **Priorytet**: P1

### WH-030: Idempotencja receive-line (clientOpId, podwójny scan/submit)
- **Co sprawdza**: Powtórny POST z tym samym clientOpId nie tworzy drugiego LP/GRN itemu.
- **Kroki**: 1) POST receive-line X. 2) Powtórz X (timeout-retry). 3) Sprawdź liczbę LP.
- **Oczekiwana logika**: replay double-check przed i w txn (`scanner/receive-po.ts:270,278`, audit key `(org, client_op_id, 'scanner.receive_po')` `:440`).
- **Priorytet**: P0

### WH-031: WAC przy przyjęciu — konwersja do kg i booking
- **Co sprawdza**: Przyjęcie z unit_price księguje do `item_wac_state`: ΔQty_kg wg UoM, ΔValue = qty_kg wyceniane; each→qty×net_qty_per_each; box→qty×each_per_box×net_qty_per_each.
- **Kroki**: 1) Item kg: przyjmij 100 kg @ 2 GBP → total_qty_kg +100, total_value +200. 2) Item each (net 0.5kg): 10 each → +5 kg.
- **Oczekiwana logika**: `lib/finance/book-receipt-wac.ts:57-121`; formuły konwersji `lib/finance/upsert-wac.ts:242-267`; **WZÓR stanu**: `total_qty_kg += Δqty_kg; total_value += Δvalue; avg_cost = total_value/total_qty_kg` (kolumna w item_wac_state).
- **Priorytet**: P0

### WH-032: WAC — unresolved UoM = HARD block 422 + rollback przyjęcia
- **Co sprawdza**: Item bez net_qty_per_each przy uom 'each' i unit_price → przyjęcie odrzucone (nie ciche pominięcie).
- **Kroki**: 1) Item each bez net_qty_per_each + cena na linii. 2) Receive.
- **Oczekiwana logika**: `book-receipt-wac.ts:123-138` → 422 `unresolved_uom`, transakcja wycofana (brak LP).
- **Priorytet**: P0

### WH-033: WAC — waluta tylko GBP base, brak FX
- **Co sprawdza**: Linia PO w walucie ≠ GBP → `unsupported_currency`/`unknown_currency` 422.
- **Kroki**: 1) PO w EUR z ceną. 2) Receive.
- **Oczekiwana logika**: `book-receipt-wac.ts:88-92,161-180`; `WAC_VALUATION_CURRENCY_CODE='GBP'` (`upsert-wac.ts:33`).
- **Priorytet**: P1

### WH-034: WAC clamp — ujemny stan puli → 0 + anomalia
- **Co sprawdza**: Debit większy niż pula: total obcięte do 0 (`greatest(...,0)`), value=0 gdy qty=0, emit `FINANCE_WAC_UNDERFLOW` z dedup.
- **Kroki**: 1) Pula 10 kg. 2) Konsumpcja/adjust −15 kg. 3) Sprawdź item_wac_state i outbox_events.
- **Oczekiwana logika**: coherent clamp (`upsert-wac.ts:38-54`), anomalia (`:720-774`, dedup_key `:738-740`).
- **Priorytet**: P0

### WH-035: Inbound — partycje today/overdue/upcoming
- **Co sprawdza**: Ekran inbound dzieli oczekiwane dostawy wg dat.
- **Kroki**: 1) PO z expected wczoraj/dziś/jutro. 2) Otwórz warehouse/inbound.
- **Oczekiwana logika**: `partition-inbound.ts:27-52` — overdue < dziś, today = dziś, upcoming > dziś; granica północy (TZ!).
- **Priorytet**: P2

### WH-036: Korekty przyjęć (receipt corrections)
- **Co sprawdza**: Korekta przyjętej linii (receipt-corrections-actions) odwraca ilość/wartość spójnie z WAC (snapshot reversal).
- **Kroki**: 1) Przyjmij 100. 2) Skoryguj do 80. 3) Sprawdź LP, GRN item, item_wac_state.
- **Oczekiwana logika**: `warehouse/_actions/receipt-corrections-actions.ts`; reversal ze snapshotu `computeWacReversalDelta` (`upsert-wac.ts:288-307`) — negacja `wac_qty_kg/wac_value` z ext_jsonb, fallback tylko awaryjnie.
- **Priorytet**: P1

---

## Putaway (scanner/putaway + api/warehouse/scanner/putaway)

### WH-037: Sugestie lokacji — ranking same_product → empty → default
- **Co sprawdza**: Kolejność sugestii: (1) lokacje z tym samym produktem, (2) puste, (3) default/receiving; max 5.
- **Kroki**: 1) LP produktu X; lokacja A ma X, B pusta, C default. 2) GET putaway/suggest.
- **Oczekiwana logika**: CTE priorytety 1/2/3, sort `priority, code`, limit 5 (`movement.ts:231-294`); „zajęte” = LP status not in ('consumed','destroyed','shipped') (`:242,:262`).
- **Priorytet**: P1

### WH-038: Sugestie — filtr `is_active` we WSZYSTKICH trzech CTE (regresja fixu)
- **Co sprawdza**: Nieaktywna lokacja nie pojawia się ani jako same_product, ani empty, ani default.
- **Kroki**: 1) Dezaktywuj lokację będącą jedyną same_product/empty/default. 2) Suggest.
- **Oczekiwana logika**: `coalesce(loc.is_active, true)` w :245, :256, :274.
- **Priorytet**: P0

### WH-039: Putaway na nieaktywną lokację — guard wykonania
- **Co sprawdza**: Ręczny wybór nieaktywnej lokacji (z pominięciem sugestii) → 422 `location_inactive`.
- **Kroki**: 1) POST putaway z toLocationId nieaktywnej.
- **Oczekiwana logika**: `loadLocationScope` → `location_inactive` 422 (`movement.ts:766-768`); lokacja niewidoczna/nieistniejąca → `invalid_location` 422.
- **Priorytet**: P0

### WH-040: Putaway promuje `received → available` (tylko putaway, tylko received)
- **Co sprawdza**: Po putaway LP received staje się available (wchodzi do FEFO); transfer NIE promuje; LP już available/blocked/quarantine — status bez zmian.
- **Kroki**: 1) Putaway LP received → status available. 2) Move (transfer) innego LP received → status wciąż received. 3) Putaway LP quarantine → status bez zmiany.
- **Oczekiwana logika**: `if (moveType==='putaway' && lp.status==='received') promoteLpReceivedToAvailable` (`movement.ts:468-476`); history reason_code='putaway' (`:867-890`).
- **Priorytet**: P0

### WH-041: Putaway/move — statusy immovable
- **Co sprawdza**: LP consumed/destroyed/shipped → 409 `lp_not_movable`.
- **Kroki**: 1) POST putaway/move dla każdego statusu.
- **Oczekiwana logika**: `IMMOVABLE_STATUSES` (`movement.ts:8`), `assertLpMovable` (`:711-714`).
- **Priorytet**: P0

### WH-042: Blokada przez lock innego użytkownika (<5 min)
- **Co sprawdza**: LP zalockowany przez inną sesję <5 min → 409; lock starszy niż 5 min ignorowany.
- **Kroki**: 1) User A lock-lp. 2) User B move → 409 „locked by another scanner session”. 3) Po 5 min → OK.
- **Oczekiwana logika**: `locked_at > now()-interval '5 minutes'` (`movement.ts:696-700,715-717`).
- **Priorytet**: P1

### WH-043: Idempotencja move/putaway/pick — advisory lock + replay
- **Co sprawdza**: Ten sam clientOpId → drugi request zwraca `{replay:true, moveId}` bez nowego stock_move; równoległe requesty serializowane.
- **Kroki**: 1) 2 równoległe POST z tym samym clientOpId. 2) Sprawdź stock_moves (1 wpis).
- **Oczekiwana logika**: `pg_advisory_xact_lock('{org}:scanner:{clientOpId}')` (`movement.ts:600`), `findReplay` (`:604,:623-642`), audit ON CONFLICT DO NOTHING (`:653-659`).
- **Priorytet**: P0

---

## Ruchy (warehouse/movements + desktop stock-move)

### WH-044: Desktop createStockMove — site scope na LP
- **Co sprawdza**: Move z desktopu tylko dla LP w aktywnym site; wymaga uprawnienia `warehouse.stock.move`.
- **Kroki**: 1) User z site A, LP z site B. 2) createStockMove.
- **Oczekiwana logika**: `and ($3::uuid is null or lp.site_id = $3::uuid)` (`warehouse/_actions/stock-move-actions.ts:242-244`) + lock 5-min check (`:238`).
- **Priorytet**: P0

### WH-045: Lista movements — filtr move_type i site
- **Co sprawdza**: Filtry listy (receipt/putaway/transfer/issue/adjustment/split/merge) + tylko site użytkownika.
- **Kroki**: 1) Wygeneruj ruchy różnych typów. 2) Filtruj.
- **Oczekiwana logika**: `where ($1::text is null or move_type=$1)` + `sm.site_id = $4::uuid` (`stock-move-actions.ts:78,142,164`).
- **Priorytet**: P2

### WH-046: Pick = move_type 'issue' bez dekrementacji qty LP
- **Co sprawdza**: Pick zapisuje stock_move 'issue' (staging), qty LP NIE maleje — konsumpcja rejestrowana osobno.
- **Kroki**: 1) Pick LP 100. 2) Sprawdź lp.quantity=100 i stock_move issue qty=available.
- **Oczekiwana logika**: komentarz i insert (`movement.ts:558-575`).
- **Priorytet**: P0

---

## Inventory / rezerwacje / expiry (warehouse/inventory, reservations, expiry)

### WH-047: Formuła available na LP
- **Co sprawdza**: `available_qty = quantity - reserved_qty` wszędzie spójnie (LP detail, adjust picker, scanner).
- **Kroki**: 1) LP 100/res 30 → available 70 na każdym ekranie.
- **Oczekiwana logika**: `(lp.quantity - lp.reserved_qty)::text as available_qty` (`movement.ts:688`; `adjustments/_actions/adjust-form-actions.ts:170`).
- **Priorytet**: P0

### WH-048: v_inventory_available — tylko status 'available'
- **Co sprawdza**: LP received/blocked/quarantine/on-hold-lifecycle nie liczą się do dostępnego stanu (FEFO, MRP).
- **Kroki**: 1) LP w każdym statusie. 2) Zapytaj widok / ekran inventory.
- **Oczekiwana logika**: widok wymaga status='available' (komentarz mig 191, `movement.ts:463-466`).
- **Priorytet**: P0

### WH-049: Lista rezerwacji — LP 'reserved' lub reserved_qty>0
- **Co sprawdza**: Ekran reservations pokazuje LP zarezerwowane (status lub qty).
- **Kroki**: 1) Zarezerwuj LP (SO/WO). 2) Otwórz reservations.
- **Oczekiwana logika**: `status='reserved' or lp.reserved_qty > 0` (`warehouse/_actions/reservation-actions.ts:52`).
- **Priorytet**: P1

### WH-050: Release rezerwacji — zerowanie reserved_qty + powrót statusu
- **Co sprawdza**: Release ustawia reserved_qty=0; status 'reserved'→'available', inne statusy bez zmian; blokada dla terminalnych i zalockowanych.
- **Kroki**: 1) Release LP reserved. 2) Release LP consumed → błąd. 3) Release LP locked przez innego → 'locked'.
- **Oczekiwana logika**: `nextStatus = status==='reserved' ? 'available' : status` (`reservation-actions.ts:124`); blokada `['consumed','destroyed','shipped','merged']` (`:120-121`); lock check (`:115`).
- **Priorytet**: P0

### WH-051: Over-reservation guard
- **Co sprawdza**: Nie można zarezerwować więcej niż quantity (reserved_qty ≤ quantity constraint/logika alokacji SO/WO).
- **Kroki**: 1) LP 100. 2) Alokuj 100 do SO. 3) Alokuj +1 do WO.
- **Oczekiwana logika**: alokacje (inventory_allocations) + warunki `quantity > reserved_qty` w selektorach (`adjust-form-actions.ts:180`); druga alokacja odrzucona.
- **Priorytet**: P0

### WH-052: Expiry dashboard — expired vs warning window
- **Co sprawdza**: Podział na przeterminowane (expiry < now) i „wygasające” w oknie `expiry_warning_days` (default 7); horyzont listy 30 dni.
- **Kroki**: 1) LP z expiry wczoraj / za 5 dni / za 20 dni / za 40 dni. 2) Otwórz warehouse/expiry.
- **Oczekiwana logika**: `expiry < now()` lub `< now() + coalesce(wss.expiry_warning_days,7) days` (`warehouse/_actions/expiry-actions.ts:36-48`); listowanie `< now()+30 days` (`:59`).
- **Priorytet**: P1

### WH-053: Blokada picku przeterminowanego LP
- **Co sprawdza**: LP z expiry_date < dziś nie może być pickowany (409 `lp_expired`) ani pakowany.
- **Kroki**: 1) LP expiry wczoraj, released. 2) Pick → 409. 3) Pack → `lp_blocked_for_pack`.
- **Oczekiwana logika**: `expired = expiry_date::date < current_date` (`movement.ts:693`), guard `:550-551`; pack `pack-lp-into-box.ts:159-178`. UWAGA: expiry_date = dziś NIE jest expired (ostra nierówność) — przetestować granicę.
- **Priorytet**: P0

### WH-054: Move/putaway przeterminowanego lub held LP — DOZWOLONE
- **Co sprawdza**: Relokacja towaru na holdzie/przeterminowanego to legalna operacja magazynowa (gate jest pick-only).
- **Kroki**: 1) LP on_hold/expired. 2) Move do innej lokacji → OK.
- **Oczekiwana logika**: komentarz „checks live HERE, not in assertLpMovable” (`movement.ts:538-546`).
- **Priorytet**: P1

### WH-055: FEFO — sortowanie kandydatów picku
- **Co sprawdza**: Lista LP do picku sortowana `expiry_date asc nulls last, lp_number asc`; tylko released/nieprzeterminowane/bez holdu.
- **Kroki**: 1) 3 LP: expiry za 2 dni, za 10 dni, NULL. 2) GET pick/lps.
- **Oczekiwana logika**: `movement.ts:397-421` (order by :419) + pre-filtr w route (`api/warehouse/scanner/pick/lps/route.ts:46-55`); limit 10.
- **Priorytet**: P0

---

## Korekty stanów (warehouse/adjustments + direct-adjust)

### WH-056: Reason codes — enum zamknięty
- **Co sprawdza**: Adjust przyjmuje wyłącznie `found_stock | spillage_damage | expiry_write_off | data_entry_error | system_sync | other`.
- **Kroki**: 1) Submit z 'theft'.
- **Oczekiwana logika**: zod enum (`warehouse/_actions/direct-adjust-actions.ts:32-39`) → validation error.
- **Priorytet**: P1

### WH-057: Adjust increase — nowy LP origin 'adjustment' + kredyt WAC po avg_cost
- **Co sprawdza**: Zwiększenie tworzy LP (lub dolicza) i kredytuje WAC: ΔValue = Δqty_kg × avg_cost puli.
- **Kroki**: 1) Pula avg_cost=2 GBP/kg. 2) Adjust +10 kg. 3) item_wac_state: qty +10, value +20.
- **Oczekiwana logika**: `creditWacAtAvgCost` (`direct-adjust-actions.ts:446-450`; `upsert-wac.ts:592-622`, wartość `:669-686`). **WZÓR**: `Δvalue = qty_kg × avg_cost` (avg_cost czytany FOR UPDATE).
- **Priorytet**: P0

### WH-058: Adjust decrease — floor do reserved_qty
- **Co sprawdza**: Zmniejszenie nie może zejść poniżej reserved_qty (nie rusza zarezerwowanego).
- **Kroki**: 1) LP 100/res 40. 2) Decrease 70.
- **Oczekiwana logika**: `quantity - $2 >= reserved_qty` w UPDATE (`direct-adjust-actions.ts:284`); selektor FEFO tylko LP `quantity > reserved_qty`, `status='available'`, `qa='released'` (`:159-169`, komentarz `adjust-form-actions.ts:143`).
- **Priorytet**: P0

### WH-059: Adjust decrease — wymóg drugiej osoby (supervisor PIN)
- **Co sprawdza**: Decrease wymaga ODRĘBNEGO supervisora: supervisorUserId ≠ initiator, PIN weryfikowany przeciw supervisorowi, e-sign initiatora (hasło).
- **Kroki**: 1) Decrease bez supervisora → fail. 2) Supervisor = initiator → `supervisor_forbidden`. 3) Zły PIN supervisora → fail (licznik lockout rośnie). 4) Poprawnie → OK.
- **Oczekiwana logika**: schema `:53-61` (BLOCKER-3 fix), `supervisor_forbidden` (`:577`); debet WAC przez `debitWac` (`:435`).
- **Priorytet**: P0

### WH-060: Adjust — audyt: stock_adjustments + lp_state_history + stock_move 'adjustment'
- **Co sprawdza**: Każda korekta zapisuje wiersz stock_adjustments (qty, direction, reason, esign_ref, applied_by), history i move.
- **Kroki**: 1) Wykonaj +/-. 2) Sprawdź trzy tabele + ekran adjustments (lista z reason).
- **Oczekiwana logika**: insert `:303-330` (stock_adjustments), history `:400-422`, move `:347-374`; lista `adjustments/_actions/list-adjustments.ts:56-81`.
- **Priorytet**: P1

### WH-061: Adjust — RBAC
- **Co sprawdza**: Bez `warehouse.stock.adjust` → `forbidden`.
- **Kroki**: 1) User viewer → submit.
- **Oczekiwana logika**: `adjust-form-actions.ts:74,99,157` + `direct-adjust-actions.ts:489`.
- **Priorytet**: P0

### WH-062: Adjust — idempotencja clientOpId (UUID wymagany)
- **Co sprawdza**: Powtórka nie dubluje korekty; clientOpId musi być UUID.
- **Kroki**: 1) Submit 2× ten sam clientOpId. 2) Submit z nie-UUID.
- **Oczekiwana logika**: schema `clientOpId: z.string().uuid()` (`direct-adjust-actions.ts:61`); jedna korekta w DB.
- **Priorytet**: P1

---

## Inwentaryzacje (warehouse/counts)

### WH-063: Lifecycle sesji — open → counting → review → closed/cancelled
- **Co sprawdza**: Dozwolone przejścia; zliczanie linii tylko w counting; zamknięcie tylko z review; cancelled nie da się wznowić.
- **Kroki**: 1) Przeprowadź pełny cykl. 2) Spróbuj recordCount w 'review'. 3) Close z 'open'.
- **Oczekiwana logika**: `COUNT_SESSION_STATUSES = ['open','counting','review','closed','cancelled']` (`counts/_actions/count-types.ts:4`); statusy linii `counted/approved/applied` (`count-actions.ts:282`).
- **Priorytet**: P0

### WH-064: Wariancja — wzór i próg ostrzeżenia
- **Co sprawdza**: `varianceQty = counted − system`; `variancePct = |variance| / system × 100`; warning gdy > `count_variance_warn_pct` (feature flag, default hard-floor).
- **Kroki**: 1) system=100, counted=88 → varianceQty=−12, pct=12.0000. 2) Ustaw warn_pct=10 → warning `count_variance_over_threshold`. 3) warn_pct=15 → brak.
- **Oczekiwana logika**: micro-arytmetyka `variancePctMicro = |variance| × 100_000_000n / systemMicro` (`count-actions.ts:391-401`); flag parse `:360-376`; warning NIE blokuje (soft, `count-types.ts:53-67`).
- **Priorytet**: P0

### WH-065: Blind count — brak podpowiedzi system qty
- **Co sprawdza**: W trybie blind lines puste / bez system qty dla liczącego.
- **Kroki**: 1) Sesja blind. 2) GET linie.
- **Oczekiwana logika**: `count-types.ts:99-103` („lines is always empty…”).
- **Priorytet**: P2

### WH-066: Zatwierdzenie wariancji — zmiana live stock wymaga recountu
- **Co sprawdza**: Przy approve/apply system qty jest ponownie odczytywane; jeśli stan zmienił się od pomiaru, zatwierdzenie kończy się fail-closed i nie podpisuje ani nie zapisuje wariancji dla nieaktualnego ziarna.
- **Kroki**: 1) Count przy stanie 100 (counted 90). 2) Przed approve zmień stan na 95 (move/adjust). 3) Approve. 4) Oczekuj `stock_changed_recount_required`, braku e-podpisu, `stock_adjustments` i `stock_moves`.
- **Oczekiwana logika**: nierówność live i zapisanego `system_qty` rzuca `stock_changed_recount_required` przed przeliczeniem i zapisami (`count-actions.ts:1190-1204`).
- **Decyzja ownera (2026-07-30)**: zachować fail-closed, bo podpis nie może zatwierdzać pomiaru wykonanego dla innego stanu magazynu; zielony `count-actions.test.ts:593-605` przestaje być anty-testem.
- **Priorytet**: P0

### WH-067: Apply wariancji — stock_adjustment reason 'stock_count_variance' + WAC
- **Co sprawdza**: Zaksięgowanie wariancji tworzy adjustment (approved_by = supervisor), LP korygowane/nowe LP 'available'/'pending' origin 'adjustment', WAC kredyt/debet po avg_cost.
- **Kroki**: 1) Approve wariancję +10 i −10. 2) Sprawdź stock_adjustments (approved_by), item_wac_state.
- **Oczekiwana logika**: `STOCK_COUNT_REASON='stock_count_variance'` (`count-actions.ts:38`); insert `:718-744`; nowy LP `:479` (`'available','pending','adjustment'`); permission `warehouse.stock.adjust` dla apply i approve (`:35-37`).
- **Priorytet**: P0

### WH-068: Approve — supervisor PIN z licznikiem lockout
- **Co sprawdza**: Zła weryfikacja PIN supervisora przy zatwierdzeniu utrwala licznik prób (nie w transakcji rollbackowanej).
- **Kroki**: 1) 6× zły PIN supervisora → locked (423-like).
- **Oczekiwana logika**: komentarz `count-actions.ts:236` („verifyPin lockout counters persist — mirrors direct-adjust”); pin-enrollment check `:218`.
- **Priorytet**: P1

### WH-069: Wariancja przy system=0 (dzielenie przez zero)
- **Co sprawdza**: Counted>0 przy system=0 nie wywala błędu; warning/pct sensowne.
- **Kroki**: 1) Linia system 0, counted 5. 2) Record.
- **Oczekiwana logika**: `variancePctMicro = … / systemMicro` — systemMicro=0 → ścieżka musi być zabezpieczona (`count-actions.ts:396`); jeśli brak guardu = BUG do zgłoszenia.
- **Priorytet**: P0

---

## Scanner — auth / PIN / sesja / site (scanner/login, api/scanner)

### WH-070: Login PIN — happy path i brak enumeracji użytkowników
- **Co sprawdza**: Poprawny email+PIN → token; nieznany email i zły PIN dają IDENTYCZNY `invalid_pin` 401.
- **Kroki**: 1) Login OK. 2) Nieistniejący email. 3) Zły PIN.
- **Oczekiwana logika**: `api/scanner/login/route.ts:19,39`; email citext + is_active (`lib/scanner/auth.ts:14`).
- **Priorytet**: P0

### WH-071: Lockout PIN — 5 błędnych prób w 10 min → blokada 15 min
- **Co sprawdza**: 6-ta próba w oknie zwraca `pin_locked` 423; poprawny PIN w czasie blokady też 423; po 15 min odblokowanie; stare okno resetuje licznik.
- **Kroki**: 1) 5× zły PIN. 2) 6-ta (dobra) → 423. 3) Po 15 min → OK. 4) 4 złe, przerwa 11 min, kolejne złe → licznik od nowa.
- **Oczekiwana logika**: `LOCKOUT_THRESHOLD=5`, `newAttempts>=6`, `locked_until=now+15min`, okno 10 min, `FOR UPDATE` serializuje (`packages/auth/src/verify-pin.ts:45,51,129,138-167`).
- **Priorytet**: P0

### WH-072: PIN — hash argon2id, format 4–6 cyfr
- **Co sprawdza**: PIN nigdy plaintext (argon2id m=64MiB,t=3,p=1); serwer wymusza `^\d{4,6}$`.
- **Kroki**: 1) set-pin '123' i 'abcd' → fail. 2) Sprawdź user_pins (hash).
- **Oczekiwana logika**: `verify-pin.ts:23-28`; `route-utils.ts:35`.
- **Priorytet**: P0

### WH-073: Weak-PIN — walidacja tylko kliencka (gap)
- **Co sprawdza**: Serwer PRZYJMUJE '0000'/'1234' (klient blokuje). Test dokumentuje, że API set-pin nie odrzuca słabych PIN-ów.
- **Kroki**: 1) POST set-pin z newPin '0000' (curl).
- **Oczekiwana logika**: klient `pin-setup-screen.tsx:25,49`; serwer tylko format — decyzja: czy podnieść na serwer.
- **Priorytet**: P1

### WH-074: Set-PIN — dowód tożsamości hasłem Supabase
- **Co sprawdza**: Enrollment PIN wymaga poprawnego hasła konta; złe hasło → `invalid_credentials` 401.
- **Kroki**: 1) set-pin ze złym hasłem. 2) Z dobrym.
- **Oczekiwana logika**: `verifySupabaseLoginPassword` grant_type=password (`lib/scanner/auth.ts:34`; `api/scanner/set-pin/route.ts`).
- **Priorytet**: P0

### WH-075: Change-PIN — weryfikacja bieżącego PIN + lockout
- **Co sprawdza**: Zmiana wymaga sesji + currentPin; locked → 423, zły → 401; setPin resetuje licznik.
- **Kroki**: 1) change-pin ze złym current. 2) Po lockout. 3) Poprawnie.
- **Oczekiwana logika**: `api/scanner/change-pin/route.ts:15`; reset `verify-pin.ts:57-64`.
- **Priorytet**: P1

### WH-076: Sesja — bearer token, TTL 12h, hash SHA-256
- **Co sprawdza**: Token ważny 12h; expired/ended → 401 `invalid_session` + audyt; token przechowywany jako hash.
- **Kroki**: 1) Wygaś sesję (update expires_at). 2) Dowolny request → 401, klient czyści sessionStorage i redirect do /login.
- **Oczekiwana logika**: `SESSION_TTL_MS=12h`, `session_token_hash` (`lib/scanner/session.ts:35,37,103`); klient `(scanner)/_components/scanner-session.tsx:25,135-138`; guard `lib/scanner/guard.ts:23-49`.
- **Priorytet**: P0

### WH-077: Wybór site/linii — walidacja widoczności
- **Co sprawdza**: Context przyjmuje tylko site widoczny (`user_can_see_site`) i linię należącą do site'u; linia bez site → `line_site_required` 400.
- **Kroki**: 1) POST context z site innego usera → 404. 2) Linia z innego site → `line_not_found`. 3) Linia bez efektywnego site → 400.
- **Oczekiwana logika**: `api/scanner/context/route.ts:43-72`; bootstrap listuje tylko aktywne+widoczne (`bootstrap/route.ts:12-28`).
- **Priorytet**: P0

### WH-078: Logout — idempotentny
- **Co sprawdza**: Podwójny logout nie błędzi; ended_at ustawione raz.
- **Kroki**: 1) 2× POST logout.
- **Oczekiwana logika**: `ended_at=coalesce(ended_at,now())` (`api/scanner/logout/route.ts`).
- **Priorytet**: P2

---

## Scanner — RBAC per operacja (op-aware)

### WH-079: Matryca uprawnień zapisów skanera
- **Co sprawdza**: Każdy WRITE wymaga dokładnie swojego uprawnienia; brak → 403 `forbidden` + audit `forbidden`.
- **Kroki**: Dla każdej pary (rola bez uprawnienia, endpoint) wykonaj POST i oczekuj 403; z uprawnieniem → 2xx:
  | Endpoint | Permission | Plik |
  |---|---|---|
  | pick / move / putaway | `warehouse.stock.move` | `api/warehouse/scanner/{pick,move,putaway}/route.ts:29-30` |
  | lock-lp | `warehouse.stock.move` | `api/scanner/lock-lp/route.ts:21` |
  | receive-line | `warehouse.grn.receive` | `lib/warehouse/scanner/receive-po.ts:9,262` |
  | ship (pack) + shipments list | `ship.pack.close` | `api/warehouse/scanner/ship/route.ts:51`, `ship/shipments/route.ts:35` |
  | lp lookup / pos | `warehouse.inventory.read` | `lp/route.ts:24`, `pos/route.ts:21`, `pos/[id]/route.ts:24` |
  | labor POST | `production.consumption.write` | `api/scanner/labor/route.ts:17,178` |
  | print-label | dowolne z: `settings.org.update`, `warehouse.grn.receive`, `warehouse.stock.move`, `production.output.write` | `print-label/route.ts:33-38` |
- **Oczekiwana logika**: `hasPermission` = role_permissions ∪ roles.permissions jsonb ∪ super-role `owner/admin/org_admin` ∪ platform admin (`lib/auth/has-permission.ts:14,33`).
- **Priorytet**: P0

### WH-080: Super-role bypass
- **Co sprawdza**: owner/admin/org_admin przechodzą wszystkie gate'y bez explicit permission.
- **Kroki**: 1) Rola admin bez role_permissions → pick OK.
- **Oczekiwana logika**: `SUPER_ROLES` (`has-permission.ts:14`).
- **Priorytet**: P1

### WH-081: Endpointy read-open — potwierdzenie zamierzonego braku gate'u
- **Co sprawdza**: `pick/lps`, `pick/wos`, `location`, `putaway/suggest`, labor GET, bootstrap/context/audit — tylko sesja + site-visibility, bez permission. Test = decyzja świadoma (albo finding).
- **Kroki**: 1) User bez żadnych uprawnień magazynowych → GET każdy → 200 (dane ograniczone site'em).
- **Oczekiwana logika**: brak `hasPermission` w tych route'ach (`pick/lps/route.ts`, `location/route.ts`, `putaway/suggest/route.ts`).
- **Priorytet**: P1

---

## Scanner — pick (scanner/pick)

### WH-082: Pick happy path — WO → materiał → FEFO LP → confirm
- **Co sprawdza**: Cały flow: lista WO (RELEASED lub exec in_progress/paused, filtr linii sesji), materiały BOM, kandydaci FEFO, potwierdzenie; destination = staging linii (default_location_id).
- **Kroki**: 1) Zaloguj, wybierz site+linię. 2) Pick pierwszego FEFO LP.
- **Oczekiwana logika**: WO filtr (`movement.ts:357-360`, limit 25 WO); staging `toLocationId = input ?? material.staging_location_id` (`:528`); stock_move 'issue' (`:563-575`).
- **Priorytet**: P0

### WH-083: Pick — `destination_required` gdy linia bez default_location
- **Co sprawdza**: Brak staging → 422 `destination_required` (odrębny kod!), ekran odsłania pole lokacji docelowej.
- **Kroki**: 1) Linia bez default_location_id. 2) Pick → 422. 3) Podaj lokację → OK.
- **Oczekiwana logika**: `movement.ts:525-529` (komentarz F4: kod musi być dokładnie `destination_required`); klient branch (`pick-screen.tsx:262-269`).
- **Priorytet**: P0

### WH-084: Pick — guard cross-site (naprawiany)
- **Co sprawdza**: LP z innego site niż WO → 409 `lp_wrong_site`.
- **Kroki**: 1) WO site A, LP site B (user widzi oba). 2) Pick.
- **Oczekiwana logika**: `lp.site_id !== material.site_id → lp_wrong_site 409` (`movement.ts:535-537`); dodatkowy pre-check site-access w route (`pick/route.ts:41-68` → 404). Edge: LP z site_id=NULL PRZECHODZI (warunek wymaga obu niepustych).
- **Priorytet**: P0

### WH-085: Pick — kolejność gate'ów food-safety i odrębne kody 409
- **Co sprawdza**: Kolejno: qa≠released → `lp_not_released`; expired → `lp_expired`; aktywny hold → `lp_on_hold`; produkt/uom mismatch → `lp_not_movable`. Każdy kod odrębny.
- **Kroki**: 1) Cztery LP naruszające po jednym warunku. 2) Pick każdego.
- **Oczekiwana logika**: `movement.ts:547-556`; hold przez `v_active_holds` reference_type='lp' (`:726-747`).
- **Priorytet**: P0

### WH-086: Pick — fail-open holdów przy braku widoku (42P01)
- **Co sprawdza**: Gdy `v_active_holds` nie istnieje, pick przechodzi (fail-open, zamierzone); drift kolumn (42703) MUSI wybuchnąć.
- **Kroki**: 1) Środowisko bez modułu quality → pick released LP OK. 2) Symuluj 42703 → błąd.
- **Oczekiwana logika**: `movement.ts:720-747` (komentarz).
- **Priorytet**: P2

### WH-087: Pick — mismatch produktu lub UoM materiału
- **Co sprawdza**: LP innego produktu albo innego uom niż wo_materials → 409.
- **Kroki**: 1) Pick LP produktu Y do materiału X. 2) LP kg do materiału each.
- **Oczekiwana logika**: `lp.product_id !== material.product_id || lp.uom !== material.uom` (`movement.ts:554-556`).
- **Priorytet**: P0

### WH-088: Pick — WO w złym stanie
- **Co sprawdza**: WO nie-RELEASED bez aktywnej egzekucji → `invalid_material` 422.
- **Kroki**: 1) WO DRAFT/COMPLETED. 2) POST pick.
- **Oczekiwana logika**: warunek statusu w SELECT materiału (`movement.ts:513-523`).
- **Priorytet**: P1

---

## Scanner — move / lp / lock-lp (scanner/move, scanner/lp)

### WH-089: Move (transfer) — happy path z powodem
- **Co sprawdza**: Scan LP → karta → lokacja → confirm; opcjonalny reason (relocation/consolidation/damage/other) zapisany na stock_move.
- **Kroki**: 1) Move z reason 'damage'. 2) Sprawdź stock_moves.
- **Oczekiwana logika**: `move-screen.tsx:56-60`; `moveScannerLp` moveType 'transfer' (`api/warehouse/scanner/move/route.ts:21`).
- **Priorytet**: P0

### WH-090: Move — błędne skany
- **Co sprawdza**: Nieznany kod LP → `lp_not_found` 404; nieznana lokacja → `location_not_found`/`invalid_location`; ekran pozwala skanować dalej.
- **Kroki**: 1) Skan losowego stringa jako LP i jako lokacji.
- **Oczekiwana logika**: `lp/route.ts` 404; `location/route.ts:102` (inactive → `location_inactive` 422).
- **Priorytet**: P1

### WH-091: Lock-LP — soft-lock, kolizja i kradzież po 5 min
- **Co sprawdza**: Acquire przy cudzym świeżym locku → 409 `lp_locked`; lock starszy niż 5 min można przejąć (audyt `lp_stolen`); release tylko własnego.
- **Kroki**: 1) A lock. 2) B lock → 409. 3) Po 5 min B lock → OK + audit lp_stolen. 4) B release locka A (świeżego) → no-op.
- **Oczekiwana logika**: `api/scanner/lock-lp/route.ts:47-83`.
- **Priorytet**: P1

### WH-092: LP lookup — site-visibility
- **Co sprawdza**: LP spoza widocznych site'ów → 404 (nie 403 — bez wycieku istnienia).
- **Kroki**: 1) User site A, GET lp site B.
- **Oczekiwana logika**: `app.user_can_see_site(lp.site_id)` (`movement.ts:704`, `lp/route.ts:41`).
- **Priorytet**: P0

---

## Scanner — ship (scanner/ship)

### WH-093: Ship pack — happy path
- **Co sprawdza**: Lista shipmentów tylko `packing`; scan FG LP → pack do boxa: box z SSCC, wpis shipment_box_contents, LP powiązany z SO.
- **Kroki**: 1) Shipment packing z alokacją LP. 2) Pack.
- **Oczekiwana logika**: lista (`ship/shipments/route.ts:68-71`); box + `generate_sscc` (`lib/shipping/pack-lp-into-box.ts:220-239`), contents (`:242`), `source_so_id` (`:262`).
- **Priorytet**: P0

### WH-094: Ship pack — LP bez alokacji / już spakowany
- **Co sprawdza**: LP bez inventory_allocations (allocated/picked) → `lp_not_allocated`; w pełni spakowany → `already_packed`.
- **Kroki**: 1) Pack LP bez alokacji. 2) Pack 2× ten sam LP.
- **Oczekiwana logika**: `pack-lp-into-box.ts` (alokacja, packQty≤0 → already_packed `:143`).
- **Priorytet**: P0

### WH-095: Ship pack — re-check food-safety przy pakowaniu
- **Co sprawdza**: Hold/qa≠released/expired w momencie pack → `lp_blocked_for_pack` (nawet jeśli alokacja powstała wcześniej).
- **Kroki**: 1) Alokuj LP. 2) Nałóż hold. 3) Pack.
- **Oczekiwana logika**: `pack-lp-into-box.ts:159-178`.
- **Priorytet**: P0

### WH-096: Ship pack — brak/zły prefiks GS1
- **Co sprawdza**: Org bez gs1_prefix → `missing_gs1_prefix`/`invalid_gs1_prefix` przy mintowaniu SSCC.
- **Kroki**: 1) Usuń prefiks. 2) Pack pierwszego LP (nowy box).
- **Oczekiwana logika**: `generate_sscc` (V-SHIP-PACK-03, `pack-lp-into-box.ts:220-239`).
- **Priorytet**: P1

### WH-097: Pack nie dekrementuje stanu
- **Co sprawdza**: Pack tylko rejestruje zawartość boxa; lp.quantity i alokacje bez zmian (dekrement przy shipShipment).
- **Kroki**: 1) Pack LP 100. 2) Sprawdź qty.
- **Oczekiwana logika**: brak update qty w `pack-lp-into-box.ts`.
- **Priorytet**: P1

### WH-098: Shipment w złym statusie
- **Co sprawdza**: Pack do shipmentu ≠ packing (lub bez sales_order_id) → `invalid_state`.
- **Kroki**: 1) Shipment 'shipped' → pack.
- **Oczekiwana logika**: `PACKABLE_SHIPMENT_STATUSES` (`pack-lp-into-box.ts`), route map (`ship/route.ts:13-22`).
- **Priorytet**: P1

---

## Scanner — QA (scanner/qa)

### WH-099: QA scan — PASS/FAIL/HOLD z notą
- **Co sprawdza**: Scan LP → decyzja → nowy qa_status; scanner-mode działa na dowolnym nieterminalnym LP (nie tylko pending).
- **Kroki**: 1) PASS na LP pending/received → qa released + status available. 2) HOLD na LP available → qa on_hold, status bez zmian. 3) FAIL na LP received → blocked.
- **Oczekiwana logika**: `applyLpQaLifecycleTransition` mode 'scanner', wyklucza `consumed|merged|shipped|returned` (`lp-qa-transition-core.ts:14,58-70`); ekran `qa-screen.tsx:118` → `/api/quality/scanner/inspect`.
- **Priorytet**: P0

### WH-100: QA na LP terminalnym
- **Co sprawdza**: LP consumed/merged/shipped/returned → transition zwraca null → błąd dla użytkownika.
- **Kroki**: 1) QA PASS na LP consumed.
- **Oczekiwana logika**: `status <> all($4::text[])` (`lp-qa-transition-core.ts:69`).
- **Priorytet**: P1

### WH-101: QA — historia stanu tylko przy zmianie statusu (scanner) i zawsze (desktop)
- **Co sprawdza**: lp_state_history pisany gdy status się zmienił (scanner) lub zawsze w pending_only; ext_jsonb zawiera qaStatusFrom/To; dedup po transaction_id.
- **Kroki**: 1) HOLD available→available (bez zmiany statusu) → brak wpisu history (scanner). 2) PASS received→available → wpis.
- **Oczekiwana logika**: `shouldWriteHistory = mode==='pending_only' || statusChanged` (`lp-qa-transition-core.ts:76-96`).
- **Priorytet**: P2

---

## Yard — appointments (yard/appointments)

### WH-102: Booking appointment — kolizja slotu doka
- **Co sprawdza**: Rezerwacja doka nie koliduje z istniejącym aktywnym appointmentem (cancelled/no_show nie blokują).
- **Kroki**: 1) Book dok D 10:00–11:00. 2) Book D 10:30 → konflikt. 3) Cancel pierwszego → booking przechodzi.
- **Oczekiwana logika**: overlap check `status not in ('cancelled','no_show')` (`yard/_actions/yard-actions.ts:461`), nowy status 'scheduled' (`:480`).
- **Priorytet**: P0

### WH-103: Statusy appointmentu — enum i walidacja
- **Co sprawdza**: `setAppointmentStatus` przyjmuje tylko `scheduled|arrived|completed|cancelled|no_show`.
- **Kroki**: 1) Ustaw 'departed' → błąd. 2) Każdy dozwolony.
- **Oczekiwana logika**: `APPOINTMENT_STATUSES` Set + `throw 'status is invalid'` (`yard-actions.ts:92,138`).
- **Priorytet**: P1

### WH-104: Gate-in — tworzy wizytę, blokuje cancelled i duplikaty
- **Co sprawdza**: Gate-in cancelled appointmentu → błąd; ponowny gate-in gdy wizyta arrived/on_site/completed już istnieje → błąd; sukces ustawia appointment 'arrived' + yard_visit z gate_in_at.
- **Kroki**: 1) Gate-in scheduled → OK. 2) Powtórz → błąd. 3) Gate-in cancelled → błąd.
- **Oczekiwana logika**: `yard-actions.ts:555` (cancelled), `:563-564` (duplikat), `:576-589` (insert + set arrived).
- **Priorytet**: P0

### WH-105: Gate-out — wizyta departed
- **Co sprawdza**: Gate-out ustawia status 'departed' + timestamp; podwójny gate-out idempotentny/błąd.
- **Kroki**: 1) Gate-out wizyty on_site. 2) Powtórz.
- **Oczekiwana logika**: `yard-actions.ts:601-610`.
- **Priorytet**: P1

---

## Yard — weighbridge (yard/weighbridge)

### WH-106: Ważenie — wzór netto i walidacje
- **Co sprawdza**: `net_kg = gross_kg − tare_kg` (3dp); odrzuca gross<0, tare<0, gross<tare, NaN/Inf, |w| ≥ MAX_WEIGHT_KG_ABS.
- **Kroki**: 1) gross=24000, tare=9000 → net=15000.000. 2) gross=8000, tare=9000 → `invalid_weight`. 3) gross=Infinity → `invalid_weight`.
- **Oczekiwana logika**: **WZÓR**: `netKg = decimal(gross).sub(tare).toFixed(3)` (`yard-actions.ts:175-176`); walidacje `:162-164`.
- **Priorytet**: P0

### WH-107: Ważenie powiązane z wizytą/appointmentem
- **Co sprawdza**: recordWeighing zapisuje weighed_at/weighed_by i wiąże z yard visit (dock_appointment_id).
- **Kroki**: 1) Zważ pojazd wizyty. 2) Sprawdź listę ważeń dla appointmentu.
- **Oczekiwana logika**: `yard-actions.ts:83-87,674`; join po dock_appointment_id (`:279-293`).
- **Priorytet**: P1

### WH-108: Precyzja wag — zaokrąglenie do 3dp
- **Co sprawdza**: 3 miejsca po przecinku bez błędów float (decimal, nie Number).
- **Kroki**: 1) gross=1000.0005, tare=0.0004 → net=1000.000 lub 1000.0001→toFixed(3); sprawdź brak artefaktów 0.30000000004.
- **Oczekiwana logika**: `formatWeightDecimal` + decimal sub (`yard-actions.ts:166-176`).
- **Priorytet**: P2

---

## Cross-org / RLS / bezpieczeństwo

### WH-109: RLS org-scope na każdej ścieżce skanera
- **Co sprawdza**: Wszystkie zapytania filtrowane `app.current_org_id()`; sesja skanera z org A nie widzi/nie modyfikuje LP/lokacji/PO org B (404, nie dane).
- **Kroki**: 1) Token org A, id zasobów org B → GET/POST każdy endpoint.
- **Oczekiwana logika**: `registerTxnOrgContext` w transakcji (`movement.ts:589-598`, `lib/scanner/txn-org-context.ts`) — bez rejestracji org=NULL → lp_not_found; komentarz o mig 002.
- **Priorytet**: P0

### WH-110: Site-visibility (`app.user_can_see_site`) w warehouse desktop i skanerze
- **Co sprawdza**: Wszystkie listy (WO pick, LP, PO, shipments) ograniczone do site'ów użytkownika.
- **Kroki**: 1) User 1-site w org 2-site → listy zawierają wyłącznie site A.
- **Oczekiwana logika**: `user_can_see_site` (`movement.ts:358,704`; `ship/shipments/route.ts:71`; `scanner/receive-po.ts:167-169`).
- **Priorytet**: P0

### WH-111: Cross-org UUID probing — brak wycieku istnienia
- **Co sprawdza**: 404 (nie 403) dla obcych UUID; identyczna odpowiedź dla nieistniejącego i obcego zasobu.
- **Kroki**: 1) Porównaj odpowiedzi dla random-UUID i cudzego-UUID na lp/location/pos.
- **Oczekiwana logika**: wzorzec `lp_not_found`/`not_found` w route'ach (`pick/route.ts:47`).
- **Priorytet**: P1

### WH-112: Audyt skanera — każdy write i każda odmowa
- **Co sprawdza**: scanner_audit_log dostaje wpis dla ok/forbidden/invalid_session; batch POST /audit ≤50 wpisów (413 powyżej).
- **Kroki**: 1) Wykonaj ok + forbidden + expired-token. 2) POST audit z 51 wpisami.
- **Oczekiwana logika**: `insertScannerAudit` (`movement.ts:644-660`); `auditAttempt` w route'ach; limit (`api/scanner/audit/route.ts:33-36`).
- **Priorytet**: P1

### WH-113: Brak tokenu / token w body
- **Co sprawdza**: Bez Authorization → 401 `missing_token`; token akceptowany też z body (fallback) — potwierdzić zamierzoność.
- **Kroki**: 1) POST bez nagłówka. 2) Token tylko w body.
- **Oczekiwana logika**: `lib/scanner/guard.ts:29-37`.
- **Priorytet**: P2

---

## License Plates — uzupełnienia (enumy, block/unblock, asymetrie)

### WH-114: Split — uprawnienie i dozwolone stany źródła
- **Co sprawdza**: Split wymaga `warehouse.lp.split`; źródłowy LP musi być w {received, available, returned}; LP z aktywnym holdem odrzucony.
- **Kroki**: 1) Split LP quarantine/blocked → błąd. 2) Split LP z holdem (v_active_holds) → błąd. 3) Bez uprawnienia → forbidden.
- **Oczekiwana logika**: `lp-split-merge-destroy-actions.ts:277-443` (perm + SPLIT_MERGE_STATES + hold guard); child: qty=splitQty, reserved=0, status available, origin 'split', dziedziczy batch/expiry/qa.
- **Priorytet**: P0

### WH-115: Merge — predykat same-SKU/lot
- **Co sprawdza**: Merge tylko dla LP zgodnych na (product, uom, batch, expiry, warehouse, site, location); dowolna różnica → kandydat niewidoczny/odrzucony.
- **Kroki**: 1) 2 LP różniące się tylko expiry → merge niedozwolony. 2) Różna lokacja → niedozwolony. 3) Pełna zgodność → OK.
- **Oczekiwana logika**: predykat w `listSiblingLpsForMerge`/`mergeLps` (`lp-split-merge-destroy-actions.ts:449-518+`); oba w SPLIT_MERGE_STATES, reserved=0, bez holdów.
- **Priorytet**: P0

### WH-116: Merge — wynikowy qa_status = najbardziej restrykcyjny
- **Co sprawdza**: Primary po merge przyjmuje najbardziej restrykcyjny qa spośród łączonych (released < pending < on_hold < rejected).
- **Kroki**: 1) Merge released + on_hold → primary on_hold. 2) released + pending → pending.
- **Oczekiwana logika**: ranking restrykcyjności w mergeLps (`lp-split-merge-destroy-actions.ts:518-680`).
- **Priorytet**: P0

### WH-117: Merge — ODWRÓCONY kierunek krawędzi genealogii (finding)
- **Co sprawdza**: Wpis `lp_genealogy` przy merge ma child=primary, parent=secondary — odwrotnie niż intuicja trace'u. Test dokumentuje kierunek i weryfikuje, że ekran genealogii renderuje go poprawnie.
- **Kroki**: 1) Merge B do A. 2) Sprawdź wiersz lp_genealogy (child_lp_id=A, parent_lp_id=B). 3) Otwórz genealogy UI dla A i B.
- **Oczekiwana logika**: `lp-split-merge-destroy-actions.ts:606-611`; relation_type='merge'.
- **Priorytet**: P1

### WH-118: Desktop move NIE blokuje blocked/on_hold/expired (tylko consumed/destroyed/shipped)
- **Co sprawdza**: Relokacja LP blocked/on_hold/expired z desktopu przechodzi (guard = pick-only); move na tę samą lokację = no-op.
- **Kroki**: 1) createStockMove LP blocked → OK. 2) LP expired → OK. 3) Ta sama lokacja → no-op (bez stock_move).
- **Oczekiwana logika**: `stock-move-actions.ts:203-368` — immovable tylko {consumed,destroyed,shipped}, same_location no-op, idempotencja transaction_id.
- **Priorytet**: P1

### WH-119: Block/Unblock LP — hold + e-sign
- **Co sprawdza**: Block: status→blocked, qa→on_hold, wpis `quality_holds` (severity high, open). Unblock wymaga e-podpisu hasłem (21 CFR Part 11).
- **Kroki**: 1) Block LP available. 2) Unblock bez hasła → fail. 3) Ze złym hasłem → fail. 4) Poprawnie → status przywrócony, hold zamknięty.
- **Oczekiwana logika**: `license-plates/[lpId]/_actions/lp-detail-actions.ts:153-394`.
- **Priorytet**: P0

### WH-120: Destroy LP z qty>0 — adjustment + debet WAC
- **Co sprawdza**: Destroy niezerowego LP księguje stock_adjustment −qty i `debitWac`; zero-qty destroy bez wpisu ledgera.
- **Kroki**: 1) Destroy LP 50 kg. 2) Sprawdź stock_adjustments i item_wac_state (−50×avg_cost). 3) Destroy LP 0 → brak ledgera.
- **Oczekiwana logika**: `lp-split-merge-destroy-actions.ts:682-762`; perm `warehouse.lp.destroy`.
- **Priorytet**: P0

### WH-121: Asymetria terminal-set QA scanner vs desktop — 'destroyed'
- **Co sprawdza**: Scanner QA-transition wyklucza consumed/merged/shipped/returned ale NIE 'destroyed' — QA na destroyed LP przez skaner może przejść; desktop pending_only nie. Test rozstrzyga zachowanie.
- **Kroki**: 1) Destroy LP. 2) Scanner QA PASS na nim.
- **Oczekiwana logika**: `SCANNER_TERMINAL_LP_STATUSES` bez 'destroyed' (`lp-qa-transition-core.ts:14`) vs `TERMINAL_OUTPUT_LP_STATUSES` z 'destroyed' (`register-output.ts:169`). Prawdopodobny bug.
- **Priorytet**: P1

### WH-122: Genealogia — cykle, self-loop, limit głębokości
- **Co sprawdza**: `lp_genealogy` odrzuca self-loop; trace org-wide (SECURITY DEFINER) ma cap depth 20 i jest cycle-proof.
- **Kroki**: 1) Próba wstawienia child=parent → constraint. 2) Łańcuch 25 pokoleń → trace ucina na 20 bez pętli.
- **Oczekiwana logika**: mig 307 (junction, relation_type consumed/split/merge/derived, no self-loop), `get_lp_genealogy_org_wide` (mig 407).
- **Priorytet**: P2

### WH-123: Print-label — GS1 poprawność
- **Co sprawdza**: Etykieta buduje GS1 (GTIN z itemu — brak → `gtin_missing`), expiry w formacie YYMMDD, job w `print_jobs` status 'sent'; UUID guard + site gate.
- **Kroki**: 1) Print LP itemu bez GTIN → gtin_missing. 2) Z GTIN i expiry 2026-08-05 → AI(17)=260805.
- **Oczekiwana logika**: `api/scanner/print-label/route.ts` (guardy + GS1 build).
- **Priorytet**: P1

### WH-124: Constrainty DB na LP
- **Co sprawdza**: `quantity>=0`, `reserved_qty>=0`, `reserved_qty<=quantity` egzekwowane w bazie (próba obejścia SQL-em z app-rolą).
- **Kroki**: 1) UPDATE quantity=-1 → violation. 2) reserved>quantity → violation.
- **Oczekiwana logika**: constraints mig 191:95-104 + 294:20; enum origin = grn/production/transfer/adjustment/split/merge.
- **Priorytet**: P1

---

## Inventory / rezerwacje — uzupełnienia (WO-scope, rozjazdy)

### WH-125: Rozjazd dashboardu inventory — pickable ignoruje reserved_qty (finding)
- **Co sprawdza**: Dashboard sumuje `sum(quantity)` BEZ odejmowania reserved — liczby różnią się od `v_inventory_available`. Test ujawnia rozjazd.
- **Kroki**: 1) LP 100/res 40. 2) Porównaj dashboard vs view (60).
- **Oczekiwana logika**: `warehouse/_actions/inventory-actions.ts:67-74` vs view (mig 191:182-193: status=available AND qa=released AND available>0). Fail-closed przy braku aktywnego site (`:52`).
- **Priorytet**: P0

### WH-126: reserveLp — rezerwacja WO-scoped, pełna kolejność guardów
- **Co sprawdza**: Rezerwacja tylko pod WO (brak ścieżki SO): lock→terminal/blocked→lp_not_released→expired→hold (fail-open 42P01)→reserved_for_other_wo→WO w stanie otwartym (DRAFT/RELEASED/IN_PROGRESS/ON_HOLD)→produkt w BOM (`product_not_in_wo_bom`); atomiczny UPDATE z guardem `(quantity-reserved_qty)>=qty` → `qty_exceeds_available`.
- **Kroki**: 1) Po jednym scenariuszu na każdy guard (8 przypadków). 2) Równoległe rezerwacje 60+60 na LP 100 → jedna dostaje qty_exceeds_available.
- **Oczekiwana logika**: `lp-detail-actions.ts:396-579`.
- **Priorytet**: P0

### WH-127: Brak partial release rezerwacji
- **Co sprawdza**: Release zeruje CAŁE reserved_qty (nie ma częściowego zwolnienia); reason wymagany.
- **Kroki**: 1) LP res=50 z dwóch operacji. 2) Release → reserved_qty=0 (oba „zwolnione”).
- **Oczekiwana logika**: `reservation-actions.ts:79-192` (`set reserved_qty = 0` :138). Finding: utrata granularności per-WO.
- **Priorytet**: P1

### WH-128: Expired LP jest FEFO-visible (blokada dopiero na egress)
- **Co sprawdza**: `v_inventory_available` NIE filtruje expiry — przeterminowany LP pojawia się na listach FEFO/MRP, a odrzucany jest dopiero przy pick (`lp_expired`) i reserve (`invalid_state`); decrease/write-off przechodzi.
- **Kroki**: 1) LP expired released available. 2) Widok/lista pick → obecny. 3) Pick → 409. 4) Adjust decrease expiry_write_off → OK.
- **Oczekiwana logika**: view mig 191 bez warunku expiry; guardy `movement.ts:550-551`.
- **Priorytet**: P0

### WH-129: Auto-promote received+released → available
- **Co sprawdza**: LP w statusie received z qa released jest automatycznie promowany do available (trigger/mig), spójnie z promocją putaway.
- **Kroki**: 1) QA release LP received bez putaway. 2) Status → available.
- **Oczekiwana logika**: mig 282:31-39 + CASE w `lp-qa-transition-core.ts:46-70`.
- **Priorytet**: P1

---

## Adjustments / Counts — uzupełnienia (SoD hot-spoty)

### WH-130: Increase na istniejący LP → wymuszenie sesji count
- **Co sprawdza**: Direct-adjust increase z lpId zwraca `use_count_session` (zwiększenia istniejącego LP tylko przez inwentaryzację); increase bez lpId mintuje nowy LP origin 'adjustment', qa pending.
- **Kroki**: 1) Increase z lpId → use_count_session. 2) Bez lpId → nowy LP.
- **Oczekiwana logika**: `direct-adjust-actions.ts:456-732`.
- **Priorytet**: P1

### WH-131: Decrease do zera → LP destroyed dla KAŻDEGO reason (hot-spot)
- **Co sprawdza**: FEFO-legs decrease sprowadzające LP do 0 ustawia status 'destroyed' także dla `data_entry_error` — LP nie do reanimacji po literówce. Test dokumentuje.
- **Kroki**: 1) LP 10. 2) Decrease 10 reason data_entry_error. 3) LP status destroyed; próba korekty z powrotem.
- **Oczekiwana logika**: ścieżka decrease w `direct-adjust-actions.ts` (destroyed przy qty 0).
- **Priorytet**: P1

### WH-132: Supervisor PIN-fail jest COMMITOWANY mimo rollbacku korekty
- **Co sprawdza**: Nieudana weryfikacja PIN supervisora zwiększa licznik lockout trwale (poza transakcją korekty) — 6 nieudanych zatwierdzeń = zablokowany supervisor.
- **Kroki**: 1) 5× decrease ze złym PIN supervisora (każdy rollback korekty). 2) 6-ta próba → pin_locked; login skanera supervisora też 423.
- **Oczekiwana logika**: `count-actions.ts:236` (komentarz), `direct-adjust-actions.ts` errors `supervisor_self_approval|pin_not_enrolled|pin_locked|pin_invalid`.
- **Priorytet**: P1

### WH-133: Statusy linii count 'approved'/'rejected' — martwe (finding)
- **Co sprawdza**: Enum linii ma pending/counted/approved/applied/rejected, ale 'approved'/'rejected' nie są nigdzie ustawiane — linie idą counted→applied. Test potwierdza i dokumentuje.
- **Kroki**: 1) Pełny cykl count. 2) Zbadaj statusy linii w DB.
- **Oczekiwana logika**: `count-actions.ts:282` (filtr counted/approved/applied); brak writerów approved/rejected.
- **Priorytet**: P2

### WH-134: Próg wariancji — default 5%, 0 wyłącza, nigdy nie blokuje
- **Co sprawdza**: Bez flagi warn przy >5%; `count_variance_warn_pct=0` wyłącza warningi; warning nigdy nie blokuje zapisu zliczenia.
- **Kroki**: 1) Bez flagi: wariancja 6% → warning, 4% → brak. 2) Flaga 0: 50% → brak warningu, zapis OK.
- **Oczekiwana logika**: `count-actions.ts:355-376` + `buildCountVarianceWarning` (`:386-401`); soft-only (`count-types.ts:53-67`).
- **Priorytet**: P1

### WH-135: Apply count — stock_changed_recount_required i variance_is_zero
- **Co sprawdza**: Apply przy zmienionym stanie żąda ponownego zliczenia; wariancja 0 → odmowa księgowania pustej korekty.
- **Kroki**: 1) Count, zmień stan, apply → stock_changed_recount_required. 2) counted=system → variance_is_zero.
- **Oczekiwana logika**: `count-actions.ts:1195-1202` + walidacje apply.
- **Priorytet**: P1

---

## Niepewności

1. **Brak guardu qty≤0 w pick/move/putaway** — pick LP z available_qty=0 wstawi stock_move 'issue' qty=0 (`movement.ts:569`). Nie znalazłem walidacji; WH-013/WH-046 do potwierdzenia jako bug lub akcept.
2. **Wariancja przy system=0** (`count-actions.ts:396`) — nie prześledziłem pełnego guardu dzielenia przez zero; WH-069 może ujawnić crash.
3. **Warehouse site_id=NULL bypassuje guard site przy przyjęciu** (`receive-po-line-core.ts:179-181`) oraz **LP site_id=NULL przechodzi pick-guard** (`movement.ts:535`) — świadome czy luka? Wymaga decyzji ownera.
4. **Catch-weight: BRAK obsługi w całym module przyjęć/inwentaryzacji** — konwersje tylko kg/each/box po stałych przelicznikach (net_qty_per_each). Jeśli biznes wymaga catch-weight (mięso!), to gap produktowy, nie testowy.
5. **Weak-PIN tylko klient** (WH-073) — serwer akceptuje '0000'.
6. **Scanner cicho przepuszcza over-receipt 100–110%** (WH-018) — asymetria vs desktop; potwierdzić z ownerem.
7. **Read-open endpointy skanera** (WH-081) — brak permission na pick/lps, location, suggest; wygląda na zamierzone (guard i tak na write), ale nie znalazłem decyzji w kodzie.
8. **Fail-open holdów przy 42P01** (WH-086) — zamierzone wg komentarza, ale w prodzie z modułem quality nie powinno nigdy wystąpić; warto monitorować.
9. **Ekran warehouse/counts — sekcja UI**: lifecycle wyliczyłem z akcji; nie weryfikowałem, które przejścia są dostępne z UI vs tylko z API.
10. **Movements**: potwierdzone — `stock_moves` append-only (brak maszyny stanów na wierszu; move_type z CHECK mig 193), lista = UNION z syntetyczną mapą typów, cap 500 (`stock-move-actions.ts:65-164`).
11. **Print-history**: pokrycie z testu strony (`page.test.tsx`), nie z implementacji akcji drukarek (poza katalogiem D — moduł settings/infra/printers).
12. **Merge genealogy edge odwrócony** (WH-117) i **'destroyed' poza terminal-setem QA skanera** (WH-121) — prawdopodobne bugi; wymagają decyzji przed napisaniem asercji „expected”.
13. **Dashboard inventory liczy pickable bez reserved_qty** (WH-125) — rozjazd liczbowy z v_inventory_available; do potwierdzenia czy celowy (raportowo „on-hand” vs „available”).
14. **Rezerwacje wyłącznie WO-scoped** — brak ścieżki SO i brak tabeli rezerwacji (pole reserved_qty na LP, bez granularności per-WO przy release, WH-127). SO działa przez `inventory_allocations` (ship). Jeśli spec przewiduje rezerwacje SO w magazynie — gap produktowy.


---
<a id="sekcja-e"></a>
# Katalog testów E: Shipping + Finance + Quality + Maintenance

Źródło prawdy: kod na main (2026-07-18). Ścieżki skracane: `M/` = `apps/web/app/[locale]/(app)/(modules)/`, `L/` = `apps/web/lib/`.

Statusy SO (`M/shipping/_actions/so-transitions.ts:1-13`): `draft, confirmed, allocated, partially_picked, picked, partially_packed, packed, manifested, shipped, partially_delivered, delivered, cancelled`.
Statusy shipmentu (`so-transitions.ts:15-24`): `pending, packing, packed, manifested, shipped, delivered, exception (nieużywany), cancelled`.

---

## Sales Orders — lifecycle i przejścia (shipping/[soId])

### SFQ-001: Utworzenie SO w statusie draft
- **Co sprawdza**: Nowe SO powstaje jako `draft` z liniami i cenami z resolvera.
- **Kroki**: 1) `ship.so.create`; 2) utwórz SO z ≥1 linią; 3) odczytaj status i ceny linii.
- **Oczekiwana logika**: status=`draft`; `unit_price_gbp` z precedencji cen (`sales-line-price.ts:96-136`); `order_date=current_date` (`so-actions.ts:637-653`).
- **Priorytet**: P0

### SFQ-002: Legalny graf przejść SO — pełna macierz
- **Co sprawdza**: Każde przejście spoza `SO_LEGAL_TRANSITIONS` jest odrzucone.
- **Kroki**: 1) dla każdej pary (from,to) spoza mapy wywołaj `transitionSalesOrderStatus`; 2) sprawdź błąd.
- **Oczekiwana logika**: mapa `so-transitions.ts:52-65`; np. `draft→allocated` zabronione (tylko `draft→confirmed|cancelled`); `cancelled→*` terminal; `delivered→partially_delivered` to JEDYNE przejście z delivered.
- **Priorytet**: P0

### SFQ-003: draft→confirmed wymaga ship.so.confirm
- **Co sprawdza**: Mapowanie uprawnień na przejścia.
- **Kroki**: 1) user bez `ship.so.confirm` próbuje confirm; 2) user z uprawnieniem.
- **Oczekiwana logika**: `permissionForTransition` (`so-actions.ts:138-142`): confirm→`ship.so.confirm`, cancel→`ship.so.cancel`, inne→`ship.so.create`; brak → forbidden.
- **Priorytet**: P0

### SFQ-004: Edycja/usunięcie SO tylko w draft
- **Co sprawdza**: `updateSalesOrder`/`deleteSalesOrder` na SO w statusie ≠ draft.
- **Kroki**: 1) confirm SO; 2) próbuj edytować / usunąć.
- **Oczekiwana logika**: błąd `not_draft` (`so-actions.ts:817, 1100`).
- **Priorytet**: P1

### SFQ-005: SO dla nieaktywnego klienta — blokada
- **Co sprawdza**: Walidację klienta przy tworzeniu SO.
- **Kroki**: 1) dezaktywuj klienta; 2) utwórz SO.
- **Oczekiwana logika**: odrzucenie (`so-actions.ts:614-620`).
- **Priorytet**: P1

### SFQ-006: Walidacja qty linii > 0
- **Co sprawdza**: Odrzucenie zerowych/ujemnych ilości linii.
- **Kroki**: 1) utwórz/edytuj linię z qty=0 i qty<0.
- **Oczekiwana logika**: `normalizeSoLineQty` wymusza qty>0 (`so-actions.ts:684-687`).
- **Priorytet**: P0

### SFQ-007: Nieznany/pusty rejestr UoM przy tworzeniu SO
- **Co sprawdza**: Guard rejestru UoM.
- **Kroki**: 1) SO z linią o nieznanym UoM; 2) SO gdy rejestr UoM pusty.
- **Oczekiwana logika**: `invalid_input` (`so-actions.ts:664-669`) / `persistence_failed` (`so-actions.ts:657-663`).
- **Priorytet**: P1

### SFQ-008: Derywacja statusu z postępu (deriveSalesOrderStatusFromProgress)
- **Co sprawdza**: Priorytet derywacji delivered→…→confirmed po operacjach cząstkowych.
- **Kroki**: 1) doprowadź SO do mieszanych stanów (część spakowana, część picked); 2) porównaj status z oczekiwaną derywacją.
- **Oczekiwana logika**: precedencja `so-transitions.ts:127-152`; liczy tylko „żywe" alokacje (`LIVE_ALLOCATION_SQL` `so-transitions.ts:29-30`, wyklucza `closed_reason='shipped'`).
- **Priorytet**: P1

### SFQ-009: Konkurencyjne przejścia SO — FOR UPDATE
- **Co sprawdza**: Serializację równoległych transition przez row-lock.
- **Kroki**: 1) dwie równoległe transakcje transition na tym samym SO.
- **Oczekiwana logika**: `SELECT … FOR UPDATE` (`so-actions.ts:432`, komentarz 416-424); druga transakcja widzi nowy status i legalność liczona od niego.
- **Priorytet**: P1

### SFQ-010: Reversal-path shipmentowy poza grafem (audited escape hatch)
- **Co sprawdza**: Że cofnięcia `shipped/delivered→confirmed…` działają WYŁĄCZNIE z flagą `allowShipmentReversal`, a void-POD `delivered→shipped` z `allowVoidPodReversal`.
- **Kroki**: 1) wywołaj write statusu z flagą i bez flagi.
- **Oczekiwana logika**: `so-status-write.ts:30-43, 63-90, 128-131`; bez flagi — odrzucone.
- **Priorytet**: P1

## Sales Orders — anulowanie i rezerwacje

### SFQ-011: Cancel SO zwalnia wszystkie żywe alokacje
- **Co sprawdza**: Zwolnienie rezerwacji przy cancel.
- **Kroki**: 1) allocate SO; 2) cancel; 3) sprawdź `inventory_allocations` i `license_plates.reserved_qty`.
- **Oczekiwana logika**: `releaseRemainingLiveAllocationsInContext` (`so-deallocation.ts:83-128`) — alokacje `released`, `reserved_qty` obniżone (floor `greatest(0,…)`).
- **Priorytet**: P0

### SFQ-012: Cancel SO blokowany przy shipped/delivered shipmencie
- **Co sprawdza**: Guard `so_cancel_blocked_shipped`.
- **Kroki**: 1) ship shipment; 2) cancel SO.
- **Oczekiwana logika**: `SO_CANCEL_BLOCKED_SHIPMENT_STATUSES=['shipped','delivered']` (`so-transitions.ts:38`; throw `so-actions.ts:442-453`, mapowanie 1144-1146).
- **Priorytet**: P0

### SFQ-013: Cancel SO kaskadowo anuluje otwarte shipmenty
- **Co sprawdza**: Anulowanie shipmentów `pending/packing/packed/manifested` przy cancel SO.
- **Kroki**: 1) SO z otwartym shipmentem w `packing`; 2) cancel SO.
- **Oczekiwana logika**: `cancelOpenShipmentForSoInContext` z FOR UPDATE (`so-actions.ts:455-467`).
- **Priorytet**: P0

### SFQ-014: Deallocate SO tylko w statusach allocated/partially_picked/picked
- **Co sprawdza**: `DEALLOCATABLE_SO_STATUSES` + powrót do confirmed.
- **Kroki**: 1) deallocate w statusie `packed` (oczekuj błędu); 2) deallocate w `allocated`.
- **Oczekiwana logika**: `so-transitions.ts:32-36`; sukces: alokacje `released`, `quantity_allocated=0`, SO→`confirmed` (`so-deallocation.ts:20-80`).
- **Priorytet**: P0

### SFQ-015: Cancel pojedynczego shipmentu zwalnia tylko JEGO alokacje
- **Co sprawdza**: Zakres zwolnienia per-shipment (nie SO-wide).
- **Kroki**: 1) 2 shipmenty (scenariusz sekwencyjny); 2) cancel jednego przed shipem; 3) sprawdź alokacje drugiego.
- **Oczekiwana logika**: `releaseShipmentLiveAllocationsInContext` zwalnia tylko alokacje LP-ów w boxach tego shipmentu (`so-shipment-release.ts:23-93`).
- **Priorytet**: P0

## Alokacja / FEFO (shipping/[soId] → Allocate)

### SFQ-016: FEFO — kolejność wyboru LP wg expiry_date
- **Co sprawdza**: Sortowanie kandydatów `expiry_date asc nulls last, created_at asc`.
- **Kroki**: 1) 3 LP z różnymi expiry (w tym null); 2) allocate; 3) sprawdź kolejność konsumpcji rezerwacji.
- **Oczekiwana logika**: `so-actions.ts:1265`; LP bez expiry na końcu.
- **Priorytet**: P0

### SFQ-017: Filtr kandydatów — tylko available + qa released + nieprzeterminowane
- **Co sprawdza**: LP `status='available'`, `qa_status='released'`, `expiry_date is null or >= current_date`.
- **Kroki**: 1) przygotuj LP: blocked, on_hold, expired, released-ok; 2) allocate.
- **Oczekiwana logika**: filtry `so-actions.ts:1230-1268` (G-QA-03: 1246-1249); tylko LP „ok" alokowany.
- **Priorytet**: P0

### SFQ-018: LP na aktywnym holdzie wykluczony z alokacji
- **Co sprawdza**: Join do `v_active_holds` (G-QA-07).
- **Kroki**: 1) załóż hold `lp` na LP; 2) allocate.
- **Oczekiwana logika**: LP pominięty (`so-actions.ts:1250-1263`); przy braku innego stocku `INSUFFICIENT_STOCK`.
- **Priorytet**: P0

### SFQ-019: Alokacja tylko z wolnego stocku (quantity - reserved_qty > 0)
- **Co sprawdza**: Że rezerwacje innych SO obniżają dostępność.
- **Kroki**: 1) LP qty=100 zarezerwowane 100 przez SO-A; 2) allocate SO-B.
- **Oczekiwana logika**: warunek `(quantity - reserved_qty) > 0` (`so-actions.ts:1230-1268`); SO-B dostaje `INSUFFICIENT_STOCK` z needed/available (`so-actions.ts:1293-1301`).
- **Priorytet**: P0

### SFQ-020: Greedy fill przez wiele LP + zapis quantity_allocated
- **Co sprawdza**: Sumowanie mikro-jednostek przez kilka LP i update linii.
- **Kroki**: 1) linia 25 kg, LP po 10 kg; 2) allocate.
- **Oczekiwana logika**: mikro-jednostki (`so-actions.ts:193-209, 1270-1291`); insert `inventory_allocations status='allocated'`, `reserved_qty += qty`, `sales_order_lines.quantity_allocated` ustawione (`so-actions.ts:1310-1336`).
- **Priorytet**: P0

### SFQ-021: Konwersja UoM linii zamówienia → jednostki magazynowe
- **Co sprawdza**: Przeliczenie box/each/kg przez pack-hierarchy.
- **Kroki**: 1) linia w `box` (each_per_box, net_qty_per_each); 2) allocate; 3) porównaj kg.
- **Oczekiwana logika**: `L/shipping/order-line-uom.ts:134-148`; nierozwiązywalny UoM → błąd `unresolved_uom`.
- **Priorytet**: P0

### SFQ-022: Near-expiry WARN — soft, nieblokujący
- **Co sprawdza**: Ostrzeżenie dla LP w oknie near-expiry (feature flag).
- **Kroki**: 1) `near_expiry_warn_days=7` (default), LP expiry za 3 dni; 2) allocate; 3) flag=0 → brak warn.
- **Oczekiwana logika**: `readNearExpiryWarnDays` z `tenant_variations.feature_flags` (`so-actions.ts:136,157-175`); `nearExpiryWarning` addytywny, alokacja przechodzi (`so-actions.ts:1279-1290, 1341-1354`).
- **Priorytet**: P1

### SFQ-023: Równoległa alokacja dwóch SO o ten sam LP — brak over-reserve
- **Co sprawdza**: `FOR UPDATE OF lp` na kandydatach.
- **Kroki**: 1) dwa równoległe allocate konkurujące o LP.
- **Oczekiwana logika**: lock `so-actions.ts:1266`; suma `reserved_qty` ≤ `quantity`.
- **Priorytet**: P0

### SFQ-024: Brak credit checku (negatywny — udokumentowany brak)
- **Co sprawdza**: `customers.credit_limit_gbp` NIE jest egzekwowany.
- **Kroki**: 1) klient z credit_limit=1; 2) SO na 10 000 GBP; 3) confirm+allocate.
- **Oczekiwana logika**: przechodzi — limit tylko przechowywany (`customer-actions.ts:258,269,311,326`), brak logiki blokady. Test dokumentuje stan; zmiana = nowa funkcja.
- **Priorytet**: P2

## Pick (shipping/[soId]/pick)

### SFQ-025: Utworzenie pick listy — uprawnienie ship.pick.execute
- **Co sprawdza**: Gate na `createPickList`/`pickLine`/`reassign`.
- **Kroki**: 1) bez uprawnienia; 2) z uprawnieniem.
- **Oczekiwana logika**: `pick-actions.ts:31,118,233,505,607`.
- **Priorytet**: P0

### SFQ-026: Zero-pick i over-pick odrzucone
- **Co sprawdza**: Guard ilości picku.
- **Kroki**: 1) pick qty=0; 2) pick qty > alokowane.
- **Oczekiwana logika**: `invalid_input` (`pick-actions.ts:312`).
- **Priorytet**: P0

### SFQ-027: Short-pick wymaga shortPickReason + tworzy linię resztkową
- **Co sprawdza**: Częściowy pick (naprawiany partial-commit).
- **Kroki**: 1) pick mniej niż alokowano bez reason (błąd); 2) z reason; 3) sprawdź remainder pick_list_line.
- **Oczekiwana logika**: `pick-actions.ts:318-320` (reason required), remainder `pick-actions.ts:389-409`.
- **Priorytet**: P0

### SFQ-028: Status SO po picku: picked vs partially_picked
- **Co sprawdza**: Derywację po picku.
- **Kroki**: 1) pick części linii; 2) pick reszty.
- **Oczekiwana logika**: `pending_count==0 → picked` inaczej `partially_picked` (`pick-actions.ts:448-478`); fallback retry `allocated→partially_picked` (466-472).
- **Priorytet**: P0

### SFQ-029: Pick LP zablokowanego (hold/QA/expiry) — lp_blocked_for_pick
- **Co sprawdza**: Re-assert food-safety w momencie picku (hold założony PO alokacji).
- **Kroki**: 1) allocate; 2) załóż hold na LP; 3) pick.
- **Oczekiwana logika**: `assertLpPickable` przez `assertNoActiveHoldForLp` + qa_status/expiry → `lp_blocked_for_pick` (`pick-actions.ts:43-77,322`).
- **Priorytet**: P0

### SFQ-030: Konkurencyjny pick tej samej linii
- **Co sprawdza**: Row-lock linii pick listy.
- **Kroki**: 1) dwa równoległe picki tej samej pick_list_line.
- **Oczekiwana logika**: `FOR UPDATE` (`pick-actions.ts:277`); brak podwójnego picku.
- **Priorytet**: P1

## Shipments — pack / seal / ship (shipping/shipments, [shipmentId])

### SFQ-031: Create shipment tylko z SO w picked/partially_packed
- **Co sprawdza**: `ALLOWED_CREATE_SHIPMENT_SO_STATUSES`.
- **Kroki**: 1) create shipment na SO `confirmed` (błąd); 2) na `picked`.
- **Oczekiwana logika**: `so-transitions.ts:112-115`; insert shipment `status='packing'` (`pack-actions.ts:176-229`); perm `ship.pack.close`.
- **Priorytet**: P0

### SFQ-032: Drugi otwarty shipment zablokowany — open_shipment_exists
- **Co sprawdza**: Jeden otwarty shipment na SO.
- **Kroki**: 1) shipment w `packing`; 2) create drugi.
- **Oczekiwana logika**: `BLOCKING_SHIPMENT_STATUSES=[pending,packing,packed,manifested,shipped,delivered]` → `open_shipment_exists` (`pack-actions.ts:204-216`).
- **Priorytet**: P0

### SFQ-033: Pack LP do boxa — LP musi być alokowany do tego SO
- **Co sprawdza**: `lp_not_allocated`.
- **Kroki**: 1) spakuj LP nienależący do alokacji SO.
- **Oczekiwana logika**: `L/shipping/pack-lp-into-box.ts:126`; pack tylko w statusie shipmentu `pending|packing` (`:32,78`).
- **Priorytet**: P0

### SFQ-034: Double-pack i over-pack LP
- **Co sprawdza**: Guard `already_packed`/`invalid_input` (qty > remaining).
- **Kroki**: 1) spakuj LP; 2) spakuj ponownie; 3) spakuj qty>remaining.
- **Oczekiwana logika**: `pack-lp-into-box.ts:143-151`.
- **Priorytet**: P0

### SFQ-035: Pack LP na holdzie/nie-released/przeterminowanego — lp_blocked_for_pack
- **Co sprawdza**: Re-assert food-safety przy packu.
- **Kroki**: 1) hold na LP po picku; 2) pack.
- **Oczekiwana logika**: `pack-lp-into-box.ts:159-178`.
- **Priorytet**: P0

### SFQ-036: SSCC boxa z generate_sscc — GS1 mod-10
- **Co sprawdza**: Mintowanie SSCC przy packu + walidację prefixu.
- **Kroki**: 1) org z prefixem GS1 — pack, sprawdź SSCC-18 (check digit); 2) org bez prefixu; 3) prefix o złej długości.
- **Oczekiwana logika**: `public.generate_sscc($org,0)` (mig 459); `missing_gs1_prefix` / `invalid_gs1_prefix` (`pack-lp-into-box.ts:196-240`); SSCC widoczny na pack view i delivery note (`shipment-pack-view.tsx:372-378`, `delivery-note-print-view.tsx:219`).
- **Priorytet**: P0

### SFQ-037: Seal shipmentu wymaga ≥1 boxa i statusu packing
- **Co sprawdza**: `sealShipment`.
- **Kroki**: 1) seal bez boxów (`no_boxes`); 2) seal z boxem.
- **Oczekiwana logika**: `ship-actions.ts:292-349`; → `packed`, `packed_at/by`; perm `ship.pack.close`.
- **Priorytet**: P0

### SFQ-038: Ship wymaga podpisanego BOL — bol_not_signed
- **Co sprawdza**: Guard e-sign BOL przed shipem.
- **Kroki**: 1) shipShipment bez wygenerowanego/podpisanego BOL.
- **Oczekiwana logika**: `assertSignedBolForPayload` sprawdza `e_sign_log` (subject_hash + intent `ship.bol.sign`) → `bol_not_signed` (`ship-actions.ts:110-131,396`).
- **Priorytet**: P0

### SFQ-039: Ship — wymagania wstępne: packed, ≥1 box, ≥1 LP, SO obecne
- **Co sprawdza**: Prewalidacje shipShipment.
- **Kroki**: 1) ship w statusie `packing`; 2) ship bez LP.
- **Oczekiwana logika**: `ship-actions.ts:383-394`; perm `ship.ship.confirm`.
- **Priorytet**: P0

### SFQ-040: Ship LP na holdzie — lp_blocked_for_ship + rollback
- **Co sprawdza**: Ostateczny re-assert food-safety (hold między pack a ship).
- **Kroki**: 1) pack, seal, sign BOL; 2) hold na LP; 3) ship.
- **Oczekiwana logika**: throw `lp_blocked_for_ship`, CAŁA transakcja cofnięta (`ship-actions.ts:424-449`); dotyczy też expired i qa≠released.
- **Priorytet**: P0

### SFQ-041: Ship przeterminowanego LP — blokada
- **Co sprawdza**: Wariant expiry guardu z SFQ-040 (LP przeterminował się po packu).
- **Kroki**: 1) LP z expiry=jutro, pack; 2) przesuń datę/expiry; 3) ship.
- **Oczekiwana logika**: `lp_blocked_for_ship` (`ship-actions.ts:424-449`).
- **Priorytet**: P0

### SFQ-042: Ship konsumuje alokacje jako 'shipped' i debetuje WAC
- **Co sprawdza**: Side-effecty shipu na rezerwacjach, stanach i WAC.
- **Kroki**: 1) ship; 2) sprawdź alokacje, LP, item_wac_state.
- **Oczekiwana logika**: alokacja `status='released'` + `closed_reason='shipped'` (`ship-actions.ts:537-562`); `reserved_qty`/`quantity` obniżone (475-497); `debitWac` per LP: ΔQty=-kg, ΔVal=-(kg×avg_cost) (`ship-actions.ts:500-535`, `L/finance/upsert-wac.ts:628-667`); outbox `warehouse.lp.shipped` (618-634).
- **Priorytet**: P0

### SFQ-043: Partial ship — LP flip na shipped tylko przy pełnej konsumpcji
- **Co sprawdza**: Resztka LP zostaje pickable (fix partial shipment).
- **Kroki**: 1) spakuj część LP; 2) ship; 3) sprawdź status LP i quantity.
- **Oczekiwana logika**: `ship-actions.ts:482-485` (komentarz 481); LP `shipped` tylko gdy fully consumed; UPDATE guard `lp.quantity >= shipped_qty` + row-count (491,498).
- **Priorytet**: P0

### SFQ-044: SO→shipped tylko gdy brak innych nie-shipped shipmentów
- **Co sprawdza**: Agregację statusu SO po shipie.
- **Kroki**: 1) scenariusz z shipmentem po anulowanym; 2) ship.
- **Oczekiwana logika**: `ship-actions.ts:636-651`.
- **Priorytet**: P1

### SFQ-045: generateBol — uprawnienia, statusy, aktualizacja carriera po shipie
- **Co sprawdza**: BOL: perm `ship.ship.confirm` AND `ship.bol.sign`; status `packed|shipped`; audit przy zmianie carriera po shipie.
- **Kroki**: 1) BOL w `packing` (błąd); 2) BOL w `packed`; 3) zmień carrier/tracking po shipie.
- **Oczekiwana logika**: `ship-actions.ts:660-784`; zapis `bol_payload`+`bol_sha256` (748-772); audit `shipping.bol.carrier_updated` (712-733).
- **Priorytet**: P1

## POD, cancel shipment, void POD, delivery note

### SFQ-046: recordPod — e-sign, wymagane pola, delivered_at
- **Co sprawdza**: Poprawny zapis POD.
- **Kroki**: 1) POD bez `signedPdfUrl`/`reason`/hasła (walidacja); 2) komplet — sprawdź `delivered_at`, `bol_signed_pdf_url`, audit.
- **Oczekiwana logika**: `recordPodInputSchema` (`ship-actions.ts:50-58`); sign intent `record_pod` (818-822); audit `shipping.pod.recorded` (156-202, 869-883); perm `ship.bol.sign`; modal wymaga 3 pól (`record-pod-modal.tsx:91-94`).
- **Priorytet**: P0

### SFQ-047: Duplicate POD — invalid_state
- **Co sprawdza**: Guard podwójnego POD.
- **Kroki**: 1) recordPod; 2) recordPod ponownie.
- **Oczekiwana logika**: wymagany status `shipped` (`ship-actions.ts:814-816`); po pierwszym POD shipment=`delivered` → drugi = `invalid_state`; przejście `shipped→delivered` jednorazowe (824-827).
- **Priorytet**: P0

### SFQ-048: POD → SO delivered vs partially_delivered
- **Co sprawdza**: Status SO po POD przy sekwencyjnych shipmentach.
- **Kroki**: 1) POD gdy istnieje inny nie-delivered shipment; 2) POD ostatniego.
- **Oczekiwana logika**: remaining-count (`ship-actions.ts:852-866`).
- **Priorytet**: P0

### SFQ-049: cancelShipment — guardy i skutki pre-ship
- **Co sprawdza**: Cancel przed shipem: e-sign + zwolnienie alokacji + rekompute statusu SO.
- **Kroki**: 1) cancel shipmentu `packed` z e-sign `cancel_shipment`.
- **Oczekiwana logika**: perm `ship.so.cancel`; blokada dla `delivered` i SO `delivered/partially_delivered/cancelled` (`cancelShipment.ts:104,620-627`); zwolnienie alokacji (642-644); SO status z progressu (723-735).
- **Priorytet**: P0

### SFQ-050: Cancel shipmentu już wysłanego — przywrócenie LP + kredyt WAC
- **Co sprawdza**: Odwrócenie skutków shipu.
- **Kroki**: 1) ship; 2) cancel; 3) sprawdź LP qty/status i `item_wac_state`.
- **Oczekiwana logika**: restore LP + `applyShipmentWacCancelCredits` (`cancelShipment.ts:646-685`; `L/finance/upsert-wac.ts:472-494`) — przywraca kwoty ze snapshotu debetu; pomija debety `unresolved_uom`.
- **Priorytet**: P0

### SFQ-051: unpackShipment tylko packed|manifested → packing
- **Co sprawdza**: Rozpakowanie z e-sign i void boxów.
- **Kroki**: 1) unpack w `packing` (błąd); 2) unpack `packed` z e-sign `unpack_shipment`.
- **Oczekiwana logika**: `cancelShipment.ts:780-904`.
- **Priorytet**: P1

### SFQ-052: voidPod — tylko delivered→shipped, blokada przy fakturach
- **Co sprawdza**: Void POD i guard `downstream_financial_record`.
- **Kroki**: 1) voidPod na `shipped` (błąd); 2) na `delivered` z e-sign `void_pod`; 3) po utworzeniu faktury/płatności — voidPod.
- **Oczekiwana logika**: `cancelShipment.ts:906-1025`; `assertNoDownstreamFinancialRecords` (467-515) → `downstream_financial_record`.
- **Priorytet**: P0

### SFQ-053: Delivery note — stały numer, read-only, site-scope
- **Co sprawdza**: Dokument WZ.
- **Kroki**: 1) pobierz dokument 2×; 2) user bez `ship.dashboard.view`.
- **Oczekiwana logika**: używa istniejącego `shipments.delivery_note_number` (nigdy nie mintuje), org+site scope (`delivery-note-document-actions.ts:27-48`); perm `ship.dashboard.view` (:19,31).
- **Priorytet**: P1

### SFQ-054: Race generateBol vs shipShipment
- **Co sprawdza**: Spójność przy równoległym BOL i ship (istnieje test pg `generate-bol-ship-race.pg.test.ts` — pokryć E2E).
- **Kroki**: 1) równolegle generateBol i shipShipment.
- **Oczekiwana logika**: FOR UPDATE na shipmencie (`ship-actions.ts:379`); brak shipu z niepodpisanym payloadem.
- **Priorytet**: P1

## Customers (shipping/customers) — PII

### SFQ-055: Odczyt danych klienta (PII) gated ship.dashboard.view
- **Co sprawdza**: Gate odczytu email/phone/tax_id.
- **Kroki**: 1) user bez `ship.dashboard.view` woła listę/detal klienta.
- **Oczekiwana logika**: `SHIP_CUSTOMER_READ='ship.dashboard.view'` (`customer-action-schemas.ts:361`; enforce `customer-actions.ts:67-73,146`); brak → forbidden/403 (N-FIN-2). UWAGA: nie ma dedykowanego uprawnienia PII ani maskowania pól — test dokumentuje aktualny gate.
- **Priorytet**: P0

### SFQ-056: Zapis klienta gated ship.so.create
- **Co sprawdza**: `SHIP_CUSTOMER_WRITE`.
- **Kroki**: 1) create/update/adres/kontakt/alergen bez `ship.so.create`; 2) z uprawnieniem.
- **Oczekiwana logika**: `customer-action-schemas.ts:362`; enforce `customer-actions.ts:179,252,301,359`.
- **Priorytet**: P0

### SFQ-057: CRUD adresów/kontaktów/alergenów klienta
- **Co sprawdza**: Podzasoby klienta (address/contact/allergen actions).
- **Kroki**: 1) dodaj/edytuj/usuń adres, kontakt, alergen; 2) sprawdź powiązanie org_id.
- **Oczekiwana logika**: akcje w `M/shipping/customers/_actions/customer-{address,contact,allergen}-actions.ts`; walidacje zod z `customer-action-schemas.ts`.
- **Priorytet**: P1

### SFQ-058: Cross-org odczyt klienta — RLS
- **Co sprawdza**: Izolację multi-tenant.
- **Kroki**: 1) user org-B próbuje pobrać klienta org-A (bezpośrednie ID).
- **Oczekiwana logika**: RLS + `withOrgContext` — not_found/pusty wynik, nigdy dane innego org.
- **Priorytet**: P0

## RMA (shipping/rma, mig508)

### SFQ-059: Lifecycle RMA — pending→approved→receiving→received→processed→closed
- **Co sprawdza**: Pełną sekwencję i odrzucenie skoków (np. pending→processed).
- **Kroki**: 1) przejdź pełny cykl; 2) próbuj nielegalne skoki.
- **Oczekiwana logika**: stany `rma-actions-types.ts:14`; create→pending (`rma-actions.ts:294-436`), approve 438-474, receive 476-538, process 540-595, close 597-632.
- **Priorytet**: P0

### SFQ-060: Uprawnienia per krok RMA
- **Co sprawdza**: create=`ship.so.create`, approve/receive/close=`ship.so.confirm`, process=`ship.rma.disposition`.
- **Kroki**: 1) każdy krok userem bez właściwego uprawnienia.
- **Oczekiwana logika**: `rma-actions-types.ts:118-120`; `rma-actions.ts:547`.
- **Priorytet**: P0

### SFQ-061: Walidacja tworzenia RMA — reason code, spójność klient/SO/shipment
- **Co sprawdza**: Odrzucenie RMA z nieaktywnym reason code lub shipmentem innego klienta/SO.
- **Kroki**: 1) RMA z shipmentem nienależącym do wskazanego SO; 2) nieaktywny reason.
- **Oczekiwana logika**: walidacje `rma-actions.ts:294-436`.
- **Priorytet**: P0

### SFQ-062: RMA na nieistniejący shipment
- **Co sprawdza**: Edge case — obce/nieistniejące ID.
- **Kroki**: 1) create RMA z random UUID shipmentu.
- **Oczekiwana logika**: not_found/validation error (spójność w `rma-actions.ts:294-436`); nigdy 500.
- **Priorytet**: P1

### SFQ-063: Wycena RMA — total_value_gbp = Σ qty×unit_price
- **Co sprawdza**: Ceny linii z najnowszej `sales_order_lines.unit_price_gbp` i sumę nagłówka.
- **Kroki**: 1) RMA 2 linie; 2) porównaj sumę.
- **Oczekiwana logika**: `rma-actions.ts:397-410`.
- **Priorytet**: P1

### SFQ-064: Receive RMA — quantity_received per linia
- **Co sprawdza**: Zapis przyjętych ilości (approved|receiving→received).
- **Kroki**: 1) receive z częściowymi ilościami.
- **Oczekiwana logika**: `rma-actions.ts:476-538`.
- **Priorytet**: P1

### SFQ-065: Process RMA — dispositions restock|scrap|quality_hold
- **Co sprawdza**: Zapis dyspozycji nagłówka i linii + audit/outbox.
- **Kroki**: 1) process z każdą dyspozycją.
- **Oczekiwana logika**: enum `rma-actions-types.ts:15,113-116`; audit `shipping.rma.processed` (`rma-actions.ts:549-585`).
- **Priorytet**: P0

### SFQ-066: RMA disposition NIE dotyka stanów ani WAC (udokumentowany brak)
- **Co sprawdza**: Że `restock` NIE tworzy LP/ruchu magazynowego, `scrap` nie debetuje WAC.
- **Kroki**: 1) process disposition=restock; 2) sprawdź `license_plates`, movements, `item_wac_state`.
- **Oczekiwana logika**: brak jakiegokolwiek efektu inwentarzowego/WAC w `processRma` (`rma-actions.ts:549-585`) — dyspozycja jest tylko zapisem. Test regresyjny dokumentujący lukę (patrz Niepewności).
- **Priorytet**: P1

## Finance — WAC (L/finance)

Wzór stanu: `item_wac_state(org_id,item_id,currency_id)` trzyma sumy bieżące `total_qty_kg`, `total_value`; **avg_cost = total_value / total_qty_kg** (kolumna liczona w DB). Każde księgowanie = delta `(ΔQty_kg, ΔValue)` dodawana do wiersza (`upsert-wac.ts:95-177`).

### SFQ-067: WAC przyjęcia (GRN) — ΔQty=kg przyjęte, ΔVal=qty×unit_price z PO
- **Co sprawdza**: Księgowanie przyjęcia i snapshot na GRN.
- **Kroki**: 1) stan: 100 kg @ 2.00; 2) przyjmij 50 kg @ 3.00; 3) sprawdź avg_cost.
- **Oczekiwana logika**: `book-receipt-wac.ts:72-121`; `receivedValue = qty × pol.unit_price` (:87,182-188); **avg = (100×2 + 50×3)/(100+50) = 350/150 = 2.3333…** (pełna precyzja numeric, bez zaokrągleń w upsercie); snapshot `{wac_qty_kg, wac_value}` w `grn_items.ext_jsonb` (:103-120).
- **Priorytet**: P0

### SFQ-068: WAC debet konsumpcji/shipu — po avg_cost z locka
- **Co sprawdza**: `debitWac`: ΔQty=-kg, ΔVal=-(kg × zablokowany avg_cost).
- **Kroki**: 1) stan 150 kg @ 2.3333; 2) ship 30 kg; 3) sprawdź total_value.
- **Oczekiwana logika**: `upsert-wac.ts:628-667, 688-718`; **value -= 30 × 2.3333…**; avg_cost bez zmiany.
- **Priorytet**: P0

### SFQ-069: WAC kredyt korekty in-plus po avg_cost (creditWacAtAvgCost)
- **Co sprawdza**: Stock gain (count-up) księgowany po bieżącym avg.
- **Kroki**: 1) korekta +10 kg; 2) avg_cost niezmieniony.
- **Oczekiwana logika**: `ΔVal = qtyKg × locked avg_cost` (`upsert-wac.ts:592-622, 669-686`).
- **Priorytet**: P0

### SFQ-070: WAC underflow clamp — qty/value nie schodzą poniżej 0 + anomalia
- **Co sprawdza**: `WAC_COHERENT_FINAL_CTE` i outbox `FINANCE_WAC_UNDERFLOW`.
- **Kroki**: 1) stan 10 kg; 2) debet 15 kg; 3) sprawdź stan i outbox.
- **Oczekiwana logika**: `coerced_qty=greatest(raw,0)`, `coerced_value=greatest(raw,0)`, value zerowane TYLKO gdy qty=0 (`upsert-wac.ts:37-54`); `clamped=true` → anomalia dedup-keyed (:48-52,161-175,720-774).
- **Priorytet**: P0

### SFQ-071: WAC — pozytywne qty przy value=0 zachowane
- **Co sprawdza**: Że clamp nie zeruje qty przy zerowej wartości.
- **Kroki**: 1) doprowadź do qty>0, value→0.
- **Oczekiwana logika**: `case when coerced_qty=0 then 0 else coerced_value end` (`upsert-wac.ts:47`) — qty zostaje, avg=0.
- **Priorytet**: P1

### SFQ-072: Guard unresolved_uom — priced receipt zablokowany przed GRN/LP
- **Co sprawdza**: Przyjęcie z niezerową ceną i nierozwiązywalnym UoM jest blokowane przed utworzeniem GRN, LP i `grn_item`, aby nie powstał zapas wyceniony na zero.
- **Kroki**: 1) Item bez `net_qty_per_each` w UoM `each`, linia PO z niezerową ceną. 2) Spróbuj przyjęcia. 3) Oczekuj `unresolved_uom` i braku INSERT do GRN/LP/`grn_items`.
- **Oczekiwana logika**: desktop przekazuje preflight przed zapisami (`receive-po-line.ts:55-57`); nierozwiązana konwersja dla priced line rzuca `BookReceiptWacError('unresolved_uom')` (`book-receipt-wac.ts:165-187`).
- **Decyzja ownera (2026-07-30)**: zachować blokadę, bo sam zapis receipt z pominięciem WAC tworzyłby zapas bez wyceny; zielone `book-receipt-wac.test.ts:157-183` i `receive-po-line-core.test.ts:415-448` przestają być anty-testami.
- **Priorytet**: P0

### SFQ-073: Reversal przyjęcia/konsumpcji ze snapshotu
- **Co sprawdza**: Odwrócenia preferują snapshot, nie bieżący avg.
- **Kroki**: 1) przyjmij 50 kg @3; 2) zmień avg innymi ruchami; 3) void przyjęcia; 4) sprawdź, że cofnięto dokładnie 150, nie 50×nowy avg.
- **Oczekiwana logika**: `computeWacReversalDelta` neguje snapshot (`upsert-wac.ts:288-307`); debit-reversal :310-329; output-reversal snapshot-only, skip przy `no_snapshot` (:410-453); skip pozycji `wac_excluded` (:331-335).
- **Priorytet**: P0

### SFQ-074: Konkurencyjne posty WAC — serializacja FOR UPDATE per bucket
- **Co sprawdza**: N-FIN-3 — brak lost update na `item_wac_state`.
- **Kroki**: 1) 10 równoległych przyjęć tego samego itemu; 2) suma sum.
- **Oczekiwana logika**: `existing as materialized (… for update)` (`upsert-wac.ts:115-122`) + `on conflict do update` (:141-146). To row-lock, NIE advisory lock (advisory locki są upstream: batch/genealogy w `L/production/output/register-output.ts:341-375`).
- **Priorytet**: P0

### SFQ-075: Waluta ≠ GBP przy przyjęciu — unsupported_currency (brak FX)
- **Co sprawdza**: Twarde odrzucenie zamiast konwersji.
- **Kroki**: 1) PO w EUR; 2) book receipt.
- **Oczekiwana logika**: `WAC_VALUATION_CURRENCY_CODE='GBP'` (`upsert-wac.ts:33`); throw `unsupported_currency` (`book-receipt-wac.ts:90-92`); zły/nieznany kod → `unknown_currency` (:161-180). W systemie NIE MA tabeli kursów — „brak kursu" = jawny błąd, nigdy cicha konwersja/0.
- **Priorytet**: P0

### SFQ-076: resolve-output-wac — koszt outputu z materiałów WO
- **Co sprawdza**: Wzór kredytu FG.
- **Kroki**: 1) WO: konsumpcje z wac_value=100; planned 50 kg; zarejestruj 20 kg outputu.
- **Oczekiwana logika**: `material_cost` = Σ wac_value konsumpcji (fallback: cost_history/items.cost_per_kg) (`resolve-output-wac.ts:66-127`); `baseline = greatest(planned_kg, prior+this)` (:114-132); `cost_per_kg = material_cost/baseline` (:142-146); **output_value = least(cost_per_kg×qty, material_cost − prior_booked)** (:147-154) — suma kredytów nigdy > material_cost; source=`wo_computed` (:158-166).
- **Priorytet**: P0

### SFQ-077: Output-WAC fallbacki — standard i un_costed
- **Co sprawdza**: Ścieżki awaryjne wyceny outputu.
- **Kroki**: 1) WO bez policzalnego cost_per_kg ale ze `standardCostPerKg`; 2) WO z nieskosztowaną konsumpcją.
- **Oczekiwana logika**: fallback `output_value = qty × standardCostPerKg`, source=`standard` (:168-181); nieskosztowana linia → `excluded:'un_costed'` z listą linii (:60-63,186-230) — nigdy księgowanie 0.
- **Priorytet**: P0

### SFQ-078: Cap kumulatywny kredytów outputu (druga rejestracja)
- **Co sprawdza**: `least(..., material_cost − prior_wac_booked)` przy wielu rejestracjach.
- **Kroki**: 1) zarejestruj output 2× tak, by druga przekraczała pozostały koszt.
- **Oczekiwana logika**: druga rejestracja przycięta do reszty (:147-154).
- **Priorytet**: P1

## Finance — valuation i koszty WO (finance/valuation, finance)

### SFQ-079: Raport valuation — total_value = Σ(base_qty_kg × avg_cost) per item×waluta
- **Co sprawdza**: Matematykę raportu.
- **Kroki**: 1) 2 LP itemu (10 kg + 5 kg), avg 2.00; 2) raport.
- **Oczekiwana logika**: `LP_VALUATION_CTE` join `item_wac_state.avg_cost` (`get-inventory-valuation.ts:39-76`); grupowanie item×currency (NIE per magazyn; site to filtr `app.current_site_id()`) (:132-147, :73-75); qty 6dp, money 4dp (:78-84); sort po total_value desc.
- **Priorytet**: P0

### SFQ-080: Valuation — tylko otwarte LP
- **Co sprawdza**: Wykluczenie `consumed/shipped/destroyed/merged/returned`.
- **Kroki**: 1) ship LP; 2) raport.
- **Oczekiwana logika**: filtr statusów `get-inventory-valuation.ts:73-75`.
- **Priorytet**: P0

### SFQ-081: Valuation — grand total per waluta, bez sum międzywalutowych
- **Co sprawdza**: `grandByCurrency`.
- **Kroki**: 1) itemy z WAC w GBP (i teoretycznie innej walucie); 2) raport.
- **Oczekiwana logika**: bucket per currency (:103-114); brak cross-currency sumy.
- **Priorytet**: P1

### SFQ-082: Valuation — bucket „unvalued"
- **Co sprawdza**: LP bez WAC/waluty/przeliczalnego kg trafiają do licznika unvalued.
- **Kroki**: 1) LP itemu bez wpisu w item_wac_state; 2) raport + UI.
- **Oczekiwana logika**: `wac is null OR currency is null OR base_qty_kg is null` (:148-159); panel `valuation/page.tsx:67-79`.
- **Priorytet**: P1

### SFQ-083: Uprawnienia valuation — any-of trzech
- **Co sprawdza**: Gate `fin.valuation.view|fin.valuation.read|fin.costs.read`.
- **Kroki**: 1) user bez żadnego — strona/akcja; 2) z jednym.
- **Oczekiwana logika**: `hasAnyPermission` (`get-inventory-valuation.ts:127`; stałe `inventory-valuation-types.ts:2-6`); odmowa → panel denied (`valuation/page.tsx:11-22`).
- **Priorytet**: P0

### SFQ-084: Koszty WO — gate fin.costs.read + waluta GBP only
- **Co sprawdza**: `computeWoActualCost`/`listCompletedWoCosts`/`summarizeWaste`.
- **Kroki**: 1) bez `fin.costs.read`; 2) WO z konsumpcją nie-GBP.
- **Oczekiwana logika**: gate `wo-cost-actions.ts:264,618,666`; `WO_REPORTING_CURRENCY=GBP` (:44-45), labor rates filtr GBP (:416,456), nie-GBP → `reason:'unsupported_currency'` (:520-527).
- **Priorytet**: P0

### SFQ-085: wo-cost-math — zaokrąglenia half-away-from-zero
- **Co sprawdza**: Deterministyczną arytmetykę mikro-skali.
- **Kroki**: 1) przypadki brzegowe dzielenia (`divMicro`).
- **Oczekiwana logika**: `wo-cost-math.ts:49-56`; brak floatów w torze pieniężnym.
- **Priorytet**: P2

## Finance — pricing / customer prices (settings/customer-prices + SO)

### SFQ-086: Precedencja ceny linii SO — customer price → list_price_gbp → 0
- **Co sprawdza**: Resolver ceny.
- **Kroki**: 1) item z aktywną customer_item_price GBP; 2) bez niej; 3) bez list_price.
- **Oczekiwana logika**: `resolveSalesLinePriceDetailed` (`sales-line-price.ts:96-136`); brak tierów ilościowych — jedna aktywna cena per (customer,item,currency).
- **Priorytet**: P0

### SFQ-087: Cena klienta w obcej walucie — hint, nie konwersja
- **Co sprawdza**: `foreignCustomerPrice`.
- **Kroki**: 1) customer price tylko w EUR; 2) resolver dla linii GBP.
- **Oczekiwana logika**: użyty `list_price_gbp` + hint `foreignCustomerPrice` (:121-133); filtr waluty PRZED `DISTINCT ON` (nowszy wiersz w innej walucie nie przesłania, :156-194).
- **Priorytet**: P0

### SFQ-088: Okno obowiązywania ceny — asOfDate = order_date
- **Co sprawdza**: `effective_from <= order_date <= effective_to`, wygrywa najnowsze effective_from.
- **Kroki**: 1) dwie ceny z różnymi oknami; 2) SO z order_date w środku.
- **Oczekiwana logika**: `fetchActiveCustomerItemPrices` (:157-194); `asOfDate` z `so-actions.ts:637-653`; walidacja `effectiveTo >= effectiveFrom` (`customer-item-prices-actions.ts:85-99`).
- **Priorytet**: P0

### SFQ-089: Suma linii — qty × price × (1−disc%) × (1+tax%), 4dp
- **Co sprawdza**: `computeSoLineTotal` + lustrzany SQL.
- **Kroki**: 1) linia 3 szt × 10.00, disc 10%, tax 20%; 2) porównaj `line_total_gbp`.
- **Oczekiwana logika**: **3×10×0.9×1.2 = 32.40**; half-away-from-zero do 4dp (`sales-line-price.ts:51-64`; SQL `so-actions.ts:768,986,1021`); disc/tax walidowane 0–100, ≤4dp (`so-actions.ts:113-121`).
- **Priorytet**: P0

### SFQ-090: Ujemna cena — odrzucona na wejściu admina cen
- **Co sprawdza**: Guard non-negative.
- **Kroki**: 1) create customer price z `-5`; 2) z `abc`.
- **Oczekiwana logika**: regex `^\d+(\.\d+)?$` + `numeric(12,4)` (`customer-item-prices-actions.ts:66-72`); waluty tylko `GBP|USD|EUR|PLN` (:19); NPD retail EUR ujemna → odrzucona (`retail-price-eur.ts:26,46`).
- **Priorytet**: P0

### SFQ-091: Duplikat ceny (unikalność) → conflict
- **Co sprawdza**: Obsługę unique constraint.
- **Kroki**: 1) 2× ta sama (customer,item,currency,okno).
- **Oczekiwana logika**: `error:'conflict'` (`customer-item-prices-actions.ts:317,371`).
- **Priorytet**: P1

### SFQ-092: Uprawnienia admina cen — settings.org.read/update
- **Co sprawdza**: Gate list vs mutacje.
- **Kroki**: 1) list bez `settings.org.read`; 2) create/update/deactivate bez `settings.org.update`.
- **Oczekiwana logika**: `customer-item-prices-actions.ts:243,259` (read), `:278,332,386` (update).
- **Priorytet**: P0

## Quality — Holds (quality/holds)

### SFQ-093: Utworzenie holda ustawia LP qa_status=on_hold
- **Co sprawdza**: Skutek create dla nieterminalnych LP.
- **Kroki**: 1) `quality.hold.create`; 2) hold `lp`; 3) sprawdź qa_status.
- **Oczekiwana logika**: `hold_status='open'` (`hold-actions.ts:305`), LP→`on_hold` (:366-375); terminalne LP (`consumed|merged|shipped|returned`) nietykane (:105).
- **Priorytet**: P0

### SFQ-094: Statusy aktywne holda i typy referencji
- **Co sprawdza**: `open|investigating|escalated|quarantined` aktywne; ref `lp|batch|wo|po|grn`; batch jako TEKST.
- **Kroki**: 1) holdy każdego typu; 2) batch po batch_number (nie UUID).
- **Oczekiwana logika**: `hold-actions.ts:41,104`; batch w `reference_text` (:136-139,315,322 — guard 22P02).
- **Priorytet**: P1

### SFQ-095: Release holda — e-sign + dyspozycje
- **Co sprawdza**: 4 dyspozycje i mapowanie na DB + skutki dla LP.
- **Kroki**: 1) release z każdą z `release|scrap|rework|partial` + e-sign `qa.hold.release`.
- **Oczekiwana logika**: mapowanie na `release_as_is|scrap|rework|other` (:746-753); LP: scrap→`rejected`, inne→`released` (:755); disposition=release: LP `blocked`→`available` (:826-829,846-847); wpisy `lp_state_history` (:848-897); e-sign :997-1006; perm `quality.hold.release` (:992).
- **Priorytet**: P0

### SFQ-096: Idempotencja release — hold już released
- **Co sprawdza**: Podwójny release.
- **Kroki**: 1) release 2×.
- **Oczekiwana logika**: throw przy `hold_status='released' || released_at` (:734-736); UPDATE guard (:766-768); FOR UPDATE (:729).
- **Priorytet**: P0

### SFQ-097: Release przy DRUGIM aktywnym holdzie na LP — LP zostaje zablokowany
- **Co sprawdza**: Cross-hold guard.
- **Kroki**: 1) 2 holdy na ten sam LP; 2) release pierwszego.
- **Oczekiwana logika**: `assertNoActiveHoldForLp` (`QA_HOLD_ACTIVE`) — qa_status NIE wraca do released (:806-819).
- **Priorytet**: P0

### SFQ-098: Hold WO — freeze i restore outputów
- **Co sprawdza**: Snapshot outputów WO przy holdzie, restore tylko gdy brak innego WO-holda.
- **Kroki**: 1) hold `wo`; 2) drugi hold `wo`; 3) release pierwszego; 4) release drugiego.
- **Oczekiwana logika**: `applyWoOutputHoldForContext` (:378-390); restore z advisory lock, tylko przy zerze pozostałych holdów WO (:900-933).
- **Priorytet**: P0

### SFQ-099: Warehouse LP unblock path
- **Co sprawdza**: `releaseHoldFromWarehouseLpUnblock`.
- **Kroki**: 1) LP `blocked`+`on_hold`; 2) unblock z e-sign; 3) LP tylko `on_hold` bez holda (oczekuj `no_open_hold`); 4) LP w złym stanie (`invalid_state`).
- **Oczekiwana logika**: `hold-actions.ts:1016-1081`; wymagane `quality.hold.release` (:1028); source `warehouse_lp_unblock`.
- **Priorytet**: P1

### SFQ-100: Uprawnienia holdów — create/release/list
- **Co sprawdza**: `quality.hold.create` (:692), `quality.hold.release` (:992,1028), list/detail `quality.dashboard.view` (:460,544); probe UI `canReleaseHolds` fail-closed (`can-release.ts:16-38`).
- **Kroki**: 1) każda akcja bez uprawnienia.
- **Oczekiwana logika**: forbidden; probe zwraca false, nie rzuca.
- **Priorytet**: P0

### SFQ-101: E2E: hold → blokada pick/pack/ship → release → operacje przechodzą
- **Co sprawdza**: Pełny łańcuch hold-gate w shipping (spina SFQ-018/029/035/040).
- **Kroki**: 1) allocate; 2) hold; 3) pick (fail), pack (fail), ship (fail); 4) release; 5) pick OK.
- **Oczekiwana logika**: guardy jak w SFQ-018/029/035/040; po release `assertNoActiveHoldForLp` przechodzi.
- **Priorytet**: P0

## Quality — NCR (quality/ncrs)

### SFQ-102: Create NCR — status open, typy/severity
- **Co sprawdza**: Insert `status='open'` z typem i severity.
- **Kroki**: 1) create z każdym typem (`quality|yield_issue|allergen_deviation|supplier|process|complaint_related`) i severity (`critical|major|minor`).
- **Oczekiwana logika**: `ncr-actions.ts:45-47,602`; ref types :48; perm `quality.ncr.create` (:575).
- **Priorytet**: P0

### SFQ-103: Investigation — draft|open|reopened → investigating
- **Co sprawdza**: Zapis root cause / immediate / corrective action.
- **Kroki**: 1) updateNcrInvestigation na open; 2) na closed (błąd).
- **Oczekiwana logika**: tylko nieterminalne (:685); przejście :701; corrective do `ext_jsonb.investigation.corrective_action` (:708-716).
- **Priorytet**: P0

### SFQ-104: Close NCR — e-sign qa.ncr.close + idempotencja
- **Co sprawdza**: Zamknięcie z podpisem, blokada double-close.
- **Kroki**: 1) close z e-sign; 2) close ponownie.
- **Oczekiwana logika**: FOR UPDATE (:805), reject closed/cancelled (:810), e-sign (:824), `closure_signature_hash` + resolution w ext_jsonb (:836-840).
- **Priorytet**: P0

### SFQ-105: Close critical NCR wymaga quality.ncr.close_critical
- **Co sprawdza**: Split uprawnień zamykania.
- **Kroki**: 1) user z samym `quality.ncr.create` zamyka critical (fail); 2) minor (OK); 3) user z close_critical zamyka critical.
- **Oczekiwana logika**: any-of do wejścia (:788-792), critical wymaga close_critical (:814-818).
- **Priorytet**: P0

### SFQ-106: NCR z kontekstem CCP-breach
- **Co sprawdza**: `fetchCcpBreachContext` dla ref `ccp_deviation`.
- **Kroki**: 1) wygeneruj breach (SFQ-116); 2) otwórz detal NCR.
- **Oczekiwana logika**: join `haccp_monitoring_log.breach_ncr_id` — CCP + zmierzona wartość (:410-462,528-531).
- **Priorytet**: P1

### SFQ-107: Lista NCR — site-scope + paginacja + gate
- **Co sprawdza**: `quality.dashboard.view` (:314,468), scope (:322-323).
- **Kroki**: 1) bez uprawnienia; 2) user site-restricted.
- **Oczekiwana logika**: forbidden / tylko rekordy site'u.
- **Priorytet**: P1

## Quality — Inspections (quality/inspections)

### SFQ-108: Create inspection — pending, numeracja, gate assign
- **Co sprawdza**: `createInspection`.
- **Kroki**: 1) create dla ref `lp|grn|wo_output`.
- **Oczekiwana logika**: perm `quality.inspection.assign` (:810); `status='pending'`, numer z `next_quality_inspection_number` (:846).
- **Priorytet**: P0

### SFQ-109: Rezolucja parametrów — stored → active spec → missing_template
- **Co sprawdza**: `resolveInspectionParameters`.
- **Kroki**: 1) inspekcja z zapisanymi parametrami; 2) bez — item z aktywną specyfikacją (`applies_to in ('incoming','all')`, okno dat); 3) bez specy.
- **Oczekiwana logika**: `L/quality/resolve-inspection-parameters.ts:76-116`; expected formatowane target/`min–max`/`≥min`/`≤max` (:34-45). Brak AQL/planów próbkowania — parametry to lista {name,expected,actual,pass} (min 1, max 200).
- **Priorytet**: P0

### SFQ-110: Record result — pending|in_progress → in_progress
- **Co sprawdza**: Gate `quality.inspection.execute` i status.
- **Kroki**: 1) record na `passed` (błąd); 2) na pending.
- **Oczekiwana logika**: `inspection-actions.ts:895,904`.
- **Priorytet**: P0

### SFQ-111: Decyzja pass/fail/hold — mapowanie i idempotencja
- **Co sprawdza**: `submitInspectionDecision`.
- **Kroki**: 1) decide pass/fail/hold z e-sign `qa.inspection.submit`; 2) decide ponownie.
- **Oczekiwana logika**: pass→passed, fail→failed, hold→on_hold (:966); FOR UPDATE (:954), reject terminal (:959-961); e-sign (:971); perm execute (:940).
- **Priorytet**: P0

### SFQ-112: Pass na pending z 0 parametrów — inspection_parameters_required
- **Co sprawdza**: Guard pustej inspekcji.
- **Kroki**: 1) decide=pass bez record result.
- **Oczekiwana logika**: `inspection-actions.ts:962`.
- **Priorytet**: P0

### SFQ-113: Side-effect: GRN fail → hold na wszystkich przyjętych LP
- **Co sprawdza**: `applyLpDecisionSideEffects` dla grn.
- **Kroki**: 1) inspekcja grn z LP; 2) fail; 3) grn fail bez LP (throw).
- **Oczekiwana logika**: high-priority hold + `on_hold` (:360-372); brak LP → throw (:363).
- **Priorytet**: P0

### SFQ-114: Side-effect: decyzja lp — released/rejected/on_hold
- **Co sprawdza**: pass→released (z re-checkiem holdów), fail→rejected, hold→nowy hold.
- **Kroki**: 1) każda decyzja na LP; 2) pass przy istniejącym innym holdzie.
- **Oczekiwana logika**: :397; released re-check `assertNoActiveHoldForLp` (:398-416); hold → high-priority hold (:429-438); terminalne LP wykluczone (:424).
- **Priorytet**: P0

### SFQ-115: Side-effect: wo_output pass → transitionWoOutputQa PASSED
- **Co sprawdza**: Przejście QA outputu WO.
- **Kroki**: 1) inspekcja wo_output; 2) pass.
- **Oczekiwana logika**: `inspection-actions.ts:375-393`.
- **Priorytet**: P1

## Quality — CCP monitoring (quality/ccp-monitoring)

### SFQ-116: Odczyt poza limitami → NCR critical + ccp_deviation + auto-hold
- **Co sprawdza**: Pełną eskalację breach.
- **Kroki**: 1) CCP min=2, max=8; 2) recordMonitoring value=9 z woId; 3) sprawdź NCR, deviation, holdy LP i WO.
- **Oczekiwana logika**: `isWithinLimits` (`haccp-actions.ts:317-321`, BigInt-compare :299-315); log z `within_limits=false` (:641-662); NCR critical/open ref `ccp_deviation` (:684-717) + link `breach_ncr_id` (:721-727) + outbox `quality.ncr.opened` (:729-734); deviation `open` (:754-777); auto-hold: okno od ostatniego odczytu in-limits (`findCcpHoldWindowStart` :185-216), holdy na LP z okna + hold WO (:781-809).
- **Priorytet**: P0

### SFQ-117: Odczyt w limitach — tylko log, brak NCR
- **Co sprawdza**: Early return.
- **Kroki**: 1) value=5 dla min2/max8.
- **Oczekiwana logika**: `haccp-actions.ts:666`; `within_limits=true`.
- **Priorytet**: P0

### SFQ-118: Granice limitów — dokładne porównanie dziesiętne
- **Co sprawdza**: value==min i value==max są W limicie; null-bound otwarty; brak błędów floatów (np. 7.999999 vs 8).
- **Kroki**: 1) odczyty na granicach i tuż za nimi.
- **Oczekiwana logika**: `value<min`→false, `value>max`→false (:317-321); `compareDecimalStrings` BigInt (:299-315).
- **Priorytet**: P0

### SFQ-119: Idempotencja deviation per monitoring_log_id
- **Co sprawdza**: Powtórka eskalacji nie dubluje.
- **Kroki**: 1) 2× eskalacja tego samego logu (retry).
- **Oczekiwana logika**: istniejący `ccp_deviations` dla logu → zwrot istniejącego NCR (:668-681, `for update of d`); dedup holda po identycznym reason (:242-261).
- **Priorytet**: P0

### SFQ-120: Breach bez woId / bez LP w oknie — noty fallback
- **Co sprawdza**: Ścieżki bez auto-holdu.
- **Kroki**: 1) breach bez WO; 2) breach z WO bez outputów w oknie.
- **Oczekiwana logika**: nota "Auto-hold not created…" / "work-order level only…" (:748-752); deviation.hold_id = pierwszy hold LP else hold WO (:802-809).
- **Priorytet**: P1

### SFQ-121: Upsert CCP — min ≤ max, tylko plan_edit
- **Co sprawdza**: Walidację limitów i gate.
- **Kroki**: 1) upsert min=8 max=2 (fail zod refine); 2) upsert bez `quality.haccp.plan_edit`; 3) deactivate.
- **Oczekiwana logika**: refine (:81-87); gate upsert :439, deactivate :535.
- **Priorytet**: P0

### SFQ-122: recordMonitoring — CCP nieaktywny / gate deviation_override
- **Co sprawdza**: Guardy zapisu odczytu.
- **Kroki**: 1) record na deaktywowanym CCP; 2) bez `quality.ccp.deviation_override`.
- **Oczekiwana logika**: "CCP not found or inactive" (:627-637, FOR UPDATE); gate :618.
- **Priorytet**: P0

### SFQ-123: Odczyt boardu CCP — relaxed gate (plan_edit OR deviation_override)
- **Co sprawdza**: `canReadCcpBoard`.
- **Kroki**: 1) user tylko z deviation_override — listCcps/listMonitoringLog.
- **Oczekiwana logika**: :155-161, gates :388,579.
- **Priorytet**: P1

## Quality — CCP deviations (quality/ccp-deviations)

### SFQ-124: Resolve deviation — e-sign + dyspozycje
- **Co sprawdza**: `open→resolved` z dispositions `corrected|product_held|disposed`.
- **Kroki**: 1) resolve z e-sign `qa.haccp.ccp.deviation`; 2) resolve ponownie ("already resolved").
- **Oczekiwana logika**: `ccp-deviation-actions.ts:203-283`; FOR UPDATE (:233), reject resolved (:238), `esign_ref=signatureId` (:269), UPDATE guard `status='open'` (:268); perm ściśle `quality.ccp.deviation_override` (:210).
- **Priorytet**: P0

### SFQ-125: Resolve deviation NIE zwalnia powiązanych holdów
- **Co sprawdza**: Celowy brak auto-release (zarządzane przez releaseHold).
- **Kroki**: 1) resolve deviation z hold_id; 2) sprawdź hold.
- **Oczekiwana logika**: hold pozostaje aktywny (:272-273).
- **Priorytet**: P1

### SFQ-126: Rejestr deviations — gate odczytu OR
- **Co sprawdza**: `quality.dashboard.view` OR `quality.ccp.deviation_override`.
- **Kroki**: 1) każdą rolą.
- **Oczekiwana logika**: `canReadDeviationRegister` (:66-72), list/get (:182,194).
- **Priorytet**: P1

## Quality — Cold chain (quality/cold-chain)

### SFQ-127: Upsert zakresu temperatur — min ≤ max, jeden per item
- **Co sprawdza**: `product_temp_ranges`.
- **Kroki**: 1) upsert min>max (`invalid_input`); 2) upsert 2× (conflict-update, nie duplikat).
- **Oczekiwana logika**: `cold-chain-actions.ts:184-191`; on conflict `(org_id,item_id)` (:197-207); perm `quality.coldchain.manage` (:195).
- **Priorytet**: P0

### SFQ-128: Condition check — logika inRange
- **Co sprawdza**: inRange gdy: brak zakresu, `requires_check=false`, brak bounds, lub min≤measured≤max.
- **Kroki**: 1) każdy wariant, w tym równość z granicą.
- **Oczekiwana logika**: `cold-chain-actions.ts:235-239`; breach = `!inRange && hasBounds` (:240); perm `quality.coldchain.record` (:228).
- **Priorytet**: P0

### SFQ-129: Breach z lpId → hold critical + zapis checku z hold_id
- **Co sprawdza**: Auto-hold cold-chain.
- **Kroki**: 1) measured poza zakresem z lpId; 2) sprawdź hold i `delivery_condition_checks`.
- **Oczekiwana logika**: reason `Cold-chain breach:…` (:67-73); createHold critical (:249-259); check z `in_range,reason,hold_id` (:262-307).
- **Priorytet**: P0

### SFQ-130: Dedup holda cold-chain w oknie 24h
- **Co sprawdza**: `findExistingColdChainHold`.
- **Kroki**: 1) 2 breache tego samego LP w <24h; 2) po 24h.
- **Oczekiwana logika**: aktywny hold lp z reason `Cold-chain breach:%` <24h → reuse (:135-151); po 24h nowy hold.
- **Priorytet**: P1

### SFQ-131: invalid_input — brak itemId / NaN temperatura
- **Co sprawdza**: Walidację wejścia.
- **Kroki**: 1) check bez itemId; 2) measured=NaN/Infinity.
- **Oczekiwana logika**: `cold-chain-actions.ts:220`.
- **Priorytet**: P1

### SFQ-132: Widok cold-chain — tier odczytu i limit 50
- **Co sprawdza**: READ = record OR manage; recent checks ≤50; fail-closed `load_failed`.
- **Kroki**: 1) user z każdym uprawnieniem; 2) >50 checków.
- **Oczekiwana logika**: `list-cold-chain.ts:46,48,80-96,137,174`. Uwaga: `hasReadPermission` NIE ma fallbacku super-ról (patrz SFQ-171).
- **Priorytet**: P1

## Quality — Complaints + CAPA (quality/complaints)

### SFQ-133: Create complaint — open, numeracja CMP- z advisory lockiem
- **Co sprawdza**: Numer `CMP-XXXXXXXX` bez duplikatów przy równoległości.
- **Kroki**: 1) 5 równoległych create.
- **Oczekiwana logika**: `complaint-actions.ts:271-308` (advisory xact lock); perm WRITE=`quality.ncr.create` (:104,268), READ=`quality.dashboard.view` (:103).
- **Priorytet**: P0

### SFQ-134: Convert complaint → NCR — mapowanie severity + idempotencja
- **Co sprawdza**: `convertComplaintToNcr`.
- **Kroki**: 1) convert (critical→critical, high→major, low/medium→minor); 2) convert 2×; 3) convert już converted.
- **Oczekiwana logika**: :397-532; FOR UPDATE (:429); already-linked → istniejący ncr_id (:434); `already_converted` (:435); reuse NCR ref complaint (:437-463); outbox `quality.ncr.opened` (:506-511); update guard `ncr_id is null and status<>'converted'` (:513-522).
- **Priorytet**: P0

### SFQ-135: CAPA create — corrective|preventive, source complaint|ncr
- **Co sprawdza**: Model CAPA.
- **Kroki**: 1) CAPA dla complaint i dla NCR.
- **Oczekiwana logika**: `capa_actions` insert `status='open'` (:566); gate `quality.ncr.create` (:545).
- **Priorytet**: P1

### SFQ-136: CAPA resolve — e-sign qa.capa.close + double-close
- **Co sprawdza**: Zamknięcie CAPA.
- **Kroki**: 1) resolve z e-sign; 2) resolve 2× (`already_closed`); 3) złe hasło (`esign_failed`).
- **Oczekiwana logika**: :640-738; FOR UPDATE (:677), reject closed (:682), `esign_ref=subjectHash` (:686-701), `esign_failed` (:703), guard `status<>'closed'`+rowCount (:714,732).
- **Priorytet**: P0

## Quality — HACCP plans (quality/haccp)

### SFQ-137: Plan create — draft v1; aktywacja tylko z draft + e-sign
- **Co sprawdza**: Lifecycle planu.
- **Kroki**: 1) upsert nowego planu; 2) activate z e-sign `qa.haccp.plan.activate`; 3) activate ponownie (fail — już active).
- **Oczekiwana logika**: insert `status='draft',version=1` (`haccp-plan-actions.ts:276-279`); activate: FOR UPDATE (:320), `status!=='draft'`→throw (:325), e-sign (:327-336), UPDATE guard `status='draft'` (:348-355); gate wszystkiego `quality.haccp.plan_edit`.
- **Priorytet**: P0

### SFQ-138: Aktywacja supersedes inne aktywne plany o tej samej nazwie
- **Co sprawdza**: Auto-supersede by-name.
- **Kroki**: 1) aktywny plan "X"; 2) aktywuj draft "X" v2.
- **Oczekiwana logika**: inne active o tej nazwie → `superseded` (:338-346).
- **Priorytet**: P0

### SFQ-139: Nowa wersja planu — tylko z active, kopiuje CCP z suffiksem
- **Co sprawdza**: `newPlanVersion`.
- **Kroki**: 1) newVersion z draft (fail); 2) z active; 3) sprawdź CCP `ccp_code-vN`.
- **Oczekiwana logika**: source active + lock (:401-404); draft v+1 (:410-431); kopiowanie CCP (:450-486).
- **Priorytet**: P1

## Quality — Specifications (quality/specifications)

### SFQ-140: Create spec — draft, wersjonowanie per product+spec_code, ≥1 parametr
- **Co sprawdza**: `createSpec`.
- **Kroki**: 1) create bez parametrów (fail); 2) create 2× ten sam spec_code (v1, v2); 3) równoległe create (advisory lock).
- **Oczekiwana logika**: `spec-actions.ts:318-413`; lock (:338); version=max+1 (:341-349); ≥1 param (:86); sort_order=index (:368-406); wszystkie mutacje gate `quality.spec.approve`.
- **Priorytet**: P0

### SFQ-141: Edycja/usuwanie parametrów tylko w draft
- **Co sprawdza**: `requireDraftSpec` + re-sekwencja sort_order.
- **Kroki**: 1) update/delete parametru w active (fail); 2) delete w draft → sprawdź sort_order.
- **Oczekiwana logika**: :138-150 (throw), enforce :430,561; resekwencja :602-617; audit :508,619.
- **Priorytet**: P0

### SFQ-142: Flow zatwierdzenia — draft→under_review→active z e-sign
- **Co sprawdza**: `submitSpecForReview` + `approveSpec`.
- **Kroki**: 1) approve z draft (fail — musi być under_review); 2) submit; 3) approve z e-sign `qa.spec.approve`.
- **Oczekiwana logika**: submit guard `status='draft'` (:655); approve: FOR UPDATE (:682), musi być under_review (:687), e-sign (:689-698), `approval_signature_hash=subjectHash` (:701-708).
- **Priorytet**: P0

### SFQ-143: Supersede spec
- **Co sprawdza**: `status='superseded'` + `superseded_by`, bez e-sign, idempotencja.
- **Kroki**: 1) supersede active; 2) supersede 2×.
- **Oczekiwana logika**: :721-744, guard `status<>'superseded'` (:728-733).
- **Priorytet**: P1

## Quality — Trace + mass balance (quality/trace)

### SFQ-144: Trace forward/backward/both — filtr kierunkowy genealogii
- **Co sprawdza**: `includeGenealogyNode`: self zawsze; ancestor tylko backward|both; descendant tylko forward|both.
- **Kroki**: 1) run trace w 3 kierunkach dla LP z przodkami i potomkami.
- **Oczekiwana logika**: `trace-actions.ts:174-178`; graf nodes/edges (`buildTraceReport` :700-968): supplier→PO→GRN→input_lp→WO→output_lp→shipment; forward shipments przez RPC `get_forward_shipments_org_wide` (:310-317).
- **Priorytet**: P0

### SFQ-145: Seed resolution — lp/batch/item + limity truncation
- **Co sprawdza**: Wyszukiwanie seedów i warstwę truncation.
- **Kroki**: 1) trace po lp_code, batch_number, item_code; 2) >200 LP / >500 batch.
- **Oczekiwana logika**: `resolveSeedLpIds` (:201-250); limity LP=200, BATCH=500, ITEM=500 (`trace-mass-balance.ts:12-14`); over-limit → warstwa truncation (:218-227).
- **Priorytet**: P1

### SFQ-146: Mass balance — deltaKg per node i epsilon
- **Co sprawdza**: Wzory bilansu masy.
- **Kroki**: 1) WO: input 100 kg → output 95 + waste 4 + remaining 1; 2) input 100 → 90 (delta 10).
- **Oczekiwana logika**: **deltaKg = inputKg − (outputKg + wasteKg + remainingKg)** (`trace-mass-balance.ts:112`); balanced gdy |delta| ≤ 0.001 kg (`MASS_BALANCE_EPSILON_KG` :10, :62-67); total netted: **delta = seedInputKg − (onSiteKg + shippedKg + wasteKg)**, `percentAccounted` 6dp (:148-154); arytmetyka BigInt.
- **Priorytet**: P0

### SFQ-147: Mass balance — non-kg do unreconciled, item-trace bez bilansu
- **Co sprawdza**: Partycjonowanie kg-only i skip dla item.
- **Kroki**: 1) trace z LP w `each`; 2) trace po item.
- **Oczekiwana logika**: non-kg → `unreconciled`, nie sumowane (:69-88, :22-24); item → `resolveMassBalanceScope` null (`trace-actions.ts:512`).
- **Priorytet**: P1

### SFQ-148: Mass balance — site-restricted → scopeLimited
- **Co sprawdza**: Guard przeciw fabrykowanym deltom przy RLS site.
- **Kroki**: 1) user site-restricted run trace.
- **Oczekiwana logika**: `{scopeLimited:true}` zamiast bilansu (`trace-actions.ts:597-601`).
- **Priorytet**: P1

### SFQ-149: F1 — scope po LP id/batch, nie po wo_id (sibling over-count)
- **Co sprawdza**: Że outputy siostrzane WO nie zawyżają bilansu.
- **Kroki**: 1) WO z 2 batchami; 2) trace jednego batcha.
- **Oczekiwana logika**: admit tylko exact LP id / batch code (:557-572,606-608); waste WO nieprzypisany flagowany osobno (:439-491).
- **Priorytet**: P1

### SFQ-150: Trace permission + summary
- **Co sprawdza**: Gate `quality.dashboard.view` (TODO split) i sumy raportu.
- **Kroki**: 1) bez uprawnienia (throw `forbidden`); 2) sprawdź `lpCount, woCount, shipmentCount, customersAffected, totalKg` (kg-only).
- **Oczekiwana logika**: `TRACE_PERMISSION` (`trace-actions.ts:144-150`, apply :974,982,1008); summary :958-964; affected customers z shipmentów else `source_so_id` (:926-940).
- **Priorytet**: P0

## Quality — Recall drills (quality/recall-drills)

### SFQ-151: KPI drilla — 4h target
- **Co sprawdza**: Status within/over/in_progress.
- **Kroki**: 1) drill duration 3h59m; 2) 4h01m; 3) completed_at=null.
- **Oczekiwana logika**: `RECALL_TARGET_MS = 4*60*60*1000` (`labels.ts:305`); `durationMs <= target` → within; null → in_progress (list :43-46; detail page :125-126).
- **Priorytet**: P1

### SFQ-152: Drill = snapshot, nie re-run
- **Co sprawdza**: Panel raportu renderuje `result_jsonb` bez ponownego trace.
- **Kroki**: 1) otwórz drill; 2) zmień dane inwentarzowe; 3) odśwież drill.
- **Oczekiwana logika**: `drill-report-panel.tsx:6-10,66-99` — raport niezmienny.
- **Priorytet**: P2

### SFQ-153: CSV export drillów
- **Co sprawdza**: Kolumny i przeliczenie minut.
- **Kroki**: 1) eksport listy.
- **Oczekiwana logika**: `ms/60000` 2dp; pass/fail = within-target (`recall-drills-list.client.tsx:75-93`).
- **Priorytet**: P2

### SFQ-154: Drill detail — forbidden/not-found panele
- **Co sprawdza**: Obsługę braku uprawnień i złego ID.
- **Kroki**: 1) bez `quality.dashboard.view`; 2) random UUID.
- **Oczekiwana logika**: denied panel / not-found (`[drillId]/page.tsx:80-123`).
- **Priorytet**: P2

## Maintenance — Assets (maintenance/assets)

### SFQ-155: Create equipment — walidacja i typy
- **Co sprawdza**: Pola `equipmentCode(1-64)`, `name(1-200)`, typ z `mixer|oven|packer|scale|thermometer|conveyor|other`, flagi `requiresLoto`/`requiresCalibration`.
- **Kroki**: 1) create poprawny (active=true); 2) puste code (validation_error).
- **Oczekiwana logika**: `asset-schemas.ts:15-21`; insert active=true (`asset-actions.ts:126`); zod fail → `validation_error` (:153-155); perm `mnt.asset.edit` (:113), list `mnt.asset.read` (:60).
- **Priorytet**: P0

### SFQ-156: Duplikat kodu equipmentu → conflict
- **Co sprawdza**: `equipment_org_code_uq`.
- **Kroki**: 1) create 2× ten sam kod.
- **Oczekiwana logika**: `{reason:'conflict'}` (`asset-actions.ts:146-148`).
- **Priorytet**: P1

### SFQ-157: Brak update/deactivate equipmentu (udokumentowany brak)
- **Co sprawdza**: Że dostępne akcje to tylko create+list.
- **Kroki**: 1) przegląd API/UI.
- **Oczekiwana logika**: brak akcji edycji — test dokumentacyjny (luka, patrz Niepewności).
- **Priorytet**: P2

## Maintenance — MWO (maintenance, mwos/[id])

### SFQ-158: Graf przejść MWO
- **Co sprawdza**: `requested→cancelled`, `approved→cancelled`, `open→in_progress|cancelled`, `in_progress→completed|cancelled`; completed/cancelled terminalne.
- **Kroki**: 1) każde nielegalne przejście (np. open→completed).
- **Oczekiwana logika**: `LEGAL_TRANSITIONS` (`mwo-actions.ts:105-112`); enforce `transitionMwo` (:1283-1400) FOR UPDATE (:1314) + re-assert from-state w UPDATE (:1361,1368-1372).
- **Priorytet**: P0

### SFQ-159: Timestampy przejść — started_at / completed_at / actual_duration_min
- **Co sprawdza**: Side-effecty transition.
- **Kroki**: 1) start; 2) complete z completion_notes; 3) cancel innego z reason.
- **Oczekiwana logika**: in_progress→`started_at` (:1349); completed→`completed_at`+duration z started_at (:1350-1355)+notes (:1356); cancelled→`cancellation_reason` (:1357).
- **Priorytet**: P1

### SFQ-160: Create MWO — zawsze open/reactive; numeracja MWO-YYYY-NNNNN
- **Co sprawdza**: Insert i race numeracji.
- **Kroki**: 1) create; 2) 5 równoległych create.
- **Oczekiwana logika**: state `open`, type `reactive` (:824); advisory lock `mwo_number:` (:423-438); perm `mnt.mwo.request` (:761).
- **Priorytet**: P0

### SFQ-161: Edycja MWO tylko przed startem
- **Co sprawdza**: `EDITABLE_MWO_STATES=['requested','approved','open']`.
- **Kroki**: 1) update MWO in_progress.
- **Oczekiwana logika**: `invalid_transition` (:96,904-910, WHERE `state=any` :970,983-989).
- **Priorytet**: P0

### SFQ-162: Uprawnienia MWO — execute vs cancel
- **Co sprawdza**: start/complete=`mnt.mwo.execute`, cancel=`mnt.mwo.cancel`, create/update=`mnt.mwo.request`, read=`mnt.asset.read`.
- **Kroki**: 1) każda akcja bez właściwego uprawnienia.
- **Oczekiwana logika**: `mwo-actions.ts:62-67, 1291-1293, 538, 598`.
- **Priorytet**: P0

### SFQ-163: Equipment/line fallback przy create
- **Co sprawdza**: Auto-projekcję aktywnej production_line do equipment.
- **Kroki**: 1) create MWO z id linii produkcyjnej; 2) z random id (not_found).
- **Oczekiwana logika**: `mwo-actions.ts:775-811, 921-957`.
- **Priorytet**: P2

## Maintenance — LOTO (dual-sign)

### SFQ-164: LOTO lockout — gate, stan open, e-sign
- **Co sprawdza**: `verifyMwoLotoLockout`.
- **Kroki**: 1) lockout na equipment bez requires_loto (fail); 2) w stanie in_progress (fail); 3) poprawny z e-sign `mnt.loto.lockout`; 4) 2× (already recorded).
- **Oczekiwana logika**: `mwo-actions.ts:1057-1156`; perm `mnt.loto.apply` (:1064); guardy :1090-1104; null-guard UPDATE `zero_energy_verified_by is null` (:1126).
- **Priorytet**: P0

### SFQ-165: LOTO gating przejść MWO
- **Co sprawdza**: open→in_progress wymaga aktywnego lockoutu; in_progress→completed wymaga release (gdy requires_loto).
- **Kroki**: 1) start bez lockoutu (`loto_not_verified`); 2) complete bez release.
- **Oczekiwana logika**: `transitionMwo` :1328-1344; helpery :313-334.
- **Priorytet**: P0

### SFQ-166: LOTO release — distinct actor (loto_same_actor)
- **Co sprawdza**: Podpisujący release ≠ weryfikator lockoutu.
- **Kroki**: 1) release tym samym userem co lockout; 2) innym userem z `mnt.loto.clear`.
- **Oczekiwana logika**: :1217-1223 → `loto_same_actor`; e-sign `mnt.loto.release` (:1225-1235); wymagany stan in_progress (:1198-1204), aktywny lockout (:1206-1213), idempotencja (:1214-1216, `released_by is null` :1244).
- **Priorytet**: P0

## Maintenance — Kalibracje (maintenance/calibration)

### SFQ-167: Instrument CRUD — walidacje i gate'y
- **Co sprawdza**: Pola (`instrumentCode` 1-64, typ `scale|thermometer|ph_meter|other`, standard, interval 1-3650 dni, range regex), dup→conflict, deactivate/reactivate.
- **Kroki**: 1) create/update/deactivate/reactivate; 2) dup kod; 3) interval=0 i 4000.
- **Oczekiwana logika**: `calibration-schemas.ts:3-4,12-16,24-32`; create/update/reactivate `mnt.asset.edit` (:281,342,433), deactivate `mnt.asset.deactivate` (:399); conflict (:315-317).
- **Priorytet**: P1

### SFQ-168: recordCalibration PASS — next_due_date = calibratedAt + interval
- **Co sprawdza**: Wzór terminu.
- **Kroki**: 1) PASS z interval=365; 2) sprawdź next_due; 3) PASS na nieaktywnym instrumencie → reaktywacja.
- **Oczekiwana logika**: `computeNextDueDate` (`calibration-actions.ts:82-86,516-518`); reaktywacja (:606-616); outbox `maintenance.calibration.completed` (:618-638); perm `mnt.calib.record` (:478); rejestr sortowany `next_due_date asc nulls last` z latest record per instrument (`list-calibration.ts:108-117`), gate `mnt.asset.read` (:80).
- **Priorytet**: P0

### SFQ-169: FAIL/OUT_OF_SPEC — instrument out-of-service, next_due=calibratedAt
- **Co sprawdza**: Side-effect niezgodności.
- **Kroki**: 1) record FAIL; 2) sprawdź `active=false` i next_due; 3) record FAIL na już nieaktywnym (fail — wymaga active); 4) outbox failed.
- **Oczekiwana logika**: `isFailureResult` (:92-94); active=false (:596-605); next_due=calibratedAt (:516-517); guard aktywności przy fail (:508-514); `maintenance.calibration.failed`.
- **Priorytet**: P0

### SFQ-170: Dual e-sign kalibracji — SoD + walidacja reviewera + hash match
- **Co sprawdza**: CFR-21 Part 11 flow.
- **Kroki**: 1) reviewer==calibrator (`sod_violation`, case-insensitive); 2) reviewer bez `mnt.calib.record` (fail); 3) nieaktywny reviewer; 4) złe hasło (`esign_failed`) → rollback całego rekordu; 5) poprawny dual-sign → oba signature_id zapisane.
- **Oczekiwana logika**: `dualSign` intent `mnt.calib.record` (:545-558); SoD (:521-527); `assertActiveCalibrationReviewer` (:114-172, super-role `owner|admin|org_admin` :66); hash-match obu receiptów (`calibration-esign.ts:40-74`, :56-61); FK do `e_sign_log` (:563-592); rollback (nagłówek :20-21, mapping :174-182,664-668).
- **Priorytet**: P0

### SFQ-171: Przeterminowana kalibracja NIE blokuje inspekcji/CCP (udokumentowany brak)
- **Co sprawdza**: Brak runtime-gate'u na overdue instrument w quality.
- **Kroki**: 1) instrument overdue; 2) wykonaj inspekcję/odczyt CCP.
- **Oczekiwana logika**: przechodzi — zero referencji do `calibration_*`/`requires_calibration` w quality (grep-verified); overdue widoczne tylko w rejestrze + generuje MWO `calibration_alert`. Test dokumentuje lukę.
- **Priorytet**: P1

### SFQ-172: calibratedAt w przyszłości — odrzucone
- **Co sprawdza**: Guard daty.
- **Kroki**: 1) record z datą jutrzejszą.
- **Oczekiwana logika**: `isFutureCalibratedAt` (:96-105,500-506).
- **Priorytet**: P1

## Maintenance — PM scheduling

### SFQ-173: PM due → generacja MWO (idempotentna)
- **Co sprawdza**: Nocny cron + ręczne generate.
- **Kroki**: 1) schedule calendar_days z next_due w oknie warning (7 dni); 2) run engine 2×; 3) sprawdź 1 MWO.
- **Oczekiwana logika**: due gdy `next_due_date <= current_date + warning_days` (`pm-mwo-generate.ts:161-168`; cron tylko calendar_days :238-247); idempotencja: advisory lock + max 1 MWO w `requested|approved|open|in_progress` → `already_open` (:27-33,174-192); typ MWO = scheduleType, priorytet high dla calibration else medium, source `calibration_alert`/`pm_schedule` (:60-66,196); perm generate `mnt.mwo.request` (`mwo-actions.ts:1024`).
- **Priorytet**: P0

### SFQ-174: Complete PM-MWO → roll-forward next_due_date
- **Co sprawdza**: `advancePmScheduleOnMwoCompletion`.
- **Kroki**: 1) complete MWO z pm_schedule; 2) sprawdź `last_completed_at` i next_due += interval_value dni.
- **Oczekiwana logika**: `pm-mwo-generate.ts:294-317`; wywołanie z transition (`mwo-actions.ts:1374-1380`) tylko dla planned source.
- **Priorytet**: P0

### SFQ-175: PM NIE wpływa na scheduler produkcji (udokumentowany brak)
- **Co sprawdza**: Brak rezerwacji equipmentu/okien PM w planningu.
- **Kroki**: 1) due PM na linii; 2) zaplanuj WO na tę linię.
- **Oczekiwana logika**: planowanie przechodzi — zero referencji `maintenance_*`/`pm_schedule` w `L/planning`/`L/production` (grep-verified). Test dokumentuje lukę.
- **Priorytet**: P2

## Cross-cutting — RLS, uprawnienia, spójność

### SFQ-176: RLS org-izolacja — próbkowanie wszystkich 4 modułów
- **Co sprawdza**: User org-B nie odczyta/nie zmutuje rekordów org-A po bezpośrednich ID.
- **Kroki**: 1) dla SO, shipment, RMA, hold, NCR, inspekcja, CCP, complaint, spec, MWO, instrument, item_wac_state — GET/mutacja cross-org.
- **Oczekiwana logika**: `withOrgContext`/`withSiteContext` + RLS `org_id=app.current_org_id()` → not_found/pusty; nigdy dane obce, nigdy 500 z leakiem.
- **Priorytet**: P0

### SFQ-177: Site-scope odczytów — quality/valuation/shipping
- **Co sprawdza**: `app.current_site_id()` jako filtr (valuation :73-75, NCR list :322-323, delivery note).
- **Kroki**: 1) user przypięty do site-A; 2) dane site-B.
- **Oczekiwana logika**: niewidoczne; trace → `scopeLimited` (SFQ-148).
- **Priorytet**: P0

### SFQ-178: Rozjazd UI-probe vs server-gate dla super-ról
- **Co sprawdza**: Znany diverge: probes `can-*` (can-release, can-decide, can-edit-ccp, can-edit-plan, can-resolve-deviation, can-manage-complaints, can-view-trace, cold-chain hasReadPermission) NIE uwzględniają fallbacku SUPER_ROLE/platform-admin, który ma `hasPermission` (`L/auth/has-permission.ts:14-38`).
- **Kroki**: 1) user `owner` bez explicit permission; 2) sprawdź: przycisk ukryty, ale server action przechodzi.
- **Oczekiwana logika**: aktualnie: UI false / server OK — test dokumentuje niespójność do decyzji ownera.
- **Priorytet**: P1

### SFQ-179: Fail-closed wszystkich probe'ów uprawnień
- **Co sprawdza**: Probes zwracają false przy błędzie DB, nie rzucają do renderu.
- **Kroki**: 1) symuluj błąd zapytania roli.
- **Oczekiwana logika**: `can-release.ts:16-38` i analogiczne; `getMwoPermissions`/`getAssetPermissions`/`getCalibrationPermissions` fail-closed.
- **Priorytet**: P1

### SFQ-180: E-sign — atomiczność transakcji przy błędzie podpisu
- **Co sprawdza**: Że nieudany e-sign (złe hasło/policy) cofa CAŁĄ mutację we wszystkich flow: hold release, NCR close, inspection decide, deviation resolve, CAPA close, spec approve, HACCP activate, BOL, POD, cancel/unpack/void, LOTO, kalibracja.
- **Kroki**: 1) dla każdego flow: wywołaj ze złym hasłem; 2) sprawdź brak zmiany stanu i brak sierocych wierszy.
- **Oczekiwana logika**: e-sign wewnątrz `withOrgContext` txn — throw → rollback (np. `calibration-actions.ts:20-21`; hold `ESignPolicyError` :107-112).
- **Priorytet**: P0

### SFQ-181: Outbox/audit — emisje zdarzeń kluczowych flow
- **Co sprawdza**: `warehouse.lp.shipped`, `shipping.pod.recorded`, `shipping.rma.processed`, `quality.ncr.opened`, `maintenance.loto.applied/released`, `maintenance.calibration.completed/failed`, `FINANCE_WAC_UNDERFLOW`.
- **Kroki**: 1) wykonaj każdy flow; 2) sprawdź outbox/audit.
- **Oczekiwana logika**: referencje w testach powyżej (SFQ-042/046/065/116/164/168/169/070).
- **Priorytet**: P1

### SFQ-182: Spójność księgowa E2E: receive → produce → ship → cancel → valuation
- **Co sprawdza**: Integralny tor WAC przez moduły — suma wartości w `item_wac_state` odpowiada historii ruchów, valuation zgadza się z LP×avg.
- **Kroki**: 1) przyjmij 100 kg @2; 2) wyprodukuj FG (konsumpcja + output); 3) ship część; 4) cancel shipmentu; 5) raport valuation.
- **Oczekiwana logika**: superpozycja wzorów SFQ-067/068/076/050/079; brak driftu wartości (clamp nie odpalił, outbox anomalii pusty).
- **Priorytet**: P0

---

## Niepewności

1. **RMA disposition bez efektu inwentarzowego/WAC** — `processRma` tylko zapisuje dyspozycję (`rma-actions.ts:549-585`); `restock` NIE tworzy LP ani nie kredytuje WAC. Nie wiem, czy to celowe (etap mig508) czy brakująca implementacja — SFQ-066 jako test dokumentujący; wymaga decyzji ownera.
2. **Brak credit checku** — `credit_limit_gbp` przechowywany, nigdy egzekwowany (SFQ-024). Feature czy luka?
3. **PII klientów** — brak dedykowanego uprawnienia PII i maskowania pól; gate to ogólne `ship.dashboard.view`. Zadanie wspomina „PII permission-gate niedawno naprawiane" — w kodzie nie znalazłem osobnego gate'a PII; jeśli fix był gdzie indziej (np. API route poza modułem), sekcja SFQ-055 może wymagać rozszerzenia.
4. **api/quality** — w zadaniu wskazano `finance/api/quality`; w drzewie modułu finance nie ma katalogu `api/quality` (finance ma tylko page/valuation/_actions). Jeśli istnieje `apps/web/app/api/quality/**` (route handlers), nie został pokryty — do doszczegółowienia.
5. **Overdue kalibracja nie blokuje quality** (SFQ-171) i **PM nie wpływa na scheduler** (SFQ-175) — potwierdzone grepem braki sprzężeń; testy dokumentują stan, nie oczekiwany target.
6. **AQL** — brak jakiegokolwiek próbkowania AQL w inspekcjach; parametry to ręczna lista pass/fail. Jeśli spec biznesowy wymaga AQL — to luka funkcjonalna, nie testowa.
7. **Advisory lock N-FIN-3** — w samych postingach WAC guardem jest row-level `FOR UPDATE` na `item_wac_state`, nie `pg_advisory_lock`; advisory locki są w rejestracji outputu (batch/genealogy). Jeśli finding N-FIN-3 wymagał advisory locka w upsert-wac — obecna implementacja używa równoważnego row-locka (SFQ-074 weryfikuje efekt).
8. **Status `exception` shipmentu** — zadeklarowany, żaden writer go nie ustawia (`so-transitions.ts:22`) — martwy stan, nietestowalny E2E.
9. **Waluty** — system de facto single-currency GBP (WAC, WO cost, SO linie); `ALLOWED_CURRENCIES` w cenach klienta dopuszcza USD/EUR/PLN, ale te ceny nigdy nie są konwertowane (tylko hint). „Currency fix niedawno" interpretuję jako twarde odrzucanie nie-GBP (SFQ-075/087) — jeśli fix dotyczył czegoś innego, doprecyzować.
10. **Brak update/deactivate equipmentu** (SFQ-157) — slice celowo minimalny wg komentarzy w kodzie.


---
<a id="sekcja-f"></a>
# Katalog testów — Dział F: NPD + Settings/Auth/Admin + Dashboard/Reporting/Multi-site

> Aplikacja: monopilot-kira (ERP produkcji spożywczej; Next.js App Router + Supabase/Postgres, multi-tenant `org_id` + RLS przez `app.current_org_id()`).
> Zakres: pipeline NPD (Kanban/gate'y), costing WIP, formulacje/wersjonowanie, allergen-cascade, users/roles/invite, login/MFA/SAML/session, onboarding, GDPR, reference data, schema wizard, security settings, reporting/multi-site.
> Wszystkie ścieżki względem `/Users/mariuszkrawczyk/Projects/monopilot-kira`.
> ID testów: **NSA-001 … NSA-180** (180 testów). Priorytety: P0 (krytyczne — bezpieczeństwo/dane/pieniądze/compliance), P1 (ważna logika), P2 (edge/UX).

---

## A. NPD Pipeline — stage'y i gate'y (`app/(npd)/pipeline`)

Model stanu (`app/(npd)/pipeline/_actions/_lib/gate-helpers.ts:28-99`):
STAGE_ORDER = `brief → recipe → packaging → costing_nutrition → trial → sensory → pilot → approval → handoff` (+ terminal `launched`) (`:53-63`).
Gate'y = `G0, G1, G2, G3, G4, Launched` (`:26`). `current_stage` jest autorytatywny, `current_gate` derywowany z `GATE_BY_STAGE` (`:76-86`). `brief` trzyma G0 albo G1.

### NSA-001: Sekwencja gate'ów — jeden krok na raz
- **Co sprawdza**: nie można przeskoczyć gate'u (np. G0→G3).
- **Kroki**: 1) Projekt w G0+brief. 2) advanceProjectGate z targetStage odpowiadającym G3.
- **Oczekiwana logika**: `assertHonestGateAdvance` rzuca `GATE_SEQUENCE_VIOLATION` (422); `nextHonestGate` dopuszcza tylko G0→G1→…→Launched (`gate-helpers.ts:254-309`).
- **Priorytet**: P0

### NSA-002: Adjacencja stage'ów — brak pomijania
- **Co sprawdza**: target musi być dokładnie następnym stage'em.
- **Kroki**: 1) Projekt w `recipe`. 2) advance do `trial` (pomija packaging/costing_nutrition).
- **Oczekiwana logika**: `assertAdjacentStage` rzuca `ADJACENCY_VIOLATION` (422) (`gate-helpers.ts:133-137`, `nextStage :124-130`).
- **Priorytet**: P0

### NSA-003: G0+brief → gate-only advance do G1 (stage zostaje brief)
- **Co sprawdza**: przejście G0→G1 nie zmienia stage'a.
- **Kroki**: 1) Projekt G0+brief. 2) advance.
- **Oczekiwana logika**: `resolveAdvanceTransition` — G0+brief daje gate-only G1, stage nadal `brief` (`gate-helpers.ts:347-369`).
- **Priorytet**: P1

### NSA-004: G1+brief → stage step do recipe/G2
- **Co sprawdza**: drugi advance z brief przechodzi stage do recipe i gate do G2.
- **Kroki**: 1) Projekt G1+brief. 2) advance.
- **Oczekiwana logika**: `resolveAdvanceTransition` przechodzi na recipe/G2.
- **Priorytet**: P1

### NSA-005: Niespójna para gate/stage odrzucona
- **Co sprawdza**: rozjazd current_gate vs current_stage.
- **Kroki**: 1) Ustaw ręcznie (DB) projekt recipe+G3. 2) advance.
- **Oczekiwana logika**: `assertGateStageConsistent` rzuca `GATE_STATE_MISMATCH` (409) (`gate-helpers.ts:240-248`); `expectedGateForStagePair` zwraca null (`:113-121`).
- **Priorytet**: P1

### NSA-006: Advance projektu terminalnego (launched)
- **Co sprawdza**: nie można advance'ować launched.
- **Kroki**: 1) Projekt `launched`. 2) advance.
- **Oczekiwana logika**: short-circuit `ALREADY_CLOSED` (409) (`advance-project-gate.ts:288-290`).
- **Priorytet**: P1

### NSA-007: Brak uprawnienia npd.gate.advance
- **Co sprawdza**: RBAC na advance.
- **Kroki**: 1) User bez `npd.gate.advance`. 2) advanceProjectGate.
- **Oczekiwana logika**: `requireActionPermission` → `FORBIDDEN` (403) (`advance-project-gate.ts:281`, `gate-helpers.ts:464-468`).
- **Priorytet**: P0

### NSA-008: HARD blocker — leaving recipe bez składników
- **Co sprawdza**: nie można opuścić recipe bez ≥1 składnika w bieżącej wersji.
- **Kroki**: 1) Projekt w recipe, wersja bez składników. 2) advance do packaging.
- **Oczekiwana logika**: `getBlockers` → `RECIPE_INGREDIENTS_REQUIRED`; HARD_BLOCKED → 409 `BLOCKERS_PRESENT` (`gate-helpers.ts:568-576`, `advance-project-gate.ts:308-315`).
- **Priorytet**: P0

### NSA-009: SOFT gate blocked bez override
- **Co sprawdza**: brakujące soft-signale blokują advance dopóki nie ma override.
- **Kroki**: 1) Projekt z niespełnionym soft-gate. 2) advance bez override.
- **Oczekiwana logika**: `SOFT_GATE_BLOCKED` (409) z listą `missing[]` (`advance-project-gate.ts` — evaluateStageGate `:236-272`).
- **Priorytet**: P1

### NSA-010: SOFT gate override — audyt zapisany
- **Co sprawdza**: override z notatką odblokowuje i pisze audyt.
- **Kroki**: 1) Soft-gate blocked. 2) advance z `override.note`.
- **Oczekiwana logika**: przejście PASS + `writeGateOverrideAudit` action `npd.stage.gate_overridden` (`advance-project-gate.ts:209-234`).
- **Priorytet**: P1

### NSA-011: E-sign G3→G4 (pilot→approval) wymagany
- **Co sprawdza**: crossing do G4 wymaga podpisanej aprobaty G3.
- **Kroki**: 1) Projekt pilot/G3 bez gate_approvals G3. 2) advance do approval.
- **Oczekiwana logika**: `assertG3ESignForApproval` → `ESIGN_REQUIRED` (403); wymaga wiersza `gate_approvals` gate_code='G3', decision='approved', `esigned_at` i `esign_hash` non-null (`gate-helpers.ts:519-535`).
- **Priorytet**: P0

### NSA-012: E-sign G4 (approval→handoff) wymagany
- **Co sprawdza**: BRCGS/CFR-21 checkpoint na handoff.
- **Kroki**: 1) Projekt approval/G4 bez podpisu G4. 2) advance do handoff.
- **Oczekiwana logika**: `assertG4ESignForHandoff` → `ESIGN_REQUIRED` (403) (`gate-helpers.ts:495-511`).
- **Priorytet**: P0

### NSA-013: FG candidate tworzony przy wejściu w packaging
- **Co sprawdza**: FG candidate powstaje idempotentnie przy wejściu w G3.
- **Kroki**: 1) Projekt recipe→packaging advance. 2) Powtórz advance/retry.
- **Oczekiwana logika**: `createFgCandidate` tworzy FG jako candidate, idempotentny; backfill do `product`, `formulations`, `items.npd_project_id`, draft `factory_specs` (`gate-helpers.ts:828-917, 979-1023`).
- **Priorytet**: P1

### NSA-014: FG już powiązany z innym projektem
- **Co sprawdza**: konflikt mapowania FG.
- **Kroki**: 1) FG powiązany z aktywnym projektem A. 2) Projekt B advance do packaging z tym samym FG.
- **Oczekiwana logika**: `FG_ALREADY_LINKED` blocker (`gate-helpers.ts:580-588, findFgConflict :1233-1249`).
- **Priorytet**: P1

### NSA-015: Launch compliance gate (handoff→launched)
- **Co sprawdza**: launch blokuje na pending required criteria.
- **Kroki**: 1) Projekt handoff, C1/C5/C7 pending. 2) advance do launched.
- **Oczekiwana logika**: `getLaunchComplianceBlockers` → `LAUNCH_COMPLIANCE_BLOCKED`; pending required criteria blokują, warn nie (`gate-helpers.ts:602-652`).
- **Priorytet**: P0

### NSA-016: Launch bez product_code
- **Co sprawdza**: brak zmapowanego FG blokuje launch.
- **Kroki**: 1) Projekt handoff bez product_code. 2) advance do launched.
- **Oczekiwana logika**: `LAUNCH_COMPLIANCE_BLOCKED` "Map a finished-good product before launch" (`gate-helpers.ts:606-613`).
- **Priorytet**: P1

### NSA-017: Launch wymaga ≥1 ważnego compliance doc niezależnie od config C7
- **Co sprawdza**: nawet gdy C7 not_required, brak dokumentów blokuje launch.
- **Kroki**: 1) Org z C7=not_required w `npd_approval_criterion_config`, 0 valid docs. 2) advance do launched.
- **Oczekiwana logika**: wymuszony C7 przy 0 non-deleted/non-expired docs (`gate-helpers.ts:630-640`).
- **Priorytet**: P0

### NSA-018: approveProjectGate — approve wymaga hasła
- **Co sprawdza**: schemat discriminated — approve wymaga `password`, reject nie.
- **Kroki**: 1) approveProjectGate approve bez password. 2) reject bez password.
- **Oczekiwana logika**: approve bez password → invalid; reject dozwolony bez (`approve-project-gate.ts:35-50`).
- **Priorytet**: P0

### NSA-019: approveProjectGate — GATE_MISMATCH
- **Co sprawdza**: gateCode musi zgadzać się z derywowanym gate'em projektu.
- **Kroki**: 1) Projekt w G3. 2) approve z gateCode='G4'.
- **Oczekiwana logika**: `GATE_MISMATCH` (409) (`approve-project-gate.ts:80-82`).
- **Priorytet**: P1

### NSA-020: approveProjectGate — brak npd.gate.approve
- **Co sprawdza**: RBAC na approve.
- **Kroki**: 1) User bez uprawnienia. 2) approve.
- **Oczekiwana logika**: FORBIDDEN (403) (`approve-project-gate.ts:74`).
- **Priorytet**: P0

### NSA-021: Podpis e-sign zapisuje esigned_at + esign_hash
- **Co sprawdza**: approve tworzy immutable e-sign w gate_approvals.
- **Kroki**: 1) approve G4 z poprawnym hasłem. 2) Sprawdź gate_approvals.
- **Oczekiwana logika**: signEvent tylko na approve; wiersz z `esigned_at`/`esign_hash` (`approve-project-gate.ts:102-122`).
- **Priorytet**: P0

### NSA-022: approvalTargetStage — G3 tylko pilot→approval, G4 tylko approval→handoff
- **Co sprawdza**: aprobata nie może advance'ować niewłaściwego stage'a.
- **Kroki**: 1) approve G3 na projekcie nie-pilot. 2) approve G4 na nie-approval.
- **Oczekiwana logika**: `approvalTargetStage` ogranicza (`approve-project-gate.ts:203-207`).
- **Priorytet**: P1

### NSA-023: revertNpdGate wymaga admina
- **Co sprawdza**: rollback gate'u tylko dla admina.
- **Kroki**: 1) Non-admin wywołuje revertNpdGate. 2) Admin.
- **Oczekiwana logika**: `requireAdmin` → FORBIDDEN (403) dla non-admin (`gate-helpers.ts:470-484`; `revert-npd-gate.ts`).
- **Priorytet**: P1

### NSA-024: Advance karty NIE bezpośrednio z Kanban (F-C08)
- **Co sprawdza**: przycisk "Advance →" routuje do modala, nie wywołuje akcji.
- **Kroki**: 1) Kanban, klik Advance. 2) Sprawdź brak bezpośredniego wywołania.
- **Oczekiwana logika**: routing do `?modal=advanceGate` (`kanban-view.tsx:130-135`).
- **Priorytet**: P2

### NSA-025: Kanban bucketuje po current_stage
- **Co sprawdza**: kolumny wg stage'a (komentarz mówi gate — stale).
- **Kroki**: 1) Projekty w różnych stage'ach. 2) Sprawdź przypisanie kolumn.
- **Oczekiwana logika**: bucket po `normalizeStage(currentStage)`, fallback unknown→brief (`kanban-view.tsx:173-176`, `kanban-types.ts:75-77`).
- **Priorytet**: P2

### NSA-026: Cross-org — projekt innego org niewidoczny/niedostępny
- **Co sprawdza**: RLS org-scoping na npd_projects.
- **Kroki**: 1) User org A wywołuje advance na projekcie org B.
- **Oczekiwana logika**: `loadProjectForUpdate` filtruje `org_id = app.current_org_id()` → `NOT_FOUND` (404) (`gate-helpers.ts:537-549`).
- **Priorytet**: P0

### NSA-027: releaseToFactory — preflight blockers
- **Co sprawdza**: release do Technical blokuje gdy warunki niespełnione.
- **Kroki**: 1) Projekt nie-G4 / bez FG / z open high risk / bez active BOM / bez factory spec. 2) releaseToFactory.
- **Oczekiwana logika**: blockery `LAUNCHED_IS_TERMINAL, G4_REQUIRED, FG_CANDIDATE_REQUIRED, V18_OPEN_HIGH_RISK, ACTIVE_SHARED_BOM_REQUIRED, FACTORY_SPEC_REQUIRED/MISMATCH` (`builder/_lib/release-preflight.ts:61-203`); perm `npd.gate.approve`.
- **Priorytet**: P0

### NSA-028: releaseToFactory — sfałszowany/obce-org factorySpecId odrzucony
- **Co sprawdza**: F1 security — caller-supplied factorySpecId walidowany.
- **Kroki**: 1) release z factorySpecId z innego org / sfałszowanym UUID.
- **Oczekiwana logika**: `validateSuppliedFactorySpecId` waliduje org + status + FG item_code + BOM header/version (`release-preflight.ts:215-241`).
- **Priorytet**: P0

---

## B. NPD Formulacje — wersjonowanie (`app/(npd)/pipeline/[projectId]/formulation`)

Stany `formulation_versions.state`: `draft → locked → submitted_for_trial`.

### NSA-029: lockVersion — brak npd.formulation.lock
- **Co sprawdza**: RBAC na lock.
- **Kroki**: 1) User bez uprawnienia. 2) lockVersion.
- **Oczekiwana logika**: `forbidden` (`lock-version.ts:43`).
- **Priorytet**: P0

### NSA-030: lockVersion — już locked
- **Co sprawdza**: podwójny lock.
- **Kroki**: 1) Wersja locked. 2) lockVersion.
- **Oczekiwana logika**: `VERSION_LOCKED` (`lock-version.ts:80`).
- **Priorytet**: P1

### NSA-031: lockVersion — wersja nie-draft
- **Co sprawdza**: lock tylko z draft.
- **Kroki**: 1) Wersja `submitted_for_trial`. 2) lockVersion.
- **Oczekiwana logika**: `VERSION_NOT_DRAFT` (`lock-version.ts:81-83`).
- **Priorytet**: P1

### NSA-032: lockVersion — total pct poza zakresem
- **Co sprawdza**: suma % składników musi być w dopuszczalnym zakresie.
- **Kroki**: 1) Wersja gdzie Σqty_kg/batch_size_kg×100 poza zakresem. 2) lockVersion.
- **Oczekiwana logika**: `TOTAL_PCT_OUT_OF_RANGE` — `isTotalPctValid(actual_total_pct)`; pct = `Σqty_kg / batch_size_kg × 100` (`lock-version.ts:51-57, 84`).
- **Priorytet**: P0

### NSA-033: lockVersion — brakujący koszt składnika
- **Co sprawdza**: każdy składnik ma cost_per_kg_eur.
- **Kroki**: 1) Wersja ze składnikiem `cost_per_kg_eur IS NULL`. 2) lockVersion.
- **Oczekiwana logika**: `MISSING_COST` (`lock-version.ts:58-59, 85`).
- **Priorytet**: P0

### NSA-034: lockVersion — brakujący target nutrition
- **Co sprawdza**: wymagane NUTRIENT_CODES obecne w calc_cache.
- **Kroki**: 1) Wersja bez pełnego nutrition_json. 2) lockVersion.
- **Oczekiwana logika**: `MISSING_NUTRITION_TARGET` (`lock-version.ts:60-67, 86-88`).
- **Priorytet**: P1

### NSA-035: lockVersion — sukces kaskaduje recipe_components na product
- **Co sprawdza**: lock zapisuje locked_at/locked_by, kaskaduje recipe_components/ingredient_codes.
- **Kroki**: 1) Poprawna draft. 2) lockVersion.
- **Oczekiwana logika**: state=locked, `formulations.locked_at=now(), locked_by_user`; update `product.recipe_components/ingredient_codes`; audit `formulation.locked` + outbox (`lock-version.ts:90-158`).
- **Priorytet**: P1

### NSA-036: lockVersion — row lock (concurrency)
- **Co sprawdza**: `for update of f, fv` serializuje równoległe locki.
- **Kroki**: 1) Dwa równoległe lockVersion tej samej wersji.
- **Oczekiwana logika**: drugi widzi state=locked → `VERSION_LOCKED` (`lock-version.ts:74`).
- **Priorytet**: P1

### NSA-037: unlockVersion — wymaga PIN e-sign
- **Co sprawdza**: unlock wymaga podpisu.
- **Kroki**: 1) unlockVersion bez/ze złym PIN.
- **Oczekiwana logika**: `esign_failed` przy błędnym signEvent (intent `formulation.unlocked`) (`unlock-version.ts:63-81`); perm `npd.formulation.unlock`.
- **Priorytet**: P0

### NSA-038: unlockVersion — nie-locked
- **Co sprawdza**: unlock tylko z locked.
- **Kroki**: 1) Wersja draft. 2) unlockVersion.
- **Oczekiwana logika**: `VERSION_NOT_LOCKED` (`unlock-version.ts:61`); reset state→draft, clear locked_at/locked_by.
- **Priorytet**: P1

### NSA-039: unlockVersion — brak outbox (audit gap)
- **Co sprawdza**: znany TODO(A6) — unlock nie emituje outbox.
- **Kroki**: 1) unlockVersion sukces. 2) Sprawdź outbox_events.
- **Oczekiwana logika**: brak eventu (`unlock-version.ts:106`) — kandydat na lukę audytu.
- **Priorytet**: P2

### NSA-040: submitForTrial — wymaga locked
- **Co sprawdza**: submit tylko z locked.
- **Kroki**: 1) Wersja draft. 2) submitForTrial.
- **Oczekiwana logika**: `VERSION_NOT_LOCKED` (`submit-for-trial.ts:65`); perm `npd.recipe.submit_for_trial`.
- **Priorytet**: P1

### NSA-041: submitForTrial — re-waliduje pct/cost/nutrition i tworzy T-1
- **Co sprawdza**: powtórna walidacja + utworzenie trial_batches.
- **Kroki**: 1) Locked wersja. 2) submitForTrial.
- **Oczekiwana logika**: te same guardy pct/cost/nutrition; tworzy T-1 trial_batches jeśli brak; state locked→submitted_for_trial (`submit-for-trial.ts:67-106`).
- **Priorytet**: P1

### NSA-042: Cost-readiness po locku wymaga recompute
- **Co sprawdza**: costing_nutrition→trial soft gate — breakdown target musi być liczony PO locku.
- **Kroki**: 1) Lock wersji. 2) Bez recompute próba advance costing_nutrition→trial. 3) Recompute i ponów.
- **Oczekiwana logika**: `checkCostingNutritionReady` — `costing_breakdowns` scenario target `computed_at >= locked_at` AND `current_version_id = locked_version_id`; nutrition `formulation_version_id = locked_version_id` (`gate-helpers.ts:654-721`).
- **Priorytet**: P0

### NSA-043: Cross-org lock/formulation odrzucona
- **Co sprawdza**: org-scoping formulacji.
- **Kroki**: 1) User org A lockuje wersję projektu org B.
- **Oczekiwana logika**: query filtruje `f.org_id = app.current_org_id()` → `not_found` (`lock-version.ts:71-72`).
- **Priorytet**: P0

---

## C. NPD Costing — matematyka WIP (`apps/web/lib/npd/wip-cost.ts`, `lib/costing/compute-waterfall.ts`)

**Kanoniczny wzór WIP** (`wip-cost.ts:6-8, 311-330`):
```
unit_cost = (materials + process_labour + setup) / yield
materials = Σ(qtyPerUnit × unitCost)
crewRate  = Σ(rolePerHour × headcount)
yieldFactor = yieldPct/100  (1 gdy brak / 0 / >100)
```
**Model 3-podstawowy (NIE mieszać)**: rollup = **net** (qty×unitCost, bez waste/scrap); waterfall packaging = **×(1+waste_pct)** (`compute-waterfall.ts:427-433`); WO/MRP = **÷(1−scrap_pct)** (`bom_lines.scrap_pct`, poza tym plikiem).

### NSA-044: Process labour — ścieżka throughput
- **Co sprawdza**: gdy throughput>0: `crewRate/throughput + additional/(throughput×duration)`.
- **Kroki**: 1) Proces throughput=200, duration=5, crewRate, additional. 2) Policz.
- **Oczekiwana logika**: `crewRate.div(throughput).add(additional.div(throughput×duration))` (`wip-cost.ts:119-123`).
- **Priorytet**: P0

### NSA-045: Process labour — ścieżka duration-only
- **Co sprawdza**: gdy throughput=0: `(crewRate×duration + additional) / batchOutputKg`.
- **Kroki**: 1) Proces bez throughput, z duration. 2) Policz.
- **Oczekiwana logika**: `batchCost.div(safeBatchKg)`; batchKg inferowane z throughput×duration innych kroków (`wip-cost.ts:125-127, inferWipBatchOutputKgDec :78-92`).
- **Priorytet**: P0

### NSA-046: inferWipBatchOutputKg — wybór maksymalnego kg-kroku
- **Co sprawdza**: batchKg = max(throughput×duration) po krokach w kg; fallback 1.
- **Kroki**: 1) Kilka kroków, różne uom. 2) Policz batchKg.
- **Oczekiwana logika**: uwzględnia tylko uom='kg', bierze największy kandydat, zero→1 (`wip-cost.ts:78-92`).
- **Priorytet**: P1

### NSA-047: Setup amortization
- **Co sprawdza**: `setup × runsPerWeek / weeklyVolumePacks / wipQtyPerFgPack`.
- **Kroki**: 1) Setup=100, runs=5, volume=1000, wipQty=2. 2) Policz.
- **Oczekiwana logika**: `setupTotal.mul(runs).div(volume).div(wipQty)` (`wip-cost.ts:293-309`).
- **Priorytet**: P0

### NSA-048: Setup = 0 gdy volume lub wipQty = 0
- **Co sprawdza**: brak dzielenia przez zero.
- **Kroki**: 1) Amortization volume=0. 2) Policz.
- **Oczekiwana logika**: zwraca 0 (`wip-cost.ts:301`).
- **Priorytet**: P1

### NSA-049: Yield factor — walidacja i clamp
- **Co sprawdza**: yield 0 lub >100 lub niepoprawny → factor 1.
- **Kroki**: 1) yieldPct='0', '150', 'abc', '80'. 2) Policz.
- **Oczekiwana logika**: `validYieldFactor` — nie-parsowalny/0/>100 → 1; else pct/100 (`wip-cost.ts:340-347`).
- **Priorytet**: P1

### NSA-050: Cykliczny WIP — missing:true, brak eksplozji
- **Co sprawdza**: cykl w drzewie WIP daje 0 i missing.
- **Kroki**: 1) Drzewo z cyklem A→B→A. 2) computeWipTreeUnitCost.
- **Oczekiwana logika**: visited hit → unitCost 0, `missing:true`; nie zapętla się (`wip-cost.ts:220-227, 237-241`).
- **Priorytet**: P0

### NSA-051: Depth ceiling = 8
- **Co sprawdza**: głębsze drzewa przerywane.
- **Kroki**: 1) Drzewo głębokości 9. 2) computeWipTreeUnitCost.
- **Oczekiwana logika**: `depth > WIP_COST_DEPTH_CEILING(8)` → 0 + missing (`wip-cost.ts:46, 220-227`).
- **Priorytet**: P1

### NSA-052: Missing propaguje przez drzewo
- **Co sprawdza**: resolveChild null / child missing → cała gałąź missing.
- **Kroki**: 1) Leaf bez ceny (null). 2) Policz.
- **Oczekiwana logika**: `missing=true`, wkład 0 (`wip-cost.ts:243-254`).
- **Priorytet**: P1

### NSA-053: nonNegativeDec — ujemne/niepoprawne → 0
- **Co sprawdza**: sanityzacja wejść.
- **Kroki**: 1) qty/koszt ujemny lub nie-liczbowy string. 2) Policz.
- **Oczekiwana logika**: `nonNegativeDec` zwraca 0 dla nie-liczb i wartości <0 (`wip-cost.ts:332-338`).
- **Priorytet**: P1

### NSA-054: Dwie stage'e (raw+labour) sumują się do kanonicznego total
- **Co sprawdza**: remainder alokowany do labour, by yielded_raw + yielded_labour = unitCost.
- **Kroki**: 1) computeWipCostParts. 2) Sprawdź sumę.
- **Oczekiwana logika**: `yieldedProcessLabor = unitCost − yieldedRawMaterial` (`wip-cost.ts:184-187`).
- **Priorytet**: P1

### NSA-055: Waterfall packaging waste_pct (NIE scrap_pct)
- **Co sprawdza**: packaging mnożony przez (1+waste_pct/100).
- **Kroki**: 1) Komponent packaging waste_pct=5. 2) Policz.
- **Oczekiwana logika**: `qtyPerBox × costPerUnit × (1 + wastePct/100)` (`compute-waterfall.ts:427-433`).
- **Priorytet**: P0

### NSA-056: Rollup = net (bez waste/scrap)
- **Co sprawdza**: raw material rollup nie stosuje żadnego czynnika strat.
- **Kroki**: 1) Ingredient qtyKg×costPerKg. 2) Sprawdź brak mnożnika.
- **Oczekiwana logika**: `sumIngredientRawCostPerPack` = Σ(qtyKg×costPerKgEur) net (`compute-waterfall.ts:435-439, 258`).
- **Priorytet**: P0

### NSA-057: Boundary waste/scrap nie mieszane
- **Co sprawdza**: NPD waste_pct (D41) ≠ bom_lines.scrap_pct (WO requisition).
- **Kroki**: 1) Ten sam BOM w costing NPD vs WO. 2) Porównaj czynniki.
- **Oczekiwana logika**: waterfall używa waste_pct ×(1+); WO/MRP używa scrap_pct ÷(1−) — rozdzielne (komentarz `compute-waterfall.ts:427`).
- **Priorytet**: P0

---

## D. NPD Yield / margin / target cost (`lib/costing/compute-waterfall.ts`)

9-krokowy waterfall (`:11-21`): Raw materials, Yield loss, Process labour, Setup, Packaging, Overhead, Logistics, Total cost, Margin vs target.

### NSA-058: Yield loss = raw / (yieldPct/100)
- **Co sprawdza**: krok yield.
- **Kroki**: 1) raw=10, yield=80%. 2) Policz.
- **Oczekiwana logika**: `yielded = raw / 0.8` (`compute-waterfall.ts:169, 271-272`).
- **Priorytet**: P1

### NSA-059: Yield poza (0,100] rzuca
- **Co sprawdza**: bounds yield.
- **Kroki**: 1) yield=0 lub 120. 2) Policz/waliduj.
- **Oczekiwana logika**: throw przy nie w (0,100] (`compute-waterfall.ts:161-163`, Zod `compute.ts:55-57`).
- **Priorytet**: P1

### NSA-060: targetPrice z margin
- **Co sprawdza**: `target = total / (1 − margin/100)`.
- **Kroki**: 1) total=10, margin=20%. 2) Policz.
- **Oczekiwana logika**: `targetPriceFromMargin` (`compute-waterfall.ts:458-461`).
- **Priorytet**: P1

### NSA-061: margin% z target i total
- **Co sprawdza**: `margin% = (target − total)/target × 100`.
- **Kroki**: 1) target=12.5, total=10. 2) Policz.
- **Oczekiwana logika**: `computeMarginPct`; target=0 → 0.0000 (`compute-waterfall.ts:463-466`).
- **Priorytet**: P1

### NSA-062: Status gate margin (fail/warn/ok) na pełnej precyzji
- **Co sprawdza**: status liczony na full-precision, nie po toFixed(4).
- **Kroki**: 1) margin tuż poniżej progu warn. 2) Sprawdź status.
- **Oczekiwana logika**: `computeStatus` — <0 fail, <warn warn, else ok; gate na pełnej precyzji (V07) (`compute-waterfall.ts:468-472, 189-198`).
- **Priorytet**: P1

### NSA-063: Warn threshold z Reference, nie hardcode
- **Co sprawdza**: próg z `costing_margin_warn_pct`.
- **Kroki**: 1) Zmień AlertThresholds. 2) Recompute.
- **Oczekiwana logika**: próg czytany z Reference key `costing_margin_warn_pct` (`compute.ts:120, 195-201`).
- **Priorytet**: P2

### NSA-064: Ujemny margin persystuje ze status='fail' (advisory D10)
- **Co sprawdza**: negatywny margin nie blokuje zapisu, ale flaguje fail.
- **Kroki**: 1) Koszt > target. 2) Compute+save.
- **Oczekiwana logika**: zapis `status='fail'` (advisory) (`compute.ts:206-208`).
- **Priorytet**: P1

### NSA-065: computeCosting — fg_not_mapped / ingredient_costs_missing
- **Co sprawdza**: guardy compute action.
- **Kroki**: 1) Projekt bez FG. 2) Compute. 3) Z brakującym kosztem WIP.
- **Oczekiwana logika**: `fg_not_mapped`; `ingredient_costs_missing` gdy jakikolwiek WIP composition missing (`compute.ts:369-371`); perm `npd.costing`.
- **Priorytet**: P1

### NSA-066: Parytet setup: computeWaterfall (what-if) vs computeNpdCostEngine
- **Co sprawdza**: what-if hardcode setup=0, engine liczy realny setup — potencjalny rozjazd.
- **Kroki**: 1) Ten sam input przez oba wejścia. 2) Porównaj setup.
- **Oczekiwana logika**: `computeWaterfall` setup=0 (`:171`); `computeNpdCostEngine` realny (`:275-277`) — udokumentować rozbieżność.
- **Priorytet**: P2

### NSA-067: get-costing-rollup — mapowanie raw_cost_eur → totalCost
- **Co sprawdza**: dashboard rollup potencjalnie miskolabeluje raw jako total.
- **Kroki**: 1) Projekt z breakdown. 2) Sprawdź wartość totalCost w rollup.
- **Oczekiwana logika**: `raw_cost_eur` mapowane na `totalCost` (`get-costing-rollup.ts:53`) — zweryfikować intencję (raw ≠ total).
- **Priorytet**: P1

---

## E. NPD Allergen cascade (`app/(npd)/fa/[productCode]/allergens`)

Prawo derywacji: **Contains = union(RM allergens) ∪ union(process allergens) + additive overrides; May-contain = precautionary (RM traces + conditional process)** (EU FIC 1169/2011, 14 alergenów) (`fa/[productCode]/_lib/allergen-cascade.tsx:73-74, 55-56`).

### NSA-068: updateFaAllergenSet — perm npd.allergen.write
- **Co sprawdza**: RBAC (role_permissions ORAZ roles.permissions jsonb).
- **Kroki**: 1) User bez uprawnienia. 2) update.
- **Oczekiwana logika**: `FORBIDDEN` (`update-allergen-set.ts:93-113`).
- **Priorytet**: P0

### NSA-069: Cascade idempotentny — emit tylko przy changed
- **Co sprawdza**: brak zmiany nie pisze/revaliduje.
- **Kroki**: 1) update bez zmiany. 2) update ze zmianą.
- **Oczekiwana logika**: persist/revalidate `/npd/fg/{code}/allergens` tylko gdy changed=true (`update-allergen-set.ts:72-74`).
- **Priorytet**: P1

### NSA-070: Cascade — produkt spoza org
- **Co sprawdza**: org-scoping engine.
- **Kroki**: 1) product_code innego org. 2) update.
- **Oczekiwana logika**: engine `update_fa_allergen_set` raise "not found in current org" → NOT_FOUND (`update-allergen-set.ts:63-66`).
- **Priorytet**: P0

### NSA-071: Additive override podnosi Contains
- **Co sprawdza**: override wymusza obecność alergenu w Contains.
- **Kroki**: 1) Override alergenu. 2) Rebuild cascade.
- **Oczekiwana logika**: derivationNote — additive overrides (`allergen-cascade.tsx:73-74`); akcje `submit-allergen-override.ts`.
- **Priorytet**: P1

### NSA-072: Accept declaration — szersza lista uprawnień (C5)
- **Co sprawdza**: accept-declaration dopuszcza npd.allergen.write / accept_declaration / technical.write / quality.write.
- **Kroki**: 1) User z quality.write akceptuje deklarację.
- **Oczekiwana logika**: `DECLARATION_WRITE_PERMISSIONS` OR-lista (`allergen-cascade.tsx:44-49`); ustawia `allergens_declaration_accepted`.
- **Priorytet**: P1

### NSA-073: C5 audited = job LUB declaration accepted
- **Co sprawdza**: kryterium C5 spełnione przez rebuild job albo akceptację.
- **Kroki**: 1) Bez job, z declaration accepted. 2) Evaluate C5.
- **Oczekiwana logika**: `audited = processed allergen_cascade_rebuild_jobs OR allergens_declaration_accepted` (`evaluate-core.ts:151-161, 225-229`).
- **Priorytet**: P1

---

## F. Users / Invite (`apps/web/actions/users/invite.ts`)

### NSA-074: Invite — brak settings.users.invite
- **Co sprawdza**: fail-closed RBAC (permission/code/slug/jsonb).
- **Kroki**: 1) User bez grantu. 2) inviteUser.
- **Oczekiwana logika**: `forbidden` (`invite.ts:95-113`).
- **Priorytet**: P0

### NSA-075: Seat-limit enforcement
- **Co sprawdza**: aktywni ≥ seat_limit blokuje.
- **Kroki**: 1) Org seat_limit=3, 3 aktywnych. 2) inviteUser.
- **Oczekiwana logika**: `seat_limit_exceeded` gdy `seatLimit !== null && activeUserCount >= seatLimit` (`invite.ts:130-146`).
- **Priorytet**: P0

### NSA-076: seat_limit NULL = unlimited
- **Co sprawdza**: brak limitu.
- **Kroki**: 1) Org seat_limit NULL, wielu aktywnych. 2) inviteUser.
- **Oczekiwana logika**: brak blokady (`invite.ts:144`).
- **Priorytet**: P1

### NSA-077: Pending invites NIE konsumują seat (edge)
- **Co sprawdza**: count liczy tylko is_active=true.
- **Kroki**: 1) Org seat_limit=3, 2 aktywnych + 5 pending. 2) inviteUser.
- **Oczekiwana logika**: dozwolone — pending (is_active=false) nie liczone (`invite.ts:136-142`) — potencjalne przekroczenie intencji.
- **Priorytet**: P1

### NSA-078: Invite na istniejący aktywny email
- **Co sprawdza**: nie można zaprosić aktywnego usera.
- **Kroki**: 1) inviteUser na email aktywnego usera.
- **Oczekiwana logika**: `email_taken` (`invite.ts:161-163`).
- **Priorytet**: P1

### NSA-079: Invite na email z innego org
- **Co sprawdza**: cross-org email.
- **Kroki**: 1) Email istnieje w org B, invite z org A.
- **Oczekiwana logika**: `invalid_input` (`invite.ts:157-159`).
- **Priorytet**: P0

### NSA-080: Resend — istniejący inactive z outstanding invite
- **Co sprawdza**: resend odświeża token+expiry.
- **Kroki**: 1) Inactive user z tokenem. 2) inviteUser ponownie.
- **Oczekiwana logika**: UPDATE token/expiry, `{resent:true}` (`invite.ts:172-208, hasOutstandingInvite :52-54`).
- **Priorytet**: P1

### NSA-081: Inactive bez outstanding invite → email_taken
- **Co sprawdza**: inactive bez tokenu (np. zdeaktywowany) nie da się re-zaprosić tą ścieżką.
- **Kroki**: 1) Inactive user bez tokenu. 2) inviteUser.
- **Oczekiwana logika**: `email_taken` (`invite.ts:173-175`).
- **Priorytet**: P1

### NSA-082: Invite — rola z innego org / system role zabroniony
- **Co sprawdza**: rola musi należeć do org i nie być forbidden system default.
- **Kroki**: 1) roleId z org B. 2) rola w SYSTEM_ROLE_CODES_FORBIDDEN_AS_DEFAULT.
- **Oczekiwana logika**: `invalid_input` (`invite.ts:122-127`).
- **Priorytet**: P1

### NSA-083: Invite TTL = 7 dni
- **Co sprawdza**: expiresAt = now + 604800s.
- **Kroki**: 1) inviteUser. 2) Sprawdź expiresAt.
- **Oczekiwana logika**: `INVITE_TTL_SECONDS=604800` (`invite.ts:7, 87`).
- **Priorytet**: P2

### NSA-084: redirectTo SSRF guard
- **Co sprawdza**: redirectTo musi mieć origin = NEXT_PUBLIC_APP_URL.
- **Kroki**: 1) redirectTo na obcy host. 2) inviteUser.
- **Oczekiwana logika**: `invalid_input` (`normalizeRedirectTo :334-356`).
- **Priorytet**: P0

### NSA-085: Invite pisze audit + outbox
- **Co sprawdza**: audit_log `settings.user.invited` retention security + outbox.
- **Kroki**: 1) Udany invite. 2) Sprawdź tabele.
- **Oczekiwana logika**: `writeInviteAuditAndOutbox` (`invite.ts:282-332`).
- **Priorytet**: P1

### NSA-086: Invite accept — token wygasły → 410
- **Co sprawdza**: expired token.
- **Kroki**: 1) GET accept z wygasłym/null-expiry tokenem.
- **Oczekiwana logika**: 410 `gone` (null expiry też = expired) (`api/auth/invite/accept/route.ts:46-49, 61`).
- **Priorytet**: P1

### NSA-087: Invite accept — atomic consume, replay → 404/410
- **Co sprawdza**: podwójna akceptacja.
- **Kroki**: 1) POST accept. 2) POST accept ponownie tym samym tokenem.
- **Oczekiwana logika**: atomic UPDATE `is_active=true, invite_token=null WHERE token AND expires>now`; rowCount=0 → 404/410; outbox `settings.user.accepted` (`accept/route.ts:66-101`).
- **Priorytet**: P0

---

## G. Roles (`apps/web/actions/users/assign-role.ts`, `settings/roles/_actions`)

### NSA-088: assignRole — brak settings.roles.assign
- **Co sprawdza**: RBAC.
- **Kroki**: 1) User bez uprawnienia. 2) assignRole.
- **Oczekiwana logika**: FORBIDDEN (`assign-role.ts:57-79, 90`).
- **Priorytet**: P0

### NSA-089: Privileged role wymaga canAssignPrivilegedRoles
- **Co sprawdza**: przypisanie roli uprzywilejowanej systemowej.
- **Kroki**: 1) Non-privileged nadaje owner/admin/org_admin. 
- **Oczekiwana logika**: `forbidden_privileged_role` (`assign-role.ts:108-110`, `role-grant-guards.ts:59-65, 168-173`).
- **Priorytet**: P0

### NSA-090: Grant-subset — eskalacja uprawnień zablokowana (W7)
- **Co sprawdza**: caller nie może nadać roli szerszej niż własne uprawnienia.
- **Kroki**: 1) Manager z podzbiorem perm nadaje custom role z szerszym zbiorem.
- **Oczekiwana logika**: `grantSubsetViolated` → `forbidden_privileged_role`; super roles (owner/admin/org_admin) bypass (`assign-role.ts:112-120`, `role-grant-guards.ts:175-177, 51-57`).
- **Priorytet**: P0

### NSA-091: Last-owner protection przy zmianie roli
- **Co sprawdza**: nie można zdemować ostatniego ownera.
- **Kroki**: 1) Jedyny owner. 2) assignRole na nie-owner.
- **Oczekiwana logika**: CTE `FOR UPDATE OF ur`, `last_owner_violation` → `forbidden` (`assign-role.ts:122-198`).
- **Priorytet**: P0

### NSA-092: createRole — kod/regex/system lock/dup
- **Co sprawdza**: walidacja tworzenia custom role.
- **Kroki**: 1) Kod niepasujący do regex / >64 / w SYSTEM_ROLE_CODES / duplikat.
- **Oczekiwana logika**: odpowiednio invalid / `system_role_locked` / `code_taken` (`role-admin-actions.ts:170-213, 52`).
- **Priorytet**: P1

### NSA-093: setRolePermissions — nieznane uprawnienie fail-closed
- **Co sprawdza**: każda permission w ALL_PERMISSIONS.
- **Kroki**: 1) Ustaw permission spoza katalogu.
- **Oczekiwana logika**: `invalid_permission` (`role-admin-actions.ts:249-254`).
- **Priorytet**: P0

### NSA-094: setRolePermissions — system role / self-edit / grant beyond self
- **Co sprawdza**: guardy edycji uprawnień.
- **Kroki**: 1) Edytuj system role. 2) Edytuj rolę którą sam masz. 3) Nadaj perm której nie masz.
- **Oczekiwana logika**: `system_role_locked` / self-edit blok / grant-beyond blok (`role-admin-actions.ts:264-275`).
- **Priorytet**: P0

### NSA-095: Dual-store spójność role_permissions + roles.permissions
- **Co sprawdza**: oba magazyny zapisywane w jednej transakcji do identycznego zbioru.
- **Kroki**: 1) setRolePermissions. 2) Porównaj role_permissions vs roles.permissions jsonb.
- **Oczekiwana logika**: identyczne (stale cache resolvowałby usunięty perm jako nadany) (`role-admin-actions.ts:280-322, 16-21`).
- **Priorytet**: P0

### NSA-096: Brak akcji usuwania roli (by-design / gap)
- **Co sprawdza**: rola w użyciu nie ma ścieżki delete.
- **Kroki**: 1) Szukaj delete-role action.
- **Oczekiwana logika**: brak akcji delete; UI pokazuje `usersAssigned` bez delete (`roles-screen.client.tsx:28, 457`) — potwierdzić intencję.
- **Priorytet**: P2

---

## H. Deactivation (`apps/web/actions/users/deactivate.ts`)

### NSA-097: Deactivate — RBAC
- **Co sprawdza**: perm org.access.admin lub settings.users.deactivate.
- **Kroki**: 1) User bez uprawnienia. 2) deactivate.
- **Oczekiwana logika**: forbidden (`deactivate.ts:9`).
- **Priorytet**: P0

### NSA-098: Self-deactivation zablokowana
- **Co sprawdza**: nie można zdeaktywować siebie.
- **Kroki**: 1) targetUserId === userId.
- **Oczekiwana logika**: `self_deactivation` (`deactivate.ts:102-103`).
- **Priorytet**: P1

### NSA-099: Last-owner block przy deaktywacji
- **Co sprawdza**: nie można zdeaktywować ostatniego aktywnego ownera.
- **Kroki**: 1) Jedyny aktywny owner. 2) deactivate.
- **Oczekiwana logika**: `isLastOwnerViolation` `FOR UPDATE` (`deactivate.ts:38+`).
- **Priorytet**: P0

### NSA-100: Deactivate banuje sesję Supabase; degradacja miękka
- **Co sprawdza**: is_active=false + ban 876000h; ban fail non-fatal.
- **Kroki**: 1) deactivate. 2) Kolejny request usera.
- **Oczekiwana logika**: `updateUserById` ban; fail → `authRevokeWarning:'session_revoke_failed'`; next request throw w with-org-context (`deactivate.ts:71, 24-28, 112`; `with-org-context.ts:252-253`).
- **Priorytet**: P0

---

## I. Auth — login / PIN (`app/[locale]/(auth)/login/_actions/auth.ts`, `api/scanner/login`)

### NSA-101: Login happy path
- **Co sprawdza**: poprawne dane logują i redirectują.
- **Kroki**: 1) Poprawny email+hasło.
- **Oczekiwana logika**: signInWithPassword → refreshSession → redirect `/${locale}/` (bez MFA) (`auth.ts:39-72`).
- **Priorytet**: P0

### NSA-102: Login — złe hasło
- **Co sprawdza**: błąd surfaces.
- **Kroki**: 1) Złe hasło.
- **Oczekiwana logika**: `success:false`, komunikat Supabase verbatim (`auth.ts:39-44`).
- **Priorytet**: P1

### NSA-103: Login — brak email/hasła
- **Co sprawdza**: walidacja wejścia.
- **Kroki**: 1) Puste pole.
- **Oczekiwana logika**: "Email and password are required." (`auth.ts:35-37`).
- **Priorytet**: P2

### NSA-104: Login — redirect do MFA gdy aal2 wymagany
- **Co sprawdza**: krok MFA.
- **Kroki**: 1) User z MFA. 2) Login.
- **Oczekiwana logika**: gdy `nextLevel==='aal2' && current!=='aal2'` → redirect `/login/mfa?factorId=…` (`auth.ts:57-69`).
- **Priorytet**: P0

### NSA-105: Brak app-level lockout na password login (gap)
- **Co sprawdza**: brute-force na /login polega tylko na throttlingu Supabase.
- **Kroki**: 1) Wiele błędnych prób.
- **Oczekiwana logika**: brak licznika/lockout w aplikacji (dokumentacja luki).
- **Priorytet**: P1

### NSA-106: PIN scanner login — separacja sesji
- **Co sprawdza**: osobny endpoint, sesja scanner (nie Supabase).
- **Kroki**: 1) POST /api/scanner/login {email,pin}.
- **Oczekiwana logika**: verifyPin → createScannerSession mode 'personal', zwraca {token,user,expiresAt}; każda gałąź audit (`api/scanner/login/route.ts`).
- **Priorytet**: P0

### NSA-107: PIN — lockout 5 prób / 15 min
- **Co sprawdza**: lockout PIN.
- **Kroki**: 1) 6 błędnych PIN w oknie 10 min.
- **Oczekiwana logika**: 6. porażka → `locked_until=now+15min` → `pin_locked` (423); poprawny PIN resetuje; wygaśnięcie okna resetuje; `FOR UPDATE` chroni race (`verify-pin.ts:44-51, 96-190, 129, 141-146`).
- **Priorytet**: P0

### NSA-108: PIN — kody błędów
- **Co sprawdza**: mapping błędów.
- **Kroki**: 1) invalid_pin / pin_not_enrolled / pin_locked / missing_fields.
- **Oczekiwana logika**: 401 / 409 / 423 / 400 (`scanner/login/route.ts:27-30`).
- **Priorytet**: P1

---

## J. MFA TOTP (`packages/auth/src/totp.ts`)

Uwaga: login-flow MFA używa **Supabase MFA** (`auth.ts:95-121 verifyMfaCode`, generic "Invalid or expired code"). `totp.ts` to własna ścieżka self-hosted (`mfa_secrets`). Współistnieją dwie implementacje TOTP.

### NSA-109: MFA_MASTER_KEY guard point-of-use (prod)
- **Co sprawdza**: prod bez klucza rzuca przy enroll/verify, nie przy imporcie.
- **Kroki**: 1) NODE_ENV=production, MFA_MASTER_KEY unset. 2) enrollTotp/verifyTotp. 3) Sprawdź że import/build nie crashuje.
- **Oczekiwana logika**: `getMfaMasterKeyFromEnv` throw w prod (`:39-42`); import side-effect-free (`:53-59`).
- **Priorytet**: P0

### NSA-110: Enroll — szyfrowanie per-tenant HKDF
- **Co sprawdza**: sekret szyfrowany, per-tenant klucz.
- **Kroki**: 1) enrollTotp(userId,{masterKey,tenantId}).
- **Oczekiwana logika**: HKDF-SHA256 salt=tenantId, secretbox, base64(nonce‖ct) upsert mfa_secrets; zwraca secret + URI (issuer Monopilot, period 30, digits 6) (`totp.ts:109-146, 91-97`).
- **Priorytet**: P1

### NSA-111: Verify — brak enrolmentu
- **Co sprawdza**: no_enrolment.
- **Kroki**: 1) verifyTotp usera bez sekretu.
- **Oczekiwana logika**: `{ok:false, reason:'no_enrolment'}` (`totp.ts:174-176`).
- **Priorytet**: P1

### NSA-112: Verify — zły kod
- **Co sprawdza**: invalid_code.
- **Kroki**: 1) Zły token.
- **Oczekiwana logika**: `invalid_code` (`totp.ts:191-192`).
- **Priorytet**: P1

### NSA-113: Verify — replay (reuse w tym samym oknie)
- **Co sprawdza**: ten sam poprawny kod 2× w oknie 30s odrzucony.
- **Kroki**: 1) verifyTotp poprawnym kodem. 2) Ponów w tym samym oknie.
- **Oczekiwana logika**: atomic claim `last_otp_window`; rowCount=0 → `replay` (`totp.ts:196-210`).
- **Priorytet**: P0

### NSA-114: Zero skew window
- **Co sprawdza**: brak tolerancji ±1 kroku.
- **Kroki**: 1) Kod z poprzedniego/następnego kroku (T=31s).
- **Oczekiwana logika**: verifySync bez `window` — tylko bieżący krok (`totp.ts:191`; test T=15→true, T=31→false).
- **Priorytet**: P1

### NSA-115: Cross-tenant klucz nie odszyfrowuje
- **Co sprawdza**: sekret zaszyfrowany tenantId A nie zweryfikuje się z tenantId B.
- **Kroki**: 1) enroll tenant A. 2) verify z tenantId=B.
- **Oczekiwana logika**: secretbox_open rzuca/nie waliduje (klucz per-tenant) (`totp.ts:179-189`).
- **Priorytet**: P0

---

## K. SAML/SSO + tenant_idp (`api/auth/saml/callback`, mig509)

### NSA-116: RelayState HMAC + nonce replay guard
- **Co sprawdza**: integralność RelayState i brak replay.
- **Kroki**: 1) Sfałszowany RelayState. 2) Powtórzony nonce.
- **Oczekiwana logika**: `verifyRelayState` 401; `rememberRelayStateNonce` reuse → 401 `relay_state_invalid` (`saml/callback/route.ts:43-64`).
- **Priorytet**: P0

### NSA-117: Tenant IdP resolution na owner connection
- **Co sprawdza**: resolucja tenant IdP przed sesją.
- **Kroki**: 1) SAML callback z org_id z RelayState.
- **Oczekiwana logika**: lookup na owner conn (app.current_org_id niedostępny), join `tenant_idp_config`↔`organizations`; brak → 400 (`callback/route.ts:79-124`).
- **Priorytet**: P1

### NSA-118: JIT provisioning + default role
- **Co sprawdza**: nowy user dostaje org_default_role.
- **Kroki**: 1) SAML dla nieistniejącego usera z jit_provisioning.
- **Oczekiwana logika**: `org_default_role` = pierwsza non-system rola by created_at, fallback 'org.member' (`callback/route.ts:103-108, 126-140`).
- **Priorytet**: P1

### NSA-119: Post-auth org context fail-loud
- **Co sprawdza**: nieudane seedowanie org context → 500, nie ciche.
- **Kroki**: 1) Wymuś błąd set_org_context.
- **Oczekiwana logika**: 500 (fail-loud, komentarz o wycieku/zerowaniu danych) (`callback/route.ts:158-188`).
- **Priorytet**: P0

### NSA-120: mig509 — writer tenant_idp policy tylko własny tenant
- **Co sprawdza**: `app.upsert_my_tenant_idp_policy` resolwuje tenant z app.current_org_id.
- **Kroki**: 1) Próba zapisu polityki innego tenanta.
- **Oczekiwana logika**: SECURITY DEFINER, resolwuje tylko własny tenant; app_user nie ma bezpośredniego UPDATE na tenant_idp_config (mig509).
- **Priorytet**: P0

### NSA-121: enforce_for_non_admins / mfa_required policy
- **Co sprawdza**: wymuszenie SSO/MFA per polityka.
- **Kroki**: 1) Polityka enforce_for_non_admins=true. 2) Non-admin login.
- **Oczekiwana logika**: handleSamlCallback stosuje enforce (`callback/route.ts:126-147`; mig509 pola).
- **Priorytet**: P1

---

## L. Session (`apps/web/lib/auth/session-check.ts`)

### NSA-122: Idle timeout na podstawie JWT iat, weryfikowany JWKS
- **Co sprawdza**: idle liczony z iat, podpis weryfikowany przed zaufaniem.
- **Kroki**: 1) Token starszy niż idleTimeoutMin.
- **Oczekiwana logika**: podpis via JWKS `/auth/v1/user`; `idleSeconds > idleTimeoutMin*60` → 401; strict `>` (dokładnie N nie wygasa) (`session-check.ts:99-115, 144-168`).
- **Priorytet**: P0

### NSA-123: Idle timeout config z tenant_idp_config
- **Co sprawdza**: idleTimeoutMin z tenanta, domyślnie 60.
- **Kroki**: 1) Ustaw idle_timeout_min. 2) Sprawdź próg.
- **Oczekiwana logika**: `tenant_idp_config.idle_timeout_min`, default 60 (`session-check.ts:29-34`).
- **Priorytet**: P1

### NSA-124: Absolutny cap 8h
- **Co sprawdza**: max sesja 8h niezależnie od configu.
- **Kroki**: 1) Sesja >8h nawet z idle never.
- **Oczekiwana logika**: `ABSOLUTE_MAX_SESSION_S=8h` → 401 (`session-check.ts:123, 160-165`).
- **Priorytet**: P1

### NSA-125: Fail-closed w prod przy braku Supabase env
- **Co sprawdza**: brak env → 401 (prod).
- **Kroki**: 1) Prod bez Supabase env. 2) checkIdleTimeout.
- **Oczekiwana logika**: null → 401; non-prod decode-only (`session-check.ts:87-97`).
- **Priorytet**: P1

### NSA-126: Refresh resetuje zegar idle
- **Co sprawdza**: refreshSession mintuje nowy iat.
- **Kroki**: 1) Login/MFA → refreshSession. 2) Sprawdź nowy iat.
- **Oczekiwana logika**: `refreshSession()` po login/MFA (`auth.ts:54, 117`); kontekst z `getUser()` nie `getSession()` (`with-org-context.ts:229-236`).
- **Priorytet**: P1

### NSA-127: Brak tokenu → 401 natychmiast
- **Co sprawdza**: no-token.
- **Kroki**: 1) checkIdleTimeout bez tokenu.
- **Oczekiwana logika**: 401 (`session-check.ts:137-142`).
- **Priorytet**: P2

---

## M. Password reset

### NSA-128: sendPasswordReset — brak enumeracji userów
- **Co sprawdza**: zawsze success niezależnie od istnienia emaila.
- **Kroki**: 1) Reset dla istniejącego. 2) Dla nieistniejącego.
- **Oczekiwana logika**: `{success:true}` w obu; `resetPasswordForEmail` z redirectTo `/${locale}/login` (`auth.ts:75-93`).
- **Priorytet**: P1

### NSA-129: sendPasswordReset — brak email
- **Co sprawdza**: walidacja.
- **Kroki**: 1) Puste pole.
- **Oczekiwana logika**: wymaga email (`auth.ts:84-86`).
- **Priorytet**: P2

---

## N. Multi-tenant / RLS (`apps/web/lib/auth/with-org-context.ts`)

### NSA-130: org_id z public.users, nie z JWT
- **Co sprawdza**: autorytatywne źródło org.
- **Kroki**: 1) JWT z rozjechanym org claim.
- **Oczekiwana logika**: org z `public.users.org_id`; rowCount!==1 → throw; deactivated → throw (`with-org-context.ts:240-254`).
- **Priorytet**: P0

### NSA-131: Platform act-as — tylko platform_admin
- **Co sprawdza**: impersonacja org tylko dla platform_admin.
- **Kroki**: 1) Non-platform-admin ustawia PLATFORM_ORG_COOKIE.
- **Oczekiwana logika**: ignorowane + audit `not_platform_admin`, fallback home org; wymaga `app.platform_admins` revoked_at IS NULL (`with-org-context.ts:257-288`).
- **Priorytet**: P0

### NSA-132: Act-as — niepoprawny cookie / target nieistniejący
- **Co sprawdza**: sanityzacja cookie.
- **Kroki**: 1) Non-UUID cookie. 2) Nieistniejący target org.
- **Oczekiwana logika**: ignorowane + audit `invalid_cookie` / `target_org_not_found` (`with-org-context.ts:261-264, 283-286`).
- **Priorytet**: P1

### NSA-133: Cross-org read blokowany przez RLS
- **Co sprawdza**: zapytania scope'owane `org_id = app.current_org_id()`.
- **Kroki**: 1) User org A czyta zasoby org B (roles/users/projekty).
- **Oczekiwana logika**: brak wyników / NOT_FOUND (RLS + explicit org filter).
- **Priorytet**: P0

---

## O. Onboarding (`apps/web/app/onboarding`, `apps/web/actions/onboarding`)

6 kroków w `organizations.onboarding_state`: 1=org_profile, 2=first_warehouse, 3=first_location, 4=first_product, 5=first_wo, 6=completion. Required: 1,2,3,6; opcjonalne (skippable): 4,5 (`advance.ts:4-6`). Uwaga: kolejność to profile→**warehouse→location** (nie location→warehouse).

### NSA-134: saveOrgProfile — walidacja gs1Prefix i orgName
- **Co sprawdza**: wymagane pola.
- **Kroki**: 1) Bez gs1Prefix. 2) Bez orgName.
- **Oczekiwana logika**: `VALIDATION_FAILED` field gs1Prefix / orgName (`save-org-profile.ts:52-63`).
- **Priorytet**: P1

### NSA-135: createFirstWarehouse — walidacja + duplikat kodu
- **Co sprawdza**: name/code wymagane, unikalny code.
- **Kroki**: 1) Bez code. 2) Duplikat code.
- **Oczekiwana logika**: `VALIDATION_FAILED`; PG 23505 → `CODE_TAKEN` (`create-first-warehouse.ts:31-35, 102-103`).
- **Priorytet**: P1

### NSA-136: createFirstLocation — warehouse resolve + walidacja
- **Co sprawdza**: pola i istnienie warehouse.
- **Kroki**: 1) Nieistniejący warehouseCode. 2) Duplikat binCode.
- **Oczekiwana logika**: `NOT_FOUND`; insert location_type='bin' level=4; dup → `CODE_TAKEN` (`create-first-location.ts:26-79`).
- **Priorytet**: P1

### NSA-137: RBAC onboarding — settings.onboarding.complete
- **Co sprawdza**: mutacje onboarding wymagają uprawnienia.
- **Kroki**: 1) User bez uprawnienia. 2) advance.
- **Oczekiwana logika**: `forbidden` (`advance.ts:72-75, 107-124`).
- **Priorytet**: P0

### NSA-138: advance — stale_step
- **Co sprawdza**: step musi == current_step.
- **Kroki**: 1) advance ze step≠current.
- **Oczekiwana logika**: `stale_step` (`advance.ts:208-210`).
- **Priorytet**: P1

### NSA-139: skip — required_step blokowany
- **Co sprawdza**: nie można skipnąć required (1,2,3,6).
- **Kroki**: 1) skip step 2.
- **Oczekiwana logika**: `required_step` (`advance.ts:189-191`).
- **Priorytet**: P1

### NSA-140: skip step 4/5 dozwolony
- **Co sprawdza**: opcjonalne kroki skippable.
- **Kroki**: 1) skip step 4 (product).
- **Oczekiwana logika**: dodaje do skipped_steps, advance (`advance.ts:196-205`; `complete-step.ts:13-15`).
- **Priorytet**: P2

### NSA-141: jump — illegal_jump
- **Co sprawdza**: jump tylko do current lub completed.
- **Kroki**: 1) jump do przyszłego niekompletnego kroku.
- **Oczekiwana logika**: `illegal_jump` (`advance.ts:179-187`).
- **Priorytet**: P1

### NSA-142: Interrupt/resume — redirect do faktycznego kroku
- **Co sprawdza**: bezpośrednie wejście na późniejszy krok bounce'uje.
- **Kroki**: 1) Stan na kroku 2. 2) Nawiguj na /onboarding/complete.
- **Oczekiwana logika**: `redirectIfOnboardingStepMismatch` → redirect do current step route (`_routing.ts:25-34`, `profile/page.tsx:20`).
- **Priorytet**: P1

### NSA-143: first_wo idempotentny + time-to-first-wo
- **Co sprawdza**: powtórny first_wo no-op; liczy czas.
- **Kroki**: 1) markFirstWoCreated 2×.
- **Oczekiwana logika**: idempotent gdy first_wo_at set; `time_to_first_wo_ms = occurredAt − started_at` clamp≥0 (`advance.ts:157-172`, `mark-first-wo-created.ts:31-34`).
- **Priorytet**: P2

### NSA-144: Persistence 0-rows → persistence_failed
- **Co sprawdza**: org usunięty mid-request nie fabrykuje sukcesu.
- **Kroki**: 1) Usuń org podczas advance.
- **Oczekiwana logika**: `persistence_failed` (`advance.ts:89-96, 245-260`).
- **Priorytet**: P1

### NSA-145: completeOnboarding NIE weryfikuje ukończenia required (gap)
- **Co sprawdza**: complete tylko sprawdza not-already-completed.
- **Kroki**: 1) Wywołaj completeOnboarding out-of-band przed krokami 1-3.
- **Oczekiwana logika**: brak sprawdzenia "wszystkie required done"; gating tylko przez redirect strony (`complete-onboarding.ts`) — potwierdzić czy da się obejść.
- **Priorytet**: P1

### NSA-146: completeOnboarding — idempotencja + post-commit chain
- **Co sprawdza**: podwójne complete; stamp claim + refresh.
- **Kroki**: 1) completeOnboarding 2×.
- **Oczekiwana logika**: `onboarding_already_completed`; sukces: `onboarding_completed_at=now`, `stampOnboardingClaim` (fail→AUTH_METADATA_FAILED), `refreshSession` (fail→SESSION_REFRESH_FAILED); redirect `/settings/users` (`complete-onboarding.ts:54-85`).
- **Priorytet**: P1

### NSA-147: Onboarding mutacje piszą audit + outbox
- **Co sprawdza**: audyt każdej tranzycji.
- **Kroki**: 1) Dowolna tranzycja.
- **Oczekiwana logika**: audit_log `onboarding.<transition>` + outbox `onboarding.step.<transition>` (`advance.ts:262-302`).
- **Priorytet**: P2

---

## P. GDPR (`app/(admin)/gdpr/_actions/redact-user.ts`, mig115)

Istnieje TYLKO ścieżka erasure/redakcji. **Brak eksportu danych / SAR** (potencjalna luka pokrycia).

### NSA-148: redactUser — RBAC gdpr.erasure.execute
- **Co sprawdza**: uprawnienie.
- **Kroki**: 1) User bez uprawnienia. 2) redactUser.
- **Oczekiwana logika**: `forbidden` (`redact-user.ts:20, 70-72`).
- **Priorytet**: P0

### NSA-149: redactUser — walidacja UUID
- **Co sprawdza**: targetUserId UUID.
- **Kroki**: 1) Niepoprawny UUID.
- **Oczekiwana logika**: `invalid_input` (`redact-user.ts:41, 62-64`).
- **Priorytet**: P2

### NSA-150: Erasure = soft pseudonimizacja do sentinel
- **Co sprawdza**: FK repointowane do sentinel, biznesowe wiersze nie usuwane.
- **Kroki**: 1) redactUser. 2) Sprawdź tabele.
- **Oczekiwana logika**: `gdpr_redact_user_pii` repointuje user FK do `00000000-…-000000000000`; nie DELETE (`mig115:80, 94-97, 220-225`).
- **Priorytet**: P0

### NSA-151: Erasure org-scoped, sentinel chroniony
- **Co sprawdza**: tylko własny org; odmowa redakcji sentinela.
- **Kroki**: 1) redactUser bez org context. 2) redactUser na sentinel.
- **Oczekiwana logika**: null org → raise 42501; sentinel → skip (`mig115:79, 84-92`); wszystkie UPDATE filtrują org_id.
- **Priorytet**: P0

### NSA-152: Erasure zawsze pisze audit
- **Co sprawdza**: audit_events `gdpr.erasure_executed` z counts.
- **Kroki**: 1) redactUser. 2) Sprawdź audit_events.
- **Oczekiwana logika**: retention security, after_state z counts (`mig115:196-214`).
- **Priorytet**: P1

### NSA-153: Dry-run erasure (dispatcher) nie persystuje
- **Co sprawdza**: SAVEPOINT + ROLLBACK zwraca realne counts bez zapisu.
- **Kroki**: 1) runErasure dry-run.
- **Oczekiwana logika**: preview counts, rollback; audit `gdpr.erasure.dry_run` (`packages/gdpr/src/dispatcher.ts:202-234`).
- **Priorytet**: P1

### NSA-154: Erasure counts — brak podwójnego liczenia fa alias
- **Co sprawdza**: NPD handler wyklucza alias `fa`.
- **Kroki**: 1) redactUser produktu z fa. 2) Sprawdź counts.
- **Oczekiwana logika**: alias `fa` wykluczony z sumy (`packages/db/src/erasure/npd.ts:35, 59-61`).
- **Priorytet**: P2

---

## Q. Reference data (UoM, kategorie)

### NSA-155: createUnit — walidacje
- **Co sprawdza**: category/code/name/factorToBase.
- **Kroki**: 1) category spoza {mass,volume,count,length}. 2) code z niedozwolonym znakiem. 3) factorToBase ≤ 0.
- **Oczekiwana logika**: walidacja Zod; "factorToBase must be greater than zero" (`units-validation.ts:13-27`); perm `settings.units.manage`.
- **Priorytet**: P1

### NSA-156: createUnit — uniqueness / FK / check
- **Co sprawdza**: mapowanie błędów DB.
- **Kroki**: 1) Duplikat code. 
- **Oczekiwana logika**: 23505→already_exists, 23503→invalid_reference, 23514→invalid factor (`manage-units.ts:308-312`).
- **Priorytet**: P1

### NSA-157: updateUnit — tylko name mutowalny
- **Co sprawdza**: code/factor immutable.
- **Kroki**: 1) update code/factor.
- **Oczekiwana logika**: tylko name; missing → not_found (`units-validation.ts:43-47`).
- **Priorytet**: P2

### NSA-158: softDeleteUnit — nie usuwa base unit
- **Co sprawdza**: base unit chroniony.
- **Kroki**: 1) softDelete base unit.
- **Oczekiwana logika**: blok (`manage-units.ts:447`).
- **Priorytet**: P1

### NSA-159: softDeleteUnit — in-use check (~16 tabel)
- **Co sprawdza**: nie można usunąć używanej jednostki.
- **Kroki**: 1) Jednostka referowana w bom_lines/items/... . 2) softDelete.
- **Oczekiwana logika**: `isUnitCodeInUse` → `in_use` (`manage-units.ts:169-256`).
- **Priorytet**: P1

### NSA-160: createCustomConversion — walidacja
- **Co sprawdza**: label/from/to/factor.
- **Kroki**: 1) factor ≤ 0.
- **Oczekiwana logika**: positive finite (`units-validation.ts:45-50`).
- **Priorytet**: P2

### NSA-161: Product category — uniqueness check-then-insert (TOCTOU)
- **Co sprawdza**: duplikat code.
- **Kroki**: 1) Dwa równoległe create tego samego code.
- **Oczekiwana logika**: `duplicate_code` przy pre-insert check; UWAGA check-then-insert, nie constraint — kandydat na race (`actions/reference/product-categories/create.ts:28-36`); perm `settings.reference.edit`.
- **Priorytet**: P1

### NSA-162: Product category — code immutable, soft-deactivate
- **Co sprawdza**: kod niezmienny po utworzeniu; brak twardego delete.
- **Kroki**: 1) Edytuj kategorię. 2) Deaktywuj.
- **Oczekiwana logika**: update edytuje tylko label/order/active; deaktywacja zamiast delete (`page.tsx:125, 156-164`).
- **Priorytet**: P2

### NSA-163: Reference import wizard — preview/commit
- **Co sprawdza**: import przez preview→commit.
- **Kroki**: 1) previewImport. 2) commitImport.
- **Oczekiwana logika**: `reference/[code]/import/previewImport.ts`/`commitImport.ts`.
- **Priorytet**: P2

---

## R. Schema wizard (`app/(admin)/schema/wizard`, `SchemaColumnWizard.tsx`)

### NSA-164: Wizard wymaga deptId
- **Co sprawdza**: bez ?deptId placeholder.
- **Kroki**: 1) Wejście bez deptId.
- **Oczekiwana logika**: "Select a department" (`wizard/page.tsx:22-33`).
- **Priorytet**: P2

### NSA-165: Step 2 — co najmniej jedna reguła walidacji
- **Co sprawdza**: `.refine` wymaga required/unique/regex/min/max.
- **Kroki**: 1) Next bez żadnej reguły.
- **Oczekiwana logika**: "Set at least one validation rule before continuing." gate na hasAnyRule; interceptor focus regex (`SchemaColumnWizard.tsx:60-79, 144-149, 190-211`).
- **Priorytet**: P1

### NSA-166: Save — draft upsert + publish, blank deptId throw
- **Co sprawdza**: pełny zapis.
- **Kroki**: 1) handleSave z poprawnymi danymi. 2) Z blank deptId.
- **Oczekiwana logika**: `upsertDeptColumnDraft` (wymaga draftId) → `publishDeptColumnDraft`; blank deptId throw; isSaving blokuje double-submit; push `/admin/schema` (`SchemaColumnWizard.tsx:215-257`).
- **Priorytet**: P1

### NSA-167: Field type — jeden z 6 typów
- **Co sprawdza**: string|number|date|enum|formula|relation.
- **Kroki**: 1) Wybierz typ.
- **Oczekiwana logika**: radio, jeden typ (`SchemaColumnWizard.tsx:101-108, 294-314`).
- **Priorytet**: P2

---

## S. Security settings (`app/[locale]/(app)/(admin)/settings/security`)

### NSA-168: RBAC widoku security
- **Co sprawdza**: dostęp read-only bez uprawnienia.
- **Kroki**: 1) User bez security.view/manage/edit/admin/owner.
- **Oczekiwana logika**: `permission-denied`, canManageSecurity=false (`page.tsx:135-153`, `security-screen.client.tsx:249`).
- **Priorytet**: P1

### NSA-169: Save — tylko MFA persystuje
- **Co sprawdza**: zapis MFA requirement + allowed methods.
- **Kroki**: 1) Zmień enforceAdmins/enforceAllUsers. 2) Save.
- **Oczekiwana logika**: `upsertSecurityPolicy({mfa_requirement, mfa_allowed_methods})`; mfa_requirement = required_all|required_admins|optional (`security-screen.client.tsx:323-350`).
- **Priorytet**: P1

### NSA-170: enforceSso wymaga metadataConfigured
- **Co sprawdza**: nie można wymusić SSO bez metadanych.
- **Kroki**: 1) enforceSso=true, brak metadanych. 2) Save.
- **Oczekiwana logika**: `METADATA_REQUIRED` field error, rollback SSO off (`security-screen.client.tsx:326-333`).
- **Priorytet**: P1

### NSA-171: Session timeout / SCIM / password fields — kosmetyczne (gap)
- **Co sprawdza**: te kontrolki disabled, zapis no-op.
- **Kroki**: 1) Zmień idleTimeout/maxSession. 2) Save. 3) Reload.
- **Oczekiwana logika**: brak backing column; min-length/reuse z constants (nist-password-policy), nie DB (`security-screen.client.tsx:360-394`, `page.tsx:210-214`).
- **Priorytet**: P1

### NSA-172: Audit preview ograniczony do security tabel
- **Co sprawdza**: ostatnie 5 z org_security_policies/org_sso_config/scim_tokens.
- **Kroki**: 1) Otwórz security screen.
- **Oczekiwana logika**: filtr do 3 tabel; link do /settings/audit (`security-screen.client.tsx:55-59, 225-230`).
- **Priorytet**: P2

---

## T. Dashboard / Reporting / Multi-site (`app/[locale]/(app)/(modules)/reporting`)

### NSA-173: RBAC — rpt.dashboard.view / rpt.export.csv
- **Co sprawdza**: fail-closed na każdej akcji read; export osobno.
- **Kroki**: 1) User bez rpt.dashboard.view. 2) Export bez rpt.export.csv.
- **Oczekiwana logika**: blok read; export → `REPORTING_EXPORT_FORBIDDEN` (`_actions/shared.ts:35-43`, `report-read-actions.ts:378-432`).
- **Priorytet**: P0

### NSA-174: Multi-site scoping — read = all-sites (NULL), write = fail-closed
- **Co sprawdza**: reporting read bez site widzi wszystkie; brak site w write rzuca.
- **Kroki**: 1) Reporting read bez active site. 2) Explicit site. 3) Write bez site.
- **Oczekiwana logika**: read binduje site_id NULL (all); explicit site filtruje; write → `NoActiveSiteError`; RLS `(app.current_site_id() is null OR site_id = app.current_site_id())` (`with-site-context.ts:60-86, 183-212`; `shared.ts:88-90`).
- **Priorytet**: P0

### NSA-175: KPI poprawność — production (output/waste%/yield/downtime)
- **Co sprawdza**: liczby zgodne ze źródłem.
- **Kroki**: 1) Znane dane wo_outputs/wo_waste_log/downtime. 2) Porównaj KPI z ręcznym wyliczeniem.
- **Oczekiwana logika**: `wosCompleted`=count COMPLETED/CLOSED w oknie; `outputKg`=Σqty_kg (3dp); `wastePct`=waste/(output+waste)×100 (null gdy denom≤0); `avgYieldPct`=avg(yield_percent)×100; `downtimeMinutes`=Σduration_min (open=0) (`report-read-actions.ts:215-363`, `shared.ts:68-71`).
- **Priorytet**: P0

### NSA-176: KPI honest-gaps — pct null, mixed-UoM, always-null pola
- **Co sprawdza**: brak fałszywych zer.
- **Kroki**: 1) Zerowy denominator. 2) Zapasy mixed-UoM. 3) avgConfirmedToFirstGrnDays.
- **Oczekiwana logika**: `pct` null gdy denom≤0; inventory qtyKg tylko uom='kg' (mixed wykluczone); `avgConfirmedToFirstGrnDays` zawsze null (brak kolumny) (`shared.ts:68-71, 238-243`; `report-read-actions.ts:472, 516`).
- **Priorytet**: P1

### NSA-177: Reporting filtry — period/line/order search
- **Co sprawdza**: filtry i selektywne stosowanie.
- **Kroki**: 1) Period custom from>to. 2) lineId. 3) orderQuery ILIKE.
- **Oczekiwana logika**: custom reversed → fallback 7d + `rangeError:'reversed'`; production/procurement/receipts/shipments honorują line+order; inventory/quality tylko okno (`shared.ts:1, 119-120`, `report-read-actions.ts:1096-1116`).
- **Priorytet**: P1

### NSA-178: Reporting read-only + org_id belt-and-braces
- **Co sprawdza**: brak mutacji, każda relacja z explicit org_id.
- **Kroki**: 1) Audyt akcji reporting.
- **Oczekiwana logika**: SELECT-only, żadnego outbox, `org_id = app.current_org_id()` na każdej relacji (`report-read-actions.ts:1-21`).
- **Priorytet**: P1

### NSA-179: Spend by supplier — tylko realne statusy PO
- **Co sprawdza**: spend liczony z sent/confirmed/partially_received/received.
- **Kroki**: 1) PO w draft/cancelled. 2) Sprawdź spend.
- **Oczekiwana logika**: `REAL_SPEND_PO_STATUSES`, Σ(qty×unit_price) desc (`report-read-actions.ts:1009-1055, 59`).
- **Priorytet**: P1

### NSA-180: CSV export — escaping + filename
- **Co sprawdza**: cele CSV escapowane, nazwa z datą.
- **Kroki**: 1) exportProductionSummaryCsv z komórkami zawierającymi przecinki/cudzysłowy.
- **Oczekiwana logika**: `csvCell` escaping; `reporting-production-<YYYY-MM-DD>.csv` (`report-read-actions.ts:378-432, 132-135`).
- **Priorytet**: P2

---

## Niepewności

1. **Onboarding — obejście completeOnboarding (NSA-145)**: akcja nie sprawdza czy required steps 1-3 są ukończone przed ustawieniem `onboarding_completed_at`; gating opiera się wyłącznie na redirect strony. Nie zweryfikowano czy istnieje ochrona server-side przed wywołaniem out-of-band. Wymaga potwierdzenia.
2. **Brak GDPR export/SAR**: znaleziono tylko erasure. Jeśli katalog/regulacje wymagają eksportu danych podmiotu — to luka funkcjonalna, nie testowa. Do potwierdzenia z ownerem.
3. **Dwie implementacje TOTP**: login-flow używa Supabase MFA (`verifyMfaCode`), a `totp.ts` to osobna self-hosted ścieżka (mfa_secrets). Nie ustalono która jest aktywna na produkcji dla challenge przy logowaniu — testy MFA muszą rozróżnić.
4. **get-costing-rollup mapuje `raw_cost_eur`→`totalCost`** (NSA-067): możliwy błąd etykiety na dashboardzie (raw ≠ total waterfall). Wymaga decyzji czy intencjonalne.
5. **Setup parity** (NSA-066): `computeWaterfall` (what-if) hardcode setup=0 vs `computeNpdCostEngine` liczy realny setup — nie ustalono które wejście zasila które ekrany; parytet do zweryfikowania.
6. **Security settings — kosmetyczne kontrolki** (NSA-171): session timeout/SCIM/password nie mają backing columns. Nie potwierdzono czy to celowe (feature-flag) czy niedokończone — wpływa na priorytet.
7. **Product category uniqueness TOCTOU** (NSA-161): check-then-insert bez DB constraint — nie potwierdzono czy istnieje unique index jako backstop.
8. **Seat-limit a pending invites** (NSA-077): pending (is_active=false) nie liczą się do limitu — nie ustalono czy to zamierzone (możliwe przekroczenie liczby miejsc po masowej akceptacji).
9. Kolejność onboarding w brief zadania (profile→location→warehouse) różni się od kodu (profile→warehouse→location) — przyjęto kod jako źródło prawdy.


---
<a id="sekcja-g"></a>
# Sekcja G — Przekrojowe / integracyjne (Runda 1 Fable: przejście po kodzie)

Obszary NIE pokryte przez sekcje A–F: crony, outbox, D365, SCIM, platform-admin, importy CSV, dokumenty/numeracja, notyfikacje, korekty ledgera, feature-flagi, i18n, łańcuchy międzymodułowe E2E.

## Crony (vercel.json: drift 02:00, catch-weight-variance 02:30, outbox 03:00, reporting-refresh 03:30, pm-schedule-due 06:00; + d365-pull w kodzie)

### XC-001: Autoryzacja crona — header x-vercel-cron
- **Co sprawdza**: Request z `x-vercel-cron: 1` przechodzi bez Bearer.
- **Kroki**: 1) Wywołaj `/api/internal/cron/outbox` z headerem platformowym. 2) Sprawdź 200 + wykonanie runOnce().
- **Oczekiwana logika**: `cronBearerMatches`/header-check w `system-actor-connection.js`; auth OR: header LUB `Authorization: Bearer ${CRON_SECRET}` (timingSafeEqual). Plik: apps/web/app/api/internal/cron/outbox/route.ts (nagłówek Auth).
- **Priorytet**: P0

### XC-002: Autoryzacja crona — fail-closed bez CRON_SECRET na prod
- **Co sprawdza**: Gdy CRON_SECRET nieustawiony w produkcji, bearer-auth jest ODRZUCANY (nie fail-open).
- **Kroki**: 1) Env prod bez CRON_SECRET. 2) Request z dowolnym Bearer. 3) Oczekuj 401.
- **Oczekiwana logika**: Fail-closed; dev-fallback tylko `NODE_ENV==='development' && !VERCEL_ENV`. outbox/route.ts komentarz Auth.
- **Priorytet**: P0

### XC-003: Metoda HTTP crona — rozjazd POST (kod) vs GET (Vercel cron)
- **Co sprawdza**: Vercel cron wywołuje GET; komentarz w outbox/route.ts deklaruje POST. Czy każdy z 5 cron route'ów eksportuje handler dla metody, którą faktycznie wywołuje Vercel?
- **Kroki**: 1) Dla każdego route sprawdź eksporty GET/POST. 2) Symuluj wywołanie GET z headerem cron. 3) Oczekuj wykonania, nie 405.
- **Oczekiwana logika**: Znany gotcha projektu: Vercel cron=GET. Jeśli route ma tylko POST → cron nigdy się nie wykonuje (silent failure). KAŻDY z 5 wpisów vercel.json wymaga weryfikacji.
- **Priorytet**: P0

### XC-004: Outbox worker — at-least-once + retry po crashu handlera
- **Co sprawdza**: Handler rzucający wyjątek NIE stempluje consumed_at → wiersz zostaje do następnego ticku.
- **Kroki**: 1) Wstaw event z handlerem rzucającym. 2) Uruchom runOnce(). 3) Sprawdź consumed_at IS NULL. 4) Napraw handler, drugi tick → consumed.
- **Oczekiwana logika**: LocalDispatchQueue publikuje PRZED stemplem; throw abortuje stempel (Slot F-1 fix). outbox/route.ts sekcja Queue.
- **Priorytet**: P0

### XC-005: Outbox — duplikat dostarczenia (publish przed stemplem)
- **Co sprawdza**: Crash między publish a update → republikacja; konsument musi dedupować (aggregate_id+event_type+created_at).
- **Kroki**: 1) Symuluj crash po publish. 2) Drugi tick → handler wywołany 2×. 3) Zweryfikuj, że efekty handlera są idempotentne (np. cascade alergenów UPSERT).
- **Oczekiwana logika**: Kontrakt at-least-once; idempotencja po stronie konsumenta.
- **Priorytet**: P1

### XC-006: Outbox — owner-pool cross-tenant sweep
- **Co sprawdza**: Worker czyta eventy WSZYSTKICH orgów w jednym przebiegu (bez RLS org-context) i nie miesza danych między orgami w handlerach.
- **Kroki**: 1) Eventy 2 orgów. 2) runOnce(). 3) Handler orgu A nie dotyka danych orgu B.
- **Oczekiwana logika**: Control-plane job na owner pool; handler dostaje org_id z eventu i sam ustawia kontekst.
- **Priorytet**: P0

### XC-007: Cron drift — wykrywanie dryfu schematu
- **Co sprawdza**: `/api/internal/cron/drift` raportuje rozjazd migracji/schematu bez modyfikacji danych.
- **Kroki**: 1) Wywołaj z auth. 2) Sprawdź raport + brak side-effectów.
- **Priorytet**: P2

### XC-008: Cron catch-weight-variance
- **Co sprawdza**: Nocna analiza wariancji wag (lib/cron/catch-weight-variance.ts) — poprawność progu i raportowanych pozycji.
- **Kroki**: 1) Dane z wariancją powyżej/poniżej progu. 2) Uruchom. 3) Tylko przekroczenia raportowane.
- **Priorytet**: P2

### XC-009: Cron pm-schedule-due — generacja MWO z harmonogramu PM
- **Co sprawdza**: PM z terminem due → utworzone MWO; PM przyszłe → nic; brak duplikatów przy 2× uruchomieniu (idempotencja).
- **Kroki**: 1) PM due wczoraj + PM za tydzień. 2) 2× cron. 3) Dokładnie 1 MWO.
- **Oczekiwana logika**: lib/cron/pm-schedule-due.ts.
- **Priorytet**: P1

### XC-010: Cron reporting-refresh — odświeżenie zmaterializowanych widoków
- **Co sprawdza**: Refresh kończy się sukcesem przy danych wieloorganizacyjnych; dashboardy po nim pokazują świeże liczby.
- **Priorytet**: P2

## Integracja D365 (lib/integrations/d365, api/settings/d365)

### XC-011: Gate D365 — flaga wyłączona → 412 V-TEC-70
- **Co sprawdza**: Każdy endpoint D365 (sync, health, dlq, pull cron, push) odmawia gdy `integration.d365.enabled` OFF.
- **Kroki**: 1) Flaga OFF. 2) POST sync. 3) HTTP 412, kod V-TEC-70.
- **Oczekiwana logika**: `assertD365Enabled` — jedyny guard wszystkich entry-pointów (gate.ts:1-30).
- **Priorytet**: P0

### XC-012: Gate D365 — brakujące constants → V-SET-42
- **Co sprawdza**: Dowolna z 5 stałych referencyjnych pusta → odmowa V-SET-42.
- **Kroki**: 1) Flaga ON, 1 constant pusty. 2) Wywołaj sync. 3) Błąd V-SET-42 z listą braków.
- **Oczekiwana logika**: `findMissingD365Constants` czyta "Reference"."D365_Constants".
- **Priorytet**: P0

### XC-013: D365 push — idempotencja
- **Co sprawdza**: Dwukrotny push tego samego rekordu nie tworzy duplikatu (idempotency.ts).
- **Priorytet**: P1

### XC-014: D365 DLQ — podgląd i retry martwych komunikatów
- **Co sprawdza**: api/settings/d365/dlq listuje failed, retry przenosi z powrotem; RBAC (d365 rbac.ts) na odczyt/retry.
- **Priorytet**: P1

### XC-015: D365 — anti-corruption (export/import only)
- **Co sprawdza**: Gate nigdy nie woła D365 przy sprawdzaniu warunków; awaria D365 nie blokuje lokalnych operacji poza syncem.
- **Oczekiwana logika**: R15; gate czyta tylko lokalną konfigurację.
- **Priorytet**: P1

### XC-016: D365 sync bypass progu kosztowego 20%
- **Co sprawdza**: Zmiana kosztu >20% z d365_sync omija wymóg approvera (V-TEC-53 bypass — celowe?), z UI wymaga. Test graniczny obu ścieżek.
- **Oczekiwana logika**: Powiązane z TEC-225–229 (sekcja A); tu ścieżka integracyjna.
- **Priorytet**: P1

## SCIM 2.0 (api/scim/v2)

### XC-017: SCIM auth — bearer weryfikowany, brak → 401 scim+json
- **Co sprawdza**: `verifyScimBearer`; odpowiedź błędna w formacie SCIM (schemas urn:...:Error), Content-Type application/scim+json.
- **Priorytet**: P0

### XC-018: SCIM Users GET — izolacja org przez RLS
- **Co sprawdza**: Token orgu A nie listuje userów orgu B (`withScimOrgContext` + users_org_context policy).
- **Priorytet**: P0

### XC-019: SCIM Users POST — provisioning a seat-limit
- **Co sprawdza**: Utworzenie usera przez SCIM przy pełnych seatach — czy egzekwowany ten sam limit co invite (NSA-07x)? Jeśli nie → udokumentowany bypass.
- **Priorytet**: P1

### XC-020: SCIM deprovision — dezaktywacja usera
- **Co sprawdza**: PATCH/DELETE → user traci dostęp (sesje, PIN skanera), audit; zgodność z ręczną dezaktywacją (sekcja F/H).
- **Priorytet**: P1

### XC-021: SCIM Groups → mapowanie ról
- **Co sprawdza**: Członkostwo grupy SCIM ↔ role aplikacji; usunięcie z grupy odbiera rolę; guard eskalacji (W7) obowiązuje też przez SCIM.
- **Priorytet**: P1

### XC-022: SCIM ServiceProviderConfig — deklarowane capabilities zgodne z implementacją
- **Priorytet**: P2

## Platform admin ((platform)/platform, lib/platform)

### XC-023: Act-as — wejście w org z pełnym auditem
- **Co sprawdza**: Platform-admin wchodzi w org → wpis `platform.act_as.entered` w OBU auditach (public + platform), actor_type='impersonation', impersonator_id ustawiony.
- **Oczekiwana logika**: lib/platform/actions.ts:36-96.
- **Priorytet**: P0

### XC-024: Act-as — wyjście i wygaśnięcie
- **Co sprawdza**: Exit → `platform.act_as.exited` (:187-189); po wyjściu brak dostępu do danych orgu; sesja act-as nie przeżywa relogin.
- **Priorytet**: P0

### XC-025: Act-as — niedostępne dla zwykłego usera
- **Co sprawdza**: User bez platform-admin nie widzi /platform i nie może wywołać akcji act-as (403), nawet znając URL/action-id.
- **Priorytet**: P0

### XC-026: Act-as — działania w trybie impersonacji oznaczone w audit trail orgu
- **Co sprawdza**: Zmiana danych podczas act-as ma w audycie impersonator_id, nie podszywa się czysto pod usera orgu.
- **Priorytet**: P1

### XC-027: Export orgs — zakres danych
- **Co sprawdza**: export-orgs-button generuje zestawienie bez wycieku PII poza uprawnienia platformowe; tylko platform-admin.
- **Priorytet**: P1

### XC-028: Platform audit page — kompletność
- **Co sprawdza**: /platform/audit pokazuje act-as entered/exited + add-admin; filtrowanie; paginacja.
- **Priorytet**: P2

## Importy CSV (lib/import)

### XC-029: Import PO — walidacja wierszy i częściowe odrzucenie
- **Co sprawdza**: Plik z 3 dobrymi + 2 złymi wierszami → raport per-wiersz; czy import jest all-or-nothing czy partial (ustalić z po-import-validator.ts i zamrozić testem).
- **Priorytet**: P1

### XC-030: Import PO — duplikaty i konflikt z istniejącymi PO
- **Co sprawdza**: Ten sam plik 2× → brak zdublowanych PO (idempotencja lub jasny błąd duplikatu).
- **Priorytet**: P1

### XC-031: Import WO/TO — walidatory
- **Co sprawdza**: wo-import-validator/to-import-validator: nieistniejący item, ujemne qty, zła data, nieznany magazyn → odrzucone z komunikatem; TO same-warehouse odrzucone (spójnie z PLN — guard same_warehouse).
- **Priorytet**: P1

### XC-032: Import items CSV — encoding i format
- **Co sprawdza**: parse-items-csv: UTF-8 BOM, przecinki w cudzysłowach, puste linie końcowe; separator; liczby z przecinkiem dziesiętnym (locale PL!).
- **Priorytet**: P2

### XC-033: Import — i18n staging
- **Co sprawdza**: import-i18n-staging.ts — tłumaczenia trafiają do stagingu, nie bezpośrednio na produkcyjne etykiety; zatwierdzenie przenosi.
- **Priorytet**: P2

### XC-034: Import — RBAC
- **Co sprawdza**: Akcje importu wymagają uprawnień modułu docelowego (PO→procurement, WO→planning); user read-only nie zaimportuje.
- **Priorytet**: P0

## Dokumenty i numeracja (lib/documents)

### XC-035: Numeracja dokumentów — sekwencja bez dziur i duplikatów przy współbieżności
- **Co sprawdza**: numbering.ts + code-mask.ts: 2 równoległe generacje → 2 różne kolejne numery (lock/advisory); maska (prefix/data/sekwencja) zgodna z konfiguracją.
- **Priorytet**: P0

### XC-036: Delivery note — kompletność danych
- **Co sprawdza**: delivery-note-document.ts: pozycje = pozycje shipmentu, adres klienta, nagłówek firmy (company-header.ts), SSCC; wygenerowany dokument dla partial shipment zawiera tylko wysłane linie.
- **Priorytet**: P1

### XC-037: GRN document — zgodność z przyjęciem
- **Co sprawdza**: grn-document.ts: ilości = grn_items (bez cancelled), batch/expiry, dostawca.
- **Priorytet**: P1

### XC-038: Code-mask — walidacja maski użytkownika
- **Co sprawdza**: Nieprawidłowa maska (nieznany token) → błąd przy zapisie konfiguracji, nie w momencie generacji dokumentu.
- **Priorytet**: P2

## Notyfikacje (lib/notifications)

### XC-039: Unread count — poprawność i skoping
- **Co sprawdza**: get-unread-notification-count: liczy tylko nieprzeczytane danego usera+org; przeczytanie zmniejsza; cross-org nie przecieka.
- **Priorytet**: P1

### XC-040: Bell labels — typy notyfikacji
- **Co sprawdza**: build-notification-bell-labels mapuje wszystkie notification-types (brak "unknown" dla realnych eventów: hold, CCP breach, invite, MWO due...).
- **Priorytet**: P2

## Korekty ledgera (lib/corrections)

### XC-041: Correct-ledger-entry — storno i wpis korygujący
- **Co sprawdza**: Korekta wpisu → oryginał nietknięty (append-only), powstaje storno + nowy wpis; WAC przeliczony; suma ledgera = stan po korekcie.
- **Oczekiwana logika**: correct-ledger-entry.ts + material-scope.ts (zakres materiałowy korekty).
- **Priorytet**: P0

### XC-042: Korekta — uprawnienia i e-sign
- **Co sprawdza**: Korekta ledgera wymaga uprawnienia finance/correction + podpisu; zwykły operator nie skoryguje.
- **Priorytet**: P0

## Feature flags / telemetria

### XC-043: Feature-flags — flaga per-org
- **Co sprawdza**: lib/feature-flags + feature_flags_core: flaga ON w orgu A nie włącza funkcji w orgu B; default OFF.
- **Priorytet**: P1

### XC-044: PostHog flags endpoint
- **Co sprawdza**: api/posthog/flags — nie wycieka flag innych orgów; działa bez PostHog env (graceful).
- **Priorytet**: P2

### XC-045: Internal upgrade endpoint
- **Co sprawdza**: api/internal/upgrade — auth (jak crony), skutki idempotentne.
- **Priorytet**: P1

## i18n / locale

### XC-046: Routing locale — en/pl parity
- **Co sprawdza**: Każdy ekran działa pod /en i /pl; brak twardych linków bez locale (redirect); przełączenie zachowuje bieżącą stronę.
- **Priorytet**: P1

### XC-047: Brakujące tłumaczenia
- **Co sprawdza**: Klucze bez tłumaczenia PL nie renderują surowego klucza na ekranach krytycznych (audit głównych ekranów obu locale).
- **Priorytet**: P2

### XC-048: Formaty liczb/dat per locale
- **Co sprawdza**: Ilości/kwoty/daty formatowane per locale, ale INPUTY przyjmują format zgodny z parserem serwera (kropka dziesiętna — parser core odrzuca przecinek; test wpisania „1,5" w PL).
- **Priorytet**: P1

## Łańcuchy międzymodułowe E2E (najważniejsza wartość katalogu)

### XC-049: E2E happy-path: PO → GRN → putaway → WO → konsumpcja → output → SO → pick → pack → ship → POD
- **Co sprawdza**: Pełny cykl życia materiału przez wszystkie moduły; na końcu: stany=0 dla zużytego, FG wysłany, genealogia od LP przyjęcia do shipmentu ciągła, WAC/valuation spójne (Σ wartość magazynu = suma ledgera).
- **Kroki**: pełny przepływ na świeżych danych testowych, weryfikacja po każdym etapie.
- **Priorytet**: P0

### XC-050: E2E NPD → Technical → Planning → Production
- **Co sprawdza**: Projekt NPD przez gate'y → releaseToFactory → BOM/routing w Technical (active) → WO planowalne → wykonalne; koszty NPD (WIP) vs koszt WO spójne co do modelu (net vs ÷(1−scrap)).
- **Priorytet**: P0

### XC-051: E2E recall/trace — forward i backward
- **Co sprawdza**: Od LP surowca: forward trace znajduje wszystkie FG/shipmenty/klientów (przez konsumpcje, genealogię split/merge, WO outputs); backward od shipmentu do dostawcy. Zgodność z mass-balance (ε=0.001 kg).
- **Priorytet**: P0

### XC-052: E2E hold cascade — hold na batchu blokuje wszystkie ścieżki wyjścia
- **Co sprawdza**: Hold na batch → zablokowane: pick (scanner+desktop), reserve, ship, konsumpcja WO, split/merge — WSZYSTKIE naraz (v_active_holds matchuje batch po znormalizowanym numerze); release przywraca.
- **Priorytet**: P0

### XC-053: E2E multi-site — separacja operacyjna
- **Co sprawdza**: User site A: nie widzi stanów/WO/shipmentów site B (linesRestricted), scanner odmawia cross-site, ale org-wide widoki (genealogia definer) działają wg projektu. Warehouse z site_id=NULL — przetestować świadomie (znany bypass guardów site).
- **Priorytet**: P0

### XC-054: E2E cancel-cascade — WO z rezerwacjami i częściową konsumpcją
- **Co sprawdza**: Cancel WO po częściowej konsumpcji → rezerwacje zwolnione (lub udokumentowane że nie — rozjazd z PLN-024/025), WAC odwrócony tylko za skonsumowane, LP-genealogia zachowana, output-LP zablokowane do destroy zgodnie z guardem downstream.
- **Priorytet**: P0

### XC-055: E2E onboarding → pierwszy pełny obieg
- **Co sprawdza**: Świeży org po onboardingu (profile→location→warehouse→product→WO) może od razu wykonać XC-049 bez ręcznych fixów w DB (kompletność seedów onboardingu).
- **Priorytet**: P1

### XC-056: Spójność księgowa po dniu operacji (property-based)
- **Co sprawdza**: Po dowolnej sekwencji operacji z katalogu: (1) Σ LP.quantity ≥ Σ reserved; (2) valuation = Σ(qty_kg×avg_cost) per item; (3) ledger balансuje się do stanów; (4) brak LP w stanie niemożliwym (np. consumed z qty>0 poza korektami).
- **Priorytet**: P1

## Niepewności (runda 1)
1. XC-003: nie zweryfikowałem eksportów GET/POST wszystkich 5 cron route'ów — do sprawdzenia przed napisaniem testów.
2. XC-019: interakcja SCIM↔seat-limit nieustalona z kodu.
3. XC-029: all-or-nothing vs partial dla importów — do ustalenia per import.
4. Brak w katalogu: api/internal/flags i api/scanner/audit — do przejrzenia w rundzie 2.


---
<a id="sekcja-h"></a>
# Sekcja H — UI/UX + Settings-infra (Runda 2 Fable: przejście przeglądarkowe po prodzie)

Obserwacje z żywej aplikacji (admin, org Apex 22) + luka pokrycia: ~30 ekranów Settings nieobjętych sekcją F.

## Shell / nawigacja globalna

### UI-001: Site-filter — scoping tylko WO/LP/OEE
- **Co sprawdza**: Deklarowany kontrakt filtra site (tooltip: "Filters work orders, license plates and OEE only — other screens stay org-wide"). Wybór site zmienia listy WO/LP/OEE; pozostałe ekrany NIE zmieniają zawartości.
- **Kroki**: 1) Wybierz konkretny site. 2) Przejdź WO/LP/OEE — dane zawężone. 3) Przejdź Shipping/Quality/Planning — dane org-wide. 4) Odśwież stronę — wybór site persystuje.
- **Oczekiwana logika**: Kontrakt z tooltipa; niespójność (np. inny ekran też filtrowany albo WO nie filtrowane) = bug.
- **Priorytet**: P1

### UI-002: Org-switcher (platform admin) — dostępność i skutki
- **Co sprawdza**: Przycisk "Switch organization" widoczny TYLKO dla platform-admina; przełączenie zmienia dane wszystkich ekranów; brak przecieku danych poprzedniego orgu (cache RSC!).
- **Priorytet**: P0

### UI-003: Global search ("Search settings…")
- **Co sprawdza**: Zakres wyszukiwarki w headerze (settings-only wg placeholdera); wyniki prowadzą do właściwych ekranów; brak wyników → sensowny empty-state; XSS-safe echo zapytania.
- **Priorytet**: P2

### UI-004: Dzwonek notyfikacji
- **Co sprawdza**: Licznik nieprzeczytanych; otwarcie listy; kliknięcie → nawigacja do encji; oznaczanie przeczytanych (spójne z XC-039).
- **Priorytet**: P1

### UI-005: Menu użytkownika — wylogowanie i przełączanie
- **Co sprawdza**: Logout czyści sesję (back-button nie pokazuje danych), link do profilu/PIN.
- **Priorytet**: P1

### UI-006: Nawigacja Premium — gating modułów
- **Co sprawdza**: Sekcja "Premium" (Technical/NPD/Finance/OEE/Maintenance) — czy jest realny plan-gating (org bez premium nie widzi / dostaje upsell), czy tylko etykieta. Ustalić kontrakt i zamrozić testem.
- **Priorytet**: P2

## Dashboard

### UI-007: KPI dashboardu zgodne ze źródłami
- **Co sprawdza**: Active WOs / Pending POs / Low Stock / Quality Holds / Today's Shipments = te same liczby co listy źródłowe z odpowiadającymi filtrami.
- **Priorytet**: P1

### UI-008: KPI "Low Stock Alerts" — stub "Stock thresholds not live yet"
- **Co sprawdza**: Podpis twierdzi, że progi nie są live, ale licznik pokazuje 1 — sprzeczność copy vs dane. Ustalić stan faktyczny (reorder-thresholds istnieją w Planning) i naprawić podpis lub źródło.
- **Priorytet**: P2

### UI-009: Quick actions — deep-linki `?new=1`
- **Co sprawdza**: "Create Work Order" → work-orders z otwartym modalem create (query-param). Wejście bez uprawnienia → brak modala + komunikat, nie crash. Analogicznie Create PO.
- **Priorytet**: P1

### UI-010: Recent activity — wpisy klikalne i bezpieczne
- **Co sprawdza**: Feed pokazuje eventy audit (delete WO, TO status, signature). Czy skrócone UUID prowadzą do encji; usunięta encja → graceful (nie 500); brak wpisów innego orgu.
- **Priorytet**: P2

## Planning dashboard (obserwacje)

### UI-011: Alerty PO z etykietą "View WO →" (copy-bug)
- **Co sprawdza**: Karta "PO alerts" linkuje do PO, ale etykieta mówi "View WO →". Poprawność etykiety + celu linku.
- **Priorytet**: P2

### UI-012: "TO alerts 0" pokazuje "No work-order alerts" (copy-bug)
- **Co sprawdza**: Empty-state karty TO używa treści o WO.
- **Priorytet**: P2

### UI-013: Cancelled WO na 7-dniowej tablicy harmonogramu
- **Co sprawdza**: Board pokazuje WO Cancelled na równi z Released — czy anulowane powinny zajmować sloty? Ustalić kontrakt (proponowane: ukryte lub wyszarzone) i zamrozić.
- **Priorytet**: P2

### UI-014: Przyciski disabled "Run sequencing" / "Trigger D365 pull"
- **Co sprawdza**: Stany disabled — kiedy się odblokowują (uprawnienie? flaga D365? brak linii?). Tooltip z powodem. D365 pull przy flag OFF → disabled zamiast 412 po kliknięciu.
- **Priorytet**: P2

### UI-015: PO aging — sumy kubełków
- **Co sprawdza**: 0-30/31-60/61-90/90+ — suma pozycji = liczba przeterminowanych PO; wartość = suma wartości; PO opłacone/received znikają.
- **Priorytet**: P1

## Warehouse landing (obserwacje)

### UI-016: KPI "Unique SKUs 0" przy 25 aktywnych LP
- **Co sprawdza**: Sprzeczność: 25 aktywnych LP nie może dawać 0 SKU. Prawdopodobnie zepsute źródło licznika (site-scope? join?). Test: liczba distinct produktów w aktywnych LP = licznik.
- **Priorytet**: P1

### UI-017: Zdublowany kafel "Stock adjustments"
- **Co sprawdza**: Nawigacja ma 2 pozycje "Stock adjustments" (…/adjustments/new i …/adjustments) — dedup lub rozróżnienie etykiet ("New adjustment" vs "History").
- **Priorytet**: P2

### UI-018: Notki deweloperskie renderowane użytkownikowi
- **Co sprawdza**: Paragrafy "Inventory-value KPI omitted: no valuation/costing field is exposed…" widoczne na prodzie — wewnętrzne uzasadnienia nie powinny być copy UI.
- **Priorytet**: P2

### UI-019: Kafle expiry 7d/30d zgodne z dashboardem expiry
- **Co sprawdza**: Liczby "Expiring ≤7d: 2 / ≤30d: 10" = liczby na /warehouse/expiry (red/amber); definicja progów spójna z expiry-actions (warn_days org może ≠ 7 — kafel hardcoduje "7d"?).
- **Priorytet**: P1

## Finance / Reporting / Multi-site (obserwacje)

### UI-020: Waluta w Reporting — "$" przy bazie GBP
- **Co sprawdza**: "Spend by supplier" pokazuje $127.32; baza kosztowa org = GBP (book-receipt-wac wymusza GBP). Symbol waluty per org-currency, nie hardcode $.
- **Priorytet**: P1

### UI-021: Multi-site "Aggregated inventory 3221.962001"
- **Co sprawdza**: Surowa liczba bez zaokrąglenia i bez UoM — formatowanie (2-3 dp + jednostka); sensowność agregacji (suma kg? sztuk? mieszanych UoM — jeśli mieszane, liczba jest bez znaczenia → wymaga rozbicia per UoM).
- **Priorytet**: P1

### UI-022: Multi-site — spójność metadanych site
- **Co sprawdza**: Country "uk"/"GB"/"PL" niespójne wielkością/formatem (ISO-3166); timezone poprawne wartości IANA; walidacja przy tworzeniu site.
- **Priorytet**: P2

### UI-023: Reporting — filtry okresów i custom range
- **Co sprawdza**: Każdy preset (Today/Week/Month/Quarter/7d/30d/Custom) zmienia zakres WSZYSTKICH 7 kart; custom range waliduje od≤do; nagłówki kart pokazują faktyczny zakres.
- **Priorytet**: P1

### UI-024: Reporting — 7× Export CSV
- **Co sprawdza**: Każdy eksport zawiera dokładnie dane widoczne (z filtrami), poprawne nagłówki, escaping przecinków/cudzysłowów, format liczb bez utraty precyzji.
- **Priorytet**: P1

### UI-025: Finance WO actual costs — okres + eksport + refresh
- **Co sprawdza**: Combobox okresu przelicza agregaty (Scrap/waste cost); Export CSV zgodny z tabelą; Refresh nie duplikuje wierszy.
- **Priorytet**: P2

## Scanner shell (obserwacje)

### UI-026: /scanner/home bez sesji → redirect na /scanner/login
- **Co sprawdza**: Sesja web (cookie) NIE wystarcza do skanera — osobna sesja PIN; redirect zachowuje docelowy ekran po zalogowaniu (lub świadomie nie).
- **Priorytet**: P1

### UI-027: Scanner login — keypad i walidacja PIN 4-6 cyfr
- **Co sprawdza**: Sign in disabled dopóki email+PIN niekompletne; Delete działa; PIN maskowany; "First time? Set up your PIN" → flow set-pin (api/scanner/set-pin) z autoryzacją.
- **Priorytet**: P1

### UI-028: Scanner — wskaźnik ONLINE/sync
- **Co sprawdza**: Status "ONLINE" odzwierciedla łączność; przejście offline → komunikat/blokada akcji (lub kolejkowanie — ustalić kontrakt z kodu i zamrozić).
- **Priorytet**: P2

## Settings — luka pokrycia (~30 ekranów bez testów w sekcji F)

### UI-029: Infra CRUD: Sites & lines, Production lines, Warehouses, Locations, Printers, Dock doors
- **Co sprawdza**: Pełny CRUD każdego ekranu infra; usuwanie/dezaktywacja bytu W UŻYCIU (linia z WO, magazyn ze stanami, lokacja z LP, drukarka w print_jobs, dock z appointment) → blokada lub soft-disable z komunikatem; is_active propaguje do putaway/TO/schedulera.
- **Priorytet**: P0

### UI-030: Shifts & calendar
- **Co sprawdza**: Definicje zmian (start/koniec, nakładanie się, przez północ), kalendarz dni wolnych; wpływ na scheduler capacity i OEE availability.
- **Priorytet**: P1

### UI-031: Labor rates
- **Co sprawdza**: CRUD stawek per rola; waluta; wpływ na koszt WO i routing-cost-preview (labor = hours×rate); zmiana stawki nie przelicza wstecz zamkniętych WO (koszt historyczny zamrożony).
- **Priorytet**: P0

### UI-032: NPD settings: fields, approval requirements, gate checklists, cost parameters
- **Co sprawdza**: Konfiguracja pól/gate'ów odzwierciedlona w pipeline (wymagany checklist blokuje gate; approval req wymusza approvera); cost parameters (np. overhead %) wchodzą do costing engine zgodnie z wzorem.
- **Priorytet**: P1

### UI-033: Units & conversions
- **Co sprawdza**: CRUD jednostek i konwersji; usunięcie jednostki w użyciu (items/BOM) zablokowane; konwersja okrężna/cykliczna wykryta; zmiana przelicznika NIE przelicza historycznych transakcji.
- **Priorytet**: P0

### UI-034: Temperature ranges (quality)
- **Co sprawdza**: Zakresy temperatur per kategoria; walidacja min<max; użycie w cold-chain breach detection.
- **Priorytet**: P1

### UI-035: Partners (Suppliers & customers) + Customer prices
- **Co sprawdza**: Wspólny ekran partnerów spójny z Planning/suppliers i Shipping/customers (ta sama encja? duplikacja?); customer prices: tiery, waluta, okresy ważności, nakładające się cenniki → deterministyczny wybór.
- **Priorytet**: P1

### UI-036: Sign-off policies / Authorization policies / Sign-off & PINs
- **Co sprawdza**: Włączenie polityki e-sign dla operacji (np. changeover dual-sign, adjustment decrease) faktycznie wymusza podpis w tych flow; wyłączenie zdejmuje wymóg; scanner-auth zarządza PIN-ami (reset, lockout release).
- **Priorytet**: P0

### UI-037: Scanner devices
- **Co sprawdza**: Rejestracja/dezaktywacja urządzeń; dezaktywowane urządzenie nie loguje się.
- **Priorytet**: P1

### UI-038: Label templates + Document numbering
- **Co sprawdza**: Edycja szablonu etykiety → print-label używa nowego; document numbering (maski) spójne z XC-035; podgląd maski; zmiana maski nie łamie istniejącej sekwencji.
- **Priorytet**: P1

### UI-039: Feature flags — DWA ekrany (features i flags)
- **Co sprawdza**: /settings/features vs /settings/flags (L) — ustalić różnicę (org-flags vs low-level?); zmiana flagi skutkuje w aplikacji bez redeployu; flaga per-org nie przecieka (XC-043).
- **Priorytet**: P1

### UI-040: Rules registry / Tenant variations
- **Co sprawdza**: Rejestr reguł (np. count_variance_warn_pct w tenant_variations.feature_flags) — edycja wartości zmienia zachowanie (próg wariancji, expiry_warning_days); walidacja typów wartości.
- **Priorytet**: P1

### UI-041: Email templates + variables
- **Co sprawdza**: Edycja szablonu (invite, notyfikacje) → wysyłka używa szablonu; zmienne podstawiane; nieznana zmienna → walidacja; XSS w szablonie nie wykonuje się.
- **Priorytet**: P1

### UI-042: Shipping override reasons
- **Co sprawdza**: CRUD powodów; użycie w flow override w Shipping; usunięcie powodu w użyciu.
- **Priorytet**: P2

### UI-043: Import / Export (settings)
- **Co sprawdza**: Hub importu/eksportu danych referencyjnych — zgodność z XC-029…034; eksport kompletny; reimport eksportu = no-op.
- **Priorytet**: P1

### UI-044: Onboarding wizard (settings) — ponowne uruchomienie
- **Co sprawdza**: Wejście w wizard z istniejącymi danymi nie duplikuje seedów.
- **Priorytet**: P2

### UI-045: My account: profile, notifications, E-sign & scanner PIN
- **Co sprawdza**: Zmiana profilu; preferencje notyfikacji respektowane przez wysyłki; ustawienie/zmiana PIN (stary PIN wymagany? lockout po zmianie zresetowany); PIN nie w plaintext w odpowiedziach API.
- **Priorytet**: P1

### UI-046: Compliance profile
- **Co sprawdza**: Ekran /settings/compliance — pola profilu zgodności; wpływ na moduł Technical/compliance.
- **Priorytet**: P2

### UI-047: D365 screens (connection, mapping, cost-import, DLQ shipping)
- **Co sprawdza**: Connection test (health), zapis credentiali (nie wracają plaintextem), mapping CRUD, cost-import (powiązany z TEC d365-import), DLQ shipping — spójnie z XC-011…016.
- **Priorytet**: P1

## Przekrojowe UI (z lekcji kampanii)

### UI-048: Modal footer clip @720px
- **Co sprawdza**: Wszystkie form-modale (create WO/PO/TO, supplier, item…) na viewport 1280×720: stopka z przyciskami widoczna bez scrolla lub modal scrollowalny (regresja MODAL FOOTER CLIP z 2026-07-09).
- **Priorytet**: P1

### UI-049: Sesja idle — re-login bez utraty kontekstu
- **Co sprawdza**: Po wygaśnięciu sesji (szybki idle na prod) akcja na otwartym ekranie → redirect do logina i powrót na ten sam ekran; niezapisany formularz — ustalić kontrakt (utrata z ostrzeżeniem?).
- **Priorytet**: P1

### UI-050: Empty-states wszystkich list
- **Co sprawdza**: Każda lista modułowa ze świeżym orgiem (0 rekordów) renderuje sensowny empty-state z CTA, nie pustą tabelę/crash.
- **Priorytet**: P2

### UI-051: Paginacja i "Showing X of Y"
- **Co sprawdza**: Listy >1 strony: nawigacja stron, licznik zgodny z faktyczną liczbą, filtry resetują stronę do 1.
- **Priorytet**: P2

### UI-052: PWA /sw.js + manifest
- **Co sprawdza**: /sw.js zwraca 200 (regresja C009); instalacja PWA skanera; update SW nie łamie zalogowanej sesji.
- **Priorytet**: P2

## Niepewności (runda 2)
1. UI-006: nie ustaliłem, czy "Premium" ma realny plan-gating.
2. UI-028: kontrakt offline skanera nieustalony z kodu.
3. UI-039: różnica features vs flags (L) do ustalenia.
4. Yard i OEE nie odwiedzone w tej rundzie (pokryte kodowo w C/D); zalecany osobny przebieg interaktywny przy wykonywaniu testów.


---
<a id="sekcja-j"></a>
# Sekcja J — Warianty konfiguracji i zachowań łańcuchów E2E (XC-049…XC-056)

Rozbicie 8 happy-path'ów z sekcji G ("Łańcuchy międzymodułowe E2E") na macierze wariantów
konfiguracji, danych, zakłóceń, ról i współbieżności. Każdy wariant = jeden test E2E przeciw
prod-like DB. Anchory `plik:linia` wskazują guard/status rozstrzygający oczekiwanie (z sekcji A–H
+ weryfikacja z kodu). ID: `E2E-<łańcuch>-<nr>`.

**Konwencje wspólne (obowiązują we wszystkich łańcuchach):**
- `available = quantity − reserved_qty` (`movement.ts:688`, `adjust-form-actions.ts:170`).
- Waluta: **tylko GBP**. Nie-GBP przy każdym księgowaniu WAC → `unsupported_currency` (`upsert-wac.ts:33`, `book-receipt-wac.ts:90-92`); brak tabeli FX — nigdy cicha konwersja.
- **Catch-weight: BRAK ścieżki wychwytu wagi rzeczywistej na przyjęciu/output** (jest tylko yard net-weight `yard-actions.ts:166-176` i nocny cron wariancji `lib/cron/catch-weight-variance.ts`). W każdym łańcuchu, gdzie kg ≠ nominal, odnotować że qty jest nominalne, nie ważone → wariant "catch-weight brak" = udokumentowana luka.
- `avg_cost = total_value / total_qty_kg` liczone w DB (`upsert-wac.ts:95-177`); valuation grupowane item×currency, nie per-magazyn (`get-inventory-valuation.ts:39-76,132-147`).
- **site_id=NULL bypass** (znany, świadomy? — wymaga decyzji ownera): warehouse NULL omija guard przyjęcia (`receive-po-line-core.ts:179-181`), LP NULL przechodzi pick-guard (`movement.ts:535`).

---

## Łańcuch XC-049: PO → GRN → putaway → WO → konsumpcja → output → SO → pick → pack → ship → POD

### Macierz wymiarów

| Wymiar | Wartości |
|---|---|
| Ścieżka receive | desktop confirm vs scanner (`scanner/receive-po.ts`) |
| Kompletność receive | pełne / partial (kilka GRN na linię) / over 100–110% / over >110% |
| QC na przyjęciu | `require_grn_qc_inspection`=true (pending inspection) vs false |
| Putaway | putaway promuje received→available vs LP zostaje received |
| Ścieżka picku (do WO) | reserve→consume vs FEFO-auto (`v_inventory_available`) |
| Ścieżka picku (SO) | desktop vs scanner; pełny vs short-pick/partial |
| UoM | each vs box (pack hierarchy) vs kg (konwersja `consumption-qty-to-kg`) |
| Expiry/allergen | z expiry / bez; z alergenami / bez |
| BOM | 1-poziomowy vs wielopoziomowy (WIP dependency `upstream-wip-dependency-gate.ts`) |
| Shipment | pełny vs partial (kilka shipmentów per SO) |
| Zakłócenia | hold w środku, LP expiry w trakcie, cancel na etapie, reverse/void |
| Rola | admin vs operator z min-permem per etap; scanner-RBAC/PIN |
| Współbieżność | 2 userów na LP/GRN-line/pick (`FOR UPDATE`, 5-min lock, advisory) |

### E2E-049-01: Happy path pełny, desktop, each, z reserve, z expiry
- **Konfiguracja**: single-site, `require_grn_qc_inspection`=false, item "each", BOM 1-poziomowy, admin.
- **Przebieg**: PO→GRN pełne→putaway→reserve LP pod WO→consume→register output→SO→allocate→pick→pack→BOL sign→ship→POD.
- **Oczekiwania końcowe**: LP surowca `consumed` qty=0; FG LP `shipped`; genealogia ciągła RM-LP→FG→shipment; `Σ valuation = Σ ledger`; SO `delivered` (`ship-actions.ts:824-827`); audit kompletny.
- **Priorytet**: P0

### E2E-049-02: Ścieżka scanner zamiast desktop (receive+pick)
- **Konfiguracja**: jak 01, ale scanner przyjęcie i pick, PIN operatora.
- **Przebieg**: receive przez `scanner/receive-po.ts`; pick przez `pick/route.ts`.
- **Oczekiwania końcowe**: identyczne stany jak 01; scanner site-access pre-check (`scanner/receive-po.ts:167-169`, `pick/route.ts:41-68`); PIN-RBAC egzekwowany (`verify-pin.ts:45`).
- **Priorytet**: P0

### E2E-049-03: Partial receipt — kilka GRN na jedną linię PO
- **Konfiguracja**: PO linia 100, dostawy 40+40+20.
- **Przebieg**: 3× receive; po każdym GRN dokument zawiera tylko przyjęte (`grn-document.ts`).
- **Oczekiwania końcowe**: suma przyjęć = 100; 3 LP; linia PO status z progressu; brak nadwyżki.
- **Priorytet**: P0

### E2E-049-04: Over-receipt 100–110% — desktop wymaga confirm
- **Konfiguracja**: PO 100, receive 105 na desktop bez confirm-flag.
- **Przebieg**: pierwszy call bez `confirmOverReceive` → wymóg potwierdzenia; drugi z confirm.
- **Oczekiwania końcowe**: desktop bez confirm → blok/prompt (`receive-po-line-core.ts`); z confirm → 105 przyjęte; asymetria wobec 049-05.
- **Priorytet**: P0

### E2E-049-05: Over-receipt 100–110% — scanner przepuszcza CICHO
- **Konfiguracja**: PO 100, scanner receive 105.
- **Przebieg**: scanner ma hardcoded `confirmOverReceive:true` → brak promptu.
- **Oczekiwania końcowe**: 105 przyjęte bez potwierdzenia (WH-018, `scanner/receive-po.ts`); test dokumentuje asymetrię desktop/scanner jako świadomą.
- **Priorytet**: P1

### E2E-049-06: Over-receipt >110% — HARD block (obie ścieżki)
- **Konfiguracja**: PO 100, receive 111.
- **Przebieg**: desktop i scanner osobno.
- **Oczekiwania końcowe**: `cap=(ordered*110)/100`; `afterLine>cap → over_receive_cap` (`receive-po-line-core.ts:144-152`); scanner 409 + audit (`scanner/receive-po.ts:328-336`).
- **Priorytet**: P0

### E2E-049-07: QC-on-receipt ON — LP czeka na inspekcję przed konsumpcją
- **Konfiguracja**: `require_grn_qc_inspection`=true.
- **Przebieg**: receive → `quality_inspections` pending; próba reserve/consume przed release.
- **Oczekiwania końcowe**: LP qa_status=pending; niewidoczny w FEFO (`v_inventory_available` filtruje qa='released'); konsumpcja `lp_not_released` do czasu inspekcji (WH-034, D-warehouse:159).
- **Priorytet**: P0

### E2E-049-08: UoM box — pack hierarchy przy receive i pick
- **Konfiguracja**: item w boxach (pack_hierarchy), BOM w each.
- **Przebieg**: receive box→rozbicie na each; pick pakuje each w box (`pack-lp-into-box.ts:159-178`).
- **Oczekiwania końcowe**: konwersja UoM spójna; `pack_hierarchy_incomplete` gdy per_box niekompletny na release WO (`releaseWorkOrder.ts:191-227`).
- **Priorytet**: P1

### E2E-049-09: UoM kg — konsumpcja z konwersją, 6dp
- **Konfiguracja**: RM w kg, BOM per-kg, output kg.
- **Przebieg**: consume z qty w kg → `consumption-qty-to-kg` (`consume-material-core.ts:39-67`); output kg.
- **Oczekiwania końcowe**: brak cichej truncacji; `qty_scale_exceeded`/`qty_range_exceeded` przy >6dp (PRD, `consume-material-core.ts:39-67`); WAC debit w kg.
- **Priorytet**: P0

### E2E-049-10: FEFO-auto zamiast jawnej rezerwacji
- **Konfiguracja**: 3 LP tego samego itemu, różne expiry; konsumpcja bez reserve.
- **Przebieg**: consume wybiera FEFO `order by expiry_date asc, lp_number asc for update` (`consume-material-actions.ts:397-853`).
- **Oczekiwania końcowe**: najstarszy expiry pierwszy; `for update` serializuje; reserved_qty niezmienione dla pozostałych.
- **Priorytet**: P0

### E2E-049-11: Partial pick SO — dwa shipmenty, SO partially_delivered
- **Konfiguracja**: SO 100, pick 60 → ship → pick 40 → ship.
- **Przebieg**: pierwszy POD gdy istnieje drugi nie-delivered shipment.
- **Oczekiwania końcowe**: po 1. POD SO `partially_delivered`; po 2. `delivered` (SFQ-048, `ship-actions.ts`); delivery-note per shipment tylko wysłane linie (`delivery-note-document.ts`, XC-036).
- **Priorytet**: P0

### E2E-049-12: Short-pick — mniej niż zaalokowano
- **Konfiguracja**: alokacja 100, dostępne fizycznie 80.
- **Przebieg**: pick 80, reszta niedostępna.
- **Oczekiwania końcowe**: shipment na 80; alokacja rozliczona; SO progress uwzględnia niedobór; brak ujemnych stanów.
- **Priorytet**: P1

### E2E-049-13: Hold nałożony na RM-LP PO putaway, PRZED konsumpcją
- **Konfiguracja**: LP available, hold `lp` założony.
- **Przebieg**: consume próbuje wziąć zablokowany LP.
- **Oczekiwania końcowe**: `quality_hold_active` + emit `production.consume.blocked` `{holdId,lpId}` (`consume-material-actions.ts:440-454`), przed shortage (PRD-038 kolejność).
- **Priorytet**: P0

### E2E-049-14: Hold na FG-LP po output, przed/po alokacji SO
- **Konfiguracja**: FG wyprodukowany, hold założony.
- **Przebieg**: (a) hold przed allocate → wykluczony z alokacji (`v_active_holds`, SFQ-018); (b) hold po allocate, przy picku → `lp_blocked_for_pick` (`pick-actions.ts:43-77`); (c) po pack przy ship → `lp_blocked_for_ship` + rollback (SFQ-040).
- **Oczekiwania końcowe**: re-assert food-safety na KAŻDYM egress (alloc/pick/pack/ship); żaden zablokowany LP nie opuszcza magazynu.
- **Priorytet**: P0

### E2E-049-15: LP expiry mija w trakcie łańcucha (między putaway a pick)
- **Konfiguracja**: LP z expiry = jutro; symulacja upływu.
- **Przebieg**: LP FEFO-visible mimo expiry, blok na egress.
- **Oczekiwania końcowe**: `v_inventory_available` NIE filtruje expiry (WH-128); pick `lp_expired`, reserve `invalid_state`; consume `lp_expired` (PRD-038).
- **Priorytet**: P1

### E2E-049-16: Cancel PO po partial receipt
- **Konfiguracja**: PO 100, przyjęto 40, cancel PO.
- **Przebieg**: cancel reszty linii.
- **Oczekiwania końcowe**: 40 pozostaje jako LP available; niezrealizowane 60 zamknięte; brak wpływu na już przyjęte WAC.
- **Priorytet**: P1

### E2E-049-17: Cancel WO po częściowej konsumpcji (pełny detal → XC-054)
- **Konfiguracja**: WO skonsumował 30/100, cancel.
- **Przebieg**: patrz XC-054; tu weryfikacja spójności ledgera w łańcuchu.
- **Oczekiwania końcowe**: WAC odwrócony tylko za skonsumowane; output-LP void przed cancel (`complete-cancel-wo.ts:476-492`).
- **Priorytet**: P0

### E2E-049-18: Cancel SO po picku (przed ship) — kaskada
- **Konfiguracja**: SO allocated+picked, shipment `packed`, cancel SO.
- **Przebieg**: cancel SO kaskadowo anuluje otwarte shipmenty (SFQ-013).
- **Oczekiwania końcowe**: alokacje zwolnione (`cancelShipment.ts:642-644`); LP wracają do available; SO `cancelled`; blok gdy shipment `delivered` (`cancelShipment.ts:104,620-627`).
- **Priorytet**: P0

### E2E-049-19: Cancel shipment po pack (przed ship) — WAC credits
- **Konfiguracja**: shipment `packed`, e-sign cancel.
- **Przebieg**: cancelShipment pre-ship.
- **Oczekiwania końcowe**: restore LP + `applyShipmentWacCancelCredits` przywraca kwoty ze snapshotu debetu, pomija `unresolved_uom` (`cancelShipment.ts:646-685`, `upsert-wac.ts:472-494`); pudła void (`:780-904`).
- **Priorytet**: P0

### E2E-049-20: Void POD — delivered→shipped, blok przy fakturze
- **Konfiguracja**: shipment `delivered`, potem faktura.
- **Przebieg**: (a) voidPod na `shipped` → błąd; (b) na `delivered` z e-sign; (c) po fakturze → `downstream_financial_record`.
- **Oczekiwania końcowe**: `assertNoDownstreamFinancialRecords` blokuje (`cancelShipment.ts:906-1025,467-515`).
- **Priorytet**: P1

### E2E-049-21: Reverse-receive GRN (cofnięcie przyjęcia) + WAC reversal snapshot
- **Konfiguracja**: przyjęto 50kg@3 (WAC=150), avg zmieniony innymi ruchami, reverse.
- **Przebieg**: reverse-receive (`reverse-receive.ts:414-650`).
- **Oczekiwania końcowe**: cofnięto DOKŁADNIE 150 (snapshot), nie 50×nowy_avg (SFQ-074); LP receive zniknięty/zdestruowany; genealogia zachowana.
- **Priorytet**: P0

### E2E-049-22: Operator z minimalnym permem per etap
- **Konfiguracja**: operator ma tylko `warehouse.receive`; brak `planning`/`ship.*`.
- **Przebieg**: przechodzi receive, blokuje się na consume (brak permu produkcji), potem na ship (`ship.bol.sign`, `ship.so.cancel`).
- **Oczekiwania końcowe**: 403 na pierwszym etapie bez permu; łańcuch nie postępuje; brak częściowego zapisu.
- **Priorytet**: P1

### E2E-049-23: Współbieżność — 2 userów pickuje ten sam LP
- **Konfiguracja**: 1 pickable LP, 2 sesje.
- **Przebieg**: równoległy pick.
- **Oczekiwania końcowe**: `FOR UPDATE` na LP (`pick-actions.ts:277`); brak double-pick; drugi dostaje `lp_locked`/pusty.
- **Priorytet**: P0

### E2E-049-24: Współbieżność — 2× consume tego samego (idempotency key)
- **Konfiguracja**: ten sam `transaction_id`.
- **Przebieg**: powtórzony consume.
- **Oczekiwania końcowe**: drugi `{replay:true}` bez dekrementu; `wo_material_consumption.transaction_id` UNIQUE + `pg_advisory_xact_lock` (`consume-material-actions.ts:205-210,438-492`).
- **Priorytet**: P0

### E2E-049-25: Qty na granicy — split całego available zablokowany
- **Konfiguracja**: LP qty=100 reserved=20 (avail=80); split 80.
- **Przebieg**: split 80 vs 79.
- **Oczekiwania końcowe**: `split_qty < (quantity-reserved_qty)` ostra nierówność → 80 błąd, 79 OK (`lp-split-merge-destroy-actions.ts:305-314`).
- **Priorytet**: P1

### E2E-049-26: Qty ujemne / zero — constraints DB
- **Konfiguracja**: próba UPDATE quantity=-1 lub reserved>quantity app-rolą.
- **Przebieg**: bezpośredni SQL.
- **Oczekiwania końcowe**: `quantity>=0`, `reserved_qty>=0`, `reserved_qty<=quantity` violation (WH-124); LP 0-qty niewidoczny w FEFO (`v_inventory_available`).
- **Priorytet**: P1

### E2E-049-27: Alergeny — konsumpcja RM alergennego do FG, cascade
- **Konfiguracja**: RM z alergenami, FG dziedziczy.
- **Przebieg**: consume→output; allergen cascade (`allergen-cascade.tsx:73-74`).
- **Oczekiwania końcowe**: FG allergen-profile = union RM; cascade idempotentny (UPSERT); zgodność forward w recall (XC-051).
- **Priorytet**: P1

### E2E-049-28: Ship bez podpisanego BOL — bol_not_signed
- **Konfiguracja**: shipment packed+sealed, BOL niepodpisany.
- **Przebieg**: shipShipment.
- **Oczekiwania końcowe**: `bol_not_signed` (SFQ-038); `FOR UPDATE` na shipmencie (`ship-actions.ts:379`); brak shipu bez e-sign.
- **Priorytet**: P0

### E2E-049-29: Duplicate POD — invalid_state
- **Konfiguracja**: recordPod 2×.
- **Przebieg**: drugi POD na już-delivered.
- **Oczekiwania końcowe**: wymaga status `shipped`; drugi `invalid_state` (`ship-actions.ts:814-816,824-827`).
- **Priorytet**: P1

### E2E-049-30: Multi-site — RM w site A, WO w site A, SO ships z site A (baseline izolacji)
- **Konfiguracja**: multi-site org, user site A.
- **Przebieg**: cały łańcuch w obrębie A.
- **Oczekiwania końcowe**: user nie widzi żadnych obiektów site B (`user_can_see_site`, WH-110); szczegóły cross-site → XC-053.
- **Priorytet**: P1

### E2E-049-31: Konsumpcja FEFO-deviation — jawny wybór LP nie-FEFO
- **Konfiguracja**: operator wybiera LP nie-najstarszy z reasonem.
- **Przebieg**: consume z deviation.
- **Oczekiwania końcowe**: `fefo_adherence_flag=false` + `fefo_deviation_reason` zapisane (`consume-material-actions.ts:697-733`).
- **Priorytet**: P2

### E2E-049-32: Insufficient input dla output — gate wydajności
- **Konfiguracja**: output_kg > sensownie możliwe z konsumpcji.
- **Przebieg**: complete WO.
- **Oczekiwania końcowe**: `closed_production_strict_failed`, `consumption_yield_out_of_tolerance`/`output_yield_gate_failed` (`complete-cancel-wo.ts:200-223`, `evaluate-closed-production-strict.ts:77-83`); override wymaga PIN+perm `production.wo.override_yield`.
- **Priorytet**: P0

### E2E-049-33: Spójność księgowa końcowa (property)
- **Konfiguracja**: po pełnym łańcuchu.
- **Przebieg**: zliczenie valuation vs ledger.
- **Oczekiwania końcowe**: `Σ(qty_kg×avg_cost) = Σ ledger`; `Σ LP.quantity ≥ Σ reserved`; RM consumed qty=0; szczegóły → XC-056.
- **Priorytet**: P0

### E2E-049-34: site_id=NULL warehouse — receive omija site-guard (edge)
- **Konfiguracja**: warehouse site_id=NULL, PO z site.
- **Przebieg**: receive do NULL-warehouse.
- **Oczekiwania końcowe**: guard site BYPASSowany (`receive-po-line-core.ts:179-181`); LP potem przechodzi pick-guard (`movement.ts:535`) — test dokumentuje lukę do decyzji ownera.
- **Priorytet**: P1

---

## Łańcuch XC-050: NPD → Technical → Planning → Production

### Macierz wymiarów

| Wymiar | Wartości |
|---|---|
| Sekwencja gate | G0→G1→…→Launched krok-po-kroku vs skok |
| Typ gate | HARD blocker vs SOFT (override) vs e-sign (G3/G4) |
| Uprawnienia | npd.gate.advance / npd.gate.approve / npd.planning.write |
| FG mapping | createFgCandidate nowy vs konflikt (FG_ALREADY_LINKED) |
| Model kosztu | net vs ÷(1−scrap) — WIP vs koszt WO |
| BOM/routing | 1-poziomowy vs wielopoziomowy z WIP dependency |
| Launch compliance | required criteria pending vs warn vs C7 forced |

### E2E-050-01: Happy path — G0→…→Launched→releaseToFactory→WO wykonalne
- **Konfiguracja**: admin z pełnymi permami, BOM 1-poziomowy.
- **Przebieg**: kolejne advanceProjectGate; approve G3/G4 z hasłem; createFgCandidate; factory_specs active; release WO; produkcja.
- **Oczekiwania końcowe**: FG w `product`/`formulations`/`items.npd_project_id` (`gate-helpers.ts:828-917`); factory_spec active; WO planowalne i wykonalne; koszt WIP spójny z kosztem WO (net vs scrap).
- **Priorytet**: P0

### E2E-050-02: Skok gate G0→G3 — GATE_SEQUENCE_VIOLATION
- **Konfiguracja**: projekt w G0+brief.
- **Przebieg**: advance z targetStage=G3.
- **Oczekiwania końcowe**: `GATE_SEQUENCE_VIOLATION` 422 (`gate-helpers.ts:254-309`); `ADJACENCY_VIOLATION` dla nie-sąsiednich stage (`:133-137`).
- **Priorytet**: P0

### E2E-050-03: G0+brief → gate-only advance G1 (stage zostaje brief)
- **Konfiguracja**: G0+brief.
- **Przebieg**: advance.
- **Oczekiwania końcowe**: gate-only G1, stage nadal `brief` (`gate-helpers.ts:347-369`).
- **Priorytet**: P1

### E2E-050-04: HARD blocker — brak składników recepty
- **Konfiguracja**: recepta bez ingredients.
- **Przebieg**: advance.
- **Oczekiwania końcowe**: `RECIPE_INGREDIENTS_REQUIRED` → `BLOCKERS_PRESENT` 409 (`gate-helpers.ts:568-576`, `advance-project-gate.ts:308-315`).
- **Priorytet**: P0

### E2E-050-05: SOFT gate — blok bez override, PASS z override+audit
- **Konfiguracja**: niespełniony soft-gate.
- **Przebieg**: (a) bez override → `SOFT_GATE_BLOCKED` z `missing[]`; (b) z override.note.
- **Oczekiwania końcowe**: (a) 409 (`advance-project-gate.ts:236-272`); (b) PASS + `writeGateOverrideAudit` `npd.stage.gate_overridden` (`:209-234`).
- **Priorytet**: P1

### E2E-050-06: G3 e-sign wymagany do approval
- **Konfiguracja**: pilot/G3 bez gate_approvals G3.
- **Przebieg**: advance do approval.
- **Oczekiwania końcowe**: `assertG3ESignForApproval` → `ESIGN_REQUIRED` 403; wymaga wiersza gate_approvals gate_code=G3 approved z `esigned_at`/`esign_hash` (`gate-helpers.ts:519-535`).
- **Priorytet**: P0

### E2E-050-07: G4 e-sign do handoff
- **Konfiguracja**: G4 handoff bez e-sign.
- **Przebieg**: advance.
- **Oczekiwania końcowe**: `assertG4ESignForHandoff` → `ESIGN_REQUIRED` 403 (`gate-helpers.ts:495-511`).
- **Priorytet**: P0

### E2E-050-08: approveProjectGate — approve wymaga hasła, reject nie
- **Konfiguracja**: approve bez password / reject bez.
- **Przebieg**: approveProjectGate.
- **Oczekiwania końcowe**: approve bez password invalid; reject dozwolony bez (`approve-project-gate.ts:35-50`); immutable e-sign tylko na approve (`:102-122`).
- **Priorytet**: P0

### E2E-050-09: GATE_MISMATCH — approve złym gateCode
- **Konfiguracja**: projekt G3, approve gateCode=G4.
- **Przebieg**: approveProjectGate.
- **Oczekiwania końcowe**: `GATE_MISMATCH` 409 (`approve-project-gate.ts:80-82`).
- **Priorytet**: P1

### E2E-050-10: Brak permu npd.gate.advance / npd.gate.approve
- **Konfiguracja**: user bez permu.
- **Przebieg**: advance/approve.
- **Oczekiwania końcowe**: FORBIDDEN 403 (`advance-project-gate.ts:281`, `approve-project-gate.ts:74`).
- **Priorytet**: P0

### E2E-050-11: FG conflict — FG_ALREADY_LINKED
- **Konfiguracja**: FG już podpięty do innego projektu.
- **Przebieg**: createFgCandidate/map.
- **Oczekiwania końcowe**: `FG_ALREADY_LINKED` blocker (`gate-helpers.ts:580-588`, `findFgConflict:1233-1249`).
- **Priorytet**: P1

### E2E-050-12: Launch compliance — required pending blokuje, warn nie
- **Konfiguracja**: pending required criteria.
- **Przebieg**: advance do launched.
- **Oczekiwania końcowe**: `LAUNCH_COMPLIANCE_BLOCKED` (`gate-helpers.ts:602-652`); warn nie blokuje.
- **Priorytet**: P1

### E2E-050-13: C7 forced przy 0 valid docs mimo not_required
- **Konfiguracja**: C7=not_required, 0 non-deleted/non-expired docs.
- **Przebieg**: advance do launched.
- **Oczekiwania końcowe**: wymuszony C7 (`gate-helpers.ts:630-640`).
- **Priorytet**: P2

### E2E-050-14: releaseToFactory → WO release, non-DRAFT blok
- **Konfiguracja**: factory spec active, WO w RELEASED vs non-DRAFT.
- **Przebieg**: releaseWorkOrder.
- **Oczekiwania końcowe**: RELEASED idempotent; non-DRAFT (poza RELEASED) → `invalid_state`; `pack_hierarchy_incomplete` przy niekompletnym per_box; perm `npd.planning.write` (`releaseWorkOrder.ts:191-227`).
- **Priorytet**: P0

### E2E-050-15: WO wielopoziomowy — upstream WIP dependency
- **Konfiguracja**: BOM z WIP producentem (wo_dependencies).
- **Przebieg**: start/complete downstream WO.
- **Oczekiwania końcowe**: `upstream_wip_not_ready` gdy `posted_output_kg<required` (`upstream-wip-dependency-gate.ts:39-97`, `complete-cancel-wo.ts:132-138`); sufficiency z `wo_outputs.qty_kg` primary, nie `produced_quantity`.
- **Priorytet**: P0

### E2E-050-16: Model kosztu — WIP net vs ÷(1−scrap) spójność
- **Konfiguracja**: recepta ze scrapem.
- **Przebieg**: porównaj koszt NPD WIP z kosztem WO.
- **Oczekiwania końcowe**: koszty spójne co do modelu (net vs scrap-adjusted); brak podwójnego liczenia scrapu; GBP only (`WO_REPORTING_CURRENCY=GBP`).
- **Priorytet**: P1

---

## Łańcuch XC-051: Recall / trace — forward i backward

### Macierz wymiarów

| Wymiar | Wartości |
|---|---|
| Kierunek | forward (RM→FG/shipment/klient) vs backward (shipment→dostawca) |
| Genealogia | prosta vs split vs merge vs wielopoziomowa (depth<20) |
| Zakres widoczności | org-wide (SECURITY DEFINER) vs site-restricted user |
| Mass-balance | zgodny (ε=0.001kg) vs rozjazd |
| Stan LP w drodze | consumed/shipped/destroyed/on-hold |
| Cykl/self-loop | genealogia z próbą cyklu |

### E2E-051-01: Forward trace prosty — RM-LP → FG → shipment → klient
- **Konfiguracja**: łańcuch z XC-049-01.
- **Przebieg**: od LP surowca forward.
- **Oczekiwania końcowe**: znajduje wszystkie FG/shipmenty/klientów przez konsumpcje+genealogię; ciągłość do shipmentu.
- **Priorytet**: P0

### E2E-051-02: Backward trace — shipment → FG → WO → RM → dostawca/GRN
- **Konfiguracja**: jak 01.
- **Przebieg**: od shipmentu wstecz.
- **Oczekiwania końcowe**: dochodzi do dostawcy i numeru GRN; batch/expiry zachowane.
- **Priorytet**: P0

### E2E-051-03: Forward przez split — jeden RM-LP w wielu WO
- **Konfiguracja**: RM-LP split na 2, każdy do innego WO/FG.
- **Przebieg**: forward.
- **Oczekiwania końcowe**: oba FG w wynikach; genealogia 'split' (`lp-split-merge-destroy-actions.ts:328-397`).
- **Priorytet**: P0

### E2E-051-04: Forward przez merge — kilka RM-LP w jeden
- **Konfiguracja**: 2 RM-LP merge→1, potem konsumpcja.
- **Przebieg**: forward od każdego pierwotnego LP.
- **Oczekiwania końcowe**: oba prowadzą do wspólnego FG; merge tylko rodzeństwo reserved=0 (`:449-518`).
- **Priorytet**: P1

### E2E-051-05: Wielopoziomowa genealogia (WIP→WIP→FG), cap depth 20
- **Konfiguracja**: łańcuch 3+ poziomów WIP.
- **Przebieg**: trace org-wide (definer).
- **Oczekiwania końcowe**: cap depth 20, cycle-proof (WH-genealogia); pełna ścieżka.
- **Priorytet**: P0

### E2E-051-06: Self-loop / cykl w lp_genealogy odrzucony
- **Konfiguracja**: próba wstawienia self-parent.
- **Przebieg**: insert genealogy.
- **Oczekiwania końcowe**: odrzucenie self-loop; trace terminuje przy depth 20.
- **Priorytet**: P1

### E2E-051-07: Mass-balance forward — Σin ≈ Σout (ε=0.001kg)
- **Konfiguracja**: WO z konsumpcją i outputem.
- **Przebieg**: bilans.
- **Oczekiwania końcowe**: |Σ konsumpcja − Σ output − scrap| ≤ 0.001kg; rozjazd = finding.
- **Priorytet**: P0

### E2E-051-08: Trace site-restricted user vs org-wide definer
- **Konfiguracja**: user site A, RM z site A skonsumowany w FG który shipuje z site B (jeśli możliwe) lub org-wide widok.
- **Przebieg**: trace jako restricted user.
- **Oczekiwania końcowe**: genealogia (SECURITY DEFINER) org-wide działa wg projektu; operacyjne listy restricted (`user_can_see_site`, XC-053).
- **Priorytet**: P1

### E2E-051-09: Recall obejmuje LP na holdzie i już shipped
- **Konfiguracja**: część FG shipped, część on-hold.
- **Przebieg**: forward recall.
- **Oczekiwania końcowe**: oba stany w wynikach recall (shipped→klient, on-hold→lokacja); żaden pominięty.
- **Priorytet**: P0

### E2E-051-10: Recall po destroyed/void output — genealogia zachowana
- **Konfiguracja**: output void'owany (XC-054).
- **Przebieg**: trace.
- **Oczekiwania końcowe**: LP `destroyed` qty=0 ale genealogia widoczna (`complete-cancel-wo.ts:494-650`); void nie kasuje historii.
- **Priorytet**: P1

### E2E-051-11: Backward — RMA/return wpięty w trace
- **Konfiguracja**: FG zwrócony (RMA restock).
- **Przebieg**: trace zwróconego LP.
- **Oczekiwania końcowe**: restock nie tworzy nowego ruchu WAC (SFQ-065); genealogia wskazuje pierwotny shipment.
- **Priorytet**: P2

### E2E-051-12: Forward z partial shipment — wiele klientów jednego batcha
- **Konfiguracja**: batch FG podzielony na 2 shipmenty do 2 klientów.
- **Przebieg**: forward.
- **Oczekiwania końcowe**: obaj klienci w recall; delivery-notes rozdzielne.
- **Priorytet**: P0

### E2E-051-13: Alergeny w recall — profil FG = union RM
- **Konfiguracja**: RM alergenny.
- **Przebieg**: forward z filtrem alergenu.
- **Oczekiwania końcowe**: FG oznaczony alergenem (cascade `allergen-cascade.tsx:73-74`); recall po alergenie kompletny.
- **Priorytet**: P1

### E2E-051-14: Trace po reverse-receive — znika z dalszej ścieżki
- **Konfiguracja**: GRN reverse'owany po częściowym użyciu.
- **Przebieg**: trace.
- **Oczekiwania końcowe**: reverse spójny z WAC snapshot (`reverse-receive.ts:414-650`); mass-balance nadal domyka się.
- **Priorytet**: P1

### E2E-051-15: Współbieżność — trace w trakcie aktywnej konsumpcji
- **Konfiguracja**: consume trwa, równoległy trace.
- **Przebieg**: read-only trace.
- **Oczekiwania końcowe**: trace nie blokuje consume; spójny snapshot (brak połowicznych wpisów `wo_material_consumption`).
- **Priorytet**: P2

### E2E-051-16: Recall cross-org izolacja
- **Konfiguracja**: 2 orgi, identyczne numery batch.
- **Przebieg**: trace w orgu A.
- **Oczekiwania końcowe**: brak wycieku LP orgu B; RLS `app.current_org_id()`.
- **Priorytet**: P0

### E2E-051-17: Backward do wielu dostawców (mixed batch)
- **Konfiguracja**: WO skonsumował RM z 2 dostawców.
- **Przebieg**: backward.
- **Oczekiwania końcowe**: obaj dostawcy w wyniku; proporcje wg konsumpcji.
- **Priorytet**: P1

### E2E-051-18: FEFO-legs decrease do 0 → destroyed, brak reanimacji
- **Konfiguracja**: LP zredukowany do 0 przez `data_entry_error`.
- **Przebieg**: trace.
- **Oczekiwania końcowe**: LP `destroyed` (WH-880); nie do reanimacji; historia w trace.
- **Priorytet**: P2

---

## Łańcuch XC-052: Hold cascade — hold na batchu blokuje wszystkie ścieżki wyjścia

### Macierz wymiarów

| Wymiar | Wartości |
|---|---|
| Typ holda | `lp` (pojedynczy) vs `batch` (po znormalizowanym numerze) |
| Ścieżka egress | pick (scanner+desktop), reserve, ship, consume WO, split, merge, output |
| Moment holda | przed vs w trakcie (po alloc/pick/pack) |
| Release disposition | release_as_is / scrap / rework / other |
| Drugi hold | pojedynczy release przy 2. aktywnym holdzie |
| Rola | quality.hold.create/release vs brak |

### E2E-052-01: Hold `batch` blokuje pick (desktop i scanner)
- **Konfiguracja**: hold na batch, LP tego batcha.
- **Przebieg**: pick desktop + scanner.
- **Oczekiwania końcowe**: `lp_blocked_for_pick` przez `assertNoActiveHoldForLp` (`pick-actions.ts:43-77`); `v_active_holds` match po znormalizowanym numerze.
- **Priorytet**: P0

### E2E-052-02: Hold blokuje reserve/alokację
- **Konfiguracja**: hold `lp`, allocate SO.
- **Przebieg**: allocate.
- **Oczekiwania końcowe**: LP wykluczony (join `v_active_holds`, SFQ-018).
- **Priorytet**: P0

### E2E-052-03: Hold blokuje konsumpcję WO
- **Konfiguracja**: hold na RM-LP.
- **Przebieg**: consume.
- **Oczekiwania końcowe**: `quality_hold_active` + emit `production.consume.blocked` (`consume-material-actions.ts:440-454`), przed shortage.
- **Priorytet**: P0

### E2E-052-04: Hold blokuje ship (re-assert po pack)
- **Konfiguracja**: hold założony między pack a ship.
- **Przebieg**: ship.
- **Oczekiwania końcowe**: `lp_blocked_for_ship` + rollback (SFQ-040).
- **Priorytet**: P0

### E2E-052-05: Hold blokuje pack
- **Konfiguracja**: hold po picku.
- **Przebieg**: pack.
- **Oczekiwania końcowe**: `lp_blocked_for_pack` (SFQ-035).
- **Priorytet**: P0

### E2E-052-06: Hold blokuje split
- **Konfiguracja**: hold na LP, split.
- **Przebieg**: splitLp.
- **Oczekiwania końcowe**: hold guard w SPLIT_MERGE (`lp-split-merge-destroy-actions.ts:277-443`); split odmówiony.
- **Priorytet**: P0

### E2E-052-07: Hold blokuje merge
- **Konfiguracja**: hold na jednym z rodzeństwa.
- **Przebieg**: mergeLps.
- **Oczekiwania końcowe**: blok gdy hold (`:449-518`).
- **Priorytet**: P0

### E2E-052-08: Hold blokuje register-output (produkcja)
- **Konfiguracja**: hold aktywny na WO-context LP.
- **Przebieg**: register output.
- **Oczekiwania końcowe**: 409 `quality_hold_active` + emit blocked (`register-output.ts:918-981`).
- **Priorytet**: P0

### E2E-052-09: Hold blokuje destroy
- **Konfiguracja**: hold + próba destroy.
- **Przebieg**: destroyLp.
- **Oczekiwania końcowe**: hold/reserved guard (`lp-split-merge-destroy-actions.ts:26,700`).
- **Priorytet**: P1

### E2E-052-10: Release holda przywraca WSZYSTKIE ścieżki
- **Konfiguracja**: po holdzie release (release_as_is) + e-sign.
- **Przebieg**: releaseHold, potem pick/reserve/consume.
- **Oczekiwania końcowe**: LP `blocked`→`available` (`:826-829`); `assertNoActiveHoldForLp` przechodzi (SFQ-105); wszystkie egressy odblokowane.
- **Priorytet**: P0

### E2E-052-11: Release disposition scrap → LP rejected
- **Konfiguracja**: release ze scrap.
- **Przebieg**: releaseHold scrap.
- **Oczekiwania końcowe**: LP→`rejected` (`:755`); nie wraca do available; WAC write-off wg reguł.
- **Priorytet**: P1

### E2E-052-12: Release disposition rework/other
- **Konfiguracja**: rework, other.
- **Przebieg**: releaseHold.
- **Oczekiwania końcowe**: mapowanie `release_as_is|scrap|rework|other` (`:746-753`); lp_state_history (`:848-897`).
- **Priorytet**: P2

### E2E-052-13: Release przy DRUGIM aktywnym holdzie — LP zostaje zablokowany
- **Konfiguracja**: 2 aktywne holdy na LP, release jednego.
- **Przebieg**: releaseHold #1.
- **Oczekiwania końcowe**: LP nadal `blocked` (SFQ-097); dopiero release obu odblokowuje.
- **Priorytet**: P0

### E2E-052-14: Idempotencja release — hold już released
- **Konfiguracja**: release 2×.
- **Przebieg**: releaseHold.
- **Oczekiwania końcowe**: idempotentnie (SFQ-096); brak podwójnej dyspozycji.
- **Priorytet**: P1

### E2E-052-15: Hold RBAC — brak quality.hold.create/release
- **Konfiguracja**: operator bez permu.
- **Przebieg**: create/release hold.
- **Oczekiwania końcowe**: 403; probe UI `canReleaseHolds` fail-closed (`can-release.ts:16-38`).
- **Priorytet**: P0

### E2E-052-16: Hold zakłada od razu qa_status=on_hold na LP
- **Konfiguracja**: create hold.
- **Przebieg**: hold.
- **Oczekiwania końcowe**: LP qa_status=on_hold (SFQ-093); natychmiast wykluczony z FEFO.
- **Priorytet**: P1

### E2E-052-17: Hold na batchu multi-LP — wszystkie LP batcha zablokowane naraz
- **Konfiguracja**: batch = 3 LP w różnych lokacjach.
- **Przebieg**: hold batch, próby egress na każdym LP.
- **Oczekiwania końcowe**: wszystkie 3 zablokowane (normalizacja numeru w `v_active_holds`); żaden nie przechodzi.
- **Priorytet**: P0

### E2E-052-18: Hold w środku WO — outputy →ON_HOLD, release przywraca snapshot
- **Konfiguracja**: hold WO.
- **Przebieg**: hold→outputy ON_HOLD (snapshot); release→przywróć.
- **Oczekiwania końcowe**: snapshot poprzednich statusów; pozostałe ON_HOLD→PENDING (C-production:442).
- **Priorytet**: P1

### E2E-052-19: Współbieżność — hold zakładany podczas trwającego picku
- **Konfiguracja**: pick w toku (FOR UPDATE), hold równolegle.
- **Przebieg**: race.
- **Oczekiwania końcowe**: pick który wziął LOCK kończy się; kolejny egress łapie hold; brak wysyłki zablokowanego.
- **Priorytet**: P1

### E2E-052-20: Hold po alokacji ale przed pick — re-assert łapie
- **Konfiguracja**: allocate OK, potem hold, potem pick.
- **Przebieg**: pick.
- **Oczekiwania końcowe**: `lp_blocked_for_pick` mimo wcześniejszej alokacji (SFQ-029) — food-safety re-assert na każdym kroku.
- **Priorytet**: P0

---

## Łańcuch XC-053: Multi-site — separacja operacyjna

### Macierz wymiarów

| Wymiar | Wartości |
|---|---|
| Widoczność | user site A vs site B vs multi-site user |
| Ścieżka | desktop (`user_can_see_site`) vs scanner (site pre-check) |
| Obiekt | LP/stany, WO, shipment, pick context, receive target |
| site_id | konkretny site vs NULL (bypass) |
| Widok org-wide | genealogia (SECURITY DEFINER) vs operacyjne listy |
| Cross-site op | pick LP innego site, receive do obcego site |

### E2E-053-01: User site A nie widzi stanów site B
- **Konfiguracja**: multi-site, user tylko A.
- **Przebieg**: listy inventory/LP.
- **Oczekiwania końcowe**: brak LP site B; `app.user_can_see_site` (`movement.ts:704`, `lp/route.ts:41`).
- **Priorytet**: P0

### E2E-053-02: User site A nie widzi WO/shipmentów site B
- **Konfiguracja**: jak 01.
- **Przebieg**: listy WO, shipments (linesRestricted).
- **Oczekiwania końcowe**: linie restricted; `ship/shipments/route.ts:71`.
- **Priorytet**: P0

### E2E-053-03: Pick LP z obcego site — lp_wrong_site
- **Konfiguracja**: WO material site A, LP site B.
- **Przebieg**: pick.
- **Oczekiwania końcowe**: `lp.site_id !== material.site_id → lp_wrong_site 409` (`movement.ts:535-537`) + route pre-check 404 (`pick/route.ts:41-68`).
- **Priorytet**: P0

### E2E-053-04: Scanner odmawia cross-site
- **Konfiguracja**: scanner user A, LP site B.
- **Przebieg**: scan LP.
- **Oczekiwania końcowe**: site-access odmowa (`scanner/receive-po.ts:167-169`; `user_can_see_site`).
- **Priorytet**: P0

### E2E-053-05: Receive do warehouse spoza site PO — odmowa
- **Konfiguracja**: PO site A, warehouse site B.
- **Przebieg**: receive.
- **Oczekiwania końcowe**: guard site (WH-023) odrzuca (`receive-po-line-core.ts:144-152` obszar site-check).
- **Priorytet**: P0

### E2E-053-06: LP site_id=NULL PRZECHODZI pick-guard (edge)
- **Konfiguracja**: LP site_id=NULL, WO material site A.
- **Przebieg**: pick.
- **Oczekiwania końcowe**: przechodzi bo warunek wymaga obu niepustych (`movement.ts:535`) — udokumentowana luka, decyzja ownera.
- **Priorytet**: P1

### E2E-053-07: Warehouse site_id=NULL — receive omija site-guard (edge)
- **Konfiguracja**: warehouse NULL, PO z site.
- **Przebieg**: receive.
- **Oczekiwania końcowe**: bypass (`receive-po-line-core.ts:179-181`) — świadome? finding.
- **Priorytet**: P1

### E2E-053-08: Pick context — tylko site widoczny + linia z tego site
- **Konfiguracja**: user A wybiera site+linię.
- **Przebieg**: context select.
- **Oczekiwania końcowe**: tylko `user_can_see_site`; linia bez site → `line_site_required` 400 (D-warehouse:501).
- **Priorytet**: P1

### E2E-053-09: Genealogia org-wide działa mimo site-restriction
- **Konfiguracja**: RM site A skonsumowany, user restricted.
- **Przebieg**: trace.
- **Oczekiwania końcowe**: SECURITY DEFINER trace org-wide OK (projekt), operacyjne listy nadal restricted.
- **Priorytet**: P0

### E2E-053-10: Multi-site user widzi oba site
- **Konfiguracja**: user z dostępem A+B.
- **Przebieg**: listy.
- **Oczekiwania końcowe**: `user_can_see_site` true dla obu; pełna widoczność.
- **Priorytet**: P1

### E2E-053-11: Cały łańcuch XC-049 w obrębie site A (izolacja end-to-end)
- **Konfiguracja**: PO→…→POD w A, obserwator z B.
- **Przebieg**: pełny cykl.
- **Oczekiwania końcowe**: obserwator B nie widzi żadnego artefaktu; stany/ledger izolowane per site w widokach.
- **Priorytet**: P0

### E2E-053-12: Valuation z filtrem site (`app.current_site_id()`)
- **Konfiguracja**: WAC per item×currency, raport przy aktywnym site A.
- **Przebieg**: valuation.
- **Oczekiwania końcowe**: site to filtr, NIE wymiar grupowania (`get-inventory-valuation.ts:132-147,73-75`).
- **Priorytet**: P1

### E2E-053-13: Ship z site A — shipment route site-scoped
- **Konfiguracja**: shipment site A.
- **Przebieg**: user B próbuje odczytać.
- **Oczekiwania końcowe**: 404/brak (`ship/shipments/route.ts:71`).
- **Priorytet**: P1

### E2E-053-14: Konsumpcja FEFO nie sięga LP innego site
- **Konfiguracja**: LP tego samego itemu w A i B.
- **Przebieg**: consume WO site A.
- **Oczekiwania końcowe**: FEFO tylko z site A (v_inventory_available scoped); LP B pominięty.
- **Priorytet**: P0

### E2E-053-15: Split/merge cross-site odrzucony
- **Konfiguracja**: 2 LP różne site.
- **Przebieg**: merge.
- **Oczekiwania końcowe**: brak na liście siblings (site mismatch); merge odmówiony.
- **Priorytet**: P1

### E2E-053-16: Cross-org izolacja (nie mylić z site) — RLS
- **Konfiguracja**: 2 orgi.
- **Przebieg**: dowolna lista.
- **Oczekiwania końcowe**: `app.current_org_id()` izoluje; site to sub-scope wewnątrz org.
- **Priorytet**: P0

### E2E-053-17: Scanner pick — context site pre-check przed FEFO
- **Konfiguracja**: scanner user A.
- **Przebieg**: pick session.
- **Oczekiwania końcowe**: pre-check site (`pick/route.ts:41-68` → 404 dla obcego); dopiero potem FEFO.
- **Priorytet**: P1

### E2E-053-18: Adjust/count na LP obcego site odmówiony
- **Konfiguracja**: user A, LP B.
- **Przebieg**: adjust.
- **Oczekiwania końcowe**: `user_can_see_site` blokuje (`movement.ts:358,704`).
- **Priorytet**: P1

---

## Łańcuch XC-054: Cancel-cascade — WO z rezerwacjami i częściową konsumpcją

### Macierz wymiarów

| Wymiar | Wartości |
|---|---|
| Moment cancel | DRAFT / RELEASED / IN_PROGRESS po częściowej konsumpcji |
| Rezerwacje | z rezerwacjami vs bez |
| Output | brak / live output LP / output z downstream usage |
| WAC | reversal tylko za skonsumowane |
| Rola | perm cancel vs brak |
| Współbieżność | cancel podczas trwającego consume |

### E2E-054-01: Cancel WO DRAFT/RELEASED bez konsumpcji
- **Konfiguracja**: WO RELEASED, brak konsumpcji.
- **Przebieg**: cancel.
- **Oczekiwania końcowe**: 200; status→cancelled; outbox `production.wo.closed` terminal='cancelled' (`complete-cancel-wo.ts:465-517`).
- **Priorytet**: P0

### E2E-054-02: Cancel WO po częściowej konsumpcji — WAC odwrócony tylko za skonsumowane
- **Konfiguracja**: skonsumowano 30/100.
- **Przebieg**: cancel.
- **Oczekiwania końcowe**: WAC reversal tylko za 30; RM-LP-genealogia zachowana; konsumpcja pozostaje w historii.
- **Priorytet**: P0

### E2E-054-03: Rezerwacje przy cancel — zwolnione LUB udokumentowane że NIE (PLN-024/025)
- **Konfiguracja**: WO z aktywnymi rezerwacjami, cancel.
- **Przebieg**: cancel, sprawdź reserved_qty.
- **Oczekiwania końcowe**: **ustalić z kodu** — release zeruje CAŁE reserved_qty bez granularności per-WO (`reservation-actions.ts:79-192,138`); jeśli cancel NIE woła release → reserved_qty zostaje (finding, rozjazd z PLN-024/025). Test zamraża realne zachowanie.
- **Priorytet**: P0

### E2E-054-04: Cancel WO z LIVE output LP — blok, najpierw void
- **Konfiguracja**: WO ma output LP available.
- **Przebieg**: cancel.
- **Oczekiwania końcowe**: 409 `invalid_state` `live_output_lps_present` + lista outputs (`complete-cancel-wo.ts:476-492`); trzeba najpierw void każdy.
- **Priorytet**: P0

### E2E-054-05: Void output LP → destroyed + WAC reversal
- **Konfiguracja**: void output.
- **Przebieg**: void.
- **Oczekiwania końcowe**: `applyOutputWacReversal`; lp_state_history→destroyed; LP status=destroyed qty=0 reserved=0; `voidedOutputLpIds` w outbox (`complete-cancel-wo.ts:494-650`).
- **Priorytet**: P0

### E2E-054-06: Output LP z downstream usage — void ZABLOKOWANY
- **Konfiguracja**: output LP już skonsumowany dalej.
- **Przebieg**: void.
- **Oczekiwania końcowe**: 409 `invalid_state` `output_lp_has_downstream_usage` `lpId`; brak reversal/destroy (`complete-cancel-wo.ts:494-508`, `lp-downstream-guard.ts`).
- **Priorytet**: P0

### E2E-054-07: Cancel IN_PROGRESS z upstream WIP downstream — spójność zależności
- **Konfiguracja**: WO jest upstream dla innego WO.
- **Przebieg**: cancel upstream po wyprodukowaniu części.
- **Oczekiwania końcowe**: downstream sufficiency z `wo_outputs.qty_kg` przelicza się; void output redukuje posted_output_kg → downstream może stać się `upstream_wip_not_ready`.
- **Priorytet**: P1

### E2E-054-08: Cancel bez uprawnienia
- **Konfiguracja**: operator bez perm cancel.
- **Przebieg**: cancel.
- **Oczekiwania końcowe**: 403 (`shared.ts:80-99` mapowanie forbidden→403).
- **Priorytet**: P1

### E2E-054-09: Współbieżność — cancel podczas trwającego consume
- **Konfiguracja**: consume w toku (advisory lock), cancel równolegle.
- **Przebieg**: race.
- **Oczekiwania końcowe**: `pg_advisory_xact_lock` serializuje (`consume-material-actions.ts:205-210`); jeden kończy pierwszy; brak połowicznej konsumpcji ani double-reversal.
- **Priorytet**: P1

### E2E-054-10: Cancel WO w stanie completed — kontrolowane completed→cancelled
- **Konfiguracja**: WO `completed`; jego output LP nie był konsumowany ani dzielony.
- **Przebieg**: cancel z wymaganym reason code.
- **Oczekiwania końcowe**: sukces i status `cancelled` przez jawne przejście `completed → cancelled` (`wo-state-machine.ts:46-53`); output z konsumpcją lub dzieckiem LP musi dać `invalid_state`/`output_lp_has_downstream_usage` przed przejściem (`complete-cancel-wo.ts:494-507`).
- **Decyzja ownera (2026-07-30)**: zachować kontrolowane odwrócenie ukończonego WO wyłącznie dla outputu, który nie był konsumowany ani dzielony; `complete-cancel-wo.cancel-completed-lps.test.ts:118-180` nadal sprawdza obsługę LP, a bezpośredni kontrakt maszyny stanów sprawdza `wo-state-machine.timestamps.test.ts`.
- **Priorytet**: P1

### E2E-054-11: Multi-output WO — część outputów downstream, część nie
- **Konfiguracja**: 2 output LP, jeden użyty dalej.
- **Przebieg**: void obu.
- **Oczekiwania końcowe**: nieużyty void OK, użyty → `output_lp_has_downstream_usage`; cancel blokowany dopóki użyty istnieje.
- **Priorytet**: P0

### E2E-054-12: WAC reversal — dokładna kwota (snapshot), nie nowy avg
- **Konfiguracja**: consume 30@koszt X, potem avg zmieniony, cancel.
- **Przebieg**: reversal.
- **Oczekiwania końcowe**: cofnięcie po pierwotnej wartości debetu (snapshot), analogicznie do SFQ-074/reverse-receive; valuation domyka się.
- **Priorytet**: P0

### E2E-054-13: Cancel a stan RM-LP po częściowej konsumpcji
- **Konfiguracja**: RM-LP częściowo skonsumowany (nie do 0).
- **Przebieg**: cancel WO.
- **Oczekiwania końcowe**: RM-LP zachowuje status (częściowo skonsumowane zachowują status, C-production:472); brak przywrócenia zużytej ilości.
- **Priorytet**: P1

### E2E-054-14: Cancel emituje outbox terminal, konsument idempotentny
- **Konfiguracja**: cancel.
- **Przebieg**: outbox tick.
- **Oczekiwania końcowe**: `production.wo.closed` terminal='cancelled'; at-least-once → konsument dedupuje (XC-004/005).
- **Priorytet**: P1

---

## Łańcuch XC-055: Onboarding → pierwszy pełny obieg

### Macierz wymiarów

| Wymiar | Wartości |
|---|---|
| Kroki required | 1 profile, 2 warehouse, 3 location, 6 completion |
| Kroki opcjonalne | 4 product, 5 WO (skippable) |
| Kolejność | profile→warehouse→location (uwaga: nie location→warehouse) |
| RBAC | settings.onboarding.complete vs brak |
| Bypass | completeOnboarding out-of-band |

### E2E-055-01: Pełny onboarding → od razu wykonalny XC-049
- **Konfiguracja**: świeży org, wszystkie kroki.
- **Przebieg**: profile→warehouse→location→product→WO→complete, potem XC-049.
- **Oczekiwania końcowe**: brak ręcznych fixów w DB; seedy kompletne; `onboarding_completed_at` + `stampOnboardingClaim` + `refreshSession` (`complete-onboarding.ts:54-85`).
- **Priorytet**: P1

### E2E-055-02: Pominięcie opcjonalnych (4,5) — required wystarcza do startu
- **Konfiguracja**: tylko 1,2,3,6.
- **Przebieg**: skip product/WO, complete.
- **Oczekiwania końcowe**: complete OK (required=1,2,3,6, `advance.ts:4-6`); produkt/WO tworzone później ręcznie.
- **Priorytet**: P2

### E2E-055-03: Kolejność warehouse przed location
- **Konfiguracja**: krok 2=warehouse, 3=location.
- **Przebieg**: nawigacja.
- **Oczekiwania końcowe**: kod wymusza profile→warehouse→location (F:887); redirect na właściwy krok (`redirectIfOnboardingStepMismatch`, `_routing.ts:25-34`).
- **Priorytet**: P1

### E2E-055-04: Redirect przy próbie wejścia poza bieżący krok
- **Konfiguracja**: stan na kroku 2, wejście na /complete.
- **Przebieg**: nawigacja.
- **Oczekiwania końcowe**: redirect do current step (`_routing.ts:25-34`).
- **Priorytet**: P1

### E2E-055-05: Bypass completeOnboarding out-of-band (gap NSA-145)
- **Konfiguracja**: wywołanie completeOnboarding przed krokami 1-3.
- **Przebieg**: direct action.
- **Oczekiwania końcowe**: **brak server-side sprawdzenia required done** (gating tylko przez redirect strony) — test dokumentuje lukę (`complete-onboarding.ts`); potwierdzić czy da się obejść.
- **Priorytet**: P1

### E2E-055-06: RBAC — mutacje onboarding wymagają settings.onboarding.complete
- **Konfiguracja**: user bez permu.
- **Przebieg**: mutacja kroku.
- **Oczekiwania końcowe**: 403 (NSA-137).
- **Priorytet**: P1

### E2E-055-07: Idempotencja complete + post-commit chain
- **Konfiguracja**: completeOnboarding 2×.
- **Przebieg**: 2 wywołania.
- **Oczekiwania końcowe**: `onboarding_already_completed`; redirect `/settings/users`; fail-handling `AUTH_METADATA_FAILED`/`SESSION_REFRESH_FAILED` (`complete-onboarding.ts:54-85`).
- **Priorytet**: P2

### E2E-055-08: Audit + outbox z każdej mutacji onboarding
- **Konfiguracja**: przejścia kroków.
- **Przebieg**: mutacje.
- **Oczekiwania końcowe**: `audit_log onboarding.<transition>` + outbox `onboarding.step.<transition>` (`advance.ts:262-302`).
- **Priorytet**: P2

### E2E-055-09: Świeży org — brak flag/feature — XC-049 na defaultach
- **Konfiguracja**: default flagi (require_grn_qc=false, count_variance default, expiry_warning_days=7).
- **Przebieg**: XC-049.
- **Oczekiwania końcowe**: defaulty działają bez konfiguracji; expiry warning okno 7 dni (`expiry-actions.ts:36-48`).
- **Priorytet**: P2

### E2E-055-10: Onboarding a seat-limit/invite pierwszego usera
- **Konfiguracja**: pierwszy admin.
- **Przebieg**: onboarding + invite kolejnego.
- **Oczekiwania końcowe**: pierwszy user = admin z pełnym RBAC; invite egzekwuje seat-limit (NSA-07x).
- **Priorytet**: P2

---

## Łańcuch XC-056: Spójność księgowa po dniu operacji (property-based)

### Macierz wymiarów

| Wymiar | Wartości |
|---|---|
| Invariant | (1) Σqty≥Σreserved (2) valuation=Σ(qty_kg×avg_cost) (3) ledger=stany (4) brak niemożliwych LP |
| Operacje | receive/consume/output/ship/adjust/void/reverse/correction |
| Waluta | GBP only (nie-GBP → jawny błąd, nie skażenie sumy) |
| Zakres | per item×currency; site jako filtr |

### E2E-056-01: Invariant reserved — Σ LP.quantity ≥ Σ reserved
- **Konfiguracja**: po sekwencji reserve/release/adjust.
- **Przebieg**: agregacja.
- **Oczekiwania końcowe**: `reserved_qty ≤ quantity` (constraint WH-124); adjust decrease floor do reserved (`direct-adjust-actions.ts:284`).
- **Priorytet**: P1

### E2E-056-02: Valuation = Σ(qty_kg × avg_cost) per item×currency
- **Konfiguracja**: mix itemów.
- **Przebieg**: raport valuation.
- **Oczekiwania końcowe**: `LP_VALUATION_CTE` join `item_wac_state.avg_cost` (`get-inventory-valuation.ts:39-76`); qty 6dp, money 4dp; brak cross-currency sumy.
- **Priorytet**: P1

### E2E-056-03: Ledger balansuje do stanów
- **Konfiguracja**: po receive+consume+output+ship.
- **Przebieg**: bilans.
- **Oczekiwania końcowe**: Σ delta (ΔQty,ΔValue) = bieżący `item_wac_state` (`upsert-wac.ts:95-177`); append-only.
- **Priorytet**: P1

### E2E-056-04: Brak LP w stanie niemożliwym (consumed z qty>0)
- **Konfiguracja**: skan wszystkich LP.
- **Przebieg**: property-check.
- **Oczekiwania końcowe**: consumed/destroyed/shipped → qty=0 poza korektami; immovable states (`movement.ts:8`).
- **Priorytet**: P1

### E2E-056-05: Nie-GBP nigdzie nie skaża sumy
- **Konfiguracja**: item z (teoretyczną) inną walutą.
- **Przebieg**: valuation + WAC.
- **Oczekiwania końcowe**: bucket per currency, brak cross-sumy (`get-inventory-valuation.ts:103-114`); przyjęcie nie-GBP → `unsupported_currency` (nigdy 0/konwersja).
- **Priorytet**: P1

### E2E-056-06: Reverse/void nie łamie bilansu (snapshot reversal)
- **Konfiguracja**: reverse-receive + void POD + void output.
- **Przebieg**: sekwencja.
- **Oczekiwania końcowe**: każdy reversal po snapshotcie (`upsert-wac.ts:472-494`); po serii ledger nadal domyka się.
- **Priorytet**: P1

### E2E-056-07: Korekta ledgera — storno + wpis korygujący
- **Konfiguracja**: correct-ledger-entry.
- **Przebieg**: korekta.
- **Oczekiwania końcowe**: oryginał nietknięty (append-only), storno + nowy wpis; WAC przeliczony; suma = stan po korekcie (XC-041, `correct-ledger-entry.ts`).
- **Priorytet**: P0

### E2E-056-08: Adjust variance stock-count wpięty w bilans
- **Konfiguracja**: count variance apply.
- **Przebieg**: apply.
- **Oczekiwania końcowe**: `stock_adjustment` reason `stock_count_variance` + WAC (`count-actions.ts:38,718-744`); nowy LP available/pending; ledger domyka.
- **Priorytet**: P1

### E2E-056-09: LP z brakiem WAC/currency/base_qty_kg — flagowany w raporcie
- **Konfiguracja**: LP bez WAC.
- **Przebieg**: valuation.
- **Oczekiwania końcowe**: `wac is null OR currency is null OR base_qty_kg is null` → panel ostrzeżeń (`get-inventory-valuation.ts:148-159`, `valuation/page.tsx:67-79`).
- **Priorytet**: P2

### E2E-056-10: Property po losowej sekwencji operacji (fuzz)
- **Konfiguracja**: losowa sekwencja z katalogu (receive/consume/output/ship/hold/cancel).
- **Przebieg**: wykonaj N operacji, sprawdź 4 invarianty.
- **Oczekiwania końcowe**: wszystkie 4 invarianty trzymają po dowolnej dozwolonej sekwencji; naruszenie = P0 finding.
- **Priorytet**: P1

---

## Podsumowanie liczbowe

| Łańcuch | Warianty |
|---|---|
| XC-049 | 34 |
| XC-050 | 16 |
| XC-051 | 18 |
| XC-052 | 20 |
| XC-053 | 18 |
| XC-054 | 14 |
| XC-055 | 10 |
| XC-056 | 10 |
| **Suma** | **140** |

## Otwarte pytania (do decyzji ownera)
1. **site_id=NULL bypass** (E2E-049-34, 053-06, 053-07): świadoma luka czy bug? Blokuje pełną izolację multi-site.
2. **Cancel WO a rezerwacje** (E2E-054-03): brak granularnego release per-WO (`reservation-actions.ts:138`) — czy cancel je zwalnia? Rozjazd z PLN-024/025.
3. **completeOnboarding bypass** (E2E-055-05): brak server-side guardu required-steps (NSA-145).
4. **Over-receipt asymetria** (049-04 vs 049-05): scanner cichy vs desktop confirm — zamierzone?
