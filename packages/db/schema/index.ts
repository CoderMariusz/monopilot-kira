export { tenants, organizations, users, outboxEvents, outboxDeadLetter } from './baseline.js';
export { tenantMigrations } from './tenant-migrations.js';
export { eSignLog } from './e-sign.js';
export { gdprErasureRequests } from './gdpr.js';
export { orgAuthorizationPolicies } from './settings-auth-policies.js';
export { unitOfMeasure, uomCustomConversions } from './units.js';
export { integrationSettings } from './integration-settings.js';
export { d365SyncRuns } from './integrations-d365.js';
export { d365Constants } from './d365-constants.js';
export type { D365Constant, NewD365Constant } from './d365-constants.js';
export { alertThresholds } from './alert-thresholds.js';
export type { AlertThreshold, NewAlertThreshold } from './alert-thresholds.js';
export { d365ImportCache, d365ImportCacheMeta } from './d365-import-cache.js';
export type {
  D365ImportCache,
  D365ImportCacheMeta,
  NewD365ImportCache,
} from './d365-import-cache.js';
export { emailDeliveryLog } from './email-log.js';
export { featureFlagsCore, notificationPreferences } from './flags-prefs.js';
export { loginAttempts, orgSecurityPolicies, passwordHistory } from './security.js';
export { scimTokens } from './sso-scim-ip.js';
export { product } from './product.js';
export type { NewProduct, Product } from './product.js';
export { items } from './items.js';
export type { Item, NewItem } from './items.js';
export { faBuilderOutputs } from './fa-builder-outputs.js';
export type { FaBuilderOutput, NewFaBuilderOutput } from './fa-builder-outputs.js';
export { faStatusOverall } from './fa-status-overall.js';
export type { FaStatusOverall } from './fa-status-overall.js';
export { dashboardSummary, launchAlerts, missingRequiredCols } from './dashboard-views.js';
export type {
  DashboardSummary,
  LaunchAlert,
  MissingRequiredCols,
} from './dashboard-views.js';
export { prodDetail } from './prod-detail.js';
export type { NewProdDetail, ProdDetail } from './prod-detail.js';
export { referenceDeptColumns } from './reference-dept-columns.js';
export type {
  NewReferenceDeptColumn,
  ReferenceDeptColumn,
} from './reference-dept-columns.js';
export { manufacturingOperations, referenceSchema } from './manufacturing-operations.js';
export type {
  ManufacturingOperation,
  NewManufacturingOperation,
} from './manufacturing-operations.js';
export {
  closeConfirm,
  equipmentSetupByLinePack,
  linesByPackSize,
  packSizes,
  templates,
} from './reference-lookups.js';
export type {
  CloseConfirm,
  EquipmentSetupByLinePack,
  LineByPackSize,
  NewCloseConfirm,
  NewEquipmentSetupByLinePack,
  NewLineByPackSize,
  NewPackSize,
  NewTemplate,
  PackSize,
  Template,
} from './reference-lookups.js';
export {
  referenceAllergens,
  referenceAllergensAddedByProcess,
  referenceAllergensByRm,
} from './allergens.js';
export { faAllergenOverrideAction, faAllergenOverrides } from './fa-allergen-overrides.js';
export type {
  FaAllergenOverride,
  NewFaAllergenOverride,
} from './fa-allergen-overrides.js';
export { allergenCascadeRebuildJobs } from './allergen-cascade-rebuild.js';
export type {
  AllergenCascadeRebuildJob,
  NewAllergenCascadeRebuildJob,
} from './allergen-cascade-rebuild.js';
export { npdProjects } from './npd-projects.js';
export type { NewNpdProject, NpdProject } from './npd-projects.js';
export { npdWipProcesses } from './npd-wip-processes.js';
export type { NewNpdWipProcess, NpdWipProcess } from './npd-wip-processes.js';
export { npdDepartmentField, npdDepartments, npdFieldCatalog } from './npd-dynamic-fields.js';
export type {
  NewNpdDepartment,
  NewNpdDepartmentField,
  NewNpdFieldCatalog,
  NpdDepartment,
  NpdDepartmentField,
  NpdFieldCatalog,
} from './npd-dynamic-fields.js';
export { gateChecklistItems } from './gate-checklist-items.js';
export type { GateChecklistItem, NewGateChecklistItem } from './gate-checklist-items.js';
// NPD project-stage tables (migrations 232-235)
export { packagingComponents } from './packaging-components.js';
export type { NewPackagingComponent, PackagingComponent } from './packaging-components.js';
// NPD FA Core multi-benchmark editor (migration 241)
export { faBenchmarks } from './fa-benchmarks.js';
export type { FaBenchmark, NewFaBenchmark } from './fa-benchmarks.js';
export { trialBatches } from './trial-batches.js';
export type { NewTrialBatch, TrialBatch } from './trial-batches.js';
export { pilotRunChecklistItems, pilotRunMaterials, pilotRuns } from './pilot-runs.js';
export type {
  NewPilotRun,
  NewPilotRunChecklistItem,
  NewPilotRunMaterial,
  PilotRun,
  PilotRunChecklistItem,
  PilotRunMaterial,
} from './pilot-runs.js';
export { handoffChecklistItems, handoffChecklists } from './handoff-checklists.js';
export type {
  HandoffChecklist,
  HandoffChecklistItem,
  NewHandoffChecklist,
  NewHandoffChecklistItem,
} from './handoff-checklists.js';
export { gateChecklistTemplates } from './gate-checklist-templates.js';
export type {
  GateChecklistTemplate,
  NewGateChecklistTemplate,
} from './gate-checklist-templates.js';
export { gateApprovals } from './gate-approvals.js';
export type { GateApproval, NewGateApproval } from './gate-approvals.js';
export {
  approvalChainStepSchema,
  approvalChainStepsSchema,
  approvalChainTemplates,
} from './approval-chain-templates.js';
export type {
  ApprovalChainStep,
  ApprovalChainTemplate,
  NewApprovalChainTemplate,
} from './approval-chain-templates.js';
export { costingBreakdowns, costingWaterfallSteps } from './costing.js';
export type {
  CostingBreakdown,
  CostingWaterfallStep,
  NewCostingBreakdown,
  NewCostingWaterfallStep,
} from './costing.js';
export { risks } from './risks.js';
export type { NewRisk, Risk } from './risks.js';
export { complianceDocs } from './compliance-docs.js';
export type { ComplianceDoc, NewComplianceDoc } from './compliance-docs.js';
export { bomCoProducts, bomHeaders, bomLines, bomSnapshots } from './shared-bom.js';
export type {
  BomCoProduct,
  BomHeader,
  BomLine,
  BomSnapshot,
  NewBomCoProduct,
  NewBomHeader,
  NewBomLine,
  NewBomSnapshot,
} from './shared-bom.js';
export { factoryReleaseStatus } from './factory-release-status.js';
export type {
  FactoryReleaseStatus,
  NewFactoryReleaseStatus,
} from './factory-release-status.js';
export { npdLegacyCloseout } from './npd-legacy-closeout.js';
export type {
  NewNpdLegacyCloseout,
  NpdLegacyCloseout,
} from './npd-legacy-closeout.js';
export {
  formulationAuditLog,
  formulationCalcCache,
  formulationIngredients,
  formulations,
  formulationVersions,
} from './formulations.js';
export type {
  Formulation,
  FormulationAuditLog,
  FormulationCalcCache,
  FormulationIngredient,
  FormulationVersion,
  NewFormulation,
  NewFormulationAuditLog,
  NewFormulationCalcCache,
  NewFormulationIngredient,
  NewFormulationVersion,
} from './formulations.js';
export {
  nutriScoreResults,
  nutritionAllergens,
  nutritionProfiles,
  referenceNutrients,
} from './nutrition.js';
export type {
  NewNutriScoreResult,
  NewNutritionAllergen,
  NewNutritionProfile,
  NewReferenceNutrient,
  NutriScoreResult,
  NutritionAllergen,
  NutritionProfile,
  ReferenceNutrient,
} from './nutrition.js';

// ── 03-technical Wave-A schema (migrations 159-167) ──────────────────────────
export { itemCostHistory } from './cost-history.js';
export type { ItemCostHistory, NewItemCostHistory } from './cost-history.js';
export {
  allergenContaminationRisk,
  itemAllergenProfileOverrides,
  itemAllergenProfiles,
  manufacturingOperationAllergenAdditions,
} from './item-allergens.js';
export type {
  AllergenContaminationRisk,
  ItemAllergenProfile,
  ItemAllergenProfileOverride,
  ManufacturingOperationAllergenAddition,
  NewAllergenContaminationRisk,
  NewItemAllergenProfile,
  NewItemAllergenProfileOverride,
  NewManufacturingOperationAllergenAddition,
} from './item-allergens.js';
export { labResults } from './lab.js';
export type { LabResult, NewLabResult } from './lab.js';
export { supplierSpecs, supplierSpecReviewProposals } from './supplier-specs.js';
export type {
  NewSupplierSpec,
  SupplierSpec,
  NewSupplierSpecReviewProposal,
  SupplierSpecReviewProposal,
} from './supplier-specs.js';
export { routingOperations, routings } from './routing.js';
export type { NewRouting, NewRoutingOperation, Routing, RoutingOperation } from './routing.js';
export { d365SyncDlq, d365SyncJobs } from './d365-sync.js';
export type { D365SyncDlqEntry, D365SyncJob, NewD365SyncDlqEntry, NewD365SyncJob } from './d365-sync.js';
export { factorySpecs } from './factory-specs.js';
export type { FactorySpec, NewFactorySpec } from './factory-specs.js';
export { technicalSensoryEvaluations } from './technical-sensory-evaluations.js';
export type {
  NewTechnicalSensoryEvaluation,
  TechnicalSensoryEvaluation,
} from './technical-sensory-evaluations.js';
export { technicalSensoryAttributeScores } from './technical-sensory-attribute-scores.js';
export type {
  NewTechnicalSensoryAttributeScore,
  TechnicalSensoryAttributeScore,
} from './technical-sensory-attribute-scores.js';
export { technicalSensoryPanelistComments } from './technical-sensory-panelist-comments.js';
export type {
  NewTechnicalSensoryPanelistComment,
  TechnicalSensoryPanelistComment,
} from './technical-sensory-panelist-comments.js';

// 04-planning-basic — scheduling-core schema (T-004 + T-005).
export { woMaterials, woOperations, workOrders } from './work-orders.js';
export type {
  NewWoMaterial,
  NewWoOperation,
  NewWorkOrder,
  WoMaterial,
  WoOperation,
  WorkOrder,
} from './work-orders.js';
export { scheduleOutputs, woDependencies, woStatusHistory } from './schedule-outputs.js';
export type {
  NewScheduleOutput,
  NewWoDependency,
  NewWoStatusHistory,
  ScheduleOutput,
  WoDependency,
  WoStatusHistory,
} from './schedule-outputs.js';
// 04-planning-basic — MRP-core (mig 178) + rough-cut capacity (mig 179).
export {
  mrpRuns,
  mrpRequirements,
  mrpPlannedOrders,
  reorderThresholds,
} from './planning-mrp.js';
export type {
  MrpRun,
  NewMrpRun,
  MrpRequirement,
  NewMrpRequirement,
  MrpPlannedOrder,
  NewMrpPlannedOrder,
  ReorderThreshold,
  NewReorderThreshold,
} from './planning-mrp.js';
export { capacityPlans, capacityPlanLines } from './planning-capacity.js';
export type {
  CapacityPlan,
  NewCapacityPlan,
  CapacityPlanLine,
  NewCapacityPlanLine,
} from './planning-capacity.js';

// 08-production execution core (migs 181/182): canonical wo_outputs (T-003), consumption (T-002), executions+events (T-022).
export { woOutputs, woMaterialConsumption, woExecutions, woEvents } from './production-execution.js';
export type { WoOutput, NewWoOutput, WoMaterialConsumption, NewWoMaterialConsumption, WoExecution, NewWoExecution, WoEvent, NewWoEvent } from './production-execution.js';
// 08-production waste/downtime/changeover/allergen/OEE (migs 183-185). oee_snapshots producer = 08 (D-OEE-1).
export { downtimeSourceEnum, woWasteLog, downtimeEvents, changeoverEvents, allergenChangeoverValidations, oeeSnapshots } from './production/index.js';
export type { WoWasteLog, NewWoWasteLog, DowntimeEvent, NewDowntimeEvent, ChangeoverEvent, NewChangeoverEvent, AllergenChangeoverValidation, NewAllergenChangeoverValidation, OeeSnapshot, NewOeeSnapshot } from './production/index.js';

// 05-warehouse — License Plate (LP) + FEFO inventory read model (migration 191). LP is the
// universal lot/quantity unit (ADR-001) consumed by 06-scanner / 08-production / 09-quality /
// 10-finance / 11-shipping. Soft FKs to warehouses/items/locations/work_orders avoid cycles.
export { licensePlates, vInventoryAvailable } from './warehouse-lp.js';
export type { LicensePlate, NewLicensePlate, InventoryAvailableRow } from './warehouse-lp.js';

// 09-quality — schema foundation (migration 197): quality_holds (+ v_active_holds consume-gate read
// model, T-064), quality_hold_items, ncr_reports, quality_specifications + quality_spec_parameters.
// v_active_holds is the canonical consume-gate source queried by 08-production / 05-warehouse /
// 11-shipping via holdsGuard. SECURITY INVOKER (RLS flows from quality_holds). Soft FKs to
// 02-settings reference rows / 03-technical items / 05-warehouse license_plates avoid cycles.
export {
  qualityHolds,
  qualityHoldItems,
  ncrReports,
  qualitySpecifications,
  qualitySpecParameters,
  vActiveHolds,
} from './quality.js';
export type {
  QualityHold,
  NewQualityHold,
  QualityHoldItem,
  NewQualityHoldItem,
  NcrReport,
  NewNcrReport,
  QualitySpecification,
  NewQualitySpecification,
  QualitySpecParameter,
  NewQualitySpecParameter,
  ActiveHoldRow,
} from './quality.js';
// 05-warehouse wave-B — LP-transition ledger (lp_state_history, T-019) + GRN/stock-movement
// (grns/grn_items/stock_moves, T-005/T-006) + spare-parts inventory (spare_parts_stock; soft
// cross-link to 13-maintenance) (migration 193). Builds on license_plates (191) via hard lp_id FK.
export { lpStateHistory, grns, grnItems, stockMoves, sparePartsStock } from './warehouse-waveb.js';
export type {
  LpStateHistory,
  NewLpStateHistory,
  Grn,
  NewGrn,
  GrnItem,
  NewGrnItem,
  StockMove,
  NewStockMove,
  SparePartStock,
  NewSparePartStock,
} from './warehouse-waveb.js';
// 10-finance live tables after migrations 402/404.
export { itemWacState, financeOutboxEvents } from './finance.js';
export type {
  ItemWacState,
  NewItemWacState,
  FinanceOutboxEvent,
  NewFinanceOutboxEvent,
} from './finance.js';
// 13-maintenance — CMMS schema foundation (migration 201). 15 tables: settings/technicians/
// equipment (T-002), schedules (T-003), MWO core + checklists + LOTO (T-004), spares ×4 (T-005),
// calibration/sanitation/history (T-006). org_id Wave0 lock; RLS via app.current_org_id();
// site_id REC-L1 day-1; soft FKs to 08-PROD/05-WH/02-SET avoid migration-ordering cycles.
export {
  maintenanceSettings,
  technicianProfiles,
  equipment,
  maintenanceSchedules,
  maintenanceWorkOrders,
  mwoChecklists,
  mwoLotoChecklists,
  spareParts,
  maintenanceSparePartsStock,
  sparePartsTransactions,
  mwoSpareParts,
  calibrationInstruments,
  calibrationRecords,
  sanitationChecklists,
  maintenanceHistory,
} from './maintenance.js';
export type {
  MaintenanceSettings,
  NewMaintenanceSettings,
  TechnicianProfile,
  NewTechnicianProfile,
  Equipment,
  NewEquipment,
  MaintenanceSchedule,
  NewMaintenanceSchedule,
  MaintenanceWorkOrder,
  NewMaintenanceWorkOrder,
  MwoChecklist,
  NewMwoChecklist,
  MwoLotoChecklist,
  NewMwoLotoChecklist,
  SparePart,
  NewSparePart,
  MaintenanceSparePartsStock,
  NewMaintenanceSparePartsStock,
  SparePartsTransaction,
  NewSparePartsTransaction,
  MwoSparePart,
  NewMwoSparePart,
  CalibrationInstrument,
  NewCalibrationInstrument,
  CalibrationRecord,
  NewCalibrationRecord,
  SanitationChecklist,
  NewSanitationChecklist,
  MaintenanceHistory,
  NewMaintenanceHistory,
} from './maintenance.js';
// 15-OEE — SCHEMA foundation (migration 203). READ-ONLY consumer of oee_snapshots +
// downtime_events (D-OEE-1: 08-production is the SOLE producer; 15-OEE never writes those).
// Owns reference/operational tables (shift_configs, oee_alert_thresholds, shift_patterns,
// org_non_production_days), the UNIVERSAL big_loss_categories taxonomy, and the two read-only
// MATERIALIZED VIEW rollups (oee_shift_metrics, oee_daily_summary).
export {
  shiftConfigs,
  oeeAlertThresholds,
  shiftPatterns,
  orgNonProductionDays,
  bigLossCategories,
  oeeShiftMetrics,
  oeeDailySummary,
} from './oee.js';
export type {
  ShiftConfig,
  NewShiftConfig,
  OeeAlertThreshold,
  NewOeeAlertThreshold,
  ShiftPattern,
  NewShiftPattern,
  OrgNonProductionDay,
  NewOrgNonProductionDay,
  BigLossCategory,
  OeeShiftMetric,
  OeeDailySummary,
} from './oee.js';

// 11-shipping — SCHEMA foundation (migration 211): customer domain, sales orders, inventory
// allocations, picking (waves/pick_lists/pick_list_lines), shipments (+ boxes + box_contents +
// per-org SSCC counter), and bill_of_lading. org_id Wave0 lock; RLS via app.current_org_id().
// The LP qa-status gate READS 09-quality v_active_holds via holdsGuard (never re-reads
// quality_holds); license_plates (05) is read-only here. Soft FKs to product (FG SSOT) /
// license_plates / locations / allergen_families avoid migration-ordering cycles.
export {
  customers,
  customerContacts,
  customerAddresses,
  customerAllergenRestrictions,
  salesOrders,
  salesOrderLines,
  inventoryAllocations,
  waves,
  pickLists,
  pickListLines,
  shipments,
  shipmentBoxes,
  shipmentBoxContents,
  billOfLading,
  ssccCounters,
} from './shipping.js';
export type {
  Customer,
  NewCustomer,
  CustomerContact,
  NewCustomerContact,
  CustomerAddress,
  NewCustomerAddress,
  CustomerAllergenRestriction,
  NewCustomerAllergenRestriction,
  SalesOrder,
  NewSalesOrder,
  SalesOrderLine,
  NewSalesOrderLine,
  InventoryAllocation,
  NewInventoryAllocation,
  Wave,
  NewWave,
  PickList,
  NewPickList,
  PickListLine,
  NewPickListLine,
  Shipment,
  NewShipment,
  ShipmentBox,
  NewShipmentBox,
  ShipmentBoxContent,
  NewShipmentBoxContent,
  BillOfLading,
  NewBillOfLading,
  SsccCounter,
  NewSsccCounter,
} from './shipping.js';

// 12-reporting — schema foundation (migrations 213 + 214). READ-MOSTLY CONSUMER.
// Reporting-owned config tables (report_definitions, saved_report_configs, scheduled_export_configs,
// saved_filter_presets, dashboards_catalog, report_exports, mv_refresh_log, report_access_audits) +
// READ-ONLY cross-module fact materialized views over the canonical producers (08 wo_outputs /
// oee_snapshots / downtime_events, 04 schedule_outputs, 05 license_plates, 09 quality_holds).
// Reporting creates NO base copy of those producer tables — the MVs only read them.
export {
  reportDefinitions,
  savedReportConfigs,
  scheduledExportConfigs,
  savedFilterPresets,
  dashboardsCatalog,
  reportExports,
  mvRefreshLog,
  reportAccessAudits,
  mvReportingProductionThroughput,
  mvReportingYieldByLineWeek,
  mvReportingOeeRollup,
  mvReportingQualityHoldRate,
  mvReportingDowntimeByLine,
  mvReportingScheduleAdherence,
  mvReportingInventoryAging,
} from './reporting.js';
export type {
  ReportDefinition,
  NewReportDefinition,
  SavedReportConfig,
  NewSavedReportConfig,
  ScheduledExportConfig,
  NewScheduledExportConfig,
  SavedFilterPreset,
  NewSavedFilterPreset,
  DashboardCatalogEntry,
  NewDashboardCatalogEntry,
  ReportExport,
  NewReportExport,
  MvRefreshLogRow,
  NewMvRefreshLogRow,
  ReportAccessAudit,
  NewReportAccessAudit,
} from './reporting.js';

// 14-multi-site — schema foundation (migrations 215 + 216): sites (T-002, physical-site registry),
// operational_tables (T-030 site-scoping registry contract), inter_site_transfer_orders (T-008 IST
// shell). The site-context primitive (app.current_site_id() / app.set_site_context()) is SQL-only in
// migration 215. sites is org master data (org-scoped); operational_tables is a global catalog;
// inter_site_transfer_orders is the one operational site-scoped table this module owns.
export { sites, operationalTables, interSiteTransferOrders } from './multi-site.js';
export type {
  Site,
  NewSite,
  OperationalTable,
  NewOperationalTable,
  InterSiteTransferOrder,
  NewInterSiteTransferOrder,
} from './multi-site.js';
export {
  siteInsertSchema,
  siteUpdateSchema,
  isValidIanaTimezone,
} from './sites.zod.js';
export type { SiteInsertInput, SiteUpdateInput } from './sites.zod.js';
// 07-planning-ext — finite-capacity scheduler engine + changeover-matrix external contract
// (consumed by 08-production) + extended capacity config (migration 204). Built ON the
// 04-planning-basic schema (migs 176-179). APPENDED at END to minimise merge collisions.
export {
  schedulerRuns,
  schedulerAssignments,
  changeoverMatrixVersions,
  changeoverMatrix,
  schedulerConfig,
} from './planning-ext/index.js';
export type {
  SchedulerRun,
  NewSchedulerRun,
  SchedulerAssignment,
  NewSchedulerAssignment,
  ChangeoverMatrixVersion,
  NewChangeoverMatrixVersion,
  ChangeoverMatrix,
  NewChangeoverMatrix,
  SchedulerConfig,
  NewSchedulerConfig,
} from './planning-ext/index.js';
