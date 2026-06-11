import { describe, expect, it } from 'vitest';

import {
  ReleasePreflightError,
  runReleasePreflight,
} from '../../../app/(npd)/builder/_lib/release-preflight';
import type { OrgContextLike, QueryClient } from '../../../app/(npd)/pipeline/_actions/shared';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const BOM_HEADER_ID = '44444444-4444-4444-8444-444444444444';
const FACTORY_SPEC_ID = '55555555-5555-4555-8555-555555555555';

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function createContext(options: {
  openHighRiskCount: number;
  /** Params captured for the F1 supplied-spec validation query (fs.id = $1). */
  suppliedSpecQueries?: unknown[][];
  /** Rows the F1 supplied-spec validation query returns (default: none → mismatch). */
  suppliedSpecRows?: Array<{ id: string }>;
}): OrgContextLike {
  const client: QueryClient = {
    async query<T>(sql: string, params?: readonly unknown[]) {
      const n = normalize(sql);

      if (n.includes('from public.npd_projects')) {
        return {
          rows: [
            {
              id: PROJECT_ID,
              code: 'NPD-5101',
              current_gate: 'G4',
              product_code: 'FG-5101',
            },
          ] as T[],
        };
      }
      if (n.includes('from public.risks')) {
        return { rows: [{ open_high_count: String(options.openHighRiskCount) }] as T[] };
      }
      if (n.includes('from public.bom_headers')) {
        return { rows: [{ id: BOM_HEADER_ID, version: 3, line_count: '1' }] as T[] };
      }
      // F1 — caller-supplied spec validation (distinguished by the fs.id predicate).
      if (n.includes('from public.factory_specs') && n.includes('fs.id = $1::uuid')) {
        options.suppliedSpecQueries?.push([...(params ?? [])]);
        return { rows: (options.suppliedSpecRows ?? []) as T[] };
      }
      if (n.includes('from public.factory_specs')) {
        return { rows: [{ id: FACTORY_SPEC_ID }] as T[] };
      }

      throw new Error(`Unhandled SQL: ${n}`);
    },
  };

  return { userId: USER_ID, orgId: ORG_ID, client };
}

describe('NPD release preflight V18 open high-risk gate', () => {
  it('returns a structured blocker when an open High risk exists', async () => {
    await expect(runReleasePreflight(createContext({ openHighRiskCount: 1 }), { projectId: PROJECT_ID })).rejects.toMatchObject({
      name: 'ReleasePreflightError',
      status: 409,
      blockers: [
        {
          code: 'V18_OPEN_HIGH_RISK',
          message: 'Factory release requires all High risks to be mitigated or closed.',
        },
      ],
    } satisfies Partial<ReleasePreflightError>);
  });

  it('passes when all High risks are mitigated or closed', async () => {
    await expect(runReleasePreflight(createContext({ openHighRiskCount: 0 }), { projectId: PROJECT_ID })).resolves.toEqual({
      projectId: PROJECT_ID,
      projectCode: 'NPD-5101',
      productCode: 'FG-5101',
      activeBomHeaderId: BOM_HEADER_ID,
      activeFactorySpecId: FACTORY_SPEC_ID,
    });
  });
});

// F1 (W9 cross-review BLOCKER) — a caller-supplied activeFactorySpecId must be
// validated (org + status + FG item_code + bundled BOM header/version) before it
// is accepted as release evidence; any mismatch is a structured blocker.
describe('NPD release preflight supplied factory_spec validation (F1)', () => {
  const FORGED_SPEC_ID = '66666666-6666-4666-8666-666666666666';

  it('blocks a forged / foreign-org / mismatched supplied spec id with FACTORY_SPEC_MISMATCH', async () => {
    const suppliedSpecQueries: unknown[][] = [];
    const ctx = createContext({ openHighRiskCount: 0, suppliedSpecQueries, suppliedSpecRows: [] });

    await expect(
      runReleasePreflight(ctx, { projectId: PROJECT_ID, activeFactorySpecId: FORGED_SPEC_ID }),
    ).rejects.toMatchObject({
      name: 'ReleasePreflightError',
      status: 409,
      blockers: [
        {
          code: 'FACTORY_SPEC_MISMATCH',
          message:
            'Supplied factory_spec id does not match an approved/released factory_spec for this product and its active shared BOM in the current org.',
        },
      ],
    } satisfies Partial<ReleasePreflightError>);

    // The validation query must bind the supplied id + productCode + the SELECTED active BOM (id + version).
    expect(suppliedSpecQueries).toEqual([[FORGED_SPEC_ID, 'FG-5101', BOM_HEADER_ID, 3]]);
  });

  it('accepts a supplied spec id only when the validation query confirms the full bundle match', async () => {
    const suppliedSpecQueries: unknown[][] = [];
    const ctx = createContext({
      openHighRiskCount: 0,
      suppliedSpecQueries,
      suppliedSpecRows: [{ id: FACTORY_SPEC_ID }],
    });

    await expect(
      runReleasePreflight(ctx, { projectId: PROJECT_ID, activeFactorySpecId: FACTORY_SPEC_ID }),
    ).resolves.toEqual({
      projectId: PROJECT_ID,
      projectCode: 'NPD-5101',
      productCode: 'FG-5101',
      activeBomHeaderId: BOM_HEADER_ID,
      activeFactorySpecId: FACTORY_SPEC_ID,
    });
    expect(suppliedSpecQueries).toHaveLength(1);
  });
});
