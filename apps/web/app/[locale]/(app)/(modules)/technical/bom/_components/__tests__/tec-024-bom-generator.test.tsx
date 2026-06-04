/**
 * @vitest-environment jsdom
 * T-041 / TEC-024 — BOM Generator confirm modal RTL.
 *
 * Parity anchor: modals.jsx:619-655 (tech_modal_gallery frame). Asserts the
 * scope + output radio groups and Cancel/Confirm footer (AC1), the
 * selected-scope 0-pick validation (AC2), and the success toast with a job link
 * after a valid submission (AC3) via the real generateBomBatch action.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateBomBatch: vi.fn(),
  listEligibleFgs: vi.fn(),
}));

vi.mock('../../_actions/generate-batch', () => ({ generateBomBatch: mocks.generateBomBatch }));
vi.mock('../../_actions/queries', () => ({ listEligibleFgs: mocks.listEligibleFgs }));

import { BomGeneratorModal } from '../bom-generator-modal';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listEligibleFgs.mockResolvedValue({
    ok: true,
    data: [
      { productCode: 'FG-100', name: 'Bun' },
      { productCode: 'FG-200', name: 'Roll' },
    ],
  });
  mocks.generateBomBatch.mockResolvedValue({ ok: true, data: { jobId: 'job-1', expectedCount: 3, productCodes: ['FG-100'] } });
});

afterEach(() => cleanup());

describe('BomGeneratorModal (TEC-024)', () => {
  it('renders scope + output radio groups and Cancel/Confirm (parity modals.jsx:619-655)', () => {
    render(<BomGeneratorModal open onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Generate BOM batch' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'All completed FGs' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Selected FGs' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'One file per FG' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Single combined batch' })).toBeInTheDocument();
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons.indexOf('Cancel')).toBeLessThan(buttons.indexOf('Generate'));
  });

  it('validates 0 selected FGs in selected scope (AC2)', async () => {
    const user = userEvent.setup();
    render(<BomGeneratorModal open onClose={() => {}} />);
    await user.click(screen.getByRole('radio', { name: 'Selected FGs' }));
    // eligible FG list loads from the real reader
    expect(await screen.findByText('FG-100')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByText('Select at least one finished good.')).toBeInTheDocument();
    expect(mocks.generateBomBatch).not.toHaveBeenCalled();
  });

  it('submits all_complete scope → success toast with job link (AC3)', async () => {
    const user = userEvent.setup();
    render(<BomGeneratorModal open onClose={() => {}} jobStatusHref={(id) => `/jobs/${id}`} />);
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(mocks.generateBomBatch).toHaveBeenCalledTimes(1));
    expect(mocks.generateBomBatch.mock.calls[0][0]).toMatchObject({ scope: 'all_complete', outputMode: 'per_fg' });
    expect(await screen.findByText(/Batch queued \(3\)\. Job job-1\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View job status' })).toHaveAttribute('href', '/jobs/job-1');
  });

  it('submits selected scope with the picked FGs', async () => {
    const user = userEvent.setup();
    render(<BomGeneratorModal open onClose={() => {}} />);
    await user.click(screen.getByRole('radio', { name: 'Selected FGs' }));
    await screen.findByText('FG-100');
    await user.click(screen.getByRole('checkbox', { name: /FG-100/ }));
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(mocks.generateBomBatch).toHaveBeenCalledTimes(1));
    expect(mocks.generateBomBatch.mock.calls[0][0]).toMatchObject({ scope: 'selected', productCodes: ['FG-100'] });
  });
});
