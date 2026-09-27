-- Brenda 27.9.26: a date next to a manual admin task ("להזמין פופים ב-10/09").
-- Applied to production via MCP on 27.9.26.
alter table public.admin_tasks add column if not exists due_date date;
comment on column public.admin_tasks.due_date is 'Optional day the manual task is relevant for. NULL = no date.';
