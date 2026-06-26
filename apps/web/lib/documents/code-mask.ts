import type { QueryClient } from './numbering';

type CodeMaskRow = {
  old_seq: string | number;
  code_mask: string | null;
};

function yyyymmdd(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function yy(date: Date): string {
  return String(date.getUTCFullYear()).slice(-2).padStart(2, '0');
}

export function renderCodeMask(
  mask: string,
  opts: { seq: number; date?: Date; siteCode?: string | null },
): string {
  return mask.replace(/\[DATE\]|\[YY\]|\[SITE\]|[xX]{2,}/g, (token) => {
    if (token === '[DATE]') return opts.date ? yyyymmdd(opts.date) : '';
    if (token === '[YY]') return opts.date ? yy(opts.date) : '';
    if (token === '[SITE]') return opts.siteCode ?? '';
    return String(opts.seq).padStart(token.length, '0');
  });
}

async function updateAndReturnOldSequence(
  client: QueryClient,
  orgId: string,
  docType: string,
): Promise<CodeMaskRow | null> {
  const { rows } = await client.query<CodeMaskRow>(
    `update public.org_document_settings
        set next_seq = next_seq + 1
      where org_id = $1::uuid
        and doc_type = $2
      returning next_seq - 1 as old_seq, code_mask`,
    [orgId, docType],
  );
  return rows[0] ?? null;
}

export async function nextEntityCode(
  client: QueryClient,
  orgId: string,
  docType: string,
  opts?: { siteCode?: string | null; now?: Date },
): Promise<string> {
  const row = await updateAndReturnOldSequence(client, orgId, docType);
  if (!row) throw new Error(`entity_code_settings_missing:${docType}`);
  if (row.code_mask === null) throw new Error(`entity_code_mask_missing:${docType}`);

  return renderCodeMask(row.code_mask, {
    seq: Number(row.old_seq),
    date: opts?.now ?? new Date(),
    siteCode: opts?.siteCode,
  });
}
