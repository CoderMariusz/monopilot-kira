import React from 'react';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

const h = React.createElement;

type DataAttrs = Record<`data-${string}`, string | number | boolean | undefined>;
type DivProps = React.HTMLAttributes<HTMLDivElement> & DataAttrs;
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & DataAttrs;
type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & DataAttrs & { variant?: string };
type InputProps = React.InputHTMLAttributes<HTMLInputElement> & DataAttrs;
type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & DataAttrs;

function Button({ className, ...props }: ButtonProps) {
  return h('button', { 'data-slot': 'button', className: ['btn', className].filter(Boolean).join(' '), ...props });
}
function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  return h('span', { 'data-slot': 'badge', 'data-variant': variant, className: ['badge', `badge--${variant}`, className].filter(Boolean).join(' '), ...props });
}
function Card({ className, ...props }: DivProps) {
  return h('div', { 'data-slot': 'card', className: ['card', className].filter(Boolean).join(' '), ...props });
}
function CardHeader({ className, ...props }: DivProps) {
  return h('div', { 'data-slot': 'card-header', className: ['card__header', className].filter(Boolean).join(' '), ...props });
}
function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return h('p', { 'data-slot': 'card-description', className: ['card__description', className].filter(Boolean).join(' '), ...props });
}
function CardContent({ className, ...props }: DivProps) {
  return h('div', { 'data-slot': 'card-content', className: ['card__content', className].filter(Boolean).join(' '), ...props });
}
const Input = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => h('input', { 'data-slot': 'input', ref, ...props }));
Input.displayName = 'Input';
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>((props, ref) => h('textarea', { 'data-slot': 'textarea', ref, ...props }));
Textarea.displayName = 'Textarea';
function Select({ children }: { value?: string; onValueChange?: (value: string) => void; children?: React.ReactNode }) {
  return h('div', { 'data-slot': 'select' }, children);
}
function SelectTrigger({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return h('button', { type: 'button', role: 'combobox', 'aria-expanded': 'false', 'aria-haspopup': 'listbox', 'data-slot': 'select-trigger', className: ['select__trigger', className].filter(Boolean).join(' '), ...props }, children, h('span', { 'aria-hidden': 'true', 'data-slot': 'select-arrow' }, '⌄'));
}
function SelectValue() {
  return h('span', { 'data-slot': 'select-value' }, 'L2 · Shared local');
}
function Table(props: React.TableHTMLAttributes<HTMLTableElement>) { return h('table', { 'data-slot': 'table', ...props }); }
function TableHeader(props: React.HTMLAttributes<HTMLTableSectionElement>) { return h('thead', { 'data-slot': 'table-header', ...props }); }
function TableBody(props: React.HTMLAttributes<HTMLTableSectionElement>) { return h('tbody', { 'data-slot': 'table-body', ...props }); }
function TableRow(props: React.HTMLAttributes<HTMLTableRowElement>) { return h('tr', { 'data-slot': 'table-row', ...props }); }
function TableHead(props: React.ThHTMLAttributes<HTMLTableCellElement>) { return h('th', { 'data-slot': 'table-head', ...props }); }
function TableCell(props: React.TdHTMLAttributes<HTMLTableCellElement>) { return h('td', { 'data-slot': 'table-cell', ...props }); }

type PromotionStage = { id: string; label: string; description: string; count: number };
type PromotionRecord = {
  id: string;
  artefact: string;
  from: string;
  to: string;
  status: string;
  requester: string;
  affects: string;
  diff: string;
};
type TenantMigrationRow = {
  id: string;
  status: string;
  component: string;
  currentVersion: string;
  targetVersion: string;
  lastRunAt: string;
  scheduledBy: string;
};
type CallerAccess = { roleCodes: string[]; permissions: string[] };
type PageState = 'ready' | 'loading' | 'empty' | 'error';
type Props = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
  callerAccess?: CallerAccess;
  promotionStages?: PromotionStage[];
  promotions?: PromotionRecord[];
  tenantMigrations?: TenantMigrationRow[];
  state?: PageState;
};
type Labels = {
  title: string;
  subtitle: string;
  startPromotion: string;
  activeTab: string;
  historyTab: string;
  stageOverview: string;
  activePromotions: string;
  historyTitle: string;
  loading: string;
  empty: string;
  error: string;
  forbidden: string;
};
type DialogState = { kind: 'create' } | { kind: 'diff'; promotion: PromotionRecord } | null;
type WizardStep = 'select' | 'diff' | 'review';

const DEFAULT_LABELS: Labels = {
  title: 'Promotions',
  subtitle: 'Promote rules, flags, schema columns, and email templates across L3 → L2 → L1.',
  startPromotion: '+ Start promotion',
  activeTab: 'Active',
  historyTab: 'History',
  stageOverview: 'Promotion stages',
  activePromotions: 'Active promotions',
  historyTitle: 'Promotion history',
  loading: 'Loading promotions…',
  empty: 'No active promotions yet.',
  error: 'Unable to load promotions.',
  forbidden: 'Insufficient permissions',
};
const DEFAULT_CALLER_ACCESS: CallerAccess = {
  roleCodes: ['Admin'],
  permissions: ['settings.promotions.read', 'settings.promotions.approve'],
};
const DEFAULT_STAGES: PromotionStage[] = [
  { id: 'L3-tenant', label: 'L3 · Tenant', description: 'Tenant-local overrides and sandbox changes.', count: 0 },
  { id: 'L2-local', label: 'L2 · Shared local', description: 'Shared local changes available to multiple tenant sites.', count: 0 },
  { id: 'L1-core', label: 'L1 · Core / universal', description: 'Universal Monopilot defaults requiring controlled review.', count: 0 },
];
const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof Labels>;
const HISTORY_STATUSES = new Set(['completed', 'rolled_back']);

async function buildLabels(locale: string): Promise<Labels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.promotions' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        const translated = t(key);
        labels[key] = translated && translated !== key ? translated : DEFAULT_LABELS[key];
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as Labels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

export default async function PromotionsPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as Props;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const searchParams = props.searchParams ? await props.searchParams : {};
  return h(PromotionsScreen, {
    labels: await buildLabels(locale),
    promotionStages: props.promotionStages ?? DEFAULT_STAGES,
    promotions: props.promotions ?? [],
    tenantMigrations: props.tenantMigrations ?? [],
    callerAccess: props.callerAccess ?? DEFAULT_CALLER_ACCESS,
    state: props.state ?? ((props.promotions ?? []).length === 0 ? 'empty' : 'ready'),
    initialTab: searchParams.tab === 'history' ? 'history' : 'active',
  });
}

function PromotionsScreen({
  labels,
  promotionStages,
  promotions,
  tenantMigrations,
  callerAccess,
  state,
  initialTab,
}: {
  labels: Labels;
  promotionStages: PromotionStage[];
  promotions: PromotionRecord[];
  tenantMigrations: TenantMigrationRow[];
  callerAccess: CallerAccess;
  state: PageState;
  initialTab: 'active' | 'history';
}) {
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
      ...promotionStages.map((stage) => h(Card, { key: stage.id, 'data-testid': 'promotion-stage-card', className: 'rounded-xl border border-slate-200 bg-white shadow-sm' },
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
  else content = h('div', { className: 'space-y-2' }, ...promotions.map((promotion) => h(Card, { key: promotion.id, 'data-testid': 'promotion-row', className: 'rounded-xl border border-slate-200 bg-white shadow-sm' },
    h(CardContent, { className: 'grid grid-cols-[1fr_auto] items-center gap-3 p-4' },
      h('div', null,
        h('div', { 'data-testid': 'promotion-artefact', className: 'mono text-sm font-semibold text-slate-950' }, promotion.artefact),
        h('p', { className: 'mt-1 text-xs text-slate-500' }, `${promotion.from} → ${promotion.to} · ${promotion.requester} · ${promotion.affects}`),
      ),
      h('div', { className: 'flex items-center gap-2' },
        h(Badge, { 'data-testid': 'promotion-status', variant: promotion.status === 'pending' ? 'warning' : 'info' }, promotion.status),
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
  const [target, setTarget] = React.useState(promotion?.to ?? 'L2-local');
  const [reason, setReason] = React.useState('');
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const titleId = promotion ? `promotion-dialog-${promotion.id}` : 'promotion-dialog-create';
  React.useEffect(() => { dialogRef.current?.focus(); }, []);
  const next = () => { setDone((prev) => new Set([...prev, step])); setStep(step === 'select' ? 'diff' : 'review'); };
  const back = () => setStep(step === 'review' ? 'diff' : 'select');

  return h('div', { role: 'presentation', className: 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40' },
    h('div', { ref: dialogRef, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'data-modal-id': 'SM-05', 'data-slot': 'dialog-content', tabIndex: -1, className: 'w-[760px] rounded-lg bg-white shadow-2xl outline-none' },
      h('div', { className: 'border-b border-slate-200 px-5 py-4' },
        h('h2', { id: titleId, className: 'text-base font-semibold text-slate-950' }, promotion ? `Promotion ${promotion.id}` : 'Start L1→L2→L3 promotion'),
        h('p', { className: 'mt-1 text-xs text-slate-500' }, promotion?.diff ?? 'Promote a rule, flag, schema column or email template to a wider environment.'),
      ),
      h('div', { className: 'px-5 py-4 text-sm text-slate-700' }, h(Stepper, { current: step, done }), step === 'select' ? h(SelectStep, { artefact, setArtefact, target, setTarget }) : null, step === 'diff' ? h(DiffStep, { target, affects: promotion?.affects ?? '12 tenants' }) : null, step === 'review' ? h(ReviewStep, { artefact, from: promotion?.from ?? 'L3-tenant', target, affects: promotion?.affects ?? '12 tenants', reason, setReason }) : null),
      h('div', { className: 'flex items-center justify-end gap-2 rounded-b-lg border-t border-slate-200 bg-slate-50 p-4' },
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
    h(Field, { label: 'Artefact to promote', htmlFor: 'promotion-artefact', required: true, help: 'Rule / flag / schema / email template. Format: category.code.' },
      h(Input, { id: 'promotion-artefact', 'data-slot': 'input', 'aria-label': 'Artefact to promote', value: artefact, onChange: (event: React.ChangeEvent<HTMLInputElement>) => setArtefact(event.currentTarget.value), className: 'mono w-full rounded-md border border-slate-300 px-3 py-2 text-sm', placeholder: 'rules.cycle_count_variance_v1' }),
    ),
    h(Field, { label: 'Target stage', htmlFor: 'promotion-target', required: true },
      h(Select, { value: target, onValueChange: setTarget }, h(SelectTrigger, { 'aria-label': 'Target stage', className: 'min-w-[220px]' }, h(SelectValue, null))),
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
    h('div', { className: 'rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950' }, h('b', null, 'Impact:'), ` This migration affects `, h('b', null, affects), '. Existing L3 overrides will be preserved.'),
  );
}

function ReviewStep({ artefact, from, target, affects, reason, setReason }: { artefact: string; from: string; target: string; affects: string; reason: string; setReason: (value: string) => void }) {
  return h('div', { className: 'mt-4 space-y-3' },
    h('dl', { className: 'grid grid-cols-[160px_1fr] gap-2 rounded-md border border-slate-200 p-3 text-sm' },
      h('dt', { className: 'text-slate-500' }, 'Artefact'), h('dd', { className: 'mono font-semibold' }, artefact),
      h('dt', { className: 'text-slate-500' }, 'From → To'), h('dd', { className: 'font-semibold' }, `${from} → ${target}`),
      h('dt', { className: 'text-slate-500' }, 'Affects'), h('dd', null, affects),
    ),
    h(Field, { label: 'Justification (audit-logged)', htmlFor: 'promotion-justification', required: true },
      h(Textarea, { id: 'promotion-justification', 'data-slot': 'textarea', 'aria-label': 'Justification', value: reason, onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setReason(event.currentTarget.value), className: 'min-h-[96px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm', placeholder: 'Why should this be promoted now?' }),
    ),
  );
}

function Stepper({ current, done }: { current: WizardStep; done: Set<WizardStep> }) {
  const steps: Array<{ key: WizardStep; label: string }> = [
    { key: 'select', label: 'Select artefact' },
    { key: 'diff', label: 'Preview diff' },
    { key: 'review', label: 'Confirm + reason' },
  ];
  return h('ol', { className: 'flex gap-2', 'aria-label': 'Promotion steps' }, ...steps.map((step) => h('li', { key: step.key, 'aria-current': current === step.key ? 'step' : undefined, 'data-complete': done.has(step.key) || undefined, className: 'rounded-full border border-slate-200 px-3 py-1 text-xs font-medium' }, step.label)));
}

function Field({ label, htmlFor, required, help, children }: { label: string; htmlFor: string; required?: boolean; help?: string; children?: React.ReactNode }) {
  return h('div', { className: 'space-y-1' },
    h('label', { htmlFor, className: 'block text-sm font-medium text-slate-700' }, label, required ? h('span', { 'aria-hidden': 'true' }, ' *') : null),
    children,
    help ? h('p', { className: 'text-xs text-slate-500' }, help) : null,
  );
}
