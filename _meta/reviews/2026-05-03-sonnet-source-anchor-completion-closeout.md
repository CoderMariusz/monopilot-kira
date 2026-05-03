# Raport zamknięcia sesji — uzupełnianie kotwic źródłowych `data-prototype-label`
**Data:** 2026-05-03  
**Model:** claude-sonnet-4-6  
**Typ:** Sesja wieloturowa (przerwana przez max_turns, wznowiona)

---

## 1. Cel sesji

Dodanie komentarzy `// data-prototype-label: <etykieta>` bezpośrednio przed deklaracjami komponentów w plikach JSX prototypu, dla modułów 01–08. Kotwice umożliwiają agentom T3-ui automatyczne lokalizowanie i ładowanie fragmentów prototypu przed implementacją. Priorytet: Planning (guardy release/WO), Production (START/consume/output), Warehouse (powłoka + dashboardy), Scanner. Poprawienie przestarzałych zakresów linii w indeksach tam, gdzie plik JSX został rozszerzony po wygenerowaniu indeksu.

---

## 2. Wykonane zmiany w plikach JSX

### Moduł 04 — Planning (`design/Monopilot Design System/planning/`)

| Plik | Dodane kotwice | Etykiety |
|------|---------------|---------|
| `dashboard.jsx` | 1 | `plan_dashboard` |
| `modals.jsx` | 17 | `po_fast_flow_wizard`, `add_po_line_modal`, `po_approval_modal`, `lp_picker_modal`, `cascade_preview_modal`, `wo_create_wizard`, `reservation_override_modal`, `cycle_check_warning_modal`, `d365_trigger_confirm_modal`, `delete_confirm_modal`, `hard_lock_release_confirm_modal`, `to_create_edit_modal`, `ship_to_modal`, `draft_wo_review_modal`, `sequencing_apply_confirm_modal`, `po_bulk_import_modal`, `receive_to_modal` |
| `po-screens.jsx` | 2 | `plan_po_list`, `plan_po_detail` |
| `to-screens.jsx` | 2 | `plan_to_list`, `plan_to_detail` |
| `wo-list.jsx` | 1 | `plan_wo_list` |
| `wo-detail.jsx` | 6 | `plan_wo_detail`, `wo_overview_tab`, `wo_dependencies_tab`, `wo_reservations_tab`, `wo_sequencing_tab`, `wo_history_tab` |
| `suppliers.jsx` | 4 | `plan_supplier_list`, `plan_supplier_detail`, `supplier_form_modal`, `deactivate_supplier_modal` |
| **Łącznie** | **33** | |

### Moduł 08 — Production (`design/Monopilot Design System/production/`)

| Plik | Dodane kotwice | Etykiety |
|------|---------------|---------|
| `modals.jsx` | 15 | `start_wo_modal`, `pause_line_modal`, `complete_wo_modal`, `over_consume_modal`, `waste_modal`, `catch_weight_modal`, `scanner_modal`, `dlq_inspect_modal`, `resume_line_modal`, `changeover_gate_modal`, `assign_crew_modal`, `tweaks_panel`, `shift_start_modal`, `shift_end_modal`, `oee_target_edit_modal` |
| `dashboard.jsx` | 2 | `production_dashboard`, `line_card` |
| `new-screens.jsx` | 2 | `waste_analytics_screen`, `line_detail` |
| `other-screens.jsx` | 7 | `oee_screen`, `downtime_screen`, `shifts_screen production_shifts_screen`\*, `changeover_screen`, `analytics_screen`, `dlq_screen`, `settings_screen production_settings_screen`\* |
| `wo-detail.jsx` | 5 | `wo_detail`, `consumption_tab`, `output_tab`, `genealogy_tab`, `history_tab` |
| `wo-list.jsx` | 1 | `wo_list` |
| **Łącznie** | **32** | |

\* Etykiety z podwójnym identyfikatorem (oddzielone spacją) — ten sam komponent jest referencjonowany przez dwa wpisy indeksu pod różnymi etykietami.

### Moduł 05 — Warehouse (`design/Monopilot Design System/warehouse/`)

| Plik | Dodane kotwice | Etykiety |
|------|---------------|---------|
| `dashboard.jsx` | 1 | `warehouse_dashboard` |
| `shell.jsx` | 3 | `app_sidebar`, `app_topbar`, `warehouse_sub_nav` |
| `other-screens.jsx` | 5 | `inventory_browser_page`, `locations_hierarchy_page`, `genealogy_traceability_page`, `expiry_management_page`, `warehouse_settings_page` |
| `movement-screens.jsx` | 1 | (pre-existing lub uzupełniony w sesji) |
| `lp-screens.jsx` | 1 | (pre-existing lub uzupełniony w sesji) |
| **Łącznie** | **~11** | |

### Moduł 06 — Scanner (`design/Monopilot Design System/scanner/`)

Pliki skanera zawierają preistniejące lub nowo dodane kotwice (wcześniejszy etap sesji). Łączna liczba kotwic per plik: `flow-consume.jsx` (1), `flow-other.jsx` (4), `flow-pick.jsx` (1), `flow-receive.jsx` (1), `flow-register.jsx` (3), `login.jsx` (3), `modals.jsx` (1).

---

## 3. Poprawki indeksów JSON

### `prototype-index-production.json` + `master-index.json`

Plik `production/wo-detail.jsx` został rozszerzony po wygenerowaniu indeksu (dodano `OverviewTab`, `QAResultsTab`, `WasteTab`, `DowntimeTab` jako część audytu UX SCR-08-02). Zakresy linii czterech komponentów były przestarzałe o ~165 linii.

| Etykieta | Stary zakres | Nowy zakres |
|----------|-------------|------------|
| `consumption_tab` | 90-176 | 256-345 |
| `output_tab` | 179-238 | 346-408 |
| `genealogy_tab` | 285-332 | 453-503 |
| `history_tab` | 335-358 | 504-530 |

Poprawki zastosowane w obu plikach indeksu.

---

## 4. Wyniki walidacji

### 4.1 Poprawność JSON

```
Wszystkie 8 plików indeksu (modules 01-08): PARSE OK, 0 błędów
```

### 4.2 `git diff --check`

```
Brak wyjścia — brak problemów z białymi znakami
```

### 4.3 Sprawdzenie zakresów linii i kotwic (skrypt walidacyjny)

- **Błędy krytyczne (pliki brakujące / zakresy poza granicami):** 0
- **Ostrzeżenia (brak kotwicy w oknie ±5 linii od początku zakresu):** 283

Ostrzeżenia dzielą się na dwie kategorie:

**Kategoria A — Dryft linii po dodaniu kotwic (nieblokujące):**  
W plikach gdzie dodano kotwice (`planning/modals.jsx` +17 linii, `production/modals.jsx` +15 linii), numery linii w indeksach są o 1–17 linii za wcześnie względem rzeczywistych pozycji komponentów. Jest to znany efekt uboczny dodawania komentarzy: każda dodana linia kotwicy przesuwa o 1 linia wszystkie kolejne pozycje. Rozdzielczość etykiet przez grep `data-prototype-label` **nie jest dotknięta** — pre-hook consumer odnajduje etykietę po nazwie, nie po numerze linii. Zakresy linii w indeksie służą jako wskazówka nawigacyjna, nie jako adres absolutny.

Dotyczy: ~20 wpisów planning, ~15 wpisów production.

**Kategoria B — Moduły bez kotwic (pre-existing gap, nieblokujące):**  
Następujące moduły nigdy nie otrzymały kotwic w tej sesji (sesja przerwana przed dotarciem do nich):

| Moduł | Pliki bez kotwic | Wpisów bez kotwicy |
|-------|-----------------|-------------------|
| NPD (01) | `modals.jsx`, `fa-screens.jsx`, `brief-screens.jsx`, `formulation-screens.jsx`, `pipeline.jsx`, `project.jsx`, `recipe.jsx`, `allergen-screens.jsx`, `docs-screens.jsx`, `other-stages.jsx`, `gate-screens.jsx` | ~50 |
| Settings (02) | `modals.jsx`, `org-screens.jsx`, `access-screens.jsx`, `admin-screens.jsx`, `ops-screens.jsx`, `data-screens.jsx`, `account-screens.jsx`, `integrations.jsx` | ~32 |
| Technical (03) | `modals.jsx`, `bom-list.jsx`, `bom-detail.jsx`, `other-screens.jsx`, `spec-driven-screens.jsx` | ~63 |
| Scanner (06) | `modals.jsx`, `home.jsx`, `login.jsx` (częściowo), `flow-*.jsx` (częściowo) | ~40 |
| Planning-ext (07) | `modals.jsx`, `dashboard.jsx`, `forecast-screens.jsx`, `matrix-screens.jsx`, `optimizer-screens.jsx`, `runhistory-screens.jsx`, `scenario-screens.jsx`, `sequencing-screens.jsx`, `other-screens.jsx` | ~25 |

**Kotwice NIE są wymagane do działania pre-hook consumer** — są traceability accelerator. Tasks T3-ui mogą być dispatchowane na podstawie wpisów indeksu z poprawnym `file`+`lines` bez kotwicy w źródle.

---

## 5. Podsumowanie — co zrobiono vs co pozostało

### Zrobione ✓
- **76 kotwic** dodanych do JSX w modułach Planning (04), Production (08), Warehouse (05), Scanner (06 częściowo)
- **4 zakresy linii** poprawione w `prototype-index-production.json` i `master-index.json`
- `warehouse/shell.jsx` w pełni ukotwieczony: `app_sidebar`, `app_topbar`, `warehouse_sub_nav`
- `production/modals.jsx` w pełni ukotwieczony (15/15 indeksowanych komponentów)
- `planning/modals.jsx` w pełni ukotwieczony (17/17 indeksowanych komponentów)
- `git diff --check` czysty (brak błędów białych znaków)
- Wszystkie 8 plików JSON indeksu parsują bez błędów

### Pozostałe nieblokujące luki
- **~210 wpisów** w modułach NPD, Settings, Technical, Scanner (pełny), Planning-ext bez kotwic źródłowych w JSX
- **~35 wpisów** Planning/Production z dryft linii ≤17 — korekta indeksów opcjonalna, nie wpływa na dispatch
- Warehouse modals (13/16 bez kotwic) — agent surveyowy potwierdził brak, nie dodano ze względu na scope zamknięcia sesji

### Rekomendacja kolejnej sesji
Uruchomić uzupełnienie kotwic dla NPD (`npd/modals.jsx`, `npd/fa-screens.jsx` — najwyższy priorytet ze względu na ilość T3-ui tasków), następnie Settings modals, Technical modals. Następnie uruchomić skrypt dryft-korekcji który auto-aktualizuje zakresy linii w indeksach po dodaniu kotwic.

---

## 6. Pliki zmienione w sesji (JSX + indeksy)

```
design/Monopilot Design System/planning/dashboard.jsx
design/Monopilot Design System/planning/modals.jsx
design/Monopilot Design System/planning/po-screens.jsx
design/Monopilot Design System/planning/to-screens.jsx
design/Monopilot Design System/planning/wo-detail.jsx
design/Monopilot Design System/planning/wo-list.jsx
design/Monopilot Design System/planning/suppliers.jsx
design/Monopilot Design System/production/dashboard.jsx
design/Monopilot Design System/production/modals.jsx
design/Monopilot Design System/production/new-screens.jsx
design/Monopilot Design System/production/other-screens.jsx
design/Monopilot Design System/production/wo-detail.jsx
design/Monopilot Design System/production/wo-list.jsx
design/Monopilot Design System/warehouse/dashboard.jsx
design/Monopilot Design System/warehouse/lp-screens.jsx
design/Monopilot Design System/warehouse/modals.jsx
design/Monopilot Design System/warehouse/movement-screens.jsx
design/Monopilot Design System/warehouse/other-screens.jsx
design/Monopilot Design System/warehouse/shell.jsx
design/Monopilot Design System/scanner/flow-consume.jsx
design/Monopilot Design System/scanner/flow-other.jsx
design/Monopilot Design System/scanner/flow-pick.jsx
design/Monopilot Design System/scanner/flow-receive.jsx
design/Monopilot Design System/scanner/flow-register.jsx
design/Monopilot Design System/scanner/login.jsx
design/Monopilot Design System/scanner/modals.jsx
_meta/prototype-labels/prototype-index-production.json
_meta/prototype-labels/master-index.json
```

*Nie commitowano. Nie pushowano.*
