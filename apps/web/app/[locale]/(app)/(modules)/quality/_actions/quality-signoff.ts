import type pg from 'pg';
import {
  ESignSoDError,
  hashESignSubject,
  readSignoffPolicy,
  signEvent,
  type ESignIntent,
  type ESignReceipt,
  type ESignSubject,
} from '@monopilot/e-sign';

import type { PendingQualitySignoff } from './quality-signoff-types';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type StoredSignature = {
  signatureId: string;
  signerUserId: string;
  signerDisplayName: string;
  subjectHash: string;
  signedAt: string;
};

type SignoffLookup =
  | { subjectHash: string; signatureId?: never }
  | { signatureId: string; subjectHash?: never };

type QualitySignoffResult =
  | {
      complete: false;
      receipt: ESignReceipt;
      pendingSignoff: PendingQualitySignoff;
    }
  | {
      complete: true;
      receipt: ESignReceipt;
      firstSignature: StoredSignature | null;
    };

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

async function readStoredSignature(
  client: QueryClient,
  intent: ESignIntent,
  lookup: SignoffLookup,
): Promise<StoredSignature | null> {
  const bySignatureId = 'signatureId' in lookup;
  const value = bySignatureId ? lookup.signatureId : lookup.subjectHash;
  const { rows } = await client.query<{
    signature_id: string;
    signer_user_id: string;
    signer_display_name: string | null;
    subject_hash: string;
    created_at: Date | string;
  }>(
    `select es.signature_id::text,
            es.signer_user_id::text,
            coalesce(u.display_name, u.name, u.email::text) as signer_display_name,
            es.subject_hash,
            es.created_at
       from public.e_sign_log es
       left join public.users u
         on u.id = es.signer_user_id
        and u.org_id = es.org_id
      where es.org_id = app.current_org_id()
        and es.intent = $1
        and ${bySignatureId ? 'es.signature_id = $2::uuid' : 'es.subject_hash = $2'}
      order by es.created_at asc, es.signature_id asc
      limit 1`,
    [intent, value],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    signatureId: row.signature_id,
    signerUserId: row.signer_user_id,
    signerDisplayName: row.signer_display_name ?? row.signer_user_id,
    subjectHash: row.subject_hash,
    signedAt: toIso(row.created_at),
  };
}

async function readUserDisplayName(client: QueryClient, userId: string): Promise<string> {
  const { rows } = await client.query<{ display_name: string | null }>(
    `select coalesce(display_name, name, email::text) as display_name
       from public.users
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [userId],
  );
  return rows[0]?.display_name ?? userId;
}

async function readRoleDisplayName(client: QueryClient, roleId: string | null): Promise<string | null> {
  if (!roleId) return null;
  const { rows } = await client.query<{ display_name: string | null }>(
    `select display_name
       from public.roles
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [roleId],
  );
  return rows[0]?.display_name ?? roleId;
}

async function buildPendingSignoff(
  client: QueryClient,
  receipt: ESignReceipt,
  secondSignerRoleId: string | null,
): Promise<PendingQualitySignoff> {
  const [signerDisplayName, roleDisplayName] = await Promise.all([
    readUserDisplayName(client, receipt.signerUserId),
    readRoleDisplayName(client, secondSignerRoleId),
  ]);
  return {
    state: 'pending_second_signature',
    subjectHash: receipt.subjectHash,
    firstSignatureId: receipt.signatureId,
    firstSignedAt: receipt.signedAt,
    firstSigner: {
      id: receipt.signerUserId,
      displayName: signerDisplayName,
    },
    awaitingRole:
      secondSignerRoleId && roleDisplayName
        ? { id: secondSignerRoleId, displayName: roleDisplayName }
        : null,
  };
}

export async function readPendingQualitySignoff(
  client: QueryClient,
  intent: ESignIntent,
  lookup: SignoffLookup,
): Promise<PendingQualitySignoff | null> {
  const [signature, policy] = await Promise.all([
    readStoredSignature(client, intent, lookup),
    readSignoffPolicy(client as pg.PoolClient, intent),
  ]);
  if (!signature) return null;
  const roleDisplayName = await readRoleDisplayName(client, policy?.secondSignerRoleId ?? null);
  return {
    state: 'pending_second_signature',
    subjectHash: signature.subjectHash,
    firstSignatureId: signature.signatureId,
    firstSignedAt: signature.signedAt,
    firstSigner: {
      id: signature.signerUserId,
      displayName: signature.signerDisplayName,
    },
    awaitingRole:
      policy?.secondSignerRoleId && roleDisplayName
        ? { id: policy.secondSignerRoleId, displayName: roleDisplayName }
        : null,
  };
}

export async function collectQualitySignoff(input: {
  client: QueryClient;
  signerUserId: string;
  pin: string;
  intent: ESignIntent;
  subject: ESignSubject;
  reason: string;
  pending?: SignoffLookup;
  receiptHashErrorMessage?: string;
}): Promise<QualitySignoffResult> {
  const subjectHash = hashESignSubject(input.subject);
  const [policy, firstSignature] = await Promise.all([
    readSignoffPolicy(input.client as pg.PoolClient, input.intent),
    input.pending ? readStoredSignature(input.client, input.intent, input.pending) : Promise.resolve(null),
  ]);

  if (input.pending && !firstSignature) {
    throw new Error('Pending quality sign-off is missing its first signature');
  }
  if (firstSignature && firstSignature.subjectHash !== subjectHash) {
    throw new Error('The pending quality sign-off does not match this decision');
  }
  if (firstSignature?.signerUserId === input.signerUserId) {
    throw new ESignSoDError('Second signature must be provided by a different user');
  }

  const requiresTwo = firstSignature !== null || policy?.requiredSignatures === 2;
  const receipt = await signEvent(
    {
      signerUserId: input.signerUserId,
      pin: input.pin,
      intent: input.intent,
      subject: input.subject,
      reason: input.reason,
    },
    {
      client: input.client as pg.PoolClient,
      policyMode: firstSignature ? 'dual-secondary' : requiresTwo ? 'dual-primary' : 'single',
    },
  );
  if (!receipt.subjectHash || receipt.subjectHash !== subjectHash) {
    throw new Error(
      input.receiptHashErrorMessage ?? 'Electronic signature did not produce the expected receipt hash',
    );
  }

  if (!firstSignature && requiresTwo) {
    return {
      complete: false,
      receipt,
      pendingSignoff: await buildPendingSignoff(
        input.client,
        receipt,
        policy?.secondSignerRoleId ?? null,
      ),
    };
  }

  return { complete: true, receipt, firstSignature };
}
