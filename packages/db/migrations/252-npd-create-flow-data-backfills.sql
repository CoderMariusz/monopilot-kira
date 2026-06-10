-- Migration 252: NPD create-flow data backfills.
-- Wave0 lock: org_id business scope; idempotent data repair only.

update public.formulations f
set product_code = p.product_code
from public.npd_projects p
where f.project_id = p.id
  and f.product_code is null
  and p.product_code is not null;

with ingredient_totals as (
  select
    fi.id,
    fi.qty_kg,
    sum(fi.qty_kg) over (partition by fi.version_id) as total_qty_kg
  from public.formulation_ingredients fi
  where fi.qty_kg is not null
)
update public.formulation_ingredients fi
set pct = round(ingredient_totals.qty_kg / nullif(ingredient_totals.total_qty_kg, 0) * 100, 3)
from ingredient_totals
where fi.id = ingredient_totals.id
  and fi.pct is null
  and fi.qty_kg is not null
  and ingredient_totals.total_qty_kg is not null
  and ingredient_totals.total_qty_kg <> 0;
