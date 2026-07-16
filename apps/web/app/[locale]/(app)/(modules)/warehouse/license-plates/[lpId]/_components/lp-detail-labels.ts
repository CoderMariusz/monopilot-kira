/**
 * WH-003 / C085 — server-safe LP detail label bundle.
 *
 * Resolved on the RSC page via getLpTranslator; client islands receive plain
 * strings only (never the translator function — React #418 / t-to-client guard).
 */
import { getLpTranslator } from '../../lp-labels';
import { LP_DETAIL_ACTIONS, type LpDetailAction } from './lp-detail-constants';
import type { LpBlockModalLabels } from './lp-block-modal.client';
import type { LpDestroyModalLabels } from './lp-destroy-modal.client';
import type { LpSplitModalLabels } from './lp-split-modal.client';
import type { LpMergeModalLabels } from './lp-merge-modal.client';
import type { LpMoveLabels } from './lp-move-modal.client';
import type { LpMetadataEditLabels } from './lp-metadata-edit-modal.client';
import type { LpReserveModalLabels } from './lp-reserve-modal.client';

type LpDetailTab =
  | 'overview'
  | 'history'
  | 'reservations'
  | 'movements'
  | 'genealogy'
  | 'labels'
  | 'raw';

export type LpDetailLabels = {
  back: string;
  qtyLine: string;
  statusLabel: Record<string, string>;
  /** QA-status display dict (pending / released / on_hold / …) — keyed by the raw
   *  lowercase qa_status so the badge never leaks an untranslated DB value. */
  qaStatusLabel: Record<string, string>;
  identity: {
    title: string;
    product: string;
    itemType: string;
    quantity: string;
    reserved: string;
    available: string;
    batch: string;
    supplierBatch: string;
    expiry: string;
    bestBefore: string;
    catchWeight: string;
    location: string;
    warehouse: string;
    source: string;
    parentLp: string;
    none: string;
  };
  actions: {
    comingSoon: string;
    labelByKey: Record<LpDetailAction, string>;
    reserve: LpReserveModalLabels;
    block: LpBlockModalLabels;
    unblock: {
      title: string;
      intro: string;
      reason: string;
      reasonPlaceholder: string;
      /** P0-B3 — e-sign (21 CFR Part 11) block copy for the required password. */
      esign: {
        title: string;
        meaning: string;
        password: string;
        passwordHelp: string;
        passwordPlaceholder: string;
      };
      cancel: string;
      confirm: string;
      submitting: string;
      success: string;
      errors: {
        forbidden: string;
        invalidState: string;
        noOpenHold: string;
        invalidInput: string;
        notFound: string;
        generic: string;
      };
    };
    qaRelease: {
      title: string;
      decision: string;
      released: string;
      rejected: string;
      note: string;
      notePlaceholder: string;
      cancel: string;
      confirm: string;
      unavailable: string;
      denied: string;
      invalidState: string;
      error: string;
    };
    /** WH-R3 — Split modal copy. */
    split: LpSplitModalLabels;
    /** P1-19 — Merge modal copy. */
    merge: LpMergeModalLabels;
    /** WH-R3 — Destroy / scrap modal copy. */
    destroy: LpDestroyModalLabels;
    /** WH-R3 — tooltips shown on a gated (ineligible) action button. */
    ineligible: {
      split: string;
      destroy: string;
      merge: string;
      reserve: string;
      /** Past expiry_date — mirrors reserveLp / mergeLps invalid_state. */
      expired: string;
      /** qa on_hold OR active v_active_holds row. */
      onHold: string;
    };
  };
  move: LpMoveLabels;
  /** C-R3 — edit-metadata (expiry / batch) modal copy. */
  metadata: LpMetadataEditLabels;
  ruleNote: string;
  tab: Record<LpDetailTab, string>;
  overview: { title: string };
  history: {
    empty: string;
    by: string;
    reason: string;
    from: string;
    to: string;
    at: string;
    reasonCol: string;
  };
  reservations: {
    empty: string;
    wo: string;
    reservedQty: string;
    available: string;
    note: string;
  };
  movements: {
    empty: string;
    timestamp: string;
    type: string;
    from: string;
    to: string;
    qty: string;
    reason: string;
    reference: string;
  };
  genealogy: {
    parentTitle: string;
    childrenTitle: string;
    noParent: string;
    noChildren: string;
    status: string;
    qty: string;
  };
  labels: {
    deferred: string;
    printAction: string;
    printing: string;
    queued: string;
    sent: string;
    download: string;
    error: string;
    forbidden: string;
    historyLink: string;
    errors: {
      generic: string;
      entityNotFound: string;
      printerNotFound: string;
      unsupportedEntity: string;
    };
  };
  raw: { title: string; empty: string };
  expiryBanner: string;
}

export type LpPrintLabelResult =
  | { status: 'queued' | 'sent'; result_url: string | null }
  | { status: 'failed'; result_url: null; code: string };
export type LpPrintLabelInput = { entityType: 'lp'; entityId: string };


export function buildLpDetailLabels(locale: string): LpDetailLabels {
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
    // QA-status badge dict (raw lowercase qa_status → localized label). The raw
    // value (e.g. "pending") was leaking next to the translated LP-status badge.
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
      formIncomplete: 'Complete all required fields to continue.',
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

