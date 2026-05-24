/**
 * @vitest-environment jsdom
 * R-F10-002 — flags admin labels must resolve through the locale-aware i18n path.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import SettingsFlagsPage from './page';

type Locale = 'en' | 'pl' | 'ro' | 'uk';

type FlagsLabels = {
  title: string;
  subtitle: string;
  openPostHog: string;
  preflightNotice: string;
  coreTab: string;
  localTab: string;
  tenantTab: string;
  searchPlaceholder: string;
  coreFlags: string;
  localFlags: string;
  tenantFlags: string;
  flagCode: string;
  description: string;
  status: string;
  rollout: string;
  updated: string;
  consumers: string;
  actions: string;
  on: string;
  off: string;
  edit: string;
  loading: string;
  empty: string;
  error: string;
  vSet43Title: string;
  vSet43Body: string;
  configureAuthorization: string;
  noConsumers: string;
  defaultNpdDescription: string;
  defaultTechnicalDescription: string;
};

const localizedLabels: Record<Locale, FlagsLabels> = {
  en: {
    title: 'Feature flags',
    subtitle: 'Per-tenant toggles. L1 changes go through promotion; L2/L3 are editable here.',
    openPostHog: 'Open PostHog ↗',
    preflightNotice: 'Some flags trigger pre-flight checks.',
    coreTab: 'L1 core ({count})',
    localTab: 'L2 local ({count})',
    tenantTab: 'L3 tenant ({count})',
    searchPlaceholder: 'Search flag code or description…',
    coreFlags: 'Core flags',
    localFlags: 'Local (L2) flags',
    tenantFlags: 'Tenant-private (L3) flags',
    flagCode: 'Flag code',
    description: 'Description',
    status: 'Status',
    rollout: 'Rollout %',
    updated: 'Updated',
    consumers: 'Consumers',
    actions: 'Actions',
    on: '● ON',
    off: '○ OFF',
    edit: 'Edit →',
    loading: 'Loading feature flags…',
    empty: 'No feature flags found.',
    error: 'Unable to load feature flags.',
    vSet43Title: 'V-SET-43 authorization preflight failed',
    vSet43Body: 'NPD post-release edits require an authorization policy.',
    configureAuthorization: 'Configure authorization policy',
    noConsumers: '—',
    defaultNpdDescription: 'Allow released NPD product/BOM edits after authorization.',
    defaultTechnicalDescription: 'Require Technical product-spec approval before factory use.',
  },
  pl: {
    title: 'Flagi funkcji',
    subtitle: 'Przełączniki per tenant. Zmiany L1 przechodzą przez promocję; L2/L3 można edytować tutaj.',
    openPostHog: 'Otwórz PostHog ↗',
    preflightNotice: 'Niektóre flagi uruchamiają kontrole wstępne.',
    coreTab: 'L1 core ({count})',
    localTab: 'L2 lokalne ({count})',
    tenantTab: 'L3 tenant ({count})',
    searchPlaceholder: 'Szukaj kodu flagi lub opisu…',
    coreFlags: 'Flagi podstawowe',
    localFlags: 'Flagi lokalne (L2)',
    tenantFlags: 'Flagi prywatne tenanta (L3)',
    flagCode: 'Kod flagi',
    description: 'Opis',
    status: 'Status',
    rollout: 'Rollout %',
    updated: 'Zaktualizowano',
    consumers: 'Konsumenci',
    actions: 'Akcje',
    on: '● WŁ.',
    off: '○ WYŁ.',
    edit: 'Edytuj →',
    loading: 'Ładowanie flag funkcji…',
    empty: 'Nie znaleziono flag funkcji.',
    error: 'Nie udało się wczytać flag funkcji.',
    vSet43Title: 'Kontrola autoryzacji V-SET-43 nie powiodła się',
    vSet43Body: 'Edycje NPD po wydaniu wymagają polityki autoryzacji.',
    configureAuthorization: 'Skonfiguruj politykę autoryzacji',
    noConsumers: '—',
    defaultNpdDescription: 'Zezwalaj na edycje wydanych produktów/BOM NPD po autoryzacji.',
    defaultTechnicalDescription: 'Wymagaj zatwierdzenia specyfikacji produktu przez Technical przed użyciem w fabryce.',
  },
  ro: {
    title: 'Indicatori de funcții',
    subtitle: 'Comutatoare per chiriaș. Modificările L1 trec prin promovare; L2/L3 se editează aici.',
    openPostHog: 'Deschide PostHog ↗',
    preflightNotice: 'Unele indicatoare declanșează verificări preliminare.',
    coreTab: 'L1 nucleu ({count})',
    localTab: 'L2 local ({count})',
    tenantTab: 'L3 chiriaș ({count})',
    searchPlaceholder: 'Caută codul indicatorului sau descrierea…',
    coreFlags: 'Indicatori de bază',
    localFlags: 'Indicatori locali (L2)',
    tenantFlags: 'Indicatori privați ai chiriașului (L3)',
    flagCode: 'Cod indicator',
    description: 'Descriere',
    status: 'Stare',
    rollout: 'Lansare %',
    updated: 'Actualizat',
    consumers: 'Consumatori',
    actions: 'Acțiuni',
    on: '● ACTIV',
    off: '○ INACTIV',
    edit: 'Editează →',
    loading: 'Se încarcă indicatorii de funcții…',
    empty: 'Nu s-au găsit indicatori de funcții.',
    error: 'Indicatorii de funcții nu au putut fi încărcați.',
    vSet43Title: 'Verificarea de autorizare V-SET-43 a eșuat',
    vSet43Body: 'Editările NPD după lansare necesită o politică de autorizare.',
    configureAuthorization: 'Configurează politica de autorizare',
    noConsumers: '—',
    defaultNpdDescription: 'Permite editări ale produselor/BOM NPD lansate după autorizare.',
    defaultTechnicalDescription: 'Solicită aprobarea specificației produsului de către Technical înainte de utilizarea în fabrică.',
  },
  uk: {
    title: 'Прапорці функцій',
    subtitle: 'Перемикачі для орендаря. Зміни L1 проходять промоцію; L2/L3 редагуються тут.',
    openPostHog: 'Відкрити PostHog ↗',
    preflightNotice: 'Деякі прапорці запускають попередні перевірки.',
    coreTab: 'L1 ядро ({count})',
    localTab: 'L2 локальні ({count})',
    tenantTab: 'L3 орендар ({count})',
    searchPlaceholder: 'Шукати код прапорця або опис…',
    coreFlags: 'Основні прапорці',
    localFlags: 'Локальні прапорці (L2)',
    tenantFlags: 'Приватні прапорці орендаря (L3)',
    flagCode: 'Код прапорця',
    description: 'Опис',
    status: 'Статус',
    rollout: 'Розгортання %',
    updated: 'Оновлено',
    consumers: 'Споживачі',
    actions: 'Дії',
    on: '● УВІМК.',
    off: '○ ВИМК.',
    edit: 'Редагувати →',
    loading: 'Завантаження прапорців функцій…',
    empty: 'Прапорці функцій не знайдено.',
    error: 'Не вдалося завантажити прапорці функцій.',
    vSet43Title: 'Попередня перевірка авторизації V-SET-43 не пройдена',
    vSet43Body: 'Редагування NPD після випуску вимагає політики авторизації.',
    configureAuthorization: 'Налаштувати політику авторизації',
    noConsumers: '—',
    defaultNpdDescription: 'Дозволити редагування випущених продуктів/BOM NPD після авторизації.',
    defaultTechnicalDescription: 'Вимагати затвердження специфікації продукту Technical перед використанням на фабриці.',
  },
};

let activeLocale: Locale = 'en';

const getTranslations = vi.fn(async (request?: string | { locale?: string; namespace?: string }) => {
  const requestedLocale = typeof request === 'object' && request.locale ? request.locale : activeLocale;
  const catalog = localizedLabels[(requestedLocale as Locale) in localizedLabels ? (requestedLocale as Locale) : activeLocale];
  return (key: keyof FlagsLabels, values?: Record<string, string | number>) => {
    const value = catalog[key];
    if (typeof value !== 'string') return `flags_admin.${String(key)}`;
    return value.replace('{count}', String(values?.count ?? '{count}'));
  };
});

vi.mock('next-intl/server', () => ({ getTranslations }));

async function renderFlagsPage(locale: Locale) {
  activeLocale = locale;
  const node = await SettingsFlagsPage({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve({}),
  });
  return render(React.createElement(React.Fragment, null, node));
}

afterEach(() => {
  cleanup();
  getTranslations.mockClear();
});

describe('R-F10-002 flags admin next-intl locale labels', () => {
  it.each(['en', 'pl', 'ro', 'uk'] as Locale[])('renders flags_admin labels for %s without raw key leakage or English fallback', async (locale) => {
    await renderFlagsPage(locale);
    const labels = localizedLabels[locale];
    const heading = screen.getByRole('heading', { level: 1 });

    expect(heading).toHaveTextContent(labels.title);
    expect(screen.getByPlaceholderText(labels.searchPlaceholder)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: labels.flagCode })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: labels.openPostHog })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/flags_admin|searchPlaceholder|flagCode|openPostHog/);

    if (locale === 'ro' || locale === 'uk') {
      expect(heading).not.toHaveTextContent(localizedLabels.en.title);
      expect(screen.queryByPlaceholderText(localizedLabels.en.searchPlaceholder)).not.toBeInTheDocument();
    }
  });

  it('does not keep a two-locale en/pl page loader or a legacy production flags route', () => {
    const pagePath = path.resolve(process.cwd(), 'app/[locale]/(app)/(admin)/settings/flags/page.tsx');
    const legacyPagePath = path.resolve(process.cwd(), 'app/[locale]/(admin)/settings/flags/page.tsx');
    const source = readFileSync(pagePath, 'utf8');

    expect(source).not.toMatch(/locale\s*={2,3}\s*['"]pl['"]\s*\?/);
    expect(source).not.toMatch(/messages\/(?:pl|en)\/02-settings\.json[\s\S]*messages\/(?:en|pl)\/02-settings\.json/);
    expect(existsSync(legacyPagePath), 'settings flags production page must stay under [locale]/(app)/(admin), not legacy [locale]/(admin)').toBe(false);
  });
});
