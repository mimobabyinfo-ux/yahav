-- Two bugs in one view, both reported by Yahav on 24.8.26.
--
-- 1. It never looked at the cohort, so mothers from workshops that ended in
--    May and June sat in the red "שילמו ולא קיבלו גישה" card forever, asking
--    to be fixed for a workshop that is over. The card is a to-do list, and a
--    to-do that can never be closed teaches you to ignore the list.
--    It is now scoped to cohorts that are running or still to open. Leads
--    with no cohort at all (the digital course) are unaffected.
--
-- 2. It resolved the mother's account from registration_leads.user_id ONLY,
--    so anyone who signed up in the app herself, without the lead ever being
--    linked, was labelled "אין חשבון". That was 19 of the 34 mothers in live
--    workshops: they are in the app, they just were never connected to what
--    they paid for. It now falls back to matching on email and then on
--    normalized phone, and exposes resolved_user_id so the caller can see
--    which account it found.
--
-- What did NOT change: the view still only covers products that have
-- content, and still only lists a mother who is genuinely missing something.

create or replace view public.unclaimed_paid_leads as
select
  l.id                    as lead_id,
  l.name,
  l.email,
  l.phone,
  l.created_at,
  l.selected_workshop_id,
  w.title                 as workshop_title,
  l.user_id,
  case
    when m.resolved_user_id is null then 'אין חשבון'
    when not exists (
      select 1 from public.purchased_workshops pw
      where pw.user_id = m.resolved_user_id
        and pw.workshop_id = l.selected_workshop_id
        and pw.access_end_date >= current_date
    ) then 'אין גישה'
    else 'לא נשלח מייל'
  end                     as problem,
  m.resolved_user_id,
  c.id                    as cohort_id,
  c.start_date            as cohort_start_date,
  c.end_date              as cohort_end_date
from public.registration_leads l
join public.workshops w on w.id = l.selected_workshop_id
left join public.workshop_cohorts c on c.id = l.cohort_id
cross join lateral (
  select coalesce(
    l.user_id,
    (select p.id from public.user_profiles p
      where l.email is not null and lower(p.email) = lower(l.email) limit 1),
    (select p.id from public.user_profiles p
      where l.normalized_phone is not null and p.normalized_phone = l.normalized_phone limit 1)
  ) as resolved_user_id
) m
where l.status = 'paid'
  and exists (
    select 1 from public.workshop_content wc
    where wc.workshop_id = w.id and wc.section is not null
  )
  -- running or still to open. A finished cohort is not a to-do.
  and (l.cohort_id is null or c.end_date is null or c.end_date >= current_date)
  and (
    m.resolved_user_id is null
    or l.welcome_sent_at is null
    or not exists (
      select 1 from public.purchased_workshops pw
      where pw.user_id = m.resolved_user_id
        and pw.workshop_id = l.selected_workshop_id
        and pw.access_end_date >= current_date
    )
  );
