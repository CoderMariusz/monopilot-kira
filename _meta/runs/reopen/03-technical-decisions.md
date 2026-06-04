# 03-technical — Open-Decision Brief (sidecar prep, 2026-06-04)

Two open decisions block a clean `/kira:run-module 03-technical`. Each below has options +
a recommendation. Decide BEFORE Wave-A so the D365 UI tasks (T-055..T-059, T-057) and the
field-mapping admin task (T-057) don't get reworked. Source: Phase-0 audit blockers B-3 + B-5
(`_meta/runs/sidecar/reports/03-technical-phase0-audit.md`).

---

## D-1 — D365 route namespace: `/settings/integrations/d365/*` vs `/technical/d365/*`

### Context / evidence
- 4 D365 stub/built pages ALREADY live under the **settings** tree:
  - `apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/{page,sync,audit,mapping}/page.tsx`
    (sync/audit/mapping are prototype-anchored with real DB queries + tests — STATUS T-055/T-056/T-057 ⏸)
  - plus `settings/d365-conn/page.tsx` (connection config), `settings/d365-dlq/page.tsx` (SettingsRouteStub),
    `settings/d365-mapping/page.tsx`.
- The 03-technical task JSONs target the **technical** tree: T-057 scope is
  `app/(app)/technical/d365/mapping/page.tsx`; T-055/T-056/T-058/T-059 similarly target `/technical/d365/*`.
- PRD 03-TECHNICAL §13.2 + §13.8 + §13A explicitly say D365 **connection config** lives in
  "SETTINGS > Integrations > D365" (02-SETTINGS §11.3) and repeatedly cross-ref 02-SETTINGS §11.3 for the D365 panel.
- Net: a **duplicate-route / rework conflict** — two homes for the same screens.

### Options
| # | Option | Pros | Cons |
|---|---|---|---|
| A | **Keep D365 in `/settings/integrations/d365/*`** (relocate the technical task targets to settings) | Matches what's already built + tested; matches PRD §13.2/§13.8 placing config under Settings>Integrations; one D365 home; admin-only RBAC already lives in the admin route group; no orphan `.next` artifacts | Technical tasks' `scope_files` must be retargeted (paths only — small edit); D365 is conceptually a Technical capability yet lives under Settings |
| B | **Move everything to `/technical/d365/*`** | D365 sync/DLQ/mapping/drift are Technical-domain capabilities; co-located with items/BOM | Deletes/relocates already-built tested settings pages (sync/audit/mapping); contradicts PRD §13.2/§13.8 "config in Settings"; connection config (`d365-conn`) would split (config in Settings, ops in Technical) or also move; more churn + higher Gate-5 regression risk |
| C | **Split: connection CONFIG in Settings, OPS dashboards in Technical** | Cleanest conceptual ownership (Settings owns secrets/connection; Technical owns sync ops) | Two homes again → nav confusion; the already-built settings sync/audit/mapping pages still need relocating; most rework of the three |

### Recommendation: **Option A — keep D365 under `/settings/integrations/d365/*`.**
Lowest churn, aligns with both the already-built+tested pages and PRD §13.2/§13.8 (config under Settings>Integrations),
and avoids deleting passing tests right before a module run. Connection config + ops dashboards stay co-located under
the admin Settings route group (consistent admin RBAC). **Action:** retarget the `scope_files` in T-055/T-056/T-057/T-058/T-059
from `app/(app)/technical/d365/*` → `app/[locale]/(app)/(admin)/settings/integrations/d365/*` (and `settings/d365-dlq`
for T-058), and update the STATUS notes that flag "wrong route namespace" to "correct namespace = settings (D-1 resolved A)".
Add a single nav entry from the Technical module to the Settings D365 panel so Technical users can still reach it.
(If the PO prefers Technical ownership for product reasons, Option C is the principled second choice — but it is the most rework.)

---

## D-2 — D365 field-mapping authority: runtime admin screen (T-057) vs fixed PRD mapping

### Context / evidence
- T-057 (TEC-090 D365 Field Mapping admin) builds a **runtime, admin-editable** field-mapping table
  ("Mapping persisted via existing 02-SETTINGS reference_tables.d365_field_mappings (assumed)") with an
  unmapped-field alert (BL-TEC-01: `Item.allergens[]` unmapped → values lost on push).
- The PRD also describes D365 entity mappings somewhat **fixed** in §13.3 (pull `/data/Products`→`items`,
  `/data/BOMVersions`+`/data/BOMLines`→`bom_headers`+`bom_lines`) — i.e. the core mapping is code-defined.
- Open question: **is the field mapping authored at runtime by an admin (T-057), or fixed in code/PRD with the
  screen being read-only/alert-only?** This affects 01-npd's deferred D365 Builder + 10-finance/11-shipping D365 export.

### Options
| # | Option | Pros | Cons |
|---|---|---|---|
| A | **Fixed code/PRD mapping; T-057 screen is READ-ONLY + alert-only** (shows the code-defined mapping + unmapped-field alerts; no admin edit) | Deterministic, testable, no per-org drift; matches PRD §13.3 entity mapping; anti-corruption (R15) — D365 can't silently remap canonical fields; least surface for a security/data-loss bug | Admins can't fix a mapping gap without a code change; new D365 custom fields need a dev |
| B | **Runtime admin-editable mapping** (T-057 as written; persisted in `reference_tables.d365_field_mappings`) | Flexible per-org; admins self-serve new D365 fields | Per-org config drift; a bad mapping can corrupt canonical data on import (violates R15 spirit); the backing table is "assumed" (not confirmed to exist); much larger test/validation surface; harder Gate-5 |
| C | **Hybrid: code-defined CORE mapping (immutable) + runtime EXTENSION mapping for L3 `ext_jsonb`/custom fields only** | Canonical fields stay safe (R15); admins can still map tenant L3 custom columns; matches the schema-driven L3 model already in items | Most implementation effort; needs a clear core-vs-extension boundary + validation; the extension store must exist |

### Recommendation: **Option A for Wave-A (ship read-only + alert-only), with Option C as the documented follow-up.**
The core item/BOM field mapping is code-defined (PRD §13.3) and must stay so for R15 anti-corruption — D365 must not
be able to silently remap canonical fields at runtime. For the module run, scope T-057 to a **read-only mapping view +
BL-TEC-01 unmapped-field alert/acknowledge** (which is exactly its stated value), NOT an editable authoring surface.
This removes the "assumed" `reference_tables.d365_field_mappings` dependency and shrinks the risk/test surface.
**Action:** edit T-057's `details`/`out_of_scope` to state mapping is code-defined (read-only + alert), drop the
"persisted via reference_tables.d365_field_mappings" assumption, and keep "Mapping engine apply" out of scope.
File a Phase-2 follow-up for Option C (runtime mapping limited to L3 `ext_jsonb`/custom fields) if a real per-org
custom-field need appears. This keeps 01-npd's deferred D365 Builder + 10/11 export on a stable, deterministic mapping.

---

## Net effect on run-readiness
- D-1 resolved (recommend A) → no duplicate-route rework; retarget 5 task `scope_files` to settings.
- D-2 resolved (recommend A) → T-057 de-scoped to read-only+alert; removes an unconfirmed table dependency.
- Neither decision blocks Wave-A schema/enum/seed tasks (T-001/T-003/T-005/T-006/T-007/T-091/T-093/T-070);
  they only need to be settled before the D365 UI wave (T-055..T-059).
