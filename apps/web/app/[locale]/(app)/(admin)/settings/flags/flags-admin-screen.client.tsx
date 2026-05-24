'use client';

import React from 'react';
import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Switch } from '@monopilot/ui/Switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@monopilot/ui/Table';

export type FlagTier = 'L1' | 'L2' | 'L3';
export type FlagTenant = 'L1-core' | 'L2-local' | 'L3-tenant';
export type PageState = 'ready' | 'loading' | 'empty' | 'error';
type TabKey = 'core' | 'local' | 'tenant';

export type FeatureFlagRow = {
  code: string;
  description?: string;
  desc?: string;
  tier: FlagTier;
  tenant: FlagTenant;
  enabled?: boolean;
  on?: boolean;
  rolloutPercent?: number;
  rollout?: number;
  updatedAt?: string;
  updated?: string;
  consumers?: string[];
};

export type FlagAuthorizationPreflight = {
  flagCode: 'npd.post_release_edit.enabled';
  canEnable: boolean;
  requiresNewVersion: boolean;
  hasAuthorizerRoles: boolean;
  configureHref: '/en/settings/authorization' | '/settings/authorization';
};

export type FlagsAdminLabels = {
  title: string;
  subtitle: string;
  openPostHog: string;
  preflightNotice: string;
  coreTab: string;
  localTab: string;
  tenantTab: string;
  searchPlaceholder: string;
  coreFlags: string;
  localFlags: string;
  tenantFlags: string;
  flagCode: string;
  description: string;
  status: string;
  rollout: string;
  updated: string;
  consumers: string;
  actions: string;
  on: string;
  off: string;
  edit: string;
  loading: string;
  empty: string;
  error: string;
  vSet43Title: string;
  vSet43Body: string;
  configureAuthorization: string;
  noConsumers: string;
  defaultNpdDescription: string;
  defaultTechnicalDescription: string;
};

export type FlagsAdminScreenProps = {
  labels: FlagsAdminLabels;
  flags: FeatureFlagRow[];
  state?: PageState;
  posthogUrl: string;
  authorizationPreflight: FlagAuthorizationPreflight;
  openModal?: (modalId: 'flagEdit' | 'promoteToL2', payload?: { flag: FeatureFlagRow }) => void;
  onToggleFlag?: (code: string, enabled: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
};

function formatCount(template: string, count: number) {
  return template.replace('{count}', String(count));
}

function flagDescription(flag: FeatureFlagRow) {
  return flag.description ?? flag.desc ?? '';
}

function flagEnabled(flag: FeatureFlagRow) {
  return Boolean(flag.enabled ?? flag.on);
}

function flagRollout(flag: FeatureFlagRow) {
  return Number(flag.rolloutPercent ?? flag.rollout ?? 0);
}

function flagUpdated(flag: FeatureFlagRow) {
  return flag.updatedAt ?? flag.updated ?? '—';
}

function tabForTenant(tab: TabKey) {
  if (tab === 'local') return 'L2-local';
  if (tab === 'tenant') return 'L3-tenant';
  return 'L1-core';
}

export default function FlagsAdminScreen({
  labels,
  flags,
  state = 'ready',
  posthogUrl,
  authorizationPreflight,
  openModal,
  onToggleFlag,
}: FlagsAdminScreenProps) {
  const [tab, setTab] = React.useState<TabKey>('core');
  const [query, setQuery] = React.useState('');
  const [enabledByCode, setEnabledByCode] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(flags.map((flag) => [flag.code, flagEnabled(flag)])),
  );
  const [preflightBlocked, setPreflightBlocked] = React.useState(false);

  React.useEffect(() => {
    setEnabledByCode(Object.fromEntries(flags.map((flag) => [flag.code, flagEnabled(flag)])));
  }, [flags]);

  const core = flags.filter((flag) => flag.tenant === 'L1-core');
  const local = flags.filter((flag) => flag.tenant === 'L2-local');
  const tenant = flags.filter((flag) => flag.tenant === 'L3-tenant');
  const sectionTitle = tab === 'local' ? labels.localFlags : tab === 'tenant' ? labels.tenantFlags : labels.coreFlags;
  const selectedTenant = tabForTenant(tab);
  const selectedFlags = flags.filter((flag) => flag.tenant === selectedTenant);
  const normalizedQuery = query.toLowerCase().trim();
  const filteredFlags = selectedFlags.filter((flag) => {
    if (!normalizedQuery) return true;
    return `${flag.code} ${flagDescription(flag)}`.toLowerCase().includes(normalizedQuery);
  });

  const handleToggle = (flag: FeatureFlagRow, next: boolean) => {
    if (flag.code === authorizationPreflight.flagCode && next && !authorizationPreflight.canEnable) {
      setPreflightBlocked(true);
      return;
    }
    setPreflightBlocked(false);
    setEnabledByCode((current) => ({ ...current, [flag.code]: next }));
    void onToggleFlag?.(flag.code, next);
  };

  const handleEdit = (flag: FeatureFlagRow) => {
    openModal?.(flag.tier === 'L1' ? 'promoteToL2' : 'flagEdit', { flag });
  };

  if (state === 'loading') {
    return (
      <main data-testid="settings-flags-admin-screen" className="space-y-4 p-6" aria-busy="true">
        <section data-testid="settings-flags-loading-state" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {labels.loading}
        </section>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main data-testid="settings-flags-admin-screen" className="space-y-4 p-6">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {labels.error}
        </div>
      </main>
    );
  }

  return (
    <main data-testid="settings-flags-admin-screen" className="space-y-4 p-6">
      <header data-region="page-head" className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{labels.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{labels.subtitle}</p>
        </div>
        <a
          href={posthogUrl}
          className="btn btn-secondary inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800"
        >
          {labels.openPostHog}
        </a>
      </header>

      <div
        data-region="preflight-notice"
        role="alert"
        className={[
          'rounded-lg border p-3 text-xs',
          preflightBlocked ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-blue-200 bg-blue-50 text-blue-900',
        ].join(' ')}
      >
        {preflightBlocked ? (
          <div className="space-y-2">
            <p className="font-semibold">{labels.vSet43Title}</p>
            <p>{labels.vSet43Body}</p>
            <a href={authorizationPreflight.configureHref} className="font-medium underline underline-offset-2">
              {labels.configureAuthorization}
            </a>
          </div>
        ) : (
          labels.preflightNotice
        )}
      </div>

      <div data-region="flag-tabs-search" className="flex items-center gap-2">
        <Button type="button" className={tab === 'core' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setTab('core')}>
          {formatCount(labels.coreTab, core.length)}
        </Button>
        <Button type="button" className={tab === 'local' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setTab('local')}>
          {formatCount(labels.localTab, local.length)}
        </Button>
        <Button type="button" className={tab === 'tenant' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setTab('tenant')}>
          {formatCount(labels.tenantTab, tenant.length)}
        </Button>
        <span className="flex-1" aria-hidden="true" />
        <Input
          type="search"
          placeholder={labels.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-80 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <section data-region="flags-table" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-950">{sectionTitle}</h2>
        {state === 'empty' || filteredFlags.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600">{labels.empty}</p>
        ) : (
          <Table aria-label={sectionTitle}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.flagCode}</TableHead>
                <TableHead scope="col">{labels.description}</TableHead>
                <TableHead scope="col">{labels.status}</TableHead>
                <TableHead scope="col" style={{ width: 100 }}>{labels.rollout}</TableHead>
                <TableHead scope="col">{labels.updated}</TableHead>
                <TableHead scope="col">{labels.consumers}</TableHead>
                <TableHead scope="col">{labels.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFlags.map((flag) => {
                const isEnabled = Boolean(enabledByCode[flag.code]);
                const rollout = flagRollout(flag);
                return (
                  <TableRow key={flag.code}>
                    <TableCell className="font-mono text-[11px] font-semibold">{flag.code}</TableCell>
                    <TableCell className="max-w-xs text-xs text-slate-600">{flagDescription(flag)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={isEnabled ? 'success' : 'muted'} className="text-[10px]">
                          {isEnabled ? labels.on : labels.off}
                        </Badge>
                        <Switch
                          checked={isEnabled}
                          aria-label={flag.code}
                          onCheckedChange={(next) => handleToggle(flag, next)}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1 w-12 overflow-hidden rounded-sm bg-slate-100" aria-hidden="true">
                          <div className="h-full bg-blue-600" style={{ width: `${rollout}%` }} />
                        </div>
                        <span className="font-mono text-[11px]">{rollout}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-slate-500">{flagUpdated(flag)}</TableCell>
                    <TableCell className="text-[11px] text-slate-500">{flag.consumers?.join(', ') || labels.noConsumers}</TableCell>
                    <TableCell>
                      <Button type="button" className="btn-secondary btn-sm" onClick={() => handleEdit(flag)}>
                        {labels.edit}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </main>
  );
}
