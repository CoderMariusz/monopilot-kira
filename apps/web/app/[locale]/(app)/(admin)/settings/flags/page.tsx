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
  noConsumers: '—',
  defaultNpdDescription: 'Allow released NPD product/BOM edits after authorization.',
  defaultTechnicalDescription: 'Require Technical product-spec approval before factory use.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof FlagsAdminLabels>;

function defaultFlags(labels: FlagsAdminLabels): FeatureFlagRow[] {
  return [
    {
      code: 'npd.post_release_edit.enabled',
      description: labels.defaultNpdDescription,
      tier: 'L1',
      tenant: 'L1-core',
      enabled: false,
      rolloutPercent: 0,
      updatedAt: labels.noConsumers,
      consumers: ['npd', 'technical'],
    },
    {
      code: 'technical.product_spec_approval.required',
      description: labels.defaultTechnicalDescription,
      tier: 'L1',
      tenant: 'L1-core',
      enabled: true,
      rolloutPercent: 100,
      updatedAt: labels.noConsumers,
      consumers: ['technical', 'quality'],
    },
  ];
}

const DEFAULT_PREFLIGHT: FlagAuthorizationPreflight = {
  flagCode: 'npd.post_release_edit.enabled',
  canEnable: false,
  requiresNewVersion: false,
  hasAuthorizerRoles: false,
  configureHref: '/settings/authorization',
};

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

  return (
    <FlagsAdminScreen
      labels={labels}
      flags={props.flags ?? defaultFlags(labels)}
      state={props.state ?? 'ready'}
      posthogUrl={props.posthogUrl ?? process.env.NEXT_PUBLIC_POSTHOG_URL ?? '#'}
      authorizationPreflight={props.authorizationPreflight ?? DEFAULT_PREFLIGHT}
      openModal={props.openModal}
      onToggleFlag={props.onToggleFlag}
    />
  );
}
