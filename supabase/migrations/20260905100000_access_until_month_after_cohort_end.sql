-- ברנדה 5.9.26: "אני רוצה שזה יהיה פתוח להם דיפולטית חודש קדימה אחרי
-- הסיום של הסדנה, למקרה ורוצים להיזכר בדברים שלמדו".
-- עד עכשיו ברירת המחדל הייתה 5 שנים (1825 יום) לכל רכישה. מעכשיו: ליד עם
-- מחזור מקבל גישה עד חודש אחרי המפגש האחרון של המחזור, ולא פחות מחודש
-- מהיום. ליד בלי מחזור (הקורס הדיגיטלי) נשאר כמו שהיה.
-- מנהלת יכולה תמיד להאריך ידנית; greatest() שומר על תאריך ידני מאוחר יותר.
-- הוחל בפרודקשן 5.9.26 דרך MCP. 45 רכישות קיימות עם 5 שנים לא שונו.
create or replace function public.attach_paid_lead(p_lead_id uuid, p_user_id uuid, p_access_days integer default 1825)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lead   registration_leads;
  v_wid    uuid;
  v_new    boolean;
  v_end    date;
  v_cohort_end date;
begin
  select * into v_lead from registration_leads where id = p_lead_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'lead_not_found');
  end if;
  if v_lead.status <> 'paid' then
    return jsonb_build_object('ok', false, 'reason', 'lead_not_paid', 'status', v_lead.status);
  end if;

  v_wid := v_lead.selected_workshop_id;
  if v_wid is null then
    return jsonb_build_object('ok', false, 'reason', 'lead_has_no_workshop');
  end if;

  if v_lead.cohort_id is not null then
    select coalesce(
             (select max(m.meeting_date) from cohort_meetings m where m.cohort_id = c.id and not m.is_cancelled),
             c.end_date)
      into v_cohort_end
      from workshop_cohorts c where c.id = v_lead.cohort_id;
  end if;
  if v_cohort_end is not null then
    v_end := greatest(v_cohort_end + interval '1 month', current_date + interval '1 month')::date;
  else
    v_end := current_date + p_access_days;
  end if;

  insert into user_profiles (id, email, mother_name, phone_number, lead_status, acquisition_source)
  values (p_user_id, v_lead.email, v_lead.name, v_lead.phone, 'active_workshop', 'course_purchase')
  on conflict (id) do update
    set mother_name  = coalesce(user_profiles.mother_name, excluded.mother_name),
        phone_number = coalesce(user_profiles.phone_number, excluded.phone_number),
        lead_status  = coalesce(user_profiles.lead_status, excluded.lead_status),
        acquisition_source = coalesce(user_profiles.acquisition_source, excluded.acquisition_source);

  update registration_leads set user_id = p_user_id where id = p_lead_id;

  v_new := not exists (
    select 1 from purchased_workshops
     where user_id = p_user_id and workshop_id = v_wid
  );

  insert into purchased_workshops (
    user_id, workshop_id, purchase_date,
    access_start_date, access_end_date, notes
  )
  values (
    p_user_id, v_wid, current_date,
    current_date, v_end,
    'נפתח אוטומטית אחרי תשלום · ליד ' || p_lead_id::text
  )
  on conflict (user_id, workshop_id) do update
    set access_end_date = greatest(purchased_workshops.access_end_date, v_end);

  return jsonb_build_object(
    'ok', true,
    'workshop_id', v_wid,
    'access_was_new', v_new,
    'access_end_date', v_end,
    'email', v_lead.email,
    'name', v_lead.name
  );
end;
$function$;
