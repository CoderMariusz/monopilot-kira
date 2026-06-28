export const Permission = {
  ORG_ACCESS_ADMIN: 'org.access.admin',
  ORG_SCHEMA_ADMIN: 'org.schema.admin',
  ORG_SCIM_WRITE: 'org.scim.write',
  FG_CREATE: 'fg.create',
  FG_EDIT: 'fg.edit',
  BRIEF_CONVERT_TO_NPD_PROJECT: 'brief.convert_to_npd_project',
  REF_EDIT: 'ref.edit',
  AUDIT_READ: 'audit.read',
  OUTBOX_ADMIN: 'outbox.admin',
  IMPERSONATE_ORG: 'impersonate.org',
  /** Settings org read access; PRD 02-SETTINGS §3 lines 140-143. */
  SETTINGS_ORG_READ: 'settings.org.read',
  /** Settings org update access; PRD 02-SETTINGS §3 lines 140-143. */
  SETTINGS_ORG_UPDATE: 'settings.org.update',
  /** Settings user creation access; PRD 02-SETTINGS §3 lines 140-143. */
  SETTINGS_USERS_CREATE: 'settings.users.create',
  /** Settings user deactivation access; PRD 02-SETTINGS §3 lines 140-143. */
  SETTINGS_USERS_DEACTIVATE: 'settings.users.deactivate',
  /** Settings user invitation access; PRD 02-SETTINGS §3 lines 116-123. */
  SETTINGS_USERS_INVITE: 'settings.users.invite',
  /** Settings user/role management page access; PRD 02-SETTINGS §3 lines 116-125. */
  SETTINGS_USERS_MANAGE: 'settings.users.manage',
  /** Settings role assignment access; PRD 02-SETTINGS §3 lines 121-125. */
  SETTINGS_ROLES_ASSIGN: 'settings.roles.assign',
  /** Settings audit read access; PRD 02-SETTINGS §3 lines 118-119. */
  SETTINGS_AUDIT_READ: 'settings.audit.read',
  /** Settings tenant impersonation access; PRD 02-SETTINGS §3 lines 119-120. */
  SETTINGS_IMPERSONATE_TENANT: 'settings.impersonate.tenant',

  // Schema
  /** Settings schema lifecycle permissions; PRD 02-SETTINGS §3, §6, §10, §14. */
  SETTINGS_SCHEMA_VIEW: 'settings.schema.view',
  SETTINGS_SCHEMA_EDIT: 'settings.schema.edit',
  SETTINGS_SCHEMA_PROMOTE_L1: 'settings.schema.promote_l1',

  // Rules
  /** Settings rules registry permissions; PRD 02-SETTINGS §3, §7, §10, §14. */
  SETTINGS_RULES_VIEW: 'settings.rules.view',

  // Reference
  /** Settings reference-data governance permissions; PRD 02-SETTINGS §3, §8, §10, §14. */
  SETTINGS_REFERENCE_VIEW: 'settings.reference.view',
  SETTINGS_REFERENCE_EDIT: 'settings.reference.edit',
  SETTINGS_REFERENCE_IMPORT: 'settings.reference.import',

  // Infra
  /** Settings infrastructure configuration permissions; PRD 02-SETTINGS §3, §10, §11, §14. */
  SETTINGS_INFRA_VIEW: 'settings.infra.view',
  SETTINGS_INFRA_EDIT: 'settings.infra.edit',

  // D365
  /** Settings D365 integration permissions; PRD 02-SETTINGS §3, §10, §11, §14. */
  SETTINGS_D365_VIEW: 'settings.d365.view',
  SETTINGS_D365_EDIT: 'settings.d365.edit',
  SETTINGS_D365_TOGGLE: 'settings.d365.toggle',

  // Email
  /** Settings email configuration permissions; PRD 02-SETTINGS §3, §10, §11, §14. */
  SETTINGS_EMAIL_VIEW: 'settings.email.view',
  SETTINGS_EMAIL_EDIT: 'settings.email.edit',

  // Onboarding
  /** Settings onboarding completion permission; PRD 02-SETTINGS §3, §12, §14. */
  SETTINGS_ONBOARDING_COMPLETE: 'settings.onboarding.complete',

  // Security
  /** Settings security configuration permission; PRD 02-SETTINGS §3, §11, §13, §14. */
  SETTINGS_SECURITY_EDIT: 'settings.security.edit',
  /** Settings security management page access; PRD 02-SETTINGS §3, §11, §13, §14. */
  SETTINGS_SECURITY_MANAGE: 'settings.security.manage',

  // SSO
  /** Settings SSO administration permissions; PRD 02-SETTINGS §3, §11, §13, §14. */
  SETTINGS_SSO_VIEW: 'settings.sso.view',
  SETTINGS_SSO_EDIT: 'settings.sso.edit',

  // SCIM
  /** Settings SCIM administration permissions; PRD 02-SETTINGS §3, §11, §13, §14. */
  SETTINGS_SCIM_VIEW: 'settings.scim.view',
  SETTINGS_SCIM_EDIT: 'settings.scim.edit',

  // IP Allowlist
  /** Settings IP allowlist permissions; PRD 02-SETTINGS §3, §11, §13, §14. */
  SETTINGS_IP_ALLOWLIST_VIEW: 'settings.ip_allowlist.view',
  SETTINGS_IP_ALLOWLIST_EDIT: 'settings.ip_allowlist.edit',

  // Flags
  /** Settings feature flag permissions; PRD 02-SETTINGS §3, §10, §14. */
  SETTINGS_FLAGS_VIEW: 'settings.flags.view',
  SETTINGS_FLAGS_EDIT: 'settings.flags.edit',

  // Workflow Authorization
  /** Settings/Auth-owned workflow authorization permissions; PRD 02-SETTINGS §3 PO decision 2026-05-03, §6, §10, §14. */
  SETTINGS_AUTHORIZATION_VIEW: 'settings.authorization.view',
  SETTINGS_AUTHORIZATION_EDIT: 'settings.authorization.edit',
  NPD_RELEASED_PRODUCT_EDIT_REQUEST: 'npd.released_product_edit.request',
  NPD_RELEASED_PRODUCT_EDIT_AUTHORIZE: 'npd.released_product_edit.authorize',
  TECHNICAL_PRODUCT_SPEC_APPROVE: 'technical.product_spec.approve',

  // NPD
  /** NPD brief creation permission; PRD 01-NPD §2.2. */
  BRIEF_CREATE: 'brief.create',
  /** NPD project deletion permission; PRD 01-NPD §2.2. */
  NPD_PROJECT_DELETE: 'npd.project.delete',
  /** NPD core write permission; PRD 01-NPD §2.2. */
  NPD_CORE_WRITE: 'npd.core.write',
  /** NPD dashboard access permission; PRD 01-NPD §2.2. */
  NPD_DASHBOARD_VIEW: 'npd.dashboard.view',
  /** NPD D365 Builder execution permission; PRD 01-NPD §2.2, §18, §19. */
  NPD_D365_BUILDER_EXECUTE: 'npd.d365_builder.execute',
  /** NPD closed flag unset permission; PRD 01-NPD §2.2, §17.9. */
  NPD_CLOSED_FLAG_UNSET: 'npd.closed_flag.unset',
  /** NPD schema edit permission; PRD 01-NPD §2.2, §18. */
  NPD_SCHEMA_EDIT: 'npd.schema.edit',
  /** NPD rule edit permission; PRD 01-NPD §2.2, §18. */
  NPD_RULE_EDIT: 'npd.rule.edit',
  /** NPD risk write permission; PRD 01-NPD §2.2, §18. */
  NPD_RISK_WRITE: 'npd.risk.write',
  /** NPD allergen declaration write permission; PRD 01-NPD §2.2, §13 (allergen cascade). */
  NPD_ALLERGEN_WRITE: 'npd.allergen.write',
  /** NPD compliance document write permission; PRD 01-NPD §2.2, §18. */
  NPD_COMPLIANCE_DOC_WRITE: 'npd.compliance_doc.write',
  /** NPD formulation draft creation permission; PRD 01-NPD §2.2, §18. */
  NPD_FORMULATION_CREATE_DRAFT: 'npd.formulation.create_draft',
  /** NPD formulation lock permission; PRD 01-NPD §2.2, §18. */
  NPD_FORMULATION_LOCK: 'npd.formulation.lock',
  /** NPD formulation unlock (locked -> draft) permission; A6, gated by e-sign. */
  NPD_FORMULATION_UNLOCK: 'npd.formulation.unlock',
  /** NPD recipe trial submission permission; PRD 01-NPD §2.2, §18. */
  NPD_RECIPE_SUBMIT_FOR_TRIAL: 'npd.recipe.submit_for_trial',
  /** NPD pilot BOM promotion permission; PRD 01-NPD §2.2, §18. */
  NPD_PILOT_PROMOTE_TO_BOM: 'npd.pilot.promote_to_bom',
  /** NPD planning write permission; seeded by NPD planning migrations. */
  NPD_PLANNING_WRITE: 'npd.planning.write',
  /** NPD gate advancement permission; PRD 01-NPD §2.2, §17.9. */
  NPD_GATE_ADVANCE: 'npd.gate.advance',
  /** NPD gate approval permission; PRD 01-NPD §2.2, §17.9. */
  NPD_GATE_APPROVE: 'npd.gate.approve',
  /** NPD BOM export permission; PRD 01-NPD §2.2, §18, §19. */
  NPD_BOM_EXPORT: 'npd.bom.export',

  // NPD Fala-3 stage permissions (formulation read + packaging/trial/pilot/handoff stages)
  /** NPD formulation read permission (Fala-3; fixes the live Gate-5 formulation gap); PRD 01-NPD §2.2, §18. */
  NPD_FORMULATION_READ: 'npd.formulation.read',
  /** NPD packaging stage read permission; PRD 01-NPD §2.2 (Packaging stage). */
  NPD_PACKAGING_READ: 'npd.packaging.read',
  /** NPD packaging stage write permission; PRD 01-NPD §2.2 (Packaging stage). */
  NPD_PACKAGING_WRITE: 'npd.packaging.write',
  /** NPD trial stage read permission; PRD 01-NPD §2.2 (Trial stage). */
  NPD_TRIAL_READ: 'npd.trial.read',
  /** NPD trial stage write permission; PRD 01-NPD §2.2 (Trial stage). */
  NPD_TRIAL_WRITE: 'npd.trial.write',
  /** NPD pilot stage read permission; PRD 01-NPD §2.2 (Pilot stage). */
  NPD_PILOT_READ: 'npd.pilot.read',
  /** NPD pilot stage write permission; PRD 01-NPD §2.2 (Pilot stage). */
  NPD_PILOT_WRITE: 'npd.pilot.write',
  /** NPD handoff stage read permission; PRD 01-NPD §2.2 (Handoff stage). */
  NPD_HANDOFF_READ: 'npd.handoff.read',
  /** NPD handoff promote-to-factory permission; PRD 01-NPD §2.2 (Handoff stage). */
  NPD_HANDOFF_PROMOTE: 'npd.handoff.promote',

  // GDPR
  /** GDPR Art.17 right-to-erasure execution (admin); PRD 01-NPD §15 Compliance + Foundation §15 GDPR. Gates the redact-user Server Action (T-089). */
  GDPR_ERASURE_EXECUTE: 'gdpr.erasure.execute',

  // Technical (03-technical / factory specification)
  /** Technical item-master create permission; PRD 03-TECHNICAL §3 (RBAC). */
  TECHNICAL_ITEMS_CREATE: 'technical.items.create',
  /** Technical item-master edit permission; PRD 03-TECHNICAL §3 (RBAC). */
  TECHNICAL_ITEMS_EDIT: 'technical.items.edit',
  /** Technical item-master deactivate permission; PRD 03-TECHNICAL §3 (RBAC). */
  TECHNICAL_ITEMS_DEACTIVATE: 'technical.items.deactivate',
  /** Technical shared-BOM create permission; PRD 03-TECHNICAL §3 (RBAC). */
  TECHNICAL_BOM_CREATE: 'technical.bom.create',
  /** Technical shared-BOM approval permission (draft→technical_approved); PRD 03-TECHNICAL §3 (RBAC). */
  TECHNICAL_BOM_APPROVE: 'technical.bom.approve',
  /** Technical shared-BOM version publish permission; PRD 03-TECHNICAL §3 (RBAC). */
  TECHNICAL_BOM_VERSION_PUBLISH: 'technical.bom.version_publish',
  /** Technical shared-BOM batch generation permission; PRD 03-TECHNICAL §3 (RBAC). */
  TECHNICAL_BOM_GENERATE_BATCH: 'technical.bom.generate_batch',
  /** Technical allergen profile edit permission; PRD 03-TECHNICAL §3 (RBAC). */
  TECHNICAL_ALLERGENS_EDIT: 'technical.allergens.edit',
  /** Technical cost-per-kg edit permission (dual-owned with finance); PRD 03-TECHNICAL §3 (RBAC). */
  TECHNICAL_COST_EDIT: 'technical.cost.edit',
  /** Technical D365 sync trigger permission; PRD 03-TECHNICAL §3 (RBAC). */
  TECHNICAL_D365_SYNC_TRIGGER: 'technical.d365.sync_trigger',
  /** Technical ECO/change-control authoring permission; PRD 03-TECHNICAL change control. */
  TECHNICAL_ECO_WRITE: 'technical.eco.write',
  /** Technical ECO/change-control approval permission; PRD 03-TECHNICAL change control. */
  TECHNICAL_ECO_APPROVE: 'technical.eco.approve',
  /** Technical sensory read permission (Technical owns sensory; consumed read-only by NPD); PRD 03-TECHNICAL §5, §17 (T-084/T-092). */
  TECHNICAL_SENSORY_READ: 'technical.sensory.read',
  /** Technical factory-spec recall correction permission; Wave R4 reversibility. */
  TECHNICAL_FACTORY_SPEC_RECALL: 'technical.factory_spec.recall',

  // Production (08-production)
  /** Production WO start permission; PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_WO_START: 'production.wo.start',
  /** Production WO pause permission; PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_WO_PAUSE: 'production.wo.pause',
  /** Production WO resume permission; PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_WO_RESUME: 'production.wo.resume',
  /** Production WO complete permission; PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_WO_COMPLETE: 'production.wo.complete',
  /** Production WO financial close permission; PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_WO_CLOSE: 'production.wo.close',
  /** Production WO cancel permission; seeded by migration 225. */
  PRODUCTION_WO_CANCEL: 'production.wo.cancel',
  /** Production material consumption write permission; PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_CONSUMPTION_WRITE: 'production.consumption.write',
  /** Production over-consumption approval permission (supervisor); PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_CONSUMPTION_OVERRIDE_APPROVE: 'production.consumption.override_approve',
  /** Production material consumption correction permission; seeded by corrections migrations. */
  PRODUCTION_CONSUMPTION_CORRECT: 'production.consumption.correct',
  /** Production output write permission; PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_OUTPUT_WRITE: 'production.output.write',
  /** Production catch-weight override permission (supervisor); PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_OUTPUT_CATCH_WEIGHT_OVERRIDE: 'production.output.catch_weight_override',
  /** Production output correction permission; seeded by corrections migrations. */
  PRODUCTION_OUTPUT_CORRECT: 'production.output.correct',
  /** Production waste write permission; PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_WASTE_WRITE: 'production.waste.write',
  /** Production over-threshold waste approval permission (supervisor); PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_WASTE_OVERTHRESHOLD_APPROVE: 'production.waste.overthreshold_approve',
  /** Production waste correction permission; seeded by corrections migrations. */
  PRODUCTION_WASTE_CORRECT: 'production.waste.correct',
  /** Production closed-WO correction permission; seeded by corrections migrations. */
  PRODUCTION_CORRECTIONS_CLOSED_WO: 'production.corrections.closed_wo',
  /** Production downtime write permission; PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_DOWNTIME_WRITE: 'production.downtime.write',
  /** Production downtime taxonomy edit permission (admin); PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_DOWNTIME_TAXONOMY_EDIT: 'production.downtime.taxonomy_edit',
  /** Production changeover write permission; PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_CHANGEOVER_WRITE: 'production.changeover.write',
  /** Production allergen-gate first-signer permission (SoD); PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_ALLERGEN_GATE_SIGN_FIRST: 'production.allergen_gate.sign_first',
  /** Production allergen-gate second-signer permission (SoD); PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_ALLERGEN_GATE_SIGN_SECOND: 'production.allergen_gate.sign_second',
  /** Production D365 DLQ replay permission; PRD 08-PRODUCTION §12 (RBAC). */
  PRODUCTION_D365_DLQ_REPLAY: 'production.d365_dlq.replay',
  /** Production OEE read permission; PRD 08-PRODUCTION §13 (RBAC). */
  PRODUCTION_OEE_READ: 'production.oee.read',

  // Warehouse (05-warehouse) — License Plate (LP) / GRN / FEFO / stock-move family.
  /** Warehouse LP create (per-warehouse numbering) permission; PRD 05-WAREHOUSE §5.2, §7. */
  WAREHOUSE_LP_CREATE: 'warehouse.lp.create',
  /** Warehouse LP split permission; PRD 05-WAREHOUSE §6.1, §8.2. */
  WAREHOUSE_LP_SPLIT: 'warehouse.lp.split',
  /** Warehouse LP merge (catch-weight sum) permission; PRD 05-WAREHOUSE §6.1. */
  WAREHOUSE_LP_MERGE: 'warehouse.lp.merge',
  /** Warehouse LP reserve (RM root only) permission; PRD 05-WAREHOUSE §6.1, §10. */
  WAREHOUSE_LP_RESERVE: 'warehouse.lp.reserve',
  /** Warehouse LP consume-to-WO permission (gated by 09-quality T-064); PRD 05-WAREHOUSE §6.1. */
  WAREHOUSE_LP_CONSUME: 'warehouse.lp.consume',
  /** Warehouse LP block (qa hold) permission; PRD 05-WAREHOUSE §6.1. */
  WAREHOUSE_LP_BLOCK: 'warehouse.lp.block',
  /** Warehouse LP ship transition permission; PRD 05-WAREHOUSE §6.1, §13. */
  WAREHOUSE_LP_SHIP: 'warehouse.lp.ship',
  /** Warehouse LP force-unlock (WH-101, elevated) permission; PRD 05-WAREHOUSE §6.6. */
  WAREHOUSE_LP_FORCE_UNLOCK: 'warehouse.lp.force_unlock',
  /** Warehouse GRN receive (from PO/TO) permission; PRD 05-WAREHOUSE §7. */
  WAREHOUSE_GRN_RECEIVE: 'warehouse.grn.receive',
  /** Warehouse receipt correction permission; Wave R4 corrections foundation. */
  WAREHOUSE_RECEIPT_CORRECT: 'warehouse.receipt.correct',
  /** Warehouse transfer receive reversal correction permission; Wave R4 reversibility. */
  WAREHOUSE_TRANSFER_CORRECT: 'warehouse.transfer.correct',
  /** Warehouse stock move permission; PRD 05-WAREHOUSE §8. */
  WAREHOUSE_STOCK_MOVE: 'warehouse.stock.move',
  /** Warehouse stock adjustment (>10% manager-approval gate) permission; PRD 05-WAREHOUSE §8.7. */
  WAREHOUSE_STOCK_ADJUST: 'warehouse.stock.adjust',
  /** Warehouse inventory browser read permission (server-side value gate); PRD 05-WAREHOUSE §14. */
  WAREHOUSE_INVENTORY_READ: 'warehouse.inventory.read',
  /** Warehouse FEFO deviation override (reason_code required) permission; PRD 05-WAREHOUSE §9.3. */
  WAREHOUSE_FEFO_OVERRIDE: 'warehouse.fefo.override',
  /** Warehouse spare-parts stock read permission (wave-B, soft cross-link to 13-maintenance). */
  WAREHOUSE_SPARE_PARTS_READ: 'warehouse.spare_parts.read',
  /** Warehouse spare-parts stock adjust (issue/receipt/adjustment) permission (wave-B). */
  WAREHOUSE_SPARE_PARTS_ADJUST: 'warehouse.spare_parts.adjust',

  // Quality (09-quality) — hold / spec / inspection / NCR / HACCP / batch-release / dashboard family.
  /** Quality hold create permission; PRD 09-QUALITY §2.3, §6.3 (quality_holds). */
  QUALITY_HOLD_CREATE: 'quality.hold.create',
  /** Quality hold release (e-signature) permission; PRD 09-QUALITY §2.3, §6.3. */
  QUALITY_HOLD_RELEASE: 'quality.hold.release',
  /** Quality specification approve (e-signature) permission; PRD 09-QUALITY §2.3, §6.3. */
  QUALITY_SPEC_APPROVE: 'quality.spec.approve',
  /** Quality inspection execute (record results + sign) permission; PRD 09-QUALITY §2.3. */
  QUALITY_INSPECTION_EXECUTE: 'quality.inspection.execute',
  /** Quality inspection assign (QA-031A) permission; PRD 09-QUALITY §8 QA-031A. */
  QUALITY_INSPECTION_ASSIGN: 'quality.inspection.assign',
  /** Quality NCR create permission; PRD 09-QUALITY §2.3, §6.3 (ncr_reports). */
  QUALITY_NCR_CREATE: 'quality.ncr.create',
  /** Quality NCR close-critical (dual-sign) permission; PRD 09-QUALITY §6.3 (critical close SoD). */
  QUALITY_NCR_CLOSE_CRITICAL: 'quality.ncr.close_critical',
  /** Quality CCP deviation override permission; PRD 09-QUALITY §6.3 (HACCP). */
  QUALITY_CCP_DEVIATION_OVERRIDE: 'quality.ccp.deviation_override',
  /** Quality HACCP plan edit permission; PRD 09-QUALITY §6.3 (haccp_plans). */
  QUALITY_HACCP_PLAN_EDIT: 'quality.haccp.plan_edit',
  /** Quality batch release permission; PRD 09-QUALITY §2.3 (batch release gate). */
  QUALITY_BATCH_RELEASE: 'quality.batch.release',
  /** Quality dashboard view permission; PRD 09-QUALITY §8 QA-001 (base read). */
  QUALITY_DASHBOARD_VIEW: 'quality.dashboard.view',
  /** Record cold-chain condition checks and temperature readings. */
  QUALITY_COLDCHAIN_RECORD: 'quality.coldchain.record',
  /** Manage product temperature range settings and cold-chain configuration. */
  QUALITY_COLDCHAIN_MANAGE: 'quality.coldchain.manage',
  /** Quality settings edit (QA-060) permission; PRD 09-QUALITY §8 QA-060. */
  QUALITY_SETTINGS_EDIT: 'quality.settings.edit',
  /** Quality audit export (7y auditor) permission; PRD 09-QUALITY §2.2. */
  QUALITY_AUDIT_EXPORT: 'quality.audit.export',

  // Finance (10-finance) — standard cost / WO actual costing / FIFO+WAC valuation / variance /
  // D365 stage-5 export-only family. Strings match ^fin\.[a-z_]+\.[a-z_]+$ (F11 rule #19).
  /** Finance settings (finance_settings / cost_centers / FX / GL mappings) read; PRD 10-FINANCE §3. */
  FIN_SETTINGS_VIEW: 'fin.settings.view',
  /** Finance settings edit; PRD 10-FINANCE §3. */
  FIN_SETTINGS_EDIT: 'fin.settings.edit',
  /** Standard cost read; PRD 10-FINANCE §3, §5. */
  FIN_STANDARD_COST_VIEW: 'fin.standard_cost.view',
  /** Standard cost create/edit (draft); PRD 10-FINANCE §3, §5. */
  FIN_STANDARD_COST_EDIT: 'fin.standard_cost.edit',
  /** Standard cost approve (21 CFR Part 11 SHA-256 e-signature); PRD 10-FINANCE §3, §5. */
  FIN_STANDARD_COST_APPROVE: 'fin.standard_cost.approve',
  /** WO actual costing read; PRD 10-FINANCE §3, §7. */
  FIN_ACTUAL_COST_VIEW: 'fin.actual_cost.view',
  /** Finance cost surfaces read; minimal sitemap RBAC family, 2026-06-09 audit. */
  FIN_COSTS_READ: 'fin.costs.read',
  /** Finance cost surfaces manage; minimal sitemap RBAC family, 2026-06-09 audit. */
  FIN_COSTS_MANAGE: 'fin.costs.manage',
  /** Inventory valuation read; minimal sitemap RBAC family, 2026-06-09 audit. */
  FIN_VALUATION_READ: 'fin.valuation.read',
  /** Inventory valuation (FIFO/WAC) read; PRD 10-FINANCE §3, §7. */
  FIN_VALUATION_VIEW: 'fin.valuation.view',
  /** Monthly valuation close (period freeze); PRD 10-FINANCE §3, §7. */
  FIN_VALUATION_CLOSE: 'fin.valuation.close',
  /** Cost variance read; minimal sitemap RBAC family, 2026-06-09 audit. */
  FIN_VARIANCE_READ: 'fin.variance.read',
  /** Cost variance read; PRD 10-FINANCE §3, §7. */
  FIN_VARIANCE_VIEW: 'fin.variance.view',
  /** Cost variance finalize; PRD 10-FINANCE §3, §7. */
  FIN_VARIANCE_FINALIZE: 'fin.variance.finalize',
  /** Finance dashboard read; PRD 10-FINANCE §3 (FIN-001). */
  FIN_DASHBOARD_VIEW: 'fin.dashboard.view',
  /** Finance cost reporting suite read; PRD 10-FINANCE §3 (FIN-011). */
  FIN_REPORTS_VIEW: 'fin.reports.view',
  /** D365 finance export (stage-5 export-only) view; PRD 10-FINANCE §6 (R15). */
  FIN_D365_VIEW: 'fin.d365.view',
  /** D365 finance DLQ replay (admin-only, V-FIN-INT-05); PRD 10-FINANCE §6. */
  FIN_D365_DLQ_REPLAY: 'fin.d365_dlq.replay',

  // 13-maintenance (CMMS) permission family (T-001); PRD 13-MAINTENANCE §4 RBAC matrix. 17 flat
  // dot-namespaced strings (no derived matrix, Foundation §3 [D2]). Seeded to the org-admin role
  // family + maintenance operator roles by migration 202.
  /** Maintenance asset/equipment read; PRD 13-MAINTENANCE §4. */
  MNT_ASSET_READ: 'mnt.asset.read',
  /** Maintenance asset/equipment edit; PRD 13-MAINTENANCE §4. */
  MNT_ASSET_EDIT: 'mnt.asset.edit',
  /** Maintenance asset/equipment deactivate; PRD 13-MAINTENANCE §4. */
  MNT_ASSET_DEACTIVATE: 'mnt.asset.deactivate',
  /** Maintenance work-request submit (MWO state=requested); PRD 13-MAINTENANCE §4. */
  MNT_MWO_REQUEST: 'mnt.mwo.request',
  /** Maintenance work-order approve; PRD 13-MAINTENANCE §4. */
  MNT_MWO_APPROVE: 'mnt.mwo.approve',
  /** Maintenance work-order assign to technician; PRD 13-MAINTENANCE §4. */
  MNT_MWO_ASSIGN: 'mnt.mwo.assign',
  /** Maintenance work-order execute (start/progress checklist); PRD 13-MAINTENANCE §4. */
  MNT_MWO_EXECUTE: 'mnt.mwo.execute',
  /** Maintenance work-order close sign-off (e-sign); PRD 13-MAINTENANCE §4, §11.2. */
  MNT_MWO_SIGN: 'mnt.mwo.sign',
  /** Maintenance work-order cancel; PRD 13-MAINTENANCE §4. */
  MNT_MWO_CANCEL: 'mnt.mwo.cancel',
  /** Maintenance PM schedule create; PRD 13-MAINTENANCE §4. */
  MNT_PM_CREATE: 'mnt.pm.create',
  /** Maintenance PM occurrence skip; PRD 13-MAINTENANCE §4. */
  MNT_PM_SKIP: 'mnt.pm.skip',
  /** Maintenance calibration record; PRD 13-MAINTENANCE §4, §14.3. */
  MNT_CALIB_RECORD: 'mnt.calib.record',
  /** Maintenance calibration certificate upload; PRD 13-MAINTENANCE §4, §14.3. */
  MNT_CALIB_UPLOAD_CERT: 'mnt.calib.upload_cert',
  /** Maintenance spare-part consume; PRD 13-MAINTENANCE §4. */
  MNT_SPARE_CONSUME: 'mnt.spare.consume',
  /** Maintenance spare-part stock adjust; PRD 13-MAINTENANCE §4. */
  MNT_SPARE_ADJUST: 'mnt.spare.adjust',
  /** Maintenance spare-part reorder; PRD 13-MAINTENANCE §4. */
  MNT_SPARE_REORDER: 'mnt.spare.reorder',
  /** Maintenance LOTO apply (lockout, dual e-sign actor 1); PRD 13-MAINTENANCE §4, OSHA 1910.147. */
  MNT_LOTO_APPLY: 'mnt.loto.apply',
  /** Maintenance LOTO clear (release, dual e-sign actor 2); PRD 13-MAINTENANCE §4, OSHA 1910.147. */
  MNT_LOTO_CLEAR: 'mnt.loto.clear',

  // OEE (15-oee) — read-mostly analytics family. PRD 15-OEE §3 (Personas & Roles), §15.3.
  // 15-OEE is a READ-ONLY consumer of oee_snapshots (D-OEE-1: 08-production is the sole
  // producer). These strings gate dashboards, drilldowns, targets, exports + admin screens.
  /** OEE dashboards/drilldowns read permission; PRD 15-OEE §3, §15.3. */
  OEE_DASHBOARD_READ: 'oee.dashboard.read',
  /** OEE target/threshold edit permission; PRD 15-OEE §3, §15.3 OEE-ADM-001. */
  OEE_TARGET_EDIT: 'oee.target.edit',
  /** OEE manual override create permission; PRD 15-OEE §3. */
  OEE_OVERRIDE_CREATE: 'oee.override.create',
  /** OEE manual override delete permission; PRD 15-OEE §3. */
  OEE_OVERRIDE_DELETE: 'oee.override.delete',
  /** OEE CSV export permission; PRD 15-OEE §3. */
  OEE_EXPORT_CSV: 'oee.export.csv',
  /** OEE PDF export permission; PRD 15-OEE §3. */
  OEE_EXPORT_PDF: 'oee.export.pdf',
  /** OEE anomaly acknowledge permission (P2 workflow); PRD 15-OEE §3. */
  OEE_ANOMALY_ACKNOWLEDGE: 'oee.anomaly.acknowledge',
  /** OEE big-loss mapping edit permission; PRD 15-OEE §3, §15.4 OEE-M-005. */
  OEE_BIG_LOSS_MAP_EDIT: 'oee.big_loss.map_edit',
  /** OEE shift-pattern edit permission; PRD 15-OEE §3, §15.3 OEE-ADM-003. */
  OEE_SHIFT_PATTERN_EDIT: 'oee.shift_pattern.edit',
  /** OEE shift-pattern read permission; PRD 15-OEE §3, §15.3 OEE-ADM-002/003. */
  OEE_SHIFT_PATTERN_READ: 'oee.shift_pattern.read',
  /** OEE downtime annotate permission; PRD 15-OEE §3. */
  OEE_DOWNTIME_ANNOTATE: 'oee.downtime.annotate',
  /** OEE downtime escalate permission; PRD 15-OEE §3. */
  OEE_DOWNTIME_ESCALATE: 'oee.downtime.escalate',
  /** OEE TV/kiosk dashboard view permission (P2); PRD 15-OEE §3, §15.3. */
  OEE_TV_KIOSK_VIEW: 'oee.tv.kiosk_view',
  // Shipping (11-shipping) — SO / hold / allocation / pick / pack / ship / BOL / RMA / DLQ family.
  /** Shipping SO create (draft) permission; PRD 11-SHIPPING §3, V-SHIP-SO-01. */
  SHIP_SO_CREATE: 'ship.so.create',
  /** Shipping SO confirm permission; PRD 11-SHIPPING §3, §6 D-SHP-8, V-SHIP-SO-03. */
  SHIP_SO_CONFIRM: 'ship.so.confirm',
  /** Shipping SO cancel permission; PRD 11-SHIPPING §3, V-SHIP-SO-07. */
  SHIP_SO_CANCEL: 'ship.so.cancel',
  /** Shipping hold place (soft/credit/QA) permission; PRD 11-SHIPPING §10.2. */
  SHIP_HOLD_PLACE: 'ship.hold.place',
  /** Shipping hold release permission; PRD 11-SHIPPING §10.2. */
  SHIP_HOLD_RELEASE: 'ship.hold.release',
  /** Shipping allocation override (FEFO/expired/QA w/ reason) permission; PRD 11-SHIPPING §6 D-SHP-13. */
  SHIP_ALLOC_OVERRIDE: 'ship.alloc.override',
  /** Shipping allergen-override (QA cascade conflict) permission; PRD 11-SHIPPING §9.2, V-SHIP-SO-03. */
  SHIP_ALLERGEN_OVERRIDE: 'ship.allergen.override',
  /** Shipping pick execute (scanner) permission; PRD 11-SHIPPING §3, V-SHIP-PICK-01. */
  SHIP_PICK_EXECUTE: 'ship.pick.execute',
  /** Shipping pack close (finalize SSCC) permission; PRD 11-SHIPPING §13.1, V-SHIP-PACK-02. */
  SHIP_PACK_CLOSE: 'ship.pack.close',
  /** Shipping ship confirm (atomic outbox enqueue) permission; PRD 11-SHIPPING §6 D-SHP-14. */
  SHIP_SHIP_CONFIRM: 'ship.ship.confirm',
  /** Shipping BOL sign (upload signed BOL, BRCGS 7y) permission; PRD 11-SHIPPING §14.4, V-SHIP-LBL-04. */
  SHIP_BOL_SIGN: 'ship.bol.sign',
  /** Shipping RMA disposition permission; PRD 11-SHIPPING §8.5, V-SHIP-RMA-02. */
  SHIP_RMA_DISPOSITION: 'ship.rma.disposition',
  /** Shipping dashboard view permission; PRD 11-SHIPPING §15.1 SHIP-022. */
  SHIP_DASHBOARD_VIEW: 'ship.dashboard.view',
  /** Shipping DLQ replay (ops) permission; PRD 11-SHIPPING §12.6. */
  SHIP_DLQ_REPLAY: 'ship.dlq.replay',
  // Reporting (12-reporting) — read-heavy dashboard / export / preset / schedule / settings family.
  // 12-reporting is a READ-MOSTLY CONSUMER: it owns NO canonical fact table; these strings gate the
  // dashboard read-models + export engine + saved-report config it DOES own. PRD 12-REPORTING §3, §11.
  /** Reporting dashboard view (base read for every RPT-* screen); PRD 12-REPORTING §3, §15. */
  RPT_DASHBOARD_VIEW: 'rpt.dashboard.view',
  /** Reporting CSV export permission (V-RPT-EXPORT-*); PRD 12-REPORTING §3, §11. */
  RPT_EXPORT_CSV: 'rpt.export.csv',
  /** Reporting PDF export permission (V-RPT-EXPORT-*); PRD 12-REPORTING §3, §11. */
  RPT_EXPORT_PDF: 'rpt.export.pdf',
  /** Reporting saved-filter preset save permission (RPT-018); PRD 12-REPORTING §3, §15.1a. */
  RPT_PRESET_SAVE: 'rpt.preset.save',
  /** Reporting saved-filter preset share permission (team visibility); PRD 12-REPORTING §3. */
  RPT_PRESET_SHARE: 'rpt.preset.share',
  /** Reporting saved-filter preset delete permission; PRD 12-REPORTING §3. */
  RPT_PRESET_DELETE: 'rpt.preset.delete',
  /** Reporting scheduled-export create (P2, flag-gated at rule layer); PRD 12-REPORTING §3, §4.2. */
  RPT_SCHEDULE_CREATE: 'rpt.schedule.create',
  /** Reporting scheduled-export run-now (P2); PRD 12-REPORTING §3, §4.2. */
  RPT_SCHEDULE_RUN_NOW: 'rpt.schedule.run_now',
  /** Reporting scheduled-export delete (P2); PRD 12-REPORTING §3, §4.2. */
  RPT_SCHEDULE_DELETE: 'rpt.schedule.delete',
  /** Reporting settings read (RPT-SETTINGS admin tabs); PRD 12-REPORTING §3, §15. */
  RPT_SETTINGS_READ: 'rpt.settings.read',
  /** Reporting settings edit (RPT-SETTINGS admin tabs); PRD 12-REPORTING §3, §15. */
  RPT_SETTINGS_EDIT: 'rpt.settings.edit',
  /** Reporting force MV refresh permission (RPT refresh-confirm modal); PRD 12-REPORTING §3, §9. */
  RPT_MV_REFRESH: 'rpt.mv.refresh',
  /** Reporting integration-health admin read (RPT-009); PRD 12-REPORTING §3, §12.2. */
  RPT_INTEGRATION_READ: 'rpt.integration.read',
  /** Reporting rules-usage analytics read (RPT-010); PRD 12-REPORTING §3, §9.1. */
  RPT_RULES_USAGE_READ: 'rpt.rules_usage.read',
  // Multi-site (14-multi-site) — sites / site-access / IST / lanes / rate-cards / replication /
  // conflict / activation / config-promote / cross-site-audit family.
  /** Multi-site site view permission; PRD 14-MULTI-SITE §10B MS-101..104, §10C MS-114. */
  MULTI_SITE_SITE_VIEW: 'multi_site.site.view',
  /** Multi-site site create permission; PRD 14-MULTI-SITE §10B MS-101, §13.5 activation. */
  MULTI_SITE_SITE_CREATE: 'multi_site.site.create',
  /** Multi-site site edit permission; PRD 14-MULTI-SITE §10C MS-114, MS-115. */
  MULTI_SITE_SITE_EDIT: 'multi_site.site.edit',
  /** Multi-site site decommission permission; PRD 14-MULTI-SITE §10B MS-104, V-MS-21. */
  MULTI_SITE_SITE_DECOMMISSION: 'multi_site.site.decommission',
  /** Multi-site site-access assign permission; PRD 14-MULTI-SITE §10B MS-101. */
  MULTI_SITE_SITE_ACCESS_ASSIGN: 'multi_site.site_access.assign',
  /** Multi-site site-access revoke permission; PRD 14-MULTI-SITE §10B MS-101. */
  MULTI_SITE_SITE_ACCESS_REVOKE: 'multi_site.site_access.revoke',
  /** Multi-site site-access bulk-assign permission; PRD 14-MULTI-SITE §10B MS-101. */
  MULTI_SITE_SITE_ACCESS_BULK_ASSIGN: 'multi_site.site_access.bulk_assign',
  /** Multi-site site-settings override permission; PRD 14-MULTI-SITE §10B MS-102. */
  MULTI_SITE_SITE_SETTINGS_OVERRIDE: 'multi_site.site_settings.override',
  /** Multi-site site-settings clear permission; PRD 14-MULTI-SITE §10B MS-102. */
  MULTI_SITE_SITE_SETTINGS_CLEAR: 'multi_site.site_settings.clear',
  /** Multi-site IST create permission; PRD 14-MULTI-SITE §10A.5 / 05-WH cross-ref. */
  MULTI_SITE_IST_CREATE: 'multi_site.ist.create',
  /** Multi-site IST amend permission; PRD 14-MULTI-SITE §10B MS-107, V-MS-23. */
  MULTI_SITE_IST_AMEND: 'multi_site.ist.amend',
  /** Multi-site IST cancel permission; PRD 14-MULTI-SITE §10B MS-107. */
  MULTI_SITE_IST_CANCEL: 'multi_site.ist.cancel',
  /** Multi-site IST approve permission; PRD 14-MULTI-SITE §11.3 V-MS-10/11. */
  MULTI_SITE_IST_APPROVE: 'multi_site.ist.approve',
  /** Multi-site transport-lane create permission; PRD 14-MULTI-SITE §10A.5. */
  MULTI_SITE_LANE_CREATE: 'multi_site.lane.create',
  /** Multi-site transport-lane edit permission; PRD 14-MULTI-SITE §10A.5. */
  MULTI_SITE_LANE_EDIT: 'multi_site.lane.edit',
  /** Multi-site transport-lane deactivate permission; PRD 14-MULTI-SITE §10A.5, V-MS-29. */
  MULTI_SITE_LANE_DEACTIVATE: 'multi_site.lane.deactivate',
  /** Multi-site rate-card upload permission; PRD 14-MULTI-SITE §10A.5. */
  MULTI_SITE_RATE_CARD_UPLOAD: 'multi_site.rate_card.upload',
  /** Multi-site rate-card approve permission; PRD 14-MULTI-SITE §10A.3.3 / §10A.5. */
  MULTI_SITE_RATE_CARD_APPROVE: 'multi_site.rate_card.approve',
  /** Multi-site rate-card delete permission; PRD 14-MULTI-SITE §10A.5. */
  MULTI_SITE_RATE_CARD_DELETE: 'multi_site.rate_card.delete',
  /** Multi-site replication retry permission; PRD 14-MULTI-SITE §10B MS-106, V-MS-22. */
  MULTI_SITE_REPLICATION_RETRY: 'multi_site.replication.retry',
  /** Multi-site replication run-sync permission; PRD 14-MULTI-SITE §10B MS-106. */
  MULTI_SITE_REPLICATION_RUN_SYNC: 'multi_site.replication.run_sync',
  /** Multi-site replication conflict-resolve permission; PRD 14-MULTI-SITE §10B MS-103, V-MS-30. */
  MULTI_SITE_CONFLICT_RESOLVE: 'multi_site.conflict.resolve',
  /** Multi-site activation start permission; PRD 14-MULTI-SITE §13.5 D-MS-14, V-MS-18. */
  MULTI_SITE_ACTIVATION_START: 'multi_site.activation.start',
  /** Multi-site activation rollback permission; PRD 14-MULTI-SITE §10B MS-108, V-MS-20. */
  MULTI_SITE_ACTIVATION_ROLLBACK: 'multi_site.activation.rollback',
  /** Multi-site config promote permission; PRD 14-MULTI-SITE §10B MS-105, D-MS-17. */
  MULTI_SITE_CONFIG_PROMOTE: 'multi_site.config.promote',
  /** Multi-site cross-site read (super-admin audit) permission; PRD 14-MULTI-SITE §14.2. */
  MULTI_SITE_CROSS_SITE_READ: 'multi_site.cross_site.read',

  // Planning-Extended (07-planning-ext) — finite-capacity scheduler + changeover-matrix + logistics family.
  /** Scheduler dashboard / run-history read permission; PRD 07-PLANNING-EXT §3.1, §5.1. */
  SCHEDULER_RUN_READ: 'scheduler.run.read',
  /** Dispatch a finite-capacity solver run permission; PRD 07-PLANNING-EXT §5.1, §9.2. */
  SCHEDULER_RUN_DISPATCH: 'scheduler.run.dispatch',
  /** Approve a solver-produced WO assignment permission; PRD 07-PLANNING-EXT §9.3, §15.4. */
  SCHEDULER_ASSIGNMENT_APPROVE: 'scheduler.assignment.approve',
  /** Override a solver-produced assignment (reason_code audited) permission; PRD 07-PLANNING-EXT §9.3. */
  SCHEDULER_ASSIGNMENT_OVERRIDE: 'scheduler.assignment.override',
  /** Reject a solver-produced assignment permission; PRD 07-PLANNING-EXT §9.3. */
  SCHEDULER_ASSIGNMENT_REJECT: 'scheduler.assignment.reject',
  /** Bulk-approve solver assignments (approve-all) permission; PRD 07-PLANNING-EXT §9.3. */
  SCHEDULER_ASSIGNMENT_BULK_APPROVE: 'scheduler.assignment.bulk_approve',
  /** Changeover-matrix read permission; PRD 07-PLANNING-EXT §9.4. */
  SCHEDULER_MATRIX_READ: 'scheduler.matrix.read',
  /** Changeover-matrix edit (draft cell edits) permission; PRD 07-PLANNING-EXT §9.4, §6 D5. */
  SCHEDULER_MATRIX_EDIT: 'scheduler.matrix.edit',
  /** Changeover-matrix publish (activate a version, SoD vs edit) permission; PRD 07-PLANNING-EXT §9.4. */
  SCHEDULER_MATRIX_PUBLISH: 'scheduler.matrix.publish',
  /** Scheduler config (finite-capacity params) edit permission; PRD 07-PLANNING-EXT §5.1 (PLE-005). */
  SCHEDULER_CONFIG_EDIT: 'scheduler.config.edit',
  /** Demand-forecast read permission; PRD 07-PLANNING-EXT §4.1 (PLE forecast). */
  SCHEDULER_FORECAST_READ: 'scheduler.forecast.read',
  /** Demand-forecast write (manual CSV upload) permission; PRD 07-PLANNING-EXT §4.1 (PLE forecast). */
  SCHEDULER_FORECAST_WRITE: 'scheduler.forecast.write',
  /** Run the basic MRP netting loop and persist MRP suggestions. */
  PLANNING_MRP_RUN: 'planning.mrp.run',
  /** Convert MRP planned orders to canonical PO/WO drafts. */
  PLANNING_MRP_CONVERT: 'planning.mrp.convert',
  /** Manage planning forecasts used as MRP/MPS demand inputs. */
  PLANNING_FORECAST_MANAGE: 'planning.forecast.manage',
  /** Manage yard operations: docking, vehicle assignments, and gate movements. */
  YARD_MANAGE: 'yard.manage',
  /** Manage freight shipments, carrier assignments, and delivery scheduling. */
  FREIGHT_MANAGE: 'freight.manage',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_SETTINGS_CORE_PERMISSIONS = [
  Permission.SETTINGS_ORG_READ,
  Permission.SETTINGS_ORG_UPDATE,
  Permission.SETTINGS_USERS_CREATE,
  Permission.SETTINGS_USERS_DEACTIVATE,
  Permission.SETTINGS_USERS_INVITE,
  Permission.SETTINGS_USERS_MANAGE,
  Permission.SETTINGS_ROLES_ASSIGN,
  Permission.SETTINGS_AUDIT_READ,
  Permission.SETTINGS_IMPERSONATE_TENANT,
] as readonly Permission[];

export const ALL_SETTINGS_EXT_PERMISSIONS = [
  Permission.SETTINGS_SCHEMA_VIEW,
  Permission.SETTINGS_SCHEMA_EDIT,
  Permission.SETTINGS_SCHEMA_PROMOTE_L1,
  Permission.SETTINGS_RULES_VIEW,
  Permission.SETTINGS_REFERENCE_VIEW,
  Permission.SETTINGS_REFERENCE_EDIT,
  Permission.SETTINGS_REFERENCE_IMPORT,
  Permission.SETTINGS_INFRA_VIEW,
  Permission.SETTINGS_INFRA_EDIT,
  Permission.SETTINGS_D365_VIEW,
  Permission.SETTINGS_D365_EDIT,
  Permission.SETTINGS_D365_TOGGLE,
  Permission.SETTINGS_EMAIL_VIEW,
  Permission.SETTINGS_EMAIL_EDIT,
  Permission.SETTINGS_ONBOARDING_COMPLETE,
  Permission.SETTINGS_SECURITY_EDIT,
  Permission.SETTINGS_SECURITY_MANAGE,
  Permission.SETTINGS_SSO_VIEW,
  Permission.SETTINGS_SSO_EDIT,
  Permission.SETTINGS_SCIM_VIEW,
  Permission.SETTINGS_SCIM_EDIT,
  Permission.SETTINGS_IP_ALLOWLIST_VIEW,
  Permission.SETTINGS_IP_ALLOWLIST_EDIT,
  Permission.SETTINGS_FLAGS_VIEW,
  Permission.SETTINGS_FLAGS_EDIT,
  Permission.SETTINGS_AUTHORIZATION_VIEW,
  Permission.SETTINGS_AUTHORIZATION_EDIT,
  Permission.NPD_RELEASED_PRODUCT_EDIT_REQUEST,
  Permission.NPD_RELEASED_PRODUCT_EDIT_AUTHORIZE,
  Permission.TECHNICAL_PRODUCT_SPEC_APPROVE,
] as readonly Permission[];

export const ALL_NPD_PERMISSIONS = [
  Permission.BRIEF_CREATE,
  Permission.NPD_PROJECT_DELETE,
  Permission.NPD_CORE_WRITE,
  Permission.NPD_DASHBOARD_VIEW,
  Permission.NPD_D365_BUILDER_EXECUTE,
  Permission.NPD_CLOSED_FLAG_UNSET,
  Permission.NPD_SCHEMA_EDIT,
  Permission.NPD_RULE_EDIT,
  Permission.NPD_RISK_WRITE,
  Permission.NPD_ALLERGEN_WRITE,
  Permission.NPD_COMPLIANCE_DOC_WRITE,
  Permission.NPD_FORMULATION_CREATE_DRAFT,
  Permission.NPD_FORMULATION_LOCK,
  Permission.NPD_RECIPE_SUBMIT_FOR_TRIAL,
  Permission.NPD_PILOT_PROMOTE_TO_BOM,
  Permission.NPD_PLANNING_WRITE,
  Permission.NPD_GATE_ADVANCE,
  Permission.NPD_GATE_APPROVE,
  Permission.NPD_BOM_EXPORT,
  Permission.NPD_FORMULATION_READ,
  Permission.NPD_PACKAGING_READ,
  Permission.NPD_PACKAGING_WRITE,
  Permission.NPD_TRIAL_READ,
  Permission.NPD_TRIAL_WRITE,
  Permission.NPD_PILOT_READ,
  Permission.NPD_PILOT_WRITE,
  Permission.NPD_HANDOFF_READ,
  Permission.NPD_HANDOFF_PROMOTE,
  Permission.GDPR_ERASURE_EXECUTE,
] as readonly Permission[];

/**
 * Technical (03-technical) module permission group; PRD 03-TECHNICAL §3 (RBAC).
 * The `technical.product_spec.approve` workflow-authorization string remains in
 * ALL_SETTINGS_EXT_PERMISSIONS (Settings/Auth-owned PO decision); this group covers
 * the 10 page/action permissions added by T-091. Recognised by the ESLint enum-lock
 * guard via the ALL_<MODULE>_PERMISSIONS export convention (02-settings T-130).
 */
export const ALL_TECHNICAL_PERMISSIONS = [
  Permission.TECHNICAL_ITEMS_CREATE,
  Permission.TECHNICAL_ITEMS_EDIT,
  Permission.TECHNICAL_ITEMS_DEACTIVATE,
  Permission.TECHNICAL_BOM_CREATE,
  Permission.TECHNICAL_BOM_APPROVE,
  Permission.TECHNICAL_BOM_VERSION_PUBLISH,
  Permission.TECHNICAL_BOM_GENERATE_BATCH,
  Permission.TECHNICAL_ALLERGENS_EDIT,
  Permission.TECHNICAL_COST_EDIT,
  Permission.TECHNICAL_D365_SYNC_TRIGGER,
  Permission.TECHNICAL_ECO_WRITE,
  Permission.TECHNICAL_ECO_APPROVE,
  Permission.TECHNICAL_SENSORY_READ,
  Permission.TECHNICAL_FACTORY_SPEC_RECALL,
] as readonly Permission[];

/**
 * Production (08-production) module permission group; PRD 08-PRODUCTION §3.2 (RBAC) +
 * §12 (D365 DLQ) + §13 (OEE). 23 page/action permissions. Allergen gate is split into
 * first/second signer to enforce SoD (dual sign-off cannot share a permission grant).
 * Recognised by the ESLint enum-lock guard via the ALL_<MODULE>_PERMISSIONS export
 * convention (02-settings T-130). Seeded to roles by migration 185.
 */
export const ALL_PRODUCTION_PERMISSIONS = [
  Permission.PRODUCTION_WO_START,
  Permission.PRODUCTION_WO_PAUSE,
  Permission.PRODUCTION_WO_RESUME,
  Permission.PRODUCTION_WO_COMPLETE,
  Permission.PRODUCTION_WO_CLOSE,
  Permission.PRODUCTION_WO_CANCEL,
  Permission.PRODUCTION_CONSUMPTION_WRITE,
  Permission.PRODUCTION_CONSUMPTION_OVERRIDE_APPROVE,
  Permission.PRODUCTION_CONSUMPTION_CORRECT,
  Permission.PRODUCTION_OUTPUT_WRITE,
  Permission.PRODUCTION_OUTPUT_CATCH_WEIGHT_OVERRIDE,
  Permission.PRODUCTION_OUTPUT_CORRECT,
  Permission.PRODUCTION_WASTE_WRITE,
  Permission.PRODUCTION_WASTE_OVERTHRESHOLD_APPROVE,
  Permission.PRODUCTION_WASTE_CORRECT,
  Permission.PRODUCTION_CORRECTIONS_CLOSED_WO,
  Permission.PRODUCTION_DOWNTIME_WRITE,
  Permission.PRODUCTION_DOWNTIME_TAXONOMY_EDIT,
  Permission.PRODUCTION_CHANGEOVER_WRITE,
  Permission.PRODUCTION_ALLERGEN_GATE_SIGN_FIRST,
  Permission.PRODUCTION_ALLERGEN_GATE_SIGN_SECOND,
  Permission.PRODUCTION_D365_DLQ_REPLAY,
  Permission.PRODUCTION_OEE_READ,
] as readonly Permission[];

/**
 * Warehouse (05-warehouse) module permission group; PRD 05-WAREHOUSE §5.2/§6/§7/§8/§9/§13/§14.
 * 13 LP/GRN/FEFO/stock-move page/action permissions (T-058). Recognised by the ESLint enum-lock
 * guard via the ALL_<MODULE>_PERMISSIONS export convention (02-settings T-130). Seeded to the
 * org-admin role family + warehouse operator/scanner roles by migration 192.
 */
export const ALL_WAREHOUSE_PERMISSIONS = [
  Permission.WAREHOUSE_LP_CREATE,
  Permission.WAREHOUSE_LP_SPLIT,
  Permission.WAREHOUSE_LP_MERGE,
  Permission.WAREHOUSE_LP_RESERVE,
  Permission.WAREHOUSE_LP_CONSUME,
  Permission.WAREHOUSE_LP_BLOCK,
  Permission.WAREHOUSE_LP_SHIP,
  Permission.WAREHOUSE_LP_FORCE_UNLOCK,
  Permission.WAREHOUSE_GRN_RECEIVE,
  Permission.WAREHOUSE_RECEIPT_CORRECT,
  Permission.WAREHOUSE_TRANSFER_CORRECT,
  Permission.WAREHOUSE_STOCK_MOVE,
  Permission.WAREHOUSE_STOCK_ADJUST,
  Permission.WAREHOUSE_INVENTORY_READ,
  Permission.WAREHOUSE_FEFO_OVERRIDE,
  Permission.WAREHOUSE_SPARE_PARTS_READ,
  Permission.WAREHOUSE_SPARE_PARTS_ADJUST,
] as readonly Permission[];

/**
 * Quality (09-quality) module permission group; PRD 09-QUALITY §2.3 (RBAC matrix) + §6.3 (NCR/HACCP)
 * + §8 (QA-031A inspection.assign, QA-060 settings) + §2.2 (auditor 7y export). 15 page/action
 * permissions (T-065). Allergen dual-sign is owned by 08-PRODUCTION
 * (production.allergen_gate.sign_{first,second}) and is NOT re-declared here. Recognised by the
 * ESLint enum-lock guard via the ALL_<MODULE>_PERMISSIONS export convention (02-settings T-130).
 * Seeded to the org-admin role family + QA inspector/lead roles by migration 198.
 */
export const ALL_QUALITY_PERMISSIONS = [
  Permission.QUALITY_HOLD_CREATE,
  Permission.QUALITY_HOLD_RELEASE,
  Permission.QUALITY_SPEC_APPROVE,
  Permission.QUALITY_INSPECTION_EXECUTE,
  Permission.QUALITY_INSPECTION_ASSIGN,
  Permission.QUALITY_NCR_CREATE,
  Permission.QUALITY_NCR_CLOSE_CRITICAL,
  Permission.QUALITY_CCP_DEVIATION_OVERRIDE,
  Permission.QUALITY_HACCP_PLAN_EDIT,
  Permission.QUALITY_BATCH_RELEASE,
  Permission.QUALITY_DASHBOARD_VIEW,
  Permission.QUALITY_COLDCHAIN_RECORD,
  Permission.QUALITY_COLDCHAIN_MANAGE,
  Permission.QUALITY_SETTINGS_EDIT,
  Permission.QUALITY_AUDIT_EXPORT,
] as readonly Permission[];

/**
 * Finance (10-finance) module permission group; PRD 10-FINANCE §3 (RBAC) + §5 (standard cost) +
 * §7 (WO actual costing + FIFO/WAC valuation + variance) + §6 (D365 stage-5 export-only, R15).
 * 18 page/action permissions. Standard-cost approve + variance finalize + valuation close +
 * D365 DLQ replay are the elevated/SoD strings. Recognised by the ESLint enum-lock guard via the
 * ALL_<MODULE>_PERMISSIONS export convention (02-settings T-130). Seeded to the org-admin role
 * family + a finance operator role family by migration 199.
 */
export const ALL_FINANCE_PERMISSIONS = [
  Permission.FIN_SETTINGS_VIEW,
  Permission.FIN_SETTINGS_EDIT,
  Permission.FIN_STANDARD_COST_VIEW,
  Permission.FIN_STANDARD_COST_EDIT,
  Permission.FIN_STANDARD_COST_APPROVE,
  Permission.FIN_ACTUAL_COST_VIEW,
  Permission.FIN_COSTS_READ,
  Permission.FIN_COSTS_MANAGE,
  Permission.FIN_VALUATION_READ,
  Permission.FIN_VALUATION_VIEW,
  Permission.FIN_VALUATION_CLOSE,
  Permission.FIN_VARIANCE_READ,
  Permission.FIN_VARIANCE_VIEW,
  Permission.FIN_VARIANCE_FINALIZE,
  Permission.FIN_DASHBOARD_VIEW,
  Permission.FIN_REPORTS_VIEW,
  Permission.FIN_D365_VIEW,
  Permission.FIN_D365_DLQ_REPLAY,
] as readonly Permission[];

/**
 * Maintenance (13-maintenance) module permission group; PRD 13-MAINTENANCE §4 RBAC matrix.
 * 17 asset/MWO/PM/calibration/spare/LOTO page+action permissions (T-001). Recognised by the
 * ESLint enum-lock guard via the ALL_<MODULE>_PERMISSIONS export convention (02-settings T-130).
 * Seeded to the org-admin role family + maintenance operator/technician roles by migration 202.
 */
export const ALL_MAINTENANCE_PERMISSIONS = [
  Permission.MNT_ASSET_READ,
  Permission.MNT_ASSET_EDIT,
  Permission.MNT_ASSET_DEACTIVATE,
  Permission.MNT_MWO_REQUEST,
  Permission.MNT_MWO_APPROVE,
  Permission.MNT_MWO_ASSIGN,
  Permission.MNT_MWO_EXECUTE,
  Permission.MNT_MWO_SIGN,
  Permission.MNT_MWO_CANCEL,
  Permission.MNT_PM_CREATE,
  Permission.MNT_PM_SKIP,
  Permission.MNT_CALIB_RECORD,
  Permission.MNT_CALIB_UPLOAD_CERT,
  Permission.MNT_SPARE_CONSUME,
  Permission.MNT_SPARE_ADJUST,
  Permission.MNT_SPARE_REORDER,
  Permission.MNT_LOTO_APPLY,
  Permission.MNT_LOTO_CLEAR,
] as readonly Permission[];

/**
 * OEE (15-oee) module permission group; PRD 15-OEE §3 (RBAC matrix) + §15.3 (admin screens).
 * 13 read-mostly analytics page/action permissions (T-001). 15-OEE is a READ-ONLY consumer of
 * oee_snapshots (D-OEE-1). Recognised by the ESLint enum-lock guard via the
 * ALL_<MODULE>_PERMISSIONS export convention (02-settings T-130). Seeded to the org-admin role
 * family + oee viewer/supervisor/admin roles by migration 203.
 */
export const ALL_OEE_PERMISSIONS = [
  Permission.OEE_DASHBOARD_READ,
  Permission.OEE_TARGET_EDIT,
  Permission.OEE_OVERRIDE_CREATE,
  Permission.OEE_OVERRIDE_DELETE,
  Permission.OEE_EXPORT_CSV,
  Permission.OEE_EXPORT_PDF,
  Permission.OEE_ANOMALY_ACKNOWLEDGE,
  Permission.OEE_BIG_LOSS_MAP_EDIT,
  Permission.OEE_SHIFT_PATTERN_EDIT,
  Permission.OEE_SHIFT_PATTERN_READ,
  Permission.OEE_DOWNTIME_ANNOTATE,
  Permission.OEE_DOWNTIME_ESCALATE,
  Permission.OEE_TV_KIOSK_VIEW,
] as readonly Permission[];

/**
 * Shipping (11-shipping) module permission group; PRD 11-SHIPPING §3 (Personas & Roles) + §6
 * (D-SHP-8 SO status machine, D-SHP-13 hold gate, D-SHP-14 ship confirm) + §10 (quality hold
 * integration) + §13.1 (SSCC-18 pack) + §14.4 (BRCGS BOL retention) + §12.6 (DLQ ops). 14
 * page/action permissions (T-031). Allergen override is the QA cascade-conflict gate
 * (ship.allergen.override) and is distinct from 08-PRODUCTION's allergen changeover dual-sign.
 * Recognised by the ESLint enum-lock guard via the ALL_<MODULE>_PERMISSIONS export convention
 * (02-settings T-130). Seeded to the org-admin role family + shipping operator roles by migration 212.
 */
export const ALL_SHIP_PERMISSIONS = [
  Permission.SHIP_SO_CREATE,
  Permission.SHIP_SO_CONFIRM,
  Permission.SHIP_SO_CANCEL,
  Permission.SHIP_HOLD_PLACE,
  Permission.SHIP_HOLD_RELEASE,
  Permission.SHIP_ALLOC_OVERRIDE,
  Permission.SHIP_ALLERGEN_OVERRIDE,
  Permission.SHIP_PICK_EXECUTE,
  Permission.SHIP_PACK_CLOSE,
  Permission.SHIP_SHIP_CONFIRM,
  Permission.SHIP_BOL_SIGN,
  Permission.SHIP_RMA_DISPOSITION,
  Permission.SHIP_DASHBOARD_VIEW,
  Permission.SHIP_DLQ_REPLAY,
] as readonly Permission[];

/**
 * Reporting (12-reporting) module permission group; PRD 12-REPORTING §3 (Personas & Roles + RBAC
 * mapping) + §11 (V-RPT-ACCESS-*). 14 dashboard/export/preset/schedule/settings page+action
 * permissions (T-001). 12-reporting is a READ-MOSTLY CONSUMER — it owns NO canonical fact table; the
 * four reporting roles (viewer / operator / manager / admin) map to subsets of these strings.
 * `rpt.schedule.*` are P2 stubs whose feature is flag-gated at the rule layer (not here).
 * Recognised by the ESLint enum-lock guard via the ALL_<MODULE>_PERMISSIONS export convention
 * (02-settings T-130). Seeded to the org-admin role family + reporting roles by migration 214.
 */
export const ALL_REPORTING_CORE_PERMISSIONS = [
  Permission.RPT_DASHBOARD_VIEW,
  Permission.RPT_EXPORT_CSV,
  Permission.RPT_EXPORT_PDF,
  Permission.RPT_PRESET_SAVE,
  Permission.RPT_PRESET_SHARE,
  Permission.RPT_PRESET_DELETE,
  Permission.RPT_SCHEDULE_CREATE,
  Permission.RPT_SCHEDULE_RUN_NOW,
  Permission.RPT_SCHEDULE_DELETE,
  Permission.RPT_SETTINGS_READ,
  Permission.RPT_SETTINGS_EDIT,
  Permission.RPT_MV_REFRESH,
  Permission.RPT_INTEGRATION_READ,
  Permission.RPT_RULES_USAGE_READ,
] as readonly Permission[];

/**
 * Multi-site (14-multi-site) module permission group; PRD 14-MULTI-SITE §10A.5 (lane/rate-card RBAC)
 * + §10B MS-101..110 (admin/operational surfaces) + §11.5 (activation) + §14.2 (super-admin audit).
 * 26 page/action permissions (T-031). Recognised by the ESLint enum-lock guard via the
 * ALL_<MODULE>_PERMISSIONS export convention (02-settings T-130). Seeded to the org-admin role family
 * + site-manager operator roles by migration 216.
 */
export const ALL_MULTI_SITE_PERMISSIONS = [
  Permission.MULTI_SITE_SITE_VIEW,
  Permission.MULTI_SITE_SITE_CREATE,
  Permission.MULTI_SITE_SITE_EDIT,
  Permission.MULTI_SITE_SITE_DECOMMISSION,
  Permission.MULTI_SITE_SITE_ACCESS_ASSIGN,
  Permission.MULTI_SITE_SITE_ACCESS_REVOKE,
  Permission.MULTI_SITE_SITE_ACCESS_BULK_ASSIGN,
  Permission.MULTI_SITE_SITE_SETTINGS_OVERRIDE,
  Permission.MULTI_SITE_SITE_SETTINGS_CLEAR,
  Permission.MULTI_SITE_IST_CREATE,
  Permission.MULTI_SITE_IST_AMEND,
  Permission.MULTI_SITE_IST_CANCEL,
  Permission.MULTI_SITE_IST_APPROVE,
  Permission.MULTI_SITE_LANE_CREATE,
  Permission.MULTI_SITE_LANE_EDIT,
  Permission.MULTI_SITE_LANE_DEACTIVATE,
  Permission.MULTI_SITE_RATE_CARD_UPLOAD,
  Permission.MULTI_SITE_RATE_CARD_APPROVE,
  Permission.MULTI_SITE_RATE_CARD_DELETE,
  Permission.MULTI_SITE_REPLICATION_RETRY,
  Permission.MULTI_SITE_REPLICATION_RUN_SYNC,
  Permission.MULTI_SITE_CONFLICT_RESOLVE,
  Permission.MULTI_SITE_ACTIVATION_START,
  Permission.MULTI_SITE_ACTIVATION_ROLLBACK,
  Permission.MULTI_SITE_CONFIG_PROMOTE,
  Permission.MULTI_SITE_CROSS_SITE_READ,
] as readonly Permission[];

/**
 * Planning-Extended (07-planning-ext) module permission group; PRD 07-PLANNING-EXT §3.1, §5.1,
 * §9 (scheduler runs / assignments / changeover matrix / config / forecast + logistics). 17 page/action
 * permissions. assignment.approve vs assignment.override are distinct grants (SoD); matrix.edit
 * (draft) vs matrix.publish (activate) are distinct grants (SoD). Recognised by the ESLint
 * enum-lock guard via the ALL_<MODULE>_PERMISSIONS export convention (02-settings T-130).
 * Seeded to the org-admin role family + planner/scheduler roles by migration 205.
 */
export const ALL_SCHEDULER_PERMISSIONS = [
  Permission.SCHEDULER_RUN_READ,
  Permission.SCHEDULER_RUN_DISPATCH,
  Permission.SCHEDULER_ASSIGNMENT_APPROVE,
  Permission.SCHEDULER_ASSIGNMENT_OVERRIDE,
  Permission.SCHEDULER_ASSIGNMENT_REJECT,
  Permission.SCHEDULER_ASSIGNMENT_BULK_APPROVE,
  Permission.SCHEDULER_MATRIX_READ,
  Permission.SCHEDULER_MATRIX_EDIT,
  Permission.SCHEDULER_MATRIX_PUBLISH,
  Permission.SCHEDULER_CONFIG_EDIT,
  Permission.SCHEDULER_FORECAST_READ,
  Permission.SCHEDULER_FORECAST_WRITE,
  Permission.PLANNING_MRP_RUN,
  Permission.PLANNING_MRP_CONVERT,
  Permission.PLANNING_FORECAST_MANAGE,
  Permission.YARD_MANAGE,
  Permission.FREIGHT_MANAGE,
] as readonly Permission[];

export const LegacyPermissionAlias = {
  'fa.create': Permission.FG_CREATE,
  'fa.edit': Permission.FG_EDIT,
  'brief.convert_to_fa': Permission.BRIEF_CONVERT_TO_NPD_PROJECT,
} as const;

export type LegacyPermissionAlias = keyof typeof LegacyPermissionAlias;

export const ALL_PERMISSIONS = Object.values(Permission) as readonly Permission[];

// O(1) membership lookup for isPermission(). Mirrors the `canonicalEvents` Set
// idiom in packages/outbox/src/events.enum.ts. Built once at module load from
// the same source of truth (ALL_PERMISSIONS), so membership semantics are
// identical to the previous Array.includes scan — just constant-time instead of
// an O(n) linear scan over ~140 permission strings.
const PERMISSION_SET: ReadonlySet<string> = new Set(ALL_PERMISSIONS);

export const SOD_EXCLUSIVE_PAIRS = [
  [Permission.ORG_ACCESS_ADMIN, Permission.ORG_SCHEMA_ADMIN],
] as const;

export function normalizePermission(input: string): Permission {
  if (isPermission(input)) {
    return input;
  }

  if (isLegacyPermissionAlias(input)) {
    return LegacyPermissionAlias[input];
  }

  throw new Error(`Unknown permission string: ${input}`);
}

function isPermission(input: string): input is Permission {
  return PERMISSION_SET.has(input);
}

function isLegacyPermissionAlias(input: string): input is LegacyPermissionAlias {
  return Object.prototype.hasOwnProperty.call(LegacyPermissionAlias, input);
}
