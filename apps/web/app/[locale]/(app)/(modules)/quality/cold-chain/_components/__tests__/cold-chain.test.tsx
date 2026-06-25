/**
 * Cold-chain viewer (gaps #9) — RTL parity + state + i18n tests.
 *
 * No quality JSX prototype exists for cold-chain; this mirrors the sibling
 * quality/ccp-monitoring read-only list pattern (two tables + states). The page
 * is an async RSC that reads Supabase via listColdChainOverview and renders
 * denied / error panels server-side; here we test the presentational island
 * directly with plain props (the action returns DTOs, no network).
 *
 * Covers:
 *   - structural parity: both section tables render (ranges + checks),
 *   - pass/fail result is NOT colour-only (text label + data-result attr),
 *   - an out-of-range check carries the on-hold badge,
 *   - unbounded / null temps render the em-dash sentinel, site falls back,
 *   - EMPTY state: each table shows its honest empty panel independently,
 *   - i18n: en + pl resolve every label (no leaked dotted "a.b.c" key).
 *
 * RBAC + the loading/error/permission-denied panels live in page.tsx (the
 * server-side gate); they are exercised by the Playwright spec
 * (cold-chain.spec.ts) which mounts the route.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ColdChainView } from '../cold-chain-view.client';
import { buildColdChainLabels } from '../labels';
import type {
  ColdChainConditionCheck,
  ColdChainTempRange,
} from '../../_actions/cold-chain-view-types';

// Minimal en/pl translators backed by the real catalogs (quality.coldChain).
import enJson from '../../../../../../../../i18n/en.json';
import plJson from '../../../../../../../../i18n/pl.json';

function makeTranslator(catalog: Record<string, unknown>) {
  const ns = (catalog as { quality: { coldChain: Record<string, unknown> } }).quality.coldChain;
  return (key: string): string => {
    const parts = key.split('.');
    let cur: unknown = ns;
    for (const p of parts) {
      if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[p];
      else return key;
    }
    return typeof cur === 'string' ? cur : key;
  };
}

const tEn = makeTranslator(enJson as unknown as Record<string, unknown>);
const tPl = makeTranslator(plJson as unknown as Record<string, unknown>);
const LABELS = buildColdChainLabels(tEn);

function makeRange(over: Partial<ColdChainTempRange> = {}): ColdChainTempRange {
  return {
    id: over.id ?? 'r-1',
    itemCode: over.itemCode ?? 'RM1001',
    itemName: over.itemName ?? 'Świeża wieprzowina',
    siteName: over.siteName === undefined ? 'Zakład Kraków' : over.siteName,
    minTempC: over.minTempC === undefined ? 0 : over.minTempC,
    maxTempC: over.maxTempC === undefined ? 4 : over.maxTempC,
    requiresCheck: over.requiresCheck ?? true,
  };
}

function makeCheck(over: Partial<ColdChainConditionCheck> = {}): ColdChainConditionCheck {
  return {
    id: over.id ?? 'c-1',
    itemCode: over.itemCode ?? 'RM1001',
    itemName: over.itemName ?? 'Świeża wieprzowina',
    siteName: over.siteName === undefined ? 'Zakład Kraków' : over.siteName,
    measuredTempC: over.measuredTempC === undefined ? 2 : over.measuredTempC,
    minTempC: over.minTempC === undefined ? 0 : over.minTempC,
    maxTempC: over.maxTempC === undefined ? 4 : over.maxTempC,
    inRange: over.inRange ?? true,
    reason: over.reason ?? null,
    hasHold: over.hasHold ?? false,
    checkedAt: over.checkedAt ?? '2026-06-24T09:30:00.000Z',
  };
}

describe('ColdChainView — structural parity + data rendering', () => {
  it('renders both tables with a configured range and a passing check', () => {
    render(<ColdChainView ranges={[makeRange()]} checks={[makeCheck()]} labels={LABELS} locale="en" />);

    expect(screen.getByTestId('cold-chain-ranges')).toBeInTheDocument();
    expect(screen.getByTestId('cold-chain-checks')).toBeInTheDocument();

    const rangeRow = screen.getByTestId('cold-chain-range-r-1');
    expect(rangeRow).toHaveTextContent('RM1001');
    expect(rangeRow).toHaveTextContent('Zakład Kraków');
    expect(rangeRow).toHaveTextContent('0 °C');
    expect(rangeRow).toHaveTextContent('4 °C');

    // result is NOT colour-only: data-result attr + text label
    const result = screen.getByTestId('cold-chain-result-c-1');
    expect(result).toHaveAttribute('data-result', 'pass');
    expect(result).toHaveTextContent(LABELS.checks.pass);
  });

  it('marks an out-of-range check as fail and shows the on-hold badge', () => {
    render(
      <ColdChainView
        ranges={[makeRange()]}
        checks={[makeCheck({ id: 'c-2', inRange: false, measuredTempC: 12, hasHold: true })]}
        labels={LABELS}
        locale="en"
      />,
    );
    const result = screen.getByTestId('cold-chain-result-c-2');
    expect(result).toHaveAttribute('data-result', 'fail');
    expect(result).toHaveTextContent(LABELS.checks.fail);
    expect(screen.getByTestId('cold-chain-hold-c-2')).toHaveTextContent(LABELS.checks.hold);
  });

  it('falls back for an unbounded range temp and a null site', () => {
    render(
      <ColdChainView
        ranges={[makeRange({ id: 'r-2', maxTempC: null, siteName: null })]}
        checks={[]}
        labels={LABELS}
        locale="en"
      />,
    );
    const row = screen.getByTestId('cold-chain-range-r-2');
    expect(row).toHaveTextContent(LABELS.ranges.siteAll);
    expect(row).toHaveTextContent(LABELS.ranges.unbounded);
  });
});

describe('ColdChainView — empty states (honest, per-table)', () => {
  it('shows the ranges empty panel when there are no configured ranges', () => {
    render(<ColdChainView ranges={[]} checks={[makeCheck()]} labels={LABELS} locale="en" />);
    const empty = screen.getByTestId('cold-chain-ranges-empty');
    expect(empty).toHaveAttribute('data-state', 'empty');
    expect(empty).toHaveTextContent(LABELS.ranges.empty);
    // the checks table still renders
    expect(screen.getByTestId('cold-chain-check-c-1')).toBeInTheDocument();
  });

  it('shows the checks empty panel when no checks have been recorded', () => {
    render(<ColdChainView ranges={[makeRange()]} checks={[]} labels={LABELS} locale="en" />);
    const empty = screen.getByTestId('cold-chain-checks-empty');
    expect(empty).toHaveAttribute('data-state', 'empty');
    expect(empty).toHaveTextContent(LABELS.checks.empty);
  });
});

describe('ColdChainView — i18n (no leaked dotted keys, en + pl)', () => {
  it('every label resolves in en and pl', () => {
    const dotted = /^[a-z]+(\.[a-zA-Z]+)+$/;
    for (const t of [tEn, tPl]) {
      const labels = buildColdChainLabels(t);
      const flat: string[] = [];
      const walk = (o: unknown) => {
        if (typeof o === 'string') flat.push(o);
        else if (o && typeof o === 'object') Object.values(o).forEach(walk);
      };
      walk(labels);
      for (const v of flat) {
        expect(v.length).toBeGreaterThan(0);
        expect(v, `leaked dotted key: ${v}`).not.toMatch(dotted);
      }
    }
  });
});
