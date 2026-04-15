-- Family invite tokens for passwordless guest access
CREATE TABLE IF NOT EXISTS family_invite_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id    uuid        REFERENCES children(id) ON DELETE SET NULL,
  token       text        UNIQUE NOT NULL,
  created_by  uuid        REFERENCES user_profiles(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE family_invite_tokens ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can look up a token to redeem it
CREATE POLICY "invite_tokens_select" ON family_invite_tokens
  FOR SELECT USING (true);

-- Only authenticated users can create tokens
CREATE POLICY "invite_tokens_insert" ON family_invite_tokens
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

GRANT SELECT ON family_invite_tokens TO anon, authenticated;
GRANT INSERT ON family_invite_tokens TO authenticated;
GRANT DELETE ON family_invite_tokens TO authenticated;
