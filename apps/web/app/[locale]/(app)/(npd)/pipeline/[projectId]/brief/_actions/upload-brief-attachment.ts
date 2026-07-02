'use server';

/**
 * NPD project-stage Brief — upload attachment Server Action.
 *
 * Server-side upload via the service-role storage client (mirrors the
 * compliance-docs pattern — least new infra; no signed-upload handshake).
 * Path: <orgId>/briefs/<projectId>/<uuid>-<sanitized-name> — orgId ALWAYS from
 * withOrgContext (never client input). Bucket: npd-attachments (mig 279).
 *
 * Validation: pdf/png/jpg/docx/xlsx, max 20 MB, non-empty file.
 * RBAC write: `npd.core.write` — the SAME permission that gates brief edits
 * (updateProjectBrief), so upload capability tracks the existing canWrite flag.
 */

import { randomUUID } from 'node:crypto';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';
import {
  BRIEF_ATTACHMENT_MIME_TYPES,
  NPD_ATTACHMENTS_BUCKET,
  NPD_ATTACHMENT_MAX_BYTES,
  briefAttachmentsPrefix,
  createNpdStorageAdmin,
  ensureNpdAttachmentsBucket,
  hasNpdPermission,
  projectExistsInOrg,
  sanitizeFileName,
  writeNpdStorageAudit,
  type NpdStorageErrorCode,
  type QueryClient,
} from '../../../../../../../../lib/storage/npd-attachments';

const WRITE_PERMISSION = 'npd.core.write';

export type UploadBriefAttachmentResult =
  | { ok: true; objectName: string }
  | { ok: false; code: NpdStorageErrorCode };

export async function uploadBriefAttachment(formData: FormData): Promise<UploadBriefAttachmentResult> {
  if (!formData || typeof formData.get !== 'function') return { ok: false, code: 'INVALID_INPUT' };

  const projectId = formData.get('projectId');
  const file = formData.get('file');
  if (typeof projectId !== 'string' || !isUuid(projectId) || !(file instanceof File)) {
    return { ok: false, code: 'INVALID_INPUT' };
  }
  if (file.size <= 0) return { ok: false, code: 'INVALID_INPUT' };
  if (file.size > NPD_ATTACHMENT_MAX_BYTES) return { ok: false, code: 'FILE_TOO_LARGE' };
  if (!BRIEF_ATTACHMENT_MIME_TYPES.has(file.type)) return { ok: false, code: 'UNSUPPORTED_MIME_TYPE' };

  try {
    return await withOrgContext<UploadBriefAttachmentResult>(async ({ userId, orgId, client }) => {
      const queryClient = client as unknown as QueryClient;

      if (!(await hasNpdPermission(queryClient, userId, orgId, WRITE_PERMISSION))) {
        return { ok: false, code: 'FORBIDDEN' };
      }
      if (!(await projectExistsInOrg(queryClient, projectId))) {
        return { ok: false, code: 'PROJECT_NOT_FOUND' };
      }

      const objectName = `${randomUUID()}-${sanitizeFileName(file.name || 'attachment')}`;
      const path = `${briefAttachmentsPrefix(orgId, projectId)}/${objectName}`;

      const admin = await createNpdStorageAdmin();
      await ensureNpdAttachmentsBucket(admin);
      const bytes = await file.arrayBuffer();
      const { error } = await admin.storage
        .from(NPD_ATTACHMENTS_BUCKET)
        .upload(path, bytes, { contentType: file.type, upsert: false });
      if (error) return { ok: false, code: 'STORAGE_FAILED' };

      await writeNpdStorageAudit(queryClient, {
        orgId,
        actorUserId: userId,
        action: 'npd.brief_attachment.uploaded',
        resourceType: 'npd_brief_attachment',
        resourceId: path,
        afterState: {
          project_id: projectId,
          object_name: objectName,
          mime_type: file.type,
          file_size_bytes: file.size,
        },
      });

      revalidateLocalized(`/pipeline/${projectId}/brief`, 'page');
      return { ok: true, objectName };
    });
  } catch (error) {
    console.error('[uploadBriefAttachment] failed:', error);
    return { ok: false, code: 'PERSISTENCE_FAILED' };
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
