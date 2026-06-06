'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardDescription, CardHeader } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type EmailTemplateVariable = {
  name: string;
  desc: string;
  example: string;
};

export type EmailTemplateVariableGroup = {
  group: string;
  vars: EmailTemplateVariable[];
};

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type EmailVariablesScreenLabels = {
  title: string;
  subtitle: string;
  guidance: string;
  searchPlaceholder: string;
  variable: string;
  description: string;
  exampleValue: string;
  copy: string;
  copied: string;
  variablesCount: string;
  loading: string;
  empty: string;
  error: string;
  permissionDenied: string;
};

export type EmailVariablesScreenProps = {
  labels: EmailVariablesScreenLabels;
  groups: EmailTemplateVariableGroup[];
  state: PageState;
};

function interpolate(label: string, values: Record<string, string | number>) {
  return label.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

function PageHead({ labels }: { labels: EmailVariablesScreenLabels }) {
  return (
    <header data-region="page-head" className="sg-head mb-4">
      <h1 className="page-title">{labels.title}</h1>
      <p className="helper mt-1">{labels.subtitle}</p>
    </header>
  );
}

export default function EmailVariablesScreen({ labels, groups, state }: EmailVariablesScreenProps) {
  const [query, setQuery] = React.useState('');
  const [copiedName, setCopiedName] = React.useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      vars: group.vars.filter((variable) => !normalizedQuery || variable.name.toLowerCase().includes(normalizedQuery)),
    }))
    .filter((group) => group.vars.length > 0);

  async function copyVariable(name: string) {
    await navigator.clipboard.writeText(name);
    setCopiedName(name);
  }

  return (
    <main
      data-testid="settings-email-variables-screen"
      data-route="/settings/email/variables"
      data-screen="email_variables_screen"
      data-prototype-source="prototypes/design/Monopilot Design System/settings/admin-screens.jsx:678-717"
      className="space-y-3 p-6"
      aria-busy={state === 'loading'}
    >
      <PageHead labels={labels} />

      {state === 'error' ? (
        <section role="alert" className="alert alert-red">
          {labels.error}
        </section>
      ) : state === 'permission_denied' ? (
        <section role="alert" className="alert alert-amber">
          {labels.permissionDenied}
        </section>
      ) : (
        <>
          <section data-region="copy-guidance" role="alert" className="alert alert-blue">
            {labels.guidance}
          </section>

          <section data-region="search" className="mb-2">
            <label className="inline-flex flex-col gap-1 text-xs text-slate-600">
              <span className="sr-only">{labels.searchPlaceholder.replace('…', '')}</span>
              <Input
                aria-label={labels.searchPlaceholder.replace('…', '')}
                role="searchbox"
                type="search"
                placeholder={labels.searchPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                className="form-input w-[300px]"
              />
            </label>
          </section>

          {state === 'loading' ? (
            <section data-testid="settings-email-variables-loading" role="status" className="card helper">
              {labels.loading}
            </section>
          ) : state === 'empty' || groups.length === 0 ? (
            <section role="status" className="empty-state">
              <div aria-hidden="true" className="empty-state-icon">✉️</div>
              <p className="empty-state-body">{labels.empty}</p>
            </section>
          ) : (
            <section data-region="variables-grid" className="space-y-3">
              {visibleGroups.length === 0 ? (
                <Card className="empty-state">
                  <CardContent className="empty-state-body">{labels.empty}</CardContent>
                </Card>
              ) : (
                visibleGroups.map((group) => (
                  <VariableGroupCard key={group.group} group={group} labels={labels} onCopy={copyVariable} />
                ))
              )}
            </section>
          )}

          {copiedName ? (
            <div role="status" aria-live="polite" className="sr-only">
              {interpolate(labels.copied, { name: copiedName })}
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}

function VariableGroupCard({
  group,
  labels,
  onCopy,
}: {
  group: EmailTemplateVariableGroup;
  labels: EmailVariablesScreenLabels;
  onCopy: (name: string) => Promise<void>;
}) {
  return (
    <Card data-testid="settings-email-variable-group" className="card">
      <CardHeader className="card-head mb-3 flex flex-row items-start justify-between gap-4 border-b border-[var(--border)] pb-3">
        <div>
          <h2 className="card-title card__title">{group.group}</h2>
          <CardDescription data-testid="settings-email-variable-count" className="helper mt-1">
            {interpolate(labels.variablesCount, { count: group.vars.length })}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table className="w-full text-sm">
          <TableHeader>
            <TableRow>
              <TableHead scope="col" style={{ width: 240 }}>{labels.variable}</TableHead>
              <TableHead scope="col">{labels.description}</TableHead>
              <TableHead scope="col">{labels.exampleValue}</TableHead>
              <TableHead scope="col" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.vars.map((variable) => (
              <TableRow key={variable.name} data-testid="settings-email-variable-row">
                <TableCell>
                  <code
                    data-testid="settings-email-variable-name"
                    className="mono rounded bg-[var(--gray-100)] px-2 py-0.5 text-[11px]"
                  >
                    {variable.name}
                  </code>
                </TableCell>
                <TableCell className="text-xs">{variable.desc}</TableCell>
                <TableCell className="mono muted text-[11px]">{variable.example}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" className="btn-secondary btn-sm" onClick={() => void onCopy(variable.name)}>
                    {labels.copy}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
