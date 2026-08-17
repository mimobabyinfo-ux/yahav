-- Brenda 17.8.26: the member card shows the MOTHER's name, and under it
-- "אמא של <baby>, age, place". The view had the baby's age and gender but
-- not the name.
--
-- Only the FIRST name is exposed, never the family name: the surname adds
-- nothing to "אמא של נועם" and a baby's full name in a directory other
-- mothers browse is more identifying than this feature needs.
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
  WHERE up.mother_name IS NOT NULL;
