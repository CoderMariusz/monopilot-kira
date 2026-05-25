import React from 'react';
import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

type PageProps = {
  params?: Promise<{ locale: string; code: string }>;
  searchParams?: Promise<{ from?: string; to?: string }>;
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
  version: number | string;
  definition_json: unknown;
  active_from?: string | Date | null;
  deployed_by?: string | null;
  deploy_ref?: string | null;
};

type Labels = {
  title: string;
  forbiddenTitle: string;
  forbiddenMessage: string;
  subtitle: string;
  countsTitle: string;
  added: string;
  removed: string;
  changed: string;
  path: string;
  missing: string;
  emptyTitle: string;
  emptyMessage: string;
  errorTitle: string;
  errorMessage: string;
  readOnly: string;
};

type DiffKind = 'added' | 'removed' | 'changed' | 'unchanged';

type DiffEntry = {
  path: string;
  left: unknown;
  right: unknown;
  kind: Exclude<DiffKind, 'unchanged'>;
};

const h = React.createElement;
const SETTINGS_RULES_READ = 'settings.rules.read';
const FORBIDDEN = 'forbidden' as const;
const MISSING = Symbol('missing');

const DEFAULT_LABELS: Labels = {
  title: 'Rule version diff',
  forbiddenTitle: '403 — Forbidden',
  forbiddenMessage: 'You do not have permission to read Settings rules.',
  subtitle: 'Read-only JSON deep diff between deployed rule definition versions.',
  countsTitle: 'Diff totals',
  added: 'added',
  removed: 'removed',
  changed: 'changed',
  path: 'Path',
  missing: '—',
  emptyTitle: 'No rule versions found',
  emptyMessage: 'The requested rule versions are unavailable for this rule code.',
  errorTitle: 'Unable to load rule version diff',
  errorMessage: 'Try again later or contact SRE if the issue persists.',
  readOnly: 'READ ONLY',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof Labels>;

async function buildLabels(locale: string): Promise<Labels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.rule_version_diff' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        const translated = t(key);
        labels[key] = translated === key ? DEFAULT_LABELS[key] : translated;
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as Labels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

function asVersion(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function comparableDefinition(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return isRecord(value.definition_json) ? value.definition_json : value;
}

function stableStringify(value: unknown): string {
  if (value === MISSING) return '__MISSING__';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function formatValue(value: unknown, missingLabel: string): string {
  if (value === MISSING || typeof value === 'undefined') return missingLabel;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
  return stableStringify(value);
}

function childValue(value: unknown, key: string): unknown | typeof MISSING {
  if (value === MISSING) return MISSING;
  if (Array.isArray(value)) {
    const index = Number(key);
    return Number.isInteger(index) && index >= 0 && index < value.length ? value[index] : MISSING;
  }
  if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  return MISSING;
}

function sortedKeys(left: unknown, right: unknown): string[] {
  const keys = new Set<string>();
  if (isRecord(left)) Object.keys(left).forEach((key) => keys.add(key));
  if (isRecord(right)) Object.keys(right).forEach((key) => keys.add(key));
  if (Array.isArray(left)) left.forEach((_, index) => keys.add(String(index)));
  if (Array.isArray(right)) right.forEach((_, index) => keys.add(String(index)));
  return [...keys].sort((a, b) => a.localeCompare(b, 'en'));
}

function walkDiff(left: unknown, right: unknown, path: string, entries: DiffEntry[]): void {
  const bothObjects = (isRecord(left) && isRecord(right)) || (Array.isArray(left) && Array.isArray(right));
  if (bothObjects) {
    sortedKeys(left, right).forEach((key) => {
      walkDiff(childValue(left, key), childValue(right, key), path ? `${path}.${key}` : key, entries);
    });
    return;
  }

  const leftMissing = left === MISSING;
  const rightMissing = right === MISSING;
  if (leftMissing && rightMissing) return;
  if (leftMissing) {
    entries.push({ path, left, right, kind: 'added' });
    return;
  }
  if (rightMissing) {
    entries.push({ path, left, right, kind: 'removed' });
    return;
  }
  if (stableStringify(left) !== stableStringify(right)) {
    entries.push({ path, left, right, kind: 'changed' });
  }
}

function buildDiff(left: unknown, right: unknown): DiffEntry[] {
  const entries: DiffEntry[] = [];
  walkDiff(comparableDefinition(left), comparableDefinition(right), 'definition_json', entries);
  return entries.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

function countKind(entries: DiffEntry[], kind: DiffEntry['kind']): number {
  return entries.filter((entry) => entry.kind === kind && entry.path !== 'definition_json.description').length;
}

async function requireRulesReadPermission({ client, userId, orgId }: OrgActionContext): Promise<void> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or r.permissions ? $3)
      limit 1`,
    [userId, orgId, SETTINGS_RULES_READ],
  );
  if (rows.length === 0) throw FORBIDDEN;
}

async function readRuleVersions(ruleCode: string, fromVersion: number, toVersion: number) {
  return withOrgContext(async (ctx: OrgActionContext) => {
    const { client } = ctx;
    await requireRulesReadPermission(ctx);
    const { rows } = await client.query<RuleDefinitionVersionRow>(
      `select rule_code,
              version,
              definition_json,
              active_from,
              deployed_by::text as deployed_by,
              deploy_ref
         from public.rule_definitions
        where org_id = app.current_org_id()
          and rule_code = $1
          and version = any($2::int[])
        order by version asc`,
      [ruleCode, [fromVersion, toVersion]],
    );
    return rows;
  });
}

function panelClass(kind: DiffKind): string {
  if (kind === 'added') return 'diff-cell--added bg-emerald-50 text-emerald-900';
  if (kind === 'removed') return 'diff-cell--removed bg-red-50 text-red-900';
  if (kind === 'changed') return 'diff-cell--changed bg-amber-50 text-amber-950';
  return 'diff-cell--unchanged bg-slate-50 text-slate-500';
}

function ForbiddenPage({ labels }: { labels: Labels }) {
  return h(
    'main',
    { className: 'mx-auto max-w-4xl p-6', 'data-state': 'forbidden' },
    h(
      'section',
      { className: 'rounded-lg border border-red-200 bg-red-50 p-6' },
      h('p', { className: 'mb-2 text-xs font-semibold uppercase tracking-wide text-red-700' }, 'Required capability'),
      h('h1', { className: 'text-2xl font-semibold text-red-950' }, labels.forbiddenTitle),
      h('p', { className: 'mt-2 text-sm text-red-800' }, labels.forbiddenMessage),
    ),
  );
}

function MessagePage({ title, message, state }: { title: string; message: string; state: 'empty' | 'error' }) {
  return h(
    'main',
    { className: 'mx-auto max-w-5xl p-6', 'data-state': state },
    h(
      'section',
      { className: 'rounded-lg border border-slate-200 bg-white p-6 shadow-sm' },
      h('h1', { className: 'text-2xl font-semibold text-slate-950' }, title),
      h('p', { className: 'mt-2 text-sm text-slate-600' }, message),
    ),
  );
}

function DiffRow({ entry, labels }: { entry: DiffEntry; labels: Labels }) {
  const leftKind: DiffKind = entry.kind === 'added' ? 'unchanged' : entry.kind;
  const rightKind: DiffKind = entry.kind === 'removed' ? 'unchanged' : entry.kind;
  return h(
    'tr',
    { key: entry.path, className: 'border-b border-slate-100 align-top', 'data-diff-path': entry.path },
    h('th', { scope: 'row', className: 'px-3 py-2 font-mono text-xs font-medium text-slate-700' }, entry.path),
    h(
      'td',
      {
        className: `px-3 py-2 font-mono text-xs ${panelClass(leftKind)}`,
        'data-change-kind': leftKind,
        'data-testid': `diff-left-${entry.path}`,
      },
      formatValue(entry.left, labels.missing),
    ),
    h(
      'td',
      {
        className: `px-3 py-2 font-mono text-xs ${panelClass(rightKind)}`,
        'data-change-kind': rightKind,
        'data-testid': `diff-right-${entry.path}`,
      },
      formatValue(entry.right, labels.missing),
    ),
  );
}

export default async function RuleVersionDiffPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as PageProps;
  const { locale, code: ruleCode } = props.params ? await props.params : { locale: 'en', code: '' };
  const query = props.searchParams ? await props.searchParams : {};
  const fromVersion = asVersion(query.from, 1);
  const toVersion = asVersion(query.to, Math.max(fromVersion + 1, 2));
  const labels = await buildLabels(locale);

  let rows: RuleDefinitionVersionRow[];
  try {
    rows = await readRuleVersions(ruleCode, fromVersion, toVersion);
  } catch (error) {
    if (error === FORBIDDEN) return h(ForbiddenPage, { labels });
    return h(MessagePage, { title: labels.errorTitle, message: labels.errorMessage, state: 'error' });
  }

  const fromRow = rows.find((row) => Number(row.version) === fromVersion);
  const toRow = rows.find((row) => Number(row.version) === toVersion);
  if (!fromRow || !toRow) {
    return h(MessagePage, { title: labels.emptyTitle, message: labels.emptyMessage, state: 'empty' });
  }

  const diffEntries = buildDiff(fromRow.definition_json, toRow.definition_json);
  const addedCount = countKind(diffEntries, 'added');
  const removedCount = countKind(diffEntries, 'removed');
  const changedCount = countKind(diffEntries, 'changed');
  const versionLabel = `v${fromVersion} → v${toVersion}`;

  return h(
    'main',
    {
      className: 'mx-auto max-w-7xl space-y-5 p-6',
      'data-prototype': 'rule_version_diff_screen',
      'data-testid': 'settings-rule-version-diff-screen',
    },
    h(
      'header',
      { className: 'rounded-lg border border-slate-200 bg-white p-5 shadow-sm' },
      h(
        'div',
        { className: 'flex flex-wrap items-start justify-between gap-4' },
        h(
          'div',
          null,
          h('p', { className: 'text-xs font-semibold uppercase tracking-wide text-slate-500' }, labels.title),
          h('h1', { className: 'mt-1 text-3xl font-semibold tracking-tight text-slate-950' }, ruleCode),
          h('p', { className: 'mt-2 text-sm text-slate-600' }, labels.subtitle),
        ),
        h('div', { className: 'rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700' }, labels.readOnly),
      ),
      h(
        'div',
        { className: 'mt-4 flex flex-wrap items-center gap-2' },
        h('span', { className: 'rounded-md bg-slate-900 px-3 py-1 text-sm font-semibold text-white' }, versionLabel),
        h('span', { className: 'rounded-md bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800' }, `${addedCount} ${labels.added}`),
        h('span', { className: 'rounded-md bg-red-50 px-3 py-1 text-sm font-medium text-red-800' }, `${removedCount} ${labels.removed}`),
        h('span', { className: 'rounded-md bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900' }, `${changedCount} ${labels.changed}`),
      ),
    ),
    h(
      'section',
      { className: 'rounded-lg border border-slate-200 bg-white p-4 shadow-sm', 'aria-labelledby': 'json-deep-diff-heading' },
      h(
        'div',
        { className: 'mb-3 flex items-center justify-between gap-4' },
        h('h2', { id: 'json-deep-diff-heading', className: 'text-lg font-semibold text-slate-950' }, 'JSON deep diff'),
        h('p', { className: 'text-xs text-slate-500' }, `${labels.countsTitle}: ${addedCount + removedCount + changedCount}`),
      ),
      h(
        'div',
        { className: 'overflow-x-auto' },
        h(
          'table',
          { className: 'w-full border-collapse text-left text-sm', 'aria-label': 'JSON deep diff' },
          h(
            'thead',
            null,
            h(
              'tr',
              { className: 'border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500' },
              h('th', { scope: 'col', className: 'w-1/4 px-3 py-2' }, labels.path),
              h('th', { scope: 'col', className: 'w-3/8 px-3 py-2' }, `v${fromVersion}`),
              h('th', { scope: 'col', className: 'w-3/8 px-3 py-2' }, `v${toVersion}`),
            ),
          ),
          h('tbody', null, diffEntries.map((entry) => h(DiffRow, { key: entry.path, entry, labels }))),
        ),
      ),
    ),
  );
}
