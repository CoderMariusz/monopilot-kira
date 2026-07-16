type CatalogPeerRow = {
  id: string;
  code: string;
  label: string;
  data_type: string;
};

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

/** Case/punctuation-insensitive key for code and label uniqueness within an org catalog. */
export function normalizeNpdFieldSemanticKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export type NpdFieldCatalogDuplicateError = 'duplicate_code' | 'duplicate_label' | 'semantic_duplicate_label';

export const NPD_FIELD_CATALOG_SEMANTIC_CODE_INDEX = 'npd_field_catalog_active_semantic_code_uidx';
export const NPD_FIELD_CATALOG_SEMANTIC_LABEL_INDEX = 'npd_field_catalog_active_semantic_label_uidx';

export function isPgUniqueViolation(err: unknown): err is { code: string; constraint?: string } {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '23505';
}

export async function mapNpdFieldCatalogPgDuplicate(
  client: QueryClient,
  err: { constraint?: string },
  params: { code: string; label: string; dataType: string },
): Promise<NpdFieldCatalogDuplicateError> {
  const constraint = err.constraint ?? '';
  if (
    constraint === NPD_FIELD_CATALOG_SEMANTIC_CODE_INDEX ||
    constraint === 'npd_field_catalog_org_id_code_key' ||
    constraint.includes('semantic_code')
  ) {
    return 'duplicate_code';
  }

  if (
    constraint === NPD_FIELD_CATALOG_SEMANTIC_LABEL_INDEX ||
    constraint.includes('semantic_label')
  ) {
    const labelKey = normalizeNpdFieldSemanticKey(params.label);
    const { rows } = await client.query<{ data_type: string }>(
      `select data_type
         from public.npd_field_catalog
        where org_id = app.current_org_id()
          and active = true
          and lower(regexp_replace(trim(label), '[^a-z0-9]+', '', 'g')) = $1
        limit 1`,
      [labelKey],
    );
    const peer = rows[0];
    if (peer && peer.data_type !== params.dataType) {
      return 'semantic_duplicate_label';
    }
    return 'duplicate_label';
  }

  return 'duplicate_code';
}

export async function assertNpdFieldCatalogUnique(
  client: QueryClient,
  params: { code: string; label: string; dataType: string; excludeId?: string },
): Promise<void> {
  const { rows } = await client.query<CatalogPeerRow>(
    `select id::text, code, label, data_type
       from public.npd_field_catalog
      where org_id = app.current_org_id()
        and active = true
        and ($1::uuid is null or id <> $1::uuid)`,
    [params.excludeId ?? null],
  );

  const codeKey = normalizeNpdFieldSemanticKey(params.code);
  const labelKey = normalizeNpdFieldSemanticKey(params.label);

  for (const row of rows) {
    if (normalizeNpdFieldSemanticKey(row.code) === codeKey) {
      throw new Error('duplicate_code');
    }
    if (normalizeNpdFieldSemanticKey(row.label) === labelKey) {
      if (row.data_type !== params.dataType) {
        throw new Error('semantic_duplicate_label');
      }
      throw new Error('duplicate_label');
    }
  }
}
