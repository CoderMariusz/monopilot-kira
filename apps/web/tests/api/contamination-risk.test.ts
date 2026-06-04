/**
 * T-019 — Allergen contamination-risk matrix CRUD + coverage gap: REAL DB tests.
 *
 * Acceptance criteria (task T-019):
 *   AC1 line with one entry → GET ?line_id returns 'gaps' = remaining EU-14 codes
 *   AC2 risk_level='extreme' → invalid_input (not in enum)
 *   AC3 valid upsert; re-POST same key → update wins (no duplicate)
 *
 * Skips when DATABASE_URL is unset.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withOrgContext } from '../../lib/auth/with-org-context';
import type { OrgActionContext, QueryClient } from '../../lib/technical/allergens/shared';
import {
  deleteRisk,
  listRiskForLine,
  upsertRisk,
} from '../../lib/technical/allergens/contamination';
import {
  cleanup,
  databaseUrl,
  makeSeed,
  seedFixtures,
  withActionActor,
  type AllergenSeed,
} from './allergen-test-helpers';

const run = databaseUrl ? describe : describe.skip;
const seed: AllergenSeed = makeSeed();
let owner: pg.Pool;

function inCtx<T>(userId: string, orgId: string, fn: (ctx: OrgActionContext) => Promise<T>): Promise<T> {
  return withActionActor(userId, orgId, () =>
    withOrgContext(({ userId: u, orgId: o, client }) =>
      fn({ userId: u, orgId: o, client: client as unknown as QueryClient }),
    ),
  );
}

run('T-019 contamination-risk matrix CRUD + gaps (RLS + RBAC, real DB)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedFixtures(owner, seed);
  });

  afterAll(async () => {
    if (owner) {
      await cleanup(owner, seed).catch(() => undefined);
      await owner.end();
    }
  });

  it('AC2: risk_level=extreme → invalid_input (not in enum)', async () => {
    const res = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      upsertRisk(ctx, { lineId: seed.lineAId, allergenCode: 'milk', riskLevel: 'extreme' as never }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_input');
  });

  it('AC2b: invalid allergen_code → invalid_allergen_code (V-TEC-40)', async () => {
    const res = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      upsertRisk(ctx, { lineId: seed.lineAId, allergenCode: 'NOPE', riskLevel: 'high' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_allergen_code');
  });

  it('AC3: valid upsert; re-POST same key updates (no duplicate)', async () => {
    const first = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      upsertRisk(ctx, { lineId: seed.lineAId, allergenCode: 'gluten', riskLevel: 'medium', mitigation: 'clean-down' }),
    );
    expect(first.ok).toBe(true);

    const second = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      upsertRisk(ctx, { lineId: seed.lineAId, allergenCode: 'gluten', riskLevel: 'high', mitigation: 'full strip' }),
    );
    expect(second.ok).toBe(true);
    // Same row id (update, not insert).
    if (first.ok && second.ok) expect(second.data.id).toBe(first.data.id);

    const rows = await owner.query<{ risk_level: string }>(
      `select risk_level from public.allergen_contamination_risk
        where org_id = $1 and line_id = $2 and allergen_code = 'gluten'`,
      [seed.orgAId, seed.lineAId],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]?.risk_level).toBe('high');
  });

  it('AC1: GET ?line_id returns gaps = remaining EU-14 codes (only gluten covered)', async () => {
    // gluten covered above; gaps = the other 13 EU codes.
    const res = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) => listRiskForLine(ctx, seed.lineAId));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.entries.some((e) => e.allergenCode === 'gluten')).toBe(true);
      // 14 EU codes seeded - 1 covered = 13 gaps.
      expect(res.data.gaps).not.toContain('gluten');
      expect(res.data.gaps.length).toBe(13);
      expect(res.data.gaps).toContain('milk');
    }
  });

  it('targeting neither line nor machine → invalid_input (mirrors DB CHECK)', async () => {
    const res = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      upsertRisk(ctx, { allergenCode: 'milk', riskLevel: 'low' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_input');
  });

  it('audit + delete: upsert writes create audit, delete writes delete audit', async () => {
    const created = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      upsertRisk(ctx, { lineId: seed.lineAId, allergenCode: 'soybeans', riskLevel: 'segregated' }),
    );
    expect(created.ok).toBe(true);
    const id = created.ok ? created.data.id : '';

    const createAudit = await owner.query(
      `select action from public.audit_log where org_id = $1 and resource_id = $2 and action = 'contamination_risk.create'`,
      [seed.orgAId, id],
    );
    expect(createAudit.rowCount).toBe(1);

    const del = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) => deleteRisk(ctx, { id }));
    expect(del.ok).toBe(true);

    const delAudit = await owner.query(
      `select action from public.audit_log where org_id = $1 and resource_id = $2 and action = 'contamination_risk.delete'`,
      [seed.orgAId, id],
    );
    expect(delAudit.rowCount).toBe(1);
  });

  it('RBAC: viewer without technical.allergens.edit → forbidden', async () => {
    const res = await inCtx(seed.viewerAUserId, seed.orgAId, (ctx) =>
      upsertRisk(ctx, { lineId: seed.lineAId, allergenCode: 'milk', riskLevel: 'high' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('forbidden');
  });
});
