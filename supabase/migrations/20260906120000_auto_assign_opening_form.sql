-- Auto-assign the opening (developmental) questionnaire.
--
-- Brenda 6.9.26: a product can carry an opening form (workshops.linked_form_id,
-- "שאלון פתיחה" in the product settings), but until now that only decided
-- which form the customer card looks for. Getting the form to the mother
-- was manual: either the public ?form= link over WhatsApp (answers land
-- with user_id = null and are matched back by phone/email) or the
-- "שייך טופס למשתמשות" modal in the forms page.
--
-- Now: the moment a mother receives access to a product (a row lands in
-- purchased_workshops, whether from attach_paid_lead after payment or
-- from Brenda granting access by hand), the product's opening form is
-- assigned to her. It shows up on her home screen under "משימות שהוקצו לך"
-- and her answers save with her user_id, so the customer card finds them
-- without any phone/email matching.
--
-- Skipped when: the product has no opening form; she already has an
-- assignment for that form; or she already submitted that form from her
-- account. A public-link submission (user_id null) is NOT detected here,
-- so a mother who filled the WhatsApp link before paying may see the task
-- once more. Accepted for now: the resolver in the customer card still
-- shows her first answer, and she can simply complete the task.
--
-- Products with no app content never get an account (claim-course-purchase
-- rule of 3.9.26), so nothing happens for them; the WhatsApp link stays
-- the way for those.

create or replace function public.assign_opening_form_on_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form_id uuid;
  v_title   text;
begin
  select w.linked_form_id, f.title
    into v_form_id, v_title
    from workshops w
    left join forms f on f.id = w.linked_form_id
   where w.id = new.workshop_id;

  if v_form_id is null then
    return new;
  end if;

  -- Only active forms; an archived form should not resurface as a task.
  if not exists (select 1 from forms where id = v_form_id and is_active) then
    return new;
  end if;

  if exists (select 1 from form_assignments where form_id = v_form_id and user_id = new.user_id) then
    return new;
  end if;

  if exists (select 1 from form_submissions where form_id = v_form_id and user_id = new.user_id) then
    return new;
  end if;

  insert into form_assignments (form_id, user_id, title, description)
  values (v_form_id, new.user_id, v_title, 'שאלון פתיחה לקראת התחלת הליווי');

  return new;
end;
$$;

drop trigger if exists purchased_workshops_assign_opening_form on purchased_workshops;
create trigger purchased_workshops_assign_opening_form
  after insert on purchased_workshops
  for each row
  execute function public.assign_opening_form_on_access();
