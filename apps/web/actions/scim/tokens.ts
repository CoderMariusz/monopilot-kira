'use server';

import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';

/**
 * SCIM provisioning token CRUD (TASK-000118/T-034).
 *
 * Hardening notes (T-035 tail repair):
 *  - RBAC fail-closed: every entry point (create/list/revoke) requires the
 *    `settings.scim.edit` permission. An ordinary org member MUST
 *    NOT be able to mint, enumerate, or revoke a provisioning bearer token.
 *  - The CRUD path writes to `public.scim_tokens` (RBAC-owned table). The
 *    runtime SCIM bearer verifier in `apps/web/lib/scim/middleware.ts`
 *    currently reads from `public.tenant_idp_config.scim_token_hash` /
 *    `scim_token_last_four`. UNTIL a dedicated migration introduces
 *    `public.scim_tokens` AND the verifier joins it, tokens created here
 *    will not be accepted by the SCIM bearer path. See the dependency note
 *    in the repair report — this module surfaces persistence failure
 *    cleanly (no false ok=true) so the gap is auditable rather than silent.
 */

const SCIM_TOKEN_MANAGE_PERMISSION = 'settings.scim.edit';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
};

type OrgContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type WithOrgContext = <T>(action: (ctx: OrgContext) => Promise<T>) => Promise<T>;

async function runWithOrgContext<T>(action: (ctx: OrgContext) => Promise<T>): Promise<T> {
  try {
    const mod = (await import('@monopilot/db/with-org-context')) as { withOrgContext?: WithOrgContext };
    if (typeof mod.withOrgContext === 'function') return mod.withOrgContext(action);
  } catch {
    // The package subpath is not exported in this checkout; production uses the web HOF below.
  }

  const mod = (await import('../../lib/auth/with-org-context.js')) as unknown as { withOrgContext: WithOrgContext };
  return mod.withOrgContext(action);
}

export type CreateScimTokenResult =
  | {
      ok: true;
      data: {
        id: string;
        label: string;
        plaintextToken: string;
        lastFour: string;
        createdAt?: string;
      };
    }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'persistence_failed' };

export type ListScimTokensResult =
  | {
      ok: true;
      data: Array<{
        id: string;
        label: string;
        lastFour: string;
        createdAt?: string;
        revokedAt?: string | null;
      }>;
    }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

export type RevokeScimTokenResult =
  | { ok: true; data: { id: string; revokedAt: string } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' };

const createdLastFourById = new Map<string, string>();

function normalizeLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 120 ? trimmed : null;
}

function generatePlaintextToken(): string {
  return `scim_${randomUUID().replace(/-/g, '')}_${randomUUID().replace(/-/g, '')}`;
}

function tokenLastFour(row: Record<string, unknown>): string {
  const id = String(row.id ?? '');
  const fromRecentCreate = createdLastFourById.get(id);
  if (fromRecentCreate) return fromRecentCreate;
  return String(row.lastFour ?? row.scim_token_last_four ?? row.token_last_four ?? '');
}

/**
 * Probe whether the caller carries the SCIM edit permission. The
 * query intentionally mirrors the role/permission joins used by the IP
 * allowlist actions so all settings-level CRUD applies identical RBAC.
 */
async function hasScimManagePermission(ctx: OrgContext): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = $3
          or r.slug = $3
          or r.permissions ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, SCIM_TOKEN_MANAGE_PERMISSION],
  );
  return rows.length > 0;
}

export async function createScimToken(input: { label: string }): Promise<CreateScimTokenResult> {
  const label = normalizeLabel(input?.label);
  if (!label) return { ok: false, error: 'invalid_input' };

  const tokenId = randomUUID();
  const plaintextToken = generatePlaintextToken();
  const lastFour = plaintextToken.slice(-4);
  const tokenHash = await argon2.hash(plaintextToken);

  try {
    return await runWithOrgContext(async (ctx: OrgContext) => {
      const allowed = await hasScimManagePermission(ctx);
      if (!allowed) {
        return { ok: false, error: 'forbidden' } as const;
      }

      const { rows } = await ctx.client.query<Record<string, unknown>>(
        `insert into public.scim_tokens
           (id, org_id, label, scim_token_hash, scim_token_last_four, created_by)
         values ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid)
         returning id, label, scim_token_last_four, created_at`,
        [tokenId, ctx.orgId, label, tokenHash, lastFour, ctx.userId],
      );
      const row = rows[0] ?? { id: tokenId, label, scim_token_last_four: lastFour };
      const id = String(row.id ?? tokenId);
      createdLastFourById.set(id, lastFour);
      return {
        ok: true,
        data: {
          id,
          label: String(row.label ?? label),
          plaintextToken,
          lastFour,
          createdAt: row.created_at ? String(row.created_at) : undefined,
        },
      } as const;
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function listScimTokens(): Promise<ListScimTokensResult> {
  try {
    return await runWithOrgContext(async (ctx: OrgContext) => {
      const allowed = await hasScimManagePermission(ctx);
      if (!allowed) {
        return { ok: false, error: 'forbidden' } as const;
      }

      const { rows } = await ctx.client.query<Record<string, unknown>>(
        `select id, label, scim_token_last_four, created_at, revoked_at
           from public.scim_tokens
          where org_id = $1::uuid
          order by created_at desc`,
        [ctx.orgId],
      );
      return {
        ok: true,
        data: rows.map((row) => ({
          id: String(row.id),
          label: String(row.label),
          lastFour: tokenLastFour(row),
          createdAt: row.created_at ? String(row.created_at) : undefined,
          revokedAt: row.revoked_at == null ? null : String(row.revoked_at),
        })),
      } as const;
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function revokeScimToken(input: { tokenId: string }): Promise<RevokeScimTokenResult> {
  if (!input?.tokenId) return { ok: false, error: 'invalid_input' };

  try {
    return await runWithOrgContext(async (ctx: OrgContext) => {
      const allowed = await hasScimManagePermission(ctx);
      if (!allowed) {
        return { ok: false, error: 'forbidden' } as const;
      }

      const revokedAt = new Date().toISOString();
      const { rows, rowCount } = await ctx.client.query<Record<string, unknown>>(
        `update public.scim_tokens
            set revoked_at = $3::timestamptz
          where id = $1::uuid
            and org_id = $2::uuid
            and revoked_at is null
          returning id, revoked_at`,
        [input.tokenId, ctx.orgId, revokedAt],
      );
      if (rowCount !== 1) return { ok: false, error: 'not_found' } as const;
      createdLastFourById.delete(input.tokenId);
      return {
        ok: true,
        data: {
          id: String(rows[0]?.id ?? input.tokenId),
          revokedAt: String(rows[0]?.revoked_at ?? revokedAt),
        },
      } as const;
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}
