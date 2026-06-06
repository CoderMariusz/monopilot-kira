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

import SecurityScreen, { type SaveSecuritySettings, type SecurityScreenLabels } from './security-screen.client';

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

type TestSaveSecuritySettings = SaveSecuritySettings & ReturnType<typeof vi.fn>;

type SecurityPageProps = {
  data: SecurityScreenData;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  canManageSecurity: boolean;
  saveSecuritySettings: TestSaveSecuritySettings;
};

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

const labels: SecurityScreenLabels = {
  title: 'Security',
  subtitle: 'Authentication, session, and password policy.',
  twoFactorTitle: 'Two-factor authentication',
  twoFactorSub: 'Require 2FA for all users.',
  enforceAdmins: 'Enforce 2FA for Admins',
  enforceAdminsHint: 'Admin accounts must use an authenticator app.',
  enforceAllUsers: 'Enforce 2FA for all users',
  allowedMethods: 'Allowed methods',
  methodTotp: 'Authenticator app (TOTP)',
  methodSms: 'SMS',
  methodWebauthn: 'Hardware key (WebAuthn)',
  webauthnTooltip: 'Coming Phase 3',
  passwordPolicyTitle: 'Password policy',
  minimumLength: 'Minimum length',
  complexity: 'Complexity',
  complexityStrong: 'Strong (upper, lower, number, symbol)',
  complexityMedium: 'Medium (upper, lower, number)',
  complexityBasic: 'Basic (length only)',
  passwordExpires: 'Password expires',
  passwordExpiresHint: 'Force rotation every N days. Not recommended by NIST.',
  expiresNever: 'Never',
  expires90: '90 days',
  expires180: '180 days',
  blockReuse: 'Block reuse of last N passwords',
  sessionTitle: 'Session',
  idleTimeout: 'Idle timeout',
  idleTimeoutHint: 'Log out inactive sessions.',
  maximumSessionLength: 'Maximum session length',
  minutes15: '15 min',
  minutes30: '30 min',
  minutes60: '60 min',
  hours4: '4 h',
  hours8: '8 h',
  hours12: '12 h',
  hours24: '24 h',
  never: 'Never',
  ssoTitle: 'Single Sign-On (SSO)',
  connected: 'Connected',
  provider: 'Provider',
  providerHint: 'SAML 2.0 via Microsoft Entra ID.',
  enforceSso: 'Enforce SSO',
  enforceSsoHint: 'Password login disabled for non-admin users when on.',
  scimTitle: 'SCIM',
  scimProvisioning: 'SCIM provisioning',
  ipAllowlistTitle: 'IP allowlist',
  ipAllowlistHint: 'Restrict admin login to specific IPs or ranges.',
  notConfigured: 'Not configured',
  addRange: '+ Add range',
  addIpRangeTitle: 'Add IP range',
  close: 'Close',
  addIpRangeHelp: 'Add a CIDR range for administrator sign-in.',
  auditLogTitle: 'Audit log',
  viewFullLog: 'View full log →',
  auditTableLabel: 'Security audit log preview',
  auditWhen: 'When',
  auditWho: 'Who',
  auditAction: 'Action',
  auditIp: 'IP',
  auditSystemActor: 'System',
  save: 'Save security settings',
  saving: 'Saving security settings…',
  loadSecurity: 'Security',
  loading: 'Loading security settings…',
  empty: 'No security settings configured yet.',
  error: 'Unable to load security settings.',
  permissionDenied: 'You do not have permission to manage security settings.',
};

async function renderSecurity(overrides: Partial<SecurityPageProps> = {}) {
  const props: SecurityPageProps = {
    data,
    state: 'ready',
    canManageSecurity: true,
    saveSecuritySettings: vi.fn(async (_next: SecurityScreenData) => ({ ok: true as const, data })) as TestSaveSecuritySettings,
    ...overrides,
  };

  return {
    props,
    ...render(React.createElement(SecurityScreen, { ...props, labels })),
  };
}

function regions() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-region]')).map((region) =>
    region.getAttribute('data-region'),
  );
}

function labelTextInOrder() {
  // After the A5 migration the rows render via the shared `.sg-row` primitive
  // (label in `.sg-label`) instead of the old custom `data-testid` grid.
  return Array.from(document.querySelectorAll<HTMLElement>('.sg-row')).map((row) => {
    const label = row.querySelector('.sg-label');
    return label?.textContent ?? null;
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

    // The header now renders via the shared `PageHead` primitive (`.sg-title` /
    // `.sg-sub`) instead of a bare <h1>.
    const pageTitle = container.querySelector('.sg-head .sg-title');
    expect(pageTitle).toHaveTextContent('Security');
    expect(container.querySelector('.sg-head .sg-sub')).toHaveTextContent(
      /authentication, session, and password policy/i,
    );

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
    // Toggles are the design-system `.sg-toggle` slider (native checkbox input),
    // not the shadcn `Switch` — so they expose role="checkbox".
    expect(within(twoFactor).getByRole('checkbox', { name: /enforce 2fa for admins/i })).toBeChecked();
    expect(within(twoFactor).getByRole('checkbox', { name: /enforce 2fa for all users/i })).not.toBeChecked();
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
    expect(within(sso).getByRole('checkbox', { name: /enforce sso/i })).not.toBeChecked();

    const scim = screen.getByRole('region', { name: /scim/i });
    expect(within(scim).getByRole('checkbox', { name: /scim provisioning/i })).toBeChecked();

    const ipAllowlist = screen.getByRole('region', { name: /ip allowlist/i });
    expect(within(ipAllowlist).getByText(/not configured/i)).toBeInTheDocument();
    const addRange = within(ipAllowlist).getByRole('button', { name: /add range/i });
    expect(addRange).toHaveAttribute('data-modal-target', 'SM-IP-ALLOWLIST');
    await act(async () => {
      await user.click(addRange);
    });
    expect(screen.getByRole('dialog', { name: /add ip range/i })).toHaveAttribute('data-modal-id', 'SM-IP-ALLOWLIST');

    // The four boolean toggles now use the `.sg-toggle` slider (native checkbox
    // input inside `label.sg-toggle`), NOT the shadcn `Switch`. The three 2FA
    // "allowed methods" are still shadcn `Checkbox` buttons. So checkbox-role =
    // 4 toggles + 3 method checkboxes.
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(container.querySelectorAll('button[data-slot="switch"]').length).toBe(0);

    const toggleInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('label.sg-toggle > input[type="checkbox"]'),
    );
    expect(toggleInputs).toHaveLength(4);
    expect(
      toggleInputs.map((input) => input.getAttribute('aria-label')),
    ).toEqual([
      'Enforce 2FA for Admins',
      'Enforce 2FA for all users',
      'Enforce SSO',
      'SCIM provisioning',
    ]);
    // Each `.sg-toggle` carries the slider span the ported CSS drives.
    expect(container.querySelectorAll('label.sg-toggle > span.slider').length).toBe(4);

    const checkboxControls = screen.getAllByRole('checkbox');
    // 4 toggle inputs + 3 shadcn method checkboxes.
    expect(checkboxControls).toHaveLength(7);
    const methodCheckboxes = checkboxControls.filter((control) =>
      control.matches('button[data-slot="checkbox"]'),
    );
    expect(methodCheckboxes).toHaveLength(3);

    const selectControls = screen.getAllByRole('combobox');
    expect(selectControls).toHaveLength(4);
    expect(selectControls.every((control) => control.matches('button[data-slot="select-trigger"]'))).toBe(true);
    expect(container.querySelectorAll('[data-slot="select"]').length).toBe(4);
    expect(container.querySelectorAll('select').length).toBe(0);

    // Number fields are native inputs (the `.sg-field` CSS caps width); no shadcn Input slot.
    expect(container.querySelectorAll('input[type="number"]').length).toBe(2);
    expect(container.querySelectorAll('button[data-slot="button"]').length).toBeGreaterThanOrEqual(2);

    // Rows render via the shared design-system primitives.
    expect(container.querySelectorAll('.sg-section').length).toBeGreaterThanOrEqual(7);
    expect(container.querySelectorAll('.sg-section-foot').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('.sg-row').length).toBe(13);

    await user.tab();
    expect(toggleInputs[0]).toHaveFocus();
    await user.tab();
    expect(toggleInputs[1]).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('checkbox', { name: /authenticator app \(totp\)/i })).toHaveFocus();

    expect({ regions: regions(), labels: labelTextInOrder(), controls: controlsByLabel() }).toMatchInlineSnapshot(`
      {
        "controls": [
          "Enforce 2FA for Admins",
          "Enforce 2FA for all users",
          "Authenticator app (TOTP)",
          "SMS",
          "Hardware key (WebAuthn)",
          "Enforce SSO",
          "SCIM provisioning",
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
    const saveSecuritySettings = vi.fn(async (_next: SecurityScreenData) => ({
      ok: false as const,
      code: 'METADATA_REQUIRED',
      fieldErrors: { enforceSso: 'METADATA_REQUIRED' },
      data: { ...data, sso: { ...data.sso, enforceSso: false } },
    })) as TestSaveSecuritySettings;
    await renderSecurity({ saveSecuritySettings });

    // Enforce SSO is now a `.sg-toggle` slider (native checkbox), not a Switch.
    const ssoToggle = screen.getByRole('checkbox', { name: /enforce sso/i });
    expect(ssoToggle).not.toBeChecked();

    await act(async () => {
      await user.click(ssoToggle);
    });
    expect(ssoToggle).toBeChecked();
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /save security settings/i }));
    });

    expect(saveSecuritySettings).toHaveBeenCalledWith(
      expect.objectContaining({
        sso: expect.objectContaining({ enforceSso: true, metadataConfigured: false }),
      }),
    );
    expect(await screen.findByText('METADATA_REQUIRED')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /enforce sso/i })).not.toBeChecked();
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
