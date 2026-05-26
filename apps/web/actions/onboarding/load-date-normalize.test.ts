/**
 * Regression: pg returns timestamptz columns as JS Date objects at runtime.
 * The Server Component → Client Component boundary requires plain strings;
 * a Date object renders as Minified React error #31 (`[object Date]`).
 *
 * This test fakes withOrgContext + a pg-like client that returns Date values
 * for `onboarding_completed_at` and the JSONB state Date-ish fields. It asserts
 * that loadOnboardingContext() returns ISO strings (or null), never Date.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const COMPLETED_AT_DATE = new Date('2026-05-19T20:45:00.000Z');
const STARTED_AT_DATE = new Date('2026-05-19T08:15:00.000Z');
const LAST_ACTIVITY_AT_DATE = new Date('2026-05-19T20:30:00.000Z');
const FIRST_WO_AT_DATE = new Date('2026-05-19T09:00:00.000Z');

type DateLike = string | Date | null;

function makeClientReturning(opts: {
  onboardingCompletedAt: DateLike;
  startedAt: DateLike;
  lastActivityAt: DateLike;
  firstWoAt: DateLike;
}) {
  return {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.organizations')) {
        return {
          rows: [
            {
              id: ORG_ID,
              name: 'Apex Foods Sp. z o.o.',
              timezone: 'Europe/Warsaw',
              locale: 'pl',
              currency: 'PLN',
              gs1_prefix: '590',
              onboarding_state: {
                current_step: 6,
                completed_steps: [1, 2, 3, 4, 5],
                skipped_steps: [],
                started_at: opts.startedAt,
                last_activity_at: opts.lastActivityAt,
                first_wo_at: opts.firstWoAt,
              },
              onboarding_completed_at: opts.onboardingCompletedAt,
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.warehouses')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('loadOnboardingContext date normalization (regression: Date → [object Date])', () => {
  it('coerces Date-valued onboarding_completed_at to an ISO string at the loader boundary', async () => {
    const client = makeClientReturning({
      onboardingCompletedAt: COMPLETED_AT_DATE,
      startedAt: STARTED_AT_DATE,
      lastActivityAt: LAST_ACTIVITY_AT_DATE,
      firstWoAt: FIRST_WO_AT_DATE,
    });
    _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { loadOnboardingContext } = await import('./load');
    const result = await loadOnboardingContext();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.organization.onboardingCompletedAt).toBe(COMPLETED_AT_DATE.toISOString());
    expect(result.organization.onboardingCompletedAt).not.toBeInstanceOf(Date);
    expect(typeof result.organization.onboardingCompletedAt).toBe('string');

    expect(result.organization.onboardingStartedAt).toBe(STARTED_AT_DATE.toISOString());
    expect(result.organization.onboardingStartedAt).not.toBeInstanceOf(Date);

    expect(result.onboardingState.savedAt).toBe(LAST_ACTIVITY_AT_DATE.toISOString());
    expect(result.onboardingState.firstWoAt).toBe(FIRST_WO_AT_DATE.toISOString());
    expect(result.onboardingState.firstWoAt).not.toBeInstanceOf(Date);
  });

  it('still accepts string timestamps unchanged', async () => {
    const completedIso = '2026-05-19T20:45:00.000Z';
    const client = makeClientReturning({
      onboardingCompletedAt: completedIso,
      startedAt: '2026-05-19T08:15:00.000Z',
      lastActivityAt: '2026-05-19T20:30:00.000Z',
      firstWoAt: '2026-05-19T09:00:00.000Z',
    });
    _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { loadOnboardingContext } = await import('./load');
    const result = await loadOnboardingContext();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.organization.onboardingCompletedAt).toBe(completedIso);
    expect(result.onboardingState.firstWoAt).toBe('2026-05-19T09:00:00.000Z');
  });

  it('returns null (not Date) for missing timestamps', async () => {
    const client = makeClientReturning({
      onboardingCompletedAt: null,
      startedAt: null,
      lastActivityAt: null,
      firstWoAt: null,
    });
    _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { loadOnboardingContext } = await import('./load');
    const result = await loadOnboardingContext();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.organization.onboardingCompletedAt).toBeNull();
    expect(result.organization.onboardingStartedAt).toBeNull();
    expect(result.onboardingState.firstWoAt).toBeNull();
  });

  it('every loader-returned value is JSON-serializable (no Date instances cross the RSC boundary)', async () => {
    const client = makeClientReturning({
      onboardingCompletedAt: COMPLETED_AT_DATE,
      startedAt: STARTED_AT_DATE,
      lastActivityAt: LAST_ACTIVITY_AT_DATE,
      firstWoAt: FIRST_WO_AT_DATE,
    });
    _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { loadOnboardingContext } = await import('./load');
    const result = await loadOnboardingContext();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const visit = (node: unknown, path = 'root'): void => {
      if (node instanceof Date) {
        throw new Error(`Date instance found at ${path} — must be ISO string before reaching the client component`);
      }
      if (Array.isArray(node)) {
        node.forEach((child, idx) => visit(child, `${path}[${idx}]`));
        return;
      }
      if (node !== null && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) visit(value, `${path}.${key}`);
      }
    };
    expect(() => visit(result)).not.toThrow();
  });
});
