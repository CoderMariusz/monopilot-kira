'use client';

/**
 * Wave E7 — Disassembly BOM detail variant.
 *
 * When a BOM has bom_type='disassembly' (loaded via the real `getDisassemblyBom`
 * Server Action), the detail screen renders this variant instead of the 7-tab
 * forward layout:
 *   - an "Input" section showing the single input item (code + name — NEVER a
 *     raw UUID — quantity + UoM), and
 *   - an "Outputs" table of co-products (code+name, expected yield %, allocation
 *     %, qty, UoM), with the allocation total in the footer and its V-TEC-12
 *     validation state (green when =100, red otherwise).
 *
 * Editing is draft-only: the forward-BOM edit affordances do not apply to a
 * disassembly BOM in this read view — a muted note states edit is draft-only and
 * any disabled affordance keeps its tooltip (no silent dead controls).
 *
 * Parity baseline: the forward bom-detail screen (bom-detail.jsx:3-65 shell —
 * breadcrumb + item header + status/version badges + card tables). Design-system
 * tokens only (`.card`, `.badge`, `.alert`, `.empty-state`, `.breadcrumb`). All
 * copy is i18n-driven (technical.bomDetail.disassembly). No mocks — `data` is the
 * real `getDisassemblyBom` view shape, mapped by the Server Component.
 */

import React from 'react';
import { useTranslations } from 'next-intl';

export type DisassemblyDetailState = 'ready' | 'loading' | 'error' | 'not_found' | 'permission_denied';

export type DisassemblyBomDetailData = {
  header: {
    bom_type: 'disassembly';
    product_code: string;
    status: string;
    version: number;
    yield_pct: string;
    effective_from: string;
    effective_to: string | null;
    notes: string | null;
  };
  input_item: { code: string; name: string | null; quantity: string; uom: string };
  outputs: Array<{
    code: string;
    name: string | null;
    quantity: string;
    uom: string;
    allocation_pct: string;
    expected_yield_pct: string;
  }>;
  allocation_sum: string;
};

const STATUS_TONE: Record<string, string> = {
  draft: 'badge-gray',
  in_review: 'badge-blue',
  technical_approved: 'badge-green',
  active: 'badge-green',
  superseded: 'badge-amber',
  archived: 'badge-red',
};

const ALLOCATION_TOLERANCE = 0.01;

function fmtPct(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? `${(Math.round(n * 1000) / 1000)}%` : `${value}%`;
}

export function DisassemblyBomDetail({
  state,
  data,
  detailHrefBase,
  isEditable = false,
}: {
  state: DisassemblyDetailState;
  data: DisassemblyBomDetailData | null;
  detailHrefBase: string;
  /** Whether the BOM is a draft (edit-eligible). Read view either way here. */
  isEditable?: boolean;
}) {
  const t = useTranslations('technical.bomDetail.disassembly');
  const tDetail = useTranslations('technical.bomDetail');

  if (state !== 'ready' || !data) {
    return (
      <main
        data-screen="technical-bom-detail"
        data-bom-variant="disassembly"
        className="flex w-full flex-col gap-4 px-6 py-6"
      >
        {state === 'loading' ? (
          <div role="status" aria-live="polite" className="card text-shell-muted text-sm">
            {t('loading')}
          </div>
        ) : state === 'permission_denied' ? (
          <div role="alert" className="alert alert-amber">
            <div className="alert-title">{tDetail('forbidden')}</div>
          </div>
        ) : (
          <div role="alert" className="alert alert-red">
            <div className="alert-title">{state === 'error' ? t('error') : t('notFound')}</div>
          </div>
        )}
      </main>
    );
  }

  const sumNum = Number(data.allocation_sum);
  const allocationValid = Number.isFinite(sumNum) && Math.abs(sumNum - 100) <= ALLOCATION_TOLERANCE;
  const statusTone = STATUS_TONE[data.header.status] ?? 'badge-gray';

  return (
    <main
      data-screen="technical-bom-detail"
      data-bom-variant="disassembly"
      className="flex w-full flex-col gap-4 px-6 py-6"
    >
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href={detailHrefBase}>{tDetail('breadcrumbRoot')}</a> /{' '}
        <span className="mono">{data.header.product_code}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="page-title">{data.input_item.name ?? data.header.product_code}</h1>
            <span className={`badge ${statusTone}`}>{data.header.status}</span>
            <span className="badge badge-blue">v{data.header.version}</span>
            <span className="badge badge-amber">{t('sectionInput')}/{t('sectionOutputs')}</span>
          </div>
          {!isEditable ? (
            <p className="helper" data-testid="disassembly-detail-edit-note">
              {t('editDraftOnly')}
            </p>
          ) : null}
        </div>
      </header>

      {/* ── Input section ──────────────────────────────────────────────────── */}
      <section className="card" data-testid="disassembly-detail-input">
        <div className="card-head">
          <strong style={{ fontSize: 13 }}>{t('sectionInput')}</strong>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-[160px_1fr]">
          <dt className="muted">{t('inputItem')}</dt>
          <dd>
            <span className="mono">{data.input_item.code}</span>
            {data.input_item.name ? <span className="muted"> · {data.input_item.name}</span> : null}
          </dd>
          <dt className="muted">{t('colQty')}</dt>
          <dd className="mono tabular-nums">
            {data.input_item.quantity} {data.input_item.uom}
          </dd>
        </dl>
      </section>

      {/* ── Outputs section ────────────────────────────────────────────────── */}
      <section className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <div className="card-head" style={{ padding: '12px 16px' }}>
          <strong style={{ fontSize: 13 }}>{t('sectionOutputs')}</strong>
        </div>
        {data.outputs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">⚖️</div>
            <div className="empty-state-body">{t('emptyOutputs')}</div>
          </div>
        ) : (
          <table aria-label={t('sectionOutputs')}>
            <thead>
              <tr>
                <th scope="col">{t('colCoProduct')}</th>
                <th scope="col" style={{ textAlign: 'right' }}>{t('colQty')}</th>
                <th scope="col">{t('colUom')}</th>
                <th scope="col" style={{ textAlign: 'right' }}>{t('colExpectedYield')}</th>
                <th scope="col" style={{ textAlign: 'right' }}>{t('colAllocation')}</th>
              </tr>
            </thead>
            <tbody>
              {data.outputs.map((o) => (
                <tr key={o.code} data-testid="disassembly-output-row">
                  <td className="mono">
                    {o.code}
                    {o.name ? <span className="muted"> · {o.name}</span> : null}
                  </td>
                  <td className="mono tabular-nums" style={{ textAlign: 'right' }}>{o.quantity}</td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{o.uom}</td>
                  <td className="mono tabular-nums" style={{ textAlign: 'right' }}>{fmtPct(o.expected_yield_pct)}</td>
                  <td className="mono tabular-nums" style={{ textAlign: 'right' }}>{fmtPct(o.allocation_pct)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="muted" style={{ fontWeight: 600 }}>{t('allocationTotal')}</td>
                <td />
                <td />
                <td />
                <td style={{ textAlign: 'right' }}>
                  <span
                    data-testid="disassembly-detail-allocation-sum"
                    className={`badge ${allocationValid ? 'badge-green' : 'badge-red'} tabular-nums`}
                  >
                    {fmtPct(data.allocation_sum)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      {allocationValid ? (
        <p role="status" style={{ fontSize: 12, color: 'var(--green-700)' }}>
          {t('allocationValid')}
        </p>
      ) : (
        <div role="alert" className="alert alert-red" data-testid="disassembly-detail-allocation-error">
          <div className="alert-title">{t('allocationError')}</div>
        </div>
      )}
    </main>
  );
}

export default DisassemblyBomDetail;
