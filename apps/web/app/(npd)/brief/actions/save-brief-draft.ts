'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = {
  orgId: string;
  userId: string;
  client: QueryClient;
};
type BriefTemplate = 'single_component' | 'multi_component';
type BriefDraftLine = {
  lineType: 'product' | 'component' | 'summary';
  lineIndex: number;
  product: string | null;
  volume: string | null;
  devCode: string | null;
  component: string | null;
  sliceCount: number | null;
  supplier: string | null;
  code: string | null;
  price: string | null;
  weights: string | null;
  pct: string | null;
  packsPerCase: number | null;
  comments: string | null;
};

export type SaveBriefDraftFields = {
  productName?: string | null;
  volume?: string | number | null;
  lines?: Array<Partial<BriefDraftLine>>;
};

export type SaveBriefDraftResult = {
  ok: true;
  briefId: string;
  linesSaved: number;
};

const uuidSchema = z.string().uuid();
const optionalTextSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => normalizeOptionalText(value, 500));
const decimalInputSchema = z.union([z.string(), z.number(), z.null(), z.undefined()]);
const lineSchema = z.object({
  lineType: z.enum(['product', 'component', 'summary']),
  lineIndex: z.number().int().nonnegative(),
  product: optionalTextSchema,
  volume: decimalInputSchema.transform((value) => normalizeOptionalDecimal(value, 'VOLUME_POSITIVE')),
  devCode: optionalTextSchema,
  component: optionalTextSchema,
  sliceCount: z.number().int().nonnegative().nullable().optional().transform((value) => value ?? null),
  supplier: optionalTextSchema,
  code: optionalTextSchema,
  price: optionalTextSchema,
  weights: decimalInputSchema.transform((value) => normalizeOptionalNonnegativeDecimal(value, 'WEIGHT_POSITIVE')),
  pct: decimalInputSchema.transform((value) => normalizeOptionalNonnegativeDecimal(value, 'PCT_POSITIVE')),
  packsPerCase: z.number().int().positive().nullable().optional().transform((value) => value ?? null),
  comments: optionalTextSchema,
});
const fieldsSchema = z.object({
  productName: optionalTextSchema,
  volume: decimalInputSchema.transform((value) => normalizeOptionalDecimal(value, 'VOLUME_POSITIVE')),
  lines: z.array(lineSchema).optional().default([]),
});

export async function saveBriefDraft(briefId: string, fields: SaveBriefDraftFields): Promise<SaveBriefDraftResult> {
  const parsedBriefId = uuidSchema.safeParse(briefId);
  if (!parsedBriefId.success) throw new ValidationError('BRIEF_ID_INVALID');

  let parsedFields: z.infer<typeof fieldsSchema>;
  try {
    parsedFields = fieldsSchema.parse(fields);
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('INVALID_FIELDS');
  }

  return withOrgContext<SaveBriefDraftResult>(async (ctx) => {
    const context = ctx as OrgContextLike;
    const brief = await loadBrief(context.client, parsedBriefId.data);
    if (!brief) throw new ValidationError('BRIEF_NOT_FOUND');

    validateWeightInvariant(brief.template, parsedFields.lines);

    await context.client.query(
      `update public.brief
          set product_name = $1,
              volume = $2::numeric
        where brief_id = $3::uuid
          and org_id = app.current_org_id()`,
      [parsedFields.productName, parsedFields.volume, parsedBriefId.data],
    );

    await context.client.query(
      `delete from public.brief_lines
        where brief_id = $1::uuid
          and org_id = app.current_org_id()`,
      [parsedBriefId.data],
    );

    for (const line of parsedFields.lines) {
      await insertLine(context.client, parsedBriefId.data, line);
    }

    safeRevalidatePath(`/npd/brief/${parsedBriefId.data}`);
    return { ok: true, briefId: parsedBriefId.data, linesSaved: parsedFields.lines.length };
  });
}

async function loadBrief(client: QueryClient, briefId: string): Promise<{ template: BriefTemplate } | null> {
  const { rows } = await client.query<{ template: BriefTemplate }>(
    `select template
       from public.brief
      where brief_id = $1::uuid
        and org_id = app.current_org_id()
      limit 1`,
    [briefId],
  );
  return rows[0] ?? null;
}

async function insertLine(client: QueryClient, briefId: string, line: BriefDraftLine): Promise<void> {
  await client.query(
    `insert into public.brief_lines
       (brief_id, org_id, line_type, line_index, product, volume, component, weights,
        dev_code, slice_count, supplier, code, price, pct, packs_per_case, comments)
     values
       ($1::uuid, app.current_org_id(), $2, $3::integer, $4, $5::numeric, $6, $7::numeric,
        $8, $9::integer, $10, $11, $12, $13::numeric, $14::integer, $15)`,
    [
      briefId,
      line.lineType,
      line.lineIndex,
      line.product,
      line.volume,
      line.component,
      line.weights,
      line.devCode,
      line.sliceCount,
      line.supplier,
      line.code,
      line.price,
      line.pct,
      line.packsPerCase,
      line.comments,
    ],
  );
}

function validateWeightInvariant(template: BriefTemplate, lines: BriefDraftLine[]): void {
  if (template !== 'multi_component') return;

  const summaryWeights = lines
    .filter((line) => line.lineType === 'summary' && line.weights !== null)
    .map((line) => parseDecimalToMicros(line.weights as string));
  if (summaryWeights.length === 0) return;

  const summaryWeight = summaryWeights[0]!;
  const componentTotal = lines
    .filter((line) => line.lineType === 'component' && line.weights !== null)
    .reduce((total, line) => total + parseDecimalToMicros(line.weights as string), 0n);

  const diff = absBigInt(summaryWeight - componentTotal);
  const tolerance = summaryWeight / 100n;
  if (diff > tolerance) throw new ValidationError('WEIGHT_MISMATCH');
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new ValidationError('TEXT_TOO_LONG');
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalDecimal(value: string | number | null | undefined, code: string): string | null {
  const normalized = normalizeDecimalString(value);
  if (normalized === null) return null;
  if (parseDecimalToMicros(normalized) <= 0n) throw new ValidationError(code);
  return normalized;
}

function normalizeOptionalNonnegativeDecimal(value: string | number | null | undefined, code: string): string | null {
  const normalized = normalizeDecimalString(value);
  if (normalized === null) return null;
  if (parseDecimalToMicros(normalized) < 0n) throw new ValidationError(code);
  return normalized;
}

function normalizeDecimalString(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ValidationError('DECIMAL_INVALID');
    return String(value);
  }
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) throw new ValidationError('DECIMAL_INVALID');
  return trimmed;
}

function parseDecimalToMicros(value: string): bigint {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ''] = unsigned.split('.');
  const micros = BigInt(whole) * 1_000_000n + BigInt((fraction.padEnd(6, '0').slice(0, 6) || '0'));
  return negative ? -micros : micros;
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}

class ValidationError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = 'ValidationError';
    this.code = code;
  }
}
