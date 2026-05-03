# 03-TECHNICAL — Polish closeout (Opus, 2026-05-03)

Repo: `/Users/mariuszkrawczyk/Projects/monopilot-kira`
Branch: `main` (working tree intentionally dirty po wcześniejszych falach readiness)
Status: nie commitowane — zgodnie z instrukcją.

## Zakres polishu

Polish dotyczył wyłącznie 03 Technical, w kontekście pełnego przepływu start-produkcji 00-08:
Brief → NPD DEV-xxx → Stage-Gate G0–G4 → G3 tworzy/mapuje FG → NPD Builder zakłada WIP/intermediates + FG + initial shared BOM + initial `factory_spec/internal_product_spec` `in_review` → **Technical zatwierdza factory_spec/BOM bundle** → Planning robi WO snapshot → Warehouse/Scanner → Production START/consume/output → Quality hooks → D365 jako opcjonalny side-effect.

Nie modyfikowałem kodu aplikacji ani innych modułów (poza brakiem ingerencji w 04–08; 03 → 04 jest spójne dzięki `T-081` adapterowi do canonical NPD T-097).

## Co zostało poprawione

### 1. Tasks T-085..T-090 — parity AC anchors

Wszystkie sześć spec-driven UI tasków miało skopiowaną boilerplate'ową linię AC odsyłającą do `prototypes/design/Monopilot Design System/technical/other-screens.jsx:1-200` jako "spec-driven prototype substitute". Linia 1–200 tego pliku to nagłówki/setup, więc ten zakres był pusty semantycznie i powtórzony w sześciu różnych zadaniach.

Teraz każdy task wskazuje **właściwy adjacent layout-primitive anchor** z `_meta/prototype-labels/prototype-index-technical.json` (zakresy zweryfikowane w aktualnym JSX):

| Task | TEC | Anchors po edycji |
|---|---|---|
| T-085 | TEC-014 Bulk Import CSV | `other-screens.jsx:432-480` (`materials_list_screen`) + `modals.jsx:22-136` (`product_create_modal`) |
| T-086 | TEC-025 BOM Snapshots Viewer | `bom-detail.jsx:373-468` (`bom_versions_tab`) |
| T-087 | TEC-031 Regulatory Compliance Dashboard | `other-screens.jsx:370-429` (`tech_dashboard_screen`) + `other-screens.jsx:715-758` (`shelf_life_screen`) |
| T-088 | TEC-045 Lab Results Log | `other-screens.jsx:74-108` (`specs_screen`) |
| T-089 | TEC-052 Cost Import from D365 | `modals.jsx:542-559` (`d365_item_sync_confirm_modal`) + `other-screens.jsx:904-935` (`d365_status_screen`) |
| T-090 | FactorySpec+BOM bundle approval | `bom-detail.jsx:3-60` (`bom_detail_page`) + `modals.jsx:460-483` (`spec_review_modal`) |

Każda parity AC zachowuje wymagane przez walidator słowa `structural`, `visual`, `interaction`, `parity` oraz literalną ścieżkę `path:lines`. Doprecyzowano też framing: PRD/UX jest źródłem prawdy, a prototyp dostarcza wyłącznie wzorce layoutowe — wcześniejsze sformułowanie "spec-driven prototype substitute" sugerowało nieistniejące 1:1.

Czerwone linie modułu (FG/WIP, factory_spec/internal_product_spec, shared BOM SSOT, Quality-owned lab read model, D365 optional only) pozostają w AC, plus dodatkowe domenowe przypomnienia per-task (snapshoty immutable; lab Quality-owned; D365 disabled state; clone-on-write banner).

### 2. PRD §17 — normalizacja "BLOCKER" → "SPEC-DRIVEN"

W tabeli §17 UI Surfaces Master Table 5 wpisów spec-driven (TEC-014/025/031/045/052) miało Status `BLOCKER`, sprzeczne z wcześniejszą falą gdzie §4A już mówiło "not a T3-ui drafting blocker".

Zmiany:
- Wszystkie wystąpienia `| [SPEC-DRIVEN-WAVE0] | BLOCKER |` zamienione na `| [SPEC-DRIVEN-WAVE0] | SPEC-DRIVEN (Wave0 task; not a T3-ui drafting blocker) |`.
- Legenda zaktualizowana: spec-driven wpisy nie są już opisane jako blokujące; wskazują na anchor map §17A.

### 3. PRD §17A — Spec-driven UI anchor map

Dodano nową podsekcję §17A z explicytną tabelą mapującą T-085..T-090 → TEC ID → adjacent layout-primitive anchor(s) → notatki (route, semantyczne reguły, red-lines).

Dodatkowo: **Editing rule** — jeśli pojawi się dedykowany prototyp, wymagane jest jednoczesne zaktualizowanie §17A, parity AC w odpowiednim tasku oraz `_meta/prototype-labels/prototype-index-technical.json`.

### 4. PRD §17B — Recommended Technical staged ACP wave order

Dodano sześciowarstwowy advisory plan kolejności release'ów dla 03 Technical, spójny z program-wide order z `_meta/reviews/2026-05-03-00-08-production-start-readiness-final-report.md`:

1. Schema/contract spine: T-079, T-073, T-074, T-081
2. Approval/release bundle: T-080, T-090
3. Cross-module event/contract: T-082, T-076, T-077
4. Supplier specs Phase 1: T-072, T-075
5. Spec-driven UI Wave0: T-085..T-089
6. Governance/red-lines: T-083, T-084

Z explicytną notatką: "Do not queue all 90 Technical tasks at once" oraz przypomnienie że T-081/T-080/T-090 zależą od działającego canonical NPD T-097.

### 5. Changelog v3.3.1

Dopisano wpis v3.3.1 streszczający tę falę polishu.

## Pliki zmienione

- `docs/prd/03-TECHNICAL-PRD.md` — §17 master-table BLOCKER→SPEC-DRIVEN, §17 legenda, nowe §17A i §17B, changelog v3.3.1.
- `_meta/atomic-tasks/03-technical/tasks/T-085.json` — parity AC anchor.
- `_meta/atomic-tasks/03-technical/tasks/T-086.json` — parity AC anchor.
- `_meta/atomic-tasks/03-technical/tasks/T-087.json` — parity AC anchor.
- `_meta/atomic-tasks/03-technical/tasks/T-088.json` — parity AC anchor.
- `_meta/atomic-tasks/03-technical/tasks/T-089.json` — parity AC anchor.
- `_meta/atomic-tasks/03-technical/tasks/T-090.json` — parity AC anchor.
- `_meta/reviews/2026-05-03-opus-technical-polish-closeout.md` — ten raport.

Łącznie: 1 PRD + 6 tasków + 1 raport = 8 plików.

## Walidacje uruchomione

```bash
python3 _meta/atomic-tasks/03-technical/_validate.py
```

Wynik:

```
Validated 90 task files.
PASS: all checks green.
```

Walidator sprawdza m.in. że T3-ui taski mają w AC zarówno literalną ścieżkę prototype `path:lines`, jak i równoczesne słowa `structural` + `visual` + `interaction` + `parity`. Po edycji wszystkie sześć tasków T-085..T-090 dalej spełnia tę regułę.

```bash
git diff --check
```

Wynik: bez błędów whitespace/conflict (cichy success).

## Pozostałe opcjonalne follow-upy (nie blokujące staged ACP implementation)

1. **Dedicated prototype build** dla TEC-014 / TEC-025 / TEC-031 / TEC-045 / TEC-052 — nadal opcjonalne. Jeśli zostanie zbudowany, należy zsynchronizować §17A + parity AC w odpowiednim tasku + `prototype-index-technical.json`.
2. **PRD §4A line numbers** — niektóre line refs w §4A (np. shelf_life_screen `other-screens.jsx:1390`) wciąż wyglądają jak stare numery JSON-line a nie aktualne JSX-line; nie blokujące, ale warto kiedyś zsynchronizować z prototype-index w jednej akcji global-refresh.
3. **Source-level `data-prototype-label` anchors** w JSX — nadal nieuniwersalne; quality accelerator dla Sonnet UI implementation, ale external prototype index pozostaje canonical.
4. **T-072/T-075 split** — T-072 jest tylko docs brief; faktyczne taski API/UI dla supplier_specs schema są w T-075. Jeśli zespół rozdziela API i UI dla supplier_specs Phase 1, można rozważyć dodatkowe T3-ui task analogiczny do T-090 (UI panel/list/detail/review-modal). Obecnie nie jest to blokujące, T-075 trzyma kontrakt.
5. **TEC-073 DLQ Manager** wciąż PARTIAL (drift modal vs DLQ retry). Wave0 traktuje to jako optional Phase enhancement; dedykowany prototype/ux task nie istnieje, ale staged ACP może pójść z spec-driven podejściem analogicznym do T-085..T-089 jeśli PO uzna to za priorytet.

## Verdict

Po tym polishu **03 Technical jest gotowy do staged ACP implementation** w sekwencji:
1. NPD T-097 (canonical release) → 2. Technical schema/contract (T-079/T-073/T-074/T-081) → 3. Bundle approval (T-080/T-090) → 4. Cross-module events (T-082/T-076/T-077) → 5. Supplier specs Phase 1 (T-072/T-075) → 6. Wave0 spec-driven UI (T-085..T-089) → 7. Governance (T-083/T-084).

Manifest, coverage, walidator, anchor map i wave-order są spójne. Nie ma już placeholder-owej linii `other-screens.jsx:1-200` w żadnym z nowych UI tasków, a "BLOCKER" nie jest mylnie używane dla spec-driven Wave0.
