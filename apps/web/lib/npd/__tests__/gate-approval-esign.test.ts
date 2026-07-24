import { describe, expect, it } from 'vitest';

import {
  computeGateApprovalSubjectHash,
  formatEsignCertificateId,
  isValidEsignSubjectHash,
  resolveGateApprovalEsignVerification,
  resolveVerifiedCertificateHash,
} from '../gate-approval-esign';

const SUBJECT = {
  projectId: '00000000-0000-4000-8000-0000000000b1',
  projectCode: 'NPD-001',
  gateCode: 'G4',
  decision: 'approved' as const,
};

describe('gate-approval-esign', () => {
  it('computes a stable 64-char hex subject hash', () => {
    const hash = computeGateApprovalSubjectHash(SUBJECT);
    expect(isValidEsignSubjectHash(hash)).toBe(true);
    expect(computeGateApprovalSubjectHash(SUBJECT)).toBe(hash);
  });

  it('rejects short or non-hex certificate material', () => {
    expect(isValidEsignSubjectHash('x')).toBe(false);
    expect(formatEsignCertificateId('x')).toBeNull();
    expect(formatEsignCertificateId('a'.repeat(64))).toBe(`SHA256:${'a'.repeat(64)}`);
  });

  it('marks verified only when receipt subject hash matches expected subject', () => {
    const expected = computeGateApprovalSubjectHash(SUBJECT);
    expect(
      resolveGateApprovalEsignVerification({
        esignedAt: '2026-06-01T10:00:00.000Z',
        signatureId: 'sig-1',
        receiptSubjectHash: expected,
        expectedSubjectHash: expected,
      }),
    ).toBe('verified');

    expect(
      resolveGateApprovalEsignVerification({
        esignedAt: '2026-06-01T10:00:00.000Z',
        signatureId: 'sig-1',
        receiptSubjectHash: 'b'.repeat(64),
        expectedSubjectHash: expected,
      }),
    ).toBe('hash_unverified');
  });

  it('never marks verified from esigned_at alone', () => {
    expect(
      resolveGateApprovalEsignVerification({
        esignedAt: '2026-06-01T10:00:00.000Z',
        signatureId: null,
        receiptSubjectHash: null,
        expectedSubjectHash: computeGateApprovalSubjectHash(SUBJECT),
      }),
    ).toBe('hash_unverified');
  });

  it('returns certificate hash only for verified receipts', () => {
    const hash = computeGateApprovalSubjectHash(SUBJECT);
    expect(resolveVerifiedCertificateHash('verified', hash)).toBe(`SHA256:${hash}`);
    expect(resolveVerifiedCertificateHash('hash_unverified', hash)).toBeNull();
  });
});
