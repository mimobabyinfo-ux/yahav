-- Brenda 16.9.26: on the public registration page show the weekday next
-- to the start date, and when a cohort's meetings are not one plain week
-- apart (holidays: the 23/09 עטופים cohort runs 23/09, 27/09, 14/10...),
-- show the actual dates. The page needs the meeting dates for that.
-- Return type changes, so drop + create. Applied in production 16.9.26.

drop function if exists get_public_cohorts(uuid[]);
create or replace function get_public_cohorts(p_workshop_ids uuid[])
returns table(
  id uuid, workshop_id uuid, start_date date, start_time time,
  label text, capacity integer, registered_count bigint,
  meeting_dates date[]
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.workshop_id,
    c.start_date,
    c.start_time,
    c.label,
    coalesce(c.capacity, w.stock_quantity) as capacity,
    (select count(*) from registration_leads r where r.cohort_id = c.id) as registered_count,
    (select array_agg(m.meeting_date order by m.meeting_number)
       from cohort_meetings m
      where m.cohort_id = c.id and not coalesce(m.is_cancelled, false)) as meeting_dates
  from workshop_cohorts c
  join workshops w on w.id = c.workshop_id
  where c.workshop_id = any(p_workshop_ids)
    and c.is_active
    and c.start_date > (now() at time zone 'Asia/Jerusalem')::date
  order by c.start_date, c.start_time nulls first;
$$;
grant execute on function get_public_cohorts(uuid[]) to anon, authenticated;
