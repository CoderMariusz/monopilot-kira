## Table A — ENFORCED-BUT-UNSEEDED

| Permission | Enforced at (file:line) | Recommended role family to seed |
| --- | --- | --- |
| `technical.factory_spec.approve` | `apps/web/app/[locale]/(app)/(modules)/technical/factory-specs/_actions/shared.ts:32` | Technical approver / org-admin, matching the existing `technical.product_spec.approve` factory-spec approval family |

## Table B — ENFORCED-BUT-NOT-IN-ENUM

| Permission | Enforced at (file:line) |
| --- | --- |
| `impersonate.tenant` | `apps/web/app/[locale]/(app)/(admin)/settings/audit/page.tsx:302` |
| `manufacturing_operations.create` | `apps/web/actions/reference/manufacturing-ops/create.ts:37` |
| `manufacturing_operations.delete` | `apps/web/actions/reference/manufacturing-ops/deactivate.ts:43` |
| `manufacturing_operations.edit` | `apps/web/actions/reference/manufacturing-ops/reset-to-seed.ts:68`<br>`apps/web/actions/reference/manufacturing-ops/update.ts:38` |
| `manufacturing_operations.reorder` | `apps/web/actions/reference/manufacturing-ops/reorder.ts:20` |
| `manufacturing_operations.view` | `apps/web/actions/reference/manufacturing-ops/list.ts:35`<br>`apps/web/app/[locale]/(app)/(admin)/settings/manufacturing-ops/[operation_id]/history/page.tsx:231` |
| `npd.brief.read` | `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/brief/_actions/read-project-brief.ts:60` |
| `npd.fa.build` | `apps/web/app/[locale]/(app)/(npd)/fa/[productCode]/layout.tsx:63`<br>`apps/web/app/[locale]/(app)/(npd)/fa/[productCode]/page.tsx:155` |
| `npd.fa.close` | `apps/web/app/[locale]/(app)/(npd)/fa/[productCode]/layout.tsx:62` |
| `npd.fa.read` | `apps/web/app/[locale]/(app)/(npd)/fa/[productCode]/_actions/benchmarks.types.ts:15`<br>`apps/web/app/[locale]/(app)/(npd)/fa/[productCode]/_actions/fa-bom-types.ts:5`<br>`apps/web/app/[locale]/(app)/(npd)/fa/[productCode]/_actions/finish-wip-types.ts:20`<br>`apps/web/app/[locale]/(app)/(npd)/fa/[productCode]/_components/fa-right-panel.tsx:38`<br>`apps/web/app/[locale]/(app)/(npd)/fa/[productCode]/layout.tsx:61`<br>`apps/web/app/[locale]/(app)/(npd)/fa/[productCode]/page.tsx:124`<br>`apps/web/app/[locale]/(app)/(npd)/fa/page.tsx:72`<br>`apps/web/app/[locale]/(app)/(npd)/formulations/page.tsx:65`<br>`apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/costing/page.tsx:63`<br>`apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/nutrition/page.tsx:61` |
| `npd.production.write` | `apps/web/app/(npd)/fa/actions/add-prod-detail-component.ts:27`<br>`apps/web/app/[locale]/(app)/(npd)/fa/[productCode]/page.tsx:460` |
| `npd.project.create` | `apps/web/app/(npd)/pipeline/_actions/shared.ts:3` |
| `npd.project.view` | `apps/web/app/(npd)/pipeline/_actions/shared.ts:4` |
| `settings.d365.manage` | `apps/web/actions/d365/set-constant.ts:6`<br>`apps/web/actions/d365/sync-config-types.ts:46` |
| `settings.d365.rotate_secret` | `apps/web/actions/d365/rotate-secret.ts:5` |
| `settings.d365.test_connection` | `apps/web/actions/d365/test-connection.ts:5` |
| `settings.email_config.edit` | `apps/web/actions/email/test-provider.ts:5`<br>`apps/web/actions/email/upsert-config.ts:7` |
| `settings.infra.read` | `apps/web/app/[locale]/(app)/(admin)/settings/infra/lines/page.tsx:23`<br>`apps/web/app/[locale]/(app)/(admin)/settings/infra/machines/page.tsx:112`<br>`apps/web/app/[locale]/(app)/(admin)/settings/infra/warehouses/page.tsx:25` |
| `settings.infra.update` | `apps/web/actions/infra/line.ts:36`<br>`apps/web/actions/infra/location.ts:55`<br>`apps/web/actions/infra/machine.ts:35`<br>`apps/web/actions/infra/warehouse.ts:58`<br>`apps/web/app/[locale]/(app)/(admin)/settings/_actions/documents.ts:39`<br>`apps/web/app/[locale]/(app)/(admin)/settings/infra/lines/page.tsx:24`<br>`apps/web/app/[locale]/(app)/(admin)/settings/infra/locations/_actions/import-location-csv.ts:54`<br>`apps/web/app/[locale]/(app)/(admin)/settings/infra/locations/page.tsx:205`<br>`apps/web/app/[locale]/(app)/(admin)/settings/infra/machines/page.tsx:113`<br>`apps/web/app/[locale]/(app)/(admin)/settings/infra/warehouses/page.tsx:26` |
| `technical.factory_spec.approve` | `apps/web/app/[locale]/(app)/(modules)/technical/factory-specs/_actions/shared.ts:32` |

## Notes

- `packages/rbac/src/permissions.enum.ts` exists and was checked with exact string-literal matching.
- Migration seeding was checked with exact quoted permission-string matching; substring matches such as `technical.factory_spec.approved` were not counted as seeding `technical.factory_spec.approve`.
- Dynamic or computed permission guards were treated as ambiguous and were not included in Table A unless their literal was statically resolved elsewhere: `apps/web/actions/import-export/capabilities.ts:95` (`permission`), `apps/web/actions/import-export/export.ts:60` (`permission`), `apps/web/actions/import-export/jobs.ts:55` (`permission`), `apps/web/app/(npd)/fa/actions/close-dept-section.ts:64` (`config.permission`), `apps/web/app/(npd)/fa/actions/update-fa-cell.ts:73` (`permission`), `apps/web/app/(npd)/pipeline/_actions/_lib/gate-helpers.ts:207` (`permission`), `apps/web/app/[locale]/(app)/(modules)/maintenance/_actions/mwo-actions.ts:499` (`requiredPermission`), `apps/web/app/[locale]/(app)/(modules)/production/_actions/changeover-actions.ts:542` (`permission`), `apps/web/app/[locale]/(app)/(modules)/production/_actions/get-wo-action-context.ts:154` and `:225` (`PERMISSION_STRINGS[key]`), `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment.ts:142` and `:148` (`permission`), `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/pack-actions.ts:99` (`permission`), `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:64` (`permission`), `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:160` (`permission`), `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:590` (`permissionForTransition(newStatus)`), and `apps/web/lib/corrections/correct-ledger-entry.ts:75` (`input.permission`).
- `permission_key` pass-through at `apps/web/lib/navigation/app-nav.ts:54` is dynamic; the concrete module permission literals were resolved from `apps/web/lib/navigation/module-registry.ts:5-20` and were found seeded and present in the enum.
