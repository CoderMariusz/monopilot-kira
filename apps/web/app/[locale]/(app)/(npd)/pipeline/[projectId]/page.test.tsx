/**
 * @vitest-environment jsdom
 *
 * NPD project-detail INDEX page (RSC) — now redirects straight to the Brief stage
 * (NPD always starts at the Brief; the persistent header + 8-stage rail live in
 * layout.tsx, so the standalone index body is skipped).
 */
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));

import ProjectDetailPage from './page';

describe('NPD project-detail INDEX page', () => {
  it('redirects /pipeline/[projectId] to the Brief stage (locale-prefixed)', async () => {
    await expect(
      ProjectDetailPage({ params: Promise.resolve({ locale: 'en', projectId: 'p1' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/en/pipeline/p1/brief');
    expect(redirect).toHaveBeenCalledWith('/en/pipeline/p1/brief');
  });

  it('preserves the active locale in the redirect target', async () => {
    redirect.mockClear();
    await expect(
      ProjectDetailPage({ params: Promise.resolve({ locale: 'pl', projectId: 'abc' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/pl/pipeline/abc/brief');
  });
});
