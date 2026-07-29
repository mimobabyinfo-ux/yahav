-- mark_lead_paid(p_lead_id uuid)
-- Called by ThankYouPage after a successful payment redirect. Flips a
-- registration lead from 'pending' → 'paid' atomically. The RPC is
-- SECURITY DEFINER so the anon/unauthenticated thank-you page can reach
-- it without a table-level grant on registration_leads.
--
-- Safety properties:
--   • Only touches the one row whose id matches p_lead_id.
--   • Only advances 'pending' rows — 'paid' and 'handled' rows are
--     never touched, so a page refresh can't re-fire the transition.
--   • p_lead_id is validated as a UUID before the RPC is ever called
--     (client-side regex + ThankYouPage localStorage removal on first
--     read), so the extra WHERE status = 'pending' is the DB-side guard.

CREATE OR REPLACE FUNCTION mark_lead_paid(p_lead_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE registration_leads
     SET status = 'paid'
   WHERE id = p_lead_id
     AND status = 'pending';
$$;

GRANT EXECUTE ON FUNCTION mark_lead_paid(uuid) TO anon, authenticated;
