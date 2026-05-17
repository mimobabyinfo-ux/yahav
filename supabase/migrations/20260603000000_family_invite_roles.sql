-- Phase 4 / C1: activate the dormant family-invite system with role-aware
-- sharing. Additive only — existing token rows (none in prod yet) and
-- existing user_profiles rows stay valid. Four new columns on
-- family_invite_tokens, two on user_profiles.
--
-- Roles map 1:1 to the 5 chips in src/constants/shareRoles.ts. We use
-- a NULL-tolerant CHECK so any token rows that may have been created
-- before this migration shipped don't trip the constraint.

ALTER TABLE family_invite_tokens
  ADD COLUMN IF NOT EXISTS role text
    CHECK (role IS NULL OR role IN ('father','grandma','grandpa','aunt','nanny')),
  ADD COLUMN IF NOT EXISTS recipient_name  text,
  ADD COLUMN IF NOT EXISTS revoked_at      timestamptz,
  ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz;

-- Mom needs to be able to UPDATE her own invites (set revoked_at). The
-- existing RLS only granted INSERT/SELECT/DELETE — add UPDATE scoped to
-- the creator. Idempotent: drop-if-exists then recreate so reruns work.
DROP POLICY IF EXISTS invite_tokens_update ON family_invite_tokens;
CREATE POLICY invite_tokens_update ON family_invite_tokens
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Mirror the role + recipient_name onto the guest's user_profiles row at
-- redeem time so the journal can greet them by name without a join.
-- Both NULLable: existing non-guest profiles stay clean.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS family_role text
    CHECK (family_role IS NULL OR family_role IN ('father','grandma','grandpa','aunt','nanny')),
  ADD COLUMN IF NOT EXISTS family_display_name text;

-- Lookup index for the SharingManagementPage list — scoped to active
-- (non-revoked) invites only so revoked rows don't bloat the index.
CREATE INDEX IF NOT EXISTS idx_family_invite_tokens_active
  ON family_invite_tokens (family_id, created_at DESC)
  WHERE revoked_at IS NULL;
