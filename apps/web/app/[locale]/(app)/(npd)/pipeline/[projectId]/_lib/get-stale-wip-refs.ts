import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import {
  resolveStaleWipDefinitions,
  type StaleWipDefinitionRow,
  type WipBumpNotification,
} from './stale-wip-definition';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

const ACCEPT_PERMISSION = 'npd.production.write';

export type StaleWipRefsResult = {
  staleDefinitions: StaleWipDefinitionRow[];
  canAccept: boolean;
};

/**
 * Resolve the formulation version the page is viewing — mirrors get-formulation.ts:
 * explicit versionId when it belongs to the project's formulation, else current_version_id.
 */
async function resolveFormulationVersionId(
  ctx: OrgContextLike,
  projectId: string,
  versionId?: string,
): Promise<string | null> {
  const { rows } = await ctx.client.query<{ version_id: string | null }>(
    `select coalesce(
       (
         select rfv.id::text
           from public.formulations f
           join public.formulation_versions rfv on rfv.formulation_id = f.id
          where f.project_id = $1::uuid
            and f.org_id = app.current_org_id()
            and rfv.id = $2::uuid
          limit 1
       ),
       (
         select fv.id::text
           from public.formulations f
           join public.formulation_versions fv on fv.id = f.current_version_id
          where f.project_id = $1::uuid
            and f.org_id = app.current_org_id()
          limit 1
       )
     ) as version_id`,
    [projectId, versionId ?? null],
  );
  return rows[0]?.version_id ?? null;
}

async function loadReferencedWipDefinitions(
  ctx: OrgContextLike,
  versionId: string,
): Promise<Array<{ wipDefinitionId: string; name: string; version: number }>> {
  const { rows } = await ctx.client.query<{
    wip_definition_id: string;
    name: string;
    version: number;
  }>(
    `select distinct
       wd.id::text as wip_definition_id,
       wd.name,
       wd.version
     from public.formulation_ingredients fi
     join public.wip_definitions wd on wd.id = fi.wip_definition_id
    where fi.version_id = $1::uuid
      and fi.wip_definition_id is not null
      and wd.org_id = app.current_org_id()
    order by wd.name`,
    [versionId],
  );

  return rows.map((r) => ({
    wipDefinitionId: r.wip_definition_id,
    name: r.name,
    version: r.version,
  }));
}

async function loadAcks(
  ctx: OrgContextLike,
  projectId: string,
  definitionIds: string[],
): Promise<Array<{ wipDefinitionId: string; acceptedVersion: number }>> {
  if (definitionIds.length === 0) return [];

  const { rows } = await ctx.client.query<{
    wip_definition_id: string;
    accepted_version: number;
  }>(
    `select wip_definition_id::text, accepted_version
       from public.wip_definition_acks
      where npd_project_id = $1::uuid
        and org_id = app.current_org_id()
        and wip_definition_id = any($2::uuid[])`,
    [projectId, definitionIds],
  );

  return rows.map((r) => ({
    wipDefinitionId: r.wip_definition_id,
    acceptedVersion: r.accepted_version,
  }));
}

function parseNotificationPayload(payload: unknown): WipBumpNotification | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const wipDefinitionId = typeof p.wipDefinitionId === 'string' ? p.wipDefinitionId : null;
  const projectId = typeof p.projectId === 'string' ? p.projectId : null;
  const version = typeof p.version === 'number' ? p.version : Number(p.version);
  if (!wipDefinitionId || !projectId || !Number.isFinite(version)) return null;
  return {
    wipDefinitionId,
    projectId,
    version,
    changes: typeof p.changes === 'string' ? p.changes : undefined,
  };
}

async function loadBumpNotifications(
  ctx: OrgContextLike,
  projectId: string,
  definitionIds: string[],
): Promise<WipBumpNotification[]> {
  if (definitionIds.length === 0) return [];

  const { rows } = await ctx.client.query<{
    body: string | null;
    payload: unknown;
  }>(
    `select body, payload
       from public.user_notifications
      where org_id = app.current_org_id()
        and user_id = $1::uuid
        and type = 'wip.definition.updated'
        and (payload->>'projectId')::text = $2::text
        and (payload->>'wipDefinitionId')::text = any($3::text[])
      order by created_at desc`,
    [ctx.userId, projectId, definitionIds],
  );

  const out: WipBumpNotification[] = [];
  for (const r of rows) {
    const parsed = parseNotificationPayload(r.payload);
    if (!parsed) continue;
    out.push({ ...parsed, body: r.body ?? undefined });
  }
  return out;
}

export async function getStaleWipRefs(input: {
  projectId: string;
  versionId?: string;
}): Promise<StaleWipRefsResult> {
  if (!input.projectId) {
    return { staleDefinitions: [], canAccept: false };
  }

  try {
    return await withOrgContext(async (rawCtx: OrgContextLike) => {
      const ctx = rawCtx as OrgContextLike;
      const [versionId, canAccept] = await Promise.all([
        resolveFormulationVersionId(ctx, input.projectId, input.versionId),
        hasPermission(ctx, ACCEPT_PERMISSION),
      ]);

      if (!versionId) {
        return { staleDefinitions: [], canAccept };
      }

      const definitions = await loadReferencedWipDefinitions(ctx, versionId);
      if (definitions.length === 0) {
        return { staleDefinitions: [], canAccept };
      }

      const definitionIds = definitions.map((d) => d.wipDefinitionId);
      const [acks, bumpNotifications] = await Promise.all([
        loadAcks(ctx, input.projectId, definitionIds),
        loadBumpNotifications(ctx, input.projectId, definitionIds),
      ]);

      const staleDefinitions = resolveStaleWipDefinitions({
        definitions,
        acks,
        bumpNotifications,
        projectId: input.projectId,
      });

      return { staleDefinitions, canAccept };
    });
  } catch {
    return { staleDefinitions: [], canAccept: false };
  }
}
