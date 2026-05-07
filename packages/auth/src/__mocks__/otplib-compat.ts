/**
 * otplib v13 compatibility shim
 *
 * otplib v13 removed the `authenticator` singleton object present in v12.
 * This shim creates an `authenticator` object compatible with the v12 API
 * and re-exports the v13 functional API.
 *
 * Used via vitest.config.ts resolve.alias:
 *   /^otplib$/ → this file
 *
 * Imports from `otplib/functional` (the declared sub-path export) to avoid
 * circular aliasing of the main `otplib` specifier.
 */

// Re-export public v13 surface via sub-path exports (declared in package.json)
export {
  generate,
  generateSecret,
  generateSync,
  generateURI,
  verify,
  verifySync,
} from 'otplib/functional';

export { OTP, TOTP } from 'otplib/class';

import { generateSecret, generateSync, generateURI, verifySync } from 'otplib/functional';

/**
 * `authenticator`-compatible singleton (v12 API surface).
 * Stores options and delegates to v13 functional API.
 */
const _opts: { step: number; digits: number } = { step: 30, digits: 6 };

export const authenticator = {
  get options() {
    return { ..._opts };
  },
  set options(val: Partial<{ step: number; digits: number }>) {
    if (val.step !== undefined) _opts.step = val.step;
    if (val.digits !== undefined) _opts.digits = val.digits;
  },
  generateSecret(): string {
    return generateSecret();
  },
  generate(secret: string): string {
    return generateSync({ secret, period: _opts.step, digits: _opts.digits as 6 | 8 });
  },
  keyuri(account: string, issuer: string, secret: string): string {
    return generateURI({
      issuer,
      label: account,
      secret,
      period: _opts.step,
      digits: _opts.digits as 6 | 8,
    });
  },
  verify({ token, secret }: { token: string; secret: string }): boolean {
    const result = verifySync({
      token,
      secret,
      period: _opts.step,
      digits: _opts.digits as 6 | 8,
    });
    return result.valid;
  },
};
