"use client";

import Link from 'next/link';
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

export type IpAllowlistEntry = {
  id: string;
  cidr: string;
  label: string | null;
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
  ipAllowlist: IpAllowlistEntry[];
  auditLog: AuditLogRow[];
};

export type SaveSecuritySettings = (
  data: SecurityScreenData,
) => Promise<
  | { ok: true; data?: SecurityScreenData }
  | { ok: false; code?: string; fieldErrors?: Record<string, string>; data?: SecurityScreenData }
>;

/** Mirrors `actions/security/ip-allowlist-add.addIpRange`. */
export type AddIpRange = (
  cidr: string,
  label?: string | null,
) => Promise<
  | { ok: true; data: { id: string; cidr: string; label: string | null } }
  | { ok: false; error: 'INVALID_INPUT' | 'CIDR_OVERLAP_DEFAULT' | 'FORBIDDEN' | 'PERSISTENCE_FAILED' }
>;

/** Mirrors `actions/security/ip-allowlist-remove.removeIpRange`. */
export type RemoveIpRange = (
  id: string,
) => Promise<
  | { ok: true; data: { id: string } }
  | { ok: false; error: 'INVALID_INPUT' | 'NOT_FOUND' | 'FORBIDDEN' | 'PERSISTENCE_FAILED' }
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
  ipCidrLabel: string;
  ipCidrPlaceholder: string;
  ipCidrHint: string;
  ipLabelLabel: string;
  ipLabelPlaceholder: string;
  ipAddSubmit: string;
  ipAdding: string;
  ipRemove: string;
  ipRemoving: string;
  ipRemoveConfirm: string;
  ipErrorInvalid: string;
  ipErrorOverlap: string;
  ipErrorForbidden: string;
  ipErrorFailed: string;
  notAvailableYet: string;
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
  addIpRange: AddIpRange;
  removeIpRange: RemoveIpRange;
  /** Locale-relative href to the full audit log screen. */
  auditLogHref: string;
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
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onChange?: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-900">
      <Checkbox
        aria-label={label}
        checked={checked}
        disabled={disabled}
        title={title}
        onCheckedChange={(value) => onChange?.(Boolean(value))}
      />
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

/**
 * Light client-side CIDR shape check used only to surface an inline hint before
 * the user submits. Authoritative validation (and the IPv4/IPv6 default-open
 * `0.0.0.0/0` · `::/0` rejection) lives in the `addIpRange` server action — this
 * is a UX affordance, not a security boundary.
 */
export function looksLikeCidr(value: string): boolean {
  const trimmed = value.trim();
  const slash = trimmed.indexOf('/');
  if (slash < 0) return false;
  const address = trimmed.slice(0, slash);
  const prefixText = trimmed.slice(slash + 1);
  if (!address || !/^[0-9]+$/.test(prefixText)) return false;
  const prefix = Number(prefixText);
  if (address.includes(':')) return prefix >= 0 && prefix <= 128;
  return prefix >= 0 && prefix <= 32 && /^(\d{1,3}\.){3}\d{1,3}$/.test(address);
}

function ipErrorLabel(
  error: 'INVALID_INPUT' | 'CIDR_OVERLAP_DEFAULT' | 'FORBIDDEN' | 'PERSISTENCE_FAILED' | 'NOT_FOUND',
  labels: SecurityScreenLabels,
): string {
  switch (error) {
    case 'CIDR_OVERLAP_DEFAULT':
      return labels.ipErrorOverlap;
    case 'FORBIDDEN':
      return labels.ipErrorForbidden;
    case 'INVALID_INPUT':
      return labels.ipErrorInvalid;
    default:
      return labels.ipErrorFailed;
  }
}

function AddIpRangeDialog({
  open,
  onClose,
  labels,
  addIpRange,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  labels: SecurityScreenLabels;
  addIpRange: AddIpRange;
  onAdded: (entry: IpAllowlistEntry) => void;
}) {
  const [cidr, setCidr] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  React.useEffect(() => {
    if (!open) {
      setCidr('');
      setLabel('');
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const trimmed = cidr.trim();
  const showFormatHint = trimmed.length > 0 && !looksLikeCidr(trimmed);
  const canSubmit = trimmed.length > 0 && !isSubmitting;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const normalizedLabel = label.trim();
    startSubmit(async () => {
      const result = await addIpRange(trimmed, normalizedLabel.length > 0 ? normalizedLabel : null);
      if (result.ok) {
        onAdded({ id: result.data.id, cidr: result.data.cidr, label: result.data.label });
        onClose();
        return;
      }
      setError(ipErrorLabel(result.error, labels));
    });
  }

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
        <form className="modal-body space-y-3" onSubmit={handleSubmit}>
          <p className="muted text-sm">{labels.addIpRangeHelp}</p>
          <div className="space-y-1">
            <label className="sg-label text-sm" htmlFor="sm-ip-cidr">
              {labels.ipCidrLabel}
            </label>
            <input
              id="sm-ip-cidr"
              aria-label={labels.ipCidrLabel}
              name="cidr"
              type="text"
              autoComplete="off"
              spellCheck={false}
              className="w-full font-mono"
              placeholder={labels.ipCidrPlaceholder}
              value={cidr}
              disabled={isSubmitting}
              onChange={(event) => {
                setCidr(event.target.value);
                setError(null);
              }}
            />
            <p className="sg-hint text-xs" id="sm-ip-cidr-hint">
              {labels.ipCidrHint}
            </p>
            {showFormatHint ? (
              <p role="status" className="text-xs font-medium text-amber-700">
                {labels.ipErrorInvalid}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <label className="sg-label text-sm" htmlFor="sm-ip-label">
              {labels.ipLabelLabel}
            </label>
            <input
              id="sm-ip-label"
              aria-label={labels.ipLabelLabel}
              name="label"
              type="text"
              maxLength={120}
              autoComplete="off"
              className="w-full"
              placeholder={labels.ipLabelPlaceholder}
              value={label}
              disabled={isSubmitting}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          {error ? (
            <div role="alert" className="text-xs font-medium text-red-700">
              {error}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" className="btn-ghost btn-sm" onClick={onClose} disabled={isSubmitting}>
              {labels.close}
            </Button>
            <Button type="submit" className="btn-primary btn-sm" disabled={!canSubmit}>
              {isSubmitting ? labels.ipAdding : labels.ipAddSubmit}
            </Button>
          </div>
        </form>
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
  addIpRange,
  removeIpRange,
  auditLogHref,
}: SecurityScreenProps) {
  const [screenData, setScreenData] = useState(data);
  const [enforceSso, setEnforceSso] = useState(data.sso.enforceSso);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [ipDialogOpen, setIpDialogOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [ipError, setIpError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRemoving, startRemoving] = useTransition();
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

  function toggleMethod(method: string, next: boolean) {
    setScreenData((prev) => {
      const set = new Set(prev.twoFactor.allowedMethods);
      if (next) set.add(method);
      else set.delete(method);
      return { ...prev, twoFactor: { ...prev.twoFactor, allowedMethods: Array.from(set) } };
    });
  }

  function handleIpAdded(entry: IpAllowlistEntry) {
    setIpError(null);
    setScreenData((prev) => ({ ...prev, ipAllowlist: [entry, ...prev.ipAllowlist] }));
  }

  function handleRemoveIp(entry: IpAllowlistEntry) {
    if (!window.confirm(labels.ipRemoveConfirm)) return;
    setIpError(null);
    setRemovingId(entry.id);
    startRemoving(async () => {
      const result = await removeIpRange(entry.id);
      if (result.ok) {
        setScreenData((prev) => ({
          ...prev,
          ipAllowlist: prev.ipAllowlist.filter((row) => row.id !== entry.id),
        }));
      } else {
        setIpError(ipErrorLabel(result.error, labels));
      }
      setRemovingId(null);
    });
  }

  return (
    <main className="space-y-5 p-6">
      <div data-region="page-head">
        <PageHead title={labels.title} sub={labels.subtitle} />
      </div>

      <RegionSection region="twofa" title={labels.twoFactorTitle} sub={labels.twoFactorSub}>
        <SRow label={labels.enforceAdmins} hint={labels.enforceAdminsHint}>
          <Toggle
            aria-label={labels.enforceAdmins}
            checked={screenData.twoFactor.enforceAdmins}
            disabled={isPending}
            onChange={(next) =>
              setScreenData((prev) => ({ ...prev, twoFactor: { ...prev.twoFactor, enforceAdmins: next } }))
            }
          />
        </SRow>
        <SRow label={labels.enforceAllUsers}>
          <Toggle
            aria-label={labels.enforceAllUsers}
            checked={screenData.twoFactor.enforceAllUsers}
            disabled={isPending}
            onChange={(next) =>
              setScreenData((prev) => ({ ...prev, twoFactor: { ...prev.twoFactor, enforceAllUsers: next } }))
            }
          />
        </SRow>
        <SRow label={labels.allowedMethods}>
          <div className="flex flex-col gap-1.5">
            <CheckboxControl
              label={labels.methodTotp}
              checked={screenData.twoFactor.allowedMethods.includes('totp')}
              disabled={isPending}
              onChange={(next) => toggleMethod('totp', next)}
            />
            <CheckboxControl
              label={labels.methodSms}
              checked={screenData.twoFactor.allowedMethods.includes('sms')}
              disabled={isPending}
              onChange={(next) => toggleMethod('sms', next)}
            />
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
            min={8}
            value={screenData.passwordPolicy.minimumLength}
            disabled={isPending}
            style={{ width: 80 }}
            onChange={(event) => {
              const next = Number(event.target.value);
              setScreenData((prev) => ({
                ...prev,
                passwordPolicy: {
                  ...prev.passwordPolicy,
                  minimumLength: Number.isFinite(next) ? next : prev.passwordPolicy.minimumLength,
                },
              }));
            }}
          />
        </SRow>
        <SelectField
          id="security-complexity"
          label={labels.complexity}
          value={screenData.passwordPolicy.complexity}
          disabled={isPending}
          onChange={(value) =>
            setScreenData((prev) => ({
              ...prev,
              passwordPolicy: {
                ...prev.passwordPolicy,
                complexity: value as SecurityScreenData['passwordPolicy']['complexity'],
              },
            }))
          }
          options={[
            { value: 'strong', label: labels.complexityStrong },
            { value: 'medium', label: labels.complexityMedium },
            { value: 'basic', label: labels.complexityBasic },
          ]}
        />
        {/* Password expiry has no backing column in `upsertSecurityPolicy`; kept
            for visual parity but disabled with a 'Not available yet' tooltip so we
            never fake-save it. */}
        <div title={labels.notAvailableYet}>
          <SelectField
            id="security-password-expires"
            label={labels.passwordExpires}
            hint={labels.passwordExpiresHint}
            value={screenData.passwordPolicy.expires}
            disabled
            options={[
              { value: 'never', label: labels.expiresNever },
              { value: '90', label: labels.expires90 },
              { value: '180', label: labels.expires180 },
            ]}
          />
        </div>
        {/* Block-reuse count has no backing column either — disabled, not fake-saved. */}
        <SRow label={labels.blockReuse} htmlFor="security-block-reuse">
          <input
            id="security-block-reuse"
            aria-label={labels.blockReuse}
            name={labels.blockReuse}
            type="number"
            value={screenData.passwordPolicy.blockReuseCount}
            disabled
            title={labels.notAvailableYet}
            style={{ width: 80 }}
            readOnly
          />
        </SRow>
      </RegionSection>

      {/* Session timeouts (idle / max length) have no backing column in the
          policy action yet — rendered for parity but disabled with a
          'Not available yet' tooltip rather than fake-saved. */}
      <RegionSection region="sessions" title={labels.sessionTitle}>
        <div title={labels.notAvailableYet}>
          <SelectField
            id="security-idle-timeout"
            label={labels.idleTimeout}
            hint={labels.idleTimeoutHint}
            value={screenData.sessionPolicy.idleTimeout}
            disabled
            options={[
              { value: '15', label: labels.minutes15 },
              { value: '30', label: labels.minutes30 },
              { value: '60', label: labels.minutes60 },
              { value: '4h', label: labels.hours4 },
              { value: 'never', label: labels.never },
            ]}
          />
        </div>
        <div title={labels.notAvailableYet}>
          <SelectField
            id="security-max-session"
            label={labels.maximumSessionLength}
            value={screenData.sessionPolicy.maximumSessionLength}
            disabled
            options={[
              { value: '4h', label: labels.hours4 },
              { value: '8h', label: labels.hours8 },
              { value: '12h', label: labels.hours12 },
              { value: '24h', label: labels.hours24 },
            ]}
          />
        </div>
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

      {/* SCIM provisioning is driven by token presence (read-only here); the
          policy action has no SCIM field, so the toggle is disabled with a
          'Not available yet' tooltip rather than fake-saved. */}
      <RegionSection region="scim" title={labels.scimTitle}>
        <SRow label={labels.scimProvisioning} hint={labels.notAvailableYet}>
          <span title={labels.notAvailableYet}>
            <Toggle aria-label={labels.scimProvisioning} checked={screenData.scim.enabled} disabled />
          </span>
        </SRow>
      </RegionSection>

      <RegionSection region="ip-allowlist" title={labels.ipAllowlistTitle}>
        <SRow label={labels.ipAllowlistTitle} hint={labels.ipAllowlistHint}>
          <div className="space-y-2">
            {screenData.ipAllowlist.length > 0 ? (
              <ul className="space-y-1.5" aria-label={labels.ipAllowlistTitle}>
                {screenData.ipAllowlist.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 text-sm" data-ip-id={entry.id}>
                    <span className="font-mono text-slate-900">{entry.cidr}</span>
                    {entry.label ? <span className="text-xs text-slate-500">{entry.label}</span> : null}
                    <Button
                      type="button"
                      className="btn-ghost btn-sm ml-auto text-red-600"
                      aria-label={`${labels.ipRemove} ${entry.cidr}`}
                      disabled={isRemoving && removingId === entry.id}
                      onClick={() => handleRemoveIp(entry)}
                    >
                      {isRemoving && removingId === entry.id ? labels.ipRemoving : labels.ipRemove}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="font-mono text-xs text-slate-500">{labels.notConfigured}</div>
            )}
            <Button
              type="button"
              className="btn-ghost btn-sm text-blue-600"
              data-modal-target="SM-IP-ALLOWLIST"
              onClick={(event) => {
                setIpDialogOpen(true);
                event.currentTarget.blur();
              }}
            >
              {labels.addRange}
            </Button>
            {ipError ? (
              <div role="alert" className="text-xs font-medium text-red-700">
                {ipError}
              </div>
            ) : null}
          </div>
        </SRow>
      </RegionSection>

      <RegionSection
        region="audit-preview"
        title={labels.auditLogTitle}
        action={
          <Link
            href={auditLogHref}
            prefetch={false}
            data-testid="security-view-full-log"
            className="btn-ghost btn-sm text-blue-600"
          >
            {labels.viewFullLog}
          </Link>
        }
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

      <AddIpRangeDialog
        open={ipDialogOpen}
        onClose={() => setIpDialogOpen(false)}
        labels={labels}
        addIpRange={addIpRange}
        onAdded={handleIpAdded}
      />
    </main>
  );
}
