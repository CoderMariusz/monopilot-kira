import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardDescription } from '@monopilot/ui/Card';
import { PageHeader } from '@monopilot/ui/PageHeader';
import { RuleDryRunModal } from '../../../../../../../components/settings/modals/rule-dry-run-modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

type RuleVersion = {
  version: number;
  deployedAt: string;
  deployedBy: string;
  deployRef: string;
  current?: boolean;
};

type RuleDryRun = {
  ranAt: string;
  ranBy: string;
  result: 'pass' | 'warning' | 'fail';
  summary: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
};

type RuleDetailProps = {
  params?: Promise<{ locale: string; code: string }>;
  rule?: {
    code: string;
    description: string;
    type: 'Transition' | 'Validation' | 'Calculation';
    tier: 'L1' | 'L2' | 'L3';
    status: 'active' | 'draft' | 'retired';
    version: number;
    effectiveFrom: string;
    deployRef: string;
    deployedBy: string;
  };
  dslSource?: Record<string, unknown> | null;
  versions?: RuleVersion[];
  dryRuns?: RuleDryRun[];
  consumers?: string[];
  auditLog?: Array<{ when: string; actor: string; action: string; deployRef: string; notes: string }>;
  compareVersions?: (input: { ruleCode: string; fromVersion: number; toVersion: number }) => Promise<{
    ruleCode: string;
    fromVersion: number;
    toVersion: number;
    diff: Array<{ op: 'add' | 'remove' | 'replace'; path: string; before?: unknown; after?: unknown }>;
  }>;
  state?: 'ready' | 'loading' | 'empty' | 'error';
};

type TabId = 'definition' | 'versions' | 'dryRuns' | 'consumers' | 'audit';

const fallbackRule = {
  code: 'WO_CLOSEOUT',
  description: 'Requires reservation, QA hold clearance, and output capture before closeout.',
  type: 'Transition' as const,
  tier: 'L2' as const,
  status: 'active' as const,
  version: 3,
  effectiveFrom: '2026-05-01',
  deployRef: '9c31ab2',
  deployedBy: 'rules-ci',
};

const fallbackDsl = {
  rule: 'WO_CLOSEOUT',
  when: { from: 'IN_PROGRESS', to: 'CLOSED' },
  guards: ['outputs_recorded', 'qa_holds_cleared'],
  actions: [{ emit: 'settings.rule.closeout_checked' }],
};

const fallbackVersions: RuleVersion[] = [
  { version: 3, deployedAt: '2026-05-01', deployedBy: 'rules-ci', deployRef: '9c31ab2', current: true },
  { version: 2, deployedAt: '2026-04-18', deployedBy: 'system (CI/CD)', deployRef: '8bd9100' },
  { version: 1, deployedAt: '2026-03-22', deployedBy: 'system (CI/CD)', deployRef: '78ed001' },
];

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

export default function RuleDetailPage(props: RuleDetailProps) {
  const rule = props.rule ?? fallbackRule;
  const dslSource = props.dslSource === undefined ? fallbackDsl : props.dslSource;
  const dryRuns = props.dryRuns ?? [];
  const versions = props.versions ?? fallbackVersions;
  const consumers = props.consumers ?? [];
  const auditLog = props.auditLog ?? [
    { when: rule.effectiveFrom, actor: rule.deployedBy, action: 'rule_deploy', deployRef: rule.deployRef, notes: 'Promoted from staging' },
  ];
  const state = props.state ?? 'ready';
  const [tab, setTab] = React.useState<TabId>(initialTabFromHash);
  const [dryRunOpen, setDryRunOpen] = React.useState(false);
  const [diffResult, setDiffResult] = React.useState<Awaited<ReturnType<NonNullable<RuleDetailProps['compareVersions']>>> | null>(null);
  const [diffLoading, setDiffLoading] = React.useState<number | null>(null);

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'definition', label: 'Definition' },
    { id: 'versions', label: 'Version history' },
    { id: 'dryRuns', label: `Dry-run results (${dryRuns.length})` },
    { id: 'consumers', label: 'Consumers' },
    { id: 'audit', label: 'Audit log' },
  ];

  const openDryRun = () => setDryRunOpen(true);
  const currentVersion = rule.version;

  async function runDiff(version: number) {
    if (!props.compareVersions || version === currentVersion) return;
    setDiffLoading(version);
    try {
      const result = await props.compareVersions({ ruleCode: rule.code, fromVersion: version, toVersion: currentVersion });
      setDiffResult(result);
    } finally {
      setDiffLoading(null);
    }
  }

  const headerActions = (
    <div role="toolbar" aria-label="Rule actions" className="flex shrink-0 items-center gap-2">
      <Button type="button" className="btn-secondary btn-sm">← Back to registry</Button>
      <Button type="button" className="btn-secondary btn-sm">Copy DSL</Button>
      <Button type="button" className="btn-primary btn-sm" data-modal-id="ruleDryRun" onClick={openDryRun}>Trigger dry-run</Button>
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
    return shell(<Card aria-busy="true"><CardContent role="status">Loading rule detail…</CardContent></Card>);
  }

  if (state === 'error') {
    return shell(<Card><CardContent role="alert">Could not load rule detail.</CardContent></Card>);
  }

  return shell(
    <>
      <nav aria-label="Breadcrumb" className="breadcrumb text-xs text-slate-500">
        <span>Settings</span> · <span>Rules registry</span> · <span className="mono">{rule.code}</span>
      </nav>

      <div className="flex items-center gap-2">
        <Badge variant="secondary">{rule.type}</Badge>
        <Badge variant="outline">{rule.tier}</Badge>
        <Badge variant={rule.status === 'active' ? 'success' : 'muted'}>{rule.status.toUpperCase()}</Badge>
        <span className="muted mono text-xs">v{rule.version} · {rule.effectiveFrom} · {rule.deployRef}</span>
      </div>

      <Card data-slot="tabs-list" role="tablist" aria-label="Rule detail sections" className="flex items-center gap-1 border-b border-slate-200 pb-0">
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
        <Section title="DSL source (read-only)" sub="Authored in the monopilot/rules repo — PR to change.">
          <div className="relative">
            <Badge variant="muted" className="absolute right-2 top-2 text-[9px]">READ ONLY</Badge>
            <pre data-testid="rule-dsl-json" className="mono max-h-96 overflow-auto rounded-md bg-slate-100 p-3 text-xs leading-6">
              {JSON.stringify(dslSource, null, 2)}
            </pre>
          </div>
          <div className="mt-3 flex gap-2">
            <Button type="button" className="btn-secondary btn-sm">Copy DSL to clipboard</Button>
            <Button type="button" className="btn-secondary btn-sm">Download JSON</Button>
            <Button type="button" className="btn-primary btn-sm" data-modal-id="ruleDryRun" onClick={openDryRun}>Dry-run against sample input →</Button>
          </div>
        </Section>
      ) : null}

      {tab === 'definition' && !dslSource ? (
        <Section title="DSL source">
          <div className="muted">DSL payload not yet indexed for this rule. Contact SRE.</div>
        </Section>
      ) : null}

      {tab === 'versions' ? (
        <Section title="Version history">
          <Table aria-label="Version history">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Version</TableHead>
                <TableHead scope="col">Deployed at</TableHead>
                <TableHead scope="col">Deployed by</TableHead>
                <TableHead scope="col">Deploy ref</TableHead>
                <TableHead scope="col">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((version) => (
                <TableRow key={version.version}>
                  <TableCell className="mono">v{version.version} {version.current ? <Badge variant="success">CURRENT</Badge> : null}</TableCell>
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
                      Diff vs current
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
        <Section title="Dry-run results" sub="Last 30 days of dry-run invocations against this rule.">
          {dryRuns.length === 0 ? <div className="muted">No dry-runs in the last 30 days — coverage MISSING.</div> : (
            <Table aria-label="Dry-run results">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Ran at</TableHead>
                  <TableHead scope="col">Ran by</TableHead>
                  <TableHead scope="col">Result</TableHead>
                  <TableHead scope="col">Summary</TableHead>
                  <TableHead scope="col">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dryRuns.map((run) => (
                  <TableRow key={`${run.ranAt}-${run.ranBy}`}>
                    <TableCell className="mono muted text-xs">{run.ranAt}</TableCell>
                    <TableCell className="muted">{run.ranBy}</TableCell>
                    <TableCell><ResultBadge result={run.result} /></TableCell>
                    <TableCell>{run.summary}</TableCell>
                    <TableCell><Button type="button" className="btn-secondary btn-sm" onClick={openDryRun}>View I/O →</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      ) : null}

      {tab === 'consumers' ? (
        <Section title="Module consumers" sub="Screens / flows that reference this rule.">
          {consumers.length === 0 ? <div className="muted">No tracked consumers.</div> : (
            <ul className="m-0 list-disc pl-5 leading-8">
              {consumers.map((consumer) => <li key={consumer}>{consumer}</li>)}
            </ul>
          )}
        </Section>
      ) : null}

      {tab === 'audit' ? (
        <Section title="Deploy audit log">
          <Table aria-label="Deploy audit log">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">When</TableHead>
                <TableHead scope="col">Actor</TableHead>
                <TableHead scope="col">Action</TableHead>
                <TableHead scope="col">Deploy ref</TableHead>
                <TableHead scope="col">Notes</TableHead>
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
