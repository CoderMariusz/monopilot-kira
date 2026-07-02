import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateFaCellMock = vi.fn(async () => ({
  previousValue: 'old',
  newValue: 'new',
  builtReset: false,
}));

vi.mock('../../../fa/actions/update-fa-cell', () => ({
  updateFaCell: (...args: unknown[]) => updateFaCellMock(...args),
}));

describe('saveStageDeptField', () => {
  beforeEach(() => {
    updateFaCellMock.mockClear();
  });

  it('rejects saves before the project is linked to an FG', async () => {
    const { saveStageDeptField } = await import('../save-stage-dept-field');

    await expect(
      saveStageDeptField({
        projectId: '11111111-1111-4111-8111-111111111111',
        productCode: null,
        fieldCode: 'pack_size',
        value: '6x400g',
      }),
    ).rejects.toMatchObject({ code: 'NO_FG_LINKED' });
    expect(updateFaCellMock).not.toHaveBeenCalled();
  });

  it('uses the existing FA cell save path for valid stage field writes', async () => {
    const { saveStageDeptField } = await import('../save-stage-dept-field');

    const result = await saveStageDeptField({
      projectId: '11111111-1111-4111-8111-111111111111',
      productCode: 'FG-001',
      fieldCode: 'pack_size',
      value: '6x400g',
    });

    expect(result).toEqual({ previousValue: 'old', newValue: 'new', builtReset: false });
    expect(updateFaCellMock).toHaveBeenCalledWith('FG-001', 'pack_size', '6x400g');
  });
});
