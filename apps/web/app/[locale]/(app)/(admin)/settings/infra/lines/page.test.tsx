/**
 * @vitest-environment jsdom
 * T-107 / SET-018 — Line List screen.
 *
 * RED phase: pin machine-sequence preview chips, V-SET-62 NO_MACHINE row error,
 * bulk activation continuation, RBAC disabled state, and localized AppShell route.
 * A missing production page renders an empty placeholder so RED fails on behavior
 * assertions instead of module-resolution noise.
 */
import React from 'react';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const labels: Record<string, string> = {
  title: 'Production lines',
  subtitle: 'Manage production lines and their assigned machine sequence.',
  columnLine: 'Line',
  columnStatus: 'Status',
  columnMachines: 'Machine sequence preview',
  bulkActivate: 'Bulk Activate',
  insufficientPermission: 'Insufficient permissions: settings.infra.update is required to activate production lines.',
  noMachineTitle: 'No machines assigned',
  noMachineCode: 'NO_MACHINE',
  noMachineBody: 'Assign at least one machine before activating this line. V-SET-62',
};

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => labels[key] ?? key),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

type LineStatus = 'draft' | 'active';

type MachinePreview = {
  id: string;
  code: string;
  name: string;
  seq: number;
};

type ProductionLine = {
  id: string;
  code: string;
  name: string;
  status: LineStatus;
  machines: MachinePreview[];
};

type ActivateLineInput = { lineId: string };

type ActivateLineResult =
  | { ok: true; data: { lineId: string; status: 'active' } }
  | { ok: false; code: 'NO_MACHINE'; validation: 'V-SET-62'; lineId: string; message: string };

type LinesPageProps = {
  params?: Promise<{ locale: string }>;
  lines?: ProductionLine[];
  canUpdateInfra?: boolean;
  activateLine?: (input: ActivateLineInput) => Promise<ActivateLineResult>;
};

type LinesPage = (props: LinesPageProps) => React.ReactNode | Promise<React.ReactNode>;

const line0: ProductionLine = {
  id: '00000000-0000-4000-8000-000000000100',
  code: 'LINE-0',
  name: 'Unassigned line',
  status: 'draft',
  machines: [],
};

const line4: ProductionLine = {
  id: '00000000-0000-4000-8000-000000000104',
  code: 'LINE-4',
  name: 'Cheese packing line',
  status: 'draft',
  machines: [
    { id: 'm-04-1', code: 'MIX-01', name: 'Mixer 01', seq: 1 },
    { id: 'm-04-2', code: 'CUT-02', name: 'Cutter 02', seq: 2 },
    { id: 'm-04-3', code: 'PACK-03', name: 'Packer 03', seq: 3 },
    { id: 'm-04-4', code: 'PAL-04', name: 'Palletizer 04', seq: 4 },
  ],
};

const line8: ProductionLine = {
  id: '00000000-0000-4000-8000-000000000108',
  code: 'LINE-8',
  name: 'Yogurt high-speed line',
  status: 'draft',
  machines: [
    { id: 'm-08-8', code: 'WRAP-08', name: 'Wrapper 08', seq: 8 },
    { id: 'm-08-4', code: 'FILL-04', name: 'Filler 04', seq: 4 },
    { id: 'm-08-1', code: 'DEPAL-01', name: 'Depalletizer 01', seq: 1 },
    { id: 'm-08-6', code: 'CHECK-06', name: 'Checkweigher 06', seq: 6 },
    { id: 'm-08-2', code: 'WASH-02', name: 'Washer 02', seq: 2 },
    { id: 'm-08-7', code: 'LABEL-07', name: 'Labeler 07', seq: 7 },
    { id: 'm-08-3', code: 'PAST-03', name: 'Pasteurizer 03', seq: 3 },
    { id: 'm-08-5', code: 'SEAL-05', name: 'Sealer 05', seq: 5 },
  ],
};

const lines = [line0, line4, line8];

async function loadLinesPage(): Promise<LinesPage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-018 Line List page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as LinesPage;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missingPage = /failed to load url .*\/page|cannot find module .*\/page|cannot find module.*\.\/page|failed to resolve import.*\.\/page/i.test(
      message,
    );
    if (!missingPage) throw error;
    return function MissingLinesPage() {
      return React.createElement('main', { 'data-testid': 'missing-lines-page' });
    };
  }
}

async function renderLinesPage(overrides: Partial<LinesPageProps> = {}) {
  const Page = await loadLinesPage();
  const props: LinesPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    lines,
    canUpdateInfra: true,
    activateLine: vi.fn(async (input: ActivateLineInput) => ({
      ok: true as const,
      data: { lineId: input.lineId, status: 'active' as const },
    })),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function linesTable() {
  return screen.getByRole('table', { name: /production lines/i });
}

function lineRow(name: RegExp | string) {
  return within(linesTable()).getByRole('row', { name });
}

function machinePreview(row: HTMLElement) {
  return within(row).getByTestId('settings-line-machine-preview');
}

async function selectLine(user: ReturnType<typeof userEvent.setup>, line: ProductionLine) {
  const row = lineRow(new RegExp(`${line.name}.*${line.code}`, 'i'));
  await user.click(within(row).getByRole('checkbox', { name: new RegExp(`select.*${line.name}`, 'i') }));
}

describe('SET-018 line list AppShell route contract', () => {
  it('defines the user-visible localized AppShell route instead of only a legacy settings route', () => {
    const canonicalRoute = join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/infra/lines/page.tsx');
    const legacyRoute = join(process.cwd(), 'app/[locale]/(admin)/settings/infra/lines/page.tsx');

    expect(
      existsSync(canonicalRoute),
      'T-107 must implement /en/settings/infra/lines under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(existsSync(legacyRoute), 'Legacy body-only settings route must not be the only implementation').toBe(false);
  });
});

describe('SET-018 line list behavior', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders ordered machine sequence preview chips and limits overflow to six chips plus a +N more indicator', async () => {
    await renderLinesPage();

    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('app-topbar')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /production lines/i })).toBeInTheDocument();

    const fourMachinePreview = machinePreview(lineRow(/cheese packing line.*line-4/i));
    expect(within(fourMachinePreview).getAllByTestId('settings-line-machine-chip').map((chip) => chip.textContent)).toEqual([
      expect.stringMatching(/^1\s+MIX-01/i),
      expect.stringMatching(/^2\s+CUT-02/i),
      expect.stringMatching(/^3\s+PACK-03/i),
      expect.stringMatching(/^4\s+PAL-04/i),
    ]);
    expect(within(fourMachinePreview).queryByText(/more/i)).not.toBeInTheDocument();

    const eightMachinePreview = machinePreview(lineRow(/yogurt high-speed line.*line-8/i));
    expect(within(eightMachinePreview).getAllByTestId('settings-line-machine-chip').map((chip) => chip.textContent)).toEqual([
      expect.stringMatching(/^1\s+DEPAL-01/i),
      expect.stringMatching(/^2\s+WASH-02/i),
      expect.stringMatching(/^3\s+PAST-03/i),
      expect.stringMatching(/^4\s+FILL-04/i),
      expect.stringMatching(/^5\s+SEAL-05/i),
      expect.stringMatching(/^6\s+CHECK-06/i),
    ]);
    expect(within(eightMachinePreview).getByText('+2 more')).toBeInTheDocument();
    expect(within(eightMachinePreview).queryByText(/LABEL-07|WRAP-08/i)).not.toBeInTheDocument();
  });

  it('surfaces V-SET-62 NO_MACHINE inline for one selected row while continuing successful bulk activations', async () => {
    const user = userEvent.setup();
    const activateLine = vi.fn(async (input: ActivateLineInput): Promise<ActivateLineResult> => {
      if (input.lineId === line0.id) {
        return {
          ok: false,
          code: 'NO_MACHINE',
          validation: 'V-SET-62',
          lineId: input.lineId,
          message: 'NO_MACHINE: Assign at least one machine before activating this line.',
        };
      }
      return { ok: true, data: { lineId: input.lineId, status: 'active' } };
    });
    await renderLinesPage({ activateLine });

    await selectLine(user, line0);
    await selectLine(user, line4);
    await user.click(screen.getByRole('button', { name: /bulk activate/i }));

    await waitFor(() => expect(activateLine).toHaveBeenCalledTimes(2));
    expect(activateLine).toHaveBeenCalledWith({ lineId: line0.id });
    expect(activateLine).toHaveBeenCalledWith({ lineId: line4.id });

    const noMachineRow = lineRow(/unassigned line.*line-0/i);
    expect(within(noMachineRow).getByRole('alert')).toHaveTextContent(/NO_MACHINE|V-SET-62|assign at least one machine/i);
    expect(noMachineRow).toHaveTextContent(/draft/i);
    expect(noMachineRow).not.toHaveTextContent(/active/i);
    expect(lineRow(/cheese packing line.*line-4.*active/i)).toBeInTheDocument();
  });

  it('disables Bulk Activate with an explanatory aria-label when settings.infra.update is missing', async () => {
    await renderLinesPage({ canUpdateInfra: false });

    const bulkActivateButton = screen.getByText(/bulk activate/i).closest('button');
    expect(bulkActivateButton).toBeInTheDocument();
    expect(bulkActivateButton).toBeDisabled();
    expect(bulkActivateButton).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/insufficient permissions.*settings\.infra\.update/i),
    );
  });
});
