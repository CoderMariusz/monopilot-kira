# Parity Audit — 01-npd (2026-06-05)

Read-only audit. Source-code unchanged. Evidence = files opened (full read of the
RSC page for every routed screen + the prototype index + targeted greps of the
client islands fa-list-table / fa-right-panel / fa-tabs / layout, plus the
prototype JSX for fa_detail TABS).

## Coverage
- **screens audited: 16 / 16 built page.tsx** (every `page.tsx` under
  `apps/web/app/[locale]/(app)/(npd)/` plus the legacy `apps/web/app/(npd)/fa/[productCode]/allergens/page.tsx`).
  Fully read: npd/dashboard, fa/list, fa/[productCode] (detail), fa allergens (legacy + locale),
  fa/docs, fa/risks, products/new, briefs/list, briefs/[briefId], pipeline/list,
  pipeline/[projectId]/{gate, approval, formulation, nutrition, costing}.
  Spot-verified via grep: fa-list-table.tsx, fa-right-panel.tsx (both trees),
  fa-tabs label set, fa/[productCode]/layout.tsx.
- **prototype files referenced**: `npd/fa-screens.jsx`, `npd/brief-screens.jsx`,
  `npd/pipeline.jsx`, `npd/recipe.jsx`, `npd/formulation-screens.jsx`,
  `npd/gate-screens.jsx`, `npd/other-stages.jsx`, `npd/allergen-screens.jsx`,
  `npd/docs-screens.jsx`, `npd/modals.jsx` (via `_meta/prototype-labels/prototype-index-npd.json`, all 1671 lines read).
- **screens with no locatable anchor**: 0. Every page declares a literal
  `prototypes/design/Monopilot Design System/npd/<file>.jsx:<lines>` header anchor.
- **NOT audited at island/pixel level**: I read RSC loaders fully but did not render
  Playwright screenshots, so visual-density findings below are inferred from
  Tailwind class evidence in the islands I greped, not from pixels. Stated honestly.

## Findings (table)
| ID | route/screen | prototype anchor (file:lines) | dimension | severity | cause-class | prototype shows | code renders | note |
| NPD-P-001 | fa (FA/FG list) | fa-screens.jsx:177-297 (fa_list) | structural | P1 | missing-feature | table + Kanban 5-col view toggle (ToggleGroup/Tabs) | table-only; no Kanban, no view toggle (fa-list-table.tsx has 0 `kanban`/`ToggleGroup` matches) | index translation-note explicitly calls for the toggle; not built |
| NPD-P-002 | fa/[productCode] (FA detail) | fa-screens.jsx:300-401 (fa_detail) | structural | P1 | missing-feature | 12 inline tabs incl. **BOM** + **Formulations** | 8 tabs (core/planning/commercial/production/technical/mrp/procurement/history) — no BOM tab, no Formulations tab inline | BOM (fa_bom_tab :823-868) + Formulations (fa_formulations_tab :871-918) have NO built surface anywhere in npd; risks/docs/allergens relocated to sub-routes (acceptable), but BOM/Formulations are a true gap |
| NPD-P-003 | fa/[productCode] | fa-screens.jsx:300-401 | structural | P2 | one-off-execution | Procurement modelled as "Supplier"/price tab | built adds a 7th dept `procurement` tab (schema-driven) | net-positive deviation; flagged only for index/label reconciliation |
| NPD-P-004 | (npd)/fa/[productCode]/allergens (legacy) | allergen-screens.jsx:5-118 | structural | P2 | one-off-execution | single allergen cascade screen | duplicate non-locale route co-exists with locale route (`[locale]/.../allergens`) rendering same widget | dead/duplicate route; legacy `fa-right-panel.tsx` here is a dumb client stub (no data) vs the real RSC panel in the locale tree — risk of drift |
| NPD-P-005 | fa/[productCode] right panel | fa-screens.jsx:404-452 (fa_right_panel) | structural | P3 | one-off-execution | V01-V08 validation result list in 280px sticky aside | locale-tree FaRightPanel (real RSC, skeleton/empty/error/forbidden states, wired into layout.tsx 2-col grid `lg:grid-cols-[1fr_280px]`) | parity GOOD in locale tree; the legacy `(npd)` stub panel (no V01-V08, hardcoded owner/days props) is the non-parity copy |
| NPD-P-006 | npd (dashboard) | fa-screens.jsx:32-174 (npd_dashboard) | interaction | P3 | missing-feature | 30s polling refresh (BL-NPD-04) | static render, `force-dynamic` only; no SWR/SSE refresh | known prototype-bug carry-forward; documented, not silently dropped |
| NPD-P-007 | pipeline | pipeline.jsx:133-208 (legacy R&D) | structural | P2 | one-off-execution | legacy R&D stage model, @deprecated | built deliberately renders Stage-Gate G0-G4 model + accessible "Advance" affordance instead of dnd drag | intentional, logged in page header deviation; BL-NPD-02 (legacy/FA-spec coexistence) still open |
| NPD-P-008 | pipeline/[projectId]/nutrition | other-stages.jsx:4-80 | data | P2 | data-wiring | per-nutrient OK/At-limit traffic-light status | every row hardcoded `status:'ok'` (no per-nutrient target column in schema T-069) | honest deviation comment in code; status column is cosmetic-only until targets table lands |
| NPD-P-009 | pipeline/[projectId]/approval | other-stages.jsx:391-451 | data | P2 | data-wiring | multi-step approval chain w/ named approvers | `approvalMode:'single'`, single synthetic step, approver shown as raw user_id (not name) | C1-C7 criteria are real (evaluateApprovalCriteria); chain is a thin shell |
| NPD-P-010 | pipeline/[projectId]/costing | other-stages.jsx:83-163 | visual | P3 | one-off-execution | CSS waterfall + what-if sliders | sliders labelled (`sliderTargetPrice:'Margin %'` etc.); decimal-exact margin math; waterfall as table | NUMERIC-honest (no floats) — strong; chart is tabular not bar/waterfall-visual |
| NPD-P-011 | briefs/[briefId] | brief-screens.jsx:84-231 | interaction | P2 | missing-feature | Mark-complete runs V-NPD-BRF-001 + project routing | Save-draft wired (saveBriefDraft); Mark-complete action (T-034) NOT merged — CTA present, parity-tested, but `onMarkComplete` not passed | dangling affordance until T-034 lands |
| NPD-P-012 | briefs/[briefId] | brief-screens.jsx:84-231 | structural | P3 | missing-feature | C21-C37 packaging fields | rendered as disabled "TBD" placeholders (BL-NPD-01 Phase B.2 rescan pending) | scaffolded honestly, labelled pending |
| NPD-P-013 | all screens | n/a | a11y | P3 | systemic-pattern | — | state panels use `role="alert"`; progress uses `role=progressbar`+aria; dept glyphs paired w/ sr-only label; NO axe run captured in this audit | a11y primitives present in code; not independently axe-verified here |

## Systemic patterns (KEY)
Discrepancy CLASSES recurring across ≥3 screens:

1. **5-state-shell EXCELLENT (positive systemic-pattern)** — **15/16 screens.**
   Every RSC implements the full `ready | empty | error | permission_denied (+loading/locked)`
   union, server-resolved, with i18n labels + English fallback. This is a *good*
   recurring pattern, not a defect. Root cause: a shared loader idiom copied per page.
   FIX: none — codify as the SKILL reference implementation.

2. **Real-Supabase-data, org_id-locked (positive systemic-pattern)** — **16/16 screens.**
   All reads run inside `withOrgContext` with `where org_id = app.current_org_id()`
   and RLS; permission checks via `user_roles/role_permissions`. ZERO `tenant_id`
   usage (only one comment reaffirming the rule). NUMERIC carried as `::text` strings.
   Red-line CLEAN. FIX: none.

3. **Prototype "stretch" features dropped (missing-feature)** — **≥4 screens**
   (NPD-P-001 Kanban toggle, NPD-P-002 BOM+Formulations tabs, NPD-P-006 polling,
   NPD-P-011 mark-complete). Root-cause hypothesis: slices shipped the core read/write
   path and deferred secondary prototype affordances; index translation-notes flagged
   them but they were never closed. FIX: per-screen EXECUTION-fix (each is a discrete
   task), not a SKILL change.

4. **Cosmetic status without backing data (data-wiring)** — **3 screens**
   (NPD-P-008 nutrient status, NPD-P-009 approval chain, partially NPD-P-002 V06 'warn').
   Root cause: read-model/target tables not yet provisioned, so status enums are
   hardcoded with an honest in-code deviation note. FIX: data-wiring per screen once
   the upstream tables land — NOT a fabrication (well-documented).

5. **Dual route trees `(npd)` vs `[locale]/(app)/(npd)` (one-off/structural)** —
   `(npd)` is the canonical implementation home (Server Actions + many `_components`);
   `[locale]` holds the routed RSC pages that import them. Mostly clean, BUT the
   legacy `(npd)/fa/[productCode]/allergens/page.tsx` + its stub `fa-right-panel.tsx`
   are live duplicates of the locale versions (NPD-P-004/005). FIX: per-screen
   EXECUTION-fix — delete/redirect the legacy allergens route + stub panel to prevent drift.

## Top P0/P1 blockers (max 10)
- **NPD-P-001 (P1)** — FA list has no Kanban view / table-Kanban toggle (prototype fa_list requires it).
- **NPD-P-002 (P1)** — FA detail missing the **BOM** and **Formulations** inline tabs (2 of 12 prototype tabs have no built surface anywhere in npd).
- (No P0. No red-line violations: FG/FA naming honoured — internal labels say "Create FG"/"Finished Good"; org_id-only; real Supabase data throughout; Stage-Gate G0-G4 complete in pipeline/gate.)

## Honest coverage gaps
- **No Playwright / pixel evidence captured** in this pass — visual + visual-density
  findings (NPD-P-010, density) are inferred from Tailwind classes in the islands I
  greped, not from rendered screenshots. A true visual-density verdict needs a render pass.
- **No axe/a11y run** — NPD-P-013 is based on reading aria/role/sr-only usage in code, not an axe scan.
- **Client islands not fully read**: I fully read all 16 RSC loaders but only greped
  (not line-by-line read) fa-list-table, fa-right-panel, fa-tabs, brief/formulation/
  costing/gate/approval client components. Findings about *table-vs-form internals*,
  validation-message wording, and disabled-state styling inside those islands are
  therefore partial.
- **Modals** (modals.jsx: fa_create/brief_create/brief_convert/dept_close/d365_build/
  d365_wizard/version_*/risk_add/allergen_override/doc_upload) were assessed only via
  their host wiring (e.g. BriefModalsHost, FaDetailModalHost, fa-create-host) and the
  index — not by reading each modal component. The **d365_wizard (8-step, :431-594)**
  and **version_compare/version_save/formulation_lock** modals have no confirmed built
  surface in the routes I opened; treat their parity as UNVERIFIED, not GREEN.
- **Sensory / trial / pilot / handoff** prototype screens (other-stages.jsx) have no
  corresponding npd page.tsx in the audited tree — likely owned by Technical/later
  slices; flagged as not-built-in-npd rather than non-parity.
