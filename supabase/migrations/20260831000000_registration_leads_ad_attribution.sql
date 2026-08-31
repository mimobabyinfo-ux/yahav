-- Ad attribution columns on registration_leads (31.8.26).
--
-- The marketing site (lp.mimo-baby.co.il) appends utm_* / fbclid to
-- every link that leads to the registration page. The register page
-- snapshots them on first load and spreads them into every insert, so
-- each lead row now records which ad brought her.
--
-- crm_paid_synced_at: idempotency stamp for sync-paid-to-crm. Set per
-- lead only AFTER the GHL tag was applied successfully; NULL = not yet
-- synced. Historical paid leads were backfilled as synced at rollout.

ALTER TABLE registration_leads
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content  text,
  ADD COLUMN IF NOT EXISTS utm_term     text,
  ADD COLUMN IF NOT EXISTS fbclid       text,
  ADD COLUMN IF NOT EXISTS landing_path text,
  ADD COLUMN IF NOT EXISTS crm_paid_synced_at timestamptz;

-- Useful for the admin to see which campaigns are driving paid leads.
CREATE INDEX IF NOT EXISTS idx_registration_leads_utm_campaign
  ON registration_leads (utm_campaign)
  WHERE utm_campaign IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registration_leads_crm_synced
  ON registration_leads (crm_paid_synced_at)
  WHERE crm_paid_synced_at IS NULL AND status = 'paid';
