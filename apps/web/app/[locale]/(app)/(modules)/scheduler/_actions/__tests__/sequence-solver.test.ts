import { describe, expect, it } from 'vitest';

import { sequenceWorkOrders } from '../sequence-solver';
import type { ChangeoverMatrixEntry, WorkOrderForScheduling } from '../scheduler-types';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const LINE_ID = '22222222-2222-4222-8222-222222222222';

function wo(input: {
  id: string;
  due: string;
  allergens: string[];
  scheduledStart?: string;
}): WorkOrderForScheduling {
  return {
    id: input.id,
    org_id: ORG_ID,
    site_id: null,
    wo_number: `WO-${input.id.slice(0, 4)}`,
    product_id: '33333333-3333-4333-8333-333333333333',
    item_code: 'FG-001',
    item_name: 'Finished Good',
    status: 'DRAFT',
    planned_quantity: '100.000',
    uom: 'kg',
    production_line_id: LINE_ID,
    planned_start_date: input.scheduledStart ?? null,
    planned_end_date: input.due,
    scheduled_start_time: input.scheduledStart ?? null,
    scheduled_end_time: null,
    due_date: input.due,
    allergen_ids: input.allergens,
  };
}

function matrix(from: string, to: string, minutes: number): ChangeoverMatrixEntry {
  return {
    id: `${from || 'none'}-${to || 'none'}`,
    org_id: ORG_ID,
    site_id: null,
    version_id: '44444444-4444-4444-8444-444444444444',
    line_id: null,
    allergen_from: from,
    allergen_to: to,
    changeover_minutes: minutes,
    requires_cleaning: minutes > 0,
    requires_atp: false,
    risk_level: 'low',
    notes: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  };
}

function naiveDueDateTotal(wos: WorkOrderForScheduling[], entries: ChangeoverMatrixEntry[]): number {
  const costs = new Map(entries.map((entry) => [`${entry.allergen_from}\u0000${entry.allergen_to}`, Number(entry.changeover_minutes)]));
  const ordered = [...wos].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  let total = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const from = [...ordered[index - 1].allergen_ids].sort().join('|');
    const to = [...ordered[index].allergen_ids].sort().join('|');
    total += costs.get(`${from}\u0000${to}`) ?? 0;
  }
  return total;
}

describe('sequenceWorkOrders', () => {
  it('returns an empty sequence for empty input', () => {
    expect(sequenceWorkOrders([], [])).toEqual([]);
  });

  it('returns a single WO with zero cumulative changeover cost', () => {
    const result = sequenceWorkOrders(
      [wo({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', due: '2026-06-03T08:00:00.000Z', allergens: ['milk'] })],
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      wo_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sequence_index: 1,
      changeover_cost: 0,
      cumulative_changeover_cost: 0,
      allergen_profile_key: 'milk',
    });
  });

  it('is deterministic regardless of input order or allergen order', () => {
    const a = wo({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', due: '2026-06-01T08:00:00.000Z', allergens: ['soy', 'milk'] });
    const b = wo({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', due: '2026-06-02T08:00:00.000Z', allergens: ['nuts'] });
    const c = wo({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', due: '2026-06-03T08:00:00.000Z', allergens: ['milk', 'soy'] });
    const entries = [
      matrix('milk|soy', 'nuts', 20),
      matrix('milk|soy', 'milk|soy', 0),
      matrix('nuts', 'milk|soy', 5),
    ];

    const first = sequenceWorkOrders([a, b, c], entries).map((assignment) => assignment.wo_id);
    const second = sequenceWorkOrders([c, b, a], entries).map((assignment) => assignment.wo_id);

    expect(first).toEqual(second);
    expect(first).toEqual([a.id, c.id, b.id]);
  });

  it('uses due_date as the tie-break when changeover costs are equal', () => {
    const anchor = wo({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', due: '2026-06-01T08:00:00.000Z', allergens: ['milk'] });
    const earlier = wo({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', due: '2026-06-02T08:00:00.000Z', allergens: ['soy'] });
    const later = wo({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', due: '2026-06-03T08:00:00.000Z', allergens: ['nuts'] });
    const entries = [matrix('milk', 'soy', 10), matrix('milk', 'nuts', 10)];

    const result = sequenceWorkOrders([later, earlier, anchor], entries);

    expect(result.map((assignment) => assignment.wo_id)).toEqual([anchor.id, earlier.id, later.id]);
  });

  it('beats naive due-date ordering when the changeover matrix makes reordering cheaper', () => {
    const a = wo({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', due: '2026-06-01T08:00:00.000Z', allergens: ['milk'] });
    const b = wo({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', due: '2026-06-02T08:00:00.000Z', allergens: ['nuts'] });
    const c = wo({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', due: '2026-06-03T08:00:00.000Z', allergens: ['milk'] });
    const entries = [
      matrix('milk', 'nuts', 60),
      matrix('nuts', 'milk', 60),
      matrix('milk', 'milk', 0),
    ];

    const greedy = sequenceWorkOrders([a, b, c], entries);
    const greedyTotal = greedy.at(-1)?.cumulative_changeover_cost ?? 0;
    const naiveTotal = naiveDueDateTotal([a, b, c], entries);

    expect(greedy.map((assignment) => assignment.wo_id)).toEqual([a.id, c.id, b.id]);
    expect(greedyTotal).toBeLessThan(naiveTotal);
    expect(greedyTotal).toBe(60);
    expect(naiveTotal).toBe(120);
  });
});
