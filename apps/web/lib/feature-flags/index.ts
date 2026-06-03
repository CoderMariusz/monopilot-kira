/**
 * T-033 — PostHog feature flags (server-side only).
 *
 * Red lines:
 *  - Server-side only — do NOT import this in any client component.
 *  - Fail-closed: unknown flags return false (never undefined/null/throw).
 *  - Per-tenant targeting via PostHog group identification (group='tenant').
 */

import * as posthogNode from 'posthog-node';

// Type alias for the PostHog instance interface we depend on.
type PostHogClient = {
  isFeatureEnabled: (
    flagKey: string,
    distinctId: string,
    options?: { groups?: Record<string, string> },
  ) => Promise<boolean | undefined>;
};

// Module-level singleton — created lazily on first call.
// In tests, vi.mock('posthog-node') is hoisted before this module loads so
// posthogNode.PostHog is the mock factory. We call it as a plain function
// (not `new`) via a cast to avoid the "arrow function is not a constructor"
// issue with Vitest's vi.fn() mocks. The singleton is set on first isEnabled
// call (before vi.clearAllMocks() in beforeEach clears mock implementations),
// because the test's _mockIsFeatureEnabled lives on the returned object, not
// on the constructor — vi.clearAllMocks() only resets call counts, not refs.
let _client: PostHogClient | null = null;

function getClient(): PostHogClient {
  if (!_client) {
    const apiKey = process.env.POSTHOG_API_KEY ?? 'phc_placeholder';
    const host = process.env.POSTHOG_HOST ?? 'https://app.posthog.com';

    const Ctor = posthogNode.PostHog as unknown as (key: string, opts: { host: string }) => PostHogClient;
    // Attempt construction; fall back to factory call for test mocks.
    try {

      _client = new (posthogNode.PostHog as any)(apiKey, { host }) as PostHogClient;
    } catch {
      _client = Ctor(apiKey, { host });
    }
  }
  return _client;
}

/**
 * Evaluate a PostHog feature flag for a specific tenant.
 *
 * @param flagKey  - The feature flag key as defined in PostHog.
 * @param opts     - { tenantId, userId? }
 * @returns        - Resolves to true if the flag is enabled; false otherwise (fail-closed).
 */
export async function isEnabled(
  flagKey: string,
  opts: { tenantId: string; userId?: string },
): Promise<boolean> {
  const { tenantId, userId } = opts;
  const distinctId = userId ?? tenantId;

  try {
    const result = await getClient().isFeatureEnabled(flagKey, distinctId, {
      groups: { tenant: tenantId },
    });

    // Fail-closed: coerce undefined/null/any falsy value to false.
    return result === true;
  } catch {
    // Fail-closed: any error returns false.
    return false;
  }
}
