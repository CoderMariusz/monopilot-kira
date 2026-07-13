import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

const ORG_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_CODE = 'FG-ALLERGEN-01';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (
    action: (ctx: { userId: string; orgId: string; client: { query: typeof queryMock } }) => unknown,
  ) => action({ userId: USER_ID, orgId: ORG_ID, client: { query: queryMock } }),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

function grantDeclarationWrite() {
  queryMock
    .mockResolvedValueOnce({ rows: [{ ok: true }] })
    .mockResolvedValueOnce({ rows: [{ actor_role: 'quality_lead' }] })
    .mockResolvedValueOnce({
      rows: [
        {
          product_code: PRODUCT_CODE,
          allergens_declaration_accepted: false,
          allergens_declaration_accepted_by: null,
          allergens_declaration_accepted_at: null,
        },
      ],
    })
    .mockResolvedValueOnce({
      rows: [
        {
          product_code: PRODUCT_CODE,
          allergens_declaration_accepted: true,
          allergens_declaration_accepted_by: USER_ID,
          allergens_declaration_accepted_at: '2026-07-07T12:00:00.000Z',
        },
      ],
    })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
}

beforeEach(() => {
  queryMock.mockReset();
});

describe('acceptAllergenDeclaration', () => {
  it('returns FORBIDDEN when the actor lacks declaration write permissions', async () => {
    const { acceptAllergenDeclaration } = await import('../accept-declaration');
    queryMock.mockResolvedValueOnce({ rows: [{ ok: false }] });

    await expect(acceptAllergenDeclaration({ productCode: PRODUCT_CODE })).resolves.toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });

    const permissionParams = queryMock.mock.calls[0]?.[1] ?? [];
    expect(permissionParams[2]).toEqual(
      expect.arrayContaining(['npd.allergen.accept_declaration', 'npd.allergen.write']),
    );
  });

  it('accepts when the actor has npd.allergen.write without npd.allergen.accept_declaration', async () => {
    const { acceptAllergenDeclaration } = await import('../accept-declaration');
    grantDeclarationWrite();

    await expect(acceptAllergenDeclaration({ productCode: PRODUCT_CODE })).resolves.toEqual({
      ok: true,
      productCode: PRODUCT_CODE,
    });

    const permissionParams = queryMock.mock.calls[0]?.[1] ?? [];
    expect(permissionParams[2]).toEqual(
      expect.arrayContaining(['npd.allergen.write', 'npd.allergen.accept_declaration']),
    );
  });

  it('rejects npd_manager role when the actor has zero matching permissions', async () => {
    const { acceptAllergenDeclaration } = await import('../accept-declaration');
    queryMock.mockResolvedValueOnce({ rows: [{ ok: false }] });

    await expect(acceptAllergenDeclaration({ productCode: PRODUCT_CODE })).resolves.toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });

    const source = readFileSync(resolve(__dirname, '../accept-declaration.ts'), 'utf8');
    const codeWithoutComments = source.replace(/\/\/.*$/gm, '');
    expect(codeWithoutComments).not.toMatch(/r\.code\s*=\s*'npd_manager'/);
    expect(codeWithoutComments).not.toMatch(/r\.slug\s*=\s*'npd_manager'/);
    expect(codeWithoutComments).not.toMatch(/when r\.code = 'npd_manager'/);
  });

  it('accepts when npd.allergen.accept_declaration is granted', async () => {
    const { acceptAllergenDeclaration } = await import('../accept-declaration');
    grantDeclarationWrite();

    await expect(acceptAllergenDeclaration({ productCode: PRODUCT_CODE })).resolves.toEqual({
      ok: true,
      productCode: PRODUCT_CODE,
    });
  });
});
