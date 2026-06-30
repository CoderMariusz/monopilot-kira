import { revalidatePath } from 'next/cache';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  emitComplianceDocOutbox,
  hasComplianceDocWritePermission,
  type QueryClient,
} from './upload-doc';

export type SoftDeleteDocInput = {
  productCode: string;
  docId: string;
};

export type SoftDeleteDocResult =
  | { ok: true; docId: string }
  | { ok: false; code: 'INVALID_INPUT' | 'FORBIDDEN' | 'DOC_NOT_FOUND' | 'PERSISTENCE_FAILED' };

export async function softDeleteDoc(input: SoftDeleteDocInput): Promise<SoftDeleteDocResult> {
  'use server';

  const productCode = normalizeText(input?.productCode);
  const docId = normalizeText(input?.docId);
  if (!productCode || !docId) return { ok: false, code: 'INVALID_INPUT' };

  return withOrgContext<SoftDeleteDocResult>(async ({ userId, orgId, client }) => {
    const queryClient = client as QueryClient;

    try {
      if (!(await hasComplianceDocWritePermission(queryClient, userId, orgId))) {
        return { ok: false, code: 'FORBIDDEN' };
      }

      const updated = await queryClient.query<{ id: string; doc_type: string; version_number: number }>(
        `update public.compliance_docs
            set deleted_at = coalesce(deleted_at, now())
          where org_id = app.current_org_id()
            and product_code = $1
            and id = $2::uuid
            and deleted_at is null
        returning id, doc_type, version_number`,
        [productCode, docId],
      );
      const row = updated.rows[0];
      if (!row) return { ok: false, code: 'DOC_NOT_FOUND' };

      await emitComplianceDocOutbox(queryClient, {
        orgId,
        eventType: 'compliance_doc.deleted',
        docId: row.id,
        productCode,
        actorUserId: userId,
        payload: {
          doc_type: row.doc_type,
          version_number: row.version_number,
        },
      });

      revalidatePath('/[locale]/fg/[productCode]/docs', 'page');
      return { ok: true, docId: row.id };
    } catch {
      return { ok: false, code: 'PERSISTENCE_FAILED' };
    }
  });
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
