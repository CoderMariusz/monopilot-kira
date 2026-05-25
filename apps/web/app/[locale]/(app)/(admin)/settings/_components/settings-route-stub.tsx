import { getTranslations } from 'next-intl/server';

type SettingsRouteStubProps = {
  stubKey: string;
};

export async function SettingsRouteStub({ stubKey }: SettingsRouteStubProps) {
  const t = await getTranslations(`settings.routeStubs.${stubKey}`);
  const common = await getTranslations('settings.routeStubs.common');

  return (
    <main className="min-h-full bg-slate-50 px-6 py-8 text-slate-900" data-testid={`settings-route-stub-${stubKey}`}>
      <section className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">{common('eyebrow')}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{t('title')}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{t('description')}</p>
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            {common('body')}
          </div>
          <a
            className="mt-6 inline-flex rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            href="/settings"
          >
            {common('backToSettings')}
          </a>
        </div>
      </section>
    </main>
  );
}
