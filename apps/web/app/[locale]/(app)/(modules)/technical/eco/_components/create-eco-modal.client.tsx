'use client';

/**
 * N1-A — "Open ECO" create modal.
 *
 * Prototype parity:
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:352-414
 *   (`EcoChangeRequestModal`, MODAL-06) — "Open ECO · Engineering Change Order":
 *   Title (required, min length) / Impact scope (select → canonical changeType)
 *   / Priority (select) / Description (required). The prototype's free-text
 *   "approvers" step is red-lined out (approvals are server-side state-machine
 *   transitions gated on `technical.eco.approve`, not a client list — see
 *   translation-notes), and replaced with the schema-required ECO line: a real
 *   item-master target (never free text) + change description. Maps 1:1 to
 *   createChangeOrder's zod (`code`, `title`, `changeType`, `priority`,
 *   `targetItemId`, `lines:[≥1]`).
 *
 * shadcn/design-system modal shell (`.modal-overlay` + `.modal-box` +
 * `.modal-head/body/foot`); no raw <select> beyond the design-system styled
 * control family. RBAC is server-resolved upstream — this component only renders
 * when the caller holds `technical.eco.write`.
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

import { createChangeOrder } from '../_actions/create-change-order';
import type { EcoItemOption } from '../_actions/page-data';
import { makeFallback } from './eco-ui';

type CreateState = 'idle' | 'submitting' | 'error';

const CHANGE_TYPES = ['engineering', 'bom', 'spec', 'item', 'process', 'packaging', 'regulatory'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
const LINE_ACTIONS = ['add', 'change', 'remove', 'replace', 'deprecate'] as const;

export function CreateEcoButton({ items, label }: { items: EcoItemOption[]; label: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        {label}
      </button>
      <CreateEcoModal open={open} items={items} onClose={() => setOpen(false)} />
    </>
  );
}

export function CreateEcoModal({
  open,
  items,
  onClose,
}: {
  open: boolean;
  items: EcoItemOption[];
  onClose: () => void;
}) {
  const t = useTranslations('Technical.eco');
  const tt = React.useMemo(() => makeFallback(t), [t]);
  const router = useRouter();
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  const [code, setCode] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [changeType, setChangeType] = React.useState<(typeof CHANGE_TYPES)[number]>('engineering');
  const [priority, setPriority] = React.useState<(typeof PRIORITIES)[number]>('normal');
  const [description, setDescription] = React.useState('');
  const [lineAction, setLineAction] = React.useState<(typeof LINE_ACTIONS)[number]>('change');
  const [targetItemId, setTargetItemId] = React.useState('');
  const [itemSearch, setItemSearch] = React.useState('');
  const [rationale, setRationale] = React.useState('');
  const [state, setState] = React.useState<CreateState>('idle');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setCode('');
      setTitle('');
      setChangeType('engineering');
      setPriority('normal');
      setDescription('');
      setLineAction('change');
      setTargetItemId('');
      setItemSearch('');
      setRationale('');
      setState('idle');
      setError(null);
      return;
    }
    contentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && state !== 'submitting') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, state]);

  const filteredItems = React.useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items.slice(0, 50);
    return items
      .filter((it) => it.itemCode.toLowerCase().includes(q) || it.name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [items, itemSearch]);

  if (!open) return null;

  const errorLabels: Record<string, string> = {
    invalid_input: tt('errors.invalid_input', 'Check the change order fields and try again.'),
    forbidden: tt('errors.forbidden', 'You do not have permission to open change orders.'),
    not_found: tt('errors.not_found', 'The target item was not found.'),
    already_exists: tt('errors.already_exists', 'A change order with this code already exists.'),
    invalid_state: tt('errors.invalid_state', 'The change order is no longer in a draft state.'),
    persistence_failed: tt('errors.persistence_failed', 'The change order could not be saved.'),
  };

  const canSubmit =
    state !== 'submitting' &&
    code.trim().length > 0 &&
    title.trim().length >= 5 &&
    description.trim().length >= 10 &&
    targetItemId.trim().length > 0;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('submitting');
    setError(null);

    const result = await createChangeOrder({
      code: code.trim(),
      title: title.trim(),
      description: description.trim(),
      priority,
      changeType,
      targetItemId: targetItemId.trim(),
      lines: [
        {
          lineNo: 1,
          action: lineAction,
          targetType: 'item',
          targetId: targetItemId.trim(),
          rationale: rationale.trim().length > 0 ? rationale.trim() : null,
        },
      ],
    });

    if (!result.ok) {
      setState('error');
      setError(errorLabels[result.error] ?? errorLabels.persistence_failed);
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && state !== 'submitting') onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="modal-box wide outline-none"
      >
        <form onSubmit={onSubmit}>
          <div className="modal-head">
            <div>
              <h2 id={titleId} className="modal-title">
                {tt('create.title', 'Open ECO · Engineering Change Order')}
              </h2>
              <p className="helper mt-0.5">
                {tt('create.subtitle', 'Goes to reviewers after submission. Changes flow through the approval state machine.')}
              </p>
            </div>
            <button
              type="button"
              aria-label={tt('create.close', 'Close')}
              className="modal-close"
              onClick={onClose}
              disabled={state === 'submitting'}
            >
              x
            </button>
          </div>

          <div className="modal-body">
            {error ? (
              <div role="alert" className="alert alert-red mb-3">
                <div className="alert-title">{error}</div>
              </div>
            ) : null}

            <div className="ff">
              <label htmlFor="eco-code">{tt('create.fields.code', 'ECO code')}</label>
              <input
                id="eco-code"
                className="form-input mono"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                maxLength={64}
                disabled={state === 'submitting'}
              />
            </div>

            <div className="ff mt-3">
              <label htmlFor="eco-title">{tt('create.fields.title', 'Title')}</label>
              <input
                id="eco-title"
                className="form-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                minLength={5}
                maxLength={240}
                disabled={state === 'submitting'}
              />
              <span className="ff-help">{tt('create.hints.title', 'Min 5 characters.')}</span>
            </div>

            <div className="ff-inline mt-3" style={{ display: 'flex', gap: 12 }}>
              <div className="ff" style={{ flex: 1 }}>
                <label htmlFor="eco-change-type">{tt('create.fields.changeType', 'Impact scope')}</label>
                <Select
                  value={changeType}
                  onValueChange={(value) => setChangeType(value as (typeof CHANGE_TYPES)[number])}
                  disabled={state === 'submitting'}
                >
                  <SelectTrigger id="eco-change-type" aria-label={tt('create.fields.changeType', 'Impact scope')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANGE_TYPES.map((ct) => (
                      <SelectItem key={ct} value={ct}>
                        {tt(`changeType.${ct}`, ct)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="ff" style={{ flex: 1 }}>
                <label htmlFor="eco-priority">{tt('create.fields.priority', 'Priority')}</label>
                <Select
                  value={priority}
                  onValueChange={(value) => setPriority(value as (typeof PRIORITIES)[number])}
                  disabled={state === 'submitting'}
                >
                  <SelectTrigger id="eco-priority" aria-label={tt('create.fields.priority', 'Priority')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {tt(`priority.${p}`, p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="ff mt-3">
              <label htmlFor="eco-description">{tt('create.fields.description', 'Description')}</label>
              <textarea
                id="eco-description"
                className="form-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                minLength={10}
                maxLength={4000}
                rows={3}
                disabled={state === 'submitting'}
              />
              <span className="ff-help">{tt('create.hints.description', 'What is changing and why — min 10 characters.')}</span>
            </div>

            <fieldset className="mt-4" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
              <legend className="helper" style={{ padding: '0 6px' }}>
                {tt('create.line.legend', 'Change line · target item + change')}
              </legend>

              <div className="ff">
                <label htmlFor="eco-line-action">{tt('create.line.action', 'Change action')}</label>
                <Select
                  value={lineAction}
                  onValueChange={(value) => setLineAction(value as (typeof LINE_ACTIONS)[number])}
                  disabled={state === 'submitting'}
                >
                  <SelectTrigger id="eco-line-action" aria-label={tt('create.line.action', 'Change action')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LINE_ACTIONS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {tt(`lineAction.${a}`, a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="ff mt-3">
                <label htmlFor="eco-item-search">{tt('create.line.searchLabel', 'Find item')}</label>
                <input
                  id="eco-item-search"
                  className="form-input"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder={tt('create.line.searchPlaceholder', 'Search item code or name')}
                  aria-label={tt('create.line.searchPlaceholder', 'Search item code or name')}
                  disabled={state === 'submitting'}
                />
                <Select
                  value={targetItemId}
                  onValueChange={setTargetItemId}
                  disabled={state === 'submitting'}
                  options={filteredItems.map((it) => ({ value: it.id, label: `${it.itemCode} — ${it.name}` }))}
                >
                  <SelectTrigger className="mt-2" aria-label={tt('create.line.targetItem', 'Target item')}>
                    <SelectValue placeholder={tt('create.line.targetItem', 'Target item')} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredItems.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        {tt('create.line.noItems', 'No matching items')}
                      </SelectItem>
                    ) : (
                      filteredItems.map((it) => (
                        <SelectItem key={it.id} value={it.id}>
                          {it.itemCode} — {it.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="ff mt-3">
                <label htmlFor="eco-line-rationale">{tt('create.line.rationale', 'Change description')}</label>
                <textarea
                  id="eco-line-rationale"
                  className="form-input"
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  maxLength={2000}
                  rows={2}
                  disabled={state === 'submitting'}
                />
              </div>
            </fieldset>
          </div>

          <div className="modal-foot">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={state === 'submitting'}>
              {tt('create.cancel', 'Cancel')}
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={!canSubmit}>
              {state === 'submitting' ? tt('create.saving', 'Submitting…') : tt('create.submit', 'Submit ECO')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
