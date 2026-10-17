-- Stage 5 — Encrypted attachments (ciphertext only on server)

CREATE TABLE IF NOT EXISTS attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  uploader_user_id  UUID NOT NULL REFERENCES profiles(user_id),
  storage_key       TEXT NOT NULL UNIQUE,          -- object path / local filename
  size_bytes        BIGINT NOT NULL,
  content_type      TEXT,                         -- optional declared type (not trusted alone)
  protocol_version  TEXT NOT NULL DEFAULT 'bambi-e2ee-v1',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attachments_conversation_idx ON attachments (conversation_id);

-- Note: filename, mime, and file encryption keys travel inside the E2EE message payload, not here.
COMMENT ON TABLE attachments IS 'Encrypted media blobs; decryption keys never stored on server';
