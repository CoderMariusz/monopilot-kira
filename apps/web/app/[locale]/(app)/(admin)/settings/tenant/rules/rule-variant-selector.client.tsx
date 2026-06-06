"use client";

import { useActionState } from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import { PageHeader } from '@monopilot/ui/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type RuleVariant = {
  version: 'v1' | 'v2' | `v${number}`;
  label?: string;
  requiresNewVersion?: boolean;
  technicalApprovalRequired?: boolean;
};

export type RuleVariantRow = {
  code: string;
  ruleType: 'gate' | 'workflow' | 'validation' | 'calculation' | 'cascading' | 'conditional';
  availableVariants: RuleVariant[];
  currentVariant: string;
  lastChangedAt: string | null;
  readOnly?: boolean;
  linkedAuthorizationPolicyHref?: string;
};

export type SaveVariantOverrides = (input: {
  ruleVariantOverrides: Record<string, string>;
}) => Promise<{ ok: true } | { ok: false; code?: string; error?: string; message?: string }>;

export type Labels = {
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

type FeedbackState =
  | { kind: 'idle'; message: null }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

const initialFeedbackState: FeedbackState = { kind: 'idle', message: null };

function formatDate(value: string | null, labels: Labels) {
  if (!value) return labels.neverChanged;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toISOString().slice(0, 10);
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

export function RuleVariantSelectorClient({
  labels,
  rows,
  forcedRuleCode,
  forcedVariant,
  saveRuleVariantOverrides,
}: {
  labels: Labels;
  rows: RuleVariantRow[];
  forcedRuleCode?: string;
  forcedVariant?: string;
  saveRuleVariantOverrides: SaveVariantOverrides;
}) {
  const [feedback, formAction, isPending] = useActionState(async (_previous: FeedbackState, formData: FormData) => {
    const ruleVariantOverrides = collectOverrides(formData, rows);
    const result = await saveRuleVariantOverrides({ ruleVariantOverrides });
    if (result.ok === true) {
      return { kind: 'success', message: labels.saved } satisfies FeedbackState;
    }

    const code = result.code ?? result.error ?? 'VARIANT_NOT_FOUND';
    const message = result.message ?? (code === 'VARIANT_NOT_FOUND'
      ? 'V-SET-31: variant must reference an existing rule_definitions.version'
      : 'Unable to save rule variant selections.');
    return { kind: 'error', message: `${code}: ${message}` } satisfies FeedbackState;
  }, initialFeedbackState);

  const alertIsError = feedback.kind === 'error';
  const alertMessage = alertIsError ? feedback.message : labels.advisory;
  const statusMessage = isPending ? labels.saving : feedback.kind === 'success' ? feedback.message : '';

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
        aria-live={alertIsError ? 'assertive' : 'polite'}
        className={alertIsError
          ? 'alert alert-red rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900'
          : 'alert alert-blue rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900'}
      >
        {alertMessage}
      </div>

      <form action={formAction} data-region="variant-selector-form" className="space-y-4">
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
                          <div className="mt-1 text-xs text-muted-foreground">requires_new_version</div>
                        ) : null}
                        {row.availableVariants.some((variant) => variant.technicalApprovalRequired) ? (
                          <div className="mt-1 text-xs text-muted-foreground">technical approval required</div>
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
                                disabled={row.readOnly || isPending}
                                aria-label={`${row.code} ${variant.version}`}
                              />
                              <span className="mono">{variant.version}</span>
                            </label>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="mono text-xs text-muted-foreground align-top">{formatDate(row.lastChangedAt, labels)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-3">
          <p id="rule-variant-selector-status" role="status" className="text-sm text-muted-foreground" aria-live="polite">
            {statusMessage}
          </p>
          <Button type="submit" className="btn-primary" disabled={isPending}>
            {isPending ? labels.saving : labels.saveAll}
          </Button>
        </div>
      </form>
    </main>
  );
}
