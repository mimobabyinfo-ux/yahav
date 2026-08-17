-- The photo bucket is named diaper-photos for historical reasons; it is
-- now the bucket for every log photo (Brenda 17.8.26 asked for photos on
-- food entries too, and daily_log_entries.photo_url was already generic).
--
-- The read policy was "only the uploader", which quietly broke the shared
-- journal: she asked that a family member opening her link see exactly
-- what she sees, and a photo she took was the one thing they could not.
-- Reading is now allowed to anyone in the same family, which is the same
-- boundary daily_log_entries itself uses. Writing and deleting stay with
-- the owner.
drop policy if exists diaper_photos_select_own on storage.objects;

create policy log_photos_select_family
on storage.objects for select
using (
  bucket_id = 'diaper-photos'
  and (
    (auth.uid())::text = (storage.foldername(name))[1]
    or exists (
      select 1
      from public.user_profiles me
      join public.user_profiles owner on owner.family_id = me.family_id
      where me.id = auth.uid()
        and me.family_id is not null
        and owner.id::text = (storage.foldername(name))[1]
    )
  )
);
