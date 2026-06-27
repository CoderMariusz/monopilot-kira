import type { Pool, PoolClient } from 'pg';

export type Chain1Options = {
  pool: Pool;
  sessionToken: string;
  orgId: string;
};

export type PackSizeCascadeResult = {
  productCode: string;
  previousPackSize: string | null;
  newPackSize: string | null;
  cleared: Array<'line' | 'equipment_setup'>;
  changed: boolean;
};

export type LineCascadeResult = {
  productCode: string;
  packSize: string | null;
  previousLine: string | null;
  newLine: string | null;
  equipmentSetup: string | null;
  changed: boolean;
};

type ProductRow = {
  product_code: string;
  pack_size: string | null;
  line: string | null;
};

type EquipmentSetupRow = {
  equipment_setup: string;
};

function normalizeText(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function loadProduct(client: PoolClient, productCode: string): Promise<ProductRow> {
  // product→items merge (mig 359, §8f finding #1): once public.product is a VIEW over items ⨝ fg_npd_ext,
  // `… FROM public.product … FOR UPDATE` raises "cannot lock rows in a view" (and pack_size/line now live
  // on fg_npd_ext). Acquire the row lock on the canonical base row (public.items) — that serializes the
  // pack-size/line cascade per FG exactly as the old FOR UPDATE did — then read pack_size/line through the
  // product view (its column shape is unchanged). The lock is best-effort so a not-yet-twinned FG in the
  // pre-cut window still falls through to the product_not_found check below.
  await client.query(
    `
      select i.id
      from public.items i
      where i.item_code = $1
        and i.org_id = app.current_org_id()
      for update
    `,
    [productCode],
  );

  const result = await client.query<ProductRow>(
    `
      select product_code, pack_size, line
      from public.product
      where product_code = $1
    `,
    [productCode],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('product_not_found');
  }
  return row;
}

async function emitCascadeEvent(
  client: PoolClient,
  productCode: string,
  payload: Record<string, unknown>,
) {
  await client.query(
    `
      insert into public.outbox_events (
        org_id, event_type, aggregate_type, aggregate_id, payload, app_version
      )
      values (app.current_org_id(), 'fa.cascade', 'fa', $1, $2::jsonb, 't010-chain1')
    `,
    [productCode, JSON.stringify(payload)],
  );
}

async function runInOrgTransaction<T>(
  options: Chain1Options,
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await options.pool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [
      options.sessionToken,
      options.orgId,
    ]);
    const result = await action(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function handlePackSizeChange(
  productCode: string,
  newPackSize: string | null,
  options: Chain1Options,
): Promise<PackSizeCascadeResult> {
  const nextPackSize = normalizeText(newPackSize);

  return runInOrgTransaction(options, async (client) => {
    const product = await loadProduct(client, productCode);

    await client.query(
      `
        update public.product
        set pack_size = $2,
            line = null
        where product_code = $1
      `,
      [productCode, nextPackSize],
    );

    await client.query(
      `
        update public.prod_detail
        set line = null,
            equipment_setup = null
        where product_code = $1
      `,
      [productCode],
    );

    await emitCascadeEvent(client, productCode, {
      chain: 'pack_size_line_equipment_setup',
      trigger: 'pack_size',
      diff: {
        pack_size: { prev: product.pack_size, next: nextPackSize },
        line: { prev: product.line, next: null },
        equipment_setup: { next: null },
      },
    });

    return {
      productCode,
      previousPackSize: product.pack_size,
      newPackSize: nextPackSize,
      cleared: ['line', 'equipment_setup'],
      changed: product.pack_size !== nextPackSize || product.line !== null,
    };
  });
}

export async function handleLineChange(
  productCode: string,
  newLine: string | null,
  options: Chain1Options,
): Promise<LineCascadeResult> {
  const nextLine = normalizeText(newLine);

  return runInOrgTransaction(options, async (client) => {
    const product = await loadProduct(client, productCode);
    let equipmentSetup: string | null = null;

    if (product.pack_size !== null && product.pack_size.trim() !== '' && nextLine !== null) {
      const lookup = await client.query<EquipmentSetupRow>(
        `
          select equipment_setup
          from "Reference"."Equipment_Setup_By_Line_Pack"
          where line = $1
            and pack_size = $2
          limit 1
        `,
        [nextLine, product.pack_size],
      );
      equipmentSetup = lookup.rows[0]?.equipment_setup ?? null;
    }

    await client.query(
      `
        update public.product
        set line = $2
        where product_code = $1
      `,
      [productCode, nextLine],
    );

    await client.query(
      `
        update public.prod_detail
        set line = $2,
            equipment_setup = $3
        where product_code = $1
      `,
      [productCode, nextLine, equipmentSetup],
    );

    await emitCascadeEvent(client, productCode, {
      chain: 'pack_size_line_equipment_setup',
      trigger: 'line',
      diff: {
        line: { prev: product.line, next: nextLine },
        equipment_setup: { next: equipmentSetup },
      },
      lookup: {
        line: nextLine,
        pack_size: product.pack_size,
        found: equipmentSetup !== null,
      },
    });

    return {
      productCode,
      packSize: product.pack_size,
      previousLine: product.line,
      newLine: nextLine,
      equipmentSetup,
      changed: product.line !== nextLine,
    };
  });
}
