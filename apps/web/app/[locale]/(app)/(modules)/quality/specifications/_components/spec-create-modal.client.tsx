'use client';

/**
 * QA-003a (COLLAPSED) — Create specification modal (client island).
 *
 * Prototype parity (1:1 where applicable): prototypes/design/Monopilot Design
 *   System/quality/specs-screens.jsx:81-302 (QaSpecWizard):
 *     product select (real product)                       → specs-screens.jsx:131-145
 *     spec code input (mono, max 50)                       → specs-screens.jsx:146-148
 *     applies-to pills                                     → specs-screens.jsx:159-165
 *     dynamic parameters editor (name / type / target /
 *       min / max / unit / critical, add+remove rows)      → specs-screens.jsx:192-244
 *     min ≤ max client validation mirroring the DB CHECK   → specs-screens.jsx:105,231
 *
 * DEVIATION (documented, mirrors the WO create-modal collapse): the prototype's
 * 3-STEP WIZARD (Header → Parameters → Review, specs-screens.jsx:92,126) is
 * COLLAPSED into a SINGLE create modal — header fields + an inline dynamic
 * parameters table in one dialog, no Review step. The standalone wizard route and
 * the regulation-tags / reference-docs / test-method / equipment fields are
 * OUT OF SCOPE for this slice (the backend createSpec contract takes
 * productId + specCode + parameters[] only). min ≤ max is enforced client-side
 * here and re-enforced by the DB CHECK constraint server-side.
 *
 * Product is chosen via the established ItemPicker (searchItems). Incoming specs
 * target RM/ingredient/packaging items; in-process/final specs target FG/intermediate.
 * Server Action is imported by the page and passed in (never authored here).
 */

import { useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import { ItemPicker, type ItemSearchFn } from '../../../../(npd)/_components/item-picker';
import type { ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items-types';
import type { CreateSpecFn, CreateSpecParameter, SpecParameterType } from './spec-actions-contract';

/** Applies-to pills (prototype parity). Sent to createSpec as applies_to. */
export type SpecAppliesTo = 'incoming' | 'in_process' | 'final' | 'all';
export const SPEC_APPLIES_TO: SpecAppliesTo[] = ['incoming', 'in_process', 'final', 'all'];

export type SpecProductItemType = 'fg' | 'intermediate' | 'rm' | 'ingredient' | 'packaging';

const FINISHED_PRODUCT_ITEM_TYPES: SpecProductItemType[] = ['fg', 'intermediate'];
const INCOMING_PRODUCT_ITEM_TYPES: SpecProductItemType[] = ['rm', 'ingredient', 'packaging'];

export function itemTypesForSpecAppliesTo(appliesTo: SpecAppliesTo): SpecProductItemType[] {
  return appliesTo === 'incoming' ? INCOMING_PRODUCT_ITEM_TYPES : FINISHED_PRODUCT_ITEM_TYPES;
}
export const SPEC_PARAMETER_TYPES: SpecParameterType[] = [
  'visual',
  'measurement',
  'attribute',
  'microbiological',
  'chemical',
  'sensory',
  'equipment',
];

/** Numeric-bearing types per the prototype (target/min/max only meaningful here). */
const NUMERIC_TYPES = new Set<SpecParameterType>(['measurement', 'chemical', 'microbiological']);

export type SpecCreateLabels = {
  title: string;
  subtitle: string;
  product: string;
  productHelp: string;
  productPlaceholder: string;
  pickProduct: string;
  specCode: string;
  specCodeHelp: string;
  specCodePlaceholder: string;
  appliesTo: string;
  appliesToHelp: string;
  appliesToOptions: Record<SpecAppliesTo, string>;
  parameters: string;
  parametersHelp: string;
  addParameter: string;
  removeParameter: string;
  noParameters: string;
  param: {
    name: string;
    namePlaceholder: string;
    type: string;
    target: string;
    min: string;
    max: string;
    unit: string;
    unitPlaceholder: string;
    critical: string;
    criticalShort: string;
  };
  typeOptions: Record<SpecParameterType, string>;
  cancel: string;
  submit: string;
  submitting: string;
  formIncomplete: string;
  validation: {
    productRequired: string;
    specCodeRequired: string;
    parametersRequired: string;
    paramNameRequired: string;
    minLeMax: string;
    fixErrors: string;
  };
  error: string;
  success: string;
  picker: {
    trigger: string;
    searchLabel: string;
    searchPlaceholder: string;
    loading: string;
    empty: string;
    cancel: string;
    error: string;
  };
};

/** Local editable parameter row (decimal STRINGS for numeric values). */
type DraftParam = {
  key: string;
  parameterName: string;
  parameterType: SpecParameterType;
  targetValue: string;
  minValue: string;
  maxValue: string;
  unit: string;
  isCritical: boolean;
};

let rowSeq = 0;
function blankParam(): DraftParam {
  rowSeq += 1;
  return {
    key: `p${rowSeq}`,
    parameterName: '',
    parameterType: 'measurement',
    targetValue: '',
    minValue: '',
    maxValue: '',
    unit: '',
    isCritical: false,
  };
}

/** min ≤ max client check mirroring quality_spec_parameters_min_le_max_check. */
export function minGtMax(min: string, max: string): boolean {
  if (min.trim() === '' || max.trim() === '') return false;
  const lo = Number(min);
  const hi = Number(max);
  if (Number.isNaN(lo) || Number.isNaN(hi)) return false;
  return lo > hi;
}

/** Trim and return undefined when empty (createSpec params use OPTIONAL strings). */
function optDecimal(v: string): string | undefined {
  const t = v.trim();
  return t === '' ? undefined : t;
}

export function SpecCreateModal({
  open,
  onOpenChange,
  labels,
  locale,
  createSpecAction,
  searchItemsAction,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: SpecCreateLabels;
  locale: string;
  createSpecAction: CreateSpecFn;
  searchItemsAction: ItemSearchFn<SpecProductItemType>;
  onCreated?: (specId: string) => void;
}) {
  const [product, setProduct] = useState<ItemPickerOption | null>(null);
  const [specCode, setSpecCode] = useState('');
  const [appliesTo, setAppliesTo] = useState<SpecAppliesTo>('incoming');
  const pickerItemTypes = itemTypesForSpecAppliesTo(appliesTo);
  const [params, setParams] = useState<DraftParam[]>([blankParam()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setProduct(null);
    setSpecCode('');
    setAppliesTo('incoming');
    setParams([blankParam()]);
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function patchParam(key: string, patch: Partial<DraftParam>) {
    setParams((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const namedParams = params.filter((p) => p.parameterName.trim() !== '');
  const anyMinGtMax = params.some((p) => minGtMax(p.minValue, p.maxValue));
  const anyNamelessFilled = params.some(
    (p) =>
      p.parameterName.trim() === '' &&
      (p.targetValue.trim() !== '' || p.minValue.trim() !== '' || p.maxValue.trim() !== '' || p.unit.trim() !== ''),
  );

  const valid =
    product !== null &&
    specCode.trim() !== '' &&
    namedParams.length > 0 &&
    !anyMinGtMax &&
    !anyNamelessFilled;

  function submit() {
    setError(null);
    if (!product) return setError(labels.validation.productRequired);
    if (specCode.trim() === '') return setError(labels.validation.specCodeRequired);
    if (namedParams.length === 0) return setError(labels.validation.parametersRequired);
    if (anyNamelessFilled) return setError(labels.validation.paramNameRequired);
    if (anyMinGtMax) return setError(labels.validation.minLeMax);

    const payloadParams: CreateSpecParameter[] = namedParams.map((p) => ({
      parameterName: p.parameterName.trim(),
      parameterType: p.parameterType,
      // Numeric values are DECIMAL STRINGS, sent only for numeric-bearing types; the
      // server validates them against quality_spec_parameters numeric/CHECK columns.
      targetValue: NUMERIC_TYPES.has(p.parameterType) ? optDecimal(p.targetValue) : undefined,
      minValue: NUMERIC_TYPES.has(p.parameterType) ? optDecimal(p.minValue) : undefined,
      maxValue: NUMERIC_TYPES.has(p.parameterType) ? optDecimal(p.maxValue) : undefined,
      unit: optDecimal(p.unit),
      isCritical: p.isCritical,
    }));

    startTransition(async () => {
      const result = await createSpecAction({
        productId: product.id,
        specCode: specCode.trim(),
        appliesTo,
        parameters: payloadParams,
      });
      if (!result.ok) {
        setError(labels.error.replace('{message}', result.message ?? result.reason));
        return;
      }
      const newId = result.data.id;
      reset();
      onOpenChange(false);
      onCreated?.(newId);
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="xl" modalId="spec_create_modal" dismissible={!pending}>
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <div data-testid="spec-create-form" className="flex flex-col gap-4 text-sm">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>
          {/* Product (ItemPicker → real items FK, parity specs-screens.jsx:131-145). */}
          <div className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.product} <span aria-hidden className="text-red-500">*</span>
            </span>
            <div className="flex flex-wrap items-center gap-2" data-testid="spec-create-product">
              <span
                data-testid="spec-create-product-value"
                className="min-w-[12rem] rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700"
              >
                {product ? (
                  <>
                    <span className="font-mono text-xs font-semibold text-blue-700">{product.itemCode}</span>
                    <span className="ml-2 text-slate-800">{product.name}</span>
                  </>
                ) : (
                  <span className="text-slate-400">{labels.productPlaceholder}</span>
                )}
              </span>
              <ItemPicker<SpecProductItemType>
                labels={{
                  trigger: labels.pickProduct,
                  searchLabel: labels.picker.searchLabel,
                  searchPlaceholder: labels.picker.searchPlaceholder,
                  loading: labels.picker.loading,
                  empty: labels.picker.empty,
                  cancel: labels.picker.cancel,
                  error: labels.picker.error,
                }}
                itemTypes={pickerItemTypes}
                searchItemsAction={searchItemsAction}
                onSelect={(item) => setProduct(item)}
                triggerClassName="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
              />
            </div>
            <span className="text-xs text-slate-400">{labels.productHelp}</span>
          </div>

          {/* Spec code (mono, max 50, parity specs-screens.jsx:146-148). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.specCode} <span aria-hidden className="text-red-500">*</span>
            </span>
            <input
              data-testid="spec-create-code"
              value={specCode}
              maxLength={50}
              onChange={(e) => setSpecCode(e.target.value)}
              placeholder={labels.specCodePlaceholder}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 font-mono text-sm focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.specCodeHelp}</span>
          </label>

          {/* Applies-to (parity specs-screens.jsx:159-165) — pills, no raw <select>. */}
          <div className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.appliesTo}</span>
            <div className="flex flex-wrap gap-1" role="group" aria-label={labels.appliesTo}>
              {SPEC_APPLIES_TO.map((a) => (
                <button
                  key={a}
                  type="button"
                  data-testid={`spec-applies-${a}`}
                  aria-pressed={appliesTo === a}
                  onClick={() => {
                    setAppliesTo(a);
                    setProduct((current) => {
                      if (!current) return null;
                      const allowed = new Set(itemTypesForSpecAppliesTo(a));
                      return allowed.has(current.itemType as SpecProductItemType) ? current : null;
                    });
                  }}
                  className={[
                    'rounded-full border px-2.5 py-1 text-xs transition',
                    appliesTo === a
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400',
                  ].join(' ')}
                >
                  {labels.appliesToOptions[a]}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400">{labels.appliesToHelp}</span>
          </div>

          {/* Dynamic parameters editor (parity specs-screens.jsx:192-244). */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700">
                {labels.parameters} ({namedParams.length})
              </span>
              <button
                type="button"
                data-testid="spec-param-add"
                onClick={() => setParams((rows) => [...rows, blankParam()])}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 transition hover:bg-slate-50"
              >
                {labels.addParameter}
              </button>
            </div>
            <span className="text-xs text-slate-400">{labels.parametersHelp}</span>

            {params.length === 0 ? (
              <p data-testid="spec-param-empty" className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
                {labels.noParameters}
              </p>
            ) : (
              <div className="flex flex-col gap-2" data-testid="spec-param-rows">
                {params.map((p) => {
                  const showNumeric = NUMERIC_TYPES.has(p.parameterType);
                  const badRange = minGtMax(p.minValue, p.maxValue);
                  const namelessFilled =
                    p.parameterName.trim() === '' &&
                    (p.targetValue.trim() !== '' || p.minValue.trim() !== '' || p.maxValue.trim() !== '' || p.unit.trim() !== '');
                  return (
                    <div
                      key={p.key}
                      data-testid="spec-param-row"
                      className={[
                        'grid grid-cols-1 gap-2 rounded-md border px-3 py-2 sm:grid-cols-12 sm:items-center',
                        p.isCritical ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-white',
                      ].join(' ')}
                    >
                      <input
                        data-testid="spec-param-name"
                        value={p.parameterName}
                        onChange={(e) => patchParam(p.key, { parameterName: e.target.value })}
                        placeholder={labels.param.namePlaceholder}
                        aria-label={labels.param.name}
                        aria-invalid={namelessFilled || undefined}
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-slate-400 focus:outline-none sm:col-span-3"
                      />
                      <div data-testid="spec-param-type" className="sm:col-span-2">
                        <Select
                          aria-label={labels.param.type}
                          value={p.parameterType}
                          onValueChange={(v) => patchParam(p.key, { parameterType: v as SpecParameterType })}
                          options={SPEC_PARAMETER_TYPES.map((t) => ({ value: t, label: labels.typeOptions[t] }))}
                        />
                      </div>
                      <input
                        data-testid="spec-param-target"
                        value={p.targetValue}
                        inputMode="decimal"
                        disabled={!showNumeric}
                        onChange={(e) => patchParam(p.key, { targetValue: e.target.value })}
                        placeholder={labels.param.target}
                        aria-label={labels.param.target}
                        className="rounded-md border border-slate-300 px-2 py-1 font-mono text-sm focus:border-slate-400 focus:outline-none disabled:bg-slate-100 sm:col-span-1"
                      />
                      <input
                        data-testid="spec-param-min"
                        value={p.minValue}
                        inputMode="decimal"
                        disabled={!showNumeric}
                        onChange={(e) => patchParam(p.key, { minValue: e.target.value })}
                        placeholder={labels.param.min}
                        aria-label={labels.param.min}
                        aria-invalid={badRange || undefined}
                        className={[
                          'rounded-md border px-2 py-1 font-mono text-sm focus:outline-none disabled:bg-slate-100 sm:col-span-1',
                          badRange ? 'border-red-400' : 'border-slate-300 focus:border-slate-400',
                        ].join(' ')}
                      />
                      <input
                        data-testid="spec-param-max"
                        value={p.maxValue}
                        inputMode="decimal"
                        disabled={!showNumeric}
                        onChange={(e) => patchParam(p.key, { maxValue: e.target.value })}
                        placeholder={labels.param.max}
                        aria-label={labels.param.max}
                        aria-invalid={badRange || undefined}
                        className={[
                          'rounded-md border px-2 py-1 font-mono text-sm focus:outline-none disabled:bg-slate-100 sm:col-span-1',
                          badRange ? 'border-red-400' : 'border-slate-300 focus:border-slate-400',
                        ].join(' ')}
                      />
                      <input
                        data-testid="spec-param-unit"
                        value={p.unit}
                        onChange={(e) => patchParam(p.key, { unit: e.target.value })}
                        placeholder={labels.param.unitPlaceholder}
                        aria-label={labels.param.unit}
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-slate-400 focus:outline-none sm:col-span-2"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 sm:col-span-1">
                        <input
                          type="checkbox"
                          data-testid="spec-param-critical"
                          checked={p.isCritical}
                          onChange={(e) => patchParam(p.key, { isCritical: e.target.checked })}
                          aria-label={labels.param.critical}
                        />
                        {labels.param.criticalShort}
                      </label>
                      {badRange && (
                        <p role="alert" data-testid="spec-param-minmax-error" className="text-xs text-red-600 sm:col-span-12">
                          {labels.validation.minLeMax}
                        </p>
                      )}
                      <div className="flex justify-end sm:col-span-12">
                        <button
                          type="button"
                          data-testid="spec-param-remove"
                          aria-label={labels.removeParameter}
                          onClick={() => setParams((rows) => rows.filter((r) => r.key !== p.key))}
                          className="rounded-md border border-slate-300 px-2 py-0.5 text-xs text-slate-600 transition hover:bg-slate-50"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <p role="alert" data-testid="spec-create-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="spec-create-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="spec-create-submit"
          disabled={!valid || pending}
          onClick={submit}
          title={!valid ? labels.formIncomplete : undefined}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
      <span className="sr-only" data-locale={locale} />
    </Modal>
  );
}
