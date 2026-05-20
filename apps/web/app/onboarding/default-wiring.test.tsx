/**
 * @vitest-environment jsdom
 * B1 default-wiring proof — verifies that each onboarding production route is
 * an RSC wrapper that imports the shared server loader and action adapter, and
 * that the action adapter reaches the real DB-bound Server Action modules.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');

function pageSource(route: string): string {
  return readFileSync(resolve(repoRoot, 'apps/web/app/onboarding', route, 'page.tsx'), 'utf8');
}

function appOnboardingSource(file: string): string {
  return readFileSync(resolve(repoRoot, 'apps/web/app/onboarding', file), 'utf8');
}

afterEach(() => {
  vi.resetModules();
});

describe('B1 onboarding default wiring', () => {
  it('all onboarding pages are production RSC wrappers wired through shared loader/actions', () => {
    for (const route of ['profile', 'warehouse', 'location', 'product', 'workorder', 'complete']) {
      const src = pageSource(route);
      expect(src.startsWith("'use client'"), `${route} must not be a test-only client page`).toBe(false);
      expect(src).toMatch(/from '\.\.\/_loader'/);
      expect(src).toMatch(/from '\.\.\/_actions'/);
      expect(src).toMatch(new RegExp(`<.*Client[\\s\\S]*${route === 'profile' ? 'saveOrgProfile' : route === 'warehouse' ? 'createFirstWarehouse' : route === 'location' ? 'createFirstLocation' : route === 'complete' ? 'completeOnboarding' : route === 'product' ? 'skipOnboardingStep' : 'markFirstWoCreated'}`));
    }
  });

  it('shared RSC loader delegates to the real withOrgContext-backed onboarding loader', () => {
    const src = appOnboardingSource('_loader.ts');
    expect(src).toMatch(/from '\.\.\/\.\.\/actions\/onboarding\/load'/);
    expect(src).toMatch(/loadRealOnboardingContext\(\)/);
    expect(src).toMatch(/firstWarehouse/);
  });

  it('shared action adapter imports real Server Action modules outside tests', () => {
    const src = appOnboardingSource('_actions.ts');
    for (const action of [
      'save-org-profile',
      'create-first-warehouse',
      'create-first-location',
      'skip-step',
      'complete-step',
      'mark-first-wo-created',
      'complete-onboarding',
    ]) {
      expect(src).toMatch(new RegExp(`from '\\.\\.\\/\\.\\.\\/actions\\/onboarding\\/${action}'`));
    }
  });

  it('wrappers translate mutateOnboarding {ok:true,data:{state}} into per-step shapes', async () => {
    vi.mock('../../actions/onboarding/advance', () => ({
      mutateOnboarding: vi.fn(async (transition: string, input: { step?: number }) => ({
        ok: true,
        data: {
          state: {
            current_step: (input?.step ?? 1) + (transition === 'advance' ? 1 : 0),
            completed_steps: transition === 'advance' && input?.step ? [input.step] : [],
            skipped_steps: transition === 'skip' && input?.step ? [input.step] : [],
            first_wo_at: '2026-05-20T06:00:00.000Z',
            started_at: '2026-05-20T05:45:00.000Z',
            time_to_first_wo_ms: 15 * 60 * 1000,
          },
        },
      })),
    }));

    const skip = await (await import('../../actions/onboarding/skip-step.js')).skipOnboardingStep(4);
    expect(skip).toEqual({ ok: true, skippedStep: 4, nextStep: 'first_wo' });

    const complete = await (await import('../../actions/onboarding/complete-step.js')).completeOnboardingStep(5);
    expect(complete).toEqual({ ok: true, completedStep: 5, nextStep: 'completion' });

    const wo = await (await import('../../actions/onboarding/mark-first-wo-created.js')).markFirstWoCreated({
      orgId: 'org-a',
      workOrderId: 'wo-1',
      createdAt: '2026-05-20T06:00:00.000Z',
    });
    expect(wo).toMatchObject({
      ok: true,
      workOrderId: 'wo-1',
      nextStep: 'completion',
      audit: { eventType: 'settings.onboarding.first_wo_created', timeToFirstWoMinutes: 15 },
    });
  });
});
