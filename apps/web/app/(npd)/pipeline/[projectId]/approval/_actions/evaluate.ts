'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

import { evaluateApprovalCriteriaWithClient } from './evaluate-core';
import type { EvaluateApprovalCriteriaResult } from './evaluate-core';

const ProductCode = z.string().trim().min(1).max(120);

export async function evaluateApprovalCriteria(
  productCodeInput: unknown,
): Promise<EvaluateApprovalCriteriaResult> {
  const parsed = ProductCode.safeParse(productCodeInput);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }

  const productCode = parsed.data;

  try {
    return await withOrgContext(async ({ client }) =>
      evaluateApprovalCriteriaWithClient(client, productCode),
    );
  } catch (err) {
    console.error('[evaluateApprovalCriteria] persistence_failed', {
      productCode,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
