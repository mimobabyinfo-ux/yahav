-- יהב 27.9.26: "לנסות שוב בערב". A lead put back on the leads screen for the next calling
-- slot (17:00, or 10:00 on the next working day). Screen-only, never written to the CRM;
-- crm-leads-sync does not touch it. Applied to production via Supabase MCP on 27.9.26.
alter table public.crm_leads add column if not exists retry_at timestamptz;
