'use client';

/**
 * W9-L7 — "E-sign & scanner PIN" management screen (client island).
 *
 * Shows WHETHER a PIN is set (never the PIN), the lockout status when the
 * server reports one, and a set/change form authorized by the account
 * password OR the current PIN. All strings arrive prebuilt (EN+PL via
 * next-intl on the server page) so this island stays dumb.
 */

import React, { useState } from 'react';

import type { PinStatus, SetPinInput, SetPinResult } from './pin-data';

export type PinScreenLabels = {
  title: string;
  subtitle: string;
  sharedNotice: string;
  statusTitle: string;
  statusSet: string;
  statusNotSet: string;
  statusError: string;
  /** Prebuilt server-side from status.lockedUntil; null when not locked. */
  lockedUntilText: string | null;
  /** Prebuilt server-side from status.failedAttempts; null when 0. */
  failedAttemptsText: string | null;
  formTitleSet: string;
  formTitleNotSet: string;
  authMethod: string;
  authPassword: string;
  authPin: string;
  currentPassword: string;
  currentPin: string;
  newPin: string;
  confirmPin: string;
  submit: string;
  submitting: string;
  success: string;
  errors: Record<string, string>;
  errorFallback: string;
};

export type PinScreenProps = {
  labels: PinScreenLabels;
  status: PinStatus;
  setEsignPin: (input: SetPinInput) => Promise<SetPinResult>;
};

export default function PinScreen({ labels, status, setEsignPin }: PinScreenProps) {
  const [pinSet, setPinSet] = useState(status.pinSet);
  const [authMethod, setAuthMethod] = useState<'password' | 'pin'>('password');
  const [currentSecret, setCurrentSecret] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const canSubmit =
    !busy && currentSecret.trim() !== '' && newPin.trim() !== '' && confirmPin.trim() !== '';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setSaved(false);

    const result = await setEsignPin({ authMethod, currentSecret, newPin, confirmPin });
    setBusy(false);

    if (result.ok) {
      setPinSet(true);
      setSaved(true);
      setCurrentSecret('');
      setNewPin('');
      setConfirmPin('');
    } else {
      setError(labels.errors[result.error] ?? labels.errorFallback);
    }
  }

  return (
    <main aria-labelledby="account-pin-heading" className="grid gap-4 p-6">
      <header>
        <h1 id="account-pin-heading" className="text-lg font-semibold text-slate-900">
          {labels.title}
        </h1>
        <p className="text-sm text-slate-600">{labels.subtitle}</p>
      </header>

      <section
        aria-label={labels.statusTitle}
        className="rounded-lg border border-slate-200 bg-white p-4"
        data-testid="account-pin-status"
      >
        <h2 className="mb-2 text-sm font-semibold text-slate-900">{labels.statusTitle}</h2>
        {status.state === 'error' ? (
          <p role="alert" className="text-sm text-red-700" data-testid="account-pin-status-error">
            {labels.statusError}
          </p>
        ) : (
          <>
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                pinSet ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}
              data-testid="account-pin-status-badge"
            >
              {pinSet ? labels.statusSet : labels.statusNotSet}
            </span>
            {labels.lockedUntilText ? (
              <p role="alert" className="mt-2 text-sm text-red-700" data-testid="account-pin-locked">
                {labels.lockedUntilText}
              </p>
            ) : null}
            {labels.failedAttemptsText ? (
              <p className="mt-2 text-sm text-slate-600" data-testid="account-pin-attempts">
                {labels.failedAttemptsText}
              </p>
            ) : null}
          </>
        )}
        <p className="mt-3 text-xs text-slate-500" data-testid="account-pin-shared-notice">
          {labels.sharedNotice}
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          {pinSet ? labels.formTitleSet : labels.formTitleNotSet}
        </h2>

        {error ? (
          <p role="alert" className="mb-3 text-sm text-red-700" data-testid="account-pin-error">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="mb-3 text-sm text-emerald-700" data-testid="account-pin-success">
            {labels.success}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="grid max-w-md gap-3">
          <fieldset className="grid gap-1" disabled={busy}>
            <legend className="text-sm font-medium text-slate-700">{labels.authMethod}</legend>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="account-pin-auth-method"
                value="password"
                checked={authMethod === 'password'}
                onChange={() => setAuthMethod('password')}
                data-testid="account-pin-auth-password"
              />
              {labels.authPassword}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="account-pin-auth-method"
                value="pin"
                checked={authMethod === 'pin'}
                disabled={!pinSet}
                onChange={() => setAuthMethod('pin')}
                data-testid="account-pin-auth-pin"
              />
              {labels.authPin}
            </label>
          </fieldset>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            {authMethod === 'password' ? labels.currentPassword : labels.currentPin}
            <input
              type="password"
              autoComplete="off"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={currentSecret}
              disabled={busy}
              onChange={(e) => setCurrentSecret(e.target.value)}
              data-testid="account-pin-current-secret"
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            {labels.newPin}
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              className="rounded border border-slate-300 px-2 py-1.5 font-mono text-sm"
              value={newPin}
              disabled={busy}
              onChange={(e) => setNewPin(e.target.value)}
              data-testid="account-pin-new"
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            {labels.confirmPin}
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              className="rounded border border-slate-300 px-2 py-1.5 font-mono text-sm"
              value={confirmPin}
              disabled={busy}
              onChange={(e) => setConfirmPin(e.target.value)}
              data-testid="account-pin-confirm"
            />
          </label>

          <div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              data-testid="account-pin-submit"
            >
              {busy ? labels.submitting : labels.submit}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
