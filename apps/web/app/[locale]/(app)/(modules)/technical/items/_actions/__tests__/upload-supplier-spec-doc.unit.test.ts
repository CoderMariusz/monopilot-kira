import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, storageCreateBucket, storageUpload, storageRemove } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  storageCreateBucket: vi.fn(),
  storageUpload: vi.fn(),
  storageRemove: vi.fn(),
}));

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: { userId: string; orgId: string; client: { query: typeof queryMock } }) => unknown) =>
    action({
      userId: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      client: { query: queryMock },
    }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      createBucket: storageCreateBucket,
      from: vi.fn(() => ({
        upload: storageUpload,
        remove: storageRemove,
      })),
    },
  })),
}));

const specId = '33333333-3333-4333-8333-333333333333';

function formDataFor(file: Blob) {
  const form = new FormData();
  form.set('specId', specId);
  form.set('file', file);
  return form;
}

describe('uploadSupplierSpecDoc', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(Date, 'now').mockReturnValue(1790000000000);
    queryMock.mockReset();
    storageCreateBucket.mockReset();
    storageUpload.mockReset();
    storageRemove.mockReset();
    storageCreateBucket.mockResolvedValue({ data: { name: 'bucket' }, error: null });
    storageUpload.mockResolvedValue({ data: { path: 'ok' }, error: null });
    storageRemove.mockResolvedValue({ data: null, error: null });
  });

  it('rejects oversized files without touching the database or storage', async () => {
    const { uploadSupplierSpecDoc } = await import('../upload-supplier-spec-doc');
    const oversized = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'too-large.pdf', {
      type: 'application/pdf',
    });

    await expect(uploadSupplierSpecDoc(formDataFor(oversized))).resolves.toEqual({
      ok: false,
      error: 'file too large',
    });
    expect(queryMock).not.toHaveBeenCalled();
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('rejects unsupported mime types without touching the database or storage', async () => {
    const { uploadSupplierSpecDoc } = await import('../upload-supplier-spec-doc');

    await expect(uploadSupplierSpecDoc(formDataFor(new File(['plain'], 'note.txt', { type: 'text/plain' })))).resolves.toEqual({
      ok: false,
      error: 'unsupported mime type',
    });
    expect(queryMock).not.toHaveBeenCalled();
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('returns not found when the supplier spec is not in the caller org', async () => {
    const { uploadSupplierSpecDoc } = await import('../upload-supplier-spec-doc');
    queryMock.mockResolvedValueOnce({ rows: [{ ok: true }] }).mockResolvedValueOnce({ rows: [] });

    await expect(uploadSupplierSpecDoc(formDataFor(new File(['pdf'], 'spec.pdf', { type: 'application/pdf' })))).resolves.toEqual({
      ok: false,
      error: 'not found',
    });
    expect(storageUpload).not.toHaveBeenCalled();
    expect(queryMock.mock.calls[1][0].replace(/\s+/g, ' ').toLowerCase()).toContain(
      'where org_id = app.current_org_id() and id = $1::uuid',
    );
  });

  it('uploads the file and updates supplier_specs document columns for the caller org', async () => {
    const { uploadSupplierSpecDoc } = await import('../upload-supplier-spec-doc');
    queryMock
      .mockResolvedValueOnce({ rows: [{ ok: true }] })
      .mockResolvedValueOnce({ rows: [{ id: specId }] })
      .mockResolvedValueOnce({ rows: [{ id: specId }] });

    const file = new File(['pdf'], 'Supplier Spec.pdf', { type: 'application/pdf' });
    await expect(uploadSupplierSpecDoc(formDataFor(file))).resolves.toEqual({
      ok: true,
      data: {
        url: `org-22222222-2222-4222-8222-222222222222-supplier-specs/${specId}/1790000000000-supplier-spec.pdf`,
      },
    });

    expect(storageCreateBucket).toHaveBeenCalledWith('org-22222222-2222-4222-8222-222222222222-supplier-specs', {
      public: false,
      fileSizeLimit: 20 * 1024 * 1024,
      allowedMimeTypes: expect.arrayContaining(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
    });
    expect(storageUpload).toHaveBeenCalledWith(`${specId}/1790000000000-supplier-spec.pdf`, expect.any(ArrayBuffer), {
      contentType: 'application/pdf',
      upsert: false,
    });

    const updateCall = queryMock.mock.calls[2];
    expect(updateCall[0].replace(/\s+/g, ' ').toLowerCase()).toContain('update public.supplier_specs');
    expect(updateCall[0].replace(/\s+/g, ' ').toLowerCase()).toContain('org_id = (select app.current_org_id())');
    expect(updateCall[0]).toContain('spec_document_url');
    expect(updateCall[0]).toContain('document_sha256');
    expect(updateCall[0]).toContain('document_mime_type');
    expect(updateCall[0]).toContain('uploaded_at');
    expect(updateCall[0]).toContain('uploaded_by');
    expect(updateCall[1]).toEqual([
      specId,
      `org-22222222-2222-4222-8222-222222222222-supplier-specs/${specId}/1790000000000-supplier-spec.pdf`,
      createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'),
      'application/pdf',
      '11111111-1111-4111-8111-111111111111',
    ]);
  });
});
