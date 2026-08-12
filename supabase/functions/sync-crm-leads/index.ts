// This function was retired on 2026-08-08 alongside the drop_crm_lead_mirror
// migration. The crm_opportunities and crm_lost_reasons tables no longer exist.
// The cron job 'sync-crm-leads-hourly' should be unscheduled in the DB:
//   select cron.unschedule('sync-crm-leads-hourly');
//
// The app → CRM syncs (sync-paid-to-crm, sync-cohort-to-crm,
// sync-community-to-crm) are still active.

Deno.serve(() => new Response(JSON.stringify({ retired: true }), {
  status: 410,
  headers: { 'Content-Type': 'application/json' },
}))
