/**
 * @vitest-environment jsdom
 * T-058 / SET-010 — Company Profile screen
 *
 * RED phase: these RTL tests specify the company_profile_screen production
 * behavior from prototypes/design/Monopilot Design System/settings/org-screens.jsx:4-100
 * plus the task packet production fields/actions. Missing production page modules are
 * rendered as an empty placeholder so RED reports behavior assertion failures, not
 * module-resolution noise.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
  gs1Prefix: string;
  region: string;
  tier: string;
  seatLimit: number;
};

type SaveCompanyProfileInput = Pick<
  CompanyProfile,
  | 'tradingName'
  | 'legalName'
  | 'vat'
  | 'regon'
  | 'industry'
  | 'street'
  | 'city'
  | 'zip'
  | 'country'
  | 'email'
  | 'phone'
  | 'website'
  | 'currency'
  | 'timezone'
  | 'dateFormat'
  | 'gs1Prefix'
>;

type CompanyProfilePageProps = {
  organization: CompanyProfile;
  canEdit: boolean;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  saveCompanyProfile: ReturnType<typeof vi.fn>;
  uploadLogo: ReturnType<typeof vi.fn>;
};

type CompanyProfilePage = (
  props: CompanyProfilePageProps,
) => React.ReactNode | Promise<React.ReactNode>;

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
  gs1Prefix: '5901234',
  region: 'eu-central',
  tier: 'enterprise',
  seatLimit: 50,
};

async function loadCompanyProfilePage(): Promise<CompanyProfilePage> {
  try {
    const pageModulePath = './page';
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

  return {
    props,
    ...render(React.createElement(Page as React.ComponentType<CompanyProfilePageProps>, props)),
  };
}

function sectionTitles() {
  return screen.getAllByTestId('company-profile-section').map((section: HTMLElement) => {
    const heading = within(section).getByRole('heading', { level: 2 });
    return heading.textContent;
  });
}

function labelledControls() {
  return [
    ...screen.getAllByRole('textbox'),
    ...screen.getAllByRole('combobox'),
    ...screen.getAllByRole('spinbutton'),
  ].map((element) => element.getAttribute('aria-label') || element.getAttribute('name') || element.id);
}

describe('SET-010 company profile prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the prototype sections, field labels, package UI primitives, actions, states, and keyboard order', async () => {
    const user = userEvent.setup();
    const { container } = await renderCompanyProfile();

    expect(screen.getByRole('heading', { name: /company profile/i })).toBeInTheDocument();
    expect(
      screen.getByText(/your company details, used across labels, invoices, and exports/i),
    ).toBeInTheDocument();

    expect(sectionTitles()).toEqual(['Identity', 'Registered address', 'Contact', 'Locale']);

    const identity = screen.getByRole('region', { name: /identity/i });
    expect(within(identity).getByLabelText(/trading name/i)).toHaveValue(organization.tradingName);
    expect(within(identity).getByLabelText(/legal name/i)).toHaveValue(organization.legalName);
    expect(within(identity).getByText('APEX')).toBeInTheDocument();
    expect(within(identity).getByRole('button', { name: /upload new/i })).toBeInTheDocument();
    expect(within(identity).getByText(/png or svg · max 2mb · 400×400px recommended/i)).toBeInTheDocument();
    expect(within(identity).getByLabelText(/vat \/ nip/i)).toHaveValue(organization.vat);
    expect(within(identity).getByLabelText(/regon/i)).toHaveValue(organization.regon);
    expect(within(identity).getByRole('combobox', { name: /industry/i })).toHaveValue('Meat processing');
    expect(within(identity).getByLabelText(/gs1 prefix/i)).toHaveValue(organization.gs1Prefix);

    const address = screen.getByRole('region', { name: /registered address/i });
    expect(within(address).getByLabelText(/street/i)).toHaveValue(organization.street);
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
    expect(within(locale).getByLabelText(/tier/i)).toHaveValue('enterprise');
    expect(within(locale).getByLabelText(/seat limit/i)).toHaveValue(50);

    expect(container.querySelectorAll('[data-slot="input"]').length).toBeGreaterThanOrEqual(10);
    expect(screen.getByRole('button', { name: /cancel/i })).toHaveAttribute('data-slot', 'button');
    expect(screen.getByRole('button', { name: /save changes/i })).toHaveAttribute('data-slot', 'button');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.tab();
    expect(screen.getByLabelText(/trading name/i)).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText(/legal name/i)).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /upload new/i })).toHaveFocus();

    expect({ sections: sectionTitles(), controls: labelledControls() }).toMatchInlineSnapshot(`
      {
        "controls": [
          "Trading name",
          "Legal name",
          "VAT / NIP",
          "REGON",
          "GS1 prefix",
          "Street",
          "City",
          "ZIP",
          "Email",
          "Phone",
          "Website",
          "Region",
          "Tier",
          "Industry",
          "Country",
          "Default currency",
          "Timezone",
          "Date format",
          "Seat limit",
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

  it('renders explicit loading, empty, error, and permission-denied states without silently skipping controls', async () => {
    await renderCompanyProfile({ state: 'loading' });
    expect(screen.getByTestId('company-profile-loading')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();

    cleanup();
    await renderCompanyProfile({ state: 'empty', organization: { ...organization, id: '' } });
    expect(screen.getByRole('status')).toHaveTextContent(/no organization profile/i);

    cleanup();
    await renderCompanyProfile({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(/company profile could not be loaded/i);

    cleanup();
    await renderCompanyProfile({ canEdit: false });
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.getByText(/settings\.org\.update/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });
});

describe('SET-010 save action and outbox result wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates name and timezone through the save action and surfaces settings.org.updated", async () => {
    const user = userEvent.setup();
    const saveCompanyProfile = vi.fn().mockResolvedValue({
      ok: true,
      organization: { ...organization, tradingName: 'Apex Prime Foods', timezone: 'UTC' },
      outboxEventType: 'settings.org.updated',
    });
    await renderCompanyProfile({ saveCompanyProfile });

    await user.clear(screen.getByLabelText(/trading name/i));
    await user.type(screen.getByLabelText(/trading name/i), 'Apex Prime Foods');
    await user.selectOptions(screen.getByRole('combobox', { name: /timezone/i }), 'UTC');

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    expect(saveCompanyProfile).toHaveBeenCalledTimes(1);
    expect(saveCompanyProfile).toHaveBeenCalledWith(
      expect.objectContaining<Partial<SaveCompanyProfileInput>>({
        tradingName: 'Apex Prime Foods',
        timezone: 'UTC',
        currency: 'EUR',
        gs1Prefix: '5901234',
      }),
    );
    expect(await screen.findByDisplayValue('Apex Prime Foods')).toBeInTheDocument();
    expect(await screen.findByText(/settings\.org\.updated/i)).toBeInTheDocument();
  });
});

describe('SET-010 V-SET-32 region lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps region read-only with the support-ticket tooltip and excludes region from save payload', async () => {
    const user = userEvent.setup();
    const saveCompanyProfile = vi.fn().mockResolvedValue({
      ok: true,
      organization,
      outboxEventType: 'settings.org.updated',
    });
    await renderCompanyProfile({ saveCompanyProfile });

    const region = screen.getByLabelText(/region/i);
    expect(region).toHaveValue('eu-central');
    expect(region).toHaveAttribute('aria-describedby', expect.stringContaining('region-support-ticket'));
    expect(region).toBeDisabled();
    expect(screen.getByRole('tooltip', { name: /region change requires support ticket/i })).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/trading name/i));
    await user.type(screen.getByLabelText(/trading name/i), 'Apex Prime Foods');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(saveCompanyProfile).toHaveBeenCalledTimes(1);
    expect(saveCompanyProfile.mock.calls[0][0]).not.toHaveProperty('region');
  });
});
