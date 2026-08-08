-- Yahav, one day after the CRM pull shipped: "זה לא המקום שזה יופיע... בסוף
-- יש לי מערכת CRM שהיא כל עולמה של הלידים ושם אני עובד עם זה. במערכת הזאת
-- זה ניהול לקוחות, ניהול הרשמות, ניהול אירועים וספקים."
--
-- Two dashboards, one boundary: the CRM's own dashboard answers lead
-- questions (close rate, pipeline, lost reasons); the app's תובנות tab
-- answers customer / registration / event / vendor / usage questions.
-- Nothing in the app reads the lead mirror any more, so the mirror, its
-- views and its hourly job come out rather than sitting idle and hitting
-- the CRM API for nobody.
--
-- The app → CRM syncs (sync-paid-to-crm, sync-cohort-to-crm,
-- sync-community-to-crm) are untouched: pushing app events into the CRM
-- is still how the two systems stay in step.
--
-- Run alongside this migration:
--   select cron.unschedule('sync-crm-leads-hourly');
-- and the sync-crm-leads edge function was replaced with a 410 stub.

drop view if exists v_crm_lost_reasons;
drop view if exists v_crm_pipeline;
drop view if exists v_crm_lead_outcomes;
drop table if exists crm_lost_reasons;
drop table if exists crm_opportunities;
