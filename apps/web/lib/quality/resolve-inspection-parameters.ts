/**
 * Resolve editable inspection parameters from the product's active quality spec.
 * Used when quality_inspections.parameters is still [] (new material / no template
 * snapshot on create). Falls back to a clear missing-template signal for the UI.
 */

import {
  normalizeParameterName,
  type SpecParameterBounds,
} from './evaluate-inspection-parameter';

export type InspectionParameterTemplate = {
  name: string;
  expected?: string;
  actual: string;
  pass: boolean;
};

export type InspectionParameterResolution =
  | { status: 'stored'; parameters: InspectionParameterTemplate[] }
  | { status: 'resolved'; parameters: InspectionParameterTemplate[]; specId: string }
  | { status: 'missing_template'; parameters: [] };

export type InspectionReferenceType = 'lp' | 'grn' | 'wo_output';

export type ActiveSpecBoundsResult =
  | { status: 'loaded'; specId: string; bounds: Map<string, SpecParameterBounds> }
  | { status: 'none' }
  | { status: 'ambiguous'; specIds: string[] };

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

type SpecParameterRow = {
  spec_id: string;
  parameter_name: string;
  target_value: string | null;
  min_value: string | null;
  max_value: string | null;
  unit: string | null;
};

type LoadedSpecRows = SpecParameterRow & {
  tied_spec_count: number;
  tied_spec_ids: string | null;
};

/**
 * Incoming GRN/LP inspections use incoming specs; WO-output inspections use
 * final/in-process specs. 'all' applies to every context.
 */
export function specAppliesToCandidates(referenceType: InspectionReferenceType): readonly string[] {
  if (referenceType === 'wo_output') return ['final', 'in_process', 'all'];
  return ['incoming', 'all'];
}

function formatExpected(row: SpecParameterRow): string | undefined {
  const unit = row.unit?.trim() ? ` ${row.unit.trim()}` : '';
  if (row.target_value != null && row.target_value !== '') {
    return `${row.target_value}${unit}`.trim();
  }
  if (row.min_value != null && row.max_value != null) {
    return `${row.min_value}–${row.max_value}${unit}`.trim();
  }
  if (row.min_value != null) return `≥ ${row.min_value}${unit}`.trim();
  if (row.max_value != null) return `≤ ${row.max_value}${unit}`.trim();
  return undefined;
}

function mapSpecRow(row: SpecParameterRow): InspectionParameterTemplate {
  return {
    name: row.parameter_name,
    expected: formatExpected(row),
    actual: '',
    pass: false,
  };
}

function parseStoredParameters(value: unknown): InspectionParameterTemplate[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is InspectionParameterTemplate => {
      if (typeof item !== 'object' || item === null) return false;
      const candidate = item as Record<string, unknown>;
      return typeof candidate.name === 'string';
    })
    .map((item) => ({
      name: item.name,
      expected: typeof item.expected === 'string' ? item.expected : undefined,
      actual: typeof item.actual === 'string' ? item.actual : '',
      pass: typeof item.pass === 'boolean' ? item.pass : false,
    }));
}

function activeSpecParametersSql(appliesToParamIndex: number): string {
  const appliesToParam = `$${appliesToParamIndex}`;
  return `with active_specs as (
         select qs.id,
                qs.version,
                qs.effective_from
           from public.quality_specifications qs
          where qs.org_id = app.current_org_id()
            and qs.product_id = $1::uuid
            and qs.status = 'active'
            and qs.applies_to = any(${appliesToParam}::text[])
            and (qs.effective_from is null or qs.effective_from <= current_date)
            and (qs.effective_until is null or qs.effective_until >= current_date)
       ),
       winner as (
         select id, version, effective_from
           from active_specs
          order by version desc, effective_from desc nulls last, id desc
          limit 1
       ),
       tied as (
         select a.id::text as spec_id
           from active_specs a
           join winner w on w.version = a.version
                        and w.effective_from is not distinct from a.effective_from
       )
       select qsp.specification_id::text as spec_id,
              qsp.parameter_name,
              qsp.target_value::text,
              qsp.min_value::text,
              qsp.max_value::text,
              qsp.unit,
              (select count(*)::int from tied) as tied_spec_count,
              (select json_agg(t.spec_id order by t.spec_id) from tied t)::text as tied_spec_ids
         from public.quality_spec_parameters qsp
         join winner w on w.id = qsp.specification_id
        where qsp.org_id = app.current_org_id()
        order by qsp.sort_order asc, qsp.parameter_name asc`;
}

function mapBoundsRows(rows: SpecParameterRow[]): Map<string, SpecParameterBounds> {
  const bounds = new Map<string, SpecParameterBounds>();
  for (const row of rows) {
    bounds.set(normalizeParameterName(row.parameter_name), {
      parameterName: row.parameter_name,
      minValue: row.min_value,
      maxValue: row.max_value,
    });
  }
  return bounds;
}

function parseTiedSpecIds(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function queryActiveSpecRows(
  client: QueryClient,
  productId: string,
  referenceType: InspectionReferenceType,
): Promise<LoadedSpecRows[]> {
  const { rows } = await client.query<LoadedSpecRows>(activeSpecParametersSql(2), [
    productId,
    [...specAppliesToCandidates(referenceType)],
  ]);
  return rows;
}

function toActiveSpecBoundsResult(rows: LoadedSpecRows[]): ActiveSpecBoundsResult {
  if (rows.length === 0) return { status: 'none' };

  const tiedCount = rows[0]?.tied_spec_count ?? 0;
  if (tiedCount > 1) {
    return { status: 'ambiguous', specIds: parseTiedSpecIds(rows[0]?.tied_spec_ids ?? null) };
  }

  return {
    status: 'loaded',
    specId: rows[0]!.spec_id,
    bounds: mapBoundsRows(rows),
  };
}

export async function resolveInspectionParameters(
  client: QueryClient,
  input: { productId: string | null; storedParameters: unknown; referenceType?: InspectionReferenceType },
): Promise<InspectionParameterResolution> {
  const stored = parseStoredParameters(input.storedParameters);
  if (stored.length > 0) {
    return { status: 'stored', parameters: stored };
  }

  const productId = input.productId?.trim();
  if (!productId) {
    return { status: 'missing_template', parameters: [] };
  }

  const rows = await queryActiveSpecRows(client, productId, input.referenceType ?? 'lp');
  const loaded = toActiveSpecBoundsResult(rows);
  if (loaded.status !== 'loaded') {
    return { status: 'missing_template', parameters: [] };
  }

  return {
    status: 'resolved',
    specId: loaded.specId,
    parameters: rows.map(mapSpecRow),
  };
}

/** Active spec bounds keyed by normalized parameter name (server trust boundary). */
export async function loadActiveSpecParameterBounds(
  client: QueryClient,
  productId: string,
  referenceType: InspectionReferenceType,
): Promise<ActiveSpecBoundsResult> {
  return toActiveSpecBoundsResult(await queryActiveSpecRows(client, productId, referenceType));
}

export const ACTIVE_SPEC_PARAMETERS_SQL = activeSpecParametersSql(2);
