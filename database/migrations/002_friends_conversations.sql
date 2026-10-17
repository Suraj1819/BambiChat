-- Bambi Stage 2 — Friends, blocks, conversations
-- Apply after 001_initial_profiles.sql

-- Friend requests
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
CREATE INDEX IF NOT EXISTS friend_requests_from_idx
  ON friend_requests (from_user_id);

-- Friendships (bidirectional edge stored once with ordered pair)
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

-- Blocks
CREATE TABLE IF NOT EXISTS blocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id      UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  blocked_id      UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT blocks_no_self CHECK (blocker_id <> blocked_id),
  CONSTRAINT blocks_unique UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS blocks_blocker_idx ON blocks (blocker_id);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks (blocked_id);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL CHECK (type IN ('direct', 'group')),
  title           TEXT,                          -- null for direct
  avatar_url      TEXT,
  created_by      UUID REFERENCES profiles(user_id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_type_idx ON conversations (type);
CREATE INDEX IF NOT EXISTS conversations_updated_idx ON conversations (updated_at DESC);

-- Conversation members
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

-- For direct chats: ensure only one active direct conversation per pair
-- (enforced in application layer with a unique partial index when both members present)

DROP TRIGGER IF EXISTS friend_requests_set_updated_at ON friend_requests;
CREATE TRIGGER friend_requests_set_updated_at
  BEFORE UPDATE ON friend_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS conversations_set_updated_at ON conversations;
CREATE TRIGGER conversations_set_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE friend_requests IS 'Pending/accepted/rejected friend requests';
COMMENT ON TABLE friendships IS 'Accepted friendships; user_a_id < user_b_id';
COMMENT ON TABLE blocks IS 'User blocks; blocked user cannot message or request';
COMMENT ON TABLE conversations IS 'Direct or group conversation containers';
COMMENT ON TABLE conversation_members IS 'Membership and roles within a conversation';
