/**
 * Dashboard recent-activity feed — friendly, localized labelling.
 *
 * The feed renders `public.audit_events` rows whose `action` column is a raw
 * dotted event code (e.g. `planning.purchase_order.status_changed`) and whose
 * `resource_type` / `resource_id` are likewise machine values (a bare 36-char
 * UUID). This module turns those into human-readable, localized strings:
 *
 *   - `eventLabelKey(action)`   → the i18n key suffix under
 *     `Dashboard.activity.events.*`, or `null` when the action is unmapped.
 *   - `resourceLabelKey(type)`  → the i18n key suffix under
 *     `Dashboard.activity.resources.*`, or `null` when unmapped.
 *   - `humanizeCode(code)`      → last-segment fallback used when no mapped
 *     label exists, so the raw dotted string is NEVER leaked into the UI.
 *   - `shortRef(resourceRef, resourceId)` → prefers a real human reference
 *     carried by the query (PO/TO/WO number, customer name, …); otherwise
 *     truncates a bare UUID to its first segment (`49b4abd3…`) so the feed
 *     never shows a full 36-char id. The `*` sentinel (schema-drift rows)
 *     resolves to `null` so the caller can omit it.
 *
 * Pure + framework-free so it is trivially unit-testable; the Server Component
 * resolves the returned key with its existing `getTranslations("Dashboard")`
 * translator. Keys live in the live next-intl bundle (`i18n/{en,pl,uk,ro}.json`).
 */

/**
 * Canonical `audit_events.action` → `Dashboard.activity.events.*` key map.
 *
 * Covers the action codes that actually appear in the live feed plus the common
 * planning / production / warehouse / shipping / quality lifecycle codes. Any
 * action not listed here falls back to {@link humanizeCode} — so the map only
 * needs the noteworthy ones, not the full universe.
 */
const EVENT_LABEL_KEYS: Readonly<Record<string, string>> = {
  // Planning — purchase orders
  "planning.purchase_order.created": "poCreated",
  "planning.purchase_order.updated": "poUpdated",
  "planning.purchase_order.status_changed": "poStatusChanged",
  "planning.purchase_order.line_added": "poLineAdded",
  "planning.purchase_order.line_updated": "poLineUpdated",
  "planning.purchase_order.line_deleted": "poLineDeleted",
  // Planning — transfer orders
  "planning.transfer_order.created": "toCreated",
  "planning.transfer_order.updated": "toUpdated",
  "planning.transfer_order.status_changed": "toStatusChanged",
  "transfer_order.shipped": "toShipped",
  "transfer_order.in_transit": "toInTransit",
  "transfer_order.received": "toReceived",
  // Planning — masters / demand
  "planning.supplier.created": "supplierCreated",
  "planning.supplier.status_changed": "supplierStatusChanged",
  "planning.carrier.created": "carrierCreated",
  "planning.demand_forecast.upserted": "demandForecastUpserted",
  "planning.mrp.completed": "mrpCompleted",
  "planning.schedule.published": "schedulePublished",
  // Production — work orders & shop floor
  "production.wo.started": "woStarted",
  "production.wo.completed": "woCompleted",
  "production.wo.closed": "woClosed",
  "production.consume.completed": "consumeCompleted",
  "production.consume.blocked": "consumeBlocked",
  "production.output.recorded": "outputRecorded",
  "production.waste.recorded": "wasteRecorded",
  "production.downtime.recorded": "downtimeRecorded",
  "production.changeover.signed": "changeoverSigned",
  // Warehouse — license plates / GRN / material
  "warehouse.lp.received": "lpReceived",
  "warehouse.lp.shipped": "lpShipped",
  "warehouse.lp.transitioned": "lpTransitioned",
  "warehouse.lp.metadata_corrected": "lpMetadataCorrected",
  "warehouse.grn.received": "grnReceived",
  "warehouse.material.consumed": "materialConsumed",
  "lp.received": "lpReceived",
  // Shipping — customer SO / shipments
  "ship.customer.created": "customerCreated",
  "shipment.created": "shipmentCreated",
  "shipping.shipment.confirmed": "shipmentConfirmed",
  "shipping.shipment.packed": "shipmentPacked",
  // Quality
  "quality.hold.created": "holdCreated",
  "quality.hold.released": "holdReleased",
  "quality.ncr.opened": "ncrOpened",
  "quality.ncr.submitted": "ncrSubmitted",
  "quality.ncr.assigned": "ncrAssigned",
  "quality.ncr.updated": "ncrUpdated",
  "quality.ncr.closed": "ncrClosed",
  "quality.ncr.critical_dual_signed": "ncrCriticalDualSigned",
  "quality.atp_swab_failed": "atpSwabFailed",
  // Technical — BOM / factory spec
  "bom.version_submitted": "bomVersionSubmitted",
  "bom.version_deleted": "bomVersionDeleted",
  "bom.initial_version_created": "bomInitialVersionCreated",
  "factory_spec.created": "factorySpecCreated",
  "factory_spec.bom_linked": "factorySpecBomLinked",
  "factory_spec.submitted_for_review": "factorySpecSubmittedForReview",
  "technical.factory_spec.approved": "factorySpecApproved",
  // NPD
  "npd.project.created": "npdProjectCreated",
  "npd.project_brief.updated": "npdProjectBriefUpdated",
  "npd.gate.advanced": "npdGateAdvanced",
  "npd.gate.approved": "npdGateApproved",
  "npd.gate.reverted": "npdGateReverted",
  "npd.handoff.promoted": "npdHandoffPromoted",
  "npd.handoff.checklist.toggled": "npdHandoffChecklistToggled",
  "npd.gate_checklist_item.toggled": "npdGateChecklistItemToggled",
  "npd.pilot.run.created": "npdPilotRunCreated",
  "npd.pilot.material.created": "npdPilotMaterialCreated",
  // Cross-cutting
  "e_sign.recorded": "eSignRecorded",
  "schema.drift_detected": "schemaDriftDetected",
};

/**
 * Canonical `audit_events.resource_type` → `Dashboard.activity.resources.*`
 * key map. Unmapped types fall back to {@link humanizeCode}.
 */
const RESOURCE_LABEL_KEYS: Readonly<Record<string, string>> = {
  purchase_order: "purchaseOrder",
  transfer_order: "transferOrder",
  work_order: "workOrder",
  license_plate: "licensePlate",
  customer: "customer",
  supplier: "supplier",
  carrier: "carrier",
  shipment: "shipment",
  factory_spec: "factorySpec",
  bom_header: "bom",
  npd_project: "npdProject",
  e_sign: "eSign",
  quality_hold: "qualityHold",
  ncr: "ncr",
  demand_forecast: "demandForecast",
  handoff_checklist: "handoffChecklist",
  handoff_checklist_item: "handoffChecklistItem",
  gate_checklist_item: "gateChecklistItem",
  pilot_run: "pilotRun",
  pilot_run_material: "pilotRunMaterial",
  "reference.dept_columns": "schemaColumns",
};

/** Resolve an `action` code to its mapped event-label key, or `null`. */
export function eventLabelKey(action: string): string | null {
  return EVENT_LABEL_KEYS[action] ?? null;
}

/** Resolve a `resource_type` to its mapped resource-label key, or `null`. */
export function resourceLabelKey(resourceType: string): string | null {
  return RESOURCE_LABEL_KEYS[resourceType] ?? null;
}

/**
 * Humanize a raw dotted code into a Title-Case phrase from its LAST segment —
 * the deliberate fallback so an unmapped event/resource still reads cleanly
 * (e.g. `some.module.thing_happened` → `Thing happened`) and the raw dotted
 * string is never shown.
 */
export function humanizeCode(code: string): string {
  const last = code.split(".").pop() ?? code;
  const spaced = last
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  if (spaced.length === 0) return code;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A bare 36-char UUID (8-4-4-4-12 hex). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pick the best short reference to show for a feed row.
 *
 *   1. A human reference carried by the query (`resourceRef` — PO/TO/WO number,
 *      customer name, …) wins and is returned verbatim.
 *   2. The schema-drift sentinel `*` (and empty values) → `null`, so the caller
 *      omits the reference entirely.
 *   3. A bare UUID → its first segment with an ellipsis (`49b4abd3…`), so the
 *      feed never renders a full 36-char id.
 *   4. Anything else (already short / human) is returned as-is.
 */
export function shortRef(
  resourceRef: string | null | undefined,
  resourceId: string | null | undefined,
): string | null {
  const ref = resourceRef?.trim();
  if (ref) return ref;

  const id = resourceId?.trim();
  if (!id || id === "*") return null;
  if (UUID_RE.test(id)) return `${id.slice(0, 8)}…`;
  return id;
}
