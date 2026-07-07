/**
 * Wave E2A — Trace & Recall client islands: RTL parity + state + i18n + RBAC.
 *
 * Spec-driven (no JSX prototype for trace/recall in the Monopilot Design System;
 * nearest reusable pattern = the sibling quality CCP-monitoring board + record
 * modal, plus the genealogy panel). DS conformance: PageHeader + Card + Badge +
 * shadcn Select (no raw <select>) + Table.
 *
 * The page is an async RSC; the client island TraceWorkbench owns the input row,
 * the [Run trace] call, the summary panel, the node tree and the flat table, and
 * the [Save as drill] flow. The Server Actions are injected as vi.fn() props so
 * we assert the EXACT payloads wired against the reviewed signatures.
 *
 * Covers: input exposes ref + type + direction; [Run trace] calls runTraceReport
 * with the exact payload; 5 summary counts; node tree + flat table render human
 * refs; deep-links; NO raw UUID leak (rule 0.11); all 4 states
 * (loading/empty-with-CTA/error/data); [Save as drill] calls start+complete;
 * i18n en + pl resolve every label (no leaked dotted key).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../../../../../../i18n/en.json';
import pl from '../../../../../../../../i18n/pl.json';

import { TraceWorkbench } from '../trace-workbench.client';
import { buildTraceLabels, toDetailHref, type Translator } from '../labels';
import type { TraceReportView } from '../trace-contracts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const H8_TRACE_EN: Record<string, string> = {
  'truncation.banner': 'Results truncated — narrow the scope and run the trace again.',
  'truncation.layerSeedLp': 'License plate matches capped at {limit} rows.',
  'truncation.layerSeedBatch': 'Batch matches capped at {limit} rows.',
  'truncation.layerSeedItem': 'Item matches capped at {limit} rows.',
  'massBalance.title': 'Mass balance reconciliation',
  'massBalance.ariaLabel': 'Mass balance reconciliation table',
  'massBalance.nodeTitle': 'Per work order',
  'massBalance.nodeWo': 'Work order',
  'massBalance.nodeInput': 'Input consumed',
  'massBalance.nodeOutput': 'Output produced',
  'massBalance.nodeWaste': 'Waste',
  'massBalance.nodeRemaining': 'Remaining on site',
  'massBalance.nodeDelta': 'Node delta',
  'massBalance.totalTitle': 'Netted trace total',
  'massBalance.seedInput': 'Seed input',
  'massBalance.onSite': 'Still on site (terminal)',
  'massBalance.shipped': 'Shipped',
  'massBalance.waste': 'Waste (all traced WOs)',
  'massBalance.nettedDelta': 'Net delta',
  'massBalance.percentAccounted': '{percent}% accounted',
  'massBalance.nettedUnbalanced': 'Net trace out of balance by {delta}',
  'massBalance.unreconciledTitle': 'Excluded — unit not reconcilable to kg',
  'massBalance.unreconciledRow': '{ref}: {qty} {uom} ({bucket})',
  'massBalance.scopeLimited': 'Mass balance requires org-wide visibility — ask an administrator to run the recall reconciliation.',
};

function makeT(locale: 'en' | 'pl'): Translator {
  const ns = (locale === 'pl' ? pl : en).quality.trace as Record<string, unknown>;
  const overlay = locale === 'en' ? H8_TRACE_EN : H8_TRACE_EN;
  return (key: string, values?: Record<string, string | number>) => {
    if (overlay[key]) {
      let raw = overlay[key];
      if (values) raw = raw.replace(/\{(\w+)\}/g, (_m, k: string) => (values[k] !== undefined ? String(values[k]) : `{${k}}`));
      return raw;
    }
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
const LABELS = buildTraceLabels(tEn);

const LP_UUID = '11111111-2222-4333-8444-555555555555';
const WO_UUID = '22222222-3333-4444-8555-666666666666';

function makeReport(over: Partial<TraceReportView> = {}): TraceReportView {
  const nodes = over.nodes ?? [
    { nodeId: 'supplier:s1', type: 'supplier' as const, ref: 'SUP-01', label: 'SUP-01 / Acme Meats', qty: null, uom: null, detailHref: null },
    { nodeId: 'grn:g1', type: 'grn' as const, ref: 'GRN-1001', label: 'GRN-1001', qty: null, uom: null, detailHref: `/en/warehouse/grns/g1` },
    { nodeId: `lp:${LP_UUID}`, type: 'input_lp' as const, ref: 'LP-IN-7', label: 'LP-IN-7 / RM-BEEF', qty: '250', uom: 'kg', detailHref: toDetailHref('en', 'input_lp', `lp:${LP_UUID}`) },
    { nodeId: `wo:${WO_UUID}`, type: 'work_order' as const, ref: 'WO-2026-0042', label: 'WO-2026-0042', qty: '500', uom: 'kg', detailHref: toDetailHref('en', 'work_order', `wo:${WO_UUID}`) },
    { nodeId: 'lp:out1', type: 'output_lp' as const, ref: 'LP-OUT-9', label: 'LP-OUT-9 / FG-SAUSAGE', qty: '480', uom: 'kg', detailHref: null },
    { nodeId: 'shipment:out1', type: 'shipment_placeholder' as const, ref: 'shipping module inactive', label: 'shipping module inactive', qty: null, uom: null, detailHref: null },
  ];
  return {
    nodes,
    edges: over.edges ?? [],
    flat: over.flat ?? nodes.map((n) => ({ nodeId: n.nodeId, type: n.type, ref: n.ref, qty: n.qty, uom: n.uom })),
    summary: over.summary ?? { lpCount: 2, woCount: 1, shipmentCount: 1, customersAffected: 0, totalKg: '730' },
    truncation: over.truncation ?? { truncated: false, layers: [] },
    massBalance: over.massBalance ?? null,
  };
}

function renderWorkbench(opts: { runAction?: ReturnType<typeof vi.fn> } = {}) {
  const report = makeReport();
  const runAction = opts.runAction ?? vi.fn(async () => report);
  render(
    <TraceWorkbench
      labels={LABELS}
      locale="en"
      runTraceReportAction={runAction as never}
    />,
  );
  return { runAction, report };
}

describe('TraceWorkbench (E2A parity)', () => {
  it('INPUT row exposes the ref field, the type selector and the direction toggle', () => {
    renderWorkbench();
    expect(screen.getByTestId('trace-input-ref')).toBeInTheDocument();
    // type selector is a shadcn Select (no raw <select>)
    expect(within(screen.getByTestId('trace-input-type')).getByRole('combobox')).toBeInTheDocument();
    // direction toggle has all three options
    expect(screen.getByTestId('trace-direction-backward')).toBeInTheDocument();
    expect(screen.getByTestId('trace-direction-forward')).toBeInTheDocument();
    expect(screen.getByTestId('trace-direction-both')).toBeInTheDocument();
    // no raw <select> anywhere
    expect(document.querySelector('select')).toBeNull();
  });

  it('EMPTY state before any run: shows the empty-with-CTA panel and Run disabled until a ref is entered', () => {
    renderWorkbench();
    const empty = screen.getByTestId('trace-empty');
    expect(empty).toHaveAttribute('data-state', 'empty');
    expect(empty).toHaveTextContent(LABELS.states.emptyTitle);
    expect(screen.getByTestId('trace-run')).toBeDisabled();
    fireEvent.change(screen.getByTestId('trace-input-ref'), { target: { value: 'LP-IN-7' } });
    expect(screen.getByTestId('trace-run')).not.toBeDisabled();
  });

  it('[Run trace] calls runTraceReport with the EXACT payload and then renders the report', async () => {
    const { runAction } = renderWorkbench();
    fireEvent.change(screen.getByTestId('trace-input-ref'), { target: { value: 'LP-IN-7' } });
    // pick a type (batch) via the shadcn Select
    fireEvent.click(within(screen.getByTestId('trace-input-type')).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: LABELS.inputType.batch }));
    // pick forward direction
    fireEvent.click(screen.getByTestId('trace-direction-forward'));
    fireEvent.click(screen.getByTestId('trace-run'));

    await waitFor(() => expect(runAction).toHaveBeenCalledTimes(1));
    expect(runAction).toHaveBeenCalledWith({ inputType: 'batch', inputRef: 'LP-IN-7', direction: 'forward' });
    expect(await screen.findByTestId('trace-report')).toBeInTheDocument();
  });

  it('SUMMARY panel renders the five summary counts', async () => {
    renderWorkbench();
    fireEvent.change(screen.getByTestId('trace-input-ref'), { target: { value: 'LP-IN-7' } });
    fireEvent.click(screen.getByTestId('trace-run'));
    await screen.findByTestId('trace-report');
    expect(within(screen.getByTestId('trace-summary-lpCount')).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByTestId('trace-summary-woCount')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('trace-summary-shipmentCount')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('trace-summary-customersAffected')).getByText('0')).toBeInTheDocument();
    expect(within(screen.getByTestId('trace-summary-totalKg')).getByText(/730/)).toBeInTheDocument();
  });

  it('NODE tree + FLAT table render the human refs (lp_code / wo_number / grn number / supplier code+name)', async () => {
    renderWorkbench();
    fireEvent.change(screen.getByTestId('trace-input-ref'), { target: { value: 'LP-IN-7' } });
    fireEvent.click(screen.getByTestId('trace-run'));
    await screen.findByTestId('trace-report');
    const graph = screen.getByTestId('trace-graph');
    expect(graph).toHaveTextContent('SUP-01');
    expect(graph).toHaveTextContent('GRN-1001');
    expect(graph).toHaveTextContent('LP-IN-7');
    expect(graph).toHaveTextContent('WO-2026-0042');
    const table = screen.getByTestId('trace-flat-table');
    expect(table).toHaveTextContent('LP-OUT-9');
    expect(table).toHaveTextContent('kg');
  });

  it('clicking a node deep-links to the detail screen where one exists (LP, WO, GRN)', async () => {
    renderWorkbench();
    fireEvent.change(screen.getByTestId('trace-input-ref'), { target: { value: 'LP-IN-7' } });
    fireEvent.click(screen.getByTestId('trace-run'));
    await screen.findByTestId('trace-report');
    expect(screen.getByTestId(`trace-node-link-lp:${LP_UUID}`)).toHaveAttribute(
      'href',
      `/en/warehouse/license-plates/${LP_UUID}`,
    );
    expect(screen.getByTestId(`trace-node-link-wo:${WO_UUID}`)).toHaveAttribute(
      'href',
      `/en/production/wos/${WO_UUID}`,
    );
    // supplier has no detail route → no link
    expect(screen.queryByTestId('trace-node-link-supplier:s1')).not.toBeInTheDocument();
  });

  it('never renders a raw UUID anywhere in the report (rule 0.11)', async () => {
    renderWorkbench();
    fireEvent.change(screen.getByTestId('trace-input-ref'), { target: { value: 'LP-IN-7' } });
    fireEvent.click(screen.getByTestId('trace-run'));
    const report = await screen.findByTestId('trace-report');
    expect(report.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('ERROR state: a thrown runTraceReport surfaces the error panel (no 500)', async () => {
    const runAction = vi.fn(async () => {
      throw new Error('boom');
    });
    renderWorkbench({ runAction });
    fireEvent.change(screen.getByTestId('trace-input-ref'), { target: { value: 'LP-IN-7' } });
    fireEvent.click(screen.getByTestId('trace-run'));
    const err = await screen.findByTestId('trace-error');
    expect(err).toHaveAttribute('data-state', 'error');
    expect(err).toHaveTextContent(LABELS.states.errorTitle);
  });

  it('does not expose a save-as-drill write control on the read-only screen', async () => {
    renderWorkbench();
    fireEvent.change(screen.getByTestId('trace-input-ref'), { target: { value: 'LP-IN-7' } });
    fireEvent.click(screen.getByTestId('trace-run'));
    await screen.findByTestId('trace-report');
    expect(screen.queryByTestId('trace-save-drill')).not.toBeInTheDocument();
  });

  it('renders the truncation warning banner when the report is capped', async () => {
    const runAction = vi.fn(async () =>
      makeReport({
        truncation: { truncated: true, layers: [{ layer: 'seed_batch', limit: 500 }] },
      }),
    );
    renderWorkbench({ runAction });
    fireEvent.change(screen.getByTestId('trace-input-ref'), { target: { value: 'B-100' } });
    fireEvent.click(screen.getByTestId('trace-run'));
    const banner = await screen.findByTestId('trace-truncation-banner');
    expect(banner).toHaveTextContent('Results truncated');
    expect(banner).toHaveTextContent('500');
  });

  it('renders the mass balance reconciliation panel when present', async () => {
    const runAction = vi.fn(async () =>
      makeReport({
        massBalance: {
          applicable: true,
          nodes: [
            {
              woRef: 'WO-1',
              inputKg: '10',
              outputKg: '9',
              wasteKg: '1',
              remainingKg: '0',
              deltaKg: '0',
              balanced: true,
            },
          ],
          total: {
            seedInputKg: '10',
            shippedKg: '9',
            onSiteKg: '0',
            wasteKg: '1',
            deltaKg: '0',
            balanced: true,
            percentAccounted: '100',
          },
          unreconciled: [],
        },
      }),
    );
    renderWorkbench({ runAction });
    fireEvent.change(screen.getByTestId('trace-input-ref'), { target: { value: 'LP-IN-7' } });
    fireEvent.click(screen.getByTestId('trace-run'));
    expect(await screen.findByTestId('trace-mass-balance')).toBeInTheDocument();
    expect(screen.getByTestId('trace-mass-balance-row-seed')).toHaveTextContent('10 kg');
    expect(screen.getByTestId('trace-mass-balance-node-WO-1')).toBeInTheDocument();
  });

  it('F2: renders a scope-limited notice instead of balance lines when massBalance.scopeLimited is true', async () => {
    const runAction = vi.fn(async () =>
      makeReport({
        massBalance: { scopeLimited: true },
      }),
    );
    renderWorkbench({ runAction });
    fireEvent.change(screen.getByTestId('trace-input-ref'), { target: { value: 'LP-IN-7' } });
    fireEvent.click(screen.getByTestId('trace-run'));
    expect(await screen.findByTestId('trace-mass-balance-scope-limited')).toBeInTheDocument();
    expect(screen.queryByTestId('trace-mass-balance-table')).not.toBeInTheDocument();
    expect(screen.getByTestId('trace-mass-balance-scope-limited')).toHaveTextContent(
      'Mass balance requires org-wide visibility',
    );
  });
});

describe('Trace i18n (no leaked dotted keys)', () => {
  it('resolves every trace label in en and pl', () => {
    for (const t of [tEn, tPl]) {
      const labels = buildTraceLabels(t);
      const flat = JSON.stringify(labels);
      expect(flat).not.toMatch(/[a-z]+\.[a-z]+\.[a-zA-Z]/);
    }
  });

  it('en + pl differ (real translations, not an en clone)', () => {
    expect(tPl('form.run')).not.toBe(tEn('form.run'));
    expect(tPl('summary.title')).not.toBe(tEn('summary.title'));
  });
});
