import { describe, expect, it } from 'vitest';

import {
  mapDefinitionProcessesToComponentProcesses,
  resolveWipDefinitionRef,
} from '../map-definition-process-chain';

describe('resolveWipDefinitionRef', () => {
  it('prefers a definition matched by component item_id', () => {
    const result = resolveWipDefinitionRef({
      itemId: 'item-1',
      definitions: [
        { id: 'def-linked', name: 'Linked', item_id: 'other-item' },
        { id: 'def-item', name: 'By item', item_id: 'item-1' },
      ],
      linkedDefinitionIds: ['def-linked'],
    });

    expect(result).toEqual({ id: 'def-item', name: 'By item' });
  });

  it('falls back to a process-linked definition when item_id does not match', () => {
    const result = resolveWipDefinitionRef({
      itemId: null,
      definitions: [{ id: 'def-linked', name: 'Linked only', item_id: 'item-9' }],
      linkedDefinitionIds: ['def-linked'],
    });

    expect(result).toEqual({ id: 'def-linked', name: 'Linked only' });
  });
});

describe('mapDefinitionProcessesToComponentProcesses', () => {
  it('maps definition processes without createsWipItem and computes processCost', () => {
    const processes = mapDefinitionProcessesToComponentProcesses(
      [
        {
          id: 'proc-1',
          process_name: 'Mix',
          display_order: 1,
          duration_hours: '2',
          additional_cost: '4',
          throughput_per_hour: null,
          throughput_uom: null,
          setup_cost: null,
        },
      ],
      [{ process_id: 'proc-1', role_group: 'operator', headcount: 1, rate_per_hour: '10' }],
      [],
    );

    expect(processes).toEqual([
      {
        id: 'proc-1',
        processName: 'Mix',
        displayOrder: 1,
        durationHours: 2,
        additionalCost: 4,
        createsWipItem: false,
        wipItemId: null,
        throughputPerHour: 0,
        throughputUom: 'kg',
        setupCost: 0,
        yieldPct: 100,
        roles: [{ roleGroup: 'operator', headcount: 1, ratePerHour: 10 }],
        processCost: 24,
      },
    ]);
  });
});
