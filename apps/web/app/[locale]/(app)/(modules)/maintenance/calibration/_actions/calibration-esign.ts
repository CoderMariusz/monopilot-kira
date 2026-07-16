import { ESignPolicyError, type ESignReceipt } from '@monopilot/e-sign';

export type CalibrationSignSubject = {
  instrumentId: string;
  result: 'PASS' | 'FAIL' | 'OUT_OF_SPEC';
  calibratedAt: string;
  standardApplied: string;
  testPoints: Array<{ reference: string; measured: string | number; tolerance_pct?: number }>;
  certificateRef: string | null;
  notes: string | null;
};

export function buildCalibrationSignSubject(params: {
  instrumentId: string;
  result: 'PASS' | 'FAIL' | 'OUT_OF_SPEC';
  calibratedAt: Date;
  standardApplied: string;
  testPoints?: Array<{ reference: string; measured: string | number; tolerance_pct?: number }>;
  certificateRef?: string;
  notes?: string;
}): CalibrationSignSubject {
  return {
    instrumentId: params.instrumentId,
    result: params.result,
    calibratedAt: params.calibratedAt.toISOString(),
    standardApplied: params.standardApplied,
    testPoints: params.testPoints ?? [],
    certificateRef: params.certificateRef?.trim() ? params.certificateRef.trim() : null,
    notes: params.notes?.trim() ? params.notes.trim() : null,
  };
}

export function normalizeCalibrationCertificateRef(
  certificateRef: string | null | undefined,
): string | null {
  const trimmed = certificateRef?.trim();
  return trimmed ? trimmed : null;
}

export function assertDualCalibrationReceipts(receipts: {
  primary: ESignReceipt;
  secondary: ESignReceipt;
}): {
  calibratorUserId: string;
  reviewerUserId: string;
  signatureHash: string;
  primarySignatureId: string;
  secondarySignatureId: string;
} {
  const { primary, secondary } = receipts;
  const primaryHash = primary.subjectHash?.trim();
  const secondaryHash = secondary.subjectHash?.trim();
  if (!primaryHash || !secondaryHash) {
    throw new ESignPolicyError('second_signature_required', 'Electronic signature receipt hash is missing');
  }
  if (primaryHash !== secondaryHash) {
    throw new ESignPolicyError(
      'second_signature_required',
      'Primary and secondary signature hashes must match the same calibration subject',
    );
  }
  const primarySignatureId = primary.signatureId?.trim();
  const secondarySignatureId = secondary.signatureId?.trim();
  if (!primarySignatureId || !secondarySignatureId) {
    throw new ESignPolicyError('second_signature_required', 'Electronic signature receipt id is missing');
  }
  return {
    calibratorUserId: primary.signerUserId,
    reviewerUserId: secondary.signerUserId,
    signatureHash: primaryHash,
    primarySignatureId,
    secondarySignatureId,
  };
}
