import type { D365MaterialStatus } from './v04-d365-material.js';
import type { QueryClient } from './v03-pack-size.js';
import { validateD365Material } from './v04-d365-material.js';

export type NpdValidationStatus = 'pass' | 'fail' | 'warn' | 'info';
export type NpdValidationRule = { id: string; title: string; status: NpdValidationStatus };

export type EvaluateNpdInput = {
  orgId: string;
  productRow: Record<string, unknown>;
  packSizes: string[];
  codeMaskRegExp: RegExp | null;
  titles: Record<string, string>;
};

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

function mapD365Status(status: D365MaterialStatus): NpdValidationStatus {
  switch (status) {
    case 'Found':
      return 'pass';
    case 'NoCost':
    case 'Missing':
      return 'warn';
    case 'Empty':
      return 'info';
    default:
      return 'info';
  }
}

export async function evaluateNpdValidation(
  db: QueryClient,
  input: EvaluateNpdInput,
): Promise<NpdValidationRule[]> {
  const { orgId, productRow, packSizes, codeMaskRegExp, titles } = input;

  const productCode = str(productRow.product_code);
  const productName = str(productRow.product_name);
  const packSize = str(productRow.pack_size);
  const statusOverall = str(productRow.status_overall);
  const prCodeFinal = str(productRow.pr_code_final);
  const anyProcess = ['process_1', 'process_2', 'process_3', 'process_4'].some(
    (k) => str(productRow[k]) !== '',
  );
  const closedTechnical = str(productRow.closed_technical).toLowerCase();
  const articleNumber = str(productRow.article_number);
  const template = str(productRow.template);

  const v01: NpdValidationStatus = codeMaskRegExp
    ? codeMaskRegExp.test(productCode)
      ? 'pass'
      : 'fail'
    : productCode !== ''
      ? 'pass'
      : 'fail';

  const d365 = await validateD365Material(db, {
    orgId,
    value: str(productRow.ingredient_codes ?? ''),
  });

  const results: Record<string, NpdValidationStatus> = {
    V01: v01,
    V02: productName !== '' ? 'pass' : 'fail',
    V03:
      packSize !== '' && packSizes.includes(packSize) ? 'pass' : packSize === '' ? 'fail' : 'warn',
    V04: mapD365Status(d365.status),
    V05: statusOverall === 'Complete' || statusOverall === 'Built' ? 'pass' : 'info',
    V06: prCodeFinal !== '' && anyProcess ? 'pass' : 'info',
    V07: closedTechnical === 'yes' ? 'pass' : 'warn',
    V08: articleNumber !== '' || template !== '' ? 'pass' : 'info',
  };

  return (['V01', 'V02', 'V03', 'V04', 'V05', 'V06', 'V07', 'V08'] as const).map((id) => ({
    id,
    title: titles[id] ?? id,
    status: results[id],
  }));
}
