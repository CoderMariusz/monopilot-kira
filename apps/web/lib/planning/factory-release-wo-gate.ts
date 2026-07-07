/**
 * Planning WO gate — FG must be explicitly released_to_factory before normal
 * (non-pilot) work-order creation.
 *
 * Grandfather rule: legacy FGs with no NPD project and no factory_release_status
 * row are treated as released. NPD-linked FGs require an explicit
 * factory_release_status.release_status = 'released_to_factory' row.
 */

export type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

/** SQL predicate (AND …) for searchFgProducts — excludes blocked FGs. */
export const FG_FACTORY_RELEASE_WO_GATE_SQL = `
          and not (
            exists (
              select 1
                from public.factory_release_status frs
               where frs.org_id = i.org_id
                 and frs.product_code = i.item_code
                 and frs.release_status is distinct from 'released_to_factory'
            )
            or (
              i.npd_project_id is not null
              and not exists (
                select 1
                  from public.factory_release_status frs
                 where frs.org_id = i.org_id
                   and frs.product_code = i.item_code
                   and frs.release_status = 'released_to_factory'
              )
            )
          )`;

export type FactoryReleaseWoGateResult = 'ok' | 'not_released_to_factory' | 'invalid_input';

export async function assertFgReleasedToFactoryForWo(
  client: QueryClient,
  productId: string,
): Promise<FactoryReleaseWoGateResult> {
  const { rows } = await client.query<{ item_id: string | null; blocked: boolean }>(
    `select i.id::text as item_id,
            (
              exists (
                select 1
                  from public.factory_release_status frs
                 where frs.org_id = i.org_id
                   and frs.product_code = i.item_code
                   and frs.release_status is distinct from 'released_to_factory'
              )
              or (
                i.npd_project_id is not null
                and not exists (
                  select 1
                    from public.factory_release_status frs
                   where frs.org_id = i.org_id
                     and frs.product_code = i.item_code
                     and frs.release_status = 'released_to_factory'
                )
              )
            ) as blocked
       from public.items i
      where i.org_id = app.current_org_id()
        and i.id = $1::uuid
      limit 1`,
    [productId],
  );
  const row = rows[0];
  if (!row?.item_id) return 'invalid_input';
  if (row.blocked) return 'not_released_to_factory';
  return 'ok';
}
