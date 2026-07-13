import { describe, expect, it, vi } from 'vitest';

import { resolveProjectIdByProductCode } from '../product-project-resolver';

describe('resolveProjectIdByProductCode', () => {
  it('returns none when no project matches the product code', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const result = await resolveProjectIdByProductCode({ client: { query } }, 'FG-001');
    expect(result).toEqual({ kind: 'none' });
    expect(query).toHaveBeenCalledOnce();
  });

  it('returns ok when exactly one project matches', async () => {
    const query = vi.fn(async () => ({ rows: [{ id: 'proj-1' }] }));
    const result = await resolveProjectIdByProductCode({ client: { query } }, 'FG-001');
    expect(result).toEqual({ kind: 'ok', projectId: 'proj-1' });
    // Lock the SQL contract so the org gate / param binding can't silently regress
    // (mocks ignore SQL, so without these assertions the org predicate could be
    // dropped or `limit 1` reinstated and the test would still pass — Codex C1 review).
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain('from public.npd_projects');
    expect(sql).toContain('org_id = app.current_org_id()');
    expect(sql).toContain('product_code = $1::text');
    expect(sql).not.toMatch(/limit\s+1/i);
    expect(params).toEqual(['FG-001']);
  });

  it('returns ambiguous when multiple projects share the product code', async () => {
    const query = vi.fn(async () => ({
      rows: [{ id: 'proj-1' }, { id: 'proj-2' }],
    }));
    const result = await resolveProjectIdByProductCode({ client: { query } }, 'FG-001');
    expect(result).toEqual({ kind: 'ambiguous', projectIds: ['proj-1', 'proj-2'] });
  });

  it('returns none for empty product code without querying', async () => {
    const query = vi.fn();
    const result = await resolveProjectIdByProductCode({ client: { query } }, '   ');
    expect(result).toEqual({ kind: 'none' });
    expect(query).not.toHaveBeenCalled();
  });
});
