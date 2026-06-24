/**
 * NPD packaging artwork — Server Action unit tests (storage client MOCKED).
 *
 * Covers: validation (mime narrowed to pdf/png/jpg, 20 MB cap), RBAC + project
 * gates, version increment (`v<N>-` prefix = version; current = highest N),
 * org-scoped paths (`<orgId>/artwork/<projectId>/…`), and the listing DTO.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, storageUpload, storageRemove, storageList, storageSignedUrls, storageCreateBucket } =
  vi.hoisted(() => ({
    queryMock: vi.fn(),
    storageUpload: vi.fn(),
    storageRemove: vi.fn(),
    storageList: vi.fn(),
    storageSignedUrls: vi.fn(),
    storageCreateBucket: vi.fn(),
  }));

const ORG_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (
    action: (ctx: { userId: string; orgId: string; client: { query: typeof queryMock } }) => unknown,
  ) => action({ userId: USER_ID, orgId: ORG_ID, client: { query: queryMock } }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      createBucket: storageCreateBucket,
      from: vi.fn(() => ({
        upload: storageUpload,
        remove: storageRemove,
        list: storageList,
        createSignedUrls: storageSignedUrls,
      })),
    },
  })),
}));

function uploadForm(file: File, projectId: string = PROJECT_ID) {
  const form = new FormData();
  form.set('projectId', projectId);
  form.set('file', file);
  return form;
}

/** queryMock sequence: 1) RBAC gate, 2) project-in-org check, 3) audit insert. */
function grantAll() {
  queryMock
    .mockResolvedValueOnce({ rows: [{ ok: true }] })
    .mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] })
    .mockResolvedValueOnce({ rows: [] });
}

/** queryMock sequence for upload: 1) advisory lock, 2) RBAC gate, 3) project-in-org check, 4) audit insert. */
function grantUploadAll() {
  queryMock
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ ok: true }] })
    .mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] })
    .mockResolvedValueOnce({ rows: [] });
}

beforeEach(() => {
  queryMock.mockReset();
  storageUpload.mockReset();
  storageRemove.mockReset();
  storageList.mockReset();
  storageSignedUrls.mockReset();
  storageCreateBucket.mockReset();
  storageCreateBucket.mockResolvedValue({ data: { name: 'npd-attachments' }, error: null });
  storageUpload.mockResolvedValue({ data: { path: 'ok' }, error: null });
  storageRemove.mockResolvedValue({ data: null, error: null });
  storageList.mockResolvedValue({ data: [], error: null });
});

describe('uploadArtworkVersion', () => {
  it('rejects docx (allowed for brief attachments, NOT artwork)', async () => {
    const { uploadArtworkVersion } = await import('../uploadArtworkVersion');
    const docx = new File(['x'], 'art.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await expect(uploadArtworkVersion(uploadForm(docx))).resolves.toEqual({
      ok: false,
      code: 'UNSUPPORTED_MIME_TYPE',
    });
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('rejects files over 20 MB as FILE_TOO_LARGE', async () => {
    const { uploadArtworkVersion } = await import('../uploadArtworkVersion');
    const big = new File([new ArrayBuffer(20 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    await expect(uploadArtworkVersion(uploadForm(big))).resolves.toEqual({ ok: false, code: 'FILE_TOO_LARGE' });
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('uploads v1 to the org-scoped artwork prefix when no versions exist', async () => {
    const { uploadArtworkVersion } = await import('../uploadArtworkVersion');
    grantUploadAll();
    const file = new File(['png'], 'Label Front.png', { type: 'image/png' });
    const result = await uploadArtworkVersion(uploadForm(file));
    expect(result).toEqual(expect.objectContaining({ ok: true, version: 1 }));
    expect(queryMock.mock.calls[0]?.[0]).toMatch(/pg_advisory_xact_lock\(hashtextextended\(\$1::text, 0\)\)/);
    expect(queryMock.mock.calls[0]?.[1]).toEqual([PROJECT_ID]);

    const [path, , options] = storageUpload.mock.calls[0]!;
    expect(path).toMatch(
      new RegExp(`^${ORG_ID}/artwork/${PROJECT_ID}/v1-[0-9a-f-]{36}-label-front\\.png$`),
    );
    expect(options).toEqual({ contentType: 'image/png', upsert: false });
  });

  it('increments to v3 when v2 is the highest existing version', async () => {
    const { uploadArtworkVersion } = await import('../uploadArtworkVersion');
    grantUploadAll();
    storageList.mockResolvedValueOnce({
      data: [
        { name: 'v1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-old.png', metadata: { size: 1 } },
        { name: 'v2-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-new.png', metadata: { size: 1 } },
      ],
      error: null,
    });
    const file = new File(['png'], 'final.png', { type: 'image/png' });
    const result = await uploadArtworkVersion(uploadForm(file));
    expect(result).toEqual(expect.objectContaining({ ok: true, version: 3 }));
    const [path] = storageUpload.mock.calls[0]!;
    expect(path).toMatch(new RegExp(`^${ORG_ID}/artwork/${PROJECT_ID}/v3-`));

    const auditCall = queryMock.mock.calls[3]!;
    expect(auditCall[1]).toEqual(
      expect.arrayContaining([ORG_ID, USER_ID, 'npd.artwork.uploaded', 'npd_artwork']),
    );
  });

  it('returns FORBIDDEN without npd.packaging.write', async () => {
    const { uploadArtworkVersion } = await import('../uploadArtworkVersion');
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const file = new File(['png'], 'art.png', { type: 'image/png' });
    await expect(uploadArtworkVersion(uploadForm(file))).resolves.toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(storageUpload).not.toHaveBeenCalled();
  });
});

describe('listArtworkVersions', () => {
  it('parses v<N>- names, sorts DESC (current first) and flags images', async () => {
    const { listArtworkVersions } = await import('../listArtworkVersions');
    queryMock
      .mockResolvedValueOnce({ rows: [{ ok: true }] })
      .mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] });
    const prefix = `${ORG_ID}/artwork/${PROJECT_ID}`;
    storageList.mockResolvedValueOnce({
      data: [
        {
          name: 'v1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-draft.pdf',
          created_at: '2026-06-01T08:00:00.000Z',
          metadata: { size: 100, mimetype: 'application/pdf' },
        },
        {
          name: 'v2-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-final.png',
          created_at: '2026-06-10T08:00:00.000Z',
          metadata: { size: 200, mimetype: 'image/png' },
        },
        { name: 'stray-file.png', created_at: null, metadata: { size: 1, mimetype: 'image/png' } },
      ],
      error: null,
    });
    storageSignedUrls.mockResolvedValueOnce({
      data: [
        { path: `${prefix}/v2-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-final.png`, signedUrl: 'https://s/v2' },
        { path: `${prefix}/v1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-draft.pdf`, signedUrl: 'https://s/v1' },
      ],
      error: null,
    });

    const result = await listArtworkVersions({ projectId: PROJECT_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.versions).toHaveLength(2); // unparsable 'stray-file.png' dropped
    expect(result.versions[0]).toEqual(
      expect.objectContaining({ version: 2, fileName: 'final.png', isImage: true, signedUrl: 'https://s/v2' }),
    );
    expect(result.versions[1]).toEqual(
      expect.objectContaining({ version: 1, fileName: 'draft.pdf', isImage: false, signedUrl: 'https://s/v1' }),
    );
  });
});

describe('deleteArtworkVersion', () => {
  it('rejects traversal-shaped object names as INVALID_INPUT', async () => {
    const { deleteArtworkVersion } = await import('../deleteArtworkVersion');
    await expect(
      deleteArtworkVersion({ projectId: PROJECT_ID, objectName: '../briefs/x.pdf' }),
    ).resolves.toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it('removes the org-scoped path and writes an audit row', async () => {
    const { deleteArtworkVersion } = await import('../deleteArtworkVersion');
    grantAll();
    const objectName = 'v2-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-final.png';
    await expect(deleteArtworkVersion({ projectId: PROJECT_ID, objectName })).resolves.toEqual({ ok: true });
    expect(storageRemove).toHaveBeenCalledWith([`${ORG_ID}/artwork/${PROJECT_ID}/${objectName}`]);
    const auditCall = queryMock.mock.calls[2]!;
    expect(auditCall[1]).toEqual(
      expect.arrayContaining([ORG_ID, USER_ID, 'npd.artwork.deleted', 'npd_artwork']),
    );
  });
});
