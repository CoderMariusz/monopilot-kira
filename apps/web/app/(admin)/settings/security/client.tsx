'use client';

import React, { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

export type SecurityAuditTableName =
  | 'org_security_policies'
  | 'org_sso_config'
  | 'scim_tokens'
  | 'admin_ip_allowlist'
  | string;

export type SecurityAuditRow = {
  id: string;
  createdAt: string;
  actorName: string;
  action: string;
  tableName: SecurityAuditTableName;
  ipAddress: string | null;
};

export type SecurityPolicy = {
  mfaRequirement: 'required_admins' | 'required_all' | 'optional' | 'disabled';
  mfaAllowedMethods: Array<'totp' | 'sms' | 'webauthn'>;
  passwordMinLength: number;
  passwordComplexity: 'basic' | 'standard' | 'strong' | 'custom';
  passwordExpiryDays: number | null;
  passwordHistoryCount: number;
  sessionIdleTimeoutMinutes: number;
  sessionMaxLengthMinutes: number;
};

export type SsoConfig = {
  providerName: string;
  tenantDomain: string;
  connected: boolean;
  metadataConfigured: boolean;
  enforceForNonAdmins: boolean;
  scimProvisioning: boolean;
};

export type SecurityPageProps = {
  policy: SecurityPolicy;
  sso: SsoConfig;
  ipAllowlist: Array<{ id: string; label: string; cidr: string }>;
  auditLogRows: SecurityAuditRow[];
  canManageSecurity: boolean;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission-denied';
  saveSecurity: (input: unknown) => Promise<unknown> | unknown;
};

type SaveResult = { ok?: boolean; error?: string; field?: string } | void;

const securityAuditTables = new Set(['org_security_policies', 'org_sso_config', 'scim_tokens', 'admin_ip_allowlist']);
const defaultPolicy: SecurityPolicy = {
  mfaRequirement: 'required_admins',
  mfaAllowedMethods: ['totp'],
  passwordMinLength: 12,
  passwordComplexity: 'strong',
  passwordExpiryDays: null,
  passwordHistoryCount: 5,
  sessionIdleTimeoutMinutes: 60,
  sessionMaxLengthMinutes: 480,
};
const defaultSso: SsoConfig = {
  providerName: 'Microsoft Entra ID',
  tenantDomain: 'apex.onmicrosoft.com',
  connected: false,
  metadataConfigured: false,
  enforceForNonAdmins: false,
  scimProvisioning: false,
};

function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: string }) {
  return (
    <span data-slot="badge" data-tone={tone} className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
      {children}
    </span>
  );
}

function SelectTrigger({ label, value }: { label: string; value: string }) {
  return (
    <button
      type="button"
      role="combobox"
      aria-expanded="false"
      aria-label={label}
      data-slot="select-trigger"
      className="inline-flex min-w-36 items-center justify-between rounded-md border px-2 py-1 text-sm"
    >
      <span>{value}</span>
      <span aria-hidden="true">⌄</span>
    </button>
  );
}

function Switch({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange?: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-slot="switch"
      className="inline-flex h-6 w-11 items-center rounded-full border px-0.5 data-[checked=true]:bg-blue-600"
      data-checked={checked ? 'true' : 'false'}
      onClick={() => onChange?.(!checked)}
    >
      <span
        aria-hidden="true"
        className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

function Section({ title, sub, action, children }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section role="region" aria-label={title} data-slot="card" className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {sub ? <p className="mt-1 text-sm text-slate-500">{sub}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="divide-y px-5">{children}</div>
    </section>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[220px_1fr] gap-4 py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </div>
      <div className="flex items-center justify-start gap-3">{children}</div>
    </div>
  );
}

function MethodCheckbox({ id, label, checked, disabled }: { id: string; label: string; checked: boolean; disabled?: boolean }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input id={id} type="checkbox" defaultChecked={checked} disabled={disabled} className="h-4 w-4 rounded border" />
      {label}
    </label>
  );
}

function AddIpRangeDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const cidrId = useId();
  const labelId = useId();

  return (
    <>
      <span data-radix-focus-guard tabIndex={0} aria-hidden="true" />
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40" onMouseDown={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-focus-trap="radix-dialog"
          data-modal-id="SM-12"
          className="w-full max-w-lg rounded-xl bg-white shadow-2xl"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <div id={titleId} className="text-base font-semibold">
                Add IP range
              </div>
              <p className="mt-1 text-sm text-slate-500">Admin IP allowlist</p>
            </div>
            <Button type="button" aria-label="Close IP range dialog" onClick={onClose}>
              ✕
            </Button>
          </div>
          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1">
              <label htmlFor={cidrId} className="text-sm font-medium">
                CIDR
              </label>
              <Input id={cidrId} placeholder="203.0.113.0/24" />
            </div>
            <div className="space-y-1">
              <label htmlFor={labelId} className="text-sm font-medium">
                Label
              </label>
              <Input id={labelId} placeholder="Corporate office" />
            </div>
          </div>
          <div className="flex justify-end gap-2 rounded-b-xl border-t bg-slate-50 px-5 py-4">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={onClose}>
              Save range
            </Button>
          </div>
        </div>
      </div>
      <span data-radix-focus-guard tabIndex={0} aria-hidden="true" />
    </>
  );
}

function expiryLabel(days: number | null) {
  if (days === null) return 'Never';
  return `${days} days`;
}

function sessionLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  return `${minutes / 60} h`;
}

function saveResultHasMetadataError(result: SaveResult): result is { ok: false; error: 'METADATA_REQUIRED'; field?: string } {
  return Boolean(result && typeof result === 'object' && 'error' in result && result.error === 'METADATA_REQUIRED');
}

export default function SecurityPage(props: Partial<SecurityPageProps> = {}) {
  const t = useTranslations('settings.security');
  const {
    policy = defaultPolicy,
    sso = defaultSso,
    ipAllowlist = [],
    auditLogRows = [],
    canManageSecurity = false,
    state = 'ready',
    saveSecurity = async () => ({ ok: true }),
  } = props;
  const [showIpDialog, setShowIpDialog] = useState(false);
  const [enforceSso, setEnforceSso] = useState(sso.enforceForNonAdmins);
  const [ssoError, setSsoError] = useState<string | null>(null);

  if (state === 'loading') {
    return (
      <main data-testid="settings-security-loading" aria-busy="true" className="space-y-4 p-6">
        <div className="h-8 w-56 rounded bg-slate-200" />
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} data-slot="card" className="h-24 rounded-xl border bg-slate-100" />
        ))}
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="p-6">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          Security settings could not be loaded. Try refreshing the settings security page.
        </div>
      </main>
    );
  }

  if (state === 'permission-denied' || !canManageSecurity) {
    return (
      <main className="p-6">
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Permission denied: settings.security.manage is required to manage security settings.
        </div>
      </main>
    );
  }

  const adminsMfa = policy.mfaRequirement === 'required_admins' || policy.mfaRequirement === 'required_all';
  const allUsersMfa = policy.mfaRequirement === 'required_all';
  const securityRows = auditLogRows.filter((row) => securityAuditTables.has(row.tableName)).slice(0, 5);

  async function handleSaveSso() {
    setSsoError(null);
    const result = (await saveSecurity({
      policy,
      sso: { ...sso, enforceForNonAdmins: enforceSso },
      ipAllowlist,
    })) as SaveResult;

    if (saveResultHasMetadataError(result)) {
      setSsoError(result.error);
      setEnforceSso(false);
    }
  }

  return (
    <main className="space-y-5 p-6">
      <header>
        <h1 className="text-2xl font-semibold">{t('heading')}</h1>
        <p className="mt-1 text-sm text-slate-500">Authentication, session, and password policy.</p>
      </header>

      {state === 'empty' ? (
        <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          Security settings have not been configured yet. Use the controls below to define the baseline policy.
        </div>
      ) : null}

      <Section title="Two-factor authentication" sub="Require 2FA for all users.">
        <SettingRow label="Enforce 2FA for Admins" hint="Admin accounts must use an authenticator app.">
          <Switch label="Enforce 2FA for Admins" checked={adminsMfa} />
        </SettingRow>
        <SettingRow label="Enforce 2FA for all users">
          <Switch label="Enforce 2FA for all users" checked={allUsersMfa} />
        </SettingRow>
        <SettingRow label="Allowed methods">
          <div className="flex flex-col gap-2">
            <MethodCheckbox id="mfa-totp" label="Authenticator app (TOTP)" checked={policy.mfaAllowedMethods.includes('totp')} />
            <MethodCheckbox id="mfa-sms" label="SMS" checked={policy.mfaAllowedMethods.includes('sms')} />
            <MethodCheckbox
              id="mfa-webauthn"
              label="Hardware key (WebAuthn)"
              checked={policy.mfaAllowedMethods.includes('webauthn')}
              disabled={!policy.mfaAllowedMethods.includes('webauthn')}
            />
          </div>
        </SettingRow>
      </Section>

      <Section title="Single Sign-On (SSO)" action={<Badge tone={sso.connected ? 'success' : 'warning'}>{sso.connected ? '● Connected' : 'Not connected'}</Badge>}>
        <SettingRow label="Provider" hint={`SAML 2.0 via ${sso.providerName}.`}>
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-600 text-xs font-bold text-white">MS</div>
            <div>
              <div className="font-medium">{sso.providerName}</div>
              <div className="font-mono text-xs text-slate-500">{sso.tenantDomain}</div>
            </div>
          </div>
        </SettingRow>
        <SettingRow label="Enforce SSO" hint="Password login disabled for non-admin users when on.">
          <Switch label="Enforce SSO" checked={enforceSso} onChange={setEnforceSso} />
          {ssoError ? <span className="text-sm font-medium text-red-700">{ssoError}</span> : null}
        </SettingRow>
        <SettingRow label="SCIM provisioning">
          <Switch label="SCIM provisioning" checked={sso.scimProvisioning} />
        </SettingRow>
        <div className="flex justify-end py-3">
          <Button type="button" onClick={handleSaveSso}>
            Save changes
          </Button>
        </div>
      </Section>

      <Section title="Password policy">
        <SettingRow label="Minimum length">
          <label className="sr-only" htmlFor="password-min-length">
            Minimum length
          </label>
          <Input id="password-min-length" aria-label="Minimum length" type="number" value={policy.passwordMinLength} readOnly className="w-20 rounded-md border px-2 py-1" />
        </SettingRow>
        <SettingRow label="Complexity">
          <SelectTrigger label="Complexity" value={policy.passwordComplexity === 'strong' ? 'Strong (upper, lower, number, symbol)' : policy.passwordComplexity} />
        </SettingRow>
        <SettingRow label="Password expires" hint="Force rotation every N days. Not recommended by NIST.">
          <SelectTrigger label="Password expires" value={expiryLabel(policy.passwordExpiryDays)} />
        </SettingRow>
        <SettingRow label="Block reuse of last N passwords">
          <Input
            aria-label="Block reuse of last N passwords"
            type="number"
            value={policy.passwordHistoryCount}
            readOnly
            className="w-20 rounded-md border px-2 py-1"
          />
        </SettingRow>
      </Section>

      <Section title="Session">
        <SettingRow label="Idle timeout" hint="Log out inactive sessions.">
          <SelectTrigger label="Idle timeout" value={sessionLabel(policy.sessionIdleTimeoutMinutes)} />
        </SettingRow>
        <SettingRow label="Maximum session length">
          <SelectTrigger label="Maximum session length" value={sessionLabel(policy.sessionMaxLengthMinutes)} />
        </SettingRow>
        <SettingRow label="IP allowlist" hint="Restrict admin login to specific IPs or ranges.">
          <div className="font-mono text-xs text-slate-500">
            {ipAllowlist.length > 0 ? ipAllowlist.map((range) => `${range.label} ${range.cidr}`).join(', ') : 'Not configured'}
            <Button
              type="button"
              className="ml-2"
              onClick={(event) => {
                event.currentTarget.blur();
                setShowIpDialog(true);
              }}
            >
              + Add range
            </Button>
          </div>
        </SettingRow>
      </Section>

      <Section title="Audit log" action={<Button type="button">View full log →</Button>}>
        <div className="py-3">
          <table aria-label="Audit log" className="w-full text-left text-sm">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">Action</th>
                <th scope="col">IP</th>
              </tr>
            </thead>
            <tbody>
              {securityRows.map((row) => (
                <tr key={row.id} data-table-name={row.tableName}>
                  <td className="font-mono">{row.createdAt}</td>
                  <td>{row.actorName}</td>
                  <td>{row.action}</td>
                  <td className="font-mono text-slate-500">{row.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {showIpDialog ? <AddIpRangeDialog onClose={() => setShowIpDialog(false)} /> : null}
    </main>
  );
}
