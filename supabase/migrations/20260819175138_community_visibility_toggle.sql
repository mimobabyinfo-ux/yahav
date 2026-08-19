-- Brenda 19.8.26: "לתת אופציה לאמא האם לראות אותה בקהילה או לא — בלי קשר לווטסאפ".
-- community_consent has always meant one thing only: may other mothers see
-- my PHONE NUMBER / message me directly. It was never a decision about
-- appearing in the directory at all, and a mother who wants to be listed
-- without handing out her number had no way to say so.
--
-- community_visible is that second, independent switch. Default TRUE so
-- nobody silently disappears from a directory they are already in.
alter table public.user_profiles
  add column if not exists community_visible boolean not null default true;

comment on column public.user_profiles.community_visible is
  'Does this mother appear in the community directory at all. Independent of community_consent, which only governs exposing her phone number.';

create or replace view public.community_profiles as
 SELECT up.id,
    up.mother_name,
    up.area,
    up.phone_number,
    up.community_consent,
    up.community_bio,
    up.community_tags,
    c.id AS child_id,
    c.dob AS child_dob,
    c.gender AS child_gender,
    split_part(btrim(c.name), ' ', 1) AS child_name
   FROM user_profiles up
     JOIN children c ON c.user_id = up.id
  WHERE up.mother_name IS NOT NULL
    AND up.community_visible;

create or replace view public.community_pregnant_profiles as
 SELECT up.id,
    up.mother_name,
    up.area,
    up.phone_number,
    up.community_consent,
    up.community_bio,
    up.community_tags,
    up.due_date
   FROM user_profiles up
  WHERE up.user_mode = 'pregnant'
    AND up.community_visible;

grant select on public.community_profiles to authenticated;
grant select on public.community_pregnant_profiles to authenticated;
