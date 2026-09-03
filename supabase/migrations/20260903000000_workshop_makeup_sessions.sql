-- השלמת מפגשים: לוח המפגשים של המחזור, היעדרויות, ובקשות השלמה.
--
-- Brenda 3.9.26: אמהות מפספסות מפגשים ומבקשות להשלים בקבוצה מקבילה. כל בקשה
-- דורשת ממנה שלוש פעולות ידניות: לחשב מתי אותו מפגש רץ במחזור אחר, לבדוק אם
-- יש שם מקום, ולרשום. זה גדל לינארית עם מספר האמהות.
--
-- השורש הטכני: workshop_cohorts מחזיק רק start_date/start_time/end_date.
-- חמשת המפגשים עצמם אינם רשומות, ושינויי מועד (שקורים לא מעט) חיים רק ביומן
-- החיצוני שלה. בלי לוח מפגשים במסד אי אפשר לאוטומט כלום.
--
-- העיקרון: בקשה ואישור הם שני דברים נפרדים. בקשה אינה נספרת בתפוסה ואינה
-- חוסמת אף נרשמת משלמת, כי ההרשמה למחזור המארח לרוב עוד לא נסגרה. ההכרעה
-- רצה פעם אחת, 24 שעות לפני המפגש, כשהרוסטר וההיעדרויות כבר ידועים.
--
-- הכללים שברנדה קבעה:
--   * עד 2 השלמות לאמא לכל סדנה
--   * אותו מספר מפגש, בשני מועדי הפתיחה הבאים של אותה סדנה בלבד
--   * נרשמות מקוריות תמיד קודמות. משלימה נכנסת רק למה שנשאר
--   * תור לפי סדר הבקשות
--   * הכרעה 24 שעות לפני
--   * קיבולת ברירת מחדל 8, עם אפשרות לחריגה נקודתית למפגש בודד
--   * השלמה נפתחת רק אחרי שהאמא סימנה שהיא לא הגיעה. האחריות עליה

-- ── 1. כמה מפגשים יש בסדנה ───────────────────────────────────────────────────
-- ברירת מחדל 1 ולא 5: רוב השורות ב-workshops הן מוצרים נלווים (רעשן, פוף)
-- ומוצרים חד-פעמיים. רק הסדנאות הרב-מפגשיות מקבלות מספר אחר, במפורש.
alter table public.workshops
  add column if not exists meetings_count int not null default 1;

alter table public.workshops
  drop constraint if exists workshops_meetings_count_range;
alter table public.workshops
  add constraint workshops_meetings_count_range check (meetings_count between 1 and 24);

comment on column public.workshops.meetings_count is
  'כמה מפגשים יש במחזור של המוצר הזה. קובע כמה שורות cohort_meetings נוצרות אוטומטית בפתיחת מחזור.';

update public.workshops set meetings_count = 5
 where title in ('ליווי התפתחותי - סדנת עטופים',
                 'ליווי התפתחותי - סדנת מגלים',
                 'סדנת עיסוי תינוקות');

-- ── 2. לוח המפגשים ───────────────────────────────────────────────────────────
create table if not exists public.cohort_meetings (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.workshop_cohorts(id) on delete cascade,
  meeting_number int not null check (meeting_number between 1 and 24),
  meeting_date date not null,
  -- שעה משלה, כי לפעמים זז מפגש בודד לשעה אחרת ולא כל המחזור.
  start_time time,
  -- ביטול מפגש בלי למחוק אותו, כדי שהיסטוריית ההיעדרויות וההשלמות תישמר.
  is_cancelled boolean not null default false,
  -- החריגה שברנדה ביקשה: לפעמים מחליטים שנכנסות 9. נקודתי למפגש אחד,
  -- לא שינוי קבוע של הקיבולת.
  capacity_override int check (capacity_override between 1 and 40),
  notes text,
  -- מתי רצה ההקצאה על המפגש הזה. אחרי החותמת אי אפשר לבטל היעדרות, כדי לא
  -- לשלוף מקום ממשלימה שכבר קיבלה אישור.
  allocated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (cohort_id, meeting_number)
);

create index if not exists cohort_meetings_date_idx
  on public.cohort_meetings (meeting_date);
create index if not exists cohort_meetings_cohort_idx
  on public.cohort_meetings (cohort_id, meeting_number);

comment on table public.cohort_meetings is
  'המפגשים בפועל של מחזור. נוצרים אוטומטית שבועיים מתאריך הפתיחה; הזזה של מפגש היא עריכת תאריך אחד כאן.';

-- ── 3. קיבולת ────────────────────────────────────────────────────────────────
-- כרגע capacity הוא null ברוב המחזורים בפרודקשן, ואז get_public_cohorts נופל
-- ל-workshops.stock_quantity. השרשרת נשמרת כמו שהיא, ונוסף לה קצה קשיח של 8
-- כדי שחישוב מקומות לעולם לא ייפול על null, ומעליה חריגה נקודתית למפגש בודד.
create or replace function public.effective_meeting_capacity(p_meeting_id uuid)
returns int
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(m.capacity_override, c.capacity, w.stock_quantity, 8)
    from cohort_meetings m
    join workshop_cohorts c on c.id = m.cohort_id
    join workshops w on w.id = c.workshop_id
   where m.id = p_meeting_id;
$$;

-- ── 4. יצירה אוטומטית והזזה ─────────────────────────────────────────────────
-- מפגשים נוצרים שבועיים מ-start_date. הפונקציה idempotent: היא לא נוגעת
-- בשורות קיימות, כדי שהרצה חוזרת לא תמחק הזזות ידניות שברנדה כבר עשתה.
create or replace function public.generate_cohort_meetings(p_cohort_id uuid, p_count int default null)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cohort  workshop_cohorts%rowtype;
  v_count   int;
  v_created int := 0;
  i         int;
begin
  select * into v_cohort from workshop_cohorts where id = p_cohort_id;
  if not found then return 0; end if;

  -- מספר המפגשים בא מהמוצר, לא מ-end_date. CohortsModal מציע end_date של
  -- start+4 שבועות כברירת מחדל, וברוב המחזורים ההצעה פשוט אושרה. גזירה
  -- ממנה הייתה מייצרת 5 מפגשים ל"מפגש אבות", שהוא מפגש בודד.
  v_count := coalesce(
    p_count,
    (select w.meetings_count from workshops w where w.id = v_cohort.workshop_id),
    1
  );

  for i in 1..v_count loop
    insert into cohort_meetings (cohort_id, meeting_number, meeting_date, start_time)
    values (p_cohort_id, i, v_cohort.start_date + ((i - 1) * 7), v_cohort.start_time)
    on conflict (cohort_id, meeting_number) do nothing;
    if found then v_created := v_created + 1; end if;
  end loop;

  return v_created;
end;
$$;

create or replace function public.tg_cohort_meetings_autocreate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.generate_cohort_meetings(new.id);
  return new;
end;
$$;

drop trigger if exists cohort_meetings_autocreate on public.workshop_cohorts;
create trigger cohort_meetings_autocreate
  after insert on public.workshop_cohorts
  for each row execute function public.tg_cohort_meetings_autocreate();

-- end_date נגזר מהמפגש האחרון במקום להיות מוקלד ביד. זה מתקן דרך אגב את
-- תזמון שאלון המשוב (send-cohort-surveys רץ על end_date) ואת התזכורות.
create or replace function public.tg_cohort_end_date_from_meetings()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cohort uuid;
begin
  -- ב-AFTER DELETE אין NEW כלל, והתייחסות אליו זורקת. TG_OP ולא coalesce.
  if tg_op = 'DELETE' then v_cohort := old.cohort_id; else v_cohort := new.cohort_id; end if;

  update workshop_cohorts c
     set end_date = (select max(m.meeting_date)
                       from cohort_meetings m
                      where m.cohort_id = v_cohort and not m.is_cancelled)
   where c.id = v_cohort;
  return null;
end;
$$;

drop trigger if exists cohort_end_date_sync on public.cohort_meetings;
create trigger cohort_end_date_sync
  after insert or update of meeting_date, is_cancelled or delete on public.cohort_meetings
  for each row execute function public.tg_cohort_end_date_from_meetings();

-- הזזה סדרתית: "המפגש הזה נדחה בשבוע, וכל מה שאחריו זז איתו".
create or replace function public.shift_cohort_meetings(
  p_from_meeting_id uuid,
  p_days int
) returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cohort uuid;
  v_number int;
  v_rows   int;
begin
  if not exists (select 1 from user_profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'admin only';
  end if;

  select cohort_id, meeting_number into v_cohort, v_number
    from cohort_meetings where id = p_from_meeting_id;
  if not found then raise exception 'meeting not found'; end if;

  update cohort_meetings
     set meeting_date = meeting_date + p_days
   where cohort_id = v_cohort and meeting_number >= v_number;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- ── 5. Backfill למחזורים הקיימים ─────────────────────────────────────────────
-- הטריגר מושבת בזמן ה-backfill בכוונה. end_date קיים הוא מה שברנדה ראתה
-- ועבדה מולו, כולל מחזורים שכבר רצו ושאלון המשוב שלהם כבר יצא. אין סיבה
-- שהתקנה טכנית תשכתב היסטוריה. משלימים רק את מה שריק.
alter table public.cohort_meetings disable trigger cohort_end_date_sync;

do $$
declare r record;
begin
  for r in select id from workshop_cohorts loop
    perform public.generate_cohort_meetings(r.id);
  end loop;
end $$;

alter table public.cohort_meetings enable trigger cohort_end_date_sync;

update public.workshop_cohorts c
   set end_date = (select max(m.meeting_date) from public.cohort_meetings m
                    where m.cohort_id = c.id and not m.is_cancelled)
 where c.end_date is null;
-- ── 6. מי אני ────────────────────────────────────────────────────────────────
-- registration_leads היא admin-read-only, אז אמא לא יכולה לקרוא אפילו את
-- השורה של עצמה. כל הזרימה שלה עוברת ב-SECURITY DEFINER, בדיוק כמו
-- get_my_workshop_registrations, ובאותה שיטת זיהוי: טלפון מנורמל או מייל.
create or replace function public.my_lead_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select rl.id
    from registration_leads rl
   where rl.cohort_id is not null
     and (
       rl.user_id = (select auth.uid())
       or exists (
            select 1 from user_profiles up
             where up.id = (select auth.uid())
               and ((up.normalized_phone is not null and rl.normalized_phone = up.normalized_phone)
                 or (coalesce(up.email, '') <> '' and lower(rl.email) = lower(up.email)))
          )
     );
$$;

-- ── 7. היעדרויות ─────────────────────────────────────────────────────────────
-- ההצהרה היא השער. ברנדה 3.9.26: "האחריות המלאה עליה, רק כשהיא תסמן שהיא לא
-- הגיעה למפגש הזה תהיה לה אפשרות להירשם להשלמה". לכן אפשר להצהיר גם על מפגש
-- שכבר עבר ("לא הגעתי"), ולא רק מראש.
create table if not exists public.meeting_absences (
  id uuid primary key default gen_random_uuid(),
  cohort_meeting_id uuid not null references public.cohort_meetings(id) on delete cascade,
  lead_id uuid not null references public.registration_leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create unique index if not exists meeting_absences_active_uniq
  on public.meeting_absences (cohort_meeting_id, lead_id) where cancelled_at is null;
create index if not exists meeting_absences_meeting_idx
  on public.meeting_absences (cohort_meeting_id) where cancelled_at is null;

comment on table public.meeting_absences is
  'הצהרת אמא שהיא לא מגיעה למפגש. משחררת את המקום שלה למשלימות, ופותחת לה בקשת השלמה.';

-- ── 8. בקשות השלמה ───────────────────────────────────────────────────────────
create table if not exists public.makeup_requests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.registration_leads(id) on delete cascade,
  source_cohort_meeting_id uuid not null references public.cohort_meetings(id) on delete cascade,
  target_cohort_meeting_id uuid not null references public.cohort_meetings(id) on delete cascade,
  -- requested  ממתינה בתור
  -- confirmed  אושרה בהקצאה
  -- rejected   לא נכנסה (reject_reason)
  -- cancelled  ביטלה בעצמה
  -- attended   הגיעה בפועל (סימון ידני של ברנדה)
  status text not null default 'requested'
    check (status in ('requested','confirmed','rejected','cancelled','attended')),
  -- מפתח התור. ברנדה 3.9.26: מי שהצהירה מוקדם עומדת ראשונה.
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  reject_reason text,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

-- בקשה פתוחה אחת לכל מפגש שפוספס. אין הרשמה לשני מועדים במקביל.
create unique index if not exists makeup_requests_open_uniq
  on public.makeup_requests (lead_id, source_cohort_meeting_id)
  where status in ('requested','confirmed');
create index if not exists makeup_requests_target_queue_idx
  on public.makeup_requests (target_cohort_meeting_id, requested_at)
  where status = 'requested';
create index if not exists makeup_requests_pending_notify_idx
  on public.makeup_requests (notified_at) where decided_at is not null and notified_at is null;

comment on table public.makeup_requests is
  'בקשת השלמה של מפגש שפוספס. אינה נספרת בתפוסה עד ההקצאה, 24 שעות לפני המפגש.';

-- ── 9. RLS ───────────────────────────────────────────────────────────────────
alter table public.cohort_meetings   enable row level security;
alter table public.meeting_absences  enable row level security;
alter table public.makeup_requests   enable row level security;

drop policy if exists "Admins manage cohort meetings" on public.cohort_meetings;
create policy "Admins manage cohort meetings" on public.cohort_meetings
  for all to authenticated
  using (exists (select 1 from public.user_profiles p
                 where p.id = (select auth.uid()) and p.is_admin = true))
  with check (exists (select 1 from public.user_profiles p
                      where p.id = (select auth.uid()) and p.is_admin = true));

drop policy if exists "Admins manage absences" on public.meeting_absences;
create policy "Admins manage absences" on public.meeting_absences
  for all to authenticated
  using (exists (select 1 from public.user_profiles p
                 where p.id = (select auth.uid()) and p.is_admin = true))
  with check (exists (select 1 from public.user_profiles p
                      where p.id = (select auth.uid()) and p.is_admin = true));

drop policy if exists "Admins manage makeup requests" on public.makeup_requests;
create policy "Admins manage makeup requests" on public.makeup_requests
  for all to authenticated
  using (exists (select 1 from public.user_profiles p
                 where p.id = (select auth.uid()) and p.is_admin = true))
  with check (exists (select 1 from public.user_profiles p
                      where p.id = (select auth.uid()) and p.is_admin = true));

-- אמהות ניגשות רק דרך ה-RPC-ים למטה. אין להן policy ישירה על אף אחת
-- משלוש הטבלאות, בדיוק כמו שאין להן על registration_leads.

-- ── 10. חישוב מקומות ─────────────────────────────────────────────────────────
-- מתי המפגש מתחיל, כ-timestamptz. התאריכים והשעות במסד הם מקומיים.
create or replace function public.meeting_starts_at(p_meeting_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path to 'public'
as $$
  select ((m.meeting_date + coalesce(m.start_time, c.start_time, time '00:00'))
          at time zone 'Asia/Jerusalem')
    from cohort_meetings m
    join workshop_cohorts c on c.id = m.cohort_id
   where m.id = p_meeting_id;
$$;

-- כמה מקומות פנויים למפגש נתון, אחרי שנרשמות מקוריות תפסו את שלהן.
-- נרשמות מקוריות תמיד קודמות: הן נספרות במלואן, פחות מי שהצהירה שלא תגיע.
-- השלמות שכבר אושרו נספרות גם הן, כדי שהקצאה חוזרת לא תכניס אף אחת פעמיים.
create or replace function public.meeting_free_seats(p_meeting_id uuid)
returns int
language sql
stable
security definer
set search_path to 'public'
as $$
  select greatest(0,
    public.effective_meeting_capacity(p_meeting_id)
    - (select count(*) from registration_leads rl
        join cohort_meetings m on m.id = p_meeting_id
       where rl.cohort_id = m.cohort_id)
    + (select count(*) from meeting_absences a
       where a.cohort_meeting_id = p_meeting_id and a.cancelled_at is null)
    - (select count(*) from makeup_requests q
       where q.target_cohort_meeting_id = p_meeting_id
         and q.status in ('confirmed','attended'))
  );
$$;
-- ── 11. המסך של האמא ─────────────────────────────────────────────────────────
-- לוח המפגשים שלה, עם מה שהיא סימנה ומה מצב הבקשות שלה. קריאה אחת.
create or replace function public.get_my_cohort_schedule()
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
  makeup_status text,
  makeup_meeting_date date,
  makeup_decision_at timestamptz,
  makeup_queue_position int,
  makeups_used int,
  makeups_allowed int
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with mine as (
    select rl.id as lead_id, rl.cohort_id, rl.selected_workshop_id as workshop_id
      from registration_leads rl
     where rl.id in (select public.my_lead_ids())
  ),
  used as (
    select m.lead_id, count(*)::int as n
      from mine m
      join makeup_requests q on q.lead_id = m.lead_id
     where q.status in ('confirmed','attended')
     group by m.lead_id
  )
  select
    mine.lead_id,
    mine.workshop_id,
    w.title,
    mine.cohort_id,
    c.start_date,
    cm.id,
    cm.meeting_number,
    cm.meeting_date,
    coalesce(cm.start_time, c.start_time),
    public.meeting_starts_at(cm.id),
    cm.is_cancelled,
    public.meeting_starts_at(cm.id) < now(),
    (a.id is not null),
    q.status,
    tm.meeting_date,
    case when q.id is not null
         then public.meeting_starts_at(tm.id) - interval '24 hours' end,
    case when q.status = 'requested'
         then (select count(*)::int + 1 from makeup_requests q2
                where q2.target_cohort_meeting_id = q.target_cohort_meeting_id
                  and q2.status = 'requested'
                  and q2.requested_at < q.requested_at) end,
    coalesce(used.n, 0),
    2
  from mine
  join workshop_cohorts c on c.id = mine.cohort_id
  join workshops w on w.id = c.workshop_id
  join cohort_meetings cm on cm.cohort_id = mine.cohort_id
  left join used on used.lead_id = mine.lead_id
  left join meeting_absences a
         on a.cohort_meeting_id = cm.id and a.lead_id = mine.lead_id and a.cancelled_at is null
  left join makeup_requests q
         on q.source_cohort_meeting_id = cm.id and q.lead_id = mine.lead_id
        and q.status in ('requested','confirmed','attended')
  left join cohort_meetings tm on tm.id = q.target_cohort_meeting_id
  order by c.start_date desc, cm.meeting_number;
$$;

-- סימון "לא אגיע" או "לא הגעתי", וביטול הסימון.
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
    return 'absent';
  end if;

  -- ביטול הצהרה. אחרי שההקצאה כבר רצה זה סגור: משלימה קיבלה את המקום
  -- ואי אפשר לשלוף אותו ממנה.
  if exists (select 1 from cohort_meetings where id = p_meeting_id and allocated_at is not null) then
    raise exception 'allocation already ran';
  end if;

  update meeting_absences
     set cancelled_at = now()
   where cohort_meeting_id = p_meeting_id and lead_id = v_lead and cancelled_at is null;

  -- ההיעדרות היא השער לבקשה. בוטלה ההיעדרות, נופלת איתה הבקשה.
  update makeup_requests
     set status = 'cancelled', decided_at = now()
   where lead_id = v_lead and source_cohort_meeting_id = p_meeting_id and status = 'requested';

  return 'present';
end;
$$;

-- המועדים שאפשר להשלים בהם את המפגש שפוספס.
--
-- הכלל של ברנדה: אותו מספר מפגש, בשני מועדי הפתיחה הבאים של אותה סדנה.
-- שני מחזורים שנפתחים באותו תאריך בשעות שונות (03/09 ב-10:00 וב-11:45)
-- נחשבים מועד פתיחה אחד, כך שהיא מקבלת את שתיהן לבחירה.
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
  queue_ahead int,
  registered_now int,
  capacity int
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
    public.meeting_starts_at(m.id) - interval '24 hours',
    (select count(*)::int from makeup_requests q
      where q.target_cohort_meeting_id = m.id and q.status = 'requested'),
    (select count(*)::int from registration_leads rl2 where rl2.cohort_id = c.id),
    public.effective_meeting_capacity(m.id)
  from cohort_meetings m
  join workshop_cohorts c on c.id = m.cohort_id
  join src on true
  where c.workshop_id = src.workshop_id
    and c.start_date in (select start_date from next_dates)
    and m.meeting_number = src.meeting_number
    and not m.is_cancelled
    and m.allocated_at is null
    and public.meeting_starts_at(m.id) > now() + interval '24 hours'
  order by m.meeting_date, coalesce(m.start_time, c.start_time);
$$;

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

  -- השער: בלי הצהרת היעדרות אין השלמה.
  if not exists (select 1 from meeting_absences a
                  where a.cohort_meeting_id = p_source_meeting_id
                    and a.lead_id = v_lead and a.cancelled_at is null) then
    raise exception 'declare absence first';
  end if;

  -- מכסה: עד 2. בקשה שממתינה נספרת גם היא, אחרת אפשר לתפוס חמישה תורים.
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

  return v_id;
end;
$$;

create or replace function public.cancel_makeup_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update makeup_requests
     set status = 'cancelled', decided_at = now()
   where id = p_request_id
     and lead_id in (select public.my_lead_ids())
     and status in ('requested','confirmed');
  if not found then raise exception 'request not found'; end if;
end;
$$;
-- ── 12. ההקצאה ───────────────────────────────────────────────────────────────
-- רצה פעם אחת לכל מפגש, 24 שעות לפניו. אין הקצאה מצטברת ואין drift: ברגע
-- הזה הרוסטר סגור, ההיעדרויות ידועות, ומה שנשאר מחולק לפי סדר הבקשות.
create or replace function public.allocate_makeups(p_meeting_id uuid)
returns table (confirmed int, rejected int)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_free int;
  v_conf int := 0;
  v_rej  int := 0;
  r      record;
begin
  -- כבר רץ. יציאה שקטה, כדי שקרון שמנסה פעמיים לא יזיז כלום.
  if exists (select 1 from cohort_meetings where id = p_meeting_id and allocated_at is not null) then
    return query select 0, 0;
    return;
  end if;

  -- מפגש שבוטל: כל מי שבתור נדחית עם סיבה משלה.
  if exists (select 1 from cohort_meetings where id = p_meeting_id and is_cancelled) then
    update makeup_requests
       set status = 'rejected', reject_reason = 'meeting_cancelled', decided_at = now()
     where target_cohort_meeting_id = p_meeting_id and status = 'requested';
    get diagnostics v_rej = row_count;
    update cohort_meetings set allocated_at = now() where id = p_meeting_id;
    return query select 0, v_rej;
    return;
  end if;

  v_free := public.meeting_free_seats(p_meeting_id);

  for r in
    select id from makeup_requests
     where target_cohort_meeting_id = p_meeting_id and status = 'requested'
     order by requested_at, id
  loop
    if v_free > 0 then
      update makeup_requests set status = 'confirmed', decided_at = now() where id = r.id;
      v_free := v_free - 1;
      v_conf := v_conf + 1;
    else
      update makeup_requests
         set status = 'rejected', reject_reason = 'no_space', decided_at = now()
       where id = r.id;
      v_rej := v_rej + 1;
    end if;
  end loop;

  update cohort_meetings set allocated_at = now() where id = p_meeting_id;
  return query select v_conf, v_rej;
end;
$$;

-- כל המפגשים שהגיע זמנם. נסרק כל שעה; התנאי הוא "פחות מ-24 שעות מהמפגש
-- ועוד לא הוקצה", כך שקרון שהחסיר ריצה משלים אותה בריצה הבאה.
create or replace function public.allocate_makeups_due()
returns table (meeting_id uuid, confirmed int, rejected int)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v record;
begin
  for r in
    select m.id
      from cohort_meetings m
     where m.allocated_at is null
       and public.meeting_starts_at(m.id) <= now() + interval '24 hours'
       and public.meeting_starts_at(m.id) > now() - interval '7 days'
       and exists (select 1 from makeup_requests q
                    where q.target_cohort_meeting_id = m.id and q.status = 'requested')
  loop
    select * into v from public.allocate_makeups(r.id);
    meeting_id := r.id; confirmed := v.confirmed; rejected := v.rejected;
    return next;
  end loop;
end;
$$;

-- אמא לא מריצה הקצאות. הקרון רץ כ-service_role; לברנדה יש הרצה ידנית
-- דרך admin_allocate_makeups_now.
revoke all on function public.allocate_makeups(uuid) from public, anon, authenticated;
revoke all on function public.allocate_makeups_due() from public, anon, authenticated;
grant execute on function public.allocate_makeups(uuid) to service_role;
grant execute on function public.allocate_makeups_due() to service_role;

create or replace function public.admin_allocate_makeups_now()
returns table (meeting_id uuid, confirmed int, rejected int)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from user_profiles p where p.id = (select auth.uid()) and p.is_admin) then
    raise exception 'admin only';
  end if;
  return query select * from public.allocate_makeups_due();
end;
$$;

-- ── 13. חריגות של ברנדה ──────────────────────────────────────────────────────
-- "לפעמים אפשר להחליט חריג שנכנסות 9". נקודתי למפגש אחד, לא שינוי קבוע
-- של הקיבולת, ומריץ מיד הקצאה חוזרת אם ההקצאה כבר עברה.
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

  -- הקצאה כבר רצה והיא הגדילה את המקום: מכניסים את הבאות בתור שנדחו
  -- מחוסר מקום, לפי אותו סדר בקשות.
  if exists (select 1 from cohort_meetings where id = p_meeting_id and allocated_at is not null) then
    update cohort_meetings set allocated_at = null where id = p_meeting_id;
    update makeup_requests
       set status = 'requested', decided_at = null, reject_reason = null, notified_at = null
     where target_cohort_meeting_id = p_meeting_id
       and status = 'rejected' and reject_reason = 'no_space';
    select confirmed into v_conf from public.allocate_makeups(p_meeting_id);
    return coalesce(v_conf, 0);
  end if;

  return 0;
end;
$$;

create or replace function public.admin_mark_makeup_attended(p_request_id uuid, p_attended boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from user_profiles p where p.id = (select auth.uid()) and p.is_admin) then
    raise exception 'admin only';
  end if;
  update makeup_requests
     set status = case when p_attended then 'attended' else 'confirmed' end
   where id = p_request_id and status in ('confirmed','attended');
end;
$$;

-- ── 14. מה ברנדה רואה ────────────────────────────────────────────────────────
-- שורה אחת לכל מפגש: מי רשומה, מי הודיעה שלא מגיעה, כמה משלימות אושרו,
-- ומה נשאר. זה גם המסך "מי מגיעה השבוע".
-- security_invoker: בלעדיו ה-view רץ בהרשאות הבעלים ועוקף את ה-RLS, וכל
-- משתמשת מחוברת הייתה רואה את הרוסטר של כל הקבוצות. עם זה, רק אדמין רואה.
drop view if exists public.v_meeting_roster;
create view public.v_meeting_roster with (security_invoker = on) as
select
  m.id                as meeting_id,
  c.workshop_id,
  w.title             as workshop_title,
  m.cohort_id,
  c.start_date        as cohort_start_date,
  coalesce(c.label, to_char(c.start_date,'DD/MM') || ' ' ||
           to_char(coalesce(c.start_time, time '00:00'),'HH24:MI')) as cohort_label,
  m.meeting_number,
  m.meeting_date,
  coalesce(m.start_time, c.start_time) as start_time,
  m.is_cancelled,
  m.allocated_at,
  coalesce(m.capacity_override, c.capacity, w.stock_quantity, 8) as capacity,
  (select count(*) from registration_leads rl where rl.cohort_id = m.cohort_id) as registered,
  (select count(*) from meeting_absences a
    where a.cohort_meeting_id = m.id and a.cancelled_at is null)                as absent,
  (select count(*) from makeup_requests q
    where q.target_cohort_meeting_id = m.id and q.status in ('confirmed','attended')) as makeups_in,
  (select count(*) from makeup_requests q
    where q.target_cohort_meeting_id = m.id and q.status = 'requested')         as makeups_waiting
from cohort_meetings m
join workshop_cohorts c on c.id = m.cohort_id
join workshops w on w.id = c.workshop_id;

comment on view public.v_meeting_roster is
  'מצב כל מפגש: רשומות, היעדרויות, משלימות שאושרו וכמה ממתינות. בסיס למסך ההשלמות באדמין.';

grant select on public.v_meeting_roster to authenticated;

-- הרשאות ל-RPC-ים של האמא
grant execute on function public.get_my_cohort_schedule()               to authenticated;
grant execute on function public.set_meeting_absence(uuid, boolean)     to authenticated;
grant execute on function public.get_makeup_options(uuid)               to authenticated;
grant execute on function public.request_makeup(uuid, uuid)             to authenticated;
grant execute on function public.cancel_makeup_request(uuid)            to authenticated;
grant execute on function public.my_lead_ids()                          to authenticated;
grant execute on function public.meeting_starts_at(uuid)                to authenticated;
grant execute on function public.effective_meeting_capacity(uuid)       to authenticated;
grant execute on function public.meeting_free_seats(uuid)               to authenticated;
grant execute on function public.admin_allocate_makeups_now()           to authenticated;
grant execute on function public.admin_set_meeting_capacity(uuid, int)  to authenticated;
grant execute on function public.admin_mark_makeup_attended(uuid, boolean) to authenticated;
grant execute on function public.shift_cohort_meetings(uuid, int)       to authenticated;

-- יצירת מפגשים היא פנימית: הטריגר קורא לה בפתיחת מחזור. חשיפה ישירה
-- הייתה נותנת לכל משתמשת מחוברת לייצר מפגשים למחזור זר.
revoke all on function public.generate_cohort_meetings(uuid, int) from public, anon, authenticated;

create or replace function public.admin_regenerate_cohort_meetings(p_cohort_id uuid, p_count int default null)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from user_profiles p where p.id = (select auth.uid()) and p.is_admin) then
    raise exception 'admin only';
  end if;
  return public.generate_cohort_meetings(p_cohort_id, p_count);
end;
$$;

grant execute on function public.admin_regenerate_cohort_meetings(uuid, int) to authenticated;
