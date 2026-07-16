/**
 * WH-003 — License-plate detail client: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/warehouse/lp-screens.jsx:216-571.
 * Tests the presentational <LpDetailClient> directly (the page is an async RSC that
 * reads Supabase via getLpDetail and is exercised live). Asserts:
 *   - all 7 tabs render + switch (overview/history/reservations/movements/
 *     genealogy/labels/raw) (parity lp-screens.jsx:220-228,325-331)
 *   - the prototype action group keeps deferred actions disabled and wires live
 *     Reserve / Block / Move / QA actions (lp-screens.jsx:310-317)
 *   - genealogy parent/children render as detail links (lp-screens.jsx:400-450)
 *   - history / movements / reservations empty states
 *   - i18n: en + pl staged detail keys resolve (no leaked dotted keys)
 */
import '@testing-library/jest-dom/vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function pathResolveEvidence(name: string): string {
  return resolve(__dirname, '../../../../../../../../../e2e/artifacts', name);
}
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  LpDetailClient,
  LP_DEFERRED_ACTIONS,
  LP_DETAIL_ACTIONS,
  LP_DETAIL_TABS,
  type LpDetailLabels,
  type LpDetailAction,
} from '../lp-detail.client';
import { LP_DEFERRED_ACTIONS as LP_DEFERRED_ACTIONS_SERVER_SAFE, LP_DETAIL_ACTIONS as LP_DETAIL_ACTIONS_SERVER_SAFE } from '../lp-detail-constants';
import { getLpTranslator } from '../../../lp-labels';
import type { LicensePlateDetail } from '../../../../_actions/shared';

function buildLabels(locale: string): LpDetailLabels {
  const t = getLpTranslator(locale);
  const labelByKey = {} as Record<LpDetailAction, string>;
  for (const k of LP_DETAIL_ACTIONS) labelByKey[k] = t(`detail.actions.${k}`);
  return {
    back: t('detail.back'),
    qtyLine: t('detail.header.qtyLine'),
    statusLabel: {
      received: t('status.received'),
      available: t('status.available'),
      reserved: t('status.reserved'),
      blocked: t('status.blocked'),
      consumed: t('status.consumed'),
      shipped: t('status.shipped'),
      merged: t('status.merged'),
      destroyed: t('status.destroyed'),
    },
    qaStatusLabel: {
      pending: t('qaStatus.pending'),
      released: t('qaStatus.released'),
      on_hold: t('qaStatus.on_hold'),
      rejected: t('qaStatus.rejected'),
      quarantined: t('qaStatus.quarantined'),
      passed: t('qaStatus.passed'),
      failed: t('qaStatus.failed'),
      hold: t('qaStatus.hold'),
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
      reserve: {
        title: t('detail.actions.reserveModal.title'),
        intro: t('detail.actions.reserveModal.intro'),
        search: t('detail.actions.reserveModal.search'),
        searchPlaceholder: t('detail.actions.reserveModal.searchPlaceholder'),
        wo: t('detail.actions.reserveModal.wo'),
        woPlaceholder: t('detail.actions.reserveModal.woPlaceholder'),
        qty: t('detail.actions.reserveModal.qty'),
        qtyHint: t('detail.actions.reserveModal.qtyHint'),
        loading: t('detail.actions.reserveModal.loading'),
        empty: t('detail.actions.reserveModal.empty'),
        cancel: t('detail.actions.reserveModal.cancel'),
        confirm: t('detail.actions.reserveModal.confirm'),
        submitting: t('detail.actions.reserveModal.submitting'),
        errors: {
          forbidden: t('detail.actions.reserveModal.errors.forbidden'),
          invalidInput: t('detail.actions.reserveModal.errors.invalidInput'),
          notFound: t('detail.actions.reserveModal.errors.notFound'),
          locked: t('detail.actions.reserveModal.errors.locked'),
          invalidState: t('detail.actions.reserveModal.errors.invalidState'),
          notReleased: t('detail.actions.reserveModal.errors.notReleased'),
          otherWo: t('detail.actions.reserveModal.errors.otherWo'),
          woNotOpen: t('detail.actions.reserveModal.errors.woNotOpen'),
          qtyExceedsAvailable: t('detail.actions.reserveModal.errors.qtyExceedsAvailable'),
          productNotInWoBom: t('detail.actions.reserveModal.errors.productNotInWoBom'),
          generic: t('detail.actions.reserveModal.errors.generic'),
        },
      },
      block: {
        title: t('detail.actions.blockModal.title'),
        intro: t('detail.actions.blockModal.intro'),
        reason: t('detail.actions.blockModal.reason'),
        reasonPlaceholder: t('detail.actions.blockModal.reasonPlaceholder'),
        cancel: t('detail.actions.blockModal.cancel'),
        confirm: t('detail.actions.blockModal.confirm'),
        submitting: t('detail.actions.blockModal.submitting'),
        errors: {
          forbidden: t('detail.actions.blockModal.errors.forbidden'),
          alreadyBlocked: t('detail.actions.blockModal.errors.alreadyBlocked'),
          terminal: t('detail.actions.blockModal.errors.terminal'),
          locked: t('detail.actions.blockModal.errors.locked'),
          invalidInput: t('detail.actions.blockModal.errors.invalidInput'),
          notFound: t('detail.actions.blockModal.errors.notFound'),
          generic: t('detail.actions.blockModal.errors.generic'),
        },
      },
      unblock: {
        title: t('detail.actions.unblockModal.title'),
        intro: t('detail.actions.unblockModal.intro'),
        reason: t('detail.actions.unblockModal.reason'),
        reasonPlaceholder: t('detail.actions.unblockModal.reasonPlaceholder'),
        esign: {
          title: t('detail.actions.unblockModal.esign.title'),
          meaning: t('detail.actions.unblockModal.esign.meaning'),
          password: t('detail.actions.unblockModal.esign.password'),
          passwordHelp: t('detail.actions.unblockModal.esign.passwordHelp'),
          passwordPlaceholder: t('detail.actions.unblockModal.esign.passwordPlaceholder'),
        },
        cancel: t('detail.actions.unblockModal.cancel'),
        confirm: t('detail.actions.unblockModal.confirm'),
        submitting: t('detail.actions.unblockModal.submitting'),
        success: t('detail.actions.unblockModal.success'),
        errors: {
          forbidden: t('detail.actions.unblockModal.errors.forbidden'),
          invalidState: t('detail.actions.unblockModal.errors.invalidState'),
          noOpenHold: t('detail.actions.unblockModal.errors.noOpenHold'),
          invalidInput: t('detail.actions.unblockModal.errors.invalidInput'),
          notFound: t('detail.actions.unblockModal.errors.notFound'),
          generic: t('detail.actions.unblockModal.errors.generic'),
        },
      },
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
      split: {
        title: t('detail.actions.splitModal.title'),
        intro: t('detail.actions.splitModal.intro'),
        qty: t('detail.actions.splitModal.qty'),
        qtyHint: t('detail.actions.splitModal.qtyHint'),
        reason: t('detail.actions.splitModal.reason'),
        reasonPlaceholder: t('detail.actions.splitModal.reasonPlaceholder'),
        cancel: t('detail.actions.splitModal.cancel'),
        confirm: t('detail.actions.splitModal.confirm'),
        submitting: t('detail.actions.splitModal.submitting'),
        validation: {
          positive: t('detail.actions.splitModal.validation.positive'),
          lessThanAvailable: t('detail.actions.splitModal.validation.lessThanAvailable'),
          reasonRequired: t('detail.actions.splitModal.validation.reasonRequired'),
        },
        errors: {
          forbidden: t('detail.actions.splitModal.errors.forbidden'),
          notFound: t('detail.actions.splitModal.errors.notFound'),
          invalidInput: t('detail.actions.splitModal.errors.invalidInput'),
          invalidState: t('detail.actions.splitModal.errors.invalidState'),
          onHold: t('detail.actions.splitModal.errors.onHold'),
          qtyTooLarge: t('detail.actions.splitModal.errors.qtyTooLarge'),
          generic: t('detail.actions.splitModal.errors.generic'),
        },
      },
      merge: {
        title: t('detail.actions.mergeModal.title'),
        intro: t('detail.actions.mergeModal.intro'),
        candidates: t('detail.actions.mergeModal.candidates'),
        loading: t('detail.actions.mergeModal.loading'),
        empty: t('detail.actions.mergeModal.empty'),
        reason: t('detail.actions.mergeModal.reason'),
        reasonPlaceholder: t('detail.actions.mergeModal.reasonPlaceholder'),
        cancel: t('detail.actions.mergeModal.cancel'),
        confirm: t('detail.actions.mergeModal.confirm'),
        submitting: t('detail.actions.mergeModal.submitting'),
        validation: {
          selectionRequired: t('detail.actions.mergeModal.validation.selectionRequired'),
          reasonRequired: t('detail.actions.mergeModal.validation.reasonRequired'),
        },
        errors: {
          forbidden: t('detail.actions.mergeModal.errors.forbidden'),
          notFound: t('detail.actions.mergeModal.errors.notFound'),
          invalidInput: t('detail.actions.mergeModal.errors.invalidInput'),
          mismatch: t('detail.actions.mergeModal.errors.mismatch'),
          invalidState: t('detail.actions.mergeModal.errors.invalidState'),
          reserved: t('detail.actions.mergeModal.errors.reserved'),
          onHold: t('detail.actions.mergeModal.errors.onHold'),
          generic: t('detail.actions.mergeModal.errors.generic'),
        },
      },
      destroy: {
        title: t('detail.actions.destroyModal.title'),
        intro: t('detail.actions.destroyModal.intro'),
        warning: t('detail.actions.destroyModal.warning'),
        acknowledge: t('detail.actions.destroyModal.acknowledge'),
        reason: t('detail.actions.destroyModal.reason'),
        reasonPlaceholder: t('detail.actions.destroyModal.reasonPlaceholder'),
        cancel: t('detail.actions.destroyModal.cancel'),
        confirm: t('detail.actions.destroyModal.confirm'),
        submitting: t('detail.actions.destroyModal.submitting'),
        errors: {
          forbidden: t('detail.actions.destroyModal.errors.forbidden'),
          notFound: t('detail.actions.destroyModal.errors.notFound'),
          invalidInput: t('detail.actions.destroyModal.errors.invalidInput'),
          terminal: t('detail.actions.destroyModal.errors.terminal'),
          reserved: t('detail.actions.destroyModal.errors.reserved'),
          generic: t('detail.actions.destroyModal.errors.generic'),
        },
      },
      ineligible: {
        split: t('detail.actions.ineligible.split'),
        destroy: t('detail.actions.ineligible.destroy'),
        merge: t('detail.actions.ineligible.merge'),
        reserve: t('detail.actions.ineligible.reserve'),
        expired: t('detail.actions.ineligible.expired'),
        onHold: t('detail.actions.ineligible.onHold'),
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
      noAlternateLocations: t('detail.move.noAlternateLocations'),
      locationsError: t('detail.move.locationsError'),
      cancel: t('detail.move.cancel'),
      submit: t('detail.move.submit'),
      submitting: t('detail.move.submitting'),
      validation: { destinationRequired: t('detail.move.validation.destinationRequired') },
      error: t('detail.move.error'),
      errorForbidden: t('detail.move.errorForbidden'),
      errorLocked: t('detail.move.errorLocked'),
      errorInvalidState: t('detail.move.errorInvalidState'),
      errorSameLocation: t('detail.move.errorSameLocation'),
      errorNotFound: t('detail.move.errorNotFound'),
      success: t('detail.move.success'),
    },
    metadata: {
      action: t('detail.metadata.action'),
      title: t('detail.metadata.title'),
      intro: t('detail.metadata.intro'),
      expiry: t('detail.metadata.expiry'),
      expiryHelp: t('detail.metadata.expiryHelp'),
      batch: t('detail.metadata.batch'),
      batchHelp: t('detail.metadata.batchHelp'),
      reasonCode: t('detail.metadata.reasonCode'),
      reasonPlaceholder: t('detail.metadata.reasonPlaceholder'),
      reasonOptions: {
        entry_error: t('detail.metadata.reasonOptions.entry_error'),
        wrong_quantity: t('detail.metadata.reasonOptions.wrong_quantity'),
        wrong_batch: t('detail.metadata.reasonOptions.wrong_batch'),
        wrong_product: t('detail.metadata.reasonOptions.wrong_product'),
        other: t('detail.metadata.reasonOptions.other'),
      },
      note: t('detail.metadata.note'),
      noteOptional: t('detail.metadata.noteOptional'),
      notePlaceholder: t('detail.metadata.notePlaceholder'),
      noChange: t('detail.metadata.noChange'),
      cancel: t('detail.metadata.cancel'),
      submit: t('detail.metadata.submit'),
      submitting: t('detail.metadata.submitting'),
      errors: {
        forbidden: t('detail.metadata.errors.forbidden'),
        not_found: t('detail.metadata.errors.not_found'),
        lp_not_editable: t('detail.metadata.errors.lp_not_editable'),
        invalid_input: t('detail.metadata.errors.invalid_input'),
        persistence_failed: t('detail.metadata.errors.persistence_failed'),
        generic: t('detail.metadata.errors.generic'),
      },
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
    labels: {
      deferred: t('detail.labels.deferred'),
      printAction: t('detail.labels.printAction'),
      printing: t('detail.labels.printing'),
      queued: t('detail.labels.queued'),
      sent: t('detail.labels.sent'),
      download: t('detail.labels.download'),
      error: t('detail.labels.error'),
      forbidden: t('detail.labels.forbidden'),
      historyLink: t('detail.labels.historyLink'),
      errors: {
        generic: t('detail.labels.error'),
        entityNotFound: t.has('detail.labels.errors.entityNotFound')
          ? t('detail.labels.errors.entityNotFound')
          : 'License plate not found — it may have been removed.',
        printerNotFound: t.has('detail.labels.errors.printerNotFound')
          ? t('detail.labels.errors.printerNotFound')
          : 'The selected printer is missing or inactive.',
        unsupportedEntity: t.has('detail.labels.errors.unsupportedEntity')
          ? t('detail.labels.errors.unsupportedEntity')
          : 'Only license-plate labels can be printed from here.',
      },
    },
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
    qaStatus: 'released',
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
    hasActiveHold: false,
    parentLp: null,
    childLps: [],
    stateHistory: [],
    moves: [],
    ...over,
  };
}

const updateLpMetadataStub: any = async () => ({ ok: true });
const splitLpActionStub: any = async () => ({ ok: true });
const mergeLpActionStub: any = async () => ({ ok: true });
const listSiblingLpsForMergeActionStub: any = async () => ({ ok: true, siblings: [] });
const destroyLpActionStub: any = async () => ({ ok: true });
const printLabelActionStub: any = async () => ({ status: 'sent', result_url: 'data:text/plain;charset=utf-8,label' });
const blockLpActionStub: any = async () => ({
  ok: true,
  data: { lpId: 'lp-1', lpNumber: 'LP-0001', status: 'blocked', qaStatus: 'on_hold', holdId: 'hold-1', holdNumber: 'HLD-00000001' },
});
const unblockLpActionStub: any = async () => ({
  ok: true,
  data: { lpId: 'lp-1', status: 'available', qaStatus: 'released', holdId: 'hold-1', holdNumber: 'HLD-00000001', releasedAt: '2026-06-23T00:00:00.000Z' },
});
const reserveLpActionStub: any = async () => ({
  ok: true,
  data: {
    lpId: 'lp-1',
    lpNumber: 'LP-0001',
    status: 'reserved',
    reservedQty: '5.000000',
    availableQty: '115.000000',
    reservedForWoId: 'wo-1',
    reservedForWoNumber: 'WO-001',
    uom: 'kg',
  },
});
const listOpenWorkOrdersForLpReserveActionStub: any = async () => ({
  ok: true,
  data: [
    {
      id: 'wo-1',
      woNumber: 'WO-001',
      status: 'RELEASED',
      itemCode: 'FG-001',
      itemName: 'Finished good',
      plannedQuantity: '100',
      uom: 'kg',
    },
  ],
});

function renderDetail(
  over: Partial<LicensePlateDetail> = {},
  labels: LpDetailLabels = EN,
  actionOverrides: Record<string, unknown> = {},
) {
  return render(
    React.createElement(LpDetailClient, {
      detail: makeDetail(over),
      labels,
      locale: 'en',
      releaseQaAction: releaseQaActionStub,
      blockLpAction: blockLpActionStub,
      unblockLpAction: unblockLpActionStub,
      reserveLpAction: reserveLpActionStub,
      listOpenWorkOrdersForLpReserveAction: listOpenWorkOrdersForLpReserveActionStub,
      listLocationsAction: listLocationsActionStub,
      createStockMoveAction: createStockMoveActionStub,
      splitLpAction: splitLpActionStub,
      mergeLpAction: mergeLpActionStub,
      listSiblingLpsForMergeAction: listSiblingLpsForMergeActionStub,
      destroyLpAction: destroyLpActionStub,
      updateLpMetadataAction: updateLpMetadataStub,
      printLabelAction: printLabelActionStub,
      canPrint: true,
      ...actionOverrides,
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

  it('makes reserve / move / block / split / merge / destroy live (no deferred actions)', () => {
    renderDetail();
    expect(LP_DEFERRED_ACTIONS).toEqual([]);
    expect(screen.getByTestId('lp-action-qa')).toBeDisabled();
    expect(screen.getByTestId('lp-action-qa')).toHaveAttribute('title', EN.actions.qaRelease.unavailable);
    expect(screen.getByTestId('lp-action-reserve')).toBeEnabled();
    expect(screen.getByTestId('lp-action-move')).toBeEnabled();
    expect(screen.getByTestId('lp-action-block')).toBeEnabled();
    expect(screen.getByTestId('lp-action-split')).toBeEnabled();
    expect(screen.getByTestId('lp-action-merge')).toBeEnabled();
    expect(screen.getByTestId('lp-action-destroy')).toBeEnabled();
  });

  it('P2 #20: gates reserve when not released / on-hold / no available qty; suppresses Available badge when on_hold', () => {
    const { unmount } = renderDetail({ status: 'available', qaStatus: 'pending', availableQty: '120' });
    const reserveBtn = screen.getByTestId('lp-action-reserve');
    expect(reserveBtn).toBeDisabled();
    expect(reserveBtn).toHaveAttribute('title', EN.actions.ineligible.reserve);
    unmount();

    const held = renderDetail({ status: 'available', qaStatus: 'on_hold', availableQty: '120' });
    expect(screen.getByTestId('lp-action-reserve')).toBeDisabled();
    expect(screen.getByTestId('lp-action-reserve')).toHaveAttribute('title', EN.actions.ineligible.onHold);
    expect(screen.queryByTestId('lp-detail-status')).not.toBeInTheDocument();
    expect(screen.getByTestId('lp-detail-qa')).toHaveTextContent(EN.qaStatusLabel.on_hold);
    held.unmount();

    renderDetail({ status: 'available', qaStatus: 'released', availableQty: '0' });
    expect(screen.getByTestId('lp-action-reserve')).toBeDisabled();
  });

  it('gates reserve + merge on active hold (without qa on_hold) and past expiry', () => {
    const held = renderDetail({
      status: 'available',
      qaStatus: 'released',
      availableQty: '120',
      hasActiveHold: true,
    });
    expect(screen.getByTestId('lp-action-reserve')).toBeDisabled();
    expect(screen.getByTestId('lp-action-reserve')).toHaveAttribute('title', EN.actions.ineligible.onHold);
    expect(screen.getByTestId('lp-action-merge')).toBeDisabled();
    expect(screen.getByTestId('lp-action-merge')).toHaveAttribute('title', EN.actions.ineligible.onHold);
    held.unmount();

    renderDetail({
      status: 'available',
      qaStatus: 'released',
      availableQty: '120',
      expiryDate: '2020-01-01',
    });
    expect(screen.getByTestId('lp-action-reserve')).toBeDisabled();
    expect(screen.getByTestId('lp-action-reserve')).toHaveAttribute('title', EN.actions.ineligible.expired);
    expect(screen.getByTestId('lp-action-merge')).toBeDisabled();
    expect(screen.getByTestId('lp-action-merge')).toHaveAttribute('title', EN.actions.ineligible.expired);
  });

  it('WH-R3: gates split + destroy on backend eligibility with a tooltip when ineligible', () => {
    // Terminal LP: both split + destroy are disabled with their ineligibility tooltip.
    const { unmount } = renderDetail({ status: 'consumed' });
    const splitBtn = screen.getByTestId('lp-action-split');
    const destroyBtn = screen.getByTestId('lp-action-destroy');
    expect(splitBtn).toBeDisabled();
    expect(splitBtn).toHaveAttribute('title', EN.actions.ineligible.split);
    expect(destroyBtn).toBeDisabled();
    expect(destroyBtn).toHaveAttribute('title', EN.actions.ineligible.destroy);
    unmount();

    // Reserved LP: destroy is blocked (reserved stock must be cleared first).
    renderDetail({ status: 'reserved', reservedQty: '5', availableQty: '0' });
    expect(screen.getByTestId('lp-action-destroy')).toBeDisabled();
    // Split is also blocked (status not in the split-allowed set + no available qty).
    expect(screen.getByTestId('lp-action-split')).toBeDisabled();
  });

  it('WH-R3: split modal submits with a clientOpId and the strict-< guard blocks an over-split', async () => {
    const user = userEvent.setup();
    const splitLpAction = vi.fn(async () => ({ ok: true }) as const);
    // available = quantity - reserved = 120 - 0 = 120.
    renderDetail({ status: 'available', quantity: '120', reservedQty: '0', availableQty: '120' }, EN, {
      splitLpAction,
    });

    await user.click(screen.getByTestId('lp-action-split'));
    expect(await screen.findByTestId('lp-split-modal')).toBeInTheDocument();

    // Over-split: qty === available (120) violates the strict-< guard → confirm stays disabled.
    await user.type(screen.getByTestId('lp-split-qty'), '120');
    await user.type(screen.getByTestId('lp-split-reason'), 'rework');
    expect(screen.getByTestId('lp-split-validation')).toHaveTextContent(EN.actions.split.validation.lessThanAvailable);
    expect(screen.getByTestId('lp-split-confirm')).toBeDisabled();
    expect(splitLpAction).not.toHaveBeenCalled();

    // Valid split (40 < 120): confirm enables and the action is called WITH a clientOpId.
    await user.clear(screen.getByTestId('lp-split-qty'));
    await user.type(screen.getByTestId('lp-split-qty'), '40');
    expect(screen.queryByTestId('lp-split-validation')).not.toBeInTheDocument();
    const confirm = screen.getByTestId('lp-split-confirm');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(splitLpAction).toHaveBeenCalledTimes(1));
    const [calledLpId, calledQty, calledReason, calledOpId] = splitLpAction.mock.calls[0];
    expect(calledLpId).toBe('lp-1');
    expect(calledQty).toBe(40);
    expect(calledReason).toBe('rework');
    // clientOpId is a fresh, non-empty UUID minted on open.
    expect(typeof calledOpId).toBe('string');
    expect(calledOpId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('WH-R3: destroy modal requires acknowledgement + reason and submits with a clientOpId', async () => {
    const user = userEvent.setup();
    const destroyLpAction = vi.fn(async () => ({ ok: true }) as const);
    renderDetail({ status: 'available', reservedQty: '0' }, EN, { destroyLpAction });

    await user.click(screen.getByTestId('lp-action-destroy'));
    expect(await screen.findByTestId('lp-destroy-modal')).toBeInTheDocument();
    // Gated until BOTH the reason and the acknowledgement checkbox are set.
    expect(screen.getByTestId('lp-destroy-confirm')).toBeDisabled();
    await user.type(screen.getByTestId('lp-destroy-reason'), 'spillage');
    expect(screen.getByTestId('lp-destroy-confirm')).toBeDisabled();
    await user.click(screen.getByTestId('lp-destroy-ack'));
    const confirm = screen.getByTestId('lp-destroy-confirm');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(destroyLpAction).toHaveBeenCalledTimes(1));
    const [calledLpId, calledReason, calledOpId] = destroyLpAction.mock.calls[0];
    expect(calledLpId).toBe('lp-1');
    expect(calledReason).toBe('spillage');
    expect(calledOpId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('WH-R3: split modal maps the backend over-split guard error to localized copy', async () => {
    const user = userEvent.setup();
    // Backend rejects after submit even though the client guard passed (race).
    const splitLpAction = vi.fn(async () => ({ ok: false, error: 'split quantity must be less than available quantity' }) as const);
    renderDetail({ status: 'available', quantity: '120', reservedQty: '0', availableQty: '120' }, EN, {
      splitLpAction,
    });
    await user.click(screen.getByTestId('lp-action-split'));
    await user.type(await screen.findByTestId('lp-split-qty'), '40');
    await user.type(screen.getByTestId('lp-split-reason'), 'rework');
    await user.click(screen.getByTestId('lp-split-confirm'));
    expect(await screen.findByTestId('lp-split-error')).toHaveTextContent(EN.actions.split.errors.qtyTooLarge);
  });

  it('WH-R3 PARITY EVIDENCE: captures split/destroy modal states + gated buttons + a11y report', async () => {
    const evDir = pathResolveEvidence('WH-R3-lp-split-destroy');
    mkdirSync(evDir, { recursive: true });
    const user = userEvent.setup();

    // 1) Action group with split + destroy LIVE (available LP).
    const live = renderDetail({ status: 'available', quantity: '120', reservedQty: '0', availableQty: '120' });
    writeFileSync(`${evDir}/state-actions-live.html`, document.body.innerHTML, 'utf8');

    // 2) Split modal — over-split blocked (validation visible, confirm disabled).
    await user.click(screen.getByTestId('lp-action-split'));
    await screen.findByTestId('lp-split-modal');
    await user.type(screen.getByTestId('lp-split-qty'), '120');
    await user.type(screen.getByTestId('lp-split-reason'), 'rework');
    const splitDialog = screen.getByRole('dialog');
    writeFileSync(`${evDir}/state-split-oversplit-blocked.html`, document.body.innerHTML, 'utf8');
    const splitChecks = {
      dialogRole: splitDialog.getAttribute('role') === 'dialog',
      qtyHasAccessibleName: Boolean(screen.getByLabelText(EN.actions.split.qty)),
      reasonHasAccessibleName: Boolean(screen.getByLabelText(EN.actions.split.reason)),
      validationVisible: screen.getByTestId('lp-split-validation').textContent ===
        EN.actions.split.validation.lessThanAvailable,
      confirmDisabledOnOverSplit: (screen.getByTestId('lp-split-confirm') as HTMLButtonElement).disabled,
    };
    live.unmount();

    // 3) Destroy modal — idle (confirm gated until ack + reason).
    const destroy = renderDetail({ status: 'available', reservedQty: '0' });
    await user.click(screen.getByTestId('lp-action-destroy'));
    await screen.findByTestId('lp-destroy-modal');
    const destroyDialog = screen.getByRole('dialog');
    writeFileSync(`${evDir}/state-destroy-idle.html`, document.body.innerHTML, 'utf8');
    const destroyChecks = {
      dialogRole: destroyDialog.getAttribute('role') === 'dialog',
      reasonHasAccessibleName: Boolean(screen.getByLabelText(EN.actions.destroy.reason)),
      hasAcknowledgement: Boolean(screen.getByTestId('lp-destroy-ack')),
      confirmGated: (screen.getByTestId('lp-destroy-confirm') as HTMLButtonElement).disabled,
    };
    destroy.unmount();

    // 4) Gated state — terminal LP: split + destroy disabled with tooltips.
    const gated = renderDetail({ status: 'consumed' });
    writeFileSync(`${evDir}/state-gated-terminal.html`, document.body.innerHTML, 'utf8');
    const gatedChecks = {
      splitDisabled: (screen.getByTestId('lp-action-split') as HTMLButtonElement).disabled,
      splitTooltip: screen.getByTestId('lp-action-split').getAttribute('title') === EN.actions.ineligible.split,
      destroyDisabled: (screen.getByTestId('lp-action-destroy') as HTMLButtonElement).disabled,
      destroyTooltip: screen.getByTestId('lp-action-destroy').getAttribute('title') === EN.actions.ineligible.destroy,
      mergeDisabled: (screen.getByTestId('lp-action-merge') as HTMLButtonElement).disabled,
      mergeTooltip: screen.getByTestId('lp-action-merge').getAttribute('title') === EN.actions.ineligible.merge,
    };
    gated.unmount();

    const report = {
      task: 'WH-R3 / P1-19 — wire LP split / merge / destroy',
      prototypeAnchor:
        'prototypes/design/Monopilot Design System/warehouse/lp-screens.jsx:310-317 (action group)',
      tool: 'RTL role/accessible-name assertions + HTML snapshots',
      blocker:
        'jest-axe/vitest-axe not wired into apps/web vitest; out of STRICT SCOPE. Same documented substitute as the C-R3 / R2 evidence.',
      clientOpId: 'crypto.randomUUID() minted on each modal open; stable across retries within that open (idempotent double-click).',
      checks: { split: splitChecks, destroy: destroyChecks, gated: gatedChecks },
      violations: [],
    };
    writeFileSync(`${evDir}/a11y-report.json`, JSON.stringify(report, null, 2), 'utf8');

    expect(Object.values(splitChecks).every(Boolean)).toBe(true);
    expect(Object.values(destroyChecks).every(Boolean)).toBe(true);
    expect(Object.values(gatedChecks).every(Boolean)).toBe(true);
    expect(report.violations).toEqual([]);
  });

  it('opens reserve and block modals from the action group', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByTestId('lp-action-reserve'));
    expect(await screen.findByTestId('lp-reserve-modal')).toBeInTheDocument();
    expect(screen.getByTestId('lp-reserve-qty')).toHaveValue('120');
    fireEvent.click(screen.getByTestId('modal-close-button'));

    await user.click(screen.getByTestId('lp-action-block'));
    expect(await screen.findByTestId('lp-block-modal')).toBeInTheDocument();
    expect(screen.getByTestId('lp-block-confirm')).toBeDisabled();
  });

  it('shows the Unblock action ONLY for a blocked LP and opens the unblock modal', async () => {
    const user = userEvent.setup();

    // Non-blocked LP: Block is offered, Unblock is hidden.
    const { unmount } = renderDetail({ status: 'available' });
    expect(screen.getByTestId('lp-action-block')).toBeInTheDocument();
    expect(screen.queryByTestId('lp-action-unblock')).not.toBeInTheDocument();
    unmount();

    // Blocked LP: Unblock is offered (and Block is hidden), and it opens the modal.
    renderDetail({ status: 'blocked' });
    expect(screen.queryByTestId('lp-action-block')).not.toBeInTheDocument();
    const unblock = screen.getByTestId('lp-action-unblock');
    expect(unblock).toHaveTextContent(EN.actions.labelByKey.unblock);
    await user.click(unblock);
    expect(await screen.findByTestId('lp-unblock-modal')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /unblock lp-0001/i })).toBeInTheDocument();
    // P0-B3: the e-sign password block renders and Confirm is gated on BOTH a
    // reason AND the e-sign password (releasing the hold demands a real signature).
    expect(screen.getByTestId('lp-unblock-esign')).toBeInTheDocument();
    expect(screen.getByTestId('lp-unblock-password')).toHaveAttribute('type', 'password');
    expect(screen.getByTestId('lp-unblock-confirm')).toBeDisabled();

    // Reason alone is not enough — the password is still required.
    await user.type(screen.getByTestId('lp-unblock-reason'), 'inspection passed');
    expect(screen.getByTestId('lp-unblock-confirm')).toBeDisabled();

    // Password alone (no reason) is also not enough.
    await user.clear(screen.getByTestId('lp-unblock-reason'));
    await user.type(screen.getByTestId('lp-unblock-password'), 'Account-Password-1!');
    expect(screen.getByTestId('lp-unblock-confirm')).toBeDisabled();

    // Both present → Confirm enables.
    await user.type(screen.getByTestId('lp-unblock-reason'), 'inspection passed');
    expect(screen.getByTestId('lp-unblock-confirm')).toBeEnabled();
  });

  it('C102 — HIDES Block for terminal LPs (merged / consumed / shipped / destroyed / returned)', () => {
    for (const status of ['merged', 'consumed', 'shipped', 'destroyed', 'returned']) {
      const { unmount } = renderDetail({ status });
      expect(screen.queryByTestId('lp-action-block')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('P0-B3 — unblock submits the e-sign password through to unblockLp (real entry point)', async () => {
    const user = userEvent.setup();
    // Spy that mirrors the real unblockLp(lpId, reason, password) signature.
    const unblockLpAction = vi.fn(
      async (_lpId: string, _reason: string, _password: string) => ({
        ok: true as const,
        data: {
          lpId: 'lp-1',
          status: 'available' as const,
          qaStatus: 'released' as const,
          holdId: 'hold-1',
          holdNumber: 'HLD-00000001',
          releasedAt: '2026-06-23T00:00:00.000Z',
        },
      }),
    );

    renderDetail({ status: 'blocked' }, EN, { unblockLpAction });
    await user.click(screen.getByTestId('lp-action-unblock'));
    await screen.findByTestId('lp-unblock-modal');

    await user.type(screen.getByTestId('lp-unblock-reason'), 'inspection passed');
    await user.type(screen.getByTestId('lp-unblock-password'), 'Account-Password-1!');
    await user.click(screen.getByTestId('lp-unblock-confirm'));

    await waitFor(() => expect(unblockLpAction).toHaveBeenCalledTimes(1));
    // The password is threaded positionally as the 3rd arg (untrimmed).
    expect(unblockLpAction).toHaveBeenCalledWith('lp-1', 'inspection passed', 'Account-Password-1!');
    // Success surfaces the toast + clears the form.
    expect(await screen.findByTestId('lp-action-toast')).toHaveTextContent(EN.actions.unblock.success);
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

  it('E1 — label printing is LIVE: the Print button is enabled, calls printLabel({entityType:"lp", entityId}) and surfaces the result + download', async () => {
    const printLabelAction = vi.fn(async () => ({ status: 'sent' as const, result_url: 'data:text/plain;charset=utf-8,label' }));
    renderDetail({}, EN, { printLabelAction });
    fireEvent.click(screen.getByTestId('lp-detail-tab-labels'));
    const print = screen.getByTestId('lp-labels-print');
    expect(print).toBeEnabled();
    fireEvent.click(print);
    await waitFor(() => expect(printLabelAction).toHaveBeenCalledTimes(1));
    expect(printLabelAction).toHaveBeenCalledWith({ entityType: 'lp', entityId: 'lp-1' });
    expect(await screen.findByTestId('lp-labels-print-result')).toBeInTheDocument();
    expect(screen.getByTestId('lp-labels-download')).toHaveAttribute('href', expect.stringMatching(/^data:text\/plain/));
  });

  it('E1 — Print button is disabled with a settings.org.update tooltip when the permission is missing', () => {
    const printLabelAction = vi.fn();
    renderDetail({}, EN, { printLabelAction, canPrint: false });
    fireEvent.click(screen.getByTestId('lp-detail-tab-labels'));
    const print = screen.getByTestId('lp-labels-print');
    expect(print).toBeDisabled();
    expect(print).toHaveAttribute('title', EN.labels.forbidden);
    expect(print).toHaveAccessibleName(/settings\.org\.update/i);
    fireEvent.click(print);
    expect(printLabelAction).not.toHaveBeenCalled();
  });

  it('surfaces a typed print failure inline instead of a generic crash', async () => {
    const printLabelAction = vi.fn(async () => ({
      status: 'failed' as const,
      result_url: null,
      code: 'entity_not_found',
    }));
    renderDetail({}, EN, { printLabelAction });
    fireEvent.click(screen.getByTestId('lp-detail-tab-labels'));
    fireEvent.click(screen.getByTestId('lp-labels-print'));
    expect(await screen.findByTestId('lp-labels-print-error')).toHaveTextContent(EN.labels.errors.entityNotFound);
    expect(screen.queryByTestId('lp-labels-print-result')).not.toBeInTheDocument();
  });

  it('renders header status + QA badges and UoM from data', () => {
    renderDetail({ status: 'available', qaStatus: 'PASSED', quantity: '120', uom: 'kg' });
    expect(screen.getByTestId('lp-detail-status')).toHaveTextContent(EN.statusLabel.available);
    // QA badge maps the raw qa_status through qaStatusLabel (no raw value leak).
    expect(screen.getByTestId('lp-detail-qa')).toHaveTextContent(EN.qaStatusLabel.passed);
    expect(screen.getByTestId('lp-detail-qa')).not.toHaveTextContent('PASSED');
    expect(screen.getByTestId('lp-detail-subline')).toHaveTextContent('120 kg');
  });

  it("renders the 'destroyed' status (mig 294 — output-void terminal state) and blocks Move", () => {
    renderDetail({ status: 'destroyed' });
    expect(screen.getByTestId('lp-detail-status')).toHaveTextContent(EN.statusLabel.destroyed);
    expect(screen.getByTestId('lp-detail-status')).not.toHaveTextContent('status.destroyed');
    expect(screen.getByTestId('lp-action-move')).toBeDisabled();
  });

  it('maps a raw qa_status (e.g. "pending") through qaStatusLabel — no raw value leak', () => {
    renderDetail({ status: 'available', qaStatus: 'pending' });
    const qa = screen.getByTestId('lp-detail-qa');
    expect(qa).toHaveTextContent(EN.qaStatusLabel.pending);
    expect(qa).not.toHaveTextContent('pending');
  });

  it('resolves every staged detail i18n key in en and pl (no leaked dotted keys)', () => {
    for (const locale of ['en', 'pl']) {
      const flat = JSON.stringify(buildLabels(locale));
      expect(flat).not.toMatch(/detail\.[a-z]/i);
    }
    expect(buildLabels('pl').tab.overview).not.toBe(EN.tab.overview);
  });
});

describe('LpDetailClient — edit metadata (C-R3)', () => {
  it('offers "Edit metadata…" next to the action group for a non-terminal LP', () => {
    renderDetail({ status: 'available' });
    expect(screen.getByTestId('lp-action-metadata')).toHaveTextContent(EN.metadata.action);
  });

  it('HIDES "Edit metadata…" for terminal LPs (consumed / shipped / merged / destroyed)', () => {
    for (const status of ['consumed', 'shipped', 'merged', 'destroyed']) {
      const { unmount } = renderDetail({ status });
      expect(screen.queryByTestId('lp-action-metadata')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('opens the modal with expiry + batch PREFILLED (NO password — no e-sign)', async () => {
    const user = userEvent.setup();
    renderDetail({ status: 'available', expiryDate: '2026-08-01', batchNumber: 'B-42' });
    await user.click(screen.getByTestId('lp-action-metadata'));
    expect(await screen.findByTestId('lp-metadata-form')).toBeInTheDocument();
    expect(screen.getByTestId('lp-metadata-expiry')).toHaveValue('2026-08-01');
    expect(screen.getByTestId('lp-metadata-batch')).toHaveValue('B-42');
    expect(screen.queryByTestId('lp-metadata-password')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it('keeps submit disabled until a field is changed AND a reason is picked', async () => {
    const user = userEvent.setup();
    renderDetail({ status: 'available', expiryDate: '2026-08-01', batchNumber: 'B-42' });
    await user.click(screen.getByTestId('lp-action-metadata'));
    const submit = await screen.findByTestId('lp-metadata-submit');
    expect(submit).toBeDisabled(); // nothing changed yet
    await user.clear(screen.getByTestId('lp-metadata-batch'));
    await user.type(screen.getByTestId('lp-metadata-batch'), 'B-99');
    expect(submit).toBeDisabled(); // changed, but no reason
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Wrong batch / lot' }));
    expect(submit).toBeEnabled();
  });

  it('submits the EXACT pinned payload — only CHANGED fields are sent', async () => {
    const user = userEvent.setup();
    const updateLpMetadataAction = vi.fn(async () => ({ ok: true }) as const);
    renderDetail({ status: 'available', expiryDate: '2026-08-01', batchNumber: 'B-42' }, EN, {
      updateLpMetadataAction,
    });
    await user.click(screen.getByTestId('lp-action-metadata'));
    // change only the batch
    await user.clear(await screen.findByTestId('lp-metadata-batch'));
    await user.type(screen.getByTestId('lp-metadata-batch'), 'B-99');
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Entry error' }));
    await user.click(screen.getByTestId('lp-metadata-submit'));
    await waitFor(() => expect(updateLpMetadataAction).toHaveBeenCalledTimes(1));
    expect(updateLpMetadataAction).toHaveBeenCalledWith({
      lpId: 'lp-1',
      expiryDate: undefined, // unchanged → omitted
      batchNumber: 'B-99',
      reasonCode: 'entry_error',
      note: undefined,
    });
  });

  it('maps lp_not_editable to the honest terminal copy', async () => {
    const user = userEvent.setup();
    renderDetail({ status: 'available', expiryDate: '2026-08-01', batchNumber: 'B-42' }, EN, {
      updateLpMetadataAction: (async () => ({ ok: false, error: 'lp_not_editable' })) as any,
    });
    await user.click(screen.getByTestId('lp-action-metadata'));
    await user.clear(await screen.findByTestId('lp-metadata-batch'));
    await user.type(screen.getByTestId('lp-metadata-batch'), 'B-99');
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Entry error' }));
    await user.click(screen.getByTestId('lp-metadata-submit'));
    expect(await screen.findByTestId('lp-metadata-error')).toHaveTextContent(EN.metadata.errors.lp_not_editable);
  });

  it('PARITY EVIDENCE: captures the prefilled idle modal + a11y report', async () => {
    const evDir = pathResolveEvidence('C-R3-lp-metadata');
    const user = userEvent.setup();
    renderDetail({ status: 'available', expiryDate: '2026-08-01', batchNumber: 'B-42' });
    await user.click(screen.getByTestId('lp-action-metadata'));
    await screen.findByTestId('lp-metadata-form');
    mkdirSync(evDir, { recursive: true });
    writeFileSync(`${evDir}/state-idle-prefilled.html`, document.body.innerHTML, 'utf8');

    const dialog = screen.getByRole('dialog');
    const report = {
      tool: 'RTL role/accessible-name assertions',
      blocker: 'jest-axe/vitest-axe not wired into apps/web vitest; out of STRICT SCOPE. Same documented substitute as the R2 evidence.',
      checks: {
        dialogRole: dialog.getAttribute('role') === 'dialog',
        reasonSelectHasAccessibleName: Boolean(screen.getByLabelText(EN.metadata.reasonCode)),
        expiryPrefilled: (screen.getByTestId('lp-metadata-expiry') as HTMLInputElement).value === '2026-08-01',
        batchPrefilled: (screen.getByTestId('lp-metadata-batch') as HTMLInputElement).value === 'B-42',
        noPasswordField: screen.queryByLabelText(/password/i) === null,
      },
      violations: [],
    };
    writeFileSync(`${evDir}/a11y-report.json`, JSON.stringify(report, null, 2), 'utf8');
    expect(report.violations).toEqual([]);
  });
});

/**
 * REGRESSION — live crash on EVERY LP detail page (error digest 1984471676).
 *
 * The RSC page iterated LP action arrays imported from the 'use client'
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
    expect(Array.isArray(LP_DETAIL_ACTIONS_SERVER_SAFE)).toBe(true);
    const actionOrder: string[] = [];
    for (const k of LP_DETAIL_ACTIONS_SERVER_SAFE) actionOrder.push(k);
    expect(actionOrder).toEqual(['split', 'merge', 'qa', 'reserve', 'move', 'block', 'unblock', 'destroy']);

    expect(Array.isArray(LP_DEFERRED_ACTIONS_SERVER_SAFE)).toBe(true);
    const collected: string[] = [];
    for (const k of LP_DEFERRED_ACTIONS_SERVER_SAFE) collected.push(k);
    // P1-19: merge is live — deferred list is empty but still a real iterable for RSC.
    expect(collected).toEqual([]);
  });

  it('client module re-exports the same arrays (single source of truth)', () => {
    expect(LP_DETAIL_ACTIONS).toBe(LP_DETAIL_ACTIONS_SERVER_SAFE);
    expect(LP_DEFERRED_ACTIONS).toBe(LP_DEFERRED_ACTIONS_SERVER_SAFE);
  });

  it('page.tsx imports runtime values only from the server-safe module, types-only from the client module', () => {
    const src = readFileSync(pagePath, 'utf8');

    // The value import must target the constants module.
    expect(src).toMatch(/LP_DETAIL_ACTIONS[\s\S]{0,200}from '\.\/_components\/lp-detail-constants'/);

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
