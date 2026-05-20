/**
 * @vitest-environment jsdom
 * B1 default-wiring proof — verifies that each onboarding page route imports
 * a real Server Action wrapper (so production Next runtime calls real DB-bound
 * code instead of failing closed on missing test-injected props), and that the
 * wrapper modules return the per-step result shapes that page handlers expect.
 *
 * These tests would fail if a page were reverted to optional-mutation-only
 * wiring or if a wrapper's response shape drifted away from page.tsx
 * expectations (the Wave 7/8 false-green this branch fixes).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');

function pageSource(route: string): string {
  return readFileSync(resolve(repoRoot, 'apps/web/app/onboarding', route, 'page.tsx'), 'utf8');
}

afterEach(() => {
  vi.resetModules();
});

describe('B1 onboarding default wiring', () => {
  it('profile page wires saveOrgProfile + loadOnboardingContext server actions', () => {
    const src = pageSource('profile');
    expect(src).toMatch(/from '\.\.\/\.\.\/\.\.\/actions\/onboarding\/save-org-profile'/);
    expect(src).toMatch(/from '\.\.\/\.\.\/\.\.\/actions\/onboarding\/load'/);
    expect(src).toMatch(/saveOrgProfile = saveOrgProfileAction/);
  });

  it('warehouse page wires createFirstWarehouse + loadOnboardingContext', () => {
    const src = pageSource('warehouse');
    expect(src).toMatch(/from '\.\.\/\.\.\/\.\.\/actions\/onboarding\/create-first-warehouse'/);
    expect(src).toMatch(/from '\.\.\/\.\.\/\.\.\/actions\/onboarding\/load'/);
    expect(src).toMatch(/createFirstWarehouse = createFirstWarehouseAction/);
  });

  it('location page wires createFirstLocation + loadOnboardingContext', () => {
    const src = pageSource('location');
    expect(src).toMatch(/from '\.\.\/\.\.\/\.\.\/actions\/onboarding\/create-first-location'/);
    expect(src).toMatch(/from '\.\.\/\.\.\/\.\.\/actions\/onboarding\/load'/);
    expect(src).toMatch(/createFirstLocation = createFirstLocationAction/);
  });

  it('product page wires step skip/complete via real onboarding mutators', () => {
    const src = pageSource('product');
    expect(src).toMatch(/from '\.\.\/\.\.\/\.\.\/actions\/onboarding\/skip-step'/);
    expect(src).toMatch(/from '\.\.\/\.\.\/\.\.\/actions\/onboarding\/complete-step'/);
    expect(src).toMatch(/skipOnboardingStep = defaultSkipForStep4/);
    expect(src).toMatch(/completeOnboardingStep = defaultCompleteForStep4/);
  });

  it('workorder page wires skip/complete + markFirstWoCreated', () => {
    const src = pageSource('workorder');
    expect(src).toMatch(/from '\.\.\/\.\.\/\.\.\/actions\/onboarding\/skip-step'/);
    expect(src).toMatch(/from '\.\.\/\.\.\/\.\.\/actions\/onboarding\/complete-step'/);
    expect(src).toMatch(/from '\.\.\/\.\.\/\.\.\/actions\/onboarding\/mark-first-wo-created'/);
    expect(src).toMatch(/markFirstWoCreated = markFirstWoCreatedAction/);
  });

  it('complete page wires completeOnboarding + loadOnboardingContext', () => {
    const src = pageSource('complete');
    expect(src).toMatch(/from '\.\.\/\.\.\/\.\.\/actions\/onboarding\/complete-onboarding'/);
    expect(src).toMatch(/from '\.\.\/\.\.\/\.\.\/actions\/onboarding\/load'/);
    expect(src).toMatch(/completeOnboarding = completeOnboardingAction/);
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

    const skip = await (await import('../../actions/onboarding/skip-step')).skipOnboardingStep(4);
    expect(skip).toEqual({ ok: true, skippedStep: 4, nextStep: 'first_wo' });

    const complete = await (await import('../../actions/onboarding/complete-step')).completeOnboardingStep(5);
    expect(complete).toEqual({ ok: true, completedStep: 5, nextStep: 'completion' });

    const wo = await (await import('../../actions/onboarding/mark-first-wo-created')).markFirstWoCreated({
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
