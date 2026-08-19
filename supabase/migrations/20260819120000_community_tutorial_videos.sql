-- Community tutorial videos — the "מדריכים" tab on the community page.
--
-- Yahav 19.8.26: short clips, one per area of the app, aimed at the
-- community group — "כדי לגרות אותם וכדי להקל עליהם את השימוש". They live
-- in `videos`, a table that already had a full admin manager and an upload
-- path but no screen anywhere in the app that showed its rows.
--
-- The SELECT policy on that table only lets is_pro / is_admin read, which is
-- right for the legacy pro library and wrong for a how-to clip. Rather than
-- widen it, a tutorial is marked explicitly, and only marked rows open up to
-- every signed-in mother. Anything uploaded there without the mark stays
-- exactly as restricted as it is today.

ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_tutorial boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Members can view tutorial videos" ON videos;
CREATE POLICY "Members can view tutorial videos"
  ON videos FOR SELECT
  TO authenticated
  USING (is_active = true AND is_tutorial = true);

-- The tab's only query: active tutorials in display order.
CREATE INDEX IF NOT EXISTS idx_videos_tutorial_order
  ON videos (display_order)
  WHERE is_tutorial = true AND is_active = true;
