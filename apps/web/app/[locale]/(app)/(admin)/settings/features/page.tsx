import { getTranslations } from 'next-intl/server';

import { toggleModule as toggleModuleAction } from '../../../../../../actions/modules/toggle';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import FeaturesScreenClient, {
  type FeatureFlag,
  type FeaturesLabels,
  type PageState,
  type ToggleFeatureInput,
  type ToggleFeatureResult,
} from './features-screen.client';

export const dynamic = 'force-dynamic';

type FeaturesPageProps = {
  params?: Promise<{ locale: string }>;
  features?: FeatureFlag[];
  state?: PageState;
  planName?: 'Free plan' | 'Premium plan' | string;
  activeSessionCount?: number;
  toggleFeature?: (input: ToggleFeatureInput) => Promise<ToggleFeatureResult>;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type ModuleRow = {
  code: string;
  name: string;
  description: string | null;
  dependencies?: string[] | null;
  can_disable?: boolean | null;
  phase?: number | string | null;
  enabled: boolean | null;
};

type OrgPlanRow = {
  tier: string | null;
  active_sessions: string | number | null;
};

// Discriminated read result: NO demo/hardcoded fallback. The page renders the
// honest 'empty' state when the org has no module catalog rows and the honest
// 'error' state when the query throws (RLS / connectivity / context failure).
type FeaturesReadResult =
  | { state: 'ready'; features: FeatureFlag[]; planName: string; activeSessionCount: number }
  | { state: 'empty'; planName: string; activeSessionCount: number }
  | { state: 'error' };

const LABEL_KEYS: Array<keyof FeaturesLabels> = [
  'title',
  'subtitle',
  'dryRunActivation',
  'dryRunTitle',
  'planNotice',
  'freePlanNotice',
  'modulesTitle',
  'earlyAccessTitle',
  'earlyAccessCopy',
  'joinPreviewProgram',
  'loading',
  'empty',
  'error',
  'premium',
  'beta',
  'upgradePlanTooltip',
  'dependencyRejectedTitle',
  'dependencyRejectedBody',
  'forceDisable',
  'cancel',
  'dismissDependencyDialog',
  'close',
  'saveChanges',
  'dryRunDialogTitle',
  'dryRunAffects',
  'dryRunFlagsOn',
  'dryRunApplyOnLoad',
  'affectedModulesLabel',
];

// Premium/Beta presentation tier is derived from the catalog phase column
// (real data): phase >= 3 modules are premium-tier, phase >= 4 are beta. There
// is no separate plan_tier/beta column in public.modules, so phase is the
// catalog-driven signal — not a hardcoded per-module override map.
const PREMIUM_PHASE = 3;
const BETA_PHASE = 4;

async function buildLabels(locale: string): Promise<FeaturesLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.features' });
  return LABEL_KEYS.reduce((labels, key) => {
    labels[key] = t(key);
    return labels;
  }, {} as FeaturesLabels);
}

async function readFeaturesData(): Promise<FeaturesReadResult> {
  try {
    return await withOrgContext(async ({ orgId, client }) => {
      const queryClient = client as QueryClient;
      const [moduleResult, orgResult] = await Promise.all([
        queryClient.query<ModuleRow>(
          `select m.code,
                  m.name,
                  m.description,
                  m.dependencies,
                  m.can_disable,
                  m.phase,
                  coalesce(om.enabled, false) as enabled
             from public.modules m
             left join public.organization_modules om
               on om.module_code = m.code
              and om.org_id = $1::uuid
            order by m.display_order nulls last, m.code`,
          [orgId],
        ),
        queryClient.query<OrgPlanRow>(
          `select o.tier,
                  (select count(*) from public.users u where u.org_id = $1::uuid and u.is_active = true) as active_sessions
             from public.organizations o
            where o.id = $1::uuid
            limit 1`,
          [orgId],
        ),
      ]);

      const planName = planNameFromTier(orgResult.rows[0]?.tier);
      const activeSessionCount = toNumber(orgResult.rows[0]?.active_sessions, 0);

      if (moduleResult.rows.length === 0) {
        return { state: 'empty', planName, activeSessionCount };
      }

      return {
        state: 'ready',
        features: mapModuleRows(moduleResult.rows),
        planName,
        activeSessionCount,
      };
    });
  } catch {
    // No demo fallback: surface the honest error state instead of fabricating
    // module rows / an active-session count.
    return { state: 'error' };
  }
}

function mapModuleRows(rows: ModuleRow[]): FeatureFlag[] {
  return rows.map((row) => {
    const phase = toNumber(row.phase, 1);
    return {
      key: row.code,
      label: row.name,
      // Description comes from the catalog row (public.modules.description),
      // not a hardcoded map. Fall back to a derived label only if a catalog row
      // genuinely has no description yet.
      desc: row.description?.trim() ? row.description : `${row.name} module surface.`,
      on: Boolean(row.enabled),
      premium: phase >= PREMIUM_PHASE,
      beta: phase >= BETA_PHASE,
    };
  });
}

function planNameFromTier(tier: string | null | undefined) {
  return /^l1$/i.test(tier ?? '') || /^free$/i.test(tier ?? '') ? 'Free plan' : 'Premium plan';
}

function toNumber(value: string | number | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function defaultToggleFeature(input: ToggleFeatureInput): Promise<ToggleFeatureResult> {
  'use server';

  const result = await toggleModuleAction({
    moduleCode: input.featureKey,
    enabled: input.enabled,
    force: input.force,
    auditReason: input.force ? 'operator confirmed force-disabling feature dependencies' : undefined,
  });

  if (result.ok) {
    return {
      ok: true,
      featureKey: result.data.moduleCode,
      enabled: result.data.enabled,
      outboxEventType: 'settings.feature_toggled',
    };
  }

  if (result.error === 'dependency_enabled') {
    return {
      ok: false,
      code: 'dependency_check_rejected',
      dependentModules: result.blockingModules ?? [],
      message: 'dependency_check_rejected',
    };
  }

  throw new Error('toggle_feature_failed');
}

export default async function SettingsFeaturesPage(props: FeaturesPageProps = {}) {
  const { locale } = props.params ? await props.params : { locale: 'en' };

  // When the test/host injects features explicitly, honor the injected props
  // and skip the live read. Otherwise read REAL Supabase data — no demo rows.
  const loaded = props.features ? null : await readFeaturesData();
  const labels = await buildLabels(locale);

  const resolvedState: PageState =
    props.state ??
    (loaded?.state === 'error'
      ? 'error'
      : loaded?.state === 'empty'
        ? 'empty'
        : 'ready');

  const resolvedFeatures =
    props.features ?? (loaded && loaded.state === 'ready' ? loaded.features : []);

  const resolvedPlanName =
    props.planName ?? (loaded && loaded.state !== 'error' ? loaded.planName : 'Premium plan');

  const resolvedSessionCount =
    props.activeSessionCount ?? (loaded && loaded.state !== 'error' ? loaded.activeSessionCount : 0);

  return (
    <FeaturesScreenClient
      labels={labels}
      features={resolvedFeatures}
      state={resolvedState}
      planName={resolvedPlanName}
      activeSessionCount={resolvedSessionCount}
      toggleFeature={props.toggleFeature ?? defaultToggleFeature}
    />
  );
}
