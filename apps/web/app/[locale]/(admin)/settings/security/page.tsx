'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

export const dynamic = 'force-dynamic';

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

type SaveSecuritySettings = (
  data: SecurityScreenData,
) => Promise<
  | { ok: true; data?: SecurityScreenData }
  | { ok: false; code?: string; fieldErrors?: Record<string, string>; data?: SecurityScreenData }
>;

type SecurityPageProps = {
  data?: SecurityScreenData;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  canManageSecurity?: boolean;
  saveSecuritySettings?: SaveSecuritySettings;
};

const securityAuditTables = new Set([
  'org_security_policies',
  'org_sso_config',
  'scim_tokens',
  'admin_ip_allowlist',
]);

const defaultSecurityData: SecurityScreenData = {
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
  auditLog: [],
};

function Section({
  region,
  title,
  sub,
  action,
  children,
}: {
  region: string;
  title: string;
  sub?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section data-region={region} role="region" aria-label={title} className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          {sub ? <p className="mt-1 text-sm text-slate-500">{sub}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  );
}

function SRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div data-testid="security-setting-row" className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(220px,0.6fr)_1fr] md:items-center">
      <div>
        <div data-testid="security-setting-label" className="text-sm font-medium text-slate-900">
          {label}
        </div>
        {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SwitchControl({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <input
      aria-label={label}
      checked={checked}
      className="h-5 w-9 rounded-full border border-slate-300 accent-slate-900 disabled:opacity-60"
      disabled={disabled}
      onChange={(event) => onChange?.(event.currentTarget.checked)}
      role="switch"
      type="checkbox"
    />
  );
}

function CheckboxControl({
  label,
  checked,
  disabled,
  title,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-900">
      <input aria-label={label} defaultChecked={checked} disabled={disabled} title={title} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}

function SelectControl<T extends string>({
  label,
  value,
  disabled,
  options,
}: {
  label: string;
  value: T;
  disabled?: boolean;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <select
      aria-label={label}
      className="w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
      defaultValue={value}
      disabled={disabled}
      name={label}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function FieldNumber({ label, value, disabled }: { label: string; value: number; disabled?: boolean }) {
  return (
    <Input
      aria-label={label}
      className="w-20 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
      defaultValue={value}
      disabled={disabled}
      name={label}
      type="number"
    />
  );
}

function StatusView({ kind }: { kind: 'loading' | 'empty' | 'error' | 'permission-denied' }) {
  const copy = {
    loading: ['Security', 'Loading security settings…'],
    empty: ['Security', 'No security settings configured yet.'],
    error: ['Security', 'Unable to load security settings.'],
    'permission-denied': ['Security', 'You do not have permission to manage security settings.'],
  }[kind];

  return (
    <main className="space-y-4 p-6">
      <section data-region="page-head" className="space-y-1">
        <h1 className="text-2xl font-semibold">{copy[0]}</h1>
        <p role={kind === 'error' ? 'alert' : 'status'} className="text-sm text-slate-500">
          {copy[1]}
        </p>
      </section>
    </main>
  );
}

function AddIpRangeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div
      aria-labelledby="sm-ip-allowlist-title"
      aria-modal="true"
      className="rounded-xl border bg-white p-4 shadow-lg"
      data-focus-trap="radix-dialog"
      data-modal-id="SM-IP-ALLOWLIST"
      role="dialog"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="sm-ip-allowlist-title" className="text-base font-semibold">
          Add IP range
        </h2>
        <Button aria-label="Close" type="button" onClick={onClose}>
          ×
        </Button>
      </div>
      <p className="mt-2 text-sm text-slate-500">Add a CIDR range for administrator sign-in.</p>
    </div>
  );
}

function sortAuditRows(rows: AuditLogRow[]) {
  return [...rows]
    .filter((row) => securityAuditTables.has(row.tableName))
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 5);
}

async function defaultSaveSecuritySettings(nextData: SecurityScreenData) {
  return { ok: true as const, data: nextData };
}

export default function SecurityPage({
  data = defaultSecurityData,
  state = 'ready',
  canManageSecurity = false,
  saveSecuritySettings = defaultSaveSecuritySettings,
}: SecurityPageProps) {
  const [screenData, setScreenData] = React.useState(data);
  const [enforceSso, setEnforceSso] = React.useState(data.sso.enforceSso);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [ipDialogOpen, setIpDialogOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const auditRows = React.useMemo(() => sortAuditRows(screenData.auditLog), [screenData.auditLog]);

  if (state === 'loading') return <StatusView kind="loading" />;
  if (state === 'empty') return <StatusView kind="empty" />;
  if (state === 'error') return <StatusView kind="error" />;
  if (!canManageSecurity) return <StatusView kind="permission-denied" />;

  function handleSave() {
    setFieldError(null);
    const nextData: SecurityScreenData = {
      ...screenData,
      sso: { ...screenData.sso, enforceSso },
    };

    startTransition(async () => {
      const result = await saveSecuritySettings(nextData);
      if (result.ok === true) {
        setScreenData(result.data ?? nextData);
        return;
      }

      if (result.ok === false) {
        setFieldError(result.fieldErrors?.enforceSso ?? result.code ?? 'Unable to save security settings');
        const rollbackData = result.data ?? { ...nextData, sso: { ...nextData.sso, enforceSso: false } };
        setScreenData(rollbackData);
        setEnforceSso(rollbackData.sso.enforceSso);
      }
    });
  }

  return (
    <main className="space-y-5 p-6">
      <section data-region="page-head" className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Security</h1>
          <p className="text-sm text-slate-500">Authentication, session, and password policy.</p>
        </div>
      </section>

      <Section region="twofa" title="Two-factor authentication" sub="Require 2FA for all users.">
        <SRow label="Enforce 2FA for Admins" hint="Admin accounts must use an authenticator app.">
          <SwitchControl label="Enforce 2FA for Admins" checked={screenData.twoFactor.enforceAdmins} disabled={isPending} />
        </SRow>
        <SRow label="Enforce 2FA for all users">
          <SwitchControl label="Enforce 2FA for all users" checked={screenData.twoFactor.enforceAllUsers} disabled={isPending} />
        </SRow>
        <SRow label="Allowed methods">
          <div className="flex flex-col gap-1.5">
            <CheckboxControl label="Authenticator app (TOTP)" checked={screenData.twoFactor.allowedMethods.includes('totp')} disabled={isPending} />
            <CheckboxControl label="SMS" checked={screenData.twoFactor.allowedMethods.includes('sms')} disabled={isPending} />
            <CheckboxControl
              label="Hardware key (WebAuthn)"
              checked={screenData.twoFactor.allowedMethods.includes('webauthn')}
              disabled
              title="Coming Phase 3"
            />
          </div>
        </SRow>
      </Section>

      <Section region="password-policy" title="Password policy">
        <SRow label="Minimum length">
          <FieldNumber label="Minimum length" value={screenData.passwordPolicy.minimumLength} disabled={isPending} />
        </SRow>
        <SRow label="Complexity">
          <SelectControl
            label="Complexity"
            value={screenData.passwordPolicy.complexity}
            disabled={isPending}
            options={[
              { value: 'strong', label: 'Strong (upper, lower, number, symbol)' },
              { value: 'medium', label: 'Medium (upper, lower, number)' },
              { value: 'basic', label: 'Basic (length only)' },
            ]}
          />
        </SRow>
        <SRow label="Password expires" hint="Force rotation every N days. Not recommended by NIST.">
          <SelectControl
            label="Password expires"
            value={screenData.passwordPolicy.expires}
            disabled={isPending}
            options={[
              { value: 'never', label: 'Never' },
              { value: '90', label: '90 days' },
              { value: '180', label: '180 days' },
            ]}
          />
        </SRow>
        <SRow label="Block reuse of last N passwords">
          <FieldNumber label="Block reuse of last N passwords" value={screenData.passwordPolicy.blockReuseCount} disabled={isPending} />
        </SRow>
      </Section>

      <Section region="sessions" title="Session">
        <SRow label="Idle timeout" hint="Log out inactive sessions.">
          <SelectControl
            label="Idle timeout"
            value={screenData.sessionPolicy.idleTimeout}
            disabled={isPending}
            options={[
              { value: '15', label: '15 min' },
              { value: '30', label: '30 min' },
              { value: '60', label: '60 min' },
              { value: '4h', label: '4 h' },
              { value: 'never', label: 'Never' },
            ]}
          />
        </SRow>
        <SRow label="Maximum session length">
          <SelectControl
            label="Maximum session length"
            value={screenData.sessionPolicy.maximumSessionLength}
            disabled={isPending}
            options={[
              { value: '4h', label: '4 h' },
              { value: '8h', label: '8 h' },
              { value: '12h', label: '12 h' },
              { value: '24h', label: '24 h' },
            ]}
          />
        </SRow>
      </Section>

      <Section
        region="sso"
        title="Single Sign-On (SSO)"
        action={screenData.sso.connected ? <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">● Connected</span> : null}
      >
        <SRow label="Provider" hint="SAML 2.0 via Microsoft Entra ID.">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-[#0078d4] text-[11px] font-bold text-white">MS</div>
            <div>
              <div className="font-medium">{screenData.sso.providerName}</div>
              <div className="font-mono text-[11px] text-slate-500">{screenData.sso.providerTenant}</div>
            </div>
          </div>
        </SRow>
        <SRow label="Enforce SSO" hint="Password login disabled for non-admin users when on.">
          <div className="space-y-2">
            <SwitchControl label="Enforce SSO" checked={enforceSso} disabled={isPending} onChange={setEnforceSso} />
            {fieldError ? <div role="alert" className="text-xs font-medium text-red-700">{fieldError}</div> : null}
          </div>
        </SRow>
      </Section>

      <Section region="scim" title="SCIM">
        <SRow label="SCIM provisioning">
          <SwitchControl label="SCIM provisioning" checked={screenData.scim.enabled} disabled={isPending} />
        </SRow>
      </Section>

      <Section region="ip-allowlist" title="IP allowlist">
        <SRow label="IP allowlist" hint="Restrict admin login to specific IPs or ranges.">
          <div className="font-mono text-xs text-slate-500">
            {screenData.ipAllowlist.length > 0 ? screenData.ipAllowlist.join(', ') : 'Not configured'}{' '}
            <Button
              type="button"
              className="btn-ghost btn-sm ml-1 text-blue-600"
              data-modal-target="SM-IP-ALLOWLIST"
              onClick={(event) => {
                setIpDialogOpen(true);
                event.currentTarget.blur();
              }}
            >
              + Add range
            </Button>
          </div>
        </SRow>
      </Section>

      <Section region="audit-preview" title="Audit log" action={<Button type="button" className="btn-ghost btn-sm">View full log →</Button>}>
        <div className="overflow-x-auto px-5 py-4">
          <table aria-label="Security audit log preview" className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className="p-2 text-left">When</th>
                <th scope="col" className="p-2 text-left">Who</th>
                <th scope="col" className="p-2 text-left">Action</th>
                <th scope="col" className="p-2 text-left">IP</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((row) => (
                <tr key={row.id} className="border-t" data-table-name={row.tableName}>
                  <td className="p-2 font-mono">{row.occurredAt}</td>
                  <td className="p-2">{row.actorName}</td>
                  <td className="p-2">{row.action}</td>
                  <td className="p-2 font-mono text-slate-500">{row.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="flex justify-end">
        <Button type="button" className="btn-primary" disabled={isPending} onClick={handleSave}>
          {isPending ? 'Saving security settings…' : 'Save security settings'}
        </Button>
      </div>

      <AddIpRangeDialog open={ipDialogOpen} onClose={() => setIpDialogOpen(false)} />
    </main>
  );
}
