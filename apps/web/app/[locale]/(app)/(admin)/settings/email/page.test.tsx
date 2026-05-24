/**
 * @vitest-environment jsdom
 * T-068 / SET-090 — Email templates screen RED tests.
 * Prototype source: prototypes/design/Monopilot Design System/settings/admin-screens.jsx:626-673.
 * RED scope: tests only; production page is intentionally not implemented here.
 */
import React from 'react';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@monopilot/ui/Modal', async () => {
  const ReactModule = await import('react');

  function Modal({
    children,
    modalId,
    onOpenChange,
    open,
  }: {
    children: React.ReactNode;
    modalId?: string;
    onOpenChange: (open: boolean) => void;
    open: boolean;
  }) {
    ReactModule.useEffect(() => {
      if (!open) return undefined;
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') onOpenChange(false);
      };
      document.addEventListener('keydown', closeOnEscape);
      return () => document.removeEventListener('keydown', closeOnEscape);
    }, [onOpenChange, open]);

    if (!open) return null;

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-email-template-dialog-title"
        data-focus-trap="radix-dialog"
        data-modal-id={modalId}
      >
        {children}
      </div>
    );
  }

  Modal.Header = ({ title }: { title: string }) => <h2 id="settings-email-template-dialog-title">{title}</h2>;
  Modal.Body = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Modal.Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

  return { default: Modal };
});

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  usePathname: () => '/en/settings/email',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const emailTemplateLabels: Record<string, string> = {
  title: 'Email templates',
  subtitle: 'Trigger-driven transactional templates consumed by Planning, Shipping, QA.',
  testSend: 'Test send…',
  newTemplate: '+ New template',
  providerTitle: 'Provider',
  providerSubtitle: 'SMTP / API provider used to send all Monopilot transactional mail.',
  provider: 'Provider',
  apiKey: 'API key',
  rotate: 'Rotate',
  fromEmail: 'From email',
  fromName: 'From name',
  templatesTitle: 'Templates ({count})',
  triggerCode: 'Trigger code',
  name: 'Name',
  consumer: 'Consumer',
  subjectPreview: 'Subject preview',
  active: 'Active',
  edit: 'Edit →',
  emptyTitle: 'No email templates yet',
  emptyBody:
    'Create a template to customize the emails Monopilot sends for POs, approvals, overdue reminders, and more.',
  variablesReference:
    'Variables reference: open Email variables in the left nav for the full merge-field picker used inside each template body.',
  loading: 'Loading email templates…',
  error: 'Unable to load email template settings.',
  permissionDenied: 'You do not have permission to manage email templates.',
  sent: 'Probe sent — message_id {messageId}',
  testSendError: 'Unable to send probe email.',
  newEmailTemplate: 'New email template',
  editEmailTemplate: 'Edit template {code}',
  createEmailTemplate: 'Create email template',
  close: 'Close',
};

function tEmailTemplate(key: string, values?: Record<string, string | number>) {
  return (emailTemplateLabels[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
}

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => tEmailTemplate),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => tEmailTemplate,
}));

type EmailProviderSettings = {
  provider: 'Resend' | 'Postmark' | 'SES';
  apiKeyDisplay: string;
  fromEmail: string;
  fromName: string;
};

type EmailTemplate = {
  code: string;
  name: string;
  consumer: string;
  subject: string;
  active: boolean;
};

type TestSendInput = {
  provider: EmailProviderSettings['provider'];
  fromEmail: string;
  fromName: string;
};

type TestSendResult = { ok: true; message_id: string } | { ok: false; error: string };

type EmailTemplatesPageProps = {
  params?: Promise<{ locale: string }>;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  providerSettings?: EmailProviderSettings;
  templates?: EmailTemplate[];
  testSend?: (input: TestSendInput) => Promise<TestSendResult>;
};

type EmailTemplatesPage = (props: EmailTemplatesPageProps) => React.ReactNode | Promise<React.ReactNode>;

const providerSettings: EmailProviderSettings = {
  provider: 'Resend',
  apiKeyDisplay: 'sk_live_plaintext_must_not_render',
  fromEmail: 'no-reply@monopilot.apex.pl',
  fromName: 'Apex Foods · Monopilot',
};

const templates: EmailTemplate[] = [
  {
    code: 'po_to_supplier',
    name: 'Purchase order → supplier',
    consumer: 'Planning',
    subject: 'PO {{po_number}} for {{supplier_email}}',
    active: true,
  },
  {
    code: 'qa_hold_created',
    name: 'Quality hold created',
    consumer: 'QA',
    subject: 'Hold {{hold_code}} requires QA review',
    active: false,
  },
];

function routeCandidates(pathSuffix: string) {
  return [join(process.cwd(), pathSuffix), join(process.cwd(), pathSuffix.replace(/^apps\/web\//, ''))];
}

async function loadEmailTemplatesPage(): Promise<EmailTemplatesPage> {
  try {
    const pageModulePath = './' + 'page';
    const mod = (await import(/* @vite-ignore */ pageModulePath)) as { default?: EmailTemplatesPage };
    expect(
      mod.default,
      'SET-090 email templates page must default-export a renderable Server Component at app/[locale]/(app)/(admin)/settings/email/page.tsx',
    ).toEqual(expect.any(Function));
    return mod.default as EmailTemplatesPage;
  } catch (error) {
    const pageExists = routeCandidates('apps/web/app/[locale]/(app)/(admin)/settings/email/page.tsx').some((candidate) =>
      existsSync(candidate),
    );
    if (pageExists) {
      throw error;
    }
    return function MissingEmailTemplatesPage() {
      return <main data-testid="missing-email-templates-page" />;
    };
  }
}

async function renderEmailTemplatesPage(overrides: Partial<EmailTemplatesPageProps> = {}) {
  const Page = await loadEmailTemplatesPage();
  const props: EmailTemplatesPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    state: 'ready',
    providerSettings,
    templates,
    testSend: vi.fn(async (_input: TestSendInput): Promise<TestSendResult> => ({ ok: true, message_id: 'msg_red_123' })),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(<>{node}</>) };
}

async function renderEmailTemplatesPageWithoutInjectedData() {
  const Page = await loadEmailTemplatesPage();
  const node = await Page({ params: Promise.resolve({ locale: 'en' }) });
  return render(<>{node}</>);
}

function screenRoot() {
  return screen.getByTestId('settings-email-templates-screen');
}

function structuralSnapshot() {
  const root = screenRoot();
  return {
    prototypeSource: root.getAttribute('data-prototype-source'),
    route: root.getAttribute('data-route'),
    screen: root.getAttribute('data-screen'),
    regions: Array.from(root.querySelectorAll<HTMLElement>('[data-region]')).map((region) =>
      region.getAttribute('data-region'),
    ),
    sections: within(root)
      .getAllByTestId('settings-email-section')
      .map((section) => within(section).getByRole('heading', { level: 2 }).textContent),
    tableHeaders: within(root).getAllByRole('columnheader').map((header) => header.textContent),
    providerLabels: Array.from(root.querySelectorAll<HTMLElement>('[data-testid="settings-email-provider-row"]')).map(
      (row) => row.getAttribute('data-label'),
    ),
    templateCodes: within(root)
      .getAllByTestId('settings-email-template-row')
      .map((row) => within(row).getByTestId('settings-email-template-code').textContent),
  };
}

function assertModalA11y(dialog: HTMLElement, name: RegExp) {
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveAccessibleName(name);
  expect(within(dialog).getByRole('button', { name: /close|cancel/i })).toBeInTheDocument();
}

describe('SET-090 email templates localized AppShell route contract', () => {
  it('defines the user-visible /en/settings/email route under the AppShell route group', () => {
    const canonicalRouteCandidates = routeCandidates('apps/web/app/[locale]/(app)/(admin)/settings/email/page.tsx');
    const legacyRouteCandidates = routeCandidates('apps/web/app/[locale]/(admin)/settings/email/page.tsx');

    expect(
      canonicalRouteCandidates.some((candidate) => existsSync(candidate)),
      'SET-090 must implement /en/settings/email under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(
      legacyRouteCandidates.some((candidate) => existsSync(candidate)),
      'Legacy body-only settings route must not be the only email templates implementation',
    ).toBe(false);
  });
});

describe('SET-090 email_templates_screen prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/email');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders provider and templates regions with shadcn primitives, empty password value, and RTL structural parity snapshot', async () => {
    await renderEmailTemplatesPage();

    const root = screenRoot();
    expect(root).toHaveAttribute('data-route', '/settings/email');
    expect(root).toHaveAttribute('data-screen', 'email_templates_screen');
    expect(root).toHaveAttribute(
      'data-prototype-source',
      'prototypes/design/Monopilot Design System/settings/admin-screens.jsx:626-673',
    );
    expect(screen.getByRole('heading', { name: /^Email templates$/i })).toBeInTheDocument();
    expect(screen.getByText(/trigger-driven transactional templates consumed by planning, shipping, qa/i)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /test send/i })).toHaveAttribute('data-slot', 'button');
    expect(screen.getByRole('button', { name: /\+ new template/i })).toHaveAttribute('data-slot', 'button');
    expect(screen.getByRole('combobox', { name: /^provider$/i })).toHaveAttribute('data-slot', 'select-trigger');
    expect(root.querySelectorAll('select')).toHaveLength(0);

    const apiKey = screen.getByLabelText(/^API key$/i) as HTMLInputElement;
    expect(apiKey).toHaveAttribute('type', 'password');
    expect(apiKey).toHaveValue('');
    expect(apiKey.value).not.toContain('sk_live_plaintext_must_not_render');
    expect(apiKey.value).not.toContain('●');
    expect(screen.getByRole('button', { name: /^Rotate$/i })).toHaveAttribute('data-slot', 'button');
    expect(screen.getByRole('textbox', { name: /from email/i })).toHaveAttribute('type', 'email');
    expect(screen.getByRole('textbox', { name: /from name/i })).toHaveValue('Apex Foods · Monopilot');

    const table = screen.getByRole('table', { name: /templates/i });
    expect(table).toHaveAttribute('data-slot', 'table');
    for (const header of ['Trigger code', 'Name', 'Consumer', 'Subject preview', 'Active', '']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    expect(within(table).getByRole('row', { name: /po_to_supplier purchase order → supplier planning/i })).toBeInTheDocument();
    expect(screen.getByText('active')).toHaveAttribute('data-slot', 'badge');
    expect(screen.getByText('off')).toHaveAttribute('data-slot', 'badge');
    expect(screen.getByText(/variables reference/i)).toHaveAttribute('role', 'note');

    expect(structuralSnapshot()).toMatchInlineSnapshot(`
      {
        "prototypeSource": "prototypes/design/Monopilot Design System/settings/admin-screens.jsx:626-673",
        "providerLabels": [
          "Provider",
          "API key",
          "From email",
          "From name",
        ],
        "regions": [
          "page-head",
          "provider-section",
          "templates-section",
          "variables-reference",
        ],
        "route": "/settings/email",
        "screen": "email_templates_screen",
        "sections": [
          "Provider",
          "Templates (2)",
        ],
        "tableHeaders": [
          "Trigger code",
          "Name",
          "Consumer",
          "Subject preview",
          "Active",
          "",
        ],
        "templateCodes": [
          "po_to_supplier",
          "qa_hold_created",
        ],
      }
    `);
  });

  it('does not render Apex/no-reply provider settings or sample templates when no live email loader data is injected', async () => {
    await renderEmailTemplatesPageWithoutInjectedData();

    expect(document.body).not.toHaveTextContent(/Apex|no-reply@monopilot\.apex\.pl|po_to_supplier|qa_hold_created/i);
    expect(
      screen.queryAllByTestId('settings-email-template-row'),
      'Default production render must be live-loader backed or an explicit placeholder; it must not fabricate email template rows.',
    ).toHaveLength(0);
    expect(document.body).toHaveTextContent(/loading|no email templates|not configured|unavailable|placeholder|live data/i);
  });

  it('preserves prototype keyboard focus order and opens SM-04 from New/Edit template triggers', async () => {
    const user = userEvent.setup();
    await renderEmailTemplatesPage();

    await user.tab();
    expect(screen.getByRole('button', { name: /test send/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /\+ new template/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('combobox', { name: /^provider$/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText(/^API key$/i)).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /^Rotate$/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: /from email/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: /from name/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /edit po_to_supplier|edit/i })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: /\+ new template/i }));

    const newDialog = await screen.findByRole('dialog', { name: /new email template/i });
    expect(newDialog).toHaveAttribute('data-modal-id', 'SM-04');
    expect(newDialog).toHaveAttribute('data-focus-trap', 'radix-dialog');
    assertModalA11y(newDialog, /new email template/i);

    await user.click(within(newDialog).getByRole('button', { name: /close|cancel/i }));
    await user.click(screen.getByRole('button', { name: /edit po_to_supplier|edit/i }));
    const editDialog = await screen.findByRole('dialog', { name: /edit template.*po_to_supplier/i });
    expect(editDialog).toHaveAttribute('data-modal-id', 'SM-04');
    assertModalA11y(editDialog, /edit template.*po_to_supplier/i);
  });

  it("calls the Test send action with provider settings and shows the required success toast with message_id", async () => {
    const user = userEvent.setup();
    const testSend = vi.fn(async (): Promise<TestSendResult> => ({ ok: true, message_id: 'msg_probe_456' }));
    await renderEmailTemplatesPage({ testSend });

    await user.click(screen.getByRole('button', { name: /test send/i }));

    expect(testSend).toHaveBeenCalledTimes(1);
    expect(testSend).toHaveBeenCalledWith({
      provider: 'Resend',
      fromEmail: 'no-reply@monopilot.apex.pl',
      fromName: 'Apex Foods · Monopilot',
    });
    expect(await screen.findByText('Probe sent — message_id msg_probe_456')).toHaveAttribute('role', 'status');
  });

  it('fail-closes the default Test send control when no reviewed mail backend action is wired', async () => {
    const user = userEvent.setup();
    await renderEmailTemplatesPage({ testSend: undefined });

    const trigger = screen.getByRole('button', { name: /test send/i });
    expect(
      trigger,
      'Default production email test-send must be disabled unless a reviewed provider backend is wired; ok:true with message_id=not_configured must never surface as success.',
    ).toBeDisabled();
    expect(screenRoot()).toHaveTextContent(/not configured|coming soon|email test send unavailable/i);

    await user.click(trigger);
    expect(screen.queryByText(/probe sent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not_configured/i)).not.toBeInTheDocument();
  });

  it('renders loading, empty, and error states loudly for email template data', async () => {
    await renderEmailTemplatesPage({ state: 'loading', templates: [] });
    expect(screen.getByRole('status', { name: /loading email templates/i })).toBeInTheDocument();
    cleanup();

    await renderEmailTemplatesPage({ state: 'empty', templates: [] });
    expect(screen.getByRole('heading', { name: /no email templates yet/i })).toBeInTheDocument();
    expect(screen.getByText(/customize the emails monopilot sends/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new template/i })).toHaveAttribute('data-slot', 'button');
    cleanup();

    await renderEmailTemplatesPage({ state: 'error', templates: [] });
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load email template settings/i);
  });
});
