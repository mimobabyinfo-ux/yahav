-- Brenda 17.9.26: the cancellation policy is approved on the registration
-- page before payment. The stamp and the wording version she approved are
-- kept on the lead, so a dispute is settled against what she actually saw.
-- (Applied through the Supabase MCP on 17.9.26; this file is the record.)
alter table registration_leads
  add column if not exists policy_accepted_at timestamptz,
  add column if not exists policy_version text;
comment on column registration_leads.policy_accepted_at is 'When she ticked "קראתי ואני מאשרת את מדיניות הביטולים" on the registration page (null for leads created before 18.9.26 or by the admin)';
comment on column registration_leads.policy_version is 'CANCELLATION_POLICY_VERSION (the "עודכן לאחרונה" date of the text) at the moment she approved it';
