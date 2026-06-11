/**
 * WH-003 — License-plate detail client: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/warehouse/lp-screens.jsx:216-571.
 * Tests the presentational <LpDetailClient> directly (the page is an async RSC that
 * reads Supabase via getLpDetail and is exercised live). Asserts:
 *   - all 7 tabs render + switch (overview/history/reservations/movements/
 *     genealogy/labels/raw) (parity lp-screens.jsx:220-228,325-331)
 *   - the prototype action group renders DISABLED with "Coming soon" (red-line —
 *     lp-screens.jsx:310-317)
 *   - genealogy parent/children render as detail links (lp-screens.jsx:400-450)
 *   - history / movements / reservations empty states
 *   - i18n: en + pl staged detail keys resolve (no leaked dotted keys)
 */
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  LpDetailClient,
  LP_DEFERRED_ACTIONS,
  LP_DETAIL_TABS,
  type LpDetailLabels,
  type LpDeferredAction,
} from '../lp-detail.client';
import { LP_DEFERRED_ACTIONS as LP_DEFERRED_ACTIONS_SERVER_SAFE } from '../lp-detail-constants';
import { getLpTranslator } from '../../../lp-labels';
import type { LicensePlateDetail } from '../../../../_actions/shared';

function buildLabels(locale: string): LpDetailLabels {
  const t = getLpTranslator(locale);
  const labelByKey = {} as Record<LpDeferredAction, string>;
  for (const k of LP_DEFERRED_ACTIONS) labelByKey[k] = t(`detail.actions.${k}`);
  return {
    back: t('detail.back'),
    qtyLine: t('detail.header.qtyLine'),
    statusLabel: {
      available: t('status.available'),
      reserved: t('status.reserved'),
      blocked: t('status.blocked'),
      consumed: t('status.consumed'),
      shipped: t('status.shipped'),
      merged: t('status.merged'),
    },
    identity: {
      title: t('detail.identity.title'),
      product: t('detail.identity.product'),
      itemType: t('detail.identity.itemType'),
      quantity: t('detail.identity.quantity'),
      reserved: t('detail.identity.reserved'),
      available: t('detail.identity.available'),
      batch: t('detail.identity.batch'),
      supplierBatch: t('detail.identity.supplierBatch'),
      expiry: t('detail.identity.expiry'),
      bestBefore: t('detail.identity.bestBefore'),
      catchWeight: t('detail.identity.catchWeight'),
      location: t('detail.identity.location'),
      warehouse: t('detail.identity.warehouse'),
      source: t('detail.identity.source'),
      parentLp: t('detail.identity.parentLp'),
      none: t('detail.identity.none'),
    },
    actions: {
      comingSoon: t('detail.actions.comingSoon'),
      labelByKey,
      qaRelease: {
        title: t('detail.actions.qaRelease.title'),
        decision: t('detail.actions.qaRelease.decision'),
        released: t('detail.actions.qaRelease.released'),
        rejected: t('detail.actions.qaRelease.rejected'),
        note: t('detail.actions.qaRelease.note'),
        notePlaceholder: t('detail.actions.qaRelease.notePlaceholder'),
        cancel: t('detail.actions.qaRelease.cancel'),
        confirm: t('detail.actions.qaRelease.confirm'),
        unavailable: t('detail.actions.qaRelease.unavailable'),
        denied: t('detail.actions.qaRelease.denied'),
        invalidState: t('detail.actions.qaRelease.invalidState'),
        error: t('detail.actions.qaRelease.error'),
      },
    },
    move: {
      title: t('detail.move.title'),
      subtitle: t('detail.move.subtitle'),
      destination: t('detail.move.destination'),
      destinationHelp: t('detail.move.destinationHelp'),
      destinationPlaceholder: t('detail.move.destinationPlaceholder'),
      reason: t('detail.move.reason'),
      reasonHelp: t('detail.move.reasonHelp'),
      reasonPlaceholder: t('detail.move.reasonPlaceholder'),
      currentLocation: t('detail.move.currentLocation'),
      loadingLocations: t('detail.move.loadingLocations'),
      noLocations: t('detail.move.noLocations'),
      locationsError: t('detail.move.locationsError'),
      cancel: t('detail.move.cancel'),
      submit: t('detail.move.submit'),
      submitting: t('detail.move.submitting'),
      validation: { destinationRequired: t('detail.move.validation.destinationRequired') },
      error: t('detail.move.error'),
      errorForbidden: t('detail.move.errorForbidden'),
      errorLocked: t('detail.move.errorLocked'),
      errorInvalidState: t('detail.move.errorInvalidState'),
      errorNotFound: t('detail.move.errorNotFound'),
      success: t('detail.move.success'),
    },
    ruleNote: t('detail.ruleNote'),
    tab: {
      overview: t('detail.tabs.overview'),
      history: t('detail.tabs.history'),
      reservations: t('detail.tabs.reservations'),
      movements: t('detail.tabs.movements'),
      genealogy: t('detail.tabs.genealogy'),
      labels: t('detail.tabs.labels'),
      raw: t('detail.tabs.raw'),
    },
    overview: { title: t('detail.overview.title') },
    history: {
      empty: t('detail.history.empty'),
      by: t('detail.history.by'),
      reason: t('detail.history.reason'),
      from: t('detail.history.from'),
      to: t('detail.history.to'),
      at: t('detail.history.at'),
      reasonCol: t('detail.history.reasonCol'),
    },
    reservations: {
      empty: t('detail.reservations.empty'),
      wo: t('detail.reservations.wo'),
      reservedQty: t('detail.reservations.reservedQty'),
      available: t('detail.reservations.available'),
      note: t('detail.reservations.note'),
    },
    movements: {
      empty: t('detail.movements.empty'),
      timestamp: t('detail.movements.timestamp'),
      type: t('detail.movements.type'),
      from: t('detail.movements.from'),
      to: t('detail.movements.to'),
      qty: t('detail.movements.qty'),
      reason: t('detail.movements.reason'),
      reference: t('detail.movements.reference'),
    },
    genealogy: {
      parentTitle: t('detail.genealogy.parentTitle'),
      childrenTitle: t('detail.genealogy.childrenTitle'),
      noParent: t('detail.genealogy.noParent'),
      noChildren: t('detail.genealogy.noChildren'),
      status: t('detail.genealogy.status'),
      qty: t('detail.genealogy.qty'),
    },
    labels: { deferred: t('detail.labels.deferred'), printAction: t('detail.labels.printAction') },
    raw: { title: t('detail.raw.title'), empty: t('detail.raw.empty') },
    expiryBanner: t('detail.expiryBanner'),
  };
}

const EN = buildLabels('en');
const releaseQaActionStub: any = async () => ({
  ok: true,
  data: { lpId: 'lp-1', lpNumber: 'LP-0001', status: 'available', qaStatus: 'released' },
});
const listLocationsActionStub: any = async () => ({ ok: true, data: [] });
const createStockMoveActionStub: any = async () => ({
  ok: true,
  data: {
    id: 'move-1',
    moveNumber: 'SM-001',
    lpId: 'lp-1',
    lpNumber: 'LP-0001',
    moveType: 'transfer',
    fromLocationCode: 'A',
    toLocationCode: 'B',
    quantity: '1',
    uom: 'kg',
    moveDate: '2026-06-11T00:00:00.000Z',
    reasonText: null,
  },
});

function makeDetail(over: Partial<LicensePlateDetail> = {}): LicensePlateDetail {
  return {
    id: 'lp-1',
    lpNumber: 'LP-0001',
    itemCode: 'R-1001',
    itemName: 'Wieprzowina',
    quantity: '120',
    reservedQty: '0',
    availableQty: '120',
    uom: 'kg',
    status: 'available',
    qaStatus: 'PASSED',
    batchNumber: 'B-2026-01',
    expiryDate: '2026-08-01',
    locationCode: 'COLD-B1',
    warehouseCode: 'WH-A',
    createdAt: '2026-01-01T00:00:00.000Z',
    productId: 'prod-1',
    warehouseId: 'wh-1',
    warehouseName: 'Factory A',
    locationId: 'loc-1',
    locationName: 'Cold B1',
    catchWeightKg: null,
    supplierBatchNumber: null,
    bestBeforeDate: null,
    origin: 'grn',
    grnId: null,
    woId: null,
    reservedForWoId: null,
    reservedForWoNumber: null,
    parentLp: null,
    childLps: [],
    stateHistory: [],
    moves: [],
    ...over,
  };
}

function renderDetail(over: Partial<LicensePlateDetail> = {}, labels: LpDetailLabels = EN) {
  return render(
    React.createElement(LpDetailClient, {
      detail: makeDetail(over),
      labels,
      locale: 'en',
      releaseQaAction: releaseQaActionStub,
      listLocationsAction: listLocationsActionStub,
      createStockMoveAction: createStockMoveActionStub,
    }),
  );
}

describe('LpDetailClient (WH-003 parity)', () => {
  it('renders all seven tabs', () => {
    renderDetail();
    expect(LP_DETAIL_TABS).toHaveLength(7);
    for (const k of LP_DETAIL_TABS) {
      expect(screen.getByTestId(`lp-detail-tab-${k}`)).toBeInTheDocument();
    }
  });

  it('switches tab panels on click', () => {
    renderDetail();
    expect(screen.getByTestId('lp-tabpanel-overview')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('lp-detail-tab-movements'));
    expect(screen.getByTestId('lp-tabpanel-movements')).toBeInTheDocument();
    expect(screen.queryByTestId('lp-tabpanel-overview')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('lp-detail-tab-raw'));
    expect(screen.getByTestId('lp-raw-json')).toBeInTheDocument();
  });

  it('keeps deferred actions disabled but makes QA live only while pending', () => {
    renderDetail();
    for (const key of LP_DEFERRED_ACTIONS) {
      const btn = screen.getByTestId(`lp-action-${key}`);
      if (key === 'qa') {
        expect(btn).toBeDisabled();
        expect(btn).toHaveAttribute('title', EN.actions.qaRelease.unavailable);
      } else if (key === 'move') {
        expect(btn).toBeEnabled();
      } else {
        expect(btn).toBeDisabled();
        expect(btn).toHaveAttribute('title', EN.actions.comingSoon);
      }
    }
  });

  it('opens the QA release modal for pending LPs', () => {
    renderDetail({ qaStatus: 'pending' });
    const btn = screen.getByTestId('lp-action-qa');
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(screen.getByTestId('lp-qa-release-modal')).toBeInTheDocument();
    expect(screen.getByTestId('lp-qa-confirm')).toBeInTheDocument();
  });

  it('renders the genealogy parent + children as detail links', () => {
    renderDetail({
      parentLp: { id: 'parent-1', lpNumber: 'LP-PARENT' },
      childLps: [{ id: 'child-1', lpNumber: 'LP-CHILD', status: 'available', quantity: '40', uom: 'kg' }],
    });
    fireEvent.click(screen.getByTestId('lp-detail-tab-genealogy'));
    expect(screen.getByTestId('lp-genealogy-parent')).toHaveAttribute(
      'href',
      '/en/warehouse/license-plates/parent-1',
    );
    const children = screen.getByTestId('lp-genealogy-children');
    expect(children).toHaveTextContent('LP-CHILD');
    expect(children).toHaveTextContent('40 kg');
  });

  it('shows genealogy empty states when there is no parent / no children', () => {
    renderDetail();
    fireEvent.click(screen.getByTestId('lp-detail-tab-genealogy'));
    expect(screen.getByTestId('lp-genealogy-no-parent')).toHaveTextContent(EN.genealogy.noParent);
    expect(screen.getByTestId('lp-genealogy-no-children')).toHaveTextContent(EN.genealogy.noChildren);
  });

  it('shows history + movements + reservations empty states', () => {
    renderDetail();
    fireEvent.click(screen.getByTestId('lp-detail-tab-history'));
    expect(screen.getByTestId('lp-tabpanel-history')).toHaveTextContent(EN.history.empty);
    fireEvent.click(screen.getByTestId('lp-detail-tab-movements'));
    expect(screen.getByTestId('lp-tabpanel-movements')).toHaveTextContent(EN.movements.empty);
    fireEvent.click(screen.getByTestId('lp-detail-tab-reservations'));
    expect(screen.getByTestId('lp-tabpanel-reservations')).toHaveTextContent(EN.reservations.empty);
  });

  it('renders a reservation row when the LP is reserved to a WO', () => {
    renderDetail({
      status: 'reserved',
      reservedQty: '50',
      availableQty: '70',
      reservedForWoId: 'wo-1',
      reservedForWoNumber: 'WO-2026-001',
    });
    fireEvent.click(screen.getByTestId('lp-detail-tab-reservations'));
    const row = screen.getByTestId('lp-reservation-row');
    expect(row).toHaveTextContent('WO-2026-001');
    expect(row).toHaveTextContent('50 kg');
  });

  it('red-lines label printing as deferred (disabled print affordance)', () => {
    renderDetail();
    fireEvent.click(screen.getByTestId('lp-detail-tab-labels'));
    expect(screen.getByTestId('lp-labels-deferred')).toHaveTextContent(EN.labels.deferred);
    expect(screen.getByTestId('lp-labels-print')).toBeDisabled();
  });

  it('renders header status + QA badges and UoM from data', () => {
    renderDetail({ status: 'available', qaStatus: 'PASSED', quantity: '120', uom: 'kg' });
    expect(screen.getByTestId('lp-detail-status')).toHaveTextContent(EN.statusLabel.available);
    expect(screen.getByTestId('lp-detail-qa')).toHaveTextContent('PASSED');
    expect(screen.getByTestId('lp-detail-subline')).toHaveTextContent('120 kg');
  });

  it('resolves every staged detail i18n key in en and pl (no leaked dotted keys)', () => {
    for (const locale of ['en', 'pl']) {
      const flat = JSON.stringify(buildLabels(locale));
      expect(flat).not.toMatch(/detail\.[a-z]/i);
    }
    expect(buildLabels('pl').tab.overview).not.toBe(EN.tab.overview);
  });
});

/**
 * REGRESSION — live crash on EVERY LP detail page (error digest 1984471676).
 *
 * The RSC page iterated LP_DEFERRED_ACTIONS imported from the 'use client'
 * module; in the React server module graph every export of a client module is a
 * client-reference proxy, so `for (const k of LP_DEFERRED_ACTIONS)` threw
 * `TypeError: ... LP_DEFERRED_ACTIONS is not iterable` and 500'd the success
 * path of every existing pallet (verified against Next 16.2.7). The vitest
 * runner does not apply the RSC transform, so these tests pin the *structure*
 * that makes the crash impossible:
 *   1. the runtime array lives in a server-safe module (no 'use client'),
 *   2. the page imports the VALUE only from that module (client imports are
 *      type-only / component-only),
 *   3. the client re-export stays identical so client consumers see one array.
 */
describe('LP detail RSC crash regression (digest 1984471676)', () => {
  const constantsPath = resolve(__dirname, '../lp-detail-constants.ts');
  const pagePath = resolve(__dirname, '../../page.tsx');

  it('keeps lp-detail-constants server-safe (no "use client") and a real iterable', () => {
    const src = readFileSync(constantsPath, 'utf8');
    // A directive is a standalone statement line — not the doc-comment mention.
    expect(src).not.toMatch(/^\s*['"]use client['"]\s*;?\s*$/m);

    // The exact shape buildLabels() relies on at runtime in the RSC.
    expect(Array.isArray(LP_DEFERRED_ACTIONS_SERVER_SAFE)).toBe(true);
    const collected: string[] = [];
    for (const k of LP_DEFERRED_ACTIONS_SERVER_SAFE) collected.push(k);
    expect(collected).toEqual(['split', 'merge', 'qa', 'reserve', 'move', 'block', 'destroy']);
  });

  it('client module re-exports the same array (single source of truth)', () => {
    expect(LP_DEFERRED_ACTIONS).toBe(LP_DEFERRED_ACTIONS_SERVER_SAFE);
  });

  it('page.tsx imports runtime values only from the server-safe module, types-only from the client module', () => {
    const src = readFileSync(pagePath, 'utf8');

    // The value import must target the constants module.
    expect(src).toMatch(/LP_DEFERRED_ACTIONS[\s\S]{0,200}from '\.\/_components\/lp-detail-constants'/);

    // Every import from the client module must be the component or `type ...`.
    const clientImport = src.match(/import\s*\{([^}]+)\}\s*from '\.\/_components\/lp-detail\.client'/);
    expect(clientImport).not.toBeNull();
    const specifiers = clientImport![1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const spec of specifiers) {
      expect(
        spec === 'LpDetailClient' || spec.startsWith('type '),
        `non-type value "${spec}" imported from the 'use client' module into the RSC page — this is the digest-1984471676 crash shape`,
      ).toBe(true);
    }
  });
});
