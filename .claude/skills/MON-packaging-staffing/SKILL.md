---
name: MON-packaging-staffing
description: >-
  Use when implementing the MES packaging / staffing / line-loading feature ported from the
  Power Apps "PLD Form" (Product Launch Document). Triggers: packaging specification screens;
  pack-type-driven selection of film / tray / web / dieset / components; standard labour
  staffing per packing line; pallet & case configuration with ti-hi and cube/air-void;
  line loading & capacity planning (utilisation, takt/cycle time). Read BEFORE coding any
  PLD-derived screen so the domain model, formulas, and screen mapping match industry
  expectation and MonoPilot's locked rules. Pairs with MON-domain-technical (FA/spec owner),
  MON-domain-planning (line loading), MON-t1/t2/t3 (layers), MON-multi-tenant-site (org_id law).
---

# MON-packaging-staffing

Build agents: read this whole file before writing any code for the PLD-derived packaging/
staffing/line-loading feature. It is the single reference for the domain, the screen map,
the formulas (verified against industry sources), and the hard rules you must obey.

The PLD Form is a packaging-spec authoring tool: per FG/FA you declare the pack TYPE, that
type drives which COMPONENTS apply (films/webs/trays/boxes/dieset), you assign each component
to one or more production LINES, capture CASE + PALLET geometry (ti-hi/cube), and a STANDARD
STAFFING crew per line. MonoPilot already owns the FA aggregate, lines, inventory and RLS — the
PLD becomes packaging tabs/sub-screens on the FA detail, NOT a parallel app.

## (b) PLD screen -> MonoPilot module/route mapping

| PLD screen (Power Apps)        | What it does in PLD                                              | MonoPilot module / route                                                                 |
| ------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| scrCore                        | Core FA identity / header fields                                | FA detail **Core** tab — `app/(app)/fa/[id]/core`                                         |
| scrTech                        | Technical spec fields (factory/process)                         | FA detail **Technical** tab — `app/(app)/fa/[id]/technical` (owner: MON-domain-technical) |
| scrCommercial                  | Commercial/customer/pricing-facing fields                       | FA detail **Commercial** tab — `app/(app)/fa/[id]/commercial`                             |
| scrPlanning                    | Planning attributes (lead time, MOQ, line eligibility)          | FA detail **Planning** tab — `app/(app)/fa/[id]/planning` (owner: MON-domain-planning)    |
| scrProduction                  | Production attributes (line, run rate, crew)                    | FA detail **Production** tab — `app/(app)/fa/[id]/production` (owner: MON-domain-production)|
| scrMRP                         | MRP / material requirement attributes                           | FA detail **MRP** tab — `app/(app)/fa/[id]/mrp` (owner: MON-domain-planning)               |
| scrFinance                     | Finance / cost attributes                                       | FA detail **Finance** tab — `app/(app)/fa/[id]/finance` (owner: MON-domain-finance)        |
| scrBoxDims                     | Case W/H/L + boxes-per-layer + layers + per-pallet + line assign| **Packaging > Case & Pallet config** — `app/(app)/fa/[id]/packaging/cases`                 |
| scrWebLines                    | Assign Top/Base web components to production lines (+print flag)| **Packaging > Web–line assignment** — `app/(app)/fa/[id]/packaging/webs`                   |
| scrComponentEdit / scrComponentList | Author/list packaging components (films, trays, boxes)     | **Packaging > Components** — `app/(app)/fa/[id]/packaging/components`                      |
| scrNewFA                       | Create a new FA/item                                            | FA create flow — `app/(app)/fa/new`                                                       |
| scrBulkAddFA                   | Bulk create FAs                                                 | FA bulk import — `app/(app)/fa/import`                                                     |

Notes from the ported source:
- `scrBoxDims` filters `PLD_Items` to `Category = "Box"` and patches
  `Box_W/Box_H/Box_L`, `Boxes_Per_Layer`, `Number_Of_Layers`, `Box_Per_Pallet`, `Plan_Line`.
  -> these become the case geometry + ti-hi columns + a line link.
- `scrWebLines` filters to `Category = "TopWeb" | "BaseWeb"`, joins via `PLD_ItemLine`
  (item↔line), and carries a `PrintWeb` boolean. -> component↔line is a join table, not a CSV.
- PLD stores line assignment as a comma string (`Plan_Line`). In MonoPilot use a proper
  join table (`fa_component_lines` / `fa_case_lines`), never a delimited string column.

## (c) Glossary

- **Pack type** — the top-level packaging method that drives which components apply:
  *thermoform (form-fill-seal)*, *tray-seal (preformed tray + lidding film)*, *flow-wrap (HFFS)*.
- **Category** — component classification used to filter the PLD item list
  (`Box`, `TopWeb`, `BaseWeb`, `Tray`, `Component`); the pack type constrains valid categories.
- **Top film / top web** — non-forming lidding film sealed onto a tray or formed pocket.
- **Bottom film / bottom web** — the thicker forming web drawn into the dieset to make pockets
  (thermoform only); tray-seal has no bottom web (the tray replaces it).
- **Tray** — preformed rigid/semi-rigid base in tray-seal; mutually exclusive with bottom web.
- **Flow-wrap film** — single film web formed into a tube with a back fin seal (HFFS); no tray/web pair.
- **Dieset / tooling** — the forming/cutting tool that defines pocket shape and the cut layout.
- **Impressions / repeats** — number of pack pockets the dieset forms per cycle/index
  (cavities across × down). Higher impressions = more packs per machine cycle.
- **Component** — any consumable bound to the FA's pack (film, web, tray, box, label, insert).
- **Standard staffing** — the planned crew (headcount by role) required to run the line at format speed.
- **Ti-hi** — pallet load notation: **Ti** = cases per layer, **Hi** = layers per pallet.
- **Cases-per-layer (Ti)** — footprint count: how many cases fit on one pallet layer.
- **Layers-per-pallet (Hi)** — stack count: how many layers fit under the height/weight limit.
- **Pallet cube / air void** — fraction of the pallet load envelope filled by product cube;
  air void = the unused complement.
- **Line loading** — assigning FA volume/runs to specific lines over a horizon and checking it fits.
- **Takt / cycle time** — takt = demand pace required; cycle = the line's actual time per unit.

## (d) Canonical formulas (verified, with units)

Cases per layer (test both orientations, take the max):
```
Ti = max(
  floor(pallet_length_mm / case_length_mm) * floor(pallet_width_mm / case_width_mm),
  floor(pallet_length_mm / case_width_mm)  * floor(pallet_width_mm / case_length_mm)
)
```
Layers per pallet (smaller of height- and weight-limited):
```
Hi_height = floor((max_load_height_mm - pallet_deck_mm) / case_height_mm)
Hi_weight = floor((max_pallet_weight_kg - pallet_tare_kg) / (Ti * case_weight_kg))
Hi        = min(Hi_height, Hi_weight)
```
Cases per pallet, units per pallet:
```
cases_per_pallet = Ti * Hi
units_per_pallet  = cases_per_pallet * units_per_case
```
Pallet cube utilisation & air void (volumes in mm³ or m³, be consistent):
```
case_volume      = case_length * case_width * case_height
load_envelope    = pallet_length * pallet_width * (max_load_height - pallet_deck)
cube_util_pct    = (Ti * Hi * case_volume) / load_envelope * 100
air_void_pct     = 100 - cube_util_pct
```
Takt time, cycle time, operators, line utilisation, planned vs available hours:
```
takt_time_s      = available_production_time_s / customer_demand_units
operators_needed = ceil(total_work_content_s / takt_time_s)        # crew size
line_balance_pct = (total_work_content_s / takt_time_s) / operators_needed * 100
cycle_time_s     = 3600 / line_run_rate_units_per_h                # actual time per unit
# feasible only when cycle_time_s <= takt_time_s
available_h      = scheduled_h - planned_downtime_h                # breaks, changeovers, PM
required_h       = demand_units / line_run_rate_units_per_h
line_util_pct    = required_h / available_h * 100                  # >100% = overloaded
```
Units: lengths mm, weights kg, volumes consistent (mm³ or m³), time seconds for takt/cycle,
hours for capacity. Every numeric stored as NUMERIC with a UoM sibling (see rules).

Sanity-check the ported PLD: PLD captures Ti (`Boxes_Per_Layer`), Hi (`Number_Of_Layers`)
and `Box_Per_Pallet` as *free inputs*. Validate `Box_Per_Pallet == Ti * Hi` and recompute
cube/void server-side; surface a warning on mismatch rather than trusting the typed value.

## (e) Hard rules to obey when building

1. **Reuse `v_inventory_available`** for any stock/availability of films/trays/boxes/components.
   Do NOT create a parallel availability query or materialise a second stock number.
2. **org_id RLS is the law** (Wave0 lock, see MON-multi-tenant-site): every new table has
   `org_id` (NOT tenant_id), RLS via `app.current_org_id()` (NOT raw `current_setting`),
   and `app.current_site_id()` where the data is site-scoped (lines are site-scoped).
3. **NUMERIC + uom sibling**: every dimension/weight/volume/rate is `NUMERIC` with an explicit
   unit-of-measure column (e.g. `case_length` + `case_length_uom`). No floats, no implied units.
4. **No second source of truth**: pack type, components and line links live in their canonical
   tables; tabs read the same rows. Don't duplicate FA/line/spec data into a PLD-only table.
   Line assignment is a join table (`fa_component_lines`), never a comma-delimited string.
5. **Single-writer**: each field/column has exactly one owning module/Server Action that writes
   it (Technical owns spec, Planning owns line eligibility, Finance owns cost). Cross-tab edits
   go through the owner's action; other tabs render read-only. Mirror the FA tab ownership in
   the mapping table above and honour the per-module MON-domain-* skills.
6. **Compute, don't trust typed totals**: derive `cases_per_pallet`, `cube_util_pct`,
   `air_void_pct`, `operators_needed`, `line_util_pct` server-side from the canonical inputs;
   store typed PLD values only as captured-input, and validate against the computed value.
7. **Pack-type gating**: the pack type constrains valid components (thermoform => top+bottom web
   +dieset; tray-seal => tray+top film, NO bottom web; flow-wrap => single film, no tray/web pair).
   Enforce in zod + a DB check/trigger, not only in the UI.
8. Follow MON-t1-schema / MON-t2-api / MON-t3-ui for the layer you touch; prototype parity +
   real Supabase data are the two hard UI gates.
