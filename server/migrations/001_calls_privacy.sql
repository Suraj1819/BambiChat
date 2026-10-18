-- Optional schema additions for call history and privacy preferences.
-- Safe to run multiple times (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS call_records (
  id            TEXT PRIMARY KEY,
  caller_id     UUID NOT NULL,
  callee_id     UUID NOT NULL,
  conversation_id UUID,
  kind          TEXT NOT NULL CHECK (kind IN ('audio', 'video')),
  status        TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  duration_ms   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_call_records_caller ON call_records (caller_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_records_callee ON call_records (callee_id, started_at DESC);

CREATE TABLE IF NOT EXISTS user_privacy (
  user_id                 UUID PRIMARY KEY,
  last_seen_privacy       TEXT NOT NULL DEFAULT 'everyone'
    CHECK (last_seen_privacy IN ('everyone', 'contacts', 'nobody')),
  online_privacy          TEXT NOT NULL DEFAULT 'everyone'
    CHECK (online_privacy IN ('everyone', 'contacts', 'nobody')),
  profile_photo_privacy   TEXT NOT NULL DEFAULT 'everyone'
    CHECK (profile_photo_privacy IN ('everyone', 'contacts', 'nobody')),
  read_receipts           BOOLEAN NOT NULL DEFAULT true
);

-- Ensure profiles has avatar_url (no-op if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
  END IF;
END $$;
