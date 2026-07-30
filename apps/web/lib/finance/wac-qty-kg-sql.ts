import { CANONICAL_PIECE_UOM } from '../uom/piece';

const WAC_GRAMS_PER_KG = 1000;
const WAC_QTY_KG_SCALE = 6;

type WacQtyKgSqlInput = {
  qtySql: string;
  uomSql: string;
  itemAlias: string;
};

/**
 * One SQL source for converting inventory quantities to the kg grain used by WAC.
 * Callers supply trusted SQL identifiers/expressions, never user input.
 */
export function wacQtyKgSql({
  qtySql,
  uomSql,
  itemAlias,
}: WacQtyKgSqlInput): { caseSql: string; catalogJoinsSql: string } {
  const uom = `lower(${uomSql})`;
  const baseUom = `lower(coalesce(${itemAlias}.uom_base, ''))`;
  const each = `(${uom} = 'each' or ${uom} = '${CANONICAL_PIECE_UOM}')`;

  return {
    caseSql: `case
         when ${uom} = 'kg' then ${qtySql}
         when ${uom} = 'g' then round(${qtySql} / ${WAC_GRAMS_PER_KG}, ${WAC_QTY_KG_SCALE})
         when ${uom} = 'base' and ${baseUom} = 'kg' then ${qtySql}
         when ${uom} = ${baseUom} and ${baseUom} = 'kg' then ${qtySql}
         when ${each} and ${itemAlias}.net_qty_per_each is not null and ${baseUom} = 'kg'
           then ${qtySql} * ${itemAlias}.net_qty_per_each
         when ${uom} = 'box' and ${itemAlias}.net_qty_per_each is not null and ${itemAlias}.each_per_box is not null
           and ${baseUom} = 'kg'
           then ${qtySql} * ${itemAlias}.each_per_box::numeric * ${itemAlias}.net_qty_per_each
         when ${each} and ${itemAlias}.net_qty_per_each is not null and base_uom.factor_to_base is not null
           then ${qtySql} * ${itemAlias}.net_qty_per_each * base_uom.factor_to_base
         when ${uom} = 'box' and ${itemAlias}.net_qty_per_each is not null and ${itemAlias}.each_per_box is not null
           and base_uom.factor_to_base is not null
           then ${qtySql} * ${itemAlias}.each_per_box::numeric * ${itemAlias}.net_qty_per_each * base_uom.factor_to_base
         when ${each} and ${itemAlias}.net_qty_per_each is not null
           then ${qtySql} * ${itemAlias}.net_qty_per_each
         when ${uom} = 'box' and ${itemAlias}.net_qty_per_each is not null and ${itemAlias}.each_per_box is not null
           then ${qtySql} * ${itemAlias}.each_per_box::numeric * ${itemAlias}.net_qty_per_each
         when ${uom} = 'base' and base_uom.factor_to_base is not null
           then ${qtySql} * base_uom.factor_to_base
         when input_uom.factor_to_base is not null
           and (input_uom.category = 'mass' or input_uom.category = base_uom.category)
           then ${qtySql} * input_uom.factor_to_base
         else null
       end`,
    catalogJoinsSql: `left join public.unit_of_measure input_uom
         on input_uom.org_id = ${itemAlias}.org_id
        and lower(input_uom.code) = ${uom}
        and input_uom.category in ('mass', 'volume')
        and input_uom.deleted_at is null
       left join public.unit_of_measure base_uom
         on base_uom.org_id = ${itemAlias}.org_id
        and lower(base_uom.code) = ${baseUom}
        and base_uom.category in ('mass', 'volume')
        and base_uom.deleted_at is null`,
  };
}
