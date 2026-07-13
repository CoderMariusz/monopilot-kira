import { revalidatePath } from 'next/cache';

import { softDeleteDoc } from '../../../../../../../(npd)/fa/[productCode]/docs/_actions/soft-delete-doc';
import { uploadDoc } from '../../../../../../../(npd)/fa/[productCode]/docs/_actions/upload-doc';
import {
  createRisk,
  type CreateRiskInput,
  type CreateRiskResult,
} from '../../../../../../../(npd)/fa/[productCode]/risks/_actions/create-risk';
import {
  updateRisk,
  type UpdateRiskInput,
  type UpdateRiskResult,
} from '../../../../../../../(npd)/fa/[productCode]/risks/_actions/update-risk';

async function revalidateApprovalRouteInternal(locale: string, projectId: string): Promise<void> {
  revalidatePath(`/${locale}/pipeline/${projectId}/approval`);
}

/** Revalidate the Approval RSC route so mounted rows + C5/C6/C7 criteria refresh. */
export async function revalidateApprovalRoute(locale: string, projectId: string): Promise<void> {
  'use server';
  await revalidateApprovalRouteInternal(locale, projectId);
}

/**
 * Drop-in Server Action adapters for compliance + risk widgets mounted on the
 * Approval stage. Each awaits the underlying /fg action, then revalidates the
 * current pipeline approval route on success (the /fg revalidatePath targets do
 * not match this mount).
 */
export function createApprovalMountActions(locale: string, projectId: string) {
  async function uploadDocForApproval(formData: FormData) {
    'use server';
    const result = await uploadDoc(formData);
    if (result.ok) await revalidateApprovalRouteInternal(locale, projectId);
    return result;
  }

  async function softDeleteDocForApproval(input: { productCode: string; docId: string }) {
    'use server';
    const result = await softDeleteDoc(input);
    if (result.ok) await revalidateApprovalRouteInternal(locale, projectId);
    return result;
  }

  async function createRiskForApproval(input: CreateRiskInput): Promise<CreateRiskResult> {
    'use server';
    const result = await createRisk(input);
    if (result.ok) await revalidateApprovalRouteInternal(locale, projectId);
    return result;
  }

  async function updateRiskForApproval(input: UpdateRiskInput): Promise<UpdateRiskResult> {
    'use server';
    const result = await updateRisk(input);
    if (result.ok) await revalidateApprovalRouteInternal(locale, projectId);
    return result;
  }

  return {
    uploadDocForApproval,
    softDeleteDocForApproval,
    createRiskForApproval,
    updateRiskForApproval,
  };
}
