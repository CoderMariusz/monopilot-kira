# Przewodnik testera — night-build 2026-06-25/26

W nocy dowieziono około 36 powierzchni read-only: dashboardy, listy, filtry, eksporty CSV i widoki analityczne, a po konsolidacji nawigacji są osiągalne z menu aplikacji. Do testów loguj się jako `admin@monopilot.test` z hasłem `Admin2026!!!`. Oczekujemy sprawdzenia, czy dane renderują się z prawdziwych źródeł, eksporty pobierają pliki, filtry działają i nigdzie nie widać mocków ani zawieszonego stanu ładowania.

## NPD

| Nazwa | Ścieżka | Jak dotrzeć (menu) | Co sprawdzić |
|---|---|---|---|
| Analytics pipeline: funnel, konwersja i eksport CSV | `/pipeline` | Menu → NPD → Projects → zakładka Analytics | Czy panel Analytics nie zostaje na "Loading", pokazuje funnel/konwersję lub pusty stan i czy eksport CSV pobiera plik? |
| Costing roll-up między projektami | `/costing/rollup` | Menu → NPD → Costing roll-up | Czy tabela roll-up renderuje dane lub pusty stan, bez zawieszania i bez mocków? |
| Owner workload: projekty per owner x gate | `/pipeline/workload` | Menu → NPD → Workload | Czy panel pokazuje obciążenie właścicieli według gate i czy wartości zmieniają się wraz z danymi? |
| Drilldown blokowanych FA według działu | `/npd` | Menu → NPD → FG Dashboard → sekcja blokowanych FA | Czy kliknięcie działu pokazuje blokowane FA dla tego działu i czy nie trafia w martwy ekran? |

## Quality

| Nazwa | Ścieżka | Jak dotrzeć (menu) | Co sprawdzić |
|---|---|---|---|
| QA-001 KPI tiles na landing page | `/quality` | Menu → Quality | Czy kafle KPI pokazują prawdziwe liczniki, a przy braku danych uczciwe zera/pusty stan? |
| Hold/release log CSV | `/quality/holds` | Menu → Quality → Holds | Czy przycisk eksportu pobiera CSV z logiem hold/release i czy dane odpowiadają filtrowi/listingu? |
| Inspection pass-rate banner | `/quality/inspections` | Menu → Quality → Inspections | Czy banner pass-rate renderuje się nad listą i nie pokazuje stałych/mockowanych wartości? |
| Trace: klient, expiry, QA status i CSV | `/quality/trace` | Menu → Quality → Trace | Czy trace pokazuje powiązanie z klientem, expiry i QA status LP oraz czy eksport CSV pobiera plik? |
| NCR: filtr daty i eksport CSV | `/quality/ncrs` | Menu → Quality → NCRs | Czy zakres dat filtruje listę i czy CSV zawiera przefiltrowane wyniki? |
| NCR: Pareto root-cause i średni czas zamknięcia | `/quality/ncrs` | Menu → Quality → NCRs | Czy Pareto root-cause i średni closure time renderują się z realnych NCR, a przy braku danych nie udają wyników? |
| Recall-drill CSV | `/quality/recall-drills` | Menu → Quality → Recall drills | Czy eksport CSV pobiera deliverable do mock recall i czy plik zawiera dane z drillów? |
| CCP monitoring trend | `/quality/ccp-monitoring` | Menu → Quality → CCP monitoring | Czy wykres/trend ostatnich 20 odczytów pokazuje limity krytyczne i prawdziwe odczyty lub pusty stan? |
| Complaint analytics | `/quality/complaints` | Menu → Quality → Complaints | Czy lista pokazuje analitykę po severity i CAPA closure rate oraz czy nie ma stanu zawieszonego? |

## Finance

| Nazwa | Ścieżka | Jak dotrzeć (menu) | Co sprawdzić |
|---|---|---|---|
| WO cost: filtr okresu 30/90/365 i eksport CSV | `/finance` | Menu → Finance | Czy przełącznik okresu zmienia dane tabeli i czy eksport CSV pobiera plik dla wybranego okresu? |
| Inventory valuation | `/finance/valuation` | Menu → Finance → Inventory valuation | Czy raport wyceny inventory renderuje WAC/warstwy lub pusty stan, bez wartości mockowanych? |
| Downtime-cost w breakdown kosztu WO | `/finance` | Menu → Finance → rozwiń WO cost breakdown | Czy w breakdown pojawia się linia downtime-cost i czy suma kosztów nadal się spina? |
| Scrap/waste-cost summary | `/finance` | Menu → Finance | Czy kafel Scrap / waste cost pokazuje koszt dla wybranego okresu i zmienia się z filtrem? |

## Reporting

| Nazwa | Ścieżka | Jak dotrzeć (menu) | Co sprawdzić |
|---|---|---|---|
| Material spend by supplier | `/reporting` | Menu → Reporting | Czy sekcja spend-by-supplier pokazuje dostawców, kwoty i pusty stan bez mocków? |
| Shipments CSV: carrier, tracking i weight | `/reporting` | Menu → Reporting → eksport shipments CSV | Czy CSV shipments zawiera carrier, tracking i weight, jeśli dane istnieją? |

## Production

| Nazwa | Ścieżka | Jak dotrzeć (menu) | Co sprawdzić |
|---|---|---|---|
| QA-results tab na detalu WO | `/production/wos/[id]` | Menu → Production → Work orders → otwórz WO → zakładka QA results | Czy zakładka pokazuje inspections i aktywne holds dla WO, a przy braku danych pusty stan? |
| Over-production flag: KPI, badge i filtr | `/production` | Menu → Production | Czy KPI over-production renderuje się na landing page i czy lista WO pokazuje badge/filter dla flagged WOs? |
| Production WO-list CSV | `/production/wos` | Menu → Production → Work orders | Czy eksport CSV pobiera listę WO zgodną z aktualnym widokiem? |

## Warehouse

| Nazwa | Ścieżka | Jak dotrzeć (menu) | Co sprawdzić |
|---|---|---|---|
| Stock-adjustment audit list | `/warehouse/adjustments` | Menu → Warehouse → Stock adjustments | Czy lista audytu korekt magazynowych renderuje korekty lub pusty stan i nie prowadzi tylko do formularza new? |
| Inventory CSV | `/warehouse/inventory` | Menu → Warehouse → Inventory | Czy eksport CSV pobiera inventory z widocznych danych? |
| Movements CSV | `/warehouse/movements` | Menu → Warehouse → Movements | Czy eksport CSV pobiera ruchy magazynowe i respektuje widoczne dane/filtry? |
| GRN detail CSV | `/warehouse/grns/[grnId]` | Menu → Warehouse → GRNs → otwórz GRN | Czy eksport CSV na detalu GRN pobiera linie GRN? |
| Genealogy tree CSV | `/warehouse/genealogy` | Menu → Warehouse → Genealogy | Czy genealogia renderuje drzewo dla LP i czy eksport CSV działa dla wyniku? |

## Shipping

| Nazwa | Ścieżka | Jak dotrzeć (menu) | Co sprawdzić |
|---|---|---|---|
| Shipments list: weight, carrier, required-by i OTIF | `/shipping/shipments` | Menu → Shipping → Shipments | Czy kolumny weight/carrier/required-by pokazują prawdziwe dane i czy OTIF badge ma sens względem dat? |
| Sales orders CSV | `/shipping` | Menu → Shipping → Sales orders | Czy eksport CSV pobiera listę sales orders? |
| Shipments list CSV | `/shipping/shipments` | Menu → Shipping → Shipments | Czy eksport CSV pobiera listę shipments z aktualnymi kolumnami? |

## Maintenance

| Nazwa | Ścieżka | Jak dotrzeć (menu) | Co sprawdzić |
|---|---|---|---|
| MWO backlog-ageing, planned-vs-unplanned i CSV | `/maintenance` | Menu → Maintenance | Czy kafle backlog-ageing i planned/unplanned renderują realne dane oraz czy eksport CSV pobiera listę MWO? |
| Calibration-due register | `/maintenance/calibration` | Menu → Maintenance → Calibration | Czy rejestr calibration due pokazuje terminy/certyfikaty lub uczciwy pusty stan? |

## Multi-site

| Nazwa | Ścieżka | Jak dotrzeć (menu) | Co sprawdzić |
|---|---|---|---|
| Network KPI strip | `/multi-site` | Menu → Multi-Site | Czy KPI sites, TOs in-transit i aggregated inventory renderują realne wartości, bez mocków? |

## Technical

| Nazwa | Ścieżka | Jak dotrzeć (menu) | Co sprawdzić |
|---|---|---|---|
| Where-used cross-portfolio | `/technical/where-used` | Menu → Technical → Cost & trace → Where-used | Czy wyszukiwanie pokazuje, w których FG użyty jest składnik, i czy brak wyników ma jasny pusty stan? |
| Portfolio cost roll-up | `/technical/cost/portfolio` | Menu → Technical → Cost & trace → Portfolio cost | Czy roll-up kosztów portfolio renderuje dane kosztowe bez float drift w prezentacji? |
| Compliance-gap CSV | `/technical/compliance` | Menu → Technical → Compliance → Compliance | Czy eksport CSV pobiera compliance gaps z widocznej sekcji? |
| Lab-results CSV | `/technical/lab-results` | Menu → Technical → Compliance → Lab results | Czy eksport CSV pobiera lab results i linki do QA nadal działają? |
| Shelf-life CSV | `/technical/shelf-life` | Menu → Technical → Products → Shelf life | Czy eksport CSV pobiera dane shelf-life? |
| Traceability CSV | `/technical/traceability` | Menu → Technical → Cost & trace → Traceability search | Czy eksport CSV pobiera wynik wyszukiwania traceability? |
| BOM version diff CSV | `/technical/bom/diff/[productId]` | Menu → Technical → Products → BOMs & recipes → otwórz diff wersji BOM | Czy eksport CSV pobiera porównanie wersji BOM dla wybranego produktu? |
| Nutrition label print | `/technical/nutrition` | Menu → Technical → Products → Nutrition panel | Czy print-HTML otwiera/pokazuje etykietę nutrition bez biblioteki PDF i bez uciętych danych? |

## Platform

| Nazwa | Ścieżka | Jak dotrzeć (menu) | Co sprawdzić |
|---|---|---|---|
| Post-login landing do dashboardu | `/dashboard` | Zaloguj się jako admin | Czy po logowaniu użytkownik trafia na dashboard zamiast placeholdera? |
| Profil pokazuje rolę użytkownika | `/account/profile` | Menu użytkownika → Profile | Czy profil pokazuje rolę zalogowanego użytkownika? |
| Dashboard quick actions filtrowane RBAC | `/dashboard` | Menu → Dashboard | Czy quick actions odpowiadają uprawnieniom roli i nie pokazują akcji, których użytkownik nie może wykonać? |

## OEE

| Nazwa | Ścieżka | Jak dotrzeć (menu) | Co sprawdzić |
|---|---|---|---|
| Target-vs-actual RAG badges i trend sparkline | `/oee` | Menu → OEE | Czy badge RAG porównuje actual do targetu, a sparkline trendu renderuje prawdziwe punkty lub pusty stan? |

## Planning

| Nazwa | Ścieżka | Jak dotrzeć (menu) | Co sprawdzić |
|---|---|---|---|
| PO aging report | `/planning` | Menu → Planning | Czy raport PO aging pokazuje buckety 0-30, 31-60, 61-90 i 90+ overdue oraz nie miesza ich z bieżącymi PO? |

## Znane braki / do dopracowania

- Część etykiet eksportów jest inline-EN (PL i18n pending).
- Folder planning PO-aging do zmiany nazwy z `actions/` i `components/` na konwencję `_actions/` i `_components/`.
- Multi-site KPI bez vitest (zweryfikowany tylko live).
- Pipeline CSV ma kosmetycznie pustą kolumnę `notes`, bo nie ma jej w klienckim modelu KanbanProject.
- Inspection pass-rate liczy też statusy pending/in_progress; do doprecyzowania mianownik.
- Część nowych eksportów i sekcji była dostarczona jako szybkie read-only utility; wymagają jeszcze pełnego dopięcia copy do PL i18n.

Przewodnik wygenerowany automatycznie na podstawie commitów z nocy 2026-06-25/26. Wersja robocza — przed przekazaniem testerom skonsultuj z właścicielem.
