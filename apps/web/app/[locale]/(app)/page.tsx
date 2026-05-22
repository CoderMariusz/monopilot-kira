import { createServerSupabaseClient } from '../../../lib/auth/supabase-server';

type LocaleHomeProps = {
  params: Promise<{ locale: string }>;
};

async function getSignedInEmail(): Promise<string | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

export default async function LocaleHome({ params }: LocaleHomeProps) {
  const { locale } = await params;
  const email = await getSignedInEmail();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
      <section className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
          Jesteś zalogowany
        </div>
        <h1 className="mb-3 text-3xl font-bold tracking-tight">MonoPilot Kira</h1>
        <p className="text-base text-slate-600">
          Redirect po logowaniu działa — jesteś na stronie aplikacji <code>/{locale}</code>, a nie na ekranie logowania.
        </p>
        {email ? (
          <p className="mt-4 text-sm text-slate-500">
            Aktywna sesja Supabase: <span className="font-medium text-slate-700">{email}</span>
          </p>
        ) : (
          <p className="mt-4 text-sm text-amber-700">
            Nie udało się odczytać emaila sesji w Server Component, ale ta strona jest za bramką proxy/auth.
          </p>
        )}
      </section>
    </main>
  );
}
