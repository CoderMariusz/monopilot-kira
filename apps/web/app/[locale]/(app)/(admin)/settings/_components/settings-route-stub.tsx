import { getLocale, getTranslations } from 'next-intl/server';

type SettingsRouteStubProps = {
  stubKey: string;
};

export async function SettingsRouteStub({ stubKey }: SettingsRouteStubProps) {
  const t = await getTranslations(`settings.routeStubs.${stubKey}`);
  const common = await getTranslations('settings.routeStubs.common');
  const locale = await getLocale();

  return (
    <main className="mx-auto grid max-w-4xl gap-3 p-6" data-testid={`settings-route-stub-${stubKey}`}>
      <header className="grid gap-1" data-region="page-head">
        <h1 className="page-title">{t('title')}</h1>
        <p className="muted text-sm">{t('description')}</p>
      </header>

      <div className="alert alert-blue" role="note">
        {common('eyebrow')}
      </div>

      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">⧗</div>
          <div className="empty-state-body">{common('body')}</div>
          <div className="empty-state-action">
            <a className="btn btn-secondary" href={`/${locale}/settings`}>
              {common('backToSettings')}
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
