'use client';

/**
 * BOM Detail — Components tab table (W5 / T5 ruling).
 *
 * Renders the selected version's component lines with:
 *   - the per-box basis annotation ("per box (× N packs)") + a muted secondary
 *     per-pack value when the header line_basis = 'per_box' and the FG carries an
 *     each_per_box; scrap % shown only when > 0;
 *   - the resolved substitute item on RM/PM lines ("Substitute: CODE — name");
 *   - WIP-type lines expandable (chevron) to lazy-load that WIP item's ACTIVE
 *     sub-BOM one level deep, with honest loading / empty / error states.
 *
 * This is a client island so per-row expansion state + the lazy server-action
 * fetch stay local; it is fed fully-resolved, RBAC-checked props from the server.
 */

import React from 'react';

import { loadWipSubBom, type WipSubBomLine } from '../_actions/wip-sub-bom';
import type { BomLineView, BomDetailLabels } from './bom-detail-screen';
import { BomLineRowActions } from './bom-line-row-actions';

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

/** Formats a decimal string to at most 6 significant fraction digits, trimmed. */
function fmtQty(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return String(Number(value.toFixed(6)));
}

function isWip(componentType: string | null): boolean {
  return (componentType ?? '').toUpperCase() === 'WIP';
}

function isSubstituteEligible(componentType: string | null): boolean {
  const t = (componentType ?? '').toUpperCase();
  return t === 'RM' || t === 'PM';
}

type Loadable =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; lines: WipSubBomLine[] };

export function BomComponentLines({
  lines,
  labels,
  lineBasis,
  eachPerBox,
  canEditLines,
  selectedHeaderId,
  isEditable,
}: {
  lines: BomLineView[];
  labels: BomDetailLabels;
  lineBasis: 'per_base' | 'per_box';
  eachPerBox: number | null;
  canEditLines: boolean;
  selectedHeaderId?: string;
  isEditable: boolean;
}) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [subBoms, setSubBoms] = React.useState<Record<string, Loadable>>({});

  const showActions = canEditLines && !!selectedHeaderId;
  // Per-box annotation only makes sense with a real packs-per-box factor.
  const perBoxActive = lineBasis === 'per_box' && !!eachPerBox && eachPerBox > 1;
  const colSpan = 7 + (showActions ? 1 : 0);

  async function toggle(line: BomLineView) {
    const open = !expanded[line.id];
    setExpanded((prev) => ({ ...prev, [line.id]: open }));
    if (!open) return;
    if (subBoms[line.id]?.status === 'ready' || subBoms[line.id]?.status === 'loading') return;
    if (!line.itemId) {
      setSubBoms((prev) => ({ ...prev, [line.id]: { status: 'ready', lines: [] } }));
      return;
    }
    setSubBoms((prev) => ({ ...prev, [line.id]: { status: 'loading' } }));
    try {
      const res = await loadWipSubBom(line.itemId);
      setSubBoms((prev) => ({
        ...prev,
        [line.id]: res.ok ? { status: 'ready', lines: res.lines } : { status: 'error' },
      }));
    } catch {
      setSubBoms((prev) => ({ ...prev, [line.id]: { status: 'error' } }));
    }
  }

  return (
    <table aria-label={labels.tabComponents}>
      <thead>
        <tr>
          <th scope="col">{labels.colLine}</th>
          <th scope="col">{labels.colComponent}</th>
          <th scope="col">{labels.colType}</th>
          <th scope="col" style={{ textAlign: 'right' }}>{labels.colQty}</th>
          <th scope="col">{labels.colUom}</th>
          <th scope="col" style={{ textAlign: 'right' }}>{labels.colScrap}</th>
          <th scope="col">{labels.colOperation}</th>
          {showActions ? <th scope="col" style={{ textAlign: 'right' }}>{labels.colActions}</th> : null}
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const wip = isWip(l.componentType);
          const open = !!expanded[l.id];
          const state = subBoms[l.id];
          const qtyNum = Number(l.quantity);
          const scrap = Number(l.scrapPct);
          const typeTone =
            (l.componentType ?? '').toUpperCase() === 'RM'
              ? 'badge-blue'
              : (l.componentType ?? '').toUpperCase() === 'PM'
                ? 'badge-amber'
                : wip
                  ? 'badge-green'
                  : 'badge-gray';
          return (
            <React.Fragment key={l.id}>
              <tr data-testid="bom-line-row">
                <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {wip ? (
                    <button
                      type="button"
                      onClick={() => void toggle(l)}
                      aria-expanded={open}
                      aria-label={open ? labels.collapseWip : labels.expandWip}
                      data-testid={`bom-wip-toggle-${l.id}`}
                      className="mr-1 inline-flex items-center"
                      style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit' }}
                    >
                      <span aria-hidden style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>
                        ▸
                      </span>
                    </button>
                  ) : null}
                  {l.lineNo}
                </td>
                <td className="mono">
                  {l.componentCode}
                  {l.isPhantom ? <span className="badge badge-gray" style={{ marginLeft: 8 }}>{labels.phantomBadge}</span> : null}
                  {l.componentName ? <div className="muted" style={{ fontSize: 12 }}>{l.componentName}</div> : null}
                  {isSubstituteEligible(l.componentType) && l.substituteCode ? (
                    <div className="muted" style={{ fontSize: 12 }} data-testid={`bom-line-substitute-${l.id}`}>
                      {labels.substituteLabel}{' '}
                      <span className="mono">{l.substituteCode}</span>
                      {l.substituteName ? <> — {l.substituteName}</> : null}
                    </div>
                  ) : null}
                </td>
                <td>
                  <span className={`badge ${typeTone}`}>{l.componentType ?? '—'}</span>
                </td>
                <td className="mono tabular-nums" style={{ textAlign: 'right' }}>
                  {l.quantity}
                  {perBoxActive ? (
                    <>
                      <div className="muted" style={{ fontSize: 11 }} data-testid={`bom-line-perbox-${l.id}`}>
                        {interpolate(labels.perBoxBasis, { n: eachPerBox! })}
                      </div>
                      <div className="muted" style={{ fontSize: 11 }} data-testid={`bom-line-perpack-${l.id}`}>
                        {interpolate(labels.perPackValue, { value: fmtQty(qtyNum / eachPerBox!) })}
                      </div>
                    </>
                  ) : null}
                </td>
                <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{l.uom}</td>
                <td className="mono tabular-nums" style={{ textAlign: 'right' }}>
                  {scrap > 0 ? `${scrap.toFixed(1)}%` : '—'}
                </td>
                <td>{l.manufacturingOperationName ?? '—'}</td>
                {showActions ? (
                  <td style={{ textAlign: 'right' }}>
                    <BomLineRowActions
                      target={{
                        bomHeaderId: selectedHeaderId!,
                        lineId: l.id,
                        componentCode: l.componentCode,
                        quantity: l.quantity,
                        uom: l.uom,
                        notes: l.manufacturingOperationName ?? null,
                      }}
                      editable={isEditable}
                      canEdit={canEditLines}
                    />
                  </td>
                ) : null}
              </tr>
              {wip && open ? (
                <tr data-testid={`bom-wip-subrow-${l.id}`}>
                  <td colSpan={colSpan} style={{ padding: 0, background: 'var(--surface-muted, transparent)' }}>
                    <WipSubBom state={state} labels={labels} perBoxActive={perBoxActive} eachPerBox={eachPerBox} />
                  </td>
                </tr>
              ) : null}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function WipSubBom({
  state,
  labels,
  perBoxActive,
  eachPerBox,
}: {
  state: Loadable | undefined;
  labels: BomDetailLabels;
  perBoxActive: boolean;
  eachPerBox: number | null;
}) {
  if (!state || state.status === 'idle' || state.status === 'loading') {
    return (
      <div role="status" aria-live="polite" className="muted" style={{ padding: '10px 16px', fontSize: 12 }}>
        {labels.wipSubBomLoading}
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div role="alert" className="muted" style={{ padding: '10px 16px', fontSize: 12, color: 'var(--danger, #b00)' }}>
        {labels.wipSubBomError}
      </div>
    );
  }
  if (state.lines.length === 0) {
    return (
      <div className="muted" style={{ padding: '10px 16px', fontSize: 12 }} data-testid="bom-wip-subbom-empty">
        {labels.wipSubBomEmpty}
      </div>
    );
  }
  return (
    <div style={{ padding: '8px 16px 12px 32px' }}>
      <table aria-label={labels.tabComponents}>
        <thead>
          <tr>
            <th scope="col">{labels.colLine}</th>
            <th scope="col">{labels.colComponent}</th>
            <th scope="col">{labels.colType}</th>
            <th scope="col" style={{ textAlign: 'right' }}>{labels.colQty}</th>
            <th scope="col">{labels.colUom}</th>
            <th scope="col" style={{ textAlign: 'right' }}>{labels.colScrap}</th>
          </tr>
        </thead>
        <tbody>
          {state.lines.map((sl) => {
            const scrap = Number(sl.scrapPct);
            const qtyNum = Number(sl.quantity);
            return (
              <tr key={sl.id} data-testid="bom-wip-subline-row">
                <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{sl.lineNo}</td>
                <td className="mono">
                  {sl.componentCode}
                  {sl.isPhantom ? <span className="badge badge-gray" style={{ marginLeft: 8 }}>{labels.phantomBadge}</span> : null}
                  {(sl.componentType ?? '').toUpperCase() !== 'WIP' && sl.substituteCode ? (
                    <div className="muted" style={{ fontSize: 12 }}>
                      {labels.substituteLabel} <span className="mono">{sl.substituteCode}</span>
                      {sl.substituteName ? <> — {sl.substituteName}</> : null}
                    </div>
                  ) : null}
                </td>
                <td>{sl.componentType ?? '—'}</td>
                <td className="mono tabular-nums" style={{ textAlign: 'right' }}>
                  {sl.quantity}
                  {perBoxActive && eachPerBox ? (
                    <div className="muted" style={{ fontSize: 11 }}>
                      {interpolate(labels.perPackValue, { value: fmtQty(qtyNum / eachPerBox) })}
                    </div>
                  ) : null}
                </td>
                <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{sl.uom}</td>
                <td className="mono tabular-nums" style={{ textAlign: 'right' }}>
                  {scrap > 0 ? `${scrap.toFixed(1)}%` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
