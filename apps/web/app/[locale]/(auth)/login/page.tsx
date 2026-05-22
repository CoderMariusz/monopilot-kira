import { getTranslations } from 'next-intl/server';
import { Card, CardContent } from '@monopilot/ui/Card';
import type { ButtonProps } from '@monopilot/ui/Button';
import type { InputProps } from '@monopilot/ui/Input';
import { LoginFormClient, type LoginLabels } from './login-card.client';

// Prototype reference copy rendered through auth.login i18n: Welcome back; Sign in to your MES workspace; Work email; you@company.com; Remember me for 30 days; Sign in; SSO; Contact your admin; Privacy; Terms; Status.

export type LoginPrimitiveContract = {
  disabledSubmit: ButtonProps['disabled'];
  emailType: Extract<InputProps['type'], 'email'>;
  fieldPrimitive: '@monopilot/ui/Field';
  passwordFieldName: 'password';
};

type LoginPageProps = {
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

async function buildLabels(locale: string): Promise<LoginLabels> {
  const t = await getTranslations({ locale, namespace: 'auth.login' });
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    emailLabel: t('emailLabel'),
    passwordLabel: t('passwordLabel'),
    emailPlaceholder: t('emailPlaceholder'),
    passwordPlaceholder: t('passwordPlaceholder'),
    remember: t('remember'),
    forgotPassword: t('forgotPassword'),
    submit: t('submit'),
    submitting: t('submitting'),
    divider: t('divider'),
    ssoComingSoon: t('ssoComingSoon'),
    noAccount: t('noAccount'),
    contactAdmin: t('contactAdmin'),
    privacy: t('privacy'),
    terms: t('terms'),
    status: t('status'),
  };
}

export default async function LoginPage({ params }: LoginPageProps) {
  const { locale } = await params;
  const labels = await buildLabels(locale);

  return (
    <>
      <main data-region="main" className="w-full max-w-[480px]">
        <section aria-label={labels.title} style={{ borderRadius: 12 }}>
          <Card className="w-full rounded-[12px] border border-[#d8e0ea] bg-white px-[36px] pb-7 pt-[36px] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_36px_rgba(15,23,42,0.08)]">
            <CardContent className="p-0">
              <BrandLockup />
              <LoginFormClient locale={locale} labels={labels} />
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="px-5 py-5 text-center text-[11px] text-slate-500">
        © 2026 MonoPilot MES
        <span className="mx-2 text-slate-300">·</span>
        <a href="#privacy" className="text-slate-600 hover:underline">
          {labels.privacy}
        </a>
        <span className="mx-2 text-slate-300">·</span>
        <a href="#terms" className="text-slate-600 hover:underline">
          {labels.terms}
        </a>
        <span className="mx-2 text-slate-300">·</span>
        <a href="#status" className="text-slate-600 hover:underline">
          {labels.status}
        </a>
        <span className="mx-2 text-slate-300">·</span>
        <span>v3.1.0</span>
      </footer>
    </>
  );
}
