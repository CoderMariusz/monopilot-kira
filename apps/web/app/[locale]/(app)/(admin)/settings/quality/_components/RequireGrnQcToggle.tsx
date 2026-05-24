'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@monopilot/ui/Card';
import { Switch } from '@monopilot/ui/Switch';

export const REQUIRE_GRN_QC_FLAG_KEY = 'require_grn_qc_inspection' as const;
export const REQUIRE_GRN_QC_PERMISSION = 'settings.flags.edit' as const;

export type SetRequireGrnQcInspectionInput = {
  flagKey?: typeof REQUIRE_GRN_QC_FLAG_KEY;
  enabled: boolean;
  auditReason?: string;
};

export type SetRequireGrnQcInspectionResult =
  | { ok: true; data: { flagKey: typeof REQUIRE_GRN_QC_FLAG_KEY; enabled: boolean; auditLogAction?: 'settings.flag.updated' } }
  | { ok: false; error: 'forbidden' | 'persistence_failed' | 'invalid_input' | string };

export type RequireGrnQcToggleLabels = {
  title: string;
  description: string;
  comingBanner: string;
  onLabel: string;
  offLabel: string;
  readOnly: string;
  saveSuccess: string;
};

export type RequireGrnQcToggleProps = {
  initialEnabled: boolean;
  canEdit: boolean;
  permission: typeof REQUIRE_GRN_QC_PERMISSION;
  labels: RequireGrnQcToggleLabels;
  setRequireGrnQcInspection: (input: SetRequireGrnQcInspectionInput) => Promise<SetRequireGrnQcInspectionResult>;
};

export function RequireGrnQcToggle({
  initialEnabled,
  canEdit,
  permission,
  labels,
  setRequireGrnQcInspection,
}: RequireGrnQcToggleProps) {
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const switchId = 'require-grn-qc-inspection-toggle';
  const statusId = 'require-grn-qc-inspection-status';

  async function handleCheckedChange(nextEnabled: boolean) {
    if (!canEdit || pending) return;

    const previousEnabled = enabled;
    setEnabled(nextEnabled);
    setPending(true);
    setMessage(null);
    setError(null);

    try {
      const result = await setRequireGrnQcInspection({
        flagKey: REQUIRE_GRN_QC_FLAG_KEY,
        enabled: nextEnabled,
        auditReason: `Changed ${REQUIRE_GRN_QC_FLAG_KEY} through ${permission}`,
      });
      if (result.ok) {
        setEnabled(result.data.enabled);
        setMessage(labels.saveSuccess);
        return;
      }
      setEnabled(previousEnabled);
      setError(result.error);
    } catch {
      setEnabled(previousEnabled);
      setError('persistence_failed');
    } finally {
      setPending(false);
    }
  }

  const stateLabel = enabled ? labels.onLabel : labels.offLabel;

  return (
    <section data-testid="require-grn-qc-card" data-region="flag-toggle-card" className="space-y-4">
      <div data-region="quality-coming-banner" role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        {labels.comingBanner}
      </div>

      <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-semibold text-slate-950">{labels.title}</CardTitle>
              <CardDescription className="mt-1 max-w-2xl text-sm text-slate-600">{labels.description}</CardDescription>
            </div>
            <Badge variant={enabled ? 'success' : 'muted'} className="text-[10px]">
              {enabled ? '● ON' : '○ OFF'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50 p-4">
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-semibold text-slate-900">{REQUIRE_GRN_QC_FLAG_KEY}</p>
              <p id={statusId} className="mt-1 text-sm text-slate-700" aria-live="polite">
                {stateLabel}
              </p>
            </div>
            <Switch
              id={switchId}
              checked={enabled}
              disabled={!canEdit || pending}
              aria-label={labels.title}
              aria-describedby={statusId}
              onCheckedChange={(next) => {
                void handleCheckedChange(next);
              }}
            />
          </div>

          <div data-region="flag-rbac-note" className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <span>{canEdit ? permission : labels.readOnly}</span>
            {pending ? (
              <span role="status" aria-live="polite">
                Saving…
              </span>
            ) : null}
          </div>

          {message ? (
            <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              {message}
            </p>
          ) : null}
          {error ? (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

export default RequireGrnQcToggle;
