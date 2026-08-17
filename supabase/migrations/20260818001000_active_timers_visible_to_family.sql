-- Brenda 17.8.26: "the journal looks different to whoever got the link
-- than it does to the registered mother. I want it to be exactly the same
-- journal, including the timers, including everything."
--
-- The pages were already the same component. The timers were not, and for
-- a structural reason: active_timers was readable only by the row's owner,
-- and a family member opening a share link signs in as their own (anonymous)
-- account. So the mother could be four hours into a night sleep and her
-- partner's copy of the journal showed nothing at all — the one genuinely
-- live thing in the app was the one thing that did not cross the share.
--
-- Timers now follow the same boundary as the journal itself: the family.
-- A running feed is a fact about the baby, not about the phone that
-- started it, so the partner can also pause and stop it. INSERT still
-- writes auth.uid() into user_id, so every row keeps a real author.
drop policy if exists "Users can view own timers"   on public.active_timers;
drop policy if exists "Users can update own timers" on public.active_timers;
drop policy if exists "Users can delete own timers" on public.active_timers;

create or replace function public.same_family_as(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target = auth.uid()
      or exists (
        select 1
        from user_profiles me
        join user_profiles them on them.family_id = me.family_id
        where me.id = auth.uid()
          and me.family_id is not null
          and them.id = target
      );
$$;

create policy active_timers_family_select on public.active_timers
  for select using (public.same_family_as(user_id));

create policy active_timers_family_update on public.active_timers
  for update using (public.same_family_as(user_id));

create policy active_timers_family_delete on public.active_timers
  for delete using (public.same_family_as(user_id));
