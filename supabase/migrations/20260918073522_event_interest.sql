-- Yahav 18.9.26: "מה עושים עם כאלה שרצו את אחד האירועים ולא היה מקום או
-- שפשוט היום/השעה לא הסתדרו". A mother who wants the event but not this
-- date says so in one tap, with a reason, so when the event runs again
-- Brenda knows who to write to and on which day. Not a registration, not
-- a waitlist entry (that one means "I want THIS date"); nothing here
-- counts against capacity.
-- (Applied through the Supabase MCP on 18.9.26; this file is the record.)
create table if not exists public.event_interest (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.community_events(id) on delete cascade,
  user_id     uuid not null references public.user_profiles(id) on delete cascade,
  reason      text not null check (reason in ('day', 'time', 'full', 'other')),
  created_at  timestamptz not null default now(),
  unique (event_id, user_id)
);
comment on table public.event_interest is 'לא מסתדר לי הפעם, אשמח פעם הבאה - עניין באירוע קהילה בלי הרשמה. reason: day=היום לא מתאים, time=השעה לא מתאימה, full=לא היה מקום, other=אחר';

create index if not exists event_interest_event_idx on public.event_interest(event_id);

alter table public.event_interest enable row level security;

create policy "own interest: read" on public.event_interest
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "own interest: insert" on public.event_interest
  for insert to authenticated with check (user_id = auth.uid());
create policy "own interest: update" on public.event_interest
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own interest: delete" on public.event_interest
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());
