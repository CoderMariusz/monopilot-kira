import { randomUUID } from 'node:crypto';

export type RecallFactorySpecCoreContext = {
  userId: string;
  client: {
    query<T = Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): Promise<{ rows: T[] }>;
  };
};

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

export type RecallFactorySpecCoreResult =
  | { ok: true; recalled: boolean }
  | { ok: false; error: string };

export function formatBlockingWorkOrdersError(woNumbers: string[]): string {
  return `Factory spec cannot be recalled while released or in-progress work orders reference it: ${woNumbers.join(', ')}`;
}

async function loadFactorySpecForUpdate(
  client: RecallFactorySpecCoreContext['client'],
  specId: string,
): Promise<FactorySpecRow | null> {
  const { rows } = await client.query<FactorySpecRow>(
    `select id::text as id,
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

async function loadBlockingWorkOrders(
  client: RecallFactorySpecCoreContext['client'],
  specId: string,
): Promise<string[]> {
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
  ctx: RecallFactorySpecCoreContext,
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

/**
 * Recall a released factory spec inside an existing org-scoped transaction.
 * Canonical SQL lives here; recall-spec.ts and revert-to-npd.ts both route through it.
 */
export async function recallFactorySpecInTransaction(
  ctx: RecallFactorySpecCoreContext,
  input: { specId: string; reason?: string | null; requireReleased?: boolean },
): Promise<RecallFactorySpecCoreResult> {
  const reason =
    typeof input.reason === 'string' && input.reason.trim().length > 0 ? input.reason.trim() : null;
  const requireReleased = input.requireReleased ?? true;

  const spec = await loadFactorySpecForUpdate(ctx.client, input.specId);
  if (!spec) return { ok: false, error: 'factory_spec not found' };
  if (spec.status !== 'released_to_factory') {
    if (requireReleased) {
      return { ok: false, error: `factory_spec is ${spec.status}; expected released_to_factory` };
    }
    return { ok: true, recalled: false };
  }

  const blockingWoCodes = await loadBlockingWorkOrders(ctx.client, spec.id);
  if (blockingWoCodes.length > 0) {
    return { ok: false, error: formatBlockingWorkOrdersError(blockingWoCodes) };
  }

  const { rows } = await ctx.client.query<{ id: string }>(
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
  if (!rows[0]) return { ok: false, error: 'factory_spec no longer released_to_factory' };

  await ctx.client.query(
    `update public.factory_release_status
        set release_status = 'pending_technical_approval',
            factory_available_at = null,
            factory_approved_by = null,
            release_event_id = null,
            updated_at = now()
      where org_id = app.current_org_id()
        and active_factory_spec_id = $1::uuid
        and release_status = 'released_to_factory'`,
    [spec.id],
  );

  await writeRecallAudit(ctx, { spec, reason });
  return { ok: true, recalled: true };
}
