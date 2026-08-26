-- Daily nudge for event registrations that stalled before payment.
--
-- The edge function (remind-stalled-payments) emails a mother once, a day
-- after she picked a paid event and never finished paying, and cancels
-- pending rows whose event has already passed.
--
-- Email, not WhatsApp, on purpose: the WhatsApp window is open only for
-- 24 hours after HER last inbound message, and registering in the app is
-- not a message. An automated WhatsApp here would return 200 and deliver
-- nothing. WhatsApp stays manual, from the admin card.
--
-- 07:45 UTC is 10:45 in Israel during summer time.
select cron.schedule(
  'remind-stalled-payments-daily',
  '45 7 * * *',
  $$
  select net.http_post(
    url := 'https://pkekucngirkjqigpmlrt.supabase.co/functions/v1/remind-stalled-payments',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.anon_key', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
  $$
);
