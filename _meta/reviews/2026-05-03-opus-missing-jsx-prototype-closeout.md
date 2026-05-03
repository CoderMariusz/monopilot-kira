# 03-TECHNICAL — Missing JSX prototype wave (Opus, 2026-05-03)

Repo: `/Users/mariuszkrawczyk/Projects/monopilot-kira`
Branch: `main` (drzewo robocze celowo brudne — kontynuacja fal readiness/polish)
Status: nie commitowane — zgodnie z instrukcją.

## Zakres

Domknięcie luki "missing dedicated JSX prototype" dla pięciu Wave0 spec-driven powierzchni 03-Technical (TEC-014 / TEC-025 / TEC-031 / TEC-045 / TEC-052) oraz dla T-090 FactorySpec+BOM bundle approval. Wcześniej parity AC tych zadań wskazywały tylko adjacent layout-primitives (z fali polishowej v3.3.1). Teraz każde z T-085..T-090 ma dedykowany prototyp z czerwonymi liniami modułu wbudowanymi w copy + data-prototype-label.

Praca wyłącznie w warstwie design-system / PRD / tasków / indeksów — żadnego runtime app code, DB, API, route'ów aplikacji.

## Co zostało zbudowane

### 1. Nowy plik prototypu

`prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx` (793 linie, dołączony do `technical.html` loadera między `modals.jsx` a `app.jsx`).

Komponenty (każdy z `data-prototype-label="…"` markerem na korzeniu):

| TEC / Task | Komponent | Linie | Pattern |
|---|---|---|---|
| TEC-014 / T-085 | `BulkImportCsvScreen` (`bulk_import_csv_screen`) | 25–218 | 4-step wizard upload → validate → diff → confirm; org-scoped; supplier_specs blocker na RM; brak zależności od D365 |
| TEC-025 / T-086 | `BomSnapshotsViewerScreen` (`bom_snapshots_viewer_screen`) | 223–303 | Filtrowalna lista immutable snapshotów po WO, z banerem read-only + statusami in_use/closed/orphaned |
| TEC-025 / T-086 | `BomSnapshotDiffModal` (`bom_snapshot_diff_modal`) | 307–354 | JSON-flatten diff (path / frozen / current / kind: noop\|chg\|add\|rem); brak ścieżki edit |
| TEC-031 / T-087 | `RegulatoryComplianceDashboardScreen` (`regulatory_compliance_dashboard_screen`) | 359–446 | KPI per regulacja (EU 1169/2011, FSMA 204, BRCGS v9, ISO 22000, EU 2023/915) + per-FG flag table z akcją Route → ; wyłącznie routing/remediation, nie porada prawna |
| TEC-045 / T-088 | `LabResultsLogScreen` (`lab_results_log_screen`) | 451–546 | Quality-owned read model; verdict pills + ATP RLU pass/fail; cross-link "Open in QA"; Technical nigdy nie pisze do `lab_results` |
| TEC-052 / T-089 | `CostImportFromD365Screen` (`cost_import_d365_screen`) | 551–648 | D365 cost delta + sign-off ReasonInput przy \|Δ\|≥5% + D365-disabled banner zachowujący lokalną cost history (TEC-050) jako SoT |
| T-090 | `FactorySpecBomBundleApprovalModal` (`factory_spec_bom_bundle_approval_modal`) | 653–781 | Modal z parowanymi statusami factory_spec/BOM, panelem blockerów (RM-usability / supplier_specs / RBAC / release-guard), bannerem clone-on-write, historią approval/reject; Approve disabled gdy są blockery; D365 sync informational only |

Wszystkie używają wyłącznie istniejących prymitywów (`Modal`, `Stepper`, `Field`, `ReasonInput`, `Summary`, `KPI`, `PageHeader`) — żadnych nowych zależności.

### 2. Indeksy prototypów

- `_meta/prototype-labels/prototype-index-technical.json` — dodano 7 wpisów (jeden per komponent powyżej) z 5-wymiarową taksonomią, ≥6 punktów `translation_notes`, mapowaniem `shadcn_equivalent`, depends_on_prototypes, oraz `data-prototype-label` policy w notach.
- `_meta/prototype-labels/master-index.json` — te same 7 wpisów dopisanych z `module: "technical"`. Łącznie master rośnie z 547 → 554 entries.

Każdy zakres `lines` zweryfikowany skryptem (`const <Name>` na linii startowej, end ≤ EOF).

### 3. PRD `docs/prd/03-TECHNICAL-PRD.md`

- §17 master-table — pięć wpisów spec-driven (TEC-014/025/031/045/052) zmieniło Status z `SPEC-DRIVEN (Wave0 task; not a T3-ui drafting blocker)` na `READY (Wave0 dedicated prototype)` z literalnym `path:lines (label)` zamiast tokena `[SPEC-DRIVEN-WAVE0]`.
- §17 legenda — przepisana, by spec-driven Wave0 były opisane jako mające teraz dedykowane prototypy (PRD/UX wciąż canonical na semantyce; prototyp daje layout/flow).
- §17A anchor map — przepisany w całości: każdy z T-085..T-090 ma teraz dedykowany prototype anchor (zamiast pary adjacent anchors). Editing rule pozostaje.
- Changelog — wpis `v3.3.2` streszczający tę falę.

### 4. Taski T-085..T-090

W każdym zaktualizowano pierwsze (kanoniczne parity) AC: zamiana adjacent anchors na dedykowany prototyp + literalna ścieżka `spec-driven-screens.jsx:<start>-<end>` (`<label>`). Zachowane wymagane walidatorem słowa: `structural`, `visual`, `interaction`, `parity`. Czerwone linie domenowe per-task wzmocnione (np. dla T-088 explicit "Technical nigdy nie pisze, nie raisuje NCR, nie sign-offuje", dla T-089 explicit "import nigdy nie nadpisuje cost history in place — appenduje cost_entry tagged source='d365'").

## Decyzje design

1. **Jeden plik vs append do istniejących**: utworzony nowy plik `spec-driven-screens.jsx` zamiast rozdmuchiwania `other-screens.jsx` (1659 linii) i `modals.jsx` (667 linii). Łatwiej zaadresować spec-driven wave jako paczkę i nie ryzykować przesunięć linii w istniejących wpisach indeksu.
2. **Użycie istniejących prymitywów**: konsekwentnie `PageHeader`/`Modal`/`Stepper`/`Field`/`ReasonInput`/`Summary`/`KPI` zamiast wprowadzania nowych. Komponenty ładują się z `_shared/modals.jsx`, `_shared/primitives.jsx`, `other-screens.jsx` — globalnie dostępne via window.
3. **Static demonstrative state**: kontroli stanu lokalnie przez `React.useState`, zgodnie z konwencją reszty modułu. Notatki tłumaczeniowe w indeksie wskazują docelowe Server Actions / Drizzle / Zod / next-intl / outbox events.
4. **Czerwone linie wewnątrz copy, nie tylko AC**: każdy ekran ma alert-blue/amber/red opisujący red-line wprost w UI (FG nie FA, snapshot immutable, Quality-owned, lokalna cost history SoT, clone-on-write, D365 optional). To zmniejsza ryzyko, że T3 implementer translacją zgubi semantykę nawet jeśli pominie task notes.

## Warehouse — celowy skip

Etykiety `available_lp_picker` i `wo_reservations_panel` z 05-Warehouse:

- `available_lp_picker` jest już oznaczony w `prototypes/design/Monopilot Design System/warehouse/lp-screens.jsx:49` jako `data-prototype-label="lp_list_page available_lp_picker"`.
- `wo_reservations_panel` jest oznaczony w `prototypes/design/Monopilot Design System/warehouse/movement-screens.jsx:218` jako `data-prototype-label="reservations_list_page wo_reservations_panel"`.

Oba mają wpisy first-class w `prototype-index-warehouse.json` (T-051 wymaga, by produkcja eksponowała te markery). Powierzchnie istnieją skomponowane wewnątrz parent screens — fala 2026-05-03 hardening świadomie przyjęła ten kompozycyjny model. Tworzenie dedykowanego picker/panel JSX duplikowałoby istniejący JSX i wymagałoby przesuwania zakresów linii w istniejących wpisach indeksu warehouse — bez wartości dla parity AC, bo T-051/T-057 już cytują prawidłowe surface'y. Pozostawiam stan jak jest; warehouse `_validate.py` nie był uruchamiany, bo żaden plik warehouse / indeks warehouse nie został tknięty.

## Pliki zmienione / dodane

Dodane:
- `prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx`
- `_meta/reviews/2026-05-03-opus-missing-jsx-prototype-closeout.md` (ten raport)

Zmienione:
- `prototypes/design/Monopilot Design System/technical/technical.html` (dołączony nowy script)
- `_meta/prototype-labels/prototype-index-technical.json` (+7 entries, plik 1928 → ~2150 linii)
- `_meta/prototype-labels/master-index.json` (+7 entries, 547 → 554)
- `docs/prd/03-TECHNICAL-PRD.md` (§17 5 wierszy + legenda + §17A całość + changelog v3.3.2)
- `_meta/atomic-tasks/03-technical/tasks/T-085.json` — parity AC anchor
- `_meta/atomic-tasks/03-technical/tasks/T-086.json` — parity AC anchor
- `_meta/atomic-tasks/03-technical/tasks/T-087.json` — parity AC anchor
- `_meta/atomic-tasks/03-technical/tasks/T-088.json` — parity AC anchor
- `_meta/atomic-tasks/03-technical/tasks/T-089.json` — parity AC anchor
- `_meta/atomic-tasks/03-technical/tasks/T-090.json` — parity AC anchor

Łącznie: 2 dodane + 10 zmienionych = 12 plików.

## Walidacje uruchomione

```bash
python3 -m json.tool _meta/prototype-labels/prototype-index-technical.json > /dev/null   # OK
python3 -m json.tool _meta/prototype-labels/master-index.json > /dev/null                # OK
python3 _meta/atomic-tasks/03-technical/_validate.py
# Validated 90 task files.
# PASS: all checks green.
git diff --check                                                                          # bez błędów whitespace
```

Plus skrypt cross-checkowy: dla każdego z 7 nowych wpisów potwierdzono, że `lines: "S-E"` startuje literalnie w `const <ExpectedName>` w pliku JSX i że `E ≤ EOF`.

Walidator 03-technical sprawdza m.in. że T3-ui taski z prototypem mają w AC literalną ścieżkę `path:lines` oraz słowa `structural` + `visual` + `interaction` + `parity`. Po zamianie anchorów wszystkie sześć T-085..T-090 dalej spełnia tę regułę (sprawdzone walidatorem).

Walidator warehouse (`05-warehouse/_validate.py`) nie był uruchamiany — żaden plik 05-warehouse / `prototype-index-warehouse.json` nie został zmodyfikowany.

## Pozostałe opcjonalne follow-upy

1. **D365 typy w `data.jsx`** — `D365_STATUS` / `D365_LOG` itd. są używane w prototypach `other-screens.jsx`, ale w nowym `cost_import_d365_screen` celowo użyłem static lokalnych danych żeby plik był samowystarczalny. Można przenieść mock cost-delta do `data.jsx` jeśli zespół konsekwentnie chce centralizować mocki.
2. **Promocja `[SPEC-DRIVEN-WAVE0]` znaczników w `§4A`** — jest tam jeszcze kilka wzmianek o `[SPEC-DRIVEN-WAVE0]` (np. w wierszach `§4A` per-TEC) które teraz technicznie mają już dedykowany prototyp; ich aktualizacja nie jest blokująca dla ACP, bo §17A i §17 są aktualne, ale można je zaktualizować przy okazji następnego globalnego refresh.
3. **Manual QA gallery dla nowych modali** — `tech_modal_gallery` w `modals.jsx` nie wie o `BomSnapshotDiffModal` i `FactorySpecBomBundleApprovalModal`. Można je dopisać do `TECH_MODAL_CATALOG` jako trzy dodatkowe karty (low-effort follow-up). Nie blokujące.
4. **Warehouse first-class extraction** — gdyby zespół zdecydował się jednak na dedykowane mini-surface'y `available_lp_picker` / `wo_reservations_panel` (np. w storybook-style `pickers.jsx`), wymagana jest synchronizacja `prototype-index-warehouse.json` + `master-index.json` + ewentualnie T-051 parity AC. Aktualnie nie jest to potrzebne.

## Verdict

Po tej fali wszystkie pięć Wave0 spec-driven UI surface'ów + bundle approval mają teraz dedykowane layout-primitive prototypy z explicit `data-prototype-label` markerami i czerwonymi liniami modułu wbudowanymi w copy. Parity AC w T-085..T-090 wskazują dedykowane prototypy zamiast adjacent fragmentów. PRD §17/§17A oraz indeksy prototypów są spójne. Walidator 03-technical zielony.

03-Technical pozostaje gotowy do staged ACP implementation w sekwencji z `v3.3.1` (patrz §17B). Ta fala podnosi jakość parity AC dla T-085..T-090, nie zmienia kolejności wave order.
