import { describe, expect, it, vi } from 'vitest';

type UserLanguage = 'pl' | 'en' | 'uk' | 'ro';
type PhaseOneLanguage = 'pl' | 'en';

type EffectiveLanguageResult = {
  locale: PhaseOneLanguage;
  source: 'user' | 'organization' | 'fallback';
  userOverrideAllowed: boolean;
};

type UpdateUserLanguageInput = {
  userId: string;
  orgId: string;
  currentLanguage: PhaseOneLanguage | null;
  locale: UserLanguage;
  persistUserLanguage: (input: { userId: string; orgId: string; language: PhaseOneLanguage }) => Promise<void>;
  updateOrganizationLocale?: (input: { orgId: string; locale: PhaseOneLanguage }) => Promise<void>;
  setNextIntlLocale: (locale: PhaseOneLanguage) => Promise<void> | void;
};

type UpdateUserLanguageResult =
  | {
      ok: true;
      language: PhaseOneLanguage;
      usersLanguageUpdated: true;
      organizationLocaleUpdated: false;
      hotSwitch: { provider: 'next-intl'; fullReloadRequired: false };
    }
  | {
      ok: false;
      error: 'unsupported_locale';
      blocker: { code: 'UNSUPPORTED_LOCALE'; attemptedLocale: UserLanguage; supportedLocales: PhaseOneLanguage[] };
      unchangedLanguage: PhaseOneLanguage | null;
    };

type UserLanguageModule = {
  SUPPORTED_USER_LOCALES: readonly PhaseOneLanguage[];
  LANGUAGE_OPTIONS: ReadonlyArray<{
    code: UserLanguage;
    label: string;
    selectable: boolean;
    phase: 1 | 2;
  }>;
  resolveEffectiveUserLanguage(input: {
    usersLanguage: UserLanguage | null;
    organizationLocale: UserLanguage | null;
  }): EffectiveLanguageResult;
  updateCurrentUserLanguage(input: UpdateUserLanguageInput): Promise<UpdateUserLanguageResult>;
};

async function loadUserLanguageModule(): Promise<UserLanguageModule> {
  try {
    const modulePath = '../user-language';
    const mod = await import(/* @vite-ignore */ modulePath);
    return mod as UserLanguageModule;
  } catch {
    return {
      SUPPORTED_USER_LOCALES: [],
      LANGUAGE_OPTIONS: [],
      resolveEffectiveUserLanguage() {
        return { locale: 'en', source: 'fallback', userOverrideAllowed: false };
      },
      async updateCurrentUserLanguage(input: UpdateUserLanguageInput) {
        return {
          ok: false,
          error: 'unsupported_locale',
          blocker: { code: 'UNSUPPORTED_LOCALE', attemptedLocale: input.locale, supportedLocales: [] },
          unchangedLanguage: input.currentLanguage,
        };
      },
    };
  }
}

describe('SET-100 user language locale contract', () => {
  it('exposes Phase 1 PL/EN as selectable user locales and Phase 2 UK/RO as unavailable options', async () => {
    const mod = await loadUserLanguageModule();

    expect(mod.SUPPORTED_USER_LOCALES).toEqual(['pl', 'en']);
    expect(mod.LANGUAGE_OPTIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'pl', selectable: true, phase: 1 }),
        expect.objectContaining({ code: 'en', selectable: true, phase: 1 }),
        expect.objectContaining({ code: 'uk', selectable: false, phase: 2 }),
        expect.objectContaining({ code: 'ro', selectable: false, phase: 2 }),
      ]),
    );
  });

  it('resolves null users.language to organization locale, then EN fallback, while keeping user override allowed', async () => {
    const mod = await loadUserLanguageModule();

    expect(mod.resolveEffectiveUserLanguage({ usersLanguage: null, organizationLocale: 'pl' })).toEqual({
      locale: 'pl',
      source: 'organization',
      userOverrideAllowed: true,
    });
    expect(mod.resolveEffectiveUserLanguage({ usersLanguage: null, organizationLocale: null })).toEqual({
      locale: 'en',
      source: 'fallback',
      userOverrideAllowed: true,
    });
  });

  it('persists supported user-language overrides to users.language for the current org/user and does not change organization locale', async () => {
    const mod = await loadUserLanguageModule();
    const persistUserLanguage = vi.fn().mockResolvedValue(undefined);
    const updateOrganizationLocale = vi.fn().mockResolvedValue(undefined);
    const setNextIntlLocale = vi.fn();

    const result = await mod.updateCurrentUserLanguage({
      userId: 'user-current',
      orgId: 'org-apex',
      currentLanguage: null,
      locale: 'pl',
      persistUserLanguage,
      updateOrganizationLocale,
      setNextIntlLocale,
    });

    expect(result).toEqual({
      ok: true,
      language: 'pl',
      usersLanguageUpdated: true,
      organizationLocaleUpdated: false,
      hotSwitch: { provider: 'next-intl', fullReloadRequired: false },
    });
    expect(persistUserLanguage).toHaveBeenCalledWith({ userId: 'user-current', orgId: 'org-apex', language: 'pl' });
    expect(updateOrganizationLocale).not.toHaveBeenCalled();
    expect(setNextIntlLocale).toHaveBeenCalledWith('pl');
  });

  it('returns a typed blocker for unsupported forced locales without changing existing language or hot-switching', async () => {
    const mod = await loadUserLanguageModule();
    const persistUserLanguage = vi.fn().mockResolvedValue(undefined);
    const updateOrganizationLocale = vi.fn().mockResolvedValue(undefined);
    const setNextIntlLocale = vi.fn();

    const result = await mod.updateCurrentUserLanguage({
      userId: 'user-current',
      orgId: 'org-apex',
      currentLanguage: 'en',
      locale: 'uk',
      persistUserLanguage,
      updateOrganizationLocale,
      setNextIntlLocale,
    });

    expect(result).toEqual({
      ok: false,
      error: 'unsupported_locale',
      blocker: { code: 'UNSUPPORTED_LOCALE', attemptedLocale: 'uk', supportedLocales: ['pl', 'en'] },
      unchangedLanguage: 'en',
    });
    expect(persistUserLanguage).not.toHaveBeenCalled();
    expect(updateOrganizationLocale).not.toHaveBeenCalled();
    expect(setNextIntlLocale).not.toHaveBeenCalled();
  });
});
