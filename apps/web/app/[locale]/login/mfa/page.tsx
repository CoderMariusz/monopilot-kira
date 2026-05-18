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
    <main className="w-full max-w-[480px]">
      <section className="w-full rounded-[12px] border border-[#d8e0ea] bg-white px-[36px] pb-7 pt-[36px] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_36px_rgba(15,23,42,0.08)]">
        <div className="mb-7 flex items-center justify-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#1976d2_0%,#1e40af_100%)] text-base font-bold tracking-[-0.02em] text-white">
            M
          </div>
          <div className="text-lg font-bold tracking-[-0.01em] text-slate-950">
            Mono<span className="font-medium text-slate-500">Pilot</span>
          </div>
        </div>

        <h1 className="mb-1.5 text-[22px] font-bold tracking-[-0.015em] text-slate-950">Two-factor authentication</h1>
        <p className="mb-6 text-[13px] text-slate-500">Enter the six-digit TOTP code from your authenticator app.</p>

        {state.error ? (
          <div
            role="alert"
            className="mb-1 rounded-md border border-red-100 border-l-[3px] border-l-red-600 bg-red-50/70 px-3 py-2.5 text-xs text-red-700"
          >
            {state.error || 'Invalid or expired code'}
          </div>
        ) : null}

        <form action={formAction} className="flex flex-col gap-3.5">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="factorId" value={factorId} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="mfa-code" className="text-xs font-medium text-slate-600">
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
              className="h-10 w-full rounded-md border border-[#d8e0ea] bg-white px-3 text-center text-lg tracking-[0.5em] outline-none transition focus:border-[#1976d2] focus:ring-3 focus:ring-[#1976d2]/10"
            />
          </div>

          <Button
            type="submit"
            disabled={isPending}
            className="flex h-[42px] w-full items-center justify-center rounded-md bg-[#1976d2] px-4 text-sm font-semibold text-white transition hover:bg-[#1565c0] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isPending ? 'Verifying...' : 'Verify'}
          </Button>
        </form>

        <button type="button" className="mt-6 w-full text-center text-sm font-medium text-[#1976d2] hover:underline">
          Use recovery code
        </button>
      </section>
    </main>
  );
}
