/**
 * @vitest-environment jsdom
 * T-058 / SET-010 — Company Profile screen
 *
 * RED phase: RTL contract for prototypes/design/Monopilot Design System/settings/org-screens.jsx:4-100.
 * Missing page modules render an empty placeholder so failures are behavior assertions, not module-resolution noise.
 */

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const messages: Record<string, string> = {
  title: 'Company profile',
  subtitle: 'Your company details, used across labels, invoices, and exports.',
  loading: 'Loading company profile…',
  empty: 'No organization profile is available for the current org.',
  load_error: 'Company profile could not be loaded.',
  save_error: 'Company profile could not be saved.',
  read_only_label: 'Read-only',
  read_only_notice: 'You need settings.org.update to save company profile changes.',
  section_identity: 'Identity',
  section_registered_address: 'Registered address',
  section_contact: 'Contact',
  section_locale: 'Locale',
  field_trading_name: 'Trading name',
  field_legal_name: 'Legal name',
  field_logo: 'Logo',
  field_vat: 'VAT / NIP',
  field_regon: 'REGON',
  field_industry: 'Industry',
  field_street: 'Street',
  field_city_zip: 'City / ZIP',
  field_city: 'City',
  field_zip: 'ZIP',
  field_country: 'Country',
  field_email: 'Email',
  field_phone: 'Phone',
  field_website: 'Website',
  field_default_currency: 'Default currency',
  field_timezone: 'Timezone',
  field_date_format: 'Date format',
  field_region: 'Region',
  hint_upload: 'PNG or SVG · max 2MB · 400×400px recommended',
  region_tooltip: 'Region change requires support ticket',
  action_upload_new: 'Upload new',
  action_cancel: 'Cancel',
  action_save_changes: 'Save changes',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => messages[key] ?? key,
}));

type CompanyProfile = {
  id: string;
  tradingName: string;
  legalName: string;
  logoInitials: string;
  vat: string;
  regon: string;
  industry: string;
  street: string;
  city: string;
  zip: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  currency: string;
  timezone: string;
  dateFormat: string;
  region: string;
};

type SaveCompanyProfileInput = Omit<CompanyProfile, 'id' | 'logoInitials' | 'region'>;

type CompanyProfilePageProps = {
  organization: CompanyProfile;
  canEdit: boolean;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  saveCompanyProfile: ReturnType<typeof vi.fn>;
  uploadLogo: ReturnType<typeof vi.fn>;
};

type CompanyProfilePage = (props: CompanyProfilePageProps) => React.ReactNode | Promise<React.ReactNode>;

const organization: CompanyProfile = {
  id: 'org-apex',
  tradingName: 'Apex Foods Sp. z o.o.',
  legalName: 'Apex Foods Spółka z ograniczoną odpowiedzialnością',
  logoInitials: 'APEX',
  vat: 'PL5213456789',
  regon: '123456789',
  industry: 'Meat processing',
  street: 'ul. Zakładowa 12',
  city: 'Kraków',
  zip: '30-690',
  country: 'Poland',
  email: 'office@apex.pl',
  phone: '+48 12 345 67 89',
  website: 'apex.pl',
  currency: 'EUR',
  timezone: 'Europe/Warsaw',
  dateFormat: 'YYYY-MM-DD',
  region: 'eu-central',
};

async function loadCompanyProfilePage(): Promise<CompanyProfilePage> {
  try {
    const pageModulePath = './company-profile-screen.client';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-010 page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as CompanyProfilePage;
  } catch {
    return function MissingCompanyProfilePage() {
      return React.createElement('main', { 'data-testid': 'missing-company-profile-page' });
    };
  }
}

async function renderCompanyProfile(overrides: Partial<CompanyProfilePageProps> = {}) {
  const Page = await loadCompanyProfilePage();
  const props: CompanyProfilePageProps = {
    organization,
    canEdit: true,
    state: 'ready',
    saveCompanyProfile: vi.fn().mockResolvedValue({
      ok: true,
      organization: { ...organization, tradingName: 'Apex Prime Foods', timezone: 'UTC' },
      outboxEventType: 'settings.org.updated',
    }),
    uploadLogo: vi.fn().mockResolvedValue({ ok: true, logoUrl: 'https://blob.example/logo.svg' }),
    ...overrides,
  };

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(props);
    return { props, ...render(React.createElement(React.Fragment, null, node)) };
  }

  return { props, ...render(React.createElement(Page as React.ComponentType<CompanyProfilePageProps>, props)) };
}

function sectionTitles() {
  return screen.getAllByTestId('company-profile-section').map((section) => {
    return within(section).getByRole('heading', { level: 2 }).textContent;
  });
}

function labelledControlNames() {
  return [
    ...screen.queryAllByRole('textbox'),
    ...screen.queryAllByRole('combobox'),
  ].map((element) => element.getAttribute('aria-label') || element.getAttribute('name') || element.id);
}

describe('SET-010 company profile Server Component boundary and i18n', () => {
  it('keeps page.tsx server-rendered and delegates translations/interactivity to the client leaf', () => {
    const sourceDir = join(process.cwd(), 'app/[locale]/(admin)/settings/company');
    const pageSource = readFileSync(join(sourceDir, 'page.tsx'), 'utf8');
    const clientSource = readFileSync(join(sourceDir, 'company-profile-screen.client.tsx'), 'utf8');

    expect(pageSource).not.toMatch(/^['"]use client['"]/m);
    expect(pageSource).toContain("getTranslations({ locale, namespace: 'settings.company_profile' })");
    expect(pageSource).toContain("from './company-profile-screen.client'");
    expect(clientSource).toMatch(/^['"]use client['"]/m);
    expect(clientSource).toContain("useTranslations('settings.company_profile')");
  });
});

describe('SET-010 company profile prototype parity', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders prototype sections, labels, shadcn primitives, states, action order, and focus order', async () => {
    const user = userEvent.setup();
    const { container } = await renderCompanyProfile();

    expect(screen.getByRole('heading', { name: /company profile/i })).toBeInTheDocument();
    expect(screen.getByText(/used across labels, invoices, and exports/i)).toBeInTheDocument();
    expect(sectionTitles()).toEqual(['Identity', 'Registered address', 'Contact', 'Locale']);

    const identity = screen.getByRole('region', { name: /identity/i });
    expect(within(identity).getByLabelText(/trading name/i)).toHaveValue(organization.tradingName);
    expect(within(identity).getByLabelText(/legal name/i)).toHaveValue(organization.legalName);
    expect(within(identity).getByText('APEX')).toBeInTheDocument();
    expect(within(identity).getByRole('button', { name: /upload new/i })).toHaveAttribute('data-slot', 'button');
    expect(within(identity).getByText(/png or svg · max 2mb · 400×400px recommended/i)).toBeInTheDocument();
    expect(within(identity).getByLabelText(/vat \/ nip/i)).toHaveValue(organization.vat);
    expect(within(identity).getByLabelText(/regon/i)).toHaveValue(organization.regon);
    expect(within(identity).getByRole('combobox', { name: /industry/i })).toHaveValue('Meat processing');
    const actionButtons = within(identity).getAllByRole('button').map((button) => button.textContent);
    expect(actionButtons.slice(-2)).toEqual(['Cancel', 'Save changes']);
    expect(within(identity).getByRole('button', { name: /save changes/i })).toBeDisabled();

    const address = screen.getByRole('region', { name: /registered address/i });
    expect(within(address).getByLabelText(/street/i)).toHaveValue(organization.street);
    expect(within(address).getByText('City / ZIP')).toBeInTheDocument();
    expect(within(address).getByLabelText(/city/i)).toHaveValue(organization.city);
    expect(within(address).getByLabelText(/zip/i)).toHaveValue(organization.zip);
    expect(within(address).getByRole('combobox', { name: /country/i })).toHaveValue('Poland');

    const contact = screen.getByRole('region', { name: /contact/i });
    expect(within(contact).getByLabelText(/email/i)).toHaveAttribute('type', 'email');
    expect(within(contact).getByLabelText(/phone/i)).toHaveValue(organization.phone);
    expect(within(contact).getByLabelText(/website/i)).toHaveValue(organization.website);

    const locale = screen.getByRole('region', { name: /locale/i });
    expect(within(locale).getByRole('combobox', { name: /default currency/i })).toHaveValue('EUR');
    expect(within(locale).getByRole('combobox', { name: /timezone/i })).toHaveValue('Europe/Warsaw');
    expect(within(locale).getByRole('combobox', { name: /date format/i })).toHaveValue('YYYY-MM-DD');
    expect(within(locale).getByLabelText(/region/i)).toHaveValue('eu-central');

    expect(container.querySelectorAll('[data-slot="input"]').length).toBeGreaterThanOrEqual(9);
    expect(container.querySelectorAll('[data-slot="select-trigger"]').length).toBe(5);
    expect(container.querySelectorAll('select')).toHaveLength(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.tab();
    expect(screen.getByLabelText(/trading name/i)).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText(/legal name/i)).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /upload new/i })).toHaveFocus();

    expect({ sections: sectionTitles(), controls: labelledControlNames() }).toMatchInlineSnapshot(`
      {
        "controls": [
          "Trading name",
          "Legal name",
          "VAT / NIP",
          "REGON",
          "Street",
          "City",
          "ZIP",
          "Email",
          "Phone",
          "Website",
          "Region",
          "Industry",
          "Country",
          "Default currency",
          "Timezone",
          "Date format",
        ],
        "sections": [
          "Identity",
          "Registered address",
          "Contact",
          "Locale",
        ],
      }
    `);
  });

  it('renders loading, empty, error, and permission-denied states loudly', async () => {
    await renderCompanyProfile({ state: 'loading' });
    expect(screen.getByTestId('company-profile-loading')).toBeInTheDocument();

    cleanup();
    await renderCompanyProfile({ state: 'empty', organization: { ...organization, id: '' } });
    expect(screen.getByRole('status')).toHaveTextContent(/no organization profile/i);

    cleanup();
    await renderCompanyProfile({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(/company profile could not be loaded/i);

    cleanup();
    await renderCompanyProfile({ canEdit: false });
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });
});

describe('SET-010 save action and V-SET-32 region lock', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('saves changed name and timezone, updates the rendered row, and surfaces settings.org.updated', async () => {
    const user = userEvent.setup();
    const saveCompanyProfile = vi.fn().mockResolvedValue({
      ok: true,
      organization: { ...organization, tradingName: 'Apex Prime Foods', timezone: 'UTC' },
      outboxEventType: 'settings.org.updated',
    });
    await renderCompanyProfile({ saveCompanyProfile });

    await user.clear(screen.getByLabelText(/trading name/i));
    await user.type(screen.getByLabelText(/trading name/i), 'Apex Prime Foods');
    await user.click(screen.getByRole('combobox', { name: /timezone/i }));
    await user.click(screen.getByRole('option', { name: 'UTC' }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(saveCompanyProfile).toHaveBeenCalledWith(
      expect.objectContaining<Partial<SaveCompanyProfileInput>>({
        tradingName: 'Apex Prime Foods',
        timezone: 'UTC',
      }),
    );
    expect(await screen.findByDisplayValue('Apex Prime Foods')).toBeInTheDocument();
    expect(await screen.findByText(/settings\.org\.updated/i)).toBeInTheDocument();
  });

  it('keeps region read-only with the exact support-ticket tooltip and excludes region from save payload', async () => {
    const user = userEvent.setup();
    const saveCompanyProfile = vi.fn().mockResolvedValue({
      ok: true,
      organization,
      outboxEventType: 'settings.org.updated',
    });
    await renderCompanyProfile({ saveCompanyProfile });

    const region = screen.getByLabelText(/region/i);
    expect(region).toHaveValue('eu-central');
    expect(region).toBeDisabled();
    expect(region).toHaveAttribute('aria-describedby', expect.stringContaining('region-support-ticket'));
    expect(screen.getByRole('tooltip', { name: /region change requires support ticket/i })).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/trading name/i));
    await user.type(screen.getByLabelText(/trading name/i), 'Apex Prime Foods');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(saveCompanyProfile).toHaveBeenCalledTimes(1);
    expect(saveCompanyProfile.mock.calls[0][0]).not.toHaveProperty('region');
  });
});
