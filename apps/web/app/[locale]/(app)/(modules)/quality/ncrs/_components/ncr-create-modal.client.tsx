'use client';

/**
 * MODAL-NCR-CREATE — create a Non-Conformance Report (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   modals.jsx:299-382 (NcrCreateModal).
 *
 * PF-R16-03: wires the reviewed createNcr Server Action with typed links to the
 * source inspection / LP, product and linked hold. Human-typed references resolve
 * to org-scoped UUIDs via the reviewed lookup reads (lookup-actions.ts) — never
 * raw UUID entry.
 */

import { useEffect, useRef, useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import type {
  HoldLookupResult,
  InspectionLookupResult,
  LpLookupResult,
} from '../../_actions/lookup-actions';
import {
  NCR_SEVERITIES,
  NCR_TYPES,
  type CreateNcrAction,
  type NcrReferenceType,
  type NcrSeverity,
  type NcrType,
} from './ncr-contracts';

const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 2000;
const SOURCE_REF_TYPES = ['inspection', 'lp'] as const satisfies readonly NcrReferenceType[];
type NcrCreateSourceRefType = (typeof SOURCE_REF_TYPES)[number];

type ProductOption = { id: string; itemCode: string; name: string };

export type NcrCreateLookupLabels = {
  sourceRefType: string;
  sourceRefTypeHelp: string;
  sourceRefTypeOptions: Record<'inspection' | 'lp', string>;
  inspectionSearchLabel: string;
  inspectionSearchPlaceholder: string;
  inspectionSearching: string;
  inspectionNoMatch: string;
  inspectionChip: string;
  lpSearchLabel: string;
  lpSearchPlaceholder: string;
  lpSearching: string;
  lpNoMatch: string;
  lpChip: string;
  product: string;
  productHelp: string;
  productSearchPlaceholder: string;
  productSearching: string;
  productNoMatch: string;
  productChip: string;
  clearPick: string;
  resultLine: string;
};

export type NcrCreateLabels = {
  title: string;
  subtitle: string;
  ncrType: string;
  ncrTypeHelp: string;
  ncrTypePlaceholder: string;
  ncrTypeOptions: Record<string, string>;
  severity: string;
  severityHelp: string;
  severityOptions: Record<string, string>;
  severityWindow: Record<string, string>;
  criticalWarning: string;
  titleField: string;
  titlePlaceholder: string;
  description: string;
  descriptionHelp: string;
  descriptionPlaceholder: string;
  descriptionMinError: string;
  linkedHold: string;
  linkedHoldHelp: string;
  linkedHoldPlaceholder: string;
  linkedHoldSearchLabel: string;
  linkedHoldSearching: string;
  linkedHoldNoMatch: string;
  linkedHoldChip: string;
  linkedHoldClear: string;
  affectedQty: string;
  affectedQtyPlaceholder: string;
  cancel: string;
  submit: string;
  submitting: string;
  formIncomplete: string;
  validation: { titleRequired: string; descriptionRequired: string };
  error: string;
  success: string;
  lookup: NcrCreateLookupLabels;
};

type SearchLpsAction = (input: { query: string; limit?: number }) => Promise<
  { ok: true; data: LpLookupResult[] } | { ok: false; reason: string; message?: string }
>;
type SearchInspectionsAction = (input: { query: string; limit?: number }) => Promise<
  { ok: true; data: InspectionLookupResult[] } | { ok: false; reason: string; message?: string }
>;
type SearchHoldsAction = (input: { query: string; limit?: number }) => Promise<
  { ok: true; data: HoldLookupResult[] } | { ok: false; reason: string; message?: string }
>;
type SearchProductsAction = (input: { query?: string; limit?: number }) => Promise<ProductOption[]>;

export function NcrCreateModal({
  open,
  onOpenChange,
  labels,
  createNcrAction,
  searchLpsAction,
  searchInspectionsAction,
  searchHoldsAction,
  searchProductsAction,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: NcrCreateLabels;
  createNcrAction: CreateNcrAction;
  searchLpsAction: SearchLpsAction;
  searchInspectionsAction: SearchInspectionsAction;
  searchHoldsAction: SearchHoldsAction;
  searchProductsAction: SearchProductsAction;
  onCreated?: (created: { id: string; ncrNumber: string }) => void;
}) {
  const [ncrType, setNcrType] = useState<NcrType>('quality');
  const [severity, setSeverity] = useState<NcrSeverity>('major');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [affectedQty, setAffectedQty] = useState('');
  const [sourceRefType, setSourceRefType] = useState<NcrCreateSourceRefType>('inspection');
  const [pickedInspection, setPickedInspection] = useState<InspectionLookupResult | null>(null);
  const [pickedLp, setPickedLp] = useState<LpLookupResult | null>(null);
  const [pickedProduct, setPickedProduct] = useState<ProductOption | null>(null);
  const [pickedHold, setPickedHold] = useState<HoldLookupResult | null>(null);
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceResults, setSourceResults] = useState<Array<InspectionLookupResult | LpLookupResult>>([]);
  const [sourceSearching, setSourceSearching] = useState(false);
  const [sourceSearched, setSourceSearched] = useState(false);
  const [holdQuery, setHoldQuery] = useState('');
  const [holdResults, setHoldResults] = useState<HoldLookupResult[]>([]);
  const [holdSearching, setHoldSearching] = useState(false);
  const [holdSearched, setHoldSearched] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<ProductOption[]>([]);
  const [productSearching, setProductSearching] = useState(false);
  const [productSearched, setProductSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmedTitle = title.trim();
  const trimmedDesc = description.trim();
  const descTooShort = trimmedDesc.length > 0 && trimmedDesc.length < DESCRIPTION_MIN;
  const valid = trimmedTitle.length > 0 && trimmedDesc.length >= DESCRIPTION_MIN;
  const isCritical = severity === 'critical';
  const hasSourcePick = sourceRefType === 'inspection' ? pickedInspection !== null : pickedLp !== null;

  const sourceQueryRef = useRef(sourceQuery);
  sourceQueryRef.current = sourceQuery;
  const holdQueryRef = useRef(holdQuery);
  holdQueryRef.current = holdQuery;
  const productQueryRef = useRef(productQuery);
  productQueryRef.current = productQuery;

  useEffect(() => {
    if (hasSourcePick) return;
    const q = sourceQuery.trim();
    if (q.length === 0) {
      setSourceResults([]);
      setSourceSearched(false);
      return;
    }
    setSourceSearching(true);
    const handle = setTimeout(async () => {
      const res =
        sourceRefType === 'inspection'
          ? await searchInspectionsAction({ query: q, limit: 10 })
          : await searchLpsAction({ query: q, limit: 10 });
      if (sourceQueryRef.current.trim() !== q) return;
      setSourceSearching(false);
      setSourceSearched(true);
      setSourceResults(res.ok ? res.data : []);
    }, 250);
    return () => clearTimeout(handle);
  }, [sourceQuery, sourceRefType, hasSourcePick, searchInspectionsAction, searchLpsAction]);

  useEffect(() => {
    if (pickedHold) return;
    const q = holdQuery.trim();
    if (q.length === 0) {
      setHoldResults([]);
      setHoldSearched(false);
      return;
    }
    setHoldSearching(true);
    const handle = setTimeout(async () => {
      const res = await searchHoldsAction({ query: q, limit: 10 });
      if (holdQueryRef.current.trim() !== q) return;
      setHoldSearching(false);
      setHoldSearched(true);
      setHoldResults(res.ok ? res.data : []);
    }, 250);
    return () => clearTimeout(handle);
  }, [holdQuery, pickedHold, searchHoldsAction]);

  useEffect(() => {
    if (pickedProduct) return;
    const q = productQuery.trim();
    if (q.length === 0) {
      setProductResults([]);
      setProductSearched(false);
      return;
    }
    setProductSearching(true);
    const handle = setTimeout(async () => {
      const rows = await searchProductsAction({ query: q, limit: 10 });
      if (productQueryRef.current.trim() !== q) return;
      setProductSearching(false);
      setProductSearched(true);
      setProductResults(
        rows.map((row) => ({
          id: row.id,
          itemCode: row.itemCode,
          name: row.name,
        })),
      );
    }, 250);
    return () => clearTimeout(handle);
  }, [productQuery, pickedProduct, searchProductsAction]);

  function reset() {
    setNcrType('quality');
    setSeverity('major');
    setTitle('');
    setDescription('');
    setAffectedQty('');
    setSourceRefType('inspection');
    setPickedInspection(null);
    setPickedLp(null);
    setPickedProduct(null);
    setPickedHold(null);
    setSourceQuery('');
    setSourceResults([]);
    setSourceSearching(false);
    setSourceSearched(false);
    setHoldQuery('');
    setHoldResults([]);
    setHoldSearching(false);
    setHoldSearched(false);
    setProductQuery('');
    setProductResults([]);
    setProductSearching(false);
    setProductSearched(false);
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function changeSourceRefType(next: NcrCreateSourceRefType) {
    setSourceRefType(next);
    setPickedInspection(null);
    setPickedLp(null);
    setSourceQuery('');
    setSourceResults([]);
    setSourceSearched(false);
    setError(null);
  }

  function pickInspection(inspection: InspectionLookupResult) {
    setPickedInspection(inspection);
    setSourceResults([]);
    setSourceSearched(false);
    setSourceQuery('');
    if (inspection.productId && inspection.productCode) {
      setPickedProduct({
        id: inspection.productId,
        itemCode: inspection.productCode,
        name: inspection.productCode,
      });
    }
    setError(null);
  }

  function pickLp(lp: LpLookupResult) {
    setPickedLp(lp);
    setSourceResults([]);
    setSourceSearched(false);
    setSourceQuery('');
    if (lp.productId && lp.itemCode) {
      setPickedProduct({
        id: lp.productId,
        itemCode: lp.itemCode,
        name: lp.itemCode,
      });
    }
    setError(null);
  }

  function submit() {
    setError(null);
    if (trimmedTitle.length === 0) {
      setError(labels.validation.titleRequired);
      return;
    }
    if (trimmedDesc.length < DESCRIPTION_MIN) {
      setError(labels.validation.descriptionRequired);
      return;
    }

    startTransition(async () => {
      const result = await createNcrAction({
        ncrType,
        severity,
        title: trimmedTitle,
        description: trimmedDesc,
        ...(sourceRefType === 'inspection' && pickedInspection
          ? { referenceType: 'inspection' as const, referenceId: pickedInspection.id }
          : {}),
        ...(sourceRefType === 'lp' && pickedLp ? { referenceType: 'lp' as const, referenceId: pickedLp.id } : {}),
        ...(pickedProduct?.id ? { productId: pickedProduct.id } : {}),
        ...(pickedHold ? { linkedHoldId: pickedHold.id } : {}),
        ...(affectedQty.trim() ? { affectedQtyKg: affectedQty.trim() } : {}),
      });
      if (!result.ok) {
        setError(labels.error.replace('{message}', result.message ?? result.reason));
        return;
      }
      const created = result.data;
      reset();
      onOpenChange(false);
      onCreated?.(created);
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="ncr_create_modal" dismissible={!pending}>
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <div data-testid="ncr-create-form" className="flex flex-col gap-4 text-sm">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>

          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.ncrType} <span aria-hidden className="text-red-500">*</span>
            </span>
            <div data-testid="ncr-create-type">
              <Select
                aria-label={labels.ncrType}
                value={ncrType}
                onValueChange={(v) => setNcrType(v as NcrType)}
                placeholder={labels.ncrTypePlaceholder}
                options={NCR_TYPES.map((ty) => ({ value: ty, label: labels.ncrTypeOptions[ty] }))}
              />
            </div>
            <span className="text-xs text-slate-400">{labels.ncrTypeHelp}</span>
          </label>

          <fieldset>
            <legend className="mb-1 font-medium text-slate-700">
              {labels.severity} <span aria-hidden className="text-red-500">*</span>
            </legend>
            <div className="flex flex-wrap gap-1" role="group" aria-label={labels.severity}>
              {NCR_SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`ncr-create-severity-${s}`}
                  aria-pressed={severity === s}
                  onClick={() => setSeverity(s)}
                  className={[
                    'rounded-full border px-3 py-1 text-xs capitalize transition',
                    severity === s
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400',
                  ].join(' ')}
                >
                  {labels.severityOptions[s]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400" data-testid="ncr-create-severity-window">
              {labels.severityHelp.replace('{window}', labels.severityWindow[severity])}
            </p>
          </fieldset>

          {isCritical && (
            <div
              role="note"
              data-testid="ncr-create-sod-warning"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
            >
              ⚠ {labels.criticalWarning}
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.titleField} <span aria-hidden className="text-red-500">*</span>
            </span>
            <input
              type="text"
              data-testid="ncr-create-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder={labels.titlePlaceholder}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.description} <span aria-hidden className="text-red-500">*</span>
            </span>
            <textarea
              data-testid="ncr-create-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESCRIPTION_MAX}
              rows={4}
              placeholder={labels.descriptionPlaceholder}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            {descTooShort ? (
              <span data-testid="ncr-create-description-error" className="text-xs text-red-600">
                {labels.descriptionMinError}
              </span>
            ) : (
              <span className="text-xs text-slate-400">
                {labels.descriptionHelp.replace('{count}', String(trimmedDesc.length))}
              </span>
            )}
          </label>

          <fieldset data-testid="ncr-create-source-ref">
            <legend className="mb-1 font-medium text-slate-700">{labels.lookup.sourceRefType}</legend>
            <div className="flex flex-wrap gap-1" role="group" aria-label={labels.lookup.sourceRefType}>
              {SOURCE_REF_TYPES.map((rt) => (
                <button
                  key={rt}
                  type="button"
                  data-testid={`ncr-create-source-type-${rt}`}
                  aria-pressed={sourceRefType === rt}
                  onClick={() => changeSourceRefType(rt)}
                  className={[
                    'rounded-full border px-3 py-1 text-xs transition',
                    sourceRefType === rt
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400',
                  ].join(' ')}
                >
                  {labels.lookup.sourceRefTypeOptions[rt]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">{labels.lookup.sourceRefTypeHelp}</p>
          </fieldset>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {sourceRefType === 'inspection'
                ? labels.lookup.inspectionSearchLabel
                : labels.lookup.lpSearchLabel}
            </span>
            {sourceRefType === 'inspection' && pickedInspection ? (
              <div
                data-testid="ncr-create-inspection-chip"
                className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2"
              >
                <span className="font-mono text-xs text-emerald-900">
                  {labels.lookup.inspectionChip
                    .replace('{number}', pickedInspection.inspectionNumber)
                    .replace('{reference}', pickedInspection.referenceDisplay)}
                </span>
                <button
                  type="button"
                  data-testid="ncr-create-inspection-clear"
                  onClick={() => setPickedInspection(null)}
                  className="shrink-0 rounded border border-emerald-300 px-2 py-0.5 text-[11px] text-emerald-800 hover:bg-emerald-100"
                >
                  {labels.lookup.clearPick}
                </button>
              </div>
            ) : sourceRefType === 'lp' && pickedLp ? (
              <div
                data-testid="ncr-create-lp-chip"
                className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2"
              >
                <span className="font-mono text-xs text-emerald-900">
                  {labels.lookup.lpChip
                    .replace('{lpNumber}', pickedLp.lpNumber)
                    .replace('{itemCode}', pickedLp.itemCode ?? '—')}
                </span>
                <button
                  type="button"
                  data-testid="ncr-create-lp-clear"
                  onClick={() => setPickedLp(null)}
                  className="shrink-0 rounded border border-emerald-300 px-2 py-0.5 text-[11px] text-emerald-800 hover:bg-emerald-100"
                >
                  {labels.lookup.clearPick}
                </button>
              </div>
            ) : (
              <>
                <input
                  type="search"
                  data-testid="ncr-create-source-search"
                  value={sourceQuery}
                  onChange={(e) => setSourceQuery(e.target.value)}
                  placeholder={
                    sourceRefType === 'inspection'
                      ? labels.lookup.inspectionSearchPlaceholder
                      : labels.lookup.lpSearchPlaceholder
                  }
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
                />
                {sourceSearching && (
                  <span className="text-xs text-slate-400">
                    {sourceRefType === 'inspection'
                      ? labels.lookup.inspectionSearching
                      : labels.lookup.lpSearching}
                  </span>
                )}
                {sourceSearched && sourceResults.length === 0 && sourceQuery.trim().length > 0 && (
                  <span className="text-xs text-slate-500">
                    {(sourceRefType === 'inspection'
                      ? labels.lookup.inspectionNoMatch
                      : labels.lookup.lpNoMatch
                    ).replace('{query}', sourceQuery.trim())}
                  </span>
                )}
                {sourceResults.length > 0 && (
                  <ul
                    data-testid="ncr-create-source-results"
                    className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white"
                  >
                    {sourceResults.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          data-testid={`ncr-create-source-pick-${row.id}`}
                          onClick={() =>
                            sourceRefType === 'inspection'
                              ? pickInspection(row as InspectionLookupResult)
                              : pickLp(row as LpLookupResult)
                          }
                          className="block w-full px-3 py-2 text-left text-xs hover:bg-slate-50"
                        >
                          {sourceRefType === 'inspection'
                            ? labels.lookup.resultLine
                                .replace(
                                  '{primary}',
                                  (row as InspectionLookupResult).inspectionNumber,
                                )
                                .replace(
                                  '{secondary}',
                                  (row as InspectionLookupResult).referenceDisplay,
                                )
                            : labels.lookup.resultLine
                                .replace('{primary}', (row as LpLookupResult).lpNumber)
                                .replace('{secondary}', (row as LpLookupResult).itemCode ?? '—')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.lookup.product}</span>
            {pickedProduct ? (
              <div
                data-testid="ncr-create-product-chip"
                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <span className="font-mono text-xs text-slate-800">
                  {labels.lookup.productChip
                    .replace('{itemCode}', pickedProduct.itemCode)
                    .replace('{name}', pickedProduct.name)}
                </span>
                <button
                  type="button"
                  data-testid="ncr-create-product-clear"
                  onClick={() => setPickedProduct(null)}
                  className="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100"
                >
                  {labels.lookup.clearPick}
                </button>
              </div>
            ) : (
              <>
                <input
                  type="search"
                  data-testid="ncr-create-product-search"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder={labels.lookup.productSearchPlaceholder}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
                />
                {productSearching && <span className="text-xs text-slate-400">{labels.lookup.productSearching}</span>}
                {productSearched && productResults.length === 0 && productQuery.trim().length > 0 && (
                  <span className="text-xs text-slate-500">
                    {labels.lookup.productNoMatch.replace('{query}', productQuery.trim())}
                  </span>
                )}
                {productResults.length > 0 && (
                  <ul
                    data-testid="ncr-create-product-results"
                    className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white"
                  >
                    {productResults.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          data-testid={`ncr-create-product-pick-${row.id}`}
                          onClick={() => {
                            setPickedProduct(row);
                            setProductResults([]);
                            setProductSearched(false);
                            setProductQuery('');
                          }}
                          className="block w-full px-3 py-2 text-left text-xs hover:bg-slate-50"
                        >
                          {labels.lookup.resultLine
                            .replace('{primary}', row.itemCode)
                            .replace('{secondary}', row.name)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <span className="text-xs text-slate-400">{labels.lookup.productHelp}</span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.linkedHold}</span>
            {pickedHold ? (
              <div
                data-testid="ncr-create-hold-chip"
                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <span className="font-mono text-xs text-slate-800">
                  {labels.linkedHoldChip
                    .replace('{number}', pickedHold.holdNumber)
                    .replace('{reference}', pickedHold.referenceDisplay)}
                </span>
                <button
                  type="button"
                  data-testid="ncr-create-hold-clear"
                  onClick={() => setPickedHold(null)}
                  className="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100"
                >
                  {labels.linkedHoldClear}
                </button>
              </div>
            ) : (
              <>
                <input
                  type="search"
                  data-testid="ncr-create-hold-search"
                  value={holdQuery}
                  onChange={(e) => setHoldQuery(e.target.value)}
                  placeholder={labels.linkedHoldPlaceholder}
                  aria-label={labels.linkedHoldSearchLabel}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
                />
                {holdSearching && <span className="text-xs text-slate-400">{labels.linkedHoldSearching}</span>}
                {holdSearched && holdResults.length === 0 && holdQuery.trim().length > 0 && (
                  <span className="text-xs text-slate-500">
                    {labels.linkedHoldNoMatch.replace('{query}', holdQuery.trim())}
                  </span>
                )}
                {holdResults.length > 0 && (
                  <ul
                    data-testid="ncr-create-hold-results"
                    className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white"
                  >
                    {holdResults.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          data-testid={`ncr-create-hold-pick-${row.id}`}
                          onClick={() => {
                            setPickedHold(row);
                            setHoldResults([]);
                            setHoldSearched(false);
                            setHoldQuery('');
                          }}
                          className="block w-full px-3 py-2 text-left text-xs hover:bg-slate-50"
                        >
                          {labels.linkedHoldChip
                            .replace('{number}', row.holdNumber)
                            .replace('{reference}', row.referenceDisplay)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <span className="text-xs text-slate-400">{labels.linkedHoldHelp}</span>
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.affectedQty}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              data-testid="ncr-create-affectedqty"
              value={affectedQty}
              onChange={(e) => setAffectedQty(e.target.value)}
              placeholder={labels.affectedQtyPlaceholder}
              className="w-40 rounded-md border border-slate-300 px-2.5 py-1.5 font-mono focus:border-slate-400 focus:outline-none"
            />
          </label>

          {error && (
            <p role="alert" data-testid="ncr-create-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="ncr-create-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="ncr-create-submit"
          disabled={!valid || pending}
          onClick={submit}
          title={!valid ? labels.formIncomplete : undefined}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
