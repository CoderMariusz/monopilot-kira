/**
 * Wave (CCP-EDIT) — per-row Edit/Deactivate actions for a HACCP plan's CCPs.
 *
 * Parity model: technical/items/[item_code]/_components/
 *   supplier-spec-row-actions.client.tsx — an Edit button that opens a modal
 *   PRE-POPULATED from the row + a Deactivate confirm, both surfacing the action
 *   error inline via role="alert" and NEVER throwing.
 *
 * This island closes the HACCP CCP table dead-end (was add-only). The reviewed
 * `upsertCcp` (EDIT path via the optional `id`) and the new `deactivateCcp`
 * Server Actions (haccp-actions.ts) are injected as vi.fn() props so we assert
 * the EXACT payloads wired against the reviewed signatures.
 *
 * Covers: the Edit modal exposes ALL ccp-add fields PRE-POPULATED from the row,
 * submits `{ id, ccp_code, ... }` to upsertCcp; the Deactivate confirm calls
 * deactivateCcp(ccp.id); action errors surface inline (role="alert"); the
 * actions-column gate `canEdit && isDraft` on the table; and i18n (en + pl).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../../../../../../../i18n/en.json';
import pl from '../../../../../../../../../i18n/pl.json';

import { CcpRowActions } from '../ccp-row-actions.client';
import { PlanDetailClient } from '../plan-detail.client';
import {
  buildCcpAddLabels,
  buildCcpRowActionsLabels,
  buildPlanActivateLabels,
  buildPlanDetailLabels,
  type Translator,
} from '../../../_components/labels';
import type { HaccpCcpRow, HaccpPlan, HaccpPlanCcp } from '../../../_components/haccp-contracts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

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
const ROW_LABELS = buildCcpRowActionsLabels(tEn);
const CCP_ADD_LABELS = buildCcpAddLabels(tEn);

function makeCcp(over: Partial<HaccpPlanCcp> = {}): HaccpPlanCcp {
  return {
    id: over.id ?? 'ccp-1',
    ccpCode: over.ccpCode ?? 'CCP-01',
    name: over.name ?? 'Cooking temperature',
    processStep: over.processStep ?? 'Cooking',
    hazardType: over.hazardType ?? 'biological',
    criticalLimitMin: 'criticalLimitMin' in over ? (over.criticalLimitMin ?? null) : '72',
    criticalLimitMax: 'criticalLimitMax' in over ? (over.criticalLimitMax ?? null) : null,
    unit: over.unit ?? '°C',
    monitoringFrequency: over.monitoringFrequency ?? 'Each batch',
    correctiveAction: over.correctiveAction ?? 'Reprocess batch',
    lineId: over.lineId ?? null,
    isActive: over.isActive ?? true,
    createdAt: over.createdAt ?? '2026-06-18T10:00:00.000Z',
    updatedAt: over.updatedAt ?? '2026-06-18T10:00:00.000Z',
  };
}

function makeCcpRow(): HaccpCcpRow {
  return { ...makeCcp({ id: 'ccp-1' }) };
}

function makePlan(over: Partial<HaccpPlan> = {}): HaccpPlan {
  return {
    id: over.id ?? 'plan-1',
    name: over.name ?? 'Cooked meats line A',
    scopeType: over.scopeType ?? 'product',
    scopeRef: 'scopeRef' in over ? (over.scopeRef ?? null) : 'FG-001',
    siteId: over.siteId ?? null,
    version: over.version ?? 1,
    status: over.status ?? 'draft',
    approvedBy: over.approvedBy ?? null,
    approvedAt: 'approvedAt' in over ? (over.approvedAt ?? null) : null,
    createdBy: over.createdBy ?? null,
    createdAt: over.createdAt ?? '2026-06-18T10:00:00.000Z',
    updatedAt: over.updatedAt ?? '2026-06-18T10:00:00.000Z',
    ccps: over.ccps ?? [makeCcp()],
  };
}

function renderRow(
  over: Partial<HaccpPlanCcp> = {},
  opts: { upsert?: ReturnType<typeof vi.fn>; deactivate?: ReturnType<typeof vi.fn> } = {},
) {
  const ccp = makeCcp(over);
  const upsert = opts.upsert ?? vi.fn(async () => ({ ok: true as const, data: makeCcpRow() }));
  const deactivate = opts.deactivate ?? vi.fn(async () => ({ ok: true as const, data: { id: ccp.id, isActive: false as const } }));
  render(
    <CcpRowActions
      ccp={ccp}
      labels={ROW_LABELS}
      ccpAddLabels={CCP_ADD_LABELS}
      upsertCcpAction={upsert as never}
      deactivateCcpAction={deactivate as never}
    />,
  );
  return { ccp, upsert, deactivate };
}

describe('CcpRowActions (Edit/Deactivate — supplier-spec parity)', () => {
  it('EDIT modal exposes ALL fields PRE-POPULATED from the row and submits { id, ccp_code, ... } to upsertCcp', async () => {
    const upsert = vi.fn(async () => ({ ok: true as const, data: makeCcpRow() }));
    renderRow({ id: 'ccp-9', ccpCode: 'CCP-09', name: 'Cooking temp', processStep: 'Cooking', hazardType: 'biological', criticalLimitMin: '72', criticalLimitMax: null, unit: '°C', monitoringFrequency: 'Each batch', correctiveAction: 'Reprocess' }, { upsert });

    fireEvent.click(screen.getByTestId('haccp-ccp-edit-ccp-9'));
    const code = screen.getByTestId('haccp-ccp-add-code') as HTMLInputElement;
    expect(code.value).toBe('CCP-09');
    expect((screen.getByTestId('haccp-ccp-add-name') as HTMLInputElement).value).toBe('Cooking temp');
    expect((screen.getByTestId('haccp-ccp-add-step') as HTMLInputElement).value).toBe('Cooking');
    expect((screen.getByTestId('haccp-ccp-add-limit-min') as HTMLInputElement).value).toBe('72');
    expect((screen.getByTestId('haccp-ccp-add-unit') as HTMLInputElement).value).toBe('°C');
    expect((screen.getByTestId('haccp-ccp-add-frequency') as HTMLInputElement).value).toBe('Each batch');
    expect((screen.getByTestId('haccp-ccp-add-corrective') as HTMLTextAreaElement).value).toBe('Reprocess');

    fireEvent.change(screen.getByTestId('haccp-ccp-add-name'), { target: { value: 'Cooking temperature' } });
    fireEvent.click(screen.getByTestId('haccp-ccp-add-submit'));

    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ccp-9',
        ccp_code: 'CCP-09',
        name: 'Cooking temperature',
        process_step: 'Cooking',
        hazard_type: 'biological',
        critical_limit_min: '72',
        critical_limit_max: null,
        unit: '°C',
        monitoring_frequency: 'Each batch',
        corrective_action: 'Reprocess',
        is_active: true,
      }),
    );
  });

  it('EDIT error: a failed upsert surfaces inline via role="alert" and never throws', async () => {
    const upsert = vi.fn(async () => ({ ok: false as const, reason: 'error' as const, message: 'duplicate code' }));
    renderRow({ id: 'ccp-7' }, { upsert });
    fireEvent.click(screen.getByTestId('haccp-ccp-edit-ccp-7'));
    fireEvent.click(screen.getByTestId('haccp-ccp-add-submit'));
    await waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(await screen.findByTestId('haccp-ccp-add-error')).toHaveTextContent('duplicate code');
  });

  it('DEACTIVATE: confirm calls deactivateCcp(ccp.id)', async () => {
    const deactivate = vi.fn(async () => ({ ok: true as const, data: { id: 'ccp-5', isActive: false as const } }));
    renderRow({ id: 'ccp-5' }, { deactivate });
    fireEvent.click(screen.getByTestId('haccp-ccp-deactivate-ccp-5'));
    fireEvent.click(screen.getByTestId('haccp-ccp-deactivate-confirm'));
    await waitFor(() => expect(deactivate).toHaveBeenCalledTimes(1));
    expect(deactivate).toHaveBeenCalledWith('ccp-5');
  });

  it('DEACTIVATE error: a failed deactivate surfaces inline via role="alert" and never throws', async () => {
    const deactivate = vi.fn(async () => ({ ok: false as const, reason: 'forbidden' as const, message: 'forbidden' }));
    renderRow({ id: 'ccp-3' }, { deactivate });
    fireEvent.click(screen.getByTestId('haccp-ccp-deactivate-ccp-3'));
    fireEvent.click(screen.getByTestId('haccp-ccp-deactivate-confirm'));
    await waitFor(() => expect(deactivate).toHaveBeenCalled());
    expect(await screen.findByTestId('haccp-ccp-deactivate-error')).toHaveTextContent('forbidden');
  });
});

describe('Plan-detail Actions column gate (canEdit && isDraft)', () => {
  function renderDetail(plan: HaccpPlan, canEdit: boolean) {
    render(
      <PlanDetailClient
        plan={plan}
        labels={buildPlanDetailLabels(tEn)}
        ccpAddLabels={CCP_ADD_LABELS}
        ccpRowActionsLabels={ROW_LABELS}
        activateLabels={buildPlanActivateLabels(tEn)}
        canEdit={canEdit}
        upsertCcpAction={(vi.fn(async () => ({ ok: true as const, data: makeCcpRow() }))) as never}
        deactivateCcpAction={(vi.fn(async () => ({ ok: true as const, data: { id: 'x', isActive: false as const } }))) as never}
        activatePlanAction={(vi.fn(async () => ({ ok: true as const, data: { ...plan, status: 'active' as const } }))) as never}
      />,
    );
  }

  it('DRAFT + canEdit → Actions column + per-row Edit/Deactivate are rendered', () => {
    renderDetail(makePlan({ status: 'draft', ccps: [makeCcp({ id: 'ccp-1' })] }), true);
    expect(screen.getByTestId('haccp-ccp-actions-header')).toBeInTheDocument();
    expect(screen.getByTestId('haccp-ccp-edit-ccp-1')).toBeInTheDocument();
    expect(screen.getByTestId('haccp-ccp-deactivate-ccp-1')).toBeInTheDocument();
  });

  it('ACTIVE plan → NO Actions column (locked, not a draft)', () => {
    renderDetail(makePlan({ status: 'active', ccps: [makeCcp({ id: 'ccp-1' })] }), true);
    expect(screen.queryByTestId('haccp-ccp-actions-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('haccp-ccp-edit-ccp-1')).not.toBeInTheDocument();
  });

  it('DRAFT but NO plan_edit → NO Actions column (RBAC, server-resolved)', () => {
    renderDetail(makePlan({ status: 'draft', ccps: [makeCcp({ id: 'ccp-1' })] }), false);
    expect(screen.queryByTestId('haccp-ccp-actions-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('haccp-ccp-edit-ccp-1')).not.toBeInTheDocument();
  });
});

describe('CcpRowActions i18n (no leaked dotted keys)', () => {
  it('resolves every ccpRowActions label in en and pl', () => {
    for (const t of [tEn, tPl]) {
      const flat = JSON.stringify(buildCcpRowActionsLabels(t));
      // {code}/{name}/{message} placeholders are not dotted keys; the regex only
      // matches a leaked a.b.c dotted next-intl key.
      expect(flat).not.toMatch(/[a-z]+\.[a-z]+\.[a-zA-Z]/);
    }
  });

  it('en + pl differ (real translations, not an en clone)', () => {
    expect(tPl('ccpRowActions.edit')).not.toBe(tEn('ccpRowActions.edit'));
    expect(tPl('ccpRowActions.deactivateConfirm')).not.toBe(tEn('ccpRowActions.deactivateConfirm'));
  });
});
