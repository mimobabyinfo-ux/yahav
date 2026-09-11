-- הרשמה לאירוע קהילה מבחוץ, בלי אפליקציה.
--
-- Yahav 11.9.26: "אני רוצה לתת אופציה להירשם לאירועי קהילה מבחוץ מי שאין לה
-- אפליקציה אבל אין לי לינק להרשמה חיצוני".
--
-- event_registrations.user_id is NOT NULL, so there is no such thing as a
-- registration without an account. The public page therefore creates the
-- account for her (edge function public-event-register, service role) and
-- registers her the same way the app does: a pending row that holds the
-- seat for ten minutes, then Morning, then the morning-paid webhook confirms
-- the seat by matching her email or phone against user_profiles. Nothing
-- about payment changes; the guest just gets a profile row first.
--
-- Three pieces:
--   get_public_event(id)            what the page shows. Anonymous, read-only,
--                                   deliberately without the seat count
--                                   (Yahav: "כמה מקומות נשארו אין צורך להציג").
--   register_for_event_as(user, ev) register_for_event with an explicit user
--                                   instead of auth.uid(). Service role only.
--   event_registrations.claim_token the guest's handle on her own row: the
--                                   page polls "did the payment land" with it,
--                                   and once paid, asks for a sign-in link
--                                   with it. Unguessable, one per row.
--
-- Applied to production 2026-09-11 via the Supabase MCP; this file is the repo record.

alter table public.event_registrations
  add column if not exists claim_token uuid not null default gen_random_uuid();
create unique index if not exists event_registrations_claim_token_uniq
  on public.event_registrations (claim_token);

comment on column public.event_registrations.claim_token is
  'Handle a guest who registered from the public ?event= page uses to poll her status and, once paid, mint a sign-in link. Never shown to other users.';

-- What the public page may know about an event. No seat count, no
-- registrant data. is_open covers the three reasons the button should not
-- render: inactive, in the past, or full.
create or replace function public.get_public_event(p_event_id uuid)
returns table (
  id uuid, title text, emoji text, description text,
  event_date date, start_time time, end_time time,
  location text, location_link text, price numeric, image_url text,
  is_open boolean
)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.emoji, e.description,
         e.event_date, e.start_time, e.end_time,
         e.location, e.location_link, e.price, e.image_url,
         (e.is_active
          and e.event_date >= (now() at time zone 'Asia/Jerusalem')::date
          and (e.capacity is null or event_seats_taken(e.id) < e.capacity)) as is_open
    from community_events e
   where e.id = p_event_id;
$$;
grant execute on function public.get_public_event(uuid) to anon, authenticated;

-- register_for_event, with the user handed in. Same hold, same rules, minus
-- guests (a first-time visitor registers herself; extra tickets are an
-- in-app purchase). Returns the same words the app already understands.
create or replace function public.register_for_event_as(p_user_id uuid, p_event_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  ev community_events;
  v_taken integer;
  v_existing text;
  v_paid boolean;
begin
  if p_user_id is null then return 'unauthorized'; end if;

  select * into ev from community_events where id = p_event_id and is_active = true for update;
  if ev.id is null then return 'not_found'; end if;
  if ev.event_date < (now() at time zone 'Asia/Jerusalem')::date then return 'past'; end if;

  select status, paid into v_existing, v_paid from event_registrations
   where event_id = p_event_id and user_id = p_user_id;

  -- Already in: do not reset a paid seat because she pressed the public
  -- button again. 'already' lets the page say so.
  if v_existing in ('registered', 'attended') and (ev.price = 0 or coalesce(v_paid, false)) then
    return 'already';
  end if;

  v_taken := event_seats_taken(p_event_id, p_user_id);
  if ev.capacity is not null and v_taken + 1 > ev.capacity then
    return 'full';
  end if;

  if ev.price > 0 then
    insert into event_registrations (event_id, user_id, status, guest_names, hold_expires_at)
    values (p_event_id, p_user_id, 'pending', '{}'::text[], now() + interval '10 minutes')
    on conflict (event_id, user_id)
    do update set status = 'pending',
                  hold_expires_at = now() + interval '10 minutes',
                  paid = false, paid_amount = null, paid_at = null,
                  payment_claimed_at = null,
                  updated_at = now();
    return 'pending';
  end if;

  insert into event_registrations (event_id, user_id, status, guest_names)
  values (p_event_id, p_user_id, 'registered', '{}'::text[])
  on conflict (event_id, user_id)
  do update set status = 'registered', updated_at = now();
  return 'registered';
end;
$$;
-- Service role only. Anyone else calling this with somebody's user id
-- would be registering other people.
revoke execute on function public.register_for_event_as(uuid, uuid) from public, anon, authenticated;
