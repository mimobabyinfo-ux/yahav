-- Yahav 11.9.26: "אם רוצים להגיע שתיים - אין אופציה בדף הרשמה להוסיף עוד
-- מישהי ולקבל תשלום לזוג". register_for_event_as gains p_guest_names with
-- the same rule as register_for_event: trimmed, empties dropped, at most 3,
-- every guest is a seat. The pair link is chosen by the edge function.
--
-- Applied to production 2026-09-11 via the Supabase MCP; this file is the repo record.

drop function if exists public.register_for_event_as(uuid, uuid);
create or replace function public.register_for_event_as(p_user_id uuid, p_event_id uuid, p_guest_names text[] default '{}'::text[])
returns text
language plpgsql security definer set search_path = public as $$
declare
  ev community_events;
  v_taken integer;
  v_existing text;
  v_paid boolean;
  v_guests text[];
  v_seats integer;
begin
  if p_user_id is null then return 'unauthorized'; end if;

  v_guests := (
    select coalesce(array_agg(g), '{}'::text[])
    from (select btrim(x) as g from unnest(coalesce(p_guest_names, '{}'::text[])) as x
          where btrim(x) <> '' limit 3) s
  );
  v_seats := 1 + coalesce(array_length(v_guests, 1), 0);

  select * into ev from community_events where id = p_event_id and is_active = true for update;
  if ev.id is null then return 'not_found'; end if;
  if ev.event_date < (now() at time zone 'Asia/Jerusalem')::date then return 'past'; end if;

  select status, paid into v_existing, v_paid from event_registrations
   where event_id = p_event_id and user_id = p_user_id;

  if v_existing in ('registered', 'attended') and (ev.price = 0 or coalesce(v_paid, false)) then
    return 'already';
  end if;

  v_taken := event_seats_taken(p_event_id, p_user_id);
  if ev.capacity is not null and v_taken + v_seats > ev.capacity then
    return 'full';
  end if;

  if ev.price > 0 then
    insert into event_registrations (event_id, user_id, status, guest_names, hold_expires_at)
    values (p_event_id, p_user_id, 'pending', v_guests, now() + interval '10 minutes')
    on conflict (event_id, user_id)
    do update set status = 'pending', guest_names = v_guests,
                  hold_expires_at = now() + interval '10 minutes',
                  paid = false, paid_amount = null, paid_at = null,
                  payment_claimed_at = null,
                  updated_at = now();
    return 'pending';
  end if;

  insert into event_registrations (event_id, user_id, status, guest_names)
  values (p_event_id, p_user_id, 'registered', v_guests)
  on conflict (event_id, user_id)
  do update set status = 'registered', guest_names = v_guests, updated_at = now();
  return 'registered';
end;
$$;
revoke execute on function public.register_for_event_as(uuid, uuid, text[]) from public, anon, authenticated;
