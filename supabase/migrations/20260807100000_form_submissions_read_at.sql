-- Forms screen §2: a response is "new" until the admin opens it in the
-- responses view. Simple column (single admin) — opening a submission
-- stamps read_at; the חדשות counter on each form row counts
-- read_at IS NULL. Historical submissions are stamped as read so the
-- screen doesn't open with every old response marked new.

alter table form_submissions
  add column if not exists read_at timestamptz;

update form_submissions set read_at = now() where read_at is null;
