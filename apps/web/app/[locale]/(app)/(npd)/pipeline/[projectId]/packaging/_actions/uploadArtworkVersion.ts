'use server';

/**
 * NPD PACKAGING stage — upload artwork version Server Action.
 *
 * Server-side upload via the service-role storage client to
 *   <orgId>/artwork/<projectId>/v<N>-<uuid>-<sanitized-name>
 * where N = (highest existing version) + 1. orgId ALWAYS from withOrgContext.
 *
 * Versioning decision (documented): the `v<N>-` object-name prefix IS the
 * version; the CURRENT artwork is the highest N. No set-current action —
 * deleting the newest version falls back to the previous one.
 *
 * Validation: pdf/png/jpg, max 20 MB. RBAC write: `npd.packaging.write`.
 */

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { PACKAGING_WRITE_PERMISSION } from './shared';
import {
  ARTWORK_MIME_TYPES,
  NPD_ATTACHMENTS_BUCKET,
  NPD_ATTACHMENT_MAX_BYTES,
  artworkPrefix,
  createNpdStorageAdmin,
  ensureNpdAttachmentsBucket,
  hasNpdPermission,
  parseArtworkObjectName,
  projectExistsInOrg,
  sanitizeFileName,
  writeNpdStorageAudit,
  type NpdStorageErrorCode,
  type QueryClient,
} from '../../../../../../../../lib/storage/npd-attachments';

export type UploadArtworkVersionResult =
  | { ok: true; objectName: string; version: number }
  | { ok: false; code: NpdStorageErrorCode };

export async function uploadArtworkVersion(formData: FormData): Promise<UploadArtworkVersionResult> {
  if (!formData || typeof formData.get !== 'function') return { ok: false, code: 'INVALID_INPUT' };

  const projectId = formData.get('projectId');
  const file = formData.get('file');
  if (typeof projectId !== 'string' || !/^[0-9a-f-]{36}$/i.test(projectId) || !(file instanceof File)) {
    return { ok: false, code: 'INVALID_INPUT' };
  }
  if (file.size <= 0) return { ok: false, code: 'INVALID_INPUT' };
  if (file.size > NPD_ATTACHMENT_MAX_BYTES) return { ok: false, code: 'FILE_TOO_LARGE' };
  if (!ARTWORK_MIME_TYPES.has(file.type)) return { ok: false, code: 'UNSUPPORTED_MIME_TYPE' };

  try {
    return await withOrgContext<UploadArtworkVersionResult>(async ({ userId, orgId, client }) => {
      const queryClient = client as unknown as QueryClient;

      await queryClient.query(`select pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [projectId]);

      if (!(await hasNpdPermission(queryClient, userId, orgId, PACKAGING_WRITE_PERMISSION))) {
        return { ok: false, code: 'FORBIDDEN' };
      }
      if (!(await projectExistsInOrg(queryClient, projectId))) {
        return { ok: false, code: 'PROJECT_NOT_FOUND' };
      }

      const prefix = artworkPrefix(orgId, projectId);
      const admin = await createNpdStorageAdmin();
      await ensureNpdAttachmentsBucket(admin);

      const { data: entries, error: listError } = await admin.storage
        .from(NPD_ATTACHMENTS_BUCKET)
        .list(prefix, { limit: 200 });
      if (listError) return { ok: false, code: 'STORAGE_FAILED' };

      const highest = (entries ?? []).reduce((max, entry) => {
        const parsed = parseArtworkObjectName(entry.name);
        return parsed && parsed.version > max ? parsed.version : max;
      }, 0);
      const version = highest + 1;

      const objectName = `v${version}-${randomUUID()}-${sanitizeFileName(file.name || 'artwork')}`;
      const path = `${prefix}/${objectName}`;
      const bytes = await file.arrayBuffer();
      const { error } = await admin.storage
        .from(NPD_ATTACHMENTS_BUCKET)
        .upload(path, bytes, { contentType: file.type, upsert: false });
      if (error) return { ok: false, code: 'STORAGE_FAILED' };

      await writeNpdStorageAudit(queryClient, {
        orgId,
        actorUserId: userId,
        action: 'npd.artwork.uploaded',
        resourceType: 'npd_artwork',
        resourceId: path,
        afterState: {
          project_id: projectId,
          object_name: objectName,
          version,
          mime_type: file.type,
          file_size_bytes: file.size,
        },
      });

      revalidatePath(`/[locale]/pipeline/${projectId}/packaging`, 'page');
      return { ok: true, objectName, version };
    });
  } catch (error) {
    console.error('[uploadArtworkVersion] failed:', error);
    return { ok: false, code: 'PERSISTENCE_FAILED' };
  }
}
