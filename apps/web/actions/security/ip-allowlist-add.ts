'use server';

import { revalidateLocalized } from '../../lib/i18n/revalidate-localized';
import { withOrgContext } from '../../lib/auth/with-org-context';

const IP_ALLOWLIST_EDIT_PERMISSION = 'settings.ip_allowlist.edit';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

export type AddIpRangeResult =
  | { ok: true; data: { id: string; cidr: string; label: string | null } }
  | { ok: false; error: 'INVALID_INPUT' | 'CIDR_OVERLAP_DEFAULT' | 'FORBIDDEN' | 'PERSISTENCE_FAILED' };

type ParsedInput = {
  cidr: string;
  label: string | null;
};

type IpRangeRow = {
  id: string;
  cidr: string;
  label: string | null;
};

export async function addIpRange(cidr: string, label?: string | null): Promise<AddIpRangeResult> {
  const input = normalizeInput(cidr, label);
  if (!input) return { ok: false, error: 'INVALID_INPUT' };

  // CIDR validity + default-open detection happens BEFORE we open a DB
  // transaction so an attacker cannot probe persistence with bogus CIDRs.
  const classified = classifyCidr(input.cidr);
  if (classified === 'invalid') return { ok: false, error: 'INVALID_INPUT' };
  if (classified === 'default_open') return { ok: false, error: 'CIDR_OVERLAP_DEFAULT' };

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      const allowed = await hasEditPermission({ client, userId, orgId });
      if (!allowed) return { ok: false, error: 'FORBIDDEN' };

      const inserted = await client.query<IpRangeRow>(
        `insert into public.admin_ip_allowlist
           (org_id, cidr, label, created_by, created_at)
         values (app.current_org_id(), $1::inet, $2, $3::uuid, now())
         returning id, cidr::text as cidr, label`,
        [input.cidr, input.label, userId],
      );
      const row = inserted.rows[0];
      if (!row) return { ok: false, error: 'PERSISTENCE_FAILED' };

      await client.query(
        `insert into public.audit_log
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
         values ($1::uuid, $2::uuid, 'user', $3, 'admin_ip_allowlist', $4, null, $5::jsonb, 'security')`,
        [
          orgId,
          userId,
          'settings.ip_allowlist.added',
          row.id,
          JSON.stringify({ org_id: orgId, ip_range_id: row.id, cidr: row.cidr, label: row.label }),
        ],
      );

      await client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, $3, $4::uuid, $5::jsonb, $6)`,
        [
          orgId,
          'settings.ip_allowlist.changed',
          'admin_ip_allowlist',
          row.id,
          JSON.stringify({
            org_id: orgId,
            action: 'added',
            ip_range_id: row.id,
            label: row.label,
            actor_user_id: userId,
          }),
          'settings-ip-allowlist-v1',
        ],
      );

      revalidateLocalized('/settings/security');
      return { ok: true, data: { id: row.id, cidr: row.cidr, label: row.label } };
    } catch {
      return { ok: false, error: 'PERSISTENCE_FAILED' };
    }
  });
}

function normalizeInput(cidr: string | null | undefined, label: string | null | undefined): ParsedInput | null {
  if (typeof cidr !== 'string') return null;
  const normalizedCidr = cidr.trim();
  if (!normalizedCidr || !normalizedCidr.includes('/')) return null;

  const normalizedLabel = typeof label === 'string' ? label.trim() : '';
  if (normalizedLabel.length > 120) return null;

  return { cidr: normalizedCidr, label: normalizedLabel.length > 0 ? normalizedLabel : null };
}

/**
 * Classify a CIDR for default-route detection. Returns:
 *  - 'default_open' for 0.0.0.0/0 (IPv4 catch-all) or ::/0 (IPv6 catch-all)
 *  - 'invalid'      for syntactically malformed CIDRs
 *  - 'ok'           for everything else (delegated to Postgres INET validation)
 *
 * The IPv6 default-open guard is the contract gap that allowed `::/0` to be
 * persisted before T-035 hardening. Treat any /0 prefix as default-open
 * regardless of address family — there is no legitimate reason to allowlist
 * the entire internet for admin routes.
 */
function classifyCidr(cidr: string): 'ok' | 'invalid' | 'default_open' {
  const slashIndex = cidr.indexOf('/');
  if (slashIndex < 0) return 'invalid';
  const address = cidr.slice(0, slashIndex);
  const prefixText = cidr.slice(slashIndex + 1);
  if (!address || !prefixText || !/^[0-9]+$/.test(prefixText)) return 'invalid';
  const prefix = Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0) return 'invalid';

  // IPv6 detection is structural: any address that contains `:` is treated as
  // IPv6 for the purposes of the default-open guard. Full IPv6 normalization
  // is deferred to Postgres `inet` parsing on insert.
  const isIpv6 = address.includes(':');
  if (isIpv6) {
    if (prefix > 128) return 'invalid';
    return prefix === 0 ? 'default_open' : 'ok';
  }

  if (prefix > 32) return 'invalid';
  if (prefix === 0) return 'default_open';
  // /0 catches the universal route; lower-prefix overlap is allowed because
  // the operator may legitimately allowlist large corporate ranges.
  return 'ok';
}

async function hasEditPermission({ client, userId, orgId }: OrgActionContext): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
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
    [userId, orgId, IP_ALLOWLIST_EDIT_PERMISSION],
  );
  return rows.length > 0;
}
