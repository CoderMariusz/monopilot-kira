'use server';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { loadLiveWipUnitCostMap, type LiveWipPayloadLine } from '../../../../../../lib/npd/live-wip-cost-query';

export type ResolveLiveWipCostsResult =
  | { ok: true; costsByLineKey: Record<string, string> }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'persistence_failed' };

export async function resolveLiveWipCosts(input: {
  versionId?: unknown;
  wipLines?: unknown;
}): Promise<ResolveLiveWipCostsResult> {
  const versionId = parseUuid(input?.versionId);
  const wipLines = parseWipLines(input?.wipLines);
  if (!versionId || wipLines === null) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async (ctx) => {
      if (!(await hasPermission(ctx, 'npd.costing'))) return { ok: false, error: 'forbidden' };

      const versionRow = await ctx.client.query<{ ok: number }>(
        `select 1 as ok
           from public.formulation_versions fv
           join public.formulations f
             on f.id = fv.formulation_id
            and f.org_id = app.current_org_id()
          where fv.id = $1::uuid
          limit 1`,
        [versionId],
      );
      if (!versionRow.rows[0]) return { ok: false, error: 'invalid_input' };

      const costsByLineKey = await loadLiveWipUnitCostMap(ctx.client, versionId, wipLines);
      return { ok: true as const, costsByLineKey };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseWipLines(value: unknown): LiveWipPayloadLine[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const parsed: LiveWipPayloadLine[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const candidate = entry as Record<string, unknown>;
    const rmCode = typeof candidate.rmCode === 'string' ? candidate.rmCode.trim() : '';
    const wipDefinitionId = parseUuid(candidate.wipDefinitionId);
    if (!rmCode || !wipDefinitionId) return null;
    const qtyKg =
      candidate.qtyKg === null || candidate.qtyKg === undefined || candidate.qtyKg === ''
        ? null
        : typeof candidate.qtyKg === 'string' && /^\d+(?:\.\d+)?$/.test(candidate.qtyKg.trim())
          ? candidate.qtyKg.trim()
          : null;
    parsed.push({ rmCode, wipDefinitionId, qtyKg });
  }
  return parsed;
}

function parseUuid(value: unknown): string | null {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}
