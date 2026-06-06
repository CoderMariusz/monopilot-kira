/**
 * @vitest-environment jsdom
 *
 * NPD project-detail INDEX page (RSC) — redirects to the project's CURRENT stage
 * (recipe→/formulation, etc.), not always Brief. Falls back to /brief if the project
 * can't be loaded.
 */
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));

const getProject = vi.fn();
vi.mock('../../../../../(npd)/pipeline/_actions/get-project', () => ({
  getProject: (...args: unknown[]) => getProject(...args),
}));

import ProjectDetailPage from './page';

function ok(currentStage: string) {
  return { ok: true, data: { project: { currentStage } } };
}

beforeEach(() => {
  redirect.mockClear();
  getProject.mockReset();
});

describe('NPD project-detail INDEX page', () => {
  it('redirects a brief-stage project to /brief', async () => {
    getProject.mockResolvedValue(ok('brief'));
    await expect(
      ProjectDetailPage({ params: Promise.resolve({ locale: 'en', projectId: 'p1' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/en/pipeline/p1/brief');
  });

  it('redirects a recipe-stage project to /formulation (the recipe route segment)', async () => {
    getProject.mockResolvedValue(ok('recipe'));
    await expect(
      ProjectDetailPage({ params: Promise.resolve({ locale: 'en', projectId: 'p1' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/en/pipeline/p1/formulation');
  });

  it('redirects a packaging-stage project to /packaging, preserving locale', async () => {
    getProject.mockResolvedValue(ok('packaging'));
    await expect(
      ProjectDetailPage({ params: Promise.resolve({ locale: 'pl', projectId: 'abc' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/pl/pipeline/abc/packaging');
  });

  it('falls back to /brief when the project cannot be loaded', async () => {
    getProject.mockRejectedValue(new Error('boom'));
    await expect(
      ProjectDetailPage({ params: Promise.resolve({ locale: 'en', projectId: 'p1' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/en/pipeline/p1/brief');
  });
});
