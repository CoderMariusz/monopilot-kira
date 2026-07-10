/**
 * Serializes factory-spec recall vs WO factory-spec binding for the same FG product.
 *
 * Both recall-factory-spec-core and releaseWorkOrder acquire this xact-scoped lock
 * before reading/writing active_factory_spec_id so a WO cannot slip between the
 * recall's unlocked check and its draft flip.
 */

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

export async function acquireFactorySpecProductBindLock(
  client: QueryClient,
  fgItemId: string,
): Promise<void> {
  await client.query(
    `select pg_advisory_xact_lock(
       hashtext('technical:factory_spec_bind'::text || '::' || app.current_org_id()::text || '::' || $1::text)
     )`,
    [fgItemId],
  );
}

export async function fetchEligibleFactorySpecUnderBindLock(
  client: QueryClient,
  fgItemId: string,
): Promise<{ id: string } | null> {
  await acquireFactorySpecProductBindLock(client, fgItemId);
  const { rows } = await client.query<{ id: string }>(
    `select spec.id::text as id
       from public.factory_specs spec
      where spec.org_id = app.current_org_id()
        and spec.fg_item_id = $1::uuid
        and spec.status in ('approved_for_factory', 'released_to_factory')
      order by spec.version desc
      limit 1`,
    [fgItemId],
  );
  return rows[0] ?? null;
}
