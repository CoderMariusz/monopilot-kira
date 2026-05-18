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
    <>
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

          <h1 className="mb-1.5 text-[22px] font-bold tracking-[-0.015em] text-slate-950">Welcome back</h1>
          <p className="mb-6 text-[13px] text-slate-500">Sign in to your MES workspace</p>

          {state.error ? (
            <div
              role="alert"
              className="mb-1 rounded-md border border-red-100 border-l-[3px] border-l-red-600 bg-red-50/70 px-3 py-2.5 text-xs text-red-700"
            >
              {state.error}
            </div>
          ) : null}

          <form action={formAction} className="flex flex-col gap-3.5">
            <input type="hidden" name="locale" value={locale} />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-medium text-slate-600">
                Work email
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                autoFocus
                required
                autoComplete="username"
                className="h-10 w-full rounded-md border border-[#d8e0ea] bg-white px-3 text-sm outline-none transition focus:border-[#1976d2] focus:ring-3 focus:ring-[#1976d2]/10"
                placeholder="you@company.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-medium text-slate-600">
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="h-10 w-full rounded-md border border-[#d8e0ea] bg-white px-3 text-sm outline-none transition focus:border-[#1976d2] focus:ring-3 focus:ring-[#1976d2]/10"
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label htmlFor="remember" className="flex cursor-pointer items-center gap-1.5 text-slate-600">
                <input id="remember" name="remember" type="checkbox" defaultChecked className="h-3.5 w-3.5 rounded border-[#d8e0ea]" />
                Remember me for 30 days
              </label>
              <Link href={`/${locale}/login/forgot-password`} className="font-medium text-[#1976d2] hover:underline">
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              disabled={isPending}
              className="flex h-[42px] w-full items-center justify-center rounded-md bg-[#1976d2] px-4 text-sm font-semibold text-white transition hover:bg-[#1565c0] disabled:cursor-not-allowed disabled:bg-slate-300"
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

          <div className="my-[18px] flex items-center gap-3 text-[11px] uppercase tracking-[0.06em] text-slate-500">
            <span className="h-px flex-1 bg-[#d8e0ea]" />
            <span>or</span>
            <span className="h-px flex-1 bg-[#d8e0ea]" />
          </div>

          <Button
            type="button"
            disabled
            aria-disabled="true"
            className="h-10 w-full rounded-md border border-[#d8e0ea] bg-white px-4 text-[13px] font-medium text-slate-400 disabled:cursor-not-allowed"
          >
            SSO sign-in coming soon
          </Button>

          <div className="mt-[22px] text-center text-[13px] text-slate-600">
            Do not have an account?{' '}
            <a href="mailto:admin@monopilot.app" className="font-medium text-[#1976d2] hover:underline">
              Contact your admin
            </a>
          </div>
        </section>
      </main>

      <footer className="px-5 py-5 text-center text-[11px] text-slate-500">
        © 2026 MonoPilot MES
        <span className="mx-2 text-slate-300">·</span>
        <a href="#privacy" className="text-slate-600 hover:underline">
          Privacy
        </a>
        <span className="mx-2 text-slate-300">·</span>
        <a href="#terms" className="text-slate-600 hover:underline">
          Terms
        </a>
        <span className="mx-2 text-slate-300">·</span>
        <a href="#status" className="text-slate-600 hover:underline">
          Status
        </a>
        <span className="mx-2 text-slate-300">·</span>
        <span>v3.1.0</span>
      </footer>
    </>
  );
}
