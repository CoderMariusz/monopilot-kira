-- 521 — hotfix migracji 517: npd_gate_approval_subject_hash padał w runtime
--
-- Objaw (prod, runtime-log): SQLSTATE 42883
--   "function digest(text, unknown) does not exist"
--   where: SQL function "npd_gate_approval_subject_hash" during inlining
-- Skutek: [project-brief] org-scoped read failed -> ekran Brief i bramka NPD
-- degradowały się ("Unable to load the gate checklist").
--
-- Przyczyna: `digest()` pochodzi z pgcrypto, które na tej bazie żyje w schemacie
-- `extensions`, a funkcja nie ma ustawionego search_path — więc nazwa nie
-- rozwiązywała się przy inliningu. PREPARE tego nie wychwycił: ciało funkcji
-- języka SQL jest walidowane dopiero przy wykonaniu, nie przy CREATE.
--
-- Naprawa: wbudowany `sha256(bytea)` (Postgres 11+) zamiast pgcrypto — zero
-- zależności od rozszerzenia i od search_path. Równoważność potwierdzona na
-- prodzie: encode(extensions.digest(x,'sha256'),'hex')
--            = encode(sha256(convert_to(x,'UTF8')),'hex').
-- Wartość hasha się NIE zmienia, więc istniejące korelacje podpisów zostają ważne.

create or replace function public.npd_gate_approval_subject_hash(
  p_project_id uuid,
  p_project_code text,
  p_gate_code text,
  p_decision text
)
returns text
language sql
immutable
parallel safe
as $function$
  select encode(
    sha256(
      convert_to(
        format(
          '{"decision":%s,"gateCode":%s,"projectCode":%s,"projectId":%s}',
          to_json(p_decision),
          to_json(p_gate_code),
          to_json(p_project_code),
          to_json(p_project_id::text)
        ),
        'UTF8'
      )
    ),
    'hex'
  );
$function$;

-- Post-check: funkcja musi teraz faktycznie się wykonać (to jest dokładnie ten
-- krok, którego zabrakło przy 517 — samo CREATE nie dowodzi, że ciało działa).
do $$
declare
  v_hash text;
begin
  select public.npd_gate_approval_subject_hash(
    '00000000-0000-0000-0000-000000000000'::uuid, 'NPD-000', 'G4', 'approved'
  ) into v_hash;

  if v_hash is null or length(v_hash) <> 64 then
    raise exception 'migration 521: npd_gate_approval_subject_hash zwrócił nieprawidłowy hash (%)', v_hash;
  end if;
end;
$$;
