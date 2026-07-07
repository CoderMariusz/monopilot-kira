/**
 * Permissions with at least one runtime enforcement check in apps/ or packages/.
 *
 * Derived mechanically (Wave F3-G8) by grepping non-test TypeScript for:
 *   - hasPermission / requirePermission / hasAnyPermission / requireAnyPermission / checkPermission
 *   - Module wrappers: hasWarehousePermission, hasPilotPermission, hasNpdPermission,
 *     hasHandoffPermission, hasReportingPermission
 *   - requirePermission factories, `permission: '...'` object literals,
 *     permissions.includes('...'), hasAnyPermission arrays, and *_PERMISSION constants
 *     passed to any of the above helpers
 *
 * Exclusion rule: UI-affordance gates (page.tsx/layout.tsx visibility checks that only
 * hide/show UI elements) do NOT qualify as server-side enforcement. A permission must
 * appear in a Server Action, Route Handler, or middleware to be listed here.
 *
 * To re-derive: grep non-test TypeScript (exclude *.test.ts, *.spec.ts, __tests__/)
 * for the helper families above, then cross-check each hit to confirm it runs
 * server-side. Remove any that appear exclusively in client-side or page-render gates.
 *
 * UI-only: the role editor shows a "not yet enforced" badge for catalog permissions
 * NOT in this set. Grant/revoke behavior is unchanged.
 */
export const ENFORCED_PERMISSIONS_LIST = [
  'fg.create',
  'fin.costs.read',
  'fin.valuation.view',
  'gdpr.erasure.execute',
  'mnt.asset.deactivate',
  'mnt.asset.edit',
  'mnt.asset.read',
  'mnt.calib.record',
  'mnt.mwo.cancel',
  'mnt.mwo.execute',
  'mnt.mwo.request',
  'multi_site.cross_site.read',
  'npd.allergen.accept_declaration',
  'npd.allergen.write',
  'npd.bom.export',
  'npd.core.write',
  'npd.d365_builder.execute',
  'npd.dashboard.view',
  'npd.formulation.create_draft',
  'npd.formulation.lock',
  'npd.formulation.unlock',
  'npd.gate.advance',
  'npd.gate.approve',
  'npd.handoff.promote',
  'npd.handoff.read',
  'npd.packaging.read',
  'npd.packaging.write',
  'npd.pilot.read',
  'npd.pilot.write',
  'npd.planning.write',
  'npd.recipe.submit_for_trial',
  'npd.risk.write',
  'npd.trial.read',
  'npd.trial.write',
  'oee.dashboard.read',
  'oee.tv.kiosk_view',
  'org.access.admin',
  'planning.forecast.manage',
  'planning.mrp.convert',
  'planning.mrp.run',
  'production.allergen_gate.sign_first',
  'production.allergen_gate.sign_second',
  'production.changeover.write',
  'production.consumption.correct',
  'production.consumption.override_approve',
  'production.consumption.write',
  'production.corrections.closed_wo',
  'production.oee.read',
  'production.output.correct',
  'production.output.write',
  'production.waste.write',
  'production.wo.cancel',
  'production.wo.close',
  'production.wo.complete',
  'production.wo.override_yield',
  'production.wo.pause',
  'production.wo.resume',
  'production.wo.start',
  'quality.batch.release',
  'quality.ccp.deviation_override',
  'quality.coldchain.manage',
  'quality.coldchain.record',
  'quality.dashboard.view',
  'quality.haccp.plan_edit',
  'quality.hold.create',
  'quality.hold.release',
  'quality.inspection.assign',
  'quality.inspection.execute',
  'quality.ncr.close_critical',
  'quality.ncr.create',
  'quality.spec.approve',
  'rpt.dashboard.view',
  'rpt.export.csv',
  'scheduler.assignment.approve',
  'scheduler.matrix.edit',
  'scheduler.matrix.read',
  'scheduler.run.dispatch',
  'scheduler.run.read',
  'settings.audit.read',
  'settings.authorization.edit',
  'settings.d365.view',
  'settings.email.edit',
  'settings.email.view',
  'settings.flags.edit',
  'settings.onboarding.complete',
  'settings.org.read',
  'settings.org.update',
  'settings.reference.edit',
  'settings.reference.import',
  'settings.reference.view',
  'settings.roles.assign',
  'settings.rules.view',
  'settings.sso.edit',
  // 'settings.users.create' EXCLUDED — only referenced in a UI affordance gate
  // (settings/users/page.tsx:186); the create server action gates on
  // settings.users.invite (apps/web/actions/users/create-user-with-password.ts:36).
  'settings.users.deactivate', // server gate: apps/web/actions/users/deactivate.ts requireAnyPermission OR-list — added in wave F3 lane G2 (cross-lane; verify post-consolidation)
  'settings.users.invite',
  'ship.bol.sign',
  'ship.dashboard.view',
  'ship.pack.close',
  'ship.ship.confirm',
  'ship.so.cancel',
  'ship.so.confirm',
  'ship.so.create',
  'technical.allergens.edit',
  'technical.bom.approve',
  'technical.bom.create',
  'technical.bom.generate_batch',
  'technical.bom.version_publish',
  'technical.cost.edit',
  'technical.eco.approve',
  'technical.eco.write',
  'technical.factory_spec.recall',
  'technical.items.create',
  'technical.items.deactivate',
  'technical.items.edit',
  'technical.product_spec.approve',
  'technical.sensory.read',
  'warehouse.grn.receive',
  'warehouse.inventory.read',
  'warehouse.lp.block',
  'warehouse.lp.merge',
  'warehouse.lp.reserve',
  'warehouse.lp.split',
  'warehouse.receipt.correct',
  'warehouse.stock.adjust',
  'warehouse.stock.move',
  'warehouse.transfer.correct',
  'yard.manage',
] as const;

export const ENFORCED_PERMISSIONS: ReadonlySet<string> = new Set(ENFORCED_PERMISSIONS_LIST);

export function isEnforcedPermission(permission: string): boolean {
  return ENFORCED_PERMISSIONS.has(permission);
}
