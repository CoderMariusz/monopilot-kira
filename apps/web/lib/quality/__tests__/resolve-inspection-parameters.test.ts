import { describe, expect, it, vi } from 'vitest';

import { resolveInspectionParameters } from '../resolve-inspection-parameters';

describe('resolveInspectionParameters (S15)', () => {
  it('returns stored parameters when the inspection row already has them', async () => {
    const client = {
      query: vi.fn(),
    };
    const result = await resolveInspectionParameters(client, {
      productId: '11111111-1111-4111-8111-111111111111',
      storedParameters: [{ name: 'Visual', actual: 'ok', pass: true }],
    });
    expect(result).toEqual({
      status: 'stored',
      parameters: [{ name: 'Visual', actual: 'ok', pass: true }],
    });
    expect(client.query).not.toHaveBeenCalled();
  });

  it('resolves parameters from the active incoming quality spec when stored is empty', async () => {
    const client = {
      query: vi.fn(async () => ({
        rows: [
          {
            spec_id: 'spec-1',
            parameter_name: 'Moisture',
            target_value: '12.5',
            min_value: null,
            max_value: null,
            unit: '%',
          },
        ],
      })),
    };
    const result = await resolveInspectionParameters(client, {
      productId: '11111111-1111-4111-8111-111111111111',
      storedParameters: [],
    });
    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') throw new Error('expected resolved');
    expect(result.specId).toBe('spec-1');
    expect(result.parameters).toEqual([
      { name: 'Moisture', expected: '12.5 %', actual: '', pass: false },
    ]);
  });

  it('signals missing_template when no product or no active spec exists', async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    const result = await resolveInspectionParameters(client, {
      productId: '11111111-1111-4111-8111-111111111111',
      storedParameters: [],
    });
    expect(result).toEqual({ status: 'missing_template', parameters: [] });
  });
});
