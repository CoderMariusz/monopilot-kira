import React from 'react';
import { getTranslations } from 'next-intl/server';

import { toggleModule as toggleModuleAction } from '../../../../../../actions/modules/toggle';
import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Switch } from '@monopilot/ui/Switch';

export const dynamic = 'force-dynamic';

type ModuleToggle = {
  key: string;
  moduleCode?: string;
  label: string;
  desc: string;
  enabled: boolean;
  premium?: boolean;
  beta?: boolean;
  enabledDependents?: string[];
};

type PageState = 'ready' | 'loading' | 'empty' | 'error';

type ToggleModuleInput = {
  moduleKey: string;
  enabled: boolean;
  force?: boolean;
};

type ToggleModuleResult = {
  ok: true;
  moduleKey: string;
  enabled: boolean;
  outboxEventType: 'settings.module_toggled';
};

type ModulesLabels = {
  title: string;
  subtitle: string;
  dryRunActivation: string;
  dryRunTitle: string;
  planNotice: string;
  modulesTitle: string;
  earlyAccessTitle: string;
  earlyAccessCopy: string;
  joinPreviewProgram: string;
  loading: string;
  empty: string;
  error: string;
  premium: string;
  beta: string;
  dependentsEnabled: string;
  confirmDisableTitle: string;
  confirmDisableBody: string;
  cancel: string;
  confirm: string;
  close: string;
  saveChanges: string;
  dryRunDialogTitle: string;
  affectedModulesLabel: string;
};

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
  planNotice: "You're on the Premium plan. All premium features are included. Beta features are released incrementally.",
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

function formatCount(template: string, count: number) {
  return template.replace('{count}', String(count));
}

function moduleCodeFor(module: ModuleToggle) {
  return module.moduleCode ?? module.key;
}

async function defaultToggleModule(input: ToggleModuleInput): Promise<ToggleModuleResult> {
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

  return (
    <SettingsModulesScreen
      labels={labels}
      modules={props.modules ?? DEFAULT_MODULES}
      state={props.state ?? 'ready'}
      planName={props.planName ?? 'Premium plan'}
      activeSessionCount={props.activeSessionCount ?? 28}
      toggleModule={props.toggleModule ?? defaultToggleModule}
    />
  );
}

function SettingsModulesScreen({
  labels,
  modules,
  state,
  activeSessionCount,
  toggleModule,
}: {
  labels: ModulesLabels;
  modules: ModuleToggle[];
  state: PageState;
  planName: string;
  activeSessionCount: number;
  toggleModule: (input: ToggleModuleInput) => Promise<ToggleModuleResult>;
}) {
  const [dryRunOpen, setDryRunOpen] = React.useState(false);
  const [confirmModule, setConfirmModule] = React.useState<ModuleToggle | null>(null);
  const [enabledByKey, setEnabledByKey] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(modules.map((module) => [module.key, module.enabled])),
  );

  React.useEffect(() => {
    setEnabledByKey(Object.fromEntries(modules.map((module) => [module.key, module.enabled])));
  }, [modules]);

  const enabledModules = modules.filter((module) => enabledByKey[module.key]);
  const enabledCount = enabledModules.length;
  const affectedCount = Math.max(3, Math.min(6, enabledCount));
  const affectedModules = enabledModules.slice(0, affectedCount).map((module) => module.label);

  const requestToggle = (module: ModuleToggle, enabled: boolean) => {
    if (!enabled && module.enabledDependents && module.enabledDependents.length > 0) {
      setConfirmModule(module);
      return;
    }

    setEnabledByKey((current) => ({ ...current, [module.key]: enabled }));
    void toggleModule({ moduleKey: moduleCodeFor(module), enabled, force: false });
  };

  const confirmDisable = () => {
    if (!confirmModule) return;
    const module = confirmModule;
    setConfirmModule(null);
    setEnabledByKey((current) => ({ ...current, [module.key]: false }));
    void toggleModule({ moduleKey: moduleCodeFor(module), enabled: false, force: true });
  };

  if (state === 'loading') {
    return (
      <main data-testid="settings-modules-screen" className="space-y-4 p-6" aria-busy="true">
        <section
          data-testid="settings-modules-loading-state"
          className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600"
        >
          {labels.loading}
        </section>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main data-testid="settings-modules-screen" className="space-y-4 p-6">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {labels.error}
        </div>
      </main>
    );
  }

  return (
    <main data-testid="settings-modules-screen" className="space-y-4 p-6">
      <header data-region="page-head" className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{labels.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{labels.subtitle}</p>
        </div>
        <Button variant="dry-run" type="button" title={labels.dryRunTitle} onClick={() => setDryRunOpen(true)}>
          {labels.dryRunActivation}
        </Button>
      </header>

      <div
        data-region="plan-notice"
        role="alert"
        className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"
      >
        {labels.planNotice}
      </div>

      <ModuleSection title={labels.modulesTitle} region="modules-section">
        {state === 'empty' || modules.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600">{labels.empty}</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {modules.map((module) => {
              const dependentsCount = module.enabledDependents?.length ?? 0;
              const checked = Boolean(enabledByKey[module.key]);
              return (
                <div
                  key={module.key}
                  data-testid="settings-module-toggle-row"
                  className="grid grid-cols-[1fr_auto] items-center gap-4 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <div data-testid="settings-module-label" className="text-sm font-medium text-slate-950">
                        {module.label}
                      </div>
                      {module.premium ? (
                        <Badge data-testid="settings-module-badge" variant="info" className="bg-violet-50 text-violet-800">
                          {labels.premium}
                        </Badge>
                      ) : null}
                      {module.beta ? (
                        <Badge data-testid="settings-module-badge" variant="warning" className="bg-amber-50 text-amber-800">
                          {labels.beta}
                        </Badge>
                      ) : null}
                      {dependentsCount > 0 ? (
                        <Badge data-testid="settings-module-badge" variant="warning">
                          {formatCount(labels.dependentsEnabled, dependentsCount)}
                        </Badge>
                      ) : null}
                    </div>
                    <div data-testid="settings-module-description" className="mt-1 text-xs text-slate-500">
                      {module.desc}
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Switch
                      aria-label={module.label}
                      checked={checked}
                      onCheckedChange={(next) => requestToggle(module, next)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ModuleSection>

      <ModuleSection title={labels.earlyAccessTitle} region="early-access-section">
        <p className="text-sm text-slate-500">
          {labels.earlyAccessCopy}{' '}
          <a href="/settings/preview-program" className="font-medium text-blue-600 underline-offset-2 hover:underline">
            {labels.joinPreviewProgram}
          </a>
        </p>
      </ModuleSection>

      {dryRunOpen ? (
        <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modules-dry-run-title"
            className="w-[520px] rounded-lg bg-white shadow-2xl"
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 id="settings-modules-dry-run-title" className="text-base font-semibold text-slate-950">
                {labels.dryRunDialogTitle}
              </h2>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm text-slate-700">
              <p>
                Activating this flag set affects <strong>{affectedModules.length} modules</strong> across{' '}
                <strong>{activeSessionCount} active sessions</strong>.
              </p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                <strong>
                  {enabledCount} of {modules.length}
                </strong>{' '}
                flags currently on. Changes apply on next page load for each user.
              </div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.affectedModulesLabel}</div>
              <div className="flex flex-wrap gap-2">
                {affectedModules.map((module) => (
                  <Badge key={module} data-testid="settings-dry-run-module-badge" variant="info">
                    {module}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 rounded-b-lg border-t border-slate-200 bg-slate-50 p-4">
              <Button type="button" className="btn-secondary" onClick={() => setDryRunOpen(false)}>
                {labels.close}
              </Button>
              <Button type="button" className="btn-primary" onClick={() => setDryRunOpen(false)}>
                {labels.saveChanges}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmModule ? (
        <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modules-confirm-title"
            className="w-[440px] rounded-lg bg-white shadow-2xl"
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 id="settings-modules-confirm-title" className="text-base font-semibold text-slate-950">
                {labels.confirmDisableTitle}
              </h2>
            </div>
            <div className="px-5 py-4 text-sm text-slate-700">{labels.confirmDisableBody}</div>
            <div className="flex justify-end gap-2 rounded-b-lg border-t border-slate-200 bg-slate-50 p-4">
              <Button type="button" className="btn-secondary" onClick={() => setConfirmModule(null)}>
                {labels.cancel}
              </Button>
              <Button type="button" className="btn-primary" onClick={confirmDisable}>
                {labels.confirm}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ModuleSection({ title, region, children }: { title: string; region: string; children: React.ReactNode }) {
  return (
    <section
      data-testid="settings-module-section"
      data-region={region}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 className="mb-3 text-lg font-semibold text-slate-950">{title}</h2>
      {children}
    </section>
  );
}
