'use client';

import React from 'react';

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
    <section data-testid="require-grn-qc-card" data-region="flag-toggle-card" className="space-y-3">
      <div data-region="quality-coming-banner" role="status" className="alert alert-blue">
        {labels.comingBanner}
      </div>

      <Card className="card">
        <CardHeader className="card-head !mb-0 !p-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="card-title">{labels.title}</CardTitle>
              <CardDescription className="muted mt-1 max-w-2xl text-[13px]">{labels.description}</CardDescription>
            </div>
            <span className={`badge ${enabled ? 'badge-green' : 'badge-gray'}`}>
              {enabled ? '● ON' : '○ OFF'}
            </span>
          </div>
        </CardHeader>
        <CardContent className="!p-0">
          <div className="mt-3 flex items-center justify-between gap-4 rounded-md border border-[var(--border)] bg-[var(--gray-050)] p-3">
            <div className="min-w-0">
              <p className="mono text-[11px] font-semibold text-[var(--text)]">{REQUIRE_GRN_QC_FLAG_KEY}</p>
              <p id={statusId} className="muted mt-1 text-[13px]" aria-live="polite">
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

          <div data-region="flag-rbac-note" className="muted mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px]">
            <span>{canEdit ? permission : labels.readOnly}</span>
            {pending ? (
              <span role="status" aria-live="polite">
                Saving…
              </span>
            ) : null}
          </div>

          {message ? (
            <p role="status" className="alert alert-green mt-3">
              {message}
            </p>
          ) : null}
          {error ? (
            <div role="alert" className="alert alert-red mt-3">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

export default RequireGrnQcToggle;
