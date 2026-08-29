-- Buying ONE MORE ticket after you are already registered and paid.
--
-- Brenda 29.8.26: "קניתי כרטיס להרצאת שינה ואז בעלי אמר גם אני רוצה" —
-- she wants a second ticket to be a purchase she can make from inside the
-- app, at the right price, without writing to anyone.
--
-- On 17.8 the old "add a guest after registering" was removed on purpose:
-- it wrote straight into guest_names, so the extra seat was a seat nobody
-- had paid for, and cancelling it minted a ₪60 credit on a ₪30 purchase.
-- That hole is the reason this is NOT a guest-list edit. An extra seat now
-- lives in its own pair of columns, holds a place for ten minutes exactly
-- like a first registration does, and only becomes a real seat when the
-- payment for it comes back — through the thank-you page or, if the browser
-- never returns, through the Morning webhook. paid_amount grows with it, so
-- a later cancellation gives back everything she actually paid.

alter table event_registrations
  add column if not exists extra_guest_names text[] not null default '{}'::text[],
  add column if not exists extra_hold_expires_at timestamptz;

comment on column event_registrations.extra_guest_names is
  'Seats asked for AFTER she was registered and paid. Not seats yet: they move into guest_names only when their payment lands.';
comment on column event_registrations.extra_hold_expires_at is
  'The ten-minute checkout hold on those seats. Past it they stop counting against capacity; past 45 minutes they are abandoned and never promoted.';


-- ── Capacity now sees a seat that is mid-checkout ────────────────────────
-- Without this the room could be sold twice: the extra seat is invisible
-- until it is paid for, so somebody else takes it while she is at Morning.
create or replace function public.event_seats_taken(p_event_id uuid, p_excluding_user uuid default null::uuid)
 returns integer
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    coalesce((
      select sum(
        1 + coalesce(array_length(r.guest_names, 1), 0)
          + case when r.extra_hold_expires_at > now()
                 then coalesce(array_length(r.extra_guest_names, 1), 0)
                 else 0 end)
      from event_registrations r
      where r.event_id = p_event_id
        and (r.status in ('registered', 'attended')
             or (r.status = 'pending' and r.hold_expires_at > now()))
        and (p_excluding_user is null or r.user_id <> p_excluding_user)
    ), 0)::int
    +
    coalesce((
      select count(*)
      from event_waitlist w
      where w.event_id = p_event_id
        and w.status = 'waiting'
        and w.offer_expires_at > now()
        and (p_excluding_user is null or w.user_id <> p_excluding_user)
    ), 0)::int;
$function$;


-- ── Asking for the extra seat ────────────────────────────────────────────
create or replace function public.buy_extra_event_seat(p_event_id uuid, p_guest_names text[] default '{}'::text[])
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  ev community_events;
  v_names text[];
  v_n integer;
  v_status text;
  v_paid boolean;
  v_guests text[];
  v_taken integer;
begin
  if uid is null then return 'unauthorized'; end if;

  v_names := (
    select coalesce(array_agg(g), '{}'::text[])
    from (select btrim(x) as g from unnest(coalesce(p_guest_names, '{}'::text[])) as x
          where btrim(x) <> '' limit 3) s
  );
  v_n := coalesce(array_length(v_names, 1), 0);
  -- The name is what the check-in list is made of; a nameless seat is a
  -- head Brenda cannot match to anyone at the door.
  if v_n = 0 then return 'no_names'; end if;

  select * into ev from community_events where id = p_event_id and is_active = true for update;
  if ev.id is null then return 'not_found'; end if;
  if ev.price <= 0 then return 'free_event'; end if;

  select r.status, r.paid, r.guest_names into v_status, v_paid, v_guests
    from event_registrations r
   where r.event_id = p_event_id and r.user_id = uid
   for update;

  -- Only a mother who is IN, and whose own seat is paid for. A mother still
  -- mid-checkout has to finish that first, otherwise two open payments on
  -- one row are indistinguishable to everything downstream.
  if v_status is null or v_status not in ('registered', 'attended') or not coalesce(v_paid, false) then
    return 'not_registered';
  end if;

  if coalesce(array_length(v_guests, 1), 0) + v_n > 3 then return 'too_many'; end if;

  v_taken := event_seats_taken(p_event_id, uid);
  if ev.capacity is not null
     and v_taken + 1 + coalesce(array_length(v_guests, 1), 0) + v_n > ev.capacity then
    return 'full';
  end if;

  update event_registrations
     set extra_guest_names = v_names,
         extra_hold_expires_at = now() + interval '10 minutes',
         updated_at = now()
   where event_id = p_event_id and user_id = uid;

  return 'pending';
end;
$function$;


-- ── Letting it go ────────────────────────────────────────────────────────
create or replace function public.cancel_extra_event_seat(p_event_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return 'unauthorized'; end if;
  update event_registrations
     set extra_guest_names = '{}'::text[], extra_hold_expires_at = null, updated_at = now()
   where event_id = p_event_id and user_id = uid;
  if not found then return 'not_found'; end if;
  return 'cancelled';
end;
$function$;


-- ── The money arriving ───────────────────────────────────────────────────
-- One promotion path, called from both places a payment can be observed:
-- the thank-you page (mark_event_paid) and the Morning webhook
-- (confirm_event_payment_for_user).
create or replace function public.promote_paid_extra_seats(p_event_id uuid, p_user_id uuid, p_amount numeric default null::numeric)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_extra text[];
  v_until timestamptz;
  v_n integer;
  v_price numeric;
begin
  select r.extra_guest_names, r.extra_hold_expires_at into v_extra, v_until
    from event_registrations r
   where r.event_id = p_event_id and r.user_id = p_user_id
   for update;
  v_n := coalesce(array_length(v_extra, 1), 0);
  if v_n = 0 then return 0; end if;

  -- Abandoned. The browser's own intent key expires after 45 minutes for
  -- the same reason: an unpaid seat left lying around must never be cashed
  -- in by whatever she buys next.
  if v_until is null or v_until < now() - interval '45 minutes' then
    update event_registrations
       set extra_guest_names = '{}'::text[], extra_hold_expires_at = null, updated_at = now()
     where event_id = p_event_id and user_id = p_user_id;
    return 0;
  end if;

  select price into v_price from community_events where id = p_event_id;

  update event_registrations
     -- Capacity is deliberately not re-checked here. She paid; she is not
     -- the one turned away. Over-capacity is Brenda's to see.
     set guest_names = (guest_names || v_extra)[1:3],
         paid = true,
         paid_at = coalesce(paid_at, now()),
         -- Grows, never replaced: a cancellation has to give back the first
         -- ticket AND this one.
         paid_amount = coalesce(paid_amount, 0) + coalesce(p_amount, coalesce(v_price, 0) * v_n),
         extra_guest_names = '{}'::text[], extra_hold_expires_at = null,
         updated_at = now()
   where event_id = p_event_id and user_id = p_user_id;

  return v_n;
end;
$function$;


create or replace function public.mark_event_paid(p_event_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  ev community_events;
  v_status text;
  v_paid boolean;
  v_seats integer;
  v_taken integer;
  v_promoted integer;
begin
  if uid is null then return 'unauthorized'; end if;

  select * into ev from community_events where id = p_event_id for update;
  if ev.id is null then return 'not_found'; end if;

  select status, paid, 1 + coalesce(array_length(guest_names, 1), 0)
    into v_status, v_paid, v_seats
    from event_registrations
   where event_id = p_event_id and user_id = uid;
  if v_status is null then return 'not_found'; end if;

  -- Already in and already paid: the only payment that can be coming back
  -- is for an extra ticket.
  if v_status in ('registered', 'attended') and coalesce(v_paid, false) then
    v_promoted := promote_paid_extra_seats(p_event_id, uid, null);
    if v_promoted > 0 then return 'extra_paid'; end if;
    return 'already';
  end if;

  v_taken := event_seats_taken(p_event_id, uid);

  update event_registrations
     set status = 'registered', paid = true, paid_at = now(),
         paid_amount = coalesce(paid_amount, ev.price * v_seats),
         payment_claimed_at = null,
         hold_expires_at = null, updated_at = now()
   where event_id = p_event_id and user_id = uid;

  if ev.capacity is not null and v_taken + v_seats > ev.capacity then
    return 'over_capacity';
  end if;
  return 'paid';
end;
$function$;


create or replace function public.confirm_event_payment_for_user(p_event_id uuid, p_user_id uuid, p_amount numeric default null::numeric)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  ev community_events;
  v_status text;
  v_paid boolean;
  v_seats integer;
  v_promoted integer;
begin
  select * into ev from community_events where id = p_event_id for update;
  if ev.id is null then return 'not_found'; end if;

  select status, paid, 1 + coalesce(array_length(guest_names, 1), 0)
    into v_status, v_paid, v_seats
    from event_registrations
   where event_id = p_event_id and user_id = p_user_id;

  if v_status is not null and v_paid and v_status in ('registered', 'attended') then
    -- The webhook knows what was actually charged, so the extra seat is
    -- worth exactly that, not what we assumed the link costs.
    v_promoted := promote_paid_extra_seats(p_event_id, p_user_id, p_amount);
    if v_promoted > 0 then return 'extra_confirmed'; end if;
    return 'already';
  end if;

  if v_status is null then
    -- She paid a link without registering first (Brenda sent it directly).
    -- Capacity is deliberately NOT enforced: a woman who has already paid
    -- is never the one turned away. Over-capacity is Brenda's problem to
    -- see, not the payer's to absorb.
    insert into event_registrations (event_id, user_id, status, guest_names, paid, paid_at, paid_amount)
    values (p_event_id, p_user_id, 'registered', '{}'::text[], true, now(),
            coalesce(p_amount, ev.price));
    return 'created';
  end if;

  update event_registrations
     set status = 'registered', paid = true, paid_at = now(),
         paid_amount = coalesce(p_amount, ev.price * coalesce(v_seats, 1)),
         payment_claimed_at = null, hold_expires_at = null, updated_at = now()
   where event_id = p_event_id and user_id = p_user_id;
  return 'confirmed';
end;
$function$;


-- ── Paying for the extra ticket with a credit ────────────────────────────
-- Same rules as redeem_credit_for_event: credits are spent whole, soonest
-- expiry first, and the remainder comes back as a new credit with the same
-- expiry (Brenda 27.8.26).
create or replace function public.redeem_credit_for_extra_seat(p_event_id uuid, p_guest_names text[] default '{}'::text[])
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  ev community_events;
  v_names text[];
  v_n integer;
  v_status text;
  v_paid boolean;
  v_guests text[];
  v_taken integer;
  v_total numeric;
  v_available numeric;
  c record;
  v_spent numeric := 0;
  v_change numeric;
  v_last_expires timestamptz;
  v_last_source uuid;
begin
  if uid is null then return 'unauthorized'; end if;

  v_names := (
    select coalesce(array_agg(g), '{}'::text[])
    from (select btrim(x) as g from unnest(coalesce(p_guest_names, '{}'::text[])) as x
          where btrim(x) <> '' limit 3) s
  );
  v_n := coalesce(array_length(v_names, 1), 0);
  if v_n = 0 then return 'no_names'; end if;

  select * into ev from community_events where id = p_event_id and is_active = true for update;
  if ev.id is null then return 'not_found'; end if;
  if ev.price <= 0 then return 'free_event'; end if;

  select r.status, r.paid, r.guest_names into v_status, v_paid, v_guests
    from event_registrations r
   where r.event_id = p_event_id and r.user_id = uid
   for update;
  if v_status is null or v_status not in ('registered', 'attended') or not coalesce(v_paid, false) then
    return 'not_registered';
  end if;

  if coalesce(array_length(v_guests, 1), 0) + v_n > 3 then return 'too_many'; end if;

  v_taken := event_seats_taken(p_event_id, uid);
  if ev.capacity is not null
     and v_taken + 1 + coalesce(array_length(v_guests, 1), 0) + v_n > ev.capacity then
    return 'full';
  end if;

  v_total := ev.price * v_n;

  select coalesce(sum(amount), 0) into v_available
    from community_credits
   where user_id = uid and used_at is null and expires_at > now();
  if v_available < v_total then return 'insufficient'; end if;

  for c in
    select id, amount, expires_at, source_event_id from community_credits
     where user_id = uid and used_at is null and expires_at > now()
     order by expires_at
     for update
  loop
    exit when v_spent >= v_total;
    update community_credits
       set used_at = now(), used_on_event_id = p_event_id,
           used_note = coalesce(used_note, 'מומש לכרטיס נוסף לאירוע')
     where id = c.id;
    v_spent := v_spent + c.amount;
    v_last_expires := c.expires_at;
    v_last_source := c.source_event_id;
  end loop;

  v_change := v_spent - v_total;
  if v_change > 0 then
    insert into community_credits (user_id, amount, source_event_id, expires_at, grant_note)
    values (uid, v_change, v_last_source, v_last_expires, 'יתרה מזיכוי קודם');
  end if;

  update event_registrations
     set guest_names = (guest_names || v_names)[1:3],
         paid_amount = coalesce(paid_amount, 0) + v_total,
         extra_guest_names = '{}'::text[], extra_hold_expires_at = null,
         updated_at = now()
   where event_id = p_event_id and user_id = uid;

  return 'redeemed';
end;
$function$;


-- ── Cancelling clears the extra seat too ─────────────────────────────────
create or replace function public.cancel_event_registration(p_event_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  ev community_events;
  v_paid boolean;
  v_amount numeric;
  v_hours integer;
  v_deadline timestamptz;
begin
  if uid is null then return 'unauthorized'; end if;

  select * into ev from community_events where id = p_event_id;
  if ev.id is null then return 'not_found'; end if;

  select r.paid, r.paid_amount into v_paid, v_amount
    from event_registrations r
   where r.event_id = p_event_id and r.user_id = uid
     and r.status in ('registered', 'pending')
   for update;
  if not found then return 'not_found'; end if;

  select coalesce(nullif(setting_value, ''), '48')::int into v_hours
    from global_settings where setting_key = 'credit_cancel_hours';
  v_hours := coalesce(v_hours, 48);
  v_deadline := ((ev.event_date + coalesce(ev.start_time, time '00:00'))
                 at time zone 'Asia/Jerusalem') - make_interval(hours => v_hours);

  -- Release the money from the registration in the SAME statement that
  -- cancels it. Whatever happens below, this row can never fund a second
  -- credit. An extra ticket that was never paid for goes with it.
  update event_registrations
     set status = 'cancelled', hold_expires_at = null,
         payment_claimed_at = null,
         paid = false, paid_amount = null, paid_at = null,
         extra_guest_names = '{}'::text[], extra_hold_expires_at = null,
         updated_at = now()
   where event_id = p_event_id and user_id = uid;

  if v_paid and coalesce(v_amount, 0) > 0 then
    if now() <= v_deadline then
      insert into community_credits (user_id, amount, source_event_id, expires_at)
      values (uid, v_amount, p_event_id, now() + interval '1 month');
      return 'cancelled_with_credit';
    end if;
    return 'cancelled_too_late';
  end if;

  return 'cancelled';
end;
$function$;


-- ── A fresh registration never inherits a stale extra ────────────────────
create or replace function public.register_for_event(p_event_id uuid, p_guest_names text[] default '{}'::text[])
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  ev community_events;
  v_taken integer;
  v_existing text;
  v_guests text[];
  v_seats integer;
begin
  if uid is null then return 'unauthorized'; end if;

  v_guests := (
    select coalesce(array_agg(g), '{}'::text[])
    from (select btrim(x) as g from unnest(coalesce(p_guest_names, '{}'::text[])) as x
          where btrim(x) <> '' limit 3) s
  );
  v_seats := 1 + coalesce(array_length(v_guests, 1), 0);

  select * into ev from community_events where id = p_event_id and is_active = true for update;
  if ev.id is null then return 'not_found'; end if;

  select status into v_existing from event_registrations
   where event_id = p_event_id and user_id = uid;

  v_taken := event_seats_taken(p_event_id, uid);
  if ev.capacity is not null and v_taken + v_seats > ev.capacity then
    return 'full';
  end if;

  -- Already in: this call is only editing the guest list. It must not be
  -- allowed to swallow a seat that is mid-purchase.
  if v_existing in ('registered', 'attended') then
    update event_registrations
       set guest_names = v_guests, updated_at = now()
     where event_id = p_event_id and user_id = uid
       and coalesce(array_length(extra_guest_names, 1), 0) = 0;
    if not found then return 'extra_in_checkout'; end if;
    return 'updated';
  end if;

  if ev.price > 0 then
    insert into event_registrations (event_id, user_id, status, guest_names, hold_expires_at)
    values (p_event_id, uid, 'pending', v_guests, now() + interval '10 minutes')
    on conflict (event_id, user_id)
    do update set status = 'pending', guest_names = v_guests,
                  hold_expires_at = now() + interval '10 minutes',
                  -- A new attempt starts owing money, whatever the row
                  -- remembers from a previous life.
                  paid = false, paid_amount = null, paid_at = null,
                  payment_claimed_at = null,
                  extra_guest_names = '{}'::text[], extra_hold_expires_at = null,
                  updated_at = now();
    return 'pending';
  end if;

  insert into event_registrations (event_id, user_id, status, guest_names)
  values (p_event_id, uid, 'registered', v_guests)
  on conflict (event_id, user_id)
  do update set status = 'registered', guest_names = v_guests,
                paid = false, paid_amount = null, paid_at = null,
                payment_claimed_at = null,
                extra_guest_names = '{}'::text[], extra_hold_expires_at = null,
                updated_at = now();
  return 'registered';
end;
$function$;


-- ── The card has to be able to show all of this ──────────────────────────
drop function if exists public.get_community_events(date, date);
create or replace function public.get_community_events(p_from date default null::date, p_to date default null::date)
 returns table(id uuid, title text, emoji text, event_type text, description text, event_date date,
               start_time time without time zone, end_time time without time zone, location text,
               location_link text, capacity integer, price numeric, payment_link text,
               payment_link_pair text, vendor_name text, image_url text, registered_count bigint,
               my_status text, my_guests text[], my_paid boolean,
               my_hold_expires_at timestamp with time zone,
               my_payment_claimed_at timestamp with time zone,
               my_extra_guests text[], my_extra_hold_expires_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select e.id, e.title, e.emoji, e.event_type, e.description,
         e.event_date, e.start_time, e.end_time,
         e.location, e.location_link, e.capacity, e.price,
         e.payment_link, e.payment_link_pair,
         coalesce(sp.title, e.vendor_name) as vendor_name,
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
$function$;

revoke all on function public.get_community_events(date, date) from public;
grant execute on function public.get_community_events(date, date) to authenticated, service_role;

revoke all on function public.buy_extra_event_seat(uuid, text[]) from public;
grant execute on function public.buy_extra_event_seat(uuid, text[]) to authenticated, service_role;

revoke all on function public.cancel_extra_event_seat(uuid) from public;
grant execute on function public.cancel_extra_event_seat(uuid) to authenticated, service_role;

revoke all on function public.redeem_credit_for_extra_seat(uuid, text[]) from public;
grant execute on function public.redeem_credit_for_extra_seat(uuid, text[]) to authenticated, service_role;

-- Only the two payment-observing paths call this, and both are already
-- SECURITY DEFINER. Nobody gets to hand themselves a seat.
revoke all on function public.promote_paid_extra_seats(uuid, uuid, numeric) from public;
grant execute on function public.promote_paid_extra_seats(uuid, uuid, numeric) to service_role;
