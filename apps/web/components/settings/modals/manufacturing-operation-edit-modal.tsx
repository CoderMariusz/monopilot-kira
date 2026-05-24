'use client';

import React from 'react';
import { z } from 'zod';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Switch } from '@monopilot/ui/Switch';
import Textarea from '@monopilot/ui/Textarea';

export type IndustryCode = 'bakery' | 'pharma' | 'fmcg' | 'generic' | 'custom';

export type ManufacturingOperation = {
  id: string;
  operation_name: string;
  process_suffix: string;
  description?: string | null;
  industry_code: IndustryCode;
  operation_seq: number;
  is_active: boolean;
};

export type SaveManufacturingOperationResult =
  | { ok: true; operationId: string; revalidatedPath: '/settings/reference/manufacturing-operations' }
  | { ok: false; error: string };

export type ManufacturingOperationEditModalProps = {
  open: boolean;
  mode: 'create' | 'edit';
  operation?: ManufacturingOperation | null;
  existingOperations?: ManufacturingOperation[];
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  saveManufacturingOperation: (input: {
    operationId?: string;
    operation_name: string;
    process_suffix: string;
    description?: string | null;
    industry_code: IndustryCode;
    operation_seq: number;
    is_active: boolean;
  }) => Promise<SaveManufacturingOperationResult>;
  onSaved: (result: { operationId: string; revalidatedPath: '/settings/reference/manufacturing-operations' }) => void;
};

type FormState = {
  operation_name: string;
  process_suffix: string;
  description: string;
  industry_code: IndustryCode;
  operation_seq: number;
  is_active: boolean;
};

type FieldErrors = Partial<Record<keyof FormState | 'form', string>>;

const modalId = 'SET-056';
const industryOptions: Array<{ value: IndustryCode; label: string }> = [
  { value: 'bakery', label: 'Bakery' },
  { value: 'pharma', label: 'Pharma' },
  { value: 'fmcg', label: 'FMCG' },
  { value: 'generic', label: 'Generic' },
  { value: 'custom', label: 'Custom' },
];

export const manufacturingOperationEditSchema = z.object({
  operation_name: z
    .string()
    .trim()
    .min(1, 'Operation name is required')
    .max(50, 'V-SET-MFG-02: Operation name must be 50 characters or less')
    .regex(/^[A-Za-z0-9 ]+$/, 'V-SET-MFG-02: Operation name must use alphanumeric characters and spaces only'),
  process_suffix: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{2,4}$/, 'V-SET-MFG-01: Process suffix must be 2-4 uppercase alphanumeric characters'),
  description: z.string().trim().max(200, 'Description must be 200 characters or less').optional().nullable(),
  industry_code: z.enum(['bakery', 'pharma', 'fmcg', 'generic', 'custom'], {
    errorMap: () => ({ message: 'V-SET-MFG-05: Choose a valid industry code' }),
  }),
  operation_seq: z.coerce
    .number()
    .int('V-SET-MFG-03: Sequence order must be a whole number')
    .min(1, 'V-SET-MFG-03: Sequence order must be between 1 and 99')
    .max(99, 'V-SET-MFG-03: Sequence order must be between 1 and 99'),
  is_active: z.boolean(),
});

function initialForm(operation?: ManufacturingOperation | null): FormState {
  return {
    operation_name: operation?.operation_name ?? '',
    process_suffix: operation?.process_suffix ?? '',
    description: operation?.description ?? '',
    industry_code: operation?.industry_code ?? 'generic',
    operation_seq: operation?.operation_seq ?? 1,
    is_active: operation?.is_active ?? true,
  };
}

function errorsFromZod(error: z.ZodError): FieldErrors {
  return error.issues.reduce<FieldErrors>((acc, issue) => {
    const key = issue.path[0] as keyof FormState | undefined;
    if (key && !acc[key]) acc[key] = issue.message;
    return acc;
  }, {});
}

function validateUniqueness(
  form: FormState,
  existingOperations: ManufacturingOperation[],
  operationId?: string,
): FieldErrors {
  const comparableName = form.operation_name.trim().toLowerCase();
  const comparableSuffix = form.process_suffix.trim();
  const nameConflict = existingOperations.some(
    (row) => row.id !== operationId && row.operation_name.trim().toLowerCase() === comparableName,
  );
  const suffixConflict = existingOperations.some(
    (row) => row.id !== operationId && row.process_suffix.trim() === comparableSuffix,
  );

  return {
    ...(nameConflict ? { operation_name: 'V-SET-MFG-02: Operation name must be unique per tenant' } : {}),
    ...(suffixConflict ? { process_suffix: 'V-SET-MFG-01: Process suffix must be unique per tenant' } : {}),
  };
}

function getFocusableElements(dialog: HTMLElement) {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>('button, [href], input, textarea, [role="combobox"], [role="switch"], [tabindex]:not([tabindex="-1"])'),
  ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
}

function useModalLifecycle(open: boolean, dialogRef: React.RefObject<HTMLElement | null>) {
  React.useLayoutEffect(() => {
    if (!open) return undefined;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const beforeGuard = document.createElement('span');
    const afterGuard = document.createElement('span');
    beforeGuard.setAttribute('data-radix-focus-guard', '');
    afterGuard.setAttribute('data-radix-focus-guard', '');
    document.body.prepend(beforeGuard);
    document.body.append(afterGuard);
    dialogRef.current?.setAttribute('data-focus-trap', 'radix-dialog');
    dialogRef.current?.setAttribute('data-slot', 'dialog-content');
    dialogRef.current?.querySelector<HTMLElement>('[data-slot="select-content"]')?.setAttribute('aria-label', 'Industry code options');
    queueMicrotask(() => dialogRef.current?.querySelector<HTMLElement>('button')?.focus());

    return () => {
      beforeGuard.remove();
      afterGuard.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [dialogRef, open]);
}

function FieldRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="sg-row" style={{ padding: '12px 16px' }}>
      <div>
        <div className="sg-label">{label}</div>
        <div className="sg-hint">{hint}</div>
      </div>
      <div className="sg-field" style={{ width: '100%' }}>
        {children}
      </div>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <div role="alert" style={{ color: 'var(--red-700)', fontSize: 11, marginTop: 4 }}>
      {message}
    </div>
  ) : null;
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <FieldRow label={label} hint="Read-only after creation.">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="mono" style={{ fontSize: 13 }}>
          {value}
        </span>
        <span className="badge badge-gray" style={{ fontSize: 9 }}>
          locked
        </span>
        <span className="muted" style={{ fontSize: 11 }}>
          immutable
        </span>
      </div>
    </FieldRow>
  );
}

export function ManufacturingOperationEditModal({
  open,
  mode,
  operation,
  existingOperations = [],
  loading = false,
  error = null,
  onOpenChange,
  saveManufacturingOperation,
  onSaved,
}: ManufacturingOperationEditModalProps) {
  const [form, setForm] = React.useState<FormState>(() => initialForm(operation));
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [submitting, setSubmitting] = React.useState(false);
  const title = mode === 'create' ? 'Add manufacturing operation' : 'Edit operation';
  const dialogRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();
  const descriptionId = `${titleId}-description`;

  useModalLifecycle(open, dialogRef);

  React.useEffect(() => {
    if (!open) return;
    setForm(initialForm(operation));
    setErrors({});
    setSubmitting(false);
  }, [open, operation]);

  if (!open) return null;

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
  };

  const handleSubmit = async () => {
    const parsed = manufacturingOperationEditSchema.safeParse(form);
    const nextErrors = parsed.success ? {} : errorsFromZod(parsed.error);
    const uniquenessErrors = parsed.success ? validateUniqueness(form, existingOperations, operation?.id) : {};
    const allErrors = { ...nextErrors, ...uniquenessErrors };

    if (Object.keys(allErrors).length > 0 || !parsed.success) {
      setErrors(allErrors);
      return;
    }

    setSubmitting(true);
    try {
      const result = await saveManufacturingOperation({
        operationId: mode === 'edit' ? operation?.id : undefined,
        operation_name: parsed.data.operation_name,
        process_suffix: parsed.data.process_suffix,
        description: parsed.data.description ?? null,
        industry_code: parsed.data.industry_code,
        operation_seq: parsed.data.operation_seq,
        is_active: parsed.data.is_active,
      });

      if (result.ok === false) {
        setErrors({ form: result.error });
        return;
      }

      onSaved({ operationId: result.operationId, revalidatedPath: result.revalidatedPath });
      onOpenChange(false);
    } catch {
      setErrors({ form: 'Failed to save manufacturing operation' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDialogKeyDown: React.KeyboardEventHandler<HTMLElement> = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onOpenChange(false);
      return;
    }

    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = getFocusableElements(dialogRef.current);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <section
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-focus-trap="radix-dialog"
      data-modal-id={modalId}
      data-testid="manufacturing-operation-edit-modal"
      data-slot="dialog-content"
      data-size="md"
      onKeyDown={handleDialogKeyDown}
      style={{ maxWidth: 'var(--modal-size-md-width)' }}
    >
      <div data-testid="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 id={titleId} style={{ margin: 0 }}>{title}</h2>
        <Button type="button" aria-label="Close" className="btn-ghost btn-sm" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </div>
      <div data-testid="modal-body">
        <p id={descriptionId} style={{ color: 'var(--muted)', fontSize: 12, marginTop: 0 }}>
          SET-056 / PRD §8.9.4 — configure tenant manufacturing operations for routing and WIP code generation.
        </p>

        {loading ? (
          <div role="status" className="alert alert-blue" style={{ fontSize: 11 }}>
            Loading manufacturing operation…
          </div>
        ) : error ? (
          <div role="alert" className="alert alert-red" style={{ fontSize: 11 }}>
            {error}
          </div>
        ) : (
          <div className="sg-section-body" style={{ padding: 0 }}>
            {mode === 'edit' ? (
              <LockedField label="Operation name" value={operation?.operation_name ?? form.operation_name} />
            ) : (
              <FieldRow label="Operation name *" hint="Max 50 chars; alphanumeric and spaces only.">
                <label htmlFor="manufacturing-operation-name" className="sr-only">
                  Operation name
                </label>
                <Input
                  id="manufacturing-operation-name"
                  name="operation_name"
                  aria-label="Operation name"
                  value={form.operation_name}
                  onChange={(event) => setField('operation_name', event.target.value)}
                  placeholder="Mix"
                  style={{ width: '100%' }}
                />
                <FieldError message={errors.operation_name} />
              </FieldRow>
            )}

            {mode === 'edit' ? (
              <LockedField label="Process suffix" value={operation?.process_suffix ?? form.process_suffix} />
            ) : (
              <FieldRow label="Process suffix *" hint="Uppercase alphanumeric only; used in WIP code generation (V-SET-MFG-01).">
                <label htmlFor="manufacturing-operation-suffix" className="sr-only">
                  Process suffix
                </label>
                <Input
                  id="manufacturing-operation-suffix"
                  name="process_suffix"
                  aria-label="Process suffix"
                  className="mono"
                  value={form.process_suffix}
                  onChange={(event) => setField('process_suffix', event.target.value)}
                  placeholder="MX"
                  style={{ width: '100%' }}
                />
                <FieldError message={errors.process_suffix} />
              </FieldRow>
            )}

            <FieldRow label="Description" hint="Optional; max 200 chars.">
              <label htmlFor="manufacturing-operation-description" className="sr-only">
                Description
              </label>
              <Textarea
                id="manufacturing-operation-description"
                name="description"
                aria-label="Description"
                rows={3}
                value={form.description}
                onChange={(event) => setField('description', event.target.value)}
                placeholder="Mixing dry ingredients for dough"
                style={{ width: '100%', padding: 8, fontSize: 12, fontFamily: 'inherit' }}
              />
              <FieldError message={errors.description} />
            </FieldRow>

            <FieldRow label="Industry code *" hint="Reference/filter option only.">
              <label id="manufacturing-operation-industry-label" className="sr-only">
                Industry code
              </label>
              <Select
                value={form.industry_code}
                onValueChange={(value) => setField('industry_code', value as IndustryCode)}
                options={industryOptions}
                aria-labelledby="manufacturing-operation-industry-label"
              >
                <SelectTrigger aria-label="Industry code">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {industryOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.industry_code} />
            </FieldRow>

            <FieldRow label="Sequence order *" hint="1-99; controls operation_seq.">
              <label htmlFor="manufacturing-operation-sequence" className="sr-only">
                Sequence order
              </label>
              <Input
                id="manufacturing-operation-sequence"
                name="operation_seq"
                aria-label="Sequence order"
                type="number"
                min={1}
                max={99}
                value={form.operation_seq}
                onChange={(event) => setField('operation_seq', Number(event.target.value))}
                style={{ width: 120 }}
              />
              <FieldError message={errors.operation_seq} />
            </FieldRow>

            <FieldRow label="Active" hint="Inactive operations are hidden from new line/routing assignments.">
              <label id="manufacturing-operation-active-label" className="sr-only">
                Active
              </label>
              <Switch
                aria-labelledby="manufacturing-operation-active-label"
                checked={form.is_active}
                onCheckedChange={(checked) => setField('is_active', checked)}
              />
            </FieldRow>

            {errors.form ? (
              <div role="alert" className="alert alert-red" style={{ fontSize: 11, margin: '0 16px 12px' }}>
                {errors.form}
              </div>
            ) : null}
          </div>
        )}
      </div>
      <div data-testid="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
        <Button type="button" className="btn-ghost btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="button" className="btn-primary btn-sm" disabled={loading || submitting} onClick={handleSubmit}>
          {mode === 'create' ? 'Create operation' : 'Save changes'}
        </Button>
      </div>
    </section>
  );
}

export default ManufacturingOperationEditModal;
