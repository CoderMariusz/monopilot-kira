/**
 * Wave E3 — HACCP plan detail client island: RTL parity + state + i18n + RBAC.
 *
 * Prototype: prototypes/design/Monopilot Design System/quality/
 *   haccp-screens.jsx:44-103 (QaHaccpPlans detail pane) — plan header card +
 *   the plan's CCP grid (code, step, hazard badge, critical limits, frequency),
 *   draft → e-sign "Approve Plan".
 *
 * The page is an async RSC that reads Supabase via getHaccpPlan (and renders the
 * denied / error / not-found / loading panels there); this test exercises the
 * presentational client island directly. The `upsertCcp` (with plan_id) and
 * `activateHaccpPlan` Server Actions are injected as vi.fn() props so we assert
 * the EXACT payloads wired against the reviewed signatures.
 *
 * Covers: header parity (name/scope/version/status/#CCP — never a UUID), the CCP
 * table, empty state + CTA, the add-CCP modal exposes ALL its fields + submits
 * the exact upsertCcp payload INCLUDING plan_id, the draft-only edit lock
 * (active plan → add disabled + tooltip), the e-sign activate modal exposes the
 * PIN field, action-error verbatim, RBAC, and i18n (en + pl).
 */
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../../../../../../../i18n/en.json';
import pl from '../../../../../../../../../i18n/pl.json';

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
const DETAIL_LABELS = buildPlanDetailLabels(tEn);
const CCP_ADD_LABELS = buildCcpAddLabels(tEn);
const CCP_ROW_ACTIONS_LABELS = buildCcpRowActionsLabels(tEn);
const ACTIVATE_LABELS = buildPlanActivateLabels(tEn);
const PLAN_ID = '11111111-2222-4333-8444-555555555555';

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
    correctiveAction: over.correctiveAction ?? '',
    lineId: over.lineId ?? null,
    isActive: over.isActive ?? true,
    createdAt: over.createdAt ?? '2026-06-18T10:00:00.000Z',
    updatedAt: over.updatedAt ?? '2026-06-18T10:00:00.000Z',
  };
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

function makeCcpRow(): HaccpCcpRow {
  return {
    id: 'new-ccp',
    ccpCode: 'CCP-02',
    name: 'Chilling',
    processStep: 'Chilling',
    hazardType: 'biological',
    criticalLimitMin: null,
    criticalLimitMax: '4',
    unit: '°C',
    monitoringFrequency: 'Each batch',
    correctiveAction: '',
    lineId: null,
    isActive: true,
    createdAt: '2026-06-18T10:00:00.000Z',
    updatedAt: '2026-06-18T10:00:00.000Z',
  };
}

function renderDetail(
  plan: HaccpPlan,
  opts: {
    canEdit?: boolean;
    upsertCcp?: ReturnType<typeof vi.fn>;
    deactivateCcp?: ReturnType<typeof vi.fn>;
    activate?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const canEdit = opts.canEdit ?? true;
  const upsertCcp = opts.upsertCcp ?? vi.fn(async () => ({ ok: true as const, data: makeCcpRow() }));
  const deactivateCcp =
    opts.deactivateCcp ?? vi.fn(async () => ({ ok: true as const, data: { id: 'ccp-1', isActive: false as const } }));
  const activate = opts.activate ?? vi.fn(async () => ({ ok: true as const, data: { ...plan, status: 'active' as const } }));
  render(
    <PlanDetailClient
      plan={plan}
      labels={DETAIL_LABELS}
      ccpAddLabels={CCP_ADD_LABELS}
      ccpRowActionsLabels={CCP_ROW_ACTIONS_LABELS}
      activateLabels={ACTIVATE_LABELS}
      canEdit={canEdit}
      upsertCcpAction={upsertCcp as never}
      deactivateCcpAction={deactivateCcp as never}
      activatePlanAction={activate as never}
    />,
  );
  return { upsertCcp, deactivateCcp, activate };
}

describe('PlanDetailClient (E3 parity)', () => {
  it('detail loader source reads the plural haccp_plans table', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'app/[locale]/(app)/(modules)/quality/_actions/haccp-plan-actions.ts'),
      'utf8',
    );
    const detailQuery = source.match(/async function selectPlanWithCcps[\s\S]*?return mapPlanRows/)?.[0] ?? '';

    expect(detailQuery).toContain('from public.haccp_plans p');
    expect(detailQuery).toContain('and p.id = $1::uuid');
  });

  it('renders the plan header (name, scope, version, status badge, #CCP) — never a UUID', () => {
    renderDetail(
      makePlan({ id: '11111111-2222-4333-8444-555555555555', name: 'Cooked meats', version: 2, status: 'active', scopeType: 'product', scopeRef: 'FG-001', ccps: [makeCcp({ id: 'ccp-a' }), makeCcp({ id: 'ccp-b', ccpCode: 'CCP-02' })] }),
    );
    const header = screen.getByTestId('haccp-detail-header');
    expect(header).toHaveTextContent('Cooked meats');
    expect(header).toHaveTextContent('v2');
    expect(header).toHaveTextContent(DETAIL_LABELS.scopeType.product);
    expect(header).toHaveTextContent('FG-001');
    expect(screen.getByTestId('haccp-detail-status')).toHaveTextContent(DETAIL_LABELS.status.active);
    expect(screen.getByTestId('haccp-detail-ccp-count')).toHaveTextContent('2');
    // no raw UUID leaks into visible text (the plan id is a routing key only).
    expect(document.body.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('renders the linked CCP table with code, hazard badge and critical limits', () => {
    renderDetail(makePlan({ ccps: [makeCcp({ id: 'x', ccpCode: 'CCP-09', hazardType: 'physical', criticalLimitMin: null, criticalLimitMax: '4', unit: '°C' })] }));
    const table = screen.getByTestId('haccp-ccp-table');
    expect(table).toHaveAttribute('data-state', 'data');
    expect(screen.getByTestId('haccp-ccp-code-x')).toHaveTextContent('CCP-09');
    expect(screen.getByTestId('haccp-ccp-hazard-x')).toHaveTextContent(DETAIL_LABELS.hazardType.physical);
    expect(screen.getByTestId('haccp-ccp-limit-x')).toHaveTextContent('4');
  });

  it('EMPTY state: a plan with no CCPs renders the add-CCP CTA (opens the modal) on a draft', () => {
    renderDetail(makePlan({ status: 'draft', ccps: [] }));
    const empty = screen.getByTestId('haccp-detail-empty');
    expect(empty).toHaveAttribute('data-state', 'empty');
    const cta = screen.getByTestId('haccp-detail-empty-cta');
    expect(cta).not.toBeDisabled();
    fireEvent.click(cta);
    expect(screen.getByTestId('haccp-ccp-add-form')).toBeInTheDocument();
  });

  it('ADD CCP modal exposes ALL fields and submits the exact upsertCcp payload INCLUDING this plan_id', async () => {
    const upsertCcp = vi.fn(async () => ({ ok: true as const, data: makeCcpRow() }));
    renderDetail(makePlan({ id: PLAN_ID, status: 'draft', ccps: [makeCcp()] }), { upsertCcp });
    fireEvent.click(screen.getByTestId('haccp-detail-add-ccp'));

    // every field present.
    for (const tid of [
      'haccp-ccp-add-code',
      'haccp-ccp-add-name',
      'haccp-ccp-add-step',
      'haccp-ccp-add-hazard',
      'haccp-ccp-add-limit-min',
      'haccp-ccp-add-limit-max',
      'haccp-ccp-add-unit',
      'haccp-ccp-add-frequency',
      'haccp-ccp-add-corrective',
    ]) {
      expect(screen.getByTestId(tid)).toBeInTheDocument();
    }
    expect(screen.getByTestId('haccp-ccp-add-submit')).toBeDisabled();

    fireEvent.change(screen.getByTestId('haccp-ccp-add-code'), { target: { value: 'CCP-02' } });
    fireEvent.change(screen.getByTestId('haccp-ccp-add-name'), { target: { value: 'Chilling temperature' } });
    fireEvent.change(screen.getByTestId('haccp-ccp-add-step'), { target: { value: 'Chilling' } });
    fireEvent.click(within(screen.getByTestId('haccp-ccp-add-hazard')).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: CCP_ADD_LABELS.hazardTypeOptions.biological }));
    fireEvent.change(screen.getByTestId('haccp-ccp-add-limit-max'), { target: { value: '4' } });
    fireEvent.change(screen.getByTestId('haccp-ccp-add-unit'), { target: { value: '°C' } });
    fireEvent.change(screen.getByTestId('haccp-ccp-add-frequency'), { target: { value: 'Each batch' } });

    expect(screen.getByTestId('haccp-ccp-add-submit')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('haccp-ccp-add-submit'));

    await waitFor(() => expect(upsertCcp).toHaveBeenCalledTimes(1));
    expect(upsertCcp).toHaveBeenCalledWith({
      ccp_code: 'CCP-02',
      name: 'Chilling temperature',
      process_step: 'Chilling',
      hazard_type: 'biological',
      critical_limit_min: null,
      critical_limit_max: '4',
      unit: '°C',
      monitoring_frequency: 'Each batch',
      plan_id: PLAN_ID,
      is_active: true,
    });
    await waitFor(() => expect(screen.queryByTestId('haccp-ccp-add-form')).not.toBeInTheDocument());
  });

  it('ADD CCP affordance reopens the create modal with an empty reset form', () => {
    renderDetail(makePlan({ id: PLAN_ID, status: 'draft', ccps: [makeCcp()] }));

    fireEvent.click(screen.getByTestId('haccp-detail-add-ccp'));
    const code = screen.getByTestId('haccp-ccp-add-code') as HTMLInputElement;
    fireEvent.change(code, { target: { value: 'CCP-DRAFT' } });
    expect(code.value).toBe('CCP-DRAFT');

    fireEvent.click(screen.getByTestId('haccp-ccp-add-cancel'));
    fireEvent.click(screen.getByTestId('haccp-detail-add-ccp'));

    expect((screen.getByTestId('haccp-ccp-add-code') as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('haccp-ccp-add-submit')).toBeDisabled();
  });

  it('ADD CCP validation: min>max rejected inline', async () => {
    renderDetail(makePlan({ status: 'draft' }));
    fireEvent.click(screen.getByTestId('haccp-detail-add-ccp'));
    fireEvent.change(screen.getByTestId('haccp-ccp-add-code'), { target: { value: 'CCP-03' } });
    fireEvent.change(screen.getByTestId('haccp-ccp-add-name'), { target: { value: 'Metal detection' } });
    fireEvent.change(screen.getByTestId('haccp-ccp-add-step'), { target: { value: 'Detection' } });
    fireEvent.click(within(screen.getByTestId('haccp-ccp-add-hazard')).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: CCP_ADD_LABELS.hazardTypeOptions.physical }));
    fireEvent.change(screen.getByTestId('haccp-ccp-add-limit-min'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('haccp-ccp-add-limit-max'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('haccp-ccp-add-submit'));
    expect(await screen.findByTestId('haccp-ccp-add-error')).toHaveTextContent(CCP_ADD_LABELS.validation.limitOrder);
  });

  it('ADD CCP error: a forbidden/error result surfaces the action message verbatim', async () => {
    const upsertCcp = vi.fn(async () => ({ ok: false as const, reason: 'forbidden' as const, message: 'forbidden' }));
    renderDetail(makePlan({ status: 'draft' }), { upsertCcp });
    fireEvent.click(screen.getByTestId('haccp-detail-add-ccp'));
    fireEvent.change(screen.getByTestId('haccp-ccp-add-code'), { target: { value: 'CCP-04' } });
    fireEvent.change(screen.getByTestId('haccp-ccp-add-name'), { target: { value: 'Cooling' } });
    fireEvent.change(screen.getByTestId('haccp-ccp-add-step'), { target: { value: 'Cooling' } });
    fireEvent.click(within(screen.getByTestId('haccp-ccp-add-hazard')).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: CCP_ADD_LABELS.hazardTypeOptions.biological }));
    fireEvent.click(screen.getByTestId('haccp-ccp-add-submit'));
    await waitFor(() => expect(upsertCcp).toHaveBeenCalled());
    expect(await screen.findByTestId('haccp-ccp-add-error')).toHaveTextContent('forbidden');
  });

  it('DRAFT-ONLY edit lock: an ACTIVE plan disables [Add CCP] with the locked tooltip (limits editable in draft only)', () => {
    renderDetail(makePlan({ status: 'active', ccps: [makeCcp()] }));
    const add = screen.getByTestId('haccp-detail-add-ccp');
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute('title', DETAIL_LABELS.lockedHint);
    // an active plan has no activate button.
    expect(screen.queryByTestId('haccp-detail-activate')).not.toBeInTheDocument();
  });

  it('ADD CCP gated (rule 0.13c): no plan_edit → disabled + permission tooltip even on a draft', () => {
    renderDetail(makePlan({ status: 'draft' }), { canEdit: false });
    const add = screen.getByTestId('haccp-detail-add-ccp');
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute('title', DETAIL_LABELS.addCcpDisabled);
  });

  it('DRAFT plan: [Activate] opens the e-sign modal which EXPOSES the PIN field and signs with { password }', async () => {
    const activate = vi.fn(async () => ({ ok: true as const, data: { ...makePlan({ status: 'active' }) } }));
    renderDetail(makePlan({ id: 'plan-9', status: 'draft', name: 'Cooked meats line A' }), { activate });

    fireEvent.click(screen.getByTestId('haccp-detail-activate'));
    expect(screen.getByTestId('haccp-plan-activate-form')).toBeInTheDocument();
    const pin = screen.getByTestId('haccp-plan-activate-password');
    expect(pin).toHaveAttribute('type', 'password');
    fireEvent.change(pin, { target: { value: 'Secret-9' } });
    fireEvent.click(screen.getByTestId('haccp-plan-activate-submit'));

    await waitFor(() => expect(activate).toHaveBeenCalledTimes(1));
    expect(activate).toHaveBeenCalledWith('plan-9', { password: 'Secret-9' });
  });

  it('ACTIVATE gated (rule 0.13c): draft + no plan_edit → disabled + tooltip', () => {
    renderDetail(makePlan({ status: 'draft' }), { canEdit: false });
    const btn = screen.getByTestId('haccp-detail-activate');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', DETAIL_LABELS.activateDisabled);
  });
});

describe('HACCP plan detail i18n (no leaked dotted keys)', () => {
  it('resolves every detail + ccpAdd label in en and pl', () => {
    for (const t of [tEn, tPl]) {
      const flat = JSON.stringify([buildPlanDetailLabels(t), buildCcpAddLabels(t)]);
      expect(flat).not.toMatch(/[a-z]+\.[a-z]+\.[a-zA-Z]/);
    }
  });

  it('en + pl differ (real translations, not an en clone)', () => {
    expect(tPl('detail.addCcp')).not.toBe(tEn('detail.addCcp'));
    expect(tPl('detail.lockedHint')).not.toBe(tEn('detail.lockedHint'));
    expect(tPl('ccpAdd.title')).not.toBe(tEn('ccpAdd.title'));
  });
});
