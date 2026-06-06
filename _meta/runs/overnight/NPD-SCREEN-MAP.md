# NPD module — prototype→route map (overnight parity sweep)

Prototype SSOT = `prototypes/npd/*.jsx` (NOT under the design dir — the design/npd dir is empty).
Look SSOT = `MON-design-system` + `design/monopilot/handoff/` (globals.css classes). Domain = `MON-domain-npd`.
Follow `_meta/runs/overnight/PROTOCOL.md` (collision rules, i18n fragments, no git checkout, disjoint scope).

NPD = Brief → Project (Stage-Gate G0-G4) → FG/FA aggregate (69-col main table + Dept columns) → handoff.
HEAVY UI: prototype parity + real Supabase data are the two hard gates. Translate legacy `FA`→`FG` in copy.

## Built routes (15) → prototype anchor (file:line in prototypes/npd/)
| Route | Prototype screen | Anchor |
|---|---|---|
| `(npd)/npd` (landing) | NpdModalGallery / dashboard | modals.jsx:1020 (gallery) — make a real landing |
| `(npd)/pipeline` | Kanban/Table/Split pipeline views | pipeline.jsx:43 (Kanban) / :61 (Table) / :97 (Split) |
| `(npd)/pipeline/[projectId]/gate` | GateChecklistPanel | gate-screens.jsx:113 (+ AdvanceGateModal :268, GateApprovalModal :385) |
| `(npd)/pipeline/[projectId]/formulation` | Recipe / FormulationList | recipe.jsx + formulation-screens.jsx:14 |
| `(npd)/pipeline/[projectId]/nutrition` | NutritionScreen | other-stages.jsx:11 |
| `(npd)/pipeline/[projectId]/costing` | CostingScreen | other-stages.jsx:90 |
| `(npd)/pipeline/[projectId]/approval` | ApprovalScreen | other-stages.jsx:419 |
| `(npd)/fa` | FAList | fa-screens.jsx:184 |
| `(npd)/fa/[productCode]` | FADetail + 11 tabs + FARightPanel | fa-screens.jsx:313 (detail), 468 (right panel), tabs: Core 519, Planning 584, Commercial 606, Production 635, Technical 720, MRP 810, Procurement 853, BOM 887, Formulations 935, History 985 |
| `(npd)/fa/[productCode]/docs` | ComplianceDocsScreen | docs-screens.jsx:13 (+ DocUploadModal modals.jsx:674) |
| `(npd)/fa/[productCode]/allergens` | Allergen panel / AllergenOverrideModal | modals.jsx:396 (override) + :651 (refresh) |
| `(npd)/fa/[productCode]/risks` | RiskRegisterScreen | docs-screens.jsx:63 (+ RiskAddModal modals.jsx:305) |
| `(npd)/briefs` | BriefList | brief-screens.jsx:14 |
| `(npd)/briefs/[briefId]` | BriefDetail | brief-screens.jsx:97 (+ BriefConvertModal modals.jsx:96) |
| `(npd)/products/new` | CreateProjectWizard / FACreateModal | project.jsx:115 + modals.jsx:16 (FACreate), :53 (BriefCreate) |

## Modal inventory (prototypes/npd/modals.jsx) — match 1:1 where a built modal exists
FACreate 16, BriefCreate 53, BriefConvert 96, DeptClose 150, D365Build 201, VersionCompare 251,
RiskAdd 305, FADelete 356, AllergenOverride 396, D365Wizard 438, VersionSave 604, FormulationLock 622,
AllergenRefresh 651, DocUpload 674, RefreshD365 698, ActivateTemplate 720, AddField 792,
AddDepartment 860, RequestChanges 925.

## Look-fix (same as technical): blue .btn-primary CTAs (NOT black), .form-input inputs (NOT bare),
.ff modal fields (uppercase label), .modal-overlay/.modal-box/.modal-head/body/foot chrome, .kpi 3px
accent, .tabs/.tabs-counted, dense .table + mono codes, 5-tone .badge-*, .empty-state, styled
@monopilot/ui Select (no raw <select>). Real Supabase data (FG aggregate, withOrgContext+RLS), NO mocks.
Verify every CTA works (Create FG, Create brief, Advance gate, Lock formulation, Add risk, Upload doc,
D365 build/wizard); report dead/backend-missing ones for Codex.

## Lane split (wave 1, disjoint by route dir)
- **NPD-L1**: `(npd)/fa` + `(npd)/fa/[productCode]` (detail + 11 tabs) + FACreate/FADelete/VersionCompare modals.
- **NPD-L2**: `(npd)/fa/[productCode]/{docs,allergens,risks}` + DocUpload/RiskAdd/AllergenOverride/AllergenRefresh modals.
- **NPD-L3**: `(npd)/pipeline` (Kanban/Table/Split) + `(npd)/pipeline/[projectId]/gate` + AdvanceGate/GateApproval modals.
- **NPD-L4**: `(npd)/pipeline/[projectId]/{formulation,nutrition,costing}` + recipe + VersionSave/FormulationLock modals.
- **NPD-L5**: `(npd)/briefs` + `(npd)/briefs/[briefId]` + `(npd)/products/new` + `(npd)/npd` landing + `(npd)/pipeline/[projectId]/approval` + BriefCreate/BriefConvert modals.
