import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  hasComplianceDocWritePermission,
  mapDocRow,
  type ComplianceDocDto,
  type QueryClient,
} from './upload-doc';

export type ListDocsInput = {
  productCode: string;
};

export type ListDocsResult =
  | { ok: true; docs: ComplianceDocDto[] }
  | { ok: false; code: 'INVALID_INPUT' | 'FORBIDDEN' | 'PERSISTENCE_FAILED' };

export async function listDocs(input: ListDocsInput): Promise<ListDocsResult> {
  'use server';

  const productCode = normalizeText(input?.productCode);
  if (!productCode) return { ok: false, code: 'INVALID_INPUT' };

  return withOrgContext<ListDocsResult>(async ({ userId, orgId, client }) => {
    const queryClient = client as QueryClient;

    try {
      if (!(await hasComplianceDocWritePermission(queryClient, userId, orgId))) {
        return { ok: false, code: 'FORBIDDEN' };
      }

      const docs = await queryClient.query<Parameters<typeof mapDocRow>[0]>(
        `select id, product_code, doc_type, title, mime_type, file_size_bytes,
                version_number, expires_at::text, uploaded_at::text, uploaded_by_user::text
           from public.compliance_docs
          where org_id = app.current_org_id()
            and product_code = $1
            and deleted_at is null
          order by doc_type asc, version_number asc, uploaded_at asc`,
        [productCode],
      );

      return { ok: true, docs: docs.rows.map(mapDocRow) };
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
