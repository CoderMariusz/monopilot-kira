# NPD Module — Component Interfaces

Props contracts for every screen + modal in the prototype. Maps `<Component>` to expected `props` and `openModal(name, data)` payloads.

> **Goal:** a backend dev can scan this and know exactly what data each screen needs, what modals it triggers, and what they emit.

---

## 1. Routing & app shell

### `<NpdApp>`
Root component in `app.jsx`. Owns:
- `route` state — `{screen, fa_code?, brief_id?, configId?, stage?}`
- `modal` state — `{name, data}` (Pattern A — central modal switch)
- `tweaks` state — feature flags / persona switches
- `openModal(name, data)`, `closeModal()` — passed to every screen

Routes (`route.screen` values):
| screen | extra route keys | component |
|---|---|---|
| `dashboard` | — | `<NpdDashboard>` |
| `fa_list` / `fa_kanban` | — | `<FAList>` |
| `fa_detail` | `fa_code` | `<FADetail>` |
| `briefs` | — | `<BriefList>` |
| `brief_detail` | `brief_id` | `<BriefDetail>` |
| `formulations` | — | `<FormulationList>` |
| `formulation_editor` | `fa_code` | `<FormulationEditor>` |
| `allergens` | `fa_code?` | `<AllergenCascade>` |
| `d365_builder` | `fa_code` | `<D365BuilderOutput>` |
| `config` | — | `<ConfigList>` |
| `config_detail` | `configId` | `<ConfigDetail>` |
| `pipeline` | — | `<Pipeline>` (legacy R&D flow) |
| `project` | `project_id, stage` | `<ProjectShell>` |
| `gallery` | — | `<NpdModalGallery>` |

Persisted to `localStorage["npd-route"]`.

---

## 2. Screen components

Every screen receives `openModal` from app shell. Most also receive navigation callbacks (`onOpenFA`, `onBack`, etc).

### `<NpdDashboard>`
**Props:** `{openModal, onOpenFA}`
**Data reads:** `window.NPD_FAS` (full list — computes KPIs)
**Modals fired:** `faCreate`, `refreshD365`

### `<FAList>`
**Props:** `{onOpenFA, openModal, initialView}`
- `initialView`: `"table"` | `"kanban"`

**Modals:** `faCreate`, `d365Build` (per-row when status=Complete)

### `<FADetail>`
**Props:** `{faCode, onBack, openModal}`
**Data reads:**
- `window.NPD_FAS.find(f => f.fa_code === faCode)`
- `window.NPD_GET_ACTIVE_CONFIG()` — to render dept tabs from active template
- `window.NPD_FORMULATION_VERSIONS[faCode]`
- `window.NPD_DOCS[faCode]`
- `window.NPD_RISKS[faCode]`
- `window.NPD_ALLERGEN_CASCADE[faCode]`
- `window.NPD_HISTORY[faCode]`

**Modals:** `deptClose`, `faDelete`, `d365Build`, `versionCompare`, `versionSave`, `formulationLock`, `allergenOverride`, `allergenRefresh`, `docUpload`, `riskAdd`

**Internal state:** `tab` — currently selected dept tab key.

### `<BriefList>`
**Props:** `{onOpenBrief, openModal}`
**Modals:** `briefCreate`, `briefConvert`

### `<BriefDetail>`
**Props:** `{briefId, onBack, openModal}`
**Modals:** `briefConvert`

### `<FormulationList>` / `<FormulationEditor>`
**Props:**
- list: `{onOpenFA}`
- editor: `{faCode, onBack}`

Editor reads `window.NPD_FORMULATION_VERSIONS[faCode]`, edits draft only.

### `<AllergenCascade>`
**Props:** `{onOpenFA, openModal, initialFa}`
- `initialFa` lets caller (e.g. FG Detail "Allergens" tab) deeplink.

**Modals:** `allergenRefresh`, `allergenOverride`

### `<D365BuilderOutput>`
**Props:** `{faCode, onBack, openModal}`
**Modals:** `d365Build`, `d365Wizard`

### `<ConfigList>` (Configuration index)
**Props:** `{onOpenConfig, openModal}`
- `onOpenConfig(templateId)` — navigate to detail.

**Data reads:**
- `window.NPD_CONFIG_TEMPLATES` — all templates
- `window.NPD_ACTIVE_CONFIG_ID` — for active marker
- `window.NPD_CONFIG_CAN_EDIT()` — admin gate

**Modals:** `activateTemplate`

**Listens:** `window.addEventListener("npd:config-activated", ...)` to refresh local state.

### `<ConfigDetail>`
**Props:** `{configId, onBack, openModal}`
**Modals:** `addField`, `addDepartment`, `requestChanges`

**Internal state:**
- `tab` — `"depts" | "rules" | "validations" | "permissions" | "preview"`
- `selectedDept` — dept_key
- `editingField` — field_id (for inline edit form)

### `<DepartmentFieldEditor>`
**Props:** `{dept, tpl, canEdit, openModal}`
Renders the field table for one department. `openModal("addField", {dept, tpl})` on add.

### `<GenericDeptTab>` (config-runtime.jsx)
**Props:** `{fa, deptId, openModal}`
Fallback dept tab — renders fields from active template config when no specialised `<FACoreTab>` etc. exists.
Reads `window.getDeptConfig(deptId)`. Fires `openModal("deptClose", {fa, dept: dept.label})` on Close section.

---

## 3. Modal components — data shapes

Every modal accepts `{open, onClose, data?}`. `data` is the second arg of `openModal(name, data)`.

| Modal name | `data` shape | Effect on confirm |
|---|---|---|
| `faCreate` | none | `POST /api/npd/fgs` |
| `briefCreate` | none | `POST /api/npd/briefs` |
| `briefConvert` | `{brief}` | `POST /briefs/{id}/convert-to-fg` |
| `deptClose` | `{fa, dept}` — dept = label | `POST /fgs/{code}/close-dept` |
| `d365Build` | `{fa}` | `POST /fgs/{code}/build-d365` (requires MFA) |
| `d365Wizard` | `{fa}` | guided 8-step variant of d365Build |
| `versionCompare` | `{fa}` | read-only |
| `versionSave` | `{fa}` | `POST /fgs/{code}/formulations` |
| `formulationLock` | `{fa, version}` | `POST /formulations/{id}/lock` |
| `riskAdd` | `{fa, risk?}` — edit if risk passed | `POST` or `PATCH /risks` |
| `faDelete` | `{fa}` | `DELETE /fgs/{code}` (type-to-confirm) |
| `allergenOverride` | `{fa, allergen}` | `POST /fgs/{code}/allergens/override` |
| `allergenRefresh` | `{fa}` | `POST /fgs/{code}/allergens/recalc` |
| `docUpload` | `{fa}` | multipart `POST /fgs/{code}/documents` |
| `refreshD365` | none | `POST /api/integrations/d365/refresh-cache` |
| `activateTemplate` | `{tpl}` | `POST /config/templates/{id}/activate` |
| `addField` | `{dept, tpl}` | local edit, persisted on Save changes at template level |
| `addDepartment` | `{tpl}` | local edit, persisted on Save changes |
| `requestChanges` | `{tpl}` | `POST /config/templates/{id}/change-requests` |
| `gateApproval` | `{fa, dept}` | `POST /fgs/{code}/close-dept` (variant) |
| `advanceGate` | `{fa, fromDept, toDept}` | gate transition |

---

## 4. Permission helpers

```js
window.npd_can(action_key) → boolean
```

Backed by `GET /api/npd/permissions`. Action keys live in `permissions.jsx`.

UI pattern:
```jsx
{window.npd_can('fa.delete') && <button onClick={() => openModal("faDelete", {fa})}>Delete FG</button>}
```

Configuration-specific check:
```js
window.NPD_CONFIG_CAN_EDIT() → boolean  // admin role only
```

---

## 5. State patterns

### Pattern A — central modal switch (used)
App owns `modal` state. `openModal(name, data)` sets it. Single switch in app render mounts the correct modal. Reasons:
- one source of truth → URL-stateable later
- modals don't need to know each other
- replacing one modal type with another (e.g. Quick → Advanced) is local

### Pattern B — context provider (NOT used)
Considered then rejected — adds renders, hides the call site.

### Pattern C — imperative `Modal.show()` (NOT used)
Considered then rejected — breaks React tree, unmount semantics fragile.

---

## 6. Custom DOM events

Cross-component signals (avoid prop drilling):

| event | dispatched by | listened by | payload |
|---|---|---|---|
| `npd:config-activated` | `NPD_SET_ACTIVE_CONFIG()` | `<ConfigList>`, `<FADetail>` | `{id}` |
| `npd:fg-created` | post-conversion (server WS) | `<FAList>`, `<NpdDashboard>` | `{fg_code}` |
| `npd:fg-updated` | server WS | `<FADetail>` if open | `{fg_code, changed_fields}` |

All are `CustomEvent` on `window`. Always wrapped in try/catch to survive older browsers.

---

## 7. Tweaks (in-design controls)

`<NpdTweaks>` panel exposes:
- **Persona switch** — admin / npd_manager / commercial / quality / viewer (drives `window.npd_can` + `NPD_CONFIG_CAN_EDIT`)
- **Active config** — switch templates without going to Configuration screen
- **Approval mode** — single / dual / tribunal (legacy R&D flow)
- **Mock state flags** — empty-state, error-state, loading-state previews

State persisted to `localStorage["npd-tweaks"]`.

---

## 8. File ownership

| file | owns |
|---|---|
| `app.jsx` | routing, modal mount, role banner |
| `chrome.jsx` | sidebar, topbar, breadcrumbs |
| `data.jsx` | seed data (replace with API hydration) |
| `config-data.jsx` | config templates seed + `NPD_GET_ACTIVE_CONFIG`, `NPD_SET_ACTIVE_CONFIG`, `NPD_CONFIG_CAN_EDIT` |
| `config-runtime.jsx` | `getDeptConfig`, `<GenericDeptTab>`, runtime field rendering |
| `config-screens.jsx` | `<ConfigList>`, `<ConfigDetail>`, `<DepartmentFieldEditor>`, `<FieldEditForm>`, rule/permission/preview tabs |
| `fa-screens.jsx` | `<NpdDashboard>`, `<FAList>`, `<FADetail>` |
| `brief-screens.jsx` | `<BriefList>`, `<BriefDetail>` |
| `formulation-screens.jsx` | `<FormulationList>`, `<FormulationEditor>` |
| `allergen-screens.jsx` | `<AllergenCascade>` |
| `recipe.jsx` | `<RecipeStage>` (in-FG tab) — nutrition, ingredients, allergen panel |
| `docs-screens.jsx` | `<ComplianceDocsScreen>`, `<RiskRegisterScreen>` |
| `d365-screens.jsx` | `<D365BuilderOutput>` |
| `gate-screens.jsx` | gate strip, dept advance UI |
| `modals.jsx` | all 18 modals + `NPD_MODAL_CATALOG`, `<NpdModalGallery>` |
| `pipeline.jsx`, `project.jsx`, `other-stages.jsx` | legacy R&D pipeline (kept as parallel workflow until Phase 2 deprecation) |
| `tweaks.jsx` | `<NpdTweaks>` panel |
| `npd.css` | module-specific styles (mostly extends `_shared/colors_and_type.css`) |

---

## 9. Anti-patterns to avoid in implementation

1. **Don't read `window.NPD_*` directly from new code.** Wrap behind a hook (`useFG(fgCode)`, `useActiveConfig()`) so the data source can swap to API without touching every screen.
2. **Don't store fg field values as flat columns.** EAV via `npd_fg_field_values` is mandatory — schema is per-template.
3. **Don't enforce blocking rules client-side only.** Server must re-validate on every mutation; UI rules are advisory previews.
4. **Don't hard-code `tenant_id`.** Always derive from session, never from URL or body.
5. **Don't allow direct edits to built-in templates.** Force clone-then-edit; built-ins are immutable so updates ship via deploy.
