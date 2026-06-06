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

import { previewPromotion } from './_actions/previewPromotion';
import { submitPromotion } from './_actions/submitPromotion';

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

export type SubmitPromotionResult =
  | { ok: true; data: { id: string; status: string; artefact: string; target: string } }
  | { ok: false; error: string; message?: string };
export type PreviewPromotionResult =
  | { ok: true; data: { artefact: string; from: string; target: string; before: string; after: string; affectsCount: number } }
  | { ok: false; error: string; message?: string };

export type SubmitPromotionAction = (input: { artefact: string; target: TargetStage; from: string; reason: string }) => Promise<SubmitPromotionResult>;
export type PreviewPromotionAction = (input: { artefact: string; target: TargetStage; from: string }) => Promise<PreviewPromotionResult>;

export type PromotionsScreenProps = {
  labels: Labels; promotionStages: PromotionStage[]; promotions: PromotionRecord[]; tenantMigrations: TenantMigrationRow[];
  callerAccess: CallerAccess; state: PageState; initialTab: 'active' | 'history';
  // Real Server Actions (injectable for tests). Default to the production actions.
  submitAction?: SubmitPromotionAction;
  previewAction?: PreviewPromotionAction;
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

export default function PromotionsScreen({ labels, promotionStages, promotions, tenantMigrations, callerAccess, state, initialTab, submitAction, previewAction }: PromotionsScreenProps) {
  const [activeTab, setActiveTab] = React.useState<'active' | 'history'>(initialTab);
  const [dialog, setDialog] = React.useState<DialogState>(null);
  React.useEffect(() => setActiveTab(initialTab), [initialTab]);

  // Default to the real Server Actions; tests may inject deterministic stubs.
  const submit = submitAction ?? (submitPromotion as unknown as SubmitPromotionAction);
  const preview = previewAction ?? (previewPromotion as unknown as PreviewPromotionAction);

  if (!callerAccess.roleCodes.includes('Admin')) {
    return h('main', { 'data-testid': 'settings-promotions-screen', 'data-route': '/settings/promotions', 'data-screen': 'promotions_screen', className: 'space-y-3 p-6' },
      h('section', { role: 'alert', className: 'alert alert-amber' },
        h('h1', { className: 'alert-title page-title' }, '403'),
        h('p', { className: 'mt-1 text-[13px]' }, labels.forbidden),
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
        h('h1', { className: 'page-title' }, labels.title),
        h('p', { className: 'muted mt-1 text-[13px]' }, labels.subtitle),
      ),
      h(Button, { type: 'button', className: 'btn btn-primary', disabled, onClick: () => setDialog({ kind: 'create' }) }, labels.startPromotion),
    ),
    h('nav', { 'data-region': 'promotion-tabs', role: 'tablist', 'aria-label': 'Promotions', className: 'tabs' },
      h('button', { type: 'button', role: 'tab', 'aria-selected': activeTab === 'active', className: `tab ${activeTab === 'active' ? 'active' : ''}`, onClick: () => setActiveTab('active') }, labels.activeTab),
      h('button', { type: 'button', role: 'tab', 'aria-selected': activeTab === 'history', className: `tab ${activeTab === 'history' ? 'active' : ''}`, onClick: () => setActiveTab('history') }, labels.historyTab),
    ),
    activeTab === 'active'
      ? h(React.Fragment, null,
          h(StageOverview, { labels, promotionStages }),
          h(ActivePromotions, { labels, promotions, state, onDiff: (promotion: PromotionRecord) => setDialog({ kind: 'diff', promotion }) }),
        )
      : h(HistoryTable, { labels, rows: historyRows }),
    dialog ? h(PromoteDialog, { dialog, labels, onClose: () => setDialog(null), submitAction: submit, previewAction: preview }) : null,
  );
}

function StageOverview({ labels, promotionStages }: { labels: Labels; promotionStages: PromotionStage[] }) {
  return h('section', { 'data-region': 'promotion-stage-overview', 'aria-labelledby': 'promotion-stage-overview-title' },
    h('h2', { id: 'promotion-stage-overview-title', className: 'card-title mb-2' }, labels.stageOverview),
    h('div', { className: 'grid gap-3 md:grid-cols-3' },
      ...promotionStages.map((stage) => (h as any)(Card, { key: stage.id, 'data-testid': 'promotion-stage-card', className: 'kpi !mb-0' },
        h(CardHeader, { className: '!p-0' },
          h('div', { className: 'flex items-start justify-between gap-3' },
            h('div', null,
              h('h3', { 'data-testid': 'promotion-stage-label', className: 'kpi-label' }, stage.label),
              h(CardDescription, { className: 'muted mt-1 text-[11px]' }, stage.description),
            ),
            h('span', { 'data-testid': 'promotion-stage-count', className: 'kpi-value' }, String(stage.count)),
          ),
        ),
      )),
    ),
  );
}

function ActivePromotions({ labels, promotions, state, onDiff }: { labels: Labels; promotions: PromotionRecord[]; state: PageState; onDiff: (promotion: PromotionRecord) => void }) {
  let content: React.ReactNode;
  if (state === 'error') content = h('div', { role: 'alert', className: 'alert alert-red' }, labels.error);
  else if (state === 'loading') content = h('div', { role: 'status', className: 'card empty-state' }, labels.loading);
  else if (state === 'empty' || promotions.length === 0) content = h('div', { role: 'status', className: 'card empty-state' },
    h('div', { className: 'empty-state-icon', 'aria-hidden': 'true' }, '🚀'),
    h('div', { className: 'empty-state-body' }, labels.empty),
  );
  else content = h('div', { className: 'space-y-2' }, ...promotions.map((promotion) => (h as any)(Card, { key: promotion.id, 'data-testid': 'promotion-row', className: 'card !mb-0' },
    h(CardContent, { className: 'grid grid-cols-[1fr_auto] items-center gap-3 !p-0' },
      h('div', null,
        h('div', { 'data-testid': 'promotion-artefact', className: 'mono text-[13px] font-semibold text-[var(--text)]' }, promotion.artefact),
        h('p', { className: 'muted mt-1 text-[11px]' }, `${promotion.from} → ${promotion.to} · ${promotion.requester} · ${promotion.affects}`),
      ),
      h('div', { className: 'flex items-center gap-2' },
        (h as any)(Badge, { 'data-testid': 'promotion-status', variant: promotion.status === 'pending' ? 'warning' : 'info' }, promotion.status),
        h(Button, { type: 'button', className: 'btn btn-secondary btn-sm', onClick: () => onDiff(promotion) }, 'View diff'),
      ),
    ),
  )));
  return h('section', { 'data-region': 'active-promotions', 'aria-labelledby': 'active-promotions-title' },
    h('h2', { id: 'active-promotions-title', className: 'card-title mb-2' }, labels.activePromotions),
    content,
  );
}

function HistoryTable({ labels, rows }: { labels: Labels; rows: TenantMigrationRow[] }) {
  return h('section', { 'data-region': 'promotion-history', 'aria-labelledby': 'promotion-history-title' },
    h('h2', { id: 'promotion-history-title', className: 'card-title mb-2' }, labels.historyTitle),
    h(Table, { 'aria-label': labels.historyTitle, className: 'table w-full' },
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

function PromoteDialog({ dialog, labels, onClose, submitAction, previewAction }: { dialog: Exclude<DialogState, null>; labels: Labels; onClose: () => void; submitAction: SubmitPromotionAction; previewAction: PreviewPromotionAction }) {
  const promotion = dialog.kind === 'diff' ? dialog.promotion : null;
  const [step, setStep] = React.useState<WizardStep>('select');
  const [done, setDone] = React.useState<Set<WizardStep>>(new Set());
  const [artefact, setArtefact] = React.useState(promotion?.artefact ?? '');
  const [target, setTarget] = React.useState<TargetStage>((promotion?.to as TargetStage | undefined) ?? 'L2-local');
  const [reason, setReason] = React.useState('');
  const from = promotion?.from ?? 'L3-tenant';

  // Real preview state (replaces the prototype's hardcoded JSON diff).
  const [preview, setPreview] = React.useState<{ before: string; after: string; affects: string } | null>(null);
  // Submit state machine (optimistic + error).
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);

  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);

  const titleId = promotion ? `promotion-dialog-${promotion.id}` : 'promotion-dialog-create';
  React.useEffect(() => {
    const dialogNode = document.querySelector<HTMLElement>('[data-modal-id="SM-05"]');
    dialogNode?.setAttribute('aria-labelledby', titleId);
    dialogNode?.focus();
  }, [titleId]);

  const goToDiff = () => {
    setDone((prev) => new Set([...prev, 'select']));
    setStep('diff');
    // Fire the REAL preview action for the selected artefact + target.
    void Promise.resolve(previewAction({ artefact, target, from })).then((result) => {
      if (!mounted.current) return;
      if (result.ok) {
        setPreview({ before: result.data.before, after: result.data.after, affects: `${result.data.affectsCount} tenant(s)` });
      } else {
        setPreview(null);
      }
    }).catch(() => { if (mounted.current) setPreview(null); });
  };
  const next = () => {
    if (step === 'select') return goToDiff();
    setDone((prev) => new Set([...prev, step]));
    setStep('review');
  };
  const back = () => setStep(step === 'review' ? 'diff' : 'select');

  const onSubmit = () => {
    if (reason.length < 10 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    void Promise.resolve(submitAction({ artefact, target, from, reason })).then((result) => {
      if (!mounted.current) return;
      setSubmitting(false);
      if (result.ok) {
        setSubmitted(true);
        onClose();
      } else {
        setSubmitError(result.error);
      }
    }).catch(() => {
      if (!mounted.current) return;
      setSubmitting(false);
      setSubmitError('persistence_failed');
    });
  };

  const title = promotion ? `Promotion ${promotion.id}` : 'Start L1→L2→L3 promotion';

  return h(Modal as any, { open: true, onOpenChange: (open: boolean) => !open && onClose(), size: 'xl', modalId: 'SM-05' },
    h('div', { className: 'modal-head' },
      h('div', null,
        h('h2', { id: titleId, className: 'modal-title' }, title),
        h('p', { className: 'muted mt-0.5 text-[11px]' }, promotion?.diff ?? 'Promote a rule, flag, schema column or email template to a wider environment.'),
      ),
    ),
    h((Modal as any).Body, null,
      h('div', { className: 'modal-body' },
        h(PromotionStepper, { current: step, done }),
        step === 'select' ? h(SelectStep, { artefact, setArtefact, target, setTarget: (value: string) => setTarget(value as TargetStage) }) : null,
        step === 'diff' ? h(DiffStep, { target, before: preview?.before ?? null, after: preview?.after ?? null, affects: preview?.affects ?? promotion?.affects ?? '—' }) : null,
        step === 'review' ? h(ReviewStep, { artefact, from, target, affects: preview?.affects ?? promotion?.affects ?? '—', reason, setReason }) : null,
        submitError ? h('div', { role: 'alert', className: 'alert alert-red mt-3' }, `${labels.error} (${submitError})`) : null,
        submitted ? h('div', { role: 'status', className: 'alert alert-green mt-3' }, 'Promotion submitted.') : null,
      ),
    ),
    h((Modal as any).Footer, null,
      h('div', { className: 'modal-foot' },
        step !== 'select' ? h(Button, { type: 'button', className: 'btn btn-ghost btn-sm mr-auto', onClick: back }, '← Back') : null,
        h(Button, { type: 'button', className: 'btn btn-secondary btn-sm', onClick: onClose }, 'Cancel'),
        step === 'select'
          ? h(Button, { type: 'button', className: 'btn btn-primary btn-sm', disabled: artefact.length < 3, onClick: next }, 'Next: preview →')
          : step === 'diff'
            ? h(Button, { type: 'button', className: 'btn btn-primary btn-sm', onClick: next }, 'Next: confirm →')
            : h(Button, { type: 'button', className: 'btn btn-primary btn-sm', disabled: reason.length < 10 || submitting, onClick: onSubmit }, submitting ? 'Submitting…' : 'Submit promotion'),
      ),
    ),
  );
}

function SelectStep({ artefact, setArtefact, target, setTarget }: { artefact: string; setArtefact: (value: string) => void; target: string; setTarget: (value: string) => void }) {
  return h('div', { className: 'mt-3.5' },
    h(LabeledControl, { label: 'Artefact to promote', htmlFor: 'promotion-artefact', required: true, help: 'Rule / flag / schema / email template. Format: category.code.' },
      h(Input, { id: 'promotion-artefact', 'aria-label': 'Artefact to promote', value: artefact, onChange: (event: React.ChangeEvent<HTMLInputElement>) => setArtefact(event.currentTarget.value), className: 'form-input mono', placeholder: 'rules.cycle_count_variance_v1' }),
    ),
    h(LabeledControl, { label: 'Target stage', htmlFor: 'promotion-target', required: true },
      h(Select, { value: target, onValueChange: setTarget, options: TARGET_OPTIONS },
        h(SelectTrigger, { 'aria-label': 'Target stage', className: 'min-w-[220px]' }, h(SelectValue, null)),
      ),
    ),
    h('div', { className: 'alert alert-blue mt-2.5 text-[12px]' }, 'L1 promotions are reviewed by Monopilot SRE. Turnaround: 3–5 business days.'),
  );
}

function DiffStep({ target, before, after, affects }: { target: string; before: string | null; after: string | null; affects: string }) {
  // before/after are the REAL preview JSON from previewPromotion (Server Action).
  // While the preview action resolves they are null — show a pending placeholder
  // but keep the labelled panes so the structure stays prototype-faithful.
  const pending = before === null || after === null;
  const beforeText = before ?? 'Loading current value…';
  const afterText = after ?? 'Loading target value…';
  return h('div', { className: 'mt-3.5 space-y-2.5' },
    pending ? h('div', { role: 'status', className: 'muted text-[11px]' }, 'Computing live diff…') : null,
    h('div', { className: 'grid grid-cols-2 gap-3.5' },
      h('div', null, h('div', { className: 'muted mb-1 text-[11px] uppercase' }, 'Current (before)'), h('pre', { 'data-testid': 'promotion-diff-before', className: 'mono m-0 min-h-[180px] rounded-md bg-[var(--gray-100)] p-2.5 text-[11px]' }, beforeText)),
      h('div', null, h('div', { className: 'muted mb-1 text-[11px] uppercase' }, `Target (${target})`), h('pre', { 'data-testid': 'promotion-diff-after', className: 'mono m-0 min-h-[180px] rounded-md bg-[#ecfccb] p-2.5 text-[11px]' }, afterText)),
    ),
    h('div', { className: 'alert alert-amber text-[12px]' }, h('b', null, 'Impact:'), ' This migration affects ', h('b', null, affects), '. Existing L3 overrides will be preserved.'),
  );
}

function ReviewStep({ artefact, from, target, affects, reason, setReason }: { artefact: string; from: string; target: string; affects: string; reason: string; setReason: (value: string) => void }) {
  return h('div', { className: 'mt-3.5 space-y-2.5' },
    h('dl', { className: 'grid grid-cols-[160px_1fr] gap-2 rounded-md border border-[var(--border)] p-3 text-[13px]' },
      h('dt', { className: 'muted' }, 'Artefact'), h('dd', { className: 'mono font-semibold' }, artefact),
      h('dt', { className: 'muted' }, 'From → To'), h('dd', { className: 'font-semibold' }, `${from} → ${target}`),
      h('dt', { className: 'muted' }, 'Affects'), h('dd', null, affects),
    ),
    h(LabeledControl, { label: 'Justification (audit-logged)', htmlFor: 'promotion-justification', required: true },
      h(Textarea, { id: 'promotion-justification', 'aria-label': 'Justification', value: reason, onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setReason(event.currentTarget.value), className: 'form-input min-h-[96px]', placeholder: 'Why should this be promoted now?' }),
    ),
  );
}

function PromotionStepper({ current, done }: { current: WizardStep; done: Set<WizardStep> }) {
  return h('ol', { className: 'wiz-stepper', 'aria-label': 'Promotion steps' },
    ...WIZARD_STEPS.flatMap((step, index) => {
      const isDone = done.has(step.key);
      const isCurrent = current === step.key;
      const stepNode = h('li', {
        key: step.key,
        'data-complete': isDone || undefined,
        className: `wiz-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`,
      },
        h('span', { className: 'wiz-step-num', 'aria-hidden': 'true' }, isDone ? '✓' : String(index + 1)),
        h('span', { className: 'wiz-step-label', 'aria-current': isCurrent ? 'step' : undefined }, step.label),
      );
      const line = index < WIZARD_STEPS.length - 1
        ? h('li', { key: `${step.key}-line`, 'aria-hidden': 'true', className: `wiz-step-line ${isDone ? 'done' : ''}` })
        : null;
      return line ? [stepNode, line] : [stepNode];
    }),
  );
}

function LabeledControl({ label, htmlFor, required, help, children }: { label: string; htmlFor: string; required?: boolean; help?: string; children?: React.ReactNode }) {
  return h('div', { className: 'ff' },
    h('label', { htmlFor }, label, required ? h('span', { className: 'req', 'aria-hidden': 'true' }, ' *') : null),
    children,
    help ? h('p', { className: 'ff-help' }, help) : null,
  );
}
