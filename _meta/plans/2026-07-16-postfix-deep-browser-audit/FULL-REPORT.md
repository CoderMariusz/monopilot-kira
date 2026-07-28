# MonoPilot produkcja — post-fix deep browser audit (20/20 runów)

Data wykonania i konsolidacji: 2026-07-16–2026-07-18

Środowisko: `https://monopilot-kira.vercel.app`

Deploy: `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm` · commit `2eb57cf7b90c23d4c55afeb01116eaabc3250385` · `READY`

Zakres: 20 produkcyjnych browser walków od Settings i NPD, przez Planning/PO/WO/Production, po Quality, Shipping, Finance, OEE i Maintenance.

Raport bazowy przed naprawami: [audyt 2026-07-14 — 120 kanonicznych problemów](../2026-07-14-sol-deep-browser-audit/FULL-REPORT.md).

Raporty źródłowe: `run-01/REPORT.md` … `run-20/REPORT.md`; wszystkie dowody są w katalogach `run-NN/evidence/`.

## Wniosek wykonawczy

Wszystkie 20 runów zakończono. Na wdrożonej produkcji zapisano **113 odrębnych problemów: P0 5, P1 60, P2 43, P3 5**. Audyt nie daje podstaw do uznania aplikacji za bezpieczną funkcjonalnie ani regulacyjnie.

Pięć P0 obejmuje:

1. zaproszenie z ograniczeniem site tworzy użytkownika bez ograniczenia,
2. formalne G3/G4 ignoruje wymagany checklist i dowody operacyjne,
3. definicja WIP może zawierać samą siebie,
4. edycja FactorySpec nie unieważnia istniejącego zatwierdzenia e-sign,
5. jeden podpisujący może potwierdzić zero-energy i uruchomić MWO wymagające LOTO.

Największa koncentracja P1 jest w NPD/Technical governance, kosztach i UoM, MRP/schedulerze, integralności PO/GRN/TO, egzekucji WO, Quality/Shipping oraz Maintenance. P2/P3 zawierają correctability, site-filter bypass, stale UI, niepełną diagnostykę i copy; część z nich blokuje operatorowi bezpieczne naprawienie błędnych danych.

## Bilans i deduplikacja

| Miara | P0 | P1 | P2 | P3 | Razem |
|---|---:|---:|---:|---:|---:|
| Surowe findings zapisane w 20 raportach | 5 | 60 | 43 | 5 | 113 |
| Kanoniczne problemy po deduplikacji obecnego audytu | 5 | 60 | 43 | 5 | 113 |

Równość `113 raw = 113 canonical` jest zamierzona. Autorzy runów nie dodawali kolejnego ID, gdy późniejszy przebieg tylko potwierdzał istniejący objaw. Kontrola podobieństwa wszystkich tytułów nie wykazała par nadających się do bezpiecznego scalenia. Podobne site-filter bypass dla LP i WO pozostają osobno, ponieważ dotyczą innych encji, tras i guardów.

Powiązania historyczne nie zmniejszają bieżącego licznika, bo opisują nadal wdrożony stan:

- `PF-R04-03` jest niepełnym domknięciem historycznego `C025`;
- `PF-R17-02` grupuje się pod `C101` jako niepełna naprawa na osobnej ścieżce Scanner Putaway;
- `PF-R20-06` jest pozostałością rodziny `C021`: serwer blokuje import, ale produkcyjny UI nadal reklamuje pull/import.

Jawnie nie doliczono:

- ponownych obserwacji supplier-batch z `PF-R07-06` w Run 08 i Run 19;
- ponownych obserwacji Production dashboard, warehouse expiry i braku waluty w Run 20;
- sugerowanego błędu OEE quality: PRD wymaga `AVG(quality_pct)`, więc wynik 98.5 był zgodny ze specyfikacją, a pooled yield 99.1 jest inną metryką;
- pierwszej, przerwanej próby Run 17, która nie wykonała żadnej obserwacji aplikacji.

## Pięć blokujących P0

| ID | Problem | Ryzyko | Minimalna bramka |
|---|---|---|---|
| PF-R01-01 | Invite ignoruje wybrany site i tworzy użytkownika bez ograniczenia. | Nieautoryzowany dostęp cross-site. | Serwerowe zapisanie site scope, deny-by-default i test zaproszenia/claim/session. |
| PF-R04-01 | Formalne G3/G4 ignoruje wymagany checklist i dowody. | E-sign certyfikuje nieukończony proces NPD. | Jeden serwerowy gate evaluator, nieprzekraczalne required rows i test real-DB + browser. |
| PF-R05-01 | WIP może zawierać samą siebie. | Cykl BOM/WIP, nieskończona rekursja i fałszywy koszt/nutrition. | Serwerowa detekcja cyklu przed zapisem oraz test self- i multi-node cycle. |
| PF-R06-01 | Edycja FactorySpec nie unieważnia wcześniejszej akceptacji. | Podpis dotyczy innej treści niż aktualny dokument. | Immutable version/hash subject, invalidation on edit i ponowne zatwierdzenie. |
| PF-R20-02 | Jeden signer aktywuje LOTO i otwiera Start MWO. | Praca bez niezależnej weryfikacji zero-energy; ryzyko życia i compliance. | Atomowe `dualSign`, distinct actor/session, isolation steps i twardy Start gate. |

## Zalecana kolejność napraw

1. **Natychmiastowy containment P0:** zablokować pięć ścieżek P0 po stronie serwera; przejrzeć użytkowników, zatwierdzenia NPD/FactorySpec, cykliczne WIP oraz aktywne LOTO.
2. **Integralność ilości, kosztu i UoM:** `PF-R03-*`, `PF-R04-05/06`, `PF-R05-03/04/05/07`, `PF-R07-01/02/03/05/07`, `PF-R09-*`, `PF-R10-01`, `PF-R18-03`, `PF-R19-03`, `PF-R20-07`.
3. **Site i lifecycle conservation:** `PF-R02-01/03/04/05`, `PF-R06-07`, `PF-R08-01/02/09`, `PF-R09-03`, `PF-R10-02/03`, `PF-R11-03`.
4. **Regulatory i audit:** `PF-R04-02/09`, `PF-R06-11/14`, `PF-R14-02`, `PF-R15-01`, `PF-R16-01/02/03`, `PF-R20-04/05`.
5. **Execution blockers:** PO/GRN/TO, scheduler dependencies, Production dashboard/timestamps, FEFO override, Quality containment, Shipping partial-pack oraz Maintenance PM/asset CRUD.
6. **Correctability i diagnostyka:** brak edit/archive/void, stale lists, raw UUID/JSON, błędne komunikaty i niedostępne reference-data pickery.

## Pokrycie runów

| Run | Zakres | Findings | Severity | Raport |
|---:|---|---:|---|---|
| 01 | Identity, roles, authorization, profile | 7 | 1/1/4/1 | [Run 01](run-01/REPORT.md) |
| 02 | Sites, warehouses, lines, locations, infrastructure | 7 | 0/3/2/2 | [Run 02](run-02/REPORT.md) |
| 03 | Item master, UoM, decimal invariants | 6 | 0/4/2/0 | [Run 03](run-03/REPORT.md) |
| 04 | NPD project, stage gates, CRUD | 14 | 1/9/3/1 | [Run 04](run-04/REPORT.md) |
| 05 | Nested WIP→WIP→FG nutrition/cost/cascade | 9 | 1/6/2/0 | [Run 05](run-05/REPORT.md) |
| 06 | BOM, routing, specification revisions | 14 | 1/8/5/0 | [Run 06](run-06/REPORT.md) |
| 07 | Suppliers, PO arithmetic, receiving | 8 | 0/4/4/0 | [Run 07](run-07/REPORT.md) |
| 08 | Warehouse LP lifecycle, conservation | 9 | 0/3/6/0 | [Run 08](run-08/REPORT.md) |
| 09 | MRP demand/supply/horizon/procurement | 5 | 0/4/1/0 | [Run 09](run-09/REPORT.md) |
| 10 | Transfer orders, cross-site conservation | 3 | 0/2/1/0 | [Run 10](run-10/REPORT.md) |
| 11 | WO chains, edit/release/dependencies | 3 | 0/1/2/0 | [Run 11](run-11/REPORT.md) |
| 12 | Scheduler capacity/dependencies/time | 2 | 0/2/0/0 | [Run 12](run-12/REPORT.md) |
| 13 | Production state machine/downtime | 3 | 0/2/1/0 | [Run 13](run-13/REPORT.md) |
| 14 | Consumption, FEFO, holds, genealogy | 2 | 0/1/1/0 | [Run 14](run-14/REPORT.md) |
| 15 | Output/yield/corrections/cost parity | 1 | 0/1/0/0 | [Run 15](run-15/REPORT.md) |
| 16 | Quality containment, NCR, traceability | 6 | 0/3/2/1 | [Run 16](run-16/REPORT.md) |
| 17 | Scanner/PWA recovery | 2 | 0/0/2/0 | [Run 17](run-17/REPORT.md) |
| 18 | Customer, SO, allocation, shipping/POD/RMA | 4 | 0/3/1/0 | [Run 18](run-18/REPORT.md) |
| 19 | Finance, WAC/FIFO, reporting, OEE | 1 | 0/0/1/0 | [Run 19](run-19/REPORT.md) |
| 20 | Maintenance i global consistency crawl | 7 | 1/3/3/0 | [Run 20](run-20/REPORT.md) |

Kolumna Severity ma kolejność `P0/P1/P2/P3`. Scenariusze runów używały różnych, domenowych ledgerów, dlatego nie sumowano mechanicznie `PASS/FAIL/BLOCKED/NOT RUN` między runami. Każdy raport źródłowy zawiera własny ledger i ograniczenia.

## Pełny rejestr 113 problemów

### [Run 01 — Identity i authorization](run-01/REPORT.md)

- **PF-R01-01 · P0** — Invite site selection is ignored and creates an unrestricted user
- **PF-R01-02 · P1** — Organization Security settings still cannot be saved
- **PF-R01-03 · P2** — Invite and revoke success leave stale, actionable lists
- **PF-R01-04 · P2** — Pending invitation can be falsely “deactivated” and then cannot be reactivated
- **PF-R01-05 · P2** — Correct invitation lifecycle UI is undiscoverable
- **PF-R01-06 · P2** — Invitation audit attribution is always shown as “System”
- **PF-R01-07 · P3** — Persisted profile display name is ignored by the application shell

### [Run 02 — Sites i infrastructure](run-02/REPORT.md)

- **PF-R02-01 · P1** — Production-line default output location fake-saves into the wrong column
- **PF-R02-02 · P1** — Printers route is unusable because an ordinary closure crosses the RSC boundary
- **PF-R02-03 · P1** — Active storage can be created beneath an inactive parent
- **PF-R02-04 · P2** — Inactive locations are offered as active-line output destinations
- **PF-R02-05 · P2** — Warehouse site and address cannot be corrected after creation
- **PF-R02-06 · P3** — Duplicate site is reported as a missing required field
- **PF-R02-07 · P3** — Dock delete dialog lacks the Radix DialogTitle contract

### [Run 03 — Items i UoM](run-03/REPORT.md)

- **PF-R03-01 · P1** — Item master permits identical base and secondary UoM
- **PF-R03-02 · P1** — Catch-weight invariant is informational text only
- **PF-R03-03 · P1** — Shelf-life can be enabled with zero days and no mode
- **PF-R03-04 · P1** — Every Units & conversions mutation fails with the same production error
- **PF-R03-05 · P2** — Settings UoM registry is disconnected from item selectors
- **PF-R03-06 · P2** — Fractional packaging counts pass the client review and fail only generically on submit

### [Run 04 — NPD stage gates](run-04/REPORT.md)

- **PF-R04-01 · P0** — Formal G3/G4 approval ignores required checklist and operational evidence
- **PF-R04-02 · P1** — Signed G4 definition remains mutable without invalidation/versioning
- **PF-R04-03 · P1** — C025 gate-truth fix is incomplete: modal and server still disagree
- **PF-R04-04 · P1** — Required stage evidence is an unauthenticated soft override
- **PF-R04-05 · P1** — “Margin vs target price” displays revenue, not margin
- **PF-R04-06 · P1** — Expected yield `0%` is treated as no loss
- **PF-R04-07 · P1** — Handoff reports “All gates pass” while two release gates fail
- **PF-R04-08 · P1** — Locked NPD formulation cannot generate the production BOM
- **PF-R04-09 · P1** — E-sign history says Valid but exposes an empty certificate/hash
- **PF-R04-10 · P1** — Deleting an NPD project orphans its Technical sensory record
- **PF-R04-11 · P2** — Clone mode can reach an unexplained dead Review
- **PF-R04-12 · P2** — Trial/pilot validation and corrective CRUD are incomplete
- **PF-R04-13 · P2** — Sensory ownership/read-only and benchmark semantics contradict the data
- **PF-R04-14 · P3** — NPD exposes stale navigation and raw/untranslated audit copy

### [Run 05 — Nested WIP/FG](run-05/REPORT.md)

- **PF-R05-01 · P0** — A WIP definition can contain itself
- **PF-R05-02 · P1** — Clone-on-write creates v3 but never notifies projects pinned to v2
- **PF-R05-03 · P1** — Newly added WIP shows materially false cost until a hard refresh
- **PF-R05-04 · P1** — Live WIP cost omits definition process labor, setup and WIP yield
- **PF-R05-05 · P1** — Canonical Costing & Nutrition compute fails for a complete nested-WIP input
- **PF-R05-06 · P1** — Pilot operations are accepted while the project is still at G0 Brief
- **PF-R05-07 · P1** — WIP cost currency is relabelled from euro to pounds without a visible conversion
- **PF-R05-08 · P2** — Cascade is stale after save and labels ordinary leaves as max-depth failures
- **PF-R05-09 · P2** — Successful WIP archive leaves the detail page in an active/editable state

### [Run 06 — BOM, routing, specifications](run-06/REPORT.md)

- **PF-R06-01 · P0** — Editing an in-review FactorySpec does not invalidate an existing e-sign approval
- **PF-R06-02 · P1** — FactorySpec authoring cannot capture the specification values shown by Review
- **PF-R06-03 · P1** — BOM scrap percentage is immutable after line creation
- **PF-R06-04 · P1** — BOM component lines cannot be reordered
- **PF-R06-05 · P1** — Routing operations cannot be reordered
- **PF-R06-06 · P1** — A draft routing version has no delete/retire action
- **PF-R06-07 · P1** — Routing line picker omits site identity while loading all org lines
- **PF-R06-08 · P2** — Active-BOM edit promises Draft but creates In review
- **PF-R06-09 · P2** — Decimal setup minutes silently disable routing Save
- **PF-R06-10 · P2** — Released and archived BOMs still expose invalid top-level mutation controls
- **PF-R06-11 · P1** — Planned WOs are absent from the immutable BOM snapshot audit
- **PF-R06-12 · P2** — Item creation Review omits shelf-life values
- **PF-R06-13 · P2** — Item Routing empty state gives no route to create the promised routing
- **PF-R06-14 · P1** — Reopening bundle approval hides collected e-sign state and receipts

### [Run 07 — Suppliers, PO, receiving](run-07/REPORT.md)

- **PF-R07-01 · P1** — PO creation silently replaces an over-precision price with zero
- **PF-R07-02 · P1** — Six-decimal ordered quantities cannot always be fully received
- **PF-R07-03 · P1** — Priced `g` and `pcs` PO lines can be ordered but cannot be received
- **PF-R07-04 · P1** — Every eligible GRN receipt cancellation crashes before reversal
- **PF-R07-05 · P2** — The receipt UI masks `wac_unresolved_uom` as an unrelated generic failure
- **PF-R07-06 · P2** — GRN detail fabricates a supplier batch by copying the internal batch
- **PF-R07-07 · P2** — PO detail hides the persisted unit-price precision
- **PF-R07-08 · P2** — PO/GRN navigations emit a production React hydration error

### [Run 08 — Warehouse LP](run-08/REPORT.md)

- **PF-R08-01 · P1** — An occupied location can be deactivated and its LP count disappears
- **PF-R08-02 · P1** — Split silently inherits the source location instead of requiring an output destination
- **PF-R08-03 · P1** — Blind-count rows omit LP identity and become indistinguishable
- **PF-R08-04 · P2** — GRN list reports zero items for a completed one-line GRN
- **PF-R08-05 · P2** — LP label printing bypasses the required print configuration workflow
- **PF-R08-06 · P2** — Reprinting a Direct PDF job converts it into a permanently queued ZPL job
- **PF-R08-07 · P2** — Expiry “days left” is off by one because it uses time-of-day arithmetic
- **PF-R08-08 · P2** — Expiry dashboard deliberately drops batch and status traceability
- **PF-R08-09 · P2** — Site-filtered LP list can be bypassed by direct detail navigation

### [Run 09 — MRP](run-09/REPORT.md)

- **PF-R09-01 · P1** — “Save this run” fails while the identical read-only MRP succeeds
- **PF-R09-02 · P1** — The item summary shows the first bucket order as if it covered the full-horizon shortage
- **PF-R09-03 · P1** — Site-filtered supply is combined with global forecast and threshold rows
- **PF-R09-04 · P1** — MRP recommends a new BUY against a blocked supplier
- **PF-R09-05 · P2** — Time-phased BUY logic hides lead-time lateness and makes the quantity look arithmetically wrong

### [Run 10 — Transfer orders](run-10/REPORT.md)

- **PF-R10-01 · P1** — A physically sufficient mixed-UoM transfer cannot ship
- **PF-R10-02 · P1** — Re-receiving after one receipt reversal closes the TO without materializing the missing line
- **PF-R10-03 · P2** — Partially received TO exposes a Cancel action that cannot cancel the outstanding remainder

### [Run 11 — WO chains](run-11/REPORT.md)

- **PF-R11-01 · P1** — Editing the FG parent scheduled date leaves the child WIP on the old date
- **PF-R11-02 · P2** — Automatic child quantity propagation leaves no child `update` history entry
- **PF-R11-03 · P2** — WO direct detail bypasses the active site filter used by the WO list

### [Run 12 — Scheduler](run-12/REPORT.md)

- **PF-R12-01 · P1** — Scheduler runs dependent WIP and FG work orders simultaneously
- **PF-R12-02 · P1** — Capacity adds a WO's current slot and its draft scheduler alternative

### [Run 13 — Production state machine](run-13/REPORT.md)

- **PF-R13-01 · P1** — Production dashboard is unavailable while its WO sub-route remains usable
- **PF-R13-02 · P1** — Cancelled WO elapsed time continues increasing forever
- **PF-R13-03 · P2** — Resume accepts a zero-minute stop and persists it as canonical downtime

### [Run 14 — Consumption i genealogy](run-14/REPORT.md)

- **PF-R14-01 · P1** — Controlled FEFO deviation is a desktop-UI dead end
- **PF-R14-02 · P2** — LP↔WO genealogy uses a raw UUID prefix and is not bidirectionally navigable

### [Run 15 — Output i yield](run-15/REPORT.md)

- **PF-R15-01 · P1** — Completed WO can lose signed output without reopening or rerunning the yield gate

### [Run 16 — Quality i NCR](run-16/REPORT.md)

- **PF-R16-01 · P1** — Out-of-spec measurement can be persisted as PASS
- **PF-R16-02 · P1** — Signed failed inspection does not create the promised hold or NCR
- **PF-R16-03 · P1** — Manual NCR creation cannot link the affected inspection, LP, product or hold
- **PF-R16-04 · P2** — NCR close succeeds but the detail view remains stale and writable until hard refresh
- **PF-R16-05 · P2** — Blank inspection result exposes raw validation JSON to the operator
- **PF-R16-06 · P3** — Closed NCR repeats the signature-storage notice

### [Run 17 — Scanner/PWA](run-17/REPORT.md)

- **PF-R17-01 · P2** — already-received line revisit becomes a generic load failure
- **PF-R17-02 · P2** — scanner Putaway accepts and repeats RECV→RECV no-op moves

### [Run 18 — SO i Shipping](run-18/REPORT.md)

- **PF-R18-01 · P1** — allergen restriction CRUD has no selectable reference data
- **PF-R18-02 · P1** — duplicate SO submission creates two independent sales orders
- **PF-R18-03 · P2** — displayed SO line amounts do not add to the displayed order total
- **PF-R18-04 · P1** — partial packing strands the remaining quantity and incomplete shipment can be sealed

### [Run 19 — Finance, Reporting, OEE](run-19/REPORT.md)

- **PF-R19-03 · P2** — WO actual-cost UI and CSV do not disclose currency as a first-class value

### [Run 20 — Maintenance i global crawl](run-20/REPORT.md)

- **PF-R20-02 · P0** — A single signer can verify zero energy and start a LOTO-required MWO
- **PF-R20-04 · P1** — Calibration instruments accept an inverted measurement range
- **PF-R20-05 · P1** — Valid calibration dual-sign is a reviewer-UUID dead end
- **PF-R20-07 · P1** — Multi-Site adds unlike quantities into a unitless inventory total
- **PF-R20-01 · P2** — The asset register creates safety-critical records but provides no correction or retirement path
- **PF-R20-03 · P2** — Preventive maintenance is a read-only placeholder, so recurrence cannot be managed
- **PF-R20-06 · P2** — Production UI advertises forbidden D365 pull/import concepts despite export-only enforcement

## Ważne pozytywne regresje

Audyt potwierdził między innymi:

- NPD nie wykonuje już starego bezpośredniego skoku G0→G3, a delete projektu blokuje powiązany FG; pozostały inne gate-truth defects;
- pilot WO zwraca konkretny blocker supplier spec/material;
- podstawowe consume/output `0.48`, hold e-sign, genealogia, waste, low-yield dialog i WAC działają w przetestowanych wariantach;
- edycja MWO i civil date są trwałe;
- calibration same-actor jest odrzucana atomowo i nie tworzy rekordu;
- Finance WAC/FIFO, reporting reversed-range oraz wymagane przez PRD `AVG(quality_pct)` w OEE przeszły kontrolę Run 19;
- ponowna próba przyjęcia, receipt reversal, inactive supplier i część lifecycle guardów działają w scenariuszach opisanych w raportach.

`PASS` oznacza wyłącznie konkretny wariant i dane danego runu, nie globalny dowód poprawności całego modułu.

## Cleanup, dane produkcyjne i ograniczenia

- Wszystkie mutacje wykonywano przez widoczny UI produkcyjny. Nie wykonywano bezpośrednich zapisów DB/API, zmian produktu, commitów ani deployów.
- Każdy raport zawiera własną sekcję cleanup. Nie usuwano obcych danych ani nie obchodzono aktywnych safety gate.
- Run 20 pozostawił `NIGHT-R20-20260718T102013Z-AST` jako Active, bo asset registry nie ma lifecycle CRUD.
- Run 20 pozostawił `MWO-2026-00003` jako In progress z aktywnym LOTO. Ten stan wymaga drugiego uprawnionego signera; ten sam aktor został prawidłowo odrzucony przy release, więc nie wymuszono niebezpiecznego cleanup.
- Instrument kalibracyjny Run 20 został ustawiony Out of service; nie powstał rekord kalibracji.
- Część scenariuszy dual-sign/S22/C119 była zablokowana przez brak drugiej niezależnej, uprawnionej tożsamości. Nie podstawiano UUID ani nie używano obcego konta.
- Skaner ma osobny PIN flow; jego pełna ścieżka była testowana w Run 17, a globalny crawl Run 20 nie zakładał nowej konfiguracji PIN.
- Root cause jest browser-inferred tylko tam, gdzie raport jawnie wiąże obserwację z odczytem źródła. Zachowanie produkcyjne pozostaje dowodem nadrzędnym.

## Kontrola wykonania

| Kontrola | Wynik |
|---|---:|
| Runy zakończone | 20/20 |
| Raporty źródłowe | 20/20 |
| Raw findings | 113 |
| Canonical findings | 113 |
| Severity sum | 5 + 60 + 43 + 5 = 113 |
| Skan haseł/tokenów katalogu audytu | brak dopasowań; adresy kont testowych pozostają w dowodach UI |
| Produkt / commit / deploy zmieniony przez audyt | nie |

Po Run 20 wykonano dodatkową, read-only próbę orkiestracji dwóch agentów. Dwa oddzielne procesy Chrome, profile i porty sterowania działały jednocześnie na rozłącznych zakresach NPD i Settings; oba zamknęły własne procesy bez wpływu na drugi. Próba nie jest liczona jako run ani źródło findingów. Tymczasowe profile, screenshoty i runner zostały usunięte.

Raport jest zamknięciem audytu, nie stwierdzeniem naprawy. Każdy finding pozostaje otwarty do czasu wdrożenia poprawki i ponownej weryfikacji produkcyjnej z dowodem adekwatnym do ryzyka.
