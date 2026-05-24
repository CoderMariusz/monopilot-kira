import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import { PageHeader } from '@monopilot/ui/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export const dynamic = 'force-dynamic';

type RuleVariant = {
  version: 'v1' | 'v2' | `v${number}`;
  label?: string;
  requiresNewVersion?: boolean;
  technicalApprovalRequired?: boolean;
};

type RuleVariantRow = {
  code: string;
  ruleType: 'gate' | 'workflow' | 'validation' | 'calculation' | 'cascading' | 'conditional';
  availableVariants: RuleVariant[];
  currentVariant: string;
  lastChangedAt: string | null;
  readOnly?: boolean;
  linkedAuthorizationPolicyHref?: string;
};

type SaveVariantOverrides = (input: {
  ruleVariantOverrides: Record<string, string>;
}) => Promise<{ ok: true } | { ok: false; code?: string; error?: string; message?: string }>;

type RuleVariantSelectorProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  rules?: RuleVariantRow[];
  saveRuleVariantOverrides?: SaveVariantOverrides;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
};

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type RuleDefinitionVersionRow = {
  rule_code: string;
  rule_type: string;
  version: number | string;
  active_to: string | Date | null;
};

type TenantVariationRow = {
  rule_variant_overrides?: unknown;
};

type Labels = {
  title: string;
  subtitle: string;
  advisory: string;
  tableTitle: string;
  ruleCode: string;
  ruleType: string;
  availableVariants: string;
  currentSelection: string;
  lastChanged: string;
  saveAll: string;
  saving: string;
  saved: string;
  loading: string;
  empty: string;
  error: string;
  permissionDenied: string;
  readOnlyGate: string;
  authorizationPolicies: string;
  neverChanged: string;
};

const DEFAULT_LABELS: Labels = {
  title: 'Rule Variant Selection',
  subtitle: 'Some rules have multiple versions. Select the variant that applies to your organization.',
  advisory: 'Rule variants are tested configurations. Contact your implementation team before switching from the default.',
  tableTitle: 'Rule variant selections',
  ruleCode: 'Rule Code',
  ruleType: 'Rule Type',
  availableVariants: 'Available Variants',
  currentSelection: 'Current Selection',
  lastChanged: 'Last Changed',
  saveAll: 'Save All Selections',
  saving: 'Saving rule variant selections…',
  saved: 'Rule variant selections saved',
  loading: 'Loading rule variant selections…',
  empty: 'No rule variants are available for this tenant.',
  error: 'Unable to load rule variant selections.',
  permissionDenied: 'View only — contact your owner to change rule variants.',
  readOnlyGate: 'read-only gate',
  authorizationPolicies: 'Authorization Policies',
  neverChanged: 'Never changed',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof Labels>;

const FALLBACK_ROWS: RuleVariantRow[] = [
  {
    code: 'technical_product_spec_approval_gate_v1',
    ruleType: 'gate',
    availableVariants: [
      {
        version: 'v1',
        label: 'Technical approval required',
        requiresNewVersion: true,
        technicalApprovalRequired: true,
      },
    ],
    currentVariant: 'v1',
    lastChangedAt: null,
    readOnly: true,
    linkedAuthorizationPolicyHref: '/en/settings/authorization?policy=technical_product_spec_approval',
  },
];

async function buildLabels(locale: string): Promise<Labels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.rule_variant_selector' });
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

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function versionLabel(version: number | string): `v${number}` {
  const numeric = typeof version === 'number' ? version : Number(String(version).replace(/^v/i, ''));
  return `v${Number.isFinite(numeric) && numeric > 0 ? numeric : 1}` as `v${number}`;
}

function asOverrides(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, variant]) => typeof variant === 'string'),
  ) as Record<string, string>;
}

async function readRuleVariantRows(locale: string): Promise<{ state: 'ready' | 'error'; rows: RuleVariantRow[] }> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
      await requirePermission({ client, userId, orgId, permission: 'settings.rules.view' });
      const [rulesResult, variationsResult] = await Promise.all([
        client.query<RuleDefinitionVersionRow>(
          `select rule_code, rule_type, version, active_to
             from public.rule_definitions
            where org_id = app.current_org_id()
            order by rule_code asc, version asc`,
        ),
        client.query<TenantVariationRow>(
          `select rule_variant_overrides
             from public.tenant_variations
            where org_id = app.current_org_id()
            limit 1`,
        ),
      ]);

      const overrides = asOverrides(variationsResult.rows[0]?.rule_variant_overrides);
      const grouped = new Map<string, RuleDefinitionVersionRow[]>();
      for (const row of rulesResult.rows) {
        grouped.set(row.rule_code, [...(grouped.get(row.rule_code) ?? []), row]);
      }

      const rows = Array.from(grouped.entries()).map(([code, versions]): RuleVariantRow => {
        const active = versions.find((version) => version.active_to == null) ?? versions[versions.length - 1];
        const activeVariant = versionLabel(active.version);
        const isTechnicalGate = code === 'technical_product_spec_approval_gate_v1';
        return {
          code,
          ruleType: normalizeRuleType(active.rule_type),
          availableVariants: versions.map((version) => ({
            version: versionLabel(version.version),
            label: version.active_to == null ? 'Active deployed version' : 'Historical deployed version',
            requiresNewVersion: isTechnicalGate,
            technicalApprovalRequired: isTechnicalGate,
          })),
          currentVariant: overrides[code] ?? activeVariant,
          lastChangedAt: null,
          readOnly: isTechnicalGate,
          linkedAuthorizationPolicyHref: isTechnicalGate
            ? `/${locale}/settings/authorization?policy=technical_product_spec_approval`
            : undefined,
        };
      });

      if (!rows.some((row) => row.code === 'technical_product_spec_approval_gate_v1')) {
        rows.push({
          ...FALLBACK_ROWS[0],
          linkedAuthorizationPolicyHref: `/${locale}/settings/authorization?policy=technical_product_spec_approval`,
        });
      }

      return { state: 'ready', rows };
    });
  } catch {
    return { state: 'error', rows: FALLBACK_ROWS };
  }
}

function normalizeRuleType(ruleType: string): RuleVariantRow['ruleType'] {
  if (ruleType === 'gate' || ruleType === 'workflow' || ruleType === 'cascading' || ruleType === 'conditional') return ruleType;
  if (ruleType === 'calculation') return 'calculation';
  return 'validation';
}

function formatDate(value: string | null, labels: Labels) {
  if (!value) return labels.neverChanged;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toISOString().slice(0, 10);
}

function updateStatus(message: string) {
  if (typeof document === 'undefined') return;
  const status = document.getElementById('rule-variant-selector-status');
  if (status) status.textContent = message;
}

function updateAlert(message: string, destructive = false) {
  if (typeof document === 'undefined') return;
  const alert = document.getElementById('rule-variant-selector-alert');
  if (alert) {
    alert.textContent = message;
    alert.className = destructive
      ? 'alert alert-red rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900'
      : 'alert alert-blue rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900';
  }
}

function collectOverrides(formData: FormData, rows: RuleVariantRow[]) {
  const overrides: Record<string, string> = {};
  for (const row of rows) {
    if (row.readOnly) continue;
    const selected = formData.get(`variant:${row.code}`);
    if (typeof selected === 'string' && selected !== row.currentVariant) {
      overrides[row.code] = selected;
    }
  }
  return overrides;
}

async function requirePermission({
  client,
  userId,
  orgId,
  permission,
}: OrgActionContext & { permission: string }): Promise<void> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or r.permissions ? $3)
      limit 1`,
    [userId, orgId, permission],
  );
  if (rows.length === 0) throw new Error('forbidden');
}

function parseVariantVersion(variant: string): number | null {
  const match = /^v([1-9][0-9]*)$/i.exec(variant.trim());
  if (!match) return null;
  return Number(match[1]);
}

async function saveRuleVariantOverridesLive(input: {
  ruleVariantOverrides: Record<string, string>;
}): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  'use server';

  const entries = Object.entries(input.ruleVariantOverrides).filter(([ruleCode, variant]) => ruleCode && variant);
  if (entries.length === 0) return { ok: true };

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requirePermission({ client, userId, orgId, permission: 'settings.org.update' });
      const patch: Record<string, string> = {};
      for (const [ruleCode, variant] of entries) {
        if (ruleCode === 'technical_product_spec_approval_gate_v1') {
          return {
            ok: false,
            code: 'VARIANT_NOT_FOUND',
            message: 'V-SET-31: variant must reference an existing rule_definitions.version',
          };
        }
        const version = parseVariantVersion(variant);
        if (!version) {
          return {
            ok: false,
            code: 'VARIANT_NOT_FOUND',
            message: 'V-SET-31: variant must reference an existing rule_definitions.version',
          };
        }
        const found = await client.query(
          `select 1
             from public.rule_definitions
            where org_id = app.current_org_id()
              and rule_code = $1
              and version = $2
            limit 1`,
          [ruleCode, version],
        );
        if ((found.rowCount ?? found.rows.length) < 1) {
          return {
            ok: false,
            code: 'VARIANT_NOT_FOUND',
            message: 'V-SET-31: variant must reference an existing rule_definitions.version',
          };
        }
        patch[ruleCode] = variant;
      }

      const updated = await client.query(
        `update public.tenant_variations
            set rule_variant_overrides = coalesce(rule_variant_overrides, '{}'::jsonb) || $1::jsonb
          where org_id = app.current_org_id()
          returning rule_variant_overrides`,
        [JSON.stringify(patch)],
      );
      if ((updated.rowCount ?? updated.rows.length) < 1) {
        return { ok: false, code: 'NOT_FOUND', message: 'tenant_variations row not found' };
      }

      await client.query(
        `insert into public.audit_log
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id, after_state, retention_class)
         values ($1::uuid, $2::uuid, 'user', 'tenant_variations.rule_variant.batch_updated', 'tenant_variations', $1, $3::jsonb, 'standard')`,
        [orgId, userId, JSON.stringify({ rule_variant_overrides: patch })],
      );
      revalidatePath('/settings/tenant/rules');
      revalidatePath('/settings/tenant');
      return { ok: true };
    } catch {
      return { ok: false, code: 'VARIANT_NOT_FOUND', message: 'V-SET-31: variant must reference an existing rule_definitions.version' };
    }
  });
}

function createDefaultSaveAction(): SaveVariantOverrides {
  return saveRuleVariantOverridesLive;
}

function renderStateShell(labels: Labels, state: 'loading' | 'empty' | 'error' | 'permission_denied') {
  const body = {
    loading: labels.loading,
    empty: labels.empty,
    error: labels.error,
    permission_denied: labels.permissionDenied,
  }[state];
  const role = state === 'error' || state === 'permission_denied' ? 'alert' : 'status';
  return (
    <main
      data-testid="settings-rule-variant-selector-screen"
      data-route="/settings/tenant/rules"
      data-screen="rule-variant-selector"
      data-ux-source="SET-062"
      className="settings-page settings-page--rule-variant-selector space-y-4"
      aria-busy={state === 'loading'}
    >
      <header data-region="page-head">
        <PageHeader title={labels.title} subtitle={labels.subtitle} />
      </header>
      <Card>
        <CardContent role={role} className="py-6 text-sm text-slate-700">
          {body}
        </CardContent>
      </Card>
    </main>
  );
}

export default async function RuleVariantSelectorPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as RuleVariantSelectorProps;
  const { params, searchParams, rules, saveRuleVariantOverrides, state } = props;
  const { locale } = params ? await params : { locale: 'en' };
  const query = searchParams ? await searchParams : {};
  const labels = await buildLabels(locale);
  const loaded = rules ? { state: 'ready' as const, rows: rules } : await readRuleVariantRows(locale);
  const rows = rules ?? loaded.rows;
  const effectiveState = state ?? loaded.state;
  const forcedRuleCode = single(query.rule_code);
  const forcedVariant = single(query.variant);
  const saveAction = saveRuleVariantOverrides ?? createDefaultSaveAction();

  if (effectiveState === 'loading') return renderStateShell(labels, 'loading');
  if (effectiveState === 'error') return renderStateShell(labels, 'error');
  if (effectiveState === 'permission_denied') return renderStateShell(labels, 'permission_denied');
  if (effectiveState === 'empty' || rows.length === 0) return renderStateShell(labels, 'empty');

  async function submitRuleVariantOverrides(formData: FormData) {
    'use server';

    const ruleVariantOverrides = collectOverrides(formData, rows);
    updateStatus(labels.saving);
    const result = await saveAction({ ruleVariantOverrides });
    if (result.ok === true) {
      updateStatus(labels.saved);
      return;
    }
    const code = result.code ?? result.error ?? 'VARIANT_NOT_FOUND';
    const message = result.message ?? (code === 'VARIANT_NOT_FOUND'
      ? 'V-SET-31: variant must reference an existing rule_definitions.version'
      : 'Unable to save rule variant selections.');
    updateAlert(`${code}: ${message}`, true);
  }

  return (
    <main
      data-testid="settings-rule-variant-selector-screen"
      data-route="/settings/tenant/rules"
      data-screen="rule-variant-selector"
      data-ux-source="SET-062"
      aria-label={labels.title}
      className="settings-page settings-page--rule-variant-selector space-y-4"
    >
      <header data-region="page-head">
        <PageHeader title={labels.title} subtitle={labels.subtitle} />
      </header>

      <div
        id="rule-variant-selector-alert"
        data-region="variant-advisory"
        role="alert"
        className="alert alert-blue rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900"
      >
        {labels.advisory}
      </div>

      <form action={submitRuleVariantOverrides} data-region="variant-selector-form" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{labels.tableTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label={labels.tableTitle}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{labels.ruleCode}</TableHead>
                  <TableHead scope="col">{labels.ruleType}</TableHead>
                  <TableHead scope="col">{labels.availableVariants}</TableHead>
                  <TableHead scope="col">{labels.currentSelection}</TableHead>
                  <TableHead scope="col">{labels.lastChanged}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const forcedValue = row.code === forcedRuleCode && forcedVariant ? forcedVariant : undefined;
                  return (
                    <TableRow key={row.code}>
                      <TableCell className="mono font-semibold align-top">
                        <div>{row.code}</div>
                        {row.readOnly ? <Badge variant="muted" className="mt-1 text-[10px]">{labels.readOnlyGate}</Badge> : null}
                        {row.linkedAuthorizationPolicyHref ? (
                          <div className="mt-1 text-xs">
                            <a className="text-blue-700 underline" href={row.linkedAuthorizationPolicyHref}>{labels.authorizationPolicies}</a>
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top"><Badge variant={row.ruleType === 'gate' ? 'danger' : 'secondary'}>{row.ruleType}</Badge></TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap gap-1">
                          {row.availableVariants.map((variant) => (
                            <Badge key={variant.version} variant={variant.version === row.currentVariant ? 'info' : 'outline'}>
                              {variant.version}{variant.label && !row.readOnly ? ` · ${variant.label}` : ''}
                            </Badge>
                          ))}
                        </div>
                        {row.availableVariants.some((variant) => variant.requiresNewVersion) ? (
                          <div className="mt-1 text-xs text-slate-600">requires_new_version</div>
                        ) : null}
                        {row.availableVariants.some((variant) => variant.technicalApprovalRequired) ? (
                          <div className="mt-1 text-xs text-slate-600">technical approval required</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top">
                        {forcedValue ? <input type="hidden" name={`variant:${row.code}`} value={forcedValue} /> : null}
                        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label={`${row.code} variant selection`}>
                          {row.availableVariants.map((variant) => (
                            <label key={variant.version} className="inline-flex items-center gap-1 text-sm">
                              <input
                                type="radio"
                                name={`variant:${row.code}`}
                                value={variant.version}
                                defaultChecked={!forcedValue && variant.version === row.currentVariant}
                                disabled={row.readOnly}
                                aria-label={`${row.code} ${variant.version}`}
                              />
                              <span className="mono">{variant.version}</span>
                            </label>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="mono text-xs text-slate-600 align-top">{formatDate(row.lastChangedAt, labels)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-3">
          <p id="rule-variant-selector-status" role="status" className="text-sm text-slate-600" aria-live="polite" />
          <Button type="submit" className="btn-primary">
            {labels.saveAll}
          </Button>
        </div>
      </form>
    </main>
  );
}
