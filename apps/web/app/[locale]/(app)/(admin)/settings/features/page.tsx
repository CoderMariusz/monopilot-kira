import { jsx } from 'react/jsx-runtime';
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
  dependencies?: string[] | null;
  can_disable?: boolean | null;
  phase?: number | string | null;
  enabled: boolean | null;
};

type OrgPlanRow = {
  tier: string | null;
  active_sessions: string | number | null;
};

type FeaturesReadResult = {
  features: FeatureFlag[];
  planName: string;
  activeSessionCount: number;
};

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

const DEFAULT_FEATURES: FeatureFlag[] = [
  {
    key: '08-production',
    label: 'Core manufacturing',
    desc: 'Production execution, work orders, and operator workflows.',
    on: true,
  },
  {
    key: '09-quality',
    label: 'Quality',
    desc: 'Specifications, holds, NCR, HACCP, and allergen gates.',
    on: true,
    beta: true,
  },
  {
    key: '15-oee',
    label: 'OEE',
    desc: 'Availability, performance, quality, and read-only snapshots.',
    on: false,
    premium: true,
    beta: true,
  },
];

const MODULE_DESCRIPTIONS: Record<string, string> = {
  '00-foundation': 'Authentication, RBAC, tenancy, audit, outbox, and observability.',
  '01-npd': 'Product development, specifications, and allergen workflow.',
  '02-settings': 'Reference data, policies, permissions, and workspace configuration.',
  '03-technical': 'Products, BOMs, routings, equipment, items, and standard costs.',
  '04-planning-basic': 'Suppliers, purchase orders, work order baseline, and MRP.',
  '05-warehouse': 'License plates, GRN, transfers, and stock movements.',
  '06-scanner-p1': 'Mobile scanner workflows, operators, and offline sync.',
  '07-planning-ext': 'Extended planning, scheduler outputs, and dependency planning.',
  '08-production': 'Work order execution, outputs, waste, and downtime.',
  '09-quality': 'Specifications, holds, NCR, HACCP, and allergen gates.',
  '10-finance': 'Standard costs, actual costing, FIFO/WAC variance, and D365 export.',
  '11-shipping': 'Sales orders, allocation, pick/pack, BOL, POD, and carriers.',
  '12-reporting': 'KPIs, dashboards, exports, and reporting consumers.',
  '13-maintenance': 'Assets, PM schedules, maintenance work orders, LOTO, and calibration.',
  '14-multi-site': 'Site context, inter-site transfers, lanes, and master-data sync.',
  '15-oee': 'Availability, performance, quality, and read-only snapshots.',
};

const PREMIUM_MODULE_CODES = new Set(['01-npd', '07-planning-ext', '10-finance', '12-reporting', '13-maintenance', '14-multi-site', '15-oee']);
const BETA_MODULE_CODES = new Set(['06-scanner-p1', '07-planning-ext', '12-reporting', '13-maintenance', '14-multi-site', '15-oee']);

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

      return {
        features: mapModuleRows(moduleResult.rows),
        planName: planNameFromTier(orgResult.rows[0]?.tier),
        activeSessionCount: toNumber(orgResult.rows[0]?.active_sessions, 28),
      };
    });
  } catch {
    return {
      features: DEFAULT_FEATURES,
      planName: 'Premium plan',
      activeSessionCount: 28,
    };
  }
}

function mapModuleRows(rows: ModuleRow[]): FeatureFlag[] {
  if (rows.length === 0) return DEFAULT_FEATURES;
  return rows.map((row) => {
    const code = row.code;
    const phase = toNumber(row.phase, 1);
    return {
      key: code,
      label: row.name,
      desc: MODULE_DESCRIPTIONS[code] ?? `${row.name} module surface.`,
      on: Boolean(row.enabled),
      premium: PREMIUM_MODULE_CODES.has(code) || phase >= 3,
      beta: BETA_MODULE_CODES.has(code) || phase >= 4,
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

export default async function SettingsFeaturesPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as FeaturesPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const [labels, loaded] = await Promise.all([buildLabels(locale), props.features ? Promise.resolve(null) : readFeaturesData()]);

  return jsx(FeaturesScreenClient, {
    labels,
    features: props.features ?? loaded?.features ?? DEFAULT_FEATURES,
    state: props.state ?? 'ready',
    planName: props.planName ?? loaded?.planName ?? 'Premium plan',
    activeSessionCount: props.activeSessionCount ?? loaded?.activeSessionCount ?? 28,
    toggleFeature: props.toggleFeature ?? defaultToggleFeature,
  });
}
