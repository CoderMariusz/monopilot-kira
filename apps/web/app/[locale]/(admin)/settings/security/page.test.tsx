/**
 * @vitest-environment jsdom
 * T-060 / SET-012 — Security screen
 *
 * RED phase: these RTL tests specify the security_screen production behavior from
 * prototypes/design/Monopilot Design System/settings/access-screens.jsx:154-239.
 * Missing production modules render as an empty placeholder so RED reports behavior
 * assertion failures instead of module-resolution noise.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type AuditLogRow = {
  id: string;
  occurredAt: string;
  actorName: string;
  action: string;
  ipAddress: string | null;
  tableName: string;
};

type SecurityScreenData = {
  twoFactor: {
    enforceAdmins: boolean;
    enforceAllUsers: boolean;
    allowedMethods: string[];
  };
  sso: {
    connected: boolean;
    providerName: string;
    providerTenant: string;
    enforceSso: boolean;
    metadataConfigured: boolean;
  };
  scim: { enabled: boolean };
  passwordPolicy: {
    minimumLength: number;
    complexity: 'strong' | 'medium' | 'basic';
    expires: 'never' | '90' | '180';
    blockReuseCount: number;
  };
  sessionPolicy: {
    idleTimeout: '15' | '30' | '60' | '4h' | 'never';
    maximumSessionLength: '4h' | '8h' | '12h' | '24h';
  };
  ipAllowlist: string[];
  auditLog: AuditLogRow[];
};

type SaveSecuritySettings = ReturnType<typeof vi.fn>;

type SecurityPageProps = {
  data: SecurityScreenData;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  canManageSecurity: boolean;
  saveSecuritySettings: SaveSecuritySettings;
};

type SecurityPage = (props: SecurityPageProps) => React.ReactNode | Promise<React.ReactNode>;

const securityAuditTables = [
  'org_security_policies',
  'org_sso_config',
  'scim_tokens',
  'admin_ip_allowlist',
] as const;

const data: SecurityScreenData = {
  twoFactor: {
    enforceAdmins: true,
    enforceAllUsers: false,
    allowedMethods: ['totp', 'sms'],
  },
  sso: {
    connected: true,
    providerName: 'Microsoft Entra ID',
    providerTenant: 'apex.onmicrosoft.com',
    enforceSso: false,
    metadataConfigured: false,
  },
  scim: { enabled: true },
  passwordPolicy: {
    minimumLength: 12,
    complexity: 'strong',
    expires: 'never',
    blockReuseCount: 5,
  },
  sessionPolicy: {
    idleTimeout: '60',
    maximumSessionLength: '8h',
  },
  ipAllowlist: [],
  auditLog: [
    {
      id: 'audit-06',
      occurredAt: '2026-05-20 15:01',
      actorName: 'Ops Admin',
      action: 'Added admin IP range 10.0.0.0/24',
      ipAddress: '192.168.1.42',
      tableName: 'admin_ip_allowlist',
    },
    {
      id: 'audit-05',
      occurredAt: '2026-05-20 14:54',
      actorName: 'System',
      action: 'Rotated SCIM token',
      ipAddress: null,
      tableName: 'scim_tokens',
    },
    {
      id: 'audit-04',
      occurredAt: '2026-05-20 14:31',
      actorName: 'A. Zając',
      action: 'Enabled SSO enforcement',
      ipAddress: '10.0.0.55',
      tableName: 'org_sso_config',
    },
    {
      id: 'audit-03',
      occurredAt: '2026-05-20 14:02',
      actorName: 'K. Nowak',
      action: 'Changed password policy',
      ipAddress: '192.168.1.42',
      tableName: 'org_security_policies',
    },
    {
      id: 'audit-02',
      occurredAt: '2026-05-20 13:45',
      actorName: 'K. Nowak',
      action: 'Disabled SMS 2FA method',
      ipAddress: '192.168.1.42',
      tableName: 'org_security_policies',
    },
    {
      id: 'audit-01',
      occurredAt: '2026-05-20 13:01',
      actorName: 'K. Nowak',
      action: 'Updated permission matrix',
      ipAddress: '192.168.1.42',
      tableName: 'role_permissions',
    },
  ],
};

async function loadSecurityPage(): Promise<SecurityPage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-012 page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as SecurityPage;
  } catch (error) {
    throw error;
  }
}

async function renderSecurity(overrides: Partial<SecurityPageProps> = {}) {
  const Page = await loadSecurityPage();
  const props: SecurityPageProps = {
    data,
    state: 'ready',
    canManageSecurity: true,
    saveSecuritySettings: vi.fn().mockResolvedValue({ ok: true, data }),
    ...overrides,
  };

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(props);
    return { props, ...render(React.createElement(React.Fragment, null, node)) };
  }

  return {
    props,
    ...render(React.createElement(Page as React.ComponentType<SecurityPageProps>, props)),
  };
}

function regions() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-region]')).map((region) =>
    region.getAttribute('data-region'),
  );
}

function labelTextInOrder() {
  return screen.getAllByTestId('security-setting-row').map((row) => {
    const label = within(row).getByTestId('security-setting-label');
    return label.textContent;
  });
}

function controlsByLabel() {
  return [
    ...screen.queryAllByRole('switch'),
    ...screen.queryAllByRole('checkbox'),
    ...screen.queryAllByRole('spinbutton'),
    ...screen.queryAllByRole('combobox'),
  ].map((element) => element.getAttribute('aria-label') || element.getAttribute('name') || element.id);
}

describe('SET-012 security screen prototype parity', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the prototype regions, labels, shadcn primitives, actions, state affordances, and keyboard order', async () => {
    const user = userEvent.setup();
    const { container } = await renderSecurity();

    expect(screen.getByRole('heading', { name: /security/i })).toBeInTheDocument();
    expect(screen.getByText(/authentication, session, and password policy/i)).toBeInTheDocument();

    expect(regions()).toEqual([
      'page-head',
      'twofa',
      'password-policy',
      'sessions',
      'sso',
      'scim',
      'ip-allowlist',
      'audit-preview',
    ]);

    expect(labelTextInOrder()).toEqual([
      'Enforce 2FA for Admins',
      'Enforce 2FA for all users',
      'Allowed methods',
      'Minimum length',
      'Complexity',
      'Password expires',
      'Block reuse of last N passwords',
      'Idle timeout',
      'Maximum session length',
      'Provider',
      'Enforce SSO',
      'SCIM provisioning',
      'IP allowlist',
    ]);

    const twoFactor = screen.getByRole('region', { name: /two-factor authentication/i });
    expect(within(twoFactor).getByRole('switch', { name: /enforce 2fa for admins/i })).toBeChecked();
    expect(within(twoFactor).getByRole('switch', { name: /enforce 2fa for all users/i })).not.toBeChecked();
    expect(within(twoFactor).getByRole('checkbox', { name: /authenticator app \(totp\)/i })).toBeChecked();
    expect(within(twoFactor).getByRole('checkbox', { name: /sms/i })).toBeChecked();
    const webAuthn = within(twoFactor).getByRole('checkbox', { name: /hardware key \(webauthn\)/i });
    expect(webAuthn).not.toBeChecked();
    expect(webAuthn).toBeDisabled();
    expect(webAuthn).toHaveAttribute('title', 'Coming Phase 3');

    const passwordPolicy = screen.getByRole('region', { name: /password policy/i });
    expect(within(passwordPolicy).getByRole('spinbutton', { name: /minimum length/i })).toHaveValue(12);
    expect(within(passwordPolicy).getByRole('combobox', { name: /complexity/i })).toHaveValue('strong');
    expect(within(passwordPolicy).getByRole('combobox', { name: /password expires/i })).toHaveValue('never');
    expect(within(passwordPolicy).getByRole('spinbutton', { name: /block reuse of last n passwords/i })).toHaveValue(5);

    const sessions = screen.getByRole('region', { name: /^session$/i });
    expect(within(sessions).getByRole('combobox', { name: /idle timeout/i })).toHaveValue('60');
    expect(within(sessions).getByRole('combobox', { name: /maximum session length/i })).toHaveValue('8h');

    const sso = screen.getByRole('region', { name: /single sign-on \(sso\)/i });
    expect(within(sso).getByText(/connected/i)).toBeInTheDocument();
    expect(within(sso).getByText('Microsoft Entra ID')).toBeInTheDocument();
    expect(within(sso).getByText('apex.onmicrosoft.com')).toBeInTheDocument();
    expect(within(sso).getByRole('switch', { name: /enforce sso/i })).not.toBeChecked();

    const scim = screen.getByRole('region', { name: /scim/i });
    expect(within(scim).getByRole('switch', { name: /scim provisioning/i })).toBeChecked();

    const ipAllowlist = screen.getByRole('region', { name: /ip allowlist/i });
    expect(within(ipAllowlist).getByText(/not configured/i)).toBeInTheDocument();
    const addRange = within(ipAllowlist).getByRole('button', { name: /add range/i });
    expect(addRange).toHaveAttribute('data-modal-target', 'SM-IP-ALLOWLIST');
    await act(async () => {
      await user.click(addRange);
    });
    expect(screen.getByRole('dialog', { name: /add ip range/i })).toHaveAttribute('data-modal-id', 'SM-IP-ALLOWLIST');

    expect(container.querySelectorAll('input[data-slot="switch"], input[data-slot="checkbox"], select[data-slot], table[data-slot]').length).toBe(0);
    expect(container.querySelectorAll('[data-slot="input"]').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('button[data-slot="button"]').length).toBeGreaterThanOrEqual(2);

    await user.tab();
    expect(screen.getByRole('switch', { name: /enforce 2fa for admins/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('switch', { name: /enforce 2fa for all users/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('checkbox', { name: /authenticator app \(totp\)/i })).toHaveFocus();

    expect({ regions: regions(), labels: labelTextInOrder(), controls: controlsByLabel() }).toMatchInlineSnapshot(`
      {
        "controls": [
          "Enforce 2FA for Admins",
          "Enforce 2FA for all users",
          "Enforce SSO",
          "SCIM provisioning",
          "Authenticator app (TOTP)",
          "SMS",
          "Hardware key (WebAuthn)",
          "Minimum length",
          "Block reuse of last N passwords",
          "Complexity",
          "Password expires",
          "Idle timeout",
          "Maximum session length",
        ],
        "labels": [
          "Enforce 2FA for Admins",
          "Enforce 2FA for all users",
          "Allowed methods",
          "Minimum length",
          "Complexity",
          "Password expires",
          "Block reuse of last N passwords",
          "Idle timeout",
          "Maximum session length",
          "Provider",
          "Enforce SSO",
          "SCIM provisioning",
          "IP allowlist",
        ],
        "regions": [
          "page-head",
          "twofa",
          "password-policy",
          "sessions",
          "sso",
          "scim",
          "ip-allowlist",
          "audit-preview",
        ],
      }
    `);
  });

  it('surfaces METADATA_REQUIRED inline and rolls Enforce SSO back off when SSO is enabled without metadata', async () => {
    const user = userEvent.setup();
    const saveSecuritySettings = vi.fn().mockResolvedValue({
      ok: false,
      code: 'METADATA_REQUIRED',
      fieldErrors: { enforceSso: 'METADATA_REQUIRED' },
      data: { ...data, sso: { ...data.sso, enforceSso: false } },
    });
    await renderSecurity({ saveSecuritySettings });

    const ssoSwitch = screen.getByRole('switch', { name: /enforce sso/i });
    expect(ssoSwitch).not.toBeChecked();

    await act(async () => {
      await user.click(ssoSwitch);
    });
    expect(ssoSwitch).toBeChecked();
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /save security settings/i }));
    });

    expect(saveSecuritySettings).toHaveBeenCalledWith(
      expect.objectContaining({
        sso: expect.objectContaining({ enforceSso: true, metadataConfigured: false }),
      }),
    );
    expect(await screen.findByText('METADATA_REQUIRED')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /enforce sso/i })).not.toBeChecked();
  });

  it('renders exactly the last 5 security-scoped audit_log rows in descending order', async () => {
    await renderSecurity();

    const auditPreview = screen.getByRole('region', { name: /audit log/i });
    const table = within(auditPreview).getByRole('table', { name: /security audit log preview/i });
    const bodyRows = within(table).getAllByRole('row').slice(1);

    expect(bodyRows).toHaveLength(5);
    expect(bodyRows.map((row) => within(row).getAllByRole('cell')[2]?.textContent)).toEqual([
      'Added admin IP range 10.0.0.0/24',
      'Rotated SCIM token',
      'Enabled SSO enforcement',
      'Changed password policy',
      'Disabled SMS 2FA method',
    ]);
    expect(within(auditPreview).queryByText('Updated permission matrix')).not.toBeInTheDocument();

    for (const row of bodyRows) {
      const tableName = row.getAttribute('data-table-name');
      expect(securityAuditTables).toContain(tableName);
    }
  });
});
