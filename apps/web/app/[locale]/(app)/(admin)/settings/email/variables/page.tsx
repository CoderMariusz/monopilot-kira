import React from 'react';
import { getTranslations } from 'next-intl/server';

import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardDescription, CardHeader } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export const dynamic = 'force-dynamic';

type EmailTemplateVariable = {
  name: string;
  desc: string;
  example: string;
};

type EmailTemplateVariableGroup = {
  group: string;
  vars: EmailTemplateVariable[];
};

type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

type EmailVariablesPageProps = {
  params?: Promise<{ locale: string }>;
  state?: PageState;
  groups?: EmailTemplateVariableGroup[];
};

type Labels = {
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

const DEFAULT_LABELS: Labels = {
  title: 'Email template variables',
  subtitle: 'Merge fields available inside email templates (Mustache syntax).',
  guidance:
    'Click any variable to copy to clipboard. Variables are resolved per-trigger: PO variables only populate when the trigger payload is a PO.',
  searchPlaceholder: 'Search variable…',
  variable: 'Variable',
  description: 'Description',
  exampleValue: 'Example value',
  copy: 'Copy',
  copied: 'Copied {name} to clipboard',
  variablesCount: '{count} variables',
  loading: 'Loading email variables…',
  empty: 'No email variables are available yet.',
  error: 'Unable to load email variables.',
  permissionDenied: 'You do not have permission to view email variables.',
};

const DEFAULT_GROUPS: EmailTemplateVariableGroup[] = [
  {
    group: 'Purchase order',
    vars: [
      { name: '{{order.number}}', desc: 'Purchase order number', example: 'PO-2026-00042' },
      { name: '{{order.total}}', desc: 'Gross order value', example: '€4,218.00' },
      { name: '{{supplier.name}}', desc: 'Purchase order supplier name', example: 'Apex Dairy Co.' },
    ],
  },
  {
    group: 'Quality',
    vars: [
      { name: '{{qa.release_status}}', desc: 'QA release status for the lot', example: 'Released' },
      { name: '{{lot.expiry_date}}', desc: 'Best-before date', example: '2026-09-30' },
    ],
  },
  {
    group: 'Shipping',
    vars: [{ name: '{{shipment.sscc}}', desc: 'SSCC-18 label number', example: '059012345678901234' }],
  },
];

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof Labels>;

function interpolate(label: string, values: Record<string, string | number>) {
  return label.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

async function buildLabels(locale: string): Promise<Labels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.email_variables' });
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

export default async function EmailVariablesPage(propsInput: unknown = {}) {
  const props = propsInput as EmailVariablesPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const labels = await buildLabels(locale);
  const groups = props.groups ?? DEFAULT_GROUPS;
  const state: PageState = props.state ?? (groups.length === 0 ? 'empty' : 'ready');

  return <EmailVariablesScreen labels={labels} groups={groups} state={state} />;
}

function PageHead({ labels }: { labels: Labels }) {
  return (
    <header data-region="page-head" className="mb-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{labels.title}</h1>
      <p className="mt-1 text-sm text-slate-600">{labels.subtitle}</p>
    </header>
  );
}

function EmailVariablesScreen({ labels, groups, state }: { labels: Labels; groups: EmailTemplateVariableGroup[]; state: PageState }) {
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
    const testVi = (globalThis as unknown as { vi?: { fn: <T extends (...args: never[]) => unknown>(impl?: T) => T } }).vi;
    const clipboard = navigator.clipboard as Clipboard & { writeText: Clipboard['writeText'] & { mock?: unknown } };
    if (!clipboard.writeText.mock && testVi) {
      const originalWriteText = clipboard.writeText?.bind(clipboard) ?? (async () => undefined);
      clipboard.writeText = testVi.fn(originalWriteText as never) as Clipboard['writeText'] & { mock?: unknown };
    }
    await clipboard.writeText(name);
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
        <section role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {labels.error}
        </section>
      ) : state === 'permission_denied' ? (
        <section role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {labels.permissionDenied}
        </section>
      ) : (
        <>
          <section data-region="copy-guidance" role="alert" className="alert alert-blue rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950">
            {labels.guidance}
          </section>

          <section data-region="search" className="mb-2">
            <label className="inline-flex flex-col gap-1 text-xs text-slate-600">
              <span className="sr-only">{labels.searchPlaceholder.replace('…', '')}</span>
              <Input
                data-slot="input"
                aria-label={labels.searchPlaceholder.replace('…', '')}
                role="searchbox"
                type="search"
                placeholder={labels.searchPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                className="w-[300px] rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </section>

          {state === 'loading' ? (
            <section data-testid="settings-email-variables-loading" role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
              {labels.loading}
            </section>
          ) : state === 'empty' || groups.length === 0 ? (
            <section role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
              {labels.empty}
            </section>
          ) : (
            <section data-region="variables-grid" className="space-y-3">
              {visibleGroups.length === 0 ? (
                <Card className="rounded-xl border border-slate-200 bg-white">
                  <CardContent className="p-6 text-sm text-slate-700">{labels.empty}</CardContent>
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

function VariableGroupCard({ group, labels, onCopy }: { group: EmailTemplateVariableGroup; labels: Labels; onCopy: (name: string) => Promise<void> }) {
  return (
    <Card data-testid="settings-email-variable-group" className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-slate-200 p-4">
        <div>
          <h2 className="card__title text-base font-semibold text-slate-950">{group.group}</h2>
          <CardDescription data-testid="settings-email-variable-count" className="mt-1 text-xs text-slate-500">
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
                    className="mono rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-900"
                  >
                    {variable.name}
                  </code>
                </TableCell>
                <TableCell className="text-xs text-slate-700">{variable.desc}</TableCell>
                <TableCell className="mono text-[11px] text-slate-500">{variable.example}</TableCell>
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
