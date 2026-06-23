import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LineStatus, type LineLiveStatus } from '../andon-types';

vi.mock('../andon-data', () => ({
  CURRENT_ORG_ID: 'current',
  getAllLinesLiveStatus: vi.fn(),
  getLineLiveStatus: vi.fn(),
}));

import OeeAndonRoutePage from '../page';
import OeeAndonLinePage from '../[lineId]/page';
import { getAllLinesLiveStatus, getLineLiveStatus } from '../andon-data';

const runningLine: LineLiveStatus = {
  id: '11111111-1111-4111-8111-111111111111',
  lineCode: 'LINE-01',
  lineName: 'Primary packing',
  status: LineStatus.Running,
  currentWONumber: 'WO-1001',
  currentProductName: 'Smoked salmon pack',
  goodCount: 128.5,
  scrapCount: 3.25,
  oeePercent: 87.4,
  lastActivityAt: '2026-06-23T10:15:00.000Z',
};

const pausedLine: LineLiveStatus = {
  id: '22222222-2222-4222-8222-222222222222',
  lineCode: 'LINE-02',
  lineName: 'Tray seal',
  status: LineStatus.Paused,
  currentWONumber: 'WO-1002',
  currentProductName: 'Fish pie',
  goodCount: 64,
  scrapCount: 1,
  oeePercent: null,
  lastActivityAt: null,
};

describe('OeeAndonRoutePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists production lines with status badges from the mocked live loader', async () => {
    vi.mocked(getAllLinesLiveStatus).mockResolvedValue([runningLine, pausedLine]);

    render(await OeeAndonRoutePage());

    expect(getAllLinesLiveStatus).toHaveBeenCalledWith('current');
    expect(screen.getByRole('heading', { name: 'Andon board' })).toBeInTheDocument();
    expect(screen.getByText('LINE-01')).toBeInTheDocument();
    expect(screen.getByText('Primary packing')).toBeInTheDocument();
    expect(screen.getByText('WO-1001')).toBeInTheDocument();
    expect(screen.getByText('87.4%')).toBeInTheDocument();
    expect(screen.getByText('LINE-02')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getAllByTestId('andon-status-badge')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /LINE-01/ })).toHaveAttribute(
      'href',
      `/oee/andon/${runningLine.id}`,
    );
  });

  it('renders the line kiosk from the mocked live status loader', async () => {
    vi.mocked(getLineLiveStatus).mockResolvedValue(runningLine);

    render(
      await OeeAndonLinePage({
        params: Promise.resolve({ locale: 'en', lineId: runningLine.id }),
      }),
    );

    expect(getLineLiveStatus).toHaveBeenCalledWith(runningLine.id, 'current');
    expect(screen.getByTestId('andon-kiosk')).toBeInTheDocument();
    expect(screen.getByTestId('andon-status-badge')).toHaveTextContent('Running');
    expect(screen.getByText('LINE-01')).toBeInTheDocument();
    expect(screen.getByText('WO-1001')).toBeInTheDocument();
    expect(screen.getByText('Smoked salmon pack')).toBeInTheDocument();
    expect(screen.getByText('128.5')).toBeInTheDocument();
    expect(screen.getByText('3.25')).toBeInTheDocument();
    expect(screen.getByText('87.4%')).toBeInTheDocument();
  });
});
