'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { createWorkOrderCore, type CreateWorkOrderCoreParams } from './create-work-order-core';
import { type CreateWorkOrderResult } from './shared';

export async function createWorkOrder(params: CreateWorkOrderCoreParams): Promise<CreateWorkOrderResult> {
  try {
    return await withOrgContext(async (ctx): Promise<CreateWorkOrderResult> => createWorkOrderCore(ctx, params));
  } catch (error) {
    console.error('[createWorkOrder] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
