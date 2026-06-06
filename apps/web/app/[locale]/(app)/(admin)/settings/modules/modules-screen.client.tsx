'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Switch } from '@monopilot/ui/Switch';

export type ModuleToggle = {
  key: string;
  moduleCode?: string;
  label: string;
  desc: string;
  enabled: boolean;
  premium?: boolean;
  beta?: boolean;
  enabledDependents?: string[];
};

export type PageState = 'ready' | 'loading' | 'empty' | 'error';

export type ToggleModuleInput = {
  moduleKey: string;
  enabled: boolean;
  force?: boolean;
};

export type ToggleModuleResult = {
  ok: true;
  moduleKey: string;
  enabled: boolean;
  outboxEventType: 'settings.module_toggled';
};

export type ModulesLabels = {
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
  dryRunAffects: string;
  dryRunFlagsOn: string;
  dryRunApplyOnLoad: string;
  affectedModulesLabel: string;
};

export type SettingsModulesScreenProps = {
  labels: ModulesLabels;
  modules: ModuleToggle[];
  state: PageState;
  planName: string;
  activeSessionCount: number;
  toggleModule: (input: ToggleModuleInput) => Promise<ToggleModuleResult>;
};

function formatCount(template: string, count: number) {
  return template.replace('{count}', String(count));
}

function formatTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((value, [key, replacement]) => {
    return value.replaceAll(`{${key}}`, String(replacement));
  }, template);
}

function moduleCodeFor(module: ModuleToggle) {
  return module.moduleCode ?? module.key;
}

export default function SettingsModulesScreen({
  labels,
  modules,
  state,
  planName,
  activeSessionCount,
  toggleModule,
}: SettingsModulesScreenProps) {
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
        <section data-testid="settings-modules-loading-state" className="card text-sm text-muted-foreground">
          {labels.loading}
        </section>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main data-testid="settings-modules-screen" className="space-y-4 p-6">
        <div role="alert" className="alert alert-red">
          {labels.error}
        </div>
      </main>
    );
  }

  return (
    <main data-testid="settings-modules-screen" className="space-y-4 p-6">
      <header data-region="page-head" className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{labels.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        <Button variant="dry-run" type="button" className="btn-secondary" title={labels.dryRunTitle} onClick={() => setDryRunOpen(true)}>
          {labels.dryRunActivation}
        </Button>
      </header>

      <div data-region="plan-notice" role="alert" className="alert alert-blue">
        {formatTemplate(labels.planNotice, { planName })}
      </div>

      <ModuleSection title={labels.modulesTitle} region="modules-section">
        {state === 'empty' || modules.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">🧩</div>
            <div className="empty-state-title">{labels.empty}</div>
          </div>
        ) : (
          <div className="divide-y divide-border">
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
                      <div data-testid="settings-module-label" className="text-sm font-medium">
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
                    <div data-testid="settings-module-description" className="mt-1 text-xs text-muted-foreground">
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
        <p className="text-sm text-muted-foreground">
          {labels.earlyAccessCopy}{' '}
          <a href="#early-access-preview-program" className="font-medium text-[var(--blue)] underline-offset-2 hover:underline">
            {labels.joinPreviewProgram}
          </a>
        </p>
      </ModuleSection>

      {dryRunOpen ? (
        <div role="presentation" className="modal-overlay" onClick={() => setDryRunOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modules-dry-run-title"
            className="modal-box"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="settings-modules-dry-run-title" className="modal-title">
                {labels.dryRunDialogTitle}
              </h2>
            </div>
            <div className="modal-body space-y-3 text-sm">
              <p>
                {formatTemplate(labels.dryRunAffects, {
                  modules: affectedModules.length,
                  sessions: activeSessionCount,
                })}
              </p>
              <div className="alert alert-amber text-xs">
                <strong>{formatTemplate(labels.dryRunFlagsOn, { enabled: enabledCount, total: modules.length })}</strong>{' '}
                {labels.dryRunApplyOnLoad}
              </div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{labels.affectedModulesLabel}</div>
              <div className="flex flex-wrap gap-2">
                {affectedModules.map((module) => (
                  <Badge key={module} data-testid="settings-dry-run-module-badge" variant="info">
                    {module}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="modal-foot">
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
        <div role="presentation" className="modal-overlay" onClick={() => setConfirmModule(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modules-confirm-title"
            className="modal-box"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="settings-modules-confirm-title" className="modal-title">
                {labels.confirmDisableTitle}
              </h2>
            </div>
            <div className="modal-body text-sm">{labels.confirmDisableBody}</div>
            <div className="modal-foot">
              <Button type="button" className="btn-secondary" onClick={() => setConfirmModule(null)}>
                {labels.cancel}
              </Button>
              <Button type="button" className="btn-danger" onClick={confirmDisable}>
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
    <section data-testid="settings-module-section" data-region={region} className="card">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
