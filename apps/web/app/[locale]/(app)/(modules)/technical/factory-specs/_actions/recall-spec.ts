'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { safeRevalidatePath } from './revalidate';
import {
  hasPermission,
  type OrgActionContext,
  type QueryClient,
} from './shared';

const FACTORY_SPEC_RECALL_PERMISSION = 'technical.factory_spec.recall';

const RecallFactorySpecInput = z.object({
  specId: z.string().uuid(),
  reason: z.string().trim().max(2000).optional().nullable(),
});

export type RecallFactorySpecInput = z.input<typeof RecallFactorySpecInput>;

export type RecallFactorySpecResult = { success: true } | { error: string };

type FactorySpecRow = {
  id: string;
  spec_code: string;
  version: number;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  released_by: string | null;
  released_at: string | null;
};

type BlockingWorkOrderRow = {
  wo_number: string;
};

function normalizeReason(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

async function loadFactorySpecForUpdate(client: QueryClient, specId: string): Promise<FactorySpecRow | null> {
  const { rows } = await client.query<FactorySpecRow>(
    `select id::text,
            spec_code,
            version,
            status,
            approved_by::text as approved_by,
            approved_at::text as approved_at,
            released_by::text as released_by,
            released_at::text as released_at
       from public.factory_specs
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1
      for update`,
    [specId],
  );
  return rows[0] ?? null;
}

async function loadBlockingWorkOrders(client: QueryClient, specId: string): Promise<string[]> {
  const { rows } = await client.query<BlockingWorkOrderRow>(
    `select wo_number
       from public.work_orders
      where org_id = app.current_org_id()
        and active_factory_spec_id = $1::uuid
        and upper(status) in ('RELEASED', 'IN_PROGRESS')
      order by wo_number asc
      limit 25`,
    [specId],
  );
  return rows.map((row) => row.wo_number);
}

async function writeRecallAudit(
  ctx: OrgActionContext,
  params: {
    spec: FactorySpecRow;
    reason: string | null;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, request_id, retention_class)
     values
       (app.current_org_id(), $1::uuid, 'user', 'technical.factory_spec.recalled',
        'factory_spec', $2, $3::jsonb, $4::jsonb, $5::uuid, 'operational')`,
    [
      ctx.userId,
      params.spec.id,
      JSON.stringify({
        spec_id: params.spec.id,
        spec_code: params.spec.spec_code,
        version: params.spec.version,
        status: params.spec.status,
        approved_by: params.spec.approved_by,
        approved_at: params.spec.approved_at,
        released_by: params.spec.released_by,
        released_at: params.spec.released_at,
      }),
      JSON.stringify({
        status: 'draft',
        reason: params.reason,
      }),
      randomUUID(),
    ],
  );
}

export async function recallFactorySpec(rawInput: unknown): Promise<RecallFactorySpecResult> {
  const parsed = RecallFactorySpecInput.safeParse(rawInput);
  if (!parsed.success) return { error: parsed.error.message };
  const reason = normalizeReason(parsed.data.reason);

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<RecallFactorySpecResult> => {
      const db = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: db };
      if (!(await hasPermission(ctx, FACTORY_SPEC_RECALL_PERMISSION))) {
        return { error: 'forbidden' };
      }

      const spec = await loadFactorySpecForUpdate(db, parsed.data.specId);
      if (!spec) return { error: 'factory_spec not found' };
      if (spec.status !== 'released_to_factory') {
        return { error: `factory_spec is ${spec.status}; expected released_to_factory` };
      }

      const blockingWoCodes = await loadBlockingWorkOrders(db, spec.id);
      if (blockingWoCodes.length > 0) {
        return {
          error: `Factory spec cannot be recalled while released or in-progress work orders reference it: ${blockingWoCodes.join(', ')}`,
        };
      }

      // TODO(R4): revisit e-sign if the reversibility audit later classifies spec recall as higher risk.
      const { rows } = await db.query<{ id: string }>(
        `update public.factory_specs
            set status = 'draft',
                approved_by = null,
                approved_at = null,
                released_by = null,
                released_at = null,
                updated_at = now()
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'released_to_factory'
          returning id::text as id`,
        [spec.id],
      );
      if (!rows[0]) return { error: 'factory_spec no longer released_to_factory' };

      await writeRecallAudit(ctx, { spec, reason });

      safeRevalidatePath('/technical/factory-specs');
      return { success: true };
    });
  } catch (error) {
    console.error('[technical/factory-specs] recallFactorySpec failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'persistence_failed' };
  }
}
