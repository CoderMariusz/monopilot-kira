/**
 * @vitest-environment jsdom
 * T-113 / SET-093 — Email Delivery Log screen RED tests.
 *
 * Prototype source: prototypes/design/Monopilot Design System/settings/admin-screens.jsx:152-217.
 * RED scope: tests only; production page is intentionally not implemented here.
 */
import React from 'react';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  usePathname: () => '/en/settings/notifications/email-log',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string | number>) => {
    const labels: Record<string, string> = {
      title: 'Email delivery log',
      subtitle: 'Last email outbox runs with sent, failed, and retry status.',
      lastRuns: 'Last email outbox runs',
      filters: 'Filters',
      status: 'Status',
      triggerCode: 'Trigger code',
      recipient: 'Recipient',
      createdAt: 'Created at',
      retryStatus: 'Retry status',
      providerMessageId: 'Provider message ID',
      payload: 'Payload',
      allStatuses: 'All statuses',
      allTriggers: 'All triggers',
      viewPayload: 'View payload',
      permissionDeniedTitle: '403 — Settings email access required',
      permissionDeniedBody: 'You need settings.email.read to view email delivery logs.',
      rowsCount: '{count} email delivery runs',
      loading: 'Loading email delivery log…',
      empty: 'No email delivery runs found.',
      error: 'Unable to load email delivery log.',
    };
    return (labels[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
  }),
}));

type EmailDeliveryStatus = 'sent' | 'failed' | 'dlq';
type RetryStatus = 'not_retried' | 'retry_scheduled' | 'retry_exhausted' | 'dlq';

type EmailDeliveryLogRow = {
  id: string;
  created_at: string;
  status: EmailDeliveryStatus;
  retry_status: RetryStatus;
  trigger_code: string;
  recipient_email: string;
  provider_message_id?: string;
  payload: Record<string, unknown>;
};

type EmailDeliveryLogPageProps = {
  params?: Promise<{ locale: string }>;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  caller?: { roleCode?: string; permissions: string[] };
  deliveryLogs?: EmailDeliveryLogRow[];
  initialFilters?: { status?: EmailDeliveryStatus | 'all'; trigger_code?: string | 'all' };
};

type EmailDeliveryLogPage = (props: EmailDeliveryLogPageProps) => React.ReactNode | Promise<React.ReactNode>;

const deliveryLogs: EmailDeliveryLogRow[] = [
  {
    id: 'log-older-failed-other',
    created_at: '2026-05-24T08:30:00.000Z',
    status: 'failed',
    retry_status: 'retry_exhausted',
    trigger_code: 'qa_hold_created',
    recipient_email: 'ewa.nowak@example.com',
    provider_message_id: 'msg_fail_ewa',
    payload: { to: 'ewa.nowak@example.com', subject: 'Hold created' },
  },
  {
    id: 'log-dlq',
    created_at: '2026-05-24T09:00:00.000Z',
    status: 'dlq',
    retry_status: 'dlq',
    trigger_code: 'po_supplier_overdue',
    recipient_email: 'operations@example.com',
    payload: { to: 'operations@example.com', reason: 'provider timeout' },
  },
  {
    id: 'log-newest-sent',
    created_at: '2026-05-24T10:00:00.000Z',
    status: 'sent',
    retry_status: 'not_retried',
    trigger_code: 'po_to_supplier',
    recipient_email: 'anna@example.com',
    provider_message_id: 'msg_sent_anna',
    payload: { to: 'anna@example.com', subject: 'PO 1001' },
  },
  {
    id: 'log-target-failed',
    created_at: '2026-05-24T09:30:00.000Z',
    status: 'failed',
    retry_status: 'retry_scheduled',
    trigger_code: 'fa_d365_ready',
    recipient_email: 'jan.kowalski@example.com',
    provider_message_id: 'msg_fail_jan',
    payload: {
      to: 'jan.kowalski@example.com',
      template: 'fa_d365_ready',
      subject: 'D365 export is ready',
    },
  },
  {
    id: 'log-oldest-sent',
    created_at: '2026-05-24T07:45:00.000Z',
    status: 'sent',
    retry_status: 'not_retried',
    trigger_code: 'fa_d365_ready',
    recipient_email: 'jan.kowalski@example.com',
    provider_message_id: 'msg_sent_jan',
    payload: { to: 'jan.kowalski@example.com', template: 'fa_d365_ready' },
  },
];

function routeCandidates(pathSuffix: string) {
  return [join(process.cwd(), pathSuffix), join(process.cwd(), pathSuffix.replace(/^apps\/web\//, ''))];
}

async function loadEmailDeliveryLogPage(): Promise<EmailDeliveryLogPage> {
  try {
    const pageModulePath = './' + 'page';
    const mod = (await import(/* @vite-ignore */ pageModulePath)) as { default?: EmailDeliveryLogPage };
    expect(
      mod.default,
      'SET-093 email delivery log page must default-export a renderable Server Component at app/[locale]/(app)/(admin)/settings/notifications/email-log/page.tsx',
    ).toEqual(expect.any(Function));
    return mod.default as EmailDeliveryLogPage;
  } catch (error) {
    const pageExists = routeCandidates(
      'apps/web/app/[locale]/(app)/(admin)/settings/notifications/email-log/page.tsx',
    ).some((candidate) => existsSync(candidate));
    if (pageExists) {
      throw error;
    }
    return function MissingEmailDeliveryLogPage() {
      return <main data-testid="missing-email-delivery-log-page" />;
    };
  }
}

async function renderEmailDeliveryLogPage(overrides: Partial<EmailDeliveryLogPageProps> = {}) {
  const Page = await loadEmailDeliveryLogPage();
  const props: EmailDeliveryLogPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    state: 'ready',
    caller: { roleCode: 'settings-admin', permissions: ['settings.email.read'] },
    deliveryLogs,
    initialFilters: { status: 'all', trigger_code: 'all' },
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(<>{node}</>) };
}

function screenRoot() {
  return screen.getByTestId('settings-email-delivery-log-screen');
}

function logRows() {
  return screen.getAllByTestId('settings-email-delivery-log-row');
}

async function chooseComboboxValue(user: ReturnType<typeof userEvent.setup>, name: RegExp, value: string, label: RegExp) {
  const control = screen.getByRole('combobox', { name });
  expect(control).toHaveAttribute('data-slot', 'select-trigger');
  if (control instanceof HTMLSelectElement) {
    await user.selectOptions(control, value);
    return;
  }
  await user.click(control);
  await user.click(await screen.findByRole('option', { name: label }));
}

describe('SET-093 email delivery log localized AppShell route contract', () => {
  it('defines the user-visible /en/settings/notifications/email-log route under the AppShell route group', () => {
    const canonicalRouteCandidates = routeCandidates(
      'apps/web/app/[locale]/(app)/(admin)/settings/notifications/email-log/page.tsx',
    );
    const legacyRouteCandidates = routeCandidates(
      'apps/web/app/[locale]/(admin)/settings/notifications/email-log/page.tsx',
    );

    expect(
      canonicalRouteCandidates.some((candidate) => existsSync(candidate)),
      'SET-093 must implement /en/settings/notifications/email-log under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(
      legacyRouteCandidates.some((candidate) => existsSync(candidate)),
      'Legacy body-only settings route must not be the only email delivery log implementation',
    ).toBe(false);
  });
});

describe('SET-093 email delivery log behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/notifications/email-log');
  });

  afterEach(() => {
    cleanup();
  });

  it('lists the last five email_delivery_log rows in created_at DESC order with status badges and no retry actions', async () => {
    await renderEmailDeliveryLogPage();

    const root = screenRoot();
    expect(root).toHaveAttribute('data-route', '/settings/notifications/email-log');
    expect(root).toHaveAttribute('data-screen', 'email_delivery_log_screen');
    expect(root).toHaveAttribute(
      'data-prototype-source',
      'prototypes/design/Monopilot Design System/settings/admin-screens.jsx:152-217',
    );
    expect(screen.getByRole('heading', { name: /^Email delivery log$/i })).toBeInTheDocument();
    expect(screen.getByText(/last email outbox runs/i)).toBeInTheDocument();

    const table = screen.getByRole('table', { name: /email delivery|last email outbox runs/i });
    expect(table).toHaveAttribute('data-slot', 'table');
    for (const header of ['Created at', 'Status', 'Trigger code', 'Recipient', 'Retry status', 'Provider message ID', 'Payload']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }

    expect(logRows()).toHaveLength(5);
    expect(logRows().map((row) => row.getAttribute('data-log-id'))).toEqual([
      'log-newest-sent',
      'log-target-failed',
      'log-dlq',
      'log-older-failed-other',
      'log-oldest-sent',
    ]);

    expect(screen.getAllByText(/^sent$/i)[0]).toHaveAttribute('data-slot', 'badge');
    expect(screen.getAllByText(/^failed$/i)[0]).toHaveAttribute('data-slot', 'badge');
    expect(screen.getByText(/^dlq$/i)).toHaveAttribute('data-slot', 'badge');
    expect(screen.queryByRole('button', { name: /retry|resend|send again/i })).not.toBeInTheDocument();
  });

  it('masks recipient addresses in the list and exposes the full PII address only inside the payload modal', async () => {
    const user = userEvent.setup();
    await renderEmailDeliveryLogPage();

    const targetRow = screen.getByTestId('settings-email-delivery-log-row-log-target-failed');
    expect(within(targetRow).getByText('jan@example.com')).toBeInTheDocument();
    expect(within(targetRow).queryByText('jan.kowalski@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('jan.kowalski@example.com')).not.toBeInTheDocument();

    await user.click(within(targetRow).getByRole('button', { name: /view payload/i }));

    const dialog = await screen.findByRole('dialog', { name: /payload.*fa_d365_ready|email payload/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('data-slot', 'dialog-content');
    expect(within(dialog).getByText('jan.kowalski@example.com')).toBeInTheDocument();
  });

  it("filters by status='failed' and trigger_code='fa_d365_ready' through the visible controls", async () => {
    const user = userEvent.setup();
    await renderEmailDeliveryLogPage();

    await chooseComboboxValue(user, /^status$/i, 'failed', /^failed$/i);
    await chooseComboboxValue(user, /trigger code/i, 'fa_d365_ready', /^fa_d365_ready$/i);

    expect(logRows()).toHaveLength(1);
    expect(logRows()[0]).toHaveAttribute('data-log-id', 'log-target-failed');
    expect(screen.getByText('jan@example.com')).toBeInTheDocument();
    expect(screen.getByText(/^failed$/i)).toHaveAttribute('data-slot', 'badge');
    expect(screen.queryByText('qa_hold_created')).not.toBeInTheDocument();
    expect(screen.queryByText('po_to_supplier')).not.toBeInTheDocument();
  });

  it('renders a 403 page when the caller lacks settings.email.read even if roleCode looks privileged', async () => {
    await renderEmailDeliveryLogPage({
      caller: { roleCode: 'settings.email.read', permissions: [] },
    });

    expect(screen.getByRole('heading', { name: /403/i })).toBeInTheDocument();
    expect(screen.getByText(/settings\.email\.read/i)).toBeInTheDocument();
    expect(screen.queryByTestId('settings-email-delivery-log-row')).not.toBeInTheDocument();
    expect(screen.queryByText('jan@example.com')).not.toBeInTheDocument();
  });
});
