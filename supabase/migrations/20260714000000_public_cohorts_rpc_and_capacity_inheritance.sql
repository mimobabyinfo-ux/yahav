-- 1. Cohort capacity now INHERITS from the product's max (workshops.stock_quantity)
-- unless a cohort sets an explicit override. One-time data fix: cohorts of
-- workshops that define a max stop storing their own copy, so updating the
-- product's max instantly reflects in every cohort.
UPDATE workshop_cohorts c
SET capacity = NULL
FROM workshops w
WHERE w.id = c.workshop_id AND w.stock_quantity IS NOT NULL;

-- 2. Public read of upcoming cohorts for the registration page.
-- workshop_cohorts is admin-only under RLS, so this SECURITY DEFINER RPC
-- (same pattern as get_workshop_offer) exposes only active, future cohorts
-- with an effective capacity + current registration count. Past cohorts
-- (start_date before today, Asia/Jerusalem) are never returned.
CREATE OR REPLACE FUNCTION get_public_cohorts(p_workshop_ids uuid[])
RETURNS TABLE (
  id uuid,
  workshop_id uuid,
  start_date date,
  start_time time,
  label text,
  capacity int,
  registered_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.workshop_id,
    c.start_date,
    c.start_time,
    c.label,
    COALESCE(c.capacity, w.stock_quantity) AS capacity,
    (SELECT count(*) FROM registration_leads r WHERE r.cohort_id = c.id) AS registered_count
  FROM workshop_cohorts c
  JOIN workshops w ON w.id = c.workshop_id
  WHERE c.workshop_id = ANY(p_workshop_ids)
    AND c.is_active
    AND c.start_date >= (now() AT TIME ZONE 'Asia/Jerusalem')::date
  ORDER BY c.start_date, c.start_time NULLS FIRST;
$$;

GRANT EXECUTE ON FUNCTION get_public_cohorts(uuid[]) TO anon, authenticated;
