import type { OrgContextLike } from '../shared';

/** npd_projects.name is canonical; linked FG product_name / items.name mirror it. */
export async function syncLinkedFgNameFromProject(
  ctx: OrgContextLike,
  projectId: string,
  projectName: string | null,
): Promise<void> {
  const normalizedName = typeof projectName === 'string' ? projectName.trim() : '';
  if (!normalizedName) return;

  await ctx.client.query(
    `update public.product p
        set product_name = $2
       from public.npd_projects np
      where np.id = $1::uuid
        and np.org_id = app.current_org_id()
        and np.product_code is not null
        and p.org_id = app.current_org_id()
        and p.product_code = np.product_code
        and p.deleted_at is null
        and p.product_name is distinct from $2`,
    [projectId, normalizedName],
  );

  await ctx.client.query(
    `update public.items i
        set name = $2,
            updated_at = now()
      where i.org_id = app.current_org_id()
        and i.item_type = 'fg'
        and (
          i.npd_project_id = $1::uuid
          or i.item_code = (
            select product_code
              from public.npd_projects
             where id = $1::uuid
               and org_id = app.current_org_id()
          )
        )
        and i.name is distinct from $2`,
    [projectId, normalizedName],
  );
}

export type LinkedFgArchiveBlockReason =
  | 'LINKED_FG_BUILT'
  | 'LINKED_FG_RELEASED'
  | 'LINKED_FG_IN_PRODUCTION'
  | 'LINKED_FG_ON_ORDER';

export class LinkedFgArchiveBlockedError extends Error {
  readonly code = 'LINKED_FG_BLOCKED' as const;

  constructor(public readonly reason: LinkedFgArchiveBlockReason) {
    super(reason);
    this.name = 'LinkedFgArchiveBlockedError';
  }
}

const RELEASED_STATUSES = ['built', 'released', 'released_to_factory', 'launched'] as const;

function isReleasedStatus(status: unknown): boolean {
  if (typeof status !== 'string') return false;
  return (RELEASED_STATUSES as readonly string[]).includes(status.trim().toLowerCase());
}

async function assertLinkedFgCanArchiveOnProjectDelete(
  ctx: OrgContextLike,
  projectId: string,
  productCode: string,
): Promise<void> {
  const { rows: products } = await ctx.client.query<{
    built: boolean;
    status_overall: string | null;
    deleted_at: string | null;
  }>(
    `select built, status_overall, deleted_at
       from public.product
      where org_id = app.current_org_id()
        and product_code = $1
      limit 1`,
    [productCode],
  );
  const product = products[0];
  if (!product || product.deleted_at != null) return;

  if (product.built === true) {
    throw new LinkedFgArchiveBlockedError('LINKED_FG_BUILT');
  }
  if (isReleasedStatus(product.status_overall)) {
    throw new LinkedFgArchiveBlockedError('LINKED_FG_RELEASED');
  }

  const { rows: factoryRelease } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.factory_release_status
      where org_id = app.current_org_id()
        and product_code = $1
        and release_status in ('approved_for_factory', 'released_to_factory')
      limit 1`,
    [productCode],
  );
  if (factoryRelease.length > 0) {
    throw new LinkedFgArchiveBlockedError('LINKED_FG_RELEASED');
  }

  const { rows: productionUse } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.work_orders wo
       join public.items i
         on i.id = wo.product_id
        and i.org_id = wo.org_id
      where wo.org_id = app.current_org_id()
        and i.item_code = $1
      limit 1`,
    [productCode],
  );
  if (productionUse.length > 0) {
    throw new LinkedFgArchiveBlockedError('LINKED_FG_IN_PRODUCTION');
  }

  const { rows: orderUse } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.sales_order_lines sol
       join public.items i
         on i.id = sol.product_id
        and i.org_id = sol.org_id
      where sol.org_id = app.current_org_id()
        and i.item_code = $1
      limit 1`,
    [productCode],
  );
  if (orderUse.length > 0) {
    throw new LinkedFgArchiveBlockedError('LINKED_FG_ON_ORDER');
  }

  // Guard against a race where the FG was re-linked to a different live project.
  const { rows: otherProjects } = await ctx.client.query<{ id: string }>(
    `select id
       from public.npd_projects
      where org_id = app.current_org_id()
        and product_code = $1
        and id <> $2::uuid
      limit 1`,
    [productCode, projectId],
  );
  if (otherProjects.length > 0) {
    throw new LinkedFgArchiveBlockedError('LINKED_FG_IN_PRODUCTION');
  }
}

/**
 * Soft-delete the draft FG and block its technical item before the parent project row
 * is removed. Throws LinkedFgArchiveBlockedError when production/order guards fail.
 */
export async function archiveLinkedFgForDeletedProject(
  ctx: OrgContextLike,
  projectId: string,
  productCode: string,
): Promise<void> {
  const normalizedCode = productCode.trim();
  if (!normalizedCode) return;

  await assertLinkedFgCanArchiveOnProjectDelete(ctx, projectId, normalizedCode);

  await ctx.client.query(
    `update public.product
        set deleted_at = now()
      where org_id = app.current_org_id()
        and product_code = $1
        and deleted_at is null`,
    [normalizedCode],
  );

  await ctx.client.query(
    `update public.items
        set status = 'blocked',
            updated_at = now()
      where org_id = app.current_org_id()
        and item_type = 'fg'
        and status <> 'blocked'
        and (
          item_code = $1
          or npd_project_id = $2::uuid
        )`,
    [normalizedCode, projectId],
  );
}
