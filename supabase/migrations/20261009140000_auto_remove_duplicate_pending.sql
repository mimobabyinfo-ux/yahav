-- 9.10.26 (Yahav): when the same mother has two registrations for the SAME
-- cohort (same date and time) and one is paid, the unpaid one is just a
-- second attempt. He always deleted it by hand; now it goes by itself.
--
-- Rules (deliberately narrow):
--   * only a 'pending' row is removed, never paid/handled
--   * only when both rows have the same cohort_id (not null) and the same
--     product, so products without cohorts (a pouf bought twice) are untouched
--   * same person = same normalized phone or same email
--   * never a row that has any lead_payments (money recorded on it)
-- Every removed row is copied to auto_removed_registrations first, so it can
-- be restored.

create table if not exists public.auto_removed_registrations (
  id uuid primary key default gen_random_uuid(),
  removed_at timestamptz not null default now(),
  kept_lead_id uuid,
  row_data jsonb not null
);
alter table public.auto_removed_registrations enable row level security;
create policy auto_removed_registrations_admin on public.auto_removed_registrations
  for select using (public.is_admin());

create or replace function public.remove_duplicate_pending_for(p_kept uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  k registration_leads%rowtype;
  n integer := 0;
begin
  select * into k from registration_leads where id = p_kept;
  if not found or k.cohort_id is null or k.status not in ('paid', 'handled') then
    return 0;
  end if;

  with victims as (
    select d.* from registration_leads d
    where d.id <> k.id
      and d.status = 'pending'
      and d.cohort_id = k.cohort_id
      and d.selected_workshop_id is not distinct from k.selected_workshop_id
      and ((k.normalized_phone is not null and d.normalized_phone = k.normalized_phone)
        or (k.email is not null and d.email is not null and lower(d.email) = lower(k.email)))
      and not exists (select 1 from lead_payments lp where lp.lead_id = d.id)
  ), logged as (
    insert into auto_removed_registrations (kept_lead_id, row_data)
    select k.id, to_jsonb(v) from victims v
    returning (row_data->>'id')::uuid as lead_id
  )
  delete from registration_leads r using logged where r.id = logged.lead_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.remove_duplicate_pending_for(uuid) from public, anon, authenticated;

create or replace function public.trg_remove_duplicate_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('paid', 'handled') and new.cohort_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from new.status or old.cohort_id is distinct from new.cohort_id) then
    perform public.remove_duplicate_pending_for(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists remove_duplicate_pending on public.registration_leads;
create trigger remove_duplicate_pending
  after insert or update of status, cohort_id on public.registration_leads
  for each row execute function public.trg_remove_duplicate_pending();

-- A second attempt made AFTER the paid one is not caught by the trigger
-- (the paid row did not change). A daily sweep picks those up, one hour old
-- at least so a registration in the middle of paying is never touched.
create or replace function public.sweep_duplicate_pending()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  total integer := 0;
begin
  for r in
    select distinct p.id from registration_leads p
    join registration_leads d on d.id <> p.id and d.status = 'pending' and d.cohort_id = p.cohort_id
      and d.created_at < now() - interval '1 hour'
      and d.selected_workshop_id is not distinct from p.selected_workshop_id
      and ((p.normalized_phone is not null and d.normalized_phone = p.normalized_phone)
        or (p.email is not null and d.email is not null and lower(d.email) = lower(p.email)))
    where p.status in ('paid', 'handled') and p.cohort_id is not null
  loop
    total := total + public.remove_duplicate_pending_for(r.id);
  end loop;
  return total;
end;
$$;

revoke all on function public.sweep_duplicate_pending() from public, anon, authenticated;
