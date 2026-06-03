import React from 'react';
import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import PromotionsScreen, {
  type CallerAccess,
  type Labels,
  type PageState,
  type PromotionRecord,
  type PromotionStage,
  type TenantMigrationRow,
} from './promotions-screen.client';

export const dynamic = 'force-dynamic';

type Props = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
  callerAccess?: CallerAccess;
  promotionStages?: PromotionStage[];
  promotions?: PromotionRecord[];
  tenantMigrations?: TenantMigrationRow[];
  state?: PageState;
};

const DEFAULT_LABEL_KEYS: Labels = {
  title: 'settings.promotions.title',
  subtitle: 'settings.promotions.subtitle',
  startPromotion: 'settings.promotions.startPromotion',
  activeTab: 'settings.promotions.activeTab',
  historyTab: 'settings.promotions.historyTab',
  stageOverview: 'settings.promotions.stageOverview',
  activePromotions: 'settings.promotions.activePromotions',
  historyTitle: 'settings.promotions.historyTitle',
  loading: 'settings.promotions.loading',
  empty: 'settings.promotions.empty',
  error: 'settings.promotions.error',
  forbidden: 'settings.promotions.forbidden',
};

// Active (non-history) statuses surfaced on the Active tab.
const ACTIVE_STATUSES = new Set(['scheduled', 'canary', 'progressive', 'force_scheduled']);

const ADMIN_ROLE_CODES = ['Admin', 'org.access.admin', 'org.platform.admin', 'org.schema.admin'];

const DEFAULT_STAGES: PromotionStage[] = [
  { id: 'L3-tenant', label: 'L3 · Tenant', description: 'Tenant-local overrides and sandbox changes.', count: 0 },
  { id: 'L2-local', label: 'L2 · Shared local', description: 'Shared local changes available to multiple tenant sites.', count: 0 },
  { id: 'L1-core', label: 'L1 · Core / universal', description: 'Universal Monopilot defaults requiring controlled review.', count: 0 },
];

const LABEL_KEYS = Object.keys(DEFAULT_LABEL_KEYS) as Array<keyof Labels & string>;

async function buildLabels(locale: string): Promise<Labels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.promotions' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        const labelKey = String(key);
        const translated = t(labelKey);
        labels[key] = translated && translated !== labelKey ? translated : DEFAULT_LABEL_KEYS[key];
      } catch {
        labels[key] = DEFAULT_LABEL_KEYS[key];
      }
      return labels;
    }, {} as Labels);
  } catch {
    return { ...DEFAULT_LABEL_KEYS };
  }
}

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number }>;
};

type RoleRow = { code: string | null; name: string | null; slug: string | null; permissions: unknown };
type MigrationDbRow = {
  id: string;
  component: string;
  current_version: string;
  target_version: string;
  status: string;
  canary_pct: string | number | null;
  last_run_at: string | Date | null;
  created_at: string | Date | null;
  scheduled_by_name: string | null;
  scheduled_by_email: string | null;
};

function toIso(value: string | Date | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

/**
 * Build the REAL caller access object from the caller's roles + role permissions.
 * roleCodes includes the role `name` AND `code`/`slug` so that an org's "Admin"
 * role (name='Admin') and the system admin slugs all satisfy the screen's
 * Admin-only gate. permissions is the union of jsonb role permissions.
 */
async function buildCallerAccess(client: QueryClient, userId: string, orgId: string): Promise<CallerAccess> {
  const { rows } = await client.query<RoleRow>(
    `select r.code, r.name, r.slug, coalesce(r.permissions, '[]'::jsonb) as permissions
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid`,
    [userId, orgId],
  );

  const roleCodes = new Set<string>();
  const permissions = new Set<string>();
  for (const row of rows) {
    if (row.name) {
      roleCodes.add(row.name);
      // Normalise an org "Admin" role name (any case) to the gate token 'Admin'.
      if (row.name.toLowerCase() === 'admin') roleCodes.add('Admin');
    }
    if (row.code) {
      roleCodes.add(row.code);
      if (ADMIN_ROLE_CODES.includes(row.code)) roleCodes.add('Admin');
    }
    if (row.slug) {
      roleCodes.add(row.slug);
      if (ADMIN_ROLE_CODES.includes(row.slug)) roleCodes.add('Admin');
    }
    if (Array.isArray(row.permissions)) {
      for (const perm of row.permissions) if (typeof perm === 'string') permissions.add(perm);
    }
  }

  return { roleCodes: Array.from(roleCodes), permissions: Array.from(permissions) };
}

function mapMigrationRow(row: MigrationDbRow): TenantMigrationRow {
  return {
    id: row.id,
    status: row.status,
    component: row.component,
    currentVersion: row.current_version,
    targetVersion: row.target_version,
    lastRunAt: toIso(row.last_run_at ?? row.created_at),
    scheduledBy: row.scheduled_by_name ?? row.scheduled_by_email ?? 'System migration runner',
  };
}

function migrationToPromotion(row: TenantMigrationRow): PromotionRecord {
  return {
    id: row.id,
    artefact: row.component,
    from: row.currentVersion,
    to: row.targetVersion,
    status: row.status,
    requester: row.scheduledBy,
    affects: '—',
    diff: `${row.currentVersion} → ${row.targetVersion}`,
  };
}

function stageCounts(rows: TenantMigrationRow[]): PromotionStage[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.targetVersion, (counts.get(row.targetVersion) ?? 0) + 1);
  }
  return DEFAULT_STAGES.map((stage) => ({ ...stage, count: counts.get(stage.id) ?? counts.get(stage.label) ?? 0 }));
}

/**
 * REAL data loader. Builds callerAccess from the caller's roles, then queries
 * org-scoped tenant_migrations rows (RLS via app.current_org_id()) and derives
 * active promotions, history rows and stage counts. Returns a 'forbidden' state
 * ONLY for genuinely non-Admin callers — never by default.
 */
async function loadPromotionsData(): Promise<{
  callerAccess: CallerAccess;
  promotions: PromotionRecord[];
  tenantMigrations: TenantMigrationRow[];
  promotionStages: PromotionStage[];
  state: PageState;
}> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      const callerAccess = await buildCallerAccess(queryClient, userId, orgId);

      // Non-admins: do not query promotion data; the screen renders 403.
      if (!callerAccess.roleCodes.includes('Admin')) {
        return {
          callerAccess,
          promotions: [],
          tenantMigrations: [],
          promotionStages: DEFAULT_STAGES,
          state: 'ready' as PageState,
        };
      }

      const { rows } = await queryClient.query<MigrationDbRow>(
        `select tm.id::text,
                tm.component,
                tm.current_version,
                tm.target_version,
                tm.status,
                tm.canary_pct,
                tm.last_run_at,
                tm.created_at,
                nullif(trim(coalesce(u.name, u.email, '')), '') as scheduled_by_name,
                u.email as scheduled_by_email
           from public.tenant_migrations tm
           left join public.users u on u.id = tm.scheduled_by and u.org_id = app.current_org_id()
          where tm.org_id = app.current_org_id()
          order by coalesce(tm.last_run_at, tm.created_at) desc nulls last, tm.id desc
          limit 200`,
      );

      const allMigrations = rows.map(mapMigrationRow);
      const activeMigrations = allMigrations.filter((row) => ACTIVE_STATUSES.has(row.status));
      const promotions = activeMigrations.map(migrationToPromotion);

      return {
        callerAccess,
        promotions,
        tenantMigrations: allMigrations,
        promotionStages: stageCounts(allMigrations),
        state: 'ready' as PageState,
      };
    });
  } catch {
    return {
      callerAccess: { roleCodes: [], permissions: [] },
      promotions: [],
      tenantMigrations: [],
      promotionStages: DEFAULT_STAGES,
      state: 'error' as PageState,
    };
  }
}

export default async function PromotionsPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as Props;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const searchParams = props.searchParams ? await props.searchParams : {};

  // Prop-injection path (RTL / tests): use the supplied data verbatim.
  // Real-render path (no props): load real, org-scoped Supabase data.
  const usingInjectedData =
    props.callerAccess !== undefined ||
    props.promotions !== undefined ||
    props.tenantMigrations !== undefined ||
    props.state !== undefined;

  let callerAccess: CallerAccess;
  let promotions: PromotionRecord[];
  let tenantMigrations: TenantMigrationRow[];
  let promotionStages: PromotionStage[];
  let state: PageState;

  if (usingInjectedData) {
    promotions = props.promotions ?? [];
    callerAccess = props.callerAccess ?? { roleCodes: [], permissions: [] };
    tenantMigrations = props.tenantMigrations ?? [];
    promotionStages = props.promotionStages ?? DEFAULT_STAGES;
    state = props.state ?? (promotions.length === 0 ? 'empty' : 'ready');
  } else {
    const data = await loadPromotionsData();
    callerAccess = data.callerAccess;
    promotions = data.promotions;
    tenantMigrations = data.tenantMigrations;
    promotionStages = data.promotionStages;
    state = data.state === 'ready' && promotions.length === 0 ? 'empty' : data.state;
  }

  return React.createElement(PromotionsScreen, {
    labels: await buildLabels(locale),
    promotionStages,
    promotions,
    tenantMigrations,
    callerAccess,
    state,
    initialTab: searchParams.tab === 'history' ? 'history' : 'active',
  });
}
