-- כדי שהאמא תוכל לשנות או לבטל את הבקשה, המסך צריך את המזהה שלה, ואת
-- פרטי המועד שנבחר. הוספת עמודות ל-returns table מחייבת drop ולא
-- create or replace.
--
-- הוחל על פרודקשן 3.9.2026; הקובץ הזה הוא הרישום בריפו.

drop function if exists public.get_my_cohort_schedule();

create function public.get_my_cohort_schedule()
returns table (
  lead_id uuid,
  workshop_id uuid,
  workshop_title text,
  cohort_id uuid,
  cohort_start_date date,
  meeting_id uuid,
  meeting_number int,
  meeting_date date,
  start_time time,
  starts_at timestamptz,
  is_cancelled boolean,
  is_past boolean,
  i_am_absent boolean,
  makeup_request_id uuid,
  makeup_status text,
  makeup_meeting_id uuid,
  makeup_meeting_date date,
  makeup_time time,
  makeup_cohort_label text,
  makeup_decision_at timestamptz,
  makeup_queue_position int,
  makeups_used int,
  makeups_allowed int
)
language sql stable security definer set search_path to 'public'
as $$
  with mine as (
    select rl.id as lead_id, rl.cohort_id, rl.selected_workshop_id as workshop_id
      from registration_leads rl where rl.id in (select public.my_lead_ids())
  ),
  used as (
    select m.lead_id, count(*)::int as n from mine m
      join makeup_requests q on q.lead_id = m.lead_id
     where q.status in ('confirmed','attended') group by m.lead_id
  )
  select mine.lead_id, mine.workshop_id, w.title, mine.cohort_id, c.start_date,
    cm.id, cm.meeting_number, cm.meeting_date, coalesce(cm.start_time, c.start_time),
    public.meeting_starts_at(cm.id), cm.is_cancelled,
    public.meeting_starts_at(cm.id) < now(), (a.id is not null),
    q.id, q.status, tm.id, tm.meeting_date, coalesce(tm.start_time, tc.start_time),
    coalesce(tc.label, to_char(tc.start_date,'DD/MM') || ' ' ||
             to_char(coalesce(tc.start_time, time '00:00'),'HH24:MI')),
    case when q.id is not null then public.meeting_starts_at(tm.id) - interval '24 hours' end,
    case when q.status = 'requested' then (select count(*)::int + 1 from makeup_requests q2
        where q2.target_cohort_meeting_id = q.target_cohort_meeting_id
          and q2.status = 'requested' and q2.requested_at < q.requested_at) end,
    coalesce(used.n, 0), 2
  from mine
  join workshop_cohorts c on c.id = mine.cohort_id
  join workshops w on w.id = c.workshop_id
  join cohort_meetings cm on cm.cohort_id = mine.cohort_id
  left join used on used.lead_id = mine.lead_id
  left join meeting_absences a on a.cohort_meeting_id = cm.id and a.lead_id = mine.lead_id and a.cancelled_at is null
  left join makeup_requests q on q.source_cohort_meeting_id = cm.id and q.lead_id = mine.lead_id
        and q.status in ('requested','confirmed','attended')
  left join cohort_meetings tm on tm.id = q.target_cohort_meeting_id
  left join workshop_cohorts tc on tc.id = tm.cohort_id
  order by c.start_date desc, cm.meeting_number;
$$;

grant execute on function public.get_my_cohort_schedule() to authenticated;
