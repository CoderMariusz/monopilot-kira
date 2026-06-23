/**
 * NPD HANDOFF stage — read-only release-gate probe.
 *
 * The "✓ Promote to production BOM" button reuses the REAL factory-release flow
 * (`releaseNpdProjectToFactory` → `runReleasePreflight`). That preflight is the
 * source of truth, but it (a) takes a `for update` row lock and (b) throws on the
 * FIRST blocker as a `ReleasePreflightError` — neither is appropriate for a GET.
 *
 * This probe mirrors the SAME invariants the preflight checks, but read-only and
 * NON-throwing, so the screen can surface — per gate — whether it is met and WHY
 * it is not (the dead-end the user reported: promote looked permanently disabled
 * with no explanation). The actual promote still runs the real preflight, so this
 * is purely a surfacing aid and never the authority.
 *
 * Org-scoped via RLS (app.current_org_id()); no mocks, no hard-coded rows.
 */

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

export type ReleaseGateProbeCtx = { userId: string; orgId: string; client: QueryClient };

/** Stable gate codes surfaced on the handoff screen (subset of preflight blockers). */
export type ReleaseGateCode =
  | 'G4_REQUIRED'
  | 'FG_CANDIDATE_REQUIRED'
  | 'ACTIVE_SHARED_BOM_REQUIRED'
  | 'FACTORY_SPEC_REQUIRED'
  | 'V18_OPEN_HIGH_RISK';

export type ReleaseGateStatus = {
  code: ReleaseGateCode;
  met: boolean;
};

/** The fixed gate order surfaced on the screen (stable for tests + a11y). */
export const RELEASE_GATE_ORDER: ReleaseGateCode[] = [
  'G4_REQUIRED',
  'FG_CANDIDATE_REQUIRED',
  'ACTIVE_SHARED_BOM_REQUIRED',
  'FACTORY_SPEC_REQUIRED',
  'V18_OPEN_HIGH_RISK',
];

type ProjectRow = { current_gate: string; product_code: string | null };

/**
 * Probe the release gates for a project, read-only. Returns a status per gate in
 * RELEASE_GATE_ORDER. A missing project (RLS / not in org) reports every gate as
 * unmet rather than throwing — the screen renders the unmet panel, never a crash.
 */
export async function probeReleaseGates(
  ctx: ReleaseGateProbeCtx,
  projectId: string,
): Promise<ReleaseGateStatus[]> {
  const projectRes = await ctx.client.query<ProjectRow>(
    `select current_gate, product_code
       from public.npd_projects
      where id = $1::uuid
        and org_id = app.current_org_id()
      limit 1`,
    [projectId],
  );
  const project = projectRes.rows[0];
  if (!project) {
    return RELEASE_GATE_ORDER.map((code) => ({ code, met: false }));
  }

  const g4Met = project.current_gate === 'G4' || project.current_gate === 'Launched';
  const productCode = project.product_code;
  const fgMet = Boolean(productCode);

  let highRiskMet = true;
  let activeBomMet = false;
  let factorySpecMet = false;

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
    highRiskMet = Number(risks.rows[0]?.open_high_count ?? 0) === 0;

    const bom = await ctx.client.query<{ id: string; line_count: string | number }>(
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
        group by h.id
        order by h.id
        limit 1`,
      [projectId, productCode],
    );
    activeBomMet = Boolean(bom.rows[0]) && Number(bom.rows[0]?.line_count ?? 0) > 0;

    const spec = await ctx.client.query<{ id: string }>(
      `select fs.id
         from public.factory_specs fs
         join public.items i
           on i.org_id = fs.org_id
          and i.id = fs.fg_item_id
        where fs.org_id = app.current_org_id()
          and i.item_code = $1
          and i.item_type = 'fg'
          and fs.status in ('approved_for_factory', 'released_to_factory')
        limit 1`,
      [productCode],
    );
    factorySpecMet = Boolean(spec.rows[0]);
  }

  const metByCode: Record<ReleaseGateCode, boolean> = {
    G4_REQUIRED: g4Met,
    FG_CANDIDATE_REQUIRED: fgMet,
    ACTIVE_SHARED_BOM_REQUIRED: activeBomMet,
    FACTORY_SPEC_REQUIRED: factorySpecMet,
    V18_OPEN_HIGH_RISK: highRiskMet,
  };

  return RELEASE_GATE_ORDER.map((code) => ({ code, met: metByCode[code] }));
}
