-- ── תשובה מיידית כשהיא כבר ידועה, ובלי לחשוף מספרי הרשמה ────────────────────
-- ברנדה 3.9.26: "אם יש לי קבוצה עם 7 נרשמות והמקסימום שלי הוא 8, לא צריך
-- להודיע לה 24 שעות לפני, כבר הקבוצה המקבילה התחילה ואנחנו יודעים שיש שם
-- מקום... רק אם זה קבוצה שעוד לא נפתחה ולכן אנחנו לא יודעים כמה אנשים
-- נרשמו." ברגע שהמפגש הראשון של הקבוצה המארחת כבר קרה, אין עוד נרשמות
-- מקוריות שיצטרפו אליה - הרוסטר שלה סופי, ואפשר להכריע על בקשת השלמה
-- באותו רגע במקום לחכות ל-24 שעות לפני. זה נוגע כמעט תמיד רק להשלמות של
-- מפגש 1 (כל מפגש אחר הוא בקבוצה שכבר התחילה, מעצם ההגדרה).
--
-- "אני לא רוצה שידעו כמה רשומות יש לי בכל קבוצה - מקום או אין מקום":
-- registered_now ו-capacity יורדים מ-get_makeup_options; available_now הוא
-- האות הבינארי היחיד שנשאר.
create or replace function public.cohort_enrollment_settled(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from cohort_meetings m1
      join cohort_meetings m0
        on m0.cohort_id = m1.cohort_id and m0.meeting_number = 1
     where m1.id = p_meeting_id
       and public.meeting_starts_at(m0.id) <= now()
  );
$$;

comment on function public.cohort_enrollment_settled(uuid) is
  'האם המפגש הראשון של הקבוצה המארחת כבר קרה - ואז הרוסטר שלה כבר סופי וידוע.';

grant execute on function public.cohort_enrollment_settled(uuid) to authenticated;

-- הקצאה "חיה": כמו allocate_makeups, אבל לא נועלת את המפגש (allocated_at
-- נשאר null) ולא דוחה אף אחת - רק מאשרת מה שנכנס במקום הפנוי כרגע. אפשר
-- להריץ שוב ושוב בבטחה בכל פעם שיש מידע חדש (בקשה חדשה, או מקום שהתפנה).
-- ההקצאה הסופית שנועלת (allocate_makeups, 24 שעות לפני) עדיין רצה על כל
-- מפגש בסוף, ודוחה מה שבאמת לא נכנס.
create or replace function public.allocate_makeups_live(p_meeting_id uuid)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_free int;
  v_conf int := 0;
  r      record;
begin
  if exists (select 1 from cohort_meetings
              where id = p_meeting_id and (allocated_at is not null or is_cancelled)) then
    return 0;
  end if;

  v_free := public.meeting_free_seats(p_meeting_id);

  for r in
    select id from makeup_requests
     where target_cohort_meeting_id = p_meeting_id and status = 'requested'
     order by requested_at, id
  loop
    exit when v_free <= 0;
    update makeup_requests set status = 'confirmed', decided_at = now() where id = r.id;
    v_free := v_free - 1;
    v_conf := v_conf + 1;
  end loop;

  return v_conf;
end;
$$;

comment on function public.allocate_makeups_live(uuid) is
  'מאשרת בקשות השלמה למפגש שהרוסטר שלו כבר סופי, על בסיס מקום פנוי כרגע. לא נועלת ולא דוחה.';

revoke all on function public.allocate_makeups_live(uuid) from public, anon, authenticated;
grant execute on function public.allocate_makeups_live(uuid) to service_role;

-- ── המועדים האפשריים להשלמה, בלי מספרים ──────────────────────────────────────
drop function if exists public.get_makeup_options(uuid);
create or replace function public.get_makeup_options(p_source_meeting_id uuid)
returns table (
  meeting_id uuid,
  cohort_id uuid,
  cohort_label text,
  meeting_number int,
  meeting_date date,
  start_time time,
  starts_at timestamptz,
  decision_at timestamptz,
  is_immediate boolean,
  queue_ahead int,
  available_now boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with src as (
    select m.id, m.meeting_number, c.id as cohort_id, c.start_date, c.workshop_id
      from cohort_meetings m
      join workshop_cohorts c on c.id = m.cohort_id
      join registration_leads rl on rl.cohort_id = c.id
     where m.id = p_source_meeting_id
       and rl.id in (select public.my_lead_ids())
     limit 1
  ),
  next_dates as (
    select distinct c.start_date
      from workshop_cohorts c, src
     where c.workshop_id = src.workshop_id
       and c.is_active
       and c.start_date > src.start_date
     order by c.start_date
     limit 2
  )
  select
    m.id,
    c.id,
    coalesce(c.label, to_char(c.start_date, 'DD/MM') || ' ' ||
             to_char(coalesce(c.start_time, time '00:00'), 'HH24:MI')),
    m.meeting_number,
    m.meeting_date,
    coalesce(m.start_time, c.start_time),
    public.meeting_starts_at(m.id),
    case when public.cohort_enrollment_settled(m.id) then null
         else public.meeting_starts_at(m.id) - interval '24 hours' end,
    public.cohort_enrollment_settled(m.id),
    (select count(*)::int from makeup_requests q
      where q.target_cohort_meeting_id = m.id and q.status = 'requested'),
    public.meeting_free_seats(m.id) > 0
  from cohort_meetings m
  join workshop_cohorts c on c.id = m.cohort_id
  join src on true
  where c.workshop_id = src.workshop_id
    and c.start_date in (select start_date from next_dates)
    and m.meeting_number = src.meeting_number
    and not m.is_cancelled
    and m.allocated_at is null
    and (
      (public.cohort_enrollment_settled(m.id) and public.meeting_starts_at(m.id) > now())
      or
      (not public.cohort_enrollment_settled(m.id) and public.meeting_starts_at(m.id) > now() + interval '24 hours')
    )
  order by m.meeting_date, coalesce(m.start_time, c.start_time);
$$;

grant execute on function public.get_makeup_options(uuid) to authenticated;

comment on function public.get_makeup_options(uuid) is
  'מועדי השלמה אפשריים למפגש שפוספס. בלי ספירת רשומות/קיבולת - רק זמינות בינארית ומצב ההכרעה (מיידי/מתוזמן).';

-- ── בקשה חדשה / שינוי מועד: אם היעד כבר ידוע, מכריעים באותו רגע ─────────────
create or replace function public.request_makeup(
  p_source_meeting_id uuid,
  p_target_meeting_id uuid
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lead uuid;
  v_used int;
  v_id uuid;
begin
  select rl.id into v_lead
    from registration_leads rl
    join cohort_meetings m on m.cohort_id = rl.cohort_id
   where m.id = p_source_meeting_id and rl.id in (select public.my_lead_ids())
   limit 1;
  if v_lead is null then raise exception 'not your meeting'; end if;

  if not exists (select 1 from meeting_absences a
                  where a.cohort_meeting_id = p_source_meeting_id
                    and a.lead_id = v_lead and a.cancelled_at is null) then
    raise exception 'declare absence first';
  end if;

  select count(*)::int into v_used
    from makeup_requests q
   where q.lead_id = v_lead
     and q.status in ('requested','confirmed','attended');
  if v_used >= 2 then raise exception 'quota exhausted'; end if;

  if not exists (select 1 from public.get_makeup_options(p_source_meeting_id) o
                  where o.meeting_id = p_target_meeting_id) then
    raise exception 'target not available';
  end if;

  insert into makeup_requests (lead_id, source_cohort_meeting_id, target_cohort_meeting_id)
  values (v_lead, p_source_meeting_id, p_target_meeting_id)
  returning id into v_id;

  if public.cohort_enrollment_settled(p_target_meeting_id) then
    perform public.allocate_makeups_live(p_target_meeting_id);
  end if;

  return v_id;
end;
$$;

create or replace function public.change_makeup_target(p_request_id uuid, p_target_meeting_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lead   uuid;
  v_source uuid;
  v_old_target uuid;
  v_new    uuid;
begin
  select q.lead_id, q.source_cohort_meeting_id, q.target_cohort_meeting_id
    into v_lead, v_source, v_old_target
    from makeup_requests q
   where q.id = p_request_id
     and q.lead_id in (select public.my_lead_ids())
     and q.status in ('requested','confirmed');
  if v_lead is null then raise exception 'request not found'; end if;

  if v_old_target = p_target_meeting_id then return p_request_id; end if;

  if not exists (select 1 from public.get_makeup_options(v_source) o
                  where o.meeting_id = p_target_meeting_id) then
    raise exception 'target not available';
  end if;

  update makeup_requests
     set status = 'cancelled', decided_at = now()
   where id = p_request_id;

  insert into makeup_requests (lead_id, source_cohort_meeting_id, target_cohort_meeting_id)
  values (v_lead, v_source, p_target_meeting_id)
  returning id into v_new;

  if public.cohort_enrollment_settled(p_target_meeting_id) then
    perform public.allocate_makeups_live(p_target_meeting_id);
  end if;

  return v_new;
end;
$$;

-- ── היעדרות חדשה בקבוצה שכבר "ידועה": יכולה לפנות מקום למי שממתינה ──────────
create or replace function public.set_meeting_absence(p_meeting_id uuid, p_absent boolean)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lead uuid;
begin
  select rl.id into v_lead
    from registration_leads rl
    join cohort_meetings m on m.cohort_id = rl.cohort_id
   where m.id = p_meeting_id and rl.id in (select public.my_lead_ids())
   limit 1;
  if v_lead is null then raise exception 'not your meeting'; end if;

  if p_absent then
    insert into meeting_absences (cohort_meeting_id, lead_id)
    values (p_meeting_id, v_lead)
    on conflict do nothing;

    -- מקום התפנה. אם הרוסטר של המפגש הזה כבר סופי, מי שממתינה להשלים
    -- אליו יכולה לקבל תשובה מיידית במקום לחכות ל-24 שעות לפני.
    if public.cohort_enrollment_settled(p_meeting_id)
       and exists (select 1 from makeup_requests q
                    where q.target_cohort_meeting_id = p_meeting_id and q.status = 'requested') then
      perform public.allocate_makeups_live(p_meeting_id);
    end if;

    return 'absent';
  end if;

  if exists (select 1 from cohort_meetings where id = p_meeting_id and allocated_at is not null) then
    raise exception 'allocation already ran';
  end if;

  update meeting_absences
     set cancelled_at = now()
   where cohort_meeting_id = p_meeting_id and lead_id = v_lead and cancelled_at is null;

  update makeup_requests
     set status = 'cancelled', decided_at = now()
   where lead_id = v_lead and source_cohort_meeting_id = p_meeting_id
     and status in ('requested','confirmed');

  return 'present';
end;
$$;

-- ── חריגת קיבולת: אם עוד לא ננעל, מכריעים מיד ────────────────────────────────
create or replace function public.admin_set_meeting_capacity(p_meeting_id uuid, p_capacity int)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_conf int;
begin
  if not exists (select 1 from user_profiles p where p.id = (select auth.uid()) and p.is_admin) then
    raise exception 'admin only';
  end if;

  update cohort_meetings set capacity_override = p_capacity where id = p_meeting_id;

  if exists (select 1 from cohort_meetings where id = p_meeting_id and allocated_at is not null) then
    update cohort_meetings set allocated_at = null where id = p_meeting_id;
    update makeup_requests
       set status = 'requested', decided_at = null, reject_reason = null, notified_at = null
     where target_cohort_meeting_id = p_meeting_id
       and status = 'rejected' and reject_reason = 'no_space';
    select confirmed into v_conf from public.allocate_makeups(p_meeting_id);
    return coalesce(v_conf, 0);
  end if;

  -- עוד לא ננעל: מכריעים מיד על מה שאפשר עם המקום הנוסף, בלי לחכות
  -- להקצאה האוטומטית של 24 שעות לפני.
  return coalesce(public.allocate_makeups_live(p_meeting_id), 0);
end;
$$;
