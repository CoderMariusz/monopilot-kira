export type InitializeAuthorizationPoliciesResult =
  | { ok: true }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };
