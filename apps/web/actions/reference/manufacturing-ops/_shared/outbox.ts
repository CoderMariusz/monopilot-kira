type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export async function writeManufacturingOperationsOutbox(
  client: QueryClient,
  params: { orgId: string; eventType: string; aggregateId: string; payload: unknown },
): Promise<void> {
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, 'manufacturing_operations', $3::uuid, $4::jsonb, 'settings-manufacturing-ops-v1')`,
    [params.orgId, params.eventType, params.aggregateId, JSON.stringify(params.payload)],
  );
}
