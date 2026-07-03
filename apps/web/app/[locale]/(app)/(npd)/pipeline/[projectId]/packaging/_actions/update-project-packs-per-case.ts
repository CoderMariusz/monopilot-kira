'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';
import {
  PACKAGING_WRITE_PERMISSION,
  hasPermission,
  type QueryClient,
} from './shared';

const inputSchema = z.object({
  projectId: z.string().uuid(),
  packsPerCase: z.number().int().min(0),
});

export type UpdateProjectPacksPerCaseResult =
  | { ok: true }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' };

export async function updateProjectPacksPerCase(raw: unknown): Promise<UpdateProjectPacksPerCaseResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as unknown as QueryClient;
      if (!(await hasPermission(queryClient, userId, orgId, PACKAGING_WRITE_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      const updated = await queryClient.query<{ id: string }>(
        `update public.npd_projects
            set packs_per_case = $2::integer
          where id = $1::uuid
            and org_id = app.current_org_id()
          returning id`,
        [parsed.data.projectId, parsed.data.packsPerCase],
      );
      if (updated.rows.length === 0) return { ok: false as const, error: 'not_found' as const };

      if (parsed.data.packsPerCase > 0) {
        await queryClient.query(
          `update public.items
              set each_per_box = $2
            where org_id = app.current_org_id()
              and npd_project_id = $1::uuid
              and item_type = 'fg'
              and coalesce(each_per_box, 0) <> $2`,
          [parsed.data.projectId, parsed.data.packsPerCase],
        );
      }

      revalidateLocalized(`/pipeline/${parsed.data.projectId}/packaging`, 'page');
      revalidateLocalized(`/pipeline/${parsed.data.projectId}/brief`, 'page');
      return { ok: true as const };
    });
  } catch (error) {
    console.error('[updateProjectPacksPerCase] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
