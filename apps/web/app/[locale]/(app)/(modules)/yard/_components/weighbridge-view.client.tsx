'use client';

/**
 * WAVE E5 — Weighbridge entry client view (mig 317 weighings).
 *
 * Pick an on-site vehicle, enter gross + tare → net is shown live; submit calls
 * recordWeighing. A "recent weighings" panel lists the weighings recorded this
 * session (the contract exposes recordWeighing's returned WeighingRow but no
 * list action, so we accumulate the real returned rows rather than fabricate a
 * server list — newest first).
 *
 * Prototype note: no yard/dock screen exists under prototypes/design/ —
 * presentation follows the planning/carriers list+form pattern
 * (prototype_match=false, spec-driven). Desktop context → @monopilot/ui Select.
 *
 * UI states: loading, permission-denied (amber note), error (red alert), empty
 * (no on-site vehicles → form disabled), form; submit idle/pending/inline-error.
 */
import React from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

import {
  classifyYardError,
  computeNet,
  type RecordWeighingInput,
  type WeighingRow,
  type YardVisitRow,
} from './yard-shared';
import { buildWeighbridgeLabels } from './yard-labels';
import type { WeighbridgeLabels } from './yard-types';

export type WeighbridgeViewProps = {
  /** Server Action seams (injected from the RSC page). Each THROWS on failure. */
  listYardVisitsAction: () => Promise<YardVisitRow[]>;
  recordWeighingAction: (input: RecordWeighingInput) => Promise<WeighingRow>;
};

type ViewState = 'loading' | 'ready' | 'forbidden' | 'error';

type RecentRow = WeighingRow & { vehicleReg: string; carrierName: string | null };

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function WeighbridgeView({ listYardVisitsAction, recordWeighingAction }: WeighbridgeViewProps) {
  // Built client-side from the `Yard` next-intl namespace (kept off the RSC
  // boundary so the whole yard label family stays client-resolved and uniform).
  const t = useTranslations('Yard');
  const labels = React.useMemo(() => buildWeighbridgeLabels(t), [t]);
  const [visits, setVisits] = React.useState<YardVisitRow[] | null>(null);
  const [state, setState] = React.useState<ViewState>('loading');
  const [visitId, setVisitId] = React.useState('');
  const [grossKg, setGrossKg] = React.useState('');
  const [tareKg, setTareKg] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [recent, setRecent] = React.useState<RecentRow[]>([]);

  const load = React.useCallback(() => {
    setState('loading');
    listYardVisitsAction()
      .then((rows) => {
        setVisits(rows);
        setState('ready');
      })
      .catch((err: unknown) => {
        setState(classifyYardError(err) === 'forbidden' ? 'forbidden' : 'error');
      });
  }, [listYardVisitsAction]);

  React.useEffect(() => {
    load();
  }, [load]);

  const onSite = (visits ?? []).filter((v) => v.status === 'on_site');
  const net = computeNet(grossKg, tareKg);

  React.useEffect(() => {
    if (!visitId && onSite.length > 0) setVisitId(onSite[0].id);
  }, [onSite, visitId]);

  const visitOptions = onSite.map((v) => ({
    value: v.id,
    label: v.carrierName ? `${v.vehicleReg} · ${v.carrierName}` : v.vehicleReg,
  }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!visitId) return setFormError(labels.errors.visitRequired);
    const gross = Number(grossKg);
    const tare = Number(tareKg);
    if (!grossKg.trim() || !Number.isFinite(gross) || gross < 0) return setFormError(labels.errors.grossInvalid);
    if (!tareKg.trim() || !Number.isFinite(tare) || tare < 0) return setFormError(labels.errors.tareInvalid);
    if (tare > gross) return setFormError(labels.errors.netNegative);

    const visit = onSite.find((v) => v.id === visitId);
    setPending(true);
    try {
      const row = await recordWeighingAction({ yardVisitId: visitId, grossKg: gross, tareKg: tare });
      setRecent((current) => [
        { ...row, vehicleReg: visit?.vehicleReg ?? '—', carrierName: visit?.carrierName ?? null },
        ...current,
      ]);
      setGrossKg('');
      setTareKg('');
    } catch (err) {
      const kind = classifyYardError(err);
      const map = labels.errors as Record<string, string>;
      setFormError(map[kind] ?? labels.errors.persistence_failed);
    } finally {
      setPending(false);
    }
  }

  if (state === 'loading') {
    return (
      <div className="card px-6 py-4 text-sm text-slate-500" data-testid="weighbridge-loading">
        {labels.loading}
      </div>
    );
  }
  if (state === 'forbidden') {
    return (
      <div role="note" data-testid="weighbridge-denied" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
        {labels.denied}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" data-testid="weighbridge-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {labels.error}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2" data-testid="weighbridge-view">
      <section className="card" aria-labelledby="weighbridge-form-heading">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 id="weighbridge-form-heading" className="text-sm font-semibold text-slate-800">{labels.formTitle}</h2>
        </div>
        <form onSubmit={onSubmit} data-testid="weighbridge-form" className="flex flex-col gap-4 p-4">
          {formError ? (
            <div role="alert" data-testid="weighbridge-form-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          {onSite.length === 0 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500" data-testid="weighbridge-no-visits">
              {labels.noVisits}
            </div>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.visitLabel}</span>
              <Select value={visitId} onValueChange={setVisitId} aria-label={labels.visitLabel} options={visitOptions} />
            </label>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.grossLabel}</span>
              <Input type="text" inputMode="decimal" value={grossKg} data-testid="weighbridge-gross" disabled={onSite.length === 0} onChange={(e) => setGrossKg(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.tareLabel}</span>
              <Input type="text" inputMode="decimal" value={tareKg} data-testid="weighbridge-tare" disabled={onSite.length === 0} onChange={(e) => setTareKg(e.target.value)} />
            </label>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="font-medium text-slate-700">{labels.netLabel}</span>
            <span className="font-mono font-semibold text-slate-900" data-testid="weighbridge-net">{net ?? '—'}</span>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              className="btn--primary"
              data-testid="weighbridge-submit"
              disabled={pending || onSite.length === 0}
              aria-busy={pending}
            >
              {pending ? labels.submitting : labels.submit}
            </Button>
          </div>
        </form>
      </section>

      <section className="card" aria-labelledby="weighbridge-recent-heading">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 id="weighbridge-recent-heading" className="text-sm font-semibold text-slate-800">{labels.recentTitle}</h2>
        </div>
        {recent.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400" data-testid="weighbridge-recent-empty">{labels.recentEmpty}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="weighbridge-recent-table">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-3 py-2">{labels.columns.vehicle}</th>
                  <th scope="col" className="px-3 py-2">{labels.columns.carrier}</th>
                  <th scope="col" className="px-3 py-2 text-right">{labels.columns.gross}</th>
                  <th scope="col" className="px-3 py-2 text-right">{labels.columns.tare}</th>
                  <th scope="col" className="px-3 py-2 text-right">{labels.columns.net}</th>
                  <th scope="col" className="px-3 py-2">{labels.columns.weighedAt}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map((w) => (
                  <tr key={w.id} data-testid={`weighing-row-${w.id}`}>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800">{w.vehicleReg}</td>
                    <td className="px-3 py-2 text-slate-700">{w.carrierName ?? labels.noCarrier}</td>
                    <td className="px-3 py-2 text-right font-mono">{w.grossKg}</td>
                    <td className="px-3 py-2 text-right font-mono">{w.tareKg}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{w.netKg}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{formatDateTime(w.weighedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
