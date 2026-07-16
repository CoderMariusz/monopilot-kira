/**
 * WH-003 — `/warehouse/license-plates/[lpId]` LP detail page (7-tab).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/warehouse/
 *   lp-screens.jsx:216-571 (lp_detail) — page head, expiry banner, identity card +
 *   action group, and the 7 tabs (overview / state history / reservations /
 *   movements / genealogy / labels / raw). See lp-detail.client.tsx for the
 *   per-region anchors and the documented deviations (actions disabled, label
 *   print + audit-table deferred, reservations reduced to the single reserved-WO
 *   fact the action exposes).
 *
 * Server Component: reads org-scoped data via the `getLpDetail` Server Action
 * (owned by the parallel Codex lane — imported, never authored). RBAC
 * (warehouse.inventory.read) is enforced INSIDE the action; this page surfaces the
 * `forbidden` / `not_found` reasons as panels and never trusts a client flag.
 *
 * i18n resolved server-side from the staged bundle (see ../lp-labels.ts).
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (not-found panel for a
 * missing LP), error (failed live read → banner, never a 500), permission-denied
 * (forbidden → denied panel). Optimistic — N/A (the action group is deferred and
 * rendered disabled, no mutations here).
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import { Suspense } from 'react';
import Link from 'next/link';

import { getLpDetail } from '../../_actions/lp-actions';
import { releaseLpQa } from '../../_actions/lp-qa-actions';
import { listLocations } from '../../_actions/location-read-actions';
import { createStockMove } from '../../_actions/stock-move-actions';
import { blockLp, listOpenWorkOrdersForLpReserve, reserveLp, unblockLp } from './_actions/lp-detail-actions';
import { destroyLp, listSiblingLpsForMerge, mergeLps, splitLp } from './_actions/lp-split-merge-destroy-actions';
import { updateLpMetadataAction } from './lp-metadata-adapter';
// E1 — label printing wired through the printers settings actions (mig 304).
import { printLabel } from '../../../../(admin)/settings/infra/printers/_actions/printers';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { getLpTranslator } from '../lp-labels';
// RSC boundary: runtime VALUES must come from server-safe modules — never import
// iterable consts or label builders from 'use client' files (digest 1984471676).
import { LpAuditTimelineSection } from './_components/lp-audit-timeline-section';
import { LpDetailClient } from './_components/lp-detail.client';
import {
  buildLpDetailLabels,
  type LpPrintLabelInput,
  type LpPrintLabelResult,
} from './_components/lp-detail-labels';

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; lpId: string }>;
};

function DetailSkeleton() {
  return (
    <div data-testid="lp-detail-loading" aria-busy="true" className="flex flex-col gap-6">
      <div className="h-12 w-96 animate-pulse rounded-lg bg-slate-100" />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      </div>
    </div>
  );
}

const PRINT_PERMISSION = 'settings.org.update';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

/**
 * E1 — resolve the SAME permission the printers actions enforce, server-side, so
 * the labels-tab Print button is rendered enabled/disabled honestly (never
 * render-then-disable leak; the action re-checks regardless). Failures degrade to
 * "no permission" rather than crashing the detail page.
 */
async function resolveCanPrint(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      const { rows } = await ctx.client.query<{ ok: boolean }>(
        `select true as ok
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
            and (
              rp.permission is not null
              or r.code = $3
              or coalesce(r.permissions, '[]'::jsonb) ? $3
            )
          limit 1`,
        [ctx.userId, ctx.orgId, PRINT_PERMISSION],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

/**
 * E1 — Server Action adapter: maps the printers `printLabel` PrintJobRow down to
 * the minimal {status, result_url} the labels tab renders. The action itself
 * re-validates RBAC + the entity, so this is a thin import-only seam.
 */
async function printLpLabel(input: LpPrintLabelInput): Promise<LpPrintLabelResult> {
  'use server';
  try {
    const job = await printLabel({ entityType: input.entityType, entityId: input.entityId });
    if (job.status === 'failed') {
      return { status: 'failed', result_url: null, code: job.error_text ?? 'print_failed' };
    }
    return { status: job.status, result_url: job.result_url };
  } catch (e) {
    const code = e instanceof Error ? e.message : 'print_failed';
    return { status: 'failed', result_url: null, code };
  }
}

async function DetailContent({ locale, lpId }: { locale: string; lpId: string }) {
  const t = getLpTranslator(locale);
  const result = await getLpDetail(lpId);

  if (!result.ok && result.reason === 'forbidden') {
    return (
      <div
        role="note"
        data-testid="lp-detail-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('detail.denied')}
      </div>
    );
  }

  if (!result.ok && result.reason === 'not_found') {
    return (
      <div
        role="note"
        data-testid="lp-detail-not-found"
        className="flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-6 py-5 text-sm text-slate-600"
      >
        <span>{t('detail.notFound')}</span>
        <Link
          href={`/${locale}/warehouse/license-plates`}
          className="text-sky-700 hover:underline"
        >
          ← {t('detail.back')}
        </Link>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div
        role="alert"
        data-testid="lp-detail-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('detail.error')}
      </div>
    );
  }

  const canPrint = await resolveCanPrint();

  return (
    <div className="flex flex-col gap-4">
      <LpDetailClient
        detail={result.data}
        labels={buildLpDetailLabels(locale)}
        locale={locale}
        releaseQaAction={releaseLpQa}
        blockLpAction={blockLp}
        unblockLpAction={unblockLp}
        reserveLpAction={reserveLp}
        listOpenWorkOrdersForLpReserveAction={listOpenWorkOrdersForLpReserve}
        listLocationsAction={listLocations}
        createStockMoveAction={createStockMove}
        splitLpAction={splitLp}
        mergeLpAction={mergeLps}
        listSiblingLpsForMergeAction={listSiblingLpsForMerge}
        destroyLpAction={destroyLp}
        updateLpMetadataAction={updateLpMetadataAction}
        printLabelAction={printLpLabel}
        canPrint={canPrint}
      />
      <LpAuditTimelineSection entityType="license_plate" entityId={result.data.id} />
    </div>
  );
}

export default async function LicensePlateDetailPage({ params }: PageProps) {
  const { locale, lpId } = await params;

  return (
    <main
      data-screen="warehouse-lp-detail"
      data-prototype-label="lp_detail"
      data-prototype-anchor="prototypes/design/Monopilot Design System/warehouse/lp-screens.jsx:216-571"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent locale={locale} lpId={lpId} />
      </Suspense>
    </main>
  );
}
