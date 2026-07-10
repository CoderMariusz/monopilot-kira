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
