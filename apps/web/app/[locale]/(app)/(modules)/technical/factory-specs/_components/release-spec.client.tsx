'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { releaseFactorySpecToFactory } from '../actions/factory-spec-flow';

export function ReleaseSpecButton({
  specId,
  specCode,
  canRelease,
}: {
  specId: string;
  specCode: string;
  canRelease: boolean;
}) {
  const t = useTranslations('Technical.factorySpecs.release');
  const router = useRouter();
  const titleId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, pending]);

  function mapError(raw: string): string {
    if (raw === 'forbidden') return t('errors.forbidden');
    if (raw === 'persistence_failed') return t('errors.generic');
    return raw;
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await releaseFactorySpecToFactory({ specId });
      if (!result.ok) {
        setError(mapError(result.message ?? result.error));
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        data-testid={`factory-spec-release-${specId}`}
        className="font-medium hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
        style={{ color: 'var(--green)' }}
        disabled={!canRelease}
        aria-disabled={!canRelease}
        title={canRelease ? undefined : t('permissionTooltip')}
        onClick={() => setOpen(true)}
      >
        {t('action')}
      </button>

      {open ? (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setOpen(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal-box outline-none">
            <div className="modal-head">
              <h2 id={titleId} className="modal-title">
                {t('title')}
              </h2>
              <button
                type="button"
                aria-label={t('cancel')}
                className="modal-close"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="helper">{t('body', { spec: specCode })}</p>
              {error ? (
                <div role="alert" className="alert alert-red mt-3" style={{ fontSize: 12 }} data-testid="factory-spec-release-error">
                  {error}
                </div>
              ) : null}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => setOpen(false)}>
                {t('cancel')}
              </button>
              <button
                type="button"
                data-testid="factory-spec-release-confirm"
                className="btn btn-primary btn-sm"
                disabled={pending}
                aria-busy={pending}
                onClick={submit}
              >
                {pending ? t('submitting') : t('confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
