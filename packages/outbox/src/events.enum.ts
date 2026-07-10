/**
 * Outbox event type — SINGLE SOURCE OF TRUTH.
 *
 * This enum is AUTHORITATIVE (human decision, side-car foundation audit
 * `_meta/runs/sidecar/reports/foundation-audit.md`). Every event type that the
 * application emits into `public.outbox_events`, AND every event type stored by
 * the DB CHECK constraint `outbox_events_event_type_check`, MUST appear here —
 * either as a canonical `EventType` member or as a `LegacyEventAlias` key that
 * normalizes to a canonical member.
 *
 * Invariants (enforced by the drift gate test, `__tests__/check-drift.test.ts`):
 *   - The set of DB-permitted strings = (canonical values) ∪ (alias keys) =
 *     `DB_EVENT_TYPES`.
 *   - The latest migration's CHECK constraint string set === `DB_EVENT_TYPES`.
 *     So the enum and the DB CHECK can never silently desync again.
 *   - `normalizeEventType` NEVER throws for any string the code emits or the DB
 *     stores — it resolves legacy `fa.*` aliases to their `fg.*` canonical and
 *     passes through every canonical value unchanged.
 *
 * Naming policy:
 *   - `fg.*` is the canonical finished-good lifecycle prefix going forward.
 *   - The four legacy `fa.*` strings that have a `fg.*` equivalent are kept ONLY
 *     as `LegacyEventAlias` entries (the DB historically stored them).
 *   - The remaining `fa.*` strings (built, cascade, core_closed, deleted, …) have
 *     NO `fg.*` equivalent and are stored verbatim by shipped code + the DB, so
 *     they remain canonical members until a dedicated rename migration retires
 *     them. Dropping them here would make `normalizeEventType` throw on rows the
 *     DB already holds (the poison-pill class this change fixes).
 */
export enum EventType {
  AUDIT_RECORDED = 'audit.recorded',
  BOM_INITIAL_VERSION_CREATED = 'bom.initial_version_created',
  BOM_VERSION_SUBMITTED = 'bom.version_submitted',
  BRIEF_COMPLETED_FOR_PROJECT = 'brief.completed_for_project',
  BRIEF_CONVERTED = 'brief.converted',
  BRIEF_CREATED = 'brief.created',
  CATCH_WEIGHT_VARIANCE_EXCEEDED = 'catch_weight.variance_exceeded',
  COMPLIANCE_DOC_DELETED = 'compliance_doc.deleted',
  COMPLIANCE_DOC_EXPIRED = 'compliance_doc.expired',
  COMPLIANCE_DOC_EXPIRING = 'compliance_doc.expiring',
  COMPLIANCE_DOC_UPLOADED = 'compliance_doc.uploaded',
  D365_CACHE_REFRESHED = 'd365.cache.refreshed',
  FA_BUILT = 'fa.built',
  FA_BUILT_RESET = 'fa.built_reset',
  FA_CASCADE = 'fa.cascade',
  FA_CORE_CLOSED = 'fa.core_closed',
  FA_DELETED = 'fa.deleted',
  FA_DEPT_CLOSED = 'fa.dept_closed',
  FA_DEPT_REOPENED = 'fa.dept_reopened',
  FA_RECIPE_CHANGED = 'fa.recipe_changed',
  FA_TEMPLATE_APPLIED = 'fa.template_applied',
  // 10-finance events (PRD 10-FINANCE §12; producer prefix finance.*). 10-finance is the sole
  // emitter. cost_per_kg.changed is the Finance half of the cost-per-kg dual ownership with
  // 03-technical (Technical emits technical.item.cost_per_kg_changed). Consumers: 12-reporting
  // (MV refresh, KPIs, drift detection), 10-finance (cost cascade + valuation re-snap).
  FINANCE_CONSUMPTION_VALUED = 'finance.consumption.valued',
  FINANCE_COST_PER_KG_CHANGED = 'finance.cost_per_kg.changed',
  FINANCE_STANDARD_COST_APPROVED = 'finance.standard_cost.approved',
  FINANCE_VALUATION_CLOSED_MONTHLY = 'finance.valuation.closed_monthly',
  FINANCE_VARIANCE_COMPUTED = 'finance.variance.computed',
  FINANCE_WAC_UNDERFLOW = 'finance.wac.underflow',
  FG_ALLERGENS_CHANGED = 'fg.allergens_changed',
  FG_BOM_RELEASED = 'fg.bom.released',
  FG_CREATED = 'fg.created',
  FG_EDIT = 'fg.edit',
  FG_INTERMEDIATE_CODE_CHANGED = 'fg.intermediate_code_changed',
  FG_RELEASE_BLOCKED = 'fg.release_blocked',
  FG_RELEASED_TO_FACTORY = 'fg.released_to_factory',
  FORMULATION_LOCKED = 'formulation.locked',
  FORMULATION_SUBMITTED_FOR_TRIAL = 'formulation.submitted_for_trial',
  LP_RECEIVED = 'lp.received',
  MANUFACTURING_OPERATIONS_CREATED = 'manufacturing_operations.created',
  MANUFACTURING_OPERATIONS_DEACTIVATED = 'manufacturing_operations.deactivated',
  MANUFACTURING_OPERATIONS_RESET_TO_SEED = 'manufacturing_operations.reset_to_seed',
  MANUFACTURING_OPERATIONS_UPDATED = 'manufacturing_operations.updated',
  NPD_ALLERGENS_BULK_REBUILD_COMPLETED = 'npd.allergens.bulk_rebuild_completed',
  NPD_BUILDER_RELEASED_RECORDS_CREATED = 'npd.builder.released_records_created',
  NPD_FG_CANDIDATE_MAPPED = 'npd.fg_candidate_mapped',
  NPD_GATE_ADVANCED = 'npd.gate.advanced',
  NPD_GATE_APPROVED = 'npd.gate.approved',
  NPD_GATE_REVERTED = 'npd.gate.reverted',
  NPD_PROJECT_BRIEF_MAPPED = 'npd.project.brief_mapped',
  NPD_PROJECT_CREATED = 'npd.project.created',
  NPD_PROJECT_DELETED = 'npd.project.deleted',
  NPD_PROJECT_LEGACY_STAGES_CLOSED = 'npd.project.legacy_stages_closed',
  NPD_PROJECT_RELEASE_REQUESTED = 'npd.project.release_requested',
  ONBOARDING_FIRST_WO_RECORDED = 'onboarding.first_wo_recorded',
  QUALITY_ATP_SWAB_FAILED = 'quality.atp_swab_failed',
  // 09-quality hold lifecycle + NCR events (PRD 09-QUALITY §6.3, §12.1; canonical event table in the
  // MON-domain-quality skill). 09-quality is the sole emitter. Hold events drive the consume-gate
  // consumers (05-warehouse / 08-production / 11-shipping); NCR events drive 12-reporting +
  // 13-maintenance auto-MWO P2.
  QUALITY_HOLD_CREATED = 'quality.hold.created',
  QUALITY_HOLD_RELEASED = 'quality.hold.released',
  QUALITY_NCR_OPENED = 'quality.ncr.opened',
  QUALITY_NCR_SUBMITTED = 'quality.ncr.submitted',
  QUALITY_NCR_ASSIGNED = 'quality.ncr.assigned',
  QUALITY_NCR_UPDATED = 'quality.ncr.updated',
  QUALITY_NCR_CLOSED = 'quality.ncr.closed',
  QUALITY_NCR_CRITICAL_DUAL_SIGNED = 'quality.ncr.critical_dual_signed',
  ONBOARDING_STEP_ADVANCE = 'onboarding.step.advance',
  ONBOARDING_STEP_BACK = 'onboarding.step.back',
  ONBOARDING_STEP_JUMP = 'onboarding.step.jump',
  ONBOARDING_STEP_RESTART = 'onboarding.step.restart',
  ONBOARDING_STEP_SKIP = 'onboarding.step.skip',
  ORG_CREATED = 'org.created',
  ORG_MFA_ENROLLMENT_FORCED = 'org.mfa_enrollment.forced',
  ORG_SECURITY_POLICY_UPDATED = 'org.security_policy.updated',
  // 07-planning-ext scheduler/changeover lifecycle events (PRD 07-PLANNING-EXT §5.1, §9).
  // 07-planning-ext is the sole emitter. Consumers: 08-production (schedule.published +
  // assignment.approved/overridden/bulk_approved become WO commits), 12-reporting (audit/KPI),
  // 06-scanner (planned WO list), planning dashboard (run.completed), solver cache
  // (matrix.version.published invalidate). See MON-domain-planning §"Outbox events".
  PLANNING_MRP_COMPLETED = 'planning.mrp.completed',
  PLANNING_SCHEDULE_PUBLISHED = 'planning.schedule.published',
  SCHEDULER_RUN_COMPLETED = 'scheduler.run.completed',
  SCHEDULER_ASSIGNMENT_APPROVED = 'scheduler.assignment.approved',
  SCHEDULER_ASSIGNMENT_OVERRIDDEN = 'scheduler.assignment.overridden',
  SCHEDULER_ASSIGNMENT_REJECTED = 'scheduler.assignment.rejected',
  SCHEDULER_ASSIGNMENT_BULK_APPROVED = 'scheduler.assignment.bulk_approved',
  MATRIX_VERSION_PUBLISHED = 'matrix.version.published',
  // 08-production lifecycle + waste/downtime/changeover/OEE events (PRD 08-PRODUCTION §6/§12/§13;
  // canonical event table in the MON-domain-production skill). 08 is the sole emitter of these.
  PRODUCTION_ALLERGEN_CHANGEOVER_VALIDATED = 'production.allergen_changeover.validated',
  PRODUCTION_CHANGEOVER_SIGNED = 'production.changeover.signed',
  PRODUCTION_CONSUME_BLOCKED = 'production.consume.blocked',
  PRODUCTION_CONSUME_COMPLETED = 'production.consume.completed',
  PRODUCTION_DOWNTIME_RECORDED = 'production.downtime.recorded',
  PRODUCTION_OEE_SNAPSHOT = 'production.oee.snapshot',
  PRODUCTION_OUTPUT_RECORDED = 'production.output.recorded',
  PRODUCTION_WASTE_RECORDED = 'production.waste.recorded',
  PRODUCTION_WO_CLOSED = 'production.wo.closed',
  PRODUCTION_WO_COMPLETED = 'production.wo.completed',
  PRODUCTION_WO_STARTED = 'production.wo.started',
  QUALITY_RECORDED = 'quality.recorded',
  REFERENCE_ALLERGENS_ADDED_BY_PROCESS_BULK_CHANGED = 'reference.allergens_added_by_process.bulk_changed',
  REFERENCE_ALLERGENS_BY_RM_BULK_CHANGED = 'reference.allergens_by_rm.bulk_changed',
  REFERENCE_CSV_COMMITTED = 'reference.csv.committed',
  REFERENCE_ROW_SOFT_DELETED = 'reference.row.soft_deleted',
  REFERENCE_ROW_UPSERTED = 'reference.row.upserted',
  // 12-reporting export + MV-refresh telemetry events (PRD 12-REPORTING §9, §13.2). 12-reporting is a
  // READ-MOSTLY CONSUMER — it produces NO fact-table events (it never writes wo_outputs/oee_snapshots/
  // etc.); these four are its OWN audit/telemetry signals for the export engine (T-013) + the MV
  // refresh worker (T-005). 12-reporting is the sole emitter.
  REPORTING_EXPORT_COMPLETED = 'reporting.export.completed',
  REPORTING_EXPORT_FAILED = 'reporting.export.failed',
  REPORTING_MV_REFRESH_COMPLETED = 'reporting.mv.refresh_completed',
  REPORTING_SCHEDULE_RUN_COMPLETED = 'reporting.schedule.run_completed',
  RISK_CREATED = 'risk.created',
  ROLE_ASSIGNED = 'role.assigned',
  RULE_DEPLOYED = 'rule.deployed',
  SETTINGS_CORE_FLAG_UPDATED = 'settings.core_flag.updated',
  SETTINGS_D365_SYNC_UPDATED = 'settings.d365_sync.updated',
  SETTINGS_DEPT_OVERRIDE_UPDATED = 'settings.dept_override.updated',
  SETTINGS_IP_ALLOWLIST_CHANGED = 'settings.ip_allowlist.changed',
  SETTINGS_LINE_UPSERTED = 'settings.line.upserted',
  SETTINGS_LOCATION_DELETED = 'settings.location.deleted',
  SETTINGS_LOCATION_IMPORTED = 'settings.location.imported',
  SETTINGS_LOCATION_UPSERTED = 'settings.location.upserted',
  SETTINGS_MACHINE_UPSERTED = 'settings.machine.upserted',
  SETTINGS_MODULE_DISABLED = 'settings.module.disabled',
  SETTINGS_MODULE_ENABLED = 'settings.module.enabled',
  SETTINGS_MODULE_TOGGLED = 'settings.module.toggled',
  SETTINGS_NOTIFICATION_CHANNEL_UPDATED = 'settings.notification_channel_updated',
  SETTINGS_NOTIFICATION_DIGEST_UPDATED = 'settings.notification_digest_updated',
  SETTINGS_NOTIFICATION_RULE_UPDATED = 'settings.notification_rule_updated',
  SETTINGS_ORG_CREATED = 'settings.org.created',
  SETTINGS_ORG_UPDATED = 'settings.org.updated',
  SETTINGS_REFERENCE_ROW_UPDATED = 'settings.reference.row_updated',
  SETTINGS_ROLE_ASSIGNED = 'settings.role.assigned',
  SETTINGS_RULE_VARIANT_UPDATED = 'settings.rule_variant.updated',
  SETTINGS_RULE_DEPLOYED = 'settings.rule.deployed',
  SETTINGS_SCHEMA_MIGRATION_REQUESTED = 'settings.schema.migration_requested',
  SETTINGS_SCIM_TOKEN_CREATED = 'settings.scim.token_created',
  SETTINGS_SSO_CONFIG_CHANGED = 'settings.sso.config_changed',
  SETTINGS_UPGRADE_COMPLETED = 'settings.upgrade.completed',
  SETTINGS_UPGRADE_PROMOTED = 'settings.upgrade.promoted',
  SETTINGS_UPGRADE_ROLLED_BACK = 'settings.upgrade.rolled_back',
  SETTINGS_UPGRADE_SCHEDULED = 'settings.upgrade.scheduled',
  SETTINGS_USER_ACCEPTED = 'settings.user.accepted',
  SETTINGS_USER_CREATED_WITH_PASSWORD = 'settings.user.created_with_password',
  SETTINGS_USER_DEACTIVATED = 'settings.user.deactivated',
  SETTINGS_USER_INVITATION_RESENT = 'settings.user.invitation_resent',
  SETTINGS_USER_INVITED = 'settings.user.invited',
  SETTINGS_USER_REACTIVATED = 'settings.user.reactivated',
  SETTINGS_WAREHOUSE_DEACTIVATED = 'settings.warehouse.deactivated',
  SETTINGS_WAREHOUSE_STORAGE_RULES_UPDATED = 'settings.warehouse.storage_rules_updated',
  SHIPMENT_CREATED = 'shipment.created',
  // 11-shipping outbound lifecycle events (PRD 11-SHIPPING §9.1/§12.1; producer prefix shipping.*).
  // 11-shipping is the sole emitter. shipment.created (legacy, 014-r13) is kept as the canonical
  // shipment-row-created signal; the shipping.* group below covers the SO / pick / BOL / dispatch
  // lifecycle. Consumers: 10-finance (SO confirm → AR), 12-reporting, 14-multi-site, D365 push (§12).
  SHIPPING_SO_RELEASED = 'shipping.so.released',
  SHIPPING_SO_CONFIRMED = 'shipping.so.confirmed',
  SHIPPING_SO_CANCELLED = 'shipping.so.cancelled',
  SHIPPING_PICK_RELEASED = 'shipping.pick.released',
  SHIPPING_PICK_COMPLETED = 'shipping.pick.completed',
  SHIPPING_SHIPMENT_PACKED = 'shipping.shipment.packed',
  SHIPPING_SHIPMENT_CONFIRMED = 'shipping.shipment.confirmed',
  SHIPPING_BOL_ISSUED = 'shipping.bol.issued',
  TECHNICAL_FACTORY_SPEC_APPROVED = 'technical.factory_spec.approved',
  WIP_DEFINITION_UPDATED = 'wip.definition.updated',
  TENANT_COHORT_ADVANCED = 'tenant.cohort.advanced',
  TENANT_MIGRATION_RUN = 'tenant.migration.run',
  TENANT_MIGRATION_RUN_FAILED = 'tenant.migration.run.failed',
  UNIT_OF_MEASURE_CONVERSION_CREATED = 'unit_of_measure.conversion_created',
  UNIT_OF_MEASURE_CREATED = 'unit_of_measure.created',
  UNIT_OF_MEASURE_SOFT_DELETED = 'unit_of_measure.soft_deleted',
  USER_INVITED = 'user.invited',
  // 14-multi-site inter-site transfer (IST) lifecycle + transport-lane/rate-card events
  // (PRD 14-MULTI-SITE §9.6, §12.3, §10A.4; D-MS-12). 14-multi-site is the sole emitter.
  // transfer_order.* drive the cross-site dual-approval gate (T-010) + 10-finance cost
  // allocation (T-011); transport_lane.* / transport_lane_rate_card.* drive the replication
  // queue (T-017) + lane suggestion (T-014). The IST shell table (inter_site_transfer_orders)
  // lands with this schema foundation; the Server-Action emitters land in 14-b/14-c.
  TRANSFER_ORDER_SHIPPED = 'transfer_order.shipped',
  TRANSFER_ORDER_IN_TRANSIT = 'transfer_order.in_transit',
  TRANSFER_ORDER_RECEIVED = 'transfer_order.received',
  TRANSPORT_LANE_CREATED = 'transport_lane.created',
  TRANSPORT_LANE_RATE_CARD_ACTIVATED = 'transport_lane_rate_card.activated',
  // 05-warehouse LP lifecycle events (PRD 05-WAREHOUSE §7.6, §11.4; producer prefix warehouse.*).
  // 05-warehouse is the sole emitter. Consumers: 08-production, 06-scanner, 09-quality,
  // 10-finance (FIFO/WAC valuation), 11-shipping, 12-reporting, 15-OEE.
  WAREHOUSE_GRN_RECEIVED = 'warehouse.grn.received',
  WAREHOUSE_LP_RECEIVED = 'warehouse.lp.received',
  WAREHOUSE_LP_TRANSITIONED = 'warehouse.lp.transitioned',
  WAREHOUSE_MATERIAL_CONSUMED = 'warehouse.material.consumed',
  WAREHOUSE_LP_SHIPPED = 'warehouse.lp.shipped',
  // 13-maintenance CMMS lifecycle events (PRD 13-MAINTENANCE §7.2 D-MNT-12/14 + §12.3; producer
  // prefix maintenance.*). 13-maintenance is the sole emitter of these. NOT
  // production.downtime.recorded — that is owned/emitted by 08-production (consumed here for
  // reactive auto-MWO, T-017). Consumers: 09-quality (calibration.failed auto-hold candidate,
  // V-MNT-10), 08-production (sanitation allergen_change -> allergen_changeover_gate_v1, D-MNT-14),
  // 15-OEE (mwo.completed -> MTBF/MTTR feed, D-MNT-3), 12-reporting, 05-warehouse (spare reorder).
  MAINTENANCE_PM_DUE = 'maintenance.pm.due',
  MAINTENANCE_MWO_CREATED = 'maintenance.mwo.created',
  MAINTENANCE_MWO_COMPLETED = 'maintenance.mwo.completed',
  MAINTENANCE_LOTO_APPLIED = 'maintenance.loto.applied',
  MAINTENANCE_LOTO_RELEASED = 'maintenance.loto.released',
  MAINTENANCE_CALIBRATION_COMPLETED = 'maintenance.calibration.completed',
  MAINTENANCE_CALIBRATION_FAILED = 'maintenance.calibration.failed',
  MAINTENANCE_SANITATION_ALLERGEN_CHANGE_COMPLETED = 'maintenance.sanitation.allergen_change.completed',
  SPARE_REORDER_THRESHOLD_BREACHED = 'spare.reorder_threshold_breached',
  // 15-OEE producer events (PRD 15-OEE §6/§9.5; MON-domain-oee skill "Outbox events" table).
  // 15-OEE is the sole emitter. Consumers: 12-reporting (cache invalidate), 13-maintenance
  // (D-MNT-3 MTBF/MTTR feed + P2 auto-MWO), 02-settings rules registry + audit, in-app alerts.
  OEE_SNAPSHOT_REFRESHED = 'oee.snapshot.refreshed',
  OEE_DSL_RULE_UPDATED = 'oee.dsl_rule.updated',
  OEE_SHIFT_AGGREGATED = 'oee.shift.aggregated',
  OEE_ALERT_THRESHOLD_BREACHED = 'oee.alert.threshold_breached',
  OEE_ANOMALY_DETECTED = 'oee.anomaly.detected',
  WO_READY = 'wo.ready',
}

/**
 * Locked settings event group (T-003). Subset of `EventType` — referenced by the
 * settings module sign-off contract.
 */
export const ALL_SETTINGS_EVENTS = [
  EventType.SETTINGS_ORG_CREATED,
  EventType.SETTINGS_ORG_UPDATED,
  EventType.SETTINGS_USER_INVITED,
  EventType.SETTINGS_USER_ACCEPTED,
  EventType.SETTINGS_USER_DEACTIVATED,
  EventType.SETTINGS_ROLE_ASSIGNED,
  EventType.SETTINGS_MODULE_TOGGLED,
  EventType.SETTINGS_REFERENCE_ROW_UPDATED,
  EventType.SETTINGS_SCHEMA_MIGRATION_REQUESTED,
  EventType.SETTINGS_RULE_DEPLOYED,
  EventType.SETTINGS_NOTIFICATION_RULE_UPDATED,
  EventType.SETTINGS_NOTIFICATION_CHANNEL_UPDATED,
  EventType.SETTINGS_NOTIFICATION_DIGEST_UPDATED,
  EventType.SETTINGS_SSO_CONFIG_CHANGED,
  EventType.SETTINGS_SCIM_TOKEN_CREATED,
] as const;

/**
 * Locked 08-production event group. Subset of `EventType` — the canonical
 * production lifecycle + waste/downtime/changeover/OEE vocabulary that
 * 08-production (and ONLY 08-production) emits. Referenced by the production
 * module sign-off contract; 15-OEE is a read-only consumer of `production.oee.snapshot`.
 */
export const ALL_PRODUCTION_EVENTS = [
  EventType.PRODUCTION_WO_STARTED,
  EventType.PRODUCTION_WO_COMPLETED,
  EventType.PRODUCTION_WO_CLOSED,
  EventType.PRODUCTION_OUTPUT_RECORDED,
  EventType.PRODUCTION_WASTE_RECORDED,
  EventType.PRODUCTION_DOWNTIME_RECORDED,
  EventType.PRODUCTION_CONSUME_COMPLETED,
  EventType.PRODUCTION_CONSUME_BLOCKED,
  EventType.PRODUCTION_CHANGEOVER_SIGNED,
  EventType.PRODUCTION_ALLERGEN_CHANGEOVER_VALIDATED,
  EventType.PRODUCTION_OEE_SNAPSHOT,
] as const;

/**
 * Locked 05-warehouse event group. Subset of `EventType` — the canonical License Plate (LP)
 * lifecycle vocabulary that 05-warehouse (and ONLY 05-warehouse) emits. warehouse.material.consumed
 * is emitted ONLY after the 09-quality T-064 consume gate passes. Referenced by the warehouse
 * module sign-off contract.
 */
export const ALL_WAREHOUSE_EVENTS = [
  EventType.WAREHOUSE_GRN_RECEIVED,
  EventType.WAREHOUSE_LP_RECEIVED,
  EventType.WAREHOUSE_LP_TRANSITIONED,
  EventType.WAREHOUSE_MATERIAL_CONSUMED,
  EventType.WAREHOUSE_LP_SHIPPED,
] as const;

/**
 * Locked 10-finance event group. Subset of  — the canonical finance vocabulary that
 * 10-finance (and ONLY 10-finance) emits: standard-cost approval, cost-per-kg dual-ownership
 * change, variance computation, monthly valuation close, and FIFO/WAC consumption valuation.
 * Referenced by the finance module sign-off contract. Primary consumer: 12-reporting.
 */
export const ALL_FINANCE_EVENTS = [
  EventType.FINANCE_STANDARD_COST_APPROVED,
  EventType.FINANCE_COST_PER_KG_CHANGED,
  EventType.FINANCE_VARIANCE_COMPUTED,
  EventType.FINANCE_VALUATION_CLOSED_MONTHLY,
  EventType.FINANCE_CONSUMPTION_VALUED,
  EventType.FINANCE_WAC_UNDERFLOW,
] as const;

/**
 * Locked 07-planning-ext event group. Subset of `EventType` — the canonical scheduler /
 * changeover-matrix lifecycle vocabulary that 07-planning-ext (and ONLY 07-planning-ext) emits.
 * `planning.schedule.published` + `scheduler.assignment.approved`/`overridden`/`bulk_approved`
 * are consumed by 08-production as WO commits; `matrix.version.published` invalidates the solver
 * changeover cache. Referenced by the planning-ext module sign-off contract.
 */
export const ALL_SCHEDULER_EVENTS = [
  EventType.PLANNING_MRP_COMPLETED,
  EventType.PLANNING_SCHEDULE_PUBLISHED,
  EventType.SCHEDULER_RUN_COMPLETED,
  EventType.SCHEDULER_ASSIGNMENT_APPROVED,
  EventType.SCHEDULER_ASSIGNMENT_OVERRIDDEN,
  EventType.SCHEDULER_ASSIGNMENT_REJECTED,
  EventType.SCHEDULER_ASSIGNMENT_BULK_APPROVED,
  EventType.MATRIX_VERSION_PUBLISHED,
] as const;

/**
 * Legacy `fa.*` event strings that the DB historically stored and that shipped
 * code still emits. Each normalizes to its canonical `fg.*` member. These keys
 * are part of the DB-permitted set (`DB_EVENT_TYPES`) but are NOT canonical enum
 * members — `normalizeEventType` rewrites them on the way through the worker.
 */
/**
 * Locked 09-quality event group. Subset of `EventType` — the canonical hold-lifecycle + NCR
 * vocabulary that 09-quality (and ONLY 09-quality) emits. quality.hold.* drive the consume-gate
 * consumers (05-warehouse / 08-production / 11-shipping); quality.ncr.* drive 12-reporting +
 * 13-maintenance auto-MWO P2. Referenced by the quality module sign-off contract.
 */
export const ALL_QUALITY_EVENTS = [
  EventType.QUALITY_HOLD_CREATED,
  EventType.QUALITY_HOLD_RELEASED,
  EventType.QUALITY_NCR_OPENED,
  EventType.QUALITY_NCR_SUBMITTED,
  EventType.QUALITY_NCR_ASSIGNED,
  EventType.QUALITY_NCR_UPDATED,
  EventType.QUALITY_NCR_CLOSED,
  EventType.QUALITY_NCR_CRITICAL_DUAL_SIGNED,
] as const;

/**
 * Locked 13-maintenance event group. Subset of `EventType` — the canonical CMMS lifecycle
 * vocabulary that 13-maintenance (and ONLY 13-maintenance) emits. Producer prefix `maintenance.*`
 * plus the `spare.reorder_threshold_breached` cron event. 13-maintenance does NOT emit
 * `production.downtime.recorded` (08-production owns it; consumed here for reactive auto-MWO).
 * Referenced by the maintenance module sign-off contract.
 */
export const ALL_MAINTENANCE_EVENTS = [
  EventType.MAINTENANCE_PM_DUE,
  EventType.MAINTENANCE_MWO_CREATED,
  EventType.MAINTENANCE_MWO_COMPLETED,
  EventType.MAINTENANCE_LOTO_APPLIED,
  EventType.MAINTENANCE_LOTO_RELEASED,
  EventType.MAINTENANCE_CALIBRATION_COMPLETED,
  EventType.MAINTENANCE_CALIBRATION_FAILED,
  EventType.MAINTENANCE_SANITATION_ALLERGEN_CHANGE_COMPLETED,
  EventType.SPARE_REORDER_THRESHOLD_BREACHED,
] as const;

/**
 * Locked 15-OEE event group. Subset of `EventType` — the analytics/rollup vocabulary that
 * 15-OEE (and ONLY 15-OEE) emits. 15-OEE is a READ-ONLY consumer of `oee_snapshots`
 * (D-OEE-1); these events are derived signals (MV refresh, shift close, rule promotion,
 * threshold breach, anomaly) — never a write-back to the producer table. Referenced by the
 * OEE module sign-off contract.
 */
export const ALL_OEE_EVENTS = [
  EventType.OEE_SNAPSHOT_REFRESHED,
  EventType.OEE_DSL_RULE_UPDATED,
  EventType.OEE_SHIFT_AGGREGATED,
  EventType.OEE_ALERT_THRESHOLD_BREACHED,
  EventType.OEE_ANOMALY_DETECTED,
] as const;

/**
 * Locked 11-shipping event group. Subset of `EventType` — the canonical SO / pick / pack / ship /
 * BOL lifecycle vocabulary that 11-shipping (and ONLY 11-shipping) emits. The legacy
 * `shipment.created` row-created signal (014-r13) is kept separately; this group is the
 * lifecycle vocabulary. Referenced by the shipping module sign-off contract.
 */
export const ALL_SHIPPING_EVENTS = [
  EventType.SHIPMENT_CREATED,
  EventType.SHIPPING_SO_RELEASED,
  EventType.SHIPPING_SO_CONFIRMED,
  EventType.SHIPPING_SO_CANCELLED,
  EventType.SHIPPING_PICK_RELEASED,
  EventType.SHIPPING_PICK_COMPLETED,
  EventType.SHIPPING_SHIPMENT_PACKED,
  EventType.SHIPPING_SHIPMENT_CONFIRMED,
  EventType.SHIPPING_BOL_ISSUED,
] as const;

/**
 * Locked 12-reporting event group. Subset of `EventType` — the export + MV-refresh telemetry
 * vocabulary that 12-reporting (and ONLY 12-reporting) emits. 12-reporting is a READ-MOSTLY CONSUMER:
 * it owns NO canonical fact table and produces NO fact events; these four are its own audit/telemetry
 * signals (export engine T-013 + MV refresh worker T-005). Referenced by the reporting module
 * sign-off contract.
 */
export const ALL_REPORTING_EVENTS = [
  EventType.REPORTING_EXPORT_COMPLETED,
  EventType.REPORTING_EXPORT_FAILED,
  EventType.REPORTING_MV_REFRESH_COMPLETED,
  EventType.REPORTING_SCHEDULE_RUN_COMPLETED,
] as const;

/**
 * Locked 14-multi-site event group. Subset of `EventType` — the canonical inter-site transfer (IST)
 * lifecycle + transport-lane/rate-card vocabulary that 14-multi-site (and ONLY 14-multi-site) emits.
 * transfer_order.* drive the cross-site dual-approval gate (T-010) + 10-finance cost allocation (T-011);
 * transport_lane.* / transport_lane_rate_card.* drive the replication queue (T-017) + lane suggestion
 * (T-014). Referenced by the 14-multi-site module sign-off contract.
 */
export const ALL_MULTI_SITE_EVENTS = [
  EventType.TRANSFER_ORDER_SHIPPED,
  EventType.TRANSFER_ORDER_IN_TRANSIT,
  EventType.TRANSFER_ORDER_RECEIVED,
  EventType.TRANSPORT_LANE_CREATED,
  EventType.TRANSPORT_LANE_RATE_CARD_ACTIVATED,
] as const;

export const LegacyEventAlias = {
  'fa.created': EventType.FG_CREATED,
  'fa.allergens_changed': EventType.FG_ALLERGENS_CHANGED,
  'fa.intermediate_code_changed': EventType.FG_INTERMEDIATE_CODE_CHANGED,
  'fa.edit': EventType.FG_EDIT,
} as const;

export const ALL_EVENTS = Object.values(EventType) as readonly EventType[];

export const ALL_EVENT_ALIASES = LegacyEventAlias;

/**
 * Every string the DB CHECK constraint must permit: the canonical enum values
 * PLUS the legacy alias keys (which are stored verbatim by older rows + code).
 * The drift gate asserts the latest migration's CHECK string set === this set.
 */
export const DB_EVENT_TYPES: readonly string[] = [
  ...ALL_EVENTS,
  ...(Object.keys(LegacyEventAlias) as readonly string[]),
];

const canonicalEvents = new Set<string>(ALL_EVENTS);

export function normalizeEventType(input: string): EventType {
  if (canonicalEvents.has(input)) {
    return input as EventType;
  }

  if (input in LegacyEventAlias) {
    return LegacyEventAlias[input as keyof typeof LegacyEventAlias];
  }

  throw new Error(`Unknown event type: ${input}`);
}
