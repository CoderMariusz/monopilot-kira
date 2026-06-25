import { redirect } from 'next/navigation';

type LocaleHomeProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Post-login landing.
 *
 * The (app) route group sits behind the proxy/auth gate, so any request that
 * reaches here is already authenticated. Rather than show a dead placeholder,
 * send every role straight to the role-aware dashboard
 * (`(app)/(modules)/dashboard/page.tsx`). `redirect()` throws the framework
 * NEXT_REDIRECT control-flow signal — it does not return — so no body renders.
 *
 * Auth semantics are unchanged: this Server Component performs no session
 * check of its own (it never did the gating), it only forwards the landing.
 */
export default async function LocaleHome({ params }: LocaleHomeProps) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard`);
}
