'use client';

import { useSearchParams } from 'next/navigation';
import { use, useActionState } from 'react';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { verifyMfaCode, type AuthActionState } from '../_actions/auth';

const initialState: AuthActionState = { error: null, success: false };

type MfaPageProps = {
  params: Promise<{ locale: string }>;
};

export default function MfaPage({ params }: MfaPageProps) {
  const { locale } = use(params);
  const searchParams = useSearchParams();
  const factorId = searchParams.get('factorId') ?? '';
  const [state, formAction, isPending] = useActionState(verifyMfaCode, initialState);

  return (
    <main className="w-full max-w-md">
      <section className="rounded-2xl border border-slate-800 bg-white p-8 shadow-2xl shadow-slate-950/30">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-900 text-lg font-bold text-white">
            MP
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-900">
            MonoPilot
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950">Two-factor authentication</h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter the six-digit TOTP code from your authenticator app.
          </p>
        </div>

        {state.error ? (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {state.error || 'Invalid or expired code'}
          </div>
        ) : null}

        <form action={formAction} className="space-y-5">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="factorId" value={factorId} />

          <div className="space-y-2">
            <label htmlFor="mfa-code" className="text-sm font-medium text-slate-700">
              Verification code
            </label>
            <Input
              id="mfa-code"
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              required
              className="h-12 w-full rounded-lg border border-slate-300 px-3 text-center text-lg tracking-[0.5em] outline-none transition focus:border-blue-900 focus:ring-2 focus:ring-blue-900/20"
            />
          </div>

          <Button
            type="submit"
            disabled={isPending}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-blue-900 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? 'Verifying...' : 'Verify'}
          </Button>
        </form>

        <button
          type="button"
          className="mt-6 w-full text-center text-sm font-medium text-blue-900 hover:text-blue-700"
        >
          Use recovery code
        </button>
      </section>
    </main>
  );
}
