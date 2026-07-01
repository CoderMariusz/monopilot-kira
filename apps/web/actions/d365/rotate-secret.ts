'use server';

import { hasPermission } from '../../lib/auth/has-permission';
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
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'vault_unconfigured' | 'vault_failed' | 'persistence_failed' };

export async function rotateD365Secret(rawInput: RotateD365SecretInput): Promise<RotateD365SecretResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<RotateD365SecretResult> => {
      const allowed = await hasPermission({ userId, orgId, client }, ROTATE_PERMISSION);
      if (!allowed) return { ok: false, error: 'forbidden' };

      const vaultResult = await vaultAdapter.storeSecret({ orgId, clientId: input.clientId, clientSecret: input.clientSecret }).catch((error) => {
        if (error instanceof VaultUnconfiguredError) return null;
        throw error;
      });
      if (!vaultResult) return { ok: false, error: 'vault_unconfigured' };
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
  async storeSecret(_input) {
    // TODO: wire a real secret store here. Returning success without storing
    // the client secret would make rotation appear complete while discarding it.
    throw new VaultUnconfiguredError();
  },
};

class VaultUnconfiguredError extends Error {
  constructor() {
    super('D365 secret vault is not configured');
    this.name = 'VaultUnconfiguredError';
  }
}

function parseInput(raw: RotateD365SecretInput | null | undefined): { clientId: string; clientSecret: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const clientId = typeof raw.clientId === 'string' ? raw.clientId.trim() : '';
  const clientSecret = typeof raw.clientSecret === 'string' ? raw.clientSecret.trim() : '';
  if (!clientId || !clientSecret || clientId.length > 128 || clientSecret.length > 4096) return null;
  return { clientId, clientSecret };
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
