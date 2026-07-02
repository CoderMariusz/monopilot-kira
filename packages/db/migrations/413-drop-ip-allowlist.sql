-- Draft only: remove the deleted admin IP allowlist feature.

do $$
begin
  if to_regclass('public.admin_ip_allowlist') is not null then
    revoke all on table public.admin_ip_allowlist from app_user;
  end if;
end $$;

drop table if exists public.admin_ip_allowlist;
