create unique index if not exists tenant_migrations_one_scheduled_idx
  on public.tenant_migrations (org_id, component)
  where status = 'scheduled';
