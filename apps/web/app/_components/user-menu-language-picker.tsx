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

export const SET100_LANGUAGE_PICKER_PARITY_CONTRACT = {
  task: 'T-129 SET-100 User Menu Language Picker',
  prototype_path: 'prototypes/design/Monopilot Design System/settings/account-screens.jsx',
  prototype_anchor: 'prototypes/design/Monopilot Design System/settings/account-screens.jsx:20-24',
  ux_anchor: 'prototypes/design/02-SETTINGS-UX.md:1519-1525',
  prototype_route: 'static-jsx://settings/account-screens.jsx#MyProfileScreen-Language-SRow',
  target_route: 'component://apps/web/app/_components/user-menu-language-picker.tsx#UserMenuLanguagePicker',
  viewports: [
    { name: 'desktop-1280', width: 1280, height: 720 },
    { name: 'mobile-375', width: 375, height: 667 },
  ],
  region_selectors: {
    language_menu: '[role="menu"][aria-label="Language"]',
    active_language: '[role="menuitemradio"][aria-checked="true"]',
    selectable_phase_1: '[role="menuitemradio"][aria-disabled="false"]',
    disabled_phase_2: '[role="menuitemradio"][aria-disabled="true"]',
    feedback: '[role="status"], [role="alert"]',
  },
  parity_matrix: [
    {
      region: 'language_menu',
      prototype: 'Language row/control in user profile/menu surface',
      implementation: 'ARIA menu labelled Language',
      structural: 'pass_with_allowed_deviation',
      visual: 'pass',
      interaction: 'pass',
    },
    {
      region: 'language_options',
      prototype: 'English/Polski options in compact language control',
      implementation: 'PL/EN selectable plus UK/RO Phase 2 unavailable items',
      structural: 'pass',
      visual: 'pass',
      interaction: 'pass',
    },
    {
      region: 'active_feedback',
      prototype: 'selected value shown in compact control',
      implementation: 'active menuitemradio checkmark and success/error live regions',
      structural: 'pass_with_allowed_deviation',
      visual: 'pass',
      interaction: 'pass',
    },
  ],
  allowed_deviations: [
    {
      region: 'language_control',
      prototype: 'native <select> inside My profile Language row',
      implementation: 'role=menu with role=menuitemradio buttons in the user avatar menu',
      reason:
        'SET-100 is a global-header user-menu picker: it must expose active checkmark state, unavailable Phase 2 choices, typed success/error feedback, and next-intl hot switching without a full reload. The profile prototype select is the compact language-control anchor, not a requirement to use a native select for the user menu.',
    },
  ],
} as const;

export type SelectUserLanguageInput = {
  userId: string;
  orgId: string;
  locale: UserLanguage;
};

export type UserMenuLanguagePickerProps = {
  userId: string;
  orgId: string;
  userLanguage: UserLanguage | null;
  effectiveLanguage: PhaseOneLanguage;
  organizationLanguage: PhaseOneLanguage;
  supportedLocales?: PhaseOneLanguage[];
  phase2Locales?: PhaseTwoLanguage[];
  onSelectLanguage: (input: SelectUserLanguageInput) => Promise<LanguageChangeResult>;
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
  userId,
  orgId,
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
      const result = await onSelectLanguage({ userId, orgId, locale });

      if (result.ok === true) {
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
