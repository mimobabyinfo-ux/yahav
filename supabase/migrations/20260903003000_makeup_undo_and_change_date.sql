-- שתי בקשות של ברנדה 3.9.26 אחרי שראתה את המסך:
--   1. "לחצתי בטעות שלא הגעתי אבל כן הגעתי" — ביטול הסימון, גם על מפגש שעבר
--   2. "אני רוצה לשנות את המועד שנרשמתי אליו להשלמה"
--
-- הוחל על פרודקשן 3.9.2026; הקובץ הזה הוא הרישום בריפו.

-- ── ביטול הצהרת היעדרות ──────────────────────────────────────────────────────
-- שינוי מהגרסה הקודמת: ביטול ההצהרה מפיל גם בקשה שכבר אושרה, לא רק כזאת
-- שממתינה בתור. אמא שאומרת "בעצם הגעתי" לא צריכה להישאר עם מקום שמור
-- בקבוצה של מישהי אחרת, והמקום הזה חוזר למאגר.
--
-- מה שנשאר חסום: ביטול אחרי שההקצאה על המפגש שלה כבר רצה. במקרה הזה
-- משלימה כבר קיבלה את המקום שהיא שחררה, ואי אפשר לשלוף אותו ממנה.
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

  if exists (select 1 from cohort_meetings where id = p_meeting_id and allocated_at is not null) then
    raise exception 'allocation already ran';
  end if;

  update meeting_absences
     set cancelled_at = now()
   where cohort_meeting_id = p_meeting_id and lead_id = v_lead and cancelled_at is null;

  -- ההיעדרות היא השער לבקשה. בוטלה ההיעדרות, נופלת איתה הבקשה, גם אם
  -- כבר אושרה.
  update makeup_requests
     set status = 'cancelled', decided_at = now()
   where lead_id = v_lead and source_cohort_meeting_id = p_meeting_id
     and status in ('requested','confirmed');

  return 'present';
end;
$$;

-- ── שינוי מועד ההשלמה ────────────────────────────────────────────────────────
-- ביטול הישנה ויצירת חדשה בפעולה אחת, כדי שלא ייווצר מצב ביניים שבו היא
-- ביטלה ולא הספיקה לבחור.
--
-- הבקשה החדשה מקבלת חותמת זמן חדשה, כלומר סוף התור של המועד החדש. זה
-- הוגן: התור הוא לכל מפגש בנפרד, ומי שמחכה למועד ההוא ביקשה לפניה. שמירת
-- החותמת הישנה הייתה מקפיצה אותה מעל אנשים שביקשו את המועד הזה קודם.
create or replace function public.change_makeup_target(
  p_request_id uuid,
  p_target_meeting_id uuid
) returns uuid
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

  -- אותה בדיקת זכאות בדיוק כמו בבקשה ראשונה: אותו מספר מפגש, בשני מועדי
  -- הפתיחה הבאים, ורק מועד שעוד רחוק יותר מ-24 שעות.
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

  return v_new;
end;
$$;

grant execute on function public.change_makeup_target(uuid, uuid) to authenticated;
