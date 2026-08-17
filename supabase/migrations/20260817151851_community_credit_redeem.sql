-- Brenda 17.8.26: "there's a bug with the credit — we never paid and it
-- already said you have a credit", plus "I want the credit kept in the app
-- and to be able to choose between using it and paying again".
--
-- Part 2 of the fix (part 1 is client-side: only the payment provider's
-- success redirect may confirm a payment). Here we let a credit actually
-- be spent instead of being a note that says "message us".

alter table public.community_credits
  add column if not exists used_on_event_id uuid references public.community_events(id) on delete set null;

comment on column public.community_credits.used_on_event_id is
  'The event this credit was spent on, set by redeem_credit_for_event.';

-- Register for a paid event by spending open credit instead of paying.
-- All-or-nothing on purpose: a partial redemption would need a payment
-- link for the remainder, which Morning cannot generate on the fly.
-- Credits are consumed oldest-expiry first so nothing quietly lapses.
create or replace function public.redeem_credit_for_event(
  p_event_id uuid,
  p_guest_names text[] default '{}'::text[]
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ev community_events;
  v_guests text[];
  v_seats integer;
  v_total numeric;
  v_available numeric;
  v_taken integer;
  v_existing text;
  c record;
  v_spent numeric := 0;
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
  if ev.price <= 0 then return 'free_event'; end if;

  select status into v_existing from event_registrations
   where event_id = p_event_id and user_id = uid;
  if v_existing in ('registered', 'attended') then return 'already'; end if;

  v_taken := event_seats_taken(p_event_id, uid);
  if ev.capacity is not null and v_taken + v_seats > ev.capacity then return 'full'; end if;

  v_total := ev.price * v_seats;

  select coalesce(sum(amount), 0) into v_available
    from community_credits
   where user_id = uid and used_at is null and expires_at > now();

  if v_available < v_total then return 'insufficient'; end if;

  -- Spend the credits that expire soonest.
  for c in
    select id, amount from community_credits
     where user_id = uid and used_at is null and expires_at > now()
     order by expires_at
     for update
  loop
    exit when v_spent >= v_total;
    update community_credits
       set used_at = now(), used_on_event_id = p_event_id,
           used_note = coalesce(used_note, 'מומש להרשמה לאירוע')
     where id = c.id;
    v_spent := v_spent + c.amount;
  end loop;

  insert into event_registrations (event_id, user_id, status, guest_names, paid, paid_at, hold_expires_at)
  values (p_event_id, uid, 'registered', v_guests, true, now(), null)
  on conflict (event_id, user_id)
  do update set status = 'registered', guest_names = v_guests, paid = true,
                paid_at = now(), hold_expires_at = null, updated_at = now();

  return 'redeemed';
end;
$$;

revoke all on function public.redeem_credit_for_event(uuid, text[]) from public, anon;
grant execute on function public.redeem_credit_for_event(uuid, text[]) to authenticated;

-- Expose the open balance so the events tab can offer the button.
create or replace function public.get_my_credit_balance()
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(amount), 0)
  from community_credits
  where user_id = auth.uid() and used_at is null and expires_at > now();
$$;

revoke all on function public.get_my_credit_balance() from public, anon;
grant execute on function public.get_my_credit_balance() to authenticated;
