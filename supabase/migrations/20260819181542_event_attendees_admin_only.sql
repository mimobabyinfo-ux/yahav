-- Brenda 19.8.26: mothers must not see who is coming to an event. The UI
-- stopped showing the list, but the RPC behind it still answered any
-- signed-in caller — a hidden list that is still one fetch away is not
-- hidden. Nothing in the app calls this any more except through the
-- admin, so the function now says so out loud.
create or replace function public.get_event_attendees(p_event_id uuid)
 returns table(user_id uuid, mother_name text, area text, phone_number text, community_consent boolean, community_bio text, community_tags text[], child_dob date, child_gender text, guest_names text[])
 language sql
 security definer
 set search_path to 'public'
as $function$
  select r.user_id,
         coalesce(nullif(p.mother_name, ''), nullif(p.display_name, ''), 'אמא') as mother_name,
         p.area, p.phone_number, p.community_consent, p.community_bio,
         p.community_tags, c.dob, c.gender, r.guest_names
  from event_registrations r
  join user_profiles p on p.id = r.user_id
  left join lateral (
    select ch.dob, ch.gender from children ch
    where ch.user_id = r.user_id order by ch.created_at desc limit 1
  ) c on true
  where r.event_id = p_event_id
    and r.status in ('registered', 'attended')
    and public.is_admin()
  order by r.created_at;
$function$;
