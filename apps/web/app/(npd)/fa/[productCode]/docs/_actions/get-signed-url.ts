import { randomUUID } from 'node:crypto';

import { createServerSupabaseClient } from '../../../../../../lib/auth/supabase-server';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  COMPLIANCE_DOC_APP_VERSION,
  COMPLIANCE_DOC_SIGNED_URL_TTL_SECONDS,
  complianceDocsBucket,
  hasComplianceDocWritePermission,
  type QueryClient,
} from './upload-doc';

export type GetSignedUrlInput = {
  productCode: string;
  docId: string;
};

export type GetSignedUrlResult =
  | { ok: true; url: string; expiresInSeconds: number }
  | { ok: false; code: 'INVALID_INPUT' | 'FORBIDDEN' | 'DOC_NOT_FOUND' | 'STORAGE_FAILED' | 'PERSISTENCE_FAILED' };

export async function getSignedUrl(input: GetSignedUrlInput): Promise<GetSignedUrlResult> {
  'use server';

  const productCode = normalizeText(input?.productCode);
  const docId = normalizeText(input?.docId);
  if (!productCode || !docId) return { ok: false, code: 'INVALID_INPUT' };

  return withOrgContext<GetSignedUrlResult>(async ({ userId, orgId, client }) => {
    const queryClient = client as QueryClient;

    try {
      if (!(await hasComplianceDocWritePermission(queryClient, userId, orgId))) {
        return { ok: false, code: 'FORBIDDEN' };
      }

      const doc = await queryClient.query<{ id: string; file_path: string }>(
        `select id, file_path
           from public.compliance_docs
          where org_id = app.current_org_id()
            and product_code = $1
            and id = $2::uuid
            and deleted_at is null
          limit 1`,
        [productCode, docId],
      );
      const row = doc.rows[0];
      if (!row) return { ok: false, code: 'DOC_NOT_FOUND' };

      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase.storage
        .from(complianceDocsBucket(orgId))
        .createSignedUrl(row.file_path, COMPLIANCE_DOC_SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) return { ok: false, code: 'STORAGE_FAILED' };

      await queryClient.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            before_state, after_state, request_id, retention_class)
         values ($1::uuid, $2::uuid, 'user', 'compliance_doc.url_granted', 'compliance_doc', $3,
                 null, $4::jsonb, $5::uuid, 'operational')`,
        [
          orgId,
          userId,
          row.id,
          JSON.stringify({ product_code: productCode, ttl_seconds: COMPLIANCE_DOC_SIGNED_URL_TTL_SECONDS }),
          randomUUID(),
        ],
      );

      return { ok: true, url: data.signedUrl, expiresInSeconds: COMPLIANCE_DOC_SIGNED_URL_TTL_SECONDS };
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
