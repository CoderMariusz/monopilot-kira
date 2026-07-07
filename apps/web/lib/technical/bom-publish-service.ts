/**
 * Canonical BOM publish (technical_approved → active + atomic supersede).
 *
 * Shared by the BOM workflow Server Action and ECO apply-on-close so publish
 * semantics stay in one place — callers supply an org-context QueryClient inside
 * an open transaction.
 */

import {
  AUDIT_BOM_PUBLISH,
  BOM_VERSION_PUBLISH_PERMISSION,
  EVENT_FG_BOM_RELEASED,
  hasPermission,
  type OrgActionContext,
  type QueryClient,
  writeAudit,
  writeOutbox,
} from '../../app/[locale]/(app)/(modules)/technical/bom/_actions/shared';

export type PublishBomVersionParams = {
  bomHeaderId: string;
  productId: string;
  version: number;
};

export type PublishBomVersionResult =
  | {
      ok: true;
      data: {
        bomHeaderId: string;
        productId: string;
        version: number;
        supersededHeaderIds: string[];
      };
    }
  | {
      ok: false;
      error: 'forbidden' | 'not_found' | 'conflict' | 'validation_failed' | 'persistence_failed';
      code?: 'V-TEC-10';
      message?: string;
    };

type BomHeaderRow = {
  id: string;
  status: string;
  product_id: string | null;
  version: number;
};

async function loadBomHeader(client: QueryClient, bomHeaderId: string): Promise<BomHeaderRow | null> {
  const { rows } = await client.query<BomHeaderRow>(
    `select id, status, product_id, version
       from public.bom_headers
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [bomHeaderId],
  );
  return rows[0] ?? null;
}

export async function publishBomVersion(
  ctx: OrgActionContext,
  params: PublishBomVersionParams,
): Promise<PublishBomVersionResult> {
  if (!(await hasPermission(ctx, BOM_VERSION_PUBLISH_PERMISSION))) {
    return { ok: false, error: 'forbidden' };
  }

  const header = await loadBomHeader(ctx.client, params.bomHeaderId);
  if (!header) return { ok: false, error: 'not_found' };
  if (header.product_id && header.product_id !== params.productId) {
    return { ok: false, error: 'validation_failed', message: 'product mismatch' };
  }
  if (Number(header.version) !== params.version) {
    return { ok: false, error: 'validation_failed', message: 'version mismatch' };
  }

  if (header.status === 'active') {
    return {
      ok: true,
      data: {
        bomHeaderId: header.id,
        productId: params.productId,
        version: params.version,
        supersededHeaderIds: [],
      },
    };
  }

  if (header.status !== 'technical_approved') {
    return {
      ok: false,
      error: 'validation_failed',
      code: 'V-TEC-10',
      message: 'version must be technical_approved before publish',
    };
  }

  const { rows: superseded } = await ctx.client.query<{ id: string; version: number }>(
    `update public.bom_headers
        set status = 'superseded'
      where org_id = app.current_org_id()
        and product_id = $1
        and status = 'active'
        and id <> $2::uuid
      returning id, version`,
    [params.productId, header.id],
  );

  const { rows: activated } = await ctx.client.query<{ version: number }>(
    `update public.bom_headers
        set status = 'active'
      where org_id = app.current_org_id()
        and id = $1::uuid
        and status = 'technical_approved'
      returning version`,
    [header.id],
  );
  if (activated.length === 0) return { ok: false, error: 'conflict' };

  await writeAudit(ctx.client, {
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: AUDIT_BOM_PUBLISH,
    resourceId: header.id,
    beforeState: { status: 'technical_approved', supersededVersions: superseded.map((s) => s.version) },
    afterState: { status: 'active', productId: params.productId, version: params.version },
  });

  await writeOutbox(ctx.client, {
    orgId: ctx.orgId,
    eventType: EVENT_FG_BOM_RELEASED,
    aggregateType: 'bom_header',
    aggregateId: header.id,
    payload: {
      product_id: params.productId,
      version: params.version,
      status: 'active',
      superseded_header_ids: superseded.map((s) => s.id),
      actor_user_id: ctx.userId,
    },
  });

  return {
    ok: true,
    data: {
      bomHeaderId: header.id,
      productId: params.productId,
      version: params.version,
      supersededHeaderIds: superseded.map((s) => s.id),
    },
  };
}
