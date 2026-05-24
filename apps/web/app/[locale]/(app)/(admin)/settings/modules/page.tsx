import React from 'react';
import { getTranslations } from 'next-intl/server';

import { toggleModule as toggleModuleAction } from '../../../../../../actions/modules/toggle';
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

// Explicit fallback provenance: project-shaped module rows from the MonoPilot PRD module glossary.
// Runtime overrides can supply live Drizzle/API rows through the Server Component props while the T-103 loader matures.
const DEFAULT_MODULES: ModuleToggle[] = [
  {
    key: '01-npd',
    label: 'NPD',
    desc: 'Product development, specs, and allergen workflow.',
    enabled: true,
    premium: true,
    enabledDependents: [],
  },
  {
    key: '05-warehouse',
    label: 'Warehouse',
    desc: 'License plates, GRN, transfers, and stock movements.',
    enabled: true,
    premium: true,
    enabledDependents: ['11-shipping'],
  },
  {
    key: '11-shipping',
    label: 'Shipping',
    desc: 'Sales orders, allocation, pick/pack, BOL, and POD.',
    enabled: true,
    beta: true,
    enabledDependents: [],
  },
  {
    key: '15-oee',
    label: 'OEE',
    desc: 'Availability, performance, quality, and read-only snapshots.',
    enabled: false,
    premium: true,
    beta: true,
    enabledDependents: [],
  },
];

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

  return React.createElement(SettingsModulesScreen, {
    labels,
    modules: props.modules ?? DEFAULT_MODULES,
    state: props.state ?? 'ready',
    planName: props.planName ?? 'Premium plan',
    activeSessionCount: props.activeSessionCount ?? 28,
    toggleModule: props.toggleModule ?? defaultToggleModule,
  });
}
