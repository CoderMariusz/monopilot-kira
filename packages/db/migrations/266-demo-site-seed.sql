-- Migration 266: seed one default site for the demo org.
--
-- Live round-2 scanner verify: /api/scanner/bootstrap returned sites: [] —
-- NO migration ever inserted a public.sites row, so the scanner site-select
-- dead-ends ("No sites available for your account") and the shift can never
-- start. One default site unblocks the flow; production_lines.site_id stays
-- NULL (multi-site T-030 owns line attribution).
--
-- NOT EXISTS instead of ON CONFLICT: sites has TWO unique constraints in play
-- (sites_org_code_uq + the one-default-per-org partial index) — mig 251 lesson:
-- never ON CONFLICT a dual-arbiter table.

insert into public.sites (org_id, site_code, name, is_default, timezone, country, is_active, activated_at)
select '00000000-0000-0000-0000-000000000002'::uuid,
       'SITE-DEMO-01',
       'Demo Plant — Warsaw',
       not exists (
         select 1 from public.sites s
          where s.org_id = '00000000-0000-0000-0000-000000000002'::uuid
            and s.is_default
       ),
       'Europe/Warsaw',
       'PL',
       true,
       pg_catalog.now()
 where not exists (
   select 1 from public.sites s
    where s.org_id = '00000000-0000-0000-0000-000000000002'::uuid
      and s.site_code = 'SITE-DEMO-01'
 );
