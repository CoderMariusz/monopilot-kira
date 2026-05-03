# Monopilot Kira — raport readiness/gap dla pierwszych 3 modułów

Data: 2026-05-03
Repo analizowane read-only: `/tmp/monopilot-kira-current`
Commit: `cef4b4b403f475f5a6c6ce5d2add26d733f893c9` (`merge: review-implementation-readiness — prototype_match, gap tasks...`)

Uwaga operacyjna: nie modyfikowałem repo roboczego w `/Users/mariuszkrawczyk/Projects/monopilot-kira`, bo lokalny checkout miał untracked `.claude/skills/*`. Do analizy zrobiłem świeży shallow clone w `/tmp/monopilot-kira-current`.

## 1. Executive summary

Przeanalizowałem z 3 równoległymi agentami moduły:

1. `01-NPD`
2. `02-SETTINGS`
3. `03-TECHNICAL`

Wniosek główny: dokumentacja i atomic taski są bardzo rozbudowane, ale nie wolno jeszcze odpalać pełnej dużej ACP/dev wave z celem „1:1 prototyp + produkcyjne flow” bez krótkiej fali doprecyzowania. Największe ryzyka nie są w ilości tasków, tylko w sprzecznościach między PRD, UX/prototypem, taskami i semantyką domenową.

Największe blokery cross-module:

1. Naming FA / Product / FG nie jest spójny.
   - `01-NPD-PRD.md` mówi fizycznie `product` + view alias `fa`.
   - `design/01-NPD-UX.md` nadal mówi niemal wszędzie FA.
   - `npd/API.md` i `npd/SCHEMA.md` mówią canonical FG.
   - `03-TECHNICAL` taski są już po FG/WIP rename, ale UX/prototypy Technical nadal mówią FA/PR/process_stage.

2. BOM SSOT nie jest domknięty.
   - `01-NPD-PRD.md` nadal opisuje `fa_bom_view` computed view.
   - `01-NPD` T-092/T-093 chcą przejść na `bom_headers/bom_lines` jako Single Source of Truth i drop legacy view.
   - `03-TECHNICAL` zakłada własny BOM model jako core.
   - Brakuje jednej decyzji: źródło prawdy dla BOM = NPD Builder, Technical BOM, D365, czy Monopilot local SSOT z D365 sync?

3. Prototyp parity jest nierówne.
   - 01-NPD: 29 tasków referuje `design/Monopilot Design System/npd/...`, a realne pliki są w `npd/...`.
   - 02-SETTINGS: część tasków UI wskazuje ekrany zastępcze/wrong prototype zamiast właściwego ekranu UX.
   - 03-TECHNICAL: PRD/taski są po rename, ale prototypy nie; jest ryzyko, że implementacja będzie wizualnie 1:1, lecz domenowo legacy.

4. Brakuje albo są tylko „docs gap brief” dla kilku ekranów, które jeśli mają być MVP, muszą dostać prawdziwe taski UI/API:
   - Settings: global Import/Export, Roles & Permissions, Pending Invitations, część Schema/Tenant screens.
   - Technical: TEC-014 Bulk Import CSV, TEC-025 BOM Snapshots Viewer, TEC-031 Regulatory Dashboard, TEC-045 Lab Results Log, TEC-052 Cost Import from D365, supplier specs upload/view.
   - NPD: config workflow `/npd/config`, BOM SSOT amendment, Stage-Gate relation to Brief/FA/FG, Sensory D4.

Rekomendacja: zanim rozpoczniemy implementację, zrobić mały „PRD/task-polish wave” na 1-2 dni pracy agentów: lock naming, lock BOM SSOT, poprawić błędne ścieżki/prototype refs, rozdzielić dev-ready od blocked, dopisać brakujące taski albo jawnie oznaczyć out-of-scope.

## 2. Fakty liczbowe

Zweryfikowane skryptem:

- `01-npd`: 94 taski
  - T1-schema: 24
  - T2-api: 34
  - T3-ui: 25
  - T4-wiring-test: 6
  - T5-seed: 4
  - T-refactor: 1
  - 29 tasków ma referencje do `design/Monopilot Design System/npd/...`

- `02-settings`: 118 tasków
  - T1-schema: 17
  - T2-api: 26
  - T3-ui: 59
  - T4-wiring-test: 11
  - T5-seed: 5
  - 47 tasków ma referencje do `design/Monopilot Design System/settings/...`

- `03-technical`: 71 tasków
  - T1-schema: 7
  - T2-api: 17
  - T3-ui: 32
  - T4-wiring-test: 7
  - docs: 7
  - T5-seed: 1
  - 11 tasków ma partial/block/open/doc-gap sygnały

## 3. 01-NPD — readiness i luki

Źródła: `01-NPD-PRD.md`, `design/01-NPD-UX.md`, `npd/*.jsx`, `npd/README.md`, `npd/API.md`, `npd/SCHEMA.md`, `_meta/atomic-tasks/01-npd/tasks/*.json`, `coverage.md`, audyt 2026-04-30.

### Status

Nie jest gotowe do pełnej ACP/dev wave 1:1. Jest gotowe do selektywnej fali schema/API po decyzjach naming/BOM i po poprawieniu kilku tasków.

### Co jest dobrze pokryte

Submoduły są szeroko rozpisane:

- NPD-a: core schema/product/fa/prod_detail/dept tabs/RLS/audit — T-001..T-029
- NPD-b: Brief + convert-to-PLD — T-030..T-035
- NPD-c: Allergens cascade — T-036..T-040 plus T-026
- NPD-d: D365 Builder/BOM — T-041..T-047
- NPD-e: Dashboard — T-048..T-053, T-091
- NPD-f: Stage-Gate Pipeline — T-054..T-062
- NPD-g: Recipe/Formulation — T-063..T-068
- NPD-h: Nutrition/Costing/Sensory — T-069..T-076
- NPD-i: Approval/Risk/Compliance Docs — T-077..T-088
- misc: GDPR / D365 cache — T-089/T-090
- late amendments: BOM SSOT / FG rename — T-092/T-093/T-094

### Najważniejsze blokery

1. FA/Product/FG naming conflict

Task do zablokowania: `01-npd/tasks/T-094.json`.

Problem:
- PRD mówi: physical table `product`, `fa` view alias.
- UX mówi FA.
- API/SCHEMA mówią FG.
- T-094 referuje `§terminology-fg`, którego w PRD nie ma.

Decyzja wymagana:
- Użytkownik ma widzieć FA, Product czy FG?
- URL: `/npd/fa`, `/npd/fg`, czy `/npd/products`?
- DB canonical: `product`, `fg`, `npd_fgs`?
- Eventy zostają `fa.*`, czy rename do `fg.*`?

2. BOM SSOT conflict

Taski do zablokowania: `T-092`, `T-093`, częściowo `T-045`.

Problem:
- PRD §10.7 nadal opisuje computed `fa_bom_view`.
- T-092/T-093 przechodzą na `bom_headers/bom_lines` i drop legacy view.
- Ref `§bom-ssot-architecture` nie istnieje w PRD.
- T-093 nie powinien być parallel-safe z T-094, bo rename FA→FG i BOM migration dotykają tych samych identyfikatorów.

3. NPD config workflow nie ma pełnego task/PRD anchor

W prototypie są pliki:
- `npd/config-screens.jsx`
- `npd/config-runtime.jsx`
- `npd/config-data.jsx`

README opisuje Configuration jako jeden z głównych workflow. UX route map i taski nie mają równorzędnego submodułu. Jeśli `/npd/config` ma być MVP, trzeba dodać submoduł/taski.

4. Stage-Gate vs Brief→PLD/FA/FG

PRD mówi, że Stage-Gate jest parallel i mapuje project 1:1 do FA po G3. Jednocześnie Brief conversion tworzy PLD/FA/FG. Trzeba zdecydować, który flow jest kanoniczny i kiedy następuje handoff.

5. Sensory D4

Taski: `T-071`, `T-076`, częściowo `T-079`.

PRD mówi „Decision pending (D4)”. Taski budują sensory schema/UI. Powinny być blocked-by-decision albo przepięte na wariant `if D4=BUILD`.

### NPD — taski do poprawy

Krytyczne:
- T-094: zablokować do decyzji FA/Product/FG.
- T-092/T-093: zablokować do PRD amendment BOM SSOT.
- T-044/T-047/T-087: dopisać V18 risk built-blocker do D365 pre-flight.
- T-071/T-076/T-079: zablokować od D4 Sensory decision.
- T-025: błędne references do T-066/T-064; poprawić numerację zależności.
- T-046: D365 wizard — poprawić prototype path i zależność do T-047/mock interface.
- Wszystkie 29 tasków z path `design/Monopilot Design System/npd/...`: poprawić na repo-relative `npd/...` albo jawnie wskazać source-of-truth.

### NPD — dev-ready po polishu

- T-001..T-018 core schema/API, jeśli zostaje product/fa model.
- T-030..T-035 Brief MVP jako placeholder dla C21-C37.
- T-036..T-040 Allergens po ustaleniu storage current-state vs override audit.
- T-041..T-047 D365 po decyzji paste-only vs push i V18.
- T-048..T-053/T-091 dashboard po dopisaniu controls.

Nie gotowe bez rewrite:
- T-092/T-093/T-094
- Sensory T-071/T-076
- pełny `/npd/config`
- pełny Stage-Gate handoff, jeśli ma być kanoniczny MVP

## 4. 02-SETTINGS — readiness i luki

Źródła: `02-SETTINGS-PRD.md`, `design/02-SETTINGS-UX.md`, `settings/*.jsx`, `_meta/atomic-tasks/02-settings/tasks/*.json`, coverage, audyt, settings plans.

### Status

Backend/API/data są dość gotowe. UI/prototype parity nie jest gotowe 1:1 dla całego modułu.

Największy problem: część tasków mówi `prototype_match=true`, ale wskazuje inny ekran albo ekran zastępczy. To może wprowadzić agentów w błąd.

### Najważniejsze luki

1. Onboarding

Taski: `T-037`, `T-041..T-046`, `T-080`.

Problem:
- User wskazał `/settings/onboarding-screens.jsx`.
- Taski T-041..T-046 bazują raczej na rozbitych screenach w design path (`org-screens.jsx`, `data-screens.jsx`), nie na właściwym onboarding prototype.
- Numeracja UX vs PRD po S-U1 jest rozjechana.

Wniosek:
- T-037 i T-080 są sensowne.
- T-041..T-046 wymagają rewrite pod `settings/onboarding-screens.jsx` albo jawnego „production divergence”.

2. Users / Roles / Security

Taski: `T-052`, `T-053`, `T-055`, `T-058`, `T-059`, `T-060`, plus backend auth.

Problemy:
- Brakuje pełnego taska dla Roles & Permissions screen zgodnego z UX SET-011.
- Pending Invitations może być osobnym ekranem w UX, ale w taskach nie jest jasno pokryty.
- T-060 Security ma numerację SET-012 vs UX SET-026 — trzeba ujednolicić IA/kody.

3. Data / Reference

Taski backend są dobre: `T-008`, `T-021`, `T-022`, `T-038..T-040`, `T-093`.

Problemy UI:
- T-096 CSV Import Wizard wskazuje reference screen, a nie prawdziwy import wizard. Powinien być spec-driven z UX SET-053 albo mieć własny prototyp.
- ManufacturingOperations UI (`T-077`, `T-078`) musi mieć acceptance na pola specyficzne dla operations, nie tylko generic reference table.

4. Schema / Rules / Tenant variations

Największy blok UI Settings.

Taski wymagające rewrite:
- T-097 Column Edit Wizard — wskazuje PromoteToL2Modal, nie SET-031 wizard.
- T-098 Schema Diff Viewer — wskazuje RuleDetailScreen, nie SET-032.
- T-099 Schema Migrations Queue — wskazuje Promotions screen, nie SET-033.
- T-100 Tenant Variations Dashboard — wskazuje FlagsAdminScreen, nie SET-060.
- T-101 Dept Taxonomy Editor — wskazuje PromoteToL2Modal, nie SET-061.
- T-102 Rule Variant Selector — wskazuje RulesRegistryScreen, nie SET-062.

5. Import / Export

Prototyp: `settings/import-export.jsx`.

Problem: taski pokrywają tylko reference CSV import/export (`T-022`, `T-096`, `T-085`), nie globalny Import/Export screen/drawer. Trzeba dodać task albo formalnie out-of-scope.

6. Błędne zależności/referencje

- T-020 backend flag flip referuje UI modal logic T-054; powinien zależeć od D365 service/action T-030.
- T-026 rules deploy mówi, że stub rules/_schemas powstaje w T-068, ale T-068 to Email Templates. Błędna referencja.
- T-084 E2E schema wizard powinien zależeć od T-097, nie tylko T-066.
- T-085 CSV import powinien zależeć od T-096.
- T-028 rollback 7-day lock jest opisany jako open/proposal, a task robi z tego acceptance.
- T-117/T-118 to cross-module QUALITY placeholder; lepiej przenieść/oznaczyć jako integracyjny backlog.

### Settings — dev-ready po polishu

Gotowe lub prawie gotowe:
- T-001..T-015 foundation/schema/auth/RLS/audit
- T-016..T-040 większość core API
- T-047..T-057 modals z realnym prototypem
- T-061/T-062 D365 connection/mapping
- T-063..T-070 rules/reference/flags/promotions częściowo
- T-080..T-090 testy po poprawkach dependency
- T-091..T-095 seeds/docs
- T-111..T-116 spec-driven logs/i18n po doprecyzowaniu backendów

Rewrite przed dev:
- T-041..T-046 onboarding UI
- T-096..T-102 schema/import/tenant UI
- missing global Import/Export
- missing Roles & Permissions / Pending Invitations decision

## 5. 03-TECHNICAL — readiness i luki

Źródła: `03-TECHNICAL-PRD.md`, `design/03-TECHNICAL-UX.md`, `technical/*.jsx`, `_meta/atomic-tasks/03-technical/tasks/*.json`, audyt 2026-04-30.

### Status

Najbardziej technicznie ustrukturyzowany moduł z tej trójki, ale nie jest 1:1 gotowy, bo PRD/taski i UX/prototypy są semantycznie w innych wersjach.

Taski są po rename:
- FG zamiast FA
- WIP zamiast PR
- `manufacturing_operation_name` zamiast process_stage/process_code

UX/prototypy nadal często mówią:
- FA5100 / Factory Article
- PR-code
- process_stage / process_code

To trzeba wprost wpisać w każdy T3-ui task jako red-line albo wcześniej przepisać prototypy.

### Mapa obszarów

1. Item master
- T-001, T-008..T-011, T-027, T-032..T-036, T-064, T-070/T-071

2. BOM
- T-002, T-012..T-015, T-025, T-037..T-045, T-065/T-069

3. BOM Generator
- T-016, T-041

4. D365
- T-007, T-028..T-030, T-055..T-059, T-068

5. Allergens
- T-004, T-017..T-019, T-024, T-026, T-047..T-049

6. Cost
- T-003, T-021, T-023, T-050, T-062, T-068

7. Lab / Supplier specs
- T-005, T-020, T-026, T-060, T-067

### Najważniejsze blokery

1. Semantyka prototypu jest stara

Wszystkie T3-ui taski typu T-032..T-060 powinny mieć red-line:
- nie implementować `fa`/FA5100 jako finalnej domeny, tylko PRD v3.2 `fg`/FG;
- nie implementować PR-code jako finalnego pojęcia, tylko WIP;
- nie implementować process_stage/process_code jako finalnego pola, tylko manufacturing_operation_name.

2. Brak UX/prototypu dla kilku ekranów

Tylko docs/gap brief:
- T-064 TEC-014 Bulk Import CSV
- T-065 TEC-025 BOM Snapshots Viewer
- T-066 TEC-031 Regulatory Compliance Dashboard
- T-067 TEC-045 Lab Results Log
- T-068 TEC-052 Cost Import from D365

Jeśli te ekrany są MVP, potrzebują prawdziwych T3-ui tasków po prototypie.

3. BOM SSOT / D365 / NPD handoff

Najważniejsze pytanie Technical: czy BOM jest authoringiem w Technical, outputem z NPD Builder, czy pulled z D365?

Taski Technical zakładają lokalne BOM tables, ale nie zamykają:
- czy D365 może nadpisać BOM;
- czy NPD może jeszcze edytować BOM draft po Technical approval;
- kiedy NPD Product/FG staje się item row;
- kto tworzy WIP/intermediate items;
- czy D365 publishing item/BOM jest wymagane.

4. Supplier specs / lab model

- T-005 tworzy `supplier_specs`, ale brakuje kompletnego API/UI upload/view/review.
- T-060 specs review odwołuje się do `reference_tables.specifications`, a PRD definiuje `supplier_specs`. To wygląda jak model conflict.
- Lab Results Log jest tylko docs gap (`T-067`).

5. Błędne referencje

- T-016 out_of_scope mówi UI modal T-039, powinno być T-041.
- T-020 out_of_scope mówi UI Lab Results Log T-049 doc, powinno być T-067.
- T-028 out_of_scope mówi Drift UI T-060, powinno być T-059.
- T-024 trigger musi joinować `items`, bo `item_type` nie jest w `item_allergen_profiles`.
- T-001 acceptance mówi 23 columns, a PRD ma szerszy model; trzeba dać explicit listę albo poprawną liczbę.

### Technical — dev-ready po polishu

Można odpalać po krótkiej korekcie:
- T-001..T-007 schema (z poprawką T-001)
- T-008..T-015 core item/BOM API (po decyzji active/effective constraints)
- T-017..T-023 allergen/lab/cost/routing API (po supplier specs decision)
- T-027 schema-driven L3, jeśli Settings contract istnieje
- T-030 D365 health/gate
- T-070 seed
- wybrane READY UI T-032..T-039, T-042..T-048, T-050..T-057, T-059/T-060, ale tylko z naming red-lines

Hold/rewrite:
- T-040 BOM diff partial
- T-041 BOM Generator partial
- T-049 override audit partial
- T-058 DLQ partial/wrong prototype
- T-064..T-068 docs only
- supplier specs API/UI
- D365 item/BOM publishing jeśli ma istnieć
- explicit NPD→Technical handoff task

## 6. Lista pytań do Ciebie / PO / architektury

### A. Naming FA/Product/FG

1. Jaki termin ma widzieć użytkownik końcowy: FA, Product, FG, Finished Goods?
2. Jaki ma być canonical URL: `/npd/fa`, `/npd/fg`, `/npd/products`?
3. Jaka ma być canonical tabela DB: `product`, `fg`, `npd_fgs`, czy `items` z `item_type=fg`?
4. Czy `fa` ma zostać tylko jako compat view, czy w ogóle nie ma istnieć?
5. Czy eventy mają zostać `fa.*`, czy zmienić się na `fg.*`/`product.*`?
6. Czy prototypy Technical/NPD mamy przepisać przed implementacją, czy taski mają robić translację nazw podczas implementacji?

### B. BOM SSOT

7. Co jest Single Source of Truth dla BOM: NPD Builder, Technical BOM, D365, czy Monopilot local BOM z D365 sync?
8. Czy `fa_bom_view` z NPD PRD ma zostać, czy zastępujemy go `bom_headers/bom_lines`?
9. Czy D365 pull może nadpisać lokalny BOM?
10. Czy D365 jest tylko zewnętrznym systemem synchronizacji, czy systemem prawdy?
11. Czy BOM snapshots dla WO mają być z Monopilot active BOM, czy z D365 pulled formula?
12. Jak obsłużyć co-products: gdzie jest parent allocation %, skoro tabela co_products ma allocation dla co-products?

### C. NPD flow / przekazywanie projektu

13. Kanoniczny flow to Brief → PLD/FA/FG → dept close → D365, czy Stage-Gate G0-G4 → G3 creates/maps FG → dept close → D365?
14. Czy Stage-Gate jest MVP, czy równoległy/legacy workflow?
15. Kiedy następuje handoff z NPD do Technical: convert brief, all departments closed, G3, G4, czy D365 build generated?
16. Czy brief conversion tworzy project, czy project tworzy FG, czy oba flow mogą istnieć równolegle?
17. Czy Trial/Pilot/Handoff/Packaging są definitywnie deprecated?
18. Sensory D4: budujemy osobny sensory module, czy absorbuje go Technical/Quality score?

### D. D365

19. Czy Stage 1 ma tylko D365→Monopilot pull items/BOM/formula + Monopilot→D365 WO confirmations?
20. Czy wymagamy Monopilot→D365 publish item/BOM/formula? Jeśli tak, obecnie brakuje epica/tasków.
21. Czy NPD D365 Builder generuje pliki Excel/paste-only, API push, czy lokalne payloady?
22. Czy Missing material blokuje zawsze, a NoCost jest warning/allowed?
23. Jak mapujemy allergens, shelf-life, cost, routing/manufacturing operations do D365?
24. Czy D365 cache refresh jest globalny, per-tenant, czy per-user/manual?

### E. Settings scope

25. Czy source of truth dla Settings prototype to `settings/*.jsx`, czy `design/Monopilot Design System/settings/*.jsx`?
26. Czy global Import/Export (`settings/import-export.jsx`, SET-029) jest w scope Phase 1?
27. Czy Roles & Permissions screen ma być osobnym ekranem w Phase 1?
28. Czy Pending Invitations jest osobnym screenem, czy częścią Users screen?
29. Czy Schema/Tenant UI taski mogą być spec-driven z UX zamiast real prototype parity?
30. Czy T-117/T-118 quality flag placeholders zostają w Settings, czy przenosimy do 09-QUALITY/integration backlog?

### F. Technical / Supplier / Lab / PO/TO

31. Kiedy NPD FG staje się `items` row w Technical?
32. Kto tworzy WIP/intermediate items: NPD Builder, Technical BOM API, czy D365 pull?
33. Czy NPD może edytować BOM draft po Technical approval?
34. Czy supplier_specs jest Phase 1 upload/view, czy tylko Phase 2 supplier portal?
35. Czy `specs_screen` ma operować na supplier_specs, item specs, customer specs, czy reference table specs?
36. Czy lab_results są Technical-owned, czy 09-QUALITY-owned z Technical read model?
37. Czy PO ma automatycznie tworzyć/aktualizować RM items, supplier specs i cost_per_kg?
38. Czy TO wpływa na Technical item status, shelf life, catch weight, lot genealogy?
39. Czy supplier change z PO ma triggerować allergen/cost/spec review?
40. Czy Technical ma walidować RM usability w BOM na podstawie supplier approval / PO source?

## 7. Proponowany plan następnego kroku

### Wave 0 — polish/spec lock przed implementacją

1. Decision doc: FA/Product/FG naming.
2. Decision doc: BOM SSOT + D365 direction.
3. PRD amendments:
   - NPD §4.2 naming
   - NPD §10.7 BOM SSOT
   - NPD §17 Stage-Gate relation
   - NPD Sensory D4
   - Settings global Import/Export / Roles / Pending Invitations scope
   - Technical NPD→Technical handoff / supplier specs / D365 publishing
4. Task patch batch:
   - NPD: T-092/T-093/T-094 blocked or rewritten; fix 29 path refs; fix T-025/T-044/T-047/T-071/T-076.
   - Settings: rewrite T-041..T-046 and T-096..T-102; add missing Import/Export/Roles/Pending if in scope.
   - Technical: fix T-001/T-016/T-020/T-024/T-028/T-050/T-058/T-060; add red-lines to all UI tasks.

### Wave 1 — dev-ready after Wave 0

1. Foundation/schema/API slices:
   - NPD T-001..T-018 selected
   - Settings T-001..T-040 selected
   - Technical T-001..T-015 + T-070 selected

2. UI only after parity source is fixed:
   - avoid Settings T-096..T-102 until rewrite
   - avoid Technical partial/no-prototype T-040/T-041/T-049/T-058/T-064..T-068
   - avoid NPD T-092/T-093/T-094 and Sensory until decisions

## 8. Bottom line

Nie traktowałbym obecnego backlogu jako „gotowy do automatycznej pełnej implementacji 1:1”. Traktowałbym go jako bardzo dobry, prawie kompletny backlog, który wymaga krótkiej fali normalizacji:

- zablokować 6-10 ryzykownych tasków,
- poprawić 20-30 referencji/prototype paths,
- dodać kilka brakujących tasków UI/API,
- podjąć około 10 decyzji domenowych.

Po tym można bezpiecznie uruchamiać małe ACP waves, najpierw schema/API, potem UI parity.
