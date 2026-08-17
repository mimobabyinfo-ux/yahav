-- event_checkin_tokens: per-event tokens for vendor/host check-in page
-- event_waitlist: FIFO waitlist for full events
-- RPCs: get_event_checkin, get_my_waitlists, join_event_waitlist, leave_event_waitlist
--
-- All four were applied directly to production alongside the check-in and
-- waitlist features (admin handoff phase 6, ~2026-08-06). This file
-- backfills the schema so a fresh database rebuild includes them.
--
-- Must run BEFORE 20260807000000_lead_stages_and_insights_views.sql,
-- which creates v_event_attendance — a view that references event_checkin_tokens.

-- ── event_checkin_tokens ─────────────────────────────────────────────────────
-- One row per event. The token is sent to the vendor/host so they can open
-- the check-in page (?checkin=<token>) without an account. Admin-only write;
-- the get_event_checkin RPC (anon) reads through SECURITY DEFINER.

CREATE TABLE IF NOT EXISTS event_checkin_tokens (
  event_id   uuid PRIMARY KEY REFERENCES community_events(id) ON DELETE CASCADE,
  token      text NOT NULL DEFAULT gen_random_uuid()::text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_checkin_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_event_checkin_tokens" ON event_checkin_tokens;
CREATE POLICY "admin_all_event_checkin_tokens" ON event_checkin_tokens
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true));

-- ── event_waitlist ───────────────────────────────────────────────────────────
-- Simple FIFO waitlist. Status values:
--   waiting   — actively in line
--   removed   — left by the user or removed by admin
--   converted — admin promoted to a registration

CREATE TABLE IF NOT EXISTS event_waitlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'waiting'
               CHECK (status IN ('waiting', 'removed', 'converted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_waitlist_event_id_idx ON event_waitlist(event_id);
CREATE INDEX IF NOT EXISTS event_waitlist_user_id_idx  ON event_waitlist(user_id);

ALTER TABLE event_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_event_waitlist" ON event_waitlist;
CREATE POLICY "admin_all_event_waitlist" ON event_waitlist
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "users_own_event_waitlist" ON event_waitlist;
CREATE POLICY "users_own_event_waitlist" ON event_waitlist
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- ── get_event_checkin(p_token) ───────────────────────────────────────────────
-- Returns registration rows for the event tied to the token. Accessible to
-- anon (no login) — the token IS the credential. Time-gated: only the day
-- before through the day after the event. Returns first names only.

CREATE OR REPLACE FUNCTION get_event_checkin(p_token text)
RETURNS TABLE (
  event_id        uuid,
  title           text,
  emoji           text,
  event_date      date,
  start_time      time,
  end_time        time,
  location        text,
  vendor_name     text,
  registration_id uuid,
  first_name      text,
  status          text
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id                                      AS event_id,
    e.title,
    e.emoji,
    e.event_date,
    e.start_time,
    e.end_time,
    e.location,
    e.vendor_name,
    r.id                                      AS registration_id,
    split_part(coalesce(up.mother_name,''), ' ', 1) AS first_name,
    r.status
  FROM event_checkin_tokens t
  JOIN community_events e    ON e.id  = t.event_id
  JOIN event_registrations r ON r.event_id = e.id
  JOIN user_profiles up      ON up.id = r.user_id
  WHERE t.token = p_token
    AND r.status IN ('registered', 'attended', 'no_show')
    AND e.event_date BETWEEN current_date - 1 AND current_date + 1
  ORDER BY r.created_at;
$$;

GRANT EXECUTE ON FUNCTION get_event_checkin(text) TO anon;
GRANT EXECUTE ON FUNCTION get_event_checkin(text) TO authenticated;

-- ── get_my_waitlists() ───────────────────────────────────────────────────────
-- Returns the calling user's waitlist entries for upcoming events,
-- with their queue position and the total number waiting.

CREATE OR REPLACE FUNCTION get_my_waitlists()
RETURNS TABLE (
  event_id      uuid,
  my_position   int,
  waiting_count int
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      w.event_id,
      w.user_id,
      ROW_NUMBER() OVER (PARTITION BY w.event_id ORDER BY w.created_at)::int AS position,
      COUNT(*)     OVER (PARTITION BY w.event_id)::int                        AS total
    FROM event_waitlist w
    JOIN community_events e ON e.id = w.event_id
    WHERE w.status = 'waiting'
      AND e.event_date >= current_date
  )
  SELECT event_id, position AS my_position, total AS waiting_count
  FROM ranked
  WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION get_my_waitlists() TO authenticated;

-- ── join_event_waitlist(p_event_id) ─────────────────────────────────────────
-- Returns:
--   'not_full'         — event has a free spot; no waitlist entry created
--   'already_registered' — caller already has an active registration
--   'ok'               — added to (or already on) the waitlist

CREATE OR REPLACE FUNCTION join_event_waitlist(p_event_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity   int;
  v_count      int;
  v_reg_status text;
BEGIN
  SELECT capacity INTO v_capacity
    FROM community_events
   WHERE id = p_event_id AND is_active = true;

  SELECT COUNT(*) INTO v_count
    FROM event_registrations
   WHERE event_id = p_event_id AND status IN ('registered', 'attended');

  IF v_capacity IS NULL OR v_count < v_capacity THEN
    RETURN 'not_full';
  END IF;

  SELECT status INTO v_reg_status
    FROM event_registrations
   WHERE event_id = p_event_id AND user_id = auth.uid();

  IF v_reg_status IN ('registered', 'attended') THEN
    RETURN 'already_registered';
  END IF;

  INSERT INTO event_waitlist (event_id, user_id)
  VALUES (p_event_id, auth.uid())
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET status = 'waiting', updated_at = now()
  WHERE event_waitlist.status != 'waiting';

  RETURN 'ok';
END;
$$;

GRANT EXECUTE ON FUNCTION join_event_waitlist(uuid) TO authenticated;

-- ── leave_event_waitlist(p_event_id) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION leave_event_waitlist(p_event_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE event_waitlist
     SET status = 'removed', updated_at = now()
   WHERE event_id = p_event_id
     AND user_id  = auth.uid()
     AND status   = 'waiting';
$$;

GRANT EXECUTE ON FUNCTION leave_event_waitlist(uuid) TO authenticated;
