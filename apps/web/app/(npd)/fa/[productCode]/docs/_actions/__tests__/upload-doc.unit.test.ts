import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, storageUpload, storageRemove } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  storageUpload: vi.fn(),
  storageRemove: vi.fn(),
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
    storageUpload.mockResolvedValue({ data: { path: 'ok' }, error: null });
    storageRemove.mockResolvedValue({ data: null, error: null });
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
