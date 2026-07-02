'use server';

import { ValidationError } from '../../fa/actions/errors';
import { updateFaCell } from '../../fa/actions/update-fa-cell';

type SaveStageDeptFieldInput = {
  projectId: string;
  productCode: string | null;
  fieldCode: string;
  value: unknown;
};

export async function saveStageDeptField(input: SaveStageDeptFieldInput) {
  const productCode = (input.productCode ?? '').trim();
  if (!productCode) {
    throw new ValidationError('NO_FG_LINKED', 'Project is not linked to a Finished Good yet');
  }
  return updateFaCell(productCode, input.fieldCode, input.value);
}
