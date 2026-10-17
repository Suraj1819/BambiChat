-- Bambi Stage 3 — Devices, identity keys, encrypted messages
-- Apply after 002_friends_conversations.sql

-- Registered devices per user
CREATE TABLE IF NOT EXISTS devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  device_id       INT NOT NULL,                    -- per-user device number (1, 2, ...)
  label           TEXT,
  platform        TEXT,
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT devices_user_device_unique UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS devices_user_active_idx
  ON devices (user_id) WHERE revoked_at IS NULL;

-- Public identity key material (never private keys)
CREATE TABLE IF NOT EXISTS device_identity_keys (
  device_row_id   UUID PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  identity_key    BYTEA NOT NULL,                 -- public key (SPKI / raw)
  registration_id INT NOT NULL,
  protocol_version TEXT NOT NULL DEFAULT 'bambi-e2ee-v1',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One-time / signed prekeys for session establishment (public only)
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

-- Encrypted messages (NO plaintext body column)
CREATE TABLE IF NOT EXISTS messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id    UUID NOT NULL REFERENCES profiles(user_id),
  sender_device_id  INT,
  client_message_id TEXT NOT NULL,                 -- idempotency
  ciphertext        BYTEA NOT NULL,
  protocol_version  TEXT NOT NULL DEFAULT 'bambi-e2ee-v1',
  message_type      TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'attachment', 'system', 'key_exchange')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  server_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at         TIMESTAMPTZ,
  deleted_for_everyone_at TIMESTAMPTZ,
  CONSTRAINT messages_client_id_unique UNIQUE (conversation_id, sender_user_id, client_message_id)
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_sender_idx
  ON messages (sender_user_id);

-- Delivery / read receipts
CREATE TABLE IF NOT EXISTS message_receipts (
  message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  device_id       INT,
  status          TEXT NOT NULL CHECK (status IN ('delivered', 'read')),
  at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, status)
);

COMMENT ON TABLE devices IS 'User devices; private keys never leave the client';
COMMENT ON TABLE device_identity_keys IS 'Public identity keys only';
COMMENT ON TABLE messages IS 'Ciphertext only — no plaintext body column';
