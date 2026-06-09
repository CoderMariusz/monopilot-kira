'use server';

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { safeRevalidatePath } from '../_actions/revalidate';
import {
  canApproveFactorySpec,
  type OrgActionContext,
  type QueryClient,
} from '../_actions/shared';

const CreateFactorySpecInput = z.object({
  fgItemId: z.string().uuid(),
  specCode: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(2000).optional(),
});

type CreateFactorySpecResult =
  | { ok: true; data: { id: string; specCode: string; version: number } }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'not_found' | 'already_exists' | 'persistence_failed';
      message?: string;
    };

function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

export async function createFactorySpec(rawInput: unknown): Promise<CreateFactorySpecResult> {
  const parsed = CreateFactorySpecInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<CreateFactorySpecResult> => {
      const c = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: c };
      if (!(await canApproveFactorySpec(ctx))) return { ok: false, error: 'forbidden' };

      const { rows: itemRows } = await c.query<{ id: string; item_type: string }>(
        `select id, item_type
           from public.items
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [input.fgItemId],
      );
      const item = itemRows[0];
      if (!item) return { ok: false, error: 'not_found' };
      if (item.item_type !== 'fg') {
        return { ok: false, error: 'invalid_input', message: 'factory_specs must be anchored to an FG item' };
      }

      const { rows: versionRows } = await c.query<{ next_version: number | string }>(
        `select coalesce(max(version), 0) + 1 as next_version
           from public.factory_specs
          where org_id = app.current_org_id()
            and fg_item_id = $1::uuid`,
        [input.fgItemId],
      );
      const version = Number(versionRows[0]?.next_version ?? 1);

      const { rows } = await c.query<{ id: string }>(
        `insert into public.factory_specs
           (org_id, fg_item_id, spec_code, version, status, source, notes, created_by)
         values
           (app.current_org_id(), $1::uuid, $2, $3::integer, 'draft', 'technical', $4, $5::uuid)
         returning id`,
        [input.fgItemId, input.specCode, version, input.notes ?? null, userId],
      );
      const inserted = rows[0];
      if (!inserted) return { ok: false, error: 'persistence_failed' };

      await c.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            before_state, after_state, request_id, retention_class)
         values
           ($1::uuid, $2::uuid, 'user', 'factory_spec.created', 'factory_spec', $3,
            null, $4::jsonb, $5::uuid, 'standard')`,
        [
          orgId,
          userId,
          inserted.id,
          JSON.stringify({
            fgItemId: input.fgItemId,
            specCode: input.specCode,
            version,
            status: 'draft',
            source: 'technical',
            notes: input.notes ?? null,
          }),
          randomUUID(),
        ],
      );

      safeRevalidatePath('/technical/factory-specs');
      return { ok: true, data: { id: inserted.id, specCode: input.specCode, version } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23505') return { ok: false, error: 'already_exists' };
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    if (isPgError(err) && err.code === '23503') return { ok: false, error: 'not_found' };
    console.error('[technical/factory-specs] createFactorySpec persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
