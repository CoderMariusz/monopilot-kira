'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { createFactorySpec } from '../actions/create-factory-spec';

type CreateState = 'idle' | 'submitting' | 'success' | 'error';

function fallbackTranslator(t: ReturnType<typeof useTranslations>) {
  return (key: string, fallback: string): string => {
    try {
      const value = t(key);
      return value === key || value.endsWith(`.${key}`) ? fallback : value;
    } catch {
      return fallback;
    }
  };
}

export function CreateFactorySpecButton({ label }: { label: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        {label}
      </button>
      <CreateFactorySpecModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function CreateFactorySpecModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('Technical.factorySpecs.create');
  const tt = React.useMemo(() => fallbackTranslator(t), [t]);
  const router = useRouter();
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [specCode, setSpecCode] = React.useState('');
  const [fgItemId, setFgItemId] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [state, setState] = React.useState<CreateState>('idle');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setSpecCode('');
      setFgItemId('');
      setNotes('');
      setState('idle');
      setError(null);
      return;
    }
    contentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const canSubmit = state !== 'submitting' && specCode.trim().length > 0 && fgItemId.trim().length > 0;

  const errorLabels: Record<string, string> = {
    invalid_input: tt('errors.invalid_input', 'Check the specification fields and try again.'),
    forbidden: tt('errors.forbidden', 'You do not have permission to create specifications.'),
    not_found: tt('errors.not_found', 'The finished good item was not found.'),
    already_exists: tt('errors.already_exists', 'A specification version already exists for this item.'),
    persistence_failed: tt('errors.persistence_failed', 'The specification could not be saved.'),
  };

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('submitting');
    setError(null);

    const result = await createFactorySpec({
      fgItemId: fgItemId.trim(),
      specCode: specCode.trim(),
      notes: notes.trim().length > 0 ? notes.trim() : undefined,
    });

    if (!result.ok) {
      setState('error');
      setError(result.message ?? errorLabels[result.error] ?? errorLabels.persistence_failed);
      return;
    }

    setState('success');
    router.refresh();
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && state !== 'submitting') onClose();
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
        <form onSubmit={onSubmit}>
          <div className="modal-head">
            <div>
              <h2 id={titleId} className="modal-title">
                {tt('title', 'New specification')}
              </h2>
              <p className="helper mt-0.5">{tt('subtitle', 'Create a draft factory specification for an FG item.')}</p>
            </div>
            <button
              type="button"
              aria-label={tt('close', 'Close')}
              className="modal-close"
              onClick={onClose}
              disabled={state === 'submitting'}
            >
              x
            </button>
          </div>

          <div className="modal-body">
            {error ? (
              <div role="alert" className="alert alert-red mb-3">
                <div className="alert-title">{error}</div>
              </div>
            ) : null}

            <div className="ff">
              <label htmlFor="factory-spec-code">{tt('fields.specCode', 'Specification code')}</label>
              <input
                id="factory-spec-code"
                className="form-input"
                value={specCode}
                onChange={(event) => setSpecCode(event.target.value)}
                required
                maxLength={120}
                disabled={state === 'submitting'}
              />
              <span className="ff-help">{tt('hints.specCode', 'Use the canonical technical spec code.')}</span>
            </div>

            <div className="ff mt-3">
              <label htmlFor="factory-spec-fg-item-id">{tt('fields.fgItemId', 'FG item ID')}</label>
              <input
                id="factory-spec-fg-item-id"
                className="form-input mono"
                value={fgItemId}
                onChange={(event) => setFgItemId(event.target.value)}
                required
                disabled={state === 'submitting'}
              />
              <span className="ff-help">{tt('hints.fgItemId', 'UUID of the finished-good item in the item master.')}</span>
            </div>

            <div className="ff mt-3">
              <label htmlFor="factory-spec-notes">{tt('fields.notes', 'Notes')}</label>
              <textarea
                id="factory-spec-notes"
                className="form-input"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={2000}
                rows={4}
                disabled={state === 'submitting'}
              />
            </div>
          </div>

          <div className="modal-foot">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={state === 'submitting'}>
              {tt('cancel', 'Cancel')}
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={!canSubmit}>
              {state === 'submitting' ? tt('saving', 'Creating...') : tt('submit', 'Create draft')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
