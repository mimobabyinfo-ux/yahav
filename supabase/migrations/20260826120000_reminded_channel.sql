-- Which channel the stalled-payment nudge went out on.
--
-- reminded_at alone cannot answer "did I send that, or did the system?".
-- The admin card writes 'whatsapp' when Yahav opens wa.me himself; the
-- remind-stalled-payments cron writes 'email'. The card shows it on the
-- row so a manual message and an automatic one never look alike.
alter table event_registrations
  add column if not exists reminded_channel text
  check (reminded_channel in ('whatsapp', 'email'));

comment on column event_registrations.reminded_channel is
  'whatsapp = sent by hand from the admin card; email = sent by remind-stalled-payments.';

update event_registrations
set reminded_channel = 'whatsapp'
where reminded_at is not null and reminded_channel is null;
