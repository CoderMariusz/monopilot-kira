/**
 * Canonical factory release persistence shared by NPD handoff
 * (`releaseNpdProjectToFactory`) and direct Technical release for non-NPD specs.
 */

export const RELEASED_TO_FACTORY_EVENT = 'fg.released_to_factory' as const;
export const FACTORY_RELEASE_EVENT_APP_VERSION = 't-096';

export type FactoryReleasePersistenceClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type FactoryReleaseActorContext = {
  orgId: string;
  userId: string;
  client: FactoryReleasePersistenceClient;
};

type ReleaseRow = {
  id: string;
  release_status: 'released_to_factory';
  factory_available_at: Date | string;
  factory_approved_by: string;
  release_event_id: string | number;
};

export type ReleasedToFactoryEventInput = {
  projectId?: string | null;
  projectCode?: string | null;
  productCode: string;
  activeBomHeaderId: string;
  activeFactorySpecId: string;
};

export async function supersedePriorReleasedFactorySpecs(
  client: FactoryReleasePersistenceClient,
  fgItemId: string,
  keepSpecId: string,
): Promise<void> {
  await client.query(
    `update public.factory_specs
        set status = 'superseded'
      where org_id = app.current_org_id()
        and fg_item_id = $1::uuid
        and status = 'released_to_factory'
        and id <> $2::uuid`,
    [fgItemId, keepSpecId],
  );
}

export async function insertReleasedToFactoryEvent(
  ctx: FactoryReleaseActorContext,
  input: ReleasedToFactoryEventInput,
): Promise<number> {
  const scopeKey = input.projectId ?? input.productCode;
  const dedupKey = `${FACTORY_RELEASE_EVENT_APP_VERSION}:${scopeKey}:released-to-factory:${input.activeBomHeaderId}:${input.activeFactorySpecId}`;
  const aggregateId = input.projectId ?? input.productCode;
  const payload: Record<string, unknown> = {
    org_id: ctx.orgId,
    actor_user_id: ctx.userId,
    productCode: input.productCode,
    activeBomHeaderId: input.activeBomHeaderId,
    activeFactorySpecId: input.activeFactorySpecId,
    factoryApprovedBy: ctx.userId,
  };
  if (input.projectId) {
    payload.projectId = input.projectId;
    if (input.projectCode) payload.projectCode = input.projectCode;
  }

  const inserted = await ctx.client.query<{ id: string | number }>(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
     values
       (app.current_org_id(), $1, 'factory_release_status', $2, $3::jsonb, $4, $5)
     on conflict (org_id, dedup_key) where dedup_key is not null
     do nothing
     returning id`,
    [RELEASED_TO_FACTORY_EVENT, aggregateId, JSON.stringify(payload), FACTORY_RELEASE_EVENT_APP_VERSION, dedupKey],
  );
  const id = inserted.rows[0]?.id ?? (await loadEventIdByDedupKey(ctx, dedupKey));
  const numericId = typeof id === 'string' ? Number(id) : id;
  if (!Number.isFinite(numericId)) throw new Error(`failed to emit ${RELEASED_TO_FACTORY_EVENT}`);
  return numericId;
}

async function loadEventIdByDedupKey(
  ctx: FactoryReleaseActorContext,
  dedupKey: string,
): Promise<number | string | undefined> {
  const { rows } = await ctx.client.query<{ id: string | number }>(
    `select id
       from public.outbox_events
      where org_id = app.current_org_id()
        and dedup_key = $1
      limit 1`,
    [dedupKey],
  );
  return rows[0]?.id;
}

export async function transitionFactorySpecToReleased(
  ctx: FactoryReleaseActorContext,
  input: { factorySpecId: string },
): Promise<void> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `update public.factory_specs
        set status = 'released_to_factory',
            released_by = $2::uuid,
            released_at = coalesce(released_at, now()),
            updated_at = now()
      where org_id = app.current_org_id()
        and id = $1::uuid
        and status in ('approved_for_factory', 'released_to_factory')
      returning id`,
    [input.factorySpecId, ctx.userId],
  );
  if (!rows[0]) throw new Error('factory_spec_no_longer_releasable');
}

export async function upsertFactoryReleaseStatus(
  ctx: FactoryReleaseActorContext,
  input: {
    projectId: string;
    productCode: string;
    activeBomHeaderId: string;
    activeFactorySpecId: string;
    releaseEventId: number;
  },
): Promise<ReleaseRow> {
  const { rows } = await ctx.client.query<ReleaseRow>(
    `insert into public.factory_release_status
       (org_id, project_id, product_code, release_status, factory_available_at, factory_approved_by,
        release_event_id, active_bom_header_id, active_factory_spec_id, release_blockers, requested_by, requested_at)
     values
       (app.current_org_id(), $1::uuid, $2, 'released_to_factory', now(), $3::uuid,
        $4, $5::uuid, $6::uuid, '[]'::jsonb, $3::uuid, now())
     on conflict (org_id, project_id, product_code)
     do update set release_status = 'released_to_factory',
                   factory_available_at = coalesce(public.factory_release_status.factory_available_at, excluded.factory_available_at),
                   factory_approved_by = coalesce(public.factory_release_status.factory_approved_by, excluded.factory_approved_by),
                   release_event_id = coalesce(public.factory_release_status.release_event_id, excluded.release_event_id),
                   active_bom_header_id = excluded.active_bom_header_id,
                   active_factory_spec_id = excluded.active_factory_spec_id,
                   release_blockers = '[]'::jsonb,
                   requested_by = coalesce(public.factory_release_status.requested_by, excluded.requested_by),
                   requested_at = coalesce(public.factory_release_status.requested_at, excluded.requested_at)
     returning id, release_status, factory_available_at, factory_approved_by, release_event_id`,
    [
      input.projectId,
      input.productCode,
      ctx.userId,
      input.releaseEventId,
      input.activeBomHeaderId,
      input.activeFactorySpecId,
    ],
  );
  const release = rows[0];
  if (!release) throw new Error('factory release status upsert returned no row');
  return release;
}

/** Best-effort sync when a factory_release_status row already points at this spec. */
export async function syncFactoryReleaseStatusForReleasedSpec(
  ctx: FactoryReleaseActorContext,
  input: {
    activeBomHeaderId: string;
    activeFactorySpecId: string;
    releaseEventId: number;
  },
): Promise<void> {
  await ctx.client.query(
    `update public.factory_release_status
        set release_status = 'released_to_factory',
            active_bom_header_id = coalesce(active_bom_header_id, $1::uuid),
            active_factory_spec_id = $2::uuid,
            factory_available_at = coalesce(factory_available_at, now()),
            factory_approved_by = coalesce(factory_approved_by, $3::uuid),
            release_event_id = coalesce(release_event_id, $4::bigint),
            release_blockers = '[]'::jsonb,
            updated_at = now()
      where org_id = app.current_org_id()
        and active_factory_spec_id = $2::uuid
        and release_status in ('approved_for_factory', 'released_to_factory')`,
    [input.activeBomHeaderId, input.activeFactorySpecId, ctx.userId, input.releaseEventId],
  );
}
