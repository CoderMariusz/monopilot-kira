-- 407-genealogy-org-wide-definer.sql
-- Org-wide LP genealogy reader for recall/provenance traces. This bypasses
-- restrictive site visibility RLS by running as the migration owner, but every
-- LP and edge read is hard-filtered by p_org_id.

create or replace function public.get_lp_genealogy_org_wide(
  p_org_id uuid,
  p_root_lp_id uuid,
  p_direction text default 'both'
)
returns table (
  lp_id text,
  lp_number text,
  item_code text,
  quantity text,
  uom text,
  status text,
  created_at timestamptz,
  depth integer,
  direction text,
  parent_lp_id text
)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  with recursive
    requested as (
      select coalesce(nullif(lower(p_direction), ''), 'both') as direction
    ),
    seed as (
      select lp.id,
             lp.parent_lp_id,
             array[lp.id] as path,
             0 as depth
        from public.license_plates lp
       where lp.org_id = p_org_id
         and lp.id = p_root_lp_id
    ),
    ancestors as (
      select id, parent_lp_id, path, depth from seed
      union all
      select parent.id,
             parent.parent_lp_id,
             ancestors.path || parent.id,
             ancestors.depth + 1
        from ancestors
        join public.license_plates current
          on current.org_id = p_org_id
         and current.id = ancestors.id
        join lateral (
          select current.parent_lp_id as parent_lp_id
           where current.parent_lp_id is not null
          union
          select lg.parent_lp_id
            from public.lp_genealogy lg
            join public.license_plates lg_child
              on lg_child.org_id = p_org_id
             and lg_child.id = lg.child_lp_id
           where lg.org_id = p_org_id
             and lg.child_lp_id = current.id
        ) parent_edges on exists (
          select 1
            from public.license_plates parent_scope
           where parent_scope.org_id = p_org_id
             and parent_scope.id = parent_edges.parent_lp_id
        )
        join public.license_plates parent
          on parent.org_id = p_org_id
         and parent.id = parent_edges.parent_lp_id
       where ancestors.depth < 20
         and not parent.id = any(ancestors.path)
    ),
    descendants as (
      select id, parent_lp_id, path, depth from seed
      union all
      select child.id,
             child.parent_lp_id,
             descendants.path || child.id,
             descendants.depth + 1
        from descendants
        join public.license_plates current
          on current.org_id = p_org_id
         and current.id = descendants.id
        join lateral (
          select child_by_parent.id as child_lp_id
            from public.license_plates child_by_parent
           where child_by_parent.org_id = p_org_id
             and child_by_parent.parent_lp_id = current.id
          union
          select lg.child_lp_id
            from public.lp_genealogy lg
            join public.license_plates lg_parent
              on lg_parent.org_id = p_org_id
             and lg_parent.id = lg.parent_lp_id
           where lg.org_id = p_org_id
             and lg.parent_lp_id = current.id
        ) child_edges on exists (
          select 1
            from public.license_plates child_scope
           where child_scope.org_id = p_org_id
             and child_scope.id = child_edges.child_lp_id
        )
        join public.license_plates child
          on child.org_id = p_org_id
         and child.id = child_edges.child_lp_id
       where descendants.depth < 20
         and not child.id = any(descendants.path)
    ),
    nodes as (
      select ancestors.id, ancestors.depth, 'ancestor'::text as direction
        from ancestors, requested
       where ancestors.depth > 0
         and requested.direction in ('both', 'all', 'ancestor', 'ancestors', 'upstream')
      union all
      select seed.id, 0, 'self'::text
        from seed
      union all
      select descendants.id, descendants.depth, 'descendant'::text
        from descendants, requested
       where descendants.depth > 0
         and requested.direction in ('both', 'all', 'descendant', 'descendants', 'downstream')
    )
  select lp.id::text as lp_id,
         lp.lp_number,
         i.item_code,
         lp.quantity::text,
         lp.uom,
         lp.status,
         lp.created_at,
         nodes.depth,
         nodes.direction,
         lp.parent_lp_id::text
    from nodes
    join public.license_plates lp
      on lp.org_id = p_org_id
     and lp.id = nodes.id
    left join public.items i
      on i.org_id = p_org_id
     and i.id = lp.product_id
   order by case nodes.direction when 'ancestor' then 0 when 'self' then 1 else 2 end,
            nodes.depth desc,
            lp.created_at asc
$$;

revoke all on function public.get_lp_genealogy_org_wide(uuid, uuid, text) from public;
grant execute on function public.get_lp_genealogy_org_wide(uuid, uuid, text) to app_user;
