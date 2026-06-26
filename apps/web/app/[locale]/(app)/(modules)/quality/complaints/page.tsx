/**
 * Wave E11 — Complaints register route (/quality/complaints).
 *
 * Spec-driven (prototype_match=false): there is NO dedicated complaints/CAPA
 * prototype JSX — complaints/CAPA are P2 placeholders in the NCR prototype
 * (ncr-screens.jsx:283-284,312 + modals.jsx:367,397). Per UI-PROTOTYPE-PARITY-
 * POLICY.md §1.2 the nearest reusable prototype patterns are:
 *   - QA-009 NCR list (ncr-screens.jsx:1-184) — header "+ create" action → modal,
 *     status Select, dense table → row detail link, empty / empty-filtered states;
 *   - QA-002 holds list density / Card filter bar.
 * The production islands mirror those 1:1.
 *
 * Data: the reviewed complaint Server Actions (listComplaints + createComplaint),
 * imported from quality/_actions/complaint-actions.ts (backend DONE — never authored
 * or touched here) and run inside withOrgContext (RLS-scoped). RBAC is enforced
 * server-side in the actions; this page never trusts a client flag — a `forbidden`
 * list result renders the permission-denied panel, and the [+ New complaint] button
 * is gated on a SERVER-resolved write probe (canManageComplaints) that createComplaint
 * re-checks.
 *
 * No `*_id` ever reaches the UI — only the complaint NUMBER, the customer display,
 * the batch/LP reference, a severity badge + a status badge + the opened date.
 *
 * UI states (all four): loading (Suspense skeleton, no CLS), empty (whole register),
 * error (failed live read → banner, never a 500), permission-denied (forbidden →
 * panel). Optimistic: the create modal uses useTransition + router.refresh() and
 * surfaces action errors verbatim.
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

// Owned by the reviewed complaints backend (quality/_actions/complaint-actions.ts).
// Imported, never authored here.
import { listComplaints, createComplaint } from '../_actions/complaint-actions';
// Read-only RBAC probe (additive read confined to complaints/**) — gates the
// [+ New complaint] button on quality.ncr.create.
import { getComplaintAnalytics } from './_actions/complaint-analytics-action';
import { canManageComplaints } from './_actions/can-manage-complaints';
import { ComplaintsListClient } from './_components/complaints-list.client';
import type { ComplaintRow, CreateComplaintAction } from './_components/complaints-contracts';
import { buildComplaintListLabels, type Translator } from './_components/labels';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

function ListSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div
      data-testid="complaints-list-loading"
      data-state="loading"
      aria-busy="true"
      aria-label={loadingLabel}
      className="flex flex-col gap-4"
    >
      <div className="h-10 w-40 animate-pulse self-end rounded-md bg-slate-100" />
      <div className="h-12 w-full animate-pulse rounded-xl bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function ListContent({ locale, t }: { locale: string; t: Translator }) {
  const labels = buildComplaintListLabels(t);
  const result = await listComplaints();

  if (!result.ok) {
    if (result.error === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="complaints-list-denied"
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
        data-testid="complaints-list-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        <p className="font-semibold">{t('error.title')}</p>
        <p className="mt-1">{t('error.body')}</p>
      </div>
    );
  }

  const canManage = await canManageComplaints();
  const analytics = await getComplaintAnalytics();
  const rows: ComplaintRow[] = result.data;

  return (
    <ComplaintsListClient
      rows={rows}
      analytics={analytics}
      labels={labels}
      locale={locale}
      canManage={canManage}
      createComplaintAction={createComplaint as CreateComplaintAction}
    />
  );
}

export default async function ComplaintsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('quality.complaints');

  return (
    <main
      data-screen="quality-complaints-list"
      data-prototype-label="complaints_list"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.quality'), href: `/${locale}/quality` },
          { label: t('breadcrumb.complaints') },
        ]}
      />
      <Suspense fallback={<ListSkeleton loadingLabel={t('loading')} />}>
        <ListContent locale={locale} t={t as unknown as Translator} />
      </Suspense>
    </main>
  );
}
