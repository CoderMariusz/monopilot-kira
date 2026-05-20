import { mutateOnboarding, type OnboardingResult } from './advance';
import { withOrgContext } from '../../lib/auth/with-org-context';

type OnboardingStepKey =
  | 'org_profile'
  | 'first_warehouse'
  | 'first_location'
  | 'first_product'
  | 'first_wo'
  | 'completion';

export type SaveOrgProfileInput = {
  orgId: string;
  orgName: string;
  timezone: string;
  locale: string;
  currency: string;
  gs1Prefix: string;
};

export type SaveOrgProfileResult =
  | {
      ok: true;
      organization: {
        id: string;
        name: string;
        timezone: string;
        locale: string;
        currency: string;
        gs1Prefix: string;
      };
      onboardingState: { current_step: 2; completed: ['org_profile']; skipped: OnboardingStepKey[] };
      redirectTo: '/onboarding/warehouse';
    }
  | { ok: false; error: 'VALIDATION_FAILED' | 'PERSISTENCE_FAILED'; field?: keyof SaveOrgProfileInput; message?: string };

const STEP_KEY_BY_NUMBER: Record<number, OnboardingStepKey> = {
  1: 'org_profile',
  2: 'first_warehouse',
  3: 'first_location',
  4: 'first_product',
  5: 'first_wo',
  6: 'completion',
};

export async function saveOrgProfile(rawInput: SaveOrgProfileInput): Promise<SaveOrgProfileResult> {
  'use server';

  if (!rawInput || typeof rawInput !== 'object') {
    return { ok: false, error: 'VALIDATION_FAILED' };
  }
  const trimmedGs1 = (rawInput.gs1Prefix ?? '').trim();
  if (!trimmedGs1) {
    return {
      ok: false,
      error: 'VALIDATION_FAILED',
      field: 'gs1Prefix',
      message: 'GS1 Company Prefix is required for SSCC generation',
    };
  }
  if (!(rawInput.orgName ?? '').trim()) {
    return { ok: false, error: 'VALIDATION_FAILED', field: 'orgName' };
  }

  const persistResult = await persistOrgProfile(rawInput);
  if (persistResult.ok === false) return persistResult;

  const advanceResult = await mutateOnboarding('advance', { step: 1 });
  if (advanceResult.ok === false) {
    return mapAdvanceFailure(advanceResult);
  }

  const skippedKeys = (advanceResult.data.state.skipped_steps ?? [])
    .map((n) => STEP_KEY_BY_NUMBER[n])
    .filter((k): k is OnboardingStepKey => Boolean(k));

  return {
    ok: true,
    organization: persistResult.organization,
    onboardingState: {
      current_step: 2,
      completed: ['org_profile'],
      skipped: skippedKeys,
    },
    redirectTo: '/onboarding/warehouse',
  };
}

type PersistOrgProfileResult =
  | {
      ok: true;
      organization: {
        id: string;
        name: string;
        timezone: string;
        locale: string;
        currency: string;
        gs1Prefix: string;
      };
    }
  | { ok: false; error: 'PERSISTENCE_FAILED'; message?: string };

async function persistOrgProfile(input: SaveOrgProfileInput): Promise<PersistOrgProfileResult> {
  try {
    return await withOrgContext<PersistOrgProfileResult>(async (ctx) => {
      const context = ctx as {
        client: {
          query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
        };
      };
      const { rows } = await context.client.query<{
        id: string;
        name: string;
        timezone: string;
        locale: string;
        currency: string;
        gs1_prefix: string | null;
      }>(
        `update public.organizations
            set name = $1,
                timezone = $2,
                locale = $3,
                currency = $4,
                gs1_prefix = $5,
                updated_at = now()
          where id = app.current_org_id()
          returning id, name, timezone, locale, currency, gs1_prefix`,
        [
          input.orgName.trim(),
          input.timezone,
          input.locale,
          input.currency,
          input.gs1Prefix.trim(),
        ],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'PERSISTENCE_FAILED', message: 'Organization not found.' };
      return {
        ok: true,
        organization: {
          id: row.id,
          name: row.name,
          timezone: row.timezone,
          locale: row.locale,
          currency: row.currency,
          gs1Prefix: row.gs1_prefix ?? '',
        },
      };
    });
  } catch {
    return { ok: false, error: 'PERSISTENCE_FAILED' };
  }
}

function mapAdvanceFailure(failure: Extract<OnboardingResult, { ok: false }>): SaveOrgProfileResult {
  return {
    ok: false,
    error: 'PERSISTENCE_FAILED',
    message: failure.error,
  };
}
