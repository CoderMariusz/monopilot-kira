import { getTranslations } from 'next-intl/server';

import { loadOnboardingContext } from '../../../../../../actions/onboarding/load';
import {
  deriveOnboardingDisplay,
  ONBOARDING_TOTAL_STEPS,
} from '../../../../../../lib/onboarding/derive-onboarding-display';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
};

const TOTAL_STEPS = ONBOARDING_TOTAL_STEPS;

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toISOString().slice(0, 10);
}

export default async function OnboardingSettingsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'settings.routeStubs.onboarding' });

  const safeT = (key: string, fallback: string, values?: Record<string, string | number>) => {
    try {
      return t(key, values) || fallback;
    } catch {
      return fallback;
    }
  };

  const ctx = await loadOnboardingContext();

  // Derive real completion state — never fabricate.
  let statusLabel = safeT('statusUnknown', 'Onboarding status unavailable');
  let completedCount: number | null = null;
  let completedAt: string | null = null;
  let startedAt: string | null = null;

  if (ctx.ok) {
    completedAt = ctx.organization.onboardingCompletedAt;
    startedAt = ctx.organization.onboardingStartedAt;
    const display = deriveOnboardingDisplay({
      onboardingCompletedAt: completedAt,
      completedStepCount: ctx.onboardingState.completedSteps.length,
      totalSteps: TOTAL_STEPS,
    });
    completedCount = display.completedCount;
    statusLabel = display.isComplete
      ? safeT('statusComplete', 'Onboarding complete')
      : safeT('statusInProgress', 'Onboarding in progress');
  }

  const wizardHref = `/${locale}/onboarding/profile`;

  const complete = Boolean(completedAt);

  return (
    <main className="mx-auto grid max-w-4xl gap-3 p-6" data-testid="settings-onboarding-panel">
      <header className="grid gap-1" data-region="page-head">
        <h1 className="page-title">{safeT('title', 'Onboarding wizard')}</h1>
        <p className="muted text-sm">
          {safeT(
            'panelDescription',
            'Launch or resume the guided setup wizard. Progress below reflects your organization’s real onboarding state.',
          )}
        </p>
      </header>

      <div className="alert alert-blue" role="note">
        {safeT('eyebrow', 'Guided setup')}
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}
      >
        <div className={`kpi ${complete ? 'green' : 'amber'}`} data-testid="onboarding-status">
          <div className="kpi-label">{safeT('statusLabel', 'Status')}</div>
          <div className="kpi-value" style={{ fontSize: 16 }}>{statusLabel}</div>
        </div>
        <div className="kpi" data-testid="onboarding-progress">
          <div className="kpi-label">{safeT('progressLabel', 'Steps completed')}</div>
          <div className="kpi-value">
            {completedCount === null ? '—' : `${completedCount} / ${TOTAL_STEPS}`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{safeT('startedLabel', 'Started')}</div>
          <div className="kpi-value mono" style={{ fontSize: 15 }}>{formatDate(startedAt)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{safeT('completedLabel', 'Completed')}</div>
          <div className="kpi-value mono" style={{ fontSize: 15 }}>{formatDate(completedAt)}</div>
        </div>
      </div>

      <div className="card">
        <a className="btn btn-primary" href={wizardHref} data-testid="onboarding-launch">
          {complete
            ? safeT('reviewCta', 'Review onboarding')
            : safeT('launchCta', 'Open onboarding wizard')}
        </a>
      </div>
    </main>
  );
}
