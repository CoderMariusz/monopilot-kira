'use server';

import { revalidatePath } from 'next/cache';
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

type IpaddrAddress = {
  kind(): string;
  toString(): string;
  match(range: readonly [IpaddrAddress, number], bits?: number): boolean;
};

type IpaddrModule = {
  parseCIDR(cidr: string): [IpaddrAddress, number];
};

export async function addIpRange(cidr: string, label?: string | null): Promise<AddIpRangeResult> {
  const input = normalizeInput(cidr, label);
  if (!input) return { ok: false, error: 'INVALID_INPUT' };

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      const allowed = await hasEditPermission({ client, userId, orgId });
      if (!allowed) return { ok: false, error: 'FORBIDDEN' };

      const defaultOpenCidr = '0.0.0.0/0';
      const overlapsDefault = await overlapsDefaultOpenCidr(input.cidr, defaultOpenCidr);
      if (overlapsDefault == null) return { ok: false, error: 'INVALID_INPUT' };
      if (overlapsDefault) {
        return { ok: false, error: 'CIDR_OVERLAP_DEFAULT' };
      }

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

      revalidatePath('/settings/security');
      return { ok: true, data: { id: row.id, cidr: row.cidr, label: row.label } };
    } catch {
      return { ok: false, error: 'PERSISTENCE_FAILED' };
    }
  });
}

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

function normalizeInput(cidr: string | null | undefined, label: string | null | undefined): ParsedInput | null {
  if (typeof cidr !== 'string') return null;
  const normalizedCidr = cidr.trim();
  if (!normalizedCidr || !normalizedCidr.includes('/')) return null;

  const normalizedLabel = typeof label === 'string' ? label.trim() : '';
  if (normalizedLabel.length > 120) return null;

  return { cidr: normalizedCidr, label: normalizedLabel.length > 0 ? normalizedLabel : null };
}

async function overlapsDefaultOpenCidr(cidr: string, defaultOpenCidr: string): Promise<boolean | null> {
  const ipaddr = await loadIpaddrJs();
  let parsed: [IpaddrAddress, number];
  let defaultOpen: [IpaddrAddress, number];
  try {
    parsed = ipaddr.parseCIDR(cidr);
    defaultOpen = ipaddr.parseCIDR(defaultOpenCidr);
  } catch {
    return null;
  }

  const [address, prefix] = parsed;
  const [defaultAddress, defaultPrefix] = defaultOpen;
  return address.kind() === 'ipv4' && prefix === defaultPrefix && address.match([defaultAddress, defaultPrefix], defaultPrefix);
}

async function loadIpaddrJs(): Promise<IpaddrModule> {
  const dynamicImport = Function('moduleName', 'return import(moduleName)') as (moduleName: string) => Promise<IpaddrModule>;
  try {
    return await dynamicImport('ipaddr.js');
  } catch {
    return { parseCIDR: parseIpv4CidrFallback };
  }
}

function parseIpv4CidrFallback(cidr: string): [IpaddrAddress, number] {
  const [addressText, prefixText] = cidr.split('/');
  if (!addressText || prefixText == null) throw new Error('INVALID_CIDR');
  const octets = addressText.split('.').map((part) => Number(part));
  const prefix = Number(prefixText);
  if (octets.length !== 4 || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error('INVALID_CIDR');
  }
  if (!octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
    throw new Error('INVALID_CIDR');
  }

  const numeric = octets.reduce((value, octet) => (value << 8) + octet, 0) >>> 0;
  const address: IpaddrAddress = {
    kind: () => 'ipv4',
    toString: () => addressText,
    match: ([rangeAddress], bits = prefix) => {
      const rangeOctets = rangeAddress.toString().split('.').map((part) => Number(part));
      const rangeNumeric = rangeOctets.reduce((value, octet) => (value << 8) + octet, 0) >>> 0;
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (numeric & mask) === (rangeNumeric & mask);
    },
  };
  return [address, prefix];
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
