'use server';

/**
 * NPD project-stage Brief — list attachments Server Action.
 *
 * Lists the storage objects under <orgId>/briefs/<projectId>/ (no metadata
 * table — the storage listing IS the source of truth; documented decision:
 * least new infra) and mints short-lived signed download URLs (15 min).
 *
 * RBAC read: `npd.brief.read` (same as readProjectBrief).
 */

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  NPD_ATTACHMENTS_BUCKET,
  NPD_SIGNED_URL_TTL_SECONDS,
  briefAttachmentsPrefix,
  createNpdStorageAdmin,
  displayFileName,
  hasNpdPermission,
  projectExistsInOrg,
  type BriefAttachmentDto,
  type NpdStorageErrorCode,
  type QueryClient,
} from '../../../../../../../../lib/storage/npd-attachments';

const READ_PERMISSION = 'npd.brief.read';

export type ListBriefAttachmentsResult =
  | { ok: true; attachments: BriefAttachmentDto[] }
  | { ok: false; code: NpdStorageErrorCode };

export async function listBriefAttachments(input: {
  projectId: string;
}): Promise<ListBriefAttachmentsResult> {
  const projectId = input?.projectId;
  if (typeof projectId !== 'string' || !/^[0-9a-f-]{36}$/i.test(projectId)) {
    return { ok: false, code: 'INVALID_INPUT' };
  }

  try {
    return await withOrgContext<ListBriefAttachmentsResult>(async ({ userId, orgId, client }) => {
      const queryClient = client as unknown as QueryClient;

      if (!(await hasNpdPermission(queryClient, userId, orgId, READ_PERMISSION))) {
        return { ok: false, code: 'FORBIDDEN' };
      }
      if (!(await projectExistsInOrg(queryClient, projectId))) {
        return { ok: false, code: 'PROJECT_NOT_FOUND' };
      }

      const prefix = briefAttachmentsPrefix(orgId, projectId);
      const admin = await createNpdStorageAdmin();
      const { data: entries, error } = await admin.storage
        .from(NPD_ATTACHMENTS_BUCKET)
        .list(prefix, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) return { ok: false, code: 'STORAGE_FAILED' };

      const files = (entries ?? []).filter((e) => e.name && e.metadata);
      if (files.length === 0) return { ok: true, attachments: [] };

      const { data: signed, error: signError } = await admin.storage
        .from(NPD_ATTACHMENTS_BUCKET)
        .createSignedUrls(
          files.map((f) => `${prefix}/${f.name}`),
          NPD_SIGNED_URL_TTL_SECONDS,
        );
      if (signError || !signed) return { ok: false, code: 'STORAGE_FAILED' };

      const urlByPath = new Map(signed.map((s) => [s.path ?? '', s.signedUrl]));
      const attachments: BriefAttachmentDto[] = files.map((f) => ({
        objectName: f.name,
        fileName: displayFileName(f.name),
        sizeBytes: Number(f.metadata?.size ?? 0),
        uploadedAt: f.created_at ?? f.updated_at ?? '',
        signedUrl: urlByPath.get(`${prefix}/${f.name}`) ?? '',
      }));

      return { ok: true, attachments };
    });
  } catch (error) {
    console.error('[listBriefAttachments] failed:', error);
    return { ok: false, code: 'PERSISTENCE_FAILED' };
  }
}
