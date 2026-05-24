'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardDescription } from '@monopilot/ui/Card';
import { PageHeader } from '@monopilot/ui/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';
import { RuleDryRunModal } from '../../../../../../../components/settings/modals/rule-dry-run-modal';

export type RuleVersion = {
  version: number;
  deployedAt: string;
  deployedBy: string;
  deployRef: string;
  current?: boolean;
};

export type RuleDryRun = {
  ranAt: string;
  ranBy: string;
  result: 'pass' | 'warning' | 'fail';
  summary: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
};

export type RuleDetail = {
  code: string;
  description: string;
  type: 'Transition' | 'Validation' | 'Calculation';
  tier: 'L1' | 'L2' | 'L3' | 'L4';
  status: 'active' | 'draft' | 'retired';
  version: number;
  effectiveFrom: string;
  deployRef: string;
  deployedBy: string;
};

export type RuleDiffResult = {
  ruleCode: string;
  fromVersion: number;
  toVersion: number;
  diff: Array<{ op: 'add' | 'remove' | 'replace'; path: string; before?: unknown; after?: unknown }>;
};

export type RuleDetailLabels = {
  ruleActions: string;
  backToRegistry: string;
  copyDsl: string;
  triggerDryRun: string;
  settings: string;
  rulesRegistry: string;
  definition: string;
  versionHistory: string;
  dryRunResultsTab: string;
  consumers: string;
  auditLog: string;
  dslSourceReadOnly: string;
  dslSource: string;
  dslSourceSub: string;
  readOnly: string;
  copyDslToClipboard: string;
  downloadJson: string;
  dryRunSample: string;
  dslEmpty: string;
  version: string;
  deployedAt: string;
  deployedBy: string;
  deployRef: string;
  actions: string;
  current: string;
  diffVsCurrent: string;
  dryRunResults: string;
  dryRunResultsSub: string;
  noDryRuns: string;
  ranAt: string;
  ranBy: string;
  result: string;
  summary: string;
  viewIo: string;
  moduleConsumers: string;
  moduleConsumersSub: string;
  noConsumers: string;
  deployAuditLog: string;
  when: string;
  actor: string;
  action: string;
  notes: string;
  loading: string;
  error: string;
};

export type RuleDetailScreenProps = {
  labels: RuleDetailLabels;
  rule: RuleDetail;
  dslSource: Record<string, unknown> | null;
  versions: RuleVersion[];
  dryRuns: RuleDryRun[];
  consumers: string[];
  auditLog: Array<{ when: string; actor: string; action: string; deployRef: string; notes: string }>;
  compareVersions?: (input: { ruleCode: string; fromVersion: number; toVersion: number }) => Promise<RuleDiffResult>;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
};

type TabId = 'definition' | 'versions' | 'dryRuns' | 'consumers' | 'audit';

function initialTabFromHash(): TabId {
  if (typeof window !== 'undefined' && window.location.hash === '#versions') return 'versions';
  return 'definition';
}

function Section({ title, sub, children }: { title: string; sub?: string; children: any }) {
  return (
    <Card role="region" aria-label={title}>
      <CardHeader>
        <h2 className="card__title">{title}</h2>
        {sub ? <CardDescription>{sub}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ResultBadge({ result }: { result: RuleDryRun['result'] }) {
  if (result === 'pass') return <Badge variant="success">PASS</Badge>;
  if (result === 'warning') return <Badge variant="warning">WARN</Badge>;
  return <Badge variant="danger">FAIL</Badge>;
}

export default function RuleDetailScreen({
  labels,
  rule,
  dslSource,
  dryRuns,
  versions,
  consumers,
  auditLog,
  compareVersions,
  state = 'ready',
}: RuleDetailScreenProps) {
  const [tab, setTab] = React.useState<TabId>(initialTabFromHash);
  const [dryRunOpen, setDryRunOpen] = React.useState(false);
  const [diffResult, setDiffResult] = React.useState<RuleDiffResult | null>(null);
  const [diffLoading, setDiffLoading] = React.useState<number | null>(null);

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'definition', label: labels.definition },
    { id: 'versions', label: labels.versionHistory },
    { id: 'dryRuns', label: labels.dryRunResultsTab.replace('{count}', String(dryRuns.length)) },
    { id: 'consumers', label: labels.consumers },
    { id: 'audit', label: labels.auditLog },
  ];

  const openDryRun = () => setDryRunOpen(true);
  const currentVersion = rule.version;

  async function runDiff(version: number) {
    if (!compareVersions || version === currentVersion) return;
    setDiffLoading(version);
    try {
      const result = await compareVersions({ ruleCode: rule.code, fromVersion: version, toVersion: currentVersion });
      setDiffResult(result);
    } finally {
      setDiffLoading(null);
    }
  }

  const headerActions = (
    <div role="toolbar" aria-label={labels.ruleActions} className="flex shrink-0 items-center gap-2">
      <Button type="button" className="btn-secondary btn-sm">{labels.backToRegistry}</Button>
      <Button type="button" className="btn-secondary btn-sm">{labels.copyDsl}</Button>
      <Button type="button" className="btn-primary btn-sm" data-modal-id="ruleDryRun" onClick={openDryRun}>{labels.triggerDryRun}</Button>
    </div>
  );

  const shell = (children: React.ReactNode) => (
    <main
      data-testid="settings-rule-detail-screen"
      data-prototype="rule_detail_screen"
      aria-label={`Rule detail ${rule.code}`}
      className="settings-page settings-page--rule-detail space-y-4"
    >
      <PageHeader title={rule.code} subtitle={rule.description} actions={headerActions} />
      {children}
      {dryRunOpen ? (
        <RuleDryRunModal
          defaultOpen
          rule={{ code: rule.code, description: rule.description }}
          initialSampleInput={{ rule: rule.code, sample: true }}
          runDryRun={async () => ({
            status: 'pass',
            warnings: [],
            trace: ['sample input evaluated'],
            evaluatedAt: new Date().toISOString(),
          })}
          onOpenChange={setDryRunOpen}
        />
      ) : null}
    </main>
  );

  if (state === 'loading') {
    return shell(<Card aria-busy="true"><CardContent role="status">{labels.loading}</CardContent></Card>);
  }

  if (state === 'error' || state === 'permission_denied') {
    return shell(<Card><CardContent role="alert">{labels.error}</CardContent></Card>);
  }

  return shell(
    <>
      <nav aria-label="Breadcrumb" className="breadcrumb text-xs text-slate-500">
        <span>{labels.settings}</span> · <span>{labels.rulesRegistry}</span> · <span className="mono">{rule.code}</span>
      </nav>

      <div className="flex items-center gap-2">
        <Badge variant="secondary">{rule.type}</Badge>
        <Badge variant="outline">{rule.tier}</Badge>
        <Badge variant={rule.status === 'active' ? 'success' : 'muted'}>{rule.status.toUpperCase()}</Badge>
        <span className="muted mono text-xs">v{rule.version} · {rule.effectiveFrom} · {rule.deployRef}</span>
      </div>

      <Card role="tablist" aria-label="Rule detail sections" className="flex items-center gap-1 border-b border-slate-200 pb-0">
        {tabs.map((item) => (
          <Button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`btn-ghost btn-sm rounded-none px-3 py-2 ${tab === item.id ? 'border-b-2 border-blue-600 font-semibold' : 'border-b-2 border-transparent'}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </Card>

      {tab === 'definition' && dslSource ? (
        <Section title={labels.dslSourceReadOnly} sub={labels.dslSourceSub}>
          <div className="relative">
            <Badge variant="muted" className="absolute right-2 top-2 text-[9px]">{labels.readOnly}</Badge>
            <pre data-testid="rule-dsl-json" className="mono max-h-96 overflow-auto rounded-md bg-slate-100 p-3 text-xs leading-6">
              {JSON.stringify(dslSource, null, 2)}
            </pre>
          </div>
          <div className="mt-3 flex gap-2">
            <Button type="button" className="btn-secondary btn-sm">{labels.copyDslToClipboard}</Button>
            <Button type="button" className="btn-secondary btn-sm">{labels.downloadJson}</Button>
            <Button type="button" className="btn-primary btn-sm" data-modal-id="ruleDryRun" onClick={openDryRun}>{labels.dryRunSample}</Button>
          </div>
        </Section>
      ) : null}

      {tab === 'definition' && !dslSource ? (
        <Section title={labels.dslSource}>
          <div className="muted">{labels.dslEmpty}</div>
        </Section>
      ) : null}

      {tab === 'versions' ? (
        <Section title={labels.versionHistory}>
          <Table aria-label={labels.versionHistory}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.version}</TableHead>
                <TableHead scope="col">{labels.deployedAt}</TableHead>
                <TableHead scope="col">{labels.deployedBy}</TableHead>
                <TableHead scope="col">{labels.deployRef}</TableHead>
                <TableHead scope="col">{labels.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((version) => (
                <TableRow key={version.version}>
                  <TableCell className="mono">v{version.version} {version.current ? <Badge variant="success">{labels.current}</Badge> : null}</TableCell>
                  <TableCell className="mono muted text-xs">{version.deployedAt}</TableCell>
                  <TableCell className="muted">{version.deployedBy}</TableCell>
                  <TableCell className="mono muted text-xs">{version.deployRef}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={version.current || diffLoading === version.version}
                      onClick={() => void runDiff(version.version)}
                    >
                      {labels.diffVsCurrent}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {diffResult ? (
            <section role="region" aria-label={`Version diff v${diffResult.fromVersion} → v${diffResult.toVersion}`} className="mt-3">
              <pre className="mono rounded-md bg-slate-100 p-3 text-xs">{JSON.stringify(diffResult.diff, null, 2)}</pre>
            </section>
          ) : null}
        </Section>
      ) : null}

      {tab === 'dryRuns' ? (
        <Section title={labels.dryRunResults} sub={labels.dryRunResultsSub}>
          {dryRuns.length === 0 ? <div className="muted">{labels.noDryRuns}</div> : (
            <Table aria-label={labels.dryRunResults}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{labels.ranAt}</TableHead>
                  <TableHead scope="col">{labels.ranBy}</TableHead>
                  <TableHead scope="col">{labels.result}</TableHead>
                  <TableHead scope="col">{labels.summary}</TableHead>
                  <TableHead scope="col">{labels.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dryRuns.map((run) => (
                  <TableRow key={`${run.ranAt}-${run.ranBy}`}>
                    <TableCell className="mono muted text-xs">{run.ranAt}</TableCell>
                    <TableCell className="muted">{run.ranBy}</TableCell>
                    <TableCell><ResultBadge result={run.result} /></TableCell>
                    <TableCell>{run.summary}</TableCell>
                    <TableCell><Button type="button" className="btn-secondary btn-sm" onClick={openDryRun}>{labels.viewIo}</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      ) : null}

      {tab === 'consumers' ? (
        <Section title={labels.moduleConsumers} sub={labels.moduleConsumersSub}>
          {consumers.length === 0 ? <div className="muted">{labels.noConsumers}</div> : (
            <ul className="m-0 list-disc pl-5 leading-8">
              {consumers.map((consumer) => <li key={consumer}>{consumer}</li>)}
            </ul>
          )}
        </Section>
      ) : null}

      {tab === 'audit' ? (
        <Section title={labels.deployAuditLog}>
          <Table aria-label={labels.deployAuditLog}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.when}</TableHead>
                <TableHead scope="col">{labels.actor}</TableHead>
                <TableHead scope="col">{labels.action}</TableHead>
                <TableHead scope="col">{labels.deployRef}</TableHead>
                <TableHead scope="col">{labels.notes}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLog.map((row) => (
                <TableRow key={`${row.when}-${row.deployRef}`}>
                  <TableCell className="mono muted">{row.when}</TableCell>
                  <TableCell>{row.actor}</TableCell>
                  <TableCell>{row.action}</TableCell>
                  <TableCell className="mono">{row.deployRef}</TableCell>
                  <TableCell className="muted">{row.notes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      ) : null}
    </>,
  );
}
