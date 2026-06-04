'use client';

/**
 * T-086 — DocUploadModal (MODAL: Upload compliance document).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:667-689 (DocUploadModal)
 *
 * Translation notes (prototype → production):
 *   - Modal title "Upload compliance document" + subtitle `FA {fa_code}` → @monopilot/ui Modal header
 *   - Field "Document type" raw <select> Spec/Artwork/…  → shadcn Select (raw <select> is a red-line);
 *       options aligned to the REAL DB enum CoA/SDS/Spec/Cert/Other (compliance_docs CHECK), not the
 *       prototype's placeholder values — see deviation log.
 *   - Field "File" text input (prototype mock)            → real <input type="file"> Input with
 *       accept=.pdf,.xlsx,.docx and §19 client MIME + 20 MB size validation (zod superRefine)
 *   - foot Cancel + Upload (disabled until valid)         → Modal.Footer Cancel + submit Button
 *   - (extension) expires_at DatePicker + version bump    → <input type="date"> + server-side version_number
 *       auto-increment (T-084 uploadDoc), per §19 + the AC#2/AC#3 contract
 *
 * §19 client validation red-line: a 25 MB or non-PDF/XLSX/DOCX file produces an inline Zod
 * error and uploadDoc is NOT invoked. The server (T-084 uploadDoc) re-validates size + MIME.
 *
 * The uploadDoc Server Action is injected (uploadDocAction) so the component stays a pure
 * client form; the page wires the real T-084 action (imported, never authored here).
 */

import React from 'react';
import { useForm, FormProvider, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@monopilot/ui/Button';
import Modal from '@monopilot/ui/Modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import Input from '@monopilot/ui/Input';

import type { ComplianceDocsLabels, DocType } from './compliance-docs-screen';

// Server Action signature (owned by T-084 — imported by the page, injected here).
// FormData fields: productCode, docType, title, file, expiresAt.
export type UploadDocAction = (formData: FormData) => Promise<
  | { ok: true; docId: string; versionNumber: number }
  | { ok: false; code: string }
>;

// Aligned to the compliance_docs DB CHECK enum (089-compliance-docs.sql / migration 124).
const DOC_TYPE_VALUES: DocType[] = ['CoA', 'SDS', 'Spec', 'Cert', 'Other'];

// §19 client constraints — mirrored from the T-084 server action constants.
const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ACCEPT_ATTR = '.pdf,.xlsx,.docx';

function makeSchema(labels: ComplianceDocsLabels) {
  return z.object({
    docType: z.enum(['CoA', 'SDS', 'Spec', 'Cert', 'Other']),
    title: z
      .string()
      .trim()
      .min(3, labels.errorTitleRequired)
      .max(300, labels.errorTitleTooLong),
    expiresAt: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: labels.errorFileType }),
    file: z
      .custom<File | null>((v) => v instanceof File, { message: labels.errorFileRequired })
      .superRefine((file, ctx) => {
        if (!(file instanceof File)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: labels.errorFileRequired });
          return;
        }
        if (!ALLOWED_MIME.has(file.type)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: labels.errorFileType });
        }
        if (file.size > MAX_BYTES) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: labels.errorFileTooLarge });
        }
        if (file.size <= 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: labels.errorFileRequired });
        }
      }),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

function docTypeLabel(docType: DocType, labels: ComplianceDocsLabels): string {
  switch (docType) {
    case 'CoA':
      return labels.docTypeCoA;
    case 'SDS':
      return labels.docTypeSDS;
    case 'Spec':
      return labels.docTypeSpec;
    case 'Cert':
      return labels.docTypeCert;
    default:
      return labels.docTypeOther;
  }
}

export function DocUploadModal({
  open,
  productCode,
  labels,
  onClose,
  uploadDocAction,
}: {
  open: boolean;
  productCode: string;
  labels: ComplianceDocsLabels;
  onClose: () => void;
  uploadDocAction?: UploadDocAction;
}) {
  const schema = React.useMemo(() => makeSchema(labels), [labels]);
  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    defaultValues: {
      docType: 'Spec',
      title: '',
      expiresAt: '',
      file: null,
    },
  });

  const {
    control,
    handleSubmit,
    register,
    setValue,
    formState: { errors, isSubmitting },
  } = methods;

  const [serverError, setServerError] = React.useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    if (!(values.file instanceof File)) {
      setServerError(labels.errorFileRequired);
      return;
    }

    const formData = new FormData();
    formData.set('productCode', productCode);
    formData.set('docType', values.docType);
    formData.set('title', values.title.trim());
    formData.set('file', values.file);
    if (values.expiresAt) formData.set('expiresAt', values.expiresAt);

    const result = await uploadDocAction?.(formData);
    if (result && !result.ok) {
      setServerError(labels.errorUpload);
      return;
    }
    onClose();
  });

  const docTypeOptions = DOC_TYPE_VALUES.map((value) => ({ value, label: docTypeLabel(value, labels) }));

  return (
    <Modal open={open} onOpenChange={(next) => (next ? undefined : onClose())} size="md" modalId="docUpload">
      <Modal.Header title={labels.modalTitle} />
      <FormProvider {...methods}>
        <form onSubmit={onSubmit} noValidate>
          <Modal.Body>
            <div className="grid gap-4">
              <p className="text-xs text-slate-500">{labels.modalSubtitle.replace('{code}', productCode)}</p>

              {/* Document type — shadcn Select (raw <select> is a red-line) */}
              <div className="grid gap-1">
                <span id="doc-type-label" className="text-sm font-medium text-slate-700">
                  {labels.fieldDocType} <span aria-label="required">*</span>
                </span>
                <Controller
                  control={control}
                  name="docType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} options={docTypeOptions}>
                      <SelectTrigger aria-label={labels.fieldDocType}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {docTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Title */}
              <div className="grid gap-1">
                <label htmlFor="doc-title" className="text-sm font-medium text-slate-700">
                  {labels.fieldTitle} <span aria-label="required">*</span>
                </label>
                <Input
                  id="doc-title"
                  aria-invalid={errors.title ? 'true' : undefined}
                  aria-describedby={errors.title ? 'doc-title-error' : 'doc-title-hint'}
                  {...register('title')}
                />
                {errors.title ? (
                  <span id="doc-title-error" role="alert" className="text-xs text-red-700">
                    {errors.title.message}
                  </span>
                ) : (
                  <span id="doc-title-hint" className="text-xs text-slate-500">
                    {labels.fieldTitleHint}
                  </span>
                )}
              </div>

              {/* File — real file input with accept + §19 client size/MIME validation */}
              <div className="grid gap-1">
                <label htmlFor="doc-file" className="text-sm font-medium text-slate-700">
                  {labels.fieldFile} <span aria-label="required">*</span>
                </label>
                <Controller
                  control={control}
                  name="file"
                  render={({ field }) => (
                    <Input
                      id="doc-file"
                      type="file"
                      accept={ACCEPT_ATTR}
                      name={field.name}
                      ref={field.ref}
                      aria-invalid={errors.file ? 'true' : undefined}
                      aria-describedby={errors.file ? 'doc-file-error' : 'doc-file-hint'}
                      onBlur={field.onBlur}
                      onChange={(event) => {
                        const picked = event.target.files?.[0] ?? null;
                        setValue('file', picked, { shouldValidate: false });
                      }}
                    />
                  )}
                />
                {errors.file ? (
                  <span id="doc-file-error" role="alert" className="text-xs text-red-700">
                    {errors.file.message as string}
                  </span>
                ) : (
                  <span id="doc-file-hint" className="text-xs text-slate-500">
                    {labels.fieldFileHint}
                  </span>
                )}
              </div>

              {/* Expires at — date picker (native date input) */}
              <div className="grid gap-1">
                <label htmlFor="doc-expires" className="text-sm font-medium text-slate-700">
                  {labels.fieldExpires}
                </label>
                <Input
                  id="doc-expires"
                  type="date"
                  aria-describedby="doc-expires-hint"
                  {...register('expiresAt')}
                />
                <span id="doc-expires-hint" className="text-xs text-slate-500">
                  {labels.fieldExpiresHint}
                </span>
              </div>

              {serverError ? (
                <div role="alert" className="text-sm text-red-700">
                  {serverError}
                </div>
              ) : null}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" className="btn--secondary text-sm" onClick={onClose} disabled={isSubmitting}>
              {labels.cancel}
            </Button>
            <Button type="submit" className="text-sm" disabled={isSubmitting}>
              {labels.uploadAction}
            </Button>
          </Modal.Footer>
        </form>
      </FormProvider>
    </Modal>
  );
}

export default DocUploadModal;
