import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { CURRENT_ORG_ID, getAllLinesLiveStatus } from './andon-data';
import { canViewAndonKiosk } from './andon-permissions';
import { LineStatus, type LineLiveStatus } from './andon-types';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
};

const STATUS_STYLES: Record<LineStatus, string> = {
  [LineStatus.Running]: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  [LineStatus.Paused]: 'border-amber-200 bg-amber-50 text-amber-800',
  [LineStatus.Idle]: 'border-amber-200 bg-amber-50 text-amber-800',
  [LineStatus.Down]: 'border-red-200 bg-red-50 text-red-800',
};

function StatusBadge({
  status,
  label,
}: {
  status: LineStatus;
  label: string;
}) {
  return (
    <span
      data-testid="andon-status-badge"
      className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${STATUS_STYLES[status]}`}
    >
      {label}
    </span>
  );
}

function LineCard({
  line,
  locale,
  statusLabel,
  labels,
}: {
  line: LineLiveStatus;
  locale: string;
  statusLabel: string;
  labels: { wo: string; good: string; scrap: string; oee: string; lastActivity: string };
}) {
  return (
    <Link
      href={`/${locale}/oee/andon/${line.id}`}
      className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-mono text-2xl font-black tracking-normal text-slate-950">{line.lineCode}</h2>
          <p className="mt-1 text-sm font-medium text-slate-600">{line.lineName}</p>
        </div>
        <StatusBadge status={line.status} label={statusLabel} />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <Metric label={labels.wo} value={line.currentWONumber ?? '-'} />
        <Metric label={labels.oee} value={line.oeePercent == null ? '-' : `${line.oeePercent.toFixed(1)}%`} />
        <Metric label={labels.good} value={line.goodCount.toLocaleString()} />
        <Metric label={labels.scrap} value={line.scrapCount.toLocaleString()} />
      </dl>

      <p className="mt-4 text-xs font-medium text-slate-500">
        {labels.lastActivity}: {line.lastActivityAt ? new Date(line.lastActivityAt).toLocaleString() : '-'}
      </p>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 font-mono text-base font-bold tabular-nums text-slate-950">{value}</dd>
    </div>
  );
}

export default async function OeeAndonRoutePage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('oee.andon');
  const allowed = await canViewAndonKiosk();

  if (!allowed) {
    return (
      <main
        data-testid="module-landing-oee-andon"
        data-screen="oee-andon"
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

  const lines = await getAllLinesLiveStatus(CURRENT_ORG_ID);
  const statusLabels: Record<LineStatus, string> = {
    [LineStatus.Running]: t('status.running'),
    [LineStatus.Paused]: t('status.paused'),
    [LineStatus.Idle]: t('status.idle'),
    [LineStatus.Down]: t('status.down'),
  };
  const labels = {
    wo: t('wo'),
    good: t('good'),
    scrap: t('scrap'),
    oee: t('oee'),
    lastActivity: t('lastActivity'),
  };

  return (
    <main
      data-testid="module-landing-oee-andon"
      data-screen="oee-andon"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <header className="flex flex-col gap-2 border-b border-slate-200 pb-5">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">{t('title')}</h1>
        {/* TODO: kiosk token auth */}
        <p className="text-sm text-slate-500">{t('tokenAuthTodo')}</p>
      </header>

      {lines.length === 0 ? (
        <div
          data-testid="andon-empty"
          className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-sm font-medium text-slate-600"
        >
          {t('noLines')}
        </div>
      ) : (
        <div data-testid="andon-line-grid" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lines.map((line) => (
            <LineCard
              key={line.id}
              line={line}
              locale={locale}
              labels={labels}
              statusLabel={statusLabels[line.status]}
            />
          ))}
        </div>
      )}
    </main>
  );
}
