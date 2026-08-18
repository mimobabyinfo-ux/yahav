-- Admin control over the thing the app is actually for.
--
-- Brenda 18.8.26: "think like an admin — do I have all the control I need?
-- The main thing in the app, at least at the start, is community event
-- registration."
--
-- She did not. Three holes, all of which she would hit in week one:
--
--  · A mother pays by bank transfer, or signs up over the phone, or is the
--    friend who does not use the app. There was NO way to register anyone
--    by hand. The only insert path in the whole admin was converting
--    someone off the waitlist.
--  · A mother cancels and wants her money back. cancel_event_registration
--    is auth.uid()-based — only the mother can run it. Admin's only tool
--    was a hard DELETE, which erases paid_amount and mints no credit, so
--    the money simply vanished from the record.
--  · A Morning payment the webhook could not match. confirm_event_payment_
--    for_user is granted to service_role only, so she could not assign it
--    from her browser even though morning_webhook_log tells her it
--    happened.
--
-- These take the same shape as the mother-facing RPCs and reuse their
-- invariants — above all: money lives in exactly one place, so a
-- cancellation releases the registration in the same statement.

-- 1 · Register a mother by hand, optionally already paid.
create or replace function public.admin_register_for_event(
  p_event_id    uuid,
  p_user_id     uuid,
  p_guest_names text[] default '{}',
  p_paid        boolean default false,
  p_amount      numeric default null,
  p_note        text    default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  ev community_events;
  v_seats integer := 1 + coalesce(array_length(p_guest_names, 1), 0);
begin
  if not is_admin() then return 'unauthorized'; end if;

  select * into ev from community_events where id = p_event_id for update;
  if ev.id is null then return 'not_found'; end if;
  if not exists (select 1 from user_profiles where id = p_user_id) then
    return 'no_such_user';
  end if;

  -- Capacity is deliberately NOT enforced here. Brenda adding someone by
  -- hand IS the decision to make room; the app should not overrule her.
  insert into event_registrations (
    event_id, user_id, status, guest_names, paid, paid_at, paid_amount, hold_expires_at
  ) values (
    p_event_id, p_user_id, 'registered', coalesce(p_guest_names, '{}'::text[]),
    p_paid,
    case when p_paid then now() end,
    case when p_paid then coalesce(p_amount, ev.price * v_seats) end,
    null
  )
  -- Adding by hand can only ever ADD. An unconditional overwrite here
  -- would have done the exact thing this file exists to prevent: re-adding
  -- an already-paid mother with the box unticked — the default state of a
  -- fresh form — would set paid=false, paid_amount=null and wipe her
  -- guests. Un-paying is what admin_cancel_registration is for, and that
  -- one makes her say where the money went.
  on conflict (event_id, user_id) do update
    set status      = 'registered',
        guest_names = case
                        when coalesce(array_length(excluded.guest_names, 1), 0) > 0
                        then excluded.guest_names
                        else event_registrations.guest_names
                      end,
        paid        = event_registrations.paid or excluded.paid,
        paid_at     = coalesce(event_registrations.paid_at, excluded.paid_at),
        paid_amount = coalesce(event_registrations.paid_amount, excluded.paid_amount),
        hold_expires_at    = null,
        payment_claimed_at = null,
        updated_at  = now();

  if p_note is not null and length(trim(p_note)) > 0 then
    update user_profiles
       set staff_notes = coalesce(staff_notes || E'\n', '') || trim(p_note)
     where id = p_user_id;
  end if;

  return 'ok';
end;
$$;

-- 2 · Cancel someone else's registration, and say what happened to the money.
--     p_outcome: 'none'   — nothing was paid, or nothing is owed back
--                'credit' — keep it as an in-app credit
--                'refund' — money going back to her card; RECORDED, not executed
create or replace function public.admin_cancel_registration(
  p_event_id uuid,
  p_user_id  uuid,
  p_outcome  text default 'none',
  p_note     text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric;
  v_paid boolean;
  v_name text;
  v_title text;
begin
  if not is_admin() then return 'unauthorized'; end if;
  if p_outcome not in ('none', 'credit', 'refund') then return 'bad_outcome'; end if;

  select paid, paid_amount into v_paid, v_amount
    from event_registrations
   where event_id = p_event_id and user_id = p_user_id
     and status in ('registered', 'pending', 'attended')
   for update;
  if not found then return 'not_found'; end if;

  select coalesce(mother_name, display_name, email) into v_name
    from user_profiles where id = p_user_id;
  select title into v_title from community_events where id = p_event_id;

  -- Same invariant as the mother-facing cancel: the row lets go of the
  -- money in the statement that cancels it, so it can never fund a second
  -- credit or a second refund.
  update event_registrations
     set status = 'cancelled', hold_expires_at = null, payment_claimed_at = null,
         paid = false, paid_amount = null, paid_at = null, updated_at = now()
   where event_id = p_event_id and user_id = p_user_id;

  if p_outcome = 'credit' and v_paid and coalesce(v_amount, 0) > 0 then
    insert into community_credits (user_id, amount, source_event_id, expires_at)
    values (p_user_id, v_amount, p_event_id, now() + interval '1 month');
    return 'cancelled_with_credit';
  end if;

  if p_outcome = 'refund' and v_paid and coalesce(v_amount, 0) > 0 then
    -- The refund itself happens in Morning, by hand. This records what is
    -- owed so it is not carried around in her head.
    insert into admin_tasks (title, detail, severity, link_section, link_id, created_by)
    values (
      'להחזיר ₪' || v_amount::text || ' ל' || coalesce(v_name, 'משתמשת'),
      'ביטול הרשמה ל"' || coalesce(v_title, 'אירוע') || '". יש לזכות ' ||
      v_amount::text || ' ש"ח דרך Morning.' ||
      case when p_note is not null and length(trim(p_note)) > 0
           then ' הערה: ' || trim(p_note) else '' end,
      'high', 'events', p_event_id, auth.uid()
    );
    return 'cancelled_refund_due';
  end if;

  return 'cancelled';
end;
$$;

-- 3 · Assign a payment the webhook could not place. confirm_event_payment_
--     for_user stays service_role-only; this is the admin-checked door to it.
create or replace function public.admin_assign_event_payment(
  p_event_id uuid, p_user_id uuid, p_amount numeric default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then return 'unauthorized'; end if;
  return confirm_event_payment_for_user(p_event_id, p_user_id, p_amount);
end;
$$;

grant execute on function public.admin_register_for_event(uuid, uuid, text[], boolean, numeric, text) to authenticated;
grant execute on function public.admin_cancel_registration(uuid, uuid, text, text) to authenticated;
grant execute on function public.admin_assign_event_payment(uuid, uuid, numeric) to authenticated;
