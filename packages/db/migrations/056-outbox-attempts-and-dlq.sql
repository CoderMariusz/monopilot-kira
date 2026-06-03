-- 056 — T-112 outbox retry accounting and dead-letter queue
--
-- Fixes the audited outbox accumulation gap by adding bounded retry metadata
-- and an org-scoped DLQ. Wave0 lock: all business scoping remains org_id and
-- RLS uses app.current_org_id().

ALTER TABLE public.outbox_events
  ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_text text;

CREATE INDEX IF NOT EXISTS outbox_events_retry_pending_idx
  ON public.outbox_events (org_id, created_at)
  WHERE consumed_at IS NULL
    AND dead_lettered_at IS NULL;

CREATE TABLE IF NOT EXISTS public.outbox_dead_letter (
  id              bigserial    PRIMARY KEY,
  outbox_event_id bigint       NOT NULL UNIQUE,
  org_id          uuid         NOT NULL,
  event_type      text         NOT NULL,
  aggregate_type  text         NOT NULL,
  aggregate_id    uuid         NOT NULL,
  payload         jsonb        NOT NULL,
  created_at      timestamptz  NOT NULL,
  consumed_at     timestamptz,
  app_version     text         NOT NULL,
  attempts        int          NOT NULL,
  failed_at       timestamptz  NOT NULL DEFAULT pg_catalog.now(),
  last_error_text text         NOT NULL,
  CONSTRAINT outbox_dead_letter_attempts_check CHECK (attempts >= 0)
);

ALTER TABLE public.outbox_dead_letter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_dead_letter FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outbox_dead_letter_org_context ON public.outbox_dead_letter;
CREATE POLICY outbox_dead_letter_org_context
  ON public.outbox_dead_letter
  FOR ALL
  TO app_user
  USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

REVOKE ALL ON public.outbox_dead_letter FROM PUBLIC;
GRANT SELECT, INSERT ON public.outbox_dead_letter TO app_user;
GRANT USAGE, SELECT ON SEQUENCE public.outbox_dead_letter_id_seq TO app_user;
