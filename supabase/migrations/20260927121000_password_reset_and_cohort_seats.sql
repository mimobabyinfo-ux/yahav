-- 27.9.26, applied to production via MCP.
-- (1) שכחתי סיסמה: log + throttle table for the request-password-reset edge function.
create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  outcome text,
  created_at timestamptz not null default now()
);
create index if not exists password_reset_requests_email_created on public.password_reset_requests (email, created_at desc);
alter table public.password_reset_requests enable row level security;
create policy "admins read reset requests" on public.password_reset_requests for select using (exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.is_admin));

-- (2) Seats: pending registrations no longer take a seat; hidden_seats per cohort.
alter table public.workshop_cohorts
  add column if not exists hidden_seats integer not null default 0 check (hidden_seats >= 0);

create or replace function public.get_public_cohorts(p_workshop_ids uuid[])
 returns table(id uuid, workshop_id uuid, start_date date, start_time time without time zone, label text, capacity integer, registered_count bigint, meeting_dates date[])
 language sql security definer set search_path to 'public'
as $function$
  select
    c.id, c.workshop_id, c.start_date, c.start_time, c.label,
    x.cap as capacity,
    case
      when x.cap is null then x.taken
      when x.cap - x.taken <= 0 then x.taken
      else x.cap - greatest(1, x.cap - x.taken - c.hidden_seats)
    end::bigint as registered_count,
    (select array_agg(m.meeting_date order by m.meeting_number)
       from cohort_meetings m
      where m.cohort_id = c.id and not coalesce(m.is_cancelled, false)) as meeting_dates
  from workshop_cohorts c
  join workshops w on w.id = c.workshop_id
  cross join lateral (
    select coalesce(c.capacity, w.stock_quantity) as cap,
           (select count(*) from registration_leads r
             where r.cohort_id = c.id and r.status <> 'pending') as taken
  ) x
  where c.workshop_id = any(p_workshop_ids)
    and c.is_active
    and c.start_date > (now() at time zone 'Asia/Jerusalem')::date
  order by c.start_date, c.start_time nulls first;
$function$;

create or replace view public.v_cohort_fill as
 select c.id as cohort_id, c.workshop_id, w.title as workshop_title, c.start_date, c.start_time, c.label,
    coalesce(c.capacity, w.stock_quantity) as capacity,
    (select count(*) from registration_leads l where l.cohort_id = c.id and l.status <> 'pending') as registered
   from workshop_cohorts c join workshops w on w.id = c.workshop_id
  where c.is_active and (c.start_date > current_date or (c.start_date = current_date and (c.start_time is null or c.start_time >= localtime)));
