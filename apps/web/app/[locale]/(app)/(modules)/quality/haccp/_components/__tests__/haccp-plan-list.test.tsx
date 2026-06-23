/**
 * Wave E3 — HACCP plan list client islands: RTL parity + state + i18n + RBAC.
 *
 * Prototype: prototypes/design/Monopilot Design System/quality/
 *   haccp-screens.jsx:3-106 (QaHaccpPlans) — "＋ New HACCP Plan", plan rows with
 *   code/version/status, draft → e-sign "Approve Plan", active → "New version".
 *
 * The page is an async RSC that reads Supabase via listHaccpPlans (and renders
 * the denied / error / loading panels there); these tests exercise the
 * presentational client islands directly. The Server Actions (upsertHaccpPlan /
 * activateHaccpPlan / newPlanVersion) are injected as vi.fn() props so we assert
 * the EXACT payloads wired against the reviewed signatures.
 *
 * Covers: parity (name/scope/version/status badge/#CCP — never a UUID), empty
 * state + CTA, new-plan modal exposes ALL fields + submits the exact payload,
 * e-sign activate modal exposes the PIN field + signs with { password }, the
 * new-version action call, validation, action-error verbatim, RBAC (disabled +
 * tooltip without plan_edit), and i18n (en + pl resolve every label, no leaked
 * dotted key).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../../../../../../i18n/en.json';
import pl from '../../../../../../../../i18n/pl.json';

import { PlanListClient } from '../plan-list.client';
import {
  buildPlanActivateLabels,
  buildPlanCreateLabels,
  buildPlanListLabels,
  type Translator,
} from '../labels';
import type { HaccpPlanHeader, PlanListRow } from '../haccp-contracts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

/** A live-catalog-backed translator scoped to quality.haccp. */
function makeT(locale: 'en' | 'pl'): Translator {
  const ns = (locale === 'pl' ? pl : en).quality.haccp as Record<string, unknown>;
  return (key: string, values?: Record<string, string | number>) => {
    let cur: unknown = ns;
    for (const part of key.split('.')) {
      cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[part] : undefined;
    }
    let raw = typeof cur === 'string' ? cur : key;
    if (values) raw = raw.replace(/\{(\w+)\}/g, (_m, k: string) => (values[k] !== undefined ? String(values[k]) : `{${k}}`));
    return raw;
  };
}

const tEn = makeT('en');
const tPl = makeT('pl');
const LIST_LABELS = buildPlanListLabels(tEn);
const CREATE_LABELS = buildPlanCreateLabels(tEn);
const ACTIVATE_LABELS = buildPlanActivateLabels(tEn);

function makeRow(over: Partial<PlanListRow> = {}): PlanListRow {
  return {
    id: over.id ?? 'plan-1',
    name: over.name ?? 'Cooked meats line A',
    scopeType: over.scopeType ?? 'product',
    scopeRef: 'scopeRef' in over ? (over.scopeRef ?? null) : 'FG-001',
    version: over.version ?? 1,
    status: over.status ?? 'draft',
    ccpCount: over.ccpCount ?? 3,
  };
}

function makeHeader(over: Partial<HaccpPlanHeader> = {}): HaccpPlanHeader {
  return {
    id: over.id ?? 'plan-1',
    name: over.name ?? 'Cooked meats line A',
    scopeType: over.scopeType ?? 'product',
    scopeRef: over.scopeRef ?? 'FG-001',
    siteId: over.siteId ?? null,
    version: over.version ?? 1,
    status: over.status ?? 'draft',
    approvedBy: over.approvedBy ?? null,
    approvedAt: over.approvedAt ?? null,
    createdBy: over.createdBy ?? null,
    createdAt: over.createdAt ?? '2026-06-18T10:00:00.000Z',
    updatedAt: over.updatedAt ?? '2026-06-18T10:00:00.000Z',
  };
}

function renderList(
  rows: PlanListRow[],
  opts: {
    canEdit?: boolean;
    upsertAction?: ReturnType<typeof vi.fn>;
    activateAction?: ReturnType<typeof vi.fn>;
    newVersionAction?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const canEdit = opts.canEdit ?? true;
  const upsertAction = opts.upsertAction ?? vi.fn(async () => ({ ok: true as const, data: makeHeader() }));
  const activateAction =
    opts.activateAction ?? vi.fn(async () => ({ ok: true as const, data: makeHeader({ status: 'active' }) }));
  const newVersionAction =
    opts.newVersionAction ?? vi.fn(async () => ({ ok: true as const, data: { ...makeHeader({ version: 2 }), ccps: [] } }));
  render(
    <PlanListClient
      rows={rows}
      labels={LIST_LABELS}
      createLabels={CREATE_LABELS}
      activateLabels={ACTIVATE_LABELS}
      locale="en"
      canEdit={canEdit}
      upsertPlanAction={upsertAction as never}
      activatePlanAction={activateAction as never}
      newPlanVersionAction={newVersionAction as never}
    />,
  );
  return { upsertAction, activateAction, newVersionAction };
}

describe('PlanListClient (E3 parity)', () => {
  it('renders one row per plan with name, scope, version, status badge and #CCP', () => {
    renderList([makeRow({ id: 'a', name: 'Cooked meats', scopeType: 'product', scopeRef: 'FG-001', version: 2, status: 'active', ccpCount: 4 })]);
    expect(screen.getByTestId('haccp-plan-name-a')).toHaveTextContent('Cooked meats');
    expect(screen.getByTestId('haccp-plan-version-a')).toHaveTextContent('v2');
    expect(screen.getByTestId('haccp-plan-status-a')).toHaveTextContent(LIST_LABELS.status.active);
    expect(screen.getByTestId('haccp-plan-ccps-a')).toHaveTextContent('4');
    // scope label uses the scopeType label + ref (no raw enum / no UUID).
    const row = screen.getByTestId('haccp-plan-row-a');
    expect(row).toHaveTextContent(LIST_LABELS.scopeType.product);
    expect(row).toHaveTextContent('FG-001');
  });

  it('row name + view links to the dedicated detail route', () => {
    renderList([makeRow({ id: 'a' })]);
    expect(screen.getByTestId('haccp-plan-name-a')).toHaveAttribute('href', '/en/quality/haccp/a');
    expect(screen.getByTestId('haccp-plan-view-a')).toHaveAttribute('href', '/en/quality/haccp/a');
  });

  it('never renders a raw UUID in the table (rule 0.11)', () => {
    const { container } = render(
      <PlanListClient
        rows={[makeRow({ id: '11111111-2222-4333-8444-555555555555' })]}
        labels={LIST_LABELS}
        createLabels={CREATE_LABELS}
        activateLabels={ACTIVATE_LABELS}
        locale="en"
        canEdit
        upsertPlanAction={vi.fn() as never}
        activatePlanAction={vi.fn() as never}
        newPlanVersionAction={vi.fn() as never}
      />,
    );
    // The id appears only in href attributes (routing), never as visible text.
    expect(container.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('EMPTY state: no plans renders the create CTA (opens the new-plan modal) with plan_edit', () => {
    renderList([]);
    const empty = screen.getByTestId('haccp-plan-empty');
    expect(empty).toHaveAttribute('data-state', 'empty');
    expect(empty).toHaveTextContent(LIST_LABELS.empty.title);
    const cta = screen.getByTestId('haccp-plan-empty-cta');
    expect(cta).not.toBeDisabled();
    fireEvent.click(cta);
    expect(screen.getByTestId('haccp-plan-create-form')).toBeInTheDocument();
  });

  it('EMPTY state without plan_edit: CTA disabled + permission tooltip (rule 0.13c)', () => {
    renderList([], { canEdit: false });
    const cta = screen.getByTestId('haccp-plan-empty-cta');
    expect(cta).toBeDisabled();
    expect(cta).toHaveAttribute('title', LIST_LABELS.empty.ctaDisabled);
    fireEvent.click(cta);
    expect(screen.queryByTestId('haccp-plan-create-form')).not.toBeInTheDocument();
  });

  it('NEW PLAN button gated (rule 0.13c): disabled + tooltip without plan_edit', () => {
    renderList([makeRow({ id: 'a' })], { canEdit: false });
    const btn = screen.getByTestId('haccp-plan-new');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', LIST_LABELS.newPlanDisabled);
  });

  it('NEW PLAN modal exposes ALL fields (name, scope type select, scope ref) and submits the exact upsertHaccpPlan payload', async () => {
    const upsertAction = vi.fn(async () => ({ ok: true as const, data: makeHeader() }));
    renderList([makeRow({ id: 'a' })], { upsertAction });
    fireEvent.click(screen.getByTestId('haccp-plan-new'));

    // every field is present.
    expect(screen.getByTestId('haccp-plan-create-name')).toBeInTheDocument();
    expect(screen.getByTestId('haccp-plan-create-scope-type')).toBeInTheDocument();
    expect(screen.getByTestId('haccp-plan-create-scope-ref')).toBeInTheDocument();
    // submit disabled until required fields present.
    expect(screen.getByTestId('haccp-plan-create-submit')).toBeDisabled();

    fireEvent.change(screen.getByTestId('haccp-plan-create-name'), { target: { value: 'Cooked meats line A' } });
    // scope type via the shadcn Select (no raw <select>).
    fireEvent.click(within(screen.getByTestId('haccp-plan-create-scope-type')).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: CREATE_LABELS.scopeTypeOptions.product }));
    fireEvent.change(screen.getByTestId('haccp-plan-create-scope-ref'), { target: { value: 'FG-001' } });

    expect(screen.getByTestId('haccp-plan-create-submit')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('haccp-plan-create-submit'));

    await waitFor(() => expect(upsertAction).toHaveBeenCalledTimes(1));
    expect(upsertAction).toHaveBeenCalledWith({
      name: 'Cooked meats line A',
      scopeType: 'product',
      scopeRef: 'FG-001',
    });
    await waitFor(() => expect(screen.queryByTestId('haccp-plan-create-form')).not.toBeInTheDocument());
  });

  it('NEW PLAN error: a forbidden/error upsert result surfaces the action message verbatim', async () => {
    const upsertAction = vi.fn(async () => ({ ok: false as const, reason: 'forbidden' as const, message: 'forbidden' }));
    renderList([makeRow({ id: 'a' })], { upsertAction });
    fireEvent.click(screen.getByTestId('haccp-plan-new'));
    fireEvent.change(screen.getByTestId('haccp-plan-create-name'), { target: { value: 'Plan X' } });
    fireEvent.click(within(screen.getByTestId('haccp-plan-create-scope-type')).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: CREATE_LABELS.scopeTypeOptions.line }));
    fireEvent.click(screen.getByTestId('haccp-plan-create-submit'));
    await waitFor(() => expect(upsertAction).toHaveBeenCalled());
    expect(await screen.findByTestId('haccp-plan-create-error')).toHaveTextContent('forbidden');
    expect(screen.getByTestId('haccp-plan-create-form')).toBeInTheDocument();
  });

  it('DRAFT row: [Activate] opens the e-sign modal which EXPOSES the PIN field and signs with { password }', async () => {
    const activateAction = vi.fn(async () => ({ ok: true as const, data: makeHeader({ status: 'active' }) }));
    renderList([makeRow({ id: 'a', status: 'draft', name: 'Cooked meats line A', version: 1 })], { activateAction });

    fireEvent.click(screen.getByTestId('haccp-plan-activate-a'));
    expect(screen.getByTestId('haccp-plan-activate-form')).toBeInTheDocument();
    // the required PIN/credential field is exposed.
    const pin = screen.getByTestId('haccp-plan-activate-password');
    expect(pin).toBeInTheDocument();
    expect(pin).toHaveAttribute('type', 'password');
    // submit disabled until the PIN is filled.
    expect(screen.getByTestId('haccp-plan-activate-submit')).toBeDisabled();

    fireEvent.change(pin, { target: { value: 'Secret-123' } });
    expect(screen.getByTestId('haccp-plan-activate-submit')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('haccp-plan-activate-submit'));

    await waitFor(() => expect(activateAction).toHaveBeenCalledTimes(1));
    expect(activateAction).toHaveBeenCalledWith('a', { password: 'Secret-123' });
    await waitFor(() => expect(screen.queryByTestId('haccp-plan-activate-form')).not.toBeInTheDocument());
  });

  it('ACTIVATE button gated (rule 0.13c): disabled + tooltip without plan_edit', () => {
    renderList([makeRow({ id: 'a', status: 'draft' })], { canEdit: false });
    const btn = screen.getByTestId('haccp-plan-activate-a');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', LIST_LABELS.activateDisabled);
  });

  it('ACTIVATE error: a bad-PIN/forbidden result surfaces the action message verbatim and keeps the modal open', async () => {
    const activateAction = vi.fn(async () => ({ ok: false as const, reason: 'error' as const, message: 'invalid signature' }));
    renderList([makeRow({ id: 'a', status: 'draft' })], { activateAction });
    fireEvent.click(screen.getByTestId('haccp-plan-activate-a'));
    fireEvent.change(screen.getByTestId('haccp-plan-activate-password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByTestId('haccp-plan-activate-submit'));
    await waitFor(() => expect(activateAction).toHaveBeenCalled());
    expect(await screen.findByTestId('haccp-plan-activate-error')).toHaveTextContent('invalid signature');
    expect(screen.getByTestId('haccp-plan-activate-form')).toBeInTheDocument();
  });

  it('ACTIVE row: [New version] calls newPlanVersion with the plan id', async () => {
    const newVersionAction = vi.fn(async () => ({ ok: true as const, data: { ...makeHeader({ version: 2 }), ccps: [] } }));
    renderList([makeRow({ id: 'a', status: 'active', version: 1 })], { newVersionAction });
    // active row has no activate button.
    expect(screen.queryByTestId('haccp-plan-activate-a')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('haccp-plan-newversion-a'));
    await waitFor(() => expect(newVersionAction).toHaveBeenCalledTimes(1));
    expect(newVersionAction).toHaveBeenCalledWith('a');
  });

  it('NEW VERSION gated (rule 0.13c): disabled + tooltip without plan_edit', () => {
    renderList([makeRow({ id: 'a', status: 'active' })], { canEdit: false });
    const btn = screen.getByTestId('haccp-plan-newversion-a');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', LIST_LABELS.newVersionDisabled);
  });

  it('NEW VERSION error surfaces the action message verbatim', async () => {
    const newVersionAction = vi.fn(async () => ({ ok: false as const, reason: 'error' as const, message: 'active plan not found' }));
    renderList([makeRow({ id: 'a', status: 'active' })], { newVersionAction });
    fireEvent.click(screen.getByTestId('haccp-plan-newversion-a'));
    await waitFor(() => expect(newVersionAction).toHaveBeenCalled());
    expect(await screen.findByTestId('haccp-plan-version-error')).toHaveTextContent('active plan not found');
  });

  it('superseded row exposes neither activate nor new-version (terminal state)', () => {
    renderList([makeRow({ id: 'a', status: 'superseded' })]);
    expect(screen.queryByTestId('haccp-plan-activate-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('haccp-plan-newversion-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('haccp-plan-status-a')).toHaveTextContent(LIST_LABELS.status.superseded);
  });
});

describe('HACCP plan list i18n (no leaked dotted keys)', () => {
  it('resolves every list + create + activate label in en and pl', () => {
    for (const t of [tEn, tPl]) {
      const flat = JSON.stringify([buildPlanListLabels(t), buildPlanCreateLabels(t), buildPlanActivateLabels(t)]);
      expect(flat).not.toMatch(/[a-z]+\.[a-z]+\.[a-zA-Z]/);
    }
  });

  it('en + pl differ (real translations, not an en clone)', () => {
    expect(tPl('title')).not.toBe(tEn('title'));
    expect(tPl('list.newPlan')).not.toBe(tEn('list.newPlan'));
    expect(tPl('status.draft')).not.toBe(tEn('status.draft'));
    expect(tPl('activate.esign.password')).not.toBe(tEn('activate.esign.password'));
  });
});
