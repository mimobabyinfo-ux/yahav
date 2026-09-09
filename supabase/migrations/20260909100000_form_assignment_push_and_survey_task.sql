-- Brenda 7.9.26, two additions to the questionnaire flow.
--
-- 1. A push when a form is assigned. Trigger on form_assignments INSERT
--    calls the notify-form-assignment edge function (web push to the
--    mother's subscriptions, only if she turned reminders on). Fires for
--    every source of assignments: the opening-form trigger after payment,
--    the survey job below, and the admin "שייך טופס למשתמשות" modal.
--
-- 2. The end-of-workshop survey as an in-app task. Daily job: a cohort
--    whose last meeting (or end_date) was exactly survey_email_delay_days
--    ago gets its product's feedback_form_id assigned to every paid
--    registrant who has an account. The More Than email keeps going out
--    as before (Brenda 23.8.26); this is the second channel, in the app.
--    survey_sent_at is stamped, so the "✓ שאלון משוב נשלח" indicator in
--    the cohorts screen becomes accurate again.
--
--    Exactly-N-days-ago on purpose, not "at least": nothing is backfilled
--    for cohorts that ended before this shipped, and a mother is never
--    asked weeks late. A day the job misses is a day lost, not a flood.

-- ── 1. push on assignment ───────────────────────────────────────────────

create or replace function public.notify_on_form_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://pkekucngirkjqigpmlrt.supabase.co/functions/v1/notify-form-assignment',
    body := jsonb_build_object('assignment_id', new.id),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 15000
  );
  return null;
end;
$$;

drop trigger if exists form_assignments_notify on form_assignments;
create trigger form_assignments_notify
  after insert on form_assignments
  for each row
  execute function public.notify_on_form_assignment();

-- ── 2. end-of-cohort survey task ────────────────────────────────────────

create or replace function public.assign_cohort_surveys()
returns table (cohort_id uuid, assigned integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delay integer;
  v_today date := (now() at time zone 'Asia/Jerusalem')::date;
  c record;
  n integer;
begin
  select coalesce(nullif(setting_value, '')::integer, 2)
    into v_delay
    from global_settings where setting_key = 'survey_email_delay_days';
  v_delay := coalesce(v_delay, 2);

  for c in
    select wc.id, w.feedback_form_id, f.title as form_title
      from workshop_cohorts wc
      join workshops w on w.id = wc.workshop_id
      join forms f on f.id = w.feedback_form_id and f.is_active
     where wc.survey_sent_at is null
       and coalesce(
             (select max(m.meeting_date) from cohort_meetings m
               where m.cohort_id = wc.id and not m.is_cancelled),
             wc.end_date
           ) = v_today - v_delay
  loop
    insert into form_assignments (form_id, user_id, title, description)
    select distinct c.feedback_form_id, l.user_id, c.form_title, 'איך היה? נשמח למשוב קצר על הסדנה'
      from registration_leads l
     where l.cohort_id = c.id
       and l.status = 'paid'
       and l.user_id is not null
       and not exists (select 1 from form_assignments fa
                        where fa.form_id = c.feedback_form_id and fa.user_id = l.user_id)
       and not exists (select 1 from form_submissions s
                        where s.form_id = c.feedback_form_id and s.user_id = l.user_id
                          and s.created_at > v_today - interval '60 days');
    get diagnostics n = row_count;

    update workshop_cohorts set survey_sent_at = now() where id = c.id;

    cohort_id := c.id; assigned := n;
    return next;
  end loop;
end;
$$;

select cron.unschedule('assign-cohort-surveys-daily')
 where exists (select 1 from cron.job where jobname = 'assign-cohort-surveys-daily');
-- 06:00 UTC = 09:00 Israel (08:00 in winter). A morning task, not a midnight one.
select cron.schedule('assign-cohort-surveys-daily', '0 6 * * *', $cron$ select public.assign_cohort_surveys() $cron$);
