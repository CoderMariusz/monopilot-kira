'use client';

import Link from 'next/link';
import { use, useActionState } from 'react';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { signInWithPassword, type AuthActionState } from './_actions/auth';

const initialState: AuthActionState = { error: null, success: false };

type LoginPageProps = {
  params: Promise<{ locale: string }>;
};

export default function LoginPage({ params }: LoginPageProps) {
  const { locale } = use(params);
  const [state, formAction, isPending] = useActionState(signInWithPassword, initialState);

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
          <h1 className="mt-3 text-2xl font-semibold text-slate-950">Sign in</h1>
          <p className="mt-2 text-sm text-slate-500">Access your manufacturing command center.</p>
        </div>

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
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoFocus
              required
              autoComplete="email"
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-900 focus:ring-2 focus:ring-blue-900/20"
              placeholder="operator@example.com"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">
                Password
              </label>
              <Link
                href={`/${locale}/login/forgot-password`}
                className="text-sm font-medium text-blue-900 hover:text-blue-700"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-900 focus:ring-2 focus:ring-blue-900/20"
            />
          </div>

          <Button
            type="submit"
            disabled={isPending}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-blue-900 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Signing in...
              </span>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          <span>or</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <Button
          type="button"
          disabled
          aria-disabled="true"
          className="h-11 w-full rounded-lg border border-slate-200 bg-slate-100 px-4 text-sm font-semibold text-slate-400"
        >
          SSO sign-in coming soon
        </Button>
      </section>
    </main>
  );
}
