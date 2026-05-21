"use client";

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useActionState } from 'react';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { sendPasswordReset, signInWithPassword, verifyMfaCode, type AuthActionState } from './_actions/auth';

export type LoginLabels = {
  title: string;
  subtitle: string;
  emailLabel: string;
  passwordLabel: string;
  emailPlaceholder: string;
  passwordPlaceholder: string;
  remember: string;
  forgotPassword: string;
  submit: string;
  submitting: string;
  divider: string;
  ssoComingSoon: string;
  noAccount: string;
  contactAdmin: string;
  privacy: string;
  terms: string;
  status: string;
};

export type ForgotPasswordLabels = {
  backToSignIn: string;
  title: string;
  subtitle: string;
  emailLabel: string;
  emailPlaceholder: string;
  info: string;
  submit: string;
  submitting: string;
  successTitle: string;
  successBody: string;
  successBack: string;
  successRetryPrefix: string;
  successRetry: string;
};

export type MfaLabels = {
  title: string;
  subtitle: string;
  codeLabel: string;
  submit: string;
  submitting: string;
  recoveryCode: string;
};

const initialState: AuthActionState = { error: null, success: false };

export function LoginFormClient({ locale, labels }: { locale: string; labels: LoginLabels }) {
  const [state, formAction, isPending] = useActionState(signInWithPassword, initialState);

  return (
    <>
      <h1 className="mb-1.5 text-[22px] font-bold tracking-[-0.015em] text-slate-950">{labels.title}</h1>
      <p className="mb-6 text-[13px] text-slate-500">{labels.subtitle}</p>

      {state.error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-1 rounded-md border border-red-100 border-l-[3px] border-l-red-600 bg-red-50/70 px-3 py-2.5 text-xs text-red-700"
        >
          {state.error}
        </div>
      ) : null}

      <form action={formAction} className="flex flex-col gap-3.5">
        <input type="hidden" name="locale" value={locale} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-xs font-medium text-slate-600">
            {labels.emailLabel}
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            autoFocus
            required
            autoComplete="username"
            className="h-10 w-full rounded-md border border-[#d8e0ea] bg-white px-3 text-sm outline-none transition focus:border-[#1976d2] focus:ring-3 focus:ring-[#1976d2]/10"
            placeholder={labels.emailPlaceholder}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-xs font-medium text-slate-600">
            {labels.passwordLabel}
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="h-10 w-full rounded-md border border-[#d8e0ea] bg-white px-3 text-sm outline-none transition focus:border-[#1976d2] focus:ring-3 focus:ring-[#1976d2]/10"
            placeholder={labels.passwordPlaceholder}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <label htmlFor="remember" className="flex cursor-pointer items-center gap-1.5 text-slate-600">
            <input id="remember" name="remember" type="checkbox" defaultChecked className="h-3.5 w-3.5 rounded border-[#d8e0ea]" />
            {labels.remember}
          </label>
          <Link href={`/${locale}/login/forgot-password`} className="font-medium text-[#1976d2] hover:underline">
            {labels.forgotPassword}
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
              {labels.submitting}
            </span>
          ) : (
            labels.submit
          )}
        </Button>
      </form>

      <div className="my-[18px] flex items-center gap-3 text-[11px] uppercase tracking-[0.06em] text-slate-500">
        <span className="h-px flex-1 bg-[#d8e0ea]" />
        <span>{labels.divider}</span>
        <span className="h-px flex-1 bg-[#d8e0ea]" />
      </div>

      <Button
        type="button"
        disabled
        aria-disabled="true"
        className="h-10 w-full rounded-md border border-[#d8e0ea] bg-white px-4 text-[13px] font-medium text-slate-400 disabled:cursor-not-allowed"
      >
        {labels.ssoComingSoon}
      </Button>

      <div className="mt-[22px] text-center text-[13px] text-slate-600">
        {labels.noAccount}{' '}
        <a href="mailto:admin@monopilot.app" className="font-medium text-[#1976d2] hover:underline">
          {labels.contactAdmin}
        </a>
      </div>
    </>
  );
}

export function ForgotPasswordFormClient({ locale, labels }: { locale: string; labels: ForgotPasswordLabels }) {
  const [state, formAction, isPending] = useActionState(sendPasswordReset, initialState);

  if (state.success) {
    return (
      <div className="text-center">
        <div className="sent-art mx-auto mb-3.5 grid h-16 w-16 place-items-center rounded-full bg-blue-100 text-[28px] text-[#1976d2]">
          ✉
        </div>
        <h1 className="mb-1.5 text-[22px] font-bold tracking-[-0.015em] text-slate-950">{labels.successTitle}</h1>
        <p className="text-[13px] text-slate-500">{labels.successBody}</p>
        <Link
          href={`/${locale}/login`}
          className="mt-[18px] block h-10 rounded-md border border-[#d8e0ea] bg-white px-4 py-2.5 text-[13px] font-medium text-slate-950 hover:bg-slate-50"
        >
          {labels.successBack}
        </Link>
        <div className="mt-[22px] text-center text-[13px] text-slate-600">
          {labels.successRetryPrefix}{' '}
          <Link href={`/${locale}/login/forgot-password`} className="font-medium text-[#1976d2] hover:underline">
            {labels.successRetry}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Link href={`/${locale}/login`} className="mb-3.5 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-[#1976d2]">
        {labels.backToSignIn}
      </Link>
      <h1 className="mb-1.5 text-[22px] font-bold tracking-[-0.015em] text-slate-950">{labels.title}</h1>
      <p className="mb-6 text-[13px] text-slate-500">{labels.subtitle}</p>

      <form id="reset-form" action={formAction} className="flex flex-col gap-3.5">
        <input type="hidden" name="locale" value={locale} />

        <div className="rounded-md border border-blue-100 border-l-[3px] border-l-[#1976d2] bg-blue-50/70 px-3 py-2.5 text-xs text-blue-700">
          {labels.info}
        </div>

        {state.error ? (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-md border border-red-100 border-l-[3px] border-l-red-600 bg-red-50/70 px-3 py-2.5 text-xs text-red-700"
          >
            {state.error}
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="reset-email" className="text-xs font-medium text-slate-600">
            {labels.emailLabel}
          </label>
          <Input
            id="reset-email"
            name="email"
            type="email"
            autoComplete="username"
            required
            className="h-10 w-full rounded-md border border-[#d8e0ea] bg-white px-3 text-sm outline-none transition focus:border-[#1976d2] focus:ring-3 focus:ring-[#1976d2]/10"
            placeholder={labels.emailPlaceholder}
          />
        </div>

        <Button
          type="submit"
          disabled={isPending}
          className="flex h-[42px] w-full items-center justify-center rounded-md bg-[#1976d2] px-4 text-sm font-semibold text-white transition hover:bg-[#1565c0] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isPending ? labels.submitting : labels.submit}
        </Button>
      </form>
    </>
  );
}

export function MfaFormClient({ locale, labels }: { locale: string; labels: MfaLabels }) {
  const searchParams = useSearchParams();
  const factorId = searchParams.get('factorId') ?? '';
  const [state, formAction, isPending] = useActionState(verifyMfaCode, initialState);

  return (
    <>
      <h1 className="mb-1.5 text-[22px] font-bold tracking-[-0.015em] text-slate-950">{labels.title}</h1>
      <p className="mb-6 text-[13px] text-slate-500">{labels.subtitle}</p>

      {state.error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-1 rounded-md border border-red-100 border-l-[3px] border-l-red-600 bg-red-50/70 px-3 py-2.5 text-xs text-red-700"
        >
          {state.error}
        </div>
      ) : null}

      <form action={formAction} className="flex flex-col gap-3.5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="factorId" value={factorId} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="mfa-code" className="text-xs font-medium text-slate-600">
            {labels.codeLabel}
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
          {isPending ? labels.submitting : labels.submit}
        </Button>
      </form>

      <button type="button" className="mt-6 w-full text-center text-sm font-medium text-[#1976d2] hover:underline">
        {labels.recoveryCode}
      </button>
    </>
  );
}
