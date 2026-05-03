# 05-WAREHOUSE — audit gotowości PRD/UX/prototype-label/tasks do 95%+

Data: 2026-05-03
Repo: `/Users/mariuszkrawczyk/Projects/monopilot-kira`
Zakres: tylko audyt/read-only; utworzono ten raport w `_meta/reviews`.

## Źródła sprawdzone

- `docs/prd/05-WAREHOUSE-PRD.md` v3.2
- `prototypes/design/05-WAREHOUSE-UX.md`
- `prototypes/design/Monopilot Design System/warehouse/*.jsx`
- `warehouse/warehouse.html` oraz `prototypes/design/Monopilot Design System/warehouse/warehouse.html` pod kątem literalnych labeli
- `_meta/prototype-labels/prototype-index-warehouse.json`
- `_meta/prototype-labels/master-index.json`
- `_meta/atomic-tasks/05-warehouse/tasks/T-001..T-047.json`
- `_meta/atomic-tasks/05-warehouse/_validate.py`
- Wave0 shape reference: `_meta/reviews/2026-05-03-acp-real-task-shape.md`, `_meta/reviews/2026-05-03-wave0-readiness-hardening-closeout.md`

## Executive verdict

Aktualny stan: około 80-85% gotowości do importu/realizacji backendowej, ale nie 95%+ jak Wave0.

Największe blokery do 95%+:

1. Brak `manifest.json` i `coverage.md` w `_meta/atomic-tasks/05-warehouse/`; lokalny validator kończy się błędem `FAIL: manifest.json missing`.
2. Atomic task set ma 47 tasków, ale zero tasków `T3-ui`; nie obejmuje implementacji 31 prototypowych powierzchni UX ani screenshot/trace closeout wymagań Wave0.
3. Prototype labels są obecne w indexach, ale nie są literalnie przypisane w JSX/HTML (`data-prototype-label`, komentarz, stała lub label string). To oznacza index-only traceability, podatną na drift.
4. PRD/UX nadal wskazują znane TODO/gapy: WH-109 Shelf Life Rules CRUD bez UX/prototypu; M-12 ma niespójny status w PRD matrix (`[NO-PROTOTYPE-YET]`, ale index zawiera `use_by_override_modal`); WH-008 destination optional vs UX required.
5. Taski są ACP-shape-friendly top-level i mają bogate prompty jak na backend, ale nie są pełnym planem 05-WAREHOUSE end-to-end: brak coverage, brak cross-module dependency metadata, brak UI parity tasks, brak final readiness/manifest task.

## PRD / UX / prototype coverage

PRD v3.2 deklaruje wzrost UX/PRD bidirectional coverage z ~75% do ≥90% i zawiera §16.6 UI Surfaces Coverage Matrix.

UX ma 35 nagłówków ekranów/modali:
- WH-001..WH-020: 20 pozycji, z WH-006/WH-011 zduplikowanym route dla movements.
- M-01..M-15: 15 modali/flow-modal surfaces.

Prototype index warehouse ma 31 wpisów. Master index ma 31 wpisów z `module = warehouse`, więc module index i master są zgodne liczbowo.

Wpisy indexu obejmują główne strony i modale:
- Pages/layout: `warehouse_dashboard`, `lp_list_page`, `lp_detail_page`, `grn_list_page`, `grn_detail_page`, `stock_movement_list_page`, `reservations_list_page`, `inventory_browser_page`, `locations_hierarchy_page`, `genealogy_traceability_page`, `expiry_management_page`, `warehouse_settings_page`.
- Modals/wizards: `grn_from_po_wizard`, `grn_from_to_modal`, `stock_move_modal`, `lp_split_modal`, `lp_merge_modal`, `qa_status_change_modal`, `label_print_modal`, `reserve_lp_modal`, `release_reservation_modal`, `fefo_deviation_modal`, `destroy_scrap_lp_modal`, `use_by_override_modal`, `location_edit_modal`, `cycle_count_adjustment_modal`, `state_transition_confirm_modal`, `force_unlock_scanner_modal`.
- Shell: `app_sidebar`, `app_topbar`, `warehouse_sub_nav`.

Czy UX prototypes są zbudowane dla każdego ekranu?

Prawie dla każdego P1 screen/modal z WH-001..WH-020 i M-01..M-15, ale z wyjątkami/uwagami:

- WH-109 Shelf Life Rules CRUD: brak UX i brak prototypu. PRD §12.5 i §16.6 jawnie oznaczają `[NO-PROTOTYPE-YET] TODO Phase E`.
- WH-015 Available LPs Picker: nie ma dedykowanego labela/prototypu; PRD matrix uznaje go za logikę w `lp_list_page` + reservations flow.
- WH-017 WO Reservations Panel: brak osobnego dedykowanego component labela; PRD matrix mapuje na `reservations_list_page` + per-WO panel.
- M-12 Use_by Block Override: prototyp/index zawiera `use_by_override_modal`, ale PRD §12.7 mówi `[NO-PROTOTYPE-YET]`, a §16.6 mówi „prototype exists in index — verify mapping”. To wymaga ujednolicenia.
- Pełne cycle counts, ASN, pallets/SSCC, scanner offline i EPCIS są poprawnie P2/P3 bez P1 prototypu.

## Prototype labels

Stan indexów:

- `_meta/prototype-labels/prototype-index-warehouse.json`: 31 entries.
- `_meta/prototype-labels/master-index.json`: 31 warehouse entries.
- Translation notes są bogate: shadcn equivalents, known bugs, estimated translation time, translation notes.

Stan w JSX/HTML:

- Literalne sprawdzenie labeli z indexu w `prototypes/design/Monopilot Design System/warehouse/*.jsx` zwróciło 0 wystąpień dla wszystkich 31 labeli.
- Literalne sprawdzenie wybranych labeli w `warehouse/warehouse.html` i `prototypes/design/Monopilot Design System/warehouse/warehouse.html` również zwróciło 0.

Wniosek: etykiety są przypisane w indexie do plików/linii, ale nie są osadzone w samym prototypie/JSX. Do 95%+ potrzebny jest „dual anchor”: index + literalny znacznik w kodzie prototypu, np. `data-prototype-label="lp_list_page"` na root elementach albo komentarz/stała tuż przy definicji komponentu.

## Atomic tasks readiness

Folder istnieje:

- `_meta/atomic-tasks/05-warehouse/tasks/T-001..T-047.json`
- `_meta/atomic-tasks/05-warehouse/_validate.py`

Task count: 47.
Task types:

- `T1-schema`: 12
- `T2-api`: 32
- `T5-seed`: 3
- `T3-ui`: 0
- `T4-wiring-test`: 0
- docs/final coverage tasks: 0

ACP shape:

- Top-level shape jest zgodny z realnym ACP TaskCreate: `title`, `prompt`, `labels`, `priority`, `max_attempts`, `pipeline_name`, `pipeline_inputs`.
- `pipeline_name = kira_dev` i `pipeline_inputs.root_path` są obecne.
- Wymagane canonical metadata są obecne w taskach: `description`, `details`, `scope_files`, `acceptance_criteria`, `test_strategy`, `risk_red_lines`, `skills`, `checkpoint_policy`.
- Dependencies są lokalne w formacie `T-XXX`; brak wykrytych invalid deps.
- Priority jest w zakresie 50-110, niższe wartości idą wcześniej.

Validator wynik:

- `Validated 47 tasks`
- `FAIL: manifest.json missing`

Dodatkowo `coverage.md` nie istnieje, więc validator po dodaniu manifestu i tak wymagałby coverage.

Jakość promptów:

- Prompty są sensownie bogate dla schema/API/seed; min długość ok. 1268 znaków, max ok. 2096 znaków.
- Acceptance criteria i test_strategy są obecne, ale zwykle krótkie i backendowe.
- Nie ma UI tasków z prototype parity AC, screenshot evidence, Playwright trace/artifacts, ani mappingu UX line → prototype label → route.
- Brak `pipeline_inputs.cross_module_dependencies`, mimo że PRD §16.2/§16.5 ma jawne zależności od 02-SETTINGS, 03-TECHNICAL, 04-PLANNING, 06-SCANNER-P1 itd. Obecnie cross-module blockers żyją w PRD/promptach, ale nie jako metadata.

## Główne gaps / blockery

### B1 — Manifest/coverage brak

Utworzyć:

- `_meta/atomic-tasks/05-warehouse/manifest.json`
- `_meta/atomic-tasks/05-warehouse/coverage.md`

Coverage powinno mapować PRD §/FR/V-rules/UX/prototype labels do T-001..T-0NN i jawnie oznaczać gaps/deferred P2.

### B2 — Brak UI implementation tasks

Dodać `T3-ui` dla co najmniej P1 surfaces:

- Dashboard + shell/nav: `warehouse_dashboard`, `app_sidebar`, `app_topbar`, `warehouse_sub_nav`
- LP list/detail: `lp_list_page`, `lp_detail_page`
- GRN list/detail/wizards: `grn_list_page`, `grn_detail_page`, `grn_from_po_wizard`, `grn_from_to_modal`
- Movement/reservation: `stock_movement_list_page`, `stock_move_modal`, `reservations_list_page`, `reserve_lp_modal`, `release_reservation_modal`
- LP actions: `lp_split_modal`, `lp_merge_modal`, `qa_status_change_modal`, `state_transition_confirm_modal`, `force_unlock_scanner_modal`, `destroy_scrap_lp_modal`, `label_print_modal`
- Inventory/location/genealogy/expiry/settings: `inventory_browser_page`, `locations_hierarchy_page`, `location_edit_modal`, `genealogy_traceability_page`, `expiry_management_page`, `use_by_override_modal`, `warehouse_settings_page`

Każdy T3-ui powinien mieć:

- PRD refs, UX line refs, prototype label, prototype file/line refs.
- Structural/visual/interaction parity acceptance criterion.
- RBAC/tenant/RLS expectations where relevant.
- Screenshot and Playwright trace closeout requirements.
- Explicit wiring to backend task dependency (`T-016..T-047`) or cross-module blocker.

### B3 — Prototype labels not embedded in JSX

Dodać literalne anchors do prototypów albo zaakceptować index-only jako świadomy wyjątek. Rekomendacja do 95%+: osadzić label przy root elementach/komponentach:

- `data-prototype-label="warehouse_dashboard"`
- `data-prototype-label="lp_list_page"`
- itd.

Po zmianie uruchomić prosty checker: każdy label z indexu musi wystąpić minimum raz w plikach prototypu.

### B4 — PRD/prototype inconsistencies

Do rozstrzygnięcia przed importem tasków UI:

- M-12: czy `use_by_override_modal` jest oficjalnym prototypem? Jeśli tak, usunąć/zmienić `[NO-PROTOTYPE-YET]` w §12.7 i §16.6.
- WH-008: PRD mówi destination optional, UX wymaga. Ustalić finalną regułę i zaktualizować PRD/UX/task acceptance.
- WH-109: zdecydować, czy Shelf Life Rules CRUD jest P1 UI. Jeśli tak: dopisać UX section, prototype label i T3-ui/T2-api task; jeśli nie: task schema/API-only zostaje, a UI oznaczyć P2/deferred konsekwentnie.

### B5 — Cross-module blockers not encoded

Dodać do relevant tasków `pipeline_inputs.cross_module_dependencies`, zgodnie z Wave0 konwencją, np.:

- 05-a: 02-SETTINGS rule registry / locations / printers.
- 05-b: 04-PLANNING PO/TO source tables.
- 05-c: 04-PLANNING WO/material reservations schema.
- 05-d: 03-TECHNICAL shelf life/date_code, 06-SCANNER API consumer contract.

Nie wkładać cross-module IDs do lokalnego `dependencies`, jeśli nie są importowalne jako lokalne `T-XXX`.

### B6 — Missing final wiring/test/readiness tasks

Dodać kilka `T4-wiring-test`/docs tasks:

- E2E happy paths: GRN PO → LP create → label → move/putaway → reservation → scan-to-consume → genealogy trace.
- Expiry cron + use_by override E2E.
- Dashboard KPIs + RBAC value gate E2E.
- Final coverage/manifest/readiness patch task.

## Exact plan to reach 95%+ like Wave0

1. Patch prototype traceability:
   - Add literal prototype labels in JSX/HTML for all 31 labels.
   - Add checker script or extend `_validate.py` to verify index labels exist in prototype source.

2. Resolve three PRD/UX consistency issues:
   - M-12 mapping (`use_by_override_modal`) final status.
   - WH-008 optional vs required destination.
   - WH-109 shelf_life_rules CRUD P1 vs P2/no-prototype treatment.

3. Generate missing atomic metadata:
   - Create `manifest.json` with 47 current tasks plus later additions.
   - Create `coverage.md` mapping PRD/FR/V-rules/UX/proto to tasks.
   - Re-run `_validate.py` until PASS.

4. Add UI task wave:
   - Create T3-ui tasks for all P1 screen clusters with prototype parity requirements.
   - Keep tasks atomic by surface/cluster, not mega-task. Suggested +18 to +25 UI tasks.

5. Add wiring/E2E tasks:
   - Create +4 to +7 `T4-wiring-test` tasks for full flows and regression evidence.
   - Include Playwright screenshots/traces as closeout requirements.

6. Harden cross-module metadata:
   - Add `pipeline_inputs.cross_module_dependencies` to all tasks blocked by 02/03/04/06 modules.
   - Keep local `dependencies` only as local `T-XXX`.

7. Final readiness gate:
   - Run `_meta/atomic-tasks/05-warehouse/_validate.py`.
   - Run custom label checker.
   - Confirm coverage has no P1 unowned gap except explicitly deferred/no-prototype with decision.
   - Add final readiness closeout in `_meta/reviews` or coverage changelog.

## Bottom line

05-WAREHOUSE has strong PRD/UX/prototype-index groundwork and a decent backend/API atomic task seed, but it is not yet 95%+ ACP-ready. The main missing layer is not product definition; it is implementation readiness packaging: manifest/coverage, UI tasks, embedded prototype labels, cross-module metadata, and Wave0-grade E2E evidence requirements.
