'use server';

/**
 * Synthetic fixture for the multi-write transaction guard regression.
 * One direct INSERT + a same-file writeAudit helper, with no withOrgContext.
 */

type QueryClient = {
  query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[] }>;
};

async function writeAudit(
  client: QueryClient,
  args: { orgId: string; userId: string; resourceId: string },
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, action, resource_type, resource_id)
     values ($1::uuid, $2::uuid, 'fixture.violation', 'fixture', $3)`,
    [args.orgId, args.userId, args.resourceId],
  );
}

export async function violatingHelperWriteAction(
  client: QueryClient,
  input: { orgId: string; userId: string; name: string },
): Promise<{ ok: true; id: string }> {
  const inserted = await client.query(
    `insert into public.fixture_rows (org_id, name) values ($1::uuid, $2) returning id`,
    [input.orgId, input.name],
  );
  const id = (inserted.rows[0] as { id?: string } | undefined)?.id ?? 'missing';
  await writeAudit(client, { orgId: input.orgId, userId: input.userId, resourceId: id });
  return { ok: true, id };
}
