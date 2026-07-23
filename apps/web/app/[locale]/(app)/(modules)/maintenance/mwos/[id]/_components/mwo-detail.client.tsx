'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';

import { MwoTransitionModal } from '../../../_components/mwo-transition-modal';
import { MwoEditModal, type UpdateMwoAction } from '../../../_components/mwo-edit-modal';
import { MwoLotoModal, type MwoLotoModalLabels } from '../../../_components/mwo-loto-modal';
import { PRIORITY_VARIANT, STATE_VARIANT, fmtDate, fmtDateTime } from '../../../_components/mwo-list.client';
import type { MwoListLabels, TransitionMwoAction } from '../../../_components/mwo-list.client';
import type { EquipmentOption } from '../../../_actions/mwo-actions';
import type { MwoDetailRow, MwoTransition } from '../../../_actions/mwo-actions';
import type { MwoLotoVerifierOption } from '../../../_actions/mwo-types';

type LotoLockoutAction = (input: {
  mwoId: string;
  energySourcesIsolated: string[];
  tagsApplied: string[];
  signature: { password: string };
  verifierSignature: { userId: string; password: string };
}) => Promise<{ ok: boolean; reason?: string; message?: string }>;

type LotoReleaseAction = (input: {
  mwoId: string;
  signature: { password: string };
}) => Promise<{ ok: boolean; reason?: string; message?: string }>;

export type MwoDetailLabels = MwoListLabels & {
  detail: {
    breadcrumbList: string;
    backToList: string;
    overviewTitle: string;
    pmSourceTitle: string;
    pmSourceEmpty: string;
    pmScheduleType: string;
    pmNextDue: string;
    pmInterval: string;
    description: string;
    denied: string;
    error: string;
    notFound: string;
    lotoActiveBanner: string;
    lotoLegacyBanner: string;
    lotoPendingBanner: string;
    lotoApply: string;
    lotoClear: string;
    edit: string;
  };
  loto: MwoLotoModalLabels;
};

export function MwoDetailClient({
  locale,
  mwo: mwoProp,
  equipment,
  lotoVerifiers,
  labels,
  permissions,
  transitionMwoAction,
  updateMwoAction,
  verifyLotoLockoutAction,
  verifyLotoReleaseAction,
}: {
  locale: string;
  mwo: MwoDetailRow;
  equipment: EquipmentOption[];
  lotoVerifiers: MwoLotoVerifierOption[];
  labels: MwoDetailLabels;
  permissions: {
    canEdit: boolean;
    canExecute: boolean;
    canCancel: boolean;
    canLotoApply: boolean;
    canLotoClear: boolean;
  };
  transitionMwoAction: TransitionMwoAction;
  updateMwoAction: UpdateMwoAction;
  verifyLotoLockoutAction: LotoLockoutAction;
  verifyLotoReleaseAction: LotoReleaseAction;
}) {
  const router = useRouter();
  const [mwo, setMwo] = useState(mwoProp);
  useEffect(() => {
    setMwo(mwoProp);
  }, [mwoProp]);
  const [pendingTransition, setPendingTransition] = useState<MwoTransition | null>(null);
  const [pendingLoto, setPendingLoto] = useState<'lockout' | 'release' | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const d = labels.detail;

  const terminal = mwo.state === 'completed' || mwo.state === 'cancelled';
  const editable = !terminal && (mwo.state === 'open' || mwo.state === 'requested' || mwo.state === 'approved');
  const lotoRequired = mwo.loto.requiresLoto;
  const canStart = permissions.canExecute && (!lotoRequired || mwo.loto.lockoutActive);

  const refresh = () => router.refresh();

  return (
    <div className="flex flex-col gap-4" data-testid="mwo-detail">
      <Link
        href={`/${locale}/maintenance`}
        className="text-sm font-medium text-slate-600 hover:text-slate-900"
        data-testid="mwo-detail-back"
      >
        ← {d.backToList}
      </Link>

      <Card className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">{d.overviewTitle}</h2>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-lg font-semibold text-slate-900">{mwo.mwoNumber}</p>
            <h1 className="text-base font-medium text-slate-800">{mwo.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATE_VARIANT[mwo.state]}>{labels.status[mwo.state]}</Badge>
            <Badge variant={PRIORITY_VARIANT[mwo.priority]}>{labels.priority[mwo.priority]}</Badge>
            <span className="text-xs text-slate-500">{labels.source[mwo.source]}</span>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">{labels.col.equipment}</dt>
            <dd className="text-sm text-slate-900">
              {mwo.equipmentCode ? (
                <>
                  <span className="font-mono font-semibold">{mwo.equipmentCode}</span>
                  {mwo.equipmentName ? (
                    <span className="ml-1 text-slate-600">— {mwo.equipmentName}</span>
                  ) : null}
                </>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">{labels.col.due}</dt>
            <dd className="font-mono text-sm text-slate-900">{fmtDate(mwo.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">{labels.col.created}</dt>
            <dd className="font-mono text-sm text-slate-900">{fmtDateTime(mwo.createdAt)}</dd>
          </div>
          {mwo.description ? (
            <div className="sm:col-span-2 lg:col-span-4">
              <dt className="text-xs text-slate-500">{d.description}</dt>
              <dd className="text-sm text-slate-700">{mwo.description}</dd>
            </div>
          ) : null}
        </dl>

        {lotoRequired && !terminal ? (
          <div
            className={
              mwo.loto.lockoutActive || mwo.loto.releaseAllowed
                ? 'mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900'
                : 'mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700'
            }
            data-testid="mwo-loto-banner"
          >
            {mwo.loto.lockoutActive
              ? d.lotoActiveBanner
              : mwo.loto.releaseAllowed
                ? d.lotoLegacyBanner
                : d.lotoPendingBanner}
          </div>
        ) : null}

        {!terminal ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {editable && permissions.canEdit ? (
              <button
                type="button"
                data-testid="mwo-detail-edit"
                onClick={() => setEditOpen(true)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                {d.edit}
              </button>
            ) : null}
            {lotoRequired && mwo.state === 'open' && !mwo.loto.lockoutActive && permissions.canLotoApply ? (
              <button
                type="button"
                data-testid="mwo-detail-loto-apply"
                onClick={() => setPendingLoto('lockout')}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500"
              >
                {d.lotoApply}
              </button>
            ) : null}
            {lotoRequired && mwo.state === 'in_progress' && mwo.loto.releaseAllowed && permissions.canLotoClear ? (
              <button
                type="button"
                data-testid="mwo-detail-loto-clear"
                onClick={() => setPendingLoto('release')}
                className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                {d.lotoClear}
              </button>
            ) : null}
            {mwo.state === 'open' && canStart ? (
              <button
                type="button"
                data-testid="mwo-detail-start"
                onClick={() => setPendingTransition('in_progress')}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                {labels.action.start}
              </button>
            ) : null}
            {mwo.state === 'in_progress' && permissions.canExecute ? (
              <button
                type="button"
                data-testid="mwo-detail-complete"
                onClick={() => setPendingTransition('completed')}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                {labels.action.complete}
              </button>
            ) : null}
            {permissions.canCancel ? (
              <button
                type="button"
                data-testid="mwo-detail-cancel"
                onClick={() => setPendingTransition('cancelled')}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:border-red-200 hover:text-red-600"
              >
                {labels.action.cancel}
              </button>
            ) : null}
          </div>
        ) : null}
      </Card>

      {mwo.pmSource ? (
        <Card
          className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm"
          data-testid="mwo-pm-source"
        >
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{d.pmSourceTitle}</h2>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-500">{d.pmScheduleType}</dt>
              <dd>
                <Badge variant="secondary">{labels.pm.type[mwo.pmSource.scheduleType]}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{d.pmNextDue}</dt>
              <dd className="font-mono text-sm text-slate-900">{fmtDate(mwo.pmSource.nextDueDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{d.pmInterval}</dt>
              <dd className="font-mono text-sm text-slate-900">
                {mwo.pmSource.intervalValue} {labels.pm.intervalUnit[mwo.pmSource.intervalBasis]}
              </dd>
            </div>
          </dl>
        </Card>
      ) : (
        <p className="text-sm text-slate-500" data-testid="mwo-pm-source-empty">
          {d.pmSourceEmpty}
        </p>
      )}

      {editOpen ? (
        <MwoEditModal
          mwo={mwo}
          equipment={equipment}
          labels={labels}
          updateMwoAction={updateMwoAction}
          onClose={() => setEditOpen(false)}
          onUpdated={(updated) => {
            setEditOpen(false);
            setMwo(updated);
            refresh();
          }}
        />
      ) : null}

      {pendingTransition ? (
        <MwoTransitionModal
          row={mwo}
          to={pendingTransition}
          labels={labels}
          transitionMwoAction={transitionMwoAction}
          onClose={() => setPendingTransition(null)}
          onDone={() => {
            setPendingTransition(null);
            refresh();
          }}
        />
      ) : null}

      {pendingLoto ? (
        <MwoLotoModal
          mode={pendingLoto}
          mwoId={mwo.id}
          labels={labels.loto}
          verifierOptions={lotoVerifiers}
          lockoutAction={verifyLotoLockoutAction}
          releaseAction={verifyLotoReleaseAction}
          onClose={() => setPendingLoto(null)}
          onDone={() => {
            setPendingLoto(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}
