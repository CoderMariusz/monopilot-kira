# Review 01/02/03 UI/prototype/labeling completeness after Wave0

Data: 2026-05-03
Repo: `/Users/mariuszkrawczyk/Projects/monopilot-kira`
Zakres: 01-NPD, 02-SETTINGS, 03-TECHNICAL; odczyt PRD/UX/prototype indexes/master-index/design folders/task coverage/tasks. Bez edycji źródeł poza tym raportem.

## TL;DR

- 01-NPD: prawie pełne pokrycie UI/tasków i prototypów. Nie widzę potrzeby osobnego Opus prototype-build dla większości 01. Jedyny realny no-exact-prototype/spec-driven UI po Wave0 to `T-095 g3-fg-mapping`; może iść jako spec-driven, ale jeśli PO wymaga 100% prototypów, poprosić Opus o mały prototype-build dla G3 Create/Map FG. Dodatkowo potrzebny Sonnet labeling fix dla 3 niespójnych etykiet master/index.
- 02-SETTINGS: implementacyjnie taski są pokryte, ale prototypowo nie jest to “full prototype”. Jest 31 etykiet w prototype-index i 63 UI taski; co najmniej 13 UI tasków jest jawnie no-prototype/spec-driven, a kolejne 11 z `prototype_match=false` są taskami PRD-only/UX-only bez labeli w prototype-index. Jeśli celem jest full prototype inventory, potrzebny Opus prototype-build dla brakujących Settings screens oraz Sonnet labeling po buildzie. Jeśli akceptujemy UX-spec as authoritative, nie trzeba blokować implementacji.
- 03-TECHNICAL: taski po Wave0 zamykają blockers jako spec-driven, ale PRD nadal dokumentuje 5 `[NO-PROTOTYPE-YET]` blockerów: `TEC-014`, `TEC-025`, `TEC-031`, `TEC-045`, `TEC-052`. Do tego `T-090 FactorySpec+BOM bundle approval UI` jest nową, krytyczną powierzchnią bez dedykowanego prototypu. Dla “full UI/prototype completeness” rekomenduję Opus prototype-build dla tych 6 Technical surfaces, potem Sonnet labeling/index/master fix.
- Labeling: indeksy istnieją, design files istnieją, ale etykiety nie są literalnie osadzone w JSX. Są zewnętrznym mappingiem w `_meta/prototype-labels/*.json`; w JSX znalazłem literalnie tylko `pipeline` w NPD. To jest OK jako external labeling, ale nie jako source-level `data-prototype-label`/komentarze.
- Master-index nie jest w pełni spójny z per-module indexes: 01 ma 3 missing/mismatched labels, 02 ma 1, 03 ma 6. To jest szybkie Sonnet labeling task.

## Źródła sprawdzone

- PRD/UX:
  - `docs/prd/01-NPD-PRD.md`, `prototypes/design/01-NPD-UX.md`
  - `docs/prd/02-SETTINGS-PRD.md`, `prototypes/design/02-SETTINGS-UX.md`
  - `docs/prd/03-TECHNICAL-PRD.md`, `prototypes/design/03-TECHNICAL-UX.md`
- Prototype indexes:
  - `_meta/prototype-labels/prototype-index-npd.json`
  - `_meta/prototype-labels/prototype-index-settings.json`
  - `_meta/prototype-labels/prototype-index-technical.json`
  - `_meta/prototype-labels/master-index.json`
- Design folders:
  - `prototypes/design/Monopilot Design System/npd/*.jsx`
  - `prototypes/design/Monopilot Design System/settings/*.jsx`
  - `prototypes/design/Monopilot Design System/technical/*.jsx`
- Coverage/tasks:
  - `_meta/atomic-tasks/01-npd/coverage.md`, `tasks/T-*.json`
  - `_meta/atomic-tasks/02-settings/coverage.md`, `tasks/T-*.json`
  - `_meta/atomic-tasks/03-technical/coverage.md`, `tasks/T-*.json`

## Cross-module checks

### Evidence policy / validator check

Wiele UI tasks referencuje `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`, ale nie znalazłem takiego pliku w repo (`search_files *POLICY*` zwrócił 0 w `_meta/atomic-tasks`). Nie znalazłem też osobnego validatora prototype-label completeness. To jest dodatkowy Sonnet/docs hygiene item: albo dodać policy file, albo poprawić ścieżkę w taskach.

### Prototype index/file presence

| Module | Prototype-index entries | Referenced design files | Missing files |
|---|---:|---:|---:|
| 01-NPD | 51 | 11 | 0 |
| 02-SETTINGS | 31 | 8 | 0 |
| 03-TECHNICAL | 50 | 5 | 0 |

Wniosek: per-module indexy wskazują na istniejące pliki design. Nie ma broken file paths w tych 3 indexach.

### Master-index consistency

Braki/mismatche względem `_meta/prototype-labels/master-index.json`:

- 01-NPD: 3 labels z per-module index nie znalezione literalnie w master labels:
  - `allergen_override_modal` — master ma `npd_allergen_override_modal`.
  - `nutrition_screen` — prawdopodobny conflict/cross-label z Technical/NPD.
  - `costing_screen` — prawdopodobny conflict/cross-label z Technical/NPD.
- 02-SETTINGS: 1 label:
  - `d365_mapping_screen`.
- 03-TECHNICAL: 6 labels:
  - `nutrition_screen`, `costing_screen`, `d365_mapping_screen`, `products_screen`, `boms_screen`, `partners_screen`.

Wniosek: Sonnet labeling/index hygiene jest potrzebny, niezależnie od prototype-build. Najważniejszy fix: ujednolicić prefiksy i konflikty cross-module, np. `npd_nutrition_screen` vs `technical_nutrition_screen`, `settings_d365_mapping_screen` vs `technical_d365_mapping_screen` albo jednoznaczny module field + labels bez kolizji.

### Labels literal in JSX or external only?

- 01-NPD: tylko `pipeline` występuje literalnie w swoim JSX; 50/51 labels nie występuje literalnie.
- 02-SETTINGS: 0/31 labels literalnie w JSX.
- 03-TECHNICAL: 0/50 labels literalnie w JSX.

Wniosek: obecne labeling jest prawie wyłącznie external mapping only. Jeśli agenci mają polegać na labels, muszą czytać prototype-index/master-index. Jeśli wymagamy self-documenting prototypes, trzeba osobny Sonnet task na dodanie `data-prototype-label`/komentarzy albo przynajmniej generator label anchors; na dziś tego nie ma.

## 01-NPD

### Stan

- Prototype index: 51 entries, 11 files, wszystkie pliki istnieją.
- UI taski wykryte: 27.
- `prototype_match=true`: 24 UI taski.
- Brak flagi `prototype_match`: 3 UI taski (`T-076`, `T-094`, `T-095`).
- Jawnie no-exact/spec-driven po Wave0: 1 UI task:
  - `T-095 g3-fg-mapping` — G3 Create/Map FG candidate action and UI gate.

### Ważne red-lines

`prototypes/design/01-NPD-UX.md` ma autorytatywne red-lines z 2026-05-03:
- FG/Finished Good jest kanoniczne; FA jest compat alias only.
- Brief tworzy NPD project; G3 tworzy/mapuje FG.
- NPD Builder tworzy WIP/intermediate + FG + initial shared BOM/product-spec; D365 jest tylko optional export/import.
- Sensory belongs to Technical; NPD może pokazywać tylko status/read-model.

### Ocena kompletności

- Dla istniejących klasycznych NPD screens/modals prototypy są zbudowane i zlabelowane external indexem.
- Wave0 dodał/utwardził nowe E2E tasks (`T-095..T-100` wg coverage note), ale G3 FG mapping nie ma dedykowanego prototypu w indexie.
- `T-076 sensory-ui-technical-owned-deferred` jest świadomie deferred/guard; nie wymaga NPD prototype-build jako standalone NPD screen.
- `T-094 fg-terminology-compatibility` to pass/red-line, nie osobny UI surface requiring prototype.

### Rekomendacja 01-NPD

1. Nie zlecać dużego Opus prototype-build dla całego 01-NPD.
2. Zlecić mały Opus prototype-build tylko jeśli wymagamy 100% prototype inventory:
   - `NPD-G3-FG-Mapping` / `T-095`: modal/panel for create/map FG candidate at G3, with blockers, rollback/uniqueness states, and red-line copy (FG not FA).
3. Zlecić Sonnet labeling fix:
   - `allergen_override_modal` vs `npd_allergen_override_modal`.
   - disambiguate `nutrition_screen` and `costing_screen` in NPD/master.
   - optional: add source anchors in JSX or generated comments/data labels.

## 02-SETTINGS

### Stan

- Prototype index: 31 entries, 8 files, wszystkie pliki istnieją.
- UI taski wykryte: 63.
- `prototype_match=true`: 40.
- `prototype_match=false`: 21.
- Brak flagi: 2 (`T-118`, `T-127`).
- Jawnie no-prototype/spec-driven by text: 13 tasków:
  - `T-077 set-055` Manufacturing operations reference view — prototype none, UX §8.9 reference.
  - `T-078 set-056` Manufacturing operation form — prototype none, UX §8.9 form.
  - `T-079 set-013` Audit log — prototype none, UX audit log.
  - `T-096 set-053` Reference CSV Import Wizard — spec-driven, no exact prototype.
  - `T-097 set-031` Schema Column Edit Wizard — spec-driven, no exact prototype.
  - `T-098 set-032` Schema Diff Viewer — spec-driven, no exact prototype.
  - `T-099 set-033` Schema Migrations Queue — spec-driven, no exact prototype.
  - `T-100 set-060` Tenant Variations Dashboard — spec-driven, no exact prototype.
  - `T-101 set-061` Dept Taxonomy Editor — spec-driven, no exact prototype.
  - `T-102 set-062` Rule Variant Selector — spec-driven, no exact prototype.
  - `T-119 set-010` Pending Invitations — PO in-scope, no exact label in prototype-index.
  - `T-120 set-011` Roles & Permissions — PO in-scope, no exact label in prototype-index.
  - `T-121 set-029` Global Import/Export — PO in-scope, root import-export is non-canonical pattern only per coverage note.
- Dodatkowo `prototype_match=false` bez “spec-driven” phrase w task text, ale bez prototype-index label: `T-104..T-109`, `T-111..T-115` (infra list/detail/audit/diff/log screens). Coverage mówi, że te są covered/spec-driven by PRD/UX, nie canonical prototype parity.

### Ważne source authority

`prototypes/design/02-SETTINGS-UX.md` line 5 mówi, że canonical Settings prototype source is `settings/*.jsx`, ale when exact screen prototype is missing, UX spec is authoritative and prototype elements may be reused only as primitives/patterns.

Coverage note potwierdza:
- Schema/Tenant UI without exact prototype is spec-driven from UX.
- `T-096..T-102` must not cite adjacent/wrong prototypes as 1:1 sources.
- `T-119/T-120/T-121` are PO additions.
- Root `settings/import-export.jsx` is not canonical for T-121, only non-canonical pattern reference.

### Ocena kompletności

- Implementacyjnie ACP task coverage jest kompletne: coverage says no unresolved gaps.
- Prototypowo NIE jest kompletne: 31 prototype labels nie pokrywa 63 UI tasków. Istotna część Settings UI jest UX/spec-driven, bez exact prototype.
- Część tasków ma niespójny metadata signal: np. `T-077/T-078/T-079` mają `prototype_match=true`, ale opis mówi `prototype: none`. To powinien naprawić Sonnet labeling/task hygiene.

### Rekomendacja 02-SETTINGS

Decyzja zależy od kryterium:

- Jeśli celem jest “implementation readiness” — nie blokować implementacji; UX spec + AC są wystarczające, ale wymaga rygorystycznych screenshots/traces w closeout.
- Jeśli celem jest “full UI/prototype completeness” — zlecić Opus prototype-build dla brakujących Settings surfaces, najlepiej w 3 paczkach:
  1. Schema/Tenant/Admin workflows: `SET-031`, `SET-032`, `SET-033`, `SET-060`, `SET-061`, `SET-062`.
  2. Import/Audit/Logs: `SET-053`, `SET-013`, `SET-042`, `SET-054`, `SET-057`, `SET-064`, `SET-093`.
  3. PO scope additions + infra: `SET-010 Pending Invitations`, `SET-011 Roles & Permissions`, `SET-029 Global Import/Export`, plus `SET-012-warehouse`, `SET-014`, `SET-016`, `SET-018`, `SET-082`, `SET-083` if visual parity is required.
- Zlecić Sonnet labeling after build:
  - add missing labels to `prototype-index-settings.json` and `master-index.json`.
  - fix `d365_mapping_screen` master mismatch.
  - fix misleading `prototype_match=true` on prototype-none tasks or add exact prototype labels after Opus build.

## 03-TECHNICAL

### Stan

- Prototype index: 50 entries, 5 files, wszystkie pliki istnieją.
- UI taski wykryte: 40.
- Metadata nie ma `prototype_match=true/false` w większości tasków, ale AC/details często cytują prototype files/lines.
- Jawnie spec-driven/no-prototype tasks po Wave0: 6:
  - `T-085 tec-014` Bulk Import CSV spec-driven screen.
  - `T-086 tec-025` BOM Snapshots Viewer spec-driven screen.
  - `T-087 tec-031` Regulatory Compliance Dashboard spec-driven screen.
  - `T-088 tec-045` Lab Results Log spec-driven screen.
  - `T-089 tec-052` Cost Import from D365 spec-driven screen.
  - `T-058 d365-dlq` DLQ row table/retry/mark-resolved mentions no-prototype-yet in prompt/PRD context.
- `T-090 factory-spec-bom-bundle-ui` is new critical approval panel/modal. It reuses `bom-detail.jsx`/modal primitives, but there is no dedicated prototype-index label for factory_spec+BOM approval bundle.

### PRD evidence

`docs/prd/03-TECHNICAL-PRD.md` still records:
- `TEC-014 Bulk Import CSV`: `[NO-PROTOTYPE-YET]`, TODO Prototype creation needed before T3-ui task can be drafted.
- `TEC-025 BOM Snapshots Viewer`: `[NO-PROTOTYPE-YET]`.
- `TEC-031 Regulatory Compliance Dashboard`: `[NO-PROTOTYPE-YET]`.
- `TEC-045 Lab Results Log`: `[NO-PROTOTYPE-YET]`.
- `TEC-052 Cost Import from D365`: `[NO-PROTOTYPE-YET]`.
- Summary says 5 no-prototype blockers.

Wave0 coverage then says these MVP screens received spec-driven UI tasks with screenshot + trace evidence (`T-085..T-089`). So blocker was task-readiness patched, not prototype-inventory patched.

### Ocena kompletności

- Implementacyjnie: Wave0 made Technical actionable via spec-driven UI tasks.
- Prototypowo: not full. There are known no-prototype screens plus a high-risk new approval bundle UI with only adjacent prototype anchors.
- Labeling: master/index collisions/missing labels are material in Technical because `nutrition_screen`, `costing_screen`, `d365_mapping_screen` collide with NPD/Settings, and `products_screen`, `boms_screen`, `partners_screen` are cross-tagged/mistagged from Settings data screens.

### Rekomendacja 03-TECHNICAL

1. Zlecić Opus prototype-build dla Technical no-prototype/critical surfaces:
   - `TEC-014 Bulk Import CSV` — 3-step wizard upload/validate/diff/confirm.
   - `TEC-025 BOM Snapshots Viewer` — immutable snapshots list + JSON diff modal.
   - `TEC-031 Regulatory Compliance Dashboard` — regulation KPI tiles + per-FG issues table.
   - `TEC-045 Lab Results Log` — cross-item lab log read model; Quality-owned data, Technical read-only/triage.
   - `TEC-052 Cost Import from D365` — optional D365 cost diff preview + audit-confirm.
   - `FactorySpec+BOM bundle approval panel/modal` — blockers, RM usability/supplier_spec status, clone-on-write warning, approval history, D365-disabled messaging.
2. Po Opus build, zlecić Sonnet labeling/index pass:
   - add labels for above surfaces to `prototype-index-technical.json` and `master-index.json`.
   - disambiguate cross-module labels (`nutrition_screen`, `costing_screen`, `d365_mapping_screen`).
   - remove or clearly mark `partners_screen` as not Technical if still present only as Settings/shared pattern.
3. Dodatkowo Sonnet task hygiene: set `prototype_match=false` or explicit `spec_driven=true` on Technical tasks that lack exact prototype; today metadata is inconsistent/missing.

## Exact recommendations to parent/PO

### Czy 01/02/03 mają full UI?

- Full ACP UI task coverage: mostly yes after Wave0; coverage files claim no unresolved local PRD gaps for 01/02 and explicit final-decision/tasked coverage for 03.
- Full prototype coverage: no.
  - 01: nearly yes, except G3 FG mapping and label mismatches.
  - 02: no, many UI screens are UX/spec-driven rather than exact prototypes.
  - 03: no, known no-prototype screens remain; Wave0 made them taskable, not prototyped.
- Full label coverage: partial. Per-module indexes exist, but master has mismatches and JSX has no literal anchors.

### Opus prototype-build tasks needed?

- 01-NPD: optional/small, only `G3 FG Create/Map` if 100% prototype inventory required.
- 02-SETTINGS: yes if PO wants full prototype coverage; otherwise not needed to unblock implementation. Recommended batch as above.
- 03-TECHNICAL: yes, recommended. Technical has the clearest no-prototype list and high-risk factory approval UI.

### Sonnet labeling tasks needed?

Yes. Minimum Sonnet task:

1. Reconcile `prototype-index-{npd,settings,technical}.json` with `master-index.json`.
2. Resolve duplicate/cross-module labels by module-prefixing or master metadata:
   - NPD: `allergen_override_modal`, `nutrition_screen`, `costing_screen`.
   - Settings: `d365_mapping_screen`.
   - Technical: `nutrition_screen`, `costing_screen`, `d365_mapping_screen`, `products_screen`, `boms_screen`, `partners_screen`.
3. Add labels for any new Opus-built screens.
4. Decide whether external mapping is sufficient. If not, add source-level anchors (`data-prototype-label` or comments) in design JSX.
5. Fix task metadata inconsistencies:
   - Settings `T-077/T-078/T-079` currently say `prototype_match=true` while description says `prototype: none`.
   - Technical UI tasks mostly omit `prototype_match`; add explicit `prototype_match`/`spec_driven` to avoid false parity claims.

## Questions for PO/parent agent

1. Czy “full UI” oznacza full implementation-task coverage, czy full prototype inventory? Obecnie pierwsze jest blisko/OK, drugie nie.
2. Czy UX-spec-driven screens są akceptowalne do implementacji bez Opus prototype-build, jeśli closeout ma screenshot/trace/axe evidence?
3. Czy chcemy source-level labels in JSX, czy external `_meta/prototype-labels/*.json` mapping wystarcza?
4. Dla 02-SETTINGS: czy budujemy prototypy dla wszystkich spec-driven screens, czy tylko dla high-risk flows (`SET-031/032/033/053/060/061/062/011/029`)?
5. Dla 03-TECHNICAL: czy Opus ma aktualizować też `docs/prd/03-TECHNICAL-PRD.md` rows, które nadal mówią “TODO Prototype creation needed before T3-ui task can be drafted”, skoro Wave0 już stworzył T3-ui spec-driven tasks?

## Final decision recommendation

- Nie uruchamiałbym masowego prototype-build dla 01.
- Uruchomiłbym Sonnet labeling hygiene natychmiast dla 01/02/03.
- Uruchomiłbym Opus prototype-build dla 03 Technical no-prototype + factory approval bundle.
- Dla 02 Settings: uruchomić Opus prototype-build tylko jeśli PO wymaga pełnego prototype inventory; inaczej zostawić jako UX-spec-driven i tylko naprawić labels/metadata.
