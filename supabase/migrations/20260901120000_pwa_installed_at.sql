-- Who put Mimo on her home screen.
--
-- Brenda 1.9.26: "אני רוצה לדעת גם מי שמה את האפליקציה במסך הבית".
-- Nothing in the app ever recorded it. The browser knows -- a PWA opened
-- from the home screen runs in display-mode: standalone (and iOS sets
-- navigator.standalone) -- but that fact lived for the length of one page
-- view and was thrown away.
--
-- Two columns rather than one: the first time we ever saw her in the
-- installed app (that is the install), and the last time (that is whether
-- she still uses it that way). A mother who installed in August and has
-- opened only Safari since is a different story from one who lives in the
-- installed app, and one boolean cannot tell them apart.
--
-- Written by the app itself with the mother's own token, under the
-- existing "Users can update own profile" policy. No history before today.

alter table user_profiles
  add column if not exists pwa_installed_at  timestamptz,
  add column if not exists pwa_last_open_at  timestamptz;

comment on column user_profiles.pwa_installed_at is
  'First time this mother was seen running the app from her home screen (display-mode: standalone). NULL = never seen installed. No data before 1.9.2026.';
comment on column user_profiles.pwa_last_open_at is
  'Most recent time she opened the app from the home screen.';

create index if not exists user_profiles_pwa_installed_idx
  on user_profiles (pwa_installed_at)
  where pwa_installed_at is not null;
