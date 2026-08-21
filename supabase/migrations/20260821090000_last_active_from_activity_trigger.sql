-- user_profiles.last_active was NEVER written. The tracker tried, from the
-- client, right after inserting the activity row — and it failed silently
-- for every mother since the column was added: 0 of 57 profiles had a
-- value. Every screen that leaned on it was reporting a fiction.
--
-- Moved to where it cannot fail: a trigger on the row that IS being
-- written successfully. One source of truth (user_activities), one
-- derived column, no second request from the client.
create or replace function public._touch_last_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    update public.user_profiles
       set last_active = greatest(coalesce(last_active, new.created_at), new.created_at)
     where id = new.user_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_touch_last_active on public.user_activities;
create trigger trg_touch_last_active
  after insert on public.user_activities
  for each row execute function public._touch_last_active();

update public.user_profiles up
   set last_active = a.seen
  from (select user_id, max(created_at) as seen from public.user_activities group by 1) a
 where a.user_id = up.id
   and (up.last_active is null or up.last_active < a.seen);
