import { ProductionActionError, type QueryClient } from './shared';

type GenealogyMismatchRow = {
  lp_id: string | null;
  consumption_uoms: string[] | null;
  output_uoms: string[] | null;
};

/**
 * Rebuilds every consumed→output LP edge from the canonical WO ledgers.
 * Call after either ledger changes: output-first and consumption-first sequences
 * converge on the same graph, including caller-supplied output LPs.
 */
export async function reconcileWoOutputGenealogy(client: QueryClient, woId: string): Promise<void> {
  await client.query(`select pg_advisory_xact_lock(hashtext($1::text || '::genealogy'))`, [woId]);

  const { rows } = await client.query<GenealogyMismatchRow>(
    `with parent_net as (
       select mc.lp_id as parent_lp_id,
              sum(mc.qty_consumed) as net_qty,
              array_agg(distinct mc.uom order by mc.uom) as uoms
         from public.wo_material_consumption mc
        where mc.org_id = app.current_org_id()
          and mc.wo_id = $1::uuid
          and mc.lp_id <> '00000000-0000-0000-0000-000000000000'::uuid
        group by mc.lp_id
       having sum(mc.qty_consumed) > 0::numeric
     ),
     outputs as (
       select o.lp_id as child_lp_id,
              sum(o.qty_kg) as output_qty,
              array_agg(distinct o.uom order by o.uom) as uoms
         from public.wo_outputs o
        where o.org_id = app.current_org_id()
          and o.wo_id = $1::uuid
          and o.lp_id is not null
          and o.correction_of_id is null
          and not exists (
            select 1
              from public.wo_outputs correction
             where correction.org_id = o.org_id
               and correction.correction_of_id = o.id
          )
        group by o.lp_id
       having sum(o.qty_kg) > 0::numeric
     ),
     mismatch as (
       select pn.parent_lp_id as lp_id,
              pn.uoms as consumption_uoms,
              o.uoms as output_uoms
         from parent_net pn
         cross join outputs o
        where cardinality(pn.uoms) <> 1
           or cardinality(o.uoms) <> 1
           or pn.uoms[1] <> o.uoms[1]
        limit 1
     ),
     output_total as (
       select sum(output_qty) as qty from outputs
     ),
     desired as (
       select o.child_lp_id,
              pn.parent_lp_id,
              least(
                pn.net_qty * o.output_qty / ot.qty,
                case when pn.uoms[1] in ('kg', 'g', 'lb') then o.output_qty else pn.net_qty end
              ) as qty,
              pn.uoms[1] as uom
         from parent_net pn
         cross join outputs o
         cross join output_total ot
        where cardinality(pn.uoms) = 1
          and cardinality(o.uoms) = 1
          and pn.uoms[1] = o.uoms[1]
          and ot.qty > 0::numeric
          and not exists (select 1 from mismatch)
     ),
     upserted as (
       insert into public.lp_genealogy (
         org_id, child_lp_id, parent_lp_id, relation_type, qty, uom
       )
       select app.current_org_id(), d.child_lp_id, d.parent_lp_id, 'consumed', d.qty, d.uom
         from desired d
        where d.qty > 0::numeric
       on conflict (org_id, child_lp_id, parent_lp_id, relation_type)
       do update set qty = excluded.qty, uom = excluded.uom
       returning child_lp_id
     ),
     deleted as (
       delete from public.lp_genealogy lg
        using outputs o
        where lg.org_id = app.current_org_id()
          and lg.child_lp_id = o.child_lp_id
          and lg.relation_type = 'consumed'
          and not exists (select 1 from mismatch)
          and not exists (
            select 1
              from desired d
             where d.child_lp_id = lg.child_lp_id
               and d.parent_lp_id = lg.parent_lp_id
          )
       returning lg.child_lp_id
     ),
     updated_outputs as (
       update public.license_plates lp
          set wo_id = coalesce(lp.wo_id, $1::uuid),
              parent_lp_id = case
                when lp.origin = 'production'
                  -- no min(uuid) aggregate exists before PG18 (42883 at PARSE time, so
                  -- every call failed regardless of data); order by + limit 1 is the
                  -- same lowest-parent pick and matches the jsonb_agg ordering below.
                  then (
                    select d.parent_lp_id
                      from desired d
                     where d.child_lp_id = lp.id
                     order by d.parent_lp_id
                     limit 1
                  )
                else lp.parent_lp_id
              end,
              ext_jsonb = coalesce(lp.ext_jsonb, '{}'::jsonb) || jsonb_build_object(
                'consumed_lp_ids',
                coalesce(
                  (select jsonb_agg(d.parent_lp_id order by d.parent_lp_id)
                     from desired d
                    where d.child_lp_id = lp.id),
                  '[]'::jsonb
                )
              )
         from outputs o
        where lp.org_id = app.current_org_id()
          and lp.id = o.child_lp_id
          and not exists (select 1 from mismatch)
       returning lp.id
     )
     select m.lp_id::text,
            m.consumption_uoms,
            m.output_uoms
       from mismatch m
     union all
     select null, null, null
      where not exists (select 1 from mismatch)
        and (
          (select count(*) from upserted) +
          (select count(*) from deleted) +
          (select count(*) from updated_outputs)
        ) >= 0`,
    [woId],
  );

  const mismatch = rows.find((row) => row.lp_id !== null);
  if (mismatch) {
    throw new ProductionActionError('uom_mismatch', 409, {
      lp_id: mismatch.lp_id,
      uoms: mismatch.consumption_uoms,
      output_uoms: mismatch.output_uoms,
      message: 'Parent consumption UoM does not match the WO output UoM for genealogy allocation.',
    });
  }
}
