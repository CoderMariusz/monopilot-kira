'use client';

import { useEffect, useMemo, useState } from 'react';

import { LineStatus, type LineLiveStatus } from './andon-types';

export type AndonLabels = {
  title: string;
  wo: string;
  product: string;
  good: string;
  scrap: string;
  oee: string;
  lastActivity: string;
  tokenAuthTodo: string;
  status: Record<LineStatus, string>;
};

const STATUS_STYLES: Record<LineStatus, { shell: string; badge: string; text: string }> = {
  [LineStatus.Running]: {
    shell: 'bg-emerald-950 text-emerald-50',
    badge: 'border-emerald-300 bg-emerald-400 text-emerald-950',
    text: 'text-emerald-100',
  },
  [LineStatus.Paused]: {
    shell: 'bg-amber-950 text-amber-50',
    badge: 'border-amber-200 bg-amber-300 text-amber-950',
    text: 'text-amber-100',
  },
  [LineStatus.Idle]: {
    shell: 'bg-amber-950 text-amber-50',
    badge: 'border-amber-200 bg-amber-300 text-amber-950',
    text: 'text-amber-100',
  },
  [LineStatus.Down]: {
    shell: 'bg-red-950 text-red-50',
    badge: 'border-red-200 bg-red-400 text-red-950',
    text: 'text-red-100',
  },
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);
}

function formatOee(value: number | null): string {
  return value == null ? '-' : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)}%`;
}

export function AndonLiveCard({
  initialStatus,
  labels,
  locale,
  pollUrl,
}: {
  initialStatus: LineLiveStatus;
  labels: AndonLabels;
  locale: string;
  pollUrl: string;
}) {
  const [line, setLine] = useState(initialStatus);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setInterval(() => {
      void fetch(pollUrl, { cache: 'no-store' })
        .then(async (res) => {
          if (!res.ok) throw new Error('andon_refresh_failed');
          return (await res.json()) as { data: LineLiveStatus };
        })
        .then((payload) => {
          if (!cancelled) setLine(payload.data);
        })
        .catch(() => {
          // Keep the last known kiosk state on transient refresh failures.
        });
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pollUrl]);

  const style = STATUS_STYLES[line.status];
  const lastActivity = useMemo(() => {
    if (!line.lastActivityAt) return '-';
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(line.lastActivityAt));
  }, [line.lastActivityAt, locale]);

  return (
    <section data-testid="andon-kiosk" className={`min-h-screen ${style.shell}`}>
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-between gap-8 px-6 py-8 sm:px-10">
        <header className="flex flex-col gap-4 border-b border-white/20 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide opacity-80">{labels.title}</p>
            <h1 className="mt-2 font-mono text-5xl font-black tracking-normal sm:text-7xl">
              {line.lineCode}
            </h1>
            <p className={`mt-2 text-2xl font-semibold ${style.text}`}>{line.lineName}</p>
          </div>
          <span
            data-testid="andon-status-badge"
            className={`inline-flex w-fit rounded-lg border-4 px-5 py-3 text-3xl font-black uppercase tracking-normal ${style.badge}`}
          >
            {labels.status[line.status]}
          </span>
        </header>

        <div className="grid flex-1 gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="flex flex-col justify-center rounded-lg border border-white/20 bg-white/10 p-6">
            <p className="text-sm font-semibold uppercase tracking-wide opacity-75">{labels.wo}</p>
            <div className="mt-3 font-mono text-5xl font-black tracking-normal sm:text-6xl">
              {line.currentWONumber ?? '-'}
            </div>
            <p className="mt-8 text-sm font-semibold uppercase tracking-wide opacity-75">{labels.product}</p>
            <div className="mt-3 text-3xl font-bold sm:text-4xl">{line.currentProductName ?? '-'}</div>
          </div>

          <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-1">
            <Metric label={labels.good} value={formatNumber(line.goodKg)} />
            <Metric label={labels.scrap} value={formatNumber(line.scrapKg)} />
            <Metric label={labels.oee} value={formatOee(line.oeePercent)} />
          </div>
        </div>

        <footer className="flex flex-col gap-2 border-t border-white/20 pt-5 text-sm font-semibold opacity-80 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {labels.lastActivity}: <span className="font-mono">{lastActivity}</span>
          </div>
          {/* TODO: kiosk token auth */}
          <div>{labels.tokenAuthTodo}</div>
        </footer>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/20 bg-white/10 p-5">
      <p className="text-sm font-semibold uppercase tracking-wide opacity-75">{label}</p>
      <p className="mt-3 font-mono text-4xl font-black tabular-nums tracking-normal">{value}</p>
    </div>
  );
}
