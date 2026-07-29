-- LOCAL TEST SHIM ONLY: this is not Supabase Storage.
-- A passing local migration or test does NOT prove uploads, storage.objects
-- policies, signed URLs, or any other Supabase Storage behavior.

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role']
  loop
    if not exists (select from pg_roles where rolname = role_name) then
      execute format(
        'create role %I nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls',
        role_name
      );
    end if;
  end loop;
end
$$;

create schema if not exists auth;
create schema if not exists storage;

-- pgcrypto: migracja 517 woła gołe digest(), ale ŻADNA migracja nie zakłada tego rozszerzenia.
-- Na Supabase pgcrypto siedzi w schemacie `extensions`, który jest na search_path, więc tam
-- to przechodzi przypadkiem. Każde inne świeże środowisko pada na 517 z
-- "function digest(text, unknown) does not exist". Migracja 521 przechodzi później na wbudowane
-- sha256 — czyli ta zależność była już raz źródłem awarii. Tu ją tylko odtwarzamy;
-- to NIE jest naprawa repo, defekt zostaje w backlogu.
create extension if not exists pgcrypto;

do $$
begin
  if to_regprocedure('auth.uid()') is null then
    execute $function$
      create function auth.uid()
      returns uuid
      language sql
      stable
      as $body$
        select nullif(
          coalesce(
            current_setting('request.jwt.claim.sub', true),
            (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
          ),
          ''
        )::uuid
      $body$
    $function$;
  end if;
end
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  bucket_id text,
  name text
);

alter table storage.objects enable row level security;

do $$
begin
  if to_regprocedure('storage.foldername(text)') is null then
    execute $function$
      create function storage.foldername(name text)
      returns text[]
      language plpgsql
      as $body$
      declare
        _parts text[];
      begin
        select string_to_array(name, '/') into _parts;
        return _parts[1:array_length(_parts, 1) - 1];
      end
      $body$
    $function$;
  end if;
end
$$;
