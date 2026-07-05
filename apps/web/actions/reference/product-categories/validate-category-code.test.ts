import { describe, expect, it, vi } from 'vitest';

import { validateActiveCategoryCode } from './validate-category-code';

type QueryClient = {
  query: ReturnType<typeof vi.fn>;
};

function makeClient(rows: Array<{ code: string }>): QueryClient {
  return {
    query: vi.fn(async () => ({ rows, rowCount: rows.length })),
  };
}

describe('validateActiveCategoryCode', () => {
  it('passes when category code is omitted', async () => {
    const client = makeClient([]);
    await expect(validateActiveCategoryCode(client, undefined)).resolves.toEqual({ ok: true });
    await expect(validateActiveCategoryCode(client, '')).resolves.toEqual({ ok: true });
    expect(client.query).not.toHaveBeenCalled();
  });

  it('passes when an active category exists in org', async () => {
    const client = makeClient([{ code: 'meat_smoked' }]);
    await expect(validateActiveCategoryCode(client, 'meat_smoked')).resolves.toEqual({ ok: true });
    expect(client.query).toHaveBeenCalledOnce();
  });

  it('rejects unknown or inactive category codes', async () => {
    const client = makeClient([]);
    await expect(validateActiveCategoryCode(client, 'unknown')).resolves.toEqual({
      ok: false,
      error: 'invalid_category',
    });
  });
});
