-- Yahav 18.9.26: a full cohort (8 of 8) left no room for a makeup, and
-- most no-shows are announced the morning of the meeting, too late for
-- anyone to claim the freed seat. So the room for makeups is the cohort's
-- registration capacity PLUS a few extra seats, and the extra is a setting
-- (default 1, so 9). An explicit capacity_override on a meeting is still
-- absolute, as before.
-- (Applied through the Supabase MCP on 18.9.26; this file is the record.)
insert into global_settings (setting_key, setting_value)
values ('makeup_extra_seats', '1')
on conflict (setting_key) do nothing;

create or replace function public.makeup_extra_seats()
returns integer
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce(
    (select nullif(regexp_replace(setting_value, '[^0-9]', '', 'g'), '')::int
       from global_settings where setting_key = 'makeup_extra_seats' limit 1),
    1);
$$;

create or replace function public.effective_meeting_capacity(p_meeting_id uuid)
returns integer
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce(m.capacity_override,
                  coalesce(c.capacity, w.stock_quantity, 8) + public.makeup_extra_seats())
    from cohort_meetings m
    join workshop_cohorts c on c.id = m.cohort_id
    join workshops w on w.id = c.workshop_id
   where m.id = p_meeting_id;
$$;

create or replace view public.v_meeting_roster with (security_invoker = true) as
 SELECT m.id AS meeting_id,
    c.workshop_id,
    w.title AS workshop_title,
    m.cohort_id,
    c.start_date AS cohort_start_date,
    COALESCE(c.label, ((to_char((c.start_date)::timestamp with time zone, 'DD/MM'::text) || ' '::text) || to_char((COALESCE(c.start_time, '00:00:00'::time without time zone))::interval, 'HH24:MI'::text))) AS cohort_label,
    m.meeting_number,
    m.meeting_date,
    COALESCE(m.start_time, c.start_time) AS start_time,
    m.is_cancelled,
    m.allocated_at,
    COALESCE(m.capacity_override, COALESCE(c.capacity, w.stock_quantity, 8) + public.makeup_extra_seats()) AS capacity,
    ( SELECT count(*) FROM registration_leads rl WHERE rl.cohort_id = m.cohort_id) AS registered,
    ( SELECT count(*) FROM meeting_absences a WHERE a.cohort_meeting_id = m.id AND a.cancelled_at IS NULL) AS absent,
    ( SELECT count(*) FROM makeup_requests q WHERE q.target_cohort_meeting_id = m.id AND q.status = ANY (ARRAY['confirmed'::text, 'attended'::text])) AS makeups_in,
    ( SELECT count(*) FROM makeup_requests q WHERE q.target_cohort_meeting_id = m.id AND q.status = 'requested'::text) AS makeups_waiting
   FROM cohort_meetings m
     JOIN workshop_cohorts c ON c.id = m.cohort_id
     JOIN workshops w ON w.id = c.workshop_id;
