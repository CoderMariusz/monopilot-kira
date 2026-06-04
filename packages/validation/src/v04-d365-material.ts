import type { QueryClient } from './v03-pack-size.js';

export type D365MaterialStatus = 'Found' | 'NoCost' | 'Missing' | 'Empty';

export type D365MaterialDetail = {
  code: string;
  status: D365MaterialStatus;
  comment?: string | null;
};

export type V04D365MaterialResult = {
  status: D365MaterialStatus;
  details: D365MaterialDetail[];
};

export type V04D365MaterialInput = {
  orgId: string;
  value: string | null | undefined;
};

type D365CacheRow = {
  code: string;
  status: Exclude<D365MaterialStatus, 'Empty'>;
  comment: string | null;
};

const STATUS_RANK: Record<D365MaterialStatus, number> = {
  Empty: 0,
  Found: 1,
  NoCost: 2,
  Missing: 3,
};

function parseCodes(value: string | null | undefined): string[] {
  return Array.from(
    new Set(
      (value ?? '')
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean),
    ),
  );
}

function worstStatus(details: readonly D365MaterialDetail[]): D365MaterialStatus {
  return details.reduce<D365MaterialStatus>(
    (worst, detail) => (STATUS_RANK[detail.status] > STATUS_RANK[worst] ? detail.status : worst),
    'Empty',
  );
}

export async function validateD365Material(
  db: QueryClient,
  input: V04D365MaterialInput,
): Promise<V04D365MaterialResult> {
  const codes = parseCodes(input.value);

  if (codes.length === 0) {
    return {
      status: 'Empty',
      details: [],
    };
  }

  const result = await db.query<D365CacheRow>(
    `select code, status, comment
       from public.d365_import_cache
      where org_id = $1
        and code = any($2::text[])`,
    [input.orgId, codes],
  );

  const rowsByCode = new Map(result.rows.map((row) => [row.code, row]));
  const details = codes.map<D365MaterialDetail>((code) => {
    const row = rowsByCode.get(code);

    if (!row) {
      return {
        code,
        status: 'Empty',
      };
    }

    return {
      code,
      status: row.status,
      comment: row.comment,
    };
  });

  return {
    status: worstStatus(details),
    details,
  };
}
