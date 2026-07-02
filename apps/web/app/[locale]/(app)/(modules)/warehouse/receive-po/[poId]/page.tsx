import { Suspense } from 'react';
import Link from 'next/link';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listLocations } from '../../_actions/location-read-actions';
import { getPoForReceive, receivePoLineDesktop } from '../../_actions/receive-po-line';
import type { DesktopReceiveInput } from '../../_actions/receive-po-line.types';
import { getWhReceiveTranslator } from '../wh-receive-labels';
import { PoReceiveClient, type PoReceiveLabels, type ReceiveLocationOption } from './_components/po-receive.client';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; poId: string }> };

async function receivePoLineAction(input: DesktopReceiveInput) {
  'use server';
  return receivePoLineDesktop(input);
}

function buildLabels(t: ReturnType<typeof getWhReceiveTranslator>): PoReceiveLabels {
  return {
    linesTitle: t('receivePo.linesTitle'),
    emptyLines: t('receivePo.emptyLines'),
    col: {
      line: t('receivePo.col.line'),
      item: t('receivePo.col.item'),
      ordered: t('receivePo.col.ordered'),
      received: t('receivePo.col.received'),
      outstanding: t('receivePo.col.outstanding'),
      status: t('receivePo.col.status'),
      action: t('receivePo.col.action'),
    },
    status: {
      open: t('receivePo.status.open'),
      partial: t('receivePo.status.partial'),
      full: t('receivePo.status.full'),
      over: t('receivePo.status.over'),
      short: t('receivePo.status.short'),
    },
    form: {
      qty: t('receivePo.form.qty'),
      qtyHelp: t('receivePo.form.qtyHelp'),
      batch: t('receivePo.form.batch'),
      batchPlaceholder: t('receivePo.form.batchPlaceholder'),
      bestBefore: t('receivePo.form.bestBefore'),
      location: t('receivePo.form.location'),
      locationPlaceholder: t('receivePo.form.locationPlaceholder'),
      receive: t('receivePo.form.receive'),
      receiving: t('receivePo.form.receiving'),
      overConfirm: t('receivePo.form.overConfirm'),
      success: t('receivePo.form.success'),
      overNote: t('receivePo.form.overNote'),
      qcNote: t('receivePo.form.qcNote'),
    },
    errors: {
      qtyRequired: t('receivePo.errors.qtyRequired'),
      forbidden: t('receivePo.errors.forbidden'),
      not_found: t('receivePo.errors.not_found'),
      invalid_qty: t('receivePo.errors.invalid_qty'),
      over_receive_cap: t('receivePo.errors.over_receive_cap'),
      over_receive_confirm_required: t('receivePo.errors.over_receive_confirm_required'),
      no_warehouse: t('receivePo.errors.no_warehouse'),
      invalid_location: t('receivePo.errors.invalid_location'),
      error: t('receivePo.errors.error'),
    },
  };
}

function ContentSkeleton() {
  return <div data-testid="po-receive-loading" className="h-64 animate-pulse rounded-xl bg-slate-100" aria-busy="true" />;
}

async function ReceiveContent({ locale, poId }: { locale: string; poId: string }) {
  const t = getWhReceiveTranslator(locale);
  const result = await getPoForReceive(poId);

  const backLink = (
    <Link href={`/${locale}/warehouse/inbound`} data-testid="po-receive-back" className="text-sm text-sky-700 hover:underline">
      ← {t('receivePo.back')}
    </Link>
  );

  if (!result.ok) {
    const message =
      result.error === 'forbidden'
        ? t('receivePo.denied')
        : result.error === 'invalid_state'
          ? t('receivePo.invalidState')
          : result.error === 'not_found'
            ? t('receivePo.notFound')
            : t('receivePo.error');
    return (
      <div className="flex flex-col gap-3">
        {backLink}
        <div role="alert" data-testid="po-receive-panel" data-state={result.error} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {message}
        </div>
      </div>
    );
  }

  let receiveLocations: ReceiveLocationOption[] = [];
  const loc = await listLocations({ limit: 200 });
  if (loc.ok) {
    receiveLocations = loc.data.map((l) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      warehouseId: l.warehouseId,
      warehouseCode: l.warehouseCode,
      warehouseName: l.warehouseName,
    }));
  }

  return (
    <div className="flex flex-col gap-4">
      {backLink}
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">{t('receivePo.poLabel')}</div>
            <div className="font-mono font-semibold text-slate-900">{result.data.poNumber}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">{t('receivePo.supplierLabel')}</div>
            <div className="text-slate-800">{result.data.supplierName ?? '—'}</div>
          </div>
        </div>
      </div>
      <PoReceiveClient
        po={result.data}
        labels={buildLabels(t)}
        locations={receiveLocations}
        receivePoLineAction={receivePoLineAction}
      />
    </div>
  );
}

export default async function WarehousePoReceivePage({ params }: PageProps) {
  const { locale, poId } = await params;
  const t = getWhReceiveTranslator(locale);

  return (
    <main
      data-screen="warehouse-po-receive"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('receivePo.title')}
        breadcrumb={[
          { label: 'Warehouse', href: `/${locale}/warehouse` },
          { label: 'Inbound', href: `/${locale}/warehouse/inbound` },
          { label: t('receivePo.title') },
        ]}
      />
      <p className="text-sm text-slate-600">{t('receivePo.subtitle')}</p>
      <Suspense fallback={<ContentSkeleton />}>
        <ReceiveContent locale={locale} poId={poId} />
      </Suspense>
    </main>
  );
}
