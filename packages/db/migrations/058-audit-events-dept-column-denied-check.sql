-- T-083 / FT-023: dept_column_denied audit events must carry security payload keys.
-- NOT VALID: enforces new rows immediately; existing rows are left for a future
-- FT-004-style fresh-DB sweep before validation.

ALTER TABLE public.audit_events
  DROP CONSTRAINT IF EXISTS audit_events_dept_column_denied_security_check;

ALTER TABLE public.audit_events
  ADD CONSTRAINT audit_events_dept_column_denied_security_check
  CHECK (
    action <> 'dept_column_denied'
    OR (
      after_state IS NOT NULL
      AND after_state ? 'dept_id'
      AND after_state ? 'column_key'
      AND after_state ? 'actor_user_id'
    )
  )
  NOT VALID;

COMMENT ON CONSTRAINT audit_events_dept_column_denied_security_check ON public.audit_events
  IS 'T-083: dept_column_denied audit events require dept_id, column_key, and actor_user_id in after_state';
