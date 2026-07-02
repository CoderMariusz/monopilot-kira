import type pg from 'pg';

export type ESignIntent =
  | 'qa.hold.release'
  | 'qa.ncr.close'
  | 'qa.haccp.ccp.deviation'
  | 'prod.wo.release'
  | 'prod.consumption.override'
  | 'tech.fa.release'
  | 'fin.cost.approve'
  | (string & {});

export interface ESignSubject {
  [key: string]: unknown;
}

export interface SignEventInput {
  signerUserId: string;
  pin: string;
  intent: ESignIntent;
  subject: ESignSubject;
  nonce?: string;
  reason?: string;
}

export interface DualSignInput {
  primarySignerUserId: string;
  primaryPin: string;
  secondarySignerUserId: string;
  secondaryPin: string;
  intent: ESignIntent;
  subject: ESignSubject;
  primaryNonce?: string;
  secondaryNonce?: string;
  reason?: string;
}

export interface ESignReceipt {
  signatureId: string;
  signerUserId: string;
  intent: ESignIntent;
  subjectHash: string;
  signedAt: string;
  auditEventId: number;
  nonce: string;
}

export interface ESignTxOptions {
  /**
   * Must carry an active app.current_org_id() context. Standalone signing is
   * intentionally unsupported because e_sign_log and audit_events are RLS-scoped.
   */
  client?: pg.PoolClient;
  requestId?: string;
  policyMode?: 'single' | 'dual-primary' | 'dual-secondary';
}

export class EReplayError extends Error {
  constructor(message = 'Electronic signature replay rejected') {
    super(message);
    this.name = 'EReplayError';
  }
}

export class ESignSoDError extends Error {
  constructor(message = 'Primary and secondary signers must be distinct') {
    super(message);
    this.name = 'ESignSoDError';
  }
}

export class EPinFailedError extends Error {
  constructor(message = 'Invalid password or PIN') {
    super(message);
    this.name = 'EPinFailedError';
  }
}

export type ESignPolicyErrorCode = 'second_signature_required' | 'signer_role_not_allowed';

export class ESignPolicyError extends Error {
  readonly code: ESignPolicyErrorCode;

  constructor(code: ESignPolicyErrorCode, message = code) {
    super(message);
    this.name = 'ESignPolicyError';
    this.code = code;
  }
}
