type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export async function writeTenantOutbox({
  client,
  orgId,
  aggregateId,
  eventType,
  aggregateType,
  appVersion,
  payload,
}: {
  client: QueryClient;
  orgId: string;
  aggregateId: string;
  eventType: string;
  aggregateType: string;
  appVersion: string;
  payload: unknown;
}): Promise<void> {
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, $3, $4::uuid, $5::jsonb, $6)`,
    [orgId, eventType, aggregateType, aggregateId, JSON.stringify(payload), appVersion],
  );
}
