/**
 * B-2 — Allergen changeover dual-sign REGISTER (08-production).
 *
 * Prototype parity (1:1):
 *   prototypes/design/Monopilot Design System/production/other-screens.jsx:298-397
 *     (ChangeoverScreen) — page-head + dual sign-off requirement note + the
 *     dual-sign gate slots (364-385);
 *   production/modals.jsx:315-336 (ChangeoverGateModal) — the sign-&-advance gate
 *     translated into the per-row dual-sign panel + e-sign modal;
 *   production/dashboard.jsx:249-267 — the "Open changeover" entry this list is
 *     reached from.
 *
 * This is the INTERACTIVE dual-sign flow the read-only /production/changeover
 * register deferred ("the interactive cleaning-checklist + PIN sign-off gate is
 * owned by the changeover execution flow"). It lists changeovers with a status
 * filter, a "+ New changeover" modal, and a per-row two-slot e-sign panel.
 *
 * DATA: coded against the C4 action contract (changeover-actions.ts:
 * listChangeovers / createChangeoverEvent / signChangeover). Until C4 lands, the
 * list falls back to the in-folder read-model (changeover-data.ts) adapted to the
 * contract shape, and the mutation seams return a typed `error` so the UI degrades
 * honestly instead of crashing (CONTRACT GAP — wire the real actions at C4 merge).
 *
 * UI states: loading (Suspense skeleton) / empty (filtered list) / error (banner)
 * / permission-denied (server-resolved, action hidden) / optimistic (sign/create
 * pending → disabled buttons + router.refresh reconcile).
 */
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { searchItems } from '../../../../../(npd)/fa/actions/search-items';
import {
  listChangeovers,
  createChangeoverEvent,
  signChangeover,
} from '../_actions/changeover-actions';
import { listChangeoverLines } from './_actions/changeovers-lines';
import { ChangeoversList } from './_components/changeovers-list.client';
import { buildChangeoversLabels } from './_components/build-labels';
import type {
  ChangeoverDualSignStatus,
  ChangeoverListRow,
  CreateChangeoverFn,
  SignChangeoverFn,
} from './_components/changeovers-contract';
import type { ChangeoverFilterStatus } from './_components/labels';

export const dynamic = 'force-dynamic';

const FILTER_VALUES: ChangeoverFilterStatus[] = ['all', 'pending', 'first_signed', 'complete'];

function resolveFilter(raw: string | undefined): ChangeoverFilterStatus {
  return raw && (FILTER_VALUES as string[]).includes(raw) ? (raw as ChangeoverFilterStatus) : 'all';
}

/**
 * C4 action seams (changeover-actions.ts). Wrapped as Server Actions so the
 * client islands can call them. The wrappers normalise C4's return shape onto the
 * lane contract (changeovers-contract.ts) defensively — any unmodelled error code
 * collapses to the generic 'error' bucket (the modals map that to generic copy).
 */
async function createChangeoverAction(
  ...args: Parameters<CreateChangeoverFn>
): ReturnType<CreateChangeoverFn> {
  'use server';
  const res = await createChangeoverEvent(args[0]);
  if (res.ok) return { ok: true, id: (res as { row?: { id?: string } }).row?.id };
  const error = res.error === 'forbidden' ? 'forbidden' : 'error';
  return { ok: false, error };
}

async function signChangeoverAction(
  ...args: Parameters<SignChangeoverFn>
): ReturnType<SignChangeoverFn> {
  'use server';
  const res = await signChangeover(args[0]);
  if (res.ok) return { ok: true };
  const known = ['forbidden', 'wrong_role', 'same_user', 'same_user_rejected', 'invalid_state', 'cleaning_incomplete', 'esign_failed'] as const;
  const error = (known as readonly string[]).includes(res.error)
    ? (res.error as (typeof known)[number])
    : 'esign_failed';
  return { ok: false, error };
}

/** map a sign-off status onto the contract enum (defensive). */
function toDualStatus(s: string | null | undefined): ChangeoverDualSignStatus {
  if (s === 'completed' || s === 'complete') return 'complete';
  if (s === 'first_signed') return 'first_signed';
  return 'pending';
}

function ChangeoversSkeleton() {
  return (
    <div data-testid="production-changeovers-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-8 w-72 animate-pulse rounded-full bg-slate-100" />
      <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function ChangeoversContent({ filter }: { filter: ChangeoverFilterStatus }) {
  const t = await getTranslations('production.changeovers');
  const labels = buildChangeoversLabels(t);

  let listResult: Awaited<ReturnType<typeof listChangeovers>>;
  let lines: Awaited<ReturnType<typeof listChangeoverLines>>;
  try {
    [listResult, lines] = await Promise.all([listChangeovers({ limit: 100 }), listChangeoverLines()]);
  } catch (error) {
    console.error('[production/changeovers] load failed:', error);
    return (
      <div
        role="alert"
        data-testid="production-changeovers-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {labels.list.error}
      </div>
    );
  }

  // C4's listChangeovers resolves { ok:true, rows } and throws (caught above) on
  // missing org-context; forbidden/denied for reads is surfaced as a throw too.
  const result = listResult as { ok: boolean; rows?: unknown[]; error?: string };
  if (!result.ok) {
    const denied = result.error === 'forbidden';
    return (
      <div
        role={denied ? 'note' : 'alert'}
        data-testid={denied ? 'production-changeovers-denied' : 'production-changeovers-error'}
        className={
          denied
            ? 'rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800'
            : 'rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700'
        }
      >
        {denied ? labels.list.denied : labels.list.error}
      </div>
    );
  }

  // Normalise C4 rows onto the lane contract. C4's allergenRisk is an object
  // {level,...} and signers are null — flatten to the contract's optional string
  // / undefined defensively (shape drift reconciled here, not in the islands).
  const rows: ChangeoverListRow[] = listResult.rows.map((r) => {
    const raw = r as unknown as {
      id: string;
      lineId: string;
      lineCode: string | null;
      woId?: string | null;
      woNumber?: string | null;
      fromProduct?: { id: string | null; code: string | null; name: string | null } | null;
      toProduct?: { id: string | null; code: string | null; name: string | null } | null;
      allergenRisk?: { level?: string } | string | null;
      cleaningCompleted?: boolean;
      atpResult?: unknown;
      dualSignOffStatus?: string | null;
      firstSigner?: { id: string; name: string; email: string; signedAt: string } | null;
      secondSigner?: { id: string; name: string; email: string; signedAt: string } | null;
      createdAt?: string | null;
    };
    const risk =
      typeof raw.allergenRisk === 'string'
        ? raw.allergenRisk
        : raw.allergenRisk?.level ?? undefined;
    return {
      id: raw.id,
      lineId: raw.lineId,
      lineCode: raw.lineCode ?? raw.lineId,
      woId: raw.woId ?? undefined,
      woNumber: raw.woNumber ?? undefined,
      fromProduct: raw.fromProduct?.code
        ? { id: raw.fromProduct.id ?? '', code: raw.fromProduct.code, name: raw.fromProduct.name ?? '' }
        : undefined,
      toProduct: {
        id: raw.toProduct?.id ?? '',
        code: raw.toProduct?.code ?? '—',
        name: raw.toProduct?.name ?? '',
      },
      allergenRisk: risk,
      cleaningCompleted: Boolean(raw.cleaningCompleted),
      atpResult: raw.atpResult == null ? undefined : String(raw.atpResult),
      dualSignOffStatus: toDualStatus(raw.dualSignOffStatus),
      firstSigner: raw.firstSigner ?? undefined,
      secondSigner: raw.secondSigner ?? undefined,
      createdAt: raw.createdAt ?? new Date().toISOString(),
    };
  });

  return (
    <ChangeoversList
      rows={rows}
      lines={lines}
      initialFilter={filter}
      labels={labels.list}
      createLabels={labels.create}
      signLabels={labels.sign}
      createChangeoverAction={createChangeoverAction}
      signChangeoverAction={signChangeoverAction}
      searchItemsAction={searchItems}
    />
  );
}

export default async function ChangeoversPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; lineId?: string }>;
}) {
  const locale = await getLocale();
  const t = await getTranslations('production.changeovers');
  const sp = await searchParams;
  const filter = resolveFilter(sp.status);

  return (
    <main
      data-screen="production-changeovers"
      data-prototype-label="changeover_screen"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('list.title')}
        subtitle={t('list.subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.production'), href: `/${locale}/production` },
          { label: t('breadcrumb.changeovers') },
        ]}
      />
      <Suspense fallback={<ChangeoversSkeleton />}>
        <ChangeoversContent filter={filter} />
      </Suspense>
    </main>
  );
}
