-- T-064 / FT-004: validate audit_events_role_assigned_security_check.
-- Pre-flight guard keeps VALIDATE from running if target data contains violators.
DO $$
DECLARE
  violating_rows bigint;
BEGIN
  SELECT COUNT(*)
    INTO violating_rows
    FROM public.audit_events
   WHERE action = 'role.assigned'
     AND retention_class <> 'security';

  IF violating_rows <> 0 THEN
    RAISE EXCEPTION
      'audit_events_role_assigned_security_check has % existing violator(s)',
      violating_rows
      USING ERRCODE = '23514';
  END IF;
END
$$;

ALTER TABLE public.audit_events
  VALIDATE CONSTRAINT audit_events_role_assigned_security_check;
