-- כל בקשות ההשלמה עם השמות והתאריכים, לקריאה במסך האדמין.
--
-- עדיף על embedding ב-PostgREST כי ל-makeup_requests יש שני מפתחות זרים
-- לאותה טבלה (מפגש המקור ומפגש היעד), וזה מכריח פירוק ידני בכל שאילתה
-- בצד הלקוח. security_invoker, כלומר רק מי שה-RLS מרשה לה, כלומר אדמין.
--
-- הוחל על פרודקשן 3.9.2026; הקובץ הזה הוא הרישום בריפו.

create or replace view public.v_makeup_requests_admin with (security_invoker = on) as
select
  q.id                as request_id,
  q.status,
  q.reject_reason,
  q.requested_at,
  q.decided_at,
  q.notified_at,
  rl.id               as lead_id,
  rl.name             as mother_name,
  rl.phone            as mother_phone,
  rl.email            as mother_email,
  w.title             as workshop_title,
  sm.meeting_number,
  sm.meeting_date     as missed_date,
  coalesce(sc.label, to_char(sc.start_date,'DD/MM')) as source_cohort_label,
  tm.id               as target_meeting_id,
  tm.meeting_date     as makeup_date,
  coalesce(tm.start_time, tc.start_time) as makeup_time,
  coalesce(tc.label, to_char(tc.start_date,'DD/MM')) as makeup_cohort_label,
  tm.allocated_at,
  case when q.status = 'requested' then
    (select count(*)::int + 1 from makeup_requests q2
      where q2.target_cohort_meeting_id = q.target_cohort_meeting_id
        and q2.status = 'requested' and q2.requested_at < q.requested_at)
  end                 as queue_position
from makeup_requests q
join registration_leads rl on rl.id = q.lead_id
join cohort_meetings sm on sm.id = q.source_cohort_meeting_id
join workshop_cohorts sc on sc.id = sm.cohort_id
join cohort_meetings tm on tm.id = q.target_cohort_meeting_id
join workshop_cohorts tc on tc.id = tm.cohort_id
join workshops w on w.id = sc.workshop_id;

comment on view public.v_makeup_requests_admin is
  'בקשות השלמה עם שמות ותאריכים, למסך ההשלמות באדמין. security_invoker, כלומר אדמין בלבד.';

grant select on public.v_makeup_requests_admin to authenticated;
