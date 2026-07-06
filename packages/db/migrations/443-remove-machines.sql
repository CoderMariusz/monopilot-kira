-- Migration 443 — Wave 3: remove the legacy machines concept.
--
-- Apply only after the Wave-3 app code has deployed. The migration keeps M1-M7
-- in one transaction so no environment can be left half-remapped.
--
-- M1 pre-flight to run first:
--   SELECT count(*) FROM allergen_contamination_risk WHERE line_id IS NULL;
--
-- M3 pre-flight to run first:
--   SELECT count(*) FROM routing_operations WHERE machine_id IS NOT NULL;
--   Intended tooling data loss: machine_id is dropped after owner confirmation
--   on live.

BEGIN;

-- M1. allergen_contamination_risk: remap machine-targeted rows to the first
-- line in line_machines, collapse the line natural key, then remove machine_id.
DO $$
BEGIN
  IF to_regclass('public.allergen_contamination_risk') IS NOT NULL THEN
    IF to_regclass('public.line_machines') IS NOT NULL
       AND EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'allergen_contamination_risk'
            AND column_name = 'machine_id'
       )
       AND EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'allergen_contamination_risk'
            AND column_name = 'line_id'
       ) THEN
      WITH first_line AS (
        SELECT DISTINCT ON (machine_id)
               machine_id,
               line_id
          FROM public.line_machines
         ORDER BY machine_id, sequence ASC, line_id ASC
      )
      UPDATE public.allergen_contamination_risk r
         SET line_id = f.line_id
        FROM first_line f
       WHERE r.line_id IS NULL
         AND r.machine_id = f.machine_id;
    END IF;

    DELETE FROM public.allergen_contamination_risk
     WHERE line_id IS NULL;

    WITH ranked AS (
      SELECT id,
             org_id,
             line_id,
             allergen_code,
             first_value(risk_level) OVER (
               PARTITION BY org_id, line_id, allergen_code
               ORDER BY CASE risk_level
                          WHEN 'high' THEN 4
                          WHEN 'medium' THEN 3
                          WHEN 'low' THEN 2
                          WHEN 'segregated' THEN 1
                          ELSE 0
                        END DESC,
                        updated_at DESC,
                        id ASC
             ) AS kept_risk_level,
             first_value(mitigation) OVER (
               PARTITION BY org_id, line_id, allergen_code
               ORDER BY (mitigation IS NOT NULL) DESC, updated_at DESC, id ASC
             ) AS kept_mitigation,
             row_number() OVER (
               PARTITION BY org_id, line_id, allergen_code
               ORDER BY CASE risk_level
                          WHEN 'high' THEN 4
                          WHEN 'medium' THEN 3
                          WHEN 'low' THEN 2
                          WHEN 'segregated' THEN 1
                          ELSE 0
                        END DESC,
                        updated_at DESC,
                        id ASC
             ) AS rn
        FROM public.allergen_contamination_risk
       WHERE line_id IS NOT NULL
    ),
    winners AS (
      UPDATE public.allergen_contamination_risk r
         SET risk_level = ranked.kept_risk_level,
             mitigation = ranked.kept_mitigation
        FROM ranked
       WHERE r.id = ranked.id
         AND ranked.rn = 1
      RETURNING r.id
    )
    DELETE FROM public.allergen_contamination_risk r
     USING ranked
     WHERE r.id = ranked.id
       AND ranked.rn > 1;

    ALTER TABLE public.allergen_contamination_risk
      DROP CONSTRAINT IF EXISTS allergen_contamination_risk_target_check;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_constraint
       WHERE conrelid = 'public.allergen_contamination_risk'::regclass
         AND conname = 'allergen_contamination_risk_line_required_check'
    ) THEN
      ALTER TABLE public.allergen_contamination_risk
        ADD CONSTRAINT allergen_contamination_risk_line_required_check
        CHECK (line_id IS NOT NULL);
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_allergen_contamination_risk_line_key
      ON public.allergen_contamination_risk (org_id, line_id, allergen_code);

    DROP INDEX IF EXISTS public.idx_allergen_contamination_risk_machine;

    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'allergen_contamination_risk'
         AND column_name = 'machine_id'
    ) THEN
      ALTER TABLE public.allergen_contamination_risk
        DROP COLUMN machine_id;
    END IF;
  END IF;
END
$$;

-- M2. capacity_plan_lines: resource_kind machine -> line, then close the enum.
DO $$
BEGIN
  IF to_regclass('public.capacity_plan_lines') IS NOT NULL THEN
    UPDATE public.capacity_plan_lines
       SET resource_kind = 'line'
     WHERE resource_kind = 'machine';

    ALTER TABLE public.capacity_plan_lines
      DROP CONSTRAINT IF EXISTS capacity_plan_lines_resource_kind_check;

    ALTER TABLE public.capacity_plan_lines
      ADD CONSTRAINT capacity_plan_lines_resource_kind_check
      CHECK (resource_kind IN ('line', 'labour'));
  END IF;
END
$$;

-- M3. routing_operations: remove machine_id and require line_id.
DO $$
BEGIN
  IF to_regclass('public.routing_operations') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.idx_routing_operations_machine;

    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'routing_operations'
         AND column_name = 'machine_id'
    ) THEN
      ALTER TABLE public.routing_operations
        DROP COLUMN machine_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_constraint
       WHERE conrelid = 'public.routing_operations'::regclass
         AND conname = 'routing_operations_line_required_check'
    ) THEN
      ALTER TABLE public.routing_operations
        ADD CONSTRAINT routing_operations_line_required_check
        CHECK (line_id IS NOT NULL);
    END IF;
  END IF;
END
$$;

-- M4. wo_operations + work_orders: remove machine_id.
DO $$
BEGIN
  IF to_regclass('public.wo_operations') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.idx_wo_operations_machine;

    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'wo_operations'
         AND column_name = 'machine_id'
    ) THEN
      ALTER TABLE public.wo_operations
        DROP COLUMN machine_id;
    END IF;
  END IF;

  IF to_regclass('public.work_orders') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.idx_work_orders_machine;

    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'work_orders'
         AND column_name = 'machine_id'
    ) THEN
      ALTER TABLE public.work_orders
        DROP COLUMN machine_id;
    END IF;
  END IF;
END
$$;

-- M5. maintenance_work_orders: remove machine_id and its real index.
DO $$
BEGIN
  IF to_regclass('public.maintenance_work_orders') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.idx_mwo_machine;

    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'maintenance_work_orders'
         AND column_name = 'machine_id'
    ) THEN
      ALTER TABLE public.maintenance_work_orders
        DROP COLUMN machine_id;
    END IF;
  END IF;
END
$$;

-- M6. Remove the machine outbox event and any remaining machine_id schema row.
DO $$
DECLARE
  _allowed text[];
  _allowed_sql text;
BEGIN
  IF to_regclass('public.outbox_events') IS NOT NULL THEN
    SELECT array_agg(DISTINCT m[1] ORDER BY m[1])
      INTO _allowed
      FROM pg_constraint c
      CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS m
     WHERE c.conrelid = 'public.outbox_events'::regclass
       AND c.conname = 'outbox_events_event_type_check'
       AND m[1] <> 'settings.machine.upserted';

    IF coalesce(array_length(_allowed, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Cannot rebuild outbox_events_event_type_check: existing allowed event list not found';
    END IF;

    SELECT string_agg(quote_literal(event_type), ', ' ORDER BY event_type)
      INTO _allowed_sql
      FROM unnest(_allowed) AS event_type;

    ALTER TABLE public.outbox_events
      DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;

    EXECUTE format(
      'ALTER TABLE public.outbox_events ADD CONSTRAINT outbox_events_event_type_check CHECK (event_type = ANY (ARRAY[%s]::text[]))',
      _allowed_sql
    );

    COMMENT ON CONSTRAINT outbox_events_event_type_check ON public.outbox_events
      IS 'Wave 3 regenerated from prior DB_EVENT_TYPES CHECK with settings.machine.upserted removed.';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.reference_schemas') IS NOT NULL THEN
    DELETE FROM public.reference_schemas
     WHERE table_code = 'reference.processes'
       AND column_code = 'machine_id';
  END IF;
END
$$;

-- M7. Drop the legacy machine tables after every dependent column is gone.
DROP TABLE IF EXISTS public.line_machines;
DROP TABLE IF EXISTS public.machines;

COMMIT;
