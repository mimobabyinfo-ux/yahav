-- Brenda 19.8.26: "להוסיף במוצרים גיפט קארד — אם אופציה לבחירה של סדנת
-- עטופים מגלים או פרטני, לרכוש בהתאם לבחירה ובהתאם למחזור שנבחר, ואז לתת
-- אופציה של שליחת ההודעה הזאת לחברה".
--
-- A gift card is NOT a registration. Nobody's seat is taken and no cohort
-- is filled: the friend contacts Brenda and is registered by hand. That is
-- deliberate — a gift bought in August for a cohort in November would
-- otherwise hold a seat for a woman who has not agreed to anything yet.
-- The cohort on the card is the BUYER'S WISH, carried along for Brenda.

alter table public.workshops
  add column if not exists gift_card_enabled boolean not null default false;

comment on column public.workshops.gift_card_enabled is
  'Can this product be bought as a gift card (store → גיפט קארד → product picker).';

-- The three Brenda named. Anything else is opt-in from the admin product form.
update public.workshops
   set gift_card_enabled = true
 where is_active
   and title in ('ליווי התפתחותי - סדנת עטופים', 'ליווי התפתחותי - סדנת מגלים', 'ליווי פרטני');

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  -- Human-readable, said out loud on the phone. Not a security token:
  -- redemption is a conversation with Brenda, not a self-service claim.
  code text not null unique,
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  buyer_name text,
  buyer_email text,
  workshop_id uuid references public.workshops(id) on delete set null,
  -- Snapshot. The email and Brenda's list must still read correctly if
  -- the product is renamed or retired a year from now.
  workshop_title text not null,
  cohort_id uuid references public.workshop_cohorts(id) on delete set null,
  cohort_label text,
  amount numeric not null default 0,
  -- pending  = created, payment not confirmed (nothing was sent)
  -- paid     = money confirmed, waiting for the buyer to name a friend
  -- sent     = the friend has the email
  -- redeemed = Brenda registered the friend
  -- cancelled= written off by Brenda
  status text not null default 'pending'
    check (status in ('pending','paid','sent','redeemed','cancelled')),
  recipient_name text,
  recipient_email text,
  personal_message text,
  paid_at timestamptz,
  sent_at timestamptz,
  send_error text,
  redeemed_at timestamptz,
  admin_notes text,
  created_at timestamptz not null default now()
);

create index if not exists gift_cards_buyer_idx on public.gift_cards(buyer_user_id, created_at desc);
create index if not exists gift_cards_status_idx on public.gift_cards(status, created_at desc);

alter table public.gift_cards enable row level security;

drop policy if exists "buyer reads own gift cards" on public.gift_cards;
create policy "buyer reads own gift cards" on public.gift_cards
  for select to authenticated
  using (buyer_user_id = auth.uid() or public.is_admin());

drop policy if exists "admin writes gift cards" on public.gift_cards;
create policy "admin writes gift cards" on public.gift_cards
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Buyers never write directly; every buyer-side change goes through the
-- SECURITY DEFINER RPCs in the next migration, which is what keeps status honest.

grant select on public.gift_cards to authenticated;
