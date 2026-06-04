import { type OrgContextLike, hasPermission } from '../../pipeline/_actions/shared';

export const RELEASE_TO_FACTORY_PERMISSION = 'npd.gate.approve';

export type ReleasePreflightBlocker = {
  code: 'G4_REQUIRED' | 'FG_CANDIDATE_REQUIRED' | 'ACTIVE_SHARED_BOM_REQUIRED' | 'FACTORY_SPEC_REQUIRED';
  message: string;
};

export type ReleasePreflightReady = {
  projectId: string;
  projectCode: string;
  productCode: string;
  activeBomHeaderId: string;
  activeFactorySpecId: string;
};

type ProjectRow = {
  id: string;
  code: string;
  current_gate: string;
  product_code: string | null;
};

type BomRow = {
  id: string;
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
    `select id, code, current_gate, product_code
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
  let activeBomHeaderId: string | null = null;
  if (productCode) {
    const bom = await ctx.client.query<BomRow>(
      `select h.id, count(l.id)::text as line_count
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
    if (activeBom && Number(activeBom.line_count) > 0) activeBomHeaderId = activeBom.id;
  }
  if (!activeBomHeaderId) {
    blockers.push({
      code: 'ACTIVE_SHARED_BOM_REQUIRED',
      message: 'Factory release requires an active shared BOM with at least one line.',
    });
  }

  const activeFactorySpecId = input.activeFactorySpecId ?? (await loadExistingFactorySpecId(ctx, project.id, productCode));
  if (!activeFactorySpecId) {
    blockers.push({
      code: 'FACTORY_SPEC_REQUIRED',
      message: 'Factory release requires Technical factory_spec evidence.',
    });
  }

  if (blockers.length > 0) throw new ReleasePreflightError(blockers);

  return {
    projectId: project.id,
    projectCode: project.code,
    productCode: productCode as string,
    activeBomHeaderId: activeBomHeaderId as string,
    activeFactorySpecId: activeFactorySpecId as string,
  };
}

async function loadExistingFactorySpecId(
  ctx: OrgContextLike,
  projectId: string,
  productCode: string | null,
): Promise<string | null> {
  if (!productCode) return null;
  const { rows } = await ctx.client.query<{ active_factory_spec_id: string | null }>(
    `select active_factory_spec_id
       from public.factory_release_status
      where org_id = app.current_org_id()
        and project_id = $1::uuid
        and product_code = $2
        and active_factory_spec_id is not null
      order by updated_at desc
      limit 1`,
    [projectId, productCode],
  );
  return rows[0]?.active_factory_spec_id ?? null;
}
