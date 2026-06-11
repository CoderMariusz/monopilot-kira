'use server';

/**
 * NPD PACKAGING stage — list artwork versions Server Action.
 *
 * Lists <orgId>/artwork/<projectId>/ and returns the parsed versions sorted
 * DESC (versions[0] = CURRENT) with short-lived signed URLs. No metadata
 * table — the storage listing is the source of truth (least new infra).
 *
 * RBAC read: `npd.packaging.read`.
 */

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { PACKAGING_READ_PERMISSION } from './shared';
import {
  IMAGE_MIME_TYPES,
  NPD_ATTACHMENTS_BUCKET,
  NPD_SIGNED_URL_TTL_SECONDS,
  artworkPrefix,
  createNpdStorageAdmin,
  hasNpdPermission,
  parseArtworkObjectName,
  projectExistsInOrg,
  type ArtworkVersionDto,
  type NpdStorageErrorCode,
  type QueryClient,
} from '../../../../../../../../lib/storage/npd-attachments';

export type ListArtworkVersionsResult =
  | { ok: true; versions: ArtworkVersionDto[] }
  | { ok: false; code: NpdStorageErrorCode };

export async function listArtworkVersions(input: {
  projectId: string;
}): Promise<ListArtworkVersionsResult> {
  const projectId = input?.projectId;
  if (typeof projectId !== 'string' || !/^[0-9a-f-]{36}$/i.test(projectId)) {
    return { ok: false, code: 'INVALID_INPUT' };
  }

  try {
    return await withOrgContext<ListArtworkVersionsResult>(async ({ userId, orgId, client }) => {
      const queryClient = client as unknown as QueryClient;

      if (!(await hasNpdPermission(queryClient, userId, orgId, PACKAGING_READ_PERMISSION))) {
        return { ok: false, code: 'FORBIDDEN' };
      }
      if (!(await projectExistsInOrg(queryClient, projectId))) {
        return { ok: false, code: 'PROJECT_NOT_FOUND' };
      }

      const prefix = artworkPrefix(orgId, projectId);
      const admin = await createNpdStorageAdmin();
      const { data: entries, error } = await admin.storage
        .from(NPD_ATTACHMENTS_BUCKET)
        .list(prefix, { limit: 200 });
      if (error) return { ok: false, code: 'STORAGE_FAILED' };

      const parsed = (entries ?? [])
        .filter((e) => e.name && e.metadata)
        .map((e) => ({ entry: e, meta: parseArtworkObjectName(e.name) }))
        .filter((p): p is typeof p & { meta: NonNullable<(typeof p)['meta']> } => p.meta !== null)
        .sort((a, b) => b.meta.version - a.meta.version);

      if (parsed.length === 0) return { ok: true, versions: [] };

      const { data: signed, error: signError } = await admin.storage
        .from(NPD_ATTACHMENTS_BUCKET)
        .createSignedUrls(
          parsed.map((p) => `${prefix}/${p.entry.name}`),
          NPD_SIGNED_URL_TTL_SECONDS,
        );
      if (signError || !signed) return { ok: false, code: 'STORAGE_FAILED' };

      const urlByPath = new Map(signed.map((s) => [s.path ?? '', s.signedUrl]));
      const versions: ArtworkVersionDto[] = parsed.map(({ entry, meta }) => {
        const mimeType = entry.metadata?.mimetype ?? '';
        return {
          version: meta.version,
          objectName: entry.name,
          fileName: meta.fileName,
          sizeBytes: Number(entry.metadata?.size ?? 0),
          uploadedAt: entry.created_at ?? entry.updated_at ?? '',
          signedUrl: urlByPath.get(`${prefix}/${entry.name}`) ?? '',
          mimeType,
          isImage: IMAGE_MIME_TYPES.has(mimeType),
        };
      });

      return { ok: true, versions };
    });
  } catch (error) {
    console.error('[listArtworkVersions] failed:', error);
    return { ok: false, code: 'PERSISTENCE_FAILED' };
  }
}
