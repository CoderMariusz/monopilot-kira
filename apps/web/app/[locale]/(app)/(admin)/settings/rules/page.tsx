import { listRules } from '../../../../../../actions/rules/list';
import RulesRegistryScreen, {
  type RuleRegistryRow,
  type RuleTier,
  type RuleType,
  type RulesRegistryLabels,
} from './rules-registry-screen.client';

export const dynamic = 'force-dynamic';

type RulesSearchParams = Record<string, string | string[] | undefined>;

type RulesPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<RulesSearchParams>;
};

type RulesPageTestOverrides = {
  rules?: RuleRegistryRow[];
  now?: string;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  openModal?: (modalId: 'ruleDryRun') => void;
  onOpenRule?: (ruleCode: string) => void;
};

type ListedRule = Extract<Awaited<ReturnType<typeof listRules>>, { ok: true }>['data']['rules'][number];

const DEFAULT_LABELS: RulesRegistryLabels = {
  title: 'Rules registry',
  subtitle: 'Read-only browser of deployed business rules (DSL-driven).',
  dryRunAllRules: 'Dry-run all rules',
  dryRunAllRulesTitle: 'Preview affected objects across all rules before activation',
  exportAllJson: 'Export all (JSON)',
  readOnlyNotice:
    'Rules are authored by developers and deployed via CI/CD. This view is read-only — contact your Monopilot implementation team to request rule changes.',
  typeFilter: 'Rule type',
  coverageFilter: 'Coverage',
  allTypes: 'All types',
  workflow: 'Workflow',
  cascading: 'Cascading',
  conditional: 'Conditional',
  gate: 'Gate',
  allCoverage: 'All coverage',
  covered30d: 'Covered (dry-run < 30d)',
  missingCoverage: 'Missing coverage',
  deployedRules: 'Deployed rules',
  ruleCode: 'Rule code',
  type: 'Type',
  tier: 'Tier',
  version: 'Version',
  activeFrom: 'Active from',
  deployRef: 'Deploy ref',
  coverage: 'Coverage',
  consumers: 'Consumers',
  actions: 'Actions',
  covered: 'covered',
  missingCoverageBadge: 'missing coverage',
  moduleRefs: '{count} module refs',
  viewRule: 'View rule',
  loading: 'Loading rules registry…',
  empty: 'No deployed rules found.',
  error: 'Unable to load deployed rules.',
  dryRunDialogTitle: 'Dry-run all rules',
  close: 'Close',
  filters: 'Rules filters',
  rulesCount: '{visible} / {total} rules',
  provenance: 'Data source: listRules Server Action via withOrgContext (live org-scoped rule_definitions and rule_dry_runs).',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof RulesRegistryLabels>;
const SUPPORTED_RULE_TYPES = new Set(['workflow', 'cascading', 'conditional', 'gate']);
const SUPPORTED_TIERS = new Set(['L1', 'L2', 'L3', 'L4', 'system']);

function asSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeType(value: string | undefined): RuleType | 'all' {
  return value && (SUPPORTED_RULE_TYPES.has(value)) ? (value as RuleType) : 'all';
}

function normalizeCoverage(value: string | undefined): 'covered' | 'missing' | 'all' {
  return value === 'covered' || value === 'missing' ? value : 'all';
}

function toIso(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
}

function toRuleType(value: string): RuleType {
  return SUPPORTED_RULE_TYPES.has(value) ? (value as RuleType) : 'conditional';
}

function toRuleTier(value: string): RuleTier {
  return SUPPORTED_TIERS.has(value) ? (value as RuleTier) : 'L1';
}

function toRule(row: ListedRule): RuleRegistryRow {
  return {
    code: row.ruleCode,
    type: toRuleType(row.ruleType),
    tier: toRuleTier(row.tier ?? 'L1'),
    version: row.activeVersion,
    activeFrom: toIso(row.activeFrom) ?? '',
    deployRef: row.deployRef ?? '—',
    lastDryRunAt: toIso(row.latestDryRunAt),
    consumers: row.departmentCode ? [row.departmentCode] : [],
  };
}

async function buildLabels(locale: string): Promise<RulesRegistryLabels> {
  const messages = locale === 'pl'
    ? (await import('../../../../../../messages/pl/02-settings.json')).default
    : locale === 'ro'
      ? (await import('../../../../../../messages/ro/02-settings.json')).default
      : locale === 'uk'
        ? (await import('../../../../../../messages/uk/02-settings.json')).default
        : (await import('../../../../../../messages/en/02-settings.json')).default;
  const source = messages.rules_registry as Partial<Record<keyof RulesRegistryLabels, unknown>>;
  return LABEL_KEYS.reduce((labels, key) => {
    const value = source[key];
    labels[key] = typeof value === 'string' ? value : DEFAULT_LABELS[key];
    return labels;
  }, {} as RulesRegistryLabels);
}

async function readRulesRegistryData(): Promise<{ state: 'ready'; rules: RuleRegistryRow[] } | { state: 'error'; rules: RuleRegistryRow[] }> {
  try {
    const result = await listRules({ active: true });
    if (!result.ok) return { state: 'error', rules: [] };
    return { state: 'ready', rules: result.data.rules.map(toRule) };
  } catch {
    return { state: 'error', rules: [] };
  }
}

export default async function RulesRegistryPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as RulesPageProps & RulesPageTestOverrides;
  const { params, searchParams, rules, now, state, openModal, onOpenRule } = props;
  const { locale } = params ? await params : { locale: 'en' };
  const query = searchParams ? await searchParams : {};
  const labels = await buildLabels(locale);
  const loaded = rules ? { state: 'ready' as const, rules } : await readRulesRegistryData();
  const effectiveState = state ?? loaded.state;

  return (
    <RulesRegistryScreen
      labels={labels}
      rules={rules ?? loaded.rules}
      now={now}
      state={effectiveState}
      initialTypeFilter={normalizeType(asSingle(query.type))}
      initialCoverageFilter={normalizeCoverage(asSingle(query.coverage))}
      openModal={openModal}
      onOpenRule={onOpenRule}
      locale={locale}
    />
  );
}
