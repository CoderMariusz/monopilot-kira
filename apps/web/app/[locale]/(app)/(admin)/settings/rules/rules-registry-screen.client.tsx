'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import { PageHeader } from '@monopilot/ui/PageHeader';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type RuleType = 'workflow' | 'cascading' | 'conditional' | 'gate';
export type RuleTier = 'L1' | 'L2' | 'L3' | 'L4' | 'system';
export type RuleCoverage = 'covered' | 'missing';

export type RuleRegistryRow = {
  code: string;
  type: RuleType;
  tier: RuleTier;
  version: number;
  activeFrom: string;
  deployRef: string;
  lastDryRunAt?: string | null;
  consumers: string[];
  description?: string;
};

export type RulesRegistryLabels = {
  title: string;
  subtitle: string;
  dryRunAllRules: string;
  dryRunAllRulesTitle: string;
  exportAllJson: string;
  readOnlyNotice: string;
  typeFilter: string;
  coverageFilter: string;
  allTypes: string;
  workflow: string;
  cascading: string;
  conditional: string;
  gate: string;
  allCoverage: string;
  covered30d: string;
  missingCoverage: string;
  deployedRules: string;
  ruleCode: string;
  type: string;
  tier: string;
  version: string;
  activeFrom: string;
  deployRef: string;
  coverage: string;
  consumers: string;
  actions: string;
  covered: string;
  missingCoverageBadge: string;
  moduleRefs: string;
  viewRule: string;
  loading: string;
  empty: string;
  error: string;
  dryRunDialogTitle: string;
  close: string;
};

export type RulesRegistryScreenProps = {
  labels: RulesRegistryLabels;
  rules?: RuleRegistryRow[];
  now?: string;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  initialTypeFilter?: RuleType | 'all';
  initialCoverageFilter?: RuleCoverage | 'all';
  openModal?: (modalId: 'ruleDryRun') => void;
  onOpenRule?: (ruleCode: string) => void;
};

const TYPE_OPTIONS: Array<RuleType | 'all'> = ['all', 'workflow', 'cascading', 'conditional', 'gate'];
const COVERAGE_OPTIONS: Array<RuleCoverage | 'all'> = ['all', 'covered', 'missing'];
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function typeLabel(labels: RulesRegistryLabels, type: RuleType | 'all') {
  const map: Record<RuleType | 'all', string> = {
    all: labels.allTypes,
    workflow: labels.workflow,
    cascading: labels.cascading,
    conditional: labels.conditional,
    gate: labels.gate,
  };
  return map[type];
}

function coverageLabel(labels: RulesRegistryLabels, coverage: RuleCoverage | 'all') {
  const map: Record<RuleCoverage | 'all', string> = {
    all: labels.allCoverage,
    covered: labels.covered30d,
    missing: labels.missingCoverage,
  };
  return map[coverage];
}

function coverageForRule(rule: RuleRegistryRow, nowIso: string): RuleCoverage {
  if (!rule.lastDryRunAt) return 'missing';
  const now = Date.parse(nowIso);
  const last = Date.parse(rule.lastDryRunAt);
  if (!Number.isFinite(now) || !Number.isFinite(last)) return 'missing';
  return now - last < THIRTY_DAYS_MS ? 'covered' : 'missing';
}

function formatDate(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toISOString().slice(0, 10);
}

function moduleRefs(labelTemplate: string, count: number) {
  return labelTemplate.includes('{count}') ? labelTemplate.replace('{count}', String(count)) : `${count} ${labelTemplate}`;
}

function FilterOption({
  value,
  selected,
  onSelect,
  children,
}: {
  value: string;
  selected: boolean;
  onSelect: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      data-value={value}
      className="select__item"
      onClick={() => onSelect(value)}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          onSelect(value);
        }
      }}
    >
      {children}
    </div>
  );
}

function renderShell(labels: RulesRegistryLabels, children: React.ReactNode) {
  return (
    <main
      data-testid="settings-rules-registry-screen"
      aria-label={labels.title}
      className="settings-page settings-page--rules-registry space-y-4"
    >
      <header data-region="page-head">
        <PageHeader
          title={labels.title}
          subtitle={labels.subtitle}
        />
      </header>
      {children}
    </main>
  );
}

export default function RulesRegistryScreen({
  labels,
  rules = [],
  now = new Date().toISOString(),
  state = 'ready',
  initialTypeFilter = 'all',
  initialCoverageFilter = 'all',
  openModal,
  onOpenRule,
}: RulesRegistryScreenProps) {
  const [typeFilter, setTypeFilter] = React.useState<RuleType | 'all'>(initialTypeFilter);
  const [coverageFilter, setCoverageFilter] = React.useState<RuleCoverage | 'all'>(initialCoverageFilter);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const visibleRules = rules.filter((rule) => {
    const coverage = coverageForRule(rule, now);
    return (typeFilter === 'all' || rule.type === typeFilter) && (coverageFilter === 'all' || coverage === coverageFilter);
  });

  const typeOptions = TYPE_OPTIONS.map((value) => ({ value, label: typeLabel(labels, value) }));
  const coverageOptions = COVERAGE_OPTIONS.map((value) => ({ value, label: coverageLabel(labels, value) }));

  const exportVisibleRules = () => {
    const payload = JSON.stringify({ exportedAt: new Date(now).toISOString(), rules: visibleRules }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'rules-registry.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openRule = (ruleCode: string) => {
    if (onOpenRule) {
      onOpenRule(ruleCode);
      return;
    }
    window.location.assign(`/settings/rules/${encodeURIComponent(ruleCode)}`);
  };

  const actions = (
    <>
      <Button
        variant="dry-run"
        type="button"
        title={labels.dryRunAllRulesTitle}
        data-modal-id="ruleDryRun"
        onClick={() => {
          openModal?.('ruleDryRun');
          setDialogOpen(true);
        }}
      >
        {labels.dryRunAllRules}
      </Button>
      <Button type="button" className="btn-secondary" onClick={exportVisibleRules} disabled={visibleRules.length === 0}>
        {labels.exportAllJson}
      </Button>
    </>
  );

  const head = (
    <header data-region="page-head">
      <PageHeader title={labels.title} subtitle={labels.subtitle} actions={actions} />
    </header>
  );

  if (state === 'loading') {
    return renderShell(labels, <Card aria-busy="true"><CardContent role="status">{labels.loading}</CardContent></Card>);
  }

  if (state === 'error') {
    return renderShell(labels, <Card><CardContent role="alert">{labels.error}</CardContent></Card>);
  }

  if (state === 'empty' || rules.length === 0) {
    return (
      <main data-testid="settings-rules-registry-screen" aria-label={labels.title} className="settings-page settings-page--rules-registry space-y-4">
        {head}
        <section role="status" data-region="deployed-rules">
          {labels.empty}
        </section>
      </main>
    );
  }

  return (
    <main data-testid="settings-rules-registry-screen" aria-label={labels.title} className="settings-page settings-page--rules-registry space-y-4">
      {head}

      <div data-region="read-only-notice" role="alert" className="alert alert-blue rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        {labels.readOnlyNotice}
      </div>

      <section data-region="rules-filters" aria-label="Rules filters" className="flex flex-wrap items-center gap-2">
        <Select value={typeFilter} options={typeOptions} onValueChange={(value) => setTypeFilter(value as RuleType | 'all')}>
          <SelectTrigger aria-label={labels.typeFilter} className="min-w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((value) => (
              <FilterOption key={value} value={value} selected={typeFilter === value} onSelect={(next) => setTypeFilter(next as RuleType | 'all')}>
                {typeLabel(labels, value)}
              </FilterOption>
            ))}
          </SelectContent>
        </Select>

        <Select value={coverageFilter} options={coverageOptions} onValueChange={(value) => setCoverageFilter(value as RuleCoverage | 'all')}>
          <SelectTrigger aria-label={labels.coverageFilter} className="min-w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COVERAGE_OPTIONS.map((value) => (
              <FilterOption key={value} value={value} selected={coverageFilter === value} onSelect={(next) => setCoverageFilter(next as RuleCoverage | 'all')}>
                {coverageLabel(labels, value)}
              </FilterOption>
            ))}
          </SelectContent>
        </Select>

        <span className="muted text-xs" aria-live="polite">
          {visibleRules.length} / {rules.length} rules
        </span>
      </section>

      <section data-region="deployed-rules" aria-labelledby="settings-rules-deployed-title">
        <Card>
          <CardHeader>
            <CardTitle id="settings-rules-deployed-title">{labels.deployedRules}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label={labels.deployedRules}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{labels.ruleCode}</TableHead>
                  <TableHead scope="col">{labels.type}</TableHead>
                  <TableHead scope="col">{labels.tier}</TableHead>
                  <TableHead scope="col">{labels.version}</TableHead>
                  <TableHead scope="col">{labels.activeFrom}</TableHead>
                  <TableHead scope="col">{labels.deployRef}</TableHead>
                  <TableHead scope="col">{labels.coverage}</TableHead>
                  <TableHead scope="col">{labels.consumers}</TableHead>
                  <TableHead scope="col">{labels.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRules.map((rule) => {
                  const coverage = coverageForRule(rule, now);
                  return (
                    <TableRow key={rule.code} className={coverage === 'missing' ? 'missing-coverage bg-amber-50 border-l-4 border-amber-400' : undefined}>
                      <TableCell className="mono font-semibold">{rule.code}</TableCell>
                      <TableCell><Badge variant="secondary">{typeLabel(labels, rule.type)}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{rule.tier}</Badge></TableCell>
                      <TableCell className="mono">v{rule.version}</TableCell>
                      <TableCell className="mono muted text-xs">{formatDate(rule.activeFrom)}</TableCell>
                      <TableCell className="mono muted text-xs">{rule.deployRef}</TableCell>
                      <TableCell>
                        {coverage === 'covered' ? (
                          <Badge variant="success">{labels.covered}</Badge>
                        ) : (
                          <Badge variant="danger">{labels.missingCoverageBadge}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="muted text-xs">{moduleRefs(labels.moduleRefs, rule.consumers.length)}</TableCell>
                      <TableCell>
                        <Button type="button" className="btn-secondary btn-sm" onClick={() => openRule(rule.code)} aria-label={`${labels.viewRule} ${rule.code}`}>
                          View →
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {dialogOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rule-dry-run-dialog-title"
          data-modal-id="ruleDryRun"
          className="modal modal--md"
        >
          <header data-testid="modal-header" className="flex items-center justify-between gap-4">
            <h2 id="rule-dry-run-dialog-title">{labels.dryRunDialogTitle}</h2>
          </header>
          <div data-testid="modal-body">
          <p>{labels.dryRunAllRulesTitle}</p>
          </div>
          <footer data-testid="modal-footer" className="flex justify-end gap-2">
            <Button type="button" onClick={() => setDialogOpen(false)}>
              {labels.close}
            </Button>
          </footer>
        </div>
      ) : null}
    </main>
  );
}
