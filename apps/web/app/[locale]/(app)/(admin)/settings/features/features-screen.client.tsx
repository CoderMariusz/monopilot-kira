'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Switch } from '@monopilot/ui/Switch';

export type FeatureFlag = {
  key: string;
  label: string;
  desc: string;
  on: boolean;
  premium?: boolean;
  beta?: boolean;
};

export type PageState = 'ready' | 'loading' | 'empty' | 'error';

export type ToggleFeatureInput = {
  featureKey: string;
  enabled: boolean;
  force?: boolean;
};

export type ToggleFeatureResult =
  | { ok: true; featureKey: string; enabled: boolean; outboxEventType: 'settings.feature_toggled' }
  | { ok: false; code: 'dependency_check_rejected'; dependentModules: string[]; message: string };

export type FeaturesLabels = {
  title: string;
  subtitle: string;
  dryRunActivation: string;
  dryRunTitle: string;
  planNotice: string;
  freePlanNotice: string;
  modulesTitle: string;
  earlyAccessTitle: string;
  earlyAccessCopy: string;
  joinPreviewProgram: string;
  loading: string;
  empty: string;
  error: string;
  premium: string;
  beta: string;
  upgradePlanTooltip: string;
  dependencyRejectedTitle: string;
  dependencyRejectedBody: string;
  forceDisable: string;
  cancel: string;
  dismissDependencyDialog: string;
  close: string;
  saveChanges: string;
  dryRunDialogTitle: string;
  dryRunAffects: string;
  dryRunFlagsOn: string;
  dryRunApplyOnLoad: string;
  affectedModulesLabel: string;
};

export type FeaturesScreenClientProps = {
  labels: FeaturesLabels;
  features: FeatureFlag[];
  state: PageState;
  planName: string;
  activeSessionCount: number;
  toggleFeature: (input: ToggleFeatureInput) => Promise<ToggleFeatureResult>;
};

function formatTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((value, [key, replacement]) => {
    return value.replaceAll(`{${key}}`, String(replacement));
  }, template);
}

export default function FeaturesScreenClient({
  labels,
  features,
  state,
  planName,
  activeSessionCount,
  toggleFeature,
}: FeaturesScreenClientProps) {
  const [dryRunOpen, setDryRunOpen] = React.useState(false);
  const [pendingDependency, setPendingDependency] = React.useState<{
    feature: FeatureFlag;
    nextEnabled: boolean;
    dependentModules: string[];
  } | null>(null);
  const [enabledByKey, setEnabledByKey] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(features.map((feature) => [feature.key, feature.on])),
  );

  React.useEffect(() => {
    setEnabledByKey(Object.fromEntries(features.map((feature) => [feature.key, feature.on])));
  }, [features]);

  if (state === 'loading') {
    return (
      <main data-testid="settings-features-screen" className="space-y-4 p-6" aria-busy="true">
        <section
          data-testid="settings-features-loading-state"
          className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600"
        >
          {labels.loading}
        </section>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main data-testid="settings-features-screen" className="space-y-4 p-6">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {labels.error}
        </div>
      </main>
    );
  }

  const freePlan = /free/i.test(planName);
  const enabledFeatures = features.filter((feature) => enabledByKey[feature.key]);
  const enabledCount = enabledFeatures.length;
  const affectedCount = Math.max(3, Math.min(6, enabledCount));
  const planNotice = formatTemplate(freePlan ? labels.freePlanNotice : labels.planNotice, { planName });

  const requestToggle = async (feature: FeatureFlag, nextEnabled: boolean, force = false) => {
    if (feature.premium && freePlan) return;

    const result = await toggleFeature({ featureKey: feature.key, enabled: nextEnabled, force });
    if (result.ok) {
      setEnabledByKey((current) => ({ ...current, [feature.key]: result.enabled }));
      setPendingDependency(null);
      return;
    }

    if (result.code === 'dependency_check_rejected') {
      setPendingDependency({ feature, nextEnabled, dependentModules: result.dependentModules });
    }
  };

  const forceDisable = () => {
    if (!pendingDependency) return;
    const { feature, nextEnabled } = pendingDependency;
    void requestToggle(feature, nextEnabled, true);
  };

  return (
    <main data-testid="settings-features-screen" className="space-y-4 p-6">
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
        {planNotice}
      </div>

      <FeatureSection title={labels.modulesTitle} region="modules-section">
        {state === 'empty' || features.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600">{labels.empty}</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {features.map((feature) => {
              const checked = Boolean(enabledByKey[feature.key]);
              const disabled = Boolean(feature.premium && freePlan);
              return (
                <div
                  key={feature.key}
                  data-testid="settings-feature-row"
                  className="grid grid-cols-[1fr_auto] items-center gap-4 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <div data-testid="settings-feature-label" className="text-sm font-medium text-slate-950">
                        {feature.label}
                      </div>
                      {feature.premium ? (
                        <Badge data-testid="settings-feature-badge" variant="info" className="bg-violet-50 text-violet-800">
                          {labels.premium}
                        </Badge>
                      ) : null}
                      {feature.beta ? (
                        <Badge data-testid="settings-feature-badge" variant="warning" className="bg-amber-50 text-amber-800">
                          {labels.beta}
                        </Badge>
                      ) : null}
                    </div>
                    <div data-testid="settings-feature-description" className="mt-1 text-xs text-slate-500">
                      {feature.desc}
                    </div>
                    {disabled ? <div className="mt-1 text-xs text-violet-700">{labels.upgradePlanTooltip}</div> : null}
                  </div>
                  <div className="flex items-center">
                    <Switch
                      aria-label={feature.label}
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(next) => void requestToggle(feature, next, false)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </FeatureSection>

      <FeatureSection title={labels.earlyAccessTitle} region="early-access-section">
        <p className="text-sm text-slate-500">
          {labels.earlyAccessCopy}{' '}
          <a href="#early-access-preview-program" className="font-medium text-blue-600 underline-offset-2 hover:underline">
            {labels.joinPreviewProgram}
          </a>
        </p>
      </FeatureSection>

      {dryRunOpen ? (
        <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-features-dry-run-title"
            className="w-[520px] rounded-lg bg-white shadow-2xl"
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 id="settings-features-dry-run-title" className="text-base font-semibold text-slate-950">
                {labels.dryRunDialogTitle}
              </h2>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm text-slate-700">
              <p>{formatTemplate(labels.dryRunAffects, { modules: affectedCount, sessions: activeSessionCount })}</p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                <strong>{formatTemplate(labels.dryRunFlagsOn, { enabled: enabledCount, total: features.length })}</strong>{' '}
                {labels.dryRunApplyOnLoad}
              </div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.affectedModulesLabel}</div>
              <div className="flex flex-wrap gap-2">
                {enabledFeatures.map((feature) => (
                  <Badge key={feature.key} data-testid="settings-dry-run-module-badge" variant="info">
                    {feature.label}
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

      {pendingDependency ? (
        <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-features-dependency-title"
            className="w-[440px] rounded-lg bg-white shadow-2xl"
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 id="settings-features-dependency-title" className="text-base font-semibold text-slate-950">
                {labels.dependencyRejectedTitle}
              </h2>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm text-slate-700">
              <p>{labels.dependencyRejectedBody}</p>
              <div className="flex flex-wrap gap-2">
                {pendingDependency.dependentModules.map((module) => (
                  <Badge key={module} variant="warning">
                    {module}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 rounded-b-lg border-t border-slate-200 bg-slate-50 p-4">
              <Button
                type="button"
                className="btn-secondary"
                aria-label={labels.dismissDependencyDialog}
                onClick={() => setPendingDependency(null)}
              >
                {labels.cancel}
              </Button>
              <Button type="button" className="btn-primary" onClick={forceDisable}>
                {labels.forceDisable}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function FeatureSection({ title, region, children }: { title: string; region: string; children?: React.ReactNode }) {
  return (
    <section
      data-testid="settings-feature-section"
      data-region={region}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 className="mb-3 text-lg font-semibold text-slate-950">{title}</h2>
      {children}
    </section>
  );
}
