import { describe, expect, it } from 'vitest';

import {
  formatApprovalHistoryDate,
  formatEsignCertificateId,
  formatEsignTimestamp,
  resolveVerifiedCertificateHash,
} from '../esign-display';

describe('esign-display', () => {
  it('prefixes valid 64-char hex hashes as SHA256 certificate ids', () => {
    const hash = 'a'.repeat(64);
    expect(formatEsignCertificateId(hash)).toBe(`SHA256:${hash}`);
    expect(formatEsignCertificateId(`SHA256:${hash}`)).toBe(`SHA256:${hash}`);
    expect(formatEsignCertificateId('a1b2c3d4')).toBeNull();
    expect(formatEsignCertificateId(null)).toBeNull();
  });

  it('returns certificate hash only for verified receipts', () => {
    const hash = 'b'.repeat(64);
    expect(resolveVerifiedCertificateHash('verified', hash)).toBe(`SHA256:${hash}`);
    expect(resolveVerifiedCertificateHash('hash_unverified', hash)).toBeNull();
  });

  it('formats timestamps in a locale-aware display string', () => {
    const formatted = formatEsignTimestamp('2026-07-17T09:13:14.821Z', 'en-GB');
    expect(formatted).toContain('2026');
    expect(formatted).not.toBe('2026-07-17 09:13:14.821+00');
  });

  it('keeps date-only values unchanged in approval history', () => {
    expect(formatApprovalHistoryDate('2025-10-28', 'en-GB')).toBe('2025-10-28');
  });
});
