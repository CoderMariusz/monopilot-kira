'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@monopilot/ui/Card';
import { Switch } from '@monopilot/ui/Switch';

import type {
  ScannerAuthPolicy,
  SetScannerReverseAuthPolicyInput,
  SetScannerReverseAuthPolicyResult,
} from '../_actions/scanner-auth-actions';

export type ScannerAuthLabels = {
  title: string;
  description: string;
  reverseTitle: string;
  reverseDescription: string;
  toggleLabel: string;
  toggleHelpOn: string;
  toggleHelpOff: string;
  operatorNote: string;
  save: string;
  saved: string;
  readOnly: string;
  errorGeneric: string;
};

type SetPolicy = (input: SetScannerReverseAuthPolicyInput) => Promise<SetScannerReverseAuthPolicyResult>;

export type ScannerAuthPoliciesScreenProps = {
  policy: ScannerAuthPolicy;
  canEdit: boolean;
  labels: ScannerAuthLabels;
  setScannerReverseAuthPolicy: SetPolicy;
};

export function ScannerAuthPoliciesScreen({
  policy,
  canEdit,
  labels,
  setScannerReverseAuthPolicy,
}: ScannerAuthPoliciesScreenProps) {
  const [requireSupervisorPin, setRequireSupervisorPin] = React.useState(policy.requireSupervisorPin);
  const [savedValue, setSavedValue] = React.useState(policy.requireSupervisorPin);
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const dirty = requireSupervisorPin !== savedValue;

  async function save() {
    if (!canEdit || pending || !dirty) return;
    setPending(true);
    setError(null);
    setMessage(null);
    const previous = savedValue;
    // optimistic — snap the saved baseline to the new value, roll back on failure.
    setSavedValue(requireSupervisorPin);
    try {
      const result = await setScannerReverseAuthPolicy({ requireSupervisorPin });
      if (result.ok) {
        setSavedValue(result.requireSupervisorPin);
        setRequireSupervisorPin(result.requireSupervisorPin);
        setMessage(labels.saved);
        return;
      }
      setSavedValue(previous);
      setError(result.error ?? labels.errorGeneric);
    } catch {
      setSavedValue(previous);
      setError(labels.errorGeneric);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="settings-scanner-auth-screen">
      <Card className="card" data-testid="scanner-reverse-auth-card">
        <CardHeader className="card-head !mb-0 !p-0">
          <CardTitle className="card-title">{labels.reverseTitle}</CardTitle>
          <CardDescription className="muted mt-1 text-[13px]">{labels.reverseDescription}</CardDescription>
        </CardHeader>
        <CardContent className="!p-0">
          <div className="mt-3 max-w-xl space-y-4">
            <div className="flex items-start gap-3">
              <Switch
                aria-label={labels.toggleLabel}
                checked={requireSupervisorPin}
                disabled={!canEdit || pending}
                onCheckedChange={(next) => {
                  setRequireSupervisorPin(next);
                  setMessage(null);
                  setError(null);
                }}
                data-testid="scanner-reverse-supervisor-toggle"
              />
              <div className="space-y-1">
                <div className="text-sm font-medium text-[var(--text)]">{labels.toggleLabel}</div>
                <p className="muted text-[12px]">
                  {requireSupervisorPin ? labels.toggleHelpOn : labels.toggleHelpOff}
                </p>
              </div>
            </div>

            <p className="muted text-[12px]">{labels.operatorNote}</p>

            <div className="flex items-center gap-3">
              <Button type="button" disabled={!canEdit || pending || !dirty} onClick={() => void save()}>
                {labels.save}
              </Button>
            </div>

            {!canEdit ? (
              <p role="status" className="muted text-[11px]">
                {labels.readOnly}
              </p>
            ) : null}
            {message ? (
              <p role="status" className="alert alert-green">
                {message}
              </p>
            ) : null}
            {error ? (
              <div role="alert" className="alert alert-red">
                {error}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ScannerAuthPoliciesScreen;
