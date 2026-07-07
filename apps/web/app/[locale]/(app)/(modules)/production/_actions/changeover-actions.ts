'use server';

import type pg from 'pg';

import { signEvent } from '@monopilot/e-sign';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  DEFAULT_CHANGEOVER_PAGE_SIZE,
  normalizePage,
  toPaginatedResult,
  type PaginatedResult,
} from '../../../../../../lib/shared/pagination';
import { type ProductionContext, hasPermission } from '../../../../../../lib/production/shared';

const CHANGEOVER_WRITE_PERMISSION = 'production.changeover.write';
const CHANGEOVER_SIGN_FIRST_PERMISSION = 'production.allergen_gate.sign_first';
const CHANGEOVER_SIGN_SECOND_PERMISSION = 'production.allergen_gate.sign_second';
const SIGNOFF_TYPE = 'production.changeover.allergen';
const ESIGN_INTENT = 'production.changeover.signoff';

type QueryClient = ProductionContext['client'];
type SignOffStatus = 'pending' | 'first_signed' | 'complete';

type ProductSummary = {
  id: string | null;
  code: string | null;
  name: string | null;
};

type SignerSummary = {
  id: string;
  name: string | null;
  email: string | null;
  signedAt: string;
};

type ChangeoverRow = {
  id: string;
  lineId: string;
  lineCode: string | null;
  woId: string | null;
  woNumber: string | null;
  fromProduct: ProductSummary;
  toProduct: ProductSummary;
  allergenRisk: { level: string; from: string[]; to: string[]; summary: string };
  cleaningCompleted: boolean;
  atpResult: unknown;
  dualSignOffStatus: SignOffStatus;
  firstSigner: SignerSummary | null;
  secondSigner: SignerSummary | null;
  createdAt: string;
};

type RawChangeoverRow = {
  id: string;
  line_id: string;
  line_code: string | null;
  wo_id: string | null;
  wo_number: string | null;
  from_product_id: string | null;
  from_product_code: string | null;
  from_product_name: string | null;
  to_product_id: string | null;
  to_product_code: string | null;
  to_product_name: string | null;
  allergen_from: string[] | null;
  allergen_to: string[] | null;
  risk_level: string;
  cleaning_completed: boolean;
  atp_result: unknown;
  dual_sign_off_status: string;
  first_signer: string | null;
  first_signer_name: string | null;
  first_signer_email: string | null;
  first_signed_at: string | Date | null;
  second_signer: string | null;
  second_signer_name: string | null;
  second_signer_email: string | null;
  second_signed_at: string | Date | null;
  created_at: string | Date;
};

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapStatus(value: string | null | undefined): SignOffStatus {
  if (value === 'first_signed') return 'first_signed';
  if (value === 'complete' || value === 'completed') return 'complete';
  return 'pending';
}

function mapRow(row: RawChangeoverRow): ChangeoverRow {
  const from = Array.isArray(row.allergen_from) ? row.allergen_from : [];
  const to = Array.isArray(row.allergen_to) ? row.allergen_to : [];
  const firstSignedAt = toIso(row.first_signed_at);
  const secondSignedAt = toIso(row.second_signed_at);

  return {
    id: row.id,
    lineId: row.line_id,
    lineCode: row.line_code,
    woId: row.wo_id,
    woNumber: row.wo_number,
    fromProduct: {
      id: row.from_product_id,
      code: row.from_product_code,
      name: row.from_product_name,
    },
    toProduct: {
      id: row.to_product_id,
      code: row.to_product_code,
      name: row.to_product_name,
    },
    allergenRisk: {
      level: row.risk_level,
      from,
      to,
      summary: `${row.risk_level}: ${from.join(', ') || 'none'} -> ${to.join(', ') || 'none'}`,
    },
    cleaningCompleted: Boolean(row.cleaning_completed),
    atpResult: row.atp_result,
    dualSignOffStatus: mapStatus(row.dual_sign_off_status),
    firstSigner:
      row.first_signer && firstSignedAt
        ? {
            id: row.first_signer,
            name: row.first_signer_name,
            email: row.first_signer_email,
            signedAt: firstSignedAt,
          }
        : null,
    secondSigner:
      row.second_signer && secondSignedAt
        ? {
            id: row.second_signer,
            name: row.second_signer_name,
            email: row.second_signer_email,
            signedAt: secondSignedAt,
          }
        : null,
    createdAt: toIso(row.created_at) ?? String(row.created_at),
  };
}

async function loadChangeoverRow(client: QueryClient, changeoverId: string): Promise<ChangeoverRow | null> {
  const result = await client.query<RawChangeoverRow>(
    `select ce.id::text,
            ce.line_id,
            pl.code as line_code,
            ce.wo_to_id::text as wo_id,
            wt.wo_number,
            coalesce(wf.product_id::text, ce.ext_jsonb->>'fromProductId') as from_product_id,
            ifrom.item_code as from_product_code,
            ifrom.name as from_product_name,
            coalesce(wt.product_id::text, ce.ext_jsonb->>'toProductId') as to_product_id,
            ito.item_code as to_product_code,
            ito.name as to_product_name,
            ce.allergen_from,
            ce.allergen_to,
            ce.risk_level,
            ce.cleaning_completed,
            ce.atp_result,
            ce.dual_sign_off_status,
            ce.first_signer::text,
            u1.display_name as first_signer_name,
            u1.email::text as first_signer_email,
            ce.first_signed_at,
            ce.second_signer::text,
            u2.display_name as second_signer_name,
            u2.email::text as second_signer_email,
            ce.second_signed_at,
            ce.created_at
       from public.changeover_events ce
       left join public.production_lines pl
         on pl.org_id = ce.org_id and (pl.id::text = ce.line_id or pl.code = ce.line_id)
       left join public.work_orders wf
         on wf.org_id = ce.org_id and wf.id = ce.wo_from_id
       left join public.work_orders wt
         on wt.org_id = ce.org_id and wt.id = ce.wo_to_id
       left join public.items ifrom
         on ifrom.org_id = ce.org_id and ifrom.id = coalesce(wf.product_id::text, ce.ext_jsonb->>'fromProductId')::uuid
       left join public.items ito
         on ito.org_id = ce.org_id and ito.id = coalesce(wt.product_id::text, ce.ext_jsonb->>'toProductId')::uuid
       left join public.users u1
         on u1.org_id = ce.org_id and u1.id = ce.first_signer
       left join public.users u2
         on u2.org_id = ce.org_id and u2.id = ce.second_signer
      where ce.org_id = app.current_org_id()
        and ce.id = $1::uuid
      limit 1`,
    [changeoverId],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

async function hasRole(client: QueryClient, userId: string, orgId: string, roleId: string): Promise<boolean> {
  const result = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and ur.role_id = $3::uuid
      limit 1`,
    [userId, orgId, roleId],
  );
  return result.rows.length > 0;
}

function normalizeAllergens(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function riskLevel(from: string[], to: string[]): 'low' | 'medium' | 'high' {
  const fromSet = new Set(from.map((entry) => entry.toLowerCase()));
  const toSet = new Set(to.map((entry) => entry.toLowerCase()));
  const introduced = [...toSet].filter((entry) => !fromSet.has(entry));
  if (introduced.length === 0) return 'low';
  return fromSet.size === 0 ? 'high' : 'medium';
}

type ResolvedLine = { id: string; code: string | null; siteId: string | null };

/**
 * C4/F1 (write side) — resolve a caller-supplied line key (production_lines UUID
 * OR code) to the canonical production_lines row. changeover_events.line_id is
 * TEXT; persisting anything but production_lines.id::text re-opens the
 * line-identity gate bypass, so every write resolves through here first.
 */
async function resolveProductionLine(client: QueryClient, lineKey: string): Promise<ResolvedLine | null> {
  const result = await client.query<{ id: string; code: string | null; site_id: string | null }>(
    `select pl.id::text, pl.code, pl.site_id::text
       from public.production_lines pl
      where pl.org_id = app.current_org_id()
        and (pl.id::text = $1 or pl.code = $1)
      order by (pl.id::text = $1) desc
      limit 1`,
    [lineKey],
  );
  const row = result.rows[0];
  return row ? { id: row.id, code: row.code, siteId: row.site_id } : null;
}

const RISK_SEVERITY: Record<string, number> = { low: 0, medium: 1, high: 2, segregated: 3 };

/**
 * C4/F3c — planned-changeover matrix lookup (migration 204).
 *
 * Lookup key: the org's ACTIVE changeover_matrix_versions row (is_active=true,
 * unique per org) → changeover_matrix rows where
 *   allergen_from = any(<from-product allergen profile>)
 *   AND allergen_to = any(<to-product allergen profile>)
 *   AND (line_id IS NULL                                  -- org-default row
 *        OR line_id = <resolved production_lines.id::text>
 *        OR line_id = <production_lines.code>)            -- per-line override (D5)
 * Per (allergen_from, allergen_to) pair a line-specific row overrides the org
 * default; across pairs the HIGHEST severity wins (segregated > high > medium >
 * low). No active version / no matching pair → null → heuristic fallback.
 */
async function matrixRiskLevel(
  client: QueryClient,
  line: ResolvedLine,
  from: string[],
  to: string[],
): Promise<string | null> {
  if (from.length === 0 || to.length === 0) return null;
  const lineKeys = [line.id, ...(line.code ? [line.code] : [])];
  const result = await client.query<{
    allergen_from: string;
    allergen_to: string;
    line_id: string | null;
    risk_level: string;
  }>(
    `select cm.allergen_from, cm.allergen_to, cm.line_id, cm.risk_level
       from public.changeover_matrix cm
       join public.changeover_matrix_versions cmv
         on cmv.org_id = cm.org_id and cmv.id = cm.version_id and cmv.is_active = true
      where cm.org_id = app.current_org_id()
        and (cm.line_id is null or cm.line_id = any($1::text[]))
        and cm.allergen_from = any($2::text[])
        and cm.allergen_to = any($3::text[])`,
    [lineKeys, from, to],
  );
  if (result.rows.length === 0) return null;

  const byPair = new Map<string, { lineSpecific: boolean; risk: string }>();
  for (const entry of result.rows) {
    const key = `${entry.allergen_from} ${entry.allergen_to}`;
    const lineSpecific = entry.line_id != null;
    const existing = byPair.get(key);
    if (!existing || (lineSpecific && !existing.lineSpecific)) {
      byPair.set(key, { lineSpecific, risk: entry.risk_level });
    }
  }
  let best: string | null = null;
  for (const { risk } of byPair.values()) {
    if (best === null || (RISK_SEVERITY[risk] ?? 0) > (RISK_SEVERITY[best] ?? 0)) best = risk;
  }
  return best;
}

/**
 * C4/F3b — 'pass-ish' ATP read for the completion validation row: null means no
 * ATP test was required (passes); an object with an explicit fail marker
 * (result/status/outcome ~ 'fail*', pass:false, passed:false) fails; anything
 * else passes.
 */
function atpPassish(atp: unknown): boolean {
  if (atp == null) return true;
  if (typeof atp === 'object') {
    const o = atp as Record<string, unknown>;
    const verdict = o.result ?? o.status ?? o.outcome;
    if (typeof verdict === 'string') return !/fail/i.test(verdict);
    if (typeof o.pass === 'boolean') return o.pass;
    if (typeof o.passed === 'boolean') return o.passed;
  }
  return true;
}

async function productAllergens(client: QueryClient, productId: string | null | undefined): Promise<string[]> {
  if (!productId) return [];
  const result = await client.query<{ allergens: string[] | null }>(
    `select array(
              select jsonb_array_elements_text(
                coalesce(
                  nullif(i.ext_jsonb->'allergens', 'null'::jsonb),
                  nullif(i.private_jsonb->'allergens', 'null'::jsonb),
                  '[]'::jsonb
                )
              )
            ) as allergens
       from public.items i
      where i.org_id = app.current_org_id()
        and i.id = $1::uuid
      limit 1`,
    [productId],
  );
  return normalizeAllergens(result.rows[0]?.allergens);
}

export async function listChangeovers(input: {
  lineId?: string;
  status?: string;
  page?: number;
  offset?: number;
  limit?: number;
} = {}) {
  const page = normalizePage({
    page: input.page,
    offset: input.offset,
    limit: input.limit,
    defaultLimit: DEFAULT_CHANGEOVER_PAGE_SIZE,
    maxLimit: 200,
  });

  return withOrgContext(async ({ client }) => {
    const status = input.status === 'complete' ? 'complete' : input.status;
    const baseParams = [input.lineId ?? null, status ?? null] as const;

    const [countResult, dataResult] = await Promise.all([
      client.query<{ total: number }>(
        `select count(*)::int as total
           from public.changeover_events ce
          where ce.org_id = app.current_org_id()
            and ($1::text is null or ce.line_id = $1)
            and ($2::text is null or ce.dual_sign_off_status = $2)`,
        [...baseParams],
      ),
      client.query<RawChangeoverRow>(
      `select ce.id::text,
              ce.line_id,
              pl.code as line_code,
              ce.wo_to_id::text as wo_id,
              wt.wo_number,
              coalesce(wf.product_id::text, ce.ext_jsonb->>'fromProductId') as from_product_id,
              ifrom.item_code as from_product_code,
              ifrom.name as from_product_name,
              coalesce(wt.product_id::text, ce.ext_jsonb->>'toProductId') as to_product_id,
              ito.item_code as to_product_code,
              ito.name as to_product_name,
              ce.allergen_from,
              ce.allergen_to,
              ce.risk_level,
              ce.cleaning_completed,
              ce.atp_result,
              ce.dual_sign_off_status,
              ce.first_signer::text,
              u1.display_name as first_signer_name,
              u1.email::text as first_signer_email,
              ce.first_signed_at,
              ce.second_signer::text,
              u2.display_name as second_signer_name,
              u2.email::text as second_signer_email,
              ce.second_signed_at,
              ce.created_at
         from public.changeover_events ce
         left join public.production_lines pl
           on pl.org_id = ce.org_id and (pl.id::text = ce.line_id or pl.code = ce.line_id)
         left join public.work_orders wf
           on wf.org_id = ce.org_id and wf.id = ce.wo_from_id
         left join public.work_orders wt
           on wt.org_id = ce.org_id and wt.id = ce.wo_to_id
         left join public.items ifrom
           on ifrom.org_id = ce.org_id and ifrom.id = coalesce(wf.product_id::text, ce.ext_jsonb->>'fromProductId')::uuid
         left join public.items ito
           on ito.org_id = ce.org_id and ito.id = coalesce(wt.product_id::text, ce.ext_jsonb->>'toProductId')::uuid
         left join public.users u1
           on u1.org_id = ce.org_id and u1.id = ce.first_signer
         left join public.users u2
           on u2.org_id = ce.org_id and u2.id = ce.second_signer
        where ce.org_id = app.current_org_id()
          and ($1::text is null or ce.line_id = $1)
          and ($2::text is null or ce.dual_sign_off_status = $2)
        order by ce.created_at desc, ce.id desc
        limit $3::int offset $4::int`,
      [...baseParams, page.limit, page.offset],
      ),
    ]);

    const pagination: PaginatedResult<ChangeoverRow> = toPaginatedResult(
      dataResult.rows.map(mapRow),
      Number(countResult.rows[0]?.total ?? 0),
      page,
    );

    return { ok: true as const, rows: pagination.items, pagination };
  });
}

export async function createChangeoverEvent(input: {
  lineId: string;
  woId?: string;
  fromProductId?: string;
  toProductId: string;
  cleaningCompleted: boolean;
  atpResult?: unknown;
  notes?: string;
}) {
  return withOrgContext(async (ctx) => {
    const pctx = ctx as ProductionContext;
    if (!(await hasPermission(pctx, CHANGEOVER_WRITE_PERMISSION))) {
      return { ok: false as const, error: 'forbidden' as const };
    }

    // C4/F1 (write side): resolve lineId (uuid OR code) through production_lines
    // and ALWAYS persist production_lines.id::text — never the raw caller key.
    const line = await resolveProductionLine(ctx.client, input.lineId);
    if (!line) {
      return {
        ok: false as const,
        error: 'not_found' as const,
        message: 'production line not found for lineId (expected a production_lines uuid or code)',
      };
    }

    const wo = input.woId
      ? await ctx.client.query<{ production_line_id: string | null; product_id: string | null; site_id: string | null }>(
          `select production_line_id::text, product_id::text, site_id::text
             from public.work_orders
            where org_id = app.current_org_id()
              and id = $1::uuid
            limit 1`,
          [input.woId],
        )
      : { rows: [] };
    const woRow = wo.rows[0];
    const from = await productAllergens(ctx.client, input.fromProductId);
    const to = await productAllergens(ctx.client, input.toProductId);
    // C4/F3c: the planned changeover_matrix (active version, line override) wins
    // when a row exists for the allergen pair; the heuristic is the fallback only.
    const matrixRisk = await matrixRiskLevel(ctx.client, line, from, to);
    const risk = matrixRisk ?? riskLevel(from, to);

    const inserted = await ctx.client.query<{ id: string }>(
      // C4/F5: site_id from production_lines.site_id (migration 268), falling
      // back to the WO's site_id, so the completion validation row isn't site-blind.
      `insert into public.changeover_events
         (org_id, site_id, line_id, wo_to_id, allergen_from, allergen_to, risk_level,
          started_at, cleaning_completed, atp_required, atp_result, ext_jsonb)
       values
         (app.current_org_id(), $1::uuid, $2::text, $3::uuid, $4::text[], $5::text[],
          $6, now(), $7::boolean, $8::boolean, $9::jsonb, $10::jsonb)
       returning id::text`,
      [
        line.siteId ?? woRow?.site_id ?? null,
        line.id,
        input.woId ?? null,
        from,
        to,
        risk,
        input.cleaningCompleted,
        input.atpResult != null,
        input.atpResult == null ? null : JSON.stringify(input.atpResult),
        JSON.stringify({
          notes: input.notes ?? null,
          fromProductId: input.fromProductId ?? null,
          toProductId: input.toProductId,
          riskSource: matrixRisk ? 'matrix' : 'heuristic',
        }),
      ],
    );
    const id = inserted.rows[0]?.id;
    if (!id) return { ok: false as const, error: 'persistence_failed' as const };
    const row = await loadChangeoverRow(ctx.client, id);
    return { ok: true as const, row };
  });
}

export async function signChangeover(input: { changeoverId: string; signature: { password: string } }) {
  return withOrgContext(async (ctx) => {
    const policyResult = await ctx.client.query<{
      required_signatures: number;
      first_signer_role_id: string | null;
      second_signer_role_id: string | null;
      allow_same_user: boolean;
    }>(
      `select required_signatures, first_signer_role_id::text, second_signer_role_id::text, allow_same_user
         from public.signoff_policies
        where org_id = app.current_org_id()
          and signoff_type = $1
          and is_active = true
        limit 1`,
      [SIGNOFF_TYPE],
    );
    const policy = policyResult.rows[0] ?? {
      required_signatures: 2,
      first_signer_role_id: null,
      second_signer_role_id: null,
      allow_same_user: false,
    };

    // Row-lock (FOR UPDATE) serializes concurrent signers inside the org txn:
    // the second concurrent signer re-reads the row AFTER the first commit, so
    // the mapStatus(...)==='complete' early-return below makes a replayed or
    // racing completion idempotent-reject (invalid_state, no duplicate
    // allergen_changeover_validations row). Not modelable in the pg mock — see
    // the skip-noted stub in changeover-actions.test.ts.
    const locked = await ctx.client.query<{
      id: string;
      site_id: string | null;
      line_id: string;
      wo_to_id: string | null;
      allergen_from: string[] | null;
      allergen_to: string[] | null;
      risk_level: string;
      cleaning_completed: boolean;
      atp_result: unknown;
      dual_sign_off_status: string;
      first_signer: string | null;
      first_signed_at: string | Date | null;
      second_signer: string | null;
      second_signed_at: string | Date | null;
    }>(
      `select id::text, site_id::text, line_id, wo_to_id::text, allergen_from, allergen_to, risk_level,
              cleaning_completed, atp_result, dual_sign_off_status, first_signer::text,
              first_signed_at, second_signer::text, second_signed_at
         from public.changeover_events
        where org_id = app.current_org_id()
          and id = $1::uuid
        for update`,
      [input.changeoverId],
    );
    const current = locked.rows[0];
    if (!current) return { ok: false as const, error: 'not_found' as const };
    if (mapStatus(current.dual_sign_off_status) === 'complete') {
      return { ok: false as const, error: 'invalid_state' as const };
    }

    const firstSlot = !current.first_signer;
    const roleId = firstSlot ? policy.first_signer_role_id : policy.second_signer_role_id;
    const permission = firstSlot ? CHANGEOVER_SIGN_FIRST_PERMISSION : CHANGEOVER_SIGN_SECOND_PERMISSION;
    if (roleId) {
      if (!(await hasRole(ctx.client, ctx.userId, ctx.orgId, roleId))) {
        return { ok: false as const, error: 'wrong_role' as const };
      }
    } else if (!(await hasPermission(ctx as ProductionContext, permission))) {
      return { ok: false as const, error: 'forbidden' as const };
    }

    if (!firstSlot && !policy.allow_same_user && current.first_signer?.toLowerCase() === ctx.userId.toLowerCase()) {
      return { ok: false as const, error: 'same_user_rejected' as const };
    }

    // C4/F3a — completion gate: the signature that would COMPLETE the changeover
    // requires cleaning_completed=true. The first signature may proceed
    // regardless (sign-as-you-go); only completion is gated. Checked BEFORE
    // signEvent so a rejected completion mutates nothing (no e-sign row either).
    const nextStatus: SignOffStatus =
      firstSlot && Number(policy.required_signatures) > 1 ? 'first_signed' : 'complete';
    if (nextStatus === 'complete' && !current.cleaning_completed) {
      return {
        ok: false as const,
        error: 'cleaning_incomplete' as const,
        message: 'cleaning must be completed before the final changeover sign-off',
      };
    }

    let receipt;
    try {
      receipt = await signEvent(
        {
          signerUserId: ctx.userId,
          pin: input.signature.password,
          intent: ESIGN_INTENT,
          subject: {
            changeoverId: input.changeoverId,
            slot: firstSlot ? 'first' : 'second',
            lineId: current.line_id,
            riskLevel: current.risk_level,
          },
          nonce: `${input.changeoverId}:${firstSlot ? 'first' : 'second'}:${ctx.userId}`,
          reason: firstSlot ? 'First allergen changeover sign-off' : 'Second allergen changeover sign-off',
        },
        { client: ctx.client as unknown as pg.PoolClient },
      );
    } catch (error) {
      return {
        ok: false as const,
        error: 'esign_failed' as const,
        message: error instanceof Error ? error.name : 'esign_failed',
      };
    }

    const updated = await ctx.client.query<{ id: string }>(
      firstSlot
        ? `update public.changeover_events
              set first_signer = $2::uuid,
                  first_signed_at = now(),
                  dual_sign_off_status = $3
            where org_id = app.current_org_id()
              and id = $1::uuid
            returning id::text`
        : `update public.changeover_events
              set second_signer = $2::uuid,
                  second_signed_at = now(),
                  dual_sign_off_status = $3,
                  completed_at = coalesce(completed_at, now())
            where org_id = app.current_org_id()
              and id = $1::uuid
            returning id::text`,
      [input.changeoverId, ctx.userId, nextStatus],
    );
    if (!updated.rows[0]) return { ok: false as const, error: 'persistence_failed' as const };

    if (nextStatus === 'complete') {
      const signatures = [
        {
          signerUserId: current.first_signer ?? ctx.userId,
          signedAt: toIso(current.first_signed_at) ?? receipt.signedAt,
          slot: 'first',
        },
        {
          signerUserId: ctx.userId,
          signedAt: receipt.signedAt,
          slot: firstSlot ? 'first' : 'second',
        },
      ];
      // C4/F3b — validation_result derives from actual state, never a literal:
      // cleaning_completed && ATP pass-ish → 'passed'. With the F3a completion
      // gate above, a 'failed' insert is unreachable today (cleaning is forced
      // true and an explicit ATP fail would still record honestly) — the
      // derivation stays explicit so the evidence row can never silently lie.
      const validationResult =
        current.cleaning_completed && atpPassish(current.atp_result) ? 'passed' : 'failed';
      await ctx.client.query(
        `insert into public.allergen_changeover_validations
           (org_id, site_id, changeover_event_id, validation_result, risk_level,
            cleaning_evidence, atp_evidence, signatures, retention_until)
         values
           (app.current_org_id(), $1::uuid, $2::uuid, $3, $4,
            $5::jsonb, $6::jsonb, $7::jsonb, null)`,
        [
          current.site_id,
          input.changeoverId,
          validationResult,
          current.risk_level,
          JSON.stringify({ cleaningCompleted: current.cleaning_completed }),
          current.atp_result == null ? null : JSON.stringify(current.atp_result),
          JSON.stringify(signatures),
        ],
      );
    }

    const row = await loadChangeoverRow(ctx.client, input.changeoverId);
    return { ok: true as const, row };
  });
}
