'use client';

import { useState, useTransition } from 'react';

import { ModalShell } from './mwo-modal-shell';

export type MwoLotoModalLabels = {
  lockoutTitle: string;
  releaseTitle: string;
  signaturePassword: string;
  submitLockout: string;
  submitRelease: string;
  submitting: string;
  cancel: string;
  errorRequired: string;
  errorFailed: string;
  errorForbidden: string;
  errorEsign: string;
  errorSameActor: string;
  errorInvalidTransition: string;
};

type LotoActionResult = { ok: boolean; reason?: string; message?: string };

type LotoSignAction = (input: {
  mwoId: string;
  signature: { password: string };
}) => Promise<LotoActionResult>;

export function MwoLotoModal({
  mode,
  mwoId,
  labels,
  signAction,
  onClose,
  onDone,
}: {
  mode: 'lockout' | 'release';
  mwoId: string;
  labels: MwoLotoModalLabels;
  signAction: LotoSignAction;
  onClose: () => void;
  onDone: () => void;
}) {
  const [signaturePassword, setSignaturePassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const title = mode === 'lockout' ? labels.lockoutTitle : labels.releaseTitle;
  const submitLabel = mode === 'lockout' ? labels.submitLockout : labels.submitRelease;
  const testId = mode === 'lockout' ? 'mwo-loto-lockout-modal' : 'mwo-loto-release-modal';

  const submit = () => {
    if (!signaturePassword.trim()) {
      setError(labels.errorRequired);
      return;
    }

    setError(null);
    startSubmit(async () => {
      const result = await signAction({ mwoId, signature: { password: signaturePassword } });
      if (result.ok) {
        onDone();
        return;
      }
      setError(
        result.reason === 'forbidden'
          ? labels.errorForbidden
          : result.reason === 'esign_failed'
            ? labels.errorEsign
            : result.reason === 'loto_same_actor'
              ? labels.errorSameActor
              : result.reason === 'invalid_transition'
                ? (result.message ?? labels.errorInvalidTransition)
                : labels.errorFailed,
      );
    });
  };

  return (
    <ModalShell title={title} testId={testId} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.signaturePassword}</span>
          <input
            type="password"
            value={signaturePassword}
            onChange={(e) => setSignaturePassword(e.target.value)}
            autoComplete="current-password"
            data-testid={`${testId}-signature`}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        {error ? (
          <p
            role="alert"
            data-testid={`${testId}-error`}
            className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid={`${testId}-cancel`}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            data-testid={`${testId}-submit`}
            className={
              mode === 'release'
                ? 'rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-300'
                : 'rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-amber-300'
            }
          >
            {submitting ? labels.submitting : submitLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
