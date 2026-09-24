-- יהב 24.9.26: leads screen split into דחוף / בינוני / נמוך, and "לא רלוונטי"
-- must carry one of the CRM's existing lost reasons.
-- Applied to production via Supabase MCP on 24.9.26 (migration name crm_leads_priority_and_lost_reasons).

-- Callback date found in the latest human note when the CRM date field is empty
-- (filled by crm-leads-sync), and whether the only answer to her last message was the bot.
alter table public.crm_leads add column if not exists note_callback_date date;
alter table public.crm_leads add column if not exists last_inbound_by_bot boolean default false;

-- GHL's API returns lostReasonId but never the label, so labels are typed once by hand.
-- crm-leads-sync adds any new id it sees on lost opportunities (label null until named).
create table if not exists public.crm_lost_reasons (
  id text primary key,
  label text,
  example text,
  uses int default 0,
  sort int default 100,
  active boolean default true,
  created_at timestamptz default now()
);
alter table public.crm_lost_reasons enable row level security;
drop policy if exists crm_lost_reasons_admin_all on public.crm_lost_reasons;
create policy crm_lost_reasons_admin_all on public.crm_lost_reasons for all using (public.is_admin()) with check (public.is_admin());

-- The ten reasons seen on the last 100 lost leads (24.9.26), with one lead as an example.
insert into public.crm_lost_reasons (id, example, uses) values
  ('6a4f4664c5378784f4e67c74', 'Nitsan Ben Zvi', 34),
  ('6a4f463112aa8b5d49d46853', 'Lior Edry', 28),
  ('6a4f472fd3b4cc261fa47c58', 'רקאל סבן', 9),
  ('6a4f483d164438b9f399eed6', 'تسنيم رفاعي', 9),
  ('6a4f4b7640cacdeacf8811c5', 'Eden Danon Schneider', 6),
  ('6a4f4b539d77fc645c165500', 'אוריה מזרחי', 6),
  ('6a4f4ab83aa0a25ac2181772', 'Stav Hadar', 3),
  ('6a4f467fc5378784f4e67c94', 'Ruth sharabi', 2),
  ('6a4f4a3e0559dc2df84b9883', 'Or Ziv', 2),
  ('6a4f47eb9d77fc645c1652bf', 'עדן גרבי', 1)
on conflict (id) do nothing;
