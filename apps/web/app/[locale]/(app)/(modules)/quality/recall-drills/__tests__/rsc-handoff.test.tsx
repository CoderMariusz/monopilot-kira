/**
 * C106 — Recall Drills list RSC boundary (React #418 / t-to-client).
 *
 * The async page must not pass next-intl's `t` translator into RecallDrillsList;
 * duration copy is pre-resolved via labels on the server.
 */
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RecallDrillsList } from '../_components/recall-drills-list.client';
import { buildRecallDrillsLabels, type Translator } from '../../trace/_components/labels';
import type { RecallDrill } from '../../trace/_components/trace-contracts';

const passthroughT = ((key: string) => key) as Translator;
const LABELS = buildRecallDrillsLabels(passthroughT);

const DRILL: RecallDrill = {
  id: 'drill-1',
  inputType: 'lp',
  inputRef: 'LP-IN-7',
  direction: 'both',
  startedAt: '2026-06-23T10:00:00.000Z',
  completedAt: '2026-06-23T10:02:00.000Z',
  durationMs: 120000,
  result: null,
  isDrill: true,
  initiatedBy: null,
  createdAt: '',
  updatedAt: '',
};

describe('/quality/recall-drills — RecallDrillsList RSC handoff (C106)', () => {
  it('renders without passing a translator across the server→client boundary', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/[locale]/(app)/(modules)/quality/recall-drills/page.tsx'),
      'utf8',
    );
    const clientProps = source.match(/<RecallDrillsList[\s\S]*?\/>/s)?.[0] ?? '';

    expect(clientProps).toContain('labels={labels}');
    expect(clientProps).not.toMatch(/\bt=\{/);

    render(
      <RecallDrillsList
        drills={[DRILL]}
        labels={LABELS}
        locale="en"
        newDrillHref="/en/quality/trace"
      />,
    );

    expect(screen.getByTestId('recall-drills-table')).toBeInTheDocument();
    expect(screen.getByTestId('recall-drill-row-drill-1')).toBeInTheDocument();
    expect(screen.getByTestId('recall-drill-duration-drill-1')).toBeInTheDocument();
  });
});
