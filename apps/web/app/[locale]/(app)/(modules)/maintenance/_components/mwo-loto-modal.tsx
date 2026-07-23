'use client';

import { useState, useTransition } from 'react';

import { Select } from '@monopilot/ui/Select';

import type { MwoLotoVerifierOption } from '../_actions/mwo-types';
import { ModalShell } from './mwo-modal-shell';

export type MwoLotoModalLabels = {
  lockoutTitle: string;
  releaseTitle: string;
  energySources: string;
  energySourcesPlaceholder: string;
  tagsApplied: string;
  tagsAppliedPlaceholder: string;
  signaturePassword: string;
  releaseSignaturePassword: string;
  verifier: string;
  verifierPlaceholder: string;
  verifierPassword: string;
  noVerifiers: string;
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

type LotoLockoutAction = (input: {
  mwoId: string;
  energySourcesIsolated: string[];
  tagsApplied: string[];
  signature: { password: string };
  verifierSignature: { userId: string; password: string };
}) => Promise<LotoActionResult>;

type LotoReleaseAction = (input: {
  mwoId: string;
  signature: { password: string };
}) => Promise<LotoActionResult>;

function nonEmptyLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function MwoLotoModal({
  mode,
  mwoId,
  labels,
  verifierOptions,
  lockoutAction,
  releaseAction,
  onClose,
  onDone,
}: {
  mode: 'lockout' | 'release';
  mwoId: string;
  labels: MwoLotoModalLabels;
  verifierOptions: MwoLotoVerifierOption[];
  lockoutAction: LotoLockoutAction;
  releaseAction: LotoReleaseAction;
  onClose: () => void;
  onDone: () => void;
}) {
  const [energySources, setEnergySources] = useState('');
  const [tagsApplied, setTagsApplied] = useState('');
  const [signaturePassword, setSignaturePassword] = useState('');
  const [verifierUserId, setVerifierUserId] = useState('');
  const [verifierPassword, setVerifierPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const title = mode === 'lockout' ? labels.lockoutTitle : labels.releaseTitle;
  const submitLabel = mode === 'lockout' ? labels.submitLockout : labels.submitRelease;
  const signatureLabel = mode === 'lockout' ? labels.signaturePassword : labels.releaseSignaturePassword;
  const testId = mode === 'lockout' ? 'mwo-loto-lockout-modal' : 'mwo-loto-release-modal';

  const submit = () => {
    const isolatedSources = nonEmptyLines(energySources);
    const appliedTags = nonEmptyLines(tagsApplied);
    if (
      !signaturePassword.trim()
      || (
        mode === 'lockout'
        && (
          isolatedSources.length === 0
          || appliedTags.length === 0
          || !verifierUserId
          || !verifierPassword.trim()
        )
      )
    ) {
      setError(labels.errorRequired);
      return;
    }

    setError(null);
    startSubmit(async () => {
      const result = mode === 'lockout'
        ? await lockoutAction({
            mwoId,
            energySourcesIsolated: isolatedSources,
            tagsApplied: appliedTags,
            signature: { password: signaturePassword },
            verifierSignature: {
              userId: verifierUserId,
              password: verifierPassword,
            },
          })
        : await releaseAction({ mwoId, signature: { password: signaturePassword } });
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
              : result.reason === 'invalid_verifier'
                ? labels.noVerifiers
                : result.reason === 'invalid_transition'
                  ? (result.message ?? labels.errorInvalidTransition)
                  : labels.errorFailed,
      );
    });
  };

  return (
    <ModalShell title={title} testId={testId} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {mode === 'lockout' ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">{labels.energySources}</span>
              <textarea
                value={energySources}
                onChange={(event) => setEnergySources(event.target.value)}
                placeholder={labels.energySourcesPlaceholder}
                rows={3}
                data-testid={`${testId}-energy-sources`}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">{labels.tagsApplied}</span>
              <textarea
                value={tagsApplied}
                onChange={(event) => setTagsApplied(event.target.value)}
                placeholder={labels.tagsAppliedPlaceholder}
                rows={2}
                data-testid={`${testId}-tags`}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
              />
            </label>
          </>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{signatureLabel}</span>
          <input
            type="password"
            value={signaturePassword}
            onChange={(e) => setSignaturePassword(e.target.value)}
            autoComplete="current-password"
            data-testid={`${testId}-signature`}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        {mode === 'lockout' ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">{labels.verifier}</span>
              {verifierOptions.length === 0 ? (
                <span
                  data-testid={`${testId}-no-verifiers`}
                  className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800"
                >
                  {labels.noVerifiers}
                </span>
              ) : (
                <div data-testid={`${testId}-verifier`}>
                  <Select
                    aria-label={labels.verifier}
                    value={verifierUserId}
                    placeholder={labels.verifierPlaceholder}
                    onValueChange={setVerifierUserId}
                    options={verifierOptions.map((verifier) => ({
                      value: verifier.id,
                      label: `${verifier.name} · ${verifier.email}`,
                    }))}
                  />
                </div>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">{labels.verifierPassword}</span>
              <input
                type="password"
                value={verifierPassword}
                onChange={(event) => setVerifierPassword(event.target.value)}
                autoComplete="current-password"
                data-testid={`${testId}-verifier-signature`}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
              />
            </label>
          </>
        ) : null}

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
            disabled={submitting || (mode === 'lockout' && verifierOptions.length === 0)}
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
