/**
 * QA-002 / QA-002a — Quality holds client islands: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/quality/holds-screens.jsx:1-286
 *   + quality/modals.jsx:22-156 (MODAL-HOLD-CREATE / MODAL-HOLD-RELEASE).
 *
 * Tests the presentational client islands directly (the pages are async RSCs that
 * read Supabase via listHolds / getHoldDetail and render the denied / error / empty
 * panels). The Server Actions are passed in as props, so we inject vi.fn() stubs and
 * assert the exact payloads. Covers: status tabs + counts + filter, ref-type filter,
 * search, empty / empty-filtered, create-modal payload (incl. comma-split lpIds +
 * critical SoD warning), release-modal requires disposition + reason + password and
 * surfaces e-sign failures verbatim, released-hold immutability (banner + no actions),
 * and that en + pl resolve every staged key (no leaked dotted key).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HoldsListClient, type HoldRow } from '../holds-list.client';
import { HoldReleaseModal } from '../hold-release-modal.client';
import { HoldDetailClient } from '../../[holdId]/_components/hold-detail.client';
import {
  buildHoldsListLabels,
  buildHoldCreateLabels,
  buildHoldReleaseLabels,
  buildHoldDetailLabels,
} from '../labels';
import { getQaHoldsTranslator } from '../../../qa-holds-labels';

const tEn = getQaHoldsTranslator('en');
const LIST_LABELS = buildHoldsListLabels(tEn);
const CREATE_LABELS = buildHoldCreateLabels(tEn);
const RELEASE_LABELS = buildHoldReleaseLabels(tEn);
const DETAIL_LABELS = buildHoldDetailLabels(tEn);

function makeRow(over: Partial<HoldRow>): HoldRow {
  return {
    id: over.id ?? 'h-1',
    holdNumber: over.holdNumber ?? 'HOLD-0001',
    referenceType: over.referenceType ?? 'lp',
    referenceId: over.referenceId ?? 'ref-1',
    referenceDisplay: over.referenceDisplay ?? 'LP-4820 / R-1001',
    reasonLabel: over.reasonLabel ?? null,
    reasonText: over.reasonText ?? 'Suspected metal contamination',
    priority: over.priority ?? 'high',
    status: over.status ?? 'open',
    createdAt: over.createdAt ?? '2026-04-21T10:00:00.000Z',
    estimatedReleaseAt: over.estimatedReleaseAt ?? '2026-04-28',
    releasedAt: over.releasedAt ?? null,
  };
}

// AUDIT #4: the create modal now resolves human numbers to UUIDs via lookup
// reads. Default mocks resolve any wo/grn number and any LP number to a stable id
// so the existing parity tests assert the post-resolution payload.
function defaultLookups() {
  return {
    resolveLpAction: vi.fn(async ({ lpNumber }: { lpNumber: string }) => ({
      ok: true as const,
      data: { id: `id-${lpNumber}`, lpNumber, itemCode: 'RM-1', qty: '1', uom: 'kg', status: 'available', qaStatus: 'released' },
    })),
    searchLpsAction: vi.fn(async () => ({ ok: true as const, data: [] })),
    resolveWoAction: vi.fn(async ({ woNumber }: { woNumber: string }) => ({ ok: true as const, data: { id: 'wo-uuid', display: woNumber } })),
    resolveGrnAction: vi.fn(async ({ grnNumber }: { grnNumber: string }) => ({ ok: true as const, data: { id: 'grn-uuid', display: grnNumber } })),
  };
}

function renderList(rows: HoldRow[], createHoldAction = vi.fn(), lookups = defaultLookups()) {
  return render(
    <HoldsListClient
      rows={rows}
      labels={LIST_LABELS}
      createLabels={CREATE_LABELS}
      locale="en"
      createHoldAction={createHoldAction as never}
      resolveLpAction={lookups.resolveLpAction as never}
      searchLpsAction={lookups.searchLpsAction as never}
      resolveWoAction={lookups.resolveWoAction as never}
      resolveGrnAction={lookups.resolveGrnAction as never}
    />,
  );
}

describe('HoldsListClient (QA-002 parity)', () => {
  it('renders Active/Released/All tabs with counts and defaults to active', () => {
    renderList([
      makeRow({ id: 'a', status: 'open' }),
      makeRow({ id: 'b', status: 'investigating' }),
      makeRow({ id: 'c', status: 'released', releasedAt: '2026-04-22T00:00:00.000Z' }),
    ]);
    for (const k of ['active', 'released', 'all']) {
      expect(screen.getByTestId(`hold-tab-${k}`)).toBeInTheDocument();
    }
    expect(within(screen.getByTestId('hold-tab-active')).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByTestId('hold-tab-released')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('hold-tab-all')).getByText('3')).toBeInTheDocument();
    // Active tab is the default — the released row is hidden.
    expect(screen.getByTestId('hold-row-a')).toBeInTheDocument();
    expect(screen.queryByTestId('hold-row-c')).not.toBeInTheDocument();
  });

  it('filters rows by reference type', () => {
    renderList([
      makeRow({ id: 'a', referenceType: 'lp' }),
      makeRow({ id: 'b', referenceType: 'wo' }),
    ]);
    fireEvent.click(screen.getByTestId('hold-reftype-wo'));
    expect(screen.queryByTestId('hold-row-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('hold-row-b')).toBeInTheDocument();
  });

  it('searches by hold number, reference display and reason', () => {
    renderList([
      makeRow({ id: 'a', holdNumber: 'HOLD-AAA', referenceDisplay: 'LP-1', reasonText: 'metal' }),
      makeRow({ id: 'b', holdNumber: 'HOLD-BBB', referenceDisplay: 'LP-2', reasonText: 'glass' }),
    ]);
    const search = screen.getByTestId('holds-list-search');
    fireEvent.change(search, { target: { value: 'glass' } });
    expect(screen.queryByTestId('hold-row-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('hold-row-b')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'HOLD-AAA' } });
    expect(screen.getByTestId('hold-row-a')).toBeInTheDocument();
    expect(screen.queryByTestId('hold-row-b')).not.toBeInTheDocument();
  });

  it('renders the hold number as a mono link to the detail route', () => {
    renderList([makeRow({ id: 'h-x', holdNumber: 'HOLD-9999' })]);
    const link = screen.getByTestId('hold-link-h-x');
    expect(link).toHaveAttribute('href', '/en/quality/holds/h-x');
    expect(link).toHaveTextContent('HOLD-9999');
  });

  it('shows the empty-all state when there are no rows', () => {
    renderList([]);
    expect(screen.getByTestId('holds-list-empty')).toHaveTextContent(LIST_LABELS.emptyAll);
  });

  it('shows the empty-filtered state when the search matches nothing', () => {
    renderList([makeRow({ id: 'a', holdNumber: 'HOLD-AAA' })]);
    fireEvent.change(screen.getByTestId('holds-list-search'), { target: { value: 'zzz-nope' } });
    expect(screen.getByTestId('holds-list-empty-filtered')).toHaveTextContent(LIST_LABELS.emptyFiltered);
  });

  it('opens the create modal and submits the exact createHold payload (comma-split lpIds)', async () => {
    const createHoldAction = vi.fn().mockResolvedValue({
      ok: true,
      data: { id: 'h-new', holdNumber: 'HOLD-NEW', referenceType: 'wo', referenceId: 'wo-uuid', status: 'open', heldLpIds: [] },
    });
    renderList([makeRow({ id: 'a' })], createHoldAction);
    fireEvent.click(screen.getByTestId('holds-create-open'));

    // Pick reference type WO + critical priority (asserts the SoD warning).
    fireEvent.click(screen.getByTestId('hold-create-reftype-wo'));
    fireEvent.click(screen.getByTestId('hold-create-priority-critical'));
    expect(screen.getByTestId('hold-create-sod-warning')).toBeInTheDocument();

    // AUDIT #4: WO reference is a typed NUMBER resolved to a UUID on submit; the
    // additional-LP field takes NUMBERS resolved to UUIDs (comma/newline split).
    fireEvent.change(screen.getByTestId('hold-create-reference'), { target: { value: '  WO-000001  ' } });
    fireEvent.change(screen.getByTestId('hold-create-reason'), { target: { value: 'WO output failed CCP' } });
    fireEvent.change(screen.getByTestId('hold-create-lpids'), { target: { value: 'lp-1, lp-2 ,, lp-3' } });
    fireEvent.change(screen.getByTestId('hold-create-estrelease'), { target: { value: '2026-05-01' } });

    fireEvent.click(screen.getByTestId('hold-create-submit'));
    await waitFor(() => expect(createHoldAction).toHaveBeenCalledTimes(1));
    expect(createHoldAction).toHaveBeenCalledWith({
      referenceType: 'wo',
      referenceId: 'wo-uuid', // resolved from "WO-000001"
      reasonText: 'WO output failed CCP',
      priority: 'critical',
      lpIds: ['id-lp-1', 'id-lp-2', 'id-lp-3'], // resolved from the typed numbers
      estimatedReleaseAt: '2026-05-01',
    });
  });

  it('keeps the create submit disabled until reference + reason are present', () => {
    renderList([makeRow({ id: 'a' })]);
    fireEvent.click(screen.getByTestId('holds-create-open'));
    // Use a non-lp ref type (honest text input); lp uses the live search box.
    fireEvent.click(screen.getByTestId('hold-create-reftype-wo'));
    const submit = screen.getByTestId('hold-create-submit');
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId('hold-create-reference'), { target: { value: 'WO-1' } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId('hold-create-reason'), { target: { value: 'because' } });
    expect(submit).toBeEnabled();
  });
});

describe('HoldReleaseModal (MODAL-HOLD-RELEASE parity)', () => {
  const target = {
    id: 'h-1',
    holdNumber: 'HOLD-0001',
    referenceDisplay: 'LP-4820',
    reason: 'metal',
    priority: 'Critical',
  };

  function renderRelease(releaseHoldAction = vi.fn()) {
    return render(
      <HoldReleaseModal
        open
        onOpenChange={() => {}}
        hold={target}
        labels={RELEASE_LABELS}
        releaseHoldAction={releaseHoldAction as never}
      />,
    );
  }

  it('requires disposition + reason + password before the action fires', async () => {
    const releaseHoldAction = vi.fn().mockResolvedValue({ ok: true, data: {} });
    renderRelease(releaseHoldAction);
    const submit = screen.getByTestId('hold-release-submit');
    // No disposition / reason / password yet → disabled, no call.
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByTestId('hold-release-reason'), { target: { value: 'cleared by retest' } });
    fireEvent.change(screen.getByTestId('hold-release-password'), { target: { value: 'pw' } });
    // Still disabled until a disposition is chosen.
    expect(submit).toBeDisabled();

    // Choose a disposition via the shadcn Select (open + click the option).
    fireEvent.click(within(screen.getByTestId('hold-release-disposition')).getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: RELEASE_LABELS.dispositionOptions.scrap }));
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    await waitFor(() => expect(releaseHoldAction).toHaveBeenCalledTimes(1));
    expect(releaseHoldAction).toHaveBeenCalledWith({
      holdId: 'h-1',
      disposition: 'scrap',
      reasonText: 'cleared by retest',
      signature: { password: 'pw' },
    });
  });

  it('surfaces an e-sign failure verbatim from the action', async () => {
    const releaseHoldAction = vi.fn().mockResolvedValue({ ok: false, reason: 'error', message: 'invalid signature pin' });
    renderRelease(releaseHoldAction);
    fireEvent.change(screen.getByTestId('hold-release-reason'), { target: { value: 'cleared by retest' } });
    fireEvent.change(screen.getByTestId('hold-release-password'), { target: { value: 'wrong' } });
    fireEvent.click(within(screen.getByTestId('hold-release-disposition')).getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: RELEASE_LABELS.dispositionOptions.release }));
    fireEvent.click(screen.getByTestId('hold-release-submit'));
    await waitFor(() => expect(screen.getByTestId('hold-release-error')).toHaveTextContent('invalid signature pin'));
  });

  it('maps typed signoff policy failures to release-specific copy', async () => {
    const releaseHoldAction = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'policy',
      code: 'second_signature_required',
      message: 'single signEvent requires a second signature',
    });
    renderRelease(releaseHoldAction);
    fireEvent.change(screen.getByTestId('hold-release-reason'), { target: { value: 'cleared by retest' } });
    fireEvent.change(screen.getByTestId('hold-release-password'), { target: { value: 'pw' } });
    fireEvent.click(within(screen.getByTestId('hold-release-disposition')).getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: RELEASE_LABELS.dispositionOptions.release }));
    fireEvent.click(screen.getByTestId('hold-release-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('hold-release-error')).toHaveTextContent(
        RELEASE_LABELS.policyErrors.second_signature_required,
      ),
    );
  });
});

describe('HoldDetailClient (QA-002a parity)', () => {
  function makeDetail(over: Record<string, unknown> = {}) {
    return {
      id: 'h-1',
      holdNumber: 'HOLD-0001',
      referenceType: 'lp',
      referenceId: 'ref-1',
      referenceDisplay: 'LP-4820',
      reasonCodeId: null,
      reasonLabel: null,
      reasonText: 'metal',
      priority: 'critical',
      status: 'open',
      itemCount: 1,
      createdAt: '2026-04-21T10:00:00.000Z',
      estimatedReleaseAt: '2026-04-28',
      releasedAt: null,
      disposition: null,
      releaseNotes: null,
      releaseSignatureHash: null,
      releasedBy: null,
      items: [
        { id: 'i-1', licensePlateId: 'lp-uuid', lpNumber: 'LP-4820', itemId: 'it-1', itemCode: 'R-1001', qtyHeldKg: '120', qtyReleasedKg: '0', status: 'held' },
      ],
      ncrs: [],
      ...over,
    } as never;
  }

  it('links held LP rows to the warehouse license-plate detail route', () => {
    render(
      <HoldDetailClient hold={makeDetail()} canRelease labels={DETAIL_LABELS} locale="en" releaseHoldAction={vi.fn() as never} />,
    );
    const link = screen.getByTestId('hold-item-lp-link-i-1');
    expect(link).toHaveAttribute('href', '/en/warehouse/license-plates/lp-uuid');
    expect(link).toHaveTextContent('LP-4820');
  });

  it('shows the Release action when active + canRelease, opening the release modal', () => {
    render(
      <HoldDetailClient hold={makeDetail()} canRelease labels={DETAIL_LABELS} locale="en" releaseHoldAction={vi.fn() as never} />,
    );
    fireEvent.click(screen.getByTestId('hold-detail-release-open'));
    expect(screen.getByTestId('hold-release-form')).toBeInTheDocument();
  });

  it('hides the Release action when the user lacks the grant', () => {
    render(
      <HoldDetailClient hold={makeDetail()} canRelease={false} labels={DETAIL_LABELS} locale="en" releaseHoldAction={vi.fn() as never} />,
    );
    expect(screen.queryByTestId('hold-detail-release-open')).not.toBeInTheDocument();
    expect(screen.getByTestId('hold-detail-no-release')).toBeInTheDocument();
  });

  it('renders the immutable signed banner and NO action buttons for a released hold', () => {
    const released = makeDetail({
      status: 'released',
      releasedAt: '2026-04-22T09:30:00.000Z',
      releasedBy: 'E. Kowalska',
      disposition: 'release_as_is',
    });
    render(
      <HoldDetailClient hold={released} canRelease labels={DETAIL_LABELS} locale="en" releaseHoldAction={vi.fn() as never} />,
    );
    expect(screen.getByTestId('hold-detail-signed-banner')).toHaveAttribute('data-state', 'released');
    expect(screen.getByTestId('hold-detail-signed-banner')).toHaveTextContent('immutable');
    // Immutability: no release button regardless of canRelease.
    expect(screen.queryByTestId('hold-detail-release-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hold-detail-no-release')).not.toBeInTheDocument();
  });
});

describe('quality-holds i18n staging (en + pl, no leaked keys)', () => {
  it('resolves every staged key in en and pl without leaking a dotted key', () => {
    for (const locale of ['en', 'pl']) {
      const t = getQaHoldsTranslator(locale);
      const flat = JSON.stringify({
        list: buildHoldsListLabels(t),
        create: buildHoldCreateLabels(t),
        release: buildHoldReleaseLabels(t),
        detail: buildHoldDetailLabels(t),
      });
      // No raw "namespace.key" segment should ever leak into a resolved value.
      expect(flat).not.toMatch(/\b(list|createModal|releaseModal|detail|context|esign|validation)\.[a-z]/i);
    }
    // pl actually differs from en (real translations, not an EN echo).
    expect(buildHoldsListLabels(getQaHoldsTranslator('pl')).tab.active).not.toBe(LIST_LABELS.tab.active);
  });
});
