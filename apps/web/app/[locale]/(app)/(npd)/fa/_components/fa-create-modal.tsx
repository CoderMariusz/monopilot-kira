'use client';

/**
 * T-021 — FACreateModal (MODAL-01, Create Finished Good).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:9-43 (FACreateModal)
 *
 * Translation notes (from the prototype + prototype-index-npd.json#fa_create_modal):
 *   - window.Modal + Field + foot Cancel/Create  → @monopilot/ui Modal (Radix dialog) + RHF FormProvider
 *   - Local useState per field                     → useForm({ resolver: zodResolver(schema) })
 *   - v01Valid = /^FA[A-Z0-9]+$/.test(faCode)      → z.string().regex(V01_PRODUCT_CODE_PATTERN) — mirrors the
 *                                                     server-side validateProductCodeV01 (V01) for instant feedback
 *   - v02Valid = name.trim().length > 0 && ≤200    → z.string().trim().min(1).max(200) — mirrors validateProductNameV02 (V02)
 *   - window.NPD_FAS.some() client duplicate check → DROPPED client-side; the unique (org_id, product_code) constraint is
 *                                                     authoritative — the createFa action throws DuplicateError, surfaced as an Alert
 *   - inline alert-blue range note                 → @monopilot/ui informational note rendered from the rangeHint label
 *   - hardcoded redirect /npd/fa/<code>            → onCreated('<code>') callback (page maps to router.push)
 *
 * Deviation (logged): the prototype has a third optional "Dev Code" field. The merged
 * createFa Server Action (T-008) accepts only { productCode, productName } and the task
 * AC1 scopes the modal to exactly those two fields + two buttons. Dev Code is intentionally
 * omitted; capturing it is deferred to the Brief/Convert flow that owns dev_code.
 *
 * The Server Action is injected (createFaAction) so the component stays a pure client form;
 * the page wires the real T-008 createFa action (apps/web/app/(npd)/fa/actions/create-fa.ts) —
 * imported, never authored here.
 */

import React from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { V01_PRODUCT_CODE_PATTERN } from '@monopilot/validation';

import { Button } from '@monopilot/ui/Button';
import Modal from '@monopilot/ui/Modal';
import Input from '@monopilot/ui/Input';

// Server Action signature (owned by T-008 — imported by the page, injected here).
export type CreateFaAction = (input: {
  productCode: string;
  productName: string;
}) => Promise<{ productCode: string }>;

export type FaCreateLabels = {
  title: string;
  subtitle: string;
  fieldProductCode: string;
  fieldProductCodeHint: string;
  fieldProductName: string;
  fieldProductNameHint: string;
  rangeHint: string;
  cancel: string;
  create: string;
  creating: string;
  errorV01: string;
  errorV02: string;
  errorDuplicate: string;
  errorGeneric: string;
};

function makeSchema(labels: FaCreateLabels, requireFaPrefix: boolean) {
  // V01: by default mirror the strict server rule (^FA[A-Z0-9]+$). Callers that
  // make the product-code prefix configurable (e.g. the onboarding "first
  // product" wizard) opt out of the hardcoded 'FA' prefix and accept any
  // non-empty, uppercase-normalized code. V02 (Product Name required) is
  // unchanged in both modes.
  const productCode = requireFaPrefix
    ? z.string().trim().min(1, labels.errorV01).regex(V01_PRODUCT_CODE_PATTERN, labels.errorV01)
    : z.string().trim().min(1, labels.errorV01);

  return z.object({
    productCode,
    // V02 mirror: required, max 200.
    productName: z
      .string()
      .trim()
      .min(1, labels.errorV02)
      .max(200, labels.errorV02),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

function isDuplicateError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { name?: string; code?: string };
  return e.name === 'DuplicateError' || e.code === 'DUPLICATE_PRODUCT_CODE';
}

export function FaCreateModal({
  open,
  labels,
  createFaAction,
  onCreated,
  onClose,
  requireFaPrefix = true,
}: {
  open: boolean;
  labels: FaCreateLabels;
  createFaAction?: CreateFaAction;
  /** Called with the new product_code on success; the page maps this to router.push('/npd/fa/<code>'). */
  onCreated: (productCode: string) => void;
  onClose: () => void;
  /**
   * When true (default — the FA list/dashboard create flow) the product code
   * must match the strict V01 'FA' prefix rule. Callers where the prefix is
   * configurable (onboarding first-product wizard) pass false to accept any
   * non-empty code. V02 (Product Name required) is unaffected.
   */
  requireFaPrefix?: boolean;
}) {
  const schema = React.useMemo(() => makeSchema(labels, requireFaPrefix), [labels, requireFaPrefix]);
  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { productCode: requireFaPrefix ? 'FA' : '', productName: '' },
  });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isValid, isSubmitting },
  } = methods;

  const [serverError, setServerError] = React.useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await createFaAction?.({
        productCode: values.productCode,
        productName: values.productName,
      });
      if (result?.productCode) {
        onCreated(result.productCode);
      }
    } catch (error) {
      setServerError(isDuplicateError(error) ? labels.errorDuplicate : labels.errorGeneric);
    }
  });

  const submitDisabled = !isValid || isSubmitting || !createFaAction;

  return (
    <Modal open={open} onOpenChange={(next) => (next ? undefined : onClose())} size="md" modalId="faCreate">
      <Modal.Header title={labels.title} />
      <FormProvider {...methods}>
        <form onSubmit={onSubmit} noValidate>
          <Modal.Body>
            <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{labels.subtitle}</p>

            {/* .ff modal field (uppercase label) + .form-input — design-system chrome */}
            <div className="ff">
              <label htmlFor="fa-create-product-code">
                {labels.fieldProductCode} <span className="req" aria-label="required">*</span>
              </label>
              {/*
                Prototype autofocuses the first field; Radix Dialog already moves
                focus into the dialog on open, so an explicit autoFocus is omitted
                (deviation logged) to avoid double focus-management + a11y noise.
              */}
              <Input
                id="fa-create-product-code"
                className="form-input mono"
                placeholder="FA5609"
                aria-invalid={errors.productCode ? 'true' : undefined}
                aria-describedby={errors.productCode ? 'fa-create-product-code-error' : 'fa-create-product-code-hint'}
                {...register('productCode', {
                  onChange: (event) => {
                    // Codes are uppercase (mirrors the prototype's toUpperCase()).
                    setValue('productCode', event.target.value.toUpperCase(), {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                  },
                })}
              />
              {errors.productCode ? (
                <span id="fa-create-product-code-error" role="alert" className="ff-error">
                  {errors.productCode.message}
                </span>
              ) : (
                <span id="fa-create-product-code-hint" className="ff-help">
                  {labels.fieldProductCodeHint}
                </span>
              )}
            </div>

            <div className="ff">
              <label htmlFor="fa-create-product-name">
                {labels.fieldProductName} <span className="req" aria-label="required">*</span>
              </label>
              <Input
                id="fa-create-product-name"
                className="form-input"
                placeholder="e.g. Pulled Chicken Shawarma"
                aria-invalid={errors.productName ? 'true' : undefined}
                aria-describedby={errors.productName ? 'fa-create-product-name-error' : 'fa-create-product-name-hint'}
                {...register('productName')}
              />
              {errors.productName ? (
                <span id="fa-create-product-name-error" role="alert" className="ff-error">
                  {errors.productName.message}
                </span>
              ) : (
                <span id="fa-create-product-name-hint" className="ff-help">
                  {labels.fieldProductNameHint}
                </span>
              )}
            </div>

            <div className="alert alert-blue" data-testid="fa-create-range-hint">
              {labels.rangeHint}
            </div>

            {serverError ? (
              <div role="alert" className="alert alert-red">
                {serverError}
              </div>
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={isSubmitting}>
              {labels.cancel}
            </Button>
            <Button type="submit" className="btn-primary btn-sm" disabled={submitDisabled}>
              {isSubmitting ? labels.creating : labels.create}
            </Button>
          </Modal.Footer>
        </form>
      </FormProvider>
    </Modal>
  );
}

export default FaCreateModal;
