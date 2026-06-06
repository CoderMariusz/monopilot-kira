'use client';

/**
 * T-120 — BriefDetailForm (brief_detail prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/brief-screens.jsx:84-231 (BriefDetail)
 *
 * Translation notes (prototype-index-npd.json#brief_detail):
 *   - Two-section subnav (Product details / Packaging)  → accessible role=tab / role=tabpanel
 *     tablist (matches the repo FaTabs parity pattern; radix Tabs stays inside packages/ui)
 *   - converted read-only Alert + disabled controls      → derived from data.status === 'converted'
 *     (RBAC `canWrite` is resolved server-side in page.tsx and never trusted from the client)
 *   - Section A product grid + comments textarea          → 13 RHF fields ( @monopilot/ui Input / Textarea )
 *   - Multi-template component table with inline editing  → react-hook-form useFieldArray; total weight
 *     computed via watch(); a destructive "Weight mismatch" Badge surfaces the V-NPD-BRF-001 check
 *   - Section B packaging (C14-C20)                        → 7 explicit @monopilot/ui Input fields
 *   - packaging_ext jsonb                                  → KeyValue list (Phase B.2 scaffold)
 *   - C21-C37 placeholders                                 → disabled inputs flagged with a 'TBD' Badge
 *   - Save draft / Mark complete                           → onSaveDraft / onMarkComplete adapters
 *     (saveBriefDraft / markBriefComplete Server Actions — owned by T-031/T-034, imported in page.tsx)
 *   - Mark complete CTA copy is "Complete brief for project" and routes to the linked Stage-Gate
 *     project (NOT FG/FA Core) per the e2e-spine red-line.
 *
 * Decimal weights are carried as STRINGS (never JS floats) end-to-end; the only
 * numeric coercion is the layout-only tolerance comparison (mirrors the
 * saveBriefDraft server-side micros check, kept here purely for the inline badge).
 */

import React from 'react';
import Link from 'next/link';
import { useFieldArray, useForm } from 'react-hook-form';

import { Button } from '@monopilot/ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type BriefTemplate = 'single_component' | 'multi_component';
export type BriefStatus = 'draft' | 'complete' | 'converted' | 'abandoned';

export type BriefComponentRow = {
  component: string | null;
  sliceCount: number | null;
  supplier: string | null;
  code: string | null;
  price: string | null;
  /** Weight in grams as a decimal STRING (never a float). */
  weights: string | null;
  /** Percentage as a decimal STRING. */
  pct: string | null;
};

export type BriefProductFields = {
  // Section A — product/summary line (brief_lines product + summary columns).
  // 13 fields total (parity AC#1): the 6 product-grid fields plus the 7
  // summary-line fields that carry the aggregate component figures.
  product: string | null;
  volume: string | null;
  devCode: string | null;
  packsPerCase: number | null;
  benchmark: string | null;
  comments: string | null;
  summaryComponent: string | null;
  summarySliceCount: number | null;
  summarySupplier: string | null;
  summaryCode: string | null;
  summaryPrice: string | null;
  /** Summary aggregate weight (grams) as a decimal STRING — drives V-NPD-BRF-001. */
  summaryWeights: string | null;
  summaryPct: string | null;
};

export type BriefPackagingFields = {
  primaryPackaging: string | null;
  secondaryPackaging: string | null;
  baseWebCode: string | null;
  baseWebPrice: string | null;
  topWebType: string | null;
  sleeveCartonCode: string | null;
  sleeveCartonPrice: string | null;
};

export type BriefDetailData = {
  briefId: string;
  devCode: string;
  productName: string | null;
  template: BriefTemplate;
  status: BriefStatus;
  /** Linked FG/FA code when converted (display only). */
  faCode: string | null;
  /** Linked Stage-Gate project id (Mark complete navigation target). */
  npdProjectId: string | null;
  product: BriefProductFields;
  components: BriefComponentRow[];
  packaging: BriefPackagingFields;
  /** Phase B.2 extension blob (C21-C37) rendered as a KeyValue list. */
  packagingExt: Record<string, string>;
  /** Target component weight total (grams) as a decimal STRING. */
  targetWeightG: string;
  /** Tolerance (grams) as a decimal STRING. */
  weightToleranceG: string;
};

export type BriefDetailLabels = {
  breadcrumbRoot: string;
  breadcrumbList: string;
  templateMulti: string;
  templateSingle: string;
  statusDraft: string;
  statusComplete: string;
  statusConverted: string;
  statusAbandoned: string;
  convertedTo: string;
  /** "{fa}" is replaced client-side. */
  convertedNotice: string;
  viewProject: string;
  saveDraft: string;
  saving: string;
  saved: string;
  saveError: string;
  markComplete: string;
  completing: string;
  completeError: string;
  tabProduct: string;
  tabPackaging: string;
  sectionATitle: string;
  sectionBTitle: string;
  fieldProduct: string;
  fieldVolume: string;
  fieldDevCode: string;
  fieldDevCodeHint: string;
  fieldPacksPerCase: string;
  fieldBenchmark: string;
  fieldComments: string;
  fieldComponent: string;
  fieldSliceCount: string;
  fieldSupplier: string;
  fieldCode: string;
  fieldPrice: string;
  fieldWeight: string;
  fieldPct: string;
  componentsTitle: string;
  addComponent: string;
  removeComponent: string;
  totalRow: string;
  weightMismatch: string;
  /** "{total}" is replaced client-side. */
  weightMismatchBody: string;
  fieldPrimaryPackaging: string;
  fieldSecondaryPackaging: string;
  fieldBaseWebCode: string;
  fieldBaseWebCodeHint: string;
  fieldBaseWebPrice: string;
  fieldTopWebType: string;
  fieldSleeveCartonCode: string;
  fieldSleeveCartonCodeHint: string;
  fieldSleeveCartonPrice: string;
  packagingExtTitle: string;
  packagingExtPending: string;
  packagingExtBody: string;
  packagingExtKey: string;
  packagingExtValue: string;
  tbd: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
};

/** Save draft adapter (page.tsx wraps saveBriefDraft — T-031). */
export type SaveDraftOutcome = { ok: boolean; error?: string };
export type SaveDraftCall = (briefId: string, fields: BriefFormValues) => Promise<SaveDraftOutcome>;

/** Mark complete adapter (page.tsx wraps markBriefComplete — T-034). */
export type MarkCompleteOutcome = { ok: boolean; npdProjectId?: string | null; error?: string };
export type MarkCompleteCall = (briefId: string) => Promise<MarkCompleteOutcome>;

/** The RHF form value shape (what saveBriefDraft receives). */
export type BriefFormValues = {
  product: BriefProductFields;
  components: BriefComponentRow[];
  packaging: BriefPackagingFields;
};

const TBD_FIELDS = [21, 22, 23, 24, 25, 26, 27, 28, 29] as const;

/** Parse a decimal STRING to fixed-point micros (no float math). */
function toMicros(value: string | null | undefined): bigint {
  const trimmed = (value ?? '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return 0n;
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, fraction = ''] = unsigned.split('.');
  const micros = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0').slice(0, 6) || '0');
  return negative ? -micros : micros;
}

function absBig(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function fromMicros(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key) => (key in vars ? vars[key] : `{${key}}`));
}

function statusBadge(status: BriefStatus, labels: BriefDetailLabels): { text: string; tone: string } {
  switch (status) {
    case 'complete':
      return { text: labels.statusComplete, tone: 'badge-amber' };
    case 'converted':
      return { text: labels.statusConverted, tone: 'badge-green' };
    case 'abandoned':
      return { text: labels.statusAbandoned, tone: 'badge-gray' };
    default:
      return { text: labels.statusDraft, tone: 'badge-gray' };
  }
}

function StateNotice({ state, labels }: { state: PageState; labels: BriefDetailLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="card muted" style={{ fontSize: 13 }}>
        {labels.loading}
      </div>
    );
  }
  if (state === 'empty') {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <div className="empty-state-title">{labels.empty}</div>
          <div className="empty-state-body">{labels.emptyBody}</div>
        </div>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="alert alert-red">
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="alert alert-red">
        {labels.forbidden}
      </div>
    );
  }
  return null;
}

type TabKey = 'product' | 'packaging';

export function BriefDetailForm({
  state = 'ready',
  data,
  labels,
  canWrite,
  onSaveDraft,
  onMarkComplete,
  onNavigateToProject,
  listHref = '/briefs',
}: {
  state?: PageState;
  data: BriefDetailData | null;
  labels: BriefDetailLabels;
  /** Resolved server-side; never trusted from the client. */
  canWrite: boolean;
  onSaveDraft?: SaveDraftCall;
  onMarkComplete?: MarkCompleteCall;
  onNavigateToProject?: (npdProjectId: string) => void;
  /**
   * T-121 (wiring): back-link target for the breadcrumb 'Briefs' crumb. Defaults
   * to the list route; the page passes the locale-prefixed href so back→list
   * preserves the user's place in the route group.
   */
  listHref?: string;
}) {
  const [tab, setTab] = React.useState<TabKey>('product');
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [completeState, setCompleteState] = React.useState<'idle' | 'completing' | 'error'>('idle');

  const form = useForm<BriefFormValues>({
    values: data
      ? { product: data.product, components: data.components, packaging: data.packaging }
      : { product: emptyProduct(), components: [], packaging: emptyPackaging() },
    mode: 'onChange',
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'components' });
  const watchedComponents = form.watch('components');

  if (state !== 'ready' || !data) {
    return (
      <main data-testid="brief-detail" aria-labelledby="brief-title" className="mx-auto w-full max-w-6xl">
        <header>
          <h1 id="brief-title" className="page-title">
            {labels.breadcrumbList}
          </h1>
        </header>
        <StateNotice state={state} labels={labels} />
      </main>
    );
  }

  const converted = data.status === 'converted';
  const readOnly = converted || !canWrite;
  const isMulti = data.template === 'multi_component';
  const badge = statusBadge(data.status, labels);
  const templateLabel = isMulti ? labels.templateMulti : labels.templateSingle;

  // V-NPD-BRF-001 inline check (mirrors saveBriefDraft micros tolerance).
  const totalMicros = (watchedComponents ?? []).reduce((sum, c) => sum + absBig(toMicros(c?.weights)), 0n);
  const targetMicros = toMicros(data.targetWeightG);
  const toleranceMicros = toMicros(data.weightToleranceG);
  const weightMismatch =
    isMulti && (watchedComponents ?? []).length > 0 && absBig(totalMicros - targetMicros) > toleranceMicros;
  const totalDisplay = fromMicros(totalMicros);

  async function handleSaveDraft() {
    if (!onSaveDraft || readOnly || saveState === 'saving') return;
    setSaveState('saving');
    try {
      const result = await onSaveDraft(data!.briefId, form.getValues());
      setSaveState(result.ok ? 'saved' : 'error');
    } catch {
      setSaveState('error');
    }
  }

  async function handleMarkComplete() {
    if (!onMarkComplete || readOnly || completeState === 'completing') return;
    setCompleteState('completing');
    try {
      const result = await onMarkComplete(data!.briefId);
      if (result.ok) {
        setCompleteState('idle');
        const target = result.npdProjectId ?? data!.npdProjectId;
        if (target) onNavigateToProject?.(target);
      } else {
        setCompleteState('error');
      }
    } catch {
      setCompleteState('error');
    }
  }

  const packagingExtEntries = Object.entries(data.packagingExt ?? {});

  return (
    <main data-testid="brief-detail" aria-labelledby="brief-title" className="mx-auto w-full max-w-6xl">
      {/* sticky-form-header parity (brief-screens.jsx:113-140) */}
      <header className="sticky-form-header" style={{ padding: '10px 0', marginBottom: 10 }}>
        <nav aria-label="breadcrumb" className="breadcrumb">
          <span>{labels.breadcrumbRoot}</span>
          <span aria-hidden> / </span>
          {/* T-121: 'Briefs' crumb is the back-link to the list (back→list). */}
          <Link href={listHref} data-testid="brief-detail-breadcrumb-list">
            {labels.breadcrumbList}
          </Link>
          <span aria-hidden> / </span>
          <span className="mono">{data.devCode}</span>
        </nav>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mono" style={{ fontSize: 16, color: 'var(--blue)', fontWeight: 600 }}>
              {data.devCode}
            </span>
            <h1 id="brief-title" style={{ fontSize: 18, fontWeight: 600 }}>
              {data.productName}
            </h1>
            <span data-slot="badge" className={`badge ${isMulti ? 'badge-blue' : 'badge-gray'}`}>
              {templateLabel}
            </span>
            <span data-slot="badge" className={`badge ${badge.tone}`} data-testid="brief-status-badge">
              {converted && data.faCode ? `${labels.convertedTo} → ${data.faCode}` : badge.text}
            </span>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-2">
              <Button type="button" className="btn-secondary" onClick={handleSaveDraft} disabled={saveState === 'saving'}>
                {saveState === 'saving' ? labels.saving : labels.saveDraft}
              </Button>
              {data.status === 'draft' && onMarkComplete && (
                <Button
                  type="button"
                  className="btn-success"
                  onClick={handleMarkComplete}
                  disabled={(weightMismatch && isMulti) || completeState === 'completing'}
                >
                  {completeState === 'completing' ? labels.completing : labels.markComplete}
                </Button>
              )}
            </div>
          )}
        </div>
        {saveState === 'saved' && (
          <p role="status" aria-live="polite" style={{ fontSize: 13, color: 'var(--green-700)' }}>
            {labels.saved}
          </p>
        )}
        {saveState === 'error' && (
          <p role="alert" style={{ fontSize: 13, color: 'var(--red-700)' }}>
            {labels.saveError}
          </p>
        )}
        {completeState === 'error' && (
          <p role="alert" style={{ fontSize: 13, color: 'var(--red-700)' }}>
            {labels.completeError}
          </p>
        )}
      </header>

      {converted && (
        <div role="status" className="alert alert-green">
          {interpolate(labels.convertedNotice, { fa: data.faCode ?? '' })}{' '}
          {data.npdProjectId && (
            <a href={`/npd/pipeline/${data.npdProjectId}`} style={{ color: 'var(--blue)', fontWeight: 500 }}>
              {labels.viewProject}
            </a>
          )}
        </div>
      )}

      {/* Product / Packaging tabs (accessible tablist; design-system tabs-counted chrome) */}
      <div data-slot="tabs" className="w-full">
        <div role="tablist" aria-label={labels.breadcrumbList} className="tabs-counted" style={{ marginBottom: 12 }}>
          {(
            [
              { key: 'product' as TabKey, label: labels.tabProduct },
              { key: 'packaging' as TabKey, label: labels.tabPackaging },
            ]
          ).map((t) => {
            const selected = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`brief-tab-${t.key}`}
                aria-controls={`brief-panel-${t.key}`}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(t.key)}
                className={`tabs-counted-tab${selected ? ' active' : ''}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Product details (Section A) ── */}
        <div
          role="tabpanel"
          id="brief-panel-product"
          aria-labelledby="brief-tab-product"
          hidden={tab !== 'product'}
          className="mt-3 space-y-4"
        >
          <div data-slot="card" data-testid="brief-section-a" className="card">
            <div className="card-title" style={{ marginBottom: 10 }}>
              {labels.sectionATitle}
            </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                <FieldText label={labels.fieldProduct} name="product.product" form={form} disabled={readOnly} />
                <FieldText label={labels.fieldVolume} name="product.volume" type="number" form={form} disabled={readOnly} />
                <FieldText
                  label={labels.fieldDevCode}
                  name="product.devCode"
                  hint={labels.fieldDevCodeHint}
                  form={form}
                  disabled={readOnly}
                  mono
                />
                <FieldNumberInt label={labels.fieldPacksPerCase} name="product.packsPerCase" form={form} disabled={readOnly} />
                <FieldText label={labels.fieldBenchmark} name="product.benchmark" form={form} disabled={readOnly} />
                {/* Summary-line aggregate fields (brief_lines summary row). */}
                <FieldText label={labels.fieldComponent} name="product.summaryComponent" form={form} disabled={readOnly} />
                <FieldNumberInt label={labels.fieldSliceCount} name="product.summarySliceCount" form={form} disabled={readOnly} />
                <FieldText label={labels.fieldSupplier} name="product.summarySupplier" form={form} disabled={readOnly} />
                <FieldText label={labels.fieldCode} name="product.summaryCode" form={form} disabled={readOnly} mono />
                <FieldText label={labels.fieldPrice} name="product.summaryPrice" form={form} disabled={readOnly} />
                <FieldText label={labels.fieldWeight} name="product.summaryWeights" type="number" form={form} disabled={readOnly} />
                <FieldText label={labels.fieldPct} name="product.summaryPct" form={form} disabled={readOnly} />
              </div>
              <div className="mt-4">
                <FieldArea label={labels.fieldComments} name="product.comments" form={form} disabled={readOnly} />
              </div>
          </div>

          {isMulti && (
            <div data-slot="card" className="card">
              <div className="card-head">
                <div className="card-title">{labels.componentsTitle}</div>
                {!readOnly && (
                  <Button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() =>
                      append({ component: '', sliceCount: null, supplier: '', code: '', price: '', weights: '0', pct: '0' })
                    }
                  >
                    {labels.addComponent}
                  </Button>
                )}
              </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{labels.fieldComponent}</TableHead>
                      <TableHead scope="col">{labels.fieldSliceCount}</TableHead>
                      <TableHead scope="col">{labels.fieldSupplier}</TableHead>
                      <TableHead scope="col">{labels.fieldCode}</TableHead>
                      <TableHead scope="col">{labels.fieldPrice}</TableHead>
                      <TableHead scope="col">{labels.fieldWeight}</TableHead>
                      <TableHead scope="col">{labels.fieldPct}</TableHead>
                      <TableHead scope="col">
                        <span className="sr-only">{labels.removeComponent}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((row, index) => (
                      <TableRow key={row.id} data-testid="component-row">
                        <TableCell>
                          <input className="form-input" aria-label={`${labels.fieldComponent} ${index + 1}`} disabled={readOnly} {...form.register(`components.${index}.component`)} />
                        </TableCell>
                        <TableCell>
                          <input
                            className="form-input"
                            type="number"
                            aria-label={`${labels.fieldSliceCount} ${index + 1}`}
                            disabled={readOnly}
                            {...form.register(`components.${index}.sliceCount`, { valueAsNumber: true })}
                          />
                        </TableCell>
                        <TableCell>
                          <input className="form-input" aria-label={`${labels.fieldSupplier} ${index + 1}`} disabled={readOnly} {...form.register(`components.${index}.supplier`)} />
                        </TableCell>
                        <TableCell>
                          <input className="form-input mono" aria-label={`${labels.fieldCode} ${index + 1}`} disabled={readOnly} {...form.register(`components.${index}.code`)} />
                        </TableCell>
                        <TableCell>
                          <input className="form-input" aria-label={`${labels.fieldPrice} ${index + 1}`} disabled={readOnly} {...form.register(`components.${index}.price`)} />
                        </TableCell>
                        <TableCell>
                          <input
                            className="form-input"
                            type="number"
                            aria-label={`${labels.fieldWeight} ${index + 1}`}
                            disabled={readOnly}
                            {...form.register(`components.${index}.weights`)}
                          />
                        </TableCell>
                        <TableCell>
                          <input className="form-input" aria-label={`${labels.fieldPct} ${index + 1}`} disabled={readOnly} {...form.register(`components.${index}.pct`)} />
                        </TableCell>
                        <TableCell>
                          {!readOnly && (
                            <Button type="button" className="btn-ghost btn-sm" aria-label={`${labels.removeComponent} ${index + 1}`} onClick={() => remove(index)}>
                              ✕
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow data-testid="component-total-row" className="font-semibold" style={{ background: 'var(--gray-050)' }}>
                      <TableCell>{labels.totalRow}</TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell className="mono" data-testid="component-total-weight">{totalDisplay}g</TableCell>
                      <TableCell />
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
                {weightMismatch && (
                  <div className="alert alert-amber mt-3" role="alert">
                    <span
                      data-slot="badge"
                      data-variant="destructive"
                      data-tone="destructive"
                      className="badge badge-red"
                      data-testid="weight-mismatch-badge"
                      style={{ marginRight: 8 }}
                    >
                      {labels.weightMismatch}
                    </span>
                    {interpolate(labels.weightMismatchBody, { total: totalDisplay })}
                  </div>
                )}
            </div>
          )}
        </div>

        {/* ── Packaging (Section B) ── */}
        <div
          role="tabpanel"
          id="brief-panel-packaging"
          aria-labelledby="brief-tab-packaging"
          hidden={tab !== 'packaging'}
          className="mt-3 space-y-4"
        >
          <div data-slot="card" data-testid="brief-section-b" className="card">
            <div className="card-title" style={{ marginBottom: 10 }}>
              {labels.sectionBTitle}
            </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                <PackagingField label={labels.fieldPrimaryPackaging} name="packaging.primaryPackaging" form={form} disabled={readOnly} />
                <PackagingField label={labels.fieldSecondaryPackaging} name="packaging.secondaryPackaging" form={form} disabled={readOnly} />
                <PackagingField
                  label={labels.fieldBaseWebCode}
                  name="packaging.baseWebCode"
                  hint={labels.fieldBaseWebCodeHint}
                  form={form}
                  disabled={readOnly}
                  mono
                />
                <PackagingField label={labels.fieldBaseWebPrice} name="packaging.baseWebPrice" form={form} disabled={readOnly} />
                <PackagingField label={labels.fieldTopWebType} name="packaging.topWebType" form={form} disabled={readOnly} />
                <PackagingField
                  label={labels.fieldSleeveCartonCode}
                  name="packaging.sleeveCartonCode"
                  hint={labels.fieldSleeveCartonCodeHint}
                  form={form}
                  disabled={readOnly}
                  mono
                />
                <PackagingField label={labels.fieldSleeveCartonPrice} name="packaging.sleeveCartonPrice" form={form} disabled={readOnly} />
              </div>
          </div>

          <div data-slot="card" className="card">
            <div className="card-head">
              <div className="card-title">{labels.packagingExtTitle}</div>
              <span data-slot="badge" className="badge badge-gray">
                {labels.packagingExtPending}
              </span>
            </div>
            <div className="space-y-4">
              <div role="note" className="alert alert-blue">
                {labels.packagingExtBody}
              </div>

              {packagingExtEntries.length > 0 && (
                <dl data-testid="packaging-ext" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {packagingExtEntries.map(([key, value]) => (
                    <div key={key} data-testid="packaging-ext-row" className="flex items-center justify-between rounded px-3 py-2 text-sm" style={{ border: '1px solid var(--border)' }}>
                      <dt className="font-medium muted">{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {/* C21-C37 placeholder scaffold */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {TBD_FIELDS.map((n) => (
                  <div key={n} data-testid="packaging-tbd-field" className="ff" style={{ marginBottom: 0 }}>
                    <label className="flex items-center gap-2">
                      {`C${n}`}
                      <span data-slot="badge" className="badge badge-gray">
                        {labels.tbd}
                      </span>
                    </label>
                    <input className="form-input" disabled aria-label={`C${n} ${labels.tbd}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function emptyProduct(): BriefProductFields {
  return {
    product: null,
    volume: null,
    devCode: null,
    packsPerCase: null,
    benchmark: null,
    comments: null,
    summaryComponent: null,
    summarySliceCount: null,
    summarySupplier: null,
    summaryCode: null,
    summaryPrice: null,
    summaryWeights: null,
    summaryPct: null,
  };
}

function emptyPackaging(): BriefPackagingFields {
  return {
    primaryPackaging: null,
    secondaryPackaging: null,
    baseWebCode: null,
    baseWebPrice: null,
    topWebType: null,
    sleeveCartonCode: null,
    sleeveCartonPrice: null,
  };
}

type FieldProps = {
  label: string;
  name: string;
  form: ReturnType<typeof useForm<BriefFormValues>>;
  disabled?: boolean;
  hint?: string;
  type?: string;
  mono?: boolean;
};

function FieldText({ label, name, form, disabled, hint, type = 'text', mono }: FieldProps) {
  const id = `field-${name.replace(/[^a-zA-Z0-9]/g, '-')}`;
  return (
    <div data-testid="brief-field" className="ff" style={{ marginBottom: 0 }}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        disabled={disabled}
        className={`form-input${mono ? ' mono' : ''}`}
        {...form.register(name as any)}
      />
      {hint && <p className="ff-help">{hint}</p>}
    </div>
  );
}

function FieldNumberInt({ label, name, form, disabled }: FieldProps) {
  const id = `field-${name.replace(/[^a-zA-Z0-9]/g, '-')}`;
  return (
    <div data-testid="brief-field" className="ff" style={{ marginBottom: 0 }}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        disabled={disabled}
        className="form-input"
        {...form.register(name as any, { valueAsNumber: true })}
      />
    </div>
  );
}

function FieldArea({ label, name, form, disabled }: FieldProps) {
  const id = `field-${name.replace(/[^a-zA-Z0-9]/g, '-')}`;
  return (
    <div data-testid="brief-field" className="ff" style={{ marginBottom: 0 }}>
      <label htmlFor={id}>{label}</label>
      <textarea id={id} rows={3} disabled={disabled} className="form-input" {...form.register(name as any)} />
    </div>
  );
}

function PackagingField({ label, name, form, disabled, hint, mono }: FieldProps) {
  const id = `field-${name.replace(/[^a-zA-Z0-9]/g, '-')}`;
  return (
    <div data-testid="packaging-field" className="ff" style={{ marginBottom: 0 }}>
      <label htmlFor={id}>{label}</label>
      <input id={id} disabled={disabled} className={`form-input${mono ? ' mono' : ''}`} {...form.register(name as any)} />
      {hint && <p className="ff-help">{hint}</p>}
    </div>
  );
}

export default BriefDetailForm;
