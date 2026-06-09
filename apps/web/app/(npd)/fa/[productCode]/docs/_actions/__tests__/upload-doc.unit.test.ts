import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, storageUpload, storageRemove, storageCreateBucket } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  storageUpload: vi.fn(),
  storageRemove: vi.fn(),
  storageCreateBucket: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: { userId: string; orgId: string; client: { query: typeof queryMock } }) => unknown) =>
    action({ userId: '11111111-1111-4111-8111-111111111111', orgId: '22222222-2222-4222-8222-222222222222', client: { query: queryMock } }),
}));

vi.mock('../../../../../../../lib/auth/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    storage: {
      from: vi.fn(() => ({
        upload: storageUpload,
        remove: storageRemove,
      })),
    },
  })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      createBucket: storageCreateBucket,
    },
  })),
}));

function formDataFor(file: File) {
  const form = new FormData();
  form.set('productCode', 'FG-1');
  form.set('docType', 'Spec');
  form.set('title', 'Release Specification');
  form.set('file', file);
  return form;
}

describe('uploadDoc storage cleanup', () => {
  beforeEach(() => {
    queryMock.mockReset();
    storageUpload.mockReset();
    storageRemove.mockReset();
    storageCreateBucket.mockReset();
    storageCreateBucket.mockResolvedValue({ data: { name: 'bucket' }, error: null });
    storageUpload.mockResolvedValue({ data: { path: 'ok' }, error: null });
    storageRemove.mockResolvedValue({ data: null, error: null });
  });

  it('creates the private org compliance bucket before uploading when the bucket is missing', async () => {
    const { uploadDoc } = await import('../upload-doc');
    queryMock
      .mockResolvedValueOnce({ rows: [{ ok: true }] })
      .mockResolvedValueOnce({ rows: [{ product_code: 'FG-1' }] })
      .mockResolvedValueOnce({ rows: [{ version_number: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: '33333333-3333-4333-8333-333333333333', version_number: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(uploadDoc(formDataFor(new File(['pdf'], 'spec.pdf', { type: 'application/pdf' })))).resolves.toEqual({
      ok: true,
      docId: '33333333-3333-4333-8333-333333333333',
      versionNumber: 1,
    });

    expect(storageCreateBucket).toHaveBeenCalledWith('org-22222222-2222-4222-8222-222222222222-compliance-docs', {
      public: false,
      fileSizeLimit: 20 * 1024 * 1024,
      allowedMimeTypes: expect.arrayContaining(['application/pdf', 'image/png', 'image/jpeg']),
    });
    expect(storageUpload).toHaveBeenCalledTimes(1);
  });

  it('swallows bucket already-exists errors and still uploads', async () => {
    const { uploadDoc } = await import('../upload-doc');
    storageCreateBucket.mockResolvedValueOnce({ data: null, error: { statusCode: 409, message: 'Bucket already exists' } });
    queryMock
      .mockResolvedValueOnce({ rows: [{ ok: true }] })
      .mockResolvedValueOnce({ rows: [{ product_code: 'FG-1' }] })
      .mockResolvedValueOnce({ rows: [{ version_number: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: '44444444-4444-4444-8444-444444444444', version_number: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(uploadDoc(formDataFor(new File(['pdf'], 'spec.pdf', { type: 'application/pdf' })))).resolves.toEqual({
      ok: true,
      docId: '44444444-4444-4444-8444-444444444444',
      versionNumber: 1,
    });

    expect(storageCreateBucket).toHaveBeenCalledTimes(1);
    expect(storageUpload).toHaveBeenCalledTimes(1);
  });

  it('removes the uploaded storage object when the compliance_docs insert fails', async () => {
    const { uploadDoc } = await import('../upload-doc');
    queryMock
      .mockResolvedValueOnce({ rows: [{ ok: true }] })
      .mockResolvedValueOnce({ rows: [{ product_code: 'FG-1' }] })
      .mockResolvedValueOnce({ rows: [{ version_number: 1 }] })
      .mockRejectedValueOnce(new Error('insert failed'));

    await expect(uploadDoc(formDataFor(new File(['pdf'], 'spec.pdf', { type: 'application/pdf' })))).resolves.toEqual({
      ok: false,
      code: 'PERSISTENCE_FAILED',
    });

    expect(storageUpload).toHaveBeenCalledTimes(1);
    expect(storageRemove).toHaveBeenCalledTimes(1);
    expect(storageRemove).toHaveBeenCalledWith([expect.stringMatching(/^fg-1\/spec\/v1\/.+-spec\.pdf$/)]);
  });
});
