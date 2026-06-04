'use client';

/**
 * T-022 — Dept Close modal (Advance Gate variant).
 *
 * Prototype parity anchor:
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:143-191 (DeptCloseModal)
 *
 * Structural map (prototype → production):
 *   - <Modal title={`Close ${dept} section`} subtitle={`FA ...`}>  → @monopilot/ui/Modal + Modal.Header / subtitle line
 *   - "V05 · Required field check" eyebrow                          → header eyebrow (i18n requiredCheckHeader)
 *   - items.map(([label, ok]) => row with ✓/✗)                     → required-field checklist; each row label + pass/fail
 *     icon with ACCESSIBLE text ("<name> — filled/missing") so colour is never the sole signal
 *   - alert-green "safe to close" / alert-amber "Cannot close"      → success / cannot-close banners (role=status / alert)
 *   - <Field label="Closing note (optional)"><textarea/></Field>    → shadcn Textarea (data-slot) bound via RHF
 *   - foot: Cancel + "✓ Confirm close" (disabled={!allPass})        → Modal.Footer Cancel + Confirm buttons
 *
 * Real-data wiring: the parent server boundary calls the
 * `getRequiredFieldsForDept` (readiness) + `closeDeptSection` (T-017) Server
 * Actions and passes the typed result + an `onConfirm` caller down as props.
 * This client component NEVER touches the DB. Server recomputes `allPass`, so
 * the client cannot enable Confirm for a dept the action would reject.
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import Modal from '@monopilot/ui/Modal';
import Textarea from '@monopilot/ui/Textarea';
import { Button } from '@monopilot/ui/Button';

import type { Dept, RequiredFieldsForDept } from '../fa/actions/get-required-fields-for-dept';

const NOTE_MIN_LENGTH = 10;

export type DeptCloseModalStatus = 'loading' | 'ready' | 'error' | 'forbidden';

export type DeptCloseModalFa = {
  faCode: string;
  productName: string;
};

export type DeptCloseConfirmInput = {
  dept: Dept;
  /** Optional closing note for the audit trail; empty string when omitted. */
  note: string;
};

export type DeptCloseModalProps = {
  open: boolean;
  dept: Dept;
  fa: DeptCloseModalFa;
  /** Server-fetched readiness result; null while loading / on error / forbidden. */
  requiredFields: RequiredFieldsForDept | null;
  status: DeptCloseModalStatus;
  onClose: () => void;
  /** Calls the closeDeptSection Server Action then refreshes the route (owned by parent). */
  onConfirm: (input: DeptCloseConfirmInput) => Promise<void> | void;
};

type NoteForm = { note: string };

export function DeptCloseModal({
  open,
  dept,
  fa,
  requiredFields,
  status,
  onClose,
  onConfirm,
}: DeptCloseModalProps) {
  const t = useTranslations('npd.deptClose');
  const [submitting, setSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NoteForm>({ defaultValues: { note: '' } });

  React.useEffect(() => {
    if (!open) {
      reset({ note: '' });
      setSubmitting(false);
    }
  }, [open, reset]);

  const fields = requiredFields?.fields ?? [];
  const allPass = status === 'ready' && requiredFields?.allPass === true;
  const canConfirm = allPass && !submitting;

  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  const submit = handleSubmit(async ({ note }) => {
    if (!allPass || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm({ dept, note: note.trim() });
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Modal open={open} onOpenChange={handleOpenChange} size="md" modalId="npd-dept-close">
      <Modal.Header title={t('titleClose', { dept })} />
      <p data-slot="dialog-subtitle" className="mt-1 text-xs text-slate-500">
        {t('subtitle', { faCode: fa.faCode, productName: fa.productName })}
      </p>

      <Modal.Body>
        {status === 'loading' ? (
          <p data-slot="dept-close-loading" role="status" className="py-4 text-sm text-slate-600">
            {t('loading')}
          </p>
        ) : status === 'forbidden' ? (
          <p data-slot="dept-close-forbidden" role="status" className="py-4 text-sm text-slate-700">
            {t('forbidden')}
          </p>
        ) : status === 'error' ? (
          <div role="alert" className="my-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {t('error')}
          </div>
        ) : (
          <DeptCloseBody
            t={t}
            fields={fields}
            allPass={allPass}
            register={register}
            noteError={errors.note?.message}
          />
        )}
      </Modal.Body>

      {status === 'forbidden' ? (
        <Modal.Footer>
          <Button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('cancel')}
          </Button>
        </Modal.Footer>
      ) : (
        <Modal.Footer>
          <Button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            className="btn-success btn-sm"
            disabled={!canConfirm}
            aria-disabled={!canConfirm}
            onClick={() => void submit()}
          >
            {submitting ? t('submitting') : `✓ ${t('confirm')}`}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
}

type TranslateFn = ReturnType<typeof useTranslations>;

function DeptCloseBody({
  t,
  fields,
  allPass,
  register,
  noteError,
}: {
  t: TranslateFn;
  fields: RequiredFieldsForDept['fields'];
  allPass: boolean;
  register: ReturnType<typeof useForm<NoteForm>>['register'];
  noteError?: string;
}) {
  const noteId = 'npd-dept-close-note';
  const noteErrorId = `${noteId}-error`;

  return (
    <>
      <div
        data-slot="required-check-header"
        className="mb-2 text-[11px] uppercase tracking-wide text-slate-500"
      >
        {t('requiredCheckHeader')}
      </div>

      {fields.length === 0 ? (
        <p data-slot="dept-close-empty" role="status" className="py-3 text-sm text-slate-600">
          {t('empty')}
        </p>
      ) : (
        <ul data-slot="required-field-checklist" className="mb-3 space-y-1">
          {fields.map((field) => (
            <li
              key={field.key}
              data-ok={field.ok ? 'true' : 'false'}
              className="flex items-center gap-2 py-0.5 text-xs"
            >
              <span
                aria-hidden="true"
                className={field.ok ? 'font-bold text-green-600' : 'font-bold text-red-600'}
              >
                {field.ok ? '✓' : '✗'}
              </span>
              <span className={field.ok ? 'text-slate-700' : 'text-red-700'}>
                {field.ok
                  ? t('fieldPass', { name: field.name })
                  : t('fieldFail', { name: field.name })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {fields.length > 0 &&
        (allPass ? (
          <div
            role="status"
            className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
          >
            {t('allPassBanner')}
          </div>
        ) : (
          <div
            role="alert"
            className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            {t('cannotCloseBanner')}
          </div>
        ))}

      <div>
        <label htmlFor={noteId} className="mb-1 block text-xs font-medium text-slate-700">
          {t('noteLabel')}
        </label>
        <Textarea
          id={noteId}
          rows={2}
          aria-label={t('noteLabel')}
          aria-invalid={noteError ? 'true' : undefined}
          aria-describedby={noteError ? noteErrorId : undefined}
          placeholder={t('notePlaceholder')}
          {...register('note', {
            validate: (value) =>
              value.trim().length === 0 || value.trim().length >= NOTE_MIN_LENGTH || t('noteTooShort'),
          })}
        />
        {noteError ? (
          <span id={noteErrorId} role="alert" className="mt-1 block text-xs text-red-600">
            {noteError}
          </span>
        ) : null}
      </div>
    </>
  );
}

export default DeptCloseModal;
