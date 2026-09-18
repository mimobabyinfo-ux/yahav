-- Yahav 18.9.26: "אני רוצה שהאירועים החדשים שיצאו יקפיצו להם הודעה,
-- וכשמתפנה מקום / השלמה שאושרה גם". Two more push moments, both on top
-- of what already exists (email for makeups, the in-app list for events).
-- (Applied through the Supabase MCP on 18.9.26; this file is the record.)

-- 1. The makeup notification view also carries the mother's user_id, so
--    allocate-makeups can push to her subscriptions next to the email.
create or replace view public.v_makeup_notifications as
 SELECT q.id AS request_id,
    q.status,
    q.reject_reason,
    rl.name AS mother_name,
    rl.email AS mother_email,
    w.title AS workshop_title,
    sm.meeting_number,
    sm.meeting_date AS missed_date,
    tm.meeting_date AS makeup_date,
    COALESCE(tm.start_time, tc.start_time) AS makeup_time,
    COALESCE(tc.label, to_char((tc.start_date)::timestamp with time zone, 'DD/MM'::text)) AS makeup_cohort_label,
    rl.user_id AS mother_user_id
   FROM makeup_requests q
     JOIN registration_leads rl ON rl.id = q.lead_id
     JOIN cohort_meetings sm ON sm.id = q.source_cohort_meeting_id
     JOIN cohort_meetings tm ON tm.id = q.target_cohort_meeting_id
     JOIN workshop_cohorts tc ON tc.id = tm.cohort_id
     JOIN workshop_cohorts sc ON sc.id = sm.cohort_id
     JOIN workshops w ON w.id = sc.workshop_id
  WHERE q.decided_at IS NOT NULL AND q.notified_at IS NULL AND q.status = ANY (ARRAY['confirmed'::text, 'rejected'::text]);

-- 2. A community event that becomes visible (inserted active, or flipped
--    from draft to active) with a future date calls notify-new-event,
--    which pushes "מפגש חדש בקהילה" to every subscribed mother. The
--    function is idempotent per (user, event) via push_notification_log.
create or replace function public.notify_on_new_event()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.is_active
     and new.event_date >= (now() at time zone 'Asia/Jerusalem')::date
     and (tg_op = 'INSERT' or coalesce(old.is_active, false) = false) then
    perform net.http_post(
      url := 'https://pkekucngirkjqigpmlrt.supabase.co/functions/v1/notify-new-event',
      body := jsonb_build_object('event_id', new.id),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 15000
    );
  end if;
  return null;
end;
$$;

drop trigger if exists community_events_notify_new on community_events;
create trigger community_events_notify_new
  after insert or update of is_active on community_events
  for each row
  execute function public.notify_on_new_event();
