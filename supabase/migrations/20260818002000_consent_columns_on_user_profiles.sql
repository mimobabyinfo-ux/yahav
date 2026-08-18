-- Consent, recorded where the CRM and the admin can see it.
--
-- Brenda 18.8.26 asked for a consent at signup. The tick itself is
-- stamped on auth.users.raw_user_meta_data at the moment she gives it
-- (that is the evidence), but the profile is what every other part of the
-- app and the CRM read, so it needs its own copy.
--
-- marketing_opt_in is deliberately separate from the terms tick: חוק
-- התקשורת (בזק ושידורים) סעיף 30א requires its own prior, specific
-- consent for advertising messages, and bundling it into "I accept the
-- terms" would not be consent at all. Default false — silence is not
-- agreement.
alter table public.user_profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version     text,
  add column if not exists marketing_opt_in  boolean not null default false;

comment on column public.user_profiles.terms_accepted_at is
  'When she ticked the terms + privacy box at signup. Null for accounts created before 18.8.2026.';
comment on column public.user_profiles.marketing_opt_in is
  'Separate opt-in for WhatsApp/email marketing (חוק הספאם, סעיף 30א). Never assume true.';
