-- =============================================================================
-- BAMBI — Full PostgreSQL / Supabase schema (one-shot)
-- Run in Supabase SQL Editor or: psql $DATABASE_URL -f database/supabase_full_schema.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (link to auth.users when using Supabase Auth)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE,
  username        TEXT NOT NULL,
  display_name    TEXT,
  avatar_url      TEXT,
  about           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_username_length CHECK (
    char_length(username) >= 3 AND char_length(username) <= 30
  ),
  CONSTRAINT profiles_username_format CHECK (
    username ~ '^[a-z][a-z0-9_]{2,29}$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx ON profiles (lower(username));
CREATE INDEX IF NOT EXISTS profiles_user_id_idx ON profiles (user_id);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id                   UUID PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  phone_discoverable        BOOLEAN NOT NULL DEFAULT false,
  last_seen_visibility      TEXT NOT NULL DEFAULT 'friends'
    CHECK (last_seen_visibility IN ('everyone', 'friends', 'nobody')),
  profile_photo_visibility  TEXT NOT NULL DEFAULT 'friends'
    CHECK (profile_photo_visibility IN ('everyone', 'friends', 'nobody')),
  read_receipts_enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS user_settings_set_updated_at ON user_settings;
CREATE TRIGGER user_settings_set_updated_at
  BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Social graph
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS friend_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id    UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  to_user_id      UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT friend_requests_no_self CHECK (from_user_id <> to_user_id),
  CONSTRAINT friend_requests_unique_pair UNIQUE (from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS friend_requests_to_pending_idx
  ON friend_requests (to_user_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS friendships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id       UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  user_b_id       UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT friendships_ordered CHECK (user_a_id < user_b_id),
  CONSTRAINT friendships_unique UNIQUE (user_a_id, user_b_id)
);

CREATE INDEX IF NOT EXISTS friendships_user_a_idx ON friendships (user_a_id);
CREATE INDEX IF NOT EXISTS friendships_user_b_idx ON friendships (user_b_id);

CREATE TABLE IF NOT EXISTS blocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id      UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  blocked_id      UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT blocks_no_self CHECK (blocker_id <> blocked_id),
  CONSTRAINT blocks_unique UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS blocks_blocker_idx ON blocks (blocker_id);

CREATE TABLE IF NOT EXISTS reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  reported_id     UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  reason          TEXT NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  conversation_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Devices & public keys (private keys NEVER in DB)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  device_id       INT NOT NULL,
  label           TEXT,
  platform        TEXT,
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT devices_user_device_unique UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS devices_user_active_idx
  ON devices (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS device_identity_keys (
  device_row_id   UUID PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  identity_key    BYTEA NOT NULL,
  registration_id INT NOT NULL,
  protocol_version TEXT NOT NULL DEFAULT 'bambi-e2ee-v1',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prekeys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_row_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  key_id          INT NOT NULL,
  public_key      BYTEA NOT NULL,
  signed          BOOLEAN NOT NULL DEFAULT false,
  signature       BYTEA,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prekeys_device_keyid_unique UNIQUE (device_row_id, key_id)
);

CREATE INDEX IF NOT EXISTS prekeys_available_idx
  ON prekeys (device_row_id) WHERE used_at IS NULL;

-- ---------------------------------------------------------------------------
-- Conversations & messages (ciphertext only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL CHECK (type IN ('direct', 'group')),
  title           TEXT,
  avatar_url      TEXT,
  created_by      UUID REFERENCES profiles(user_id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_updated_idx ON conversations (updated_at DESC);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'admin', 'owner')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at         TIMESTAMPTZ,
  muted_until     TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS conversation_members_user_idx
  ON conversation_members (user_id) WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id      UUID NOT NULL REFERENCES profiles(user_id),
  sender_device_id    INT,
  client_message_id   TEXT NOT NULL,
  ciphertext          BYTEA NOT NULL,
  protocol_version    TEXT NOT NULL DEFAULT 'bambi-e2ee-v1',
  message_type        TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'attachment', 'system', 'key_exchange')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  server_received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at           TIMESTAMPTZ,
  deleted_for_everyone_at TIMESTAMPTZ,
  CONSTRAINT messages_client_id_unique
    UNIQUE (conversation_id, sender_user_id, client_message_id)
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON messages (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS message_receipts (
  message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  device_id       INT,
  status          TEXT NOT NULL CHECK (status IN ('delivered', 'read')),
  at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, status)
);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  emoji           TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS conversation_user_state (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  muted_until     TIMESTAMPTZ,
  archived_at     TIMESTAMPTZ,
  pinned_at       TIMESTAMPTZ,
  last_read_at    TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  uploader_user_id  UUID NOT NULL REFERENCES profiles(user_id),
  storage_key       TEXT NOT NULL UNIQUE,
  size_bytes        BIGINT NOT NULL,
  content_type      TEXT,
  protocol_version  TEXT NOT NULL DEFAULT 'bambi-e2ee-v1',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attachments_conversation_idx ON attachments (conversation_id);

CREATE TABLE IF NOT EXISTS group_encryption_state (
  conversation_id   UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  epoch             INT NOT NULL DEFAULT 1,
  protocol_version  TEXT NOT NULL DEFAULT 'bambi-e2ee-v1-group',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id                 UUID PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  message_notifications   BOOLEAN NOT NULL DEFAULT true,
  show_preview            BOOLEAN NOT NULL DEFAULT false,
  sound_enabled           BOOLEAN NOT NULL DEFAULT true,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security (enable; backend service-role bypasses — still enforce in API)
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_user_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_identity_keys ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read limited public fields; update own
CREATE POLICY profiles_select_authenticated ON profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY profiles_insert_own ON profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY user_settings_own ON user_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Messages: only conversation members (active)
CREATE POLICY messages_member_select ON messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.left_at IS NULL
    )
  );

CREATE POLICY messages_member_insert ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.left_at IS NULL
    )
  );

CREATE POLICY conversation_members_self ON conversation_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM conversation_members cm2
      WHERE cm2.conversation_id = conversation_members.conversation_id
        AND cm2.user_id = auth.uid()
        AND cm2.left_at IS NULL
    )
  );

CREATE POLICY attachments_member_select ON attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = attachments.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.left_at IS NULL
    )
  );

CREATE POLICY notification_prefs_own ON notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY conversation_user_state_own ON conversation_user_state
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE messages IS 'Ciphertext only — no plaintext body column';
COMMENT ON TABLE device_identity_keys IS 'Public identity keys only';
COMMENT ON TABLE attachments IS 'Encrypted blobs; file keys travel inside E2EE messages';
