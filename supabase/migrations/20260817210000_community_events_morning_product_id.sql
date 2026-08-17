-- Brenda 17.8.26: she pulled Bit, Apple Pay and Google Pay from Morning so
-- every payment would come back through the thank-you page, then asked what
-- it would take to put Bit back.
--
-- The answer was already half-built: morning-paid, the Morning webhook that
-- has been catching course payments since 14.8. It never needed the browser
-- to come home. It just did not know community events existed.
--
-- To match a payment to an event it needs the same key the course flow
-- uses: Morning's productId, pasted on the event beside the payment link.
-- Two of them, because a two-seat booking uses a different link and so a
-- different product.

alter table public.community_events
  add column if not exists morning_product_id text,
  add column if not exists morning_product_id_pair text;

comment on column public.community_events.morning_product_id is
  'productId from Morning''s payment/received webhook for payment_link. Lets morning-paid confirm a payment the browser never reported.';
comment on column public.community_events.morning_product_id_pair is
  'Same, for payment_link_pair (the two-seat link).';

-- Confirm a payment on someone else's behalf: the webhook (service role)
-- and nobody else. Mirrors mark_event_paid, but takes the user explicitly
-- because a webhook has no auth.uid().
create or replace function public.confirm_event_payment_for_user(
  p_event_id uuid,
  p_user_id uuid,
  p_amount numeric default null
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  ev community_events;
  v_status text;
  v_paid boolean;
  v_seats integer;
begin
  select * into ev from community_events where id = p_event_id for update;
  if ev.id is null then return 'not_found'; end if;

  select status, paid, 1 + coalesce(array_length(guest_names, 1), 0)
    into v_status, v_paid, v_seats
    from event_registrations
   where event_id = p_event_id and user_id = p_user_id;

  if v_status is not null and v_paid and v_status in ('registered', 'attended') then
    return 'already';
  end if;

  if v_status is null then
    -- She paid a link without registering first (Brenda sent it directly).
    -- Capacity is deliberately NOT enforced: a woman who has already paid is
    -- never the one turned away. Over-capacity is Brenda's to see, not the
    -- payer's to absorb.
    insert into event_registrations (event_id, user_id, status, guest_names, paid, paid_at, paid_amount)
    values (p_event_id, p_user_id, 'registered', '{}'::text[], true, now(),
            coalesce(p_amount, ev.price));
    return 'created';
  end if;

  update event_registrations
     set status = 'registered', paid = true, paid_at = now(),
         paid_amount = coalesce(p_amount, ev.price * coalesce(v_seats, 1)),
         payment_claimed_at = null, hold_expires_at = null, updated_at = now()
   where event_id = p_event_id and user_id = p_user_id;
  return 'confirmed';
end;
$$;

revoke all on function public.confirm_event_payment_for_user(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.confirm_event_payment_for_user(uuid, uuid, numeric) to service_role;
