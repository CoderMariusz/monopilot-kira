/**
 * @vitest-environment jsdom
 *
 * C2 — Formulation (Recipe) page mounts the read-only shared BOM preview after
 * FormulationWipPanel. Injected path skips getFaBom and degrades to empty BOM.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getFaBomMock, getFormulationMock, withOrgContextMock } = vi.hoisted(() => ({
  getFaBomMock: vi.fn(),
  getFormulationMock: vi.fn(),
  withOrgContextMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/pipeline/p1/formulation',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (req?: { locale?: string; namespace?: string }) => {
    const ns = req?.namespace ?? '';
    const fallbacks: Record<string, Record<string, string>> = {
      'npd.faBomTab': {
        title: 'BOM (computed view)',
        readOnlyNote: 'Read-only view of the shared BOM. Bills of materials are edited in Technical.',
        empty: 'No BOM yet',
        emptyBody: 'This Finished Good has no bill of materials.',
        technicalLink: 'Open in Technical',
        forbidden: 'You do not have permission to view this BOM.',
        error: 'Unable to load the BOM.',
      },
    };
    const messages = fallbacks[ns] ?? {};
    return (key: string) => messages[key] ?? key;
  }),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

vi.mock('../../../../../../(npd)/pipeline/[projectId]/formulation/_actions/get-formulation', () => ({
  getFormulation: (...args: unknown[]) => getFormulationMock(...args),
}));

vi.mock('../../../../(modules)/technical/allergens-config/_actions/load-config', () => ({
  loadAllergensConfig: vi.fn(async () => ({ state: 'ready' as const, allergens: [] })),
}));

vi.mock('../_lib/get-stale-wip-refs', () => ({
  getStaleWipRefs: vi.fn(async () => ({ staleDefinitions: [], canAccept: false })),
}));

vi.mock('../../../../../../../(npd)/fa/_actions/load-formulation-wip-panel', () => ({
  loadFormulationWipPanel: vi.fn(async () => ({ state: 'no_fg_linked' as const })),
}));

vi.mock('./_components/formulation-wip-panel', () => ({
  FormulationWipPanel: () => <section data-testid="formulation-wip-no-fg">WIP panel</section>,
}));

vi.mock('../_components/stale-wip-definition-banner', () => ({
  StaleWipDefinitionBanner: () => null,
}));

vi.mock('../../../fg/[productCode]/_actions/get-fa-bom', () => ({
  getFaBom: (...args: unknown[]) => getFaBomMock(...args),
}));

import FormulationPage from './page';
import type { FormulationEditorData } from './_components/formulation-editor';
import { AuthError } from '../../../../../../(npd)/fa/actions/errors';

const READY_DATA: FormulationEditorData = {
  projectId: '11111111-1111-4111-8111-111111111111',
  versionId: '22222222-2222-4222-8222-222222222222',
  versionNumber: 1,
  state: 'draft',
  productCode: 'FG-NPD-001',
  batchSizeKg: '0.200',
  packWeightG: '200',
  targetPriceEur: '3.98',
  targetYieldPct: '78',
  versions: [{ id: '22222222-2222-4222-8222-222222222222', versionNumber: 1 }],
  ingredients: [
    {
      id: 'a1',
      rmCode: 'RM-1001',
      name: 'Pork shoulder',
      qtyKg: '0.170',
      pct: '85',
      costPerKgEur: '4.20',
      sequence: 1,
    },
  ],
};

const READY_FORMULATION = {
  ok: true as const,
  data: {
    formulation: {
      id: 'f1',
      projectId: 'p1',
      productCode: 'FG-NPD-001',
      lockedAt: null,
      lockedByUser: null,
    },
    currentVersion: {
      id: 'v1',
      versionNumber: 1,
      state: 'draft',
      batchSizeKg: '0.200',
      targetYieldPct: '78',
      targetPriceEur: '3.98',
      processingOverheadPct: null,
    },
    ingredients: [
      {
        id: 'a1',
        rm_code: 'RM-1001',
        item_id: null,
        wip_definition_id: null,
        wip_definition_name: null,
        item_name: 'Pork shoulder',
        substitute_item_id: null,
        substitute_item_code: null,
        substitute_item_name: null,
        npd_wip_process_id: null,
        qty_kg: '0.170',
        pct: '85',
        cost_per_kg_eur: '4.20',
        allergens_inherited: [],
        sequence: 1,
        nutrition_per_100g: null,
      },
    ],
    cachedCalc: null,
  },
};

function wireOrgContext() {
  withOrgContextMock.mockImplementation(async (cb: (ctx: unknown) => Promise<unknown>) => {
    const client = {
      query: vi.fn(async () => ({ rows: [] })),
    };
    return cb({ userId: 'u1', orgId: 'o1', client });
  });
}

async function renderPage(args: {
  state?: string;
  data?: FormulationEditorData | null;
  canEdit?: boolean;
} = {}) {
  const ui = await FormulationPage({
    params: Promise.resolve({ locale: 'en', projectId: 'p1' }),
    canEdit: false,
    ...args,
  });
  return render(ui as React.ReactElement);
}

beforeEach(() => {
  wireOrgContext();
  getFormulationMock.mockResolvedValue(READY_FORMULATION);
});

afterEach(() => {
  cleanup();
  getFaBomMock.mockReset();
  getFormulationMock.mockReset();
  withOrgContextMock.mockReset();
});

describe('Formulation page — C2 read-only BOM preview', () => {
  it('renders FaBomTab empty state after FormulationWipPanel on the injected path', async () => {
    await renderPage({ state: 'ready', data: READY_DATA });

    const wip = screen.getByTestId('formulation-wip-no-fg');
    const bom = screen.getByTestId('fa-bom-tab');
    expect(wip).toBeInTheDocument();
    expect(bom).toBeInTheDocument();
    expect(wip.compareDocumentPosition(bom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('fa-bom-empty')).toHaveTextContent('No BOM yet');
    expect(screen.getByTestId('fa-bom-technical-link')).toHaveAttribute('href', '/en/technical/bom');
    expect(getFaBomMock).not.toHaveBeenCalled();
  });

  it('does not render CSV export on the read-only Recipe BOM preview', async () => {
    await renderPage({ state: 'ready', data: READY_DATA });
    expect(screen.queryByTestId('fa-bom-export')).not.toBeInTheDocument();
  });

  it('production path: calls getFaBom and renders ready BOM lines', async () => {
    getFaBomMock.mockResolvedValue({
      state: 'ready',
      version: { bomHeaderId: 'b1', status: 'active', version: 2, lineCount: 1 },
      lines: [
        {
          componentType: 'rm',
          componentCode: 'RM-1',
          componentName: 'Salt',
          quantity: '0.010',
          processStage: 'mix',
          source: 'formulation',
          d365Status: 'found',
        },
      ],
    });

    await renderPage();

    expect(getFormulationMock).toHaveBeenCalled();
    expect(getFaBomMock).toHaveBeenCalledWith('FG-NPD-001');
    expect(screen.getByTestId('fa-bom-table')).toBeInTheDocument();
    expect(screen.getByText('Salt')).toBeInTheDocument();
  });

  it('production path: maps AuthError from getFaBom to permission_denied', async () => {
    getFaBomMock.mockRejectedValue(
      new AuthError('FORBIDDEN', 'npd.fa.read is required to read the FA BOM'),
    );

    await renderPage();

    expect(getFaBomMock).toHaveBeenCalledWith('FG-NPD-001');
    expect(screen.getByTestId('fa-bom-forbidden')).toHaveTextContent(
      'You do not have permission to view this BOM.',
    );
  });
});
