/**
 * @vitest-environment jsdom
 * T-060 / SET-012 — Security screen
 *
 * RED phase: these RTL tests specify the production security_screen behavior from
 * prototypes/design/Monopilot Design System/settings/access-screens.jsx:154-239.
 * Missing production page modules render an empty placeholder so RED reports
 * behavior assertion failures instead of module-resolution noise.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertModalA11y } from '../../../../../../packages/ui/test/assertModalA11y';

type SecurityAuditTableName =
  | 'org_security_policies'
  | 'org_sso_config'
  | 'scim_tokens'
  | 'admin_ip_allowlist'
  | 'users';

type SecurityAuditRow = {
  id: string;
  createdAt: string;
  actorName: string;
  action: string;
  tableName: SecurityAuditTableName;
  ipAddress: string | null;
};

type SecurityPageProps = {
  policy: {
    mfaRequirement: 'required_admins' | 'required_all' | 'optional' | 'disabled';
    mfaAllowedMethods: Array<'totp' | 'sms' | 'webauthn'>;
    passwordMinLength: number;
    passwordComplexity: 'basic' | 'standard' | 'strong' | 'custom';
    passwordExpiryDays: number | null;
    passwordHistoryCount: number;
    sessionIdleTimeoutMinutes: number;
    sessionMaxLengthMinutes: number;
  };
  sso: {
    providerName: string;
    tenantDomain: string;
    connected: boolean;
    metadataConfigured: boolean;
    enforceForNonAdmins: boolean;
    scimProvisioning: boolean;
  };
  ipAllowlist: Array<{ id: string; label: string; cidr: string }>;
  auditLogRows: SecurityAuditRow[];
  canManageSecurity: boolean;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission-denied';
  saveSecurity: ReturnType<typeof vi.fn>;
};

type SecurityPage = (props: SecurityPageProps) => React.ReactNode | Promise<React.ReactNode>;

const securityAuditTables = [
  'org_security_policies',
  'org_sso_config',
  'scim_tokens',
  'admin_ip_allowlist',
] as const;

const auditRows: SecurityAuditRow[] = [
  {
    id: 'audit-user-noise',
    createdAt: '2026-05-19 09:30',
    actorName: 'User Admin',
    action: 'Updated user directory',
    tableName: 'users',
    ipAddress: '203.0.113.99',
  },
  {
    id: 'audit-sso',
    createdAt: '2026-05-19 09:20',
    actorName: 'Ada Admin',
    action: 'Enabled SSO enforcement',
    tableName: 'org_sso_config',
    ipAddress: '203.0.113.10',
  },
  {
    id: 'audit-policy',
    createdAt: '2026-05-19 09:10',
    actorName: 'Ada Admin',
    action: 'Updated password policy',
    tableName: 'org_security_policies',
    ipAddress: '203.0.113.10',
  },
  {
    id: 'audit-scim',
    createdAt: '2026-05-19 08:55',
    actorName: 'System',
    action: 'Rotated SCIM token',
    tableName: 'scim_tokens',
    ipAddress: null,
  },
  {
    id: 'audit-ip-add',
    createdAt: '2026-05-19 08:45',
    actorName: 'Olek Owner',
    action: 'Added admin IP range',
    tableName: 'admin_ip_allowlist',
    ipAddress: '198.51.100.42',
  },
  {
    id: 'audit-ip-remove',
    createdAt: '2026-05-19 08:30',
    actorName: 'Olek Owner',
    action: 'Removed admin IP range',
    tableName: 'admin_ip_allowlist',
    ipAddress: '198.51.100.42',
  },
];

async function loadSecurityPage(): Promise<SecurityPage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-012 security page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as SecurityPage;
  } catch {
    return function MissingSecurityPage() {
      return React.createElement('main', { 'data-testid': 'missing-security-page' });
    };
  }
}

async function renderSecurityPage(overrides: Partial<SecurityPageProps> = {}) {
  const Page = await loadSecurityPage();
  const props: SecurityPageProps = {
    policy: {
      mfaRequirement: 'required_admins',
      mfaAllowedMethods: ['totp', 'sms'],
      passwordMinLength: 12,
      passwordComplexity: 'strong',
      passwordExpiryDays: null,
      passwordHistoryCount: 5,
      sessionIdleTimeoutMinutes: 60,
      sessionMaxLengthMinutes: 480,
    },
    sso: {
      providerName: 'Microsoft Entra ID',
      tenantDomain: 'apex.onmicrosoft.com',
      connected: true,
      metadataConfigured: true,
      enforceForNonAdmins: false,
      scimProvisioning: true,
    },
    ipAllowlist: [],
    auditLogRows: auditRows,
    canManageSecurity: true,
    state: 'ready',
    saveSecurity: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(props);
    return { props, ...render(React.createElement(React.Fragment, null, node)) };
  }

  return { props, ...render(React.createElement(Page as React.ComponentType<SecurityPageProps>, props)) };
}

function sectionSummary() {
  return {
    headings: screen.getAllByRole('heading').map((heading) => heading.textContent),
    regions: screen.getAllByRole('region').map((region) => region.getAttribute('aria-label')),
    auditHeaders: within(screen.getByRole('table', { name: /audit log/i }))
      .getAllByRole('columnheader')
      .map((header) => header.textContent),
  };
}

describe('SET-012 security_screen prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the prototype sections, fields, shadcn primitives, modal trigger, and keyboard order', async () => {
    const user = userEvent.setup();
    const { container } = await renderSecurityPage();

    expect(screen.getByRole('heading', { name: /^security$/i })).toBeInTheDocument();
    expect(screen.getByText(/authentication, session, and password policy/i)).toBeInTheDocument();

    expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual([
      'Two-factor authentication',
      'Single Sign-On (SSO)',
      'Password policy',
      'Session',
      'Audit log',
    ]);

    expect(screen.getByRole('switch', { name: /enforce 2fa for admins/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: /enforce 2fa for all users/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('checkbox', { name: /authenticator app \(totp\)/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^sms$/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /hardware key \(webauthn\)/i })).toBeDisabled();

    const ssoRegion = screen.getByRole('region', { name: /single sign-on \(sso\)/i });
    expect(within(ssoRegion).getByText(/connected/i)).toHaveAttribute('data-slot', 'badge');
    expect(within(ssoRegion).getByText('Microsoft Entra ID')).toBeInTheDocument();
    expect(within(ssoRegion).getByText('apex.onmicrosoft.com')).toBeInTheDocument();
    expect(within(ssoRegion).getByRole('switch', { name: /enforce sso/i })).toHaveAttribute('aria-checked', 'false');
    expect(within(ssoRegion).getByRole('switch', { name: /scim provisioning/i })).toHaveAttribute('aria-checked', 'true');

    expect(screen.getByRole('spinbutton', { name: /minimum length/i })).toHaveValue(12);
    expect(screen.getByRole('spinbutton', { name: /minimum length/i }).closest('[data-slot="input"]')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /complexity/i }).closest('[data-slot="select-trigger"], [data-slot="select"]')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /password expires/i }).closest('[data-slot="select-trigger"], [data-slot="select"]')).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: /block reuse of last n passwords/i })).toHaveValue(5);
    expect(screen.getByRole('combobox', { name: /idle timeout/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /maximum session length/i })).toBeInTheDocument();
    expect(container.querySelectorAll('select')).toHaveLength(0);
    expect(container.querySelectorAll('[data-slot="card"]').length).toBeGreaterThanOrEqual(5);
    expect(container.querySelectorAll('[data-slot="switch"]').length).toBeGreaterThanOrEqual(4);

    await user.click(screen.getByRole('button', { name: /add range/i }));
    const dialog = await screen.findByRole('dialog', { name: /add ip range|admin ip allowlist/i });
    expect(dialog).toHaveAttribute('data-modal-id', 'SM-12');
    expect(within(dialog).getByRole('textbox', { name: /cidr/i })).toBeInTheDocument();
    await assertModalA11y(container);

    await user.tab();
    expect(screen.getByRole('switch', { name: /enforce 2fa for admins/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('switch', { name: /enforce 2fa for all users/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('checkbox', { name: /authenticator app \(totp\)/i })).toHaveFocus();

    expect(sectionSummary()).toMatchInlineSnapshot(`
      {
        "auditHeaders": [
          "When",
          "Who",
          "Action",
          "IP",
        ],
        "headings": [
          "Security",
          "Two-factor authentication",
          "Single Sign-On (SSO)",
          "Password policy",
          "Session",
          "Audit log",
        ],
        "regions": [
          "Two-factor authentication",
          "Single Sign-On (SSO)",
          "Password policy",
          "Session",
          "Audit log",
        ],
      }
    `);
  });

  it('renders loading, empty, error, and permission-denied states without silently skipping invariants', async () => {
    await renderSecurityPage({ state: 'loading' });
    expect(screen.getByTestId('settings-security-loading')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /enforce sso/i })).not.toBeInTheDocument();

    cleanup();
    await renderSecurityPage({ state: 'empty', auditLogRows: [], ipAllowlist: [] });
    expect(screen.getByRole('status')).toHaveTextContent(/security settings have not been configured/i);
    expect(screen.getByRole('button', { name: /add range/i })).toBeEnabled();

    cleanup();
    await renderSecurityPage({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(/security settings could not be loaded/i);

    cleanup();
    await renderSecurityPage({ state: 'permission-denied', canManageSecurity: false });
    expect(screen.getByRole('alert')).toHaveTextContent(/settings\.security\.manage/i);
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add range/i })).not.toBeInTheDocument();
  });
});

describe('SET-012 SSO metadata validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('surfaces METADATA_REQUIRED inline and rolls Enforce SSO back off when metadata is missing', async () => {
    const user = userEvent.setup();
    const saveSecurity = vi.fn().mockResolvedValue({ ok: false, error: 'METADATA_REQUIRED', field: 'sso.enabled' });
    await renderSecurityPage({
      saveSecurity,
      sso: {
        providerName: 'Microsoft Entra ID',
        tenantDomain: 'apex.onmicrosoft.com',
        connected: false,
        metadataConfigured: false,
        enforceForNonAdmins: false,
        scimProvisioning: false,
      },
    });

    const ssoRegion = screen.getByRole('region', { name: /single sign-on \(sso\)/i });
    const enforceSso = within(ssoRegion).getByRole('switch', { name: /enforce sso/i });
    expect(enforceSso).toHaveAttribute('aria-checked', 'false');

    await user.click(enforceSso);
    expect(enforceSso).toHaveAttribute('aria-checked', 'true');
    await user.click(within(ssoRegion).getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(saveSecurity).toHaveBeenCalledTimes(1));
    expect(saveSecurity).toHaveBeenCalledWith(
      expect.objectContaining({
        sso: expect.objectContaining({ enforceForNonAdmins: true }),
      }),
    );
    expect(await within(ssoRegion).findByText(/METADATA_REQUIRED/i)).toBeInTheDocument();
    expect(enforceSso).toHaveAttribute('aria-checked', 'false');
  });
});

describe('SET-012 security audit log preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows only the last five security-scoped audit_log rows and excludes other table_names', async () => {
    await renderSecurityPage({ auditLogRows: auditRows });

    const auditTable = screen.getByRole('table', { name: /audit log/i });
    const rows = within(auditTable).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);

    expect(within(auditTable).queryByText(/updated user directory/i)).not.toBeInTheDocument();
    expect(rows.map((row) => within(row).getAllByRole('cell')[2]?.textContent)).toEqual([
      'Enabled SSO enforcement',
      'Updated password policy',
      'Rotated SCIM token',
      'Added admin IP range',
      'Removed admin IP range',
    ]);
    expect(rows.map((row) => row.getAttribute('data-table-name'))).toEqual([
      'org_sso_config',
      'org_security_policies',
      'scim_tokens',
      'admin_ip_allowlist',
      'admin_ip_allowlist',
    ]);
    for (const row of rows) {
      expect(securityAuditTables).toContain(row.getAttribute('data-table-name'));
    }
  });
});
