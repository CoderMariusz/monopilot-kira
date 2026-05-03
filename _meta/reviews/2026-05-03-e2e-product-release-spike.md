# 2026-05-03 — E2E product release documentation spike

## Verdict

**Werdykt: NIE, nie da się jeszcze bezpiecznie zlecić agentom pełnego E2E produktu od briefu do release na fabrykę wyłącznie na podstawie obecnych PRD/UX/tasków.**

Dokumentacja opisuje docelowy przepływ i większość komponentów istnieje jako PRD + taski atomowe, ale proces blokuje się na integracji między modułami i na kilku brakujących, agentowo-wykonalnych kontraktach:

1. **Brak jednego kanonicznego workflow release-to-factory** łączącego: `npd_projects` G0-G4, 7 department closures, NPD Builder, shared BOM, `factory_specs`, Technical approval i widoczność dla factory/Planning/Technical.
2. **G3/G4 są niedomknięte operacyjnie**: PRD mówi, że G3 tworzy/mapuje FG, a G4/NPD Builder release tworzy WIP/FG/BOM/spec, ale taski Stage-Gate T-054..T-062 kończą się na project/gate CRUD, approval i E2E G0..G3; nie wymuszają mapowania FG na G3 ani release factory na G4.
3. **NPD Builder vs D365 Builder nadal miesza się w UX/prototypach**. PRD/decision red-lines mówią, że NPD Builder tworzy dane Monopilot-owned, a D365 jest opcjonalny eksport. Jednak UX FLOW-01 kończy się “Build D365 Output” i “Built=TRUE”, nie “release_to_factory/approved_for_factory”.
4. **`factory_spec/internal_product_spec` ma backendowy task (03-TECH T-079), ale brakuje UI/tasków workflow do review/approve pierwszej wersji po NPD Builder** oraz brakuje powiązania z NPD release transaction.
5. **RM/component usability validation jest zadaniem API (03-TECH T-074), ale nie ma pełnego E2E gate w NPD Builder/release, BOM line UI i Technical approval UI.**
6. **Non-conformance triggers z PO/TO są kontraktami/dokumentacją (03-TECH T-076/T-077), ale bez jasnego event schema/API, owner handoff do Quality i blokad release.**
7. **Prototypy są nadal silnie legacy (`FA`, `PR`, `Build D365`, Technical create FA)**; red-lines pomagają, ale agent UI może łatwo zaimplementować zły D365-first / FA-first proces bez dodatkowych patchy z acceptance criteria.

W praktyce można zbudować duże fragmenty: Brief, dept closure, Stage-Gate, shared BOM schema/API, Settings authorization, Technical BOM/factory_spec/RM usability. Nie można jeszcze zbudować jednej pewnej ścieżki “DEV-123 -> approved for factory use” bez doprecyzowania integracyjnych tasków.

## Źródła przeczytane

Wymagane źródła:
- `_meta/decisions/2026-05-03-flow-d365-settings-technical-decisions.md`
- `docs/prd/01-NPD-PRD.md`
- `docs/prd/02-SETTINGS-PRD.md`
- `docs/prd/03-TECHNICAL-PRD.md`
- `_meta/atomic-tasks/01-npd/coverage.md`, `manifest.json`, lista/taski kluczowe
- `_meta/atomic-tasks/02-settings/coverage.md`, `manifest.json`, lista/taski kluczowe
- `_meta/atomic-tasks/03-technical/coverage.md`, `manifest.json`, lista/taski kluczowe
- `prototypes/design/01-NPD-UX.md`
- `prototypes/design/02-SETTINGS-UX.md`
- `prototypes/design/03-TECHNICAL-UX.md`

Nie edytowałem PRD/tasków/prototypów.

## Pass/fail per step

| # | Step E2E | Status | Uzasadnienie |
|---|---|---|---|
| 1 | Brief -> NPD project `DEV-123` | **PARTIAL / FAIL dla E2E** | PRD decyzja i 01-NPD §3/§17 mówią, że Brief tworzy NPD project. Taski pokrywają Brief (`T-030..T-035`) i Stage-Gate project CRUD (`T-054..T-057`), ale `convertBriefToFa`/Brief UX nadal tworzy FA/FG bez jednoznacznego `npd_project_id` jako pierwszy artifact. Brakuje taska integrującego Brief create/complete z `createProject`. |
| 2 | Project DEV-123 -> Stage-Gate G0-G4 | **PARTIAL** | NPD PRD §17 ma schema i flows, taski `T-054..T-062` pokrywają projects/gates/approval/views. Blokada: E2E T-062 opisuje create -> G0..G2 -> approve G3, nie pełne G3 FG mapping, G4 approval, Launched/release. |
| 3 | G3 creates/maps FG | **FAIL / BLOCKER** | PRD decyzja jasno wymaga G3 create/map FG. W `npd_projects` jest `product_code`, ale brakuje taska/API: `createOrMapFgCandidateAtG3(projectId, productCode?)`, uniqueness, rollback, UI modal, acceptance tests. |
| 4 | Department close | **PASS dla dept closure, PARTIAL dla integracji z gates** | NPD tasks `T-015`, `T-017`, `T-018`, UI `T-020..T-026` pokrywają Closed/Done i dept tabs. Brak jasnej reguły, który gate wymaga których Closed_<Dept>, i jak department closure wpływa na G3/G4 blockers. |
| 5 | NPD Builder creates WIP/intermediates + FG + initial shared BOM version | **PARTIAL / BLOCKER** | Nowe taski `01-NPD T-092/T-093` są bardzo dobre dla shared BOM. Ale nie ma wyraźnego “NPD Builder release transaction” taska obejmującego WIP/FG item creation + factory_spec draft + BOM + status release + outbox. `T-044` to nadal buildD365/export. |
| 6 | RM/component usability validation | **PARTIAL** | `03-TECH T-074` definiuje shared decision service z reason codes. Brakuje wymuszenia tego w NPD Builder release, BOM line add/edit UI i factory_spec approval flow jako twardego gate z widocznymi remediation links. |
| 7 | factory_spec/internal_product_spec saved | **PARTIAL / BLOCKER** | `03-TECH T-079` definiuje `factory_specs`, clone-on-write, approval states. Brakuje taska, w którym NPD Builder inicjuje `factory_specs` draft w tym samym release transaction oraz UI/flow do uzupełnienia i review przed factory use. |
| 8 | Technical approval | **PARTIAL / BLOCKER** | Settings `T-122` zapewnia policies/permissions, Technical `T-079` zapewnia API foundation. Brakuje end-to-end Technical approval screen/action dla initial NPD-created spec+BOM bundle oraz integracji min approvers/segregation z realnym release. |
| 9 | Release to factory/Planning/Technical | **FAIL / PRIMARY BLOCKER** | Decyzja mówi, że FG/WIP dostępne po dept close + project approval + NPD Builder generated/validated records. Brak kanonicznego statusu/API/eventu `released_to_factory` lub `factory_available_at`, brak konsumentów Planning/Technical/factory read model, brak E2E testu. |
| 10 | Optional D365 export if enabled | **PASS/PARTIAL** | D365 optional posture jest dobrze opisana w decision, Settings `T-020/T-030/T-086`, NPD `T-044/T-046/T-047`, Technical `T-028/T-055..T-059`. Ryzyko: UX nadal przedstawia D365 Builder jako final handoff; trzeba oddzielić od Monopilot release. |

## Exact blockers

### BL-E2E-01 — Brief nie tworzy jednoznacznie `npd_project`

**Gdzie widać:**
- Decision: “Brief creates an NPD project, e.g. DEV-123”.
- 01-NPD PRD §3.2: Stage 0 — Brief output: NPD project `DEV-123`.
- 01-NPD tasks: Brief `T-030..T-035`; Stage-Gate `T-054..T-062`.
- UX `FLOW-01` i `MODAL-03` nadal mówią Convert Brief to FA/PLD i nawigują do FA Core.

**Problem:** agent może zaimplementować Brief -> FA bez `npd_projects`, a Stage-Gate jako osobny, równoległy moduł.

**Blokuje:** kroki 1-3.

### BL-E2E-02 — G3 FG create/map nie ma taska API/UI

**Gdzie widać:**
- PRD §17: project maps 1:1 to FA once reaches G3.
- `npd_projects.product_code` istnieje w schema.
- `T-057/T-058/T-061/T-062` nie zawierają wymagań “at G3 create/map FG candidate”.

**Problem:** brak owner/action/status dla mapowania FG: kto może, kiedy, z jakimi walidacjami, czy można odmapować, jak obsłużyć istniejący FG, jak linkuje się Brief/FA/Product.

**Blokuje:** krok 3 i późniejszy NPD Builder release.

### BL-E2E-03 — Stage-Gate i 7-dept closure nie mają wspólnej gate matrix

**Gdzie widać:**
- PRD §3.2 stage summary miesza G0/G1/G2, Trial/Pilot/Packaging, G3 closure validation, G4 NPD Builder release.
- PRD §17 ma checklisty per gate, ale nie definiuje minimalnych checklist templates mapujących 7 dept Done + RM usability + Technical draft spec + risk/docs.
- `T-056` seeduje checklist templates, ale nie widać w coverage/task title explicit mapping do dept closure / NPD Builder release.

**Problem:** agent nie wie, czy np. Technical `Closed_Technical` jest wymagane do G3 czy G4, kiedy Trial/Pilot/Packaging dowody są wymagane, i czy G4 może przejść bez factory_spec approval.

**Blokuje:** kroki 2, 4, 8, 9.

### BL-E2E-04 — NPD Builder release action nie istnieje jako jeden kanoniczny contract

**Gdzie widać:**
- Decision: NPD Builder creates WIP/intermediates + FG + validated BOM/product records.
- 01-NPD `T-092/T-093`: shared BOM schema/write.
- 01-NPD `T-044/T-046/T-047`: buildD365/export/wizard.
- Technical `T-079`: factory_specs API foundation.

**Problem:** nie ma atomic taska “releaseNpdProjectToFactory” obejmującego transakcję:
1. validate G4/dept/project approval,
2. create/map FG item,
3. create WIP/intermediate items,
4. create initial shared BOM version,
5. create initial factory_spec draft/in_review,
6. run RM usability,
7. emit `npd.project.released` / `fg.factory_available` only after Technical approval if required.

**Blokuje:** kroki 5, 7, 8, 9.

### BL-E2E-05 — `factory_spec` approval jest backend-only i niepowiązany z NPD initial release

**Gdzie widać:**
- 03-TECH `T-079` jest “No application UI”.
- 03-TECH `T-060` ma Specification Review modal/list, ale nie jest połączony z `factory_specs` approval for NPD-created initial version.
- Settings `T-122` out-of-scope: no NPD/Technical app workflow.

**Problem:** nie ma UI/API taska “Technical reviews initial factory_spec from NPD Builder and approves for factory use”. Brak listy pending approvals, approve/reject reasons, min approver count, segregation-of-duties checks, factory-use unblock.

**Blokuje:** kroki 7-9.

### BL-E2E-06 — Release-to-factory status/state/event nie jest jednoznaczny

**Gdzie widać:**
- 01-NPD `Status_Overall`: Pending/InProgress/Alert/Complete/Built. `Built` historycznie D365 builder.
- Decision: availability to factory after Builder generated/validated records.
- Technical `factory_specs.status`: draft/in_review/approved_for_factory.

**Problem:** brakuje kanonicznego statusu E2E, np. `npd_projects.current_gate='Launched'`, `product.factory_release_status='pending_technical_approval|approved_for_factory|released'`, `factory_available_at`, `released_by`, `release_event_id`. Bez tego Planning/Technical/factory nie wiedzą, co konsumować.

**Blokuje:** krok 9.

### BL-E2E-07 — RM usability ma API, ale brak enforce points w E2E release

**Gdzie widać:**
- `03-TECH T-074` definiuje service.
- `03-TECH T-073` mówi, że approval wymaga passing RM usability report.
- Brak NPD taska wywołującego T-074 w NPD Builder release.

**Problem:** agent może zaimplementować RM usability tylko jako utility dla Technical, nie jako twardy blocker NPD release / initial BOM approval.

**Blokuje:** kroki 6, 8, 9.

### BL-E2E-08 — Non-conformance triggers z PO/TO są zbyt płytkie dla agentów

**Gdzie widać:**
- Decision: PO/TO deviations trigger review/non-conformance, no silent mutation.
- `03-TECH T-076/T-077`: “trigger contract”.

**Problem:** brak explicit schema/event/API: `non_conformance_events`, `spec_review_requests`, `supplier_spec_review_requests`, owner Quality vs Technical, severity, status lifecycle, relation to release blockers.

**Blokuje:** nie blokuje happy-path brief->release, ale blokuje wymagany “non-conformance trigger” obszar i późniejsze correctness workflows.

### BL-E2E-09 — Prototype mismatch: FA/PR/D365-first copy może poprowadzić agentów w złą stronę

**Gdzie widać:**
- NPD UX red-lines mówią, żeby tłumaczyć FA->FG i Build D365->optional export.
- NPD UX route map i flows nadal używają `/npd/fa`, “FA Projects”, “Convert to PLD”, “Build D365 Output”.
- Technical UX red-lines mówią FG/WIP, ale overview/tabele nadal opisują `fa`, `PR-code`, “Create New FA Product -> PR-code Intermediates -> BOM Generator”.

**Problem:** red-lines są dobre dla człowieka, ale atomic UI task bez explicit acceptance może zaimplementować legacy label/behavior.

**Blokuje:** jakość UI i poprawny mental model release.

### BL-E2E-10 — Sprzeczność w NPD PRD o Trial/Pilot/Handoff/Packaging

**Gdzie widać:**
- Decision i PRD amendment: Trial/Pilot/Handoff/Packaging wracają i muszą być w NPD flow.
- 01-NPD PRD §17.11.6 nadal mówi “LEGACY notes ... deprecated in favour...”. Coverage note później mówi, że nie są deprecated.

**Problem:** agent czytający sekcję §17.11.6 może usunąć lub pominąć te stage evidence. Potrzebny patch taska/PRD, bo to nie jest tylko nazewnictwo.

**Blokuje:** pełne Stage-Gate G0-G4 z legacy stage evidence.

## Proposed task patches / additions

### ADD-01-NPD-E2E-Release-Orchestrator

**Moduł:** 01-NPD
**Typ:** T2-api + T4-wiring-test
**Tytuł:** `releaseNpdProjectToFactory` — canonical NPD Builder release transaction

**Zakres:**
- Dodać domenową akcję `releaseNpdProjectToFactory(projectId)` / `executeNpdBuilderRelease(projectId)`.
- Preconditions:
  - project exists and current gate allows G4 release,
  - Brief linked,
  - FG candidate mapped at G3,
  - required department `Done_<Dept>` true,
  - gate approvals complete per Settings policy,
  - risk/docs blockers clear where configured,
  - RM usability PASS for every BOM component.
- Transaction outputs:
  - WIP/intermediate item rows,
  - FG item row or confirmed mapping,
  - initial shared BOM header/lines via T-092/T-093,
  - initial factory_spec draft/in_review via Technical T-079 API,
  - release audit/outbox events.
- Must not perform D365 export. D365 export is a separate optional post-release action.

**Acceptance criteria:**
- Given DEV-123 with all departments closed and G4 approval, release creates WIP + FG + shared BOM + factory_spec draft/in_review in one idempotent transaction.
- Given any RM usability FAIL, release aborts and returns typed blockers.
- Given D365 disabled, release still succeeds.
- Given release retried, no duplicate WIP/FG/BOM/spec versions are created.

### ADD-01-NPD-G3-FG-Mapping

**Moduł:** 01-NPD
**Typ:** T2-api + T3-ui + T4-test
**Tytuł:** G3 Create/Map FG candidate

**Zakres:**
- `createOrMapFgCandidateAtG3(projectId, mode=create|map, productCode?)`.
- UI modal in GateApproval/G3 screen.
- Enforce one project -> one FG candidate, with audit and rollback/re-map policy.
- Link `npd_projects.product_code`, `brief.product_code`, Product/FG record and compatibility FA alias.

**Acceptance criteria:**
- G3 cannot be approved unless FG candidate is created or mapped.
- Existing FG can be mapped only if not already linked to another active project.
- Mapping emits `npd.fg_candidate_mapped` and updates project detail.

### PATCH-01-NPD-T-062

**Obecny task:** E2E project create -> advance G0..G2 -> approve G3.

**Patch:** rozszerzyć do:
- Brief creates project,
- G0 -> G1 -> G2,
- G3 requires create/map FG candidate,
- G4 requires department Done + release preflight,
- release action is called or dry-run validates blockers.

### PATCH-01-NPD-T-056 GateChecklistTemplates seed

**Patch:** default G0-G4 templates muszą jawnie mapować:
- G0 Idea: brief complete, owner assigned,
- G1 Feasibility: basic formulation/volume/target launch,
- G2 Business Case: costing/nutrition/risk initial checks,
- G3 Development: FG candidate created/mapped, Trial/Pilot/Packaging evidence placeholders,
- G4 Testing/Handoff: all required departments closed, RM usability PASS, initial BOM ready, initial factory_spec submitted for Technical approval, approval chain complete.

### ADD-03-TECH-FactorySpec-Approval-UI

**Moduł:** 03-TECHNICAL
**Typ:** T2-api + T3-ui + T4-test
**Tytuł:** Technical approval workflow for NPD-created factory_spec/BOM bundle

**Zakres:**
- Pending approval list for `factory_specs.status='in_review'` and associated BOM versions.
- Review modal using `technical.product_spec.approve` and Settings `canApplyTechnicalApprovalGate()`.
- Approve/reject with reasons, min approvers, segregation-of-duties.
- Factory-use check: only `approved_for_factory` spec + approved/active BOM can be consumed by factory/Planning.

**Acceptance criteria:**
- NPD-created `factory_spec` cannot be approved by NPD role alone.
- Approved version immutable; edit creates draft next version.
- Reject sends typed reason back to NPD project release status.

### PATCH-03-TECH-T-060

**Obecny task:** Specification Review modal + Specifications List.

**Patch:** bind to `factory_specs` from T-079, not generic specs. Add statuses, source `npd_builder`, linked BOM header, RM usability report, approve/reject action, Settings policy enforcement.

### ADD-Shared-Release-Status-Model

**Moduły:** 01-NPD + 03-TECHNICAL + downstream read model
**Typ:** T1-schema + T2-api
**Tytuł:** Shared factory release status and events

**Zakres:**
- Add canonical status/read model:
  - `pending_npd_release`
  - `pending_technical_approval`
  - `approved_for_factory`
  - `released_to_factory`
  - `blocked`
- Fields: `factory_available_at`, `factory_approved_by`, `release_event_id`, `active_bom_header_id`, `active_factory_spec_id`.
- Events: `npd.project.release_requested`, `npd.builder.released_records_created`, `technical.factory_spec.approved`, `fg.released_to_factory`, `fg.release_blocked`.

**Acceptance criteria:**
- Planning/Technical/factory consumers read only products with `released_to_factory` or equivalent approved factory-use state.
- D365 export never sets release state.

### ADD-03-TECH-RM-Usability-UI-Gate

**Moduł:** 03-TECHNICAL / 01-NPD integration
**Typ:** T3-ui + T4-test
**Tytuł:** RM usability report panel + release gate integration

**Zakres:**
- Render T-074 result rows in BOM detail and NPD release preflight.
- Block approve/release on blocking reason codes.
- Provide remediation links to Supplier Specs, Item status, Allergen profile, Cost/spec review, QC read model.

### ADD-03-TECH-NonConformance-Event-Contract

**Moduł:** 03-TECHNICAL + 09-QUALITY cross-ref
**Typ:** T1-schema/T2-api docs + event contract
**Tytuł:** PO/TO deviation non-conformance/review event schema

**Zakres:**
- Define `technical_review_events` or `non_conformance_events` contract with owner Quality for canonical NCR lifecycle.
- Fields: source `po_receipt|transfer_order|bom_approval|factory_spec_review`, item, lot, supplier, deviation type, severity, status, assigned owner, due date, linked spec/BOM/cost/allergen review.
- Explicitly state that PO/TO do not mutate specs/cost; they create review events.

### PATCH-01-NPD-UX red-line acceptance in UI tasks

**Patch all NPD UI tasks touching FA/D365 copy:** add acceptance criteria:
- user-facing copy says FG / Finished Good, not Factory Article, unless marked “legacy alias”.
- D365 buttons say “Export to D365” and are disabled/hidden when `integration.d365.enabled=false` or policy blocks.
- Monopilot release CTA is separate from optional D365 export CTA.

### PATCH-03-TECH-UX red-line acceptance in UI tasks

**Patch Technical UI tasks T-032..T-063:** add acceptance criteria:
- `fa` labels are rendered as FG/Finished Good;
- `PR-code` labels are rendered as WIP/intermediate code;
- BOM active edit banner says clone-on-write and Technical approval required;
- BOM line add/edit shows RM usability status.

### PATCH-01-NPD-PRD/task contradiction for Trial/Pilot/Handoff/Packaging

**Patch:** create docs-only/task patch that marks §17.11.6 as superseded by 2026-05-03 decision and adds Stage-Gate evidence tasks for Trial/Pilot/Handoff/Packaging under NPD, not Technical.

## Remaining questions

1. Czy pierwsza wersja `factory_spec` po NPD Builder ma status `draft` czy `in_review` automatycznie? Rekomendacja: `in_review` tylko jeśli release preflight kompletny; inaczej `draft` z blockers.
2. Czy “release to factory” następuje dopiero po Technical `approved_for_factory`, czy FG/WIP są widoczne wcześniej jako “pending Technical approval”? Decision line 17/75 mówi available after NPD Builder, ale Technical §15A mówi factory use relies on Technical-approved spec. Potrzebna semantyka: visible vs usable.
3. Kto jest ownerem G4 approval: NPD Manager, Technical approver, czy approval chain z Settings? Rekomendacja: G4 NPD approval zamyka NPD, Technical approval jest osobnym factory-use gate.
4. Czy `Closed_Technical` w 7-dept closure oznacza tylko NPD data fill (shelf-life/allergens), czy już Technical factory_spec approval? Rekomendacja: rozdzielić; Closed_Technical != factory_spec approved.
5. Czy NPD Builder tworzy WIP/intermediate `items` jako `draft` czy od razu `active`? Rekomendacja: active only when linked approved BOM+factory_spec; otherwise pending.
6. Jak obsłużyć multi-FG z jednego multi-component briefu? 01-NPD §14 nadal ma open item. Jeśli E2E ma obejmować tylko 1 brief -> 1 FG z N ProdDetail, trzeba to jawnie ograniczyć w release tasku.
7. Czy D365 export powinien eksportować tylko `released_to_factory`, czy może `approved_for_factory` przed full factory release? Rekomendacja: only after approved factory-use state.
8. Jaki moduł jest canonical ownerem NCR lifecycle? Decision mówi triggers; prawdopodobnie 09-QUALITY, ale potrzebny cross-module event contract.

## Final note

Obecny stan jest bliski: ostatnie taski `01-NPD T-092/T-093`, `02-SETTINGS T-122`, `03-TECH T-073/T-074/T-079` dobrze adresują najważniejsze decyzje. Brakuje jednak integracyjnego spine’a: **Brief/Project/Gates -> FG mapping -> NPD Builder release transaction -> Technical factory_spec/BOM approval -> released_to_factory state**. Bez niego agent może poprawnie wykonać atomowe taski, ale produkt nie przejdzie E2E do fabryki w spójnym stanie.
