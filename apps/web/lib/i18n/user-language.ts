export type PhaseOneLanguage = 'pl' | 'en';
export type PhaseTwoLanguage = 'uk' | 'ro';
export type UserLanguage = PhaseOneLanguage | PhaseTwoLanguage;

export type EffectiveLanguageSource = 'user' | 'organization' | 'fallback';

export type EffectiveLanguageResult = {
  locale: PhaseOneLanguage;
  source: EffectiveLanguageSource;
  userOverrideAllowed: true;
};

export type LanguageOption = {
  code: UserLanguage;
  label: string;
  selectable: boolean;
  phase: 1 | 2;
};

export type UpdateUserLanguageInput = {
  userId: string;
  orgId: string;
  currentLanguage: PhaseOneLanguage | null;
  locale: UserLanguage;
  persistUserLanguage: (input: { userId: string; orgId: string; language: PhaseOneLanguage }) => Promise<void>;
  updateOrganizationLocale?: (input: { orgId: string; locale: PhaseOneLanguage }) => Promise<void>;
  setNextIntlLocale: (locale: PhaseOneLanguage) => Promise<void> | void;
};

export type UnsupportedLocaleResult = {
  ok: false;
  error: 'unsupported_locale';
  blocker: {
    code: 'UNSUPPORTED_LOCALE';
    attemptedLocale: UserLanguage;
    supportedLocales: PhaseOneLanguage[];
  };
  unchangedLanguage: PhaseOneLanguage | null;
};

export type PersistenceFailedResult = {
  ok: false;
  error: 'persistence_failed';
  blocker: {
    code: 'PERSISTENCE_FAILED';
    attemptedLocale: PhaseOneLanguage;
    message: string;
  };
  unchangedLanguage: PhaseOneLanguage | null;
};

export type HotSwitchFailedResult = {
  ok: false;
  error: 'hot_switch_failed';
  blocker: {
    code: 'HOT_SWITCH_FAILED';
    attemptedLocale: PhaseOneLanguage;
    message: string;
  };
  usersLanguageUpdated: true;
  unchangedLanguage: PhaseOneLanguage;
};

export type UpdateUserLanguageResult =
  | {
      ok: true;
      language: PhaseOneLanguage;
      usersLanguageUpdated: true;
      organizationLocaleUpdated: false;
      hotSwitch: { provider: 'next-intl'; fullReloadRequired: false };
    }
  | UnsupportedLocaleResult
  | PersistenceFailedResult
  | HotSwitchFailedResult;

export const SUPPORTED_USER_LOCALES = ['pl', 'en'] as const satisfies readonly PhaseOneLanguage[];

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { code: 'pl', label: 'Polski', selectable: true, phase: 1 },
  { code: 'en', label: 'English', selectable: true, phase: 1 },
  { code: 'uk', label: 'Українська', selectable: false, phase: 2 },
  { code: 'ro', label: 'Română', selectable: false, phase: 2 },
] as const;

export function isSupportedUserLocale(locale: UserLanguage | string | null | undefined): locale is PhaseOneLanguage {
  return locale === 'pl' || locale === 'en';
}

export function resolveEffectiveUserLanguage(input: {
  usersLanguage: UserLanguage | null;
  organizationLocale: UserLanguage | null;
}): EffectiveLanguageResult {
  if (isSupportedUserLocale(input.usersLanguage)) {
    return { locale: input.usersLanguage, source: 'user', userOverrideAllowed: true };
  }

  if (isSupportedUserLocale(input.organizationLocale)) {
    return { locale: input.organizationLocale, source: 'organization', userOverrideAllowed: true };
  }

  return { locale: 'en', source: 'fallback', userOverrideAllowed: true };
}

function persistenceErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'PermissionDenied') {
    return 'Permission denied while updating users.language.';
  }

  return 'Unable to update users.language.';
}

function hotSwitchErrorMessage() {
  return 'users.language was updated, but next-intl could not switch locale without a full reload.';
}

export async function updateCurrentUserLanguage(input: UpdateUserLanguageInput): Promise<UpdateUserLanguageResult> {
  if (!isSupportedUserLocale(input.locale)) {
    return {
      ok: false,
      error: 'unsupported_locale',
      blocker: {
        code: 'UNSUPPORTED_LOCALE',
        attemptedLocale: input.locale,
        supportedLocales: [...SUPPORTED_USER_LOCALES],
      },
      unchangedLanguage: input.currentLanguage,
    };
  }

  try {
    await input.persistUserLanguage({ userId: input.userId, orgId: input.orgId, language: input.locale });
  } catch (error) {
    return {
      ok: false,
      error: 'persistence_failed',
      blocker: {
        code: 'PERSISTENCE_FAILED',
        attemptedLocale: input.locale,
        message: persistenceErrorMessage(error),
      },
      unchangedLanguage: input.currentLanguage,
    };
  }

  try {
    await input.setNextIntlLocale(input.locale);
  } catch {
    return {
      ok: false,
      error: 'hot_switch_failed',
      blocker: {
        code: 'HOT_SWITCH_FAILED',
        attemptedLocale: input.locale,
        message: hotSwitchErrorMessage(),
      },
      usersLanguageUpdated: true,
      unchangedLanguage: input.locale,
    };
  }

  return {
    ok: true,
    language: input.locale,
    usersLanguageUpdated: true,
    organizationLocaleUpdated: false,
    hotSwitch: { provider: 'next-intl', fullReloadRequired: false },
  };
}
