/**
 * NPD brief attachments — Server Action unit tests (storage client MOCKED).
 *
 * Covers: validation paths (input / size / mime), RBAC + project gates, and —
 * critically — that every storage path is prefixed with the withOrgContext
 * orgId (`<orgId>/briefs/<projectId>/…`), never client input.
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
});

describe('uploadBriefAttachment', () => {
  it('rejects a missing file / bad projectId as INVALID_INPUT', async () => {
    const { uploadBriefAttachment } = await import('../upload-brief-attachment');
    const noFile = new FormData();
    noFile.set('projectId', PROJECT_ID);
    await expect(uploadBriefAttachment(noFile)).resolves.toEqual({ ok: false, code: 'INVALID_INPUT' });

    const badProject = uploadForm(new File(['x'], 'a.pdf', { type: 'application/pdf' }), 'not-a-uuid');
    await expect(uploadBriefAttachment(badProject)).resolves.toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(queryMock).not.toHaveBeenCalled();
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('rejects files over 20 MB as FILE_TOO_LARGE before touching storage', async () => {
    const { uploadBriefAttachment } = await import('../upload-brief-attachment');
    const big = new File([new ArrayBuffer(20 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' });
    await expect(uploadBriefAttachment(uploadForm(big))).resolves.toEqual({ ok: false, code: 'FILE_TOO_LARGE' });
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('rejects disallowed mime types as UNSUPPORTED_MIME_TYPE', async () => {
    const { uploadBriefAttachment } = await import('../upload-brief-attachment');
    const exe = new File(['x'], 'evil.exe', { type: 'application/x-msdownload' });
    await expect(uploadBriefAttachment(uploadForm(exe))).resolves.toEqual({
      ok: false,
      code: 'UNSUPPORTED_MIME_TYPE',
    });
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN without npd.core.write', async () => {
    const { uploadBriefAttachment } = await import('../upload-brief-attachment');
    queryMock.mockResolvedValueOnce({ rows: [] }); // RBAC gate denies
    const file = new File(['pdf'], 'brief.pdf', { type: 'application/pdf' });
    await expect(uploadBriefAttachment(uploadForm(file))).resolves.toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('returns PROJECT_NOT_FOUND for a foreign/absent project', async () => {
    const { uploadBriefAttachment } = await import('../upload-brief-attachment');
    queryMock
      .mockResolvedValueOnce({ rows: [{ ok: true }] })
      .mockResolvedValueOnce({ rows: [] }); // project check misses
    const file = new File(['pdf'], 'brief.pdf', { type: 'application/pdf' });
    await expect(uploadBriefAttachment(uploadForm(file))).resolves.toEqual({
      ok: false,
      code: 'PROJECT_NOT_FOUND',
    });
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('uploads under the org-scoped prefix and writes an audit row', async () => {
    const { uploadBriefAttachment } = await import('../upload-brief-attachment');
    grantAll();
    const file = new File(['pdf'], 'Spec Sheet.PDF', { type: 'application/pdf' });
    const result = await uploadBriefAttachment(uploadForm(file));
    expect(result.ok).toBe(true);

    expect(storageUpload).toHaveBeenCalledTimes(1);
    const [path, , options] = storageUpload.mock.calls[0]!;
    // org segment comes from withOrgContext, NEVER from the form.
    expect(path).toMatch(
      new RegExp(`^${ORG_ID}/briefs/${PROJECT_ID}/[0-9a-f-]{36}-spec-sheet\\.pdf$`),
    );
    expect(options).toEqual({ contentType: 'application/pdf', upsert: false });

    // 3rd query = audit_log insert.
    const auditCall = queryMock.mock.calls[2]!;
    expect(String(auditCall[0])).toContain('insert into public.audit_log');
    expect(auditCall[1]).toEqual(
      expect.arrayContaining([ORG_ID, USER_ID, 'npd.brief_attachment.uploaded', 'npd_brief_attachment']),
    );
  });

  it('maps a storage error to STORAGE_FAILED', async () => {
    const { uploadBriefAttachment } = await import('../upload-brief-attachment');
    grantAll();
    storageUpload.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const file = new File(['pdf'], 'brief.pdf', { type: 'application/pdf' });
    await expect(uploadBriefAttachment(uploadForm(file))).resolves.toEqual({
      ok: false,
      code: 'STORAGE_FAILED',
    });
  });
});

describe('listBriefAttachments', () => {
  it('lists the org/project prefix and maps entries with signed URLs', async () => {
    const { listBriefAttachments } = await import('../list-brief-attachments');
    queryMock
      .mockResolvedValueOnce({ rows: [{ ok: true }] })
      .mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] });
    const objectName = '44444444-4444-4444-8444-444444444444-spec.pdf';
    storageList.mockResolvedValueOnce({
      data: [
        {
          name: objectName,
          created_at: '2026-06-11T08:00:00.000Z',
          metadata: { size: 1234, mimetype: 'application/pdf' },
        },
      ],
      error: null,
    });
    storageSignedUrls.mockResolvedValueOnce({
      data: [
        {
          path: `${ORG_ID}/briefs/${PROJECT_ID}/${objectName}`,
          signedUrl: 'https://signed.example/spec.pdf',
        },
      ],
      error: null,
    });

    await expect(listBriefAttachments({ projectId: PROJECT_ID })).resolves.toEqual({
      ok: true,
      attachments: [
        {
          objectName,
          fileName: 'spec.pdf', // uuid prefix stripped for display
          sizeBytes: 1234,
          uploadedAt: '2026-06-11T08:00:00.000Z',
          signedUrl: 'https://signed.example/spec.pdf',
        },
      ],
    });
    expect(storageList).toHaveBeenCalledWith(`${ORG_ID}/briefs/${PROJECT_ID}`, expect.any(Object));
  });

  it('returns FORBIDDEN without npd.brief.read', async () => {
    const { listBriefAttachments } = await import('../list-brief-attachments');
    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(listBriefAttachments({ projectId: PROJECT_ID })).resolves.toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(storageList).not.toHaveBeenCalled();
  });
});

describe('deleteBriefAttachment', () => {
  it('rejects traversal-shaped object names as INVALID_INPUT', async () => {
    const { deleteBriefAttachment } = await import('../delete-brief-attachment');
    for (const objectName of ['../other-org/file.pdf', 'a/b.pdf', 'x..y', ' lead.pdf']) {
      await expect(deleteBriefAttachment({ projectId: PROJECT_ID, objectName })).resolves.toEqual({
        ok: false,
        code: 'INVALID_INPUT',
      });
    }
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it('removes the org-scoped path and writes an audit row', async () => {
    const { deleteBriefAttachment } = await import('../delete-brief-attachment');
    grantAll();
    const objectName = '44444444-4444-4444-8444-444444444444-spec.pdf';
    await expect(deleteBriefAttachment({ projectId: PROJECT_ID, objectName })).resolves.toEqual({ ok: true });
    expect(storageRemove).toHaveBeenCalledWith([`${ORG_ID}/briefs/${PROJECT_ID}/${objectName}`]);
    const auditCall = queryMock.mock.calls[2]!;
    expect(auditCall[1]).toEqual(
      expect.arrayContaining([ORG_ID, USER_ID, 'npd.brief_attachment.deleted', 'npd_brief_attachment']),
    );
  });
});
