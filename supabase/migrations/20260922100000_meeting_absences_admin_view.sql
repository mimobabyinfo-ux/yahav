-- 22.9.26: ברנדה רוצה ללחוץ על "1 הודיעו שלא מגיעות" במסך ההשלמות ולראות מי זאת,
-- ואם ביקשה השלמה. security_invoker: הטבלאות למטה קריאות לאדמין בלבד.
create or replace view public.v_meeting_absences_admin
with (security_invoker = true) as
select
  a.id as absence_id,
  a.cohort_meeting_id as meeting_id,
  a.created_at as marked_at,
  rl.id as lead_id,
  rl.name as mother_name,
  rl.phone as mother_phone,
  (
    select json_build_object(
      'status', q.status,
      'makeup_date', tm.meeting_date,
      'makeup_time', coalesce(tm.start_time, tc.start_time),
      'makeup_cohort_label', coalesce(tc.label, to_char(tc.start_date::timestamptz, 'DD/MM'))
    )
    from public.makeup_requests q
    join public.cohort_meetings tm on tm.id = q.target_cohort_meeting_id
    join public.workshop_cohorts tc on tc.id = tm.cohort_id
    where q.lead_id = a.lead_id
      and q.source_cohort_meeting_id = a.cohort_meeting_id
      and q.status in ('requested', 'confirmed', 'attended')
    order by q.requested_at desc
    limit 1
  ) as makeup
from public.meeting_absences a
join public.registration_leads rl on rl.id = a.lead_id
where a.cancelled_at is null;

grant select on public.v_meeting_absences_admin to authenticated;
