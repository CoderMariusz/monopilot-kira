export type ComplianceRegistrations = Record<string, string>;

export type ComplianceProfile = {
  orgId: string;
  brcgsSiteCode: string;
  certificationBody: string;
  certificationGrade: string;
  lastAuditDate: string | null;
  nextAuditDate: string | null;
  registrations: ComplianceRegistrations;
};

/** Shape consumed by future document header renderers (PO PDF, BOL, CoA, factory specs). */
export type ComplianceProfileHeader = {
  brcgsSiteCode: string | null;
  certificationBody: string | null;
  certificationGrade: string | null;
  lastAuditDate: string | null;
  nextAuditDate: string | null;
  registrations: ComplianceRegistrations;
};

export type UpsertComplianceProfileInput = {
  brcgsSiteCode: string;
  certificationBody: string;
  certificationGrade: string;
  lastAuditDate?: string | null;
  nextAuditDate?: string | null;
  registrations: ComplianceRegistrations;
};

export type GetComplianceProfileResult =
  | { state: 'ready'; profile: ComplianceProfile | null; canEdit: boolean }
  | { state: 'error'; canEdit: false };

export type UpsertComplianceProfileResult =
  | { ok: true; profile: ComplianceProfile }
  | { ok: false; error: 'invalid' | 'forbidden' | 'persistence_failed' };

export type ComplianceProfileRow = {
  org_id: string;
  brcgs_site_code: string | null;
  certification_body: string | null;
  certification_grade: string | null;
  last_audit_date: string | null;
  next_audit_date: string | null;
  registrations: ComplianceRegistrations | null;
};
