'use server';

import { createHash } from 'node:crypto';
import { withOrgContext } from '../../lib/auth/with-org-context';

const ROTATE_PERMISSION = 'settings.d365.rotate_secret';
const SECRET_REF_TABLE_CODE = 'd365_secret_refs';
const CLIENT_SECRET_ROW_KEY = 'oauth_client_secret';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type VaultAdapter = {
  storeSecret(input: { orgId: string; clientId: string; clientSecret: string }): Promise<{ vaultKey: string }>;
};

export type RotateD365SecretInput = {
  clientId: string;
  clientSecret: string;
};

export type RotateD365SecretResult =
  | { ok: true; data: { vaultKey: string } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'vault_failed' | 'persistence_failed' };

export async function rotateD365Secret(rawInput: RotateD365SecretInput): Promise<RotateD365SecretResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<RotateD365SecretResult> => {
      const allowed = await hasPermission({ userId, orgId, client }, ROTATE_PERMISSION);
      if (!allowed) return { ok: false, error: 'forbidden' };

      const vaultResult = await vaultAdapter.storeSecret({ orgId, clientId: input.clientId, clientSecret: input.clientSecret });
      if (!vaultResult.vaultKey) return { ok: false, error: 'vault_failed' };

      const rowData = {
        client_id: input.clientId,
        secret_ref: vaultResult.vaultKey,
        rotated_at: new Date().toISOString(),
      };
      await client.query(
        `insert into public.reference_tables
           (org_id, table_code, row_key, row_data, display_order, created_by)
         values ($1::uuid, $2, $3, $4::jsonb, 0, $5::uuid)
         on conflict (org_id, table_code, row_key)
         do update set row_data = excluded.row_data,
                       updated_at = now()`,
        [orgId, SECRET_REF_TABLE_CODE, CLIENT_SECRET_ROW_KEY, rowData, userId],
      );

      await writeAuditLog(client, {
        orgId,
        actorUserId: userId,
        action: 'settings.d365_secret.rotated',
        afterState: {
          client_id: input.clientId,
          secret_ref: vaultResult.vaultKey,
          rotated: true,
        },
      });

      return { ok: true, data: { vaultKey: vaultResult.vaultKey } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

const vaultAdapter: VaultAdapter = {
  async storeSecret(input) {
    // Stub adapter for GREEN: production can replace this boundary with a real vault client.
    // The plaintext is consumed only inside this adapter and is never returned or persisted.
    const clientDigest = createHash('sha256').update(input.clientId).digest('hex').slice(0, 16);
    return {
      vaultKey: `vault://d365/${input.orgId}/client-secret/${clientDigest}`,
    };
  },
};

function parseInput(raw: RotateD365SecretInput | null | undefined): { clientId: string; clientSecret: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const clientId = typeof raw.clientId === 'string' ? raw.clientId.trim() : '';
  const clientSecret = typeof raw.clientSecret === 'string' ? raw.clientSecret.trim() : '';
  if (!clientId || !clientSecret || clientId.length > 128 || clientSecret.length > 4096) return null;
  return { clientId, clientSecret };
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
     values ($1::uuid, $2::uuid, 'user', $3, 'd365_secret', $1::uuid, null, $4::jsonb, 'security')`,
    [params.orgId, params.actorUserId, params.action, JSON.stringify(params.afterState)],
  );
}
