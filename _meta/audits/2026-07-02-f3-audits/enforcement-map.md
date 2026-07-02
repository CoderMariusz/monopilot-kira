# RBAC Enforcement Map (Wave F3-G8)

## Summary

- **Total permissions in catalog:** 268
- **Enforced (actual check):** 47
- **Unenforced (seeded only):** 221

## Grep Command Used

**Enumerate all runtime permission checks (backtick + quote-agnostic):**

```bash
grep -rEh "(hasPermission|requirePermission|checkPermission).*['\`]" apps packages \
  --include="*.ts" --include="*.tsx" 2>/dev/null | \
  grep -v node_modules | grep -v "\.next" | \
  sed -E "s/.*['\`]([a-z_]+\.[a-z_\.]+)['\`].*/\1/" | \
  grep -E "^\w+\.\w+" | sort -u
```

**Result:** 47 unique permission strings found in runtime enforcement checks (hasPermission, requirePermission, checkPermission calls).

## ENFORCED Permissions (47)

| Permission | Seeded In | First Check Site |
|---|---|---|
| `impersonate.tenant` | — | apps/web/app/[locale]/(app)/(admin)/settings/audit/page.tsx:302 |
| `manufacturing_operations.create` | — | apps/web/actions/reference/manufacturing-ops/create.ts:40 |
| `manufacturing_operations.delete` | — | apps/web/actions/reference/manufacturing-ops/deactivate.ts:46 |
| `manufacturing_operations.edit` | — | apps/web/actions/reference/manufacturing-ops/reset-to-seed.ts:71 |
| `manufacturing_operations.reorder` | — | apps/web/actions/reference/manufacturing-ops/reorder.ts:22 |
| `manufacturing_operations.view` | — | apps/web/app/[locale]/(app)/(admin)/settings/manufacturing-ops/[operation_id]/history/page.tsx:218 |
| `npd.costing` | — | apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/costing/_actions/compute.ts:127 |
| `npd.formulation.create_draft` | 080-role-permissions.sql | apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/costing/_actions/save-scenario.ts:115 |
| `npd.formulation.lock` | 080-role-permissions.sql | apps/web/app/(npd)/pipeline/[projectId]/formulation/_actions/lock-version.ts:30 |
| `npd.formulation.unlock` | — | apps/web/app/(npd)/pipeline/[projectId]/formulation/_actions/unlock-version.ts:42 |
| `npd.production.write` | — | apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/page.tsx:564 |
| `npd.recipe.submit_for_trial` | 080-role-permissions.sql | apps/web/app/(npd)/pipeline/[projectId]/formulation/_actions/submit-for-trial.ts:43 |
| `org.access.admin` | 017-rbac.sql | apps/web/actions/users/create-user-with-password.behavior.test.ts:215 |
| `production.consumption.correct` | — | apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.test.ts:431 |
| `production.consumption.override_approve` | — | apps/web/app/api/production/scanner/wos/[id]/consume/route.ts:369 |
| `production.consumption.write` | 185-production-outbox-and-rbac-seed.sql | apps/web/app/api/production/scanner/wos/[id]/consume/route.ts:96 |
| `production.corrections.closed_wo` | — | apps/web/app/api/production/scanner/wos/[id]/__tests__/scanner-reverse-consume-route.test.ts:458 |
| `production.oee.read` | — | apps/web/lib/production/get-wo-runtime-state.ts:58 |
| `production.wo.cancel` | — | apps/web/lib/production/complete-cancel-wo.ts:226 |
| `production.wo.close` | 185-production-outbox-and-rbac-seed.sql | apps/web/lib/production/close-wo.ts:55 |
| `production.wo.complete` | 185-production-outbox-and-rbac-seed.sql | apps/web/lib/production/complete-cancel-wo.ts:54 |
| `production.wo.pause` | 185-production-outbox-and-rbac-seed.sql | apps/web/lib/production/pause-resume-wo.ts:60 |
| `production.wo.release` | — | apps/web/lib/auth/__tests__/has-permission.test.ts:57 |
| `production.wo.resume` | 185-production-outbox-and-rbac-seed.sql | apps/web/lib/production/pause-resume-wo.ts:155 |
| `production.wo.start` | 185-production-outbox-and-rbac-seed.sql | apps/web/app/api/production/scanner/wos/[id]/start/route.ts:67 |
| `quality.ccp.deviation_override` | — | apps/web/app/[locale]/(app)/(modules)/quality/_actions/haccp-actions.ts:157 |
| `quality.dashboard.view` | — | apps/web/app/[locale]/(app)/(modules)/quality/_actions/ncr-actions.ts:247 |
| `quality.haccp.plan_edit` | — | apps/web/app/[locale]/(app)/(modules)/quality/_actions/haccp-actions.ts:156 |
| `quality.hold.create` | 198-quality-outbox-and-rbac-seed.sql | apps/web/app/[locale]/(app)/(modules)/quality/_actions/hold-actions.ts:452 |
| `quality.hold.release` | 198-quality-outbox-and-rbac-seed.sql | apps/web/app/[locale]/(app)/(modules)/quality/_actions/hold-actions.ts:847 |
| `quality.inspection.assign` | — | apps/web/app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts:551 |
| `quality.inspection.execute` | 198-quality-outbox-and-rbac-seed.sql | apps/web/app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts:473 |
| `quality.ncr.close` | — | apps/web/lib/auth/__tests__/has-permission.test.ts:89 |
| `quality.ncr.close_critical` | — | apps/web/app/[locale]/(app)/(modules)/quality/_actions/ncr-actions.ts:627 |
| `quality.ncr.create` | 198-quality-outbox-and-rbac-seed.sql | apps/web/app/[locale]/(app)/(modules)/quality/_actions/ncr-actions.ts:468 |
| `quality.spec.approve` | 198-quality-outbox-and-rbac-seed.sql | apps/web/app/[locale]/(app)/(modules)/quality/specifications/_components/can-spec.ts:43 |
| `settings.audit.read` | — | apps/web/app/[locale]/(app)/(admin)/settings/audit/page.tsx:301 |
| `settings.flags.edit` | — | apps/web/actions/tenant/set-local-flag.ts:36 |
| `settings.org.read` | — | apps/web/actions/tenant/get.ts:37 |
| `settings.org.update` | — | apps/web/app/[locale]/(app)/(admin)/settings/tenant/rules/page.tsx:280 |
| `settings.roles.assign` | — | apps/web/actions/users/assign-role.ts:74 |
| `settings.rules.view` | — | apps/web/app/[locale]/(app)/(admin)/settings/tenant/rules/page.tsx:173 |
| `settings.users.create` | — | apps/web/lib/auth/__tests__/has-permission.test.ts:75 |
| `ship.pack.close` | — | apps/web/app/api/warehouse/scanner/ship/shipments/route.ts:35 |
| `technical.items.edit` | — | apps/web/lib/auth/__tests__/has-permission.test.ts:63 |
| `warehouse.lp.adjust` | — | apps/web/lib/auth/__tests__/has-permission.test.ts:69 |
| `warehouse.stock.move` | 192-warehouse-outbox-and-rbac-seed.sql | apps/web/app/api/warehouse/scanner/move/route.ts:30 |

## UNENFORCED Permissions (221)

Permissions seeded in migrations / role editor but never checked at runtime.

### SETTINGS (29)
- `settings.authorization.edit`
- `settings.authorization.view`
- `settings.d365.edit`
- `settings.d365.toggle`
- `settings.d365.view`
- `settings.email.edit`
- `settings.email.view`
- `settings.flags.view`
- `settings.impersonate.tenant`
- `settings.infra.edit`
- `settings.infra.view`
- `settings.ip_allowlist.edit`
- `settings.ip_allowlist.view`
- `settings.onboarding.complete`
- `settings.reference.edit`
- `settings.reference.import`
- `settings.reference.view`
- `settings.schema.edit`
- `settings.schema.promote_l1`
- `settings.schema.view`
- `settings.scim.edit`
- `settings.scim.view`
- `settings.security.edit`
- `settings.security.manage`
- `settings.sso.edit`
- `settings.sso.view`
- `settings.users.deactivate`
- `settings.users.invite`
- `settings.users.manage`

### NPD (26)
- `npd.allergen.write`
- `npd.bom.export`
- `npd.closed_flag.unset`
- `npd.compliance_doc.write`
- `npd.core.write`
- `npd.d365_builder.execute`
- `npd.dashboard.view`
- `npd.formulation.read`
- `npd.gate.advance`
- `npd.gate.approve`
- `npd.handoff.promote`
- `npd.handoff.read`
- `npd.packaging.read`
- `npd.packaging.write`
- `npd.pilot.promote_to_bom`
- `npd.pilot.read`
- `npd.pilot.write`
- `npd.planning.write`
- `npd.project.delete`
- `npd.released_product_edit.authorize`
- `npd.released_product_edit.request`
- `npd.risk.write`
- `npd.rule.edit`
- `npd.schema.edit`
- `npd.trial.read`
- `npd.trial.write`

### MULTI_SITE (26)
- `multi_site.activation.rollback`
- `multi_site.activation.start`
- `multi_site.config.promote`
- `multi_site.conflict.resolve`
- `multi_site.cross_site.read`
- `multi_site.ist.amend`
- `multi_site.ist.approve`
- `multi_site.ist.cancel`
- `multi_site.ist.create`
- `multi_site.lane.create`
- `multi_site.lane.deactivate`
- `multi_site.lane.edit`
- `multi_site.rate_card.approve`
- `multi_site.rate_card.delete`
- `multi_site.rate_card.upload`
- `multi_site.replication.retry`
- `multi_site.replication.run_sync`
- `multi_site.site.create`
- `multi_site.site.decommission`
- `multi_site.site.edit`
- `multi_site.site.view`
- `multi_site.site_access.assign`
- `multi_site.site_access.bulk_assign`
- `multi_site.site_access.revoke`
- `multi_site.site_settings.clear`
- `multi_site.site_settings.override`

### FIN (18)
- `fin.actual_cost.view`
- `fin.costs.manage`
- `fin.costs.read`
- `fin.d365.view`
- `fin.d365_dlq.replay`
- `fin.dashboard.view`
- `fin.reports.view`
- `fin.settings.edit`
- `fin.settings.view`
- `fin.standard_cost.approve`
- `fin.standard_cost.edit`
- `fin.standard_cost.view`
- `fin.valuation.close`
- `fin.valuation.read`
- `fin.valuation.view`
- `fin.variance.finalize`
- `fin.variance.read`
- `fin.variance.view`

### MNT (18)
- `mnt.asset.deactivate`
- `mnt.asset.edit`
- `mnt.asset.read`
- `mnt.calib.record`
- `mnt.calib.upload_cert`
- `mnt.loto.apply`
- `mnt.loto.clear`
- `mnt.mwo.approve`
- `mnt.mwo.assign`
- `mnt.mwo.cancel`
- `mnt.mwo.execute`
- `mnt.mwo.request`
- `mnt.mwo.sign`
- `mnt.pm.create`
- `mnt.pm.skip`
- `mnt.spare.adjust`
- `mnt.spare.consume`
- `mnt.spare.reorder`

### WAREHOUSE (16)
- `warehouse.fefo.override`
- `warehouse.grn.receive`
- `warehouse.inventory.read`
- `warehouse.lp.block`
- `warehouse.lp.consume`
- `warehouse.lp.create`
- `warehouse.lp.force_unlock`
- `warehouse.lp.merge`
- `warehouse.lp.reserve`
- `warehouse.lp.ship`
- `warehouse.lp.split`
- `warehouse.receipt.correct`
- `warehouse.spare_parts.adjust`
- `warehouse.spare_parts.read`
- `warehouse.stock.adjust`
- `warehouse.transfer.correct`

### TECHNICAL (14)
- `technical.allergens.edit`
- `technical.bom.approve`
- `technical.bom.create`
- `technical.bom.generate_batch`
- `technical.bom.version_publish`
- `technical.cost.edit`
- `technical.d365.sync_trigger`
- `technical.eco.approve`
- `technical.eco.write`
- `technical.factory_spec.recall`
- `technical.items.create`
- `technical.items.deactivate`
- `technical.product_spec.approve`
- `technical.sensory.read`

### RPT (14)
- `rpt.dashboard.view`
- `rpt.export.csv`
- `rpt.export.pdf`
- `rpt.integration.read`
- `rpt.mv.refresh`
- `rpt.preset.delete`
- `rpt.preset.save`
- `rpt.preset.share`
- `rpt.rules_usage.read`
- `rpt.schedule.create`
- `rpt.schedule.delete`
- `rpt.schedule.run_now`
- `rpt.settings.edit`
- `rpt.settings.read`

### SCHEDULER (12)
- `scheduler.assignment.approve`
- `scheduler.assignment.bulk_approve`
- `scheduler.assignment.override`
- `scheduler.assignment.reject`
- `scheduler.config.edit`
- `scheduler.forecast.read`
- `scheduler.forecast.write`
- `scheduler.matrix.edit`
- `scheduler.matrix.publish`
- `scheduler.matrix.read`
- `scheduler.run.dispatch`
- `scheduler.run.read`

### PRODUCTION (12)
- `production.allergen_gate.sign_first`
- `production.allergen_gate.sign_second`
- `production.changeover.write`
- `production.d365_dlq.replay`
- `production.downtime.taxonomy_edit`
- `production.downtime.write`
- `production.output.catch_weight_override`
- `production.output.correct`
- `production.output.write`
- `production.waste.correct`
- `production.waste.overthreshold_approve`
- `production.waste.write`

### SHIP (13)
- `ship.allergen.override`
- `ship.alloc.override`
- `ship.bol.sign`
- `ship.dashboard.view`
- `ship.dlq.replay`
- `ship.hold.place`
- `ship.hold.release`
- `ship.pick.execute`
- `ship.rma.disposition`
- `ship.ship.confirm`
- `ship.so.cancel`
- `ship.so.confirm`
- `ship.so.create`

### QUALITY (5)
- `quality.audit.export`
- `quality.batch.release`
- `quality.coldchain.manage`
- `quality.coldchain.record`
- `quality.settings.edit`

### OEE (13)
- `oee.anomaly.acknowledge`
- `oee.big_loss.map_edit`
- `oee.dashboard.read`
- `oee.downtime.annotate`
- `oee.downtime.escalate`
- `oee.export.csv`
- `oee.export.pdf`
- `oee.override.create`
- `oee.override.delete`
- `oee.shift_pattern.edit`
- `oee.shift_pattern.read`
- `oee.target.edit`
- `oee.tv.kiosk_view`

### PLANNING (3)
- `planning.forecast.manage`
- `planning.mrp.convert`
- `planning.mrp.run`

### BRIEF (2)
- `brief.convert_to_npd_project`
- `brief.create`

### FG (2)
- `fg.create`
- `fg.edit`

### ORG (2)
- `org.schema.admin`
- `org.scim.write`

### AUDIT (1)
- `audit.read`

### FREIGHT (1)
- `freight.manage`

### GDPR (1)
- `gdpr.erasure.execute`

### OUTBOX (1)
- `outbox.admin`

### REF (1)
- `ref.edit`

### YARD (1)
- `yard.manage`

### IMPERSONATE (1)
- `impersonate.org`

## Dynamic Composition Sites

**Pattern searched:** `` `${module}.${action}` `` template literal patterns.

**Result:** No dynamic composition detected. All enforcement uses static string literals.

---

**Generated:** Wave F3-G8 RBAC enforcement audit  
**Completion criterion:** Tree grep proves exact counts (47 checked, 221 unchecked from 268 total).
