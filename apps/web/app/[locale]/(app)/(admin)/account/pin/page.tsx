/**
 * W9-L7 — /account/pin: desktop management for the SHARED e-sign + scanner
 * login PIN (one `public.user_pins` record; owner decision 2026-06-11 keeps
 * them unified until a CFR-21 separation decision). Closes chain dead-end #17:
 * desktop e-sign flows (WO Close, factory-spec release) demand this PIN but
 * only the scanner shell could enroll it.
 *
 * Server component: resolves real PIN status via withOrgContext + builds all
 * EN/PL labels via next-intl, then renders the dumb client island.
 */

import React from 'react';
import { getTranslations } from 'next-intl/server';

import PinScreen, { type PinScreenLabels } from './pin-screen.client';
import { readPinStatus, setEsignPinAction, type PinStatus, type SetPinInput, type SetPinResult } from './pin-data';

export const dynamic = 'force-dynamic';

const ERROR_CODES = [
  'invalid_input',
  'invalid_pin_format',
  'pin_mismatch',
  'invalid_credentials',
  'pin_locked',
  'persistence_failed',
] as const;

type AccountPinPageProps = {
  params?: Promise<{ locale: string }> | { locale: string };
  // Test seam only (same pattern as account/profile + account/notifications):
  // inject status/action for RTL parity tests; production reads real data.
  status?: PinStatus;
  setEsignPin?: (input: SetPinInput) => Promise<SetPinResult>;
};

export default async function AccountPinPage(props: AccountPinPageProps = {}) {
  const t = await getTranslations('account.pin');
  const status = props.status ?? (await readPinStatus());

  const errors = ERROR_CODES.reduce<Record<string, string>>((acc, code) => {
    acc[code] = t(`errors.${code}`);
    return acc;
  }, {});

  const labels: PinScreenLabels = {
    title: t('title'),
    subtitle: t('subtitle'),
    sharedNotice: t('sharedNotice'),
    statusTitle: t('statusTitle'),
    statusSet: t('statusSet'),
    statusNotSet: t('statusNotSet'),
    statusError: t('statusError'),
    lockedUntilText: status.lockedUntil
      ? t('lockedUntil', { time: status.lockedUntil.slice(0, 16).replace('T', ' ') })
      : null,
    failedAttemptsText:
      status.failedAttempts > 0 ? t('failedAttempts', { count: status.failedAttempts }) : null,
    formTitleSet: t('formTitleSet'),
    formTitleNotSet: t('formTitleNotSet'),
    authMethod: t('authMethod'),
    authPassword: t('authPassword'),
    authPin: t('authPin'),
    currentPassword: t('currentPassword'),
    currentPin: t('currentPin'),
    newPin: t('newPin'),
    confirmPin: t('confirmPin'),
    submit: t('submit'),
    submitting: t('submitting'),
    success: t('success'),
    errors,
    errorFallback: t('errors.persistence_failed'),
  };

  return <PinScreen labels={labels} status={status} setEsignPin={props.setEsignPin ?? setEsignPinAction} />;
}
