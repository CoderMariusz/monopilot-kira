'use server';

/**
 * NPD PACKAGING stage — delete artwork version Server Action.
 *
 * Removes <orgId>/artwork/<projectId>/<objectName>. `objectName` must be a
 * single safe path segment (isSafeObjectName) — no traversal outside the
 * org/project prefix. Deleting the newest version makes the previous one
 * CURRENT (versioning = `v<N>-` ordering). RBAC write: `npd.packaging.write`.
 */

import { revalidatePath } from 'next/cache';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { PACKAGING_WRITE_PERMISSION } from './shared';
import {
  NPD_ATTACHMENTS_BUCKET,
  artworkPrefix,
  createNpdStorageAdmin,
  hasNpdPermission,
  isSafeObjectName,
  projectExistsInOrg,
  writeNpdStorageAudit,
  type NpdStorageErrorCode,
  type QueryClient,
} from '../../../../../../../../lib/storage/npd-attachments';

export type DeleteArtworkVersionResult =
  | { ok: true }
  | { ok: false; code: NpdStorageErrorCode };

export async function deleteArtworkVersion(input: {
  projectId: string;
  objectName: string;
}): Promise<DeleteArtworkVersionResult> {
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
    return await withOrgContext<DeleteArtworkVersionResult>(async ({ userId, orgId, client }) => {
      const queryClient = client as unknown as QueryClient;

      if (!(await hasNpdPermission(queryClient, userId, orgId, PACKAGING_WRITE_PERMISSION))) {
        return { ok: false, code: 'FORBIDDEN' };
      }
      if (!(await projectExistsInOrg(queryClient, projectId))) {
        return { ok: false, code: 'PROJECT_NOT_FOUND' };
      }

      const path = `${artworkPrefix(orgId, projectId)}/${objectName}`;
      const admin = await createNpdStorageAdmin();
      const { error } = await admin.storage.from(NPD_ATTACHMENTS_BUCKET).remove([path]);
      if (error) return { ok: false, code: 'STORAGE_FAILED' };

      await writeNpdStorageAudit(queryClient, {
        orgId,
        actorUserId: userId,
        action: 'npd.artwork.deleted',
        resourceType: 'npd_artwork',
        resourceId: path,
        afterState: { project_id: projectId, object_name: objectName },
      });

      revalidatePath(`/[locale]/pipeline/${projectId}/packaging`, 'page');
      return { ok: true };
    });
  } catch (error) {
    console.error('[deleteArtworkVersion] failed:', error);
    return { ok: false, code: 'PERSISTENCE_FAILED' };
  }
}
