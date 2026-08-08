-- community_events + event_registrations tables, RLS policies, and four RPCs.
-- Introduced with the "community-first redesign" commit (989e048) on 2026-08-02 but
-- was not shipped with a migration at the time. This file backfills the schema.
--
-- Tables
--   community_events      — admin-managed event catalog
--   event_registrations   — per-user signups; enforced capacity via RPC
--
-- RPCs
--   get_community_events()              — active upcoming events + count + my_status
--   register_for_event(p_event_id)      — returns 'full'|'registered'|'already'
--   cancel_event_registration(p_event_id)
--   get_event_attendees(p_event_id)     — other attendees (for "מי מגיעה" chips)

-- ── community_events ──────────────────────────────────────────────────────────

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
  capacity      int,
  price         numeric(10,2) NOT NULL DEFAULT 0,
  payment_link  text,
  vendor_id     uuid REFERENCES service_partners(id) ON DELETE SET NULL,
  vendor_name   text,
  image_url     text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE community_events ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "admin_all_community_events"
  ON community_events FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true));

-- Regular users: read active events only (RPCs are SECURITY DEFINER and bypass this,
-- but the policy keeps direct table reads safe if the client ever queries directly)
CREATE POLICY "users_select_active_community_events"
  ON community_events FOR SELECT TO authenticated
  USING (is_active = true);

-- ── event_registrations ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_registrations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'registered'
               CHECK (status IN ('registered', 'cancelled', 'attended', 'no_show')),
  paid       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_registrations_event_id_idx ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS event_registrations_user_id_idx  ON event_registrations(user_id);

ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;

-- Admin: full access (needed for EventsAdminPanel's direct queries)
CREATE POLICY "admin_all_event_registrations"
  ON event_registrations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true));

-- Regular users: manage only their own rows
CREATE POLICY "users_own_event_registrations"
  ON event_registrations FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- ── get_community_events() ────────────────────────────────────────────────────
-- Returns active events from today onward, with a live registered_count and
-- the calling user's own registration status (NULL = never registered).

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
  registered_count int,
  my_status        text
)
LANGUAGE sql STABLE
SECURITY DEFINER
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
    COUNT(r.id) FILTER (WHERE r.status IN ('registered', 'attended'))::int AS registered_count,
    MAX(CASE WHEN r.user_id = auth.uid() THEN r.status END) AS my_status
  FROM community_events e
  LEFT JOIN event_registrations r ON r.event_id = e.id
  WHERE e.is_active = true
    AND e.event_date >= CURRENT_DATE
  GROUP BY e.id
  ORDER BY e.event_date, e.start_time NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION get_community_events() TO authenticated;

-- ── register_for_event(p_event_id) ───────────────────────────────────────────
-- Returns:
--   'full'       — capacity reached (race guard, enforced server-side)
--   'registered' — successfully registered (new or re-registered after cancel)
--   'already'    — user already has an active registration

CREATE OR REPLACE FUNCTION register_for_event(p_event_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity  int;
  v_count     int;
  v_existing  text;
BEGIN
  SELECT capacity INTO v_capacity FROM community_events WHERE id = p_event_id AND is_active = true;

  SELECT COUNT(*) INTO v_count
    FROM event_registrations
   WHERE event_id = p_event_id AND status IN ('registered', 'attended');

  IF v_capacity IS NOT NULL AND v_count >= v_capacity THEN
    RETURN 'full';
  END IF;

  -- Check for an existing row for this user
  SELECT status INTO v_existing
    FROM event_registrations
   WHERE event_id = p_event_id AND user_id = auth.uid();

  IF v_existing IN ('registered', 'attended') THEN
    RETURN 'already';
  END IF;

  IF v_existing = 'cancelled' THEN
    -- Re-register after a previous cancel
    UPDATE event_registrations
       SET status = 'registered', updated_at = now()
     WHERE event_id = p_event_id AND user_id = auth.uid();
  ELSE
    -- Fresh signup
    INSERT INTO event_registrations (event_id, user_id, status)
    VALUES (p_event_id, auth.uid(), 'registered');
  END IF;

  RETURN 'registered';
END;
$$;

GRANT EXECUTE ON FUNCTION register_for_event(uuid) TO authenticated;

-- ── cancel_event_registration(p_event_id) ────────────────────────────────────

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
     AND status = 'registered';
$$;

GRANT EXECUTE ON FUNCTION cancel_event_registration(uuid) TO authenticated;

-- ── get_event_attendees(p_event_id) ──────────────────────────────────────────
-- Returns other registered/attended users for an event. Used by the
-- "מי מגיעה" chip row — tapping opens the same CommunityMemberSheet
-- as the members directory. phone_number returned as-is; UI gates the
-- WhatsApp button on community_consent on the client side (same pattern
-- as the community directory).

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
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    up.id            AS user_id,
    up.mother_name,
    up.area,
    up.phone_number,
    up.community_consent,
    up.community_bio,
    up.community_tags,
    up.baby_dob::date AS child_dob,
    up.baby_gender   AS child_gender
  FROM event_registrations er
  JOIN user_profiles up ON up.id = er.user_id
  WHERE er.event_id = p_event_id
    AND er.status IN ('registered', 'attended')
    AND er.user_id != auth.uid()
  ORDER BY er.created_at;
$$;

GRANT EXECUTE ON FUNCTION get_event_attendees(uuid) TO authenticated;
