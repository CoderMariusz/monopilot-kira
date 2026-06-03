import React from 'react';
import { getTranslations } from 'next-intl/server';

import { toggleModule as toggleModuleAction } from '../../../../../../actions/modules/toggle';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import SettingsModulesScreen, {
  type ModuleToggle,
  type ModulesLabels,
  type PageState,
  type ToggleModuleInput,
  type ToggleModuleResult,
} from './modules-screen.client';

export const dynamic = 'force-dynamic';

type ModulesPageProps = {
  params?: Promise<{ locale: string }>;
  modules?: ModuleToggle[];
  state?: PageState;
  planName?: string;
  activeSessionCount?: number;
  toggleModule?: (input: ToggleModuleInput) => Promise<ToggleModuleResult>;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type ModuleRow = {
  code: string;
  name: string;
  description: string | null;
  dependencies: string[] | null;
  can_disable: boolean | null;
  phase: number | string | null;
  enabled: boolean | null;
};

type OrgPlanRow = {
  tier: string | null;
  active_sessions: string | number | null;
};

// Discriminated read result — NO fabricated/demo rows. The admin module grid
// renders the honest 'empty' state when there is no catalog and the honest
// 'error' state when the read throws.
type ModulesReadResult =
  | { state: 'ready'; modules: ModuleToggle[]; planName: string; activeSessionCount: number }
  | { state: 'empty'; planName: string; activeSessionCount: number }
  | { state: 'error' };

const DEFAULT_LABELS: ModulesLabels = {
  title: 'Feature flags',
  subtitle: 'Turn modules and features on for your workspace.',
  dryRunActivation: 'Dry-run activation',
  dryRunTitle: 'Preview affected modules + active sessions before saving flag changes',
  planNotice: "You're on the {planName}. All premium features are included. Beta features are released incrementally.",
  modulesTitle: 'Modules',
  earlyAccessTitle: 'Early access',
  earlyAccessCopy: 'Want to try a feature early?',
  joinPreviewProgram: 'Join the preview program →',
  loading: 'Loading module toggles…',
  empty: 'No modules are configured for this workspace.',
  error: 'Unable to load module toggles.',
  premium: 'Premium',
  beta: 'Beta',
  dependentsEnabled: '{count} dependents enabled',
  confirmDisableTitle: 'Disable module with enabled dependents?',
  confirmDisableBody: 'Downstream enabled modules may stop working until dependencies are restored.',
  cancel: 'Cancel',
  confirm: 'Confirm',
  close: 'Close',
  saveChanges: 'Save changes',
  dryRunDialogTitle: 'Dry-run — feature flag activation',
  dryRunAffects: 'Activating this flag set affects {modules} modules across {sessions} active sessions.',
  dryRunFlagsOn: '{enabled} of {total}',
  dryRunApplyOnLoad: 'flags currently on. Changes apply on next page load for each user.',
  affectedModulesLabel: 'Affected modules',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof ModulesLabels>;

const PREMIUM_PHASE = 3;
const BETA_PHASE = 4;

async function buildLabels(locale: string): Promise<ModulesLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.modules' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        labels[key] = t(key);
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as ModulesLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

function toNumber(value: string | number | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function planNameFromTier(tier: string | null | undefined) {
  return /^l1$/i.test(tier ?? '') || /^free$/i.test(tier ?? '') ? 'Free plan' : 'Premium plan';
}

/** Expand a dependency token ('05' or '05-warehouse') to a full module code. */
function expandDependency(dep: string, codes: Set<string>): string | null {
  if (codes.has(dep)) return dep;
  if (/^[0-9]{2}$/.test(dep)) {
    for (const code of codes) {
      if (code.startsWith(`${dep}-`)) return code;
    }
  }
  return null;
}

/**
 * Build, for each module code, the list of currently-ENABLED modules that
 * directly depend on it. This is the warning the admin grid surfaces before a
 * disable ("X dependents enabled"). Derived entirely from real catalog +
 * organization_modules rows.
 */
function computeEnabledDependents(rows: ModuleRow[]): Map<string, string[]> {
  const codes = new Set(rows.map((r) => r.code));
  const labelByCode = new Map(rows.map((r) => [r.code, r.name]));
  const enabledByCode = new Map(rows.map((r) => [r.code, Boolean(r.enabled)]));
  const dependents = new Map<string, string[]>();

  for (const row of rows) {
    if (!enabledByCode.get(row.code)) continue; // only enabled modules count as live dependents
    for (const dep of row.dependencies ?? []) {
      const target = expandDependency(dep, codes);
      if (!target || target === row.code) continue;
      const list = dependents.get(target) ?? [];
      list.push(labelByCode.get(row.code) ?? row.code);
      dependents.set(target, list);
    }
  }

  for (const [code, list] of dependents) {
    dependents.set(code, list.sort());
  }
  return dependents;
}

function mapModuleRows(rows: ModuleRow[]): ModuleToggle[] {
  const dependents = computeEnabledDependents(rows);
  return rows.map((row) => {
    const phase = toNumber(row.phase, 1);
    return {
      key: row.code,
      moduleCode: row.code,
      label: row.name,
      desc: row.description?.trim() ? row.description : `${row.name} module surface.`,
      enabled: Boolean(row.enabled),
      premium: phase >= PREMIUM_PHASE,
      beta: phase >= BETA_PHASE,
      enabledDependents: dependents.get(row.code) ?? [],
    };
  });
}

async function readModulesData(): Promise<ModulesReadResult> {
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
        modules: mapModuleRows(moduleResult.rows),
        planName,
        activeSessionCount,
      };
    });
  } catch {
    return { state: 'error' };
  }
}

async function defaultToggleModule(input: ToggleModuleInput): Promise<ToggleModuleResult> {
  'use server';

  const result = await toggleModuleAction({
    moduleCode: input.moduleKey,
    enabled: input.enabled,
    force: input.force,
    auditReason: input.force ? 'operator confirmed disabling a module with enabled dependents' : undefined,
  });

  if (!result.ok) {
    throw new Error('toggle_module_failed');
  }

  return {
    ok: true,
    moduleKey: result.data.moduleCode,
    enabled: result.data.enabled,
    outboxEventType: 'settings.module_toggled',
  };
}

export default async function SettingsModulesPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as ModulesPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const labels = await buildLabels(locale);

  // When the test/host injects modules explicitly, honor them; otherwise read
  // REAL Supabase data via the org-scoped loader — no placeholder/demo rows.
  const loaded = props.modules ? null : await readModulesData();

  const resolvedState: PageState =
    props.state ??
    (loaded?.state === 'error'
      ? 'error'
      : loaded?.state === 'empty'
        ? 'empty'
        : props.modules
          ? props.modules.length === 0
            ? 'empty'
            : 'ready'
          : 'ready');

  const resolvedModules =
    props.modules ?? (loaded && loaded.state === 'ready' ? loaded.modules : []);

  const resolvedPlanName =
    props.planName ?? (loaded && loaded.state !== 'error' ? loaded.planName : 'Premium plan');

  const resolvedSessionCount =
    props.activeSessionCount ?? (loaded && loaded.state !== 'error' ? loaded.activeSessionCount : 0);

  return React.createElement(SettingsModulesScreen, {
    labels,
    modules: resolvedModules,
    state: resolvedState,
    planName: resolvedPlanName,
    activeSessionCount: resolvedSessionCount,
    toggleModule: props.toggleModule ?? defaultToggleModule,
  });
}
