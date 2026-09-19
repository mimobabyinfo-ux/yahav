-- Yahav 19.9.26: "שאני אוכל לדעת האם זה בקנייה או שהיא השתמשה בזיכוי.
-- היום הכל מופיע כשילמה 30 שח". event_registrations.paid_via says HOW a
-- seat was paid: card (Morning, webhook or thank-you page), credit (a
-- community credit redeemed in the app), admin (Brenda by hand or a
-- confirmed Bit/transfer claim). Backfilled from community_credits
-- (used_on_event_id) and morning_webhook_log; 4 older rows stay null.
-- redeem_credit_for_event, confirm_event_payment_for_user, mark_event_paid
-- and admin_register_for_event now write it; the admin's own paid toggles
-- write 'admin' from the client.
-- (Applied through the Supabase MCP on 19.9.26 as
-- event_registrations_paid_via; the full function bodies are in the
-- Supabase migration history under that name.)
alter table public.event_registrations
  add column if not exists paid_via text
  check (paid_via in ('card', 'credit', 'admin'));
comment on column public.event_registrations.paid_via is 'card = Morning (webhook / thank-you page), credit = community credit redeemed in the app, admin = Brenda marked it by hand. null = paid before 19.9.26 and not reconstructible';
