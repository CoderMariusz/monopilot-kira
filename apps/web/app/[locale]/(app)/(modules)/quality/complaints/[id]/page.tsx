/**
 * Wave E11 — Complaint detail route (/quality/complaints/[id]).
 *
 * Spec-driven (prototype_match=false): no dedicated complaints/CAPA prototype JSX.
 * Per UI-PROTOTYPE-PARITY-POLICY.md §1.2 the nearest reusable patterns are the
 * QA-009a NCR detail (ncr-screens.jsx:186-352 — context card, sticky primary
 * action, linked-records cross-link) for the complaint info + [Convert to NCR]
 * action, and the NCR-CLOSE / CCP-deviation resolve e-sign modals for the CAPA
 * [Resolve] e-sign flow (modals.jsx:444-462 / 585-591). The production islands
 * mirror those 1:1.
 *
 * Data: the reviewed complaint Server Actions (getComplaint + listCapaActions +
 * convertComplaintToNcr + createCapaAction + resolveCapaAction), imported from
 * quality/_actions/complaint-actions.ts (backend DONE — never authored or touched
 * here) and run inside withOrgContext (RLS-scoped). RBAC is server-side: getComplaint
 * returns forbidden → denied panel; the convert / add-CAPA / resolve actions
 * re-check the grant authoritatively — the [Convert] / [+ Add CAPA] / [Resolve]
 * buttons are gated on a SERVER-resolved write probe (canManageComplaints), never
 * client-trusted.
 *
 * No `*_id` ever reaches the UI — the complaint NUMBER, customer display, batch/LP
 * reference, severity/status badges and the CAPA action type/description/status are
 * shown; the complaint id + linked NCR id live in deep-link hrefs ONLY.
 *
 * UI states (all four): loading (Suspense skeleton), empty (complaint not found →
 * notFound), error (failed read → banner, never 500), permission-denied (forbidden →
 * panel). Optimistic: convert + CAPA add/resolve use useTransition + router.refresh().
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import {
  getComplaint,
  listCapaActions,
  convertComplaintToNcr,
  createCapaAction,
  resolveCapaAction,
} from '../../_actions/complaint-actions';
import { canManageComplaints } from '../_actions/can-manage-complaints';
import { ComplaintDetailClient } from './_components/complaint-detail.client';
import type {
  CapaActionRow,
  ComplaintRow,
  ConvertComplaintToNcrAction,
  CreateCapaActionAction,
  ResolveCapaActionAction,
} from '../_components/complaints-contracts';
import { buildComplaintDetailLabels, type Translator } from '../_components/labels';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; id: string }> };

function DetailSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div
      data-testid="complaint-detail-loading"
      data-state="loading"
      aria-busy="true"
      aria-label={loadingLabel}
      className="flex flex-col gap-4"
    >
      <div className="h-6 w-40 animate-pulse rounded-md bg-slate-100" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      </div>
      <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function DetailContent({ locale, id, t }: { locale: string; id: string; t: Translator }) {
  const labels = buildComplaintDetailLabels(t);
  const result = await getComplaint(id);

  if (!result.ok) {
    if (result.error === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="complaint-detail-denied"
          data-state="permission-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          <p className="font-semibold">{t('denied.title')}</p>
          <p className="mt-1">{t('denied.body')}</p>
        </div>
      );
    }
    if (result.error === 'not_found') {
      notFound();
    }
    return (
      <div
        role="alert"
        data-testid="complaint-detail-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        <p className="font-semibold">{t('error.title')}</p>
        <p className="mt-1">{t('error.body')}</p>
      </div>
    );
  }

  const complaint: ComplaintRow = result.data;

  // CAPA actions for THIS complaint (sourceType complaint, sourceId = complaint id).
  const capaResult = await listCapaActions({ sourceType: 'complaint', sourceId: complaint.id });
  const capaActions: CapaActionRow[] = capaResult.ok ? capaResult.data : [];

  const canManage = await canManageComplaints();

  return (
    <ComplaintDetailClient
      complaint={complaint}
      capaActions={capaActions}
      labels={labels}
      locale={locale}
      canManage={canManage}
      convertComplaintToNcrAction={convertComplaintToNcr as ConvertComplaintToNcrAction}
      createCapaActionAction={createCapaAction as CreateCapaActionAction}
      resolveCapaActionAction={resolveCapaAction as ResolveCapaActionAction}
    />
  );
}

export default async function ComplaintDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations('quality.complaints');

  return (
    <main
      data-screen="quality-complaint-detail"
      data-prototype-label="complaint_detail"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <Suspense fallback={<DetailSkeleton loadingLabel={t('loading')} />}>
        <DetailContent locale={locale} id={id} t={t as unknown as Translator} />
      </Suspense>
    </main>
  );
}
