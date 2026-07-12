/**
 * Resolve editable inspection parameters from the product's active quality spec.
 * Used when quality_inspections.parameters is still [] (new material / no template
 * snapshot on create). Falls back to a clear missing-template signal for the UI.
 */

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

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

type SpecParameterRow = {
  parameter_name: string;
  target_value: string | null;
  min_value: string | null;
  max_value: string | null;
  unit: string | null;
};

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

export async function resolveInspectionParameters(
  client: QueryClient,
  input: { productId: string | null; storedParameters: unknown },
): Promise<InspectionParameterResolution> {
  const stored = parseStoredParameters(input.storedParameters);
  if (stored.length > 0) {
    return { status: 'stored', parameters: stored };
  }

  const productId = input.productId?.trim();
  if (!productId) {
    return { status: 'missing_template', parameters: [] };
  }

  const { rows } = await client.query<{ spec_id: string } & SpecParameterRow>(
    `select qs.id::text as spec_id,
            qsp.parameter_name,
            qsp.target_value::text,
            qsp.min_value::text,
            qsp.max_value::text,
            qsp.unit
       from public.quality_specifications qs
       join public.quality_spec_parameters qsp
         on qsp.specification_id = qs.id
        and qsp.org_id = qs.org_id
      where qs.org_id = app.current_org_id()
        and qs.product_id = $1::uuid
        and qs.status = 'active'
        and qs.applies_to in ('incoming', 'all')
        and (qs.effective_from is null or qs.effective_from <= current_date)
        and (qs.effective_until is null or qs.effective_until >= current_date)
      order by qsp.sort_order asc, qsp.parameter_name asc`,
    [productId],
  );

  if (rows.length === 0) {
    return { status: 'missing_template', parameters: [] };
  }

  const specId = rows[0]!.spec_id;
  return {
    status: 'resolved',
    specId,
    parameters: rows.map(mapSpecRow),
  };
}
