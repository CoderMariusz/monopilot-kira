-- T-087 / FT-027: allow unauthenticated security audit events before org context.
-- Wave0: org_id remains the business scope; app_user RLS still uses app.current_org_id().

ALTER TABLE public.audit_events
  ALTER COLUMN org_id DROP NOT NULL;

ALTER TABLE public.audit_events
  ADD COLUMN IF NOT EXISTS is_unauthenticated boolean NOT NULL DEFAULT false;

UPDATE public.audit_events
SET
  org_id = NULL,
  is_unauthenticated = true
WHERE org_id = '00000000-0000-0000-0000-000000000000'::uuid;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_org_context ON public.audit_events;
CREATE POLICY audit_events_org_context
  ON public.audit_events
  FOR ALL
  TO app_user
  USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());
