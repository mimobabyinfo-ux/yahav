-- Buyer-side gift card API. Everything a signed-in mother can do to a gift
-- card goes through these four functions; the table itself is written only
-- by admins (see the RLS in the previous migration).

-- Code generator: MIMO-XXXX-XXXX, no look-alike characters (0/O, 1/I)
-- because this gets read out over the phone.
create or replace function public._gift_card_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  loop
    candidate := 'MIMO-';
    for i in 1..8 loop
      if i = 5 then candidate := candidate || '-'; end if;
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.gift_cards where code = candidate);
  end loop;
  return candidate;
end;
$$;

-- Created the moment she taps "לרכישה", BEFORE the payment page opens —
-- same shape as register_for_event. A pending card is not a gift: nothing
-- is emailed until the money is confirmed.
--
-- Scalars, not a record, for the cohort: an unassigned record raises
-- "record c is not assigned yet" on the DEFAULT path, since choosing a
-- cohort is optional. And `gc`, not `row`, which is a Postgres keyword.
create or replace function public.create_gift_card(
  p_workshop_id uuid,
  p_cohort_id uuid default null
)
returns public.gift_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.workshops;
  v_cohort_id uuid;
  v_cohort_label text;
  v_name text;
  v_email text;
  gc public.gift_cards;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select * into w from public.workshops where id = p_workshop_id;
  if not found or not w.is_active or not w.gift_card_enabled then
    raise exception 'product_not_giftable';
  end if;

  if p_cohort_id is not null then
    select wc.id,
           to_char(wc.start_date, 'DD/MM/YYYY') || coalesce(' · ' || wc.label, '')
      into v_cohort_id, v_cohort_label
      from public.workshop_cohorts wc
     where wc.id = p_cohort_id and wc.workshop_id = p_workshop_id;
    -- A wrong cohort id is a client bug, not a reason to lose the sale:
    -- both stay null and Brenda coordinates the date with the friend.
  end if;

  select mother_name, email into v_name, v_email
    from public.user_profiles where id = auth.uid();

  insert into public.gift_cards (
    code, buyer_user_id, buyer_name, buyer_email,
    workshop_id, workshop_title, cohort_id, cohort_label, amount
  ) values (
    public._gift_card_code(), auth.uid(), v_name, v_email,
    w.id, w.title, v_cohort_id, v_cohort_label, coalesce(w.price, 0)
  ) returning * into gc;

  return gc;
end;
$$;

-- The buyer came back from Morning. Mirrors mark_event_paid: the caller
-- must own the card, and a card can only go pending → paid.
create or replace function public.mark_gift_card_paid(p_gift_card_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  gc public.gift_cards;
begin
  if auth.uid() is null then return 'unauthorized'; end if;

  select * into gc from public.gift_cards where id = p_gift_card_id;
  if not found then return 'not_found'; end if;
  if gc.buyer_user_id <> auth.uid() then return 'not_yours'; end if;
  if gc.status <> 'pending' then return gc.status; end if;

  update public.gift_cards
     set status = 'paid', paid_at = now()
   where id = p_gift_card_id;

  return 'paid';
end;
$$;

-- "לשלוח את זה לחברה" — stores who the gift is for. Sending the mail is a
-- separate step (the send-gift-card edge function) so a mail failure never
-- loses the recipient she typed.
create or replace function public.set_gift_card_recipient(
  p_gift_card_id uuid,
  p_recipient_name text,
  p_recipient_email text,
  p_message text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  gc public.gift_cards;
begin
  if auth.uid() is null then return 'unauthorized'; end if;
  if coalesce(btrim(p_recipient_email), '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return 'bad_email';
  end if;

  select * into gc from public.gift_cards where id = p_gift_card_id;
  if not found then return 'not_found'; end if;
  if gc.buyer_user_id <> auth.uid() and not public.is_admin() then return 'not_yours'; end if;
  if gc.status = 'pending' then return 'not_paid'; end if;
  if gc.status in ('redeemed','cancelled') then return gc.status; end if;

  update public.gift_cards
     set recipient_name  = nullif(btrim(p_recipient_name), ''),
         recipient_email = lower(btrim(p_recipient_email)),
         personal_message = nullif(btrim(p_message), '')
   where id = p_gift_card_id;

  return 'ok';
end;
$$;

-- What the buyer's "הרכישות שלי" list reads.
create or replace function public.get_my_gift_cards()
returns setof public.gift_cards
language sql
stable
security definer
set search_path = public
as $$
  select * from public.gift_cards
   where buyer_user_id = auth.uid()
   order by created_at desc;
$$;

revoke all on function public._gift_card_code() from public, anon, authenticated;
grant execute on function public.create_gift_card(uuid, uuid) to authenticated;
grant execute on function public.mark_gift_card_paid(uuid) to authenticated;
grant execute on function public.set_gift_card_recipient(uuid, text, text, text) to authenticated;
grant execute on function public.get_my_gift_cards() to authenticated;
