export type DocumentType = 'po' | 'to' | 'wo';

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type NumberingRow = {
  old_seq: string | number;
  number_prefix: string;
  number_date_part: 'none' | 'YYYY' | 'YYYYMM' | 'YYYYMMDD';
  number_seq_padding: string | number;
};

const DEFAULTS: Record<DocumentType, { prefix: string; datePart: NumberingRow['number_date_part']; padding: number }> = {
  po: { prefix: 'PO', datePart: 'YYYYMM', padding: 4 },
  to: { prefix: 'TO', datePart: 'YYYYMM', padding: 4 },
  wo: { prefix: 'WO', datePart: 'YYYYMM', padding: 4 },
};

function datePartFor(now: Date, format: NumberingRow['number_date_part']): string | null {
  if (format === 'none') return null;
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  if (format === 'YYYY') return year;
  if (format === 'YYYYMM') return `${year}${month}`;
  return `${year}${month}${day}`;
}

function composeNumber(row: NumberingRow, now: Date): string {
  const prefix = row.number_prefix.trim();
  const datePart = datePartFor(now, row.number_date_part);
  const padded = String(row.old_seq).padStart(Number(row.number_seq_padding), '0');
  return [prefix, datePart, padded].filter((part): part is string => !!part).join('-');
}

async function updateAndReturnOldSequence(
  client: QueryClient,
  orgId: string,
  docType: DocumentType,
): Promise<NumberingRow | null> {
  const { rows } = await client.query<NumberingRow>(
    `update public.org_document_settings
        set next_seq = next_seq + 1
      where org_id = $1::uuid
        and doc_type = $2
      returning next_seq - 1 as old_seq, number_prefix, number_date_part, number_seq_padding`,
    [orgId, docType],
  );
  return rows[0] ?? null;
}

async function insertDefaultSettings(client: QueryClient, orgId: string, docType: DocumentType): Promise<void> {
  const defaults = DEFAULTS[docType];
  await client.query(
    `insert into public.org_document_settings
       (org_id, doc_type, number_prefix, number_date_part, number_seq_padding, archive_after_days)
     values
       ($1::uuid, $2, $3, $4, $5::integer, 30)
     on conflict (org_id, doc_type) do nothing`,
    [orgId, docType, defaults.prefix, defaults.datePart, defaults.padding],
  );
}

export async function nextDocumentNumber(
  client: QueryClient,
  orgId: string,
  docType: DocumentType,
  now: Date,
): Promise<string> {
  const row = await updateAndReturnOldSequence(client, orgId, docType);
  if (row) return composeNumber(row, now);

  await insertDefaultSettings(client, orgId, docType);
  const retryRow = await updateAndReturnOldSequence(client, orgId, docType);
  if (!retryRow) throw new Error(`document_number_settings_missing:${docType}`);
  return composeNumber(retryRow, now);
}
