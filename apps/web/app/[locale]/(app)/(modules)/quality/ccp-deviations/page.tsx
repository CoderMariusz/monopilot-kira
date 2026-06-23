/**
 * Wave E3 — CCP Deviations register route (/quality/ccp-deviations).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   haccp-screens.jsx:229-299 (QaCcpDeviations) — page header + breadcrumb
 *   (Quality · CCP Monitoring · Deviations), status filter (Open/Resolved/All),
 *   a dense deviations table (CCP code, reading, status, linked cross-ref,
 *   recorded at, resolve action). The resolve MODAL conforms to the deviation-log
 *   modal (modals.jsx:554-594) — corrective action + e-sign PIN. Per-region
 *   anchors + documented deviations live in the two client islands.
 *
 * Data: the reviewed CCP-deviation Server Actions (listCcpDeviations +
 * resolveCcpDeviation), imported from quality/_actions/ccp-deviation-actions.ts
 * — never authored here — and run inside withOrgContext (RLS-scoped). RBAC is
 * enforced server-side in the actions; this page never trusts a client flag: a
 * `forbidden` list result renders the permission-denied panel, and the per-row
 * [Resolve] button is gated on a SERVER-resolved deviation-override probe
 * (canResolveDeviation, rule 0.13c) that resolveCcpDeviation re-checks.
 *
 * No `*_id` ever reaches the UI — only the CCP code/name, the hold NUMBER (the
 * hold id is used solely to build the /quality/holds/{id} deep-link href), the
 * reading + uom and a status badge (plan rule 0.11).
 *
 * UI states (all four — plan rule 0.11): loading (Suspense skeleton, no CLS),
 * empty (CTA → CCP monitoring), error (failed live read → banner, never a 500),
 * permission-denied (forbidden → panel). Optimistic: the resolve modal uses
 * useTransition + router.refresh() and surfaces e-sign failures verbatim.
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

// Owned by the reviewed CCP-deviation backend (quality/_actions/ccp-deviation-actions.ts).
// Imported, never authored here.
import { listCcpDeviations, resolveCcpDeviation } from '../_actions/ccp-deviation-actions';
// Read-only RBAC probe (additive read confined to ccp-deviations/**) — gates the
// per-row [Resolve] button on quality.ccp.deviation_override (rule 0.13c).
import { canResolveDeviation } from './_actions/can-resolve-deviation';
import { DeviationsListClient } from './_components/deviations-list.client';
import type { DeviationRow, ResolveDeviationAction } from './_components/ccp-deviations-contracts';
import {
  buildDeviationListLabels,
  buildDeviationResolveLabels,
  type Translator,
} from './_components/labels';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/quality/haccp-screens.jsx:229-299';

function ListSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div
      data-testid="deviations-list-loading"
      data-state="loading"
      aria-busy="true"
      aria-label={loadingLabel}
      className="flex flex-col gap-4"
    >
      <div className="h-12 w-full animate-pulse rounded-xl bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function ListContent({ locale, t }: { locale: string; t: Translator }) {
  const labels = buildDeviationListLabels(t);
  const resolveLabels = buildDeviationResolveLabels(t);

  // status union 'all' → the client island splits Open/Resolved/All client-side.
  // (the reviewed list action accepts open | resolved | undefined; undefined = all.)
  const result = await listCcpDeviations();

  if (!result.ok) {
    if (result.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="deviations-list-denied"
          data-state="permission-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          <p className="font-semibold">{t('denied.title')}</p>
          <p className="mt-1">{t('denied.body')}</p>
        </div>
      );
    }
    return (
      <div
        role="alert"
        data-testid="deviations-list-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        <p className="font-semibold">{t('error.title')}</p>
        <p className="mt-1">{t('error.body')}</p>
      </div>
    );
  }

  // EMPTY (whole register) → CTA to CCP monitoring (where deviations originate).
  if (result.data.length === 0) {
    return (
      <div
        data-testid="deviations-list-empty"
        data-state="empty"
        className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center"
      >
        <p className="text-base font-semibold text-slate-700">{t('empty.title')}</p>
        <p className="max-w-md text-sm text-slate-500">{t('empty.body')}</p>
        <Link
          href={`/${locale}/quality/ccp-monitoring`}
          data-testid="deviations-list-empty-cta"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          {t('empty.cta')}
        </Link>
      </div>
    );
  }

  // canResolve resolved server-side (deviation-override probe) to gate the
  // per-row [Resolve] button (rule 0.13c) — never client-trusted;
  // resolveCcpDeviation re-checks the gate.
  const canResolve = await canResolveDeviation();

  const rows: DeviationRow[] = result.data.map((d) => ({
    id: d.id,
    status: d.status,
    ccpCode: d.ccpCode,
    ccpName: d.ccpName,
    measuredValue: d.measuredValue,
    uom: d.uom,
    actionTaken: d.actionTaken,
    disposition: d.disposition,
    hold: d.hold
      ? {
          id: d.hold.id,
          holdNumber: d.hold.holdNumber,
          referenceDisplay: d.hold.referenceDisplay,
          status: d.hold.status,
        }
      : null,
    openedAt: d.openedAt,
  }));

  return (
    <DeviationsListClient
      rows={rows}
      labels={labels}
      resolveLabels={resolveLabels}
      locale={locale}
      canResolve={canResolve}
      resolveAction={resolveCcpDeviation as ResolveDeviationAction}
    />
  );
}

export default async function CcpDeviationsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('quality.ccpDeviations');

  return (
    <main
      data-screen="quality-ccp-deviations"
      data-prototype-label="ccp_deviations"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.quality'), href: `/${locale}/quality` },
          { label: t('breadcrumb.ccpDeviations') },
        ]}
      />
      <Suspense fallback={<ListSkeleton loadingLabel={t('loading')} />}>
        <ListContent locale={locale} t={t as unknown as Translator} />
      </Suspense>
    </main>
  );
}
