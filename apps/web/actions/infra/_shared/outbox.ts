type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export async function writeSettingsInfraOutbox(
  client: QueryClient,
  params: { orgId: string; eventType: string; aggregateType: string; aggregateId: string; payload: unknown },
): Promise<void> {
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, $3, $4::uuid, $5::jsonb, 'settings-infra-v1')`,
    [params.orgId, params.eventType, params.aggregateType, params.aggregateId, JSON.stringify(params.payload)],
  );
}
