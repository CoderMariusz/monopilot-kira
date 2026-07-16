'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { FactorySpecListItem } from '../_actions/shared';
import {
  deleteFactorySpec,
  saveFactorySpecVersion,
  updateFactorySpec,
} from '../actions/factory-spec-lifecycle';

function LifecycleDialog({
  open,
  onClose,
  title,
  subtitle,
  closeLabel,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  closeLabel: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    contentRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="modal-box outline-none"
      >
        <div className="modal-head">
          <div>
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            {subtitle ? <p className="helper mt-0.5">{subtitle}</p> : null}
          </div>
          <button type="button" aria-label={closeLabel} className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

function mapLifecycleError(
  t: ReturnType<typeof useTranslations>,
  error: string,
  message?: string,
): string {
  if (message) return message;
  const known = ['forbidden', 'invalid_state', 'referenced', 'persistence_failed', 'invalid_input', 'not_found'] as const;
  if ((known as readonly string[]).includes(error)) {
    try {
      return t(`errors.${error}`);
    } catch {
      return error;
    }
  }
  return error;
}

export function EditFactorySpecModal({
  open,
  onClose,
  spec,
}: {
  open: boolean;
  onClose: () => void;
  spec: FactorySpecListItem;
}) {
  const t = useTranslations('Technical.factorySpecs.lifecycle.edit');
  const router = useRouter();
  const [specCode, setSpecCode] = React.useState(spec.specCode);
  const [notes, setNotes] = React.useState(spec.notes ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    setSpecCode(spec.specCode);
    setNotes(spec.notes ?? '');
    setError(null);
  }, [open, spec]);

  function onSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await updateFactorySpec({
        specId: spec.id,
        specCode: specCode.trim(),
        notes: notes.trim() || null,
      });
      if (result.ok) {
        router.refresh();
        onClose();
        return;
      }
      setError(mapLifecycleError(t, result.error, result.message));
    });
  }

  return (
    <LifecycleDialog
      open={open}
      onClose={onClose}
      closeLabel={t('cancel')}
      title={t('title', { spec: spec.specCode })}
      subtitle={t('subtitle', { version: spec.version })}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={pending || !specCode.trim()} onClick={onSubmit}>
            {pending ? t('saving') : t('submit')}
          </button>
        </>
      }
    >
      <div className="ff">
        <label htmlFor={`edit-spec-code-${spec.id}`}>{t('specCode')}</label>
        <input
          id={`edit-spec-code-${spec.id}`}
          className="form-input"
          value={specCode}
          onChange={(event) => setSpecCode(event.currentTarget.value)}
        />
      </div>
      <div className="ff">
        <label htmlFor={`edit-spec-notes-${spec.id}`}>{t('notes')}</label>
        <textarea
          id={`edit-spec-notes-${spec.id}`}
          className="form-input"
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.currentTarget.value)}
        />
      </div>
      {error ? (
        <div role="alert" className="alert alert-red mt-3">
          {error}
        </div>
      ) : null}
    </LifecycleDialog>
  );
}

export function SaveFactorySpecVersionModal({
  open,
  onClose,
  spec,
}: {
  open: boolean;
  onClose: () => void;
  spec: FactorySpecListItem;
}) {
  const t = useTranslations('Technical.factorySpecs.lifecycle.version');
  const router = useRouter();
  const [specCode, setSpecCode] = React.useState(spec.specCode);
  const [notes, setNotes] = React.useState(spec.notes ?? '');
  const [changeReason, setChangeReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    setSpecCode(spec.specCode);
    setNotes(spec.notes ?? '');
    setChangeReason('');
    setError(null);
  }, [open, spec]);

  const canSubmit = specCode.trim().length > 0 && changeReason.trim().length >= 10 && !pending;

  function onSubmit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await saveFactorySpecVersion({
        specId: spec.id,
        specCode: specCode.trim(),
        notes: notes.trim() || null,
        changeReason: changeReason.trim(),
      });
      if (result.ok) {
        router.refresh();
        onClose();
        return;
      }
      setError(mapLifecycleError(t, result.error, result.message));
    });
  }

  return (
    <LifecycleDialog
      open={open}
      onClose={onClose}
      closeLabel={t('cancel')}
      title={t('title')}
      subtitle={t('subtitle', { spec: spec.specCode, version: spec.version, nextVersion: spec.version + 1 })}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!canSubmit} onClick={onSubmit}>
            {pending ? t('saving') : t('submit')}
          </button>
        </>
      }
    >
      <div className="ff">
        <label htmlFor={`version-spec-code-${spec.id}`}>{t('specCode')}</label>
        <input
          id={`version-spec-code-${spec.id}`}
          className="form-input"
          value={specCode}
          onChange={(event) => setSpecCode(event.currentTarget.value)}
        />
      </div>
      <div className="ff">
        <label htmlFor={`version-spec-notes-${spec.id}`}>{t('notes')}</label>
        <textarea
          id={`version-spec-notes-${spec.id}`}
          className="form-input"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.currentTarget.value)}
        />
      </div>
      <div className="ff">
        <label htmlFor={`version-change-reason-${spec.id}`}>{t('changeReason')}</label>
        <textarea
          id={`version-change-reason-${spec.id}`}
          className="form-input"
          rows={3}
          minLength={10}
          placeholder={t('changeReasonPlaceholder')}
          value={changeReason}
          onChange={(event) => setChangeReason(event.currentTarget.value)}
        />
        <span className="ff-help">{t('changeReasonHelp')}</span>
      </div>
      <div className="alert alert-blue" role="note">
        {t('previousVersionNote', { version: spec.version })}
      </div>
      {error ? (
        <div role="alert" className="alert alert-red mt-3">
          {error}
        </div>
      ) : null}
    </LifecycleDialog>
  );
}

export function DeleteFactorySpecModal({
  open,
  onClose,
  spec,
}: {
  open: boolean;
  onClose: () => void;
  spec: FactorySpecListItem;
}) {
  const t = useTranslations('Technical.factorySpecs.lifecycle.delete');
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open]);

  function onSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await deleteFactorySpec({ specId: spec.id });
      if (result.ok) {
        router.refresh();
        onClose();
        return;
      }
      setError(mapLifecycleError(t, result.error, result.message));
    });
  }

  return (
    <LifecycleDialog
      open={open}
      onClose={onClose}
      closeLabel={t('cancel')}
      title={t('title', { spec: spec.specCode })}
      subtitle={t('subtitle', { version: spec.version })}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={onSubmit}>
            {pending ? t('deleting') : t('confirm')}
          </button>
        </>
      }
    >
      <div className="alert alert-amber" role="note">
        {t('warning')}
      </div>
      {error ? (
        <div role="alert" className="alert alert-red mt-3">
          {error}
        </div>
      ) : null}
    </LifecycleDialog>
  );
}
