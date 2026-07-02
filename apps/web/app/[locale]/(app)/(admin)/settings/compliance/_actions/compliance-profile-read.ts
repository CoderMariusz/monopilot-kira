import type {
  ComplianceProfile,
  ComplianceProfileHeader,
  ComplianceProfileRow,
  ComplianceRegistrations,
} from './compliance-profile.types';

const PROFILE_COLUMNS =
  'org_id, brcgs_site_code, certification_body, certification_grade, last_audit_date, next_audit_date, registrations';

export const COMPLIANCE_PROFILE_SELECT = PROFILE_COLUMNS;

function normalizeRegistrations(value: ComplianceRegistrations | null | undefined): ComplianceRegistrations {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: ComplianceRegistrations = {};
  for (const [key, raw] of Object.entries(value)) {
    const trimmedKey = key.trim();
    if (!trimmedKey) continue;
    out[trimmedKey] = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
  }
  return out;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 10) : null;
}

function textOrEmpty(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

export function mapComplianceProfileRow(row: ComplianceProfileRow): ComplianceProfile {
  return {
    orgId: row.org_id,
    brcgsSiteCode: textOrEmpty(row.brcgs_site_code),
    certificationBody: textOrEmpty(row.certification_body),
    certificationGrade: textOrEmpty(row.certification_grade),
    lastAuditDate: formatDate(row.last_audit_date),
    nextAuditDate: formatDate(row.next_audit_date),
    registrations: normalizeRegistrations(row.registrations),
  };
}

/** Non-server read helper for document header consumers (import from action modules with a QueryClient). */
export function toComplianceProfileHeader(profile: ComplianceProfile | null): ComplianceProfileHeader | null {
  if (!profile) return null;
  const hasContent =
    profile.brcgsSiteCode.length > 0
    || profile.certificationBody.length > 0
    || profile.certificationGrade.length > 0
    || profile.lastAuditDate != null
    || profile.nextAuditDate != null
    || Object.keys(profile.registrations).length > 0;
  if (!hasContent) return null;
  return {
    brcgsSiteCode: profile.brcgsSiteCode || null,
    certificationBody: profile.certificationBody || null,
    certificationGrade: profile.certificationGrade || null,
    lastAuditDate: profile.lastAuditDate,
    nextAuditDate: profile.nextAuditDate,
    registrations: profile.registrations,
  };
}
