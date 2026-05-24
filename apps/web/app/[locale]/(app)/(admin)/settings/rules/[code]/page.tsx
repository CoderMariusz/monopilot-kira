import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import RuleDetailScreen, {
  type RuleDetail,
  type RuleDetailLabels,
  type RuleDetailScreenProps,
  type RuleDiffResult,
  type RuleDryRun,
  type RuleVersion,
} from './rule-detail-screen.client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params?: Promise<{ locale: string; code: string }>;
};

type RuleDetailTestOverrides = Partial<Omit<RuleDetailScreenProps, 'labels'>> & {
  labels?: Partial<RuleDetailLabels>;
};

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type RuleDefinitionRow = {
  id: string;
  rule_code: string;
  rule_type: string;
  tier: string | null;
  definition_json: unknown;
  version: number | string;
  active_from: string | Date;
  active_to: string | Date | null;
  deployed_by: string | null;
  deploy_ref: string | null;
};

type DryRunRow = {
  ran_at: string | Date | null;
  ran_by: string | null;
  sample_input_json: unknown;
  result_json: unknown;
};

const DEFAULT_LABELS: RuleDetailLabels = {
  ruleActions: 'Rule actions',
  backToRegistry: '← Back to registry',
  copyDsl: 'Copy DSL',
  triggerDryRun: 'Trigger dry-run',
  settings: 'Settings',
  rulesRegistry: 'Rules registry',
  definition: 'Definition',
  versionHistory: 'Version history',
  dryRunResultsTab: 'Dry-run results ({count})',
  consumers: 'Consumers',
  auditLog: 'Audit log',
  dslSourceReadOnly: 'DSL source (read-only)',
  dslSource: 'DSL source',
  dslSourceSub: 'Authored in the monopilot/rules repo — PR to change.',
  readOnly: 'READ ONLY',
  copyDslToClipboard: 'Copy DSL to clipboard',
  downloadJson: 'Download JSON',
  dryRunSample: 'Dry-run against sample input →',
  dslEmpty: 'DSL payload not yet indexed for this rule. Contact SRE.',
  version: 'Version',
  deployedAt: 'Deployed at',
  deployedBy: 'Deployed by',
  deployRef: 'Deploy ref',
  actions: 'Actions',
  current: 'CURRENT',
  diffVsCurrent: 'Diff vs current',
  dryRunResults: 'Dry-run results',
  dryRunResultsSub: 'Last 30 days of dry-run invocations against this rule.',
  noDryRuns: 'No dry-runs in the last 30 days — coverage MISSING.',
  ranAt: 'Ran at',
  ranBy: 'Ran by',
  result: 'Result',
  summary: 'Summary',
  viewIo: 'View I/O →',
  moduleConsumers: 'Module consumers',
  moduleConsumersSub: 'Screens / flows that reference this rule.',
  noConsumers: 'No tracked consumers.',
  deployAuditLog: 'Deploy audit log',
  when: 'When',
  actor: 'Actor',
  action: 'Action',
  notes: 'Notes',
  loading: 'Loading rule detail…',
  error: 'Could not load rule detail.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof RuleDetailLabels>;
const SETTINGS_RULES_VIEW = 'settings.rules.view';
const FORBIDDEN = 'forbidden' as const;

async function buildLabels(locale: string, overrides?: Partial<RuleDetailLabels>): Promise<RuleDetailLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.rule_detail' });
    const translated = LABEL_KEYS.reduce((labels, key) => {
      try {
        labels[key] = t(key, key === 'dryRunResultsTab' ? { count: '{count}' } : undefined);
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as RuleDetailLabels);
    return { ...translated, ...overrides };
  } catch {
    return { ...DEFAULT_LABELS, ...overrides };
  }
}

function emptyRule(code: string): RuleDetail {
  return {
    code,
    description: 'Rule detail is unavailable.',
    type: 'Validation',
    tier: 'L1',
    status: 'retired',
    version: 1,
    effectiveFrom: '—',
    deployRef: '—',
    deployedBy: '—',
  };
}

function toIsoDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const iso = value instanceof Date ? value.toISOString() : String(value);
  return iso.includes('T') ? iso.slice(0, 10) : iso;
}

function toNumber(value: number | string | null | undefined, fallback = 1): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toRuleType(value: string): RuleDetail['type'] {
  if (value === 'workflow') return 'Transition';
  if (value === 'cascading') return 'Calculation';
  return 'Validation';
}

function toTier(value: string | null | undefined): RuleDetail['tier'] {
  return value === 'L2' || value === 'L3' || value === 'L4' ? value : 'L1';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toRule(row: RuleDefinitionRow): RuleDetail {
  const definition = isRecord(row.definition_json) ? row.definition_json : {};
  const description = typeof definition.description === 'string'
    ? definition.description
    : typeof definition.desc === 'string'
      ? definition.desc
      : `${row.rule_code} rule definition`;
  return {
    code: row.rule_code,
    description,
    type: toRuleType(row.rule_type),
    tier: toTier(row.tier),
    status: row.active_to ? 'retired' : 'active',
    version: toNumber(row.version),
    effectiveFrom: toIsoDate(row.active_from),
    deployRef: row.deploy_ref ?? '—',
    deployedBy: row.deployed_by ?? 'system (CI/CD)',
  };
}

function toDryRun(row: DryRunRow): RuleDryRun {
  const result = isRecord(row.result_json) ? row.result_json : {};
  const rawStatus = typeof result.status === 'string' ? result.status : typeof result.outcome === 'string' ? result.outcome : 'pass';
  const status: RuleDryRun['result'] = rawStatus === 'failed' || rawStatus === 'fail'
    ? 'fail'
    : rawStatus === 'warning' || rawStatus === 'warn'
      ? 'warning'
      : 'pass';
  return {
    ranAt: toIsoDate(row.ran_at),
    ranBy: row.ran_by ?? 'system (CI/CD)',
    result: status,
    summary: typeof result.summary === 'string' ? result.summary : `Dry-run ${status}`,
    input: isRecord(row.sample_input_json) ? row.sample_input_json : undefined,
    output: isRecord(row.result_json) ? row.result_json : undefined,
  };
}

function auditFromVersions(rule: RuleDetail, versions: RuleVersion[]): RuleDetailScreenProps['auditLog'] {
  return versions.length > 0
    ? versions.map((version) => ({
      when: version.deployedAt,
      actor: version.deployedBy,
      action: 'rule_deploy',
      deployRef: version.deployRef,
      notes: version.current ? 'Promoted from staging' : 'Historical deploy',
    }))
    : [{ when: rule.effectiveFrom, actor: rule.deployedBy, action: 'rule_deploy', deployRef: rule.deployRef, notes: 'Promoted from staging' }];
}

async function requireRulesViewPermission({ client, userId, orgId }: OrgActionContext): Promise<void> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or r.permissions ? $3)
      limit 1`,
    [userId, orgId, SETTINGS_RULES_VIEW],
  );
  if (rows.length === 0) throw FORBIDDEN;
}

async function readRuleDetailData(code: string): Promise<Omit<RuleDetailScreenProps, 'labels' | 'compareVersions'>> {
  return withOrgContext(async (ctx: OrgActionContext) => {
    const { client } = ctx;
    await requireRulesViewPermission(ctx);
    const { rows } = await client.query<RuleDefinitionRow>(
      `select id,
              rule_code,
              rule_type,
              tier,
              definition_json,
              version,
              active_from,
              active_to,
              deployed_by::text as deployed_by,
              deploy_ref
         from public.rule_definitions
        where org_id = app.current_org_id()
          and rule_code = $1
        order by version desc`,
      [code],
    );

    if (rows.length === 0) {
      return {
        state: 'empty' as const,
        rule: emptyRule(code),
        dslSource: null,
        versions: [],
        dryRuns: [],
        consumers: [],
        auditLog: [],
      };
    }

    const current = rows.find((row) => row.active_to == null) ?? rows[0];
    const rule = toRule(current);
    const versions: RuleVersion[] = rows.map((row) => ({
      version: toNumber(row.version),
      deployedAt: toIsoDate(row.active_from),
      deployedBy: row.deployed_by ?? 'system (CI/CD)',
      deployRef: row.deploy_ref ?? '—',
      current: row.id === current.id,
    }));

    const { rows: dryRunRows } = await client.query<DryRunRow>(
      `select rdr.ran_at,
              rdr.ran_by::text as ran_by,
              rdr.sample_input_json,
              rdr.result_json
         from public.rule_dry_runs rdr
        where rdr.org_id = app.current_org_id()
          and rdr.rule_definition_id = $1::uuid
          and rdr.ran_at >= pg_catalog.now() - interval '30 days'
        order by rdr.ran_at desc
        limit 30`,
      [current.id],
    );

    const definition = isRecord(current.definition_json) ? current.definition_json : null;
    return {
      state: 'ready' as const,
      rule,
      dslSource: definition,
      versions,
      dryRuns: dryRunRows.map(toDryRun),
      consumers: stringArray(definition?.consumers),
      auditLog: auditFromVersions(rule, versions),
    };
  });
}

function diffValues(before: unknown, after: unknown, path = ''): RuleDiffResult['diff'] {
  if (Object.is(before, after)) return [];
  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return Array.from(keys).flatMap((key) => {
      const childPath = `${path}/${key}`;
      if (!(key in before)) return [{ op: 'add' as const, path: childPath, after: after[key] }];
      if (!(key in after)) return [{ op: 'remove' as const, path: childPath, before: before[key] }];
      return diffValues(before[key], after[key], childPath);
    });
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    return Array.from({ length }).flatMap((_, index) => {
      const childPath = `${path}/${index}`;
      if (index >= before.length) return [{ op: 'add' as const, path: childPath, after: after[index] }];
      if (index >= after.length) return [{ op: 'remove' as const, path: childPath, before: before[index] }];
      return diffValues(before[index], after[index], childPath);
    });
  }
  return [{ op: 'replace', path: path || '/', before, after }];
}

export async function compareRuleVersions(input: { ruleCode: string; fromVersion: number; toVersion: number }): Promise<RuleDiffResult> {
  'use server';
  return withOrgContext(async (ctx: OrgActionContext) => {
    const { client } = ctx;
    await requireRulesViewPermission(ctx);
    const { rows } = await client.query<{ version: number | string; definition_json: unknown }>(
      `select version, definition_json
         from public.rule_definitions
        where org_id = app.current_org_id()
          and rule_code = $1
          and version = any($2::int[])
        order by version asc`,
      [input.ruleCode, [input.fromVersion, input.toVersion]],
    );
    const byVersion = new Map(rows.map((row) => [toNumber(row.version), row.definition_json]));
    return {
      ruleCode: input.ruleCode,
      fromVersion: input.fromVersion,
      toVersion: input.toVersion,
      diff: diffValues(byVersion.get(input.fromVersion), byVersion.get(input.toVersion)),
    };
  });
}

export default async function RuleDetailPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as PageProps & RuleDetailTestOverrides;
  const params = props.params ? await props.params : { locale: 'en', code: props.rule?.code ?? 'WO_CLOSEOUT' };
  const labels = await buildLabels(params.locale, props.labels);

  let loaded: Omit<RuleDetailScreenProps, 'labels' | 'compareVersions'>;
  if (props.rule) {
    loaded = {
      state: props.state ?? 'ready',
      rule: props.rule,
      dslSource: props.dslSource === undefined ? null : props.dslSource,
      versions: props.versions ?? [],
      dryRuns: props.dryRuns ?? [],
      consumers: props.consumers ?? [],
      auditLog: props.auditLog ?? [],
    };
  } else {
    try {
      loaded = await readRuleDetailData(params.code);
    } catch {
      loaded = {
        state: 'error',
        rule: emptyRule(params.code),
        dslSource: null,
        versions: [],
        dryRuns: [],
        consumers: [],
        auditLog: [],
      };
    }
  }

  return (
    <RuleDetailScreen
      labels={labels}
      rule={loaded.rule}
      dslSource={props.dslSource === undefined ? loaded.dslSource : props.dslSource}
      versions={props.versions ?? loaded.versions}
      dryRuns={props.dryRuns ?? loaded.dryRuns}
      consumers={props.consumers ?? loaded.consumers}
      auditLog={props.auditLog ?? loaded.auditLog}
      state={props.state ?? loaded.state}
      compareVersions={props.compareVersions ?? compareRuleVersions}
    />
  );
}
