-- Community events: tables, RLS, and SECURITY DEFINER RPCs
-- Introduced with the community-first redesign (2.8.26 commit 989e048).
--
-- Tables:
--   community_events       — event catalog (title, date, capacity, price, …)
--   event_registrations    — per-user registrations with status + paid flag
--
-- RPCs (SECURITY DEFINER so RLS can be bypassed for aggregates):
--   get_community_events       — returns active future events with live
--                                registered_count and the caller's my_status
--   get_event_attendees(uuid)  — returns public profiles of registered+attended
--                                participants for a given event
--   register_for_event(uuid)   — registers the calling user; enforces capacity
--   cancel_event_registration  — cancels the calling user's registration

-- ── community_events ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text NOT NULL,
  emoji          text,
  event_type     text,
  description    text,
  event_date     date NOT NULL,
  start_time     time,
  end_time       time,
  location       text,
  location_link  text,
  capacity       integer,          -- NULL = unlimited
  price          numeric(10,2) NOT NULL DEFAULT 0,
  payment_link   text,
  vendor_id      uuid REFERENCES service_partners(id) ON DELETE SET NULL,
  vendor_name    text,
  image_url      text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE community_events ENABLE ROW LEVEL SECURITY;

-- Admins can do anything; authenticated users can read active events.
CREATE POLICY "Admins manage community_events"
  ON community_events FOR ALL
  USING ((SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true);

CREATE POLICY "Users read active community_events"
  ON community_events FOR SELECT
  USING (is_active = true);

-- ── event_registrations ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_registrations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'registered'
               CHECK (status IN ('registered', 'cancelled', 'attended', 'no_show')),
  paid       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;

-- Admins can read/write all rows; users can read their own rows.
CREATE POLICY "Admins manage event_registrations"
  ON event_registrations FOR ALL
  USING ((SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true);

CREATE POLICY "Users read own event_registrations"
  ON event_registrations FOR SELECT
  USING (user_id = auth.uid());

-- ── get_community_events() ──────────────────────────────────────────────────
-- Returns upcoming active events with live registered_count and my_status.
-- SECURITY DEFINER so we can bypass RLS on event_registrations for the
-- aggregate count (which would otherwise be filtered to the caller's own rows).

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
  capacity         integer,
  price            numeric,
  payment_link     text,
  vendor_name      text,
  image_url        text,
  registered_count bigint,
  my_status        text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ce.id,
    ce.title,
    ce.emoji,
    ce.event_type,
    ce.description,
    ce.event_date,
    ce.start_time,
    ce.end_time,
    ce.location,
    ce.location_link,
    ce.capacity,
    ce.price,
    ce.payment_link,
    ce.vendor_name,
    ce.image_url,
    COALESCE(
      (SELECT COUNT(*)
         FROM event_registrations er
        WHERE er.event_id = ce.id
          AND er.status IN ('registered', 'attended')),
      0
    ) AS registered_count,
    (SELECT er2.status
       FROM event_registrations er2
      WHERE er2.event_id = ce.id
        AND er2.user_id = auth.uid()
      LIMIT 1
    ) AS my_status
  FROM community_events ce
  WHERE ce.is_active = true
    AND ce.event_date >= CURRENT_DATE
  ORDER BY ce.event_date, ce.start_time NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION get_community_events() TO authenticated;

-- ── get_event_attendees(uuid) ───────────────────────────────────────────────
-- Returns public profile info for registered+attended participants of an event.
-- Only exposes phone_number when the participant has community_consent = true.

CREATE OR REPLACE FUNCTION get_event_attendees(p_event_id uuid)
RETURNS TABLE (
  user_id          uuid,
  mother_name      text,
  area             text,
  phone_number     text,
  community_consent boolean,
  community_bio    text,
  community_tags   text[],
  child_dob        date,
  child_gender     text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    up.id                          AS user_id,
    up.mother_name,
    up.area,
    CASE WHEN up.community_consent = true THEN up.phone_number ELSE NULL END AS phone_number,
    up.community_consent,
    up.community_bio,
    up.community_tags,
    (SELECT c.dob  FROM children c WHERE c.user_id = up.id ORDER BY c.created_at LIMIT 1) AS child_dob,
    (SELECT c.gender FROM children c WHERE c.user_id = up.id ORDER BY c.created_at LIMIT 1) AS child_gender
  FROM event_registrations er
  JOIN user_profiles up ON up.id = er.user_id
  WHERE er.event_id = p_event_id
    AND er.status IN ('registered', 'attended')
    AND er.user_id <> auth.uid()  -- don't show the caller themselves
  ORDER BY er.created_at;
$$;

GRANT EXECUTE ON FUNCTION get_event_attendees(uuid) TO authenticated;

-- ── register_for_event(uuid) ────────────────────────────────────────────────
-- Registers the calling user. Returns:
--   'registered' — success (new registration)
--   'already'    — was already registered (idempotent)
--   'full'       — capacity reached, registration rejected

CREATE OR REPLACE FUNCTION register_for_event(p_event_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity   integer;
  v_count      integer;
  v_existing   text;
BEGIN
  -- Fetch capacity
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

  -- Check capacity (only if not unlimited)
  IF v_capacity IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
      FROM event_registrations
     WHERE event_id = p_event_id
       AND status IN ('registered', 'attended');

    IF v_count >= v_capacity THEN
      RETURN 'full';
    END IF;
  END IF;

  -- Upsert (handles 'cancelled' → 'registered' re-registration)
  INSERT INTO event_registrations (event_id, user_id, status, paid)
    VALUES (p_event_id, auth.uid(), 'registered', false)
    ON CONFLICT (event_id, user_id)
    DO UPDATE SET status = 'registered', updated_at = now();

  RETURN 'registered';
END;
$$;

GRANT EXECUTE ON FUNCTION register_for_event(uuid) TO authenticated;

-- ── cancel_event_registration(uuid) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION cancel_event_registration(p_event_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE event_registrations
     SET status = 'cancelled', updated_at = now()
   WHERE event_id = p_event_id
     AND user_id  = auth.uid()
     AND status = 'registered';
$$;

GRANT EXECUTE ON FUNCTION cancel_event_registration(uuid) TO authenticated;
