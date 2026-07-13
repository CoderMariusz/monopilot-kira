/**
 * @vitest-environment jsdom
 *
 * C7b — FG detail index redirects into the canonical pipeline.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirectMock, withOrgContextMock, resolveProjectIdByProductCodeMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  withOrgContextMock: vi.fn(),
  resolveProjectIdByProductCodeMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

vi.mock('../../../../../../lib/npd/product-project-resolver', () => ({
  resolveProjectIdByProductCode: resolveProjectIdByProductCodeMock,
}));

import FgDetailRedirectPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  withOrgContextMock.mockImplementation(async (cb: (ctx: unknown) => Promise<unknown>) =>
    cb({ client: { query: vi.fn() } }),
  );
});

describe('FgDetailRedirectPage (C7b)', () => {
  it('redirects to the pipeline project when productCode resolves uniquely', async () => {
    resolveProjectIdByProductCodeMock.mockResolvedValue({ kind: 'ok', projectId: 'proj-123' });

    await expect(
      FgDetailRedirectPage({ params: Promise.resolve({ locale: 'en', productCode: 'FG-001' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/en/pipeline/proj-123');

    expect(withOrgContextMock).toHaveBeenCalledTimes(1);
    expect(resolveProjectIdByProductCodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ client: expect.any(Object) }),
      'FG-001',
    );
  });

  it('redirects to the first project when productCode is ambiguous', async () => {
    resolveProjectIdByProductCodeMock.mockResolvedValue({
      kind: 'ambiguous',
      projectIds: ['proj-a', 'proj-b'],
    });

    await expect(
      FgDetailRedirectPage({ params: Promise.resolve({ locale: 'pl', productCode: 'FG-002' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/pl/pipeline/proj-a');
  });

  it('redirects to the pipeline list when productCode does not resolve', async () => {
    resolveProjectIdByProductCodeMock.mockResolvedValue({ kind: 'none' });

    await expect(
      FgDetailRedirectPage({ params: Promise.resolve({ locale: 'en', productCode: 'MISSING' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/en/pipeline');
  });

  it('falls back to the pipeline list when ambiguous returns no ids', async () => {
    // Defensive: ambiguous with an empty projectIds array must still land on the
    // pipeline list, not throw or hang (the first-id branch is skipped).
    resolveProjectIdByProductCodeMock.mockResolvedValue({ kind: 'ambiguous', projectIds: [] });

    await expect(
      FgDetailRedirectPage({ params: Promise.resolve({ locale: 'en', productCode: 'FG-003' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/en/pipeline');
    // Exactly one redirect fired (the fallback), not the first-id branch.
    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith('/en/pipeline');
  });
});
