import { getTranslations } from 'next-intl/server';
import { Card, CardContent } from '@monopilot/ui/Card';
import { MfaFormClient, type MfaLabels } from '../login-card.client';

// Prototype reference copy rendered through auth.login.mfa i18n: Two-factor authentication; Verify; Use recovery code.

type MfaPageProps = {
  params: Promise<{ locale: string }>;
};

function BrandLockup() {
  return (
    <div className="mb-7 flex items-center justify-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#1976d2_0%,#1e40af_100%)] text-base font-bold tracking-[-0.02em] text-white">
        M
      </div>
      <div className="text-lg font-bold tracking-[-0.01em] text-slate-950">
        Mono<span className="font-medium text-slate-500">Pilot</span>
      </div>
    </div>
  );
}

async function buildLabels(locale: string): Promise<MfaLabels> {
  const t = await getTranslations({ locale, namespace: 'auth.login.mfa' });
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    codeLabel: t('codeLabel'),
    submit: t('submit'),
    submitting: t('submitting'),
    recoveryCode: t('recoveryCode'),
  };
}

export default async function MfaPage({ params }: MfaPageProps) {
  const { locale } = await params;
  const labels = await buildLabels(locale);

  return (
    <main data-region="main" className="w-full max-w-[480px]">
      <section aria-label={labels.title} style={{ borderRadius: 12 }}>
        <Card className="w-full rounded-[12px] border border-[#d8e0ea] bg-white px-[36px] pb-7 pt-[36px] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_36px_rgba(15,23,42,0.08)]">
          <CardContent className="p-0">
            <BrandLockup />
            <MfaFormClient locale={locale} labels={labels} />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
