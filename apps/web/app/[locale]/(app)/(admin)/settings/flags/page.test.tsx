/**
 * @vitest-environment jsdom
 * R-F10-002 — flags admin labels must resolve through the locale-aware i18n path.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import SettingsFlagsPage from './page';
import FlagsAdminScreen, {
  type FeatureFlagRow,
  type FlagAuthorizationPreflight,
  type FlagsAdminLabels,
} from './flags-admin-screen.client';

type Locale = 'en' | 'pl' | 'ro' | 'uk';

const { setLocalFlagAction, setCoreFlagAction, withOrgContextMock, queryMock } = vi.hoisted(() => ({
  setLocalFlagAction: vi.fn(),
  setCoreFlagAction: vi.fn(),
  withOrgContextMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock('../../../../../../actions/tenant/set-local-flag', () => ({
  setLocalFlag: setLocalFlagAction,
}));

vi.mock('../../../../../../actions/flags/set-core', () => ({
  setCoreFlag: setCoreFlagAction,
}));

// Real-data wiring: the production page reads feature_flags_core +
// org_authorization_policies through withOrgContext (RLS app.current_org_id()).
// We mock the HOF so the jsdom suite can assert the wiring without a live pg pool.
vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

vi.mock('@monopilot/ui/Modal', async () => {
  type ModalShimProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    size?: string;
    modalId?: string;
    children: React.ReactNode;
  };

  function ModalShim({ open, size = 'md', modalId, children }: ModalShimProps) {
    if (!open) return null;
    return (
      <>
        <span data-radix-focus-guard="" />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="flag-edit-modal-title"
          data-focus-trap="radix-dialog"
          data-size={size}
          data-modal-id={modalId}
        >
          {children}
        </div>
        <span data-radix-focus-guard="" />
      </>
    );
  }

  ModalShim.Header = ({ title }: { title: string }) => <h2 id="flag-edit-modal-title">{title}</h2>;
  ModalShim.Body = ({ children }: { children: React.ReactNode }) => <div data-testid="modal-body">{children}</div>;
  ModalShim.Footer = ({ children }: { children: React.ReactNode }) => <div data-testid="modal-footer">{children}</div>;

  return { default: ModalShim };
});

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
  permissionDenied: string;
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
    permissionDenied: 'You need org admin access to view and change feature flags.',
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
    permissionDenied: 'Potrzebujesz uprawnień administratora organizacji, aby przeglądać i zmieniać flagi funkcji.',
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
    permissionDenied: 'Aveți nevoie de acces de administrator al organizației pentru a vizualiza și modifica indicatorii de funcții.',
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
    permissionDenied: 'Потрібен доступ адміністратора організації для перегляду та зміни прапорців функцій.',
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

// Seeded feature_flags_core rows (migration 067 per-org seed) the mocked HOF returns.
const seededCoreFlagRows = [
  {
    flag_code: 'npd.post_release_edit.enabled',
    description: 'Allow released NPD product/BOM edits after authorization.',
    is_enabled: false,
    rolled_out_pct: 0,
    tier: 'L1',
    updated_at: '2026-05-25T00:00:00.000Z',
  },
  {
    flag_code: 'technical.product_spec_approval.required',
    description: 'Require Technical product-spec approval before factory use.',
    is_enabled: true,
    rolled_out_pct: 100,
    tier: 'L1',
    updated_at: '2026-05-25T00:00:00.000Z',
  },
];

// org_authorization_policies row for npd_post_release_edit (V-SET-43 preflight source).
const seededPolicyRow = {
  is_enabled: true,
  requires_new_version: true,
  authorize_role_count: 1,
};

type DbResult = { rows: unknown[]; rowCount?: number };

function installLiveOrgContext(options?: {
  flagRows?: unknown[];
  policyRow?: Record<string, unknown> | null;
  forbidden?: boolean;
}) {
  const flagRows = options?.flagRows ?? seededCoreFlagRows;
  const policyRow = options?.policyRow === undefined ? seededPolicyRow : options.policyRow;

  queryMock.mockImplementation(async (sql: string): Promise<DbResult> => {
    if (/from public\.user_roles/i.test(sql)) {
      if (options?.forbidden) return { rows: [], rowCount: 0 };
      return { rows: [{ ok: true }], rowCount: 1 };
    }
    if (/from public\.feature_flags_core/i.test(sql)) {
      return { rows: flagRows, rowCount: flagRows.length };
    }
    if (/from public\.org_authorization_policies/i.test(sql)) {
      return { rows: policyRow ? [policyRow] : [], rowCount: policyRow ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  });

  withOrgContextMock.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) => {
    return action({
      userId: '00000000-0000-0000-0000-000000000001',
      orgId: '00000000-0000-0000-0000-0000000000aa',
      client: { query: queryMock },
    });
  });
}

async function renderFlagsPage(locale: Locale, overrides: Record<string, unknown> = {}) {
  activeLocale = locale;
  const node = await SettingsFlagsPage({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve({}),
    ...overrides,
  });
  return render(React.createElement(React.Fragment, null, node));
}

beforeEach(() => {
  installLiveOrgContext();
});

afterEach(() => {
  cleanup();
  getTranslations.mockClear();
  setLocalFlagAction.mockReset();
  setCoreFlagAction.mockReset();
  withOrgContextMock.mockReset();
  queryMock.mockReset();
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

const parityPreflight: FlagAuthorizationPreflight = {
  flagCode: 'npd.post_release_edit.enabled',
  canEnable: true,
  requiresNewVersion: true,
  hasAuthorizerRoles: true,
  configureHref: '/en/settings/authorization',
};

const coreFixture: FeatureFlagRow = {
  code: 'npd.post_release_edit.enabled',
  description: 'Allow released NPD product/BOM edits after authorization.',
  tier: 'L1',
  tenant: 'L1-core',
  enabled: false,
  rolloutPercent: 0,
  updatedAt: '2026-05-25',
  consumers: ['npd', 'technical'],
};

const localFixtureWithModalId = {
  id: 'flag-site-scanner-offline',
  code: 'site.scanner.offline',
  description: 'Allow site scanners to use the offline PWA queue.',
  desc: 'Allow site scanners to use the offline PWA queue.',
  tier: 'L2',
  tenant: 'L2-local',
  enabled: false,
  on: false,
  rolloutPercent: 25,
  rollout: 25,
  updatedAt: '2026-05-25',
  consumers: ['scanner'],
} satisfies FeatureFlagRow & { id: string };

describe('UI-SET-008 flags admin route modal/action wiring RED', () => {
  it('opens the shared SM-02 FlagEditModal from the route L2 edit affordance and persists through setLocalFlag', async () => {
    const user = userEvent.setup();
    const reason = 'Enable for supervised site scanner rollout';
    setLocalFlagAction.mockResolvedValue({ ok: true, data: { flagKey: localFixtureWithModalId.code, enabled: true } });

    await renderFlagsPage('en', {
      flags: [coreFixture, localFixtureWithModalId],
      authorizationPreflight: parityPreflight,
      posthogUrl: '#',
    });

    await user.click(screen.getByRole('button', { name: 'L2 local (1)' }));
    await user.click(screen.getByRole('button', { name: /edit/i }));

    const dialog = await screen.findByRole('dialog', { name: /edit flag.*site\.scanner\.offline/i });
    expect(dialog).toHaveAttribute('data-modal-id', 'SM-02');
    expect(within(dialog).getByRole('slider', { name: /rollout %/i })).toHaveValue('25');

    await user.click(within(dialog).getByRole('switch', { name: /status/i }));
    await user.type(within(dialog).getByRole('textbox', { name: /audit reason/i }), reason);
    await user.click(within(dialog).getByRole('button', { name: /^save change$/i }));

    await waitFor(() =>
      expect(setLocalFlagAction).toHaveBeenCalledWith({
        flagKey: localFixtureWithModalId.code,
        enabled: true,
        auditReason: reason,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /edit flag/i })).not.toBeInTheDocument());
  });

  it('does not fake toggle success when the real flag action rejects the mutation', async () => {
    const user = userEvent.setup();
    const onToggleFlag = vi.fn().mockResolvedValue({ ok: false, error: 'forbidden' });
    render(
      <FlagsAdminScreen
        labels={localizedLabels.en as FlagsAdminLabels}
        flags={[localFixtureWithModalId]}
        posthogUrl="#"
        authorizationPreflight={parityPreflight}
        onToggleFlag={onToggleFlag}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'L2 local (1)' }));
    const toggle = screen.getByRole('switch', { name: localFixtureWithModalId.code });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(toggle);

    await waitFor(() => expect(onToggleFlag).toHaveBeenCalledWith(localFixtureWithModalId.code, true));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    expect(screen.getByText(/forbidden/i)).toBeInTheDocument();
  });
});

describe('T-065 flags admin reads REAL feature_flags_core via withOrgContext (no hardcoded defaultFlags)', () => {
  it('the production page source contains no hardcoded defaultFlags array and reads feature_flags_core through withOrgContext', () => {
    const pagePath = path.resolve(process.cwd(), 'app/[locale]/(app)/(admin)/settings/flags/page.tsx');
    const source = readFileSync(pagePath, 'utf8');

    // Audit finding #1: the page must not ship a hardcoded defaultFlags fallback.
    expect(source).not.toMatch(/function\s+defaultFlags/);
    expect(source).not.toMatch(/const\s+DEFAULT_PREFLIGHT\b/);
    // Real-data wiring: withOrgContext + the two live tables.
    expect(source).toMatch(/withOrgContext/);
    expect(source).toMatch(/public\.feature_flags_core/);
    expect(source).toMatch(/public\.org_authorization_policies/);
  });

  it('renders the seeded feature_flags_core rows fetched through the org-scoped HOF', async () => {
    installLiveOrgContext();
    await renderFlagsPage('en');

    expect(withOrgContextMock).toHaveBeenCalledTimes(1);
    // feature_flags_core SELECT is RLS-scoped to app.current_org_id().
    const flagSelect = queryMock.mock.calls.find(([sql]) => /from public\.feature_flags_core/i.test(sql as string));
    expect(flagSelect?.[0]).toMatch(/app\.current_org_id\(\)/);

    expect(screen.getByText('npd.post_release_edit.enabled')).toBeInTheDocument();
    expect(screen.getByText('technical.product_spec_approval.required')).toBeInTheDocument();
    // L1 core tab count reflects the live row count (2 seeded core flags), not a constant.
    expect(screen.getByRole('button', { name: 'L1 core (2)' })).toBeInTheDocument();
  });

  it('computes the V-SET-43 preflight from the REAL org_authorization_policies row (canEnable true), so the toggle is not pre-blocked', async () => {
    setCoreFlagAction.mockResolvedValue({ ok: true, data: { flagCode: 'npd.post_release_edit.enabled', enabled: true } });
    installLiveOrgContext({ policyRow: { is_enabled: true, requires_new_version: true, authorize_role_count: 1 } });
    const user = userEvent.setup();
    await renderFlagsPage('en');

    const toggle = screen.getByRole('switch', { name: 'npd.post_release_edit.enabled' });
    await user.click(toggle);

    // canEnable=true (real policy satisfies V-SET-43) → toggle persists through setCoreFlag,
    // it is NOT short-circuited by a hardcoded canEnable:false preflight.
    await waitFor(() =>
      expect(setCoreFlagAction).toHaveBeenCalledWith({ flagCode: 'npd.post_release_edit.enabled', enabled: true }),
    );
    expect(screen.queryByText(/V-SET-43 authorization preflight failed/i)).not.toBeInTheDocument();
  });

  it('blocks the npd toggle and shows the V-SET-43 failure when the REAL policy is incomplete (canEnable false)', async () => {
    // Policy disabled / no authorizer roles → canEnable=false derived from live state.
    installLiveOrgContext({ policyRow: { is_enabled: false, requires_new_version: false, authorize_role_count: 0 } });
    const user = userEvent.setup();
    await renderFlagsPage('en');

    const toggle = screen.getByRole('switch', { name: 'npd.post_release_edit.enabled' });
    await user.click(toggle);

    expect(await screen.findByText(/V-SET-43 authorization preflight failed/i)).toBeInTheDocument();
    expect(setCoreFlagAction).not.toHaveBeenCalled();
  });

  it('renders the permission-denied state when withOrgContext rejects with forbidden (RBAC enforced server-side)', async () => {
    installLiveOrgContext({ forbidden: true });
    await renderFlagsPage('en');

    expect(screen.getByTestId('settings-flags-permission-denied-state')).toBeInTheDocument();
    expect(screen.getByText(localizedLabels.en.permissionDenied)).toBeInTheDocument();
  });

  it('renders the empty state when feature_flags_core returns zero rows for the org', async () => {
    installLiveOrgContext({ flagRows: [] });
    await renderFlagsPage('en');

    expect(screen.getByText(localizedLabels.en.empty)).toBeInTheDocument();
  });
});
