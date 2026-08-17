-- Brenda 17.8.26, three problems in one flow.
--
-- 1. THE ₪60 BUG. "I bought for 30, then added someone and didn't pay, and
--    now it says I have a 60 credit." The credit was price × seats instead
--    of what she actually paid. Registrations record paid_amount now, and
--    that is what a cancellation refunds.
-- 2. BIT. A payment made in Bit never returns through the thank-you page,
--    so it was never counted. Until Morning sends a webhook, she declares
--    it and Brenda confirms from the admin. A claim is not a payment.
-- 3. CANCELLATION. Cancel whenever you like; the CREDIT only stands if you
--    cancel at least credit_cancel_hours ahead (48 by default, admin-set).
--
-- Credits are not pooled: one credit pays for one event costing the same
-- or less, and any change comes back as a new credit.

alter table public.event_registrations
  add column if not exists paid_amount numeric,
  add column if not exists payment_claimed_at timestamptz;

comment on column public.event_registrations.paid_amount is
  'What she actually paid, in shekels. The cancellation credit equals this, never price x seats.';
comment on column public.event_registrations.payment_claimed_at is
  'She declared a payment we could not observe (Bit, cross-device). Awaits admin confirmation; NOT proof of payment.';

alter table public.community_credits
  add column if not exists used_on_event_id uuid references public.community_events(id) on delete set null;

update public.event_registrations r
   set paid_amount = e.price * (1 + coalesce(array_length(r.guest_names, 1), 0))
  from public.community_events e
 where e.id = r.event_id and r.paid and r.paid_amount is null and e.price > 0;

insert into public.global_settings (setting_key, setting_value, setting_type, category, description)
values ('credit_cancel_hours', '48', 'number', 'community',
        'עד כמה שעות לפני האירוע ביטול עדיין מזכה בזיכוי')
on conflict (setting_key) do nothing;

create or replace function public.mark_event_paid(p_event_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); ev community_events; v_status text;
  v_seats integer; v_taken integer;
begin
  if uid is null then return 'unauthorized'; end if;
  select * into ev from community_events where id = p_event_id for update;
  if ev.id is null then return 'not_found'; end if;
  select status, 1 + coalesce(array_length(guest_names, 1), 0) into v_status, v_seats
    from event_registrations where event_id = p_event_id and user_id = uid;
  if v_status is null then return 'not_found'; end if;
  if v_status in ('registered', 'attended')
     and (select paid from event_registrations where event_id = p_event_id and user_id = uid)
  then return 'already'; end if;
  v_taken := event_seats_taken(p_event_id, uid);
  update event_registrations
     set status = 'registered', paid = true, paid_at = now(),
         paid_amount = coalesce(paid_amount, ev.price * v_seats),
         payment_claimed_at = null, hold_expires_at = null, updated_at = now()
   where event_id = p_event_id and user_id = uid;
  if ev.capacity is not null and v_taken + v_seats > ev.capacity then return 'over_capacity'; end if;
  return 'paid';
end; $$;

create or replace function public.claim_event_payment(p_event_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); ev community_events; v_status text;
begin
  if uid is null then return 'unauthorized'; end if;
  select * into ev from community_events where id = p_event_id for update;
  if ev.id is null then return 'not_found'; end if;
  if ev.price <= 0 then return 'free_event'; end if;
  select status into v_status from event_registrations
   where event_id = p_event_id and user_id = uid;
  if v_status is null then return 'not_found'; end if;
  if v_status in ('registered', 'attended') then return 'already'; end if;
  update event_registrations
     set payment_claimed_at = now(),
         hold_expires_at = (ev.event_date + time '23:59') at time zone 'Asia/Jerusalem',
         updated_at = now()
   where event_id = p_event_id and user_id = uid;
  return 'claimed';
end; $$;
revoke all on function public.claim_event_payment(uuid) from public, anon;
grant execute on function public.claim_event_payment(uuid) to authenticated;

create or replace function public.cancel_event_registration(p_event_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); ev community_events;
  v_paid boolean; v_amount numeric; v_hours integer; v_deadline timestamptz;
begin
  if uid is null then return 'unauthorized'; end if;
  select * into ev from community_events where id = p_event_id;
  if ev.id is null then return 'not_found'; end if;
  select r.paid, r.paid_amount into v_paid, v_amount from event_registrations r
   where r.event_id = p_event_id and r.user_id = uid and r.status in ('registered', 'pending');
  if not found then return 'not_found'; end if;
  update event_registrations
     set status = 'cancelled', hold_expires_at = null,
         payment_claimed_at = null, updated_at = now()
   where event_id = p_event_id and user_id = uid;
  select coalesce(nullif(setting_value, ''), '48')::int into v_hours
    from global_settings where setting_key = 'credit_cancel_hours';
  v_hours := coalesce(v_hours, 48);
  v_deadline := ((ev.event_date + coalesce(ev.start_time, time '00:00'))
                 at time zone 'Asia/Jerusalem') - make_interval(hours => v_hours);
  if v_paid and coalesce(v_amount, 0) > 0 then
    if now() <= v_deadline then
      insert into community_credits (user_id, amount, source_event_id, expires_at)
      values (uid, v_amount, p_event_id, now() + interval '1 month');
      return 'cancelled_with_credit';
    end if;
    return 'cancelled_too_late';
  end if;
  return 'cancelled';
end; $$;

create or replace function public.redeem_credit_for_event(
  p_event_id uuid, p_guest_names text[] default '{}'::text[]
) returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); ev community_events; v_guests text[];
  v_seats integer; v_total numeric; v_taken integer; v_existing text; c record;
begin
  if uid is null then return 'unauthorized'; end if;
  v_guests := (select coalesce(array_agg(g), '{}'::text[])
    from (select btrim(x) as g from unnest(coalesce(p_guest_names, '{}'::text[])) as x
          where btrim(x) <> '' limit 3) s);
  v_seats := 1 + coalesce(array_length(v_guests, 1), 0);
  select * into ev from community_events where id = p_event_id and is_active = true for update;
  if ev.id is null then return 'not_found'; end if;
  if ev.price <= 0 then return 'free_event'; end if;
  select status into v_existing from event_registrations
   where event_id = p_event_id and user_id = uid;
  if v_existing in ('registered', 'attended') then return 'already'; end if;
  v_taken := event_seats_taken(p_event_id, uid);
  if ev.capacity is not null and v_taken + v_seats > ev.capacity then return 'full'; end if;
  v_total := ev.price * v_seats;
  select id, amount, expires_at into c from community_credits
   where user_id = uid and used_at is null and expires_at > now() and amount >= v_total
   order by expires_at, amount limit 1 for update;
  if c.id is null then return 'insufficient'; end if;
  update community_credits
     set used_at = now(), used_on_event_id = p_event_id,
         used_note = coalesce(used_note, 'מומש להרשמה לאירוע')
   where id = c.id;
  if c.amount > v_total then
    insert into community_credits (user_id, amount, source_event_id, expires_at, used_note)
    values (uid, c.amount - v_total, p_event_id, c.expires_at, 'יתרה מזיכוי קודם');
  end if;
  insert into event_registrations (event_id, user_id, status, guest_names, paid, paid_at, paid_amount, hold_expires_at)
  values (p_event_id, uid, 'registered', v_guests, true, now(), v_total, null)
  on conflict (event_id, user_id)
  do update set status = 'registered', guest_names = v_guests, paid = true,
                paid_at = now(), paid_amount = v_total, payment_claimed_at = null,
                hold_expires_at = null, updated_at = now();
  return 'redeemed';
end; $$;
revoke all on function public.redeem_credit_for_event(uuid, text[]) from public, anon;
grant execute on function public.redeem_credit_for_event(uuid, text[]) to authenticated;

create or replace function public.get_my_credit_balance()
returns numeric language sql security definer set search_path = public stable as $$
  select coalesce(sum(amount), 0) from community_credits
  where user_id = auth.uid() and used_at is null and expires_at > now();
$$;
revoke all on function public.get_my_credit_balance() from public, anon;
grant execute on function public.get_my_credit_balance() to authenticated;

-- The events RPC gains my_payment_claimed_at. Column names must stay
-- my_* — the client reads CommunityEventRow.my_status/my_paid/...
drop function if exists public.get_community_events(date, date);
create or replace function public.get_community_events(p_from date default null, p_to date default null)
returns table (
  id uuid, title text, emoji text, event_type text, description text,
  event_date date, start_time time, end_time time,
  location text, location_link text, capacity integer, price numeric,
  payment_link text, payment_link_pair text, vendor_name text, image_url text,
  registered_count bigint,
  my_status text, my_guests text[], my_paid boolean, my_hold_expires_at timestamptz,
  my_payment_claimed_at timestamptz
) language sql security definer set search_path = public stable as $$
  select e.id, e.title, e.emoji, e.event_type, e.description,
         e.event_date, e.start_time, e.end_time,
         e.location, e.location_link, e.capacity, e.price,
         e.payment_link, e.payment_link_pair,
         coalesce(sp.title, e.vendor_name), e.image_url,
         event_seats_taken(e.id)::bigint,
         mine.status, mine.guest_names, mine.paid, mine.hold_expires_at, mine.payment_claimed_at
  from community_events e
  left join service_partners sp on sp.id = e.vendor_id
  left join lateral (
    select r.status, r.guest_names, r.paid, r.hold_expires_at, r.payment_claimed_at
    from event_registrations r where r.event_id = e.id and r.user_id = auth.uid()
  ) mine on true
  where e.is_active = true
    and e.event_date >= coalesce(p_from, (now() at time zone 'Asia/Jerusalem')::date)
    and (p_to is null or e.event_date <= p_to)
    and auth.uid() is not null
  order by e.event_date, e.start_time nulls last;
$$;
revoke all on function public.get_community_events(date, date) from public, anon;
grant execute on function public.get_community_events(date, date) to authenticated;
