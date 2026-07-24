/**
 * L5 — generateProductionBom packaging gate + routing warnings.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const withOrgContext = vi.fn();
const hasHandoffPermission = vi.fn();
const materializeNpdBom = vi.fn();
const materializeNpdRouting = vi.fn();
const revalidateLocalized = vi.fn();

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({ withOrgContext }));
vi.mock('../get-handoff', () => ({ hasHandoffPermission }));
vi.mock('../../../../../../../../(npd)/pipeline/_actions/_lib/materialize-npd-bom', () => ({
  materializeNpdBom,
}));
vi.mock('../../../../../../../../(npd)/pipeline/_actions/_lib/materialize-npd-routing', () => ({
  materializeNpdRouting,
}));
vi.mock('../../../../../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized }));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function mockClient(rowsBySql: Array<{ match: RegExp; rows: unknown[] }>) {
  return {
    query: vi.fn(async (sql: string) => {
      for (const entry of rowsBySql) {
        if (entry.match.test(sql)) return { rows: entry.rows };
      }
      return { rows: [] };
    }),
  };
}

describe('generateProductionBom — L5 packaging gate + routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withOrgContext.mockImplementation(async (fn: (ctx: unknown) => unknown) =>
      fn({ userId: 'user-1', orgId: 'org-1', client: mockClient([]) }),
    );
    hasHandoffPermission.mockResolvedValue(true);
    materializeNpdBom.mockResolvedValue({
      bomHeaderId: 'bom-1',
      productionCode: 'FG-001',
      yieldPromptRequired: false,
    });
    materializeNpdRouting.mockResolvedValue({ ok: true, routingId: 'routing-1' });
  });

  it('blocks materialize when packaging rows lack item_id', async () => {
    withOrgContext.mockImplementation(async (fn: (ctx: unknown) => unknown) =>
      fn({
        userId: 'user-1',
        orgId: 'org-1',
        client: mockClient([
          {
            match: /packaging_components/i,
            rows: [{ component_name: 'box 1' }, { component_name: 'LAB1' }],
          },
        ]),
      }),
    );

    const { generateProductionBom } = await import('../generate-production-bom');
    const result = await generateProductionBom({ projectId: PROJECT_ID });

    expect(result).toEqual({
      ok: false,
      error: 'packaging_unlinked',
      unlinkedComponents: ['box 1', 'LAB1'],
      message: 'packaging components not linked to items: box 1, LAB1',
    });
    expect(materializeNpdBom).not.toHaveBeenCalled();
  });

  it('returns routing warnings after successful BOM materialize', async () => {
    materializeNpdRouting.mockResolvedValue({ ok: false, code: 'no_line' });

    const { generateProductionBom } = await import('../generate-production-bom');
    const result = await generateProductionBom({ projectId: PROJECT_ID });

    expect(result).toEqual({
      ok: true,
      data: {
        productionCode: 'FG-001',
        bomHeaderId: 'bom-1',
        yieldPromptRequired: false,
        warnings: [{ code: 'no_line' }],
      },
    });
    expect(materializeNpdRouting).toHaveBeenCalledWith(expect.anything(), PROJECT_ID);
  });

  it('treats routing_exists as silent success', async () => {
    materializeNpdRouting.mockResolvedValue({ ok: false, code: 'routing_exists' });

    const { generateProductionBom } = await import('../generate-production-bom');
    const result = await generateProductionBom({ projectId: PROJECT_ID });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.warnings).toEqual([]);
  });

  it('commits a generated draft but reports the actionable V-TEC-14 activation block', async () => {
    materializeNpdBom.mockResolvedValue({
      code: 'BOM_ACTIVATION_BLOCKED',
      activationValidationCode: 'V-TEC-14',
      activationMessage: 'RM-FLOUR: SUPPLIER_SPEC_NOT_ACTIVE',
      bomHeaderId: 'bom-draft-1',
      productionCode: 'FG-001',
      yieldPromptRequired: false,
    });

    const { generateProductionBom } = await import('../generate-production-bom');
    const result = await generateProductionBom({ projectId: PROJECT_ID });

    expect(result).toEqual({
      ok: false,
      error: 'bom_activation_blocked',
      message: 'RM-FLOUR: SUPPLIER_SPEC_NOT_ACTIVE',
      bomHeaderId: 'bom-draft-1',
    });
    expect(materializeNpdBom).toHaveBeenCalledWith(
      expect.anything(),
      { projectId: PROJECT_ID, preserveDraftOnActivationFailure: true },
    );
    expect(materializeNpdRouting).not.toHaveBeenCalled();
    expect(revalidateLocalized).toHaveBeenCalled();
  });

  it('logs the real persistence exception while keeping database detail off the client result', async () => {
    const dbError = Object.assign(new Error('column "legacy_code" does not exist'), {
      code: '42703',
    });
    materializeNpdBom.mockRejectedValue(dbError);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { generateProductionBom } = await import('../generate-production-bom');
    const result = await generateProductionBom({ projectId: PROJECT_ID });

    expect(result).toEqual({ ok: false, error: 'persistence_failed' });
    expect(errorSpy).toHaveBeenCalledWith(
      '[generateProductionBom] persistence_failed',
      expect.objectContaining({
        projectId: PROJECT_ID,
        code: '42703',
        message: 'column "legacy_code" does not exist',
      }),
    );
  });
});
