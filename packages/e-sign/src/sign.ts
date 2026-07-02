import { createHash, randomUUID } from 'node:crypto';
import { verifyPin } from '@monopilot/auth/src/verify-pin.js';
import { z } from 'zod';

import type { ESignIntent, ESignReceipt, ESignTxOptions, SignEventInput } from './types.js';
import { EPinFailedError, EReplayError, ESignPolicyError } from './types.js';

const signEventSchema = z.object({
  signerUserId: z.string().uuid(),
  pin: z.string().min(1),
  intent: z.string().min(1),
  subject: z.record(z.unknown()),
  nonce: z.string().min(1).optional(),
  reason: z.string().optional(),
});

function requireClient(): never {
  throw new Error(
    'e-sign requires options.client with active app.current_org_id() context; call signEvent inside withOrgContext/runWithOrgContext',
  );
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`)
    .join(',')}}`;
}

export function hashESignSubject(subject: unknown): string {
  return createHash('sha256').update(canonicalJson(subject), 'utf8').digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

type QueryClient = NonNullable<ESignTxOptions['client']>;

export type SignoffPolicy = {
  signoffType: string;
  requiredSignatures: number;
  firstSignerRoleId: string | null;
  secondSignerRoleId: string | null;
  allowSameUser: boolean;
};

type SignoffPolicyRow = {
  signoff_type: string;
  required_signatures: number;
  first_signer_role_id: string | null;
  second_signer_role_id: string | null;
  allow_same_user: boolean;
};

function signoffPolicyKeysForIntent(intent: ESignIntent): string[] {
  return [intent];
}

export async function readSignoffPolicy(
  client: QueryClient,
  intent: ESignIntent,
): Promise<SignoffPolicy | null> {
  const signoffTypes = signoffPolicyKeysForIntent(intent);
  const { rows } = await client.query<SignoffPolicyRow>(
    `select signoff_type, required_signatures, first_signer_role_id, second_signer_role_id, allow_same_user
       from public.signoff_policies
      where org_id = app.current_org_id()
        and signoff_type = any($1::text[])
        and is_active = true
      order by array_position($1::text[], signoff_type)
      limit 1`,
    [signoffTypes],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    signoffType: row.signoff_type,
    requiredSignatures: Number(row.required_signatures),
    firstSignerRoleId: row.first_signer_role_id,
    secondSignerRoleId: row.second_signer_role_id,
    allowSameUser: Boolean(row.allow_same_user),
  };
}

async function signerHasRole(
  client: QueryClient,
  signerUserId: string,
  roleId: string,
): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select (
        exists (
          select 1
            from public.users u
           where u.org_id = app.current_org_id()
             and u.id = $1::uuid
             and u.role_id = $2::uuid
        )
        or exists (
          select 1
            from public.user_roles ur
           where ur.org_id = app.current_org_id()
             and ur.user_id = $1::uuid
             and ur.role_id = $2::uuid
        )
      ) as ok`,
    [signerUserId, roleId],
  );
  return rows[0]?.ok === true;
}

async function enforceSignoffPolicyForSigner(input: {
  client: QueryClient;
  policy: SignoffPolicy | null;
  signerUserId: string;
  mode: NonNullable<ESignTxOptions['policyMode']>;
}): Promise<void> {
  const { client, policy, signerUserId, mode } = input;
  if (!policy) return;

  if (mode === 'single' && policy.requiredSignatures === 2) {
    throw new ESignPolicyError('second_signature_required');
  }

  const requiredRoleId = mode === 'dual-secondary' ? policy.secondSignerRoleId : policy.firstSignerRoleId;
  if (requiredRoleId && !(await signerHasRole(client, signerUserId, requiredRoleId))) {
    throw new ESignPolicyError('signer_role_not_allowed');
  }
}

async function verifyLoginPassword(
  client: NonNullable<ESignTxOptions['client']>,
  signerUserId: string,
  secret: string,
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return false;

  const { rows } = await client.query<{ email: string | null }>(
    `select email from public.users where id = $1::uuid limit 1`,
    [signerUserId],
  );
  const email = rows[0]?.email;
  if (!email) return false;

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: secret }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function signEventInClient(
  input: SignEventInput,
  client: NonNullable<ESignTxOptions['client']>,
  requestId?: string,
  policyMode: NonNullable<ESignTxOptions['policyMode']> = 'single',
): Promise<ESignReceipt> {
  const parsed = signEventSchema.parse(input);
  const policy = await readSignoffPolicy(client, parsed.intent);
  await enforceSignoffPolicyForSigner({
    client,
    policy,
    signerUserId: parsed.signerUserId,
    mode: policyMode,
  });

  // Credential precedence (CFR Part 11): the Supabase LOGIN PASSWORD is the
  // canonical e-sign credential; the enrolled step-up PIN is an optional
  // convenience factor. We verify the password first (every e-sign modal
  // collects "account password"), then fall back to the PIN.
  //
  // POLICY NOTE (owner to confirm): because password is canonical, a *locked*
  // PIN is intentionally NOT a hard stop for a signer who supplies a valid
  // account password — lockout protects the weaker 6-digit factor, not the
  // stronger password. If e-sign must honor PIN lockout as an account freeze,
  // add an early `verifyPin === 'locked'` short-circuit here.
  const passwordOk = await verifyLoginPassword(client, parsed.signerUserId, parsed.pin);
  if (!passwordOk) {
    // Only consult the PIN credential when the secret is plausibly a PIN
    // (4–8 digits). This stops a mistyped *account password* from ever reaching
    // verifyPin and burning the signer's PIN-lockout budget (verifyPin
    // increments attempts/locks for users who have a PIN row).
    const looksLikePin = /^[0-9]{4,8}$/.test(parsed.pin);
    const pinResult = looksLikePin
      ? await verifyPin(parsed.signerUserId, parsed.pin, { client })
      : false;
    if (pinResult !== true) throw new EPinFailedError();
  }

  const subjectHash = hashESignSubject(parsed.subject);
  const nonce = parsed.nonce ?? randomUUID();
  const replay = await client.query<{ exists: boolean }>(
    `select exists (
       select 1
       from public.e_sign_log
       where signer_user_id = $1::uuid
         and subject_hash = $2
         and intent = $3
         and nonce = $4
     ) as exists`,
    [parsed.signerUserId, subjectHash, parsed.intent, nonce],
  );
  if (replay.rows[0]?.exists) {
    throw new EReplayError();
  }

  const org = await client.query<{ org_id: string | null }>(
    `select app.current_org_id() as org_id`,
  );
  const orgId = org.rows[0]?.org_id;
  if (!orgId) {
    throw new Error('e-sign requires an active app.current_org_id() context');
  }

  try {
    const signature = await client.query<{
      signature_id: string;
      created_at: Date;
    }>(
      `insert into public.e_sign_log (
         org_id,
         signer_user_id,
         intent,
         subject_hash,
         nonce,
         reason
       )
       values ($1::uuid, $2::uuid, $3, $4, $5, $6)
       returning signature_id, created_at`,
      [orgId, parsed.signerUserId, parsed.intent, subjectHash, nonce, parsed.reason ?? null],
    );

    const signatureRow = signature.rows[0];
    if (!signatureRow) {
      throw new Error('e-sign insert did not return a signature row');
    }

    const audit = await client.query<{ id: number }>(
      `insert into public.audit_events (
         org_id,
         occurred_at,
         actor_user_id,
         actor_type,
         action,
         resource_type,
         resource_id,
         before_state,
         after_state,
         request_id,
         retention_class
       )
       values (
         $1::uuid,
         $2::timestamptz,
         $3::uuid,
         'user',
         'e_sign.recorded',
         'e_sign',
         $4,
         null,
         $5::jsonb,
         $6::uuid,
         'security'
       )
       returning id`,
      [
        orgId,
        signatureRow.created_at.toISOString(),
        parsed.signerUserId,
        signatureRow.signature_id,
        JSON.stringify({
          intent: parsed.intent,
          reason: parsed.reason ?? null,
          signedAt: signatureRow.created_at.toISOString(),
          signerUserId: parsed.signerUserId,
          subjectHash,
          nonce,
        }),
        requestId ?? randomUUID(),
      ],
    );

    const auditRow = audit.rows[0];
    if (!auditRow) {
      throw new Error('e-sign audit insert did not return an audit row');
    }

    return {
      signatureId: signatureRow.signature_id,
      signerUserId: parsed.signerUserId,
      intent: parsed.intent,
      subjectHash,
      signedAt: signatureRow.created_at.toISOString(),
      auditEventId: Number(auditRow.id),
      nonce,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new EReplayError();
    }
    throw error;
  }
}

export async function signEvent(
  input: SignEventInput,
  options: ESignTxOptions = {},
): Promise<ESignReceipt> {
  if (options.client) {
    return signEventInClient(input, options.client, options.requestId, options.policyMode ?? 'single');
  }

  return requireClient();
}
