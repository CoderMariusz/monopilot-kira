import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { AndonLiveCard, type AndonLabels } from '../andon-live-card';
import { CURRENT_ORG_ID, getLineLiveStatus } from '../andon-data';
import { canViewAndonKiosk } from '../andon-permissions';
import { LineStatus } from '../andon-types';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; lineId: string }>;
};

function buildLabels(t: (key: string) => string): AndonLabels {
  return {
    title: t('title'),
    wo: t('wo'),
    product: t('product'),
    good: t('good'),
    scrap: t('scrap'),
    oee: t('oee'),
    lastActivity: t('lastActivity'),
    tokenAuthTodo: t('tokenAuthTodo'),
    status: {
      [LineStatus.Running]: t('status.running'),
      [LineStatus.Paused]: t('status.paused'),
      [LineStatus.Idle]: t('status.idle'),
      [LineStatus.Down]: t('status.down'),
    },
  };
}

export default async function OeeAndonLinePage({ params }: PageProps) {
  const { locale, lineId } = await params;
  const t = await getTranslations('oee.andon');
  const allowed = await canViewAndonKiosk();

  if (!allowed) {
    return (
      <main
        data-testid="module-landing-oee-andon-line"
        data-screen="oee-andon-line"
        className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
      >
        <div
          role="note"
          data-testid="andon-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {t('denied')}
        </div>
      </main>
    );
  }

  try {
    const status = await getLineLiveStatus(lineId, CURRENT_ORG_ID);
    return (
      <AndonLiveCard
        initialStatus={status}
        labels={buildLabels(t)}
        locale={locale}
        pollUrl={`/${locale}/oee/andon/${lineId}/status`}
      />
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'andon_line_not_found') {
      notFound();
    }
    throw error;
  }
}
