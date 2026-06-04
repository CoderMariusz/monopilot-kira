/**
 * @vitest-environment jsdom
 * T-040 / TEC-023 — BOM Version Diff view RTL.
 *
 * Parity anchor: bom-detail.jsx:373-468 (bom_versions_tab compare panel).
 * Asserts the side-by-side added/removed/changed regions with the design color
 * tokens (added=success, removed=destructive, changed=warning), the empty
 * "No differences" state (AC2), and that a removed line renders under the
 * destructive Removed region (AC3).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BomVersionDiff } from '../bom-version-diff.client';
import type { BomDiff } from '../../_actions/diff';

function emptyDiff(): BomDiff {
  return {
    header: [],
    lines: { added: [], removed: [], changed: [] },
    co_products: { added: [], removed: [], changed: [] },
  };
}

const line = (id: string, code: string) => ({
  id,
  lineNo: 1,
  itemId: null,
  componentCode: code,
  componentType: 'RM',
  quantity: '1.000',
  uom: 'kg',
  scrapPct: '0',
  manufacturingOperationName: null,
  sequence: null,
  isPhantom: false,
});

afterEach(() => cleanup());

describe('BomVersionDiff (TEC-023)', () => {
  it('shows the "No differences" empty state (AC2)', () => {
    render(<BomVersionDiff diff={emptyDiff()} fromVersion={1} toVersion={2} />);
    const empty = screen.getByText('No differences');
    expect(empty).toBeInTheDocument();
    expect(empty.closest('[data-state="empty"]')).not.toBeNull();
  });

  it('renders a removed line under the destructive Removed region (AC3)', () => {
    const diff = emptyDiff();
    diff.lines.removed.push(line('l-1', 'RM-DROP'));
    render(<BomVersionDiff diff={diff} fromVersion={1} toVersion={2} />);
    const removed = document.querySelector('[data-region="removed"]');
    expect(removed).not.toBeNull();
    expect(screen.getByText('RM-DROP')).toBeInTheDocument();
    // destructive token: red border + line-through on the removed row
    expect(removed?.className).toMatch(/border-red-200/);
  });

  it('renders added (success) + changed (warning) regions with the right tokens', () => {
    const diff = emptyDiff();
    diff.lines.added.push(line('l-add', 'RM-NEW'));
    diff.lines.changed.push({
      key: 'l-chg',
      componentCode: 'RM-CHG',
      quantity: { from: '1.000', to: '2.000', delta: '1', percentChange: 100 },
    });
    render(<BomVersionDiff diff={diff} fromVersion={6} toVersion={7} />);
    const added = document.querySelector('[data-region="added"]');
    const changed = document.querySelector('[data-region="changed"]');
    expect(added?.className).toMatch(/border-green-200/);
    expect(changed?.className).toMatch(/border-amber-200/);
    expect(screen.getByText('RM-NEW')).toBeInTheDocument();
    expect(screen.getByText('RM-CHG')).toBeInTheDocument();
    expect(screen.getByText('Comparing v6 → v7')).toBeInTheDocument();
  });

  it('renders header field changes when present', () => {
    const diff = emptyDiff();
    diff.header.push({ field: 'yieldPct', from: '98', to: '97' });
    render(<BomVersionDiff diff={diff} fromVersion={1} toVersion={2} />);
    expect(screen.getByText('Header changes')).toBeInTheDocument();
    expect(screen.getByText('yieldPct')).toBeInTheDocument();
  });
});
