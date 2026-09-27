-- 27.9.26: the Nano instance ran out of Disk IO budget and stopped answering (20:12-22:03).
-- crm-leads-sync rewrote every open lead (notes jsonb included) every 5 minutes.
-- sync_hash lets the function skip rows whose content did not change (function v8).
alter table public.crm_leads   add column if not exists sync_hash text;
alter table public.crm_inbound add column if not exists sync_hash text;

-- Every 15 minutes instead of 5 (the leads screen has a manual refresh button).
-- The job keeps its old name 'crm-leads-sync-5min' (cron.job cannot be renamed from the SQL API).
select cron.alter_job((select jobid from cron.job where jobname = 'crm-leads-sync-5min'), schedule := '*/15 * * * *');

-- cron keeps a row per run forever (11,680 rows). Keep 3 days.
delete from cron.job_run_details where end_time < now() - interval '3 days';
select cron.schedule('purge-cron-history-daily', '40 2 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '3 days' $$);
