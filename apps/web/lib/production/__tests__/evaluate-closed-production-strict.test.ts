import { describe, expect, it } from 'vitest';

import { evaluateClosedProductionStrict } from '../evaluate-closed-production-strict';

describe('evaluateClosedProductionStrict (C4)', () => {
  it('does not treat zero consumption with positive output as within tolerance', async () => {
    const captured: string[] = [];
    const client = {
      query: async <T>(sql: string) => {
        captured.push(sql.replace(/\s+/g, ' '));
        return {
          rows: [{
            output_kg: '3',
            posted_consumption_kg: '0',
            effective_yield_pct: '100',
            expected_input_kg: '3',
            within_tolerance: false,
          }] as T[],
        };
      },
    };

    const row = await evaluateClosedProductionStrict(client, '33333333-3333-4333-8333-333333333333');
    expect(row?.within_tolerance).toBe(false);
    expect(captured[0]).toContain('t.posted_consumption_kg > 0');
    expect(captured[0]).not.toContain('t.posted_consumption_kg <= 0');
    expect(captured[0]).not.toMatch(/or\s+t\.posted_consumption_kg\s*<=\s*0/i);
  });
});
