-- ── Public form sharing ───────────────────────────────────────────────────────
ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS public_link_enabled boolean DEFAULT false;

-- Allow anonymous users to read public forms
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'forms' AND policyname = 'forms_anon_public_read'
  ) THEN
    CREATE POLICY "forms_anon_public_read" ON public.forms
      FOR SELECT TO anon
      USING (public_link_enabled = true);
  END IF;
END $$;

-- Allow anonymous submissions for public forms
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'form_submissions' AND policyname = 'form_submissions_anon_insert'
  ) THEN
    CREATE POLICY "form_submissions_anon_insert" ON public.form_submissions
      FOR INSERT TO anon
      WITH CHECK (
        EXISTS(SELECT 1 FROM public.forms WHERE id = form_id AND public_link_enabled = true)
      );
  END IF;
END $$;

-- ── Community / area ─────────────────────────────────────────────────────────
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS area text;

-- Community view — only exposes first name + area + child info, never email/private data
CREATE OR REPLACE VIEW public.community_profiles AS
  SELECT
    up.id,
    up.mother_name,
    up.area,
    c.id     AS child_id,
    c.dob    AS child_dob,
    c.gender AS child_gender
  FROM public.user_profiles up
  JOIN public.children c ON c.user_id = up.id;

GRANT SELECT ON public.community_profiles TO authenticated;
