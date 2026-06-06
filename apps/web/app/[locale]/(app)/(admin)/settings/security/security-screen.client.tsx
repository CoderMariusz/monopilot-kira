"use client";

import React, { useMemo, useState, useTransition } from 'react';

import { Button } from '@monopilot/ui/Button';
import { Checkbox } from '@monopilot/ui/Checkbox';

import {
  PageHead,
  Section,
  SelectField,
  SRow,
  Toggle,
} from '../_components';

// data-prototype-source: prototypes/design/Monopilot Design System/settings/access-screens.jsx:160-245

export type AuditLogRow = {
  id: string;
  occurredAt: string;
  actorName: string;
  action: string;
  ipAddress: string | null;
  tableName: string;
};

export type SecurityScreenData = {
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

export type SaveSecuritySettings = (
  data: SecurityScreenData,
) => Promise<
  | { ok: true; data?: SecurityScreenData }
  | { ok: false; code?: string; fieldErrors?: Record<string, string>; data?: SecurityScreenData }
>;

export type SecurityScreenLabels = {
  title: string;
  subtitle: string;
  twoFactorTitle: string;
  twoFactorSub: string;
  enforceAdmins: string;
  enforceAdminsHint: string;
  enforceAllUsers: string;
  allowedMethods: string;
  methodTotp: string;
  methodSms: string;
  methodWebauthn: string;
  webauthnTooltip: string;
  passwordPolicyTitle: string;
  minimumLength: string;
  complexity: string;
  complexityStrong: string;
  complexityMedium: string;
  complexityBasic: string;
  passwordExpires: string;
  passwordExpiresHint: string;
  expiresNever: string;
  expires90: string;
  expires180: string;
  blockReuse: string;
  sessionTitle: string;
  idleTimeout: string;
  idleTimeoutHint: string;
  maximumSessionLength: string;
  minutes15: string;
  minutes30: string;
  minutes60: string;
  hours4: string;
  hours8: string;
  hours12: string;
  hours24: string;
  never: string;
  ssoTitle: string;
  connected: string;
  provider: string;
  providerHint: string;
  enforceSso: string;
  enforceSsoHint: string;
  scimTitle: string;
  scimProvisioning: string;
  ipAllowlistTitle: string;
  ipAllowlistHint: string;
  notConfigured: string;
  addRange: string;
  addIpRangeTitle: string;
  close: string;
  addIpRangeHelp: string;
  auditLogTitle: string;
  viewFullLog: string;
  auditTableLabel: string;
  auditWhen: string;
  auditWho: string;
  auditAction: string;
  auditIp: string;
  auditSystemActor: string;
  save: string;
  saving: string;
  loadSecurity: string;
  loading: string;
  empty: string;
  error: string;
  permissionDenied: string;
};

export type SecurityScreenProps = {
  data: SecurityScreenData;
  labels: SecurityScreenLabels;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  canManageSecurity: boolean;
  saveSecuritySettings: SaveSecuritySettings;
};

const securityAuditTables = new Set([
  'org_security_policies',
  'org_sso_config',
  'scim_tokens',
  'admin_ip_allowlist',
]);

/**
 * Wraps a shared `Section` with the screen's `data-region` marker so the
 * existing region-ordering assertions keep working while the section chrome
 * (head / grey foot / separators) comes from the design-system primitive.
 */
function RegionSection({
  region,
  title,
  sub,
  action,
  foot,
  children,
}: {
  region: string;
  title: string;
  sub?: string;
  action?: React.ReactNode;
  foot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div data-region={region}>
      <Section title={title} sub={sub} action={action} foot={foot}>
        {children}
      </Section>
    </div>
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
      <Checkbox aria-label={label} defaultChecked={checked} disabled={disabled} title={title} />
      <span>{label}</span>
    </label>
  );
}

function providerInitials(providerName: string) {
  return providerName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'ID';
}

function StatusView({ kind, labels }: { kind: 'loading' | 'empty' | 'error' | 'permission-denied'; labels: SecurityScreenLabels }) {
  const copy = {
    loading: labels.loading,
    empty: labels.empty,
    error: labels.error,
    'permission-denied': labels.permissionDenied,
  }[kind];

  return (
    <main className="space-y-4 p-6">
      <section data-region="page-head" className="space-y-1">
        <h1 className="text-2xl font-semibold">{labels.loadSecurity}</h1>
        <p role={kind === 'error' ? 'alert' : 'status'} className="text-sm text-slate-500">
          {copy}
        </p>
      </section>
    </main>
  );
}

function AddIpRangeDialog({ open, onClose, labels }: { open: boolean; onClose: () => void; labels: SecurityScreenLabels }) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        aria-labelledby="sm-ip-allowlist-title"
        aria-modal="true"
        className="modal-box"
        style={{ width: 440 }}
        data-focus-trap="radix-dialog"
        data-modal-id="SM-IP-ALLOWLIST"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="sm-ip-allowlist-title" className="modal-title">
            {labels.addIpRangeTitle}
          </h2>
          <Button aria-label={labels.close} className="btn-ghost btn-sm" type="button" onClick={onClose}>
            ×
          </Button>
        </div>
        <div className="modal-body">
          <p className="muted text-sm">{labels.addIpRangeHelp}</p>
        </div>
      </div>
    </div>
  );
}

export function sortSecurityAuditRows(rows: AuditLogRow[]) {
  return [...rows]
    .filter((row) => securityAuditTables.has(row.tableName))
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 5);
}

export default function SecurityScreen({
  data,
  labels,
  state = 'ready',
  canManageSecurity,
  saveSecuritySettings,
}: SecurityScreenProps) {
  const [screenData, setScreenData] = useState(data);
  const [enforceSso, setEnforceSso] = useState(data.sso.enforceSso);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [ipDialogOpen, setIpDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const auditRows = useMemo(() => sortSecurityAuditRows(screenData.auditLog), [screenData.auditLog]);

  if (state === 'loading') return <StatusView kind="loading" labels={labels} />;
  if (state === 'empty') return <StatusView kind="empty" labels={labels} />;
  if (state === 'error') return <StatusView kind="error" labels={labels} />;
  if (!canManageSecurity) return <StatusView kind="permission-denied" labels={labels} />;

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
        setFieldError(result.fieldErrors?.enforceSso ?? result.code ?? labels.error);
        const rollbackData = result.data ?? { ...nextData, sso: { ...nextData.sso, enforceSso: false } };
        setScreenData(rollbackData);
        setEnforceSso(rollbackData.sso.enforceSso);
      }
    });
  }

  return (
    <main className="space-y-5 p-6">
      <div data-region="page-head">
        <PageHead title={labels.title} sub={labels.subtitle} />
      </div>

      <RegionSection region="twofa" title={labels.twoFactorTitle} sub={labels.twoFactorSub}>
        <SRow label={labels.enforceAdmins} hint={labels.enforceAdminsHint}>
          <Toggle aria-label={labels.enforceAdmins} checked={screenData.twoFactor.enforceAdmins} disabled={isPending} />
        </SRow>
        <SRow label={labels.enforceAllUsers}>
          <Toggle aria-label={labels.enforceAllUsers} checked={screenData.twoFactor.enforceAllUsers} disabled={isPending} />
        </SRow>
        <SRow label={labels.allowedMethods}>
          <div className="flex flex-col gap-1.5">
            <CheckboxControl label={labels.methodTotp} checked={screenData.twoFactor.allowedMethods.includes('totp')} disabled={isPending} />
            <CheckboxControl label={labels.methodSms} checked={screenData.twoFactor.allowedMethods.includes('sms')} disabled={isPending} />
            <CheckboxControl
              label={labels.methodWebauthn}
              checked={screenData.twoFactor.allowedMethods.includes('webauthn')}
              disabled
              title={labels.webauthnTooltip}
            />
          </div>
        </SRow>
      </RegionSection>

      <RegionSection region="password-policy" title={labels.passwordPolicyTitle}>
        <SRow label={labels.minimumLength} htmlFor="security-minimum-length">
          <input
            id="security-minimum-length"
            aria-label={labels.minimumLength}
            name={labels.minimumLength}
            type="number"
            defaultValue={screenData.passwordPolicy.minimumLength}
            disabled={isPending}
            style={{ width: 80 }}
          />
        </SRow>
        <SelectField
          id="security-complexity"
          label={labels.complexity}
          value={screenData.passwordPolicy.complexity}
          disabled={isPending}
          options={[
            { value: 'strong', label: labels.complexityStrong },
            { value: 'medium', label: labels.complexityMedium },
            { value: 'basic', label: labels.complexityBasic },
          ]}
        />
        <SelectField
          id="security-password-expires"
          label={labels.passwordExpires}
          hint={labels.passwordExpiresHint}
          value={screenData.passwordPolicy.expires}
          disabled={isPending}
          options={[
            { value: 'never', label: labels.expiresNever },
            { value: '90', label: labels.expires90 },
            { value: '180', label: labels.expires180 },
          ]}
        />
        <SRow label={labels.blockReuse} htmlFor="security-block-reuse">
          <input
            id="security-block-reuse"
            aria-label={labels.blockReuse}
            name={labels.blockReuse}
            type="number"
            defaultValue={screenData.passwordPolicy.blockReuseCount}
            disabled={isPending}
            style={{ width: 80 }}
          />
        </SRow>
      </RegionSection>

      <RegionSection region="sessions" title={labels.sessionTitle}>
        <SelectField
          id="security-idle-timeout"
          label={labels.idleTimeout}
          hint={labels.idleTimeoutHint}
          value={screenData.sessionPolicy.idleTimeout}
          disabled={isPending}
          options={[
            { value: '15', label: labels.minutes15 },
            { value: '30', label: labels.minutes30 },
            { value: '60', label: labels.minutes60 },
            { value: '4h', label: labels.hours4 },
            { value: 'never', label: labels.never },
          ]}
        />
        <SelectField
          id="security-max-session"
          label={labels.maximumSessionLength}
          value={screenData.sessionPolicy.maximumSessionLength}
          disabled={isPending}
          options={[
            { value: '4h', label: labels.hours4 },
            { value: '8h', label: labels.hours8 },
            { value: '12h', label: labels.hours12 },
            { value: '24h', label: labels.hours24 },
          ]}
        />
      </RegionSection>

      <RegionSection
        region="sso"
        title={labels.ssoTitle}
        action={screenData.sso.connected ? <span className="badge badge-green">● {labels.connected}</span> : null}
      >
        <SRow label={labels.provider} hint={labels.providerHint}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-[#0078d4] text-[11px] font-bold text-white">{providerInitials(screenData.sso.providerName)}</div>
            <div>
              <div className="font-medium">{screenData.sso.providerName}</div>
              <div className="font-mono text-[11px] text-slate-500">{screenData.sso.providerTenant}</div>
            </div>
          </div>
        </SRow>
        <SRow label={labels.enforceSso} hint={labels.enforceSsoHint}>
          <div className="space-y-2">
            <Toggle aria-label={labels.enforceSso} checked={enforceSso} disabled={isPending} onChange={setEnforceSso} />
            {fieldError ? <div role="alert" className="text-xs font-medium text-red-700">{fieldError}</div> : null}
          </div>
        </SRow>
      </RegionSection>

      <RegionSection region="scim" title={labels.scimTitle}>
        <SRow label={labels.scimProvisioning}>
          <Toggle aria-label={labels.scimProvisioning} checked={screenData.scim.enabled} disabled={isPending} />
        </SRow>
      </RegionSection>

      <RegionSection region="ip-allowlist" title={labels.ipAllowlistTitle}>
        <SRow label={labels.ipAllowlistTitle} hint={labels.ipAllowlistHint}>
          <div className="font-mono text-xs text-slate-500">
            {screenData.ipAllowlist.length > 0 ? screenData.ipAllowlist.join(', ') : labels.notConfigured}{' '}
            <Button
              type="button"
              className="btn-ghost btn-sm ml-1 text-blue-600"
              data-modal-target="SM-IP-ALLOWLIST"
              onClick={(event) => {
                setIpDialogOpen(true);
                event.currentTarget.blur();
              }}
            >
              {labels.addRange}
            </Button>
          </div>
        </SRow>
      </RegionSection>

      <RegionSection
        region="audit-preview"
        title={labels.auditLogTitle}
        action={<Button type="button" className="btn-ghost btn-sm">{labels.viewFullLog}</Button>}
      >
        <div className="overflow-x-auto">
          <table aria-label={labels.auditTableLabel} className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ background: 'var(--gray-050)' }}>
                <th scope="col" className="p-2 text-left">{labels.auditWhen}</th>
                <th scope="col" className="p-2 text-left">{labels.auditWho}</th>
                <th scope="col" className="p-2 text-left">{labels.auditAction}</th>
                <th scope="col" className="p-2 text-left">{labels.auditIp}</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((row) => (
                <tr key={row.id} className="border-t" style={{ borderColor: 'var(--border)' }} data-table-name={row.tableName}>
                  <td className="p-2 font-mono">{row.occurredAt}</td>
                  <td className="p-2">{row.actorName}</td>
                  <td className="p-2">{row.action}</td>
                  <td className="p-2 font-mono text-slate-500">{row.ipAddress ?? labels.notConfigured}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </RegionSection>

      {/* Page-level save committed via the grey design-system foot bar
          (.sg-section-foot), matching the prototype's action placement. */}
      <div className="sg-section">
        <div className="sg-section-foot">
          <Button type="button" className="btn-primary" disabled={isPending} onClick={handleSave}>
            {isPending ? labels.saving : labels.save}
          </Button>
        </div>
      </div>

      <AddIpRangeDialog open={ipDialogOpen} onClose={() => setIpDialogOpen(false)} labels={labels} />
    </main>
  );
}
