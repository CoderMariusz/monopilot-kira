/**
 * @vitest-environment jsdom
 * SET-PRN / E1 — Printers settings screen (settings/infra/printers).
 *
 * RED phase: pins the four required UI states (loading / empty-with-CTA / error /
 * data + permission-denied), asserts the Add-printer modal exposes ALL fields
 * (name / type / address / location / site), and verifies create / edit /
 * deactivate wire the injected actions. No raw UUIDs leak into the rendered DOM.
 */
import React from 'react';
import { existsSync } from 'node:fs';
import path from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(),
}));

vi.mock('./_actions/printers', () => ({
  listPrinters: vi.fn(),
  upsertPrinter: vi.fn(),
}));

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const SITE_A = '11111111-1111-4111-8111-111111111111';
const PRINTER_PDF = '22222222-2222-4222-8222-222222222222';
const PRINTER_ZPL = '33333333-3333-4333-8333-333333333333';
const NEW_PRINTER = '44444444-4444-4444-8444-444444444444';

type PrinterRow = {
  id: string;
  site_id: string | null;
  name: string;
  printer_type: 'pdf' | 'zpl';
  address: string | null;
  location: string | null;
  is_active: boolean;
};
type SiteOption = { id: string; code: string; name: string };
type UpsertInput = {
  id?: string;
  name: string;
  printer_type: 'pdf' | 'zpl';
  address?: string | null;
  location?: string | null;
  site_id?: string | null;
  is_active?: boolean;
};

type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

type PrintersPageProps = {
  params?: Promise<{ locale: string }>;
  printers?: PrinterRow[];
  sites?: SiteOption[];
  canManage?: boolean;
  state?: PageState;
  upsertPrinter?: (input: UpsertInput) => Promise<PrinterRow>;
};

type PrintersPage = (props: PrintersPageProps) => React.ReactNode | Promise<React.ReactNode>;

const sites: SiteOption[] = [{ id: SITE_A, code: 'KRK', name: 'Kraków HQ' }];

const printers: PrinterRow[] = [
  {
    id: PRINTER_PDF,
    site_id: SITE_A,
    name: 'Dispatch PDF',
    printer_type: 'pdf',
    address: 'pdf://dispatch',
    location: 'Dispatch desk',
    is_active: true,
  },
  {
    id: PRINTER_ZPL,
    site_id: null,
    name: 'Zebra ZD420',
    printer_type: 'zpl',
    address: 'tcp://10.0.0.5:9100',
    location: 'Line 1',
    is_active: false,
  },
];

async function loadPage(): Promise<PrintersPage> {
  const mod = await import('./page.tsx');
  expect(mod.default, 'printers page must default-export a renderable component').toEqual(expect.any(Function));
  return mod.default as PrintersPage;
}

async function renderPage(overrides: Partial<PrintersPageProps> = {}) {
  const Page = await loadPage();
  const upsertPrinter = vi.fn(async (input: UpsertInput) => ({
    id: input.id ?? NEW_PRINTER,
    site_id: input.site_id ?? null,
    name: input.name,
    printer_type: input.printer_type,
    address: input.address ?? null,
    location: input.location ?? null,
    is_active: input.is_active ?? true,
  }));
  const props: PrintersPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    printers,
    sites,
    canManage: true,
    state: 'ready',
    upsertPrinter,
    ...overrides,
  };
  const node = await Page(props);
  return { props, upsertPrinter, ...render(React.createElement(React.Fragment, null, node)) };
}

function expectNoRawUuids() {
  expect(document.body.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-9][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
}

describe('SET-PRN printers route contract', () => {
  it('implements the localized AppShell route under app/[locale]/(app)/(admin)/settings/infra/printers', () => {
    const canonical = path.join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/infra/printers/page.tsx');
    expect(existsSync(canonical)).toBe(true);
  });
});

describe('SET-PRN printers screen', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the data state: list of printers with type/status badges and no raw UUIDs', async () => {
    await renderPage();
    expect(screen.getByTestId('settings-printers-screen')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /printers/i });
    expect(within(table).getByText('Dispatch PDF')).toBeInTheDocument();
    expect(within(table).getByText('Zebra ZD420')).toBeInTheDocument();
    expect(within(table).getByText('Kraków HQ')).toBeInTheDocument();
    expectNoRawUuids();
  });

  it('renders the loading state', async () => {
    await renderPage({ state: 'loading', printers: [] });
    expect(screen.getByRole('status')).toHaveTextContent(/loading printers/i);
  });

  it('renders the empty state with an Add-printer CTA', async () => {
    await renderPage({ state: 'empty', printers: [] });
    expect(screen.getByText(/no printers registered yet/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /add printer/i }).length).toBeGreaterThan(0);
  });

  it('renders the error state', async () => {
    await renderPage({ state: 'error', printers: [] });
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load printers/i);
  });

  it('renders the permission-denied state and disables Add printer', async () => {
    await renderPage({ state: 'permission_denied', printers: [], canManage: false });
    expect(screen.getByRole('alert')).toHaveTextContent(/permission/i);
    const add = screen.getByRole('button', { name: /add printer/i });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleName(/settings\.org\.update/i);
  });

  it('Add-printer modal exposes ALL fields (name / type / address / location / site)', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole('button', { name: /^\+? ?add printer$/i }));
    const dialog = screen.getByRole('dialog', { name: /add printer/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^type$/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^address$/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^location$/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^site$/i)).toBeInTheDocument();
  });

  it('creates a printer through the injected upsertPrinter action', async () => {
    const user = userEvent.setup();
    const { upsertPrinter } = await renderPage({ printers: [], state: 'empty' });
    await user.click(screen.getAllByRole('button', { name: /add printer/i })[0]);
    const dialog = screen.getByRole('dialog', { name: /add printer/i });
    await user.type(within(dialog).getByLabelText(/^name$/i), 'New ZPL');
    await user.type(within(dialog).getByLabelText(/^address$/i), 'tcp://10.0.0.9:9100');
    await user.click(within(dialog).getByRole('button', { name: /save printer/i }));
    await waitFor(() => expect(upsertPrinter).toHaveBeenCalledTimes(1));
    expect(upsertPrinter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New ZPL', printer_type: expect.any(String) }),
    );
    // Canonical settings round-trip: refresh the server-rendered list after create.
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('deactivates an active printer through upsertPrinter with is_active=false', async () => {
    const user = userEvent.setup();
    const { upsertPrinter } = await renderPage();
    const row = within(screen.getByRole('table', { name: /printers/i })).getByRole('row', { name: /Dispatch PDF/i });
    await user.click(within(row).getByRole('button', { name: /deactivate/i }));
    await waitFor(() => expect(upsertPrinter).toHaveBeenCalledTimes(1));
    expect(upsertPrinter).toHaveBeenCalledWith(expect.objectContaining({ id: PRINTER_PDF, is_active: false }));
  });
});
