-- Thank-you page showed the COURSE card for עטופים and מגלים (Brenda 10.9.26:
-- "מה זה 12 שיעורים קצרים? מה קורה פה").
--
-- get_thankyou_context guessed the kind when thanks_template is null, and
-- "has workshop_content with a section" came before "has cohorts". That
-- was right on 3.9 when only the digital course had sections; since the
-- workshop program build (3.9.26) עטופים and מגלים carry their sessions
-- as content with sections too, so they started reading as a course.
--
-- A product with cohorts is a workshop, whatever content it carries.
-- Order now: explicit template > physical product > cohorts > sections > private.
-- The three cohort products also get an explicit 'group' so the guess
-- never runs for them again.

create or replace function public.get_thankyou_context(p_workshop_key text default null, p_lead_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_w        public.workshops;
  v_lead     public.registration_leads;
  v_cohort   public.workshop_cohorts;
  v_kind     text;
  v_has_coh  boolean;
  v_is_course boolean;
  v_key      text := lower(btrim(coalesce(p_workshop_key, '')));
begin
  if p_lead_id is not null then
    select * into v_lead from public.registration_leads where id = p_lead_id;
    if found and v_lead.selected_workshop_id is not null then
      select * into v_w from public.workshops where id = v_lead.selected_workshop_id;
    end if;
    if v_lead.cohort_id is not null then
      select * into v_cohort from public.workshop_cohorts where id = v_lead.cohort_id;
    end if;
  end if;

  if v_w.id is null and v_key in ('group', 'meetup', 'private', 'product', 'simple', 'course') then
    return jsonb_build_object('found', true, 'kind', v_key, 'lead_found', false);
  end if;

  if v_w.id is null and v_key <> '' then
    begin
      select * into v_w from public.workshops where id = v_key::uuid;
    exception when invalid_text_representation then
      select * into v_w from public.workshops
       where lower(btrim(title)) = v_key
          or lower(btrim(title)) like '%' || v_key || '%'
       order by display_order
       limit 1;
    end;
  end if;

  if v_w.id is null then
    return jsonb_build_object('found', false);
  end if;

  select exists (select 1 from public.workshop_cohorts where workshop_id = v_w.id) into v_has_coh;
  select exists (
    select 1 from public.workshop_content c
     where c.workshop_id = v_w.id and c.section is not null
  ) into v_is_course;

  v_kind := coalesce(
    v_w.thanks_template,
    case
      when v_w.workshop_type = 'מוצרים משלימים' then 'product'
      when v_has_coh then 'group'
      when v_is_course then 'course'
      else 'private'
    end
  );

  return jsonb_build_object(
    'found', true,
    'workshop_id', v_w.id,
    'title', v_w.title,
    'kind', v_kind,
    'price', v_w.price,
    'lead_found', v_lead.id is not null,
    'lead_name', v_lead.name,
    'lead_status', v_lead.status,
    'cohort_start_date', v_cohort.start_date,
    'cohort_start_time', v_cohort.start_time,
    'cohort_label', v_cohort.label
  );
end;
$function$;

update workshops set thanks_template = 'group'
 where thanks_template is null
   and exists (select 1 from workshop_cohorts c where c.workshop_id = workshops.id)
   and workshop_type is distinct from 'מוצרים משלימים';
