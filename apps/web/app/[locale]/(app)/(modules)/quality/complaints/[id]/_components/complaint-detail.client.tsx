'use client';

/**
 * Wave E11 — Complaint detail (client island).
 *
 * Design-system conformance: mirrors the QA-009a NCR detail layout — a context Card
 * (complaint info), a sticky primary action ([Convert to NCR] when not yet
 * converted), the linked-NCR cross-link once converted, and the CAPA panel below.
 * No dedicated complaints prototype exists; the nearest reusable patterns are the
 * NCR detail header/context + the CCP-deviation resolve e-sign flow.
 *
 * Presentational + owns ONLY the convert in-flight state. Data is read server-side
 * (getComplaint + listCapaActions); the convert / CAPA actions are passed in as
 * props (imported from the reviewed backend, never authored here). The Convert
 * button is gated on the server-resolved canManage flag and keeps a tooltip when
 * disabled. After a successful convert it shows the linked NCR id in the deep-link
 * href ONLY (never as visible text) and refreshes the page (status → converted).
 * The complaint NUMBER is shown, never a raw UUID.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';

import { CapaPanel } from '../../_components/capa-panel.client';
import type {
  CapaActionRow,
  ComplaintRow,
  ComplaintSeverity,
  ComplaintStatus,
  ConvertComplaintToNcrAction,
  CreateCapaActionAction,
  ResolveCapaActionAction,
} from '../../_components/complaints-contracts';
import type { ComplaintDetailLabels } from '../../_components/labels';

const SEVERITY_VARIANT: Record<ComplaintSeverity, BadgeVariant> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'muted',
};
const STATUS_VARIANT: Record<ComplaintStatus, BadgeVariant> = {
  open: 'warning',
  investigating: 'info',
  converted: 'success',
  closed: 'muted',
};

function refDisplay(c: ComplaintRow): string | null {
  return c.batchDisplay ?? c.batchRef ?? c.lpCode ?? null;
}

export function ComplaintDetailClient({
  complaint,
  capaActions,
  labels,
  locale,
  canManage,
  convertComplaintToNcrAction,
  createCapaActionAction,
  resolveCapaActionAction,
}: {
  complaint: ComplaintRow;
  capaActions: CapaActionRow[];
  labels: ComplaintDetailLabels;
  locale: string;
  canManage: boolean;
  convertComplaintToNcrAction: ConvertComplaintToNcrAction;
  createCapaActionAction: CreateCapaActionAction;
  resolveCapaActionAction: ResolveCapaActionAction;
}) {
  const router = useRouter();
  const [ncrId, setNcrId] = useState<string | null>(complaint.ncrId);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isConverted = ncrId !== null;
  const ref = refDisplay(complaint);

  function convert() {
    setConvertError(null);
    startTransition(async () => {
      const result = await convertComplaintToNcrAction(complaint.id);
      if (!result.ok) {
        setConvertError(labels.convertError.replace('{message}', result.error));
        return;
      }
      setNcrId(result.data.ncrId);
      router.refresh();
    });
  }

  const infoRows: Array<[string, React.ReactNode]> = [
    [labels.info.complaintNumber, complaint.complaintNumber ?? '—'],
    [
      labels.info.customer,
      complaint.customerDisplay ?? <span className="text-slate-400">{labels.info.noCustomer}</span>,
    ],
    [labels.info.ref, ref ?? <span className="text-slate-400">{labels.info.noRef}</span>],
    [
      labels.info.severity,
      <Badge key="sev" variant={SEVERITY_VARIANT[complaint.severity] ?? 'muted'} data-testid="complaint-detail-severity">
        {labels.severityValues[complaint.severity] ?? complaint.severity}
      </Badge>,
    ],
    [
      labels.info.status,
      <Badge key="st" variant={STATUS_VARIANT[complaint.status] ?? 'muted'} data-testid="complaint-detail-status">
        {labels.statusValues[complaint.status] ?? complaint.status}
      </Badge>,
    ],
    [labels.info.openedAt, complaint.openedAt.slice(0, 10)],
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Back link. */}
      <Link
        href={`/${locale}/quality/complaints`}
        data-testid="complaint-detail-back"
        className="text-xs text-slate-500 hover:text-slate-900 hover:underline"
      >
        ← {labels.backToList}
      </Link>

      {/* Converted banner. */}
      {isConverted && (
        <div
          role="status"
          data-testid="complaint-detail-converted-banner"
          data-state="converted"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <span>{labels.convertedBanner}</span>
          {ncrId && (
            <Link
              href={`/${locale}/quality/ncrs/${ncrId}`}
              data-testid="complaint-detail-ncr-link"
              className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
            >
              {labels.linkedNcrView}
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Complaint info card. */}
        <Card
          data-testid="complaint-detail-info"
          className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-base font-semibold text-slate-900">{labels.info.title}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {infoRows.map(([label, value], i) => (
              <div key={i} className="contents">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-medium text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-slate-100 pt-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {labels.info.description}
            </dt>
            <dd
              data-testid="complaint-detail-description"
              className="mt-1 whitespace-pre-wrap text-sm text-slate-700"
            >
              {complaint.description}
            </dd>
          </div>
        </Card>

        {/* Convert-to-NCR action card. */}
        <Card className="flex h-fit flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">{labels.linkedNcr}</h3>
          {isConverted ? (
            <p className="text-xs text-slate-500" data-testid="complaint-detail-already-converted">
              {labels.convertDisabledConverted}
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-500">{labels.convertHelp}</p>
              <button
                type="button"
                data-testid="complaint-convert-button"
                disabled={!canManage || pending}
                title={!canManage ? labels.convertDisabledConverted : undefined}
                onClick={convert}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? labels.converting : labels.convert}
              </button>
              {convertError && (
                <p role="alert" data-testid="complaint-convert-error" className="text-xs text-red-600">
                  {convertError}
                </p>
              )}
            </>
          )}
        </Card>
      </div>

      {/* CAPA panel. */}
      <CapaPanel
        sourceId={complaint.id}
        actions={capaActions}
        labels={labels.capa}
        canManage={canManage}
        createCapaActionAction={createCapaActionAction}
        resolveCapaActionAction={resolveCapaActionAction}
      />
    </div>
  );
}
