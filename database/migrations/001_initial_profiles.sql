-- Bambi Stage 1 — Initial profiles & settings
-- Apply via Supabase SQL editor or psql against your project database.

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Profiles (1:1 with auth.users when using Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE,           -- references auth.users(id)
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

-- Case-insensitive unique username
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx
  ON profiles (lower(username));

CREATE INDEX IF NOT EXISTS profiles_user_id_idx ON profiles (user_id);

-- User privacy / settings
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

-- Updated_at trigger helper
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS user_settings_set_updated_at ON user_settings;
CREATE TRIGGER user_settings_set_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE profiles IS 'Public-facing user profile; username is unique and searchable';
COMMENT ON TABLE user_settings IS 'Privacy and notification preferences';
