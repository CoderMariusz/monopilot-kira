import 'server-only';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

/**
 * SET-110 — Integrations catalog real-data loader.
 *
 * Reads org-scoped, RLS-enforced state (app_user, `app.current_org_id()`) from
 * the tables that 02-settings actually owns and exposes to the app role:
 *   - public.reference_tables (table_code = 'd365_constants')  → D365 connection config
 *   - public.reference_tables (table_code = 'email_config')    → Email / Resend notifications
 *   - public.scim_tokens                                       → SCIM / identity provisioning
 *   - public.d365_sync_runs                                    → sync KPIs + recent activity
 *
 * NO hardcoded catalog status. Every integration card reflects real connection
 * state: a connector with no config row renders as `available` ("Not
 * configured") — a real state, never a hidden/empty list. Per-source queries
 * are independently guarded so a not-yet-provisioned table degrades that one
 * connector to "Not configured" instead of failing the whole page.
 *
 * Control-plane tables (tenant_idp_config keyed by tenant_id) are NOT readable
 * under the app_user RLS context, so SAML/SSO status is intentionally derived
 * only from app_user-accessible signals (SCIM tokens). Documented deviation.
 */

export type IntegrationStatus = 'connected' | 'available';

export type IntegrationItem = {
  id: string;
  name: string;
  description: string;
  status: IntegrationStatus;
  logo: string;
  color: string;
};

export type IntegrationCategory = {
  category: string;
  items: IntegrationItem[];
};

export type SyncActivity = {
  id: string;
  when: string;
  integration: string;
  direction: string;
  records: number;
  status: 'success' | 'failed';
};

export type IntegrationsData = {
  state: 'ready' | 'empty' | 'error';
  categories: IntegrationCategory[];
  syncSummary: { totalLast24h: number; failedLast24h: number };
  activity: SyncActivity[];
};

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** Run one source query; on any failure (missing table, RLS, etc.) degrade to a default. */
async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function isReferenceConfigured(client: QueryClient, tableCode: string): Promise<boolean> {
  return safeQuery(async () => {
    const { rows } = await client.query<{ n: number }>(
      `select count(*)::int as n
         from public.reference_tables
        where org_id = app.current_org_id()
          and table_code = $1
          and is_active = true`,
      [tableCode],
    );
    return (rows[0]?.n ?? 0) > 0;
  }, false);
}

async function hasActiveScimToken(client: QueryClient): Promise<boolean> {
  return safeQuery(async () => {
    const { rows } = await client.query<{ n: number }>(
      `select count(*)::int as n
         from public.scim_tokens
        where org_id = app.current_org_id()
          and revoked_at is null`,
    );
    return (rows[0]?.n ?? 0) > 0;
  }, false);
}

async function loadSyncSummary(client: QueryClient): Promise<{ totalLast24h: number; failedLast24h: number }> {
  return safeQuery(
    async () => {
      const { rows } = await client.query<{ total: number; failed: number }>(
        `select
            count(*)::int as total,
            count(*) filter (where status = 'failed')::int as failed
           from public.d365_sync_runs
          where org_id = app.current_org_id()
            and started_at > now() - interval '24 hours'`,
      );
      return { totalLast24h: rows[0]?.total ?? 0, failedLast24h: rows[0]?.failed ?? 0 };
    },
    { totalLast24h: 0, failedLast24h: 0 },
  );
}

type SyncRunRow = {
  id: string;
  started_at: string | Date;
  direction: string;
  entity_type: string;
  status: string;
  rows_in: number;
  rows_ok: number;
  rows_failed: number;
};

async function loadRecentActivity(client: QueryClient): Promise<SyncActivity[]> {
  return safeQuery(async () => {
    const { rows } = await client.query<SyncRunRow>(
      `select id, started_at, direction, entity_type, status, rows_in, rows_ok, rows_failed
         from public.d365_sync_runs
        where org_id = app.current_org_id()
        order by started_at desc
        limit 20`,
    );
    return rows.map((row) => ({
      id: String(row.id),
      when: formatWhen(row.started_at),
      integration: `D365 · ${row.entity_type}`,
      direction: row.direction === 'push' ? 'Outbound' : 'Inbound',
      records: Number(row.rows_in) || 0,
      status: row.status === 'ok' ? 'success' : 'failed',
    }));
  }, []);
}

function formatWhen(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function buildCategories(flags: {
  d365Configured: boolean;
  emailConfigured: boolean;
  scimConnected: boolean;
}): IntegrationCategory[] {
  const status = (configured: boolean): IntegrationStatus => (configured ? 'connected' : 'available');
  return [
    {
      category: 'ERP',
      items: [
        {
          id: 'd365',
          name: 'D365',
          description: 'Dynamics 365 finance, inventory, items, BOMs, and WO journals.',
          status: status(flags.d365Configured),
          logo: 'D',
          color: '#1d4ed8',
        },
      ],
    },
    {
      category: 'Notifications',
      items: [
        {
          id: 'email-resend',
          name: 'Email (Resend)',
          description: 'Transactional email for FA closures and D365-ready triggers.',
          status: status(flags.emailConfigured),
          logo: 'M',
          color: '#0f766e',
        },
      ],
    },
    {
      category: 'Identity',
      items: [
        {
          id: 'scim',
          name: 'SCIM provisioning',
          description: 'Automated user/group provisioning from your identity provider.',
          status: status(flags.scimConnected),
          logo: 'S',
          color: '#7c3aed',
        },
      ],
    },
  ];
}

/**
 * Load the live integrations catalog for the current org. Returns
 * `state: 'error'` if the org context itself cannot be resolved (auth/RLS),
 * `state: 'empty'` if no connector is configured and there is no sync activity,
 * else `state: 'ready'`. Connectors with no config are surfaced as `available`
 * ("Not configured") rather than hidden.
 */
export async function loadIntegrations(): Promise<IntegrationsData> {
  try {
    return await withOrgContext(async ({ client }): Promise<IntegrationsData> => {
      const queryClient = client as unknown as QueryClient;
      const [d365Configured, emailConfigured, scimConnected, syncSummary, activity] = await Promise.all([
        isReferenceConfigured(queryClient, 'd365_constants'),
        isReferenceConfigured(queryClient, 'email_config'),
        hasActiveScimToken(queryClient),
        loadSyncSummary(queryClient),
        loadRecentActivity(queryClient),
      ]);

      const categories = buildCategories({ d365Configured, emailConfigured, scimConnected });
      const anyConnected = categories.some((category) => category.items.some((item) => item.status === 'connected'));
      const state: IntegrationsData['state'] = anyConnected || activity.length > 0 ? 'ready' : 'empty';

      // Catalog always lists available connectors (real "Not configured" state),
      // so `categories` is never empty; `state` reflects whether anything is live.
      return { state, categories, syncSummary, activity };
    });
  } catch {
    return { state: 'error', categories: [], syncSummary: { totalLast24h: 0, failedLast24h: 0 }, activity: [] };
  }
}
