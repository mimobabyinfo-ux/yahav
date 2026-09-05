-- Yahav 5.9.26: "מי שתקנה גיפט קארד בדרך כלל לא תהיה מישהי שצריכה להירשם
-- לאפליקציה." A friend or a grandmother buying a gift has no reason to
-- create a Mimo account, sit through onboarding, and be asked for a due
-- date. So a gift card can now be bought from a public page (?giftcard)
-- with no account at all. The in-app flow stays exactly as it was.
--
-- A card bought without an account has buyer_user_id NULL and is owned by
-- its claim_token: a secret uuid the buyer's browser keeps between the
-- payment page and the thank-you page, and that lets her name the friend
-- afterwards. Same intent-then-confirm shape as the signed-in flow.

alter table public.gift_cards
  alter column buyer_user_id drop not null;

alter table public.gift_cards
  add column if not exists buyer_phone text,
  add column if not exists claim_token uuid not null default gen_random_uuid();

create unique index if not exists gift_cards_claim_token_idx on public.gift_cards(claim_token);

comment on column public.gift_cards.claim_token is
  'Secret. Owns a card bought without an account (buyer_user_id null). Never returned to anyone but the buyer who created the card.';

-- The public page: create a pending card. Buyer details come from the
-- form, not a profile. The friend may be named right away (optional) —
-- storing her is harmless; MAILING her waits for payment, as always.
create or replace function public.create_public_gift_card(
  p_workshop_id uuid,
  p_cohort_id uuid default null,
  p_buyer_name text default null,
  p_buyer_email text default null,
  p_buyer_phone text default null,
  p_recipient_name text default null,
  p_recipient_email text default null,
  p_message text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.workshops;
  v_cohort_id uuid;
  v_cohort_label text;
  gc public.gift_cards;
begin
  if coalesce(btrim(p_buyer_email), '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'bad_buyer_email';
  end if;
  if coalesce(btrim(p_buyer_name), '') = '' then
    raise exception 'missing_buyer_name';
  end if;
  if p_recipient_email is not null and btrim(p_recipient_email) <> ''
     and btrim(p_recipient_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'bad_recipient_email';
  end if;

  select * into w from public.workshops where id = p_workshop_id;
  if not found or not w.is_active or not w.gift_card_enabled then
    raise exception 'product_not_giftable';
  end if;
  if coalesce(w.payment_link, '') = '' then
    raise exception 'no_payment_link';
  end if;

  if p_cohort_id is not null then
    select wc.id,
           to_char(wc.start_date, 'DD/MM/YYYY') || coalesce(' · ' || wc.label, '')
      into v_cohort_id, v_cohort_label
      from public.workshop_cohorts wc
     where wc.id = p_cohort_id and wc.workshop_id = p_workshop_id;
  end if;

  insert into public.gift_cards (
    code, buyer_user_id, buyer_name, buyer_email, buyer_phone,
    workshop_id, workshop_title, cohort_id, cohort_label, amount,
    recipient_name, recipient_email, personal_message
  ) values (
    public._gift_card_code(), null,
    btrim(p_buyer_name), lower(btrim(p_buyer_email)), nullif(regexp_replace(coalesce(p_buyer_phone, ''), '\D', '', 'g'), ''),
    w.id, w.title, v_cohort_id, v_cohort_label, coalesce(w.price, 0),
    nullif(btrim(coalesce(p_recipient_name, '')), ''),
    nullif(lower(btrim(coalesce(p_recipient_email, ''))), ''),
    nullif(btrim(coalesce(p_message, '')), '')
  ) returning * into gc;

  -- Only the buyer's own browser ever sees the claim_token. The payment
  -- link rides along because anon cannot read it from workshops (RLS
  -- only opens public_registration products), and this is the one
  -- moment she needs it.
  return json_build_object('id', gc.id, 'claim_token', gc.claim_token, 'code', gc.code, 'payment_link', w.payment_link);
end;
$$;

-- What the buyer without an account may read about her card. The token
-- is the credential, so the token itself is not echoed back.
create or replace function public.get_public_gift_card(p_claim_token uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'id', id, 'code', code, 'status', status,
    'buyer_name', buyer_name, 'buyer_email', buyer_email,
    'workshop_id', workshop_id, 'workshop_title', workshop_title,
    'cohort_label', cohort_label, 'amount', amount,
    'recipient_name', recipient_name, 'recipient_email', recipient_email,
    'personal_message', personal_message,
    'paid_at', paid_at, 'sent_at', sent_at, 'created_at', created_at
  )
  from public.gift_cards
  where claim_token = p_claim_token and buyer_user_id is null;
$$;

-- Back from Morning. pending → paid, by token instead of by auth.uid().
create or replace function public.mark_public_gift_card_paid(p_claim_token uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  gc public.gift_cards;
begin
  select * into gc from public.gift_cards
   where claim_token = p_claim_token and buyer_user_id is null;
  if not found then return 'not_found'; end if;
  if gc.status <> 'pending' then return gc.status; end if;

  update public.gift_cards
     set status = 'paid', paid_at = now()
   where id = gc.id;
  return 'paid';
end;
$$;

-- Name (or rename) the friend, by token. Same rules as the signed-in one.
create or replace function public.set_public_gift_card_recipient(
  p_claim_token uuid,
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
  if coalesce(btrim(p_recipient_email), '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return 'bad_email';
  end if;

  select * into gc from public.gift_cards
   where claim_token = p_claim_token and buyer_user_id is null;
  if not found then return 'not_found'; end if;
  if gc.status = 'pending' then return 'not_paid'; end if;
  if gc.status in ('redeemed','cancelled') then return gc.status; end if;

  update public.gift_cards
     set recipient_name  = nullif(btrim(p_recipient_name), ''),
         recipient_email = lower(btrim(p_recipient_email)),
         personal_message = nullif(btrim(p_message), '')
   where id = gc.id;
  return 'ok';
end;
$$;

grant execute on function public.create_public_gift_card(uuid, uuid, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_public_gift_card(uuid) to anon, authenticated;
grant execute on function public.mark_public_gift_card_paid(uuid) to anon, authenticated;
grant execute on function public.set_public_gift_card_recipient(uuid, text, text, text) to anon, authenticated;

-- The public page's product list. Anon can only read workshops with
-- public_registration = true (RLS), and a giftable product need not be
-- one of those, so the list comes through here: the handful of fields
-- the page shows, nothing else.
create or replace function public.get_giftable_products()
returns table (
  id uuid, title text, description text, summary text, price numeric,
  image_url text, has_payment_link boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.title, w.description, w.summary, w.price, w.image_url,
         (w.payment_link is not null and w.payment_link <> '') as has_payment_link
    from public.workshops w
   where w.is_active and w.gift_card_enabled
   order by w.display_order;
$$;

grant execute on function public.get_giftable_products() to anon, authenticated;
