import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const hasPermissionMock = vi.fn(async () => true);

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async <T>(fn: (ctx: unknown) => Promise<T>) =>
    fn({ userId: 'user-1', orgId: 'org-1', client: { query: queryMock } }),
}));

vi.mock('../../../../../lib/auth/has-permission', () => ({
  hasPermission: (...args: unknown[]) => hasPermissionMock(...args),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('createFa — org FG code-mask validation', () => {
  beforeEach(() => {
    queryMock.mockReset();
    hasPermissionMock.mockReset();
    hasPermissionMock.mockResolvedValue(true);
  });

  it('accepts a code matching the configured FG mask', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.org_document_settings')) {
        return { rows: [{ code_mask: 'FGxxxx' }] };
      }
      if (sql.startsWith('select 1 from public.product')) return { rows: [] };
      if (sql.startsWith('insert into public.product')) return { rows: [] };
      if (sql.startsWith('insert into public.outbox_events')) return { rows: [] };
      throw new Error(`unexpected query: ${sql}`);
    });

    const { createFa } = await import('../create-fa');
    await expect(createFa({ productCode: 'FG0042', productName: 'Masked product' })).resolves.toEqual({
      productCode: 'FG0042',
    });
  });

  it('rejects a code that matches neither the org mask nor the legacy FA rule', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.org_document_settings')) {
        return { rows: [{ code_mask: 'FGxxxx' }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    const { createFa } = await import('../create-fa');
    const { ValidationError } = await import('../errors');

    await expect(createFa({ productCode: 'ZZ123', productName: 'Bad code' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(queryMock.mock.calls.some(([sql]) => String(sql).startsWith('insert into public.product'))).toBe(
      false,
    );
  });

  it('rejects legacy FA codes when an org FG mask is configured and allowLegacyFa is not set', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.org_document_settings')) {
        return { rows: [{ code_mask: 'FGxxxx' }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    const { createFa } = await import('../create-fa');
    const { ValidationError } = await import('../errors');

    await expect(createFa({ productCode: 'FA7777', productName: 'Legacy FA' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(queryMock.mock.calls.some(([sql]) => String(sql).startsWith('insert into public.product'))).toBe(
      false,
    );
  });

  it('accepts legacy FA codes when allowLegacyFa is true and an org FG mask is configured', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.org_document_settings')) {
        return { rows: [{ code_mask: 'FGxxxx' }] };
      }
      if (sql.startsWith('select 1 from public.product')) return { rows: [] };
      if (sql.startsWith('insert into public.product')) return { rows: [] };
      if (sql.startsWith('insert into public.outbox_events')) return { rows: [] };
      throw new Error(`unexpected query: ${sql}`);
    });

    const { createFa } = await import('../create-fa');
    await expect(
      createFa({ productCode: 'FA7777', productName: 'Legacy FA', allowLegacyFa: true }),
    ).resolves.toEqual({
      productCode: 'FA7777',
    });
  });

  it('falls back to the legacy FA rule when no FG mask is configured', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.org_document_settings')) return { rows: [] };
      if (sql.startsWith('select 1 from public.product')) return { rows: [] };
      if (sql.startsWith('insert into public.product')) return { rows: [] };
      if (sql.startsWith('insert into public.outbox_events')) return { rows: [] };
      throw new Error(`unexpected query: ${sql}`);
    });

    const { createFa } = await import('../create-fa');
    await expect(createFa({ productCode: 'FA7777', productName: 'Legacy FA' })).resolves.toEqual({
      productCode: 'FA7777',
    });
  });
});
