import { getTranslations } from 'next-intl/server';

import { loadOnboardingContext } from '../../../../../../actions/onboarding/load';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
};

const TOTAL_STEPS = 5; // org_profile → first_warehouse → first_location → first_product → first_wo

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
    completedCount = ctx.onboardingState.completedSteps.filter((step) => step !== 'completion').length;
    statusLabel = completedAt
      ? safeT('statusComplete', 'Onboarding complete')
      : safeT('statusInProgress', 'Onboarding in progress');
  }

  const wizardHref = `/${locale}/onboarding/profile`;

  return (
    <main
      className="min-h-full bg-slate-50 px-6 py-8 text-slate-900"
      data-testid="settings-onboarding-panel"
    >
      <section className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
            {safeT('eyebrow', 'Guided setup')}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {safeT('title', 'Onboarding wizard')}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            {safeT('panelDescription', 'Launch or resume the guided setup wizard. Progress below reflects your organization’s real onboarding state.')}
          </p>

          <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4" data-testid="onboarding-status">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {safeT('statusLabel', 'Status')}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{statusLabel}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4" data-testid="onboarding-progress">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {safeT('progressLabel', 'Steps completed')}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {completedCount === null ? '—' : `${completedCount} / ${TOTAL_STEPS}`}
              </dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {safeT('startedLabel', 'Started')}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{formatDate(startedAt)}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {safeT('completedLabel', 'Completed')}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{formatDate(completedAt)}</dd>
            </div>
          </dl>

          <a
            className="mt-6 inline-flex rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            href={wizardHref}
            data-testid="onboarding-launch"
          >
            {completedAt
              ? safeT('reviewCta', 'Review onboarding')
              : safeT('launchCta', 'Open onboarding wizard')}
          </a>
        </div>
      </section>
    </main>
  );
}
