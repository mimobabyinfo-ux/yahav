-- Community events ("הקהילה של מימו")
-- Tables: community_events, event_registrations
-- RPCs:   get_community_events, get_event_attendees,
--         register_for_event, cancel_event_registration
--
-- Note: these tables and RPCs were applied directly to production in
-- commit 989e048 (2026-08-02). This migration records them so a fresh
-- database rebuild includes everything.

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  emoji         text,
  event_type    text,
  description   text,
  event_date    date NOT NULL,
  start_time    time,
  end_time      time,
  location      text,
  location_link text,
  capacity      int CHECK (capacity > 0),
  price         numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
  payment_link  text,
  vendor_id     uuid REFERENCES service_partners(id) ON DELETE SET NULL,
  vendor_name   text,
  image_url     text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_registrations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'registered'
               CHECK (status IN ('registered','cancelled','attended','no_show')),
  paid       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_registrations_event_id ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_user_id  ON event_registrations(user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE community_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations  ENABLE ROW LEVEL SECURITY;

-- community_events: admin full access; authenticated users read-only
CREATE POLICY "admin_all_community_events" ON community_events
  FOR ALL TO authenticated
  USING  ((SELECT is_admin FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "authenticated_read_active_events" ON community_events
  FOR SELECT TO authenticated
  USING (is_active = true);

-- event_registrations: admin can read all; users manage their own rows
CREATE POLICY "admin_all_event_registrations" ON event_registrations
  FOR ALL TO authenticated
  USING  ((SELECT is_admin FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "user_own_event_registrations" ON event_registrations
  FOR ALL TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── RPCs ─────────────────────────────────────────────────────────────────────

-- get_community_events()
-- Returns all active events ordered by date, enriched with the calling
-- user's registration status and the live registered-count. Exposed to
-- authenticated users; the community_events RLS policies handle row
-- visibility (only is_active=true for non-admins).
CREATE OR REPLACE FUNCTION get_community_events()
RETURNS TABLE (
  id               uuid,
  title            text,
  emoji            text,
  event_type       text,
  description      text,
  event_date       date,
  start_time       time,
  end_time         time,
  location         text,
  location_link    text,
  capacity         int,
  price            numeric,
  payment_link     text,
  vendor_name      text,
  image_url        text,
  registered_count bigint,
  my_status        text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.title,
    e.emoji,
    e.event_type,
    e.description,
    e.event_date,
    e.start_time,
    e.end_time,
    e.location,
    e.location_link,
    e.capacity,
    e.price,
    e.payment_link,
    e.vendor_name,
    e.image_url,
    (
      SELECT count(*)
      FROM event_registrations r
      WHERE r.event_id = e.id
        AND r.status IN ('registered', 'attended')
    ) AS registered_count,
    (
      SELECT r.status
      FROM event_registrations r
      WHERE r.event_id = e.id
        AND r.user_id = auth.uid()
      LIMIT 1
    ) AS my_status
  FROM community_events e
  WHERE e.is_active = true
  ORDER BY e.event_date, e.start_time NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION get_community_events() TO authenticated;


-- get_event_attendees(p_event_id uuid)
-- Returns the community profile of everyone who is 'registered' or
-- 'attended' for the given event. Phone is included only when
-- community_consent = true (enforced at the DB layer, not just UI).
CREATE OR REPLACE FUNCTION get_event_attendees(p_event_id uuid)
RETURNS TABLE (
  user_id           uuid,
  mother_name       text,
  area              text,
  phone_number      text,
  community_consent boolean,
  community_bio     text,
  community_tags    text[],
  child_dob         date,
  child_gender      text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    up.id                                               AS user_id,
    up.mother_name,
    up.area,
    CASE WHEN up.community_consent THEN up.phone_number ELSE NULL END AS phone_number,
    up.community_consent,
    up.community_bio,
    up.community_tags,
    c.dob    AS child_dob,
    c.gender AS child_gender
  FROM event_registrations er
  JOIN user_profiles up ON up.id = er.user_id
  LEFT JOIN children c ON c.user_id = up.id
  WHERE er.event_id = p_event_id
    AND er.status IN ('registered', 'attended')
    AND er.user_id <> auth.uid()
  ORDER BY er.created_at;
$$;

GRANT EXECUTE ON FUNCTION get_event_attendees(uuid) TO authenticated;


-- register_for_event(p_event_id uuid)
-- Idempotent one-tap registration. Returns:
--   'full'       — capacity reached (do not register)
--   'already'    — user already has an active (registered/attended) status
--   'registered' — freshly registered (or re-activated from cancelled)
-- SECURITY DEFINER so the RPC can bypass RLS and do the capacity check
-- + insert atomically without two round-trips.
CREATE OR REPLACE FUNCTION register_for_event(p_event_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity   int;
  v_count      bigint;
  v_existing   text;
BEGIN
  -- Fetch capacity (NULL = unlimited)
  SELECT capacity INTO v_capacity
  FROM community_events
  WHERE id = p_event_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  -- Check existing registration
  SELECT status INTO v_existing
  FROM event_registrations
  WHERE event_id = p_event_id AND user_id = auth.uid();

  IF FOUND AND v_existing IN ('registered', 'attended') THEN
    RETURN 'already';
  END IF;

  -- Capacity check (only if capacity is set)
  IF v_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM event_registrations
    WHERE event_id = p_event_id AND status IN ('registered', 'attended');

    IF v_count >= v_capacity THEN
      RETURN 'full';
    END IF;
  END IF;

  -- Upsert registration
  INSERT INTO event_registrations (event_id, user_id, status, paid, updated_at)
  VALUES (p_event_id, auth.uid(), 'registered', false, now())
  ON CONFLICT (event_id, user_id)
  DO UPDATE SET status = 'registered', updated_at = now();

  RETURN 'registered';
END;
$$;

GRANT EXECUTE ON FUNCTION register_for_event(uuid) TO authenticated;


-- cancel_event_registration(p_event_id uuid)
-- Soft-cancel: marks the user's row as 'cancelled' (keeps the audit
-- trail), freeing the spot for others.
CREATE OR REPLACE FUNCTION cancel_event_registration(p_event_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE event_registrations
     SET status = 'cancelled', updated_at = now()
   WHERE event_id = p_event_id
     AND user_id = auth.uid()
     AND status IN ('registered', 'attended');
$$;

GRANT EXECUTE ON FUNCTION cancel_event_registration(uuid) TO authenticated;
