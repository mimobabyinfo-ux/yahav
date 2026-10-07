-- 7.10.26 (applied to prod via execute_sql in pieces)
-- Workshop feedback split: עטופים keeps form c385458c ("משוב סדנת עטופים"),
-- מגלים got its own form 906f81a8 ("משוב סדנת מגלים"); עיסוי and תהליך ליווי
-- have no feedback form. trigger_rule (popup after 3 videos) removed.
-- Backup of the forms before the change: content_backup.forms_20261007_feedback_split.

alter table public.forms add column if not exists allow_anonymous boolean not null default false;
update public.forms set allow_anonymous = true
 where id in ('c385458c-a2c4-41cf-b7db-5d51ed5479b0','906f81a8-fbd0-4ed1-8ec8-7851eb84bc6b');

create or replace function public.notify_on_form_assignment()
 returns trigger language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
begin
  -- a row born completed (answered from a link before any assignment existed) must not push
  if new.completed_at is not null then return null; end if;
  perform net.http_post(
    url := 'https://pkekucngirkjqigpmlrt.supabase.co/functions/v1/notify-form-assignment',
    body := jsonb_build_object('assignment_id', new.id),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 15000
  );
  return null;
end;
$function$;

create or replace function public.submit_form_response(p_form_id uuid, p_responses jsonb, p_anonymous boolean default false)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_form record;
  v_anon boolean;
  v_stamp timestamptz;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select id, title, allow_anonymous into v_form from forms where id = p_form_id and is_active;
  if v_form.id is null then raise exception 'form not available'; end if;
  v_anon := coalesce(p_anonymous, false) and v_form.allow_anonymous;
  v_stamp := case when v_anon
                  then date_trunc('day', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem'
                  else now() end;
  insert into form_submissions (form_id, user_id, responses_json, created_at)
  values (p_form_id, case when v_anon then null else v_uid end, coalesce(p_responses, '{}'::jsonb), v_stamp);
  update form_assignments set completed_at = v_stamp
   where user_id = v_uid and form_id = p_form_id and completed_at is null;
  if not found and not exists (select 1 from form_assignments where user_id = v_uid and form_id = p_form_id) then
    insert into form_assignments (form_id, user_id, title, assigned_at, completed_at)
    values (p_form_id, v_uid, v_form.title, v_stamp, v_stamp);
  end if;
end;
$function$;
revoke all on function public.submit_form_response(uuid, jsonb, boolean) from public, anon;
grant execute on function public.submit_form_response(uuid, jsonb, boolean) to authenticated;
