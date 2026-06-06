'use client';

/**
 * Settings → Modal gallery (developer / design-system reference surface).
 *
 * Living documentation of the app's modal system: each Section showcases one
 * modal variant with a trigger button that opens the REAL shared
 * `@monopilot/ui/Modal` (Radix-backed) wrapped in the prototype `.modal-*`
 * chrome classes. No Supabase data — this is a reference catalogue.
 *
 * data-prototype-source:
 *   prototypes/design/Monopilot Design System/settings/modals.jsx
 *
 * Variant map (prototype SM-id → Section showcased here):
 *   SM-01 RuleDryRunModal          — preview / compare (dry-run)        → size lg
 *   SM-02 FlagEditModal            — simple form + audit reason          → size md
 *   SM-03 SchemaViewModal          — read-only summary view             → size lg
 *   SM-04 EmailTemplateEditModal   — wizard w/ variable picker          → size lg (stepper)
 *   SM-05 PromoteToL2Modal         — wizard w/ diff preview             → size lg (stepper)
 *   SM-06 UserInviteModal          — simple form                        → size md
 *   SM-07 RoleAssignModal          — picker-backed form                 → size lg
 *   SM-08 D365TestConnectionModal  — confirm + async result            → size sm
 *   SM-09 PasswordResetModal       — destructive confirm (non-dismiss)  → size sm
 *   SM-10 DeleteReferenceDataModal — destructive type-to-confirm        → size sm
 *   SM-11 RefRowEditModal          — simple schema-driven form          → size md
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';

import { PageHead, Section } from '../_components';

const PROTOTYPE_SOURCE =
  'prototypes/design/Monopilot Design System/settings/modals.jsx';

export type ModalGalleryLabels = {
  title: string;
  subtitle: string;
  note: string;
  openTrigger: string;
  cancel: string;
  close: string;
};

/** A single trigger + the modal it opens. Encapsulates open state. */
function GalleryEntry({
  id,
  title,
  sub,
  pattern,
  spec,
  triggerLabel,
  render,
}: {
  id: string;
  title: string;
  sub: string;
  pattern: string;
  spec: string;
  triggerLabel: string;
  render: (open: boolean, onOpenChange: (open: boolean) => void) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Section
      title={title}
      sub={sub}
      action={
        <span className="badge badge-blue mono" style={{ fontSize: 10 }}>
          {id}
        </span>
      }
    >
      <div className="sg-row">
        <div className="sg-label">
          {pattern}
          <div className="sg-hint mono" style={{ marginTop: 2 }}>
            {spec}
          </div>
        </div>
        <div className="sg-field">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            data-testid={`gallery-trigger-${id}`}
            onClick={() => setOpen(true)}
          >
            {triggerLabel}
          </button>
        </div>
      </div>
      {render(open, setOpen)}
    </Section>
  );
}

/** SM-01 — Rule dry-run: preview / compare. */
function RuleDryRunModal({
  open,
  onOpenChange,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: ModalGalleryLabels;
}) {
  const [input, setInput] = React.useState(
    JSON.stringify({ wo_id: 'WO-2026-00412', from: 'PLANNED', to: 'RELEASED' }, null, 2),
  );
  const [result, setResult] = React.useState<null | { trace: string[]; at: string }>(null);
  const valid = (() => {
    try {
      JSON.parse(input);
      return true;
    } catch {
      return false;
    }
  })();

  const run = () => {
    setResult({
      trace: [
        'guard: reservation_green → ✓',
        'guard: crew_assigned → ✓',
        'transition: PLANNED → RELEASED applied',
      ],
      at: new Date().toISOString().slice(0, 16).replace('T', ' '),
    });
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="SM-01">
      <Modal.Header title="Dry-run — wo_state_guard" />
      <Modal.Body>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <label className="block space-y-1 text-sm font-medium">
            <span>Sample input (JSON){valid ? '' : ' — invalid JSON'}</span>
            <textarea
              aria-label="Sample input (JSON)"
              value={input}
              onChange={(event) => setInput(event.currentTarget.value)}
              style={{ minHeight: 200, fontFamily: 'var(--font-mono)', fontSize: 11, width: '100%' }}
            />
          </label>
          <div>
            <div className="text-sm font-medium">Result</div>
            {result ? (
              <div>
                <span className="badge badge-green">PASS</span>
                <span className="muted mono" style={{ marginLeft: 8, fontSize: 11 }}>
                  {result.at}
                </span>
                <pre className="mono" style={{ background: 'var(--gray-100)', padding: 10, borderRadius: 6, fontSize: 11 }}>
                  {result.trace.map((line) => `  ${line}`).join('\n')}
                </pre>
              </div>
            ) : (
              <div className="muted" style={{ padding: 20, textAlign: 'center' }}>
                Run the rule to see the result.
              </div>
            )}
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          {labels.close}
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!valid} onClick={run}>
          Run dry-run
        </button>
      </Modal.Footer>
    </Modal>
  );
}

/** SM-02 — Flag edit: simple form + audit reason. */
function FlagEditModal({
  open,
  onOpenChange,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: ModalGalleryLabels;
}) {
  const [reason, setReason] = React.useState('');
  const reasonValid = reason.trim().length >= 10;
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="SM-02">
      <Modal.Header title="Edit flag — checkout_v2" />
      <Modal.Body>
        <div className="modal-body space-y-3">
          <div className="alert alert-amber" style={{ fontSize: 12 }}>
            <strong>L1-core flag.</strong> Changes route through the promotion workflow.
          </div>
          <label className="block space-y-1 text-sm font-medium">
            <span>Rollout %</span>
            <input type="range" min={0} max={100} defaultValue={25} aria-label="Rollout %" style={{ width: '100%' }} />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            <span>Audit reason (required)</span>
            <textarea
              aria-label="Audit reason"
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
              placeholder="Why is this flag changing? (audit-logged)"
              style={{ minHeight: 70, width: '100%' }}
            />
          </label>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!reasonValid} onClick={() => onOpenChange(false)}>
          Save change
        </button>
      </Modal.Footer>
    </Modal>
  );
}

/** SM-03 — Schema view: read-only summary. */
function SchemaViewModal({
  open,
  onOpenChange,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: ModalGalleryLabels;
}) {
  const rows: Array<[string, string]> = [
    ['Column code', 'allergen_set'],
    ['Label', 'Allergen set'],
    ['Table', 'fa_specs'],
    ['Data type', 'jsonb'],
    ['Tier', 'L1'],
    ['Required', 'Yes'],
    ['Schema version', 'v12'],
  ];
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="SM-03">
      <Modal.Header title="Column — allergen_set" />
      <Modal.Body>
        <div className="modal-body">
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', margin: 0 }}>
            {rows.map(([label, value]) => (
              <React.Fragment key={label}>
                <dt className="muted" style={{ fontSize: 12 }}>
                  {label}
                </dt>
                <dd className="mono" style={{ margin: 0, fontSize: 12 }}>
                  {value}
                </dd>
              </React.Fragment>
            ))}
          </dl>
          <div className="alert alert-blue" style={{ marginTop: 10, fontSize: 11 }}>
            L1 columns are universal. Use the schema promotion wizard to raise a tier-change request.
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          {labels.close}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

/** Shared 3-step stepper used by SM-04 / SM-05. */
function WizardSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex gap-2 text-xs" aria-label="Wizard steps" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {steps.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? 'step' : undefined}
          className={`badge ${index === current ? 'badge-blue' : index < current ? 'badge-green' : ''}`}
        >
          {index + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

/** SM-04 — Email template edit: wizard w/ variable picker. */
function EmailTemplateEditModal({
  open,
  onOpenChange,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: ModalGalleryLabels;
}) {
  const steps = ['Metadata', 'Subject + body', 'Review'];
  const [step, setStep] = React.useState(0);
  const [body, setBody] = React.useState('');
  React.useEffect(() => {
    if (!open) setStep(0);
  }, [open]);
  const variables = ['{{supplier.email}}', '{{wo.code}}', '{{order.total}}'];
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="SM-04">
      <Modal.Header title="Edit template — po_to_supplier" />
      <Modal.Body>
        <div className="modal-body space-y-3">
          <WizardSteps steps={steps} current={step} />
          {step === 0 && (
            <label className="block space-y-1 text-sm font-medium">
              <span>Trigger code</span>
              <input className="mono" defaultValue="po_to_supplier" aria-label="Trigger code" style={{ width: '100%' }} />
            </label>
          )}
          {step === 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 14 }}>
              <label className="block space-y-1 text-sm font-medium">
                <span>Body</span>
                <textarea
                  aria-label="Body"
                  value={body}
                  onChange={(event) => setBody(event.currentTarget.value)}
                  style={{ minHeight: 160, fontFamily: 'var(--font-mono)', fontSize: 12, width: '100%' }}
                />
              </label>
              <div>
                <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
                  Variable picker
                </div>
                {variables.map((variable) => (
                  <button
                    key={variable}
                    type="button"
                    className="btn btn-ghost btn-sm mono"
                    style={{ display: 'block', width: '100%', textAlign: 'left' }}
                    onClick={() => setBody((current) => current + variable)}
                  >
                    {variable}
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="alert alert-blue" style={{ fontSize: 12 }}>
              Body length: {body.length} chars. Review then save.
            </div>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        {step > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep((s) => s - 1)}>
            ← Back
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </button>
        {step < steps.length - 1 ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setStep((s) => s + 1)}>
            Next →
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenChange(false)}>
            Save template
          </button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

/** SM-05 — L1→L2→L3 promotion: wizard w/ diff preview. */
function PromoteToL2Modal({
  open,
  onOpenChange,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: ModalGalleryLabels;
}) {
  const steps = ['Select artefact', 'Preview diff', 'Confirm + reason'];
  const [step, setStep] = React.useState(0);
  const [reason, setReason] = React.useState('');
  React.useEffect(() => {
    if (!open) setStep(0);
  }, [open]);
  const reasonValid = reason.trim().length >= 10;
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="SM-05">
      <Modal.Header title="Start L1→L2→L3 promotion" />
      <Modal.Body>
        <div className="modal-body space-y-3">
          <WizardSteps steps={steps} current={step} />
          {step === 0 && (
            <label className="block space-y-1 text-sm font-medium">
              <span>Artefact to promote</span>
              <input className="mono" defaultValue="rules.cycle_count_variance_v1" aria-label="Artefact to promote" style={{ width: '100%' }} />
            </label>
          )}
          {step === 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <pre className="mono" style={{ background: 'var(--gray-100)', padding: 10, borderRadius: 6, fontSize: 11 }}>
                {'{\n  "tier": "L2-local",\n  "variance_threshold": 0.05\n}'}
              </pre>
              <pre className="mono" style={{ background: '#ecfccb', padding: 10, borderRadius: 6, fontSize: 11 }}>
                {'{\n  "tier": "L1-core",\n  "variance_threshold": 0.10\n}'}
              </pre>
            </div>
          )}
          {step === 2 && (
            <label className="block space-y-1 text-sm font-medium">
              <span>Justification (audit-logged)</span>
              <textarea
                aria-label="Justification"
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
                placeholder="Why should this be promoted now?"
                style={{ minHeight: 70, width: '100%' }}
              />
            </label>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        {step > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep((s) => s - 1)}>
            ← Back
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </button>
        {step < steps.length - 1 ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setStep((s) => s + 1)}>
            Next →
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" disabled={!reasonValid} onClick={() => onOpenChange(false)}>
            Submit promotion
          </button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

/** SM-06 — User invite: simple form. */
function UserInviteModal({
  open,
  onOpenChange,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: ModalGalleryLabels;
}) {
  const [email, setEmail] = React.useState('');
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="SM-06">
      <Modal.Header title="Invite team member" />
      <Modal.Body>
        <div className="modal-body space-y-3">
          <label className="block space-y-1 text-sm font-medium">
            <span>Email address{email && !valid ? ' — invalid email format' : ''}</span>
            <input
              type="email"
              aria-label="Email address"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              autoFocus
              style={{ width: '100%' }}
            />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            <span>Role</span>
            <select aria-label="Role" defaultValue="Operator" style={{ width: '100%' }}>
              <option>Admin</option>
              <option>Manager</option>
              <option>Operator</option>
              <option>Viewer</option>
            </select>
          </label>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!valid} onClick={() => onOpenChange(false)}>
          Send invitation
        </button>
      </Modal.Footer>
    </Modal>
  );
}

/** SM-07 — Role assign: picker-backed form. */
function RoleAssignModal({
  open,
  onOpenChange,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: ModalGalleryLabels;
}) {
  const users = [
    { id: 'u1', name: 'Ada Lovelace', email: 'ada@acme.io', role: 'Operator' },
    { id: 'u2', name: 'Grace Hopper', email: 'grace@acme.io', role: 'Manager' },
  ];
  const [selected, setSelected] = React.useState<string | null>(null);
  const [role, setRole] = React.useState('');
  const valid = Boolean(selected && role);
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="SM-07">
      <Modal.Header title="Assign role" />
      <Modal.Body>
        <div className="modal-body space-y-3">
          <div role="listbox" aria-label="Pick user" style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                role="option"
                aria-selected={selected === user.id}
                onClick={() => setSelected(user.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 12px',
                  background: selected === user.id ? 'var(--blue-050)' : 'transparent',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500 }}>{user.name}</div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {user.email} · current: {user.role}
                </div>
              </button>
            ))}
          </div>
          <label className="block space-y-1 text-sm font-medium">
            <span>New role</span>
            <select aria-label="New role" value={role} onChange={(event) => setRole(event.currentTarget.value)} style={{ width: '100%' }}>
              <option value="">— pick role —</option>
              <option>Admin</option>
              <option>Manager</option>
              <option>Operator</option>
              <option>Viewer</option>
            </select>
          </label>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!valid} onClick={() => onOpenChange(false)}>
          Assign role
        </button>
      </Modal.Footer>
    </Modal>
  );
}

/** SM-08 — D365 test connection: confirm + async result. */
function D365TestConnectionModal({
  open,
  onOpenChange,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: ModalGalleryLabels;
}) {
  const [phase, setPhase] = React.useState<'idle' | 'ok'>('idle');
  React.useEffect(() => {
    if (!open) setPhase('idle');
  }, [open]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" modalId="SM-08">
      <Modal.Header title="Test D365 connection" />
      <Modal.Body>
        <div className="modal-body" style={{ textAlign: 'center', padding: 20 }}>
          {phase === 'idle' ? (
            <div className="text-sm">Run a connection test against the configured D365 environment.</div>
          ) : (
            <div>
              <div style={{ fontSize: 28, color: 'var(--green-700)' }}>✓</div>
              <div className="text-sm font-medium">Connection successful</div>
              <div className="muted mono" style={{ fontSize: 11 }}>
                Latency 238ms · Production
              </div>
            </div>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          {labels.close}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setPhase('ok')}>
          Run test
        </button>
      </Modal.Footer>
    </Modal>
  );
}

/** SM-09 — Password reset: destructive confirm (non-dismissible). */
function PasswordResetModal({
  open,
  onOpenChange,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: ModalGalleryLabels;
}) {
  const [ack, setAck] = React.useState(false);
  React.useEffect(() => {
    if (!open) setAck(false);
  }, [open]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" modalId="SM-09" dismissible={false}>
      <Modal.Header title="Reset password?" />
      <Modal.Body>
        <div className="modal-body space-y-3">
          <div className="alert alert-red" style={{ fontSize: 12 }}>
            This will invalidate the user&apos;s password and revoke active sessions.
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={ack} onChange={(event) => setAck(event.currentTarget.checked)} />
            I understand this will revoke active sessions.
          </label>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </button>
        <button type="button" className="btn btn-danger btn-sm" disabled={!ack} onClick={() => onOpenChange(false)}>
          Send reset link
        </button>
      </Modal.Footer>
    </Modal>
  );
}

/** SM-10 — Delete reference data: destructive type-to-confirm. */
function DeleteReferenceDataModal({
  open,
  onOpenChange,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: ModalGalleryLabels;
}) {
  const [typed, setTyped] = React.useState('');
  React.useEffect(() => {
    if (!open) setTyped('');
  }, [open]);
  const ok = typed === 'DELETE';
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" modalId="SM-10" dismissible={false}>
      <Modal.Header title="Delete A99?" />
      <Modal.Body>
        <div className="modal-body space-y-3">
          <div className="alert alert-red" style={{ fontSize: 12 }}>
            This action cannot be undone. <strong>A99</strong> will be permanently removed from{' '}
            <span className="mono">allergens_reference</span>.
          </div>
          <label className="block space-y-1 text-sm font-medium">
            <span>Type DELETE to confirm</span>
            <input
              aria-label="Type DELETE to confirm"
              value={typed}
              onChange={(event) => setTyped(event.currentTarget.value)}
              placeholder="DELETE"
              autoFocus
              style={{ width: '100%' }}
            />
          </label>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </button>
        <button type="button" className="btn btn-danger btn-sm" disabled={!ok} onClick={() => onOpenChange(false)}>
          Delete permanently
        </button>
      </Modal.Footer>
    </Modal>
  );
}

/** SM-11 — Reference row edit: simple schema-driven form. */
function RefRowEditModal({
  open,
  onOpenChange,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: ModalGalleryLabels;
}) {
  const [name, setName] = React.useState('Example');
  const valid = name.trim().length >= 2;
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="SM-11">
      <Modal.Header title="Edit row — A99" />
      <Modal.Body>
        <div className="modal-body space-y-3">
          <label className="block space-y-1 text-sm font-medium">
            <span>Row key</span>
            <input className="mono" defaultValue="A99" readOnly aria-label="Row key" style={{ width: '100%', background: 'var(--gray-100)' }} />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            <span>Name (EN)</span>
            <input
              aria-label="Name (EN)"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              style={{ width: '100%' }}
            />
          </label>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!valid} onClick={() => onOpenChange(false)}>
          Save
        </button>
      </Modal.Footer>
    </Modal>
  );
}

type Variant = {
  id: string;
  title: string;
  sub: string;
  pattern: string;
  spec: string;
  Component: React.ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    labels: ModalGalleryLabels;
  }>;
};

const VARIANTS: Variant[] = [
  { id: 'SM-01', title: 'Rule dry-run', sub: 'Preview the rule evaluation against sample input.', pattern: 'Preview / compare', spec: '§ SET-051', Component: RuleDryRunModal },
  { id: 'SM-02', title: 'Flag edit', sub: 'Simple form with an audit reason.', pattern: 'Simple form + audit reason', spec: '§ SET-060', Component: FlagEditModal },
  { id: 'SM-03', title: 'Schema view', sub: 'Read-only column definition summary.', pattern: 'Simple view', spec: '§ SET-070', Component: SchemaViewModal },
  { id: 'SM-04', title: 'Email template edit', sub: 'Wizard with a variable picker.', pattern: 'Wizard w/ variable picker', spec: '§ SET-090', Component: EmailTemplateEditModal },
  { id: 'SM-05', title: 'L1→L2→L3 promotion', sub: 'Wizard with a diff preview.', pattern: 'Wizard w/ diff preview', spec: '§ SET-100', Component: PromoteToL2Modal },
  { id: 'SM-06', title: 'User invite', sub: 'Simple invitation form.', pattern: 'Simple form', spec: '§ MODAL-INVITE-USER', Component: UserInviteModal },
  { id: 'SM-07', title: 'Role assign', sub: 'Picker-backed assignment form.', pattern: 'Picker-backed form', spec: '§ MODAL-ROLE-ASSIGNMENT', Component: RoleAssignModal },
  { id: 'SM-08', title: 'D365 test connection', sub: 'Confirm action then show async result.', pattern: 'Confirm + async result', spec: '§ MODAL-D365-CONNECTION-TEST', Component: D365TestConnectionModal },
  { id: 'SM-09', title: 'Password reset', sub: 'Destructive confirm (non-dismissible).', pattern: 'Destructive confirm', spec: '§ SET-031-pass', Component: PasswordResetModal },
  { id: 'SM-10', title: 'Delete reference data', sub: 'Destructive type-to-confirm.', pattern: 'Destructive + type-to-confirm', spec: '§ MODAL-CONFIRM-DELETE', Component: DeleteReferenceDataModal },
  { id: 'SM-11', title: 'Reference row edit', sub: 'Simple schema-driven form.', pattern: 'Simple form (schema-driven)', spec: '§ MODAL-REF-ROW-EDIT', Component: RefRowEditModal },
];

export default function ModalGalleryClient({ labels }: { labels: ModalGalleryLabels }) {
  return (
    <main
      className="space-y-4 p-6"
      data-testid="settings-modal-gallery"
      data-prototype-source={PROTOTYPE_SOURCE}
    >
      <PageHead title={labels.title} sub={labels.subtitle} />

      <div role="note" className="alert alert-blue" style={{ fontSize: 12 }}>
        {labels.note}
      </div>

      {VARIANTS.map(({ id, title, sub, pattern, spec, Component }) => (
        <GalleryEntry
          key={id}
          id={id}
          title={`${id} · ${title}`}
          sub={sub}
          pattern={pattern}
          spec={spec}
          triggerLabel={labels.openTrigger}
          render={(open, onOpenChange) => (
            <Component open={open} onOpenChange={onOpenChange} labels={labels} />
          )}
        />
      ))}
    </main>
  );
}
