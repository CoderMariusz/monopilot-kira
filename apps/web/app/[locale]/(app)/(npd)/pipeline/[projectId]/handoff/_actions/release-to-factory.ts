'use server';

/**
 * NPD HANDOFF — explicit owner "Release to factory" gate.
 *
 * Records factory_release_status.release_status = 'released_to_factory' and
 * transitions the active factory_spec to released_to_factory so recall becomes
 * reachable. Reuses the authoritative T-096 release preflight + outbox path.
 *
 * RBAC: npd.gate.approve (same permission as releaseNpdProjectToFactory).
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';
import { releaseNpdProjectToFactory } from '../../../../../../../(npd)/builder/_actions/release-npd-project-to-factory';
import type { ReleaseToFactoryResult } from './release-to-factory-types';

const Input = z.object({
  projectId: z.string().uuid(),
});

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

export async function releaseToFactory(raw: unknown): Promise<ReleaseToFactoryResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const { projectId } = parsed.data;

  try {
    const result = await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as { userId: string; orgId: string; client: QueryClient };

      const projectRes = await ctx.client.query<{ id: string }>(
        `select id::text as id
           from public.npd_projects
          where id = $1::uuid
            and org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      if (!projectRes.rows[0]) return { ok: false as const, error: 'not_found' as const };

      const release = await releaseNpdProjectToFactory(projectId, ctx);
      if (!release.ok) {
        if (release.error === 'FORBIDDEN') return { ok: false as const, error: 'forbidden' as const };
        if (release.error === 'INVALID_INPUT') return { ok: false as const, error: 'invalid_input' as const };
        if (release.error === 'PRECONDITION_BLOCKERS' || release.error === 'PACKAGING_UNLINKED') {
          return {
            ok: false as const,
            error: 'release_blocked' as const,
            message: release.blockers?.map((b) => b.code).join(',') ?? release.message,
          };
        }
        return {
          ok: false as const,
          error: 'persistence_failed' as const,
          message: release.message,
        };
      }

      return {
        ok: true as const,
        data: {
          projectId: release.data.projectId,
          productCode: release.data.productCode,
          releaseStatus: release.data.releaseStatus,
          activeBomHeaderId: release.data.activeBomHeaderId,
          activeFactorySpecId: release.data.activeFactorySpecId,
        },
      };
    });

    if (!result.ok) return result;

    safeRevalidatePath(`/[locale]/(app)/(npd)/pipeline/${projectId}/handoff`);
    safeRevalidatePath('/planning/work-orders');

    return result;
  } catch (error) {
    console.error('[releaseToFactory] persistence_failed:', error);
    const pg = error as { code?: string; message?: string };
    return { ok: false, error: 'persistence_failed', message: pg.message };
  }
}

function safeRevalidatePath(path: string): void {
  try {
    revalidateLocalized(path, 'page');
  } catch {
    // Vitest imports Server Actions outside a Next request store.
  }
}
