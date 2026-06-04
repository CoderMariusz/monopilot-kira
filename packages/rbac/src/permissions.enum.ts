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
  /** NPD recipe trial submission permission; PRD 01-NPD §2.2, §18. */
  NPD_RECIPE_SUBMIT_FOR_TRIAL: 'npd.recipe.submit_for_trial',
  /** NPD pilot BOM promotion permission; PRD 01-NPD §2.2, §18. */
  NPD_PILOT_PROMOTE_TO_BOM: 'npd.pilot.promote_to_bom',
  /** NPD gate advancement permission; PRD 01-NPD §2.2, §17.9. */
  NPD_GATE_ADVANCE: 'npd.gate.advance',
  /** NPD gate approval permission; PRD 01-NPD §2.2, §17.9. */
  NPD_GATE_APPROVE: 'npd.gate.approve',
  /** NPD BOM export permission; PRD 01-NPD §2.2, §18, §19. */
  NPD_BOM_EXPORT: 'npd.bom.export',

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

  // Production (08-production)
  /** Production WO start permission; PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_WO_START: 'production.wo.start',
  /** Production WO pause permission; PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_WO_PAUSE: 'production.wo.pause',
  /** Production WO resume permission; PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_WO_RESUME: 'production.wo.resume',
  /** Production WO complete permission; PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_WO_COMPLETE: 'production.wo.complete',
  /** Production material consumption write permission; PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_CONSUMPTION_WRITE: 'production.consumption.write',
  /** Production over-consumption approval permission (supervisor); PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_CONSUMPTION_OVERRIDE_APPROVE: 'production.consumption.override_approve',
  /** Production output write permission; PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_OUTPUT_WRITE: 'production.output.write',
  /** Production catch-weight override permission (supervisor); PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_OUTPUT_CATCH_WEIGHT_OVERRIDE: 'production.output.catch_weight_override',
  /** Production waste write permission; PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_WASTE_WRITE: 'production.waste.write',
  /** Production over-threshold waste approval permission (supervisor); PRD 08-PRODUCTION §3.2 (RBAC). */
  PRODUCTION_WASTE_OVERTHRESHOLD_APPROVE: 'production.waste.overthreshold_approve',
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
  Permission.NPD_GATE_ADVANCE,
  Permission.NPD_GATE_APPROVE,
  Permission.NPD_BOM_EXPORT,
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
] as readonly Permission[];

/**
 * Production (08-production) module permission group; PRD 08-PRODUCTION §3.2 (RBAC) +
 * §12 (D365 DLQ) + §13 (OEE). 17 page/action permissions. Allergen gate is split into
 * first/second signer to enforce SoD (dual sign-off cannot share a permission grant).
 * Recognised by the ESLint enum-lock guard via the ALL_<MODULE>_PERMISSIONS export
 * convention (02-settings T-130). Seeded to roles by migration 185.
 */
export const ALL_PRODUCTION_PERMISSIONS = [
  Permission.PRODUCTION_WO_START,
  Permission.PRODUCTION_WO_PAUSE,
  Permission.PRODUCTION_WO_RESUME,
  Permission.PRODUCTION_WO_COMPLETE,
  Permission.PRODUCTION_CONSUMPTION_WRITE,
  Permission.PRODUCTION_CONSUMPTION_OVERRIDE_APPROVE,
  Permission.PRODUCTION_OUTPUT_WRITE,
  Permission.PRODUCTION_OUTPUT_CATCH_WEIGHT_OVERRIDE,
  Permission.PRODUCTION_WASTE_WRITE,
  Permission.PRODUCTION_WASTE_OVERTHRESHOLD_APPROVE,
  Permission.PRODUCTION_DOWNTIME_WRITE,
  Permission.PRODUCTION_DOWNTIME_TAXONOMY_EDIT,
  Permission.PRODUCTION_CHANGEOVER_WRITE,
  Permission.PRODUCTION_ALLERGEN_GATE_SIGN_FIRST,
  Permission.PRODUCTION_ALLERGEN_GATE_SIGN_SECOND,
  Permission.PRODUCTION_D365_DLQ_REPLAY,
  Permission.PRODUCTION_OEE_READ,
] as readonly Permission[];

export const LegacyPermissionAlias = {
  'fa.create': Permission.FG_CREATE,
  'fa.edit': Permission.FG_EDIT,
  'brief.convert_to_fa': Permission.BRIEF_CONVERT_TO_NPD_PROJECT,
} as const;

export type LegacyPermissionAlias = keyof typeof LegacyPermissionAlias;

export const ALL_PERMISSIONS = Object.values(Permission) as readonly Permission[];

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
  return (ALL_PERMISSIONS as readonly string[]).includes(input);
}

function isLegacyPermissionAlias(input: string): input is LegacyPermissionAlias {
  return Object.prototype.hasOwnProperty.call(LegacyPermissionAlias, input);
}
