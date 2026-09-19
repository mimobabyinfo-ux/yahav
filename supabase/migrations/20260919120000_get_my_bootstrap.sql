-- ביצועים (יהב 19.9.26: "לפעמים לוקח זמן לדפים להיטען").
--
-- AuthContext used to open the app with a CHAIN of six requests, each one
-- waiting for the previous: user_profiles → families → user_profiles
-- (members) → user_profiles (members again) → children → purchased_workshops.
-- The database answers each in a few milliseconds, but the project lives
-- in ap-northeast-1 and a phone in Israel pays ~500ms of round trip per
-- request, so the chain alone was 1.5–2 seconds before the home screen
-- knew which baby it was showing.
--
-- One call, one round trip, the same rows. SECURITY INVOKER on purpose:
-- it runs as the caller under the very same RLS policies the six queries
-- ran under, so nobody sees a row they could not see before.
create or replace function public.get_my_bootstrap()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with me as (
    select * from user_profiles where id = auth.uid()
  ),
  fam as (
    select family_id from me where family_id is not null
  ),
  members as (
    select p.* from user_profiles p
    where p.family_id is not null and p.family_id = (select family_id from fam)
  ),
  ids as (
    select auth.uid() as id
    union
    select id from members
  )
  select jsonb_build_object(
    'profile', (select to_jsonb(me) from me),
    'family',  (select to_jsonb(f) from families f where f.id = (select family_id from fam)),
    'members', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from members m),
    'children', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb)
      from children c
      where c.user_id in (select id from ids)
    ),
    'purchased_workshops', (
      select coalesce(jsonb_agg(to_jsonb(pw)), '[]'::jsonb)
      from purchased_workshops pw
      where pw.user_id = auth.uid()
    )
  );
$$;

grant execute on function public.get_my_bootstrap() to authenticated;
revoke execute on function public.get_my_bootstrap() from anon, public;
