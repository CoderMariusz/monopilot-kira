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
    <main className="w-full max-w-md">
      <section className="rounded-2xl border border-slate-800 bg-white p-8 shadow-2xl shadow-slate-950/30">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-900 text-lg font-bold text-white">
            MP
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-900">
            MonoPilot
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950">Reset your password</h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter your email and we will send reset link instructions.
          </p>
        </div>

        {state.success ? (
          <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Check your email — a reset link has been sent.
          </div>
        ) : null}

        {state.error ? (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {state.error}
          </div>
        ) : null}

        <form action={formAction} className="space-y-5">
          <input type="hidden" name="locale" value={locale} />
          <div className="space-y-2">
            <label htmlFor="reset-email" className="text-sm font-medium text-slate-700">
              Email
            </label>
            <Input
              id="reset-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-900 focus:ring-2 focus:ring-blue-900/20"
              placeholder="operator@example.com"
            />
          </div>

          <Button
            type="submit"
            disabled={isPending}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-blue-900 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? 'Sending...' : 'Send reset link'}
          </Button>
        </form>

        <Link
          href={`/${locale}/login`}
          className="mt-6 block text-center text-sm font-medium text-blue-900 hover:text-blue-700"
        >
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
