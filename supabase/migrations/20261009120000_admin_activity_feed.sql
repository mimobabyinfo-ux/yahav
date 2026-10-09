-- 9.10.26: "מה חדש" on the admin home. One read-only call that answers
-- "what happened between p_from and p_to" across every source, so the
-- home does not fire eight queries. Admins only. No writes.
create or replace function public.admin_activity_feed(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;

  select jsonb_build_object(
    -- New leads in the CRM (by the CRM's own creation time).
    'leads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.opp_id, 'at', c.crm_created_at, 'name', c.name, 'phone', c.phone_local, 'email', c.email,
        'source', nullif(c.source, ''), 'products', to_jsonb(c.products), 'stage', c.stage_name, 'pipeline', c.pipeline,
        'is_open', c.is_open
      ) order by c.crm_created_at desc)
      from crm_leads c where c.crm_created_at >= p_from and c.crm_created_at < p_to
    ), '[]'::jsonb),

    -- A person wrote (not the bot): open leads + customers who are not leads.
    'inbound', coalesce((
      select jsonb_agg(x order by x->>'at' desc) from (
        select jsonb_build_object('id', c.opp_id, 'at', c.last_inbound_at, 'name', c.name, 'phone', c.phone_local, 'email', c.email, 'text', left(c.last_inbound_text, 140), 'kind', 'lead') x
        from crm_leads c
        where c.last_inbound_at >= p_from and c.last_inbound_at < p_to and coalesce(c.last_inbound_by_bot, false) = false
        union all
        select jsonb_build_object('id', i.contact_id, 'at', i.last_message_at, 'name', i.name, 'phone', i.phone_local, 'email', null, 'text', left(i.last_message_text, 140), 'kind', 'customer')
        from crm_inbound i
        where i.last_message_at >= p_from and i.last_message_at < p_to
      ) s
    ), '[]'::jsonb),

    -- New app accounts, with where she came from. Order of evidence:
    -- a friend's code, a purchase, a public event page, a campaign link,
    -- her phone already in the CRM, her own "איך שמעת" answer. Otherwise unknown.
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'at', u.created_at,
        'name', coalesce(nullif(u.mother_name, ''), nullif(u.display_name, ''), u.email),
        'phone', u.normalized_phone, 'email', u.email,
        'onboarded', u.onboarding_completed_at is not null,
        'installed', u.pwa_installed_at is not null,
        'src_kind', case
          when u.referred_by is not null then 'friend'
          when u.acquisition_source = 'course_purchase' then 'purchase'
          when u.acquisition_source = 'public_event' then 'event'
          when u.acquisition_source is not null and u.acquisition_source <> 'app' then 'campaign'
          when crm.source is not null then 'crm'
          when heard.answer is not null then 'said'
          else 'unknown' end,
        'src_detail', case
          when u.referred_by is not null then coalesce(nullif(ref.mother_name, ''), nullif(ref.display_name, ''), ref.email)
          when u.acquisition_source = 'course_purchase' then buy.title
          when u.acquisition_source = 'public_event' then null
          when u.acquisition_source is not null and u.acquisition_source <> 'app' then u.acquisition_source
          when crm.source is not null then crm.source
          when heard.answer is not null then left(heard.answer, 80)
          else null end
      ) order by u.created_at desc)
      from user_profiles u
      left join user_profiles ref on ref.id = u.referred_by
      left join lateral (
        select w.title from registration_leads r join workshops w on w.id = r.selected_workshop_id
        where r.user_id = u.id or (u.normalized_phone is not null and r.normalized_phone = u.normalized_phone)
           or (u.email is not null and lower(r.email) = lower(u.email))
        order by r.created_at desc limit 1
      ) buy on true
      left join lateral (
        select nullif(c.source, '') as source from crm_leads c
        where u.normalized_phone is not null and c.phone_local = u.normalized_phone
        order by c.crm_created_at asc limit 1
      ) crm on true
      left join lateral (
        select nullif(trim(e.value), '') as answer
        from form_submissions f, jsonb_each_text(case when jsonb_typeof(f.responses_json) = 'object' then f.responses_json else '{}'::jsonb end) e
        where f.user_id = u.id and e.key like 'איך שמעת על מימו%'
        order by f.created_at desc limit 1
      ) heard on true
      where u.created_at >= p_from and u.created_at < p_to and coalesce(u.is_admin, false) = false
    ), '[]'::jsonb),

    -- Workshop / product registrations (the ?register form, offers, manual).
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'at', r.created_at, 'name', r.name, 'phone', r.normalized_phone, 'email', r.email,
        'status', r.status, 'product', w.title, 'product_id', r.selected_workshop_id,
        'cohort_date', k.start_date, 'cohort_time', k.start_time, 'cohort_label', k.label,
        'source', coalesce(nullif(r.utm_source, ''), nullif(r.source, ''))
      ) order by r.created_at desc)
      from registration_leads r
      left join workshops w on w.id = r.selected_workshop_id
      left join workshop_cohorts k on k.id = r.cohort_id
      where r.created_at >= p_from and r.created_at < p_to
    ), '[]'::jsonb),

    -- Community event sign-ups.
    'event_regs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'at', e.created_at, 'event_id', e.event_id, 'event', ev.title, 'event_date', ev.event_date,
        'name', coalesce(nullif(u.mother_name, ''), nullif(u.display_name, ''), u.email), 'phone', u.normalized_phone, 'email', u.email,
        'status', e.status, 'paid', e.paid, 'paid_via', e.paid_via,
        'guests', coalesce(array_length(e.guest_names, 1), 0) + coalesce(array_length(e.extra_guest_names, 1), 0)
      ) order by e.created_at desc)
      from event_registrations e
      join community_events ev on ev.id = e.event_id
      left join user_profiles u on u.id = e.user_id
      where e.created_at >= p_from and e.created_at < p_to
    ), '[]'::jsonb),

    -- "לא מסתדר לי הפעם, אשמח פעם הבאה"
    'event_interest', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'at', i.created_at, 'event_id', i.event_id, 'event', ev.title, 'event_date', ev.event_date,
        'name', coalesce(nullif(u.mother_name, ''), nullif(u.display_name, ''), u.email), 'phone', u.normalized_phone, 'email', u.email,
        'reason', i.reason
      ) order by i.created_at desc)
      from event_interest i
      join community_events ev on ev.id = i.event_id
      left join user_profiles u on u.id = i.user_id
      where i.created_at >= p_from and i.created_at < p_to
    ), '[]'::jsonb),

    -- Questionnaires filled by the mother herself (copies made by an admin are left out).
    'forms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'at', f.created_at, 'form_id', f.form_id, 'form', fm.title,
        'name', coalesce(nullif(u.mother_name, ''), nullif(u.display_name, ''),
                         nullif(trim(f.responses_json->>'שם מלא'), ''),
                         nullif(trim(concat_ws(' ', f.responses_json->>'שם פרטי של האם', f.responses_json->>'שם משפחה של האם')), ''),
                         u.email),
        'phone', coalesce(u.normalized_phone, f.responses_json->>'טלפון נייד'),
        'email', coalesce(u.email, f.responses_json->>'כתובת מייל')
      ) order by f.created_at desc)
      from form_submissions f
      left join forms fm on fm.id = f.form_id
      left join user_profiles u on u.id = f.user_id
      where f.created_at >= p_from and f.created_at < p_to and f.copied_from is null
    ), '[]'::jsonb),

    -- What Morning charged.
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'at', m.received_at, 'total', m.total, 'name', m.payer_name, 'phone', m.payer_phone, 'email', m.payer_email,
        'description', m.description, 'outcome', m.outcome
      ) order by m.received_at desc)
      from morning_webhook_log m
      where m.received_at >= p_from and m.received_at < p_to
    ), '[]'::jsonb),

    -- Gift cards: bought (created) or paid in the period. 9.10.26 (Yahav):
    -- "אם מגיע גיפט חדש אני רוצה שזה יקפוץ לי". Morning logs a gift payment
    -- as unmatched (the webhook does not match gift cards), so this list is
    -- where it shows up as a gift.
    'gifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'at', coalesce(g.paid_at, g.created_at), 'code', g.code, 'status', g.status,
        'name', g.buyer_name, 'phone', g.buyer_phone, 'email', g.buyer_email,
        'product', g.workshop_title, 'amount', g.amount, 'recipient', g.recipient_name
      ) order by coalesce(g.paid_at, g.created_at) desc)
      from gift_cards g
      where (g.created_at >= p_from and g.created_at < p_to) or (g.paid_at >= p_from and g.paid_at < p_to)
    ), '[]'::jsonb),

    -- The rare things, one list.
    'other', coalesce((
      select jsonb_agg(x order by x->>'at' desc) from (
        select jsonb_build_object('kind', 'makeup', 'at', mr.requested_at, 'name', r.name, 'phone', r.normalized_phone, 'email', r.email, 'detail', null) x
        from makeup_requests mr join registration_leads r on r.id = mr.lead_id
        where mr.requested_at >= p_from and mr.requested_at < p_to
        union all
        select jsonb_build_object('kind', 'waitlist', 'at', wl.created_at, 'name', wl.name, 'phone', wl.normalized_phone, 'email', wl.email, 'detail', w.title)
        from workshop_waitlist wl left join workshops w on w.id = wl.workshop_id
        where wl.created_at >= p_from and wl.created_at < p_to
        union all
        select jsonb_build_object('kind', 'event_waitlist', 'at', ew.created_at,
          'name', coalesce(nullif(u.mother_name, ''), nullif(u.display_name, ''), u.email), 'phone', u.normalized_phone, 'email', u.email, 'detail', ev.title)
        from event_waitlist ew join community_events ev on ev.id = ew.event_id left join user_profiles u on u.id = ew.user_id
        where ew.created_at >= p_from and ew.created_at < p_to
        union all
        select jsonb_build_object('kind', 'event_cancel', 'at', e.updated_at,
          'name', coalesce(nullif(u.mother_name, ''), nullif(u.display_name, ''), u.email), 'phone', u.normalized_phone, 'email', u.email, 'detail', ev.title)
        from event_registrations e join community_events ev on ev.id = e.event_id left join user_profiles u on u.id = e.user_id
        where e.status = 'cancelled' and e.updated_at >= p_from and e.updated_at < p_to
        union all
        select jsonb_build_object('kind', 'credit_used', 'at', cc.used_at,
          'name', coalesce(nullif(u.mother_name, ''), nullif(u.display_name, ''), u.email), 'phone', u.normalized_phone, 'email', u.email,
          'detail', concat('₪', cc.amount::int, coalesce(' · ' || ev.title, '')))
        from community_credits cc left join user_profiles u on u.id = cc.user_id left join community_events ev on ev.id = cc.used_on_event_id
        where cc.used_at >= p_from and cc.used_at < p_to
        union all
        select jsonb_build_object('kind', 'install', 'at', u.pwa_installed_at,
          'name', coalesce(nullif(u.mother_name, ''), nullif(u.display_name, ''), u.email), 'phone', u.normalized_phone, 'email', u.email, 'detail', null)
        from user_profiles u
        where u.pwa_installed_at >= p_from and u.pwa_installed_at < p_to and coalesce(u.is_admin, false) = false
      ) s
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_activity_feed(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_activity_feed(timestamptz, timestamptz) to authenticated;
