import { getTranslations } from 'next-intl/server';

export default async function OnboardingInProgressPage() {
  const t = await getTranslations('onboarding');
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t('in_progress_eyebrow')}</p>
      <h1 className="text-3xl font-semibold text-slate-950">{t('in_progress_title')}</h1>
      <p className="text-base text-slate-600">{t('in_progress_body')}</p>
    </main>
  );
}
