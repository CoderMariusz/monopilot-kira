'use client';

import React from 'react';

type FeatureFlag = {
  key: string;
  label: string;
  desc: string;
  on: boolean;
  premium?: boolean;
  beta?: boolean;
};

type PageState = 'ready' | 'loading' | 'empty' | 'error';

type ToggleFeatureInput = {
  featureKey: string;
  enabled: boolean;
  force?: boolean;
};

type ToggleFeatureResult =
  | { ok: true; featureKey: string; enabled: boolean; outboxEventType: 'settings.feature_toggled' }
  | { ok: false; code: 'dependency_check_rejected'; dependentModules: string[]; message: string };

type FeaturesLabels = {
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
  close: string;
  saveChanges: string;
  dryRunDialogTitle: string;
  dryRunAffects: string;
  dryRunFlagsOn: string;
  dryRunApplyOnLoad: string;
  affectedModulesLabel: string;
};

type FeaturesPageProps = {
  params?: Promise<{ locale: string }>;
  features?: FeatureFlag[];
  state?: PageState;
  planName?: 'Free plan' | 'Premium plan' | string;
  activeSessionCount?: number;
  toggleFeature?: (input: ToggleFeatureInput) => Promise<ToggleFeatureResult>;
};

const DEFAULT_LABELS: FeaturesLabels = {
  title: 'Feature flags',
  subtitle: 'Turn modules and features on for your workspace.',
  dryRunActivation: 'Dry-run activation',
  dryRunTitle: 'Preview affected modules + active sessions before saving flag changes',
  planNotice: "You're on the {planName}. All premium features are included. Beta features are released incrementally.",
  freePlanNotice: "You're on the {planName}. Premium features require an upgrade. Beta features are released incrementally.",
  modulesTitle: 'Modules',
  earlyAccessTitle: 'Early access',
  earlyAccessCopy: 'Want to try a feature early?',
  joinPreviewProgram: 'Join the preview program →',
  loading: 'Loading feature flags…',
  empty: 'No feature flags are configured for this workspace.',
  error: 'Unable to load feature flags.',
  premium: 'Premium',
  beta: 'Beta',
  upgradePlanTooltip: 'Upgrade plan to enable',
  dependencyRejectedTitle: 'Force-disable dependent modules?',
  dependencyRejectedBody:
    'This feature is required by dependent modules. Review the affected modules before force-disable.',
  forceDisable: 'Force-disable',
  cancel: 'Cancel',
  close: 'Close',
  saveChanges: 'Save changes',
  dryRunDialogTitle: 'Dry-run — feature flag activation',
  dryRunAffects: 'Activating this flag set affects {modules} modules across {sessions} active sessions.',
  dryRunFlagsOn: '{enabled} of {total}',
  dryRunApplyOnLoad: 'flags currently on. Changes apply on next page load for each user.',
  affectedModulesLabel: 'Affected modules',
};

// Explicit fallback provenance: project-shaped Settings feature rows from the MonoPilot module glossary.
// Runtime callers/tests can supply live Drizzle/API rows through Server Component props while SET-070 data loaders mature.
const DEFAULT_FEATURES: FeatureFlag[] = [
  {
    key: 'core-manufacturing',
    label: 'Core manufacturing',
    desc: 'Production execution, work orders, and operator workflows.',
    on: true,
  },
  {
    key: 'quality',
    label: 'Quality',
    desc: 'Specifications, holds, NCR, HACCP, and allergen gates.',
    on: true,
    beta: true,
  },
  {
    key: 'oee',
    label: 'OEE',
    desc: 'Availability, performance, quality, and read-only snapshots.',
    on: false,
    premium: true,
    beta: true,
  },
];

async function defaultToggleFeature(input: ToggleFeatureInput): Promise<ToggleFeatureResult> {
  return {
    ok: true,
    featureKey: input.featureKey,
    enabled: input.enabled,
    outboxEventType: 'settings.feature_toggled',
  };
}

function formatTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((value, [key, replacement]) => {
    return value.replaceAll(`{${key}}`, String(replacement));
  }, template);
}

const h = React.createElement;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'dry-run' };
function Button({ variant = 'default', className, ...props }: ButtonProps) {
  return h('button', {
    'data-slot': 'button',
    'data-variant': variant,
    className: ['btn', variant !== 'default' ? `btn--${variant}` : '', className].filter(Boolean).join(' '),
    ...props,
  });
}

type SwitchProps = {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  'aria-label': string;
};
function Switch({ checked, disabled, onCheckedChange, 'aria-label': ariaLabel }: SwitchProps) {
  const toggle = () => {
    if (!disabled) onCheckedChange(!checked);
  };
  return h(
    'button',
    {
      type: 'button',
      role: 'switch',
      'aria-label': ariaLabel,
      'aria-checked': checked,
      'aria-disabled': disabled || undefined,
      'data-slot': 'switch',
      'data-state': checked ? 'checked' : 'unchecked',
      'data-disabled': disabled || undefined,
      disabled,
      className: 'switch',
      onClick: toggle,
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          toggle();
        }
      },
    },
    h('span', { 'data-slot': 'switch-thumb', className: 'switch__thumb', 'aria-hidden': true }),
  );
}

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & { variant?: string; 'data-testid'?: string };
function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  return h('span', {
    'data-slot': 'badge',
    'data-variant': variant,
    'data-tone': variant,
    className: ['badge', `badge--${variant}`, className].filter(Boolean).join(' '),
    ...props,
  });
}

export default function SettingsFeaturesPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as FeaturesPageProps;

  return h(SettingsFeaturesScreen, {
    labels: { ...DEFAULT_LABELS },
    features: props.features ?? DEFAULT_FEATURES,
    state: props.state ?? 'ready',
    planName: props.planName ?? 'Premium plan',
    activeSessionCount: props.activeSessionCount ?? 28,
    toggleFeature: props.toggleFeature ?? defaultToggleFeature,
  });
}

function SettingsFeaturesScreen({
  labels,
  features,
  state,
  planName,
  activeSessionCount,
  toggleFeature,
}: {
  labels: FeaturesLabels;
  features: FeatureFlag[];
  state: PageState;
  planName: string;
  activeSessionCount: number;
  toggleFeature: (input: ToggleFeatureInput) => Promise<ToggleFeatureResult>;
}) {
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
    return h(
      'main',
      { 'data-testid': 'settings-features-screen', className: 'space-y-4 p-6', 'aria-busy': true },
      h(
        'section',
        {
          'data-testid': 'settings-features-loading-state',
          className: 'rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600',
        },
        labels.loading,
      ),
    );
  }

  if (state === 'error') {
    return h(
      'main',
      { 'data-testid': 'settings-features-screen', className: 'space-y-4 p-6' },
      h('div', { role: 'alert', className: 'rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900' }, labels.error),
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
    if (!result.ok && result.code === 'dependency_check_rejected') {
      setPendingDependency({ feature, nextEnabled, dependentModules: result.dependentModules });
      return;
    }

    if (result.ok) {
      setEnabledByKey((current) => ({ ...current, [feature.key]: result.enabled }));
      setPendingDependency(null);
    }
  };

  const forceDisable = () => {
    if (!pendingDependency) return;
    const { feature, nextEnabled } = pendingDependency;
    void requestToggle(feature, nextEnabled, true);
  };

  return h(
    'main',
    { 'data-testid': 'settings-features-screen', className: 'space-y-4 p-6' },
    h(
      'header',
      { 'data-region': 'page-head', className: 'flex items-start justify-between gap-4' },
      h('div', null, h('h1', { className: 'text-2xl font-semibold tracking-tight text-slate-950' }, labels.title), h('p', { className: 'mt-1 text-sm text-slate-600' }, labels.subtitle)),
      h(Button, { variant: 'dry-run', type: 'button', title: labels.dryRunTitle, onClick: () => setDryRunOpen(true) }, labels.dryRunActivation),
    ),
    h('div', { 'data-region': 'plan-notice', role: 'alert', className: 'rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950' }, planNotice),
    h(
      FeatureSection,
      { title: labels.modulesTitle, region: 'modules-section' },
      state === 'empty' || features.length === 0
        ? h('p', { className: 'rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600' }, labels.empty)
        : h(
            'div',
            { className: 'divide-y divide-slate-100' },
            features.map((feature) => {
              const checked = Boolean(enabledByKey[feature.key]);
              const disabled = Boolean(feature.premium && freePlan);
              return h(
                'div',
                { key: feature.key, 'data-testid': 'settings-feature-row', className: 'grid grid-cols-[1fr_auto] items-center gap-4 py-3' },
                h(
                  'div',
                  null,
                  h(
                    'div',
                    { className: 'flex items-center gap-2' },
                    h('div', { 'data-testid': 'settings-feature-label', className: 'text-sm font-medium text-slate-950' }, feature.label),
                    feature.premium
                      ? h(Badge, { 'data-testid': 'settings-feature-badge', variant: 'info', className: 'bg-violet-50 text-violet-800' }, labels.premium)
                      : null,
                    feature.beta
                      ? h(Badge, { 'data-testid': 'settings-feature-badge', variant: 'warning', className: 'bg-amber-50 text-amber-800' }, labels.beta)
                      : null,
                  ),
                  h('div', { 'data-testid': 'settings-feature-description', className: 'mt-1 text-xs text-slate-500' }, feature.desc),
                  disabled ? h('div', { className: 'mt-1 text-xs text-violet-700' }, labels.upgradePlanTooltip) : null,
                ),
                h(
                  'div',
                  { className: 'flex items-center' },
                  h(Switch, {
                    'aria-label': feature.label,
                    checked,
                    disabled,
                    onCheckedChange: (next: boolean) => void requestToggle(feature, next, false),
                  }),
                ),
              );
            }),
          ),
    ),
    h(
      FeatureSection,
      { title: labels.earlyAccessTitle, region: 'early-access-section' },
      h(
        'p',
        { className: 'text-sm text-slate-500' },
        labels.earlyAccessCopy,
        ' ',
        h('a', { href: '#early-access-preview-program', className: 'font-medium text-blue-600 underline-offset-2 hover:underline' }, labels.joinPreviewProgram),
      ),
    ),
    dryRunOpen
      ? h(
          'div',
          { role: 'presentation', className: 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40' },
          h(
            'div',
            {
              role: 'dialog',
              'aria-modal': 'true',
              'aria-labelledby': 'settings-features-dry-run-title',
              className: 'w-[520px] rounded-lg bg-white shadow-2xl',
            },
            h('div', { className: 'border-b border-slate-200 px-5 py-4' }, h('h2', { id: 'settings-features-dry-run-title', className: 'text-base font-semibold text-slate-950' }, labels.dryRunDialogTitle)),
            h(
              'div',
              { className: 'space-y-3 px-5 py-4 text-sm text-slate-700' },
              h('p', null, formatTemplate(labels.dryRunAffects, { modules: affectedCount, sessions: activeSessionCount })),
              h(
                'div',
                { className: 'rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950' },
                h('strong', null, formatTemplate(labels.dryRunFlagsOn, { enabled: enabledCount, total: features.length })),
                ' ',
                labels.dryRunApplyOnLoad,
              ),
              h('div', { className: 'text-xs font-semibold uppercase tracking-wide text-slate-500' }, labels.affectedModulesLabel),
              h(
                'div',
                { className: 'flex flex-wrap gap-2' },
                enabledFeatures.map((feature) => h(Badge, { key: feature.key, 'data-testid': 'settings-dry-run-module-badge', variant: 'info' }, feature.label)),
              ),
            ),
            h(
              'div',
              { className: 'flex justify-end gap-2 rounded-b-lg border-t border-slate-200 bg-slate-50 p-4' },
              h(Button, { type: 'button', className: 'btn-secondary', onClick: () => setDryRunOpen(false) }, labels.close),
              h(Button, { type: 'button', className: 'btn-primary', onClick: () => setDryRunOpen(false) }, labels.saveChanges),
            ),
          ),
        )
      : null,
    pendingDependency
      ? h(
          'div',
          { role: 'presentation', className: 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40' },
          h(
            'div',
            {
              role: 'dialog',
              'aria-modal': 'true',
              'aria-labelledby': 'settings-features-dependency-title',
              className: 'w-[440px] rounded-lg bg-white shadow-2xl',
            },
            h('div', { className: 'border-b border-slate-200 px-5 py-4' }, h('h2', { id: 'settings-features-dependency-title', className: 'text-base font-semibold text-slate-950' }, labels.dependencyRejectedTitle)),
            h(
              'div',
              { className: 'space-y-3 px-5 py-4 text-sm text-slate-700' },
              h('p', null, labels.dependencyRejectedBody),
              h('div', { className: 'flex flex-wrap gap-2' }, pendingDependency.dependentModules.map((module) => h(Badge, { key: module, variant: 'warning' }, module))),
            ),
            h(
              'div',
              { className: 'flex justify-end gap-2 rounded-b-lg border-t border-slate-200 bg-slate-50 p-4' },
              h(Button, { type: 'button', className: 'btn-secondary', 'aria-label': 'Dismiss dependency dialog', onClick: () => setPendingDependency(null) }, 'Dismiss'),
              h(Button, { type: 'button', className: 'btn-primary', onClick: forceDisable }, labels.forceDisable),
            ),
          ),
        )
      : null,
  );
}

function FeatureSection({ title, region, children }: { title: string; region: string; children?: React.ReactNode }) {
  return h(
    'section',
    {
      'data-testid': 'settings-feature-section',
      'data-region': region,
      className: 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm',
    },
    h('h2', { className: 'mb-3 text-lg font-semibold text-slate-950' }, title),
    children,
  );
}
