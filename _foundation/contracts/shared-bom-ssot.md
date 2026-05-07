# Shared BOM SSOT — Foundation Skeleton Contract

> **Status:** Wave0 locked skeleton contract (T-049). No DDL, no migrations.
> Source authority: `docs/prd/00-FOUNDATION-PRD.md` §W0-v4.3 (esp. §1, §4, §6) and §10.
> Glossary lock: `_foundation/glossary/domain-terms.md` (T-048) — `shared_bom`, `factory_spec`, `org_id`, `fg_id`/`FG`, `D365 posture`.
>
> **LOCK RULE:** This document defines the canonical entities and fields for the shared
> Bill-of-Materials single-source-of-truth. It does NOT define database tables,
> migrations, or DDL. Downstream Technical-module tasks own implementation.

---

## 1. Purpose and ownership

The **Shared BOM** is the single-source-of-truth (SSOT) representation of a
finished-good's Bill of Materials. It is **org-scoped via `org_id`** and links a
canonical `fg_id` (finished-good identifier per `_foundation/glossary/domain-terms.md`)
to the materials, quantities, and units required to produce one unit.

| Concern                    | Owner                                             | Source decision     |
|----------------------------|---------------------------------------------------|---------------------|
| Skeleton contract          | **Foundation** (this document)                    | §W0-v4.3 §4         |
| Initial `in_review` draft  | **NPD** (NPD Builder output for an FG)            | §W0-v4.3 §4         |
| Factory-use approval       | **Technical** (approves `in_review` → `approved`) | §W0-v4.3 §4–§5      |
| Implementation (DDL/RLS)   | Downstream Technical-module atomic tasks          | §W0-v4.3 §4         |
| D365 mapping (optional)    | D365 adapter — **NEVER source of truth**          | §W0-v4.3 §6         |

Per §W0-v4.3 §6, **D365 is not source of truth** for the shared BOM. D365
identifiers carried on a shared-BOM revision are optional external IDs only;
D365 export does not constitute factory release and **must never** be treated
as the canonical record.

---

## 2. Canonical entities

The contract defines three logical entities. The skeleton names below are the
canonical contract terms; physical table naming is decided by downstream
Technical-module DDL tasks.

### 2.1 `shared_bom`

The aggregate root. One row per `(org_id, fg_id)` pair. Holds organisation
scope and the link to the finished good.

| Field            | Type           | Required | Notes / source                                                                  |
|------------------|----------------|----------|---------------------------------------------------------------------------------|
| `org_id`         | UUID           | YES      | Business-data scope; §W0-v4.3 §1; glossary `org_id`. NOT `tenant_id`.           |
| `fg_id`          | UUID           | YES      | Canonical finished-good identifier; glossary `FG / finished_good`; ADR-034.     |
| `source_module`  | string         | YES      | Origin of the SSOT entry (e.g. `01-NPD`, `03-TECHNICAL`); §W0-v4.3 §4.          |
| `created_at`     | timestamptz    | YES      | Event-ordering field per §10 AI/Trace-ready schema convention.                  |

### 2.2 `shared_bom_revision`

Versioned content of a shared BOM. Each revision belongs to exactly one
`shared_bom` and represents one approval-cycle snapshot.

| Field                  | Type     | Required | Notes / source                                                                                                       |
|------------------------|----------|----------|----------------------------------------------------------------------------------------------------------------------|
| `org_id`               | UUID     | YES      | Repeated for RLS clarity; §W0-v4.3 §1.                                                                               |
| `fg_id`                | UUID     | YES      | Repeated for cross-revision lookups; glossary `FG / finished_good`.                                                  |
| `revision`             | integer  | YES      | Monotonic per `(org_id, fg_id)`, ≥ 1.                                                                                |
| `status`               | enum     | YES      | One of `draft`, `in_review`, `approved`, `superseded`. NPD Builder initial output is `in_review` (§W0-v4.3 §4).       |
| `factory_spec_id`      | UUID     | NO       | Optional link to the Technical `factory_spec` artefact (glossary `factory_spec`).                                    |
| `effective_from`       | date     | YES      | First date this revision is valid for production planning.                                                           |
| `effective_to`         | date     | NO       | Optional close date when superseded.                                                                                 |
| `allergens_carry_forward` | bool  | YES      | Carry-forward flag for allergens propagation downstream (Phase D §10 carry-forward, glossary alignment).             |
| `source_module`        | string   | YES      | Module that authored this revision; §W0-v4.3 §4 ownership.                                                           |
| `d365_external_ids`    | object   | NO       | Optional D365 mapping (see §3). **Optional only — D365 is never source of truth (§W0-v4.3 §6).**                     |
| `lines`                | array    | YES      | Array of `shared_bom_line` (see §2.3).                                                                               |

#### Status enum lifecycle

```
draft           initial editable scratch state (NPD Builder pre-submit)
   |
   v
in_review       NPD Builder submitted output awaiting Technical review (§W0-v4.3 §4)
   |
   v
approved        Technical has approved factory-use (§W0-v4.3 §5)
   |
   v
superseded      a newer revision has been approved or the BOM was retired
```

### 2.3 `shared_bom_line`

One row per material in a revision.

| Field            | Type     | Required | Notes                                                                |
|------------------|----------|----------|----------------------------------------------------------------------|
| `material_id`    | UUID     | YES      | Material identifier (canonical material catalogue, downstream).      |
| `qty`            | number   | YES      | Quantity per finished-good unit; positive number.                    |
| `uom`            | string   | YES      | Unit of measure (e.g. `kg`, `g`, `ea`, `L`).                         |
| `effective_from` | date     | YES      | Per-line effective date (line-level overrides revision).             |
| `effective_to`   | date     | NO       | Optional per-line close date.                                        |
| `notes`          | string   | NO       | Free-text annotation.                                                |

---

## 3. D365 external IDs (optional)

The optional `d365_external_ids` object on `shared_bom_revision` allows the
D365 adapter to record D365 mappings WITHOUT making D365 canonical. Per
§W0-v4.3 §6, **D365 is never source of truth** and these fields must remain
optional in every consumer schema.

| Subfield     | Type                | Notes                                              |
|--------------|---------------------|----------------------------------------------------|
| `bom_id`     | string \| null      | D365 BOM RecId (nullable). External integration key only. |
| `version_id` | string \| null      | D365 BOM version RecId (nullable).                 |

**Red lines:**
- D365 export does NOT constitute factory release.
- D365 must NOT be relied on for `status` transitions, allergen carry-forward, or factory-use approval.
- D365 IDs are **never** required for a valid shared-BOM revision.

---

## 4. Validation examples

### 4.1 Valid instance (passes the JSON schema)

```json
{
  "org_id": "11111111-1111-1111-1111-111111111111",
  "fg_id":  "22222222-2222-2222-2222-222222222222",
  "revision": 1,
  "status": "in_review",
  "factory_spec_id": "33333333-3333-3333-3333-333333333333",
  "effective_from": "2026-06-01",
  "allergens_carry_forward": true,
  "source_module": "01-NPD",
  "d365_external_ids": { "bom_id": null, "version_id": null },
  "lines": [
    {
      "material_id": "44444444-4444-4444-4444-444444444444",
      "qty": 0.500,
      "uom": "kg",
      "effective_from": "2026-06-01"
    },
    {
      "material_id": "55555555-5555-5555-5555-555555555555",
      "qty": 2,
      "uom": "ea",
      "effective_from": "2026-06-01"
    }
  ]
}
```

### 4.2 Invalid instance (rejected — missing required `org_id`)

```json
{
  "fg_id":  "22222222-2222-2222-2222-222222222222",
  "revision": 1,
  "status": "in_review",
  "lines": [
    { "material_id": "44444444-4444-4444-4444-444444444444",
      "qty": 0.5, "uom": "kg", "effective_from": "2026-06-01" }
  ]
}
```

This instance must fail validation because `org_id` is missing — the contract
mandates `org_id` for every shared-BOM revision (§W0-v4.3 §1).

---

## 5. Consumer responsibilities

| Consumer            | Responsibility                                                                                                       |
|---------------------|----------------------------------------------------------------------------------------------------------------------|
| **01-NPD**          | Creates initial `shared_bom_revision` with `status=in_review` after NPD Builder produces an FG output (§W0-v4.3 §4). |
| **03-TECHNICAL**    | Owns approval transition `in_review → approved`; owns `factory_spec` link; emits factory-use unlock (§W0-v4.3 §4–§5). |
| **08-PLANNING**     | Reads only `approved` revisions for production planning; respects `effective_from` / `effective_to`.                  |
| **D365 adapter**    | Maps optional `d365_external_ids` only; never source of truth; never gates approval (§W0-v4.3 §6).                    |
| **Quality**         | Reads `allergens_carry_forward` flag for downstream NCR/allergen rules.                                              |

---

## 6. Cross-references

- PRD §W0-v4.3 §1 — `org_id` business scope (NOT `tenant_id`).
- PRD §W0-v4.3 §4 — Foundation owns SSOT skeleton; NPD creates `in_review`; Technical approves.
- PRD §W0-v4.3 §6 — D365 posture: optional, **never source of truth**.
- PRD §10 — event/AI-ready schema fields; `fg.*` event prefix is canonical.
- Glossary `_foundation/glossary/domain-terms.md` — locked definitions of `shared_bom`, `factory_spec`, `org_id`, `FG / finished_good`, `D365 posture`.
- JSON schema: `_foundation/contracts/shared-bom-ssot.schema.json` (this directory).
