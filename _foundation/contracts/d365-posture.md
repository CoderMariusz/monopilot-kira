# D365 Posture Contract — Foundation Skeleton

> **Status:** Wave0 locked skeleton contract (T-051). No adapter code, no migrations.
> Source authority: `docs/prd/00-FOUNDATION-PRD.md` §W0-v4.3 §6, §5 (R8), §11.
> Glossary lock: `_foundation/glossary/domain-terms.md` (T-048) — `D365 posture`, `factory_spec`, `shared_bom`, `org_id`.
> Sibling contract: `_foundation/contracts/shared-bom-ssot.md` (T-049) — `d365_external_ids` shape.
>
> **LOCK RULE:** This document defines the permitted and forbidden integration posture
> for Dynamics 365. It does NOT implement the D365 adapter package, DMF jobs, or
> any D365 API client. Downstream 02-SETTINGS and 03-TECHNICAL module tasks own
> those implementations.

---

## 1. D365 Posture Statement

D365 (Dynamics 365) is an **optional** import/export/integration system for Monopilot.
It is the **never source of truth** for any of the following domain concepts:

| Domain concept       | Authoritative owner in Monopilot         | Source decision  |
|----------------------|------------------------------------------|------------------|
| FG / finished good   | `product` table; `fg.*` events           | §W0-v4.3 §2; T-048 |
| Shared BOM           | `shared_bom` / `shared_bom_revision`     | §W0-v4.3 §4; T-049 |
| `factory_spec`       | Technical module (03-TECHNICAL)          | §W0-v4.3 §4–§5; T-048 |
| Release approval     | Technical factory-use approval workflow  | §W0-v4.3 §5; T-051 |
| Factory usability    | `factory_spec.status = approved`         | §W0-v4.3 §5; T-051 |

> **Canonical rule (per §W0-v4.3 §6):** "D365 is optional import/export/integration
> only and never source of truth for FG, shared BOM, factory_spec, release approval,
> or factory usability. D365 export is not factory release and must not precede
> factory-use approval unless an org policy explicitly enables a non-usable
> preload/export."

D365 integration is a **hard-optional** capability: an `org_id` that has no D365
connection configured must be fully functional. No Monopilot workflow may block
on D365 availability.

---

## 2. Allowed Phase 1 Capabilities

Phase 1 (PRD §W0-v4.3 §9, §5 R8, §11) permits the following D365 integration
capabilities. All capabilities are `org_id`-scoped and gated by the capability
registry entry (see §2.2).

### 2.1 Import / Export Jobs (backend)

Optional background jobs managed by 02-SETTINGS module:

| Job direction | Data domain            | Trigger mode             | Notes                              |
|---------------|------------------------|--------------------------|------------------------------------|
| Pull (inbound) | Items / products      | Nightly + on-demand      | Populates product/material catalogue |
| Pull (inbound) | BOM                   | Nightly + on-demand      | Stored as `draft` `shared_bom_revision` |
| Pull (inbound) | Customers             | Nightly + on-demand      | External data only; no RLS side-effect |
| Pull (inbound) | Suppliers             | Nightly + on-demand      | External data only                 |
| Pull (inbound) | Locations             | Nightly + on-demand      | Warehouse / site reference data    |
| Pull (inbound) | Unit of Measure (UoM) | Nightly + on-demand      | Reference data sync                |
| Push (outbound) | Production confirmation | Near-real-time (policy-enabled) | Requires `push_production_confirmation` sub-capability |
| Push (outbound) | Inventory movements   | Near-real-time (policy-enabled) | Requires `push_inventory` sub-capability |
| Push (outbound) | Shipments             | Near-real-time (policy-enabled) | Requires `push_shipment` sub-capability |
| Push (outbound) | Quality holds         | Near-real-time (policy-enabled) | Requires `push_quality_hold` sub-capability |

Pull jobs produce **external data only**. A pulled BOM revision is stored with
`status = draft` and is NOT factory-usable until Technical approval
(`factory_spec.status = approved`).

Push jobs are **policy-enabled**: each push sub-capability must be explicitly
activated per `org_id` via the capability registry (§2.2) before any data leaves
Monopilot.

### 2.2 Capability Registry Entry

The D365 integration is registered in the 02-SETTINGS capability registry as:

```json
{
  "org_id": "<org UUID>",
  "capability": "d365-adapter",
  "enabled": true,
  "sub_capabilities": {
    "pull": true,
    "push_production_confirmation": false,
    "push_inventory": false,
    "push_shipment": false,
    "push_quality_hold": false
  },
  "config": {
    "environment_url": "https://<tenant>.operations.dynamics.com",
    "data_area_id": "<company>",
    "allow_non_usable_preload_export": false
  }
}
```

- `pull` defaults to `true` when the adapter is enabled.
- All `push_*` sub-capabilities default to `false` and require explicit opt-in per `org_id`.
- `allow_non_usable_preload_export` controls the export timing rule (§4).
- This entry is a **backend configuration record**, not a UI shell setting. The
  capability registry backend jobs enforce the enabled/disabled state at runtime
  (per PRD §W0-v4.3 §9: "backend jobs/capability registry, not just a shell").

---

## 3. Forbidden Uses

The following uses of D365 are **forbidden** at the contract level. Any task,
module, or service that violates these rules is in breach of §W0-v4.3 §6 and
must be rejected at code review.

| Forbidden use                                                                | Reason / source                    |
|------------------------------------------------------------------------------|------------------------------------|
| D365 as source of truth for FG identity, attributes, or lifecycle            | §W0-v4.3 §6; T-048 `D365 posture` row |
| D365 as source of truth for shared BOM (`shared_bom` / `shared_bom_revision`) | §W0-v4.3 §6; T-049; T-048 `shared_bom` row |
| D365 as source of truth for `factory_spec`                                   | §W0-v4.3 §4–§6; T-048 `factory_spec` row |
| D365 export treated as, or substituting for, factory release approval        | §W0-v4.3 §6; §3 of this document  |
| D365 export treated as, or substituting for, factory usability determination  | §W0-v4.3 §5–§6; §4 of this document |
| D365 IDs used as primary keys for any Monopilot entity                       | §W0-v4.3 §1; §5 of this document  |
| Hard dependency on D365 availability for any core Monopilot workflow          | §W0-v4.3 §6; §1 of this document  |
| Use of `tenant_id` instead of `org_id` as business scope in D365 adapter config | §W0-v4.3 §1; T-047; T-048 `org_id` row |
| Implementing D365 adapter code in the Foundation layer                        | T-051 risk red line; implementation belongs to downstream tasks |

---

## 4. Export Timing Rules

D365 export timing is governed by the **factory-use approval** state of the relevant
`factory_spec` / `shared_bom_revision`.

### 4.1 Default rule (no override)

> **No D365 export before Technical factory-use approval.**

An `org_id` operating under default configuration (`allow_non_usable_preload_export = false`)
MUST NOT trigger any D365 push job for production-related data (production confirmations,
BOM revisions, inventory movements) until the associated `factory_spec` has been approved
by Technical (`factory_spec.status = approved`).

This rule prevents D365 export from implying or substituting for the factory-use approval
decision owned by 03-TECHNICAL.

### 4.2 Org-policy override

An `org_id` may set `allow_non_usable_preload_export = true` in its capability registry
entry to enable pre-approval export (e.g. for staging D365 master data during an NPD
parallel-track workflow).

When this override is active, **all** exported records MUST be marked with a
non-usable preload flag. The D365 adapter MUST attach the following metadata to every
exported payload:

```json
{
  "org_id": "<org UUID>",
  "_monopilot_export_meta": {
    "export_class": "non-usable preload, not factory release",
    "factory_use_approved": false,
    "factory_spec_status": "in_review",
    "warning": "This export is a non-usable preload only. It does NOT constitute factory release or Technical factory-use approval."
  }
}
```

The non-usable preload export:
- Is NOT a factory release.
- Is NOT a substitute for `factory_spec.status = approved`.
- MUST be distinguishable from production-release exports in D365 audit logs.
- MUST be revocable / superseded once factory-use approval is obtained.

### 4.3 Summary table

| `allow_non_usable_preload_export` | `factory_spec.status` | D365 export permitted? | Export class tag required        |
|-----------------------------------|-----------------------|------------------------|----------------------------------|
| `false` (default)                 | `in_review`           | NO                     | N/A                              |
| `false` (default)                 | `approved`            | YES                    | None (normal factory-release export) |
| `true` (org override)             | `in_review`           | YES                    | `"non-usable preload, not factory release"` |
| `true` (org override)             | `approved`            | YES                    | None (normal factory-release export) |

---

## 5. External ID Mapping Strategy

D365 external identifiers are stored as **optional** metadata fields on Monopilot
entities. They are never primary keys and never authoritative over Monopilot-native
identifiers.

### 5.1 Field shape

Per T-049 (`shared-bom-ssot.md` §3), the canonical field for D365 external IDs on
`shared_bom_revision` is:

```json
{
  "org_id": "<org UUID>",
  "d365_external_ids": {
    "bom_id": "<D365 BOM RecId> | null",
    "version_id": "<D365 BOM version RecId> | null"
  }
}
```

The same `d365_external_ids` pattern applies to other entities that carry D365
mappings (e.g. product / item-master records):

```json
{
  "org_id": "<org UUID>",
  "d365_external_ids": {
    "item_id": "<D365 Item RecId> | null",
    "data_area_id": "<D365 company data area> | null"
  }
}
```

### 5.2 Rules for external ID fields

1. `d365_external_ids` is **optional** (nullable) on every entity that carries it.
   A missing or null value must never prevent normal Monopilot operations.
2. D365 IDs are **never** used as primary keys, foreign keys, or RLS boundary values.
   The `org_id` UUID remains the sole business-scope key (§W0-v4.3 §1).
3. D365 IDs must be scoped to the correct `org_id` — the adapter must reject any
   payload where the inbound `org_id` does not match the configured `org_id` for
   the capability registry entry.
4. On schema conflict between D365 and Monopilot (e.g. D365 carries a stale BOM
   version), **Monopilot wins**. D365 data is reconciled as an advisory external
   reference, not an override.

---

## 6. Failure / DLQ Expectations

All D365 pull and push jobs route failures to a Dead Letter Queue (DLQ) for
operator visibility and retry.

### 6.1 Failure routing

```
D365 API call
    |
    +-- success --> process / persist (draft / confirmed)
    |
    +-- transient error (5xx, timeout, rate-limit)
    |       |
    |       +--> retry with exponential back-off (mirrors T-008 outbox worker policy)
    |               back-off: 1s, 2s, 4s, 8s, 16s, 32s (max), up to N attempts
    |               after max attempts --> DLQ
    |
    +-- permanent error (4xx auth/config, schema mismatch)
            |
            +--> DLQ immediately (no retry); alert operator
```

### 6.2 DLQ record shape

```json
{
  "org_id": "<org UUID>",
  "job_type": "d365_pull | d365_push",
  "sub_capability": "pull | push_production_confirmation | push_inventory | push_shipment | push_quality_hold",
  "error_class": "transient | permanent",
  "error_message": "<error detail>",
  "payload_ref": "<reference to original job payload>",
  "failed_at": "<ISO 8601 timestamp>",
  "retry_count": 3,
  "alert_sent": true
}
```

All DLQ records are `org_id`-scoped, consistent with the `org_id`-first RLS
convention (§W0-v4.3 §1).

### 6.3 Operator alerts

- A permanent-error DLQ entry MUST trigger an operator alert within the 02-SETTINGS
  module's notification subsystem.
- Transient-error DLQ entries (post-max-retry) MUST also trigger an operator alert.
- Alert payload includes `org_id`, `job_type`, `sub_capability`, and `error_class`.
- Implementation of alerts is owned by 02-SETTINGS; this contract defines the
  expected data shape only.

### 6.4 Retry policy reference

The D365 adapter retry/DLQ policy **mirrors the T-008 outbox worker backoff**
(exponential back-off, configurable max attempts). The adapter must not implement
a divergent retry strategy without a corresponding PRD amendment.

---

## 7. Red Lines (non-negotiable)

The following items are unconditional red lines. Violations must be blocked at
PR review regardless of product pressure.

1. **Never implement D365 adapter code in the Foundation layer.** Foundation
   defines the contract; 02-SETTINGS and 03-TECHNICAL own the implementation.
2. **Never allow D365 export to imply factory release.** Export timing rules in
   §4 are mandatory; a D365 export with `allow_non_usable_preload_export = false`
   and `factory_spec.status != approved` must be rejected at the job scheduler.
3. **Never use `tenant_id` as business scope.** All D365 adapter configuration,
   job records, DLQ records, and capability registry entries use `org_id`
   (§W0-v4.3 §1; T-048 `org_id` row).
4. **Never use D365 IDs as primary keys** for any Monopilot entity. External IDs
   are always optional metadata (§5).
5. **Never make D365 a hard dependency** for any Monopilot workflow. Every module
   that touches D365 data must gracefully handle the case where the D365 adapter
   capability is disabled for an `org_id`.

---

## 8. Cross-references

- PRD §W0-v4.3 §6 — D365 posture canonical statement.
- PRD §5 R8 — D365 adapter tech-stack entry (`@monopilot/d365-adapter`; DMF client + retry/DLQ + schema mapping).
- PRD §11 — Cross-cutting requirements; audit trail for all D365 job events.
- PRD §W0-v4.3 §9 — "Global Import/Export includes backend jobs/capability registry, not just a shell."
- Glossary `_foundation/glossary/domain-terms.md` (T-048) — locked definitions of `D365 posture`, `shared_bom`, `factory_spec`, `org_id`.
- `_foundation/contracts/shared-bom-ssot.md` (T-049) — `d365_external_ids` field shape on `shared_bom_revision`.
- T-008 — Outbox worker backoff policy (DLQ retry reference).
- 02-SETTINGS cross-module dependency — capability registry implementation.
- 03-TECHNICAL cross-module dependency — factory_spec approval workflow.
