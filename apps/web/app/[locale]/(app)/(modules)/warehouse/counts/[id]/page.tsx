/**
 * WAVE E10 — count-session detail route (/warehouse/counts/[id]).
 *
 * Spec-driven (no JSX prototype exists for stock counts). The screen has two
 * surfaces in the detail client island: a BLIND-count entry table (location +
 * item + counted-qty input — the system qty is NEVER sent to the client) and a
 * VARIANCE REVIEW (system vs counted vs variance, colour-coded) with a per-line
 * "Approve & apply" e-sign modal that reuses the WO reverse/void correction
 * modal pattern.
 *
 * Data: the reviewed getCountSession / recordCount / approveAndApplyVariance
 * Server Actions (backend lane — imported, never authored) throw on error /
 * forbidden. The page calls getCountSession in try/catch (RBAC enforced
 * server-side) and renders error / not-found / permission-denied panels. The two
 * mutations are wrapped by thin page-authored adapter Server Actions that map a
 * throw → a CountClientResult code; recordCountSafe injects the route's sessionId
 * so the island never has to know it. approveAndApplyVariance mints a new LP for
 * a positive variance and reduces stock for a negative one.
 *
 * UI states: loading (Suspense skeleton), empty (entry/review empty rows), error
 * (failed read banner / inline mutation errors), permission-denied (forbidden →
 * panel / inline), optimistic (record + approve disable + pending labels).
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import { Suspense } from 'react';

import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  approveAndApplyVariance,
  closeCountSession,
  getCountSession,
  recordCount,
} from '../_actions/count-actions';
import { getCountsTranslator } from '../counts-labels';
import {
  CountSessionDetailClient,
  type CountSessionDetailLabels,
} from '../_components/count-session-detail.client';
import { toCountErrorCode, type CountClientResult } from '../_components/count-client-result';
import type { ApproveAndApplyVarianceInput, CountLine } from '../_actions/count-types';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; id: string }> };

function buildLabels(t: ReturnType<typeof getCountsTranslator>): CountSessionDetailLabels {
  return {
    none: t('detail.none'),
    linesRestricted: t.has('detail.linesRestricted')
      ? t('detail.linesRestricted')
      : "The count line details are restricted to members of this session's site.",
    tabs: { entry: t('detail.tabs.entry'), review: t('detail.tabs.review') },
    entry: {
      heading: t('detail.entry.heading'),
      intro: t('detail.entry.intro'),
      empty: t('detail.entry.empty'),
      blind: t('detail.entry.blind'),
      columns: {
        location: t('detail.entry.columns.location'),
        item: t('detail.entry.columns.item'),
        counted: t('detail.entry.columns.counted'),
        actions: t('detail.entry.columns.actions'),
      },
      qtyPlaceholder: t('detail.entry.qtyPlaceholder'),
      save: t('detail.entry.save'),
      saving: t('detail.entry.saving'),
      saved: t('detail.entry.saved'),
      recount: t('detail.entry.recount'),
      denied: t('detail.entry.denied'),
      error: t('detail.entry.error'),
    },
    review: {
      heading: t('detail.review.heading'),
      intro: t('detail.review.intro'),
      empty: t('detail.review.empty'),
      columns: {
        location: t('detail.review.columns.location'),
        item: t('detail.review.columns.item'),
        system: t('detail.review.columns.system'),
        counted: t('detail.review.columns.counted'),
        variance: t('detail.review.columns.variance'),
        status: t('detail.review.columns.status'),
        actions: t('detail.review.columns.actions'),
      },
      positiveHint: t('detail.review.positiveHint'),
      negativeHint: t('detail.review.negativeHint'),
      matchHint: t('detail.review.matchHint'),
      applied: t('detail.review.applied'),
      approve: t('detail.review.approve'),
    },
    esign: {
      title: t('esign.title'),
      intro: t('esign.intro'),
      factsLocation: t('esign.factsLocation'),
      factsItem: t('esign.factsItem'),
      factsSystem: t('esign.factsSystem'),
      factsCounted: t('esign.factsCounted'),
      factsVariance: t('esign.factsVariance'),
      positiveEffect: t('esign.positiveEffect'),
      negativeEffect: t('esign.negativeEffect'),
      block: t('esign.block'),
      blockMeaning: t('esign.blockMeaning'),
      password: t('esign.password'),
      passwordPlaceholder: t('esign.passwordPlaceholder'),
      passwordHelp: t('esign.passwordHelp'),
      cancel: t('esign.cancel'),
      submit: t('esign.submit'),
      submitting: t('esign.submitting'),
      formIncomplete: t('esign.formIncomplete'),
      errors: {
        forbidden: t('esign.errors.forbidden'),
        not_found: t('esign.errors.not_found'),
        already_applied: t('esign.errors.already_applied'),
        esign_failed: t('esign.errors.esign_failed'),
        invalid_input: t('esign.errors.invalid_input'),
        error: t('esign.errors.error'),
      },
    },
    closeSession: t('detail.closeSession'),
    closingSession: t('detail.closingSession'),
    closeSessionConfirm: t('detail.closeSessionConfirm'),
    closeSessionError: t('detail.closeSessionError'),
    closeSessionDenied: t('detail.closeSessionDenied'),
  };
}

function DetailSkeleton() {
  return (
    <div data-testid="count-detail-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-10 w-64 animate-pulse rounded-md bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function DetailContent({ locale, sessionId }: { locale: string; sessionId: string }) {
  const t = getCountsTranslator(locale);

  let session;
  try {
    session = await getCountSession(sessionId);
  } catch (e) {
    const message = e instanceof Error ? e.message : undefined;
    const code = toCountErrorCode(message);
    const isNotFound = code === 'not_found' || (message ?? '').includes('not_found');
    const isDenied = code === 'forbidden';
    return (
      <div
        role="alert"
        data-testid={isDenied ? 'count-detail-denied' : isNotFound ? 'count-detail-not-found' : 'count-detail-error'}
        data-state={isDenied ? 'permission-denied' : 'error'}
        className={
          isDenied
            ? 'rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800'
            : 'rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700'
        }
      >
        {isDenied ? t('detail.denied') : isNotFound ? t('detail.notFound') : t('detail.error')}
      </div>
    );
  }

  // Page-authored adapters (wiring, NOT data access). recordCountSafe injects the
  // route sessionId so the island never carries it; RBAC stays server-side.
  async function recordCountSafe(input: {
    locationId: string;
    itemId: string;
    lpId?: string | null;
    countedQty: number;
  }): Promise<CountClientResult<CountLine>> {
    'use server';
    try {
      const line = await recordCount({ sessionId, ...input });
      return { ok: true, data: line };
    } catch (err) {
      return { ok: false, code: toCountErrorCode(err instanceof Error ? err.message : undefined) };
    }
  }

  async function approveVarianceSafe(
    input: ApproveAndApplyVarianceInput,
  ): Promise<CountClientResult<{ countLineId: string }>> {
    'use server';
    try {
      const res = await approveAndApplyVariance(input);
      return { ok: true, data: { countLineId: res.countLineId } };
    } catch (err) {
      return { ok: false, code: toCountErrorCode(err instanceof Error ? err.message : undefined) };
    }
  }

  async function closeCountSessionSafe(): Promise<CountClientResult<void>> {
    'use server';
    try {
      await closeCountSession(sessionId);
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, code: toCountErrorCode(err instanceof Error ? err.message : undefined) };
    }
  }

  return (
    <CountSessionDetailClient
      session={session}
      labels={buildLabels(t)}
      recordAction={recordCountSafe}
      approveAction={approveVarianceSafe}
      closeSessionAction={closeCountSessionSafe}
    />
  );
}

export default async function CountSessionDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = getCountsTranslator(locale);

  return (
    <main
      data-screen="warehouse-count-detail"
      data-prototype-label="count_session_detail_page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('detail.title', { session: `CNT-${id.slice(0, 8).toUpperCase()}` })}
        subtitle={t('detail.subtitle')}
        breadcrumb={[
          { label: t('detail.breadcrumb.warehouse'), href: `/${locale}/warehouse` },
          { label: t('detail.breadcrumb.counts'), href: `/${locale}/warehouse/counts` },
          { label: `CNT-${id.slice(0, 8).toUpperCase()}` },
        ]}
      />
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent locale={locale} sessionId={id} />
      </Suspense>
    </main>
  );
}
