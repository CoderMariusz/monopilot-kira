import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

import FlagsAdminScreen, {
  type FeatureFlagRow,
  type FlagAuthorizationPreflight,
  type FlagsAdminLabels,
  type FlagTenant,
  type FlagTier,
  type PageState,
} from './flags-admin-screen.client';

export const dynamic = 'force-dynamic';

type FlagsPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  flags?: FeatureFlagRow[];
  state?: PageState;
  posthogUrl?: string;
  authorizationPreflight?: FlagAuthorizationPreflight;
  openModal?: (modalId: 'flagEdit' | 'promoteToL2', payload?: { flag: FeatureFlagRow }) => void;
  onToggleFlag?: (code: string, enabled: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
};

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type FeatureFlagCoreRow = {
  flag_code: string;
  description: string | null;
  is_enabled: boolean;
  rolled_out_pct: number | string;
  tier: string;
  updated_at: string | Date | null;
};

type AuthorizationPolicyRow = {
  is_enabled: boolean | null;
  requires_new_version: boolean | null;
  authorize_role_count: number | string | null;
};

const NPD_POST_RELEASE_EDIT_FLAG = 'npd.post_release_edit.enabled';
const NPD_POLICY_CODE = 'npd_post_release_edit';

// Per-flag consumer attribution (which modules read each core flag). Derived from
// the flag namespace + known runtime readers; surfaced read-only in the Consumers column.
const FLAG_CONSUMERS: Record<string, string[]> = {
  'npd.post_release_edit.enabled': ['npd', 'technical'],
  'technical.product_spec_approval.required': ['technical', 'quality'],
  'integration.d365.enabled': ['integrations', 'finance'],
  'scanner.pwa.enabled': ['warehouse', 'scanner'],
  'npd.d365_builder.execute': ['npd', 'integrations'],
  maintenance_mode: ['platform'],
};

const DEFAULT_LABELS: FlagsAdminLabels = {
  title: 'Feature flags',
  subtitle: 'Per-tenant toggles. L1 changes go through promotion; L2/L3 are editable here.',
  openPostHog: 'Open in PostHog ↗',
  preflightNotice:
    'Some flags trigger pre-flight checks. Example: enabling npd.post_release_edit.enabled validates V-SET-43 authorization policy before the toggle is saved.',
  coreTab: 'L1 core ({count})',
  localTab: 'L2 local ({count})',
  tenantTab: 'L3 tenant ({count})',
  searchPlaceholder: 'Search flag code or description…',
  coreFlags: 'Core flags',
  localFlags: 'Local (L2) flags',
  tenantFlags: 'Tenant-private (L3) flags',
  flagCode: 'Flag code',
  description: 'Description',
  status: 'Status',
  rollout: 'Rollout %',
  updated: 'Updated',
  consumers: 'Consumers',
  actions: 'Actions',
  on: '● ON',
  off: '○ OFF',
  edit: 'Edit →',
  loading: 'Loading feature flags…',
  empty: 'No feature flags found.',
  error: 'Unable to load feature flags.',
  permissionDenied: 'You need org admin access to view and change feature flags.',
  vSet43Title: 'V-SET-43 authorization preflight failed',
  vSet43Body:
    'NPD post-release edits require a policy that creates a new BOM/product-spec version and has authorizer roles configured.',
  configureAuthorization: 'Configure authorization policy',
  noConsumers: '—',
  defaultNpdDescription: 'Allow released NPD product/BOM edits after authorization.',
  defaultTechnicalDescription: 'Require Technical product-spec approval before factory use.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof FlagsAdminLabels>;

function tierToTenant(tier: FlagTier): FlagTenant {
  if (tier === 'L2') return 'L2-local';
  if (tier === 'L3') return 'L3-tenant';
  return 'L1-core';
}

function normalizeTier(tier: string): FlagTier {
  if (tier === 'L2') return 'L2';
  if (tier === 'L3') return 'L3';
  return 'L1';
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function formatUpdatedAt(value: string | Date | null): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

function mapFlagRow(row: FeatureFlagCoreRow): FeatureFlagRow {
  const tier = normalizeTier(row.tier);
  return {
    code: row.flag_code,
    description: row.description ?? '',
    tier,
    tenant: tierToTenant(tier),
    enabled: row.is_enabled,
    rolloutPercent: toNumber(row.rolled_out_pct),
    updatedAt: formatUpdatedAt(row.updated_at),
    consumers: FLAG_CONSUMERS[row.flag_code] ?? [],
  };
}

// V-SET-43 preflight is computed from REAL org_authorization_policies state — never a
// hardcoded `canEnable:false`. canEnable mirrors the setCoreFlag action gate exactly:
// policy enabled AND requires_new_version AND at least one authorizer permission.
function buildPreflight(
  policy: AuthorizationPolicyRow | null,
  configureHref: FlagAuthorizationPreflight['configureHref'],
): FlagAuthorizationPreflight {
  const requiresNewVersion = policy?.requires_new_version === true;
  const hasAuthorizerRoles = toNumber(policy?.authorize_role_count) >= 1;
  const canEnable = policy?.is_enabled === true && requiresNewVersion && hasAuthorizerRoles;
  return {
    flagCode: NPD_POST_RELEASE_EDIT_FLAG,
    canEnable,
    requiresNewVersion,
    hasAuthorizerRoles,
    configureHref,
  };
}

type LoadedFlags = {
  state: PageState;
  flags: FeatureFlagRow[];
  authorizationPreflight: FlagAuthorizationPreflight;
};

async function requirePermission({ client, userId, orgId }: OrgActionContext): Promise<void> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or r.permissions ? $3)
      limit 1`,
    [userId, orgId, 'org.access.admin'],
  );
  if (rows.length === 0) throw new Error('forbidden');
}

async function loadFlags(locale: string): Promise<LoadedFlags> {
  const configureHref = (`/${locale}/settings/authorization` as const) satisfies string as FlagAuthorizationPreflight['configureHref'];
  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
      await requirePermission({ client, userId, orgId });
      const [flagsResult, policyResult] = await Promise.all([
        client.query<FeatureFlagCoreRow>(
          `select flag_code, description, is_enabled, rolled_out_pct, tier, updated_at
             from public.feature_flags_core
            where org_id = app.current_org_id()
            order by flag_code asc`,
        ),
        client.query<AuthorizationPolicyRow>(
          `select is_enabled,
                  requires_new_version,
                  cardinality(authorize_permissions) as authorize_role_count
             from public.org_authorization_policies
            where org_id = app.current_org_id()
              and policy_code = $1
            limit 1`,
          [NPD_POLICY_CODE],
        ),
      ]);

      const flags = flagsResult.rows.map((row) => mapFlagRow(row));
      const authorizationPreflight = buildPreflight(policyResult.rows[0] ?? null, configureHref);

      return {
        state: flags.length === 0 ? ('empty' as const) : ('ready' as const),
        flags,
        authorizationPreflight,
      };
    });
  } catch (error) {
    const state: PageState =
      error instanceof Error && error.message === 'forbidden' ? 'permission_denied' : 'error';
    return {
      state,
      flags: [],
      authorizationPreflight: buildPreflight(null, configureHref),
    };
  }
}

type FlagsTranslator = (key: keyof FlagsAdminLabels, values?: Record<string, string | number>) => string;

type SettingsMessages = {
  flags_admin?: Partial<Record<keyof FlagsAdminLabels, unknown>>;
};

const SETTINGS_MESSAGE_LOCALES = new Set(['en', 'pl', 'ro', 'uk']);

function normalizeMessageLocale(locale: string) {
  return SETTINGS_MESSAGE_LOCALES.has(locale) ? locale : 'en';
}

function labelsFromSource(source: Partial<Record<keyof FlagsAdminLabels, unknown>>): FlagsAdminLabels {
  return LABEL_KEYS.reduce((labels, key) => {
    const value = source[key];
    labels[key] = typeof value === 'string' ? value : DEFAULT_LABELS[key];
    return labels;
  }, {} as FlagsAdminLabels);
}

function translationValues(key: keyof FlagsAdminLabels): Record<string, string> | undefined {
  return key === 'coreTab' || key === 'localTab' || key === 'tenantTab' ? { count: '{count}' } : undefined;
}

function isResolvedLabel(key: keyof FlagsAdminLabels, value: string) {
  return value.trim() !== '' && value !== key && value !== `flags_admin.${key}` && value !== `settings.flags_admin.${key}`;
}

function labelsFromTranslator(t: FlagsTranslator): { labels: FlagsAdminLabels; complete: boolean } {
  let complete = true;
  const labels = LABEL_KEYS.reduce((translated, key) => {
    try {
      const value = t(key, translationValues(key));
      translated[key] = isResolvedLabel(key, value) ? value : DEFAULT_LABELS[key];
      complete &&= translated[key] === value;
    } catch {
      translated[key] = DEFAULT_LABELS[key];
      complete = false;
    }
    return translated;
  }, {} as FlagsAdminLabels);

  return { labels, complete };
}

async function loadFlagsAdminMessages(locale: string) {
  const messages = (await import(`../../../../../../messages/${normalizeMessageLocale(locale)}/02-settings.json`)).default as SettingsMessages;
  return labelsFromSource(messages.flags_admin ?? {});
}

async function buildLabels(locale: string): Promise<FlagsAdminLabels> {
  try {
    const { getTranslations } = await import('next-intl/server');
    const t = await getTranslations({ locale, namespace: 'settings.flags_admin' });
    const { labels, complete } = labelsFromTranslator(t as FlagsTranslator);
    if (complete) return labels;
  } catch {
    // Fall through to the locale catalog below; this avoids raw key leakage if the
    // runtime bundle has not yet folded 02-settings into the root next-intl file.
  }

  return loadFlagsAdminMessages(locale);
}

export default async function SettingsFlagsPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as FlagsPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const labels = await buildLabels(locale);

  // Real Supabase read via withOrgContext (RLS app.current_org_id()) unless the
  // caller injects flags/state/preflight (test + storybook harness). No hardcoded
  // defaultFlags fallback and no hardcoded preflight — both come from live tables.
  const hasInjectedData = props.flags !== undefined && props.authorizationPreflight !== undefined;
  const loaded = hasInjectedData ? null : await loadFlags(locale);

  const flags = props.flags ?? loaded?.flags ?? [];
  const state = props.state ?? loaded?.state ?? 'ready';
  const configureFallback =
    (`/${locale}/settings/authorization` as const) satisfies string as FlagAuthorizationPreflight['configureHref'];
  const authorizationPreflight =
    props.authorizationPreflight ?? loaded?.authorizationPreflight ?? buildPreflight(null, configureFallback);

  return (
    <FlagsAdminScreen
      labels={labels}
      flags={flags}
      state={state}
      posthogUrl={props.posthogUrl ?? process.env.NEXT_PUBLIC_POSTHOG_URL ?? '#'}
      authorizationPreflight={authorizationPreflight}
      openModal={props.openModal}
      onToggleFlag={props.onToggleFlag}
    />
  );
}
