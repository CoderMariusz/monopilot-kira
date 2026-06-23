/**
 * Wave E2A — Recall Drills list client island: RTL parity + state + i18n.
 *
 * Spec-driven (nearest reusable pattern = the sibling quality list screens). The
 * list renders getRecallDrills() with the KPI duration (start→complete, formatted
 * + compared to the 4h target badge), input ref, direction and date; a [New drill]
 * CTA links to /quality/trace; each row links to the drill detail.
 *
 * Covers: rows render the human input ref + direction + formatted duration + a
 * within/over-target badge; in-progress (no completion) shows the pending state;
 * empty-with-CTA; [New drill] CTA href; row deep-links to the drill detail; NO
 * raw UUID leak in a row's visible cells; i18n en + pl.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import en from '../../../../../../../../i18n/en.json';
import pl from '../../../../../../../../i18n/pl.json';

import { RecallDrillsList } from '../recall-drills-list.client';
import { buildRecallDrillsLabels, formatDuration, RECALL_TARGET_MS, type Translator } from '../../../trace/_components/labels';
import type { RecallDrill } from '../../../trace/_components/trace-contracts';

function makeT(locale: 'en' | 'pl'): Translator {
  const ns = (locale === 'pl' ? pl : en).quality.recallDrills as Record<string, unknown>;
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
const LABELS = buildRecallDrillsLabels(tEn);

function makeDrill(over: Partial<RecallDrill> = {}): RecallDrill {
  return {
    id: over.id ?? 'drill-1',
    inputType: over.inputType ?? 'lp',
    inputRef: over.inputRef ?? 'LP-IN-7',
    direction: over.direction ?? 'both',
    startedAt: over.startedAt ?? '2026-06-23T10:00:00.000Z',
    completedAt: 'completedAt' in over ? (over.completedAt ?? null) : '2026-06-23T10:02:00.000Z',
    durationMs: 'durationMs' in over ? (over.durationMs ?? null) : 120000,
    result: over.result ?? null,
    isDrill: over.isDrill ?? true,
    initiatedBy: over.initiatedBy ?? null,
    createdAt: over.createdAt ?? '',
    updatedAt: over.updatedAt ?? '',
  };
}

function renderList(drills: RecallDrill[]) {
  render(
    <RecallDrillsList
      drills={drills}
      labels={LABELS}
      locale="en"
      newDrillHref="/en/quality/trace"
      t={tEn}
    />,
  );
}

describe('RecallDrillsList (E2A parity)', () => {
  it('renders one row per drill with the input ref, direction and a within-target badge for a fast drill', () => {
    renderList([makeDrill({ id: 'drill-1', inputRef: 'LP-IN-7', direction: 'both', durationMs: 120000 })]);
    const row = screen.getByTestId('recall-drill-row-drill-1');
    expect(row).toHaveTextContent('LP-IN-7');
    expect(row).toHaveTextContent(LABELS.direction.both);
    expect(within(row).getByTestId('recall-drill-duration-drill-1')).toHaveTextContent(
      formatDuration(tEn, 120000),
    );
    expect(within(row).getByTestId('recall-drill-badge-drill-1')).toHaveTextContent(LABELS.withinTarget);
  });

  it('shows the OVER-target badge when the drill duration exceeds the 4h target', () => {
    renderList([makeDrill({ id: 'slow', durationMs: RECALL_TARGET_MS + 60000 })]);
    expect(screen.getByTestId('recall-drill-badge-slow')).toHaveTextContent(LABELS.overTarget);
  });

  it('shows the IN-PROGRESS state for a drill that has not been completed', () => {
    renderList([makeDrill({ id: 'open', completedAt: null, durationMs: null })]);
    expect(screen.getByTestId('recall-drill-badge-open')).toHaveTextContent(LABELS.inProgress);
  });

  it('EMPTY state: no drills renders the empty-with-CTA panel linking to the trace screen', () => {
    renderList([]);
    const empty = screen.getByTestId('recall-drills-empty');
    expect(empty).toHaveAttribute('data-state', 'empty');
    expect(empty).toHaveTextContent(LABELS.states.emptyTitle);
    expect(screen.getByTestId('recall-drills-empty-cta')).toHaveAttribute('href', '/en/quality/trace');
  });

  it('[New drill] CTA links to the trace screen', () => {
    renderList([makeDrill({ id: 'd1' })]);
    expect(screen.getByTestId('recall-drills-new')).toHaveAttribute('href', '/en/quality/trace');
  });

  it('a drill row deep-links to its detail screen', () => {
    renderList([makeDrill({ id: 'd1' })]);
    expect(screen.getByTestId('recall-drill-link-d1')).toHaveAttribute('href', '/en/quality/recall-drills/d1');
  });

  it('never renders a raw UUID in a row (rule 0.11)', () => {
    renderList([makeDrill({ id: '11111111-2222-4333-8444-555555555555', inputRef: 'LP-IN-7' })]);
    const row = screen.getByTestId('recall-drill-row-11111111-2222-4333-8444-555555555555');
    // the visible cells (within the row) must not contain a UUID string.
    expect(row.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

describe('Recall drills i18n (no leaked dotted keys)', () => {
  it('resolves every recall-drills label in en and pl', () => {
    for (const t of [tEn, tPl]) {
      const labels = buildRecallDrillsLabels(t);
      const flat = JSON.stringify(labels);
      expect(flat).not.toMatch(/[a-z]+\.[a-z]+\.[a-zA-Z]/);
    }
  });

  it('en + pl differ (real translations, not an en clone)', () => {
    expect(tPl('title')).not.toBe(tEn('title'));
    expect(tPl('newDrill')).not.toBe(tEn('newDrill'));
  });
});
