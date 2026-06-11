/**
 * WAREHOUSE INBOUND SCHEDULE — RTL parity + state + i18n + partition tests.
 *
 * No dedicated prototype: parity basis is the warehouse dashboard + GRN-list
 * family (dense table, mono doc link, status Badge, counted Card sections,
 * em-dash for absent values). Tests the pure server `partitionInbound` against
 * fixture dates (today / overdue / upcoming, no-date → upcoming, ordering) and
 * the presentational <InboundScheduleClient> directly (the page is an async RSC
 * that reads PLANNING via list actions + renders denied / error panels).
 *
 * Asserts: today/overdue/upcoming partition off fixture dates, mono links target
 * the correct planning detail route, per-section + global empty states, type
 * chip + status badge, line count em-dash for TOs, and that the en + pl staged
 * bundles resolve every label (no leaked dotted key).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  InboundScheduleClient,
  type InboundLabels,
  type InboundRow,
} from '../inbound-schedule.client';
import { partitionInbound } from '../../page';
import { getWhInboundTranslator } from '../../wh-inbound-labels';

const TODAY = '2026-06-11';

function buildLabels(locale: string): InboundLabels {
  const t = getWhInboundTranslator(locale);
  return {
    sections: {
      today: t('inbound.sections.today'),
      todaySub: t('inbound.sections.todaySub'),
      overdue: t('inbound.sections.overdue'),
      overdueSub: t('inbound.sections.overdueSub'),
      upcoming: t('inbound.sections.upcoming'),
      upcomingSub: t('inbound.sections.upcomingSub'),
    },
    columns: {
      doc: t('inbound.columns.doc'),
      type: t('inbound.columns.type'),
      party: t('inbound.columns.party'),
      expected: t('inbound.columns.expected'),
      status: t('inbound.columns.status'),
      lines: t('inbound.columns.lines'),
    },
    type: { po: t('inbound.type.po'), to: t('inbound.type.to') },
    status: {
      sent: t('inbound.status.sent'),
      confirmed: t('inbound.status.confirmed'),
      partially_received: t('inbound.status.partially_received'),
      draft: t('inbound.status.draft'),
      in_transit: t('inbound.status.in_transit'),
    },
    noDate: t('inbound.noDate'),
    overdueBy: t('inbound.overdueBy'),
    todayMarker: t('inbound.today_marker'),
    empty: {
      today: t('inbound.empty.today'),
      overdue: t('inbound.empty.overdue'),
      upcoming: t('inbound.empty.upcoming'),
      all: t('inbound.empty.all'),
    },
  };
}

const EN = buildLabels('en');

function poRow(over: Partial<InboundRow>): InboundRow {
  return {
    id: over.id ?? 'po-1',
    type: 'po',
    docNumber: over.docNumber ?? 'PO-0001',
    href: over.href ?? '/en/planning/purchase-orders/p1',
    party: over.party ?? 'ACME Foods',
    status: over.status ?? 'confirmed',
    expectedDate: over.expectedDate ?? TODAY,
    lineCount: over.lineCount ?? 3,
    overdueDays: 0,
    ...over,
  };
}

function toRow(over: Partial<InboundRow>): InboundRow {
  return {
    id: over.id ?? 'to-1',
    type: 'to',
    docNumber: over.docNumber ?? 'TO-0001',
    href: over.href ?? '/en/planning/transfer-orders/t1',
    party: over.party ?? 'WH-A → WH-B',
    status: over.status ?? 'in_transit',
    expectedDate: over.expectedDate ?? TODAY,
    lineCount: null,
    overdueDays: 0,
    ...over,
  };
}

describe('partitionInbound', () => {
  it('places expectedDate === today into "today"', () => {
    const { today, overdue, upcoming } = partitionInbound([poRow({ id: 'po-1', expectedDate: TODAY })], TODAY);
    expect(today.map((r) => r.id)).toEqual(['po-1']);
    expect(overdue).toHaveLength(0);
    expect(upcoming).toHaveLength(0);
  });

  it('places a past date into "overdue" with the whole-day gap computed', () => {
    const { overdue } = partitionInbound([poRow({ id: 'po-1', expectedDate: '2026-06-08' })], TODAY);
    expect(overdue.map((r) => r.id)).toEqual(['po-1']);
    expect(overdue[0].overdueDays).toBe(3); // 06-08 → 06-11
  });

  it('places a future date OR a null date into "upcoming"', () => {
    const { upcoming } = partitionInbound(
      [poRow({ id: 'po-future', expectedDate: '2026-06-20' }), toRow({ id: 'to-nodate', expectedDate: null })],
      TODAY,
    );
    expect(upcoming.map((r) => r.id)).toContain('po-future');
    expect(upcoming.map((r) => r.id)).toContain('to-nodate');
  });

  it('sorts overdue oldest-first and upcoming soonest-first with no-date last', () => {
    const { overdue, upcoming } = partitionInbound(
      [
        poRow({ id: 'od-recent', expectedDate: '2026-06-10' }),
        poRow({ id: 'od-old', expectedDate: '2026-06-01' }),
        poRow({ id: 'up-late', expectedDate: '2026-07-01' }),
        poRow({ id: 'up-soon', expectedDate: '2026-06-15' }),
        toRow({ id: 'up-nodate', expectedDate: null }),
      ],
      TODAY,
    );
    expect(overdue.map((r) => r.id)).toEqual(['od-old', 'od-recent']);
    expect(upcoming.map((r) => r.id)).toEqual(['up-soon', 'up-late', 'up-nodate']);
  });
});

describe('InboundScheduleClient', () => {
  it('renders all three sections with counts and the doc links to planning detail', () => {
    render(
      <InboundScheduleClient
        today={[poRow({ id: 'po-1', docNumber: 'PO-0001', href: '/en/planning/purchase-orders/p1' })]}
        overdue={[toRow({ id: 'to-1', docNumber: 'TO-0001', href: '/en/planning/transfer-orders/t1', expectedDate: '2026-06-08', overdueDays: 3 })]}
        upcoming={[poRow({ id: 'po-2', docNumber: 'PO-0002', expectedDate: '2026-06-20', href: '/en/planning/purchase-orders/p2' })]}
        labels={EN}
      />,
    );

    expect(screen.getByTestId('inbound-count-today')).toHaveTextContent('1');
    expect(screen.getByTestId('inbound-count-overdue')).toHaveTextContent('1');
    expect(screen.getByTestId('inbound-count-upcoming')).toHaveTextContent('1');

    // Mono links target the correct planning detail routes (PO vs TO).
    expect(screen.getByTestId('inbound-link-po-1')).toHaveAttribute('href', '/en/planning/purchase-orders/p1');
    expect(screen.getByTestId('inbound-link-to-1')).toHaveAttribute('href', '/en/planning/transfer-orders/t1');
  });

  it('shows the overdue-by badge and the type chips (PO / TO)', () => {
    render(
      <InboundScheduleClient
        today={[]}
        overdue={[poRow({ id: 'po-1', expectedDate: '2026-06-06', overdueDays: 5 })]}
        upcoming={[toRow({ id: 'to-1', expectedDate: '2026-06-20' })]}
        labels={EN}
      />,
    );
    expect(screen.getByTestId('inbound-expected-po-1')).toHaveTextContent('Overdue 5d');
    expect(screen.getByTestId('inbound-type-po-1')).toHaveTextContent('PO');
    expect(screen.getByTestId('inbound-type-to-1')).toHaveTextContent('TO');
  });

  it('renders an em-dash for TO line counts and the real number for POs', () => {
    render(
      <InboundScheduleClient
        today={[poRow({ id: 'po-1', lineCount: 7 }), toRow({ id: 'to-1' })]}
        overdue={[]}
        upcoming={[]}
        labels={EN}
      />,
    );
    expect(screen.getByTestId('inbound-lines-po-1')).toHaveTextContent('7');
    expect(screen.getByTestId('inbound-lines-to-1')).toHaveTextContent('—');
  });

  it('renders honest per-section empty states when a section has no rows', () => {
    render(
      <InboundScheduleClient
        today={[]}
        overdue={[]}
        upcoming={[poRow({ id: 'po-1', expectedDate: '2026-06-20' })]}
        labels={EN}
      />,
    );
    expect(screen.getByTestId('inbound-empty-today')).toHaveTextContent(EN.empty.today);
    expect(screen.getByTestId('inbound-empty-overdue')).toHaveTextContent(EN.empty.overdue);
    expect(screen.queryByTestId('inbound-empty-upcoming')).not.toBeInTheDocument();
  });

  it('renders the GLOBAL empty state when nothing is open', () => {
    render(<InboundScheduleClient today={[]} overdue={[]} upcoming={[]} labels={EN} />);
    expect(screen.getByTestId('inbound-empty-all')).toHaveTextContent(EN.empty.all);
    expect(screen.queryByTestId('inbound-schedule')).not.toBeInTheDocument();
  });

  it('resolves every label in both en and pl with no leaked dotted key', () => {
    for (const locale of ['en', 'pl']) {
      const labels = buildLabels(locale);
      const flat = JSON.stringify(labels);
      // A leaked key would contain a dotted segment like "inbound.sections.today".
      expect(flat).not.toMatch(/inbound\.[a-zA-Z]/);
      expect(labels.sections.today.length).toBeGreaterThan(0);
      expect(labels.empty.all.length).toBeGreaterThan(0);
    }
    // pl actually differs from en (real translation, not an EN echo).
    expect(buildLabels('pl').sections.today).not.toBe(EN.sections.today);
  });

  it('uses pl labels when the pl bundle is selected', () => {
    const PL = buildLabels('pl');
    render(
      <InboundScheduleClient
        today={[poRow({ id: 'po-1' })]}
        overdue={[]}
        upcoming={[]}
        labels={PL}
      />,
    );
    const section = screen.getByTestId('inbound-section-today');
    expect(within(section).getByText(PL.sections.today)).toBeInTheDocument();
  });
});
