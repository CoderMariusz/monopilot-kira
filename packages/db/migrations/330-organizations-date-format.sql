alter table public.organizations
  add column if not exists date_format text not null default 'YYYY-MM-DD';

comment on column public.organizations.date_format is 'Preferred date display format for Settings -> Company profile.';
