/*
  # CRM, Analytics & Form Builder

  1. Tables
    - user_activities    – event tracking
    - forms              – form builder schema
    - form_submissions   – user responses

  2. Profile updates
    - staff_notes, lead_status, last_active on user_profiles

  3. Analytics views
    - v_retention_cohort – day-1/3/7 retention
    - v_video_performance – views + completions per video
*/

-- ── user_activities ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_activities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  session_id   text NOT NULL,
  event_type   text NOT NULL, -- page_view | button_click | video_start | video_end | coupon_copy | session_end
  event_data   jsonb,         -- { page, button_id, video_id, duration_s, ... }
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own activities"
  ON user_activities FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all activities"
  ON user_activities FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin)
  );

CREATE INDEX IF NOT EXISTS idx_activities_user_id   ON user_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_event_type ON user_activities(event_type);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON user_activities(created_at);

-- ── Update user_profiles ──────────────────────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS staff_notes  text,
  ADD COLUMN IF NOT EXISTS lead_status  text DEFAULT 'new'
    CHECK (lead_status IN ('new', 'active_coaching', 'completed')),
  ADD COLUMN IF NOT EXISTS last_active  timestamptz;

-- ── forms ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text,
  fields_json  jsonb NOT NULL DEFAULT '[]',
  trigger_rule jsonb,          -- { type: 'after_video_views', count: 3 }
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage forms"
  ON forms FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin));

CREATE POLICY "Users read active forms"
  ON forms FOR SELECT TO authenticated
  USING (is_active = true);

-- ── form_submissions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_submissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id        uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  responses_json jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can submit forms"
  ON form_submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own submissions"
  ON form_submissions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all submissions"
  ON form_submissions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin));

CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON form_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_form_id ON form_submissions(form_id);

-- ── Analytics Views ───────────────────────────────────────────────────────────

-- Retention: count users who returned on day 1, 3, 7 after signup
CREATE OR REPLACE VIEW v_retention_cohort AS
SELECT
  date_trunc('week', p.created_at)::date AS cohort_week,
  COUNT(DISTINCT p.id)                   AS total_users,
  COUNT(DISTINCT CASE
    WHEN a.created_at >= p.created_at + interval '1 day'
     AND a.created_at <  p.created_at + interval '2 days'
    THEN p.id END)                        AS day1,
  COUNT(DISTINCT CASE
    WHEN a.created_at >= p.created_at + interval '3 days'
     AND a.created_at <  p.created_at + interval '4 days'
    THEN p.id END)                        AS day3,
  COUNT(DISTINCT CASE
    WHEN a.created_at >= p.created_at + interval '7 days'
     AND a.created_at <  p.created_at + interval '8 days'
    THEN p.id END)                        AS day7
FROM user_profiles p
LEFT JOIN user_activities a ON a.user_id = p.id
GROUP BY cohort_week
ORDER BY cohort_week DESC;

-- Video performance: views and completions per video
CREATE OR REPLACE VIEW v_video_performance AS
SELECT
  v.id,
  v.title,
  v.duration_minutes,
  COUNT(DISTINCT a.user_id)  AS total_views,
  COUNT(DISTINCT CASE WHEN uvp.completed THEN uvp.user_id END) AS completions,
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN uvp.completed THEN uvp.user_id END)
    / NULLIF(COUNT(DISTINCT a.user_id), 0)
  ) AS completion_pct
FROM videos v
LEFT JOIN user_activities a
  ON a.event_type = 'video_start'
  AND (a.event_data->>'video_id') = v.id::text
LEFT JOIN user_video_progress uvp ON uvp.video_id = v.id
GROUP BY v.id, v.title, v.duration_minutes
ORDER BY total_views DESC;