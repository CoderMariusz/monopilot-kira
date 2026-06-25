import React from 'react';
import { getTranslations } from 'next-intl/server';

import { getTenantVariations } from '../../../../../../actions/tenant/get';
import {
  NPD_POST_RELEASE_EDIT_POLICY,
  TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY,
  readAuthorizationPolicy,
  type AuthorizationPolicyRow,
  type QueryClient,
} from '../../../../../../actions/authorization/preflight';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { Badge } from '@monopilot/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export const dynamic = 'force-dynamic';

type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

type DeptOverride = {
  id: string;
  action: 'split' | 'merge' | 'add';
  source?: string;
  targets: string[];
  columnCount: number;
  updatedAt: string;
  updatedBy: string;
};

type RuleVariantOverride = {
  code: string;
  currentVariant: string;
  availableVariants: string[];
  lastChangedAt: string | null;
};

type AuthorizationPolicySummary = {
  code: typeof NPD_POST_RELEASE_EDIT_POLICY | typeof TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY;
  label: string;
  description: string;
  status: 'Enabled' | 'Misconfigured' | 'Disabled';
  updatedAt: string | null;
};

type FeatureFlagSummary = {
  code: string;
  description: string;
  enabled: boolean;
};

type TenantVariationsDashboardProps = {
  params?: Promise<{ locale: string }>;
  state?: PageState;
  deptOverrides?: DeptOverride[];
  ruleVariantOverrides?: RuleVariantOverride[];
  schemaExtensionsL3?: number;
  lastUpgradeAt?: string | null;
  authorizationPolicies?: AuthorizationPolicySummary[];
  featureFlags?: FeatureFlagSummary[];
};

type Labels = {
  title: string;
  subtitle: string;
  deptOverridesActive: string;
  ruleVariantsCustomized: string;
  schemaExtensionsL3: string;
  lastUpgrade: string;
  never: string;
  deptOverrides: string;
  ruleVariantOverrides: string;
  featureFlags: string;
  authorizationPolicies: string;
  editDeptTaxonomy: string;
  edit: string;
  changeVariants: string;
  viewUpgradeHistory: string;
  openAuthorizationPolicies: string;
  loading: string;
  empty: string;
  error: string;
  permissionDenied: string;
  breadcrumb: string;
  activeDeptVariants: string;
  configurableCustomized: string;
  orgSpecificColumnAdditions: string;
  ruleEngineRollout: string;
  authorizationUpdated: string;
  featureFlagsSubtitle: string;
  noTenantLocalFeatureFlags: string;
  activeBaselineEmpty: string;
  deptAction: string;
  sourceTargets: string;
  columnsAffected: string;
  lastModified: string;
  by: string;
  ruleCode: string;
  currentVariant: string;
  availableVariants: string;
  lastChanged: string;
  neverChanged: string;
  enabled: string;
  disabled: string;
  updatedBySystem: string;
  tenantLocalFeatureFlag: string;
};

const DEFAULT_LABELS: Labels = {
  title: 'Tenant Configuration',
  subtitle: 'Overview of all active L2 configuration overrides for this tenant.',
  deptOverridesActive: 'Dept Overrides Active',
  ruleVariantsCustomized: 'Rule Variants Customized',
  schemaExtensionsL3: 'Schema Extensions L3',
  lastUpgrade: 'Last Upgrade',
  never: 'Never',
  deptOverrides: 'Department overrides',
  ruleVariantOverrides: 'Rule variant overrides',
  featureFlags: 'Feature flags (L2 local)',
  authorizationPolicies: 'Authorization policies',
  editDeptTaxonomy: 'Edit Dept Taxonomy',
  edit: 'Edit',
  changeVariants: 'Change Variants',
  viewUpgradeHistory: 'View Upgrade History',
  openAuthorizationPolicies: 'Authorization Policies',
  loading: 'Loading tenant configuration…',
  empty: 'No tenant variations configured. Your organization uses the standard baseline.',
  error: 'Unable to load tenant configuration.',
  permissionDenied: 'You do not have permission to view tenant configuration.',
  breadcrumb: 'Settings / Tenant',
  activeDeptVariants: 'Active L2 dept variants.',
  configurableCustomized: '{configurable} configurable · {customized} customized',
  orgSpecificColumnAdditions: 'Org-specific column additions.',
  ruleEngineRollout: 'rule_engine v2 progressive rollout.',
  authorizationUpdated: 'Updated {date}',
  featureFlagsSubtitle: 'Per-tenant Phase 2/3 toggles. Full flag management is in the Feature Flags screen.',
  noTenantLocalFeatureFlags: 'No tenant-local feature flags configured.',
  activeBaselineEmpty: 'No tenant variations configured. Your organization uses the standard baseline.',
  deptAction: 'Action',
  sourceTargets: 'Source → Targets',
  columnsAffected: 'Columns affected',
  lastModified: 'Last modified',
  by: 'By',
  ruleCode: 'Rule Code',
  currentVariant: 'Current Variant',
  availableVariants: 'Available Variants',
  lastChanged: 'Last Changed',
  neverChanged: 'Never changed',
  enabled: 'Enabled',
  disabled: 'Disabled',
  updatedBySystem: 'system',
  tenantLocalFeatureFlag: 'Tenant-local feature flag.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof Labels>;

const DEFAULT_AUTHORIZATION_POLICIES: AuthorizationPolicySummary[] = [
  {
    code: NPD_POST_RELEASE_EDIT_POLICY,
    label: 'NPD post-release edit authorization',
    description: 'Requires authorized request and approval before released product/BOM edits.',
    status: 'Misconfigured',
    updatedAt: null,
  },
  {
    code: TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY,
    label: 'Technical product spec approval',
    description: 'Blocks factory use until the new technical spec version is approved.',
    status: 'Misconfigured',
    updatedAt: null,
  },
];

const FALLBACK_FEATURE_FLAGS: FeatureFlagSummary[] = [
  {
    code: 'npd.post_release_edit.enabled',
    description: 'Allow authorized NPD users to request post-release edits.',
    enabled: false,
  },
];

async function buildLabels(locale: string): Promise<Labels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.tenant_variations' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        labels[key] = t(key);
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as Labels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

async function loadTenantDashboardData(): Promise<{
  state: PageState;
  deptOverrides: DeptOverride[];
  ruleVariantOverrides: RuleVariantOverride[];
  featureFlags: FeatureFlagSummary[];
}> {
  const result = await getTenantVariations();
  if (!result.ok) {
    return {
      state: result.error === 'forbidden' ? 'permission_denied' : 'error',
      deptOverrides: [],
      ruleVariantOverrides: [],
      featureFlags: [],
    };
  }

  return {
    state: 'ready',
    deptOverrides: parseDeptOverrides(result.data.deptOverrides),
    ruleVariantOverrides: parseRuleVariantOverrides(result.data.ruleVariantOverrides),
    featureFlags: parseFeatureFlags(result.data.featureFlags),
  };
}

async function loadAuthorizationPolicies(labels: Labels): Promise<AuthorizationPolicySummary[]> {
  try {
    return await withOrgContext(async ({ client }) => {
      const queryClient = client as QueryClient;
      const [npd, technical] = await Promise.all([
        readAuthorizationPolicy(queryClient, NPD_POST_RELEASE_EDIT_POLICY),
        readAuthorizationPolicy(queryClient, TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY),
      ]);
      return [
        summarizePolicy(npd, DEFAULT_AUTHORIZATION_POLICIES[0]),
        summarizePolicy(technical, DEFAULT_AUTHORIZATION_POLICIES[1]),
      ];
    });
  } catch {
    return DEFAULT_AUTHORIZATION_POLICIES.map((policy) => ({ ...policy, description: policy.description || labels.error }));
  }
}

type TenantUpgradeMetricsRow = {
  schema_extensions_count?: number | string | null;
  upgraded_at?: string | Date | null;
};

// Real-data read for the two KPIs that were previously hardcoded
// (schemaExtensionsL3 = 0, lastUpgradeAt = null). Sources the live
// tenant_variations.schema_extensions_count + upgraded_at columns
// (migration 040-tenant-l2.sql) via withOrgContext / app.current_org_id().
async function loadTenantUpgradeMetrics(): Promise<{ schemaExtensionsL3: number; lastUpgradeAt: string | null }> {
  try {
    return await withOrgContext(async ({ client }) => {
      const queryClient = client as QueryClient;
      const { rows } = await queryClient.query<TenantUpgradeMetricsRow>(
        `select schema_extensions_count, upgraded_at
           from public.tenant_variations
          where org_id = app.current_org_id()
          limit 1`,
      );
      const row = rows[0] ?? {};
      const count = Number(row.schema_extensions_count ?? 0);
      return {
        schemaExtensionsL3: Number.isFinite(count) && count > 0 ? count : 0,
        lastUpgradeAt: normalizeOptionalDate(row.upgraded_at),
      };
    });
  } catch {
    return { schemaExtensionsL3: 0, lastUpgradeAt: null };
  }
}

function summarizePolicy(row: AuthorizationPolicyRow | null, fallback: AuthorizationPolicySummary): AuthorizationPolicySummary {
  if (!row) return fallback;
  const enabled = row.is_enabled === true || row.enabled === true;
  const blockers = fallback.code === NPD_POST_RELEASE_EDIT_POLICY
    ? [
        !row.request_permissions?.length,
        !row.authorize_permissions?.length,
        !row.approver_role_codes?.length,
        row.requires_new_version !== true,
      ]
    : [
        !row.approval_gate_rule_code,
        Number(row.min_approvers ?? 0) < 1,
        !row.approver_role_codes?.length,
      ];
  return {
    ...fallback,
    status: enabled ? (blockers.some(Boolean) ? 'Misconfigured' : 'Enabled') : 'Disabled',
    updatedAt: normalizeOptionalDate((row as { updated_at?: unknown; updatedAt?: unknown }).updated_at ?? (row as { updatedAt?: unknown }).updatedAt),
  };
}

export default async function TenantVariationsDashboardPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as TenantVariationsDashboardProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const labels = await buildLabels(locale);
  const loaded = props.deptOverrides || props.ruleVariantOverrides || props.featureFlags
    ? {
        state: props.state ?? 'ready',
        deptOverrides: props.deptOverrides ?? [],
        ruleVariantOverrides: props.ruleVariantOverrides ?? [],
        featureFlags: props.featureFlags ?? FALLBACK_FEATURE_FLAGS,
      }
    : await loadTenantDashboardData();

  const effectiveState = props.state ?? loaded.state;
  const authorizationPolicies =
    effectiveState === 'ready'
      ? props.authorizationPolicies ?? await loadAuthorizationPolicies(labels)
      : DEFAULT_AUTHORIZATION_POLICIES;

  // Wire the previously-hardcoded KPIs from the live tenant_variations row when
  // the caller did not inject deterministic test props.
  const needsLiveMetrics =
    effectiveState === 'ready' && props.schemaExtensionsL3 === undefined && props.lastUpgradeAt === undefined;
  const liveMetrics = needsLiveMetrics ? await loadTenantUpgradeMetrics() : null;

  return (
    <TenantVariationsDashboardScreen
      labels={labels}
      state={effectiveState}
      deptOverrides={loaded.deptOverrides}
      ruleVariantOverrides={loaded.ruleVariantOverrides}
      schemaExtensionsL3={props.schemaExtensionsL3 ?? liveMetrics?.schemaExtensionsL3 ?? 0}
      lastUpgradeAt={props.lastUpgradeAt ?? liveMetrics?.lastUpgradeAt ?? null}
      authorizationPolicies={authorizationPolicies}
      featureFlags={loaded.featureFlags}
    />
  );
}

function TenantVariationsDashboardScreen({
  labels,
  state,
  deptOverrides,
  ruleVariantOverrides,
  schemaExtensionsL3,
  lastUpgradeAt,
  authorizationPolicies,
  featureFlags,
}: {
  labels: Labels;
  state: PageState;
  deptOverrides: DeptOverride[];
  ruleVariantOverrides: RuleVariantOverride[];
  schemaExtensionsL3: number;
  lastUpgradeAt: string | null;
  authorizationPolicies: AuthorizationPolicySummary[];
  featureFlags: FeatureFlagSummary[];
}) {
  if (state === 'loading') return <StatusShell labels={labels} message={labels.loading} tone="info" />;
  if (state === 'error') return <StatusShell labels={labels} message={labels.error} tone="danger" />;
  if (state === 'permission_denied') return <StatusShell labels={labels} message={labels.permissionDenied} tone="warning" />;

  const hasTenantData = deptOverrides.length > 0 || ruleVariantOverrides.length > 0 || featureFlags.length > 0;
  if (state === 'empty' || !hasTenantData) return <StatusShell labels={labels} message={labels.empty} tone="muted" />;

  // Parity with tenant-variations.jsx:50-51 — "Rule variants" KPI shows the
  // count of *customized* variants (current selection differs from the baseline
  // first available variant), not the total configurable count.
  const configurableCount = ruleVariantOverrides.length;
  const customizedCount = ruleVariantOverrides.filter(
    (row) => row.availableVariants.length > 0 && row.currentVariant !== row.availableVariants[0],
  ).length;

  return (
    <main
      data-testid="settings-tenant-variations-screen"
      data-route="/settings/tenant"
      data-screen="tenant-variations-dashboard"
      data-ux-source="SET-060"
      className="space-y-6"
    >
      <header data-region="page-head" className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{labels.breadcrumb}</div>
          <h1 className="page-title">{labels.title}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        <a className="btn btn-secondary btn-sm" href="/settings/tenant/history">
          {labels.viewUpgradeHistory} →
        </a>
      </header>

      <section aria-label="Tenant variation KPI summary" className="grid gap-3 md:grid-cols-4">
        <KpiCard label={labels.deptOverridesActive} value={deptOverrides.length} sub={labels.activeDeptVariants} accent="info" />
        <KpiCard
          label={labels.ruleVariantsCustomized}
          value={customizedCount}
          sub={labels.configurableCustomized.replace('{configurable}', String(configurableCount)).replace('{customized}', String(customizedCount))}
          accent="warning"
        />
        <KpiCard label={labels.schemaExtensionsL3} value={schemaExtensionsL3} sub={labels.orgSpecificColumnAdditions} accent="secondary" />
        <KpiCard label={labels.lastUpgrade} value={formatDate(lastUpgradeAt, labels.never)} sub={labels.ruleEngineRollout} accent="muted" />
      </section>

      <DashboardSection
        title={labels.deptOverrides}
        count={deptOverrides.length}
        action={<NavigationButton label={labels.editDeptTaxonomy} href="/settings/tenant/depts" />}
      >
        <DeptOverridesTable rows={deptOverrides} labels={labels} />
      </DashboardSection>

      <DashboardSection
        title={labels.ruleVariantOverrides}
        count={ruleVariantOverrides.length}
        action={<a className="btn btn-secondary btn-sm" href="/settings/tenant/rules">{labels.changeVariants} →</a>}
      >
        <RuleVariantsTable rows={ruleVariantOverrides} labels={labels} />
      </DashboardSection>

      <DashboardSection
        title={labels.authorizationPolicies}
        action={<a className="btn btn-secondary btn-sm" href="/settings/authorization">{labels.openAuthorizationPolicies} →</a>}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {authorizationPolicies.map((policy) => (
            <div
              key={policy.code}
              className="rounded-[var(--radius)] border p-4"
              style={
                policy.status === 'Misconfigured'
                  ? { borderColor: 'var(--amber)', background: 'var(--amber-050a)' }
                  : { borderColor: 'var(--border)', background: '#fff' }
              }
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-mono text-xs text-muted-foreground">{policy.code}</div>
                    <div className="text-sm font-semibold">{policy.label}</div>
                    <p className="text-xs text-muted-foreground">{policy.description}</p>
                  </div>
                  <PolicyStatusBadge status={policy.status} labels={labels} />
                </div>
                <div className="font-mono text-xs text-muted-foreground">{labels.authorizationUpdated.replace('{date}', formatDate(policy.updatedAt, labels.never))}</div>
              </div>
            </div>
          ))}
        </div>
      </DashboardSection>

      <DashboardSection title={labels.featureFlags} subtitle={labels.featureFlagsSubtitle}>
        <div className="space-y-2">
          {featureFlags.length === 0 ? (
            <p className="text-sm text-muted-foreground">{labels.noTenantLocalFeatureFlags}</p>
          ) : featureFlags.map((flag) => (
            <div key={flag.code} className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 text-sm">
              <div>
                <div className="font-mono text-xs font-semibold">{flag.code}</div>
                <p className="text-xs text-muted-foreground">{flag.description}</p>
              </div>
              <span className={`badge ${flag.enabled ? 'badge-green' : 'badge-gray'}`}>{flag.enabled ? labels.enabled : labels.disabled}</span>
            </div>
          ))}
        </div>
      </DashboardSection>
    </main>
  );
}

function KpiCard({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub: string; accent: 'info' | 'warning' | 'secondary' | 'muted' }) {
  // Design-system KPI tile: 1px border + 6px radius + 3px coloured bottom accent,
  // value Inter 26/700 (.kpi-value), never mono. info→blue(default), warning→amber.
  const accentClass = accent === 'warning' ? ' amber' : '';
  return (
    <div className={`kpi${accentClass}`} data-testid="settings-tenant-kpi" data-accent={accent}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <p className="kpi-change muted">{sub}</p>
    </div>
  );
}

function DashboardSection({
  title,
  count,
  subtitle,
  action,
  children,
}: {
  title: string;
  count?: number;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const heading = count === undefined ? title : `${title} (${count})`;
  return (
    <section role="region" aria-label={heading} className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title">{heading}</h2>
          {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function DeptOverridesTable({ rows, labels }: { rows: DeptOverride[]; labels: Labels }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{labels.activeBaselineEmpty}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.deptAction}</TableHead>
          <TableHead>{labels.sourceTargets}</TableHead>
          <TableHead>{labels.columnsAffected}</TableHead>
          <TableHead>{labels.lastModified}</TableHead>
          <TableHead>{labels.by}</TableHead>
          <TableHead className="sr-only">{labels.edit}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell><DeptActionBadge action={row.action} /></TableCell>
            <TableCell>{[row.source ?? '—', ...row.targets].join(' → ')}</TableCell>
            <TableCell className="font-mono">{row.columnCount}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{formatDate(row.updatedAt, labels.never)}</TableCell>
            <TableCell>{row.updatedBy}</TableCell>
            <TableCell className="text-right">
              <a
                className="text-sm font-medium text-blue-700 underline"
                href={`/settings/tenant/depts?dept=${encodeURIComponent(row.source ?? row.targets[0] ?? '')}`}
                aria-label={`${labels.edit} ${row.source ?? row.targets.join(' ')}`}
              >
                {labels.edit} →
              </a>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RuleVariantsTable({ rows, labels }: { rows: RuleVariantOverride[]; labels: Labels }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.ruleCode}</TableHead>
          <TableHead>{labels.currentVariant}</TableHead>
          <TableHead>{labels.availableVariants}</TableHead>
          <TableHead>{labels.lastChanged}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.code}>
            <TableCell className="font-mono text-xs font-semibold">{row.code}</TableCell>
            <TableCell><Badge variant="warning">{row.currentVariant}</Badge></TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {row.availableVariants.map((variant) => (
                  <Badge key={variant} variant={variant === row.currentVariant ? 'info' : 'muted'} className="font-mono text-[10px]">{variant}</Badge>
                ))}
              </div>
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{formatDate(row.lastChangedAt, labels.neverChanged)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DeptActionBadge({ action }: { action: DeptOverride['action'] }) {
  const variant = action === 'split' ? 'warning' : action === 'merge' ? 'info' : 'success';
  return <Badge variant={variant} className="text-[10px] uppercase">{action}</Badge>;
}

function PolicyStatusBadge({ status, labels }: { status: AuthorizationPolicySummary['status']; labels: Labels }) {
  const variant = status === 'Enabled' ? 'success' : status === 'Misconfigured' ? 'warning' : 'muted';
  const label = status === 'Enabled' ? labels.enabled : status === 'Disabled' ? labels.disabled : status;
  return <Badge variant={variant}>{label}</Badge>;
}

function NavigationButton({ label, href }: { label: string; href: string }) {
  return <a className="btn btn-secondary btn-sm" href={href}>{label} →</a>;
}

function StatusShell({ labels, message, tone }: { labels: Labels; message: string; tone: 'info' | 'danger' | 'warning' | 'muted' }) {
  return (
    <main
      data-testid="settings-tenant-variations-screen"
      data-route="/settings/tenant"
      data-screen="tenant-variations-dashboard"
      data-ux-source="SET-060"
      className="space-y-4"
    >
      <header data-region="page-head" className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{labels.title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{labels.subtitle}</p>
      </header>
      <div role="alert" data-tone={tone} className="rounded-md border bg-card px-4 py-3 text-sm">
        {message}
      </div>
    </main>
  );
}

function parseDeptOverrides(value: unknown): DeptOverride[] {
  if (Array.isArray(value)) return value.flatMap(normalizeDeptOverride);
  if (!value || typeof value !== 'object') return [];
  const actions = (value as { actions?: unknown }).actions;
  if (!actions || typeof actions !== 'object') return [];
  return Object.entries(actions as Record<string, unknown>).flatMap(([action, entries]) => {
    if (!Array.isArray(entries) && (!entries || typeof entries !== 'object')) return [];
    const rows = Array.isArray(entries) ? entries : Object.values(entries as Record<string, unknown>);
    return rows.flatMap((entry, index) => normalizeDeptOverride({ ...(entry as Record<string, unknown>), action, id: `${action}-${index}` }));
  });
}

function normalizeDeptOverride(value: unknown): DeptOverride[] {
  if (!value || typeof value !== 'object') return [];
  const row = value as Record<string, unknown>;
  const action = row.action === 'split' || row.action === 'merge' || row.action === 'add' ? row.action : null;
  if (!action) return [];
  const targetsValue = row.targets ?? row.targetDepartmentCodes ?? row.target_department_codes ?? row.target;
  const targets = Array.isArray(targetsValue) ? targetsValue.map(String) : typeof targetsValue === 'string' ? [targetsValue] : [];
  return [{
    id: String(row.id ?? `${action}-${row.source ?? row.sourceDepartmentCode ?? targets.join('-')}`),
    action,
    source: typeof row.source === 'string' ? row.source : typeof row.sourceDepartmentCode === 'string' ? row.sourceDepartmentCode : undefined,
    targets,
    columnCount: Number(row.columnCount ?? row.column_count ?? row.columnsAffected ?? 0),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? row.updated ?? ''),
    updatedBy: String(row.updatedBy ?? row.by ?? row.updated_by ?? DEFAULT_LABELS.updatedBySystem),
  }];
}

function parseRuleVariantOverrides(value: unknown): RuleVariantOverride[] {
  if (Array.isArray(value)) return value.flatMap(normalizeRuleVariantOverride);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([code, variant]) => {
    if (typeof variant === 'string') {
      return [{ code, currentVariant: variant, availableVariants: [variant], lastChangedAt: null }];
    }
    return normalizeRuleVariantOverride({ ...(variant as Record<string, unknown>), code });
  });
}

function normalizeRuleVariantOverride(value: unknown): RuleVariantOverride[] {
  if (!value || typeof value !== 'object') return [];
  const row = value as Record<string, unknown>;
  const code = typeof row.code === 'string' ? row.code : null;
  if (!code) return [];
  const available = row.availableVariants ?? row.available_variants ?? row.available;
  return [{
    code,
    currentVariant: String(row.currentVariant ?? row.current_variant ?? row.current ?? 'v1'),
    availableVariants: Array.isArray(available) ? available.map(String) : [String(row.currentVariant ?? row.current_variant ?? row.current ?? 'v1')],
    lastChangedAt: typeof row.lastChangedAt === 'string' ? row.lastChangedAt : typeof row.last_changed_at === 'string' ? row.last_changed_at : null,
  }];
}

function parseFeatureFlags(value: unknown): FeatureFlagSummary[] {
  if (Array.isArray(value)) return value.flatMap(normalizeFeatureFlag);
  if (!value || typeof value !== 'object') return [];
  const rows = Object.entries(value as Record<string, unknown>).flatMap(([code, flag]) => {
    if (typeof flag === 'boolean') return [{ code, description: DEFAULT_LABELS.tenantLocalFeatureFlag, enabled: flag }];
    return normalizeFeatureFlag({ ...(flag as Record<string, unknown>), code });
  });
  return rows;
}

function normalizeFeatureFlag(value: unknown): FeatureFlagSummary[] {
  if (!value || typeof value !== 'object') return [];
  const row = value as Record<string, unknown>;
  const code = typeof row.code === 'string' ? row.code : null;
  if (!code) return [];
  return [{
    code,
    description: typeof row.description === 'string' ? row.description : DEFAULT_LABELS.tenantLocalFeatureFlag,
    enabled: Boolean(row.enabled),
  }];
}

function normalizeOptionalDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

function formatDate(value: string | null, fallback: string) {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toISOString().slice(0, 10);
}
