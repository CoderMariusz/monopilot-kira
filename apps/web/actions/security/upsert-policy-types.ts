export type UpsertSecurityPolicyInput = {
  dual_control_required?: boolean;
  mfa_requirement?: 'off' | 'optional' | 'required_admins' | 'required_all';
  mfa_allowed_methods?: string[];
  password_min_length?: number;
  password_complexity?: 'standard' | 'strong';
};

export type UpsertSecurityPolicyResult =
  | { ok: true; data: { orgId: string; mfaRequirement: string; passwordMinLength: number } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'webauthn_not_allowed'
        | 'password_min_length_floor'
        | 'unsupported_mfa_method'
        | 'persistence_failed';
    };
