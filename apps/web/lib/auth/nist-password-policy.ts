/** NIST password constants mirrored dep-free for Next pages/actions.
 *  @monopilot/auth's index pulls password-policy.ts (top-level fs read) which breaks
 *  Next build config-collection, so these two constants are duplicated here.
 *  ponytail: 2 fixed NIST values; source of truth = packages/auth/src/password-policy-constants.ts. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_HISTORY_LIMIT = 5;
