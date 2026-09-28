-- Brenda 28.9.26: link a task to a customer ("שירלי חייבת 900 ש"ח במזומן").
-- The customer card identifies a person by normalized phone / email (not an
-- id), so the task keeps the same keys plus the name as it was picked.
alter table public.admin_tasks add column if not exists customer_name text;
alter table public.admin_tasks add column if not exists customer_phone text;
alter table public.admin_tasks add column if not exists customer_email text;
comment on column public.admin_tasks.customer_phone is 'Normalized IL phone (05XXXXXXXX) of the customer the task is about. NULL = not linked.';
create index if not exists admin_tasks_customer_phone_open on public.admin_tasks (customer_phone) where status = 'open';
