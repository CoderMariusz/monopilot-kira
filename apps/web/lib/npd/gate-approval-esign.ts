/**
 * NPD gate-approval e-sign verification helpers (server-only).
 *
 * Certificate display and freeze guards must agree: a signature is "verified" only
 * when the immutable e_sign_log receipt (signature_id FK or unambiguous subject_hash)
 * matches the expected gate-approval subject for this project/gate/decision.
 */

import { hashESignSubject } from '@monopilot/e-sign';

export {
  ESIGN_SUBJECT_HASH_HEX_LEN,
  formatEsignCertificateId,
  isValidEsignSubjectHash,
  resolveGateApprovalEsignVerification,
  resolveVerifiedCertificateHash,
  type GateApprovalEsignVerification,
} from './esign-display';

export type GateApprovalSignSubject = {
  projectId: string;
  projectCode: string;
  gateCode: string;
  decision: 'approved' | 'rejected';
};

export function buildGateApprovalSignSubject(input: GateApprovalSignSubject): GateApprovalSignSubject {
  return {
    projectId: input.projectId,
    projectCode: input.projectCode,
    gateCode: input.gateCode,
    decision: input.decision,
  };
}

export function computeGateApprovalSubjectHash(subject: GateApprovalSignSubject): string {
  return hashESignSubject(buildGateApprovalSignSubject(subject));
}
