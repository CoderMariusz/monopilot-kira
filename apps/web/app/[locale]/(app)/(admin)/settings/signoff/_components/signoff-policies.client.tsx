'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';
import { Switch } from '@monopilot/ui/Switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type {
  SignerRoleOption,
  SignoffPolicy,
  UpsertSignoffPolicyInput,
  UpsertSignoffPolicyResult,
} from '../_actions/signoff-actions';

export type SignoffLabels = {
  title: string;
  description: string;
  colType: string;
  colRequired: string;
  colFirstSigner: string;
  colSecondSigner: string;
  colSameUser: string;
  colActive: string;
  colActions: string;
  edit: string;
  save: string;
  cancel: string;
  unassigned: string;
  allowSameUserOn: string;
  allowSameUserOff: string;
  activeOn: string;
  activeOff: string;
  saved: string;
  readOnly: string;
  permissionDenied: string;
  empty: string;
  typeLabels: Record<string, string>;
  productionApprovalsTitle: string;
  thresholdLabel: string;
  thresholdHelp: string;
  warnThresholdLabel: string;
  warnThresholdHelp: string;
  warnAboveApprove: string;
  thresholdSave: string;
  thresholdSaved: string;
};

type SetThresholds = (input: { warnPct: number; approvePct: number }) => Promise<{
  ok: boolean;
  warnPct?: number;
  approvePct?: number;
  error?: string;
  message?: string;
}>;
type UpsertPolicy = (input: UpsertSignoffPolicyInput) => Promise<UpsertSignoffPolicyResult>;

export type SignoffPoliciesScreenProps = {
  policies: SignoffPolicy[];
  roles: SignerRoleOption[];
  canEdit: boolean;
  initialThresholdPct: number;
  initialWarnPct: number;
  labels: SignoffLabels;
  upsertSignoffPolicy: UpsertPolicy;
  setOverconsumeThresholds: SetThresholds;
};

function typeLabel(labels: SignoffLabels, signoffType: string): string {
  return labels.typeLabels[signoffType] ?? signoffType;
}

export function SignoffPoliciesScreen({
  policies,
  roles,
  canEdit,
  initialThresholdPct,
  initialWarnPct,
  labels,
  upsertSignoffPolicy,
  setOverconsumeThresholds,
}: SignoffPoliciesScreenProps) {
  const [rows, setRows] = React.useState<SignoffPolicy[]>(policies);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<SignoffPolicy | null>(null);
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const roleOptions = React.useMemo(
    () => [{ value: '', label: labels.unassigned }, ...roles.map((r) => ({ value: r.id, label: r.label }))],
    [roles, labels.unassigned],
  );

  function startEdit(policy: SignoffPolicy) {
    setEditing(policy.signoffType);
    setDraft({ ...policy });
    setMessage(null);
    setError(null);
  }

  function cancelEdit() {
    setEditing(null);
    setDraft(null);
  }

  async function saveDraft() {
    if (!draft || pending) return;
    setPending(true);
    setError(null);
    setMessage(null);
    const previous = rows;
    // optimistic
    setRows((current) => current.map((p) => (p.signoffType === draft.signoffType ? draft : p)));
    try {
      const result = await upsertSignoffPolicy({
        signoffType: draft.signoffType,
        requiredSignatures: draft.requiredSignatures,
        firstSignerRoleId: draft.firstSignerRoleId,
        secondSignerRoleId: draft.secondSignerRoleId,
        allowSameUser: draft.allowSameUser,
        isActive: draft.isActive,
      });
      if (result.ok) {
        setRows((current) => current.map((p) => (p.signoffType === result.policy.signoffType ? result.policy : p)));
        setMessage(labels.saved);
        setEditing(null);
        setDraft(null);
        return;
      }
      setRows(previous);
      setError(result.error);
    } catch {
      setRows(previous);
      setError('persistence_failed');
    } finally {
      setPending(false);
    }
  }

  function roleName(id: string | null): string {
    if (!id) return labels.unassigned;
    return roles.find((r) => r.id === id)?.label ?? labels.unassigned;
  }

  return (
    <div className="space-y-6" data-testid="settings-signoff-screen">
      <Card className="card">
        <CardHeader className="card-head !mb-0 !p-0">
          <CardTitle className="card-title">{labels.title}</CardTitle>
          <CardDescription className="muted mt-1 text-[13px]">{labels.description}</CardDescription>
        </CardHeader>
        <CardContent className="!p-0">
          {rows.length === 0 ? (
            <p role="status" className="alert alert-blue mt-3" data-testid="signoff-empty">
              {labels.empty}
            </p>
          ) : (
            <Table className="mt-3 w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>{labels.colType}</TableHead>
                  <TableHead>{labels.colRequired}</TableHead>
                  <TableHead>{labels.colFirstSigner}</TableHead>
                  <TableHead>{labels.colSecondSigner}</TableHead>
                  <TableHead>{labels.colSameUser}</TableHead>
                  <TableHead>{labels.colActive}</TableHead>
                  <TableHead>{labels.colActions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((policy) => {
                  const isEditing = editing === policy.signoffType && draft;
                  return (
                    <TableRow key={policy.signoffType} data-testid={`signoff-row-${policy.signoffType}`}>
                      <TableCell className="font-medium">{typeLabel(labels, policy.signoffType)}</TableCell>

                      {isEditing && draft ? (
                        <>
                          <TableCell>
                            <Select
                              aria-label={labels.colRequired}
                              value={String(draft.requiredSignatures)}
                              options={[
                                { value: '1', label: '1' },
                                { value: '2', label: '2' },
                              ]}
                              onValueChange={(v) => setDraft({ ...draft, requiredSignatures: Number(v) })}
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              aria-label={labels.colFirstSigner}
                              value={draft.firstSignerRoleId ?? ''}
                              options={roleOptions}
                              onValueChange={(v) => setDraft({ ...draft, firstSignerRoleId: v || null })}
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              aria-label={labels.colSecondSigner}
                              value={draft.secondSignerRoleId ?? ''}
                              options={roleOptions}
                              onValueChange={(v) => setDraft({ ...draft, secondSignerRoleId: v || null })}
                            />
                          </TableCell>
                          <TableCell>
                            <Switch
                              aria-label={labels.colSameUser}
                              checked={draft.allowSameUser}
                              onCheckedChange={(next) => setDraft({ ...draft, allowSameUser: next })}
                            />
                          </TableCell>
                          <TableCell>
                            <Switch
                              aria-label={labels.colActive}
                              checked={draft.isActive}
                              onCheckedChange={(next) => setDraft({ ...draft, isActive: next })}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button type="button" disabled={pending} onClick={() => void saveDraft()}>
                                {labels.save}
                              </Button>
                              <Button type="button" className="btn-secondary" disabled={pending} onClick={cancelEdit}>
                                {labels.cancel}
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell>{policy.requiredSignatures}</TableCell>
                          <TableCell>{roleName(policy.firstSignerRoleId)}</TableCell>
                          <TableCell>{roleName(policy.secondSignerRoleId)}</TableCell>
                          <TableCell>{policy.allowSameUser ? labels.allowSameUserOn : labels.allowSameUserOff}</TableCell>
                          <TableCell>{policy.isActive ? labels.activeOn : labels.activeOff}</TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              className="btn-secondary"
                              disabled={!canEdit || pending}
                              onClick={() => startEdit(policy)}
                              data-testid={`signoff-edit-${policy.signoffType}`}
                            >
                              {labels.edit}
                            </Button>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {!canEdit ? (
            <p role="status" className="muted mt-3 text-[11px]">
              {labels.readOnly}
            </p>
          ) : null}
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

      <ProductionApprovalsCard
        canEdit={canEdit}
        initialThresholdPct={initialThresholdPct}
        initialWarnPct={initialWarnPct}
        labels={labels}
        setOverconsumeThresholds={setOverconsumeThresholds}
      />
    </div>
  );
}

function ProductionApprovalsCard({
  canEdit,
  initialThresholdPct,
  initialWarnPct,
  labels,
  setOverconsumeThresholds,
}: {
  canEdit: boolean;
  initialThresholdPct: number;
  initialWarnPct: number;
  labels: SignoffLabels;
  setOverconsumeThresholds: SetThresholds;
}) {
  const [approveValue, setApproveValue] = React.useState<string>(String(initialThresholdPct));
  const [warnValue, setWarnValue] = React.useState<string>(String(initialWarnPct));
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const approveInputId = 'overconsume-threshold-pct';
  const warnInputId = 'overconsume-warn-pct';

  async function save() {
    if (!canEdit || pending) return;
    const approvePct = Number(approveValue);
    const warnPct = Number(warnValue);
    if (
      Number.isNaN(approvePct) || approvePct < 0 || approvePct > 100 ||
      Number.isNaN(warnPct) || warnPct < 0 || warnPct > 100
    ) {
      setError('invalid_input');
      return;
    }
    // warn ≤ approve — same invariant the writer enforces server-side.
    if (warnPct > approvePct) {
      setMessage(null);
      setError(labels.warnAboveApprove);
      return;
    }
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await setOverconsumeThresholds({ warnPct, approvePct });
      if (result.ok) {
        setApproveValue(String(result.approvePct ?? approvePct));
        setWarnValue(String(result.warnPct ?? warnPct));
        setMessage(labels.thresholdSaved);
        return;
      }
      setError(result.error === 'warn_above_approve' ? labels.warnAboveApprove : (result.error ?? 'persistence_failed'));
    } catch {
      setError('persistence_failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="card" data-testid="production-approvals-card">
      <CardHeader className="card-head !mb-0 !p-0">
        <CardTitle className="card-title">{labels.productionApprovalsTitle}</CardTitle>
      </CardHeader>
      <CardContent className="!p-0">
        <div className="mt-3 max-w-xl space-y-4">
          <div className="space-y-2">
            <label htmlFor={warnInputId} className="text-sm font-medium text-[var(--text)]">
              {labels.warnThresholdLabel}
            </label>
            <Input
              id={warnInputId}
              type="number"
              min={0}
              max={100}
              step={1}
              value={warnValue}
              disabled={!canEdit || pending}
              onChange={(e) => setWarnValue(e.target.value)}
              className="w-28"
              aria-describedby={`${warnInputId}-help`}
            />
            <p id={`${warnInputId}-help`} className="muted text-[12px]">
              {labels.warnThresholdHelp}
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor={approveInputId} className="text-sm font-medium text-[var(--text)]">
              {labels.thresholdLabel}
            </label>
            <div className="flex items-center gap-3">
              <Input
                id={approveInputId}
                type="number"
                min={0}
                max={100}
                step={1}
                value={approveValue}
                disabled={!canEdit || pending}
                onChange={(e) => setApproveValue(e.target.value)}
                className="w-28"
                aria-describedby={`${approveInputId}-help`}
              />
              <Button type="button" disabled={!canEdit || pending} onClick={() => void save()}>
                {labels.thresholdSave}
              </Button>
            </div>
            <p id={`${approveInputId}-help`} className="muted text-[12px]">
              {labels.thresholdHelp}
            </p>
          </div>
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
  );
}

export default SignoffPoliciesScreen;
