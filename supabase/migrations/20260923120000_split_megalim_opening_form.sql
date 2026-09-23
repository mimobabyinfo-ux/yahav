-- 23.9.26 (Brenda): עטופים ומגלים לא אמורים לחלוק את אותו שאלון פתיחה.
-- Until today both products pointed at form a1000000-...-04.
-- 1. Copy it as a separate מגלים form (same questions, she edits from here on).
-- 2. Rename the original to עטופים (title only, question labels untouched,
--    so no answer history is orphaned, see forms_constraint).
-- 3. Point מגלים at the new form.
-- 4. Move the answers that belong to מגלים: a submission goes to מגלים when
--    the registration it matches (user_id, else last 9 phone digits) with the
--    cohort start nearest to the submission date is a מגלים registration.
--    18 answers on 23.9.26. Unmatched answers stay on עטופים.
-- 5. Move open (not completed) assignments of mothers whose registration is מגלים.

insert into forms (id, title, description, fields_json, trigger_rule, is_active, folder)
select 'a1000000-0000-0000-0000-000000000005', 'שאלון התפתחותי סדנת מגלים',
       description, fields_json, trigger_rule, is_active, folder
from forms where id = 'a1000000-0000-0000-0000-000000000004'
on conflict (id) do nothing;

update forms set title = 'שאלון התפתחותי סדנת עטופים', updated_at = now()
where id = 'a1000000-0000-0000-0000-000000000004';

update workshops set linked_form_id = 'a1000000-0000-0000-0000-000000000005'
where id = '3d2b2c93-da57-43e3-966b-de36dda973e7';

with s as (
  select id, user_id, created_at,
         right(regexp_replace(coalesce(responses_json->>'טלפון נייד',''),'\D','','g'),9) ph
  from form_submissions where form_id = 'a1000000-0000-0000-0000-000000000004'),
m as (
  select s.id, l.selected_workshop_id wid,
         row_number() over (partition by s.id order by abs(extract(epoch from
           (coalesce(c.start_date::timestamptz, l.created_at) - s.created_at)))) rn
  from s
  join registration_leads l
    on l.selected_workshop_id in ('80472e20-8ee4-434e-b3f6-8c90af1f1fc1','3d2b2c93-da57-43e3-966b-de36dda973e7')
   and ((s.user_id is not null and l.user_id = s.user_id)
     or (length(s.ph) = 9 and right(regexp_replace(coalesce(l.phone,''),'\D','','g'),9) = s.ph))
  left join workshop_cohorts c on c.id = l.cohort_id)
update form_submissions fs set form_id = 'a1000000-0000-0000-0000-000000000005'
from m where m.id = fs.id and m.rn = 1 and m.wid = '3d2b2c93-da57-43e3-966b-de36dda973e7';

update form_assignments a set form_id = 'a1000000-0000-0000-0000-000000000005'
where a.form_id = 'a1000000-0000-0000-0000-000000000004'
  and a.completed_at is null
  and exists (
    select 1 from registration_leads l
    left join workshop_cohorts c on c.id = l.cohort_id
    where l.user_id = a.user_id
      and l.selected_workshop_id = '3d2b2c93-da57-43e3-966b-de36dda973e7'
      and (c.start_date is null or c.start_date >= a.assigned_at::date - 7));
