-- Finding a Morning productId meant digging through Morning's UI, and
-- getting it wrong meant an event silently kept depending on the browser.
-- Every delivery is recorded here instead: pay once, read the id off this
-- table, paste it on the event. It doubles as the audit trail for "did
-- Morning actually tell us about that payment?" — the question that started
-- the whole Bit thread.
create table if not exists public.morning_webhook_log (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  product_id text,
  description text,
  total numeric,
  payer_email text,
  payer_name text,
  payer_phone text,
  outcome text,   -- community_event / digital_course / unmatched
  detail text,
  payload jsonb
);

create index if not exists morning_webhook_log_received_idx
  on public.morning_webhook_log (received_at desc);
create index if not exists morning_webhook_log_product_idx
  on public.morning_webhook_log (product_id);

alter table public.morning_webhook_log enable row level security;

drop policy if exists morning_webhook_log_admin_read on public.morning_webhook_log;
create policy morning_webhook_log_admin_read on public.morning_webhook_log
  for select using (
    exists (select 1 from user_profiles p where p.id = auth.uid() and p.is_admin)
  );

comment on table public.morning_webhook_log is
  'Every payment/received delivery from Morning. Read product_id from here when wiring an event, and use it to check whether a payment ever reached us.';
