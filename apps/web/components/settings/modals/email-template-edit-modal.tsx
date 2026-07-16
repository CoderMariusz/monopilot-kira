'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import Summary from '@monopilot/ui/Summary';
import Textarea from '@monopilot/ui/Textarea';

type WizardStep = 'meta' | 'body' | 'review';

export type TemplateVariable = {
  name: string;
  token?: `{{${string}}}`;
  desc: string;
  triggers?: readonly string[];
};

export type EmailTriggerOption = {
  code: string;
  label: string;
  description: string;
};

export type EmailTemplateVariableGroup = {
  group: string;
  vars: TemplateVariable[];
};

export type EmailTemplateDraft = {
  code: string;
  name: string;
  subject: string;
  body: string;
  active: boolean;
  activeTo: string[];
};

export type EmailTemplateSaveResult =
  | { ok: true; templateCode: string; revalidatedPath: '/settings/email' | '/settings/email-templates' }
  | { ok: false; error: 'UNKNOWN_TEMPLATE_VAR' | 'TEMPLATE_CODE_INVALID' | string };

export type EmailTemplateEditModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: EmailTemplateDraft;
  eventPayloadSchema: { variables: string[] };
  supportedTriggers: EmailTriggerOption[];
  variableGroups: EmailTemplateVariableGroup[];
  saveTemplate: (input: EmailTemplateDraft) => Promise<EmailTemplateSaveResult>;
};

const STEPS: Array<{ key: WizardStep; label: string }> = [
  { key: 'meta', label: 'Metadata' },
  { key: 'body', label: 'Subject + body' },
  { key: 'review', label: 'Review' },
];

const EMPTY_TEMPLATE: EmailTemplateDraft = {
  code: '',
  name: '',
  subject: '',
  body: '',
  active: true,
  activeTo: [],
};

const TOKEN_PATTERN = /\{\{\s*([^}\s]+)\s*\}\}/g;

function Field({
  id,
  label,
  required = false,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  children: React.ReactNode;
}) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  return (
    <div className="ff">
      <label htmlFor={id}>
        {label} {required ? <span className="req" aria-hidden="true">*</span> : null}
      </label>
      {children}
      {error ? (
        <div id={errorId} role="alert" className="ff-error">
          {error}
        </div>
      ) : help ? (
        <div id={helpId} className="ff-help">
          {help}
        </div>
      ) : null}
    </div>
  );
}

function extractTemplateVars(...sources: string[]) {
  const vars = new Set<string>();

  for (const source of sources) {
    for (const match of source.matchAll(TOKEN_PATTERN)) {
      if (match[1]) vars.add(match[1]);
    }
  }

  return [...vars];
}

function variableToken(variable: TemplateVariable) {
  return variable.token ?? `{{${variable.name}}}`;
}

function variableAppliesToTrigger(variable: TemplateVariable, triggerCode: string) {
  if (!variable.triggers || variable.triggers.length === 0) return true;
  return variable.triggers.includes(triggerCode);
}

function groupsForTrigger(groups: EmailTemplateVariableGroup[], triggerCode: string): EmailTemplateVariableGroup[] {
  return groups
    .map((group) => ({
      ...group,
      vars: group.vars.filter((variable) => variableAppliesToTrigger(variable, triggerCode)),
    }))
    .filter((group) => group.vars.length > 0);
}

function allowedVariablesForTrigger(groups: EmailTemplateVariableGroup[], triggerCode: string): Set<string> {
  return new Set(
    groupsForTrigger(groups, triggerCode).flatMap((group) => group.vars.map((variable) => variable.name)),
  );
}

function parseRecipients(value: string) {
  return value
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeMustacheLiteral(value: string) {
  return value.replace(/(^|[^{])\{([a-zA-Z0-9_.-]+)}}/g, (_match, prefix: string, variable: string) => {
    return `${prefix}{{${variable}}}`;
  });
}

function Stepper({ current, completed }: { current: WizardStep; completed: Set<WizardStep> }) {
  return (
    <nav aria-label="Wizard steps" className="wiz-stepper" style={{ gap: 8 }}>
      {STEPS.map((step, index) => {
        const active = step.key === current;
        const done = completed.has(step.key);

        return (
          <React.Fragment key={step.key}>
            {index > 0 ? <span className={`wiz-step-line${done ? ' done' : ''}`} aria-hidden="true" /> : null}
            <div
              className={`wiz-step${active ? ' current' : ''}${done ? ' done' : ''}`}
              aria-current={active ? 'step' : undefined}
              data-complete={done ? 'true' : undefined}
            >
              <span className="wiz-step-num" aria-hidden="true">
                {done ? '✓' : index + 1}
              </span>
              {step.label}
            </div>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export function EmailTemplateEditModal({
  open,
  onOpenChange,
  template,
  eventPayloadSchema,
  supportedTriggers,
  variableGroups,
  saveTemplate,
}: EmailTemplateEditModalProps) {
  const tpl = template ?? EMPTY_TEMPLATE;
  const isEditing = Boolean(tpl.code);
  const triggerCodeId = React.useId();
  const displayNameId = React.useId();
  const activeToId = React.useId();
  const subjectId = React.useId();
  const bodyId = React.useId();
  const variableSearchId = React.useId();
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const [step, setStep] = React.useState<WizardStep>('meta');
  const [completed, setCompleted] = React.useState<Set<WizardStep>>(new Set());
  const [code, setCode] = React.useState(tpl.code);
  const [name, setName] = React.useState(tpl.name);
  const [subject, setSubject] = React.useState(tpl.subject);
  const [body, setBody] = React.useState(tpl.body);
  const [to, setTo] = React.useState((tpl.activeTo || []).join('; '));
  const [variableQuery, setVariableQuery] = React.useState('');
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useLayoutEffect(() => {
    if (!open) return;

    setStep('meta');
    setCompleted(new Set());
    setCode(tpl.code);
    setName(tpl.name);
    setSubject(tpl.subject);
    setBody(tpl.body);
    setTo((tpl.activeTo || []).join('; '));
    setVariableQuery('');
    setValidationError(null);
    setSubmitError(null);
    setSubmitting(false);

    const beforeGuard = document.createElement('span');
    const afterGuard = document.createElement('span');
    beforeGuard.setAttribute('data-radix-focus-guard', '');
    afterGuard.setAttribute('data-radix-focus-guard', '');
    document.body.prepend(beforeGuard);
    document.body.append(afterGuard);

    return () => {
      beforeGuard.remove();
      afterGuard.remove();
    };
  }, [open, tpl.activeTo, tpl.body, tpl.code, tpl.name, tpl.subject]);

  const supportedTriggerCodes = React.useMemo(
    () => new Set(supportedTriggers.map((trigger) => trigger.code)),
    [supportedTriggers],
  );
  const codeInvalid = !isEditing && code.length > 0 && !supportedTriggerCodes.has(code);
  const metaValid = name.trim().length >= 3 && (isEditing || supportedTriggerCodes.has(code));
  const bodyValid = subject.trim().length >= 3 && body.trim().length >= 10;
  const triggerOptions = React.useMemo(
    () => supportedTriggers.map((trigger) => ({ value: trigger.code, label: `${trigger.label} (${trigger.code})` })),
    [supportedTriggers],
  );
  const selectedTriggerHelp = React.useMemo(() => {
    const match = supportedTriggers.find((trigger) => trigger.code === code);
    if (!match) {
      return supportedTriggers.length > 0
        ? `Choose a supported trigger: ${supportedTriggers.map((trigger) => trigger.code).join(', ')}.`
        : 'No supported triggers are configured.';
    }
    return match.description;
  }, [code, supportedTriggers]);
  const scopedVariableGroups = React.useMemo(
    () => (code ? groupsForTrigger(variableGroups, code) : []),
    [code, variableGroups],
  );
  const allowedVariables = React.useMemo(() => {
    if (code && supportedTriggerCodes.has(code)) return allowedVariablesForTrigger(variableGroups, code);
    if (code) return new Set(eventPayloadSchema.variables);
    return new Set<string>();
  }, [code, eventPayloadSchema.variables, supportedTriggerCodes, variableGroups]);
  const filteredGroups = React.useMemo(() => {
    const query = variableQuery.trim().toLowerCase();

    return scopedVariableGroups
      .map((group) => ({
        ...group,
        vars: group.vars.filter((variable) => (query ? variable.name.toLowerCase().startsWith(query) : true)),
      }))
      .filter((group) => group.vars.length > 0);
  }, [scopedVariableGroups, variableQuery]);

  function markComplete(currentStep: WizardStep) {
    setCompleted((prior) => new Set([...prior, currentStep]));
  }

  function goNext() {
    if (step === 'meta') {
      if (!metaValid) return;
      setValidationError(null);
      markComplete('meta');
      setStep('body');
      return;
    }

    if (step === 'body') {
      if (!bodyValid) return;
      const unknown = extractTemplateVars(subject, body, to).filter((variable) => !allowedVariables.has(variable));
      if (unknown.length > 0) {
        setValidationError('UNKNOWN_TEMPLATE_VAR');
        return;
      }
      setValidationError(null);
      markComplete('body');
      setStep('review');
    }
  }

  function goBack() {
    setValidationError(null);
    setSubmitError(null);
    setStep(step === 'review' ? 'body' : 'meta');
  }

  function insertVariable(variable: TemplateVariable) {
    const token = variableToken(variable);
    setValidationError(null);
    setBody((current) => `${current}${current.endsWith(' ') || current.length === 0 ? '' : ' '}${token}`);
    queueMicrotask(() => bodyRef.current?.focus());
  }

  async function submit() {
    if (submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const normalizedSubject = normalizeMustacheLiteral(subject);
      const normalizedBody = normalizeMustacheLiteral(body);
      const result = await saveTemplate({
        code: code.trim(),
        name: name.trim(),
        subject: normalizedSubject,
        body: normalizedBody,
        active: tpl.active,
        activeTo: parseRecipients(to),
      });

      if (result.ok) {
        onOpenChange(false);
        return;
      }

      if ('error' in result) {
        setSubmitError(result.error || 'SAVE_TEMPLATE_FAILED');
      }
    } catch {
      setSubmitError('SAVE_TEMPLATE_FAILED');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onOpenChange(false);
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  const title = tpl.code ? `Edit template — ${tpl.code}` : 'New email template';

  return (
    <div className="modal-overlay">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sm-04-email-template-title"
        data-focus-trap="radix-dialog"
        data-modal-id="SM-04"
        data-size="wide"
        onKeyDown={handleDialogKeyDown}
        className="modal-box wide"
        style={{ maxWidth: 'var(--modal-size-wide-width)' }}
      >
        <div data-testid="modal-header" className="modal-head">
          <h2 id="sm-04-email-template-title" className="modal-title" style={{ margin: 0 }}>
            {title}
          </h2>
        </div>
        <div data-testid="modal-body" className="modal-body">
        <div data-testid="email-template-edit-modal">
          <Stepper current={step} completed={completed} />

          {step === 'meta' ? (
            <div style={{ marginTop: 14 }}>
              <Field
                id={triggerCodeId}
                label="Trigger code"
                required
                help={selectedTriggerHelp}
                error={codeInvalid ? 'Choose a supported trigger code from the list.' : undefined}
              >
                {isEditing ? (
                  <Input
                    id={triggerCodeId}
                    value={code}
                    readOnly
                    className="mono"
                    aria-describedby={`${triggerCodeId}-help`}
                  />
                ) : (
                  <Select
                    value={code || undefined}
                    onValueChange={(value) => {
                      setCode(value);
                      setValidationError(null);
                    }}
                    options={triggerOptions}
                  >
                    <SelectTrigger id={triggerCodeId} aria-label="Trigger code" className="mono min-w-[280px]">
                      <SelectValue placeholder="core_closed" />
                    </SelectTrigger>
                    <SelectContent>
                      {supportedTriggers.map((trigger) => (
                        <SelectItem key={trigger.code} value={trigger.code}>
                          {trigger.label} ({trigger.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <Field id={displayNameId} label="Display name" required>
                <Input
                  id={displayNameId}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Purchase order → supplier"
                />
              </Field>
              <Field
                id={activeToId}
                label="Active recipients (To)"
                help="Semicolon-separated. Supports merge fields like {{supplier.email}}."
              >
                <Input
                  id={activeToId}
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  placeholder="{{supplier.email}}; procurement@…"
                  aria-describedby={`${activeToId}-help`}
                />
              </Field>
            </div>
          ) : null}

          {step === 'body' ? (
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 260px', gap: 14 }}>
              <div>
                <Field id={subjectId} label="Subject" required help="Mustache variables allowed: {{var.name}}">
                  <Input
                    id={subjectId}
                    value={subject}
                    onChange={(event) => {
                      setSubject(event.target.value);
                      setValidationError(null);
                    }}
                    aria-describedby={`${subjectId}-help`}
                  />
                </Field>
                <Field id={bodyId} label="Body" required help="Mustache template.">
                  <Textarea
                    ref={bodyRef}
                    id={bodyId}
                    value={body}
                    onChange={(event) => {
                      setBody(event.target.value);
                      setValidationError(null);
                    }}
                    aria-describedby={`${bodyId}-help`}
                    style={{ minHeight: 220, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                  />
                </Field>
                {validationError ? (
                  <div role="alert" style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>
                    {validationError}
                  </div>
                ) : null}
              </div>
              <div>
                <div
                  style={{
                    color: 'var(--muted)',
                    fontSize: 11,
                    letterSpacing: 0.05,
                    marginBottom: 6,
                    textTransform: 'uppercase',
                  }}
                >
                  Variable picker
                </div>
                <label htmlFor={variableSearchId} style={{ display: 'block', fontSize: 11, marginBottom: 6 }}>
                  Search variables
                </label>
                <Input
                  id={variableSearchId}
                  role="searchbox"
                  value={variableQuery}
                  onChange={(event) => setVariableQuery(event.target.value)}
                  placeholder="fa_"
                  aria-label="Search variables"
                  style={{ marginBottom: 8 }}
                />
                <div style={{ border: '1px solid var(--border)', borderRadius: 6, maxHeight: 320, overflow: 'auto' }}>
                  {filteredGroups.length > 0 ? (
                    filteredGroups.map((group) => (
                      <div key={group.group}>
                        <div
                          style={{
                            background: 'var(--gray-100)',
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: 0.05,
                            padding: '6px 10px',
                            textTransform: 'uppercase',
                          }}
                        >
                          {group.group}
                        </div>
                        {group.vars.map((variable) => (
                          <button
                            key={variable.name}
                            type="button"
                            onClick={() => insertVariable(variable)}
                            style={{
                              background: 'transparent',
                              border: 0,
                              borderTop: '1px solid var(--border)',
                              cursor: 'pointer',
                              display: 'block',
                              fontSize: 11,
                              padding: '6px 10px',
                              textAlign: 'left',
                              width: '100%',
                            }}
                          >
                            <code style={{ color: 'var(--blue)' }}>{variable.name}</code>
                            <div className="muted" style={{ fontSize: 10, marginTop: 1 }}>
                              {variable.desc}
                            </div>
                          </button>
                        ))}
                      </div>
                    ))
                  ) : (
                    <div role="status" style={{ color: 'var(--muted)', fontSize: 11, padding: 10 }}>
                      No variables available
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {step === 'review' ? (
            <div style={{ marginTop: 14 }}>
              <Summary
                rows={[
                  { label: 'Trigger code', after: code },
                  { label: 'Display name', after: name },
                  { label: 'To (active)', after: to || '—' },
                  { label: 'Subject', after: subject },
                  { label: 'Body length', after: `${body.length} chars`, status: 'changed' },
                ]}
              />
              <div
                style={{
                  background: 'var(--gray-050)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  marginTop: 10,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    color: 'var(--muted)',
                    fontSize: 11,
                    letterSpacing: 0.05,
                    marginBottom: 6,
                    textTransform: 'uppercase',
                  }}
                >
                  Rendered preview (sample data)
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  {subject.replace(/\{\{[^}]+\}\}/g, '…')}
                </div>
                <pre
                  className="mono"
                  style={{ background: '#fff', borderRadius: 4, fontSize: 11, margin: 0, maxHeight: 140, overflow: 'auto', padding: 10 }}
                >
                  {body.replace(/\{\{[^}]+\}\}/g, '…')}
                </pre>
              </div>
              {submitError ? (
                <div role="alert" style={{ color: 'var(--red)', fontSize: 12, marginTop: 10 }}>
                  {submitError}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
        <div data-testid="modal-footer" className="modal-foot">
        {step === 'meta' ? (
          <>
            <Button type="button" className="btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" className="btn-primary btn-sm" disabled={!metaValid} onClick={goNext}>
              Next →
            </Button>
          </>
        ) : step === 'body' ? (
          <>
            <Button type="button" className="btn-ghost btn-sm" onClick={goBack}>
              ← Back
            </Button>
            <span className="spacer" style={{ flex: 1 }} />
            <Button type="button" className="btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" className="btn-primary btn-sm" disabled={!bodyValid || Boolean(validationError)} onClick={goNext}>
              Next: review →
            </Button>
          </>
        ) : (
          <>
            <Button type="button" className="btn-ghost btn-sm" onClick={goBack} disabled={submitting}>
              ← Back
            </Button>
            <span className="spacer" style={{ flex: 1 }} />
            <Button type="button" className="btn-secondary btn-sm" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" className="btn-primary btn-sm" onClick={submit} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save template'}
            </Button>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

export default EmailTemplateEditModal;
