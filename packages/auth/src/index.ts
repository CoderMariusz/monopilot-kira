export {
  PASSWORD_MIN_LENGTH,
  PASSWORD_HISTORY_LIMIT,
} from './password-policy-constants.js';
export {
  validateNewPassword,
  recordPasswordHistory,
} from './password-policy.js';
export type { PasswordPolicyError, PasswordValidationResult, ValidateNewPasswordOpts, ValidateNewPasswordFullOpts, HibpLookup } from './password-policy.js';
