import { describe, expect, it } from 'vitest';

import { evaluateApprovalCriteriaWithClient } from '../evaluate-core';

const projectId = '07800000-0000-4000-8000-000000000001';
const sensoryQueries: string[] = [];

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function queryRows<T>(rows: unknown[]): { rows: T[] } {
  return { rows: rows as T[] };
}

function clientWithVoidedSensory() {
  return {
    async query<T = Record<string, unknown>>(sql: string) {
      const query = normalize(sql);
      if (query.includes('from public.product')) {
        return queryRows<T>([{
          product_code: 'FG-001',
          allergens: [],
          may_contain: [],
          allergens_declaration_accepted: true,
        }]);
      }
      if (query.includes('from public.npd_projects')) return queryRows<T>([{ id: projectId }]);
      if (query.includes('from public.formulations')) {
        return queryRows<T>([{
          locked_at: new Date('2026-07-01T00:00:00Z'),
          locked_version_id: null,
        }]);
      }
      if (query.includes('from public.nutri_score_results')) return queryRows<T>([{ grade: 'B' }]);
      if (query.includes('from public.costing_breakdowns')) {
        return queryRows<T>([{ margin_pct: '20.00' }]);
      }
      if (query.includes('"reference"."alertthresholds"')) return queryRows<T>([]);
      if (query.includes('from public.technical_sensory_evaluations')) {
        sensoryQueries.push(query);
        return queryRows<T>(
          query.includes('voided_at is null') ? [] : [{ overall_score: '8.50' }],
        );
      }
      if (query.includes('from public.allergen_cascade_rebuild_jobs')) {
        return queryRows<T>([{ audited: true }]);
      }
      if (query.includes('from public.risks')) {
        return queryRows<T>([{ open_high_count: '0' }]);
      }
      if (query.includes('from public.compliance_docs')) {
        return queryRows<T>([{
          active_count: '1',
          expired_count: '0',
          invalid_count: '0',
        }]);
      }
      return queryRows<T>([]);
    },
  };
}

describe('evaluateApprovalCriteriaWithClient sensory read-through', () => {
  it('does not let a voided sensory score satisfy approval criterion C4', async () => {
    sensoryQueries.length = 0;

    const result = await evaluateApprovalCriteriaWithClient(clientWithVoidedSensory(), 'FG-001');

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.C4 : null).toBe('not_required');
    expect(sensoryQueries).toHaveLength(1);
    expect(sensoryQueries[0]).toContain('voided_at is null');
    expect(sensoryQueries[0]).toContain('npd_project_id = $2::uuid');
  });
});
