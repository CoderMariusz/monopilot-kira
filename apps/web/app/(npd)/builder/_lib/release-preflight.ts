import { type OrgContextLike, hasPermission } from '../../pipeline/_actions/shared';

export const RELEASE_TO_FACTORY_PERMISSION = 'npd.gate.approve';

export type ReleasePreflightBlocker = {
  code:
    | 'G4_REQUIRED'
    | 'LAUNCHED_IS_TERMINAL'
    | 'FG_CANDIDATE_REQUIRED'
    | 'ACTIVE_SHARED_BOM_REQUIRED'
    | 'FACTORY_SPEC_REQUIRED'
    | 'FACTORY_SPEC_MISMATCH'
    | 'V18_OPEN_HIGH_RISK';
  message: string;
};

export type ReleasePreflightReady = {
  projectId: string;
  projectCode: string;
  productCode: string;
  activeBomHeaderId: string;
  activeFactorySpecId: string;
  factorySpecApprovedAt: string;
};

type ProjectRow = {
  id: string;
  code: string;
  current_gate: string;
  current_stage: string;
  product_code: string | null;
};

type BomRow = {
  id: string;
  version: number | string | null;
  line_count: string | number;
};

export class ReleasePreflightError extends Error {
  status: number;
  blockers: ReleasePreflightBlocker[];

  constructor(blockers: ReleasePreflightBlocker[], status = 409) {
    super('PRECONDITION_BLOCKERS');
    this.name = 'ReleasePreflightError';
    this.status = status;
    this.blockers = blockers;
  }
}

export async function requireReleasePermission(ctx: OrgContextLike): Promise<void> {
  if (!(await hasPermission(ctx, RELEASE_TO_FACTORY_PERMISSION))) {
    throw new ReleasePreflightError(
      [{ code: 'G4_REQUIRED', message: 'Caller is not authorized to release NPD projects to factory.' }],
      403,
    );
  }
}

export async function runReleasePreflight(
  ctx: OrgContextLike,
  input: { projectId: string; activeFactorySpecId?: string | null },
): Promise<ReleasePreflightReady> {
  const { rows } = await ctx.client.query<ProjectRow>(
    `select id, code, current_gate, current_stage, product_code
       from public.npd_projects
      where org_id = app.current_org_id()
        and id = $1::uuid
      for update`,
    [input.projectId],
  );
  const project = rows[0];
  if (!project) {
    throw new ReleasePreflightError(
      [{ code: 'G4_REQUIRED', message: 'NPD project was not found in the current org.' }],
      404,
    );
  }

  const blockers: ReleasePreflightBlocker[] = [];
  if (project.current_stage === 'launched' || project.current_gate === 'Launched') {
    blockers.push({
      code: 'LAUNCHED_IS_TERMINAL',
      message: 'Launched NPD projects are terminal and cannot be released again.',
    });
  }
  if (project.current_gate !== 'G4') {
    blockers.push({ code: 'G4_REQUIRED', message: 'NPD project must be at G4 before factory release.' });
  }
  if (!project.product_code) {
    blockers.push({
      code: 'FG_CANDIDATE_REQUIRED',
      message: 'NPD project must have a mapped FG candidate before factory release.',
    });
  }

  const productCode = project.product_code;
  if (productCode) {
    const risks = await ctx.client.query<{ open_high_count: string | number }>(
      `select count(*)::text as open_high_count
         from public.risks
        where org_id = app.current_org_id()
          and product_code = $1
          and bucket = 'High'
          and state = 'Open'`,
      [productCode],
    );
    if (Number(risks.rows[0]?.open_high_count ?? 0) > 0) {
      blockers.push({
        code: 'V18_OPEN_HIGH_RISK',
        message: 'Factory release requires all High risks to be mitigated or closed.',
      });
    }
  }

  let activeBomHeaderId: string | null = null;
  let activeBomVersion: number | null = null;
  if (productCode) {
    const bom = await ctx.client.query<BomRow>(
      `select h.id, h.version, count(l.id)::text as line_count
         from public.bom_headers h
         join public.bom_lines l
           on l.org_id = h.org_id
          and l.bom_header_id = h.id
        where h.org_id = app.current_org_id()
          and h.npd_project_id = $1::uuid
          and h.product_id = $2
          and h.origin_module = 'npd'
          and h.status = 'active'
        group by h.id, h.version, h.created_at
        order by h.version desc, h.created_at desc
        limit 1`,
      [project.id, productCode],
    );
    const activeBom = bom.rows[0];
    if (activeBom && Number(activeBom.line_count) > 0) {
      activeBomHeaderId = activeBom.id;
      activeBomVersion = activeBom.version === null || activeBom.version === undefined ? null : Number(activeBom.version);
    }
  }
  if (!activeBomHeaderId) {
    blockers.push({
      code: 'ACTIVE_SHARED_BOM_REQUIRED',
      message: 'Factory release requires an active shared BOM with at least one line.',
    });
  }

  // F1 (W9 cross-review BLOCKER): a caller-supplied factory_spec id is NEVER
  // trusted — it is later persisted into factory_release_status.active_factory_spec_id,
  // so a forged / foreign-org / wrong-product / wrong-BOM uuid would be laundered
  // into release evidence. Validate it against the SAME invariants the
  // self-resolved path satisfies: org scope (RLS via app.current_org_id()),
  // factory-usable status, FG item_code = the productCode under release, and the
  // spec's bundled BOM (bom_header_id + bom_version) = the selected active BOM.
  let activeFactorySpecId: string | null = null;
  if (input.activeFactorySpecId) {
    const supplied = await validateSuppliedFactorySpecId(ctx, {
      factorySpecId: input.activeFactorySpecId,
      productCode,
      activeBomHeaderId,
      activeBomVersion,
    });
    if (supplied) {
      activeFactorySpecId = supplied;
    } else {
      blockers.push({
        code: 'FACTORY_SPEC_MISMATCH',
        message:
          'Supplied factory_spec id does not match an approved/released factory_spec for this product and its active shared BOM in the current org.',
      });
    }
  } else {
    activeFactorySpecId = await loadExistingFactorySpecId(ctx, project.id, productCode);
    if (!activeFactorySpecId) {
      blockers.push({
        code: 'FACTORY_SPEC_REQUIRED',
        message: 'Factory release requires Technical factory_spec evidence.',
      });
    }
  }

  if (blockers.length > 0) throw new ReleasePreflightError(blockers);

  const factorySpecApprovedAt = await loadFactorySpecApprovedAt(ctx, activeFactorySpecId as string);
  if (!factorySpecApprovedAt) {
    throw new ReleasePreflightError([
      {
        code: 'FACTORY_SPEC_REQUIRED',
        message: 'Factory release requires an approved factory_spec with approval evidence.',
      },
    ]);
  }

  return {
    projectId: project.id,
    projectCode: project.code,
    productCode: productCode as string,
    activeBomHeaderId: activeBomHeaderId as string,
    activeFactorySpecId: activeFactorySpecId as string,
    factorySpecApprovedAt,
  };
}

/**
 * F1 — validate a CALLER-SUPPLIED factory_spec id before it is accepted as
 * release evidence. Returns the id when every invariant holds, else null:
 *   - org match: RLS + explicit fs.org_id = app.current_org_id()
 *   - status in ('approved_for_factory', 'released_to_factory')
 *   - items.item_code (via fs.fg_item_id) = the productCode under release
 *   - fs.bom_header_id / fs.bom_version = the selected active shared BOM
 * Missing productCode / active BOM ⇒ null (their own blockers already fired;
 * a supplied spec id cannot be validated without them and is never trusted).
 */
async function validateSuppliedFactorySpecId(
  ctx: OrgContextLike,
  params: {
    factorySpecId: string;
    productCode: string | null;
    activeBomHeaderId: string | null;
    activeBomVersion: number | null;
  },
): Promise<string | null> {
  if (!params.productCode || !params.activeBomHeaderId || params.activeBomVersion === null) return null;
  const { rows } = await ctx.client.query<{ id: string }>(
    `select fs.id
       from public.factory_specs fs
       join public.items i
         on i.org_id = fs.org_id
        and i.id = fs.fg_item_id
      where fs.org_id = app.current_org_id()
        and fs.id = $1::uuid
        and fs.status in ('approved_for_factory', 'released_to_factory')
        and i.item_code = $2
        and fs.bom_header_id = $3::uuid
        and fs.bom_version = $4::integer
      limit 1`,
    [params.factorySpecId, params.productCode, params.activeBomHeaderId, params.activeBomVersion],
  );
  return rows[0]?.id ?? null;
}

async function loadExistingFactorySpecId(
  ctx: OrgContextLike,
  _projectId: string,
  productCode: string | null,
): Promise<string | null> {
  if (!productCode) return null;
  const { rows } = await ctx.client.query<{ id: string }>(
    `select fs.id
       from public.factory_specs fs
       join public.items i
         on i.org_id = fs.org_id
        and i.id = fs.fg_item_id
      where fs.org_id = app.current_org_id()
        and i.item_code = $1
        and i.item_type = 'fg'
        and fs.status in ('approved_for_factory', 'released_to_factory')
      order by fs.version desc, fs.updated_at desc
      limit 1`,
    [productCode],
  );
  return rows[0]?.id ?? null;
}

async function loadFactorySpecApprovedAt(ctx: OrgContextLike, factorySpecId: string): Promise<string | null> {
  const { rows } = await ctx.client.query<{ approved_at: string | null }>(
    `select fs.approved_at::text as approved_at
       from public.factory_specs fs
      where fs.org_id = app.current_org_id()
        and fs.id = $1::uuid
      limit 1`,
    [factorySpecId],
  );
  return rows[0]?.approved_at ?? null;
}
