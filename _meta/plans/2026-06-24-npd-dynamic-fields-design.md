# NPD Dynamic Departments And Fields Design

Date: 2026-06-24

## Ground Truth Read

Current NPD department behavior is split across three hardcoded/data-driven layers:

- `Reference.DeptColumns` is the current per-org metadata source for department fields. It carries `dept_code`, `column_key`, `data_type`/`field_type`, `dropdown_source`, `blocking_rule`, `required_for_done`, and `display_order`.
- FA close/readiness actions still hardcode the seven department codes and closed columns in `apps/web/app/(npd)/fa/actions/get-required-fields-for-dept.ts` and `apps/web/app/(npd)/fa/actions/close-dept-section.ts`.
- Gate checklist generation copies rows from `Reference.GateChecklistTemplates` into `public.gate_checklist_items` during `createProject`. Migration `101-gate-checklist-templates-seed.sql` hardcodes the G4 `Done_<Dept>` rows for Core, Planning, Commercial, Production, Technical, MRP, and Procurement.
- `public.npd_projects` has no department relation today. It stores project lifecycle fields, brief fields, and product linkage, but no department ownership/affiliation.

The proposed migration introduces the future model beside the current runtime. It does not remove `Reference.DeptColumns`, does not update UI/actions, and does not change gate derivation code.

## Data Model

```text
public.organizations
  id
   |
   | 1..n
   v
public.npd_departments
  id
  org_id
  code
  name
  display_order
  active
   |
   | 1..n
   v
public.npd_department_field
  id
  org_id
  department_id
  field_id
  required
  visible
  stage_code
  display_order
   ^
   | n..1
   |
public.npd_field_catalog
  id
  org_id
  code
  label
  data_type
  validation_json
  help_text
  active

public.npd_projects
  id
  org_id
  department_id -> public.npd_departments.id
```

`npd_departments` is the per-org list of departments. One org can keep the default seven departments; another can configure two or ten.

`npd_field_catalog` is the per-org field catalog. A field exists once in the catalog and can be assigned to one or more departments through `npd_department_field`.

`npd_department_field` is the assignment/config table. It stores whether a field is visible, whether it is required for the department fill-in list, which pipeline stage it belongs to, and display order.

`npd_projects.department_id` is a nullable primary-affiliation FK. This is the conservative choice because `npd_projects` has no department relationship today and the owner vision says projects carry a department affiliation, singular. If later workflow needs multi-department project ownership, add a separate `npd_project_departments` link table in a follow-up lane without changing the department/field catalog.

## Mapping Existing Done Rows

Current G4 gate template rows encode department completion as copied checklist text:

```text
Done_Core
Done_Planning
Done_Commercial
Done_Production
Done_Technical
Done_MRP
Done_Procurement
```

In the dynamic model those are not field catalog rows. They become derived gate checklist items from active departments:

```text
npd_departments.code = 'Core'        -> "Done_Core: Core department NPD data closed"
npd_departments.code = 'Planning'    -> "Done_Planning: Planning department NPD data closed"
...
```

The completion condition is derived from each department assignment:

1. Load active departments for the org.
2. For each department, load visible assigned fields where `required = true`.
3. For the project/product payload, all required field values must be present and non-empty.
4. Department done is true only when all required visible fields pass and the close action records the department closure.

The existing `Closed_<Dept>` columns remain a legacy compatibility signal until the follow-up runtime lane replaces hardcoded close columns with a dynamic closure table or status event model.

## Gate Checklist Derivation Algorithm

Future checklist generation should stop copying hardcoded `Done_<Dept>` template text and derive department rows from config:

1. On project creation, load normal template rows from `Reference.GateChecklistTemplates` excluding legacy `Done_%` department rows.
2. Load active departments from `public.npd_departments` for `app.current_org_id()`.
3. For each active department with at least one visible field assignment, create a G4 required checklist item:
   - `gate_code = 'G4'`
   - `category_code = 'technical'` for Technical, otherwise `business` by default unless a future department category column is added.
   - `item_text = 'Done_' || department.code || ': ' || department.name || ' department NPD data closed'`
   - `required = true`
   - sequence after the static G4 rows, ordered by `npd_departments.display_order`.
4. Store the generated rows in `public.gate_checklist_items` as today so the panel can keep its existing persistence model.
5. Gate/readiness checks use the dynamic field assignments, not the copied text, as the source of truth.

## Backfill Strategy

The migration seeds each existing org using the current hardcoded/default metadata:

- Departments are seeded from current `Reference.DeptColumns.dept_code` where present, excluding `System`.
- If an org has no `Reference.DeptColumns` rows, the migration inserts the default seven departments: Core, Planning, Commercial, Production, Technical, MRP, Procurement.
- The field catalog is seeded from current `Reference.DeptColumns` rows, excluding `System` and `Done_%` rows. This preserves existing org behavior and picks up later additions such as Core extra fields.
- If an org has no `Reference.DeptColumns` rows, the migration inserts a starter catalog matching the Apex default plus current Core extra fields.
- `npd_department_field.required` is copied from `required_for_done`; `visible` defaults true; `display_order` is copied from `display_order`; `stage_code` is mapped conservatively from department code.
- Existing `npd_projects.department_id` remains null. This avoids guessing project affiliation for historical projects.

This keeps existing orgs working without UI changes because current code still reads `Reference.DeptColumns` and `Reference.GateChecklistTemplates`.

## Follow-Up Lanes

- Settings admin UI to manage `npd_departments`, `npd_field_catalog`, and `npd_department_field`.
- Pipeline and FA forms read dynamic config instead of hardcoded department arrays and `Reference.DeptColumns`.
- Gate auto-derivation from dynamic department config, including replacement of hardcoded G4 `Done_<Dept>` rows.
- Dynamic department closure/status model to replace fixed `Closed_<Dept>` and `Done_<Dept>` columns.
- Optional multi-department project affiliation if product requirements expand beyond a single primary department.
