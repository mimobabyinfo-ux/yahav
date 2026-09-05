-- ברנדה 5.9.26 (שינוי דעה): חודשיים אחרי סיום המחזור, לא חודש. ואפשרות
-- להגדיר לכל מוצר בנפרד מתוך מסך המוצר באדמין (workshops.access_months_after_end).
-- הוחל בפרודקשן 5.9.26 דרך MCP, כולל יישור 40 רכישות שנפתחו אוטומטית עם 5 שנים.
-- נשארו עם 5 שנים: הקורס הדיגיטלי (אין מחזור), ושתי רכישות ישנות של מוצרים פיזיים.
alter table public.workshops
  add column if not exists access_months_after_end integer not null default 2
  check (access_months_after_end between 0 and 120);
comment on column public.workshops.access_months_after_end is
  'כמה חודשים אחרי המפגש האחרון של המחזור נשארת לאמא גישה לתוכן. נערך במסך המוצר. 0 = נסגר ביום הסיום.';

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
  v_months integer;
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

  select coalesce(access_months_after_end, 2) into v_months from workshops where id = v_wid;

  if v_lead.cohort_id is not null then
    select coalesce(
             (select max(m.meeting_date) from cohort_meetings m where m.cohort_id = c.id and not m.is_cancelled),
             c.end_date)
      into v_cohort_end
      from workshop_cohorts c where c.id = v_lead.cohort_id;
  end if;
  if v_cohort_end is not null then
    v_end := greatest(v_cohort_end + (v_months || ' months')::interval, current_date + interval '1 month')::date;
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

with target as (
  select p.id as pid,
         (coalesce((select max(m.meeting_date) from cohort_meetings m where m.cohort_id = c.id and not m.is_cancelled), c.end_date)
          + (coalesce(w.access_months_after_end, 2) || ' months')::interval)::date as new_end
  from purchased_workshops p
  join registration_leads rl on rl.user_id = p.user_id and rl.selected_workshop_id = p.workshop_id and rl.status = 'paid'
  join workshop_cohorts c on c.id = rl.cohort_id
  join workshops w on w.id = p.workshop_id
  where p.notes like 'נפתח אוטומטית%'
    and p.access_end_date > current_date + 365
)
update purchased_workshops p
   set access_end_date = greatest(t.new_end, current_date + 30)
  from target t
 where p.id = t.pid;
