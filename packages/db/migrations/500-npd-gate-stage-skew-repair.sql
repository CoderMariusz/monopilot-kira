-- Migration 500: NPD gate/stage skew repair (C025).
-- Idempotent data-fix mirroring previewGateStageSkewRepairs / repairGateStageSkew in
-- apps/web gate-helpers.ts. Resets G0+recipe (blank-project bug) to G0+brief so the
-- G0→G1→G2 sequence can run after deploy. RAISE NOTICE previews each repaired row.

do $$
declare
  r record;
  aligned_gate text;
begin
  -- G0 requires brief stage — reset skewed stage so G0→G1→G2 can run.
  for r in
    select id, code, current_gate, current_stage
      from public.npd_projects
     where current_gate = 'G0'
       and current_stage <> 'brief'
       and current_gate <> 'Launched'
       and current_stage <> 'launched'
  loop
    raise notice 'npd gate skew repair: id=% code=% gate=% stage=% -> G0+brief',
      r.id, r.code, r.current_gate, r.current_stage;
    update public.npd_projects
       set current_gate = 'G0',
           current_stage = 'brief'
     where id = r.id;
  end loop;

  -- G1 requires brief stage.
  for r in
    select id, code, current_gate, current_stage
      from public.npd_projects
     where current_gate = 'G1'
       and current_stage <> 'brief'
       and current_gate <> 'Launched'
       and current_stage <> 'launched'
  loop
    raise notice 'npd gate skew repair: id=% code=% gate=% stage=% -> G1+brief',
      r.id, r.code, r.current_gate, r.current_stage;
    update public.npd_projects
       set current_gate = 'G1',
           current_stage = 'brief'
     where id = r.id;
  end loop;

  -- Remaining gate/stage mismatches: align gate to the stage-derived value.
  for r in
    select id, code, current_gate, current_stage
      from public.npd_projects
     where current_gate <> 'Launched'
       and current_stage <> 'launched'
       and current_stage <> 'brief'
       and not (
         (current_stage = 'recipe' and current_gate = 'G2')
         or (current_stage in ('packaging', 'costing_nutrition', 'trial', 'sensory', 'pilot')
             and current_gate = 'G3')
         or (current_stage in ('approval', 'handoff') and current_gate = 'G4')
       )
  loop
    aligned_gate := case r.current_stage
      when 'recipe' then 'G2'
      when 'packaging' then 'G3'
      when 'costing_nutrition' then 'G3'
      when 'trial' then 'G3'
      when 'sensory' then 'G3'
      when 'pilot' then 'G3'
      when 'approval' then 'G4'
      when 'handoff' then 'G4'
      else null
    end;

    if aligned_gate is null then
      continue;
    end if;

    raise notice 'npd gate skew repair: id=% code=% gate=% stage=% -> %+%',
      r.id, r.code, r.current_gate, r.current_stage, aligned_gate, r.current_stage;
    update public.npd_projects
       set current_gate = aligned_gate
     where id = r.id;
  end loop;
end $$;
