'use server';

/**
 * NPD PACKAGING stage — `deletePackagingComponent` write Server Action.
 *
 * Org-scoped delete of a packaging component. Wrapped in withOrgContext (RLS as
 * app_user). RBAC: requires `npd.packaging.write`. Writes an audit_log row in
 * the SAME txn and revalidates the packaging route. Map DB errors to the closed
 * enum; never echo internal columns.
 */

import { revalidatePath } from 'next/cache';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  DeletePackagingComponentSchema,
  PACKAGING_WRITE_PERMISSION,
  hasPermission,
  writeAudit,
  type DeletePackagingResult,
  type QueryClient,
} from './shared';

export async function deletePackagingComponent(raw: unknown): Promise<DeletePackagingResult> {
  const parsed = DeletePackagingComponentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as unknown as QueryClient;

      const canWrite = await hasPermission(queryClient, userId, orgId, PACKAGING_WRITE_PERMISSION);
      if (!canWrite) return { ok: false as const, error: 'forbidden' as const };

      const before = await queryClient.query<Record<string, unknown>>(
        `select id, tier, component_name, material, supplier_code, spec,
                cost_per_unit::text as cost_per_unit, status, display_order
           from public.packaging_components
          where id = $1::uuid and project_id = $2::uuid and org_id = app.current_org_id()
          limit 1`,
        [input.id, input.projectId],
      );
      if (before.rows.length === 0) return { ok: false as const, error: 'not_found' as const };

      const deleted = await queryClient.query<{ id: string }>(
        `delete from public.packaging_components
          where id = $1::uuid and project_id = $2::uuid and org_id = app.current_org_id()
          returning id`,
        [input.id, input.projectId],
      );
      const id = deleted.rows[0]?.id;
      if (!id) return { ok: false as const, error: 'not_found' as const };

      await writeAudit(queryClient, {
        orgId,
        actorUserId: userId,
        action: 'npd.packaging.component.deleted',
        resourceId: id,
        beforeState: before.rows[0],
        afterState: null,
      });

      revalidatePath(`/[locale]/pipeline/${input.projectId}/packaging`, 'page');
      return { ok: true as const, data: { id } };
    });
  } catch (err) {
    console.error('[deletePackagingComponent] persistence_failed', {
      projectId: input.projectId,
      id: input.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
