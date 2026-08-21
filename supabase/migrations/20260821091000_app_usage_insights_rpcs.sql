-- Brenda 21.8.26: "אני רוצה לדעת מה האמהות עשו באפליקציה — כמה זמן הם היו
-- שם, איזה עמודים הם ראו... ומה הדבר העיקרי שהם עושות שם."
--
-- Two admin-only functions behind the new usage screen. Both EXCLUDE
-- admins: Brenda's own clicking was 170 of the first 890 page views and
-- it drowns out the mothers she is trying to see.
--
-- A "session" is a session_id from the tracker — one browser tab, one
-- visit. Its length is last event minus first event, which under-counts
-- the final screen she looked at; a one-page visit reads as 0. That is
-- honest and worth knowing: on 18-21.8 the MEDIAN visit was 14 seconds,
-- which is the real headline.

create or replace function public.get_app_usage(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(p_days, 1));
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;

  with mothers as (
    select id, created_at, last_active from public.user_profiles
     where coalesce(is_admin, false) = false
  ),
  acts as (
    select a.* from public.user_activities a
     join mothers m on m.id = a.user_id
    where a.created_at >= since
  ),
  sess as (
    select user_id, session_id,
           extract(epoch from (max(created_at) - min(created_at))) as seconds,
           count(*) as views
      from acts group by 1, 2
  ),
  per_mother as (
    select user_id,
           count(distinct (created_at at time zone 'Asia/Jerusalem')::date) as days_seen,
           count(distinct session_id) as visits
      from acts group by 1
  ),
  page_rows as (
    select coalesce(event_data->>'page', 'לא ידוע') as page,
           count(*) as views, count(distinct user_id) as mothers
      from acts where event_type = 'page_view'
     group by 1 order by count(distinct user_id) desc limit 20
  ),
  action_rows as (
    select event_type as action,
           count(*) as cnt, count(distinct user_id) as mothers
      from acts where event_type <> 'page_view'
     group by 1 order by count(distinct user_id) desc limit 20
  ),
  day_rows as (
    select (created_at at time zone 'Asia/Jerusalem')::date as day,
           count(distinct user_id) as mothers,
           count(distinct session_id) as visits
      from acts group by 1 order by 1
  )
  select jsonb_build_object(
    'days', p_days,
    'mothers_total', (select count(*) from mothers),
    'mothers_new', (select count(*) from mothers where created_at >= since),
    'active_today', (select count(distinct user_id) from acts
                      where (created_at at time zone 'Asia/Jerusalem')::date
                          = (now() at time zone 'Asia/Jerusalem')::date),
    'active_7d', (select count(distinct user_id) from acts where created_at >= now() - interval '7 days'),
    'active_30d', (select count(distinct user_id) from acts where created_at >= now() - interval '30 days'),
    'active_window', (select count(distinct user_id) from acts),
    'never_opened', (select count(*) from mothers where last_active is null),
    'visits', (select count(*) from sess),
    'visits_per_mother', (select round(avg(visits)::numeric, 1) from per_mother),
    'median_seconds', (select round(percentile_cont(0.5) within group (order by seconds)::numeric) from sess),
    'avg_seconds', (select round(avg(seconds)::numeric) from sess),
    -- A visit under 20 seconds is a glance, not a use. "What is the main
    -- thing they do there" reads very differently if most visits are glances.
    'glance_visits', (select count(*) from sess where seconds < 20),
    'avg_views_per_visit', (select round(avg(views)::numeric, 1) from sess),
    'returned', (select count(*) from per_mother where days_seen > 1),
    'one_day_only', (select count(*) from per_mother where days_seen = 1),
    'journal_entries', (select count(*) from public.daily_log_entries d
                         join mothers m on m.id = d.user_id where d.created_at >= since),
    'journal_mothers', (select count(distinct d.user_id) from public.daily_log_entries d
                         join mothers m on m.id = d.user_id where d.created_at >= since),
    'pages', (select coalesce(jsonb_agg(jsonb_build_object(
                'page', page, 'views', views, 'mothers', mothers)), '[]'::jsonb) from page_rows),
    'actions', (select coalesce(jsonb_agg(jsonb_build_object(
                'action', action, 'count', cnt, 'mothers', mothers)), '[]'::jsonb) from action_rows),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
                'day', day, 'mothers', mothers, 'visits', visits)), '[]'::jsonb) from day_rows)
  ) into result;

  return result;
end;
$$;

-- The two lists Brenda can act on today. p_mode: 'dormant' (has not
-- opened the app in p_days) or 'active' (most visits in the window).
create or replace function public.get_mothers_activity(
  p_mode text default 'dormant',
  p_days int default 14,
  p_limit int default 40
)
returns table(
  user_id uuid,
  mother_name text,
  phone_number text,
  email text,
  joined date,
  last_active timestamptz,
  days_since int,
  visits bigint,
  journal_entries bigint,
  event_registrations bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with mothers as (
    select id, mother_name, phone_number, email, created_at, last_active
      from public.user_profiles
     where coalesce(is_admin, false) = false
  ),
  v as (
    select user_id, count(distinct session_id) as visits
      from public.user_activities
     where created_at >= now() - make_interval(days => greatest(p_days, 1))
     group by 1
  )
  select m.id, m.mother_name, m.phone_number, m.email, m.created_at::date, m.last_active,
         case when m.last_active is null then null
              else extract(day from now() - m.last_active)::int end,
         coalesce(v.visits, 0),
         (select count(*) from public.daily_log_entries d where d.user_id = m.id),
         (select count(*) from public.event_registrations r
           where r.user_id = m.id and r.status in ('registered','attended'))
    from mothers m
    left join v on v.user_id = m.id
   where public.is_admin()
     and case
           when p_mode = 'active' then coalesce(v.visits, 0) > 0
           -- Dormant includes mothers who never opened it at all: a signup
           -- that never became a visit is the same problem, only worse.
           else (m.last_active is null
                 or m.last_active < now() - make_interval(days => greatest(p_days, 1)))
         end
   order by case when p_mode = 'active' then coalesce(v.visits, 0) end desc nulls last,
            case when p_mode <> 'active' then m.last_active end asc nulls first
   limit greatest(p_limit, 1);
$$;

grant execute on function public.get_app_usage(int) to authenticated;
grant execute on function public.get_mothers_activity(text, int, int) to authenticated;
