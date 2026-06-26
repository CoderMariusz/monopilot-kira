/**
 * Wave E11 — Complaints + CAPA client islands: RTL parity + state + i18n + RBAC.
 *
 * Spec-driven (no dedicated complaints prototype JSX); the nearest reusable patterns
 * are the QA-009 NCR list/detail + the NCR-CLOSE / CCP-deviation resolve e-sign
 * modals. The pages are async RSCs that read Supabase via the reviewed
 * complaint-actions and render the denied / error / empty / loading panels there;
 * these tests exercise the presentational client islands directly. The reviewed
 * Server Actions (createComplaint / convertComplaintToNcr / createCapaAction /
 * resolveCapaAction) are injected as vi.fn() props so we assert the EXACT payloads
 * wired against the published signatures.
 *
 * Covers: list parity (complaint # link → detail, customer, batch/LP ref, severity +
 * status badges, opened date — never a UUID), the status filter + empty / filtered-
 * empty states, the New-complaint modal exposing customer + batch/LP ref +
 * description + severity and calling createComplaint, the detail [Convert to NCR]
 * calling convertComplaintToNcr + revealing the linked NCR, the CAPA panel add modal
 * exposing action type + description + owner + due and calling createCapaAction, the
 * CAPA resolve e-sign modal exposing the PIN (type=password) and calling
 * resolveCapaAction(id, {signature:{password}}), action errors verbatim, RBAC
 * (write gate → disabled controls + tooltip), no UUID leak, and i18n (en + pl).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../../../../../../i18n/en.json';
import pl from '../../../../../../../../i18n/pl.json';

import { ComplaintsListClient } from '../complaints-list.client';
import { CapaPanel } from '../capa-panel.client';
import { ComplaintDetailClient } from '../../[id]/_components/complaint-detail.client';
import {
  buildComplaintListLabels,
  buildComplaintDetailLabels,
  buildCapaPanelLabels,
  type Translator,
} from '../labels';
import type { CapaActionRow, ComplaintRow } from '../complaints-contracts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

/** A live-catalog-backed translator scoped to quality.complaints. */
function makeT(locale: 'en' | 'pl'): Translator {
  const ns = (locale === 'pl' ? pl : en).quality.complaints as Record<string, unknown>;
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
const LIST_LABELS = buildComplaintListLabels(tEn);
const DETAIL_LABELS = buildComplaintDetailLabels(tEn);
const CAPA_LABELS = buildCapaPanelLabels(tEn);
const ANALYTICS = {
  bySeverity: { high: 1, low: 1 },
  byRootCause: {},
  capaClosureRate: 50,
};

function makeComplaint(over: Partial<ComplaintRow> = {}): ComplaintRow {
  return {
    id: over.id ?? 'cmp-1',
    complaintNumber: 'complaintNumber' in over ? (over.complaintNumber ?? null) : 'CMP-2026-001',
    customerId: over.customerId ?? null,
    customerCode: over.customerCode ?? null,
    customerName: over.customerName ?? null,
    customerDisplay: 'customerDisplay' in over ? (over.customerDisplay ?? null) : 'ACME-01 - Acme Foods',
    lpId: over.lpId ?? null,
    lpCode: over.lpCode ?? null,
    batchRef: 'batchRef' in over ? (over.batchRef ?? null) : 'BATCH-2026-014',
    batchDisplay: 'batchDisplay' in over ? (over.batchDisplay ?? null) : 'BATCH-2026-014',
    description: over.description ?? 'Foreign object reported in pack.',
    severity: over.severity ?? 'high',
    status: over.status ?? 'open',
    ncrId: 'ncrId' in over ? (over.ncrId ?? null) : null,
    openedBy: over.openedBy ?? null,
    openedAt: over.openedAt ?? '2026-06-18T10:30:00.000Z',
    closedAt: over.closedAt ?? null,
    createdAt: over.createdAt ?? '2026-06-18T10:30:00.000Z',
    updatedAt: over.updatedAt ?? '2026-06-18T10:30:00.000Z',
  };
}

function makeCapa(over: Partial<CapaActionRow> = {}): CapaActionRow {
  return {
    id: over.id ?? 'capa-1',
    sourceType: over.sourceType ?? 'complaint',
    sourceId: over.sourceId ?? 'cmp-1',
    actionType: over.actionType ?? 'corrective',
    description: over.description ?? 'Re-train packing line operators.',
    ownerUserId: over.ownerUserId ?? null,
    dueDate: 'dueDate' in over ? (over.dueDate ?? null) : '2026-07-01',
    status: over.status ?? 'open',
    closedBy: over.closedBy ?? null,
    closedAt: over.closedAt ?? null,
    esignRef: over.esignRef ?? null,
    createdAt: over.createdAt ?? '2026-06-18T10:30:00.000Z',
    updatedAt: over.updatedAt ?? '2026-06-18T10:30:00.000Z',
  };
}

function renderList(
  rows: ComplaintRow[],
  opts: { canManage?: boolean; createComplaintAction?: ReturnType<typeof vi.fn> } = {},
) {
  const canManage = opts.canManage ?? true;
  const createComplaintAction =
    opts.createComplaintAction ?? vi.fn(async () => ({ ok: true as const, data: makeComplaint() }));
  render(
    <ComplaintsListClient
      rows={rows}
      analytics={ANALYTICS}
      labels={LIST_LABELS}
      locale="en"
      canManage={canManage}
      createComplaintAction={createComplaintAction as never}
    />,
  );
  return { createComplaintAction };
}

describe('ComplaintsListClient (E11 parity)', () => {
  it('renders one row per complaint with #, customer, batch/LP ref, severity + status badges and opened date (never a UUID)', () => {
    renderList([makeComplaint({ id: 'a', complaintNumber: 'CMP-2026-007' })]);
    const link = screen.getByTestId('complaint-link-a');
    expect(link).toHaveAttribute('href', '/en/quality/complaints/a');
    expect(link).toHaveTextContent('CMP-2026-007');
    expect(screen.getByTestId('complaint-customer-a')).toHaveTextContent('Acme Foods');
    expect(screen.getByTestId('complaint-ref-a')).toHaveTextContent('BATCH-2026-014');
    expect(screen.getByTestId('complaint-severity-a')).toHaveAttribute('data-variant', 'warning'); // high
    expect(screen.getByTestId('complaint-status-a')).toHaveTextContent(LIST_LABELS.statusValues.open);
    expect(screen.getByTestId('complaint-row-a')).toHaveTextContent('2026-06-18');
  });

  it('EMPTY register renders the empty-all copy', () => {
    renderList([]);
    expect(screen.getByTestId('complaints-list-empty')).toHaveTextContent(LIST_LABELS.emptyAll);
  });

  it('STATUS FILTER + FILTERED-EMPTY: switching the status Select filters rows / shows the filtered-empty copy', () => {
    renderList([
      makeComplaint({ id: 'o', status: 'open' }),
      makeComplaint({ id: 'c', status: 'closed' }),
    ]);
    // all → 2 visible.
    expect(screen.getByTestId('complaints-list-rows')).toHaveTextContent('2');
    // filter to converted (none) → filtered-empty.
    const trigger = screen.getByTestId('complaints-filter-status').querySelector('[data-slot="select-trigger"]')!;
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText(LIST_LABELS.statusValues.converted, { selector: '[data-slot="select-item"]' }));
    expect(screen.getByTestId('complaints-list-empty-filtered')).toHaveTextContent(LIST_LABELS.emptyFiltered);
  });

  it('RBAC: without the write permission the [+ New complaint] button is disabled with a tooltip', () => {
    renderList([makeComplaint({ id: 'a' })], { canManage: false });
    const btn = screen.getByTestId('complaint-create-open');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', LIST_LABELS.newComplaintDisabled);
    fireEvent.click(btn);
    expect(screen.queryByTestId('complaint-create-form')).not.toBeInTheDocument();
  });

  it('never renders a raw UUID in the list (the id lives only in the detail-link href)', () => {
    const { container } = render(
      <ComplaintsListClient
        rows={[makeComplaint({ id: '11111111-2222-4333-8444-555555555555', complaintNumber: 'CMP-1' })]}
        analytics={ANALYTICS}
        labels={LIST_LABELS}
        locale="en"
        canManage
        createComplaintAction={vi.fn() as never}
      />,
    );
    expect(container.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('renders read-only analytics above the table', () => {
    renderList([makeComplaint({ id: 'a' })]);
    expect(screen.getByTestId('complaints-analytics-panel')).toHaveTextContent('Complaints by Severity');
    expect(screen.getByTestId('complaints-analytics-panel')).toHaveTextContent('Complaints by Root Cause');
    expect(screen.getByTestId('complaints-capa-rate')).toHaveTextContent('50%');
  });
});

describe('ComplaintCreateModal (E11 — new complaint)', () => {
  it('exposes customer + batch/LP ref + description + severity fields', () => {
    renderList([makeComplaint({ id: 'a' })]);
    fireEvent.click(screen.getByTestId('complaint-create-open'));
    expect(screen.getByTestId('complaint-create-form')).toBeInTheDocument();
    expect(screen.getByTestId('complaint-create-customer')).toBeInTheDocument();
    expect(screen.getByTestId('complaint-create-batchref')).toBeInTheDocument();
    expect(screen.getByTestId('complaint-create-description')).toBeInTheDocument();
    expect(screen.getByTestId('complaint-create-severity-low')).toBeInTheDocument();
    expect(screen.getByTestId('complaint-create-severity-critical')).toBeInTheDocument();
  });

  it('submit is disabled until a description is present, then calls createComplaint with the payload', async () => {
    const { createComplaintAction } = renderList([makeComplaint({ id: 'a' })]);
    fireEvent.click(screen.getByTestId('complaint-create-open'));
    const submit = screen.getByTestId('complaint-create-submit');
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByTestId('complaint-create-severity-critical'));
    fireEvent.change(screen.getByTestId('complaint-create-customer'), { target: { value: 'Acme Foods' } });
    fireEvent.change(screen.getByTestId('complaint-create-batchref'), { target: { value: 'BATCH-9' } });
    fireEvent.change(screen.getByTestId('complaint-create-description'), { target: { value: '  Glass in pack  ' } });
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);
    await waitFor(() => expect(createComplaintAction).toHaveBeenCalledTimes(1));
    expect(createComplaintAction).toHaveBeenCalledWith({
      description: 'Glass in pack',
      severity: 'critical',
      batchRef: 'Acme Foods · BATCH-9',
    });
  });

  it('a failed create surfaces the action error code VERBATIM and keeps the modal open', async () => {
    const createComplaintAction = vi.fn(async () => ({ ok: false as const, error: 'insert_failed' }));
    renderList([makeComplaint({ id: 'a' })], { createComplaintAction });
    fireEvent.click(screen.getByTestId('complaint-create-open'));
    fireEvent.change(screen.getByTestId('complaint-create-description'), { target: { value: 'Some complaint' } });
    fireEvent.click(screen.getByTestId('complaint-create-submit'));
    await waitFor(() => expect(createComplaintAction).toHaveBeenCalled());
    expect(await screen.findByTestId('complaint-create-error')).toHaveTextContent('insert_failed');
    expect(screen.getByTestId('complaint-create-form')).toBeInTheDocument();
  });
});

function renderDetail(
  complaint: ComplaintRow,
  capaActions: CapaActionRow[],
  opts: {
    canManage?: boolean;
    convertAction?: ReturnType<typeof vi.fn>;
    createCapaAction?: ReturnType<typeof vi.fn>;
    resolveCapaAction?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const convertAction =
    opts.convertAction ?? vi.fn(async () => ({ ok: true as const, data: { complaintId: complaint.id, ncrId: 'ncr-xyz' } }));
  const createCapaAction =
    opts.createCapaAction ?? vi.fn(async () => ({ ok: true as const, data: makeCapa() }));
  const resolveCapaAction =
    opts.resolveCapaAction ?? vi.fn(async () => ({ ok: true as const, data: makeCapa({ status: 'closed' }) }));
  render(
    <ComplaintDetailClient
      complaint={complaint}
      capaActions={capaActions}
      labels={DETAIL_LABELS}
      locale="en"
      canManage={opts.canManage ?? true}
      convertComplaintToNcrAction={convertAction as never}
      createCapaActionAction={createCapaAction as never}
      resolveCapaActionAction={resolveCapaAction as never}
    />,
  );
  return { convertAction, createCapaAction, resolveCapaAction };
}

describe('ComplaintDetailClient (E11 — info + convert)', () => {
  it('renders the complaint info (number, customer, ref, severity, status, description) — never a UUID', () => {
    renderDetail(makeComplaint({ id: '11111111-2222-4333-8444-555555555555' }), []);
    expect(screen.getByTestId('complaint-detail-info')).toHaveTextContent('CMP-2026-001');
    expect(screen.getByTestId('complaint-detail-info')).toHaveTextContent('Acme Foods');
    expect(screen.getByTestId('complaint-detail-description')).toHaveTextContent('Foreign object reported in pack.');
    expect(document.body.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('shows [Convert to NCR] when not converted, calls convertComplaintToNcr and reveals the linked NCR link', async () => {
    const { convertAction } = renderDetail(makeComplaint({ id: 'cmp-9', ncrId: null }), []);
    expect(screen.queryByTestId('complaint-detail-converted-banner')).not.toBeInTheDocument();
    const btn = screen.getByTestId('complaint-convert-button');
    fireEvent.click(btn);
    await waitFor(() => expect(convertAction).toHaveBeenCalledWith('cmp-9'));
    // after success the converted banner + the linked-NCR deep-link appear.
    const ncrLink = await screen.findByTestId('complaint-detail-ncr-link');
    expect(ncrLink).toHaveAttribute('href', '/en/quality/ncrs/ncr-xyz');
    expect(screen.getByTestId('complaint-detail-converted-banner')).toBeInTheDocument();
  });

  it('an already-converted complaint hides the Convert button and shows the linked-NCR link from the start', () => {
    renderDetail(makeComplaint({ id: 'cmp-9', ncrId: 'ncr-existing', status: 'converted' }), []);
    expect(screen.queryByTestId('complaint-convert-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('complaint-detail-ncr-link')).toHaveAttribute('href', '/en/quality/ncrs/ncr-existing');
  });

  it('RBAC: without the write permission the Convert button is disabled with a tooltip', () => {
    renderDetail(makeComplaint({ id: 'cmp-9', ncrId: null }), [], { canManage: false });
    const btn = screen.getByTestId('complaint-convert-button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', DETAIL_LABELS.convertDisabledConverted);
  });

  it('a failed convert surfaces the action error code VERBATIM', async () => {
    const convertAction = vi.fn(async () => ({ ok: false as const, error: 'ncr_create_failed' }));
    renderDetail(makeComplaint({ id: 'cmp-9', ncrId: null }), [], { convertAction });
    fireEvent.click(screen.getByTestId('complaint-convert-button'));
    expect(await screen.findByTestId('complaint-convert-error')).toHaveTextContent('ncr_create_failed');
  });
});

describe('CapaPanel + modals (E11 — add + resolve e-sign)', () => {
  it('EMPTY CAPA list renders the empty copy', () => {
    renderDetail(makeComplaint({ id: 'cmp-1' }), []);
    expect(screen.getByTestId('capa-panel-empty')).toHaveTextContent(CAPA_LABELS.empty);
  });

  it('renders a row per CAPA action with type, description, due and status (never a UUID)', () => {
    renderDetail(makeComplaint({ id: 'cmp-1' }), [
      makeCapa({ id: '11111111-2222-4333-8444-555555555555', actionType: 'preventive', dueDate: '2026-07-01' }),
    ]);
    const row = screen.getByTestId('capa-row-11111111-2222-4333-8444-555555555555');
    expect(screen.getByTestId('capa-type-11111111-2222-4333-8444-555555555555')).toHaveTextContent(
      CAPA_LABELS.actionTypeValues.preventive,
    );
    expect(row).toHaveTextContent('Re-train packing line operators.');
    expect(screen.getByTestId('capa-due-11111111-2222-4333-8444-555555555555')).toHaveTextContent('2026-07-01');
    // the id never appears as visible text.
    expect(row.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('the Add-CAPA modal exposes action type + description + owner + due, and calls createCapaAction with the source + payload', async () => {
    const { createCapaAction } = renderDetail(makeComplaint({ id: 'cmp-42' }), []);
    fireEvent.click(screen.getByTestId('capa-add-open'));
    expect(screen.getByTestId('capa-create-form')).toBeInTheDocument();
    expect(screen.getByTestId('capa-create-actiontype-corrective')).toBeInTheDocument();
    expect(screen.getByTestId('capa-create-actiontype-preventive')).toBeInTheDocument();
    expect(screen.getByTestId('capa-create-owner')).toBeInTheDocument();
    expect(screen.getByTestId('capa-create-duedate')).toBeInTheDocument();

    const submit = screen.getByTestId('capa-create-submit');
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByTestId('capa-create-actiontype-preventive'));
    fireEvent.change(screen.getByTestId('capa-create-description'), { target: { value: '  Add metal detector  ' } });
    fireEvent.change(screen.getByTestId('capa-create-duedate'), { target: { value: '2026-08-15' } });
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);
    await waitFor(() => expect(createCapaAction).toHaveBeenCalledTimes(1));
    expect(createCapaAction).toHaveBeenCalledWith({
      sourceType: 'complaint',
      sourceId: 'cmp-42',
      actionType: 'preventive',
      description: 'Add metal detector',
      dueDate: '2026-08-15',
    });
  });

  it('an OPEN CAPA action exposes [Resolve] → an e-sign modal with a PIN field (type=password)', () => {
    renderDetail(makeComplaint({ id: 'cmp-1' }), [makeCapa({ id: 'capa-7', status: 'open' })]);
    fireEvent.click(screen.getByTestId('capa-resolve-open-capa-7'));
    expect(screen.getByTestId('capa-resolve-form')).toBeInTheDocument();
    const pin = screen.getByTestId('capa-resolve-password');
    expect(pin).toHaveAttribute('type', 'password');
  });

  it('the resolve modal submits resolveCapaAction(id, {signature:{password}}) and closes', async () => {
    const { resolveCapaAction } = renderDetail(makeComplaint({ id: 'cmp-1' }), [makeCapa({ id: 'capa-7', status: 'open' })]);
    fireEvent.click(screen.getByTestId('capa-resolve-open-capa-7'));
    const submit = screen.getByTestId('capa-resolve-submit');
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId('capa-resolve-password'), { target: { value: 'secret-pin' } });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    await waitFor(() => expect(resolveCapaAction).toHaveBeenCalledTimes(1));
    expect(resolveCapaAction).toHaveBeenCalledWith('capa-7', { signature: { password: 'secret-pin' } });
    await waitFor(() => expect(screen.queryByTestId('capa-resolve-form')).not.toBeInTheDocument());
  });

  it('a failed resolve surfaces the action error code VERBATIM and keeps the modal open', async () => {
    const resolveCapaAction = vi.fn(async () => ({ ok: false as const, error: 'esign_failed' }));
    renderDetail(makeComplaint({ id: 'cmp-1' }), [makeCapa({ id: 'capa-7', status: 'open' })], { resolveCapaAction });
    fireEvent.click(screen.getByTestId('capa-resolve-open-capa-7'));
    fireEvent.change(screen.getByTestId('capa-resolve-password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByTestId('capa-resolve-submit'));
    await waitFor(() => expect(resolveCapaAction).toHaveBeenCalled());
    expect(await screen.findByTestId('capa-resolve-error')).toHaveTextContent('esign_failed');
    expect(screen.getByTestId('capa-resolve-form')).toBeInTheDocument();
  });

  it('RBAC: without the write permission the Add CAPA + Resolve buttons are disabled with tooltips', () => {
    renderDetail(makeComplaint({ id: 'cmp-1' }), [makeCapa({ id: 'capa-7', status: 'open' })], { canManage: false });
    const add = screen.getByTestId('capa-add-open');
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute('title', CAPA_LABELS.resolveDisabled);
    const resolve = screen.getByTestId('capa-resolve-open-capa-7');
    expect(resolve).toBeDisabled();
    expect(resolve).toHaveAttribute('title', CAPA_LABELS.resolveDisabled);
  });
});

describe('i18n (no leaked dotted keys; en + pl real translations)', () => {
  it('resolves every list + detail + CAPA label in en and pl with no leaked dotted key', () => {
    for (const t of [tEn, tPl]) {
      const flat = JSON.stringify([
        buildComplaintListLabels(t),
        buildComplaintDetailLabels(t),
        buildCapaPanelLabels(t),
      ]);
      // a leaked key would look like "createModal.esign.title" — a dotted lowerCamel path.
      expect(flat).not.toMatch(/[a-z]+\.[a-z]+\.[a-zA-Z]/);
    }
  });

  it('en + pl differ (real translations, not an en clone)', () => {
    expect(tPl('title')).not.toBe(tEn('title'));
    expect(tPl('nav.title')).not.toBe(tEn('nav.title'));
    expect(tPl('list.newComplaint')).not.toBe(tEn('list.newComplaint'));
    expect(tPl('detail.convert')).not.toBe(tEn('detail.convert'));
    expect(tPl('capaResolveModal.submit')).not.toBe(tEn('capaResolveModal.submit'));
  });
});
