'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardDescription, CardHeader } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import { Select, SelectTrigger, SelectValue, type SelectOption } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';
import Textarea from '@monopilot/ui/Textarea';

const h = React.createElement;

export type PromotionStage = { id: string; label: string; description: string; count: number };
export type PromotionRecord = { id: string; artefact: string; from: string; to: string; status: string; requester: string; affects: string; diff: string };
export type TenantMigrationRow = { id: string; status: string; component: string; currentVersion: string; targetVersion: string; lastRunAt: string; scheduledBy: string };
export type CallerAccess = { roleCodes: string[]; permissions: string[] };
export type PageState = 'ready' | 'loading' | 'empty' | 'error';
export type Labels = {
  title: string; subtitle: string; startPromotion: string; activeTab: string; historyTab: string; stageOverview: string;
  activePromotions: string; historyTitle: string; loading: string; empty: string; error: string; forbidden: string;
};
export type PromotionsScreenProps = {
  labels: Labels; promotionStages: PromotionStage[]; promotions: PromotionRecord[]; tenantMigrations: TenantMigrationRow[];
  callerAccess: CallerAccess; state: PageState; initialTab: 'active' | 'history';
};

type DialogState = { kind: 'create' } | { kind: 'diff'; promotion: PromotionRecord } | null;
type WizardStep = 'select' | 'diff' | 'review';
type TargetStage = 'L2-local' | 'L1-core';

const HISTORY_STATUSES = new Set(['completed', 'rolled_back']);
const TARGET_OPTIONS: SelectOption[] = [
  { value: 'L2-local', label: 'L2 · Shared local' },
  { value: 'L1-core', label: 'L1 · Core / universal' },
];
const WIZARD_STEPS: Array<{ key: WizardStep; label: string }> = [
  { key: 'select', label: 'Select artefact' },
  { key: 'diff', label: 'Preview diff' },
  { key: 'review', label: 'Confirm + reason' },
];

export default function PromotionsScreen({ labels, promotionStages, promotions, tenantMigrations, callerAccess, state, initialTab }: PromotionsScreenProps) {
  const [activeTab, setActiveTab] = React.useState<'active' | 'history'>(initialTab);
  const [dialog, setDialog] = React.useState<DialogState>(null);
  React.useEffect(() => setActiveTab(initialTab), [initialTab]);

  if (!callerAccess.roleCodes.includes('Admin')) {
    return h('main', { 'data-testid': 'settings-promotions-screen', 'data-route': '/settings/promotions', 'data-screen': 'promotions_screen', className: 'space-y-3 p-6' },
      h('section', { role: 'alert', className: 'rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-950' },
        h('h1', { className: 'text-2xl font-semibold' }, '403'),
        h('p', { className: 'mt-2 text-sm' }, labels.forbidden),
      ),
    );
  }

  const disabled = state === 'loading' || state === 'error';
  const historyRows = tenantMigrations.filter((row) => HISTORY_STATUSES.has(row.status));

  return h('main', {
    'data-testid': 'settings-promotions-screen',
    'data-route': '/settings/promotions',
    'data-screen': 'promotions_screen',
    'data-prototype-source': 'prototypes/design/Monopilot Design System/settings/modals.jsx:262-375',
    className: 'space-y-3 p-6',
    'aria-busy': state === 'loading',
  },
    h('header', { 'data-region': 'page-head', className: 'flex items-start justify-between gap-4' },
      h('div', null,
        h('h1', { className: 'text-2xl font-semibold tracking-tight text-slate-950' }, labels.title),
        h('p', { className: 'mt-1 text-sm text-slate-600' }, labels.subtitle),
      ),
      h(Button, { type: 'button', className: 'btn-primary', disabled, onClick: () => setDialog({ kind: 'create' }) }, labels.startPromotion),
    ),
    h('nav', { 'data-region': 'promotion-tabs', role: 'tablist', 'aria-label': 'Promotions', className: 'flex gap-2 border-b border-slate-200' },
      h('button', { type: 'button', role: 'tab', 'aria-selected': activeTab === 'active', className: 'px-3 py-2 text-sm font-medium', onClick: () => setActiveTab('active') }, labels.activeTab),
      h('button', { type: 'button', role: 'tab', 'aria-selected': activeTab === 'history', className: 'px-3 py-2 text-sm font-medium', onClick: () => setActiveTab('history') }, labels.historyTab),
    ),
    activeTab === 'active'
      ? h(React.Fragment, null,
          h(StageOverview, { labels, promotionStages }),
          h(ActivePromotions, { labels, promotions, state, onDiff: (promotion: PromotionRecord) => setDialog({ kind: 'diff', promotion }) }),
        )
      : h(HistoryTable, { labels, rows: historyRows }),
    dialog ? h(PromoteDialog, { dialog, onClose: () => setDialog(null) }) : null,
  );
}

function StageOverview({ labels, promotionStages }: { labels: Labels; promotionStages: PromotionStage[] }) {
  return h('section', { 'data-region': 'promotion-stage-overview', 'aria-labelledby': 'promotion-stage-overview-title' },
    h('h2', { id: 'promotion-stage-overview-title', className: 'mb-2 text-base font-semibold text-slate-950' }, labels.stageOverview),
    h('div', { className: 'grid gap-3 md:grid-cols-3' },
      ...promotionStages.map((stage) => (h as any)(Card, { key: stage.id, 'data-testid': 'promotion-stage-card', className: 'rounded-xl border border-slate-200 bg-white shadow-sm' },
        h(CardHeader, { className: 'p-4' },
          h('div', { className: 'flex items-start justify-between gap-3' },
            h('div', null,
              h('h3', { 'data-testid': 'promotion-stage-label', className: 'text-sm font-semibold text-slate-950' }, stage.label),
              h(CardDescription, { className: 'mt-1 text-xs text-slate-500' }, stage.description),
            ),
            h('span', { 'data-testid': 'promotion-stage-count', className: 'text-2xl font-semibold text-slate-950' }, String(stage.count)),
          ),
        ),
      )),
    ),
  );
}

function ActivePromotions({ labels, promotions, state, onDiff }: { labels: Labels; promotions: PromotionRecord[]; state: PageState; onDiff: (promotion: PromotionRecord) => void }) {
  let content: React.ReactNode;
  if (state === 'error') content = h('div', { role: 'alert', className: 'rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900' }, labels.error);
  else if (state === 'loading') content = h('div', { role: 'status', className: 'rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700' }, labels.loading);
  else if (state === 'empty' || promotions.length === 0) content = h('div', { role: 'status', className: 'rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-700' }, labels.empty);
  else content = h('div', { className: 'space-y-2' }, ...promotions.map((promotion) => (h as any)(Card, { key: promotion.id, 'data-testid': 'promotion-row', className: 'rounded-xl border border-slate-200 bg-white shadow-sm' },
    h(CardContent, { className: 'grid grid-cols-[1fr_auto] items-center gap-3 p-4' },
      h('div', null,
        h('div', { 'data-testid': 'promotion-artefact', className: 'mono text-sm font-semibold text-slate-950' }, promotion.artefact),
        h('p', { className: 'mt-1 text-xs text-slate-500' }, `${promotion.from} → ${promotion.to} · ${promotion.requester} · ${promotion.affects}`),
      ),
      h('div', { className: 'flex items-center gap-2' },
        (h as any)(Badge, { 'data-testid': 'promotion-status', variant: promotion.status === 'pending' ? 'warning' : 'info' }, promotion.status),
        h(Button, { type: 'button', className: 'btn-secondary btn-sm', onClick: () => onDiff(promotion) }, 'View diff'),
      ),
    ),
  )));
  return h('section', { 'data-region': 'active-promotions', 'aria-labelledby': 'active-promotions-title' },
    h('h2', { id: 'active-promotions-title', className: 'mb-2 text-base font-semibold text-slate-950' }, labels.activePromotions),
    content,
  );
}

function HistoryTable({ labels, rows }: { labels: Labels; rows: TenantMigrationRow[] }) {
  return h('section', { 'data-region': 'promotion-history', 'aria-labelledby': 'promotion-history-title' },
    h('h2', { id: 'promotion-history-title', className: 'mb-2 text-base font-semibold text-slate-950' }, labels.historyTitle),
    h(Table, { 'aria-label': labels.historyTitle, className: 'w-full text-sm' },
      h(TableHeader, null, h(TableRow, null,
        h(TableHead, { scope: 'col' }, 'Migration'), h(TableHead, { scope: 'col' }, 'Component'), h(TableHead, { scope: 'col' }, 'Version'), h(TableHead, { scope: 'col' }, 'Status'), h(TableHead, { scope: 'col' }, 'Last run'), h(TableHead, { scope: 'col' }, 'Scheduled by'),
      )),
      h(TableBody, null, ...rows.map((row) => h(TableRow, { key: row.id },
        h(TableCell, { className: 'mono font-semibold' }, row.id),
        h(TableCell, null, row.component),
        h(TableCell, null, `${row.currentVersion} → ${row.targetVersion}`),
        h(TableCell, null, h(Badge, { variant: row.status === 'completed' ? 'success' : 'warning' }, row.status)),
        h(TableCell, null, row.lastRunAt),
        h(TableCell, null, row.scheduledBy),
      ))),
    ),
  );
}

function PromoteDialog({ dialog, onClose }: { dialog: Exclude<DialogState, null>; onClose: () => void }) {
  const promotion = dialog.kind === 'diff' ? dialog.promotion : null;
  const [step, setStep] = React.useState<WizardStep>('select');
  const [done, setDone] = React.useState<Set<WizardStep>>(new Set());
  const [artefact, setArtefact] = React.useState(promotion?.artefact ?? '');
  const [target, setTarget] = React.useState<TargetStage>((promotion?.to as TargetStage | undefined) ?? 'L2-local');
  const [reason, setReason] = React.useState('');
  const titleId = promotion ? `promotion-dialog-${promotion.id}` : 'promotion-dialog-create';
  React.useEffect(() => {
    const dialogNode = document.querySelector<HTMLElement>('[data-modal-id="SM-05"]');
    dialogNode?.setAttribute('aria-labelledby', titleId);
    dialogNode?.focus();
  }, [titleId]);
  const next = () => { setDone((prev) => new Set([...prev, step])); setStep(step === 'select' ? 'diff' : 'review'); };
  const back = () => setStep(step === 'review' ? 'diff' : 'select');
  const title = promotion ? `Promotion ${promotion.id}` : 'Start L1→L2→L3 promotion';

  return h(Modal as any, { open: true, onOpenChange: (open: boolean) => !open && onClose(), size: 'xl', modalId: 'SM-05' },
    h('div', { className: 'border-b border-slate-200 px-5 py-4' },
      h('h2', { id: titleId, className: 'text-base font-semibold text-slate-950' }, title),
      h('p', { className: 'mt-1 text-xs text-slate-500' }, promotion?.diff ?? 'Promote a rule, flag, schema column or email template to a wider environment.'),
    ),
    h((Modal as any).Body, null,
      h('div', { className: 'px-5 py-4 text-sm text-slate-700' },
        h(PromotionStepper, { current: step, done }),
        step === 'select' ? h(SelectStep, { artefact, setArtefact, target, setTarget: (value: string) => setTarget(value as TargetStage) }) : null,
        step === 'diff' ? h(DiffStep, { target, affects: promotion?.affects ?? '12 tenants' }) : null,
        step === 'review' ? h(ReviewStep, { artefact, from: promotion?.from ?? 'L3-tenant', target, affects: promotion?.affects ?? '12 tenants', reason, setReason }) : null,
      ),
    ),
    h((Modal as any).Footer, null,
      h('div', { className: 'flex w-full items-center justify-end gap-2 rounded-b-lg border-t border-slate-200 bg-slate-50 p-4' },
        step !== 'select' ? h(Button, { type: 'button', className: 'btn-ghost btn-sm mr-auto', onClick: back }, '← Back') : null,
        h(Button, { type: 'button', className: 'btn-secondary btn-sm', onClick: onClose }, 'Cancel'),
        step === 'select'
          ? h(Button, { type: 'button', className: 'btn-primary btn-sm', disabled: artefact.length < 3, onClick: next }, 'Next: preview →')
          : step === 'diff'
            ? h(Button, { type: 'button', className: 'btn-primary btn-sm', onClick: next }, 'Next: confirm →')
            : h(Button, { type: 'button', className: 'btn-primary btn-sm', disabled: reason.length < 10, onClick: onClose }, 'Submit promotion'),
      ),
    ),
  );
}

function SelectStep({ artefact, setArtefact, target, setTarget }: { artefact: string; setArtefact: (value: string) => void; target: string; setTarget: (value: string) => void }) {
  return h('div', { className: 'mt-4 space-y-3' },
    h(LabeledControl, { label: 'Artefact to promote', htmlFor: 'promotion-artefact', required: true, help: 'Rule / flag / schema / email template. Format: category.code.' },
      h(Input, { id: 'promotion-artefact', 'aria-label': 'Artefact to promote', value: artefact, onChange: (event: React.ChangeEvent<HTMLInputElement>) => setArtefact(event.currentTarget.value), className: 'mono w-full rounded-md border border-slate-300 px-3 py-2 text-sm', placeholder: 'rules.cycle_count_variance_v1' }),
    ),
    h(LabeledControl, { label: 'Target stage', htmlFor: 'promotion-target', required: true },
      h(Select, { value: target, onValueChange: setTarget, options: TARGET_OPTIONS },
        h(SelectTrigger, { 'aria-label': 'Target stage', className: 'min-w-[220px]' }, h(SelectValue, null)),
      ),
    ),
    h('div', { className: 'rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950' }, 'L1 promotions are reviewed by Monopilot SRE. Turnaround: 3–5 business days.'),
  );
}

function DiffStep({ target, affects }: { target: string; affects: string }) {
  return h('div', { className: 'mt-4 space-y-3' },
    h('div', { className: 'grid grid-cols-2 gap-4' },
      h('div', null, h('div', { className: 'mb-1 text-[11px] uppercase text-slate-500' }, 'Current (before)'), h('pre', { className: 'mono min-h-[180px] rounded-md bg-slate-100 p-3 text-[11px]' }, '{\n  "tier": "L2-local",\n  "variance_threshold": 0.05,\n  "audit_required_above": 0.10\n}')),
      h('div', null, h('div', { className: 'mb-1 text-[11px] uppercase text-slate-500' }, `Target (${target})`), h('pre', { className: 'mono min-h-[180px] rounded-md bg-lime-100 p-3 text-[11px]' }, `{\n  "tier": "${target}",\n  "variance_threshold": 0.10,\n  "audit_required_above": 0.10\n}`)),
    ),
    h('div', { className: 'rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950' }, h('b', null, 'Impact:'), ' This migration affects ', h('b', null, affects), '. Existing L3 overrides will be preserved.'),
  );
}

function ReviewStep({ artefact, from, target, affects, reason, setReason }: { artefact: string; from: string; target: string; affects: string; reason: string; setReason: (value: string) => void }) {
  return h('div', { className: 'mt-4 space-y-3' },
    h('dl', { className: 'grid grid-cols-[160px_1fr] gap-2 rounded-md border border-slate-200 p-3 text-sm' },
      h('dt', { className: 'text-slate-500' }, 'Artefact'), h('dd', { className: 'mono font-semibold' }, artefact),
      h('dt', { className: 'text-slate-500' }, 'From → To'), h('dd', { className: 'font-semibold' }, `${from} → ${target}`),
      h('dt', { className: 'text-slate-500' }, 'Affects'), h('dd', null, affects),
    ),
    h(LabeledControl, { label: 'Justification (audit-logged)', htmlFor: 'promotion-justification', required: true },
      h(Textarea, { id: 'promotion-justification', 'aria-label': 'Justification', value: reason, onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setReason(event.currentTarget.value), className: 'min-h-[96px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm', placeholder: 'Why should this be promoted now?' }),
    ),
  );
}

function PromotionStepper({ current, done }: { current: WizardStep; done: Set<WizardStep> }) {
  return h('ol', { className: 'flex gap-2', 'aria-label': 'Promotion steps' },
    ...WIZARD_STEPS.map((step) => h('li', { key: step.key, 'aria-current': current === step.key ? 'step' : undefined, 'data-complete': done.has(step.key) || undefined, className: 'rounded-full border border-slate-200 px-3 py-1 text-xs font-medium' }, step.label)),
  );
}

function LabeledControl({ label, htmlFor, required, help, children }: { label: string; htmlFor: string; required?: boolean; help?: string; children?: React.ReactNode }) {
  return h('div', { className: 'space-y-1' },
    h('label', { htmlFor, className: 'block text-sm font-medium text-slate-700' }, label, required ? h('span', { 'aria-hidden': 'true' }, ' *') : null),
    children,
    help ? h('p', { className: 'text-xs text-slate-500' }, help) : null,
  );
}
