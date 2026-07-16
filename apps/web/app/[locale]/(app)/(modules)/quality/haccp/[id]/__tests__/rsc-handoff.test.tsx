/**
 * C106 — HACCP plan detail RSC boundary (React #418 / t-to-client).
 *
 * The async page must not pass next-intl's `t` translator into PlanDetailClient;
 * limit copy is pre-resolved via labels on the server.
 */
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlanDetailClient } from '../_components/plan-detail.client';
import {
  buildCcpAddLabels,
  buildCcpRowActionsLabels,
  buildPlanActivateLabels,
  buildPlanDetailLabels,
  type Translator,
} from '../../_components/labels';
import type { HaccpPlan, HaccpPlanCcp } from '../../_components/haccp-contracts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const passthroughT = ((key: string) => key) as Translator;
const DETAIL_LABELS = buildPlanDetailLabels(passthroughT);
const CCP_ADD_LABELS = buildCcpAddLabels(passthroughT);
const CCP_ROW_ACTIONS_LABELS = buildCcpRowActionsLabels(passthroughT);
const ACTIVATE_LABELS = buildPlanActivateLabels(passthroughT);

const PLAN: HaccpPlan = {
  id: 'plan-1',
  name: 'Cooked meats line A',
  scopeType: 'product',
  scopeRef: 'FG-001',
  siteId: null,
  version: 1,
  status: 'draft',
  approvedBy: null,
  approvedAt: null,
  createdBy: null,
  createdAt: '2026-06-18T10:00:00.000Z',
  updatedAt: '2026-06-18T10:00:00.000Z',
  ccps: [
    {
      id: 'ccp-1',
      ccpCode: 'CCP-01',
      name: 'Cooking temperature',
      processStep: 'Cooking',
      hazardType: 'biological',
      criticalLimitMin: '72',
      criticalLimitMax: null,
      unit: '°C',
      monitoringFrequency: 'Each batch',
      correctiveAction: '',
      lineId: null,
      isActive: true,
      createdAt: '2026-06-18T10:00:00.000Z',
      updatedAt: '2026-06-18T10:00:00.000Z',
    } satisfies HaccpPlanCcp,
  ],
};

describe('/quality/haccp/[id] — PlanDetailClient RSC handoff (C106)', () => {
  it('renders without passing a translator across the server→client boundary', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/[locale]/(app)/(modules)/quality/haccp/[id]/page.tsx'),
      'utf8',
    );
    const clientProps = source.match(/<PlanDetailClient[\s\S]*?\/>/s)?.[0] ?? '';

    expect(clientProps).toContain('labels={labels}');
    expect(clientProps).not.toMatch(/\bt=\{/);

    render(
      <PlanDetailClient
        plan={PLAN}
        labels={DETAIL_LABELS}
        ccpAddLabels={CCP_ADD_LABELS}
        ccpRowActionsLabels={CCP_ROW_ACTIONS_LABELS}
        activateLabels={ACTIVATE_LABELS}
        canEdit
        upsertCcpAction={vi.fn() as never}
        deactivateCcpAction={vi.fn() as never}
        activatePlanAction={vi.fn() as never}
      />,
    );

    expect(screen.getByTestId('haccp-detail-header')).toBeInTheDocument();
    expect(screen.getByTestId('haccp-ccp-table')).toBeInTheDocument();
    expect(screen.getByTestId('haccp-ccp-limit-ccp-1')).toBeInTheDocument();
  });
});
