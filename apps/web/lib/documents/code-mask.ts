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

/** Example code for UI hints (seq=1, today's date, sample site). */
export function exampleCodeMask(mask: string, now: Date = new Date()): string {
  return renderCodeMask(mask, { seq: 1, date: now, siteCode: 'S1' });
}

function escapeRegExpLiteral(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert an org code mask (see migration 344) into a RegExp that validates a
 * user-entered product/entity code. Tokens: xxxx = zero-padded digits, [DATE],
 * [YY], [SITE]; everything else is literal.
 */
export function codeMaskToRegExp(mask: string): RegExp {
  let pattern = '';
  for (let i = 0; i < mask.length; ) {
    if (mask.startsWith('[DATE]', i)) {
      pattern += '\\d{8}';
      i += 6;
    } else if (mask.startsWith('[YY]', i)) {
      pattern += '\\d{2}';
      i += 4;
    } else if (mask.startsWith('[SITE]', i)) {
      pattern += '[A-Z0-9]+';
      i += 6;
    } else if (/[xX]/.test(mask[i] ?? '')) {
      let j = i;
      while (j < mask.length && /[xX]/.test(mask[j] ?? '')) j += 1;
      const run = j - i;
      pattern += `\\d{${run}}`;
      i = j;
    } else {
      pattern += escapeRegExpLiteral(mask[i] ?? '');
      i += 1;
    }
  }
  return new RegExp(`^${pattern}$`);
}

export function matchesCodeMask(productCode: string, mask: string): boolean {
  const normalized = productCode.trim().toUpperCase();
  if (!normalized) return false;
  return codeMaskToRegExp(mask).test(normalized);
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
