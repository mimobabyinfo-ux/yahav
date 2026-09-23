-- 23.9.26 (Brenda), after the עטופים/מגלים split earlier today.
--
-- A. Graduates. A mother who already filled the עטופים questionnaire counts as
--    having filled the מגלים one. The split made the 15.10 מגלים group read 0/8
--    although 6 of the 8 had answered (on the shared form). Mechanism: the
--    מגלים form names the עטופים form in forms.counts_as_filled_by; her latest
--    answer there is COPIED into the מגלים form (form_submissions.copied_from
--    points at the original). A copy, not a cross-form lookup, so every place
--    that asks "did she fill the product's form" (registrations chip, admin
--    inbox, customer card, cohort chips) keeps working unchanged.
--    Now: one-time copy for every מגלים registration lacking an answer.
--    Later: assign_opening_form_on_access copies instead of assigning.
--
-- B. No double answers. Tamar filled in the app on 7.9 and again from the
--    WhatsApp link on 22.9. For a product's opening form (some
--    workshops.linked_form_id), an answer from the same mother within 60 days
--    (same user_id, or same phone in the form's phone field) UPDATES her
--    existing row instead of adding one. The replaced answers are kept in
--    previous_responses. The newest answers win (freshest information).
--    The client inserts without .select(), so returning NULL is safe.

alter table forms add column if not exists counts_as_filled_by uuid references forms(id);
alter table form_submissions add column if not exists copied_from uuid references form_submissions(id) on delete set null;
alter table form_submissions add column if not exists previous_responses jsonb;

update forms set counts_as_filled_by = 'a1000000-0000-0000-0000-000000000004'
where id = 'a1000000-0000-0000-0000-000000000005';

-- The phone of a submission, last 9 digits, read from the form's phone field
-- (explicit role 'phone', else a label about טלפון/נייד that is not the father's).
create or replace function public.form_submission_phone9(p_form_id uuid, p_responses jsonb)
returns text language plpgsql stable set search_path = public as $$
declare f jsonb; v text;
begin
  for f in select jsonb_array_elements(fields_json) from forms where id = p_form_id loop
    if (f->>'role') = 'phone'
       or ((f->>'role') is null and (f->>'label') ~ '(טלפון|פלאפון|נייד)' and (f->>'label') !~ '(האב|אבא|בעל|בן הזוג)') then
      v := right(regexp_replace(coalesce(p_responses->>(f->>'label'), ''), '\D', '', 'g'), 9);
      if length(v) = 9 then return v; end if;
    end if;
  end loop;
  return null;
end $$;

-- A mother's latest answer to a form, by account or by any phone she registered with.
create or replace function public.latest_submission_for_user(p_form_id uuid, p_user_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select s.id from form_submissions s
  where s.form_id = p_form_id
    and (s.user_id = p_user_id
      or form_submission_phone9(s.form_id, s.responses_json) in (
           select right(regexp_replace(l.phone, '\D', '', 'g'), 9)
           from registration_leads l where l.user_id = p_user_id and l.phone is not null))
  order by s.created_at desc limit 1
$$;

create or replace function public.copy_submission_to_form(p_src uuid, p_form_id uuid, p_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into form_submissions (form_id, user_id, responses_json, created_at, read_at, copied_from)
  select p_form_id, coalesce(p_user_id, s.user_id), s.responses_json, s.created_at, now(), s.id
  from form_submissions s where s.id = p_src
  returning id into v_id;
  -- Her open task for this form is done.
  update form_assignments set completed_at = now()
  where form_id = p_form_id and user_id = p_user_id and completed_at is null;
  return v_id;
end $$;

-- B. dedupe trigger
create or replace function public.merge_duplicate_opening_answer()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_phone text; v_existing uuid;
begin
  if new.copied_from is not null then return new; end if;
  if not exists (select 1 from workshops where linked_form_id = new.form_id) then return new; end if;
  v_phone := form_submission_phone9(new.form_id, new.responses_json);
  select s.id into v_existing from form_submissions s
  where s.form_id = new.form_id
    and s.created_at > now() - interval '60 days'
    and ((new.user_id is not null and s.user_id = new.user_id)
      or (v_phone is not null and form_submission_phone9(s.form_id, s.responses_json) = v_phone))
  order by s.created_at desc limit 1;
  if v_existing is null then return new; end if;
  update form_submissions
     set previous_responses = responses_json,
         responses_json = new.responses_json,
         user_id = coalesce(user_id, new.user_id),
         created_at = now(),
         read_at = null,
         copied_from = null
   where id = v_existing;
  return null;  -- no second row
end $$;

drop trigger if exists form_submissions_merge_duplicate on form_submissions;
create trigger form_submissions_merge_duplicate
  before insert on form_submissions
  for each row execute function public.merge_duplicate_opening_answer();

-- A. future graduates: copy instead of assigning
create or replace function public.assign_opening_form_on_access()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_form_id uuid;
  v_title   text;
  v_prior_form uuid;
  v_src uuid;
begin
  select w.linked_form_id, f.title, f.counts_as_filled_by
    into v_form_id, v_title, v_prior_form
    from workshops w
    left join forms f on f.id = w.linked_form_id
   where w.id = new.workshop_id;

  if v_form_id is null then return new; end if;
  if not exists (select 1 from forms where id = v_form_id and is_active) then return new; end if;
  if exists (select 1 from form_assignments where form_id = v_form_id and user_id = new.user_id) then return new; end if;
  if exists (select 1 from form_submissions where form_id = v_form_id and user_id = new.user_id) then return new; end if;

  if v_prior_form is not null then
    v_src := latest_submission_for_user(v_prior_form, new.user_id);
    if v_src is not null then
      perform copy_submission_to_form(v_src, v_form_id, new.user_id);
      return new;
    end if;
  end if;

  insert into form_assignments (form_id, user_id, title, description)
  values (v_form_id, new.user_id, v_title, 'שאלון פתיחה לקראת התחלת הליווי');
  return new;
end;
$function$;

-- A. one-time: every מגלים registration with an account, no מגלים answer yet,
--    and an עטופים answer.
do $$
declare r record; v_src uuid;
begin
  for r in
    select distinct l.user_id from registration_leads l
    where l.selected_workshop_id = '3d2b2c93-da57-43e3-966b-de36dda973e7'
      and l.user_id is not null and l.status <> 'pending'
      and latest_submission_for_user('a1000000-0000-0000-0000-000000000005', l.user_id) is null
  loop
    v_src := latest_submission_for_user('a1000000-0000-0000-0000-000000000004', r.user_id);
    if v_src is not null then
      perform copy_submission_to_form(v_src, 'a1000000-0000-0000-0000-000000000005', r.user_id);
    end if;
  end loop;
end $$;

-- B. one-time: Tamar's double answer (7.9 in the app, 22.9 from the link).
--    Keep the 7.9 row (it carries her account), give it the 22.9 answers.
update form_submissions o
   set previous_responses = o.responses_json, responses_json = n.responses_json
  from form_submissions n
 where o.id = 'dcb5c88f-2082-471d-8b81-e450f73fbb9c' and n.id = 'de0e1c46-c92b-46ce-b45a-32418f2989b4';
delete from form_submissions where id = 'de0e1c46-c92b-46ce-b45a-32418f2989b4';
