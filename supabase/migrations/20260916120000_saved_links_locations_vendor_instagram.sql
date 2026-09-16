-- Brenda 16.9.26, three asks in one message:
--
--  1. "שמירה של לינקים לתשלום בתוך האפליקציה שאוכל לשייך אותם בקלות ...
--     פשוט אחפש שמות של הלינקים ... וגם מיקומים - הסטודיו ברמת גן שיהיה
--     כבר שמור איפשהו ואני רק ארשום את השם שלו והוא יופיע"
--  2. "זה שאני צריך להכניס את המזהה מוצר כל פעם ... אני רוצה שזה יקרה
--     אוטומטית". And the bug that prompted it: the pelvic-floor lecture
--     was saved with the standing 30 ₪ link but NO morning_product_id, so
--     morning-paid looked for events carrying that product id, found the
--     two older ones, and logged no_seat_match for every payment (14 to
--     16.9, morning_webhook_log). The mothers paid and the app kept
--     saying "להסדיר תשלום".
--  3. A vendor's Instagram on the event.
--
-- The design: a payment LINK is a Morning product. One url, one product
-- id, forever. So the product id belongs to the link, not to the event,
-- and once we know it for a url we know it for every event that uses
-- that url. saved_payment_links holds that knowledge; a trigger copies
-- it onto community_events on every insert/update; and morning-paid v18
-- writes it back the first time a new link is paid (see the function).
-- The admin form no longer shows a product id field at all.

-- ── 1. Saved payment links ──────────────────────────────────────────────
create table if not exists saved_payment_links (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  url                text not null unique,
  morning_product_id text,
  amount             numeric,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table saved_payment_links is
  'Morning payment links Brenda reuses across community events, by name. morning_product_id is learned from the first webhook delivery when not set by hand.';

alter table saved_payment_links enable row level security;
drop policy if exists "admins manage saved_payment_links" on saved_payment_links;
create policy "admins manage saved_payment_links" on saved_payment_links
  for all using (is_admin()) with check (is_admin());

-- ── 2. Saved locations ──────────────────────────────────────────────────
create table if not exists saved_locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  link       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table saved_locations is
  'Places Brenda hosts community events at, by name, with the navigation link. Picked by name in the event form.';

alter table saved_locations enable row level security;
drop policy if exists "admins manage saved_locations" on saved_locations;
create policy "admins manage saved_locations" on saved_locations
  for all using (is_admin()) with check (is_admin());

-- ── 3. Vendor Instagram on the event ────────────────────────────────────
alter table community_events add column if not exists vendor_instagram text;
comment on column community_events.vendor_instagram is
  'Instagram handle or url of the person running the event. Shown to mothers on the card and on the public page.';

-- ── 4. Product id follows the link ─────────────────────────────────────
-- Both directions, both triggered by a plain save:
--   link known  -> event gets the product id (fills the field she used to type)
--   event knows -> link learns it (a product id typed once, or learned by
--                  the webhook, becomes the link's for good)
create or replace function community_events_sync_product_ids()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid text;
begin
  -- single-seat link
  if new.payment_link is not null then
    if new.morning_product_id is null then
      select morning_product_id into v_pid
        from saved_payment_links where url = new.payment_link;
      if v_pid is not null then new.morning_product_id := v_pid; end if;
    else
      update saved_payment_links
         set morning_product_id = new.morning_product_id, updated_at = now()
       where url = new.payment_link and morning_product_id is null;
    end if;
  end if;

  -- link for two
  if new.payment_link_pair is not null then
    if new.morning_product_id_pair is null then
      select morning_product_id into v_pid
        from saved_payment_links where url = new.payment_link_pair;
      if v_pid is not null then new.morning_product_id_pair := v_pid; end if;
    else
      update saved_payment_links
         set morning_product_id = new.morning_product_id_pair, updated_at = now()
       where url = new.payment_link_pair and morning_product_id is null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists community_events_sync_product_ids on community_events;
create trigger community_events_sync_product_ids
  before insert or update of payment_link, payment_link_pair, morning_product_id, morning_product_id_pair
  on community_events
  for each row execute function community_events_sync_product_ids();

-- ── 5. Seed from what is already in the events table ───────────────────
-- Every url that some event already carries a product id for. Names are
-- a first guess she can rename in the admin.
insert into saved_payment_links (name, url, morning_product_id, amount)
select distinct on (e.payment_link)
       case when e.price = 30 then 'דמי רצינות 30 ₪ (יחיד)'
            else e.title || ' (יחיד) ₪' || e.price::int end,
       e.payment_link, e.morning_product_id, e.price
  from community_events e
 where e.payment_link is not null
 order by e.payment_link, (e.morning_product_id is null), e.event_date desc
on conflict (url) do update
  set morning_product_id = coalesce(saved_payment_links.morning_product_id, excluded.morning_product_id);

insert into saved_payment_links (name, url, morning_product_id, amount)
select distinct on (e.payment_link_pair)
       case when e.price = 30 then 'דמי רצינות 60 ₪ (זוג)'
            else e.title || ' (זוג) ₪' || (e.price * 2)::int end,
       e.payment_link_pair, e.morning_product_id_pair, e.price * 2
  from community_events e
 where e.payment_link_pair is not null
 order by e.payment_link_pair, (e.morning_product_id_pair is null), e.event_date desc
on conflict (url) do update
  set morning_product_id = coalesce(saved_payment_links.morning_product_id, excluded.morning_product_id);

-- Locations: one row per distinct name, the most recent link wins.
insert into saved_locations (name, link)
select distinct on (trim(e.location)) trim(e.location), e.location_link
  from community_events e
 where e.location is not null and trim(e.location) <> ''
 order by trim(e.location), e.event_date desc
on conflict (name) do nothing;

-- ── 6. Backfill: every event that uses a known link gets its product id ─
-- This is the pelvic-floor fix applied to the whole table. Touching
-- morning_product_id fires the trigger, which fills from the link.
update community_events e
   set morning_product_id = l.morning_product_id
  from saved_payment_links l
 where l.url = e.payment_link
   and e.morning_product_id is null
   and l.morning_product_id is not null;

update community_events e
   set morning_product_id_pair = l.morning_product_id
  from saved_payment_links l
 where l.url = e.payment_link_pair
   and e.morning_product_id_pair is null
   and l.morning_product_id is not null;

-- ── 7. RPCs return vendor_instagram ────────────────────────────────────
-- Return type changes, so drop + create.
drop function if exists get_community_events(date, date);
create or replace function get_community_events(p_from date default null, p_to date default null)
returns table(
  id uuid, title text, emoji text, event_type text, description text,
  event_date date, start_time time, end_time time,
  location text, location_link text, capacity integer, price numeric,
  payment_link text, payment_link_pair text, vendor_name text, vendor_instagram text,
  image_url text, registered_count bigint, my_status text, my_guests text[],
  my_paid boolean, my_hold_expires_at timestamptz, my_payment_claimed_at timestamptz,
  my_extra_guests text[], my_extra_hold_expires_at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select e.id, e.title, e.emoji, e.event_type, e.description,
         e.event_date, e.start_time, e.end_time,
         e.location, e.location_link, e.capacity, e.price,
         e.payment_link, e.payment_link_pair,
         coalesce(sp.title, e.vendor_name) as vendor_name,
         e.vendor_instagram,
         e.image_url,
         event_seats_taken(e.id)::bigint as registered_count,
         mine.status, mine.guest_names, mine.paid, mine.hold_expires_at,
         mine.payment_claimed_at,
         mine.extra_guest_names, mine.extra_hold_expires_at
  from community_events e
  left join service_partners sp on sp.id = e.vendor_id
  left join lateral (
    select r.status, r.guest_names, r.paid, r.hold_expires_at, r.payment_claimed_at,
           r.extra_guest_names, r.extra_hold_expires_at
    from event_registrations r
    where r.event_id = e.id and r.user_id = auth.uid()
  ) mine on true
  where e.is_active = true
    and e.event_date >= coalesce(p_from, (now() at time zone 'Asia/Jerusalem')::date)
    and (p_to is null or e.event_date <= p_to)
    and auth.uid() is not null
  order by e.event_date, e.start_time nulls last;
$$;
grant execute on function get_community_events(date, date) to authenticated;

drop function if exists get_public_event(uuid);
create or replace function get_public_event(p_event_id uuid)
returns table(
  id uuid, title text, emoji text, description text,
  event_date date, start_time time, end_time time,
  location text, location_link text, price numeric, image_url text,
  vendor_name text, vendor_instagram text, is_open boolean
)
language sql stable security definer
set search_path = public
as $$
  select e.id, e.title, e.emoji, e.description,
         e.event_date, e.start_time, e.end_time,
         e.location, e.location_link, e.price, e.image_url,
         coalesce(sp.title, e.vendor_name) as vendor_name,
         e.vendor_instagram,
         (e.is_active
          and e.event_date >= (now() at time zone 'Asia/Jerusalem')::date
          and (e.capacity is null or event_seats_taken(e.id) < e.capacity)) as is_open
    from community_events e
    left join service_partners sp on sp.id = e.vendor_id
   where e.id = p_event_id;
$$;
grant execute on function get_public_event(uuid) to anon, authenticated;
