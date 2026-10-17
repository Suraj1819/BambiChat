-- Stage 7 — Product completion tables
-- Apply after 001–005

-- Message reactions (emoji on ciphertext messages; reaction is not secret content)
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  emoji           TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS message_reactions_message_idx ON message_reactions (message_id);

-- Per-user conversation preferences (mute / archive / pin)
CREATE TABLE IF NOT EXISTS conversation_user_state (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  muted_until     TIMESTAMPTZ,
  archived_at     TIMESTAMPTZ,
  pinned_at       TIMESTAMPTZ,
  last_read_at    TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

-- Notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id                 UUID PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  message_notifications   BOOLEAN NOT NULL DEFAULT true,
  show_preview            BOOLEAN NOT NULL DEFAULT false,
  sound_enabled           BOOLEAN NOT NULL DEFAULT true,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reports
CREATE TABLE IF NOT EXISTS reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  reported_id     UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  reason          TEXT NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_reporter_idx ON reports (reporter_id);
