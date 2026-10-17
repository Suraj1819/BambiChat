-- Stage 6 — Group admin helpers (membership already in conversation_members)

-- Optional: pin group encryption epoch metadata (public only)
CREATE TABLE IF NOT EXISTS group_encryption_state (
  conversation_id   UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  epoch             INT NOT NULL DEFAULT 1,
  protocol_version  TEXT NOT NULL DEFAULT 'bambi-e2ee-v1-group',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE group_encryption_state IS 'Group crypto epoch; actual group keys never stored on server';
