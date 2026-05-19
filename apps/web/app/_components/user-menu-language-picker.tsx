'use client';

import React from 'react';

import {
  LANGUAGE_OPTIONS,
  type PhaseOneLanguage,
  type PhaseTwoLanguage,
  type UpdateUserLanguageResult,
  type UserLanguage,
} from '../../lib/i18n/user-language';

type PickerOnlyLanguageChangeResult =
  | { ok: true; language: PhaseOneLanguage; hotSwitched: true; usersLanguageUpdated: true }
  | { ok: false; error: 'unsupported_locale' | 'permission_denied' | 'persistence_failed'; message: string };

type LanguageChangeResult = PickerOnlyLanguageChangeResult | UpdateUserLanguageResult;

export type UserMenuLanguagePickerProps = {
  userId: string;
  orgId: string;
  userLanguage: UserLanguage | null;
  effectiveLanguage: PhaseOneLanguage;
  organizationLanguage: PhaseOneLanguage;
  supportedLocales?: PhaseOneLanguage[];
  phase2Locales?: PhaseTwoLanguage[];
  onSelectLanguage: (locale: UserLanguage) => Promise<LanguageChangeResult>;
  switchNextIntlLocale: (locale: PhaseOneLanguage) => void;
};

function optionDetail(
  locale: UserLanguage,
  activeLocale: PhaseOneLanguage,
  userLanguage: UserLanguage | null,
  organizationLanguage: PhaseOneLanguage,
) {
  if (locale === activeLocale) {
    return userLanguage === null ? `Active fallback from ${organizationLanguage.toUpperCase()}` : 'Active';
  }

  return 'Select';
}

function errorMessageFor(result: Extract<LanguageChangeResult, { ok: false }>) {
  if (!('blocker' in result)) {
    return `${result.error}: ${result.message}`;
  }

  if (result.error === 'unsupported_locale') {
    return `${result.error}: ${result.blocker.code}`;
  }

  return `${result.error}: ${result.blocker.message}`;
}

export default function UserMenuLanguagePicker({
  userLanguage,
  effectiveLanguage,
  organizationLanguage,
  supportedLocales = ['pl', 'en'],
  phase2Locales = ['uk', 'ro'],
  onSelectLanguage,
  switchNextIntlLocale,
}: UserMenuLanguagePickerProps) {
  const [activeLocale, setActiveLocale] = React.useState<PhaseOneLanguage>(effectiveLanguage);
  const [pendingLocale, setPendingLocale] = React.useState<UserLanguage | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setActiveLocale(effectiveLanguage);
  }, [effectiveLanguage]);

  async function selectLanguage(locale: UserLanguage, selectable: boolean) {
    if (!selectable || pendingLocale !== null) {
      return;
    }

    setPendingLocale(locale);
    setStatus(null);
    setError(null);

    try {
      const result = await onSelectLanguage(locale);

      if (result.ok) {
        setActiveLocale(result.language);
        switchNextIntlLocale(result.language);
        setStatus('Language updated with next-intl without full reload.');
      } else {
        setError(errorMessageFor(result));
      }
    } catch {
      setError('persistence_failed: Unable to update users.language.');
    } finally {
      setPendingLocale(null);
    }
  }

  return (
    <div role="menu" aria-label="Language">
      {LANGUAGE_OPTIONS.map((option) => {
        const phaseOneSelectable = supportedLocales.includes(option.code as PhaseOneLanguage);
        const phaseTwoUnavailable = phase2Locales.includes(option.code as PhaseTwoLanguage);
        const selectable = option.selectable && phaseOneSelectable && !phaseTwoUnavailable;
        const checked = option.code === activeLocale;
        const detail = option.selectable
          ? optionDetail(option.code, activeLocale, userLanguage, organizationLanguage)
          : 'Phase 2 unavailable';

        return (
          <button
            aria-checked={checked}
            aria-disabled={!selectable}
            data-locale={option.code}
            disabled={!selectable}
            key={option.code}
            onClick={() => void selectLanguage(option.code, selectable)}
            role="menuitemradio"
            type="button"
          >
            <span aria-hidden="true">{checked ? '✓' : ' '}</span>
            <span>{option.label}</span>
            <span>{pendingLocale === option.code ? ' Updating' : ` ${detail}`}</span>
          </button>
        );
      })}
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
