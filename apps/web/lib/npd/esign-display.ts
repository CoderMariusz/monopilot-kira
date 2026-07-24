/**
 * NPD gate-approval e-sign display helpers (client-safe).
 *
 * Verification status is resolved server-side; this module only formats values
 * and exposes pure verification predicates — no e-sign / auth / argon2 imports.
 */

export const ESIGN_SUBJECT_HASH_HEX_LEN = 64;
const ESIGN_SUBJECT_HASH_HEX_PATTERN = /^[0-9a-f]{64}$/i;

export type GateApprovalEsignVerification = 'verified' | 'hash_unverified' | 'unsigned';

export function isValidEsignSubjectHash(hash: string | null | undefined): boolean {
  const trimmed = hash?.trim();
  return Boolean(trimmed && ESIGN_SUBJECT_HASH_HEX_PATTERN.test(trimmed));
}

export function formatEsignCertificateId(hash: string | null | undefined): string | null {
  const trimmed = hash?.trim();
  const digest = trimmed?.replace(/^SHA256:/i, '');
  if (!digest || !isValidEsignSubjectHash(digest)) return null;
  return `SHA256:${digest}`;
}

/**
 * Resolves whether an approval's e-sign receipt is cryptographically bound to the
 * expected gate-approval subject. Never treats a non-empty esign_hash alone as verified.
 */
export function resolveGateApprovalEsignVerification(input: {
  esignedAt: string | null;
  signatureId: string | null;
  receiptSubjectHash: string | null;
  expectedSubjectHash: string | null;
}): GateApprovalEsignVerification {
  if (!input.esignedAt) return 'unsigned';

  if (input.signatureId && input.receiptSubjectHash && input.expectedSubjectHash) {
    return input.receiptSubjectHash === input.expectedSubjectHash ? 'verified' : 'hash_unverified';
  }
  if (input.signatureId && input.receiptSubjectHash && isValidEsignSubjectHash(input.receiptSubjectHash)) {
    return 'verified';
  }
  if (
    !input.signatureId &&
    input.receiptSubjectHash &&
    input.expectedSubjectHash &&
    isValidEsignSubjectHash(input.receiptSubjectHash) &&
    input.receiptSubjectHash === input.expectedSubjectHash
  ) {
    return 'verified';
  }
  return 'hash_unverified';
}

export function resolveVerifiedCertificateHash(
  verification: GateApprovalEsignVerification,
  receiptSubjectHash: string | null | undefined,
): string | null {
  if (verification !== 'verified') return null;
  return formatEsignCertificateId(receiptSubjectHash);
}

export function formatEsignTimestamp(iso: string | null | undefined, locale?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export function formatApprovalHistoryDate(
  iso: string | null | undefined,
  locale?: string,
): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return formatEsignTimestamp(iso, locale);
}
