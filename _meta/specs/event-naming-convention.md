# Event Naming Convention

**Status:** Authoritative (Phase B.2)
**Date:** 2026-04-30
**Scope:** All `outbox_events.event_type` values, all module PRDs (00 through 15)
**Related:** 00-FOUNDATION-PRD §10 (Event-first + AI/Trace-ready Schema), ADR-034 (generic naming), `lib/outbox/events.enum.ts` SoT

---

## Decision

**Use `fa.*` for the 01-NPD finished-good aggregate. Do NOT introduce a parallel `product.*` namespace for the same aggregate.**

The aggregate that 01-NPD tracks is the **Finished Article (FA)** = a single, instance-level finished good moving through the 7-department close lifecycle. Even after the ADR-034 generic rename (physical table `fa` → `product`), the **event aggregate name stays `fa`** as the canonical short identifier for that lifecycle's domain events.

Rationale:
- `fa.created` / `fa.core_closed` / `fa.dept_closed` / `fa.built` / `fa.built_reset` / `fa.allergens_changed` form a tightly-coupled state machine specific to the NPD 7-department lifecycle. Generic `product.created` would conflate it with reference-data product master changes (D365 sync), BOM/recipe changes, label changes, etc., which have different consumers.
- The events.enum.ts source of truth (per `_meta/plans/2026-04-25-foundation-tasks.md` §00-c-T1) is already locked on `fa.created`, `brief.created`, `lp.received`, `wo.ready`, `audit.recorded`, `org.created`, `user.invited`, `role.assigned` — ISA-95 dot format.
- Renaming the table `fa` → `product` is a **physical-storage** change (ADR-034); event names are a **domain-language** contract. They are decoupled. Bridging via D365 view (see "Table Naming Decision" below) keeps physical storage flexible without breaking emitted events.

## Aggregate prefix registry

| Prefix | Aggregate | Owning module | Examples |
|---|---|---|---|
| `fa.*` | Finished Article (NPD lifecycle instance) | 01-NPD | `fa.created`, `fa.core_closed`, `fa.dept_closed`, `fa.built`, `fa.built_reset`, `fa.edit`, `fa.allergens_changed` |
| `brief.*` | NPD Brief (pre-FA spec) | 01-NPD | `brief.created`, `brief.converted` |
| `org.*` | Tenant organization | 02-SETTINGS / 00-FOUNDATION | `org.created` |
| `user.*` | User account | 00-FOUNDATION | `user.invited` |
| `role.*` | RBAC role assignment | 00-FOUNDATION | `role.assigned` |
| `lp.*` | License Plate (pallet/container) | 05-WAREHOUSE | `lp.received`, `lp.moved` |
| `wo.*` | Work Order | 08-PRODUCTION | `wo.ready`, `wo.status_change` |
| `audit.*` | Audit-trail event | 00-FOUNDATION (cross-cutting) | `audit.recorded` |
| `quality.*` | Quality event (CCP, hold, swab) | 09-QUALITY | `quality.ccp_out_of_spec`, `quality.hold_placed` |
| `shipment.*` | Outbound shipment | 11-SHIPPING | `shipment.epcis_commissioning` |

**`product.*` is reserved** for future events on the **product master / reference data** layer (D365-synced item master, BOM revisions, label-spec changes — none of which exist as outbox events in P1). It is NOT a synonym for `fa.*`.

## Format rules (recap from 00-FOUNDATION §10)

1. ISA-95 dot format: `<aggregate>.<verb_phrase>` (lowercase, snake_case verbs).
2. Topic routing key (queue layer, not event_type): `<tenant>/<site>/<area>/<line>/<event_type>`.
3. New aggregate prefixes MUST be added to this registry **and** to `lib/outbox/events.enum.ts` in the same PR.
4. Past-tense verbs only (state already changed): `fa.created` ✅, `fa.create` ❌.
5. Never include tenant_id, IDs, or payload data in `event_type` — those go in `tenant_id`, `aggregate_id`, `payload` columns.

## Migration note

If a future ADR generalizes the FA lifecycle across industries (Bakery FG, Pharma BATCH, FMCG SKU) and decides to rename the **event aggregate** as well, follow the dual-publish migration: emit both `fa.*` and the new prefix for N releases, deprecate `fa.*` after consumer cutover. This is **not** in scope for Phase E — `fa.*` stays.
