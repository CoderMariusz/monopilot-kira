import { getTranslations } from 'next-intl/server';

import FlagsAdminScreen, {
  type FeatureFlagRow,
  type FlagAuthorizationPreflight,
  type FlagsAdminLabels,
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
  vSet43Title: 'V-SET-43 authorization preflight failed',
  vSet43Body:
    'NPD post-release edits require a policy that creates a new BOM/product-spec version and has authorizer roles configured.',
  configureAuthorization: 'Configure authorization policy',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof FlagsAdminLabels>;

const DEFAULT_FLAGS: FeatureFlagRow[] = [
  {
    code: 'npd.post_release_edit.enabled',
    description: 'Allow released NPD product/BOM edits after authorization.',
    tier: 'L1',
    tenant: 'L1-core',
    enabled: false,
    rolloutPercent: 0,
    updatedAt: '—',
    consumers: ['npd', 'technical'],
  },
  {
    code: 'technical.product_spec_approval.required',
    description: 'Require Technical product-spec approval before factory use.',
    tier: 'L1',
    tenant: 'L1-core',
    enabled: true,
    rolloutPercent: 100,
    updatedAt: '—',
    consumers: ['technical', 'quality'],
  },
];

const DEFAULT_PREFLIGHT: FlagAuthorizationPreflight = {
  flagCode: 'npd.post_release_edit.enabled',
  canEnable: false,
  requiresNewVersion: false,
  hasAuthorizerRoles: false,
  configureHref: '/settings/authorization',
};

async function buildLabels(locale: string): Promise<FlagsAdminLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.flags_admin' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        labels[key] = t(key);
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as FlagsAdminLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

export default async function SettingsFlagsPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as FlagsPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const labels = await buildLabels(locale);

  return (
    <FlagsAdminScreen
      labels={labels}
      flags={props.flags ?? DEFAULT_FLAGS}
      state={props.state ?? 'ready'}
      posthogUrl={props.posthogUrl ?? process.env.NEXT_PUBLIC_POSTHOG_URL ?? '#'}
      authorizationPreflight={props.authorizationPreflight ?? DEFAULT_PREFLIGHT}
      openModal={props.openModal}
      onToggleFlag={props.onToggleFlag}
    />
  );
}
