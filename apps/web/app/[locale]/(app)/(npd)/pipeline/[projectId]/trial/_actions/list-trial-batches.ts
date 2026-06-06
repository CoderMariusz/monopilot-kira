'use server';

/**
 * 01-NPD TRIAL stage — `listTrialBatches` (read Server Action).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/trial
 *
 * Reads REAL, org-scoped trial batches via `withOrgContext` (RLS as app_user
 * with app.current_org_id()). No mocks, no hard-coded rows. Money/percent
 * columns are cast ::text → decimal STRINGS (never JS floats).
 *
 * RBAC read permission: `npd.trial.read` (BYTE-IDENTICAL to the seeded string).
 *
 * Schema (migration 233 — public.trial_batches): id, org_id, project_id (FK
 * npd_projects), trial_no, trial_date, batch_size_kg numeric, yield_pct
 * numeric(5,2), technologist_user_id (FK users), result enum, notes + audit.
 * Unique (org_id, project_id, trial_no). RLS via app.current_org_id().
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  TRIAL_READ_PERMISSION,
  type ListTrialBatchesError,
  type TrialBatchView,
  type TrialResult,
} from './errors';

const Input = z.object({
  projectId: z.string().uuid(),
});

export type ListTrialBatchesResult =
  | { ok: true; data: { batches: TrialBatchView[] } }
  | { ok: false; error: ListTrialBatchesError; message?: string };

type RowShape = {
  id: string;
  trial_no: string;
  trial_date: string | null;
  batch_size_kg: string | null;
  yield_pct: string | null;
  technologist_user_id: string | null;
  technologist_name: string | null;
  result: TrialResult;
  notes: string | null;
};

async function hasPermission(
  client: { query: <T>(sql: string, params?: readonly unknown[]) => Promise<{ rows: T[] }> },
  userId: string,
  orgId: string,
  permission: string,
): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [userId, orgId, permission],
  );
  return rows.length > 0;
}

export async function listTrialBatches(raw: unknown): Promise<ListTrialBatchesResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    // A malformed projectId means there is nothing to scope to — treat as not
    // found rather than leaking validation internals to the read surface.
    return { ok: false, error: 'not_found', message: parsed.error.message };
  }
  const { projectId } = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const canRead = await hasPermission(client, userId, orgId, TRIAL_READ_PERMISSION);
      if (!canRead) return { ok: false as const, error: 'forbidden' as const };

      // Confirm the project exists within the org (RLS scopes to org).
      const project = await client.query<{ id: string }>(
        `select id from public.npd_projects
          where id = $1::uuid and org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      if (project.rows.length === 0) return { ok: false as const, error: 'not_found' as const };

      const { rows } = await client.query<RowShape>(
        `select tb.id,
                tb.trial_no,
                to_char(tb.trial_date, 'YYYY-MM-DD') as trial_date,
                tb.batch_size_kg::text               as batch_size_kg,
                tb.yield_pct::text                   as yield_pct,
                tb.technologist_user_id::text        as technologist_user_id,
                u.display_name                       as technologist_name,
                tb.result,
                tb.notes
           from public.trial_batches tb
           left join public.users u
             on u.id = tb.technologist_user_id and u.org_id = tb.org_id
          where tb.org_id = app.current_org_id()
            and tb.project_id = $1::uuid
          order by tb.trial_date desc nulls last, tb.trial_no asc`,
        [projectId],
      );

      const batches: TrialBatchView[] = rows.map((r) => ({
        id: r.id,
        trialNo: r.trial_no,
        trialDate: r.trial_date,
        batchSizeKg: r.batch_size_kg,
        yieldPct: r.yield_pct,
        technologistUserId: r.technologist_user_id,
        technologistName: r.technologist_name,
        result: r.result,
        notes: r.notes,
      }));

      return { ok: true as const, data: { batches } };
    });
  } catch (err) {
    console.error('[listTrialBatches] persistence_failed', {
      projectId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
