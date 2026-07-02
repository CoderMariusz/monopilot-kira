'use server';

/**
 * NPD project-stage Brief — delete attachment Server Action.
 *
 * Removes <orgId>/briefs/<projectId>/<objectName>. `objectName` must be a
 * single safe path segment (isSafeObjectName) so a caller can never traverse
 * outside the org/project prefix. RBAC write: `npd.core.write`.
 */

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';
import {
  NPD_ATTACHMENTS_BUCKET,
  briefAttachmentsPrefix,
  createNpdStorageAdmin,
  hasNpdPermission,
  isSafeObjectName,
  projectExistsInOrg,
  writeNpdStorageAudit,
  type NpdStorageErrorCode,
  type QueryClient,
} from '../../../../../../../../lib/storage/npd-attachments';

const WRITE_PERMISSION = 'npd.core.write';

export type DeleteBriefAttachmentResult =
  | { ok: true }
  | { ok: false; code: NpdStorageErrorCode };

export async function deleteBriefAttachment(input: {
  projectId: string;
  objectName: string;
}): Promise<DeleteBriefAttachmentResult> {
  const projectId = input?.projectId;
  const objectName = input?.objectName;
  if (
    typeof projectId !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(projectId) ||
    !isSafeObjectName(objectName)
  ) {
    return { ok: false, code: 'INVALID_INPUT' };
  }

  try {
    return await withOrgContext<DeleteBriefAttachmentResult>(async ({ userId, orgId, client }) => {
      const queryClient = client as unknown as QueryClient;

      if (!(await hasNpdPermission(queryClient, userId, orgId, WRITE_PERMISSION))) {
        return { ok: false, code: 'FORBIDDEN' };
      }
      if (!(await projectExistsInOrg(queryClient, projectId))) {
        return { ok: false, code: 'PROJECT_NOT_FOUND' };
      }

      const path = `${briefAttachmentsPrefix(orgId, projectId)}/${objectName}`;
      const admin = await createNpdStorageAdmin();
      const { error } = await admin.storage.from(NPD_ATTACHMENTS_BUCKET).remove([path]);
      if (error) return { ok: false, code: 'STORAGE_FAILED' };

      await writeNpdStorageAudit(queryClient, {
        orgId,
        actorUserId: userId,
        action: 'npd.brief_attachment.deleted',
        resourceType: 'npd_brief_attachment',
        resourceId: path,
        afterState: { project_id: projectId, object_name: objectName },
      });

      revalidateLocalized(`/pipeline/${projectId}/brief`, 'page');
      return { ok: true };
    });
  } catch (error) {
    console.error('[deleteBriefAttachment] failed:', error);
    return { ok: false, code: 'PERSISTENCE_FAILED' };
  }
}
