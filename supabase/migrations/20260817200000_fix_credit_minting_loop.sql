-- Brenda 17.8.26, the second credit bug and the worse one.
--
-- Reported as: "after I bought once I made a credit, used it on another
-- lecture, then when I tried to register for the first one it asked if I
-- wanted to use the credit even though I'd used it — I said yes and it
-- registered me, even though I only paid once."
--
-- Root cause: cancelling set status = 'cancelled' but LEFT paid = true and
-- paid_amount = 30 on the row. Registering again reused that row and only
-- changed the status back to 'pending' — the stale paid flag came along.
-- Cancel again and it minted a SECOND credit for a payment that had
-- already been turned into the first one. cancel → register → cancel is a
-- money printer: one fresh ₪30 credit per lap. Her account ended with four
-- unused ₪30 credits from a single ₪30 payment.
--
-- The invariant that was missing: MONEY LIVES IN EXACTLY ONE PLACE. While
-- a registration holds it, paid_amount is set; the moment a cancellation
-- turns it into a credit, the registration lets go of it.

create or replace function public.cancel_event_registration(p_event_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); ev community_events;
  v_paid boolean; v_amount numeric; v_hours integer; v_deadline timestamptz;
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

  -- Release the money in the same statement that cancels. Whatever happens
  -- below, this row can never fund a second credit.
  update event_registrations
     set status = 'cancelled', hold_expires_at = null, payment_claimed_at = null,
         paid = false, paid_amount = null, paid_at = null, updated_at = now()
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
end; $$;

-- Belt and braces: re-registering must never inherit a previous payment.
create or replace function public.register_for_event(
  p_event_id uuid, p_guest_names text[] default '{}'::text[]
) returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); ev community_events;
  v_taken integer; v_existing text; v_guests text[]; v_seats integer;
begin
  if uid is null then return 'unauthorized'; end if;
  v_guests := (select coalesce(array_agg(g), '{}'::text[])
    from (select btrim(x) as g from unnest(coalesce(p_guest_names, '{}'::text[])) as x
          where btrim(x) <> '' limit 3) s);
  v_seats := 1 + coalesce(array_length(v_guests, 1), 0);

  select * into ev from community_events where id = p_event_id and is_active = true for update;
  if ev.id is null then return 'not_found'; end if;

  select status into v_existing from event_registrations
   where event_id = p_event_id and user_id = uid;

  v_taken := event_seats_taken(p_event_id, uid);
  if ev.capacity is not null and v_taken + v_seats > ev.capacity then return 'full'; end if;

  if v_existing in ('registered', 'attended') then
    update event_registrations set guest_names = v_guests, updated_at = now()
     where event_id = p_event_id and user_id = uid;
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
                  payment_claimed_at = null, updated_at = now();
    return 'pending';
  end if;

  insert into event_registrations (event_id, user_id, status, guest_names)
  values (p_event_id, uid, 'registered', v_guests)
  on conflict (event_id, user_id)
  do update set status = 'registered', guest_names = v_guests,
                paid = false, paid_amount = null, paid_at = null,
                payment_claimed_at = null, updated_at = now();
  return 'registered';
end; $$;

update public.event_registrations
   set paid = false, paid_amount = null, paid_at = null
 where status = 'cancelled' and (paid or paid_amount is not null);
