'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { type OrgContextLike } from '../../pipeline/_actions/shared';
import {
  ReleasePreflightError,
  runReleasePreflight,
  requireReleasePermission,
  type ReleasePreflightBlocker,
} from '../_lib/release-preflight';

const RELEASED_TO_FACTORY_EVENT = 'fg.released_to_factory' as const;
const APP_VERSION = 't-096';

const inputSchema = z.union([
  z.string().uuid().transform((projectId) => ({ projectId, activeFactorySpecId: undefined as string | undefined })),
  z.object({
    projectId: z.string().uuid(),
    activeFactorySpecId: z.string().uuid().optional().nullable(),
  }),
]);

type ReleaseRow = {
  id: string;
  release_status: 'released_to_factory';
  factory_available_at: Date | string;
  factory_approved_by: string;
  release_event_id: string | number;
};

export type ReleaseNpdProjectToFactoryResult =
  | {
      ok: true;
      data: {
        projectId: string;
        productCode: string;
        activeBomHeaderId: string;
        activeFactorySpecId: string;
        releaseStatus: 'released_to_factory';
        factoryAvailableAt: string;
        releaseEventId: number;
        outboxEventType: typeof RELEASED_TO_FACTORY_EVENT;
      };
    }
  | {
      ok: false;
      error: 'INVALID_INPUT' | 'FORBIDDEN' | 'PRECONDITION_BLOCKERS' | 'PERSISTENCE_FAILED';
      status: number;
      blockers?: ReleasePreflightBlocker[];
    };

export async function releaseNpdProjectToFactory(rawInput: unknown): Promise<ReleaseNpdProjectToFactoryResult> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', status: 400 };

  try {
    return await withOrgContext<ReleaseNpdProjectToFactoryResult>(async (ctx) => {
      const context = ctx as OrgContextLike;
      await requireReleasePermission(context);
      const ready = await runReleasePreflight(context, parsed.data);

      const releaseEventId = await insertReleasedToFactoryEvent(context, {
        projectId: ready.projectId,
        projectCode: ready.projectCode,
        productCode: ready.productCode,
        activeBomHeaderId: ready.activeBomHeaderId,
        activeFactorySpecId: ready.activeFactorySpecId,
      });
      const release = await upsertFactoryReleaseStatus(context, {
        projectId: ready.projectId,
        productCode: ready.productCode,
        activeBomHeaderId: ready.activeBomHeaderId,
        activeFactorySpecId: ready.activeFactorySpecId,
        releaseEventId,
      });

      safeRevalidatePath(`/npd/pipeline/${ready.projectId}`);
      safeRevalidatePath(`/npd/fa/${ready.productCode}`);

      return {
        ok: true,
        data: {
          projectId: ready.projectId,
          productCode: ready.productCode,
          activeBomHeaderId: ready.activeBomHeaderId,
          activeFactorySpecId: ready.activeFactorySpecId,
          releaseStatus: release.release_status,
          factoryAvailableAt: toIso(release.factory_available_at),
          releaseEventId: Number(release.release_event_id),
          outboxEventType: RELEASED_TO_FACTORY_EVENT,
        },
      };
    });
  } catch (error) {
    if (error instanceof ReleasePreflightError) {
      return {
        ok: false,
        error: error.status === 403 ? 'FORBIDDEN' : 'PRECONDITION_BLOCKERS',
        status: error.status,
        blockers: error.status === 403 ? undefined : error.blockers,
      };
    }
    console.error('[releaseNpdProjectToFactory] persistence_failed', {
      appVersion: APP_VERSION,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'PERSISTENCE_FAILED', status: 500 };
  }
}

async function insertReleasedToFactoryEvent(
  ctx: OrgContextLike,
  input: {
    projectId: string;
    projectCode: string;
    productCode: string;
    activeBomHeaderId: string;
    activeFactorySpecId: string;
  },
): Promise<number> {
  const dedupKey = `${APP_VERSION}:${input.projectId}:released-to-factory:${input.activeBomHeaderId}:${input.activeFactorySpecId}`;
  const inserted = await ctx.client.query<{ id: string | number }>(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
     values
       (app.current_org_id(), $1, 'factory_release_status', $2, $3::jsonb, $4, $5)
     on conflict (org_id, dedup_key) where dedup_key is not null
     do nothing
     returning id`,
    [
      RELEASED_TO_FACTORY_EVENT,
      input.projectId,
      JSON.stringify({
        org_id: ctx.orgId,
        actor_user_id: ctx.userId,
        projectId: input.projectId,
        projectCode: input.projectCode,
        productCode: input.productCode,
        activeBomHeaderId: input.activeBomHeaderId,
        activeFactorySpecId: input.activeFactorySpecId,
        factoryApprovedBy: ctx.userId,
      }),
      APP_VERSION,
      dedupKey,
    ],
  );
  const id = inserted.rows[0]?.id ?? (await loadEventIdByDedupKey(ctx, dedupKey));
  const numericId = typeof id === 'string' ? Number(id) : id;
  if (!Number.isFinite(numericId)) throw new Error(`failed to emit ${RELEASED_TO_FACTORY_EVENT}`);
  return numericId;
}

async function loadEventIdByDedupKey(ctx: OrgContextLike, dedupKey: string): Promise<number | string | undefined> {
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

async function upsertFactoryReleaseStatus(
  ctx: OrgContextLike,
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

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}
