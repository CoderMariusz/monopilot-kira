/**
 * upsertComplianceProfile — validation, permission gate (settings.org.update), org scoping.
 * mapComplianceProfileRow — date round-trip: pg Date objects vs ISO strings.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type QueryFn = ReturnType<typeof vi.fn>;

const ORG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let queryImpl: QueryFn;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({
      userId: USER_ID,
      orgId: ORG_ID,
      client: {
        query: (sql: string, params?: unknown[]) => queryImpl(sql, params),
      },
    }),
}));

vi.mock('../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn(),
}));

import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { upsertComplianceProfile } from './compliance-profile-actions';
import { mapComplianceProfileRow } from './compliance-profile-read';

const hasPermissionMock = vi.mocked(hasPermission);

const baseInput = {
  brcgsSiteCode: 'SITE-001',
  certificationBody: 'BRCGS',
  certificationGrade: 'AA',
  lastAuditDate: '2025-06-01',
  nextAuditDate: '2026-06-01',
  registrations: { fda_establishment: '12345' },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('upsertComplianceProfile', () => {
  it('rejects invalid input before any query', async () => {
    queryImpl = vi.fn();
    const result = await upsertComplianceProfile({
      ...baseInput,
      lastAuditDate: 'not-a-date',
    });
    expect(result).toEqual({ ok: false, error: 'invalid' });
    expect(queryImpl).not.toHaveBeenCalled();
    expect(hasPermissionMock).not.toHaveBeenCalled();
  });

  it('returns forbidden without settings.org.update', async () => {
    queryImpl = vi.fn();
    hasPermissionMock.mockResolvedValue(false);
    const result = await upsertComplianceProfile(baseInput);
    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(hasPermissionMock).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_ID, userId: USER_ID }),
      'settings.org.update',
    );
    expect(queryImpl).not.toHaveBeenCalled();
  });

  it('upserts under the current org_id and returns the profile', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    queryImpl = vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (/insert into public\.org_compliance_profile/i.test(sql)) {
        return {
          rows: [{
            org_id: ORG_ID,
            brcgs_site_code: 'SITE-001',
            certification_body: 'BRCGS',
            certification_grade: 'AA',
            last_audit_date: '2025-06-01',
            next_audit_date: '2026-06-01',
            registrations: { fda_establishment: '12345' },
          }],
        };
      }
      return { rows: [] };
    });
    hasPermissionMock.mockResolvedValue(true);

    const result = await upsertComplianceProfile(baseInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.orgId).toBe(ORG_ID);
      expect(result.profile.brcgsSiteCode).toBe('SITE-001');
      expect(result.profile.registrations).toEqual({ fda_establishment: '12345' });
    }

    const upsertCall = calls.find((call) => /insert into public\.org_compliance_profile/i.test(call.sql));
    expect(upsertCall?.params?.[0]).toBe(ORG_ID);
    expect(upsertCall?.params?.[7]).toBe(USER_ID);
    expect(upsertCall?.sql).toMatch(/on conflict \(org_id\) do update/i);
  });

  it('cannot upsert a different org — context org_id always wins', async () => {
    // A caller passes a different org id inside the input (e.g. via a crafted
    // registrations key, or by trying to smuggle it as the first param).
    // The action must use only context.orgId for the org_id column — never a
    // caller-supplied value.
    const ATTACKER_ORG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    queryImpl = vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (/insert into public\.org_compliance_profile/i.test(sql)) {
        // Fail the test immediately if the attacker org appears in params
        if (params?.includes(ATTACKER_ORG)) {
          throw new Error(`ISOLATION BREACH: attacker org_id ${ATTACKER_ORG} reached the query`);
        }
        return {
          rows: [{
            org_id: ORG_ID,
            brcgs_site_code: 'SITE-001',
            certification_body: 'BRCGS',
            certification_grade: 'AA',
            last_audit_date: null,
            next_audit_date: null,
            registrations: {},
          }],
        };
      }
      return { rows: [] };
    });
    hasPermissionMock.mockResolvedValue(true);

    // Pass the attacker org inside the registrations map (the only freeform field
    // that arrives in user input) — the action must never forward it as org_id.
    const result = await upsertComplianceProfile({
      ...baseInput,
      registrations: { evil_org: ATTACKER_ORG },
    });
    // The action should still succeed using the context org, not the attacker org.
    expect(result.ok).toBe(true);
    const upsertCall = calls.find((c) => /insert into public\.org_compliance_profile/i.test(c.sql));
    expect(upsertCall?.params?.[0]).toBe(ORG_ID);
    expect(upsertCall?.params?.[0]).not.toBe(ATTACKER_ORG);
  });

  it('accepts optional empty audit dates', async () => {
    queryImpl = vi.fn(async (sql: string) => {
      if (/insert into public\.org_compliance_profile/i.test(sql)) {
        return {
          rows: [{
            org_id: ORG_ID,
            brcgs_site_code: 'SITE-002',
            certification_body: 'IFS',
            certification_grade: 'Higher',
            last_audit_date: null,
            next_audit_date: null,
            registrations: {},
          }],
        };
      }
      return { rows: [] };
    });
    hasPermissionMock.mockResolvedValue(true);

    const result = await upsertComplianceProfile({
      brcgsSiteCode: 'SITE-002',
      certificationBody: 'IFS',
      certificationGrade: 'Higher',
      lastAuditDate: null,
      nextAuditDate: '',
      registrations: {},
    });
    expect(result.ok).toBe(true);
  });
});

describe('mapComplianceProfileRow — date round-trip', () => {
  const BASE_ROW = {
    org_id: ORG_ID,
    brcgs_site_code: 'SITE-001',
    certification_body: 'BRCGS',
    certification_grade: 'AA',
    registrations: { reg: 'val' },
  };

  it('maps ISO string dates to YYYY-MM-DD', () => {
    const profile = mapComplianceProfileRow({
      ...BASE_ROW,
      last_audit_date: '2025-06-01',
      next_audit_date: '2026-06-01T00:00:00.000Z',
    });
    expect(profile.lastAuditDate).toBe('2025-06-01');
    expect(profile.nextAuditDate).toBe('2026-06-01');
  });

  it('maps pg Date objects to YYYY-MM-DD (live pg driver returns Date for date columns)', () => {
    // This is the bug path: pg returns Date objects, not strings, for `date` columns.
    const lastDate = new Date('2025-06-01T00:00:00.000Z');
    const nextDate = new Date('2026-06-01T00:00:00.000Z');
    const profile = mapComplianceProfileRow({
      ...BASE_ROW,
      last_audit_date: lastDate,
      next_audit_date: nextDate,
    });
    expect(profile.lastAuditDate).toBe('2025-06-01');
    expect(profile.nextAuditDate).toBe('2026-06-01');
  });

  it('maps null audit dates to null', () => {
    const profile = mapComplianceProfileRow({
      ...BASE_ROW,
      last_audit_date: null,
      next_audit_date: null,
    });
    expect(profile.lastAuditDate).toBeNull();
    expect(profile.nextAuditDate).toBeNull();
  });
});
