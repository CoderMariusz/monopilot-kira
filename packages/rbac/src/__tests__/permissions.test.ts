import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../../..');
const permissionsModulePath = resolve(repoRoot, 'packages/rbac/src/permissions.enum.ts');
const codeownersPath = resolve(repoRoot, 'CODEOWNERS');

const expectedSettingsCorePermissions = [
  'settings.org.read',
  'settings.org.update',
  'settings.users.create',
  'settings.users.deactivate',
  'settings.users.invite',
  'settings.users.manage',
  'settings.roles.assign',
  'settings.audit.read',
  'settings.impersonate.tenant',
] as const;

const expectedSettingsExtPermissions = [
  'settings.schema.view',
  'settings.schema.edit',
  'settings.schema.promote_l1',
  'settings.rules.view',
  'settings.reference.view',
  'settings.reference.edit',
  'settings.reference.import',
  'settings.infra.view',
  'settings.infra.edit',
  'settings.d365.view',
  'settings.d365.edit',
  'settings.d365.toggle',
  'settings.email.view',
  'settings.email.edit',
  'settings.onboarding.complete',
  'settings.security.edit',
  'settings.security.manage',
  'settings.sso.view',
  'settings.sso.edit',
  'settings.scim.view',
  'settings.scim.edit',
  'settings.ip_allowlist.view',
  'settings.ip_allowlist.edit',
  'settings.flags.view',
  'settings.flags.edit',
  'settings.authorization.view',
  'settings.authorization.edit',
  'npd.released_product_edit.request',
  'npd.released_product_edit.authorize',
  'technical.product_spec.approve',
] as const;

const expectedWorkflowAuthorizationPermissions = [
  'settings.authorization.view',
  'settings.authorization.edit',
  'npd.released_product_edit.request',
  'npd.released_product_edit.authorize',
  'technical.product_spec.approve',
] as const;

const expectedNpdPermissions = [
  'brief.create',
  'npd.project.delete',
  'npd.core.write',
  'npd.dashboard.view',
  'npd.d365_builder.execute',
  'npd.closed_flag.unset',
  'npd.schema.edit',
  'npd.rule.edit',
  'npd.risk.write',
  'npd.allergen.write',
  'npd.compliance_doc.write',
  'npd.formulation.create_draft',
  'npd.formulation.lock',
  'npd.recipe.submit_for_trial',
  'npd.pilot.promote_to_bom',
  'npd.gate.advance',
  'npd.gate.approve',
  'npd.bom.export',
  'gdpr.erasure.execute',
] as const;

const expectedTechnicalPermissions = [
  'technical.items.create',
  'technical.items.edit',
  'technical.items.deactivate',
  'technical.bom.create',
  'technical.bom.approve',
  'technical.bom.version_publish',
  'technical.bom.generate_batch',
  'technical.allergens.edit',
  'technical.cost.edit',
  'technical.d365.sync_trigger',
] as const;

const expectedProductionPermissions = [
  'production.wo.start',
  'production.wo.pause',
  'production.wo.resume',
  'production.wo.complete',
  'production.consumption.write',
  'production.consumption.override_approve',
  'production.output.write',
  'production.output.catch_weight_override',
  'production.waste.write',
  'production.waste.overthreshold_approve',
  'production.downtime.write',
  'production.downtime.taxonomy_edit',
  'production.changeover.write',
  'production.allergen_gate.sign_first',
  'production.allergen_gate.sign_second',
  'production.d365_dlq.replay',
  'production.oee.read',
] as const;

const expectedWarehousePermissions = [
  'warehouse.lp.create',
  'warehouse.lp.split',
  'warehouse.lp.merge',
  'warehouse.lp.reserve',
  'warehouse.lp.consume',
  'warehouse.lp.block',
  'warehouse.lp.ship',
  'warehouse.lp.force_unlock',
  'warehouse.grn.receive',
  'warehouse.stock.move',
  'warehouse.stock.adjust',
  'warehouse.inventory.read',
  'warehouse.fefo.override',
  'warehouse.spare_parts.read',
  'warehouse.spare_parts.adjust',
] as const;

const expectedQualityPermissions = [
  'quality.hold.create',
  'quality.hold.release',
  'quality.spec.approve',
  'quality.inspection.execute',
  'quality.inspection.assign',
  'quality.ncr.create',
  'quality.ncr.close_critical',
  'quality.ccp.deviation_override',
  'quality.haccp.plan_edit',
  'quality.batch.release',
  'quality.dashboard.view',
  'quality.settings.edit',
  'quality.audit.export',
] as const;

const expectedOeePermissions = [
  'oee.dashboard.read',
  'oee.target.edit',
  'oee.override.create',
  'oee.override.delete',
  'oee.export.csv',
  'oee.export.pdf',
  'oee.anomaly.acknowledge',
  'oee.big_loss.map_edit',
  'oee.shift_pattern.edit',
  'oee.shift_pattern.read',
  'oee.downtime.annotate',
  'oee.downtime.escalate',
  'oee.tv.kiosk_view',
] as const;

const expectedShipPermissions = [
  'ship.so.create',
  'ship.so.confirm',
  'ship.so.cancel',
  'ship.hold.place',
  'ship.hold.release',
  'ship.alloc.override',
  'ship.allergen.override',
  'ship.pick.execute',
  'ship.pack.close',
  'ship.ship.confirm',
  'ship.bol.sign',
  'ship.rma.disposition',
  'ship.dashboard.view',
  'ship.dlq.replay',
] as const;

const expectedReportingPermissions = [
  'rpt.dashboard.view',
  'rpt.export.csv',
  'rpt.export.pdf',
  'rpt.preset.save',
  'rpt.preset.share',
  'rpt.preset.delete',
  'rpt.schedule.create',
  'rpt.schedule.run_now',
  'rpt.schedule.delete',
  'rpt.settings.read',
  'rpt.settings.edit',
  'rpt.mv.refresh',
  'rpt.integration.read',
  'rpt.rules_usage.read',
] as const;

const expectedMultiSitePermissions = [
  'multi_site.site.view',
  'multi_site.site.create',
  'multi_site.site.edit',
  'multi_site.site.decommission',
  'multi_site.site_access.assign',
  'multi_site.site_access.revoke',
  'multi_site.site_access.bulk_assign',
  'multi_site.site_settings.override',
  'multi_site.site_settings.clear',
  'multi_site.ist.create',
  'multi_site.ist.amend',
  'multi_site.ist.cancel',
  'multi_site.ist.approve',
  'multi_site.lane.create',
  'multi_site.lane.edit',
  'multi_site.lane.deactivate',
  'multi_site.rate_card.upload',
  'multi_site.rate_card.approve',
  'multi_site.rate_card.delete',
  'multi_site.replication.retry',
  'multi_site.replication.run_sync',
  'multi_site.conflict.resolve',
  'multi_site.activation.start',
  'multi_site.activation.rollback',
  'multi_site.config.promote',
  'multi_site.cross_site.read',
] as const;

const settingsExtPermissionPattern = /^(settings\.[a-z_][a-z_0-9]*\.[a-z_][a-z_0-9]*|npd\.released_product_edit\.(request|authorize)|technical\.product_spec\.approve)$/;
const npdPermissionPattern = /^[a-z_]+\.[a-z_]+\.[a-z_]+$/;
const npdPermissionsOutsideLiteralPattern = ['brief.create', 'npd.d365_builder.execute'] as const;

const expectedCanonicalPermissions = [
  'org.access.admin',
  'org.schema.admin',
  'org.scim.write',
  'fg.create',
  'fg.edit',
  'brief.convert_to_npd_project',
  'ref.edit',
  'audit.read',
  'outbox.admin',
  'impersonate.org',
  'settings.org.read',
  'settings.org.update',
  'settings.users.create',
  'settings.users.deactivate',
  'settings.users.invite',
  'settings.users.manage',
  'settings.roles.assign',
  'settings.audit.read',
  'settings.impersonate.tenant',
  'settings.schema.view',
  'settings.schema.edit',
  'settings.schema.promote_l1',
  'settings.rules.view',
  'settings.reference.view',
  'settings.reference.edit',
  'settings.reference.import',
  'settings.infra.view',
  'settings.infra.edit',
  'settings.d365.view',
  'settings.d365.edit',
  'settings.d365.toggle',
  'settings.email.view',
  'settings.email.edit',
  'settings.onboarding.complete',
  'settings.security.edit',
  'settings.security.manage',
  'settings.sso.view',
  'settings.sso.edit',
  'settings.scim.view',
  'settings.scim.edit',
  'settings.ip_allowlist.view',
  'settings.ip_allowlist.edit',
  'settings.flags.view',
  'settings.flags.edit',
  'settings.authorization.view',
  'settings.authorization.edit',
  'npd.released_product_edit.request',
  'npd.released_product_edit.authorize',
  'technical.product_spec.approve',
  'brief.create',
  'npd.project.delete',
  'npd.core.write',
  'npd.dashboard.view',
  'npd.d365_builder.execute',
  'npd.closed_flag.unset',
  'npd.schema.edit',
  'npd.rule.edit',
  'npd.risk.write',
  'npd.allergen.write',
  'npd.compliance_doc.write',
  'npd.formulation.create_draft',
  'npd.formulation.lock',
  'npd.recipe.submit_for_trial',
  'npd.pilot.promote_to_bom',
  'npd.gate.advance',
  'npd.gate.approve',
  'npd.bom.export',
  'gdpr.erasure.execute',
  'technical.items.create',
  'technical.items.edit',
  'technical.items.deactivate',
  'technical.bom.create',
  'technical.bom.approve',
  'technical.bom.version_publish',
  'technical.bom.generate_batch',
  'technical.allergens.edit',
  'technical.cost.edit',
  'technical.d365.sync_trigger',
  'production.wo.start',
  'production.wo.pause',
  'production.wo.resume',
  'production.wo.complete',
  'production.consumption.write',
  'production.consumption.override_approve',
  'production.output.write',
  'production.output.catch_weight_override',
  'production.waste.write',
  'production.waste.overthreshold_approve',
  'production.downtime.write',
  'production.downtime.taxonomy_edit',
  'production.changeover.write',
  'production.allergen_gate.sign_first',
  'production.allergen_gate.sign_second',
  'production.d365_dlq.replay',
  'production.oee.read',
  'warehouse.lp.create',
  'warehouse.lp.split',
  'warehouse.lp.merge',
  'warehouse.lp.reserve',
  'warehouse.lp.consume',
  'warehouse.lp.block',
  'warehouse.lp.ship',
  'warehouse.lp.force_unlock',
  'warehouse.grn.receive',
  'warehouse.stock.move',
  'warehouse.stock.adjust',
  'warehouse.inventory.read',
  'warehouse.fefo.override',
  'warehouse.spare_parts.read',
  'warehouse.spare_parts.adjust',
  'quality.hold.create',
  'quality.hold.release',
  'quality.spec.approve',
  'quality.inspection.execute',
  'quality.inspection.assign',
  'quality.ncr.create',
  'quality.ncr.close_critical',
  'quality.ccp.deviation_override',
  'quality.haccp.plan_edit',
  'quality.batch.release',
  'quality.dashboard.view',
  'quality.settings.edit',
  'quality.audit.export',
  'fin.settings.view',
  'fin.settings.edit',
  'fin.standard_cost.view',
  'fin.standard_cost.edit',
  'fin.standard_cost.approve',
  'fin.actual_cost.view',
  'fin.valuation.view',
  'fin.valuation.close',
  'fin.variance.view',
  'fin.variance.finalize',
  'fin.dashboard.view',
  'fin.reports.view',
  'fin.d365.view',
  'fin.d365_dlq.replay',
  'mnt.asset.read',
  'mnt.asset.edit',
  'mnt.asset.deactivate',
  'mnt.mwo.request',
  'mnt.mwo.approve',
  'mnt.mwo.assign',
  'mnt.mwo.execute',
  'mnt.mwo.sign',
  'mnt.mwo.cancel',
  'mnt.pm.create',
  'mnt.pm.skip',
  'mnt.calib.record',
  'mnt.calib.upload_cert',
  'mnt.spare.consume',
  'mnt.spare.adjust',
  'mnt.spare.reorder',
  'mnt.loto.apply',
  'mnt.loto.clear',
  'oee.dashboard.read',
  'oee.target.edit',
  'oee.override.create',
  'oee.override.delete',
  'oee.export.csv',
  'oee.export.pdf',
  'oee.anomaly.acknowledge',
  'oee.big_loss.map_edit',
  'oee.shift_pattern.edit',
  'oee.shift_pattern.read',
  'oee.downtime.annotate',
  'oee.downtime.escalate',
  'oee.tv.kiosk_view',
  'ship.so.create',
  'ship.so.confirm',
  'ship.so.cancel',
  'ship.hold.place',
  'ship.hold.release',
  'ship.alloc.override',
  'ship.allergen.override',
  'ship.pick.execute',
  'ship.pack.close',
  'ship.ship.confirm',
  'ship.bol.sign',
  'ship.rma.disposition',
  'ship.dashboard.view',
  'ship.dlq.replay',
  'rpt.dashboard.view',
  'rpt.export.csv',
  'rpt.export.pdf',
  'rpt.preset.save',
  'rpt.preset.share',
  'rpt.preset.delete',
  'rpt.schedule.create',
  'rpt.schedule.run_now',
  'rpt.schedule.delete',
  'rpt.settings.read',
  'rpt.settings.edit',
  'rpt.mv.refresh',
  'rpt.integration.read',
  'rpt.rules_usage.read',
  'multi_site.site.view',
  'multi_site.site.create',
  'multi_site.site.edit',
  'multi_site.site.decommission',
  'multi_site.site_access.assign',
  'multi_site.site_access.revoke',
  'multi_site.site_access.bulk_assign',
  'multi_site.site_settings.override',
  'multi_site.site_settings.clear',
  'multi_site.ist.create',
  'multi_site.ist.amend',
  'multi_site.ist.cancel',
  'multi_site.ist.approve',
  'multi_site.lane.create',
  'multi_site.lane.edit',
  'multi_site.lane.deactivate',
  'multi_site.rate_card.upload',
  'multi_site.rate_card.approve',
  'multi_site.rate_card.delete',
  'multi_site.replication.retry',
  'multi_site.replication.run_sync',
  'multi_site.conflict.resolve',
  'multi_site.activation.start',
  'multi_site.activation.rollback',
  'multi_site.config.promote',
  'multi_site.cross_site.read',
  'scheduler.run.read',
  'scheduler.run.dispatch',
  'scheduler.assignment.approve',
  'scheduler.assignment.override',
  'scheduler.assignment.reject',
  'scheduler.assignment.bulk_approve',
  'scheduler.matrix.read',
  'scheduler.matrix.edit',
  'scheduler.matrix.publish',
  'scheduler.config.edit',
  'scheduler.forecast.read',
  'scheduler.forecast.write',
] as const;

type PermissionsModule = {
  Permission: Record<string, string>;
  LegacyPermissionAlias: Record<string, string>;
  ALL_PERMISSIONS: readonly string[];
  ALL_SETTINGS_CORE_PERMISSIONS: readonly string[];
  ALL_SETTINGS_EXT_PERMISSIONS: readonly string[];
  ALL_NPD_PERMISSIONS: readonly string[];
  ALL_TECHNICAL_PERMISSIONS: readonly string[];
  ALL_PRODUCTION_PERMISSIONS: readonly string[];
  ALL_WAREHOUSE_PERMISSIONS: readonly string[];
  ALL_QUALITY_PERMISSIONS: readonly string[];
  ALL_SHIP_PERMISSIONS: readonly string[];
  ALL_REPORTING_CORE_PERMISSIONS: readonly string[];
  ALL_MULTI_SITE_PERMISSIONS: readonly string[];
  SOD_EXCLUSIVE_PAIRS: readonly (readonly [string, string])[];
  normalizePermission: (input: string) => string;
};

async function loadPermissionsModule(): Promise<PermissionsModule> {
  expect(
    existsSync(permissionsModulePath),
    'packages/rbac/src/permissions.enum.ts must exist as the RBAC permission source of truth',
  ).toBe(true);

  return (await import(permissionsModulePath)) as PermissionsModule;
}

describe('rbac permission source of truth', () => {
  it('exports exactly the canonical org-scoped permission values without duplicates', async () => {
    const { ALL_PERMISSIONS, Permission } = await loadPermissionsModule();

    expect(ALL_PERMISSIONS).toEqual(expectedCanonicalPermissions);
    expect(Object.values(Permission)).toEqual(expectedCanonicalPermissions);
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('exports the settings core permission group as a typed Permission array literal', async () => {
    const { ALL_PERMISSIONS, ALL_SETTINGS_CORE_PERMISSIONS } = await loadPermissionsModule();

    expect(ALL_SETTINGS_CORE_PERMISSIONS).toEqual(expectedSettingsCorePermissions);
    expect(new Set(ALL_SETTINGS_CORE_PERMISSIONS).size).toBe(ALL_SETTINGS_CORE_PERMISSIONS.length);

    for (const permission of ALL_SETTINGS_CORE_PERMISSIONS) {
      expect(ALL_PERMISSIONS).toContain(permission);
      expect(permission).toMatch(/^settings\.[a-z_]+\.[a-z_]+$/);
    }

    const source = readFileSync(permissionsModulePath, 'utf8');
    const settingsCoreExport = source.match(
      /export\s+const\s+ALL_SETTINGS_CORE_PERMISSIONS\s*=\s*\[[\s\S]*?\]\s*(?:satisfies|as)\s+readonly\s+Permission\[\]/,
    );
    expect(settingsCoreExport?.[0]).toContain('ALL_SETTINGS_CORE_PERMISSIONS');
  });

  it('exports the settings extension permissions as one typed mixed-namespace Permission array', async () => {
    const { ALL_PERMISSIONS, ALL_SETTINGS_EXT_PERMISSIONS } = await loadPermissionsModule();

    expect(ALL_SETTINGS_EXT_PERMISSIONS).toEqual(expectedSettingsExtPermissions);
    expect(ALL_SETTINGS_EXT_PERMISSIONS).toHaveLength(expectedSettingsExtPermissions.length);
    expect(new Set(ALL_SETTINGS_EXT_PERMISSIONS).size).toBe(ALL_SETTINGS_EXT_PERMISSIONS.length);
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);

    for (const permission of ALL_SETTINGS_EXT_PERMISSIONS) {
      expect(ALL_PERMISSIONS).toContain(permission);
      expect(permission).toMatch(settingsExtPermissionPattern);
    }

    expect(ALL_SETTINGS_EXT_PERMISSIONS.some((permission) => permission.startsWith('npd.'))).toBe(true);
    expect(ALL_SETTINGS_EXT_PERMISSIONS.some((permission) => permission.startsWith('technical.'))).toBe(true);

    const source = readFileSync(permissionsModulePath, 'utf8');
    const settingsExtExport = source.match(
      /export\s+const\s+ALL_SETTINGS_EXT_PERMISSIONS\s*=\s*\[[\s\S]*?\]\s*(?:satisfies|as)\s+readonly\s+Permission\[\]/,
    );
    expect(settingsExtExport?.[0]).toContain('ALL_SETTINGS_EXT_PERMISSIONS');
  });

  it('groups workflow authorization permissions under Settings/Auth without adding a derived matrix', async () => {
    const { ALL_SETTINGS_EXT_PERMISSIONS } = await loadPermissionsModule();
    const source = readFileSync(permissionsModulePath, 'utf8');
    const workflowSection = source.match(/Workflow Authorization[\s\S]*?(?:ALL_SETTINGS_EXT_PERMISSIONS|$)/i)?.[0] ?? '';

    expect(Array.isArray(ALL_SETTINGS_EXT_PERMISSIONS)).toBe(true);
    expect((ALL_SETTINGS_EXT_PERMISSIONS ?? []).filter((permission) => expectedWorkflowAuthorizationPermissions.includes(permission as never))).toEqual(
      expectedWorkflowAuthorizationPermissions,
    );
    expect(workflowSection).toContain('PRD');

    for (const permission of expectedWorkflowAuthorizationPermissions) {
      expect(workflowSection).toContain(permission);
    }

    expect(source).not.toMatch(/npd\.released_product_edit\.(?:request|authorize)\.[a-z_0-9]+/);
    expect(source).not.toMatch(/technical\.product_spec\.approve\.[a-z_0-9]+/);
  });

  it('exports the NPD permissions as a typed Permission array literal', async () => {
    const { ALL_PERMISSIONS, ALL_NPD_PERMISSIONS, Permission } = await loadPermissionsModule();

    expect(ALL_NPD_PERMISSIONS).toEqual(expectedNpdPermissions);
    expect(ALL_NPD_PERMISSIONS).toHaveLength(19);
    expect(new Set(ALL_NPD_PERMISSIONS).size).toBe(ALL_NPD_PERMISSIONS.length);
    expect(new Set(Object.values(Permission)).size).toBe(Object.values(Permission).length);

    for (const permission of ALL_NPD_PERMISSIONS) {
      expect(ALL_PERMISSIONS).toContain(permission);
    }

    for (const permission of ALL_NPD_PERMISSIONS.filter(
      (permission) => !npdPermissionsOutsideLiteralPattern.includes(permission as never),
    )) {
      expect(permission).toMatch(npdPermissionPattern);
    }

    const source = readFileSync(permissionsModulePath, 'utf8');
    const npdExport = source.match(
      /export\s+const\s+ALL_NPD_PERMISSIONS\s*=\s*\[[\s\S]*?\]\s*(?:satisfies|as)\s+readonly\s+Permission\[\]/,
    );
    expect(npdExport?.[0]).toContain('ALL_NPD_PERMISSIONS');
  });

  it('exports the technical permissions as a typed Permission array literal (T-091 §3)', async () => {
    const { ALL_PERMISSIONS, ALL_TECHNICAL_PERMISSIONS, Permission } = await loadPermissionsModule();

    // AC1 — all 10 strings present exactly once.
    expect(ALL_TECHNICAL_PERMISSIONS).toEqual(expectedTechnicalPermissions);
    // AC3 — typed readonly Permission[] with length === 10.
    expect(ALL_TECHNICAL_PERMISSIONS).toHaveLength(10);
    expect(new Set(ALL_TECHNICAL_PERMISSIONS).size).toBe(ALL_TECHNICAL_PERMISSIONS.length);

    // AC2 — regex + uniqueness across the whole enum.
    expect(new Set(Object.values(Permission)).size).toBe(Object.values(Permission).length);
    // d365 carries digits in the middle segment, exactly like the canonical
    // npd.d365_builder.execute string, so it is verified against the locked
    // lowercase-dotted format (which permits digits after the first char of a
    // segment) rather than the digit-free 3-segment shorthand.
    const technicalWithDigits = ['technical.d365.sync_trigger'];
    for (const permission of ALL_TECHNICAL_PERMISSIONS) {
      expect(ALL_PERMISSIONS).toContain(permission);
      expect(permission.startsWith('technical.')).toBe(true);
      if (technicalWithDigits.includes(permission)) {
        expect(permission).toMatch(/^[a-z]+(\.[a-z_][a-z_0-9]*)+$/);
      } else {
        expect(permission).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
      }
    }

    const source = readFileSync(permissionsModulePath, 'utf8');
    const technicalExport = source.match(
      /export\s+const\s+ALL_TECHNICAL_PERMISSIONS\s*=\s*\[[\s\S]*?\]\s*(?:satisfies|as)\s+readonly\s+Permission\[\]/,
    );
    expect(technicalExport?.[0]).toContain('ALL_TECHNICAL_PERMISSIONS');
  });

  it('exports the production permissions as a typed Permission array literal (T-056 §3.2)', async () => {
    const { ALL_PERMISSIONS, ALL_PRODUCTION_PERMISSIONS, Permission } = await loadPermissionsModule();

    // AC1 — all 17 strings present exactly once, in order.
    expect(ALL_PRODUCTION_PERMISSIONS).toEqual(expectedProductionPermissions);
    // AC3 — typed readonly Permission[] with length === 17.
    expect(ALL_PRODUCTION_PERMISSIONS).toHaveLength(17);
    expect(new Set(ALL_PRODUCTION_PERMISSIONS).size).toBe(ALL_PRODUCTION_PERMISSIONS.length);

    // AC2 — regex + uniqueness across the whole enum.
    expect(new Set(Object.values(Permission)).size).toBe(Object.values(Permission).length);
    // production.d365_dlq.replay carries digits in the middle segment (like
    // technical.d365.sync_trigger), so it is verified against the locked lowercase-dotted
    // format (digits permitted after the first char of a segment) rather than the digit-free
    // 3-segment shorthand.
    const productionWithDigits = ['production.d365_dlq.replay'];
    for (const permission of ALL_PRODUCTION_PERMISSIONS) {
      expect(ALL_PERMISSIONS).toContain(permission);
      expect(permission.startsWith('production.')).toBe(true);
      if (productionWithDigits.includes(permission)) {
        expect(permission).toMatch(/^[a-z]+(\.[a-z_][a-z_0-9]*)+$/);
      } else {
        expect(permission).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
      }
    }

    // SoD: dual sign-off is split across two distinct grants.
    expect(ALL_PRODUCTION_PERMISSIONS).toContain('production.allergen_gate.sign_first');
    expect(ALL_PRODUCTION_PERMISSIONS).toContain('production.allergen_gate.sign_second');

    const source = readFileSync(permissionsModulePath, 'utf8');
    const productionExport = source.match(
      /export\s+const\s+ALL_PRODUCTION_PERMISSIONS\s*=\s*\[[\s\S]*?\]\s*(?:satisfies|as)\s+readonly\s+Permission\[\]/,
    );
    expect(productionExport?.[0]).toContain('ALL_PRODUCTION_PERMISSIONS');
  });

  it('exports the warehouse permissions as a typed Permission array literal (T-058 §5.2/§6/§7/§8/§9)', async () => {
    const { ALL_PERMISSIONS, ALL_WAREHOUSE_PERMISSIONS, Permission } = await loadPermissionsModule();

    expect(ALL_WAREHOUSE_PERMISSIONS).toEqual(expectedWarehousePermissions);
    expect(ALL_WAREHOUSE_PERMISSIONS).toHaveLength(15);
    expect(new Set(ALL_WAREHOUSE_PERMISSIONS).size).toBe(ALL_WAREHOUSE_PERMISSIONS.length);
    expect(new Set(Object.values(Permission)).size).toBe(Object.values(Permission).length);

    for (const permission of ALL_WAREHOUSE_PERMISSIONS) {
      expect(ALL_PERMISSIONS).toContain(permission);
      expect(permission.startsWith('warehouse.')).toBe(true);
      expect(permission).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
    }

    const source = readFileSync(permissionsModulePath, 'utf8');
    const warehouseExport = source.match(
      /export\s+const\s+ALL_WAREHOUSE_PERMISSIONS\s*=\s*\[[\s\S]*?\]\s*(?:satisfies|as)\s+readonly\s+Permission\[\]/,
    );
    expect(warehouseExport?.[0]).toContain('ALL_WAREHOUSE_PERMISSIONS');
  });

  it('exports the quality permissions as a typed Permission array literal (T-065 §2.3)', async () => {
    const { ALL_PERMISSIONS, ALL_QUALITY_PERMISSIONS, Permission } = await loadPermissionsModule();

    // AC1 — all 13 strings present exactly once, in order.
    expect(ALL_QUALITY_PERMISSIONS).toEqual(expectedQualityPermissions);
    // AC3 — typed readonly Permission[] with length === 13.
    expect(ALL_QUALITY_PERMISSIONS).toHaveLength(13);
    expect(new Set(ALL_QUALITY_PERMISSIONS).size).toBe(ALL_QUALITY_PERMISSIONS.length);

    // AC2 — regex + uniqueness across the whole enum.
    expect(new Set(Object.values(Permission)).size).toBe(Object.values(Permission).length);
    for (const permission of ALL_QUALITY_PERMISSIONS) {
      expect(ALL_PERMISSIONS).toContain(permission);
      expect(permission.startsWith('quality.')).toBe(true);
      expect(permission).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
    }

    // Allergen dual-sign is owned by 08-PRODUCTION, NOT re-declared here.
    expect(ALL_QUALITY_PERMISSIONS).not.toContain('production.allergen_gate.sign_first');
    expect(ALL_QUALITY_PERMISSIONS).not.toContain('production.allergen_gate.sign_second');

    const source = readFileSync(permissionsModulePath, 'utf8');
    const qualityExport = source.match(
      /export\s+const\s+ALL_QUALITY_PERMISSIONS\s*=\s*\[[\s\S]*?\]\s*(?:satisfies|as)\s+readonly\s+Permission\[\]/,
    );
    expect(qualityExport?.[0]).toContain('ALL_QUALITY_PERMISSIONS');
  });

  it('exports the shipping permissions as a typed Permission array literal (T-031 §3)', async () => {
    const { ALL_PERMISSIONS, ALL_SHIP_PERMISSIONS, Permission } = await loadPermissionsModule();

    // AC1 — all 14 strings present exactly once, in declared order.
    expect(ALL_SHIP_PERMISSIONS).toEqual(expectedShipPermissions);
    // AC3 — typed readonly Permission[] with length === 14.
    expect(ALL_SHIP_PERMISSIONS).toHaveLength(14);
    expect(new Set(ALL_SHIP_PERMISSIONS).size).toBe(ALL_SHIP_PERMISSIONS.length);

    // AC2 — regex (3-segment) + uniqueness across the whole enum + cross-module dedupe.
    expect(new Set(Object.values(Permission)).size).toBe(Object.values(Permission).length);
    for (const permission of ALL_SHIP_PERMISSIONS) {
      expect(ALL_PERMISSIONS).toContain(permission);
      expect(permission.startsWith('ship.')).toBe(true);
      expect(permission).toMatch(/^ship\.[a-z_]+\.[a-z_]+$/);
    }

    // Cross-module dedupe: no ship.* collides with any other module family.
    const others = ALL_PERMISSIONS.filter((p) => !p.startsWith('ship.'));
    for (const permission of ALL_SHIP_PERMISSIONS) {
      expect(others).not.toContain(permission);
    }

    const source = readFileSync(permissionsModulePath, 'utf8');
    const shipExport = source.match(
      /export\s+const\s+ALL_SHIP_PERMISSIONS\s*=\s*\[[\s\S]*?\]\s*(?:satisfies|as)\s+readonly\s+Permission\[\]/,
    );
    expect(shipExport?.[0]).toContain('ALL_SHIP_PERMISSIONS');
  });

  it('exports the reporting core permissions as a typed Permission array literal (T-001 §3/§11)', async () => {
    const { ALL_PERMISSIONS, ALL_REPORTING_CORE_PERMISSIONS, Permission } = await loadPermissionsModule();

    // AC1 — all 14 strings present exactly once, in order.
    expect(ALL_REPORTING_CORE_PERMISSIONS).toEqual(expectedReportingPermissions);
    // AC3 — typed readonly Permission[] with length === 14.
    expect(ALL_REPORTING_CORE_PERMISSIONS).toHaveLength(14);
    expect(new Set(ALL_REPORTING_CORE_PERMISSIONS).size).toBe(ALL_REPORTING_CORE_PERMISSIONS.length);

    // AC2 — regex + uniqueness across the whole enum.
    expect(new Set(Object.values(Permission)).size).toBe(Object.values(Permission).length);
    for (const permission of ALL_REPORTING_CORE_PERMISSIONS) {
      expect(ALL_PERMISSIONS).toContain(permission);
      expect(permission.startsWith('rpt.')).toBe(true);
      // rpt.rules_usage.read / rpt.schedule.run_now carry underscores in segments — covered by [a-z_]+.
      expect(permission).toMatch(/^rpt\.[a-z_]+\.[a-z_]+$/);
    }

    // P2 export.xlsx / bi_embed.* are reserved namespace only — NOT in the P1 baseline.
    expect(ALL_REPORTING_CORE_PERMISSIONS).not.toContain('rpt.export.xlsx');
    expect(ALL_PERMISSIONS).not.toContain('rpt.export.xlsx');
    expect(ALL_PERMISSIONS).not.toContain('rpt.bi_embed.read');

    const source = readFileSync(permissionsModulePath, 'utf8');
    const reportingExport = source.match(
      /export\s+const\s+ALL_REPORTING_CORE_PERMISSIONS\s*=\s*\[[\s\S]*?\]\s*(?:satisfies|as)\s+readonly\s+Permission\[\]/,
    );
    expect(reportingExport?.[0]).toContain('ALL_REPORTING_CORE_PERMISSIONS');
  });

  it('exports the multi-site permissions as a typed Permission array literal (T-031 §10A.5/§10B/§14.2)', async () => {
    const { ALL_PERMISSIONS, ALL_MULTI_SITE_PERMISSIONS, Permission } = await loadPermissionsModule();

    // AC1 — all 26 strings present exactly once, in order.
    expect(ALL_MULTI_SITE_PERMISSIONS).toEqual(expectedMultiSitePermissions);
    // AC3 — typed readonly Permission[] with length === 26.
    expect(ALL_MULTI_SITE_PERMISSIONS).toHaveLength(26);
    expect(new Set(ALL_MULTI_SITE_PERMISSIONS).size).toBe(ALL_MULTI_SITE_PERMISSIONS.length);

    // AC2 — regex + uniqueness across the whole enum.
    expect(new Set(Object.values(Permission)).size).toBe(Object.values(Permission).length);
    for (const permission of ALL_MULTI_SITE_PERMISSIONS) {
      expect(ALL_PERMISSIONS).toContain(permission);
      expect(permission.startsWith('multi_site.')).toBe(true);
      expect(permission).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
    }

    const source = readFileSync(permissionsModulePath, 'utf8');
    const multiSiteExport = source.match(
      /export\s+const\s+ALL_MULTI_SITE_PERMISSIONS\s*=\s*\[[\s\S]*?\]\s*(?:satisfies|as)\s+readonly\s+Permission\[\]/,
    );
    expect(multiSiteExport?.[0]).toContain('ALL_MULTI_SITE_PERMISSIONS');
  });

  it('keeps every canonical permission in the locked lowercase dotted format', async () => {
    const { ALL_PERMISSIONS } = await loadPermissionsModule();

    // First (namespace) segment may carry an underscore — the 14-multi-site module's PRD-mandated
    // prefix is `multi_site` (§10A.5/§10B). This still locks the 3-segment lowercase-dotted contract
    // (no digits/uppercase/leading-underscore in the namespace; later segments unchanged); it is NOT
    // the forbidden 4-segment/matrix model. T-031 §10A.5 + risk red line "do not introduce a
    // 4-segment / matrix permission model".
    for (const permission of ALL_PERMISSIONS) {
      expect(permission).toMatch(/^[a-z][a-z_]*(\.[a-z_][a-z_0-9]*)+$/);
    }
  });

  it('locks the Org Admin and Schema Admin separation-of-duties pair exactly', async () => {
    const { SOD_EXCLUSIVE_PAIRS } = await loadPermissionsModule();

    expect(SOD_EXCLUSIVE_PAIRS).toEqual([['org.access.admin', 'org.schema.admin']]);
  });

  it('uses fg.* and NPD conversion as the only canonical finished-good permission contract', async () => {
    const { ALL_PERMISSIONS, Permission } = await loadPermissionsModule();

    expect(Permission.FG_CREATE).toBe('fg.create');
    expect(Permission.FG_EDIT).toBe('fg.edit');
    expect(Permission.BRIEF_CONVERT_TO_NPD_PROJECT).toBe('brief.convert_to_npd_project');

    expect(ALL_PERMISSIONS).toContain('fg.create');
    expect(ALL_PERMISSIONS).toContain('fg.edit');
    expect(ALL_PERMISSIONS).toContain('brief.convert_to_npd_project');
    expect(ALL_PERMISSIONS).not.toContain('fa.create');
    expect(ALL_PERMISSIONS).not.toContain('fa.edit');
    expect(ALL_PERMISSIONS).not.toContain('brief.convert_to_fa');
    expect(ALL_PERMISSIONS.some((permission) => permission.startsWith('fa.'))).toBe(false);
  });

  it('keeps legacy fa and FA conversion strings only as explicit normalization aliases', async () => {
    const { LegacyPermissionAlias, normalizePermission } = await loadPermissionsModule();

    expect(LegacyPermissionAlias).toEqual({
      'fa.create': 'fg.create',
      'fa.edit': 'fg.edit',
      'brief.convert_to_fa': 'brief.convert_to_npd_project',
    });

    expect(normalizePermission('fa.create')).toBe('fg.create');
    expect(normalizePermission('fa.edit')).toBe('fg.edit');
    expect(normalizePermission('brief.convert_to_fa')).toBe('brief.convert_to_npd_project');
  });

  it('normalizes canonical permissions unchanged and rejects unknown strings', async () => {
    const { ALL_PERMISSIONS, normalizePermission } = await loadPermissionsModule();

    for (const permission of ALL_PERMISSIONS) {
      expect(normalizePermission(permission)).toBe(permission);
    }

    expect(() => normalizePermission('tenant.access.admin')).toThrow(/unknown|unsupported|invalid/i);
    expect(() => normalizePermission('fa.delete')).toThrow(/unknown|unsupported|invalid/i);
    expect(() => normalizePermission('brief.convert_to_product')).toThrow(/unknown|unsupported|invalid/i);
  });

  it('locks permissions.enum.ts behind architect review in CODEOWNERS', () => {
    expect(existsSync(codeownersPath), 'CODEOWNERS must exist at the repository root').toBe(true);

    const codeowners = readFileSync(codeownersPath, 'utf8');
    expect(codeowners).toMatch(
      /^\s*\/?packages\/rbac\/src\/permissions\.enum\.ts\s+.*(?:@[^\s/]*architect[^\s]*|architect)/im,
    );
  });
});
