/**
 * Shared HTTP mapping for the allergen Route Handlers (T-017/T-018/T-019).
 *
 * Maps the closed AllergenActionError set to HTTP status codes + a stable
 * error/validation-code envelope, and centralises the withOrgContext →
 * 401-on-unauthenticated handling so each route stays thin.
 */

import { withOrgContext } from '../../auth/with-org-context';
import type { AllergenActionError, AllergenResult, OrgActionContext, QueryClient } from './shared';

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Validation codes surfaced to the client (V-TEC-*).
const VALIDATION_CODE: Partial<Record<AllergenActionError, string>> = {
  invalid_allergen_code: 'V-TEC-40',
  override_reason_required: 'V-TEC-42',
  invalid_manufacturing_operation: 'V-TEC-63',
};

export function errorStatus(error: AllergenActionError): number {
  switch (error) {
    case 'forbidden':
      return 403;
    case 'not_found':
      return 404;
    case 'invalid_input':
      return 400;
    case 'invalid_allergen_code':
    case 'override_reason_required':
    case 'invalid_manufacturing_operation':
      return 422;
    case 'persistence_failed':
    default:
      return 500;
  }
}

export function resultToResponse<T>(result: AllergenResult<T>, okStatus = 200): Response {
  if (result.ok) return json({ ok: true, data: result.data }, okStatus);
  const status = errorStatus(result.error);
  const code = VALIDATION_CODE[result.error];
  return json({ ok: false, error: result.error, ...(code ? { code } : {}) }, status);
}

/**
 * Run an allergen service call inside withOrgContext. Returns a 401 when the
 * caller is unauthenticated (withOrgContext throws before entering the body),
 * otherwise maps the service result to a Response.
 */
export async function runAllergenRoute<T>(
  okStatus: number,
  fn: (ctx: OrgActionContext) => Promise<AllergenResult<T>>,
): Promise<Response> {
  let entered = false;
  try {
    const result = await withOrgContext(async ({ userId, orgId, client }) => {
      entered = true;
      const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };
      return fn(ctx);
    });
    return resultToResponse(result, okStatus);
  } catch (err) {
    if (!entered) return json({ ok: false, error: 'unauthenticated' }, 401);
    console.error('[technical/allergens] route persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return json({ ok: false, error: 'persistence_failed' }, 500);
  }
}
