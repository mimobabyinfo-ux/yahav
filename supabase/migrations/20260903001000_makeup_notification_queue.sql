-- תור ההודעות אחרי ההקצאה.
--
-- ה-Edge Function allocate-makeups קורא מכאן במקום להרכיב חמישה joins בקוד,
-- ו-notified_at הוא השומר מפני שליחה כפולה: בקשה שהמייל עליה נכשל תיאסף
-- שוב בריצה הבאה, ובקשה שנשלחה לא תיאסף לעולם.
--
-- הוחל על פרודקשן 3.9.2026; הקובץ הזה הוא הרישום בריפו.

create or replace view public.v_makeup_notifications with (security_invoker = on) as
select
  q.id                as request_id,
  q.status,
  q.reject_reason,
  rl.name             as mother_name,
  rl.email            as mother_email,
  w.title             as workshop_title,
  sm.meeting_number,
  sm.meeting_date     as missed_date,
  tm.meeting_date     as makeup_date,
  coalesce(tm.start_time, tc.start_time) as makeup_time,
  coalesce(tc.label, to_char(tc.start_date,'DD/MM')) as makeup_cohort_label
from makeup_requests q
join registration_leads rl on rl.id = q.lead_id
join cohort_meetings sm on sm.id = q.source_cohort_meeting_id
join cohort_meetings tm on tm.id = q.target_cohort_meeting_id
join workshop_cohorts tc on tc.id = tm.cohort_id
join workshop_cohorts sc on sc.id = sm.cohort_id
join workshops w on w.id = sc.workshop_id
where q.decided_at is not null
  and q.notified_at is null
  and q.status in ('confirmed','rejected');

comment on view public.v_makeup_notifications is
  'בקשות שהוכרעו וטרם נשלחה עליהן הודעה. נצרך על ידי Edge Function allocate-makeups.';

grant select on public.v_makeup_notifications to authenticated;

create or replace function public.mark_makeups_notified(p_ids uuid[])
returns int
language sql
security definer
set search_path to 'public'
as $$
  with upd as (
    update makeup_requests set notified_at = now()
     where id = any(p_ids) and notified_at is null
     returning 1
  ) select count(*)::int from upd;
$$;

-- רק ה-Edge Function מסמן "נשלח". חשיפה ל-authenticated הייתה נותנת
-- לכל משתמשת להשתיק הודעות של אחרות.
revoke all on function public.mark_makeups_notified(uuid[]) from public, anon, authenticated;
grant execute on function public.mark_makeups_notified(uuid[]) to service_role;

-- pg_cron (הורץ ידנית, לא חלק מהמיגרציה כי הפקודה נושאת מפתח service-role):
--   select cron.schedule('allocate-makeups-hourly', '35 * * * *',
--     replace((select command from cron.job where jobname = 'sync-paid-to-crm-hourly'),
--             'sync-paid-to-crm', 'allocate-makeups'));
-- שכפול הפקודה של job קיים במקום להדביק את המפתח מחדש: המפתח לא יוצא
-- מהמסד בשום שלב.
