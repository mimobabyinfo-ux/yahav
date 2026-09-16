-- Brenda 16.9.26 (second ask): "אני רוצה להוסיף לי רשימה של לינקים גם בתוך
-- המוצרים". Same library, same rule: the Morning product id belongs to the
-- link. workshops gets the same two-way sync trigger community_events got.
-- Applied in production 16.9.26.

create or replace function workshops_sync_product_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid text;
begin
  if new.payment_link is not null then
    if new.morning_product_id is null then
      select morning_product_id into v_pid
        from saved_payment_links where url = new.payment_link;
      if v_pid is not null then new.morning_product_id := v_pid; end if;
    else
      update saved_payment_links
         set morning_product_id = new.morning_product_id, updated_at = now()
       where url = new.payment_link and morning_product_id is null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists workshops_sync_product_id on workshops;
create trigger workshops_sync_product_id
  before insert or update of payment_link, morning_product_id
  on workshops
  for each row execute function workshops_sync_product_id();

-- Seed: every product link, named after the product.
insert into saved_payment_links (name, url, morning_product_id, amount)
select distinct on (w.payment_link)
       w.title || ' ₪' || w.price::int, w.payment_link, w.morning_product_id, w.price
  from workshops w
 where w.payment_link is not null
 order by w.payment_link, (w.morning_product_id is null), w.created_at desc
on conflict (url) do update
  set morning_product_id = coalesce(saved_payment_links.morning_product_id, excluded.morning_product_id);
