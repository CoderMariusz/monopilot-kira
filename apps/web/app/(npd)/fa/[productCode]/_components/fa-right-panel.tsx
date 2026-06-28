'use client';

import React from 'react';
import { Button } from '@monopilot/ui/Button';

type FaStatus = 'Built' | 'Pending' | 'Blocked' | 'Complete';

export type FaRightPanelFa = {
  code?: string;
  fa_code?: string;
  name?: string;
  product_name?: string;
  owner: string;
  last_updated: string;
  days_to_launch: number;
  built: boolean;
  status?: FaStatus;
  status_overall?: FaStatus;
};

export type FaRightPanelProps = {
  fa: FaRightPanelFa;
  gateProgress: number;
  onOpenModal: (modal: 'deptClose' | 'd365Build', payload: { fa: FaRightPanelFa }) => void;
};

type BadgeVariant = 'default' | 'secondary' | 'destructive';

function Card({ children }: React.PropsWithChildren) {
  return (
    <section data-slot="card" className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {children}
    </section>
  );
}

function CardHeader({ children }: React.PropsWithChildren) {
  return (
    <div data-slot="card-header" className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
      {children}
    </div>
  );
}

function CardContent({ children }: React.PropsWithChildren) {
  return (
    <div data-slot="card-content" className="space-y-4 px-4 py-4">
      {children}
    </div>
  );
}

function Badge({ children, variant = 'secondary' }: React.PropsWithChildren<{ variant?: BadgeVariant }>) {
  const variantClassName =
    variant === 'destructive'
      ? 'border-red-200 bg-red-50 text-red-700'
      : variant === 'default'
        ? 'border-blue-200 bg-blue-50 text-blue-700'
        : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${variantClassName}`}
    >
      {children}
    </span>
  );
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function Progress({ value, label }: { value: number; label: string }) {
  const safeValue = clampProgress(value);

  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={safeValue}
      className="h-2 overflow-hidden rounded-full bg-slate-100"
      data-slot="progress"
      role="progressbar"
    >
      <div className="h-full rounded-full bg-blue-600" style={{ width: `${safeValue}%` }} />
    </div>
  );
}

function statusVariant(status: FaStatus): BadgeVariant {
  if (status === 'Blocked') return 'destructive';
  if (status === 'Built' || status === 'Complete') return 'default';
  return 'secondary';
}

export function FaRightPanel({ fa, gateProgress, onOpenModal }: FaRightPanelProps) {
  const faCode = fa.fa_code ?? fa.code ?? 'FA';
  const productName = fa.product_name ?? fa.name ?? 'Finished good';
  const status = fa.status_overall ?? fa.status ?? (fa.built ? 'Built' : 'Pending');
  const builtLabel = fa.built ? 'Built' : 'Not built';

  return (
    <aside
      aria-label="FG right panel validation status"
      className="sticky top-4 self-start"
      data-prototype-anchor="npd/fa-screens.jsx:404-452"
    >
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Validation status</h2>
            <p className="mt-1 text-xs text-slate-500">Right panel summary</p>
          </div>
          <Badge variant={statusVariant(status)}>Status: {status}</Badge>
        </CardHeader>

        <CardContent>
          <div className="space-y-2 text-sm">
            <div>
              <div className="font-mono text-xs font-semibold text-blue-700">{faCode}</div>
              <div className="mt-1 font-medium text-slate-900">{productName}</div>
            </div>
            <dl className="grid gap-2 text-xs text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <dt>Owner</dt>
                <dd className="font-medium text-slate-800">{fa.owner}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Last updated</dt>
                <dd className="font-medium text-slate-800">{fa.last_updated}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Launch</dt>
                <dd className="font-medium text-slate-800">{fa.days_to_launch} days</dd>
              </div>
            </dl>
            <Badge variant={fa.built ? 'default' : 'secondary'}>{builtLabel}</Badge>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick actions</h3>
            <div className="grid gap-2">
              <Button className="justify-center" type="button" onClick={() => onOpenModal('deptClose', { fa })}>
                Dept Close
              </Button>
              <Button className="justify-center" type="button" onClick={() => onOpenModal('d365Build', { fa })}>
                D365 Build
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Gate progress</span>
              <span className="font-medium text-slate-800">{clampProgress(gateProgress)}%</span>
            </div>
            <Progress label="Gate progress" value={gateProgress} />
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}

export default FaRightPanel;
