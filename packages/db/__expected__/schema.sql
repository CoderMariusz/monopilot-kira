--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: Reference; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "Reference";


--
-- Name: app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA app;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: count_manufacturing_operation_usage(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.count_manufacturing_operation_usage(p_org_id uuid, p_operation_name text) RETURNS TABLE(active_fa_count integer, template_count integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
declare
  v_fa integer := 0;
  v_tpl integer := 0;
begin
  if p_org_id is null or p_operation_name is null then
    return query select 0, 0;
    return;
  end if;

  if to_regclass('npd.formulation_assignments') is not null then
    execute format(
      'select count(*)::integer
         from %s
        where org_id = $1
          and is_active = true
          and (
                manufacturing_operation_1 = $2
             or manufacturing_operation_2 = $2
             or manufacturing_operation_3 = $2
             or manufacturing_operation_4 = $2
              )',
      'npd.formulation_assignments'
    )
    into v_fa
    using p_org_id, p_operation_name;
  end if;

  if to_regclass('npd.templates') is not null then
    execute format(
      'select count(*)::integer
         from %s
        where org_id = $1
          and is_active = true
          and (
                template_operation_1 = $2
             or template_operation_2 = $2
             or template_operation_3 = $2
             or template_operation_4 = $2
              )',
      'npd.templates'
    )
    into v_tpl
    using p_org_id, p_operation_name;
  end if;

  return query select coalesce(v_fa, 0), coalesce(v_tpl, 0);
end;
$_$;


--
-- Name: FUNCTION count_manufacturing_operation_usage(p_org_id uuid, p_operation_name text); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.count_manufacturing_operation_usage(p_org_id uuid, p_operation_name text) IS 'V-SET-MFG-04 helper: returns active FA + template reference counts for a given operation name within the current org. Returns (0, 0) when the underlying FA/template tables do not exist (LEGACY-FA migration not yet complete).';


--
-- Name: current_org_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_org_id() RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  select active_context.org_id
  from app.active_org_contexts active_context
  join app.session_org_contexts trusted_context
    on trusted_context.session_token = active_context.session_token
   and trusted_context.org_id = active_context.org_id
  where active_context.backend_pid = pg_catalog.pg_backend_pid()
    and active_context.transaction_id = pg_catalog.txid_current_if_assigned()
  limit 1
$$;


--
-- Name: gc_session_org_contexts(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.gc_session_org_contexts(p_max_age_seconds integer DEFAULT 600) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_deleted int;
begin
  delete from app.session_org_contexts
   where created_at < pg_catalog.now() - make_interval(secs => p_max_age_seconds);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;


--
-- Name: FUNCTION gc_session_org_contexts(p_max_age_seconds integer); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.gc_session_org_contexts(p_max_age_seconds integer) IS 'GC orphan rows from app.session_org_contexts older than p_max_age_seconds (default 600). Operators wire this to a 5-minute cron with owner credentials. See migration 031.';


--
-- Name: get_my_tenant_idp_config(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_my_tenant_idp_config(p_tenant_id uuid) RETURNS TABLE(tenant_id uuid, provider_type character varying, enforce_for_non_admins boolean, jit_provisioning boolean, mfa_required boolean, mfa_required_for_roles text[], mfa_allowed_methods text[], password_complexity character varying, idle_timeout_min integer, session_max_h integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  -- Only return rows whose tenant_id matches BOTH the caller-supplied tenant
  -- AND an organization the current session has been bound to. This prevents
  -- a session bound to org A from reading org B's IdP policy.
  return query
    select
      t.tenant_id,
      t.provider_type,
      t.enforce_for_non_admins,
      t.jit_provisioning,
      t.mfa_required,
      t.mfa_required_for_roles,
      t.mfa_allowed_methods,
      t.password_complexity,
      t.idle_timeout_min,
      t.session_max_h
    from public.tenant_idp_config t
    where t.tenant_id = p_tenant_id
      and exists (
        select 1
        from public.organizations o
        where o.tenant_id = t.tenant_id
          and o.id = app.current_org_id()
      );
end;
$$;


--
-- Name: reference_tables_set_version(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.reference_tables_set_version() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if new.row_data is distinct from old.row_data then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: refresh_reference_table_mv(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.refresh_reference_table_mv(org_id uuid, table_code text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  mv_name text;
begin
  mv_name := format(
    'reference_table_mv_%s_%s',
    replace(refresh_reference_table_mv.org_id::text, '-', ''),
    regexp_replace(refresh_reference_table_mv.table_code, '[^a-zA-Z0-9_]+', '_', 'g')
  );

  if to_regclass(format('public.%I', mv_name)) is null then
    return false;
  end if;

  execute format('refresh materialized view public.%I', mv_name);
  return true;
end;
$$;


--
-- Name: set_org_context(uuid, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.set_org_context(session_token uuid, org uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if not exists (
    select 1
    from app.session_org_contexts trusted_context
    where trusted_context.session_token = set_org_context.session_token
      and trusted_context.org_id = set_org_context.org
  ) then
    raise exception 'invalid organization context'
      using errcode = '28000';
  end if;

  insert into app.active_org_contexts (backend_pid, transaction_id, session_token, org_id, set_at)
  values (pg_catalog.pg_backend_pid(), pg_catalog.txid_current(), set_org_context.session_token, set_org_context.org, pg_catalog.now())
  on conflict (backend_pid) do update
    set transaction_id = excluded.transaction_id,
        session_token = excluded.session_token,
        org_id = excluded.org_id,
        set_at = excluded.set_at;

  return set_org_context.org;
end;
$$;


--
-- Name: audit_events_impersonation_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_events_impersonation_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if new.actor_type = 'impersonation' and new.impersonator_id is null then
    raise exception 'impersonation audit events require a non-null impersonator_id'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;


--
-- Name: audit_log_create_partitions(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_log_create_partitions(n integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  start_month date := date_trunc('year', current_date)::date;
  partition_start date;
  partition_end date;
  partition_name text;
begin
  if n is null or n < 1 then
    raise exception 'partition count must be positive' using errcode = '22023';
  end if;

  for month_offset in 0..(n - 1) loop
    partition_start := (start_month + (month_offset || ' months')::interval)::date;
    partition_end := (partition_start + interval '1 month')::date;
    partition_name := 'audit_log_' || to_char(partition_start, 'YYYY_MM');

    execute format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.audit_log FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      partition_start,
      partition_end
    );
  end loop;
end;
$$;


--
-- Name: audit_log_detach_old(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_log_detach_old(months integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
declare
  retention_months integer := months;
  cutoff_month date;
  partition_record record;
  partition_month date;
  detached_count integer := 0;
begin
  if retention_months is null or retention_months < 1 then
    raise exception 'retention window must be positive' using errcode = '22023';
  end if;

  cutoff_month := (date_trunc('month', current_date)::date - (retention_months || ' months')::interval)::date;

  for partition_record in
    select namespace.nspname as schema_name, child.relname as table_name
      from pg_inherits inheritance
      join pg_class child on child.oid = inheritance.inhrelid
      join pg_namespace namespace on namespace.oid = child.relnamespace
     where inheritance.inhparent = 'public.audit_log'::regclass
       and namespace.nspname = 'public'
       and child.relname ~ '^audit_log_[0-9]{4}_(0[1-9]|1[0-2])$'
     order by child.relname
  loop
    partition_month := to_date(substring(partition_record.table_name from 'audit_log_([0-9]{4}_[0-9]{2})'), 'YYYY_MM');

    if partition_month < cutoff_month then
      execute format(
        'ALTER TABLE public.audit_log DETACH PARTITION %I.%I',
        partition_record.schema_name,
        partition_record.table_name
      );
      detached_count := detached_count + 1;
    end if;
  end loop;

  return detached_count;
end;
$_$;


--
-- Name: FUNCTION audit_log_detach_old(months integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.audit_log_detach_old(months integer) IS 'Detach audit_log monthly partitions older than the supplied number of months; invoke with 84 for 7-year retention.';


--
-- Name: prune_audit_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prune_audit_events() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  DELETE FROM public.audit_events
   WHERE occurred_at < now() - interval '90 days'
     AND retention_class <> 'security';
$$;


--
-- Name: prune_consumed_approval_tokens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prune_consumed_approval_tokens() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  DELETE FROM public.consumed_approval_tokens
   WHERE consumed_at < now() - interval '30 days';
$$;


--
-- Name: prune_reference_csv_import_reports(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prune_reference_csv_import_reports() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  removed integer;
begin
  delete from public.reference_csv_import_reports
   where expires_at < pg_catalog.now()
  returning 1
  into removed;
  return coalesce(removed, 0);
end;
$$;


--
-- Name: seed_reference_data_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_reference_data_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_apex_org_id uuid := '00000000-0000-0000-0000-000000000002'::uuid;
BEGIN
  -- Skip Apex itself — the source of the seed has nothing to copy from.
  IF NEW.id = v_apex_org_id THEN
    RETURN NEW;
  END IF;

  -- Reference.Departments — clone Apex rows into the new org.
  INSERT INTO "Reference"."Departments"
    (id, org_id, code, display_name, role_description, marker, created_at)
  SELECT gen_random_uuid(),
         NEW.id,
         code,
         display_name,
         role_description,
         marker,
         pg_catalog.now()
    FROM "Reference"."Departments"
   WHERE org_id = v_apex_org_id
  ON CONFLICT (org_id, code) DO NOTHING;

  -- Reference.ManufacturingOperations — table only present after migration 012;
  -- guard so this trigger remains usable on partially migrated databases.
  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'Reference'
       AND table_name   = 'ManufacturingOperations'
  ) THEN
    INSERT INTO "Reference"."ManufacturingOperations"
      (id, org_id, operation_name, process_suffix, description, operation_seq,
       industry_code, is_active, marker, created_at)
    SELECT gen_random_uuid(),
           NEW.id,
           operation_name,
           process_suffix,
           description,
           operation_seq,
           industry_code,
           is_active,
           marker,
           pg_catalog.now()
      FROM "Reference"."ManufacturingOperations"
     WHERE org_id = v_apex_org_id
    ON CONFLICT (org_id, industry_code, process_suffix) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: seed_system_roles_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_system_roles_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
    begin
      insert into public.roles (org_id, slug, system, code, name, permissions, is_system)
      values
        (new.id, 'org.access.admin', true, 'org.access.admin', 'Org Access Admin', '[]'::jsonb, true),
        (new.id, 'org.schema.admin', true, 'org.schema.admin', 'Org Schema Admin', '[]'::jsonb, true),
        (new.id, 'org.platform.admin', true, 'org.platform.admin', 'Org Platform Admin', '[]'::jsonb, true)
      on conflict (org_id, slug) do nothing;

      insert into public.org_security_policies (org_id, dual_control_required)
      values (new.id, true)
      on conflict (org_id) do nothing;

      return new;
    end;
    $$;


--
-- Name: seed_tenant_idp_config(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_tenant_idp_config() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  insert into public.tenant_idp_config (
    tenant_id,
    provider_type,
    idle_timeout_min,
    session_max_h,
    mfa_required,
    mfa_required_for_roles,
    mfa_allowed_methods,
    password_complexity
  ) values (
    new.id,
    'password',
    60,
    8,
    true,
    array['org.access.admin', 'org.schema.admin'],
    array['totp'],
    'strong'
  )
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;


--
-- Name: set_user_pins_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_pins_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Departments; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."Departments" (
    id uuid NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    display_name text NOT NULL,
    role_description text NOT NULL,
    marker text DEFAULT 'APEX-CONFIG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY "Reference"."Departments" FORCE ROW LEVEL SECURITY;


--
-- Name: DeptColumns; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."DeptColumns" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    dept_code text NOT NULL,
    column_key text NOT NULL,
    field_type text NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    validation_dsl jsonb,
    schema_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id text
);

ALTER TABLE ONLY "Reference"."DeptColumns" FORCE ROW LEVEL SECURITY;


--
-- Name: FieldTypes; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."FieldTypes" (
    code text NOT NULL,
    ts_type text NOT NULL,
    json_schema jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id text,
    schema_version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY "Reference"."FieldTypes" FORCE ROW LEVEL SECURITY;


--
-- Name: Formulas; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."Formulas" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    formula_key text NOT NULL,
    expression text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id text,
    schema_version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY "Reference"."Formulas" FORCE ROW LEVEL SECURITY;


--
-- Name: ManufacturingOperations; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."ManufacturingOperations" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    operation_name text NOT NULL,
    process_suffix text NOT NULL,
    description text,
    operation_seq integer,
    industry_code text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    marker text DEFAULT 'APEX-CONFIG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "ManufacturingOperations_process_suffix_check" CHECK ((process_suffix ~ '^[A-Z0-9]{2,4}$'::text))
);

ALTER TABLE ONLY "Reference"."ManufacturingOperations" FORCE ROW LEVEL SECURITY;


--
-- Name: Rules; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."Rules" (
    id uuid NOT NULL,
    org_id uuid NOT NULL,
    rule_id text NOT NULL,
    rule_type text NOT NULL,
    definition_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    active_from timestamp with time zone DEFAULT now() NOT NULL,
    active_to timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id text,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT rules_rule_type_check CHECK ((rule_type = ANY (ARRAY['cascading'::text, 'conditional_required'::text, 'gate'::text, 'workflow'::text])))
);

ALTER TABLE ONLY "Reference"."Rules" FORCE ROW LEVEL SECURITY;


--
-- Name: active_org_contexts; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.active_org_contexts (
    backend_pid integer NOT NULL,
    transaction_id bigint NOT NULL,
    session_token uuid NOT NULL,
    org_id uuid NOT NULL,
    set_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: session_org_contexts; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.session_org_contexts (
    session_token uuid NOT NULL,
    org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_ip_allowlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_ip_allowlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    cidr inet NOT NULL,
    label text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_ip_allowlist_label_check CHECK (((label IS NULL) OR (char_length(label) <= 120))),
    CONSTRAINT admin_ip_allowlist_no_default_route CHECK (((cidr <> '0.0.0.0/0'::inet) AND (cidr <> '::/0'::inet)))
);

ALTER TABLE ONLY public.admin_ip_allowlist FORCE ROW LEVEL SECURITY;


--
-- Name: allergens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allergens (
    code text NOT NULL,
    name text NOT NULL,
    name_pl text,
    name_de text,
    name_fr text,
    name_uk text,
    name_ro text,
    icon_url text,
    is_active boolean DEFAULT true NOT NULL
);

ALTER TABLE ONLY public.allergens FORCE ROW LEVEL SECURITY;


--
-- Name: audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_events (
    id bigint NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    impersonator_id uuid,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    ip_address inet,
    user_agent text,
    request_id uuid NOT NULL,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_events_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_events_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text]))),
    CONSTRAINT audit_events_role_assigned_security_check CHECK (((action <> 'role.assigned'::text) OR (retention_class = 'security'::text)))
);

ALTER TABLE ONLY public.audit_events FORCE ROW LEVEL SECURITY;


--
-- Name: CONSTRAINT audit_events_role_assigned_security_check ON audit_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT audit_events_role_assigned_security_check ON public.audit_events IS 'T-014: role.assigned events must always use retention_class=security (security red line)';


--
-- Name: audit_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_events_id_seq OWNED BY public.audit_events.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
)
PARTITION BY RANGE (occurred_at);

ALTER TABLE ONLY public.audit_log FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_01; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_01 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_01 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_02; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_02 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_02 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_03; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_03 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_03 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_04 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_04 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_05 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_05 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_06 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_06 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_07 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_07 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_08 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_08 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_09; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_09 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_09 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_10; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_10 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_10 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_11 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_11 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_12; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_12 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_12 FORCE ROW LEVEL SECURITY;


--
-- Name: bom_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bom_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text,
    org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id uuid,
    schema_version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public.bom_item FORCE ROW LEVEL SECURITY;


--
-- Name: consumed_approval_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consumed_approval_tokens (
    jti uuid NOT NULL,
    org_id uuid NOT NULL,
    consumed_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.consumed_approval_tokens FORCE ROW LEVEL SECURITY;


--
-- Name: dept_column_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dept_column_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    dept_id uuid NOT NULL,
    column_key text NOT NULL,
    field_type text NOT NULL,
    validation_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    presentation_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dept_column_drafts_field_type_check CHECK ((field_type = ANY (ARRAY['string'::text, 'number'::text, 'date'::text, 'enum'::text, 'formula'::text, 'relation'::text]))),
    CONSTRAINT dept_column_drafts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
);

ALTER TABLE ONLY public.dept_column_drafts FORCE ROW LEVEL SECURITY;


--
-- Name: dept_column_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dept_column_migrations (
    id bigint NOT NULL,
    org_id uuid NOT NULL,
    dept_column_id uuid NOT NULL,
    prev_version integer NOT NULL,
    new_version integer NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.dept_column_migrations FORCE ROW LEVEL SECURITY;


--
-- Name: dept_column_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dept_column_migrations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dept_column_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dept_column_migrations_id_seq OWNED BY public.dept_column_migrations.id;


--
-- Name: e_sign_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.e_sign_log (
    signature_id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    signer_user_id uuid NOT NULL,
    intent text NOT NULL,
    subject_hash text NOT NULL,
    nonce text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.e_sign_log FORCE ROW LEVEL SECURITY;


--
-- Name: gdpr_erasure_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gdpr_erasure_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    subject_id text NOT NULL,
    requested_by uuid NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp with time zone,
    processed_at timestamp with time zone,
    domains_run text[] DEFAULT '{}'::text[] NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gdpr_erasure_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.gdpr_erasure_requests FORCE ROW LEVEL SECURITY;


--
-- Name: idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idempotency_keys (
    transaction_id uuid NOT NULL,
    org_id uuid NOT NULL,
    request_hash text NOT NULL,
    response_json jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone
);

ALTER TABLE ONLY public.idempotency_keys FORCE ROW LEVEL SECURITY;


--
-- Name: line_machines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.line_machines (
    line_id uuid NOT NULL,
    machine_id uuid NOT NULL,
    sequence integer NOT NULL
);

ALTER TABLE ONLY public.line_machines FORCE ROW LEVEL SECURITY;


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    parent_id uuid,
    code text NOT NULL,
    name text NOT NULL,
    location_type text NOT NULL,
    level integer NOT NULL,
    path text NOT NULL,
    max_capacity numeric(18,6)
);

ALTER TABLE ONLY public.locations FORCE ROW LEVEL SECURITY;


--
-- Name: lot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text,
    org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id uuid,
    schema_version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public.lot FORCE ROW LEVEL SECURITY;


--
-- Name: machines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.machines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    machine_type text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    capacity_per_hour numeric(18,6),
    specs jsonb DEFAULT '{}'::jsonb NOT NULL,
    location_id uuid
);

ALTER TABLE ONLY public.machines FORCE ROW LEVEL SECURITY;


--
-- Name: mfa_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mfa_secrets (
    user_id uuid NOT NULL,
    secret_encrypted text NOT NULL,
    enrolled_at timestamp with time zone DEFAULT now() NOT NULL,
    last_otp_used_at timestamp with time zone,
    last_otp_window bigint
);

ALTER TABLE ONLY public.mfa_secrets FORCE ROW LEVEL SECURITY;


--
-- Name: modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modules (
    code text NOT NULL,
    name text NOT NULL,
    dependencies text[] DEFAULT '{}'::text[],
    can_disable boolean DEFAULT true NOT NULL,
    phase integer DEFAULT 1 NOT NULL,
    display_order integer
);

ALTER TABLE ONLY public.modules FORCE ROW LEVEL SECURITY;


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    user_id uuid NOT NULL,
    org_id uuid NOT NULL,
    category text NOT NULL,
    event text NOT NULL,
    channel_email boolean DEFAULT true NOT NULL,
    channel_in_app boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_preferences_category_event_nonempty CHECK (((length(TRIM(BOTH FROM category)) > 0) AND (length(TRIM(BOTH FROM event)) > 0)))
);

ALTER TABLE ONLY public.notification_preferences FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE notification_preferences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_preferences IS 'SET-092 per-user/per-org notification preferences surfaced by /settings/notifications.';


--
-- Name: org_security_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_security_policies (
    org_id uuid NOT NULL,
    dual_control_required boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.org_security_policies FORCE ROW LEVEL SECURITY;


--
-- Name: organization_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_modules (
    org_id uuid NOT NULL,
    module_code text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    enabled_at timestamp with time zone,
    enabled_by uuid
);

ALTER TABLE ONLY public.organization_modules FORCE ROW LEVEL SECURITY;


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    industry_code text NOT NULL,
    external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id text,
    schema_version integer DEFAULT 1 NOT NULL,
    dept_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    slug text DEFAULT ('org-'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
    logo_url text,
    timezone text DEFAULT 'Europe/Warsaw'::text NOT NULL,
    locale text DEFAULT 'pl'::text NOT NULL,
    currency character(3) DEFAULT 'PLN'::bpchar NOT NULL,
    gs1_prefix text,
    region text DEFAULT 'eu'::text NOT NULL,
    tier text DEFAULT 'L2'::text NOT NULL,
    seat_limit integer,
    onboarding_state jsonb DEFAULT '{}'::jsonb,
    onboarding_completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT organizations_industry_code_check CHECK ((industry_code = ANY (ARRAY['bakery'::text, 'pharma'::text, 'fmcg'::text, 'generic'::text])))
);

ALTER TABLE ONLY public.organizations FORCE ROW LEVEL SECURITY;


--
-- Name: outbox_dead_letter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbox_dead_letter (
    id bigint NOT NULL,
    outbox_event_id bigint NOT NULL,
    org_id uuid NOT NULL,
    event_type text NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    app_version text NOT NULL,
    attempts integer NOT NULL,
    failed_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error_text text NOT NULL,
    CONSTRAINT outbox_dead_letter_attempts_check CHECK ((attempts >= 0))
);

ALTER TABLE ONLY public.outbox_dead_letter FORCE ROW LEVEL SECURITY;


--
-- Name: outbox_dead_letter_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.outbox_dead_letter_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: outbox_dead_letter_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.outbox_dead_letter_id_seq OWNED BY public.outbox_dead_letter.id;


--
-- Name: outbox_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbox_events (
    id bigint NOT NULL,
    org_id uuid NOT NULL,
    event_type text NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    consumed_at timestamp with time zone,
    app_version text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    dead_lettered_at timestamp with time zone,
    last_error_text text,
    CONSTRAINT outbox_events_event_type_check CHECK ((event_type = ANY (ARRAY['org.created'::text, 'user.invited'::text, 'role.assigned'::text, 'audit.recorded'::text, 'brief.created'::text, 'fg.created'::text, 'fg.allergens_changed'::text, 'fg.intermediate_code_changed'::text, 'lp.received'::text, 'wo.ready'::text, 'quality.recorded'::text, 'shipment.created'::text, 'tenant.migration.run'::text, 'tenant.migration.run.failed'::text, 'tenant.cohort.advanced'::text, 'settings.schema.migration_requested'::text, 'settings.rule.deployed'::text, 'rule.deployed'::text, 'settings.location.upserted'::text, 'settings.machine.upserted'::text, 'settings.line.upserted'::text, 'settings.warehouse.deactivated'::text, 'onboarding.step.advance'::text, 'onboarding.step.back'::text, 'onboarding.step.skip'::text, 'onboarding.step.jump'::text, 'onboarding.step.restart'::text, 'onboarding.first_wo_recorded'::text])))
);

ALTER TABLE ONLY public.outbox_events FORCE ROW LEVEL SECURITY;


--
-- Name: CONSTRAINT outbox_events_event_type_check ON outbox_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT outbox_events_event_type_check ON public.outbox_events IS 'Adds SET-001..006 onboarding transition events while preserving prior outbox event types.';


--
-- Name: outbox_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.outbox_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: outbox_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.outbox_events_id_seq OWNED BY public.outbox_events.id;


--
-- Name: password_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.password_history FORCE ROW LEVEL SECURITY;


--
-- Name: production_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.production_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    default_location_id uuid
);

ALTER TABLE ONLY public.production_lines FORCE ROW LEVEL SECURITY;


--
-- Name: quality_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quality_event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text,
    org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id uuid,
    schema_version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public.quality_event FORCE ROW LEVEL SECURITY;


--
-- Name: recovery_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recovery_codes (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    code_hash text NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.recovery_codes FORCE ROW LEVEL SECURITY;


--
-- Name: recovery_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recovery_codes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recovery_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recovery_codes_id_seq OWNED BY public.recovery_codes.id;


--
-- Name: reference_csv_import_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_csv_import_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    table_code text NOT NULL,
    payload jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.reference_csv_import_reports FORCE ROW LEVEL SECURITY;


--
-- Name: reference_schemas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_schemas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid,
    table_code text NOT NULL,
    column_code text NOT NULL,
    dept_code text,
    data_type text NOT NULL,
    tier text NOT NULL,
    storage text NOT NULL,
    dropdown_source text,
    blocking_rule text,
    required_for_done boolean DEFAULT false NOT NULL,
    validation_json jsonb DEFAULT '{}'::jsonb,
    presentation_json jsonb DEFAULT '{}'::jsonb,
    schema_version integer DEFAULT 1 NOT NULL,
    deprecated_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT reference_schemas_data_type_check CHECK ((data_type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'enum'::text, 'formula'::text, 'relation'::text]))),
    CONSTRAINT reference_schemas_tier_check CHECK ((tier = ANY (ARRAY['L1'::text, 'L2'::text, 'L3'::text, 'L4'::text])))
);

ALTER TABLE ONLY public.reference_schemas FORCE ROW LEVEL SECURITY;


--
-- Name: reference_tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_tables (
    org_id uuid NOT NULL,
    table_code text NOT NULL,
    row_key text NOT NULL,
    row_data jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.reference_tables FORCE ROW LEVEL SECURITY;


--
-- Name: role_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_categories (
    role_code text NOT NULL,
    ui_category text NOT NULL,
    color_hint text,
    CONSTRAINT role_categories_ui_category_check CHECK ((ui_category = ANY (ARRAY['admin'::text, 'manager'::text, 'operator'::text, 'viewer'::text])))
);

ALTER TABLE ONLY public.role_categories FORCE ROW LEVEL SECURITY;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission text NOT NULL
);

ALTER TABLE ONLY public.role_permissions FORCE ROW LEVEL SECURITY;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    slug text DEFAULT ('role-'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
    system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    permissions jsonb NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0
);

ALTER TABLE ONLY public.roles FORCE ROW LEVEL SECURITY;


--
-- Name: rule_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rule_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    rule_code text NOT NULL,
    rule_type text NOT NULL,
    tier text DEFAULT 'L1'::text NOT NULL,
    definition_json jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    active_from timestamp with time zone DEFAULT now() NOT NULL,
    active_to timestamp with time zone,
    deployed_by uuid,
    deploy_ref text,
    CONSTRAINT rule_definitions_rule_type_check CHECK ((rule_type = ANY (ARRAY['cascading'::text, 'conditional'::text, 'gate'::text, 'workflow'::text]))),
    CONSTRAINT rule_definitions_tier_check CHECK ((tier = ANY (ARRAY['L1'::text, 'L2'::text, 'L3'::text, 'L4'::text])))
);

ALTER TABLE ONLY public.rule_definitions FORCE ROW LEVEL SECURITY;


--
-- Name: rule_dry_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rule_dry_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    rule_definition_id uuid NOT NULL,
    sample_input_json jsonb NOT NULL,
    result_json jsonb NOT NULL,
    ran_at timestamp with time zone DEFAULT now(),
    ran_by uuid
);

ALTER TABLE ONLY public.rule_dry_runs FORCE ROW LEVEL SECURITY;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    checksum text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid,
    table_code text DEFAULT '__migration_runner__'::text NOT NULL,
    column_code text,
    action text DEFAULT 'runner_apply'::text NOT NULL,
    tier_before text,
    tier_after text,
    migration_script text,
    approved_by uuid,
    approved_at timestamp with time zone,
    executed_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    result_notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT schema_migrations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'running'::text, 'completed'::text, 'failed'::text, 'rolled_back'::text])))
);


--
-- Name: scim_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scim_group_members (
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.scim_group_members FORCE ROW LEVEL SECURITY;


--
-- Name: scim_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scim_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    display_name text NOT NULL,
    external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.scim_groups FORCE ROW LEVEL SECURITY;


--
-- Name: scim_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scim_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    label text NOT NULL,
    scim_token_hash text NOT NULL,
    scim_token_last_four text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT scim_tokens_label_check CHECK (((char_length(label) >= 1) AND (char_length(label) <= 120))),
    CONSTRAINT scim_tokens_scim_token_last_four_check CHECK ((char_length(scim_token_last_four) = 4))
);

ALTER TABLE ONLY public.scim_tokens FORCE ROW LEVEL SECURITY;


--
-- Name: shipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text,
    org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id uuid,
    schema_version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public.shipment FORCE ROW LEVEL SECURITY;


--
-- Name: tax_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    rate numeric(5,4) NOT NULL,
    country_code character(2),
    tax_type text,
    jurisdiction text,
    effective_from date,
    effective_to date,
    is_default boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.tax_codes FORCE ROW LEVEL SECURITY;


--
-- Name: tenant_idp_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_idp_config (
    tenant_id uuid NOT NULL,
    provider_type character varying DEFAULT 'password'::character varying NOT NULL,
    idle_timeout_min integer DEFAULT 60 NOT NULL,
    session_max_h integer DEFAULT 8 NOT NULL,
    mfa_required boolean DEFAULT true NOT NULL,
    mfa_required_for_roles text[] DEFAULT ARRAY['org.access.admin'::text, 'org.schema.admin'::text] NOT NULL,
    mfa_allowed_methods text[] DEFAULT ARRAY['totp'::text] NOT NULL,
    password_complexity character varying DEFAULT 'strong'::character varying NOT NULL,
    metadata_url text,
    entity_id text,
    x509_cert text,
    provider_label text,
    scim_token_hash text,
    scim_token_last_four text,
    jit_provisioning boolean DEFAULT false NOT NULL,
    enforce_for_non_admins boolean DEFAULT false NOT NULL,
    password_expiry_days integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    scim_group_role_map jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT tenant_idp_config_provider_type_check CHECK (((provider_type)::text = ANY ((ARRAY['saml'::character varying, 'oidc'::character varying, 'password'::character varying, 'magic'::character varying])::text[])))
);

ALTER TABLE ONLY public.tenant_idp_config FORCE ROW LEVEL SECURITY;


--
-- Name: tenant_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_migrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    component text NOT NULL,
    current_version text NOT NULL,
    target_version text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    canary_pct numeric(7,4) DEFAULT 0 NOT NULL,
    last_run_at timestamp with time zone,
    scheduled_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenant_migrations_l2_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'canary'::text, 'progressive'::text, 'completed'::text, 'rolled_back'::text, 'force_scheduled'::text])))
);

ALTER TABLE ONLY public.tenant_migrations FORCE ROW LEVEL SECURITY;


--
-- Name: tenant_migrations_legacy_t038; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_migrations_legacy_t038 (
    tenant_id uuid NOT NULL,
    component text NOT NULL,
    current_version text NOT NULL,
    target_version text,
    cohort text DEFAULT 'general'::text NOT NULL,
    last_run_at timestamp with time zone,
    status text DEFAULT 'idle'::text NOT NULL,
    failure_reason text,
    CONSTRAINT tenant_migrations_cohort_check CHECK ((cohort = ANY (ARRAY['canary'::text, 'early'::text, 'general'::text]))),
    CONSTRAINT tenant_migrations_status_check CHECK ((status = ANY (ARRAY['idle'::text, 'pending'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'rolled_back'::text])))
);

ALTER TABLE ONLY public.tenant_migrations_legacy_t038 FORCE ROW LEVEL SECURITY;


--
-- Name: tenant_variations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_variations (
    org_id uuid NOT NULL,
    dept_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    rule_variant_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    feature_flags jsonb DEFAULT '{}'::jsonb NOT NULL,
    schema_extensions_count integer DEFAULT 0 NOT NULL,
    upgraded_at timestamp with time zone,
    upgraded_from_version text,
    upgraded_to_version text
);

ALTER TABLE ONLY public.tenant_variations FORCE ROW LEVEL SECURITY;


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid NOT NULL,
    name text NOT NULL,
    region_cluster text DEFAULT 'eu'::text NOT NULL,
    data_plane_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenants_region_cluster_check CHECK ((region_cluster = ANY (ARRAY['eu'::text, 'us'::text])))
);

ALTER TABLE ONLY public.tenants FORCE ROW LEVEL SECURITY;


--
-- Name: user_pins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_pins (
    user_id uuid NOT NULL,
    pin_hash text NOT NULL,
    attempts_count integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    last_attempt_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.user_pins FORCE ROW LEVEL SECURITY;


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    org_id uuid NOT NULL
);

ALTER TABLE ONLY public.user_roles FORCE ROW LEVEL SECURITY;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    email public.citext NOT NULL,
    display_name text,
    external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id text,
    schema_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    name text NOT NULL,
    role_id uuid NOT NULL,
    language text DEFAULT 'pl'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    invite_token text,
    invite_token_expires_at timestamp with time zone,
    last_login_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.users FORCE ROW LEVEL SECURITY;


--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    warehouse_type text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    address jsonb,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.warehouses FORCE ROW LEVEL SECURITY;


--
-- Name: work_order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_order (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text,
    org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id uuid,
    schema_version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public.work_order FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_01; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_01 FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');


--
-- Name: audit_log_2026_02; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_02 FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');


--
-- Name: audit_log_2026_03; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_03 FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+01');


--
-- Name: audit_log_2026_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_04 FOR VALUES FROM ('2026-04-01 00:00:00+01') TO ('2026-05-01 00:00:00+01');


--
-- Name: audit_log_2026_05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_05 FOR VALUES FROM ('2026-05-01 00:00:00+01') TO ('2026-06-01 00:00:00+01');


--
-- Name: audit_log_2026_06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_06 FOR VALUES FROM ('2026-06-01 00:00:00+01') TO ('2026-07-01 00:00:00+01');


--
-- Name: audit_log_2026_07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_07 FOR VALUES FROM ('2026-07-01 00:00:00+01') TO ('2026-08-01 00:00:00+01');


--
-- Name: audit_log_2026_08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_08 FOR VALUES FROM ('2026-08-01 00:00:00+01') TO ('2026-09-01 00:00:00+01');


--
-- Name: audit_log_2026_09; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_09 FOR VALUES FROM ('2026-09-01 00:00:00+01') TO ('2026-10-01 00:00:00+01');


--
-- Name: audit_log_2026_10; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_10 FOR VALUES FROM ('2026-10-01 00:00:00+01') TO ('2026-11-01 00:00:00+00');


--
-- Name: audit_log_2026_11; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_11 FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');


--
-- Name: audit_log_2026_12; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_12 FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');


--
-- Name: audit_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events ALTER COLUMN id SET DEFAULT nextval('public.audit_events_id_seq'::regclass);


--
-- Name: dept_column_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dept_column_migrations ALTER COLUMN id SET DEFAULT nextval('public.dept_column_migrations_id_seq'::regclass);


--
-- Name: outbox_dead_letter id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_dead_letter ALTER COLUMN id SET DEFAULT nextval('public.outbox_dead_letter_id_seq'::regclass);


--
-- Name: outbox_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_events ALTER COLUMN id SET DEFAULT nextval('public.outbox_events_id_seq'::regclass);


--
-- Name: recovery_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_codes ALTER COLUMN id SET DEFAULT nextval('public.recovery_codes_id_seq'::regclass);


--
-- Name: Departments Departments_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Departments"
    ADD CONSTRAINT "Departments_pkey" PRIMARY KEY (id);


--
-- Name: DeptColumns DeptColumns_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."DeptColumns"
    ADD CONSTRAINT "DeptColumns_pkey" PRIMARY KEY (id);


--
-- Name: FieldTypes FieldTypes_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."FieldTypes"
    ADD CONSTRAINT "FieldTypes_pkey" PRIMARY KEY (code);


--
-- Name: Formulas Formulas_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Formulas"
    ADD CONSTRAINT "Formulas_pkey" PRIMARY KEY (id);


--
-- Name: ManufacturingOperations ManufacturingOperations_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."ManufacturingOperations"
    ADD CONSTRAINT "ManufacturingOperations_pkey" PRIMARY KEY (id);


--
-- Name: Rules Rules_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Rules"
    ADD CONSTRAINT "Rules_pkey" PRIMARY KEY (id);


--
-- Name: Departments departments_org_id_code_unique; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Departments"
    ADD CONSTRAINT departments_org_id_code_unique UNIQUE (org_id, code);


--
-- Name: DeptColumns dept_columns_org_dept_key_unique; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."DeptColumns"
    ADD CONSTRAINT dept_columns_org_dept_key_unique UNIQUE (org_id, dept_code, column_key);


--
-- Name: Formulas formulas_org_key_unique; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Formulas"
    ADD CONSTRAINT formulas_org_key_unique UNIQUE (org_id, formula_key);


--
-- Name: ManufacturingOperations mfg_ops_org_industry_suffix_unique; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."ManufacturingOperations"
    ADD CONSTRAINT mfg_ops_org_industry_suffix_unique UNIQUE (org_id, industry_code, process_suffix);


--
-- Name: Rules rules_org_id_rule_id_version_unique; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Rules"
    ADD CONSTRAINT rules_org_id_rule_id_version_unique UNIQUE (org_id, rule_id, version);


--
-- Name: active_org_contexts active_org_contexts_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.active_org_contexts
    ADD CONSTRAINT active_org_contexts_pkey PRIMARY KEY (backend_pid);


--
-- Name: session_org_contexts session_org_contexts_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.session_org_contexts
    ADD CONSTRAINT session_org_contexts_pkey PRIMARY KEY (session_token);


--
-- Name: admin_ip_allowlist admin_ip_allowlist_org_cidr_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_ip_allowlist
    ADD CONSTRAINT admin_ip_allowlist_org_cidr_unique UNIQUE (org_id, cidr);


--
-- Name: admin_ip_allowlist admin_ip_allowlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_ip_allowlist
    ADD CONSTRAINT admin_ip_allowlist_pkey PRIMARY KEY (id);


--
-- Name: allergens allergens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allergens
    ADD CONSTRAINT allergens_pkey PRIMARY KEY (code);


--
-- Name: audit_events audit_events_dept_column_denied_security_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.audit_events
    ADD CONSTRAINT audit_events_dept_column_denied_security_check CHECK (((action <> 'dept_column_denied'::text) OR ((after_state IS NOT NULL) AND (after_state ? 'dept_id'::text) AND (after_state ? 'column_key'::text) AND (after_state ? 'actor_user_id'::text)))) NOT VALID;


--
-- Name: CONSTRAINT audit_events_dept_column_denied_security_check ON audit_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT audit_events_dept_column_denied_security_check ON public.audit_events IS 'T-083: dept_column_denied audit events require dept_id, column_key, and actor_user_id in after_state';


--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pk PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_01 audit_log_2026_01_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_01
    ADD CONSTRAINT audit_log_2026_01_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_02 audit_log_2026_02_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_02
    ADD CONSTRAINT audit_log_2026_02_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_03 audit_log_2026_03_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_03
    ADD CONSTRAINT audit_log_2026_03_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_04 audit_log_2026_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_04
    ADD CONSTRAINT audit_log_2026_04_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_05 audit_log_2026_05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_05
    ADD CONSTRAINT audit_log_2026_05_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_06 audit_log_2026_06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_06
    ADD CONSTRAINT audit_log_2026_06_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_07 audit_log_2026_07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_07
    ADD CONSTRAINT audit_log_2026_07_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_08 audit_log_2026_08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_08
    ADD CONSTRAINT audit_log_2026_08_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_09 audit_log_2026_09_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_09
    ADD CONSTRAINT audit_log_2026_09_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_10 audit_log_2026_10_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_10
    ADD CONSTRAINT audit_log_2026_10_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_11 audit_log_2026_11_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_11
    ADD CONSTRAINT audit_log_2026_11_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_12 audit_log_2026_12_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_12
    ADD CONSTRAINT audit_log_2026_12_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: bom_item bom_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_item
    ADD CONSTRAINT bom_item_pkey PRIMARY KEY (id);


--
-- Name: consumed_approval_tokens consumed_approval_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumed_approval_tokens
    ADD CONSTRAINT consumed_approval_tokens_pkey PRIMARY KEY (jti);


--
-- Name: dept_column_drafts dept_column_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dept_column_drafts
    ADD CONSTRAINT dept_column_drafts_pkey PRIMARY KEY (id);


--
-- Name: dept_column_migrations dept_column_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dept_column_migrations
    ADD CONSTRAINT dept_column_migrations_pkey PRIMARY KEY (id);


--
-- Name: e_sign_log e_sign_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.e_sign_log
    ADD CONSTRAINT e_sign_log_pkey PRIMARY KEY (signature_id);


--
-- Name: e_sign_log e_sign_log_signer_user_id_subject_hash_intent_nonce_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.e_sign_log
    ADD CONSTRAINT e_sign_log_signer_user_id_subject_hash_intent_nonce_key UNIQUE (signer_user_id, subject_hash, intent, nonce);


--
-- Name: gdpr_erasure_requests gdpr_erasure_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gdpr_erasure_requests
    ADD CONSTRAINT gdpr_erasure_requests_pkey PRIMARY KEY (id);


--
-- Name: idempotency_keys idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (transaction_id);


--
-- Name: line_machines line_machines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.line_machines
    ADD CONSTRAINT line_machines_pkey PRIMARY KEY (line_id, machine_id);


--
-- Name: locations locations_org_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_org_id_code_key UNIQUE (org_id, code);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: lot lot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lot
    ADD CONSTRAINT lot_pkey PRIMARY KEY (id);


--
-- Name: machines machines_org_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT machines_org_id_code_key UNIQUE (org_id, code);


--
-- Name: machines machines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT machines_pkey PRIMARY KEY (id);


--
-- Name: mfa_secrets mfa_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_secrets
    ADD CONSTRAINT mfa_secrets_pkey PRIMARY KEY (user_id);


--
-- Name: modules modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_pkey PRIMARY KEY (code);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id, org_id, category, event);


--
-- Name: org_security_policies org_security_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_security_policies
    ADD CONSTRAINT org_security_policies_pkey PRIMARY KEY (org_id);


--
-- Name: organization_modules organization_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_modules
    ADD CONSTRAINT organization_modules_pkey PRIMARY KEY (org_id, module_code);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: outbox_dead_letter outbox_dead_letter_outbox_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_dead_letter
    ADD CONSTRAINT outbox_dead_letter_outbox_event_id_key UNIQUE (outbox_event_id);


--
-- Name: outbox_dead_letter outbox_dead_letter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_dead_letter
    ADD CONSTRAINT outbox_dead_letter_pkey PRIMARY KEY (id);


--
-- Name: outbox_events outbox_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_events
    ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (id);


--
-- Name: password_history password_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_history
    ADD CONSTRAINT password_history_pkey PRIMARY KEY (id);


--
-- Name: production_lines production_lines_org_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_lines
    ADD CONSTRAINT production_lines_org_id_code_key UNIQUE (org_id, code);


--
-- Name: production_lines production_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_lines
    ADD CONSTRAINT production_lines_pkey PRIMARY KEY (id);


--
-- Name: quality_event quality_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_event
    ADD CONSTRAINT quality_event_pkey PRIMARY KEY (id);


--
-- Name: recovery_codes recovery_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_codes
    ADD CONSTRAINT recovery_codes_pkey PRIMARY KEY (id);


--
-- Name: reference_csv_import_reports reference_csv_import_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_csv_import_reports
    ADD CONSTRAINT reference_csv_import_reports_pkey PRIMARY KEY (id);


--
-- Name: reference_schemas reference_schemas_org_id_table_code_column_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_schemas
    ADD CONSTRAINT reference_schemas_org_id_table_code_column_code_key UNIQUE (org_id, table_code, column_code);


--
-- Name: reference_schemas reference_schemas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_schemas
    ADD CONSTRAINT reference_schemas_pkey PRIMARY KEY (id);


--
-- Name: reference_tables reference_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_tables
    ADD CONSTRAINT reference_tables_pkey PRIMARY KEY (org_id, table_code, row_key);


--
-- Name: role_categories role_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_categories
    ADD CONSTRAINT role_categories_pkey PRIMARY KEY (role_code);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission);


--
-- Name: roles roles_org_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_org_id_slug_key UNIQUE (org_id, slug);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: rule_definitions rule_definitions_org_id_rule_code_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_definitions
    ADD CONSTRAINT rule_definitions_org_id_rule_code_version_key UNIQUE (org_id, rule_code, version);


--
-- Name: rule_definitions rule_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_definitions
    ADD CONSTRAINT rule_definitions_pkey PRIMARY KEY (id);


--
-- Name: rule_dry_runs rule_dry_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_dry_runs
    ADD CONSTRAINT rule_dry_runs_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: scim_group_members scim_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_group_members
    ADD CONSTRAINT scim_group_members_pkey PRIMARY KEY (group_id, user_id);


--
-- Name: scim_groups scim_groups_org_id_display_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_groups
    ADD CONSTRAINT scim_groups_org_id_display_name_key UNIQUE (org_id, display_name);


--
-- Name: scim_groups scim_groups_org_id_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_groups
    ADD CONSTRAINT scim_groups_org_id_external_id_key UNIQUE (org_id, external_id);


--
-- Name: scim_groups scim_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_groups
    ADD CONSTRAINT scim_groups_pkey PRIMARY KEY (id);


--
-- Name: scim_tokens scim_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_tokens
    ADD CONSTRAINT scim_tokens_pkey PRIMARY KEY (id);


--
-- Name: shipment shipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment
    ADD CONSTRAINT shipment_pkey PRIMARY KEY (id);


--
-- Name: tax_codes tax_codes_org_id_code_effective_from_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_codes
    ADD CONSTRAINT tax_codes_org_id_code_effective_from_key UNIQUE (org_id, code, effective_from);


--
-- Name: tax_codes tax_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_codes
    ADD CONSTRAINT tax_codes_pkey PRIMARY KEY (id);


--
-- Name: tenant_idp_config tenant_idp_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_idp_config
    ADD CONSTRAINT tenant_idp_config_pkey PRIMARY KEY (tenant_id);


--
-- Name: tenant_migrations tenant_migrations_l2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_migrations
    ADD CONSTRAINT tenant_migrations_l2_pkey PRIMARY KEY (id);


--
-- Name: tenant_migrations_legacy_t038 tenant_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_migrations_legacy_t038
    ADD CONSTRAINT tenant_migrations_pkey PRIMARY KEY (tenant_id, component);


--
-- Name: tenant_variations tenant_variations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_variations
    ADD CONSTRAINT tenant_variations_pkey PRIMARY KEY (org_id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: user_pins user_pins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_pins
    ADD CONSTRAINT user_pins_pkey PRIMARY KEY (user_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_org_id_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_org_id_email_unique UNIQUE (org_id, email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: warehouses warehouses_org_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_org_id_code_key UNIQUE (org_id, code);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: work_order work_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order
    ADD CONSTRAINT work_order_pkey PRIMARY KEY (id);


--
-- Name: departments_org_id_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX departments_org_id_idx ON "Reference"."Departments" USING btree (org_id);


--
-- Name: dept_columns_org_dept_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX dept_columns_org_dept_idx ON "Reference"."DeptColumns" USING btree (org_id, dept_code);


--
-- Name: dept_columns_schema_version_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX dept_columns_schema_version_idx ON "Reference"."DeptColumns" USING btree (org_id, dept_code, schema_version);


--
-- Name: formulas_org_id_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX formulas_org_id_idx ON "Reference"."Formulas" USING btree (org_id);


--
-- Name: mfg_ops_org_id_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX mfg_ops_org_id_idx ON "Reference"."ManufacturingOperations" USING btree (org_id);


--
-- Name: mfg_ops_org_industry_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX mfg_ops_org_industry_idx ON "Reference"."ManufacturingOperations" USING btree (org_id, industry_code);


--
-- Name: rules_active_range_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX rules_active_range_idx ON "Reference"."Rules" USING btree (org_id, active_from, active_to);


--
-- Name: rules_org_id_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX rules_org_id_idx ON "Reference"."Rules" USING btree (org_id);


--
-- Name: rules_rule_type_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX rules_rule_type_idx ON "Reference"."Rules" USING btree (rule_type);


--
-- Name: session_org_contexts_created_at_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX session_org_contexts_created_at_idx ON app.session_org_contexts USING btree (created_at);


--
-- Name: admin_ip_allowlist_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_ip_allowlist_org_created_idx ON public.admin_ip_allowlist USING btree (org_id, created_at DESC);


--
-- Name: audit_events_org_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_org_occurred_idx ON public.audit_events USING btree (org_id, occurred_at);


--
-- Name: audit_events_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_request_id_idx ON public.audit_events USING btree (request_id);


--
-- Name: audit_events_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_resource_idx ON public.audit_events USING btree (resource_type, resource_id);


--
-- Name: audit_log_org_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_org_occurred_idx ON ONLY public.audit_log USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_01_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_01_org_id_occurred_at_idx ON public.audit_log_2026_01 USING btree (org_id, occurred_at);


--
-- Name: audit_log_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_request_id_idx ON ONLY public.audit_log USING btree (request_id);


--
-- Name: audit_log_2026_01_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_01_request_id_idx ON public.audit_log_2026_01 USING btree (request_id);


--
-- Name: audit_log_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_resource_idx ON ONLY public.audit_log USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_01_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_01_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_01 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_02_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_02_org_id_occurred_at_idx ON public.audit_log_2026_02 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_02_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_02_request_id_idx ON public.audit_log_2026_02 USING btree (request_id);


--
-- Name: audit_log_2026_02_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_02_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_02 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_03_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_03_org_id_occurred_at_idx ON public.audit_log_2026_03 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_03_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_03_request_id_idx ON public.audit_log_2026_03 USING btree (request_id);


--
-- Name: audit_log_2026_03_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_03_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_03 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_04_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_04_org_id_occurred_at_idx ON public.audit_log_2026_04 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_04_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_04_request_id_idx ON public.audit_log_2026_04 USING btree (request_id);


--
-- Name: audit_log_2026_04_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_04_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_04 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_05_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_05_org_id_occurred_at_idx ON public.audit_log_2026_05 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_05_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_05_request_id_idx ON public.audit_log_2026_05 USING btree (request_id);


--
-- Name: audit_log_2026_05_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_05_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_05 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_06_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_06_org_id_occurred_at_idx ON public.audit_log_2026_06 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_06_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_06_request_id_idx ON public.audit_log_2026_06 USING btree (request_id);


--
-- Name: audit_log_2026_06_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_06_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_06 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_07_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_07_org_id_occurred_at_idx ON public.audit_log_2026_07 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_07_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_07_request_id_idx ON public.audit_log_2026_07 USING btree (request_id);


--
-- Name: audit_log_2026_07_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_07_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_07 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_08_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_08_org_id_occurred_at_idx ON public.audit_log_2026_08 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_08_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_08_request_id_idx ON public.audit_log_2026_08 USING btree (request_id);


--
-- Name: audit_log_2026_08_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_08_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_08 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_09_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_09_org_id_occurred_at_idx ON public.audit_log_2026_09 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_09_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_09_request_id_idx ON public.audit_log_2026_09 USING btree (request_id);


--
-- Name: audit_log_2026_09_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_09_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_09 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_10_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_10_org_id_occurred_at_idx ON public.audit_log_2026_10 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_10_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_10_request_id_idx ON public.audit_log_2026_10 USING btree (request_id);


--
-- Name: audit_log_2026_10_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_10_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_10 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_11_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_11_org_id_occurred_at_idx ON public.audit_log_2026_11 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_11_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_11_request_id_idx ON public.audit_log_2026_11 USING btree (request_id);


--
-- Name: audit_log_2026_11_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_11_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_11 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_12_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_12_org_id_occurred_at_idx ON public.audit_log_2026_12 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_12_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_12_request_id_idx ON public.audit_log_2026_12 USING btree (request_id);


--
-- Name: audit_log_2026_12_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_12_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_12 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: bom_item_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bom_item_org_created_idx ON public.bom_item USING btree (org_id, created_at DESC);


--
-- Name: consumed_approval_tokens_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consumed_approval_tokens_org_idx ON public.consumed_approval_tokens USING btree (org_id, consumed_at);


--
-- Name: dept_column_drafts_org_dept_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dept_column_drafts_org_dept_idx ON public.dept_column_drafts USING btree (org_id, dept_id);


--
-- Name: dept_column_drafts_org_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dept_column_drafts_org_status_idx ON public.dept_column_drafts USING btree (org_id, status);


--
-- Name: dept_column_migrations_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dept_column_migrations_org_idx ON public.dept_column_migrations USING btree (org_id);


--
-- Name: dept_column_migrations_unique_per_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX dept_column_migrations_unique_per_version ON public.dept_column_migrations USING btree (dept_column_id, new_version);


--
-- Name: e_sign_log_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX e_sign_log_org_created_idx ON public.e_sign_log USING btree (org_id, created_at);


--
-- Name: e_sign_log_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX e_sign_log_subject_idx ON public.e_sign_log USING btree (org_id, subject_hash, intent);


--
-- Name: gdpr_erasure_requests_org_requested_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gdpr_erasure_requests_org_requested_idx ON public.gdpr_erasure_requests USING btree (org_id, requested_at);


--
-- Name: gdpr_erasure_requests_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gdpr_erasure_requests_pending_idx ON public.gdpr_erasure_requests USING btree (requested_at, id) WHERE (status = 'pending'::text);


--
-- Name: idempotency_keys_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idempotency_keys_expires_at_idx ON public.idempotency_keys USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idempotency_keys_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idempotency_keys_org_id_idx ON public.idempotency_keys USING btree (org_id);


--
-- Name: line_machines_machine_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX line_machines_machine_idx ON public.line_machines USING btree (machine_id);


--
-- Name: locations_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX locations_org_idx ON public.locations USING btree (org_id);


--
-- Name: locations_org_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX locations_org_path_idx ON public.locations USING btree (org_id, path text_pattern_ops);


--
-- Name: locations_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX locations_path_idx ON public.locations USING btree (path text_pattern_ops);


--
-- Name: locations_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX locations_warehouse_idx ON public.locations USING btree (warehouse_id);


--
-- Name: lot_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lot_org_created_idx ON public.lot USING btree (org_id, created_at DESC);


--
-- Name: machines_location_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX machines_location_idx ON public.machines USING btree (location_id);


--
-- Name: machines_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX machines_org_idx ON public.machines USING btree (org_id);


--
-- Name: mfa_secrets_last_otp_window_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfa_secrets_last_otp_window_idx ON public.mfa_secrets USING btree (user_id, last_otp_window);


--
-- Name: notification_preferences_org_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_preferences_org_event_idx ON public.notification_preferences USING btree (org_id, category, event);


--
-- Name: organization_modules_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_modules_org_id_idx ON public.organization_modules USING btree (org_id);


--
-- Name: organizations_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_slug_unique ON public.organizations USING btree (slug);


--
-- Name: organizations_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_tenant_id_idx ON public.organizations USING btree (tenant_id);


--
-- Name: outbox_events_retry_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbox_events_retry_pending_idx ON public.outbox_events USING btree (org_id, created_at) WHERE ((consumed_at IS NULL) AND (dead_lettered_at IS NULL));


--
-- Name: outbox_events_unconsumed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbox_events_unconsumed_idx ON public.outbox_events USING btree (org_id, created_at) WHERE (consumed_at IS NULL);


--
-- Name: password_history_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_history_user_id_created_at_idx ON public.password_history USING btree (user_id, created_at DESC);


--
-- Name: production_lines_default_location_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX production_lines_default_location_idx ON public.production_lines USING btree (default_location_id);


--
-- Name: production_lines_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX production_lines_org_idx ON public.production_lines USING btree (org_id);


--
-- Name: quality_event_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quality_event_org_created_idx ON public.quality_event USING btree (org_id, created_at DESC);


--
-- Name: reference_csv_import_reports_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reference_csv_import_reports_org_idx ON public.reference_csv_import_reports USING btree (org_id, expires_at);


--
-- Name: reference_schemas_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reference_schemas_org_id_idx ON public.reference_schemas USING btree (org_id);


--
-- Name: reference_schemas_org_table_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reference_schemas_org_table_code_idx ON public.reference_schemas USING btree (org_id, table_code);


--
-- Name: reference_schemas_table_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reference_schemas_table_code_idx ON public.reference_schemas USING btree (table_code);


--
-- Name: reference_tables_org_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reference_tables_org_active_idx ON public.reference_tables USING btree (org_id, is_active);


--
-- Name: reference_tables_org_table_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reference_tables_org_table_idx ON public.reference_tables USING btree (org_id, table_code);


--
-- Name: roles_org_id_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX roles_org_id_code_unique ON public.roles USING btree (org_id, code);


--
-- Name: roles_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roles_org_id_idx ON public.roles USING btree (org_id);


--
-- Name: rule_definitions_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_definitions_org_id_idx ON public.rule_definitions USING btree (org_id);


--
-- Name: rule_definitions_org_rule_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_definitions_org_rule_code_idx ON public.rule_definitions USING btree (org_id, rule_code);


--
-- Name: rule_dry_runs_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_dry_runs_org_id_idx ON public.rule_dry_runs USING btree (org_id);


--
-- Name: rule_dry_runs_org_rule_definition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_dry_runs_org_rule_definition_idx ON public.rule_dry_runs USING btree (org_id, rule_definition_id);


--
-- Name: schema_migrations_filename_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX schema_migrations_filename_unique ON public.schema_migrations USING btree (filename) WHERE (filename IS NOT NULL);


--
-- Name: schema_migrations_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schema_migrations_org_id_idx ON public.schema_migrations USING btree (org_id);


--
-- Name: schema_migrations_org_table_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schema_migrations_org_table_code_idx ON public.schema_migrations USING btree (org_id, table_code);


--
-- Name: schema_migrations_table_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schema_migrations_table_code_idx ON public.schema_migrations USING btree (table_code);


--
-- Name: scim_group_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scim_group_members_user_idx ON public.scim_group_members USING btree (user_id);


--
-- Name: scim_groups_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scim_groups_org_idx ON public.scim_groups USING btree (org_id);


--
-- Name: scim_tokens_last_four_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scim_tokens_last_four_active_idx ON public.scim_tokens USING btree (scim_token_last_four) WHERE (revoked_at IS NULL);


--
-- Name: scim_tokens_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scim_tokens_org_created_idx ON public.scim_tokens USING btree (org_id, created_at DESC);


--
-- Name: shipment_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipment_org_created_idx ON public.shipment USING btree (org_id, created_at DESC);


--
-- Name: tax_codes_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_codes_org_idx ON public.tax_codes USING btree (org_id);


--
-- Name: tenant_idp_config_scim_last_four_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_idp_config_scim_last_four_idx ON public.tenant_idp_config USING btree (scim_token_last_four);


--
-- Name: tenant_migrations_cohort_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_migrations_cohort_status_idx ON public.tenant_migrations_legacy_t038 USING btree (cohort, status);


--
-- Name: tenant_migrations_l2_org_component_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_migrations_l2_org_component_idx ON public.tenant_migrations USING btree (org_id, component);


--
-- Name: tenant_migrations_l2_org_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_migrations_l2_org_status_idx ON public.tenant_migrations USING btree (org_id, status);


--
-- Name: users_org_id_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_org_id_active_idx ON public.users USING btree (org_id) WHERE (deleted_at IS NULL);


--
-- Name: users_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_org_id_idx ON public.users USING btree (org_id);


--
-- Name: warehouses_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warehouses_org_idx ON public.warehouses USING btree (org_id);


--
-- Name: work_order_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_order_org_created_idx ON public.work_order USING btree (org_id, created_at DESC);


--
-- Name: audit_log_2026_01_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_01_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_01_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_01_pkey;


--
-- Name: audit_log_2026_01_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_01_request_id_idx;


--
-- Name: audit_log_2026_01_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_01_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_02_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_02_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_02_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_02_pkey;


--
-- Name: audit_log_2026_02_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_02_request_id_idx;


--
-- Name: audit_log_2026_02_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_02_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_03_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_03_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_03_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_03_pkey;


--
-- Name: audit_log_2026_03_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_03_request_id_idx;


--
-- Name: audit_log_2026_03_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_03_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_04_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_04_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_04_pkey;


--
-- Name: audit_log_2026_04_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_04_request_id_idx;


--
-- Name: audit_log_2026_04_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_04_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_05_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_05_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_05_pkey;


--
-- Name: audit_log_2026_05_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_05_request_id_idx;


--
-- Name: audit_log_2026_05_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_05_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_06_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_06_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_06_pkey;


--
-- Name: audit_log_2026_06_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_06_request_id_idx;


--
-- Name: audit_log_2026_06_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_06_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_07_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_07_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_07_pkey;


--
-- Name: audit_log_2026_07_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_07_request_id_idx;


--
-- Name: audit_log_2026_07_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_07_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_08_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_08_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_08_pkey;


--
-- Name: audit_log_2026_08_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_08_request_id_idx;


--
-- Name: audit_log_2026_08_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_08_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_09_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_09_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_09_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_09_pkey;


--
-- Name: audit_log_2026_09_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_09_request_id_idx;


--
-- Name: audit_log_2026_09_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_09_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_10_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_10_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_10_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_10_pkey;


--
-- Name: audit_log_2026_10_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_10_request_id_idx;


--
-- Name: audit_log_2026_10_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_10_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_11_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_11_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_11_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_11_pkey;


--
-- Name: audit_log_2026_11_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_11_request_id_idx;


--
-- Name: audit_log_2026_11_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_11_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_12_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_12_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_12_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_12_pkey;


--
-- Name: audit_log_2026_12_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_12_request_id_idx;


--
-- Name: audit_log_2026_12_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_12_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_events audit_events_impersonation_guard_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_events_impersonation_guard_trg BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.audit_events_impersonation_guard();


--
-- Name: reference_tables reference_tables_set_version; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reference_tables_set_version BEFORE UPDATE ON public.reference_tables FOR EACH ROW EXECUTE FUNCTION app.reference_tables_set_version();


--
-- Name: organizations seed_system_roles_on_org_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER seed_system_roles_on_org_insert AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_system_roles_on_org_insert();


--
-- Name: tenant_idp_config tenant_idp_config_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tenant_idp_config_touch_updated_at BEFORE UPDATE ON public.tenant_idp_config FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: tenants tenants_seed_idp_config; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tenants_seed_idp_config AFTER INSERT ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.seed_tenant_idp_config();


--
-- Name: organizations trg_seed_reference_data; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_seed_reference_data AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_reference_data_on_org_insert();


--
-- Name: user_pins trg_user_pins_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_pins_updated_at BEFORE UPDATE ON public.user_pins FOR EACH ROW EXECUTE FUNCTION public.set_user_pins_updated_at();


--
-- Name: DeptColumns DeptColumns_field_type_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."DeptColumns"
    ADD CONSTRAINT "DeptColumns_field_type_fkey" FOREIGN KEY (field_type) REFERENCES "Reference"."FieldTypes"(code);


--
-- Name: ManufacturingOperations ManufacturingOperations_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."ManufacturingOperations"
    ADD CONSTRAINT "ManufacturingOperations_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: Rules Rules_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Rules"
    ADD CONSTRAINT "Rules_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: active_org_contexts active_org_contexts_org_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.active_org_contexts
    ADD CONSTRAINT active_org_contexts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: active_org_contexts active_org_contexts_session_token_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.active_org_contexts
    ADD CONSTRAINT active_org_contexts_session_token_fkey FOREIGN KEY (session_token) REFERENCES app.session_org_contexts(session_token) ON DELETE CASCADE;


--
-- Name: session_org_contexts session_org_contexts_org_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.session_org_contexts
    ADD CONSTRAINT session_org_contexts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: admin_ip_allowlist admin_ip_allowlist_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_ip_allowlist
    ADD CONSTRAINT admin_ip_allowlist_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: admin_ip_allowlist admin_ip_allowlist_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_ip_allowlist
    ADD CONSTRAINT admin_ip_allowlist_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: audit_log audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.audit_log
    ADD CONSTRAINT audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.audit_log
    ADD CONSTRAINT audit_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: bom_item bom_item_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_item
    ADD CONSTRAINT bom_item_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: consumed_approval_tokens consumed_approval_tokens_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumed_approval_tokens
    ADD CONSTRAINT consumed_approval_tokens_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: dept_column_drafts dept_column_drafts_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dept_column_drafts
    ADD CONSTRAINT dept_column_drafts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: e_sign_log e_sign_log_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.e_sign_log
    ADD CONSTRAINT e_sign_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: e_sign_log e_sign_log_signer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.e_sign_log
    ADD CONSTRAINT e_sign_log_signer_user_id_fkey FOREIGN KEY (signer_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: gdpr_erasure_requests gdpr_erasure_requests_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gdpr_erasure_requests
    ADD CONSTRAINT gdpr_erasure_requests_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: line_machines line_machines_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.line_machines
    ADD CONSTRAINT line_machines_line_id_fkey FOREIGN KEY (line_id) REFERENCES public.production_lines(id) ON DELETE CASCADE;


--
-- Name: line_machines line_machines_machine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.line_machines
    ADD CONSTRAINT line_machines_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES public.machines(id) ON DELETE CASCADE;


--
-- Name: locations locations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: locations locations_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.locations(id) ON DELETE RESTRICT;


--
-- Name: locations locations_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;


--
-- Name: lot lot_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lot
    ADD CONSTRAINT lot_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: machines machines_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT machines_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: machines machines_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT machines_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: mfa_secrets mfa_secrets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_secrets
    ADD CONSTRAINT mfa_secrets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: org_security_policies org_security_policies_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_security_policies
    ADD CONSTRAINT org_security_policies_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_modules organization_modules_enabled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_modules
    ADD CONSTRAINT organization_modules_enabled_by_fkey FOREIGN KEY (enabled_by) REFERENCES public.users(id);


--
-- Name: organization_modules organization_modules_module_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_modules
    ADD CONSTRAINT organization_modules_module_code_fkey FOREIGN KEY (module_code) REFERENCES public.modules(code);


--
-- Name: organization_modules organization_modules_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_modules
    ADD CONSTRAINT organization_modules_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: organizations organizations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: password_history password_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_history
    ADD CONSTRAINT password_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: production_lines production_lines_default_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_lines
    ADD CONSTRAINT production_lines_default_location_id_fkey FOREIGN KEY (default_location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: production_lines production_lines_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_lines
    ADD CONSTRAINT production_lines_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: quality_event quality_event_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_event
    ADD CONSTRAINT quality_event_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: recovery_codes recovery_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_codes
    ADD CONSTRAINT recovery_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reference_csv_import_reports reference_csv_import_reports_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_csv_import_reports
    ADD CONSTRAINT reference_csv_import_reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: reference_csv_import_reports reference_csv_import_reports_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_csv_import_reports
    ADD CONSTRAINT reference_csv_import_reports_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: reference_schemas reference_schemas_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_schemas
    ADD CONSTRAINT reference_schemas_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: reference_schemas reference_schemas_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_schemas
    ADD CONSTRAINT reference_schemas_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: reference_tables reference_tables_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_tables
    ADD CONSTRAINT reference_tables_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: reference_tables reference_tables_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_tables
    ADD CONSTRAINT reference_tables_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: roles roles_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: rule_definitions rule_definitions_deployed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_definitions
    ADD CONSTRAINT rule_definitions_deployed_by_fkey FOREIGN KEY (deployed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: rule_definitions rule_definitions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_definitions
    ADD CONSTRAINT rule_definitions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: rule_dry_runs rule_dry_runs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_dry_runs
    ADD CONSTRAINT rule_dry_runs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: rule_dry_runs rule_dry_runs_ran_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_dry_runs
    ADD CONSTRAINT rule_dry_runs_ran_by_fkey FOREIGN KEY (ran_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: rule_dry_runs rule_dry_runs_rule_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_dry_runs
    ADD CONSTRAINT rule_dry_runs_rule_definition_id_fkey FOREIGN KEY (rule_definition_id) REFERENCES public.rule_definitions(id) ON DELETE CASCADE;


--
-- Name: schema_migrations schema_migrations_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: schema_migrations schema_migrations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: scim_group_members scim_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_group_members
    ADD CONSTRAINT scim_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.scim_groups(id) ON DELETE CASCADE;


--
-- Name: scim_groups scim_groups_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_groups
    ADD CONSTRAINT scim_groups_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: scim_tokens scim_tokens_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_tokens
    ADD CONSTRAINT scim_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: scim_tokens scim_tokens_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_tokens
    ADD CONSTRAINT scim_tokens_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: shipment shipment_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment
    ADD CONSTRAINT shipment_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: tax_codes tax_codes_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_codes
    ADD CONSTRAINT tax_codes_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: tenant_idp_config tenant_idp_config_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_idp_config
    ADD CONSTRAINT tenant_idp_config_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_migrations tenant_migrations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_migrations
    ADD CONSTRAINT tenant_migrations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: tenant_migrations tenant_migrations_scheduled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_migrations
    ADD CONSTRAINT tenant_migrations_scheduled_by_fkey FOREIGN KEY (scheduled_by) REFERENCES public.users(id);


--
-- Name: tenant_variations tenant_variations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_variations
    ADD CONSTRAINT tenant_variations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_pins user_pins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_pins
    ADD CONSTRAINT user_pins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: warehouses warehouses_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: work_order work_order_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order
    ADD CONSTRAINT work_order_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: Departments; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."Departments" ENABLE ROW LEVEL SECURITY;

--
-- Name: Departments Departments_org_isolation; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "Departments_org_isolation" ON "Reference"."Departments" USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: DeptColumns; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."DeptColumns" ENABLE ROW LEVEL SECURITY;

--
-- Name: FieldTypes; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."FieldTypes" ENABLE ROW LEVEL SECURITY;

--
-- Name: Formulas; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."Formulas" ENABLE ROW LEVEL SECURITY;

--
-- Name: ManufacturingOperations; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."ManufacturingOperations" ENABLE ROW LEVEL SECURITY;

--
-- Name: ManufacturingOperations ManufacturingOperations_org_isolation; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "ManufacturingOperations_org_isolation" ON "Reference"."ManufacturingOperations" USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: Rules; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."Rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: DeptColumns dept_columns_org_context; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY dept_columns_org_context ON "Reference"."DeptColumns" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: FieldTypes field_types_readable; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY field_types_readable ON "Reference"."FieldTypes" FOR SELECT TO app_user USING (true);


--
-- Name: Formulas formulas_org_context; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY formulas_org_context ON "Reference"."Formulas" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: Rules rules_org_context; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY rules_org_context ON "Reference"."Rules" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: admin_ip_allowlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_ip_allowlist ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_ip_allowlist admin_ip_allowlist_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_ip_allowlist_org_context ON public.admin_ip_allowlist TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: allergens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.allergens ENABLE ROW LEVEL SECURITY;

--
-- Name: allergens allergens_app_user_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allergens_app_user_read ON public.allergens FOR SELECT TO app_user USING (true);


--
-- Name: audit_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_events audit_events_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_events_org_context ON public.audit_events TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_01; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_01 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_02; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_02 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_03; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_03 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_04; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_04 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_05; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_05 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_06; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_06 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_07; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_07 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_08; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_08 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_09; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_09 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_10; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_10 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_11; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_11 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_12; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_12 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_log_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_org_context ON public.audit_log TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: bom_item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bom_item ENABLE ROW LEVEL SECURITY;

--
-- Name: bom_item bom_item_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bom_item_org_context ON public.bom_item TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: consumed_approval_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consumed_approval_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: consumed_approval_tokens consumed_approval_tokens_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consumed_approval_tokens_org_context ON public.consumed_approval_tokens TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: dept_column_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dept_column_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: dept_column_drafts dept_column_drafts_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_column_drafts_org_context ON public.dept_column_drafts TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: dept_column_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dept_column_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: dept_column_migrations dept_column_migrations_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_column_migrations_org_context ON public.dept_column_migrations TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: e_sign_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.e_sign_log ENABLE ROW LEVEL SECURITY;

--
-- Name: e_sign_log e_sign_log_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY e_sign_log_org_context ON public.e_sign_log TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: gdpr_erasure_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gdpr_erasure_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: gdpr_erasure_requests gdpr_erasure_requests_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gdpr_erasure_requests_org_context ON public.gdpr_erasure_requests TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: idempotency_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: idempotency_keys idempotency_keys_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY idempotency_keys_org_context ON public.idempotency_keys TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: line_machines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.line_machines ENABLE ROW LEVEL SECURITY;

--
-- Name: line_machines line_machines_app_user_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY line_machines_app_user_access ON public.line_machines TO app_user USING (true) WITH CHECK (true);


--
-- Name: locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

--
-- Name: locations locations_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY locations_org_context_delete ON public.locations FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: locations locations_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY locations_org_context_insert ON public.locations FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: locations locations_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY locations_org_context_select ON public.locations FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: locations locations_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY locations_org_context_update ON public.locations FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: lot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lot ENABLE ROW LEVEL SECURITY;

--
-- Name: lot lot_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lot_org_context ON public.lot TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: machines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;

--
-- Name: machines machines_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY machines_org_context_delete ON public.machines FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: machines machines_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY machines_org_context_insert ON public.machines FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: machines machines_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY machines_org_context_select ON public.machines FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: machines machines_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY machines_org_context_update ON public.machines FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: mfa_secrets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mfa_secrets ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_secrets mfa_secrets_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mfa_secrets_org_context ON public.mfa_secrets USING ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.org_id = app.current_org_id()))));


--
-- Name: modules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

--
-- Name: modules modules_app_user_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modules_app_user_read ON public.modules FOR SELECT TO app_user USING (true);


--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences notification_preferences_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_preferences_org_context ON public.notification_preferences TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: org_security_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_security_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: org_security_policies org_security_policies_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_security_policies_org_context ON public.org_security_policies TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: organization_modules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_modules ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_modules organization_modules_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_modules_org_context ON public.organization_modules TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations organizations_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_org_context ON public.organizations TO app_user USING ((id = app.current_org_id())) WITH CHECK ((id = app.current_org_id()));


--
-- Name: outbox_dead_letter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outbox_dead_letter ENABLE ROW LEVEL SECURITY;

--
-- Name: outbox_dead_letter outbox_dead_letter_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY outbox_dead_letter_org_context ON public.outbox_dead_letter TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: outbox_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;

--
-- Name: outbox_events outbox_events_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY outbox_events_org_context ON public.outbox_events TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: password_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;

--
-- Name: password_history password_history_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY password_history_org_context ON public.password_history TO app_user USING ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.org_id = app.current_org_id())))) WITH CHECK ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.org_id = app.current_org_id()))));


--
-- Name: production_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.production_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: production_lines production_lines_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_lines_org_context_delete ON public.production_lines FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: production_lines production_lines_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_lines_org_context_insert ON public.production_lines FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: production_lines production_lines_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_lines_org_context_select ON public.production_lines FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: production_lines production_lines_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_lines_org_context_update ON public.production_lines FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: quality_event; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quality_event ENABLE ROW LEVEL SECURITY;

--
-- Name: quality_event quality_event_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quality_event_org_context ON public.quality_event TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: recovery_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recovery_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: recovery_codes recovery_codes_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recovery_codes_org_context ON public.recovery_codes USING ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.org_id = app.current_org_id()))));


--
-- Name: reference_csv_import_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reference_csv_import_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: reference_csv_import_reports reference_csv_import_reports_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_csv_import_reports_org_context ON public.reference_csv_import_reports TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: reference_schemas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reference_schemas ENABLE ROW LEVEL SECURITY;

--
-- Name: reference_schemas reference_schemas_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_schemas_org_context_delete ON public.reference_schemas FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: reference_schemas reference_schemas_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_schemas_org_context_insert ON public.reference_schemas FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: reference_schemas reference_schemas_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_schemas_org_context_select ON public.reference_schemas FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: reference_schemas reference_schemas_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_schemas_org_context_update ON public.reference_schemas FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: reference_tables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reference_tables ENABLE ROW LEVEL SECURITY;

--
-- Name: reference_tables reference_tables_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_tables_org_context_delete ON public.reference_tables FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: reference_tables reference_tables_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_tables_org_context_insert ON public.reference_tables FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: reference_tables reference_tables_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_tables_org_context_select ON public.reference_tables FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: reference_tables reference_tables_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_tables_org_context_update ON public.reference_tables FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: role_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: role_categories role_categories_app_user_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_categories_app_user_read ON public.role_categories FOR SELECT TO app_user USING (true);


--
-- Name: role_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permissions role_permissions_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_permissions_org_context ON public.role_permissions TO app_user USING ((role_id IN ( SELECT roles.id
   FROM public.roles
  WHERE (roles.org_id = app.current_org_id())))) WITH CHECK ((role_id IN ( SELECT roles.id
   FROM public.roles
  WHERE (roles.org_id = app.current_org_id()))));


--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: roles roles_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_org_context ON public.roles TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: rule_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rule_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: rule_definitions rule_definitions_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rule_definitions_org_context_delete ON public.rule_definitions FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: rule_definitions rule_definitions_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rule_definitions_org_context_insert ON public.rule_definitions FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: rule_definitions rule_definitions_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rule_definitions_org_context_select ON public.rule_definitions FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: rule_definitions rule_definitions_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rule_definitions_org_context_update ON public.rule_definitions FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: rule_dry_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rule_dry_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: rule_dry_runs rule_dry_runs_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rule_dry_runs_org_context_delete ON public.rule_dry_runs FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: rule_dry_runs rule_dry_runs_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rule_dry_runs_org_context_insert ON public.rule_dry_runs FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: rule_dry_runs rule_dry_runs_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rule_dry_runs_org_context_select ON public.rule_dry_runs FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: rule_dry_runs rule_dry_runs_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rule_dry_runs_org_context_update ON public.rule_dry_runs FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations schema_migrations_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY schema_migrations_org_context ON public.schema_migrations TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: scim_group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scim_group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: scim_group_members scim_group_members_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scim_group_members_org_context_delete ON public.scim_group_members FOR DELETE TO app_user USING ((EXISTS ( SELECT 1
   FROM public.scim_groups g
  WHERE ((g.id = scim_group_members.group_id) AND (g.org_id = app.current_org_id())))));


--
-- Name: scim_group_members scim_group_members_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scim_group_members_org_context_insert ON public.scim_group_members FOR INSERT TO app_user WITH CHECK ((EXISTS ( SELECT 1
   FROM public.scim_groups g
  WHERE ((g.id = scim_group_members.group_id) AND (g.org_id = app.current_org_id())))));


--
-- Name: scim_group_members scim_group_members_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scim_group_members_org_context_select ON public.scim_group_members FOR SELECT TO app_user USING ((EXISTS ( SELECT 1
   FROM public.scim_groups g
  WHERE ((g.id = scim_group_members.group_id) AND (g.org_id = app.current_org_id())))));


--
-- Name: scim_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scim_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: scim_groups scim_groups_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scim_groups_org_context_delete ON public.scim_groups FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: scim_groups scim_groups_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scim_groups_org_context_insert ON public.scim_groups FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: scim_groups scim_groups_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scim_groups_org_context_select ON public.scim_groups FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: scim_groups scim_groups_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scim_groups_org_context_update ON public.scim_groups FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: scim_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scim_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: scim_tokens scim_tokens_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scim_tokens_org_context ON public.scim_tokens TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: shipment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipment ENABLE ROW LEVEL SECURITY;

--
-- Name: shipment shipment_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shipment_org_context ON public.shipment TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: tax_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_codes tax_codes_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_codes_org_context_delete ON public.tax_codes FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: tax_codes tax_codes_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_codes_org_context_insert ON public.tax_codes FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: tax_codes tax_codes_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_codes_org_context_select ON public.tax_codes FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: tax_codes tax_codes_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_codes_org_context_update ON public.tax_codes FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: tenant_idp_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_idp_config ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_idp_config tenant_idp_config_current_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_idp_config_current_org_context ON public.tenant_idp_config TO app_user USING ((EXISTS ( SELECT 1
   FROM public.organizations org
  WHERE ((org.tenant_id = tenant_idp_config.tenant_id) AND (org.id = app.current_org_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organizations org
  WHERE ((org.tenant_id = tenant_idp_config.tenant_id) AND (org.id = app.current_org_id())))));


--
-- Name: tenant_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_migrations_legacy_t038; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_migrations_legacy_t038 ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_migrations tenant_migrations_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_migrations_org_context ON public.tenant_migrations TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: tenant_variations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_variations ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_variations tenant_variations_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_variations_org_context ON public.tenant_variations TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants tenants_current_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenants_current_org_context ON public.tenants TO app_user USING ((EXISTS ( SELECT 1
   FROM public.organizations org
  WHERE ((org.tenant_id = tenants.id) AND (org.id = app.current_org_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organizations org
  WHERE ((org.tenant_id = tenants.id) AND (org.id = app.current_org_id())))));


--
-- Name: user_pins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_pins ENABLE ROW LEVEL SECURITY;

--
-- Name: user_pins user_pins_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_pins_org_context ON public.user_pins TO app_user USING ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.org_id = app.current_org_id())))) WITH CHECK ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.org_id = app.current_org_id()))));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user_roles_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_org_context ON public.user_roles TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_org_context ON public.users TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: warehouses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouses warehouses_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_org_context_delete ON public.warehouses FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: warehouses warehouses_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_org_context_insert ON public.warehouses FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: warehouses warehouses_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_org_context_select ON public.warehouses FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: warehouses warehouses_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_org_context_update ON public.warehouses FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: work_order; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_order ENABLE ROW LEVEL SECURITY;

--
-- Name: work_order work_order_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_order_org_context ON public.work_order TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- PostgreSQL database dump complete
--


