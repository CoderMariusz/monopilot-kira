# NPD module

Hi-fi prototype for the **New Product Development** module of MonoPilot MES.

The prototype is a working browser app — open `npd.html`. State is in-memory (seed in `data.jsx`); persistence is `localStorage` for route + tweaks. No backend.

---

## Documentation

| file | purpose |
|---|---|
| **`SCHEMA.md`** | Database tables + columns the backend must implement |
| **`API.md`** | REST endpoint contracts + WebSocket events |
| **`COMPONENT-INTERFACES.md`** | Props for every screen + `openModal(name, data)` shapes + file ownership |
| `npd.html` | Runtime — load order, vendor scripts, init |
| `npd.css` | Module-specific styles (extends `_shared/colors_and_type.css`) |

Read in that order if you're picking up implementation:
1. `COMPONENT-INTERFACES.md` — orient yourself in the file structure
2. `SCHEMA.md` — what the data model needs to look like
3. `API.md` — what the service must expose
4. Open `npd.html` and click around to see each screen wired up

---

## Module surface

**Three workflows**, all in one app shell:

1. **Brief → FG → D365 build** (canonical workflow)
   Brief list → Brief detail → Convert → FG list → FG detail (7 dept tabs) → Build D365.
   Owns: `brief-screens.jsx`, `fa-screens.jsx`, `d365-screens.jsx`, `gate-screens.jsx`.

2. **Configuration** (admin / NPD Manager)
   Template gallery → Template detail → Departments + fields editor + blocking rules + permissions + preview.
   Owns: `config-data.jsx`, `config-screens.jsx`, `config-runtime.jsx`.
   Two-step approval: Admin defines, NPD Manager submits change requests via `MODAL-CONFIG-04`.

3. **Legacy R&D pipeline** (parallel — Phase 2 deprecation)
   Kanban of project cards → stage rail (brief/recipe/nutrition/cost/trial/approval/handoff/checklist/history).
   Owns: `pipeline.jsx`, `project.jsx`, `other-stages.jsx`. Marked LEGACY in UI.

---

## Tenant context — Łuka Bakery

The seed data models a UK industrial bakery (Warburtons-style). FGs are loaves, buns, crumpets, hot cross buns. Earlier iterations used a charcuterie tenant (Negroni / Veroni); some legacy strings remain in deprecated `other-stages.jsx`.

To switch tenant skin: edit `data.jsx` (NPD_FGS, NPD_BRIEFS, NPD_INGREDIENTS_DEFAULT, NPD_ALLERGEN_CASCADE).
To switch active workflow template at runtime: Configuration tab → Activate, or via Tweaks panel.

---

## Phase plan

| phase | scope | status |
|---|---|---|
| **A** | Hi-fi prototype + UX spec | ✅ done |
| **B** | Backend service for FG + Brief CRUD, dept gate state | next |
| **C** | Configuration service (templates, change requests), allergen cascade engine | after B |
| **C4** | Quality module integration (extended docs, NCR linkage) | deferred |

Phase 2 deprecation: legacy R&D pipeline screens removed once all live tenants migrate to the FG/Brief workflow.
