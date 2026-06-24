# Technical — item master, BOM, allergens, specs (module guide)

> Per-module deep guide. Every claim below is anchored to a real file under
> `apps/web/…`; nothing is invented. Technical is **module 03** (`03-technical`
> in `.claude/skills/MON-project-overview/SKILL.md`) — the factory-specification
> authority. It owns the **item master**, the **shared BOM SSOT**
> (`bom_headers/lines/co_products`), **allergens** (per-item profiles +
> contamination matrix + cascade), **nutrition**, **supplier specs**, **shelf
> life**, **routings**, **cost-per-kg** (dual-owned with Finance) and the
> **factory-spec release bundle**.
>
> The screens live under `/technical/*`
> (`apps/web/app/[locale]/(app)/(modules)/technical/`); routes are written
> without the `[locale]` prefix. Server actions live in per-feature
> `_actions/` (and a couple of `actions/`) folders. Last reviewed against the
> working tree (mig 267 pack-hierarchy, factory-spec release bundle T-080/T-081).

---

## a. Overview

Technical is where a product is **specified** before anything is planned, bought
or made. A technologist creates an **item** (raw material, ingredient,
intermediate, finished good, co-product, by-product or packaging) carrying its
UoM pack hierarchy, weight mode, shelf life and commercial attributes; declares
its **allergen profile** and **nutrition**; attaches and approves a **supplier
spec** so the item is usable in production; builds a **BOM** (header + component
lines + co-products) and walks it through a server-enforced version machine
(`draft → in_review → technical_approved → active`, superseding the prior active
version atomically); authors a **routing** (manufacturing operations on lines /
machines); maintains the item's **cost-per-kg** history; and finally bundles a
BOM + a **factory_spec** through an **e-signed release** that makes the recipe
usable on the factory floor.

The two hard invariants the whole module turns on: a **released/approved record
is immutable** — edits clone-on-write a new version, never mutate in place (BOM
`BOM_LINE_EDITABLE_STATUSES`, factory-spec `guardBusinessFieldEdit`); and every
BOM component must pass the canonical **RM-usability** chain (active item +
approved, in-date supplier spec + no forbidden allergen for the target FG) before
a BOM can be created, a line added, or a version approved.

Key action homes: items master `technical/items/_actions/*`; BOM
`technical/bom/_actions/*`; allergens `lib/technical/allergens/*` (driven by
`technical/items/[item_code]/_actions/allergen-profile.ts` and
`technical/allergens-config/_actions/*`); supplier specs
`technical/items/_actions/supplier-spec-actions.ts`; nutrition
`technical/items/[item_code]/_actions/upsert-nutrition.ts`; routings
`technical/routings/_actions/*`; cost `technical/cost/_actions/*`; factory specs
`technical/factory-specs/actions/*` + `actions/technical/release-bundles/*` (the
e-signed bundle).

---

## b. Function inventory

> Reads/writes name the Postgres tables touched. "Gate" is the permission checked
> server-side **inside** the action (a missing permission returns
> `{ ok:false, error:'forbidden' }`, never a 500). The whole `technical.*` family
> is seeded to the org-admin role by migration 154; readers below have no
> dedicated read perm and rely on RLS only. Every write also lands an
> `audit_log` / `audit_events` row.

### Item master — `technical/items/_actions/*`

| Action (file) | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `createItem(input)` (`create-item.ts`) | Insert one item (`status` default `active`); validates pack hierarchy + GS1 GTIN + canonical UoM in zod (mirrors mig 153/267 CHECKs). Optionally writes an initial cost-per-kg via the shared ledger. | writes `items`, `item_cost_history` (when `costPerKg` given), `audit_log` (`item.created`) | `technical.items.create` | `deactivateItem` (→ blocked) / `transitionItemStatus` |
| `updateItem(input)` (`update-item.ts`) | Amend descriptive + commercial attributes (`item_code` is immutable — the org natural key). Cost is **never** written here even if supplied. | writes `items`, `audit_log` (`item.updated`) | `technical.items.edit` | Edit again (audited each time) |
| `transitionItemStatus({id,toStatus})` (`transition-item-status.ts`) | Move an item along `draft→active` / `active→deprecated` / `deprecated→active`. **Activation gate:** `draft→active` requires a canonical `uom_base` (rejects legacy `eac` free text). Idempotent. | writes `items`, `audit_log` (`item.status_transitioned`) | `technical.items.edit` | Reverse via the opposite transition (deprecate/reactivate); never back to `draft` |
| `deactivateItem({id,reason?,notes?})` (`deactivate-item.ts`) | "Deactivate" = set `status='blocked'` (no soft-delete column). Reason + notes captured in audit only (TEC-081). Idempotent. | writes `items`, `audit_log` (`item.deactivated`) | `technical.items.deactivate` | No un-block action; raise/clone a fresh item |
| `setShelfLifeOverride({id,...,reason})` (`shelf-life/_actions/set-shelf-life-override.ts`) | Override an **FG's** shelf-life preset (`shelf_life_days`/`mode`/`date_code_format`); mandatory reason → audit. Refuses non-FG. | writes `items`, `audit_log` (`item.shelf_life_overridden`) | `technical.items.edit` | Override again (each audited) |
| `previewItemsImport(scope,csv)` / `commitItemsImport(rows)` (`items/import/_actions/*`) | CSV bulk item import — dry-run preview (per-row validation), then commit creating items. | reads `items`; writes `items`, `audit_log` | `technical.items.create` | Deactivate each created item individually |
| `listItems` / `getItem` (`list-items.ts`, `get-item.ts`) | Item list (joins allergen names, BOM count, D365 sync status) + single-item detail. | reads `items`, `item_allergen_profiles`, `bom_headers`, … | RLS-scoped read | — (read) |

### Supplier specs — `technical/items/_actions/supplier-spec-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `createItemSupplierSpec({itemCode,supplierId,...,approveNow})` | Attach a supplier spec to an existing item and (default `approveNow=true`) write the **approved + active** state that clears the BOM `SUPPLIER_NOT_APPROVED` / `SUPPLIER_SPEC_NOT_ACTIVE` gates. Idempotent upsert on the mig-162 partial-unique `(org_id,item_id,supplier_code) where active+approved`; resolves the supplier master **code** from `supplierId`. `approveNow=false` lands pending/draft (warnings honestly remain). | reads `items`, `suppliers`; writes `supplier_specs`, `audit_log` (`item.supplier_spec.created`/`.updated`) | `technical.items.edit` | Re-run with new dates (refresh) / attach a superseding row |
| `listItemSupplierSpecs(itemCode)` | Re-exports the item-detail supplier-specs loader (single import surface). | reads `supplier_specs`, `suppliers` | RLS-scoped read | — (read) |

### Nutrition — `technical/items/[item_code]/_actions/upsert-nutrition.ts`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `upsertNutrition({itemCode,nutrition,allergensInherited})` | Per-100 g nutrition (energy/fat/saturates/carbs/sugars/protein/salt as decimal strings) + EU-14 inherited allergen codes for an `rm`/`ingredient`/`intermediate`. Upsert keyed `(org_id,rm_code)`. Refuses other item types. | reads/writes `"Reference"."RawMaterials"`, reads `items`; writes `audit_log` (`item.nutrition_upserted`) | `technical.items.edit` | Upsert again (before-state audited) |
| `getItemNutrition(itemCode)` | Read the stored nutrition + inherited allergens. | reads `"Reference"."RawMaterials"` | RLS-scoped read | — (read) |

### Allergens — `technical/items/[item_code]/_actions/allergen-profile.ts` (+ `lib/technical/allergens/service.ts`)

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `loadAllergenProfileEditor(itemCode)` | Editor read model: profile badges, EU-14 + org-custom reference list, append-only override history, caller's edit capability. | reads `items`, `item_allergen_profiles`, `"Reference"."Allergens"`, `item_allergen_profile_overrides` | RLS-scoped read | — (read) |
| `saveAllergenOverride({itemCode,allergenCode,intensity,confidence,reason})` → `upsertProfile(source='manual_override')` | Manual override of one allergen. V-TEC-40 (code must exist), V-TEC-42 (reason mandatory). Appends an **immutable** `item_allergen_profile_overrides` ledger row; **never clears the cascade source**. Refuses packaging items. | writes `item_allergen_profiles`, `item_allergen_profile_overrides`, `audit_log` (`allergen.override`) | `technical.allergens.edit` | `clearAllergenOverride` |
| `clearAllergenOverride({itemCode,allergenCode})` → `deleteProfile` | Remove a manual override row; appends a `clear` ledger row capturing actor + ts. | writes/deletes `item_allergen_profiles`, `item_allergen_profile_overrides`, `audit_log` (`allergen.delete`) | `technical.allergens.edit` | Re-set via `saveAllergenOverride` |
| `saveRiskCell` / `removeRiskCell` (`allergens-config/_actions/load-config.ts` → `lib/technical/allergens/contamination.ts`) | Contamination-risk matrix cell upsert/delete (line × allergen, risk level + mitigation). | writes contamination-risk tables, `audit_log` | `technical.allergens.edit` | The opposite (save/remove) |
| `saveMfgOpAddition` / `removeMfgOpAddition` (same file → `manufacturing-op.ts`) | Per-manufacturing-operation allergen addition (what an op introduces) used by the cascade. | writes mfg-op-allergen tables, `audit_log` | `technical.allergens.edit` | The opposite (save/remove) |
| `loadAllergensConfig` / `loadAllergenMatrix` / `loadAllergenCascade` / `loadAllOverrides` (`allergens-config/*`, `allergens/cascade/*`, `allergens/overrides/*`) | Read models: config grid, full org allergen matrix, the multi-level **cascade** derivation (formulation → product allergens), and the org-wide override ledger. **Cascade engine (T-024) is the only writer of `source='cascaded'` rows** — these readers do not write. | reads allergen profile / reference / cascade tables | RLS-scoped read (any `technical.*` perm) | — (read) |

### Shared BOM SSOT — `technical/bom/_actions/*`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `createBomDraft(input)` (`create-draft.ts`) | Create a **new** BOM version in `draft` (header + lines + co-products, atomic). Runs V-TEC-13 (self-ref + cycle over the ACTIVE graph), V-TEC-12 (non-byproduct allocation Σ = 100), V-TEC-14 (every component passes RM usability); V-TEC-11 is an advisory `warning`. `version = max+1` per product. Auto-mints the `public.product` aggregate from an active FG when missing. | reads `product`, `items`, `bom_headers`, `bom_lines`, `supplier_specs`, `item_allergen_profiles`, `nutrition_allergens`; writes `product`, `bom_headers`, `bom_lines`, `bom_co_products`, `audit_log` (`bom.created`), `outbox_events` (`bom.version_submitted`) | `technical.bom.create` | `deleteBomVersion` (draft only) |
| `addBomLine(input)` (`line-actions.ts`) | **Append** one component line to an editable (`draft`/`in_review`) version IN PLACE (no version fork — fixes F-B01). Same V-TEC-13/14 chain; `line_no = max+1` with a single-retry savepoint on the unique collision. | writes `bom_lines`, `audit_log` (`bom.line_added`) | `technical.bom.create` | `deleteBomLine` |
| `updateBomLine(input)` (`line-actions.ts`) | Mutate qty / uom / notes of one line on a `draft`/`in_review` version. Released statuses refuse with `bom_not_editable`. | writes `bom_lines`, `audit_log` (`bom.line_updated`) | `technical.bom.create` | Edit again, or delete |
| `deleteBomLine(input)` (`line-actions.ts`) | Delete one line on a `draft`/`in_review` version and renumber the rest into a dense `1..N`. | writes/deletes `bom_lines`, `audit_log` (`bom.line_deleted`) | `technical.bom.create` | `addBomLine` |
| `approveBom({productId,version})` (`workflow.ts`) | `draft|in_review → technical_approved`; **re-validates** cycle-freeness + RM usability (`factory_spec_approval` context) at approve time; stamps `approved_by/at`. | writes `bom_headers`, `audit_log` (`bom.approve`) | `technical.bom.approve` | Re-publish a prior version; no "unapprove" action |
| `publishBom({productId,version})` (`workflow.ts`) | V-TEC-10: `technical_approved → active`; **supersedes** the prior active version for that product in the **same txn**. | writes `bom_headers` (activate + supersede), `audit_log` (`bom.publish`), `outbox_events` (`fg.bom.released`) | `technical.bom.version_publish` | "Rollback" = re-run `publishBom` on the prior version |
| `deleteBomVersion({productId,version})` (`delete-bom-version.ts`) | Hard-delete a **draft-only** version. Refuses if it is the **only** version (`only_version`) or referenced by any `bom_snapshots` (`snapshot_referenced`). | writes/deletes `bom_headers` (+ cascade lines), `audit_events` (`bom.version_deleted`) | `technical.bom.create` | This is a delete — recreate via `createBomDraft` |
| `diff`, `queries`, `detail-page`, `history`, `recipe`, `generate-batch`, `disassembly` (other `_actions/*`) | BOM diff between versions, list/detail readers, version history, recipe view, batch-generator job + disassembly BOM authoring (separate `createDisassemblyBomDraft`). | reads `bom_*`; generator writes `bom_generator_jobs` | RLS read / `technical.bom.create` / `technical.bom.generate_batch` | per-feature |

### Routings — `technical/routings/_actions/*`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `createRouting(input)` (`create-routing.ts`) | Create a routing in `draft` with its operations (atomic). Validates V-TEC-60 (op_no contiguous from 1), V-TEC-61 (each op has line_id OR machine_id), V-TEC-62 (run-time > 0 for production ops), V-TEC-63 (`manufacturing_operation_name` ∈ `"Reference"."ManufacturingOperations"`). `version = max+1` per item. | reads `items`, `routings`, `"Reference"."ManufacturingOperations"`; writes `routings`, `routing_operations`, `audit_log` (`routing.created`) | `technical.bom.create` (no dedicated routing perm — Wave0 enum-lock) | Clone a new version (drafts never deleted) |
| `updateRouting({routingId,operations})` (`update-routing.ts`) | Replace the **draft** routing's operation set atomically (delete + re-insert), re-running V-TEC-60..63. Non-draft → `invalid_state` (clone-on-write a new version). | writes `routing_operations`, `audit_log` (`routing.operations_replaced`) | `technical.bom.create` | Edit again while draft |
| `approveRouting({routingId})` (`approve-routing.ts`) | `draft → approved` (stamps `approved_by/at`). | writes `routings`, `audit_log` (`routing.approved`) | `technical.bom.approve` | No "unapprove"; clone a new version |
| `publishRouting({routingId})` (`approve-routing.ts`) | `approved → active`, **superseding** the item's incumbent active routing (`status='superseded'`, `effective_to=today`) in the same txn (item keeps 0-or-1 active routing). | writes `routings`, `audit_log` (`routing.published`) | `technical.bom.approve` | Re-publish another version |
| `listRoutings` / `costPreview` (`list-routings.ts`, `cost-preview.ts`) | Routing list per item; SQL-summed labour cost preview (NUMERIC-exact). | reads `routings`, `routing_operations` | RLS-scoped read | — (read) |

### Cost-per-kg (dual-owned with Finance) — `technical/cost/_actions/*`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `postCost(input)` (`post-cost.ts` → `write-cost-ledger.ts`) | Post a new cost roll: V-TEC-51 (`effective_from ≤ today`), V-TEC-53 (>20 % delta on `manual`/`supplier_update` needs an approver → `approver_required`), close the prior active row, insert the new history row, **denormalize** `items.cost_per_kg`. Technical writes ONLY `items.cost_per_kg` + `item_cost_history` (never Finance tables). | writes `item_cost_history`, `items.cost_per_kg`, `audit_log` | `technical.cost.edit` | Post a superseding cost row |
| `listCostItems` / `listCostHistory` / `listRecipeCost` (read `_actions/*`) | Cost item list, per-item history, recipe rolled-up cost. | reads `item_cost_history`, `items`, `bom_*` | RLS-scoped read | — (read) |

### Factory-spec release bundle — `technical/factory-specs/actions/*` + `actions/technical/release-bundles/*`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `createFactorySpec({fgItemId,specCode,notes?})` (`actions/create-factory-spec.ts`) | Create a factory_spec in `draft` anchored to an **FG** item; `version = max+1` per FG. | reads `items`, `factory_specs`; writes `factory_specs`, `audit_events` (`factory_spec.created`) | `technical.product_spec.approve` **or** `technical.factory_spec.approve` (either) | Recall (later) |
| `submitFactorySpecForReview({specId})` (`actions/factory-spec-flow.ts`) | `draft → in_review` (guarded by `guardStatusTransition`). | writes `factory_specs`, `audit_events` (`factory_spec.submitted_for_review`) | `technical.product_spec.approve`/`.factory_spec.approve` | Bundle reject / recall |
| `linkFactorySpecBom({specId,bomHeaderId})` (`actions/factory-spec-flow.ts`) | Pair a BOM (matching the spec's FG `product_id`) to a `draft`/`in_review` spec; refuses on product mismatch / immutable spec. | reads `bom_headers`; writes `factory_specs` (`bom_header_id`,`bom_version`), `audit_events` (`factory_spec.bom_linked`) | `technical.product_spec.approve`/`.factory_spec.approve` | Re-link while editable |
| `approveReleaseBundleAction(input)` (`actions/technical/release-bundles/approve-bundle.ts` → `lib/technical/release-bundle-service.ts`) | **E-signed** atomic bundle approval: `factory_spec in_review → approved_for_factory` + the paired BOM `draft/in_review → technical_approved` (or keep `active`) in ONE txn. Verifies FG↔BOM-product match, RM usability, and a PIN e-sign (CFR 21 Part 11) whose signature id anchors the evidence bundle. Emits `technical.factory_spec.approved`. | reads `factory_specs`, `bom_headers`, `bom_lines`, `items`; writes `factory_specs`, `bom_headers`, `outbox_events` (`technical.factory_spec.approved`), e-sign + audit tables | `technical.factory_spec.approve` (via `FACTORY_SPEC_APPROVE_PERMISSION`) + valid PIN | `rejectReleaseBundleAction` / `recallFactorySpec` |
| `rejectReleaseBundleAction(input)` (`actions/technical/release-bundles/reject-bundle.ts`) | Atomic bundle rejection — **neither** side is released; spec stays draft/in_review (no `technical.factory_spec.approved` emitted). | writes `factory_specs`/audit | `technical.factory_spec.approve` | Re-submit / re-approve |
| `recallFactorySpec({specId,reason?})` (`_actions/recall-spec.ts`) | `released_to_factory → draft` (clears approval + release stamps) so the spec can be re-edited. **Blocked** while any `released`/`in_progress` work order references it (`active_factory_spec_id`). | reads `factory_specs`, `work_orders`; writes `factory_specs`, `audit_events` (`technical.factory_spec.recalled`) | `technical.factory_spec.recall` | Re-approve via the bundle |
| `loadBundle` / `listFactorySpecs` (`_actions/bundle-data.ts`, `_actions/list-factory-specs.ts`) | Bundle preflight read (blockers: RBAC, release-guard, BOM status, RM usability, D365-info; approval history from audit) + factory-spec list. | reads `factory_specs`, `bom_headers`, `bom_lines`, `items`, `feature_flags_core`, `audit_log` | RLS-scoped read | — (read) |

**Action count inventoried: ~37 write/transition actions** across item master (7), supplier specs (1 write), nutrition (1 write), allergens (5 write services), BOM (7), routings (4), cost (1), factory-spec/bundle (6), plus the read helpers listed inline. The "core" surface a user drives day-to-day is: `createItem`, `createItemSupplierSpec`, the allergen overrides, `createBomDraft` + line actions + `approveBom`/`publishBom`, and the factory-spec bundle.

---

## c. State machines

### BOM version lifecycle (`BOM_STATUSES`, `shared.ts:63`; transitions in `workflow.ts`)

```
 draft ──► in_review ──► technical_approved ──► active ──► superseded ──► archived
   │           │                                  │ (publish supersedes the prior active)
   └───────────┴── editable (lines add/edit/delete, deleteBomVersion[draft-only])
```

| State | Legal next | Who writes it | Notes |
|---|---|---|---|
| `draft` | `in_review`, `technical_approved` (via approve), deleted (draft-only) | `createBomDraft` | **Editable** — `addBomLine`/`updateBomLine`/`deleteBomLine` require `draft`\|`in_review` (`BOM_LINE_EDITABLE_STATUSES`). Deletable while it is not the only version and no snapshot references it. |
| `in_review` | `technical_approved` | reviewer | Still editable (same set). |
| `technical_approved` | `active` (publish) | `approveBom` | Immutable content; re-validated at approve time (V-TEC-13/14). |
| `active` | `superseded` | `publishBom` | Exactly one active per product; publish flips the prior active → `superseded` atomically. |
| `superseded` / `archived` | terminal | `publishBom` / lifecycle | Clone-on-write only; line actions refuse with `bom_not_editable`. |

Enforced **twice**: line actions hard-require an editable status, and `publishBom`
gates V-TEC-10 (must be `technical_approved`). There is no "unapprove" — a
rollback is re-running `publishBom` on a prior version (`workflow.ts:17-22`).

### Item lifecycle (`ITEM_STATUSES`, `items/_actions/shared.ts:36`)

```
 draft ──► active ⇄ deprecated
   (activation gate: canonical uom_base)        any ──► blocked  (deactivateItem, terminal-ish)
```

| State | Legal next | Writer | Notes |
|---|---|---|---|
| `draft` | `active` | `transitionItemStatus` | `draft→active` requires a **canonical** `uom_base` (`activation_gate_failed` otherwise). |
| `active` | `deprecated`, `blocked` | `transitionItemStatus` / `deactivateItem` | — |
| `deprecated` | `active` | `transitionItemStatus` | Reactivate. |
| `blocked` | — | `deactivateItem` | "Deactivate"; idempotent; no un-block action. Nothing ever returns to `draft`. |

### Factory-spec lifecycle (`ALLOWED_TRANSITIONS`, `factory-spec-release-guards.ts:53-60`)

```
 draft ⇄ in_review ──► approved_for_factory ──► released_to_factory ──► superseded ──► archived
                                  └──────────────► superseded / archived
 (approved_for_factory & released_to_factory are factory-usable = IMMUTABLE → clone-on-write)
```

`createFactorySpec`→`draft`; `submitFactorySpecForReview`→`in_review`;
`linkFactorySpecBom` pairs a BOM; **`approveReleaseBundleAction`** (e-signed)
moves `in_review → approved_for_factory` and approves the BOM in the same txn;
`recallFactorySpec` reverses `released_to_factory → draft` unless a live WO
references the spec.

### Routing lifecycle (`ROUTING_STATUSES`, `routings/_actions/shared.ts:35`)

```
 draft ──► approved ──► active ──► superseded
   └── editable (updateRouting replaces ops; non-draft is immutable)
```

`createRouting`→`draft`; `approveRouting`→`approved`; `publishRouting`→`active`
(supersedes the item's incumbent active routing); each item keeps 0-or-1 active
routing.

<!-- screenshot: technical/items list (item-type tabs + Create item) -->
<!-- screenshot: technical/bom/[itemCode] BOM detail (version + lines + approve/publish) -->
<!-- screenshot: technical/factory-specs release-bundle review modal (e-sign) -->

---

## d. User how-tos

> Button labels are i18n keys (`Technical.*` bundles). The literal English copy
> comes from those bundles; the action names in parentheses are the server entry
> points.

### (i) Create an item

1. Go to **Technical → Items** (`/technical/items`).
2. Click **Create item**. In the modal set:
   - **Item code** (alphanumeric + `. _ -`, ≤64; immutable after create) and **Name**.
   - **Item type** — `rm` / `ingredient` / `intermediate` / `fg` / `co_product` / `byproduct` / `packaging`.
   - **Base UoM** — picked from the **closed** canonical list (`kg/g/l/ml/szt`), never free text; optional secondary UoM.
   - **Weight mode** (`fixed`/`catch`) + nominal/tare/gross-max as needed.
   - **Pack hierarchy** — `output_uom` (`base`/`each`/`box`); `each` ⇒ net-qty-per-each > 0; `box` ⇒ also each-per-box > 0.
   - Optional GS1 GTIN (8/12/13/14 digits), shelf life, list price, and an initial **cost-per-kg** (written through the cost ledger).
3. **Save** → `createItem`. The item lands `active` by default (or `draft` for import/NPD handoffs).
4. A `draft` item is promoted with the **Activate** action (`transitionItemStatus`) — which enforces the canonical-UoM activation gate.

### (ii) Set allergens / nutrition

1. Open the item (`/technical/items/[item_code]`) → **Allergens** tab.
2. The grid shows EU-14 + org-custom allergens; cascaded badges (`source='cascaded'`) are **read-only** (the cascade engine owns them).
3. To add/override one: pick intensity + confidence, enter a **mandatory reason** → **Save** (`saveAllergenOverride`). This appends an immutable override-history row and never clears the cascade source. Remove with `clearAllergenOverride`.
4. **Nutrition** tab (rm/ingredient/intermediate only): enter the per-100 g values + inherited allergen codes → **Save** (`upsertNutrition`).
5. Contamination matrix + per-op allergen additions are maintained under **Technical → Allergens config** (`saveRiskCell` / `saveMfgOpAddition`), feeding the cascade.

### (iii) Attach and approve a supplier spec

1. Open the item → **Supplier specs** tab.
2. **Add supplier spec**: pick a **supplier** (real `suppliers` master), set spec version + issued / effective-from / expiry dates.
3. Leave **Approve now** ON (default) → `createItemSupplierSpec` writes `supplier_status='approved'`, `lifecycle_status='active'`, `review_status='approved'`. This is exactly the shape the BOM RM-usability gates read, so the item's `SUPPLIER_NOT_APPROVED` / `SUPPLIER_SPEC_NOT_ACTIVE` warnings clear on refresh.
4. Approve-now is an idempotent upsert on the active+approved partial-unique index — re-attaching the same supplier refreshes the in-date window rather than duplicating.

### (iv) Build a BOM and add lines

1. Go to **Technical → BOM** (`/technical/bom`) → open the FG (`/technical/bom/[itemCode]`).
2. **New version** → the create form. Add **component lines** (item picker → qty > 0, UoM, scrap %, optional manufacturing-operation name); set **co-products** with allocation %; the parent + non-byproduct co-product allocations must sum to **100** (V-TEC-12).
3. **Save** → `createBomDraft`. It runs V-TEC-13 (cycle/self-ref), V-TEC-12, V-TEC-14 (every component passes RM usability) and returns any V-TEC-11 advisory **warnings**. The version is created as `draft`, `version = max+1`.
4. On a `draft`/`in_review` version, add more components with **Add component** (`addBomLine` — appends in place, no fork), or **Edit** / **Delete** a row (`updateBomLine` / `deleteBomLine`). Released versions show these disabled and the server refuses with `bom_not_editable`.

### (v) Version, approve and publish a BOM

1. Open the BOM version. **Submit for review** moves `draft → in_review` (optional intermediate).
2. **Approve** → `approveBom` (`technical.bom.approve`): re-validates cycle-freeness + RM usability in the `factory_spec_approval` context, stamps `approved_by/at`, status → `technical_approved`.
3. **Publish** → `publishBom` (`technical.bom.version_publish`): V-TEC-10 requires `technical_approved`; status → `active` and the prior active version flips to `superseded` in the same transaction. Emits `fg.bom.released`.
4. To **iterate**, create a NEW draft version (clone-on-write) — you never edit an approved/active version in place. To **roll back**, re-publish a prior version. A mistaken **draft** can be hard-deleted with `deleteBomVersion` (unless it is the only version or a snapshot references it).

### (vi) Author a routing

1. From the item, open **Routings** → **New routing**.
2. Add operations: contiguous `op_no` from 1 (V-TEC-60), each binds a **line or machine** (V-TEC-61), production ops carry run-time > 0 (V-TEC-62), and `manufacturing_operation_name` must exist in the org's manufacturing-operations reference (V-TEC-63).
3. **Save** (`createRouting`, status `draft`) → **Approve** (`approveRouting`) → **Publish** (`publishRouting`, supersedes the incumbent active routing). Edit a draft's ops with `updateRouting`; a non-draft routing is immutable (clone a new version).

### (vii) Release a factory spec (BOM + spec bundle)

1. **Technical → Factory specs** → **Create** (`createFactorySpec`, anchored to an FG).
2. **Link a BOM** (`linkFactorySpecBom`, must match the FG product) and **Submit for review** (`submitFactorySpecForReview`).
3. Open the **release bundle** review modal. The preflight (`loadBundle`) lists blockers (RBAC, release-guard, BOM status, inactive-component RM usability; D365 shown info-only).
4. Enter your **PIN** and **Approve** → `approveReleaseBundleAction`: the spec moves `in_review → approved_for_factory` and the BOM to `technical_approved`/`active` atomically, anchored by an e-sign signature; emits `technical.factory_spec.approved`. **Reject** (`rejectReleaseBundleAction`) releases neither side.
5. A spec released to the factory can be pulled back with **Recall** (`recallFactorySpec`) — refused while a released/in-progress WO references it.

---

## e. Data sources (Supabase tables)

Item master + attributes:

- `items` — item master (code/type/status, UoM pack hierarchy, weight mode, shelf life, GS1, `cost_per_kg` denorm).
- `item_cost_history` — cost-per-kg ledger (Technical-written; dual-owned with Finance).
- `"Reference"."RawMaterials"` — per-100 g nutrition + inherited allergens (rm/ingredient/intermediate).

Allergens:

- `item_allergen_profiles` — per-(item × allergen) declaration (source/intensity/confidence).
- `item_allergen_profile_overrides` — append-only manual-override ledger.
- `"Reference"."Allergens"` — EU-14 + org-custom allergen reference.
- `nutrition_allergens` — FG free-from / presence (read by RM usability for forbidden-allergen checks).
- contamination-risk + manufacturing-op-allergen tables (cascade inputs).

BOM:

- `bom_headers` — version header (`product_id`, status, version, yield, approval stamps).
- `bom_lines` — component lines (item_id, component_code, qty, uom, scrap, op name, line_no).
- `bom_co_products` — co-product / by-product allocations.
- `bom_snapshots` — WO-time snapshots (written elsewhere; block draft delete when present).
- `bom_generator_jobs` — batch-generator queue.
- `product` — the FG product aggregate (`product_code`) that parents a BOM; auto-minted from an active FG.

Routings:

- `routings` — routing version header (item_id, status, version, effective dates).
- `routing_operations` — op rows (op_no, codes, line/machine, times, cost).
- `"Reference"."ManufacturingOperations"` — V-TEC-63 operation reference.

Supplier specs & factory specs:

- `supplier_specs` — per-(item × supplier) spec (supplier_status / lifecycle_status / review_status, dates) read by RM usability.
- `suppliers` — supplier master (read for code resolution).
- `factory_specs` — the Technical release bundle (fg_item_id, spec_code, version, status, paired bom_header_id/version, approval/release stamps).
- `work_orders` — read by `recallFactorySpec` (`active_factory_spec_id`) to block recall.

Cross-cutting:

- `audit_log` / `audit_events` — every write (`item.*`, `allergen.*`, `bom.*`, `routing.*`, `factory_spec.*`).
- `outbox_events` — `bom.version_submitted`, `fg.bom.released`, `technical.factory_spec.approved` (the only Technical events in the locked enum SoT).
- `feature_flags_core` — `integration.d365.enabled` (bundle preflight, info-only).

---

## f. Known gaps / TODO

Grounded in the code that was read — no guesses:

1. **No dedicated routing permission.** Routings reuse `technical.bom.create` /
   `technical.bom.approve` because the Wave0 enum-lock forbids new permission
   strings (`routings/_actions/shared.ts:21-25`). A user with BOM-write can
   author/approve routings.

2. **No Technical outbox events for items / cost / routings.** `outbox_events.event_type`
   is a locked CHECK + drift gate with no `item.*` / `technical.cost.*` /
   `technical.routing.*` members, so those writes land in `audit_log` only
   (`items/_actions/shared.ts:349-352`, `cost/_actions/shared.ts:154-156`,
   `routings/_actions/shared.ts:232-233`). Downstream consumers can't subscribe
   to item/cost/routing changes via the outbox.

3. **Item "deactivate" is `blocked`, not a soft-delete, and one-way.** The table
   has no soft-delete column, so deactivate sets `status='blocked'`
   (`deactivate-item.ts:7-9`) and there is **no un-block action** — nothing ever
   returns to `draft`. Reason/notes live only in the audit chain (no column).

4. **Nutrition lives in `"Reference"."RawMaterials"`, keyed by `rm_code`, and is
   RM/ingredient/intermediate-only** (`upsert-nutrition.ts:116-118`). FG nutrition
   is not editable from this surface; non-RM types are refused.

5. **`approveBom` has no e-sign**, unlike the factory-spec bundle. BOM approve /
   publish are gated by RBAC + re-validation only (`workflow.ts`), whereas
   `approveReleaseBundleAction` requires a CFR-21-Part-11 PIN e-sign
   (`release-bundle-service.ts:402-424`). The high-stakes signature is at the
   factory-spec bundle, not at BOM publish.

6. **Two factory-spec action homes.** Spec authoring lives in
   `technical/factory-specs/actions/` (not `_actions/`), the bundle approve/reject
   actions live under the top-level `apps/web/actions/technical/release-bundles/`,
   and the recall lives in `technical/factory-specs/_actions/`. The split is
   historical (T-080/T-081); a reader must look in three places for the full spec
   lifecycle.

7. **Factory-spec create/submit accepts either of two approve permissions**
   (`technical.product_spec.approve` OR `technical.factory_spec.approve` —
   `factory-specs/_actions/shared.ts:31-32`, `canApproveFactorySpec`). Whichever
   seed an org carries works, but the dual-string check is a seam to watch if RBAC
   seeding drifts.

8. **`recallFactorySpec` has a `TODO(R4)` on e-sign** (`recall-spec.ts:141`): recall
   currently requires only `technical.factory_spec.recall` + a WO-reference block,
   with a noted follow-up to re-evaluate whether spec recall should be e-signed.

9. **RM-usability and cycle checks read the ACTIVE BOM graph at write time**
   (`create-draft.ts:112-123`, `line-actions.ts:99-111`). They are point-in-time
   server checks, not a DB constraint — concurrent activations could in principle
   race, though `publishBom`'s same-txn supersede narrows the window.

The action count and every gap above is derived from the files cited; no literal
`// TODO` markers exist beyond the recall e-sign one (#8) and the bundle's
follow-up notes.
