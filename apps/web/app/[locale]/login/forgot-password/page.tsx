'use client';

import Link from 'next/link';
import { use, useActionState } from 'react';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { sendPasswordReset, type AuthActionState } from '../_actions/auth';

const initialState: AuthActionState = { error: null, success: false };

type ForgotPasswordPageProps = {
  params: Promise<{ locale: string }>;
};

export default function ForgotPasswordPage({ params }: ForgotPasswordPageProps) {
  const { locale } = use(params);
  const [state, formAction, isPending] = useActionState(sendPasswordReset, initialState);

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

        {state.success ? (
          <div className="text-center">
            <div className="sent-art mx-auto mb-3.5 grid h-16 w-16 place-items-center rounded-full bg-blue-100 text-[28px] text-[#1976d2]">
              ✉
            </div>
            <h1 className="mb-1.5 text-[22px] font-bold tracking-[-0.015em] text-slate-950">Check your inbox</h1>
            <p className="text-[13px] text-slate-500">
              We sent a reset link to the work email you provided. Follow the link to set a new password.
            </p>
            <Link
              href={`/${locale}/login`}
              className="mt-[18px] block h-10 rounded-md border border-[#d8e0ea] bg-white px-4 py-2.5 text-[13px] font-medium text-slate-950 hover:bg-slate-50"
            >
              Back to sign in
            </Link>
            <div className="mt-[22px] text-center text-[13px] text-slate-600">
              Did not get it?{' '}
              <Link href={`/${locale}/login/forgot-password`} className="font-medium text-[#1976d2] hover:underline">
                Try a different email
              </Link>
            </div>
          </div>
        ) : (
          <>
            <Link href={`/${locale}/login`} className="mb-3.5 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-[#1976d2]">
              ← Back to sign in
            </Link>
            <h1 className="mb-1.5 text-[22px] font-bold tracking-[-0.015em] text-slate-950">Reset your password</h1>
            <p className="mb-6 text-[13px] text-slate-500">Enter your email and we will send you a reset link.</p>

            <form id="reset-form" action={formAction} className="flex flex-col gap-3.5">
              <input type="hidden" name="locale" value={locale} />

              <div className="rounded-md border border-blue-100 border-l-[3px] border-l-[#1976d2] bg-blue-50/70 px-3 py-2.5 text-xs text-blue-700">
                The link expires in <b>30 minutes</b>. Check your spam folder if it does not arrive within 2 minutes.
              </div>

              {state.error ? (
                <div
                  role="alert"
                  className="rounded-md border border-red-100 border-l-[3px] border-l-red-600 bg-red-50/70 px-3 py-2.5 text-xs text-red-700"
                >
                  {state.error}
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="reset-email" className="text-xs font-medium text-slate-600">
                  Work email
                </label>
                <Input
                  id="reset-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  className="h-10 w-full rounded-md border border-[#d8e0ea] bg-white px-3 text-sm outline-none transition focus:border-[#1976d2] focus:ring-3 focus:ring-[#1976d2]/10"
                  placeholder="you@company.com"
                />
              </div>

              <Button
                type="submit"
                disabled={isPending}
                className="flex h-[42px] w-full items-center justify-center rounded-md bg-[#1976d2] px-4 text-sm font-semibold text-white transition hover:bg-[#1565c0] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isPending ? 'Sending...' : 'Send reset link'}
              </Button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
