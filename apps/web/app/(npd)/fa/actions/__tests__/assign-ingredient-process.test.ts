import { afterEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({
      userId: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      client: { query: queryMock },
    }),
}));

import { assignIngredientProcess } from '../assign-ingredient-process';

const ingredientId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const processId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const foreignProcessId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

afterEach(() => {
  queryMock.mockReset();
});

describe('assignIngredientProcess', () => {
  it('assigns an ingredient to a process in the same project', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (/select\s+true\s+as\s+ok/i.test(text)) return { rows: [{ ok: true }] };
      if (/update\s+public\.formulation_ingredients/i.test(text)) {
        return { rows: [{ id: ingredientId }], rowCount: 1 };
      }
      return { rows: [] };
    });

    const result = await assignIngredientProcess({
      ingredientId,
      npdWipProcessId: processId,
    });

    expect(result).toEqual({ ok: true, ingredientId, npdWipProcessId: processId });
    const updateCall = queryMock.mock.calls.find((call) =>
      /update\s+public\.formulation_ingredients/i.test(String(call[0])),
    );
    expect(updateCall?.[1]).toEqual([ingredientId, processId]);
  });

  it('unassigns an ingredient when npdWipProcessId is null', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (/from\s+public\.formulation_ingredients/i.test(text) && /limit\s+1/i.test(text)) {
        return { rows: [{ ok: true }] };
      }
      if (/update\s+public\.formulation_ingredients/i.test(text)) {
        return { rows: [{ id: ingredientId }], rowCount: 1 };
      }
      return { rows: [] };
    });

    const result = await assignIngredientProcess({
      ingredientId,
      npdWipProcessId: null,
    });

    expect(result).toEqual({ ok: true, ingredientId, npdWipProcessId: null });
    const updateCall = queryMock.mock.calls.find((call) =>
      /update\s+public\.formulation_ingredients/i.test(String(call[0])),
    );
    expect(updateCall?.[1]).toEqual([ingredientId, null]);
  });

  it('rejects cross-project ingredient and process pairing', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (/select\s+true\s+as\s+ok/i.test(text)) return { rows: [] };
      return { rows: [] };
    });

    const result = await assignIngredientProcess({
      ingredientId,
      npdWipProcessId: foreignProcessId,
    });

    expect(result).toEqual({
      ok: false,
      error: 'Ingredient and process must belong to the same project formulation',
    });
    expect(
      queryMock.mock.calls.some((call) => /update\s+public\.formulation_ingredients/i.test(String(call[0]))),
    ).toBe(false);
  });
});
