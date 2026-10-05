-- 6.10.26 admin improvement round (Yahav).
--
-- A. Payments per registration. Until now a registration was only
--    "ממתינה / שילמה", with no amount. A mother who paid 400 by card and
--    400 in cash, or who owes the rest in cash, had no place in the system.
--    lead_payments holds every payment Brenda records (any method), and
--    registration_leads.price_due is the agreed price when it differs from
--    the product / offer price. Balance = due - sum(payments), computed in
--    the client. A paid registration with NO payment rows is treated as
--    fully paid (everything before this date), so no false debts appear.
--
-- B. A Morning payment the webhook could not attach (outcome 'unmatched')
--    can now be attached to a registration by hand: admin_assign_payment
--    writes a lead_payments row (morning_log_id, unique, so one payment is
--    never attached twice), flips a pending registration to paid (the
--    existing welcome trigger then runs as with any manual "שילמה"), and
--    marks the log row outcome = 'manual_match'. With p_as_full (default)
--    the total paid becomes price_due, so a discount is never read as debt. admin_close_payment marks
--    one as 'dismissed' (a test payment, a private session paid outside
--    the app). The money still counts in "נכנס החודש" either way.
--
-- C. Opening-form equivalence by EMAIL too. latest_submission_for_user
--    matched a mother's earlier answer only by account or phone. Tal Marom
--    (מגלים 18.11) typed her phone with two digits swapped and got a second
--    account, so her עטופים answer was never copied. Email now counts too.

create table if not exists public.lead_payments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.registration_leads(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  method text not null default 'card' check (method in ('card','cash','bit','transfer','credit','other')),
  paid_at date not null default ((now() at time zone 'Asia/Jerusalem')::date),
  note text,
  morning_log_id uuid unique references public.morning_webhook_log(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists lead_payments_lead_idx on public.lead_payments(lead_id);
alter table public.lead_payments enable row level security;
drop policy if exists lead_payments_admin_all on public.lead_payments;
create policy lead_payments_admin_all on public.lead_payments
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.registration_leads add column if not exists price_due numeric(10,2);

create or replace function public.admin_assign_payment(p_log_id uuid, p_lead_id uuid, p_as_full boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_log morning_webhook_log%rowtype; v_status text;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  select * into v_log from morning_webhook_log where id = p_log_id;
  if not found then raise exception 'payment not found'; end if;
  if exists (select 1 from lead_payments where morning_log_id = p_log_id) then
    return jsonb_build_object('ok', false, 'reason', 'already_attached');
  end if;
  select status into v_status from registration_leads where id = p_lead_id;
  if not found then raise exception 'registration not found'; end if;

  insert into lead_payments (lead_id, amount, method, paid_at, note, morning_log_id)
  values (p_lead_id, coalesce(v_log.total, 0.01), 'card',
          (v_log.received_at at time zone 'Asia/Jerusalem')::date,
          nullif(trim(coalesce(v_log.description, '')), ''), p_log_id);

  update registration_leads set status = 'paid' where id = p_lead_id and status = 'pending';

  -- Yahav 6.10: a returning mother paying with a discount (720, 680) is
  -- not a debt. "This is the full payment" makes what she paid in total
  -- the agreed price, so no false balance appears.
  if p_as_full then
    update registration_leads
       set price_due = (select sum(amount) from lead_payments where lead_id = p_lead_id)
     where id = p_lead_id;
  end if;

  update morning_webhook_log
     set outcome = 'manual_match',
         detail = 'manual_match lead:' || p_lead_id || ' (was: ' || coalesce(detail, '') || ')'
   where id = p_log_id and outcome = 'unmatched';

  return jsonb_build_object('ok', true, 'was_status', v_status);
end $$;

create or replace function public.admin_close_payment(p_log_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  update morning_webhook_log
     set outcome = 'dismissed',
         detail = 'dismissed' || coalesce(': ' || nullif(trim(p_note), ''), '') || ' (was: ' || coalesce(detail, '') || ')'
   where id = p_log_id and outcome = 'unmatched';
  return jsonb_build_object('ok', found);
end $$;

grant execute on function public.admin_assign_payment(uuid, uuid, boolean) to authenticated;
grant execute on function public.admin_close_payment(uuid, text) to authenticated;

-- C. email of a submission, read from the form's email field.
create or replace function public.form_submission_email(p_form_id uuid, p_responses jsonb)
returns text language plpgsql stable set search_path = public as $$
declare f jsonb; v text;
begin
  for f in select jsonb_array_elements(fields_json) from forms where id = p_form_id loop
    if (f->>'role') = 'email'
       or ((f->>'role') is null and (f->>'label') ~ '(מייל|email|Email)') then
      v := lower(trim(coalesce(p_responses->>(f->>'label'), '')));
      if v like '%@%' then return v; end if;
    end if;
  end loop;
  return null;
end $$;

create or replace function public.latest_submission_for_user(p_form_id uuid, p_user_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select s.id from form_submissions s
  where s.form_id = p_form_id
    and (s.user_id = p_user_id
      or form_submission_phone9(s.form_id, s.responses_json) in (
           select right(regexp_replace(l.phone, '\D', '', 'g'), 9)
           from registration_leads l where l.user_id = p_user_id and l.phone is not null)
      or form_submission_email(s.form_id, s.responses_json) in (
           select lower(trim(l.email)) from registration_leads l
            where l.user_id = p_user_id and l.email is not null
           union
           select lower(trim(p.email)) from user_profiles p
            where p.id = p_user_id and p.email is not null))
  order by s.created_at desc limit 1
$$;

-- One-time: every מגלים registration with an account and no מגלים answer,
-- that now resolves to an עטופים answer (by email). Today that is Tal Marom.
do $$
declare r record; v_src uuid;
begin
  for r in
    select distinct l.user_id from registration_leads l
    where l.selected_workshop_id = '3d2b2c93-da57-43e3-966b-de36dda973e7'
      and l.user_id is not null and l.status <> 'pending'
      and latest_submission_for_user('a1000000-0000-0000-0000-000000000005', l.user_id) is null
  loop
    v_src := latest_submission_for_user('a1000000-0000-0000-0000-000000000004', r.user_id);
    if v_src is not null then
      perform copy_submission_to_form(v_src, 'a1000000-0000-0000-0000-000000000005', r.user_id);
    end if;
  end loop;
end $$;
