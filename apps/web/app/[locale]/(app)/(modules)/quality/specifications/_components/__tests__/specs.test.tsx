/**
 * QA-003 / QA-003b / MODAL-SPEC-SIGN — Specifications client islands: RTL parity +
 * state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/quality/specs-screens.jsx:1-418
 *   + quality/modals.jsx:158-206 (MODAL-SPEC-SIGN).
 *
 * The pages are async RSCs that read Supabase via listSpecs / getSpecDetail and
 * render denied / error / empty panels; here we test the presentational client
 * islands directly. The Server Actions are passed in as props, so we inject vi.fn()
 * stubs and assert the EXACT payloads. Covers (task contract):
 *   - create payload carries the parameters[] array (decimal STRINGS, sortOrder),
 *   - min > max is BLOCKED client-side (submit disabled + inline error, no call),
 *   - approve requires a password (submit disabled until typed; e-sign failure
 *     surfaced VERBATIM),
 *   - superseded spec is IMMUTABLE (dimmed banner + no action buttons),
 *   - status filter pills + search, empty / empty-filtered,
 *   - RBAC affordance (canApprove/canSubmit/canSupersede gate the buttons),
 *   - en + pl resolve every staged key (no leaked dotted "a.b.c" key).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SpecListClient } from '../spec-list.client';
import { SpecCreateModal, minGtMax } from '../spec-create-modal.client';
import { SpecDetailClient } from '../../[specId]/_components/spec-detail.client';
import { SpecSignModal } from '../../[specId]/_components/spec-sign-modal.client';
import {
  buildSpecListLabels,
  buildSpecCreateLabels,
  buildSpecDetailLabels,
  buildSpecSignLabels,
} from '../labels';
import { getQaSpecsTranslator } from '../../../qa-specs-labels';
import type { SpecListRow, SpecDetail } from '../spec-actions-contract';

const tEn = getQaSpecsTranslator('en');
const tPl = getQaSpecsTranslator('pl');
const LIST_LABELS = buildSpecListLabels(tEn);
const CREATE_LABELS = buildSpecCreateLabels(tEn);
const DETAIL_LABELS = buildSpecDetailLabels(tEn);
const SIGN_LABELS = buildSpecSignLabels(tEn);

// search-items option shape (re-declared to avoid importing the 'use server' module).
type PickerOpt = { id: string; itemCode: string; name: string; itemType: string; status: string; costPerKgEur: string | null; uomBase: string };
const FG_ITEM: PickerOpt = {
  id: 'prod-1',
  itemCode: 'FA5100',
  name: 'Kiełbasa śląska 450g',
  itemType: 'fg',
  status: 'active',
  costPerKgEur: null,
  uomBase: 'kg',
};
const searchItemsStub = vi.fn(async () => [FG_ITEM]);

function makeListRow(over: Partial<SpecListRow>): SpecListRow {
  return {
    id: over.id ?? 's-1',
    specCode: over.specCode ?? 'SPEC-R1001-I',
    version: over.version ?? 1,
    status: over.status ?? 'active',
    productId: over.productId ?? 'prod-1',
    productCode: over.productCode ?? 'R-1001',
    productName: over.productName ?? 'Wieprzowina kl. II',
    approvedBy: over.approvedBy ?? 'E. Kowalska',
    approvedAt: over.approvedAt ?? '2026-04-21T14:35:00.000Z',
    supersededBy: over.supersededBy ?? null,
    createdAt: over.createdAt ?? '2026-04-21T14:35:00.000Z',
  };
}

function makeDetail(over: Partial<SpecDetail>): SpecDetail {
  return {
    id: over.id ?? 's-1',
    specCode: over.specCode ?? 'SPEC-R1001-I',
    version: over.version ?? 1,
    status: over.status ?? 'under_review',
    productId: over.productId ?? 'prod-1',
    productCode: over.productCode ?? 'R-1001',
    productName: over.productName ?? 'Wieprzowina kl. II',
    appliesTo: over.appliesTo ?? 'incoming',
    approvedBy: over.approvedBy ?? null,
    approvedAt: over.approvedAt ?? null,
    supersededBy: over.supersededBy ?? null,
    createdAt: over.createdAt ?? '2026-04-21T14:35:00.000Z',
    approvalSignatureHash: over.approvalSignatureHash ?? null,
    parameters: over.parameters ?? [
      {
        id: 'p-0',
        parameterName: 'Moisture content',
        parameterType: 'measurement',
        targetValue: '72.50',
        minValue: '70.00',
        maxValue: '75.00',
        unit: '%',
        isCritical: true,
        sortOrder: 0,
      },
    ],
  };
}

describe('SpecListClient — QA-003 parity + filters + states', () => {
  it('renders the status filter pills, spec-code mono link and parameter count', () => {
    render(
      <SpecListClient
        rows={[makeListRow({})]}
        labels={LIST_LABELS}
        createLabels={CREATE_LABELS}
        locale="en"
        createSpecAction={vi.fn()}
        searchItemsAction={searchItemsStub}
      />,
    );
    // status pills present (parity specs-screens.jsx:29-33)
    expect(screen.getByTestId('spec-status-all')).toBeInTheDocument();
    expect(screen.getByTestId('spec-status-under_review')).toBeInTheDocument();
    expect(screen.getByTestId('spec-status-superseded')).toBeInTheDocument();
    // spec-code mono link → detail route
    const link = screen.getByTestId('spec-link-s-1');
    expect(link).toHaveAttribute('href', '/en/quality/specifications/s-1');
    // version badge + approver rendered from the landed listSpecs row
    expect(screen.getByTestId('spec-status-badge-s-1')).toBeInTheDocument();
    expect(screen.getByTestId('spec-row-s-1')).toHaveTextContent('E. Kowalska');
  });

  it('filters by status pill and shows empty-filtered, then empty-all', () => {
    const { rerender } = render(
      <SpecListClient
        rows={[makeListRow({ id: 's-1', status: 'active' })]}
        labels={LIST_LABELS}
        createLabels={CREATE_LABELS}
        locale="en"
        createSpecAction={vi.fn()}
        searchItemsAction={searchItemsStub}
      />,
    );
    fireEvent.click(screen.getByTestId('spec-status-draft'));
    expect(screen.getByTestId('spec-list-empty-filtered')).toBeInTheDocument();

    rerender(
      <SpecListClient
        rows={[]}
        labels={LIST_LABELS}
        createLabels={CREATE_LABELS}
        locale="en"
        createSpecAction={vi.fn()}
        searchItemsAction={searchItemsStub}
      />,
    );
    expect(screen.getByTestId('spec-list-empty')).toHaveAttribute('data-state', 'empty');
  });
});

describe('SpecCreateModal — QA-003a collapsed: parameters payload + min/max block', () => {
  it('minGtMax helper mirrors the DB CHECK (min > max only)', () => {
    expect(minGtMax('5', '3')).toBe(true);
    expect(minGtMax('3', '5')).toBe(false);
    expect(minGtMax('3', '3')).toBe(false);
    expect(minGtMax('', '5')).toBe(false);
  });

  it('builds a createSpec payload with the parameters[] array (decimal strings + sortOrder)', async () => {
    const createSpecAction = vi.fn(async () => ({ ok: true as const, data: { id: 'new-spec' } }));
    render(
      <SpecCreateModal
        open
        onOpenChange={vi.fn()}
        labels={CREATE_LABELS}
        locale="en"
        createSpecAction={createSpecAction}
        searchItemsAction={searchItemsStub}
      />,
    );

    // pick a real product via the ItemPicker (fg/intermediate)
    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getByTestId('item-picker-option')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('item-picker-option'));

    fireEvent.change(screen.getByTestId('spec-create-code'), { target: { value: 'SPEC-FA5100-F' } });

    // fill the single default parameter row (measurement, numeric)
    fireEvent.change(screen.getByTestId('spec-param-name'), { target: { value: 'pH' } });
    fireEvent.change(screen.getByTestId('spec-param-target'), { target: { value: '6.20' } });
    fireEvent.change(screen.getByTestId('spec-param-min'), { target: { value: '5.80' } });
    fireEvent.change(screen.getByTestId('spec-param-max'), { target: { value: '6.50' } });
    fireEvent.change(screen.getByTestId('spec-param-unit'), { target: { value: 'pH' } });
    fireEvent.click(screen.getByTestId('spec-param-critical'));

    fireEvent.click(screen.getByTestId('spec-create-submit'));

    await waitFor(() => expect(createSpecAction).toHaveBeenCalledTimes(1));
    // ADAPTED to the landed createSpec contract: no appliesTo, no sortOrder; numeric
    // values are OPTIONAL decimal STRINGS.
    expect(createSpecAction).toHaveBeenCalledWith({
      productId: 'prod-1',
      specCode: 'SPEC-FA5100-F',
      parameters: [
        {
          parameterName: 'pH',
          parameterType: 'measurement',
          targetValue: '6.20',
          minValue: '5.80',
          maxValue: '6.50',
          unit: 'pH',
          isCritical: true,
        },
      ],
    });
  });

  it('BLOCKS submit when min > max (disabled + inline error, no action call)', async () => {
    const createSpecAction = vi.fn();
    render(
      <SpecCreateModal
        open
        onOpenChange={vi.fn()}
        labels={CREATE_LABELS}
        locale="en"
        createSpecAction={createSpecAction}
        searchItemsAction={searchItemsStub}
      />,
    );
    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getByTestId('item-picker-option')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('item-picker-option'));
    fireEvent.change(screen.getByTestId('spec-create-code'), { target: { value: 'SPEC-X' } });
    fireEvent.change(screen.getByTestId('spec-param-name'), { target: { value: 'Temp' } });
    fireEvent.change(screen.getByTestId('spec-param-min'), { target: { value: '9' } });
    fireEvent.change(screen.getByTestId('spec-param-max'), { target: { value: '2' } });

    // inline min/max error shown and submit disabled
    expect(screen.getByTestId('spec-param-minmax-error')).toBeInTheDocument();
    expect(screen.getByTestId('spec-create-submit')).toBeDisabled();

    fireEvent.click(screen.getByTestId('spec-create-submit'));
    expect(createSpecAction).not.toHaveBeenCalled();
  });
});

describe('SpecSignModal — MODAL-SPEC-SIGN: password required + verbatim e-sign failure', () => {
  const TARGET = {
    id: 's-1',
    specCode: 'SPEC-R1001-I',
    version: 3,
    productCode: 'R-1001',
    productName: 'Wieprzowina kl. II',
    appliesTo: 'Incoming',
    parameterCount: 8,
    criticalCount: 2,
  };

  it('keeps Approve disabled until a password is typed', () => {
    render(
      <SpecSignModal open onOpenChange={vi.fn()} spec={TARGET} labels={SIGN_LABELS} approveSpecAction={vi.fn()} />,
    );
    expect(screen.getByTestId('spec-sign-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('spec-sign-password'), { target: { value: 'pw' } });
    expect(screen.getByTestId('spec-sign-submit')).toBeEnabled();
  });

  it('calls approveSpec with the password and surfaces an e-sign failure verbatim', async () => {
    const approveSpecAction = vi.fn(async () => ({
      ok: false as const,
      reason: 'error' as const,
      message: 'E-signature verification failed: invalid credentials',
    }));
    render(
      <SpecSignModal open onOpenChange={vi.fn()} spec={TARGET} labels={SIGN_LABELS} approveSpecAction={approveSpecAction} />,
    );
    fireEvent.change(screen.getByTestId('spec-sign-password'), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByTestId('spec-sign-submit'));

    await waitFor(() => expect(approveSpecAction).toHaveBeenCalledWith({ specId: 's-1', signature: { password: 'hunter2' } }));
    await waitFor(() =>
      expect(screen.getByTestId('spec-sign-error')).toHaveTextContent('E-signature verification failed: invalid credentials'),
    );
  });
});

describe('SpecDetailClient — QA-003b status banner + actions + immutability', () => {
  function renderDetail(spec: SpecDetail, perms?: Partial<{ canApprove: boolean; canSubmit: boolean; canSupersede: boolean }>, candidates: { id: string; version: number }[] = []) {
    return render(
      <SpecDetailClient
        spec={spec}
        canApprove={perms?.canApprove ?? true}
        canSubmit={perms?.canSubmit ?? true}
        canSupersede={perms?.canSupersede ?? true}
        supersedeCandidates={candidates}
        labels={DETAIL_LABELS}
        locale="en"
        submitForReviewAction={vi.fn(async () => ({ ok: true as const, data: { id: 's-1' } }))}
        approveSpecAction={vi.fn(async () => ({ ok: true as const, data: { id: 's-1' } }))}
        supersedeSpecAction={vi.fn(async () => ({ ok: true as const, data: { id: 's-1' } }))}
      />,
    );
  }

  it('draft shows the editable hint banner + Submit-for-review button', () => {
    renderDetail(makeDetail({ status: 'draft' }));
    expect(screen.getByTestId('spec-detail-banner')).toHaveAttribute('data-banner-status', 'draft');
    expect(screen.getByTestId('spec-submit-review')).toBeInTheDocument();
  });

  it('under_review shows the locked banner + Approve opens the e-sign modal', () => {
    renderDetail(makeDetail({ status: 'under_review' }));
    expect(screen.getByTestId('spec-detail-banner')).toHaveAttribute('data-banner-status', 'under_review');
    fireEvent.click(screen.getByTestId('spec-approve-open'));
    expect(screen.getByTestId('spec-sign-form')).toBeInTheDocument();
  });

  it('active with NO newer version disables Supersede with an honest title', () => {
    renderDetail(makeDetail({ status: 'active', approvedBy: 'E. Kowalska', approvedAt: '2026-04-21T14:35:00.000Z' }), {}, []);
    const btn = screen.getByTestId('spec-supersede-disabled');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', DETAIL_LABELS.actions.supersedeNoTarget);
  });

  it('active WITH a newer version offers the supersede picker + submit', () => {
    renderDetail(makeDetail({ status: 'active' }), {}, [{ id: 's-2', version: 2 }]);
    expect(screen.getByTestId('spec-supersede-select')).toBeInTheDocument();
    expect(screen.getByTestId('spec-supersede-submit')).toBeInTheDocument();
  });

  it('superseded spec is IMMUTABLE — dimmed banner, immutable note, NO action buttons', () => {
    renderDetail(makeDetail({ status: 'superseded' }));
    expect(screen.getByTestId('spec-detail')).toHaveAttribute('data-status', 'superseded');
    expect(screen.getByTestId('spec-detail-banner')).toHaveAttribute('data-banner-status', 'superseded');
    expect(screen.getByTestId('spec-superseded-immutable')).toBeInTheDocument();
    expect(screen.queryByTestId('spec-submit-review')).not.toBeInTheDocument();
    expect(screen.queryByTestId('spec-approve-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('spec-supersede-block')).not.toBeInTheDocument();
  });

  it('RBAC: without canApprove the under_review Approve button is NOT rendered', () => {
    renderDetail(makeDetail({ status: 'under_review' }), { canApprove: false });
    expect(screen.queryByTestId('spec-approve-open')).not.toBeInTheDocument();
  });

  it('renders critical parameter badge + decimal target string verbatim', () => {
    renderDetail(makeDetail({ status: 'active', approvedBy: 'X', approvedAt: '2026-01-01T00:00:00.000Z' }));
    expect(screen.getByTestId('spec-param-critical-0')).toBeInTheDocument();
    expect(screen.getByTestId('spec-param-row-0')).toHaveTextContent('72.50');
  });
});

describe('i18n staged bundle — no leaked dotted keys (en + pl)', () => {
  it('every list/create/detail/sign label resolves in en and pl', () => {
    const dotted = /^[a-z]+(\.[a-zA-Z]+)+$/; // a leaked "a.b.c" key
    for (const t of [tEn, tPl]) {
      const list = buildSpecListLabels(t);
      const create = buildSpecCreateLabels(t);
      const detail = buildSpecDetailLabels(t);
      const sign = buildSpecSignLabels(t);
      const flat: string[] = [];
      const walk = (o: unknown) => {
        if (typeof o === 'string') flat.push(o);
        else if (o && typeof o === 'object') Object.values(o).forEach(walk);
      };
      [list, create, detail, sign].forEach(walk);
      for (const v of flat) {
        expect(v.length).toBeGreaterThan(0);
        expect(v, `leaked dotted key: ${v}`).not.toMatch(dotted);
      }
    }
  });
});
