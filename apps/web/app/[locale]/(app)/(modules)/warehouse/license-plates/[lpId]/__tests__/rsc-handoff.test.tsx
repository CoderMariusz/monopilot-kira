/**
 * C085 — LP detail RSC boundary (React #418 / hydration + t-to-client guard).
 */
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LpDetailClient } from '../_components/lp-detail.client';
import { buildLpDetailLabels } from '../_components/lp-detail-labels';
import type { LicensePlateDetail } from '../../../_actions/shared';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const LABELS = buildLpDetailLabels('en');

const DETAIL = {
  id: 'lp-1',
  lpNumber: 'LP-1001',
  itemCode: 'FG-001',
  itemName: 'Demo product',
  quantity: '10',
  reservedQty: '0',
  availableQty: '10',
  uom: 'kg',
  status: 'available',
  qaStatus: 'released',
  batchNumber: 'B-42',
  expiryDate: '2026-08-01',
  locationCode: 'A-01',
  warehouseCode: 'WH1',
  createdAt: '2026-01-01T00:00:00.000Z',
  productId: 'prod-1',
  warehouseId: 'wh-1',
  warehouseName: 'Factory A',
  locationId: 'loc-1',
  locationName: 'A-01',
  catchWeightKg: null,
  supplierBatchNumber: null,
  bestBeforeDate: null,
  origin: 'production',
  grnId: null,
  woId: null,
  reservedForWoId: null,
  reservedForWoNumber: null,
  hasActiveHold: false,
  parentLp: null,
  childLps: [],
  stateHistory: [
    {
      id: 'h-1',
      fromState: 'received',
      toState: 'available',
      reasonCode: 'qa_release',
      reasonText: null,
      transitionedAt: '2026-06-24T14:43:00.000Z',
    },
  ],
  moves: [],
} as unknown as LicensePlateDetail;

const noopAction = vi.fn(async () => ({ ok: false as const, reason: 'forbidden' as const }));

describe('/warehouse/license-plates/[lpId] — LpDetailClient RSC handoff (C085)', () => {
  it('does not pass a translator function to the client island', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/page.tsx'),
      'utf8',
    );
    const clientProps = source.match(/<LpDetailClient[\s\S]*?\/>/s)?.[0] ?? '';

    expect(clientProps).toContain('labels={buildLpDetailLabels(locale)}');
    expect(clientProps).not.toMatch(/\bt=\{/);

    render(
      <LpDetailClient
        detail={DETAIL}
        labels={LABELS}
        locale="en"
        releaseQaAction={noopAction as never}
        blockLpAction={noopAction as never}
        unblockLpAction={noopAction as never}
        reserveLpAction={noopAction as never}
        listOpenWorkOrdersForLpReserveAction={noopAction as never}
        listLocationsAction={noopAction as never}
        createStockMoveAction={noopAction as never}
        splitLpAction={noopAction as never}
        mergeLpAction={noopAction as never}
        listSiblingLpsForMergeAction={noopAction as never}
        destroyLpAction={noopAction as never}
        updateLpMetadataAction={noopAction as never}
        printLabelAction={noopAction as never}
        canPrint={false}
      />,
    );

    expect(screen.getByTestId('lp-detail-back')).toBeInTheDocument();
    expect(screen.getByTestId('lp-detail-status')).toBeInTheDocument();
  });

  it('renders history and movement timestamps with UTC-stable formatting (no hydration mismatch)', () => {
    render(
      <LpDetailClient
        detail={DETAIL}
        labels={LABELS}
        locale="en"
        releaseQaAction={noopAction as never}
        blockLpAction={noopAction as never}
        unblockLpAction={noopAction as never}
        reserveLpAction={noopAction as never}
        listOpenWorkOrdersForLpReserveAction={noopAction as never}
        listLocationsAction={noopAction as never}
        createStockMoveAction={noopAction as never}
        splitLpAction={noopAction as never}
        mergeLpAction={noopAction as never}
        listSiblingLpsForMergeAction={noopAction as never}
        destroyLpAction={noopAction as never}
        updateLpMetadataAction={noopAction as never}
        printLabelAction={noopAction as never}
        canPrint={false}
      />,
    );

    fireEvent.click(screen.getByTestId('lp-detail-tab-history'));
    expect(screen.getByText('2026-06-24 14:43')).toBeInTheDocument();

    const clientSource = readFileSync(
      join(
        process.cwd(),
        'app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_components/lp-detail.client.tsx',
      ),
      'utf8',
    );
    expect(clientSource).toContain('formatUtcIsoMinute');
    expect(clientSource).not.toMatch(/function fmtDate\(/);

    const auditMountSource = readFileSync(
      join(
        process.cwd(),
        'app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_components/lp-audit-timeline-mount.client.tsx',
      ),
      'utf8',
    );
    expect(auditMountSource).toContain('useEffect');
    expect(auditMountSource).toMatch(/if \(!mounted\)/);
  });
});
