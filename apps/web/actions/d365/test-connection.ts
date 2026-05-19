'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

const TEST_PERMISSION = 'settings.d365.test_connection';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

export type TestD365ConnectionInput = {
  baseUrl: string;
  oauthBearer: string;
};

export type TestD365ConnectionResult =
  | { ok: true; data: { metadataUrl: string; status: number } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'connection_failed' | 'persistence_failed' };

export async function testD365Connection(rawInput: TestD365ConnectionInput): Promise<TestD365ConnectionResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<TestD365ConnectionResult> => {
      const allowed = await hasPermission({ userId, orgId, client }, TEST_PERMISSION);
      if (!allowed) return { ok: false, error: 'forbidden' };

      const metadataUrl = `${input.baseUrl}/$metadata`;
      let response: Response;
      try {
        response = await fetch(metadataUrl, {
          method: 'GET',
          headers: { authorization: `Bearer ${input.oauthBearer}` },
        });
      } catch {
        await writeAuditLog(client, {
          orgId,
          actorUserId: userId,
          action: 'settings.d365_connection_test.failed',
          afterState: { metadata_url: metadataUrl, last_test_status: 'failed', reason: 'request_failed' },
        });
        return { ok: false, error: 'connection_failed' };
      }

      if (!response.ok) {
        await writeAuditLog(client, {
          orgId,
          actorUserId: userId,
          action: 'settings.d365_connection_test.failed',
          afterState: { metadata_url: metadataUrl, last_test_status: 'failed', reason: `http_${response.status}` },
        });
        return { ok: false, error: 'connection_failed' };
      }

      await writeAuditLog(client, {
        orgId,
        actorUserId: userId,
        action: 'settings.d365_connection_test.succeeded',
        afterState: { metadata_url: metadataUrl, last_test_status: 'ok', status: response.status, bearer_supplied: true },
      });

      return { ok: true, data: { metadataUrl, status: response.status } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseInput(raw: TestD365ConnectionInput | null | undefined): { baseUrl: string; oauthBearer: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const baseUrlRaw = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : '';
  const oauthBearer = typeof raw.oauthBearer === 'string' ? raw.oauthBearer.trim() : '';
  if (!baseUrlRaw || !oauthBearer) return null;

  let url: URL;
  try {
    url = new URL(baseUrlRaw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return { baseUrl: url.toString().replace(/\/+$/, ''), oauthBearer };
}

async function hasPermission(ctx: OrgActionContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

async function writeAuditLog(
  client: QueryClient,
  params: { orgId: string; actorUserId: string; action: string; afterState: unknown },
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'd365_connection', $1::uuid, null, $4::jsonb, 'standard')`,
    [params.orgId, params.actorUserId, params.action, JSON.stringify(params.afterState)],
  );
}
